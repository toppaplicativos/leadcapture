#!/usr/bin/env node
/**
 * Smoke isolamento WhatsApp — afiliado só vê contas próprias; dono da marca vê todas da marca.
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
const AFF_EMAIL = process.env.SMOKE_AFFILIATE_EMAIL || 'afiliado.real.teste@gmail.com'
const AFF_PASSWORD = process.env.SMOKE_AFFILIATE_PASSWORD || 'senha123'
const AFF_BRAND = process.env.SMOKE_AFFILIATE_BRAND || 'alhopronto'
const ADMIN_EMAIL = process.env.SMOKE_BRAND_OWNER_EMAIL || process.env.SMOKE_EMAIL
const ADMIN_PASSWORD = process.env.SMOKE_BRAND_OWNER_PASSWORD || process.env.SMOKE_PASSWORD

function fail(msg) {
  console.error(`FAIL  ${msg}`)
  process.exit(1)
}
function ok(msg) {
  console.log(`OK    ${msg}`)
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Requisição com retry — evita falso negativo pós-restart do PM2. */
async function fetchWithRetry(url, options, { attempts = 4, delayMs = 2000, label = 'request' } = {}) {
  let lastStatus = 0
  let lastBody = {}
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, options)
    lastStatus = res.status
    lastBody = await res.json().catch(() => ({}))
    if (res.ok) return { res, data: lastBody }
    if (i < attempts) {
      console.log(`WARN  ${label} HTTP ${lastStatus} — retry ${i + 1}/${attempts} em ${delayMs}ms`)
      await sleep(delayMs)
    }
  }
  return { res: { ok: false, status: lastStatus }, data: lastBody }
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return {}
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

console.log(`Smoke affiliate ownership: ${BASE} brand=${AFF_BRAND}\n`)

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  fail('defina SMOKE_EMAIL/SMOKE_PASSWORD ou SMOKE_BRAND_OWNER_EMAIL/SMOKE_BRAND_OWNER_PASSWORD')
}

const affLogin = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: AFF_EMAIL, password: AFF_PASSWORD, brand: AFF_BRAND }),
})
const affData = await affLogin.json().catch(() => ({}))
if (!affLogin.ok) fail(`affiliate-login HTTP ${affLogin.status}: ${affData.error || JSON.stringify(affData)}`)
const affToken = affData.token
const affBrandId = affData.brand_id || affData.user?.brand_id
const affJwt = decodeJwtPayload(affToken)
const affUserId = affData.user?.id || affJwt.userId || affJwt.sub
const affOwnerUserId = String(affData.user?.owner_user_id || affJwt.owner_user_id || '').trim()
if (!affToken || !affUserId) fail('login afiliado sem token/user id')
ok(`affiliate-login (${affData.user?.email}) owner=${affOwnerUserId.slice(0, 8)}…`)

const affHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${affToken}`,
  ...(affBrandId ? { 'x-brand-id': String(affBrandId) } : {}),
}

// Limpa resíduos de runs anteriores antes de criar nova sessão
const preList = await fetchWithRetry(`${BASE}/api/instances`, { headers: affHeaders }, { label: 'affiliate pre-cleanup list' })
const preInstances = Array.isArray(preList.data) ? preList.data : (preList.data.instances || [])
for (const inst of preInstances.filter((i) => /^Smoke Iso /i.test(String(i.name || '')))) {
  await fetch(`${BASE}/api/instances/${inst.id}`, { method: 'DELETE', headers: affHeaders }).catch(() => {})
}

const stamp = Date.now()
const smokeName = `Smoke Iso ${stamp}`

const { res: createRes, data: createData } = await fetchWithRetry(
  `${BASE}/api/instances`,
  { method: 'POST', headers: affHeaders, body: JSON.stringify({ name: smokeName }) },
  { label: 'affiliate create' },
)
if (!createRes.ok) fail(`create HTTP ${createRes.status}: ${createData.error || JSON.stringify(createData)}`)
const createdId = createData.id || createData.instance?.id
if (!createdId) fail(`create sem id: ${JSON.stringify(createData)}`)
ok(`afiliado criou instância ${createdId.slice(0, 8)}…`)

const { res: listAffRes, data: listAffData } = await fetchWithRetry(
  `${BASE}/api/instances`,
  { headers: affHeaders },
  { label: 'affiliate list' },
)
if (!listAffRes.ok) fail(`affiliate list HTTP ${listAffRes.status}`)
const affInstances = Array.isArray(listAffData) ? listAffData : (listAffData.instances || [])

const mine = affInstances.filter((i) => String(i.owner_actor_id || '') === String(affUserId))
if (!affInstances.some((i) => i.id === createdId)) fail('instância criada não aparece na lista do afiliado')
if (mine.length !== affInstances.length) {
  fail(`afiliado vê ${affInstances.length - mine.length} sessão(ões) de outro dono`)
}
if (affInstances.some((i) => i.owner_type && i.owner_type !== 'affiliate')) {
  fail('afiliado vê sessão com owner_type≠affiliate')
}
ok(`afiliado lista só próprias (${affInstances.length} sessão(ões))`)

const adminLogin = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
})
const adminData = await adminLogin.json().catch(() => ({}))
if (!adminLogin.ok) fail(`admin-login HTTP ${adminLogin.status}`)
const adminToken = adminData.token
if (!adminToken) fail('admin sem token')
const adminUserId = String(decodeJwtPayload(adminToken).userId || decodeJwtPayload(adminToken).sub || '').trim()
ok(`admin-login (${ADMIN_EMAIL})`)

const adminHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminToken}`,
}

const { res: listAdminRes, data: listAdminData } = await fetchWithRetry(
  `${BASE}/api/instances`,
  { headers: adminHeaders },
  { label: 'admin list' },
)
if (!listAdminRes.ok) fail(`admin list HTTP ${listAdminRes.status}: ${listAdminData.error || ''}`)
ok('admin list HTTP 200 (sem x-brand-id estranho)')

const adminInstances = Array.isArray(listAdminData) ? listAdminData : (listAdminData.instances || [])

if (adminUserId && affOwnerUserId && adminUserId === affOwnerUserId) {
  const brandHeaders = {
    ...adminHeaders,
    ...(affBrandId ? { 'x-brand-id': String(affBrandId) } : {}),
  }
  const { res: listBrandRes, data: listBrandData } = await fetchWithRetry(
    `${BASE}/api/instances?scope=brand`,
    { headers: brandHeaders },
    { label: 'brand-owner list' },
  )
  if (!listBrandRes.ok) fail(`brand-owner list HTTP ${listBrandRes.status}: ${listBrandData.error || ''}`)
  const brandInstances = Array.isArray(listBrandData) ? listBrandData : (listBrandData.instances || [])
  if (!brandInstances.some((i) => i.id === createdId)) {
    fail('dono da marca não vê instância criada pelo afiliado')
  }
  ok(`dono da marca vê instância do afiliado (marca: ${brandInstances.length} sessões)`)
} else {
  if (adminInstances.some((i) => i.id === createdId)) {
    fail('admin de outro tenant vê instância do afiliado (vazamento)')
  }
  ok('isolamento entre tenants: admin não vê sessão de outra marca')

  const { res: leakRes, data: leakData } = await fetchWithRetry(
    `${BASE}/api/instances`,
    { headers: { ...adminHeaders, ...(affBrandId ? { 'x-brand-id': String(affBrandId) } : {}) } },
    { label: 'admin+x-brand-id alheio' },
  )
  if (!leakRes.ok) fail(`admin com x-brand-id alheio HTTP ${leakRes.status}: ${leakData.error || ''}`)
  const leaked = Array.isArray(leakData) ? leakData : (leakData.instances || [])
  if (leaked.some((i) => i.id === createdId)) fail('x-brand-id alheio expôs instância do afiliado')
  ok('x-brand-id de outra marca não causa 500 nem vazamento')
}

await fetch(`${BASE}/api/instances/${createdId}`, { method: 'DELETE', headers: affHeaders }).catch(() => {})
ok('cleanup instância smoke')

console.log('\nTudo OK (affiliate ownership)')