#!/usr/bin/env node
/**
 * Smoke pairing no app afiliado — login, criar sessão, reset + pairing-code + GET status.
 * Garante paridade com o pipeline da org (mesmo endpoint Baileys).
 *
 * Uso: node agent-tools/smoke-affiliate-pairing.mjs [baseUrl]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const smokeFile = join(__dir, '.env.smoke')
if (existsSync(smokeFile)) {
  for (const line of readFileSync(smokeFile, 'utf8').split('\n')) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_AFFILIATE_EMAIL || 'afiliado.real.teste@gmail.com'
const PASSWORD = process.env.SMOKE_AFFILIATE_PASSWORD || 'senha123'
const BRAND = process.env.SMOKE_AFFILIATE_BRAND || 'alhopronto'
const TEST_PHONE = process.env.SMOKE_PAIRING_PHONE || '5511999999999'
const KEEP = process.env.SMOKE_KEEP_INSTANCE === '1'

function fail(msg) {
  console.error(`FAIL  ${msg}`)
  process.exit(1)
}
function ok(msg) {
  console.log(`OK    ${msg}`)
}

console.log(`Smoke affiliate pairing: ${BASE} brand=${BRAND}\n`)

const loginRes = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, brand: BRAND }),
})
const loginData = await loginRes.json().catch(() => ({}))
if (!loginRes.ok) fail(`affiliate-login HTTP ${loginRes.status}: ${loginData.error || JSON.stringify(loginData)}`)
const token = loginData.token
const brandId = loginData.brand_id || loginData.user?.brand_id
if (!token) fail('login sem token')
ok(`affiliate-login (${loginData.user?.email})`)

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
if (brandId) headers['x-brand-id'] = String(brandId)

const listRes = await fetch(`${BASE}/api/instances`, { headers })
const listData = await listRes.json().catch(() => ({}))
if (!listRes.ok) fail(`instances HTTP ${listRes.status}: ${listData.error || JSON.stringify(listData)}`)
const instances = Array.isArray(listData) ? listData : (listData.instances || [])
ok(`instances: ${instances.length} sessão(ões)`)

// Afiliado não deve listar sessões admin da marca (ownership)
for (const inst of instances) {
  if (inst.owner_type && inst.owner_type !== 'affiliate') {
    fail(`afiliado listou sessão não-afiliado: ${inst.id} owner_type=${inst.owner_type}`)
  }
}
ok('ownership: lista só sessões do afiliado (ou vazia)')

const createRes = await fetch(`${BASE}/api/instances`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: `Smoke Afiliado Pairing ${Date.now()}` }),
})
const createData = await createRes.json().catch(() => ({}))
if (!createRes.ok) fail(`create HTTP ${createRes.status}: ${createData.error || JSON.stringify(createData)}`)
const instanceId = createData.id || createData.instance?.id
if (!instanceId) fail(`create sem id: ${JSON.stringify(createData)}`)
ok(`instância criada: ${instanceId.slice(0, 8)}…`)

async function cleanup() {
  if (KEEP || !instanceId) return
  await fetch(`${BASE}/api/instances/${instanceId}`, { method: 'DELETE', headers }).catch(() => {})
  ok('cleanup: sessão smoke removida')
}

try {
  const resetRes = await fetch(`${BASE}/api/instances/${instanceId}/reset-pairing`, {
    method: 'POST',
    headers,
  })
  const resetData = await resetRes.json().catch(() => ({}))
  if (!resetRes.ok) fail(`reset-pairing HTTP ${resetRes.status}: ${resetData.error || JSON.stringify(resetData)}`)
  ok('reset-pairing')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 130000)
  let pairRes
  try {
    pairRes = await fetch(`${BASE}/api/instances/${instanceId}/pairing-code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phoneNumber: TEST_PHONE }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    fail(`pairing-code timeout: ${e.message}`)
  }
  clearTimeout(timer)

  const pairData = await pairRes.json().catch(() => ({}))
  if (!pairRes.ok) {
    fail(`pairing-code HTTP ${pairRes.status}: ${pairData.error || JSON.stringify(pairData)}`)
  }
  const rawCode = String(pairData.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z0-9]{8}$/.test(rawCode)) fail(`código inválido: ${JSON.stringify(pairData)}`)
  if (!pairData.phone) fail(`pairing-code sem phone: ${JSON.stringify(pairData)}`)
  ok(`pairing-code: ${rawCode.slice(0, 4)}-${rawCode.slice(4)} phone=${pairData.phone}`)

  const getRes = await fetch(`${BASE}/api/instances/${instanceId}`, { headers })
  const getData = await getRes.json().catch(() => ({}))
  if (!getRes.ok) fail(`GET instance HTTP ${getRes.status}: ${getData.error || JSON.stringify(getData)}`)
  const pairingActive = Boolean(getData.pairing_active ?? getData.instance?.pairing_active)
  if (!pairingActive) {
    fail('após pairing-code, pairing_active deveria ser true (socket aguardando código no celular)')
  }
  ok('GET instance: pairing_active=true')

  console.log('\nTudo OK (affiliate pairing — mesmo pipeline da org)')
} finally {
  await cleanup()
}
