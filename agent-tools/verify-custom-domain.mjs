#!/usr/bin/env node
/**
 * Verifica domínio customizado após DNS configurado.
 * Uso: SMOKE_EMAIL=... SMOKE_PASSWORD=... node agent-tools/verify-custom-domain.mjs [domain]
 */
const BASE = (process.argv[3] || process.env.BASE_URL || 'https://app.leadcapture.online').replace(/\/$/, '')
const DOMAIN = (process.argv[2] || 'alhopronto.online').trim().toLowerCase()
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''

if (!EMAIL || !PASSWORD) {
  console.error('Defina SMOKE_EMAIL e SMOKE_PASSWORD')
  process.exit(1)
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Login falhou (${r.status})`)
  return d.token
}

async function pickBrand(headers, preferredSlug = 'alhopronto') {
  const r = await fetch(`${BASE}/api/brands`, { headers })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Falha ao listar brands')
  const brands = d.brands || []
  const hit = brands.find((b) => String(b.slug || '').toLowerCase() === preferredSlug)
    || brands.find((b) => String(b.domain || '').toLowerCase().includes(preferredSlug))
    || brands[0]
  if (!hit?.id) throw new Error('Nenhuma brand encontrada')
  await fetch(`${BASE}/api/brands/${hit.id}/activate`, { method: 'POST', headers })
  headers['x-brand-id'] = String(hit.id)
  console.log(`OK    brand ativa: ${hit.name} (${hit.slug || hit.id})`)
  return hit
}

async function main() {
  console.log(`Verificando domínio: ${DOMAIN}\n`)
  const token = await login()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const brandSlug = process.env.BRAND_SLUG || 'alhopronto'
  await pickBrand(headers, brandSlug)

  const storesRes = await fetch(`${BASE}/api/storefront/stores`, { headers })
  const storesData = await storesRes.json().catch(() => ({}))
  if (!storesRes.ok) throw new Error(storesData.error || 'Falha ao listar lojas')
  const stores = storesData.stores || []
  if (!stores.length) throw new Error('Nenhuma loja encontrada')

  let store = null
  let row = null
  for (const s of stores) {
    const domainsRes = await fetch(`${BASE}/api/storefront/stores/${s.id}/domains`, { headers })
    const domainsData = await domainsRes.json().catch(() => ({}))
    const domains = domainsData.domains || []
    const hit = domains.find((d) => String(d.domain || '').toLowerCase() === DOMAIN)
    if (hit) {
      store = s
      row = hit
      break
    }
  }

  if (!store) {
    store = stores[0]
    console.log(`Domínio não listado — tentando adicionar em ${store.name || store.id}…`)
    const addRes = await fetch(`${BASE}/api/storefront/stores/${store.id}/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ domain: DOMAIN }),
    })
    const addData = await addRes.json().catch(() => ({}))
    if (!addRes.ok) throw new Error(addData.error || `Falha ao adicionar domínio (${addRes.status})`)
    row = addData.domain || { domain: DOMAIN }
    console.log('OK    domínio adicionado')
  } else {
    console.log(`OK    domínio já cadastrado (${row.verification_status || 'pending'})`)
  }

  const verifyRes = await fetch(`${BASE}/api/storefront/stores/${store.id}/domains/${encodeURIComponent(DOMAIN)}/verify`, {
    method: 'POST',
    headers,
  })
  const verifyData = await verifyRes.json().catch(() => ({}))
  if (!verifyRes.ok) throw new Error(verifyData.error || `Verify falhou (${verifyRes.status})`)

  const checks = verifyData.checks || {}
  console.log(`TXT verificado: ${checks.txt_verified ? 'sim' : 'não'}`)
  console.log(`A aponta servidor: ${checks.a_points_to_server ? 'sim' : 'não'} (${(checks.a_records || []).join(', ') || '—'})`)
  console.log(`Status: ${verifyData.verification_status || (verifyData.verified ? 'verified' : 'failed')}`)
  console.log(`Provisionado nginx: ${verifyData.provisioned ? 'sim' : 'não'}`)

  if (!verifyData.verified) {
    console.error('\nFalha na verificação — confira o TXT no DNS')
    process.exit(1)
  }

  const live = await fetch(`https://${DOMAIN}/`, { redirect: 'follow' })
  console.log(`\nOK    https://${DOMAIN}/ → HTTP ${live.status}`)
  console.log('Domínio verificado e ativo')
}

main().catch((err) => {
  console.error('ERRO ', err.message)
  process.exit(1)
})