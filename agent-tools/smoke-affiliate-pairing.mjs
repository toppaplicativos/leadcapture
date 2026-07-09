#!/usr/bin/env node
/**
 * Smoke pairing no app afiliado — login, instâncias, reset + pairing-code.
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

const createRes = await fetch(`${BASE}/api/instances`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: `Smoke Afiliado ${Date.now()}` }),
})
const createData = await createRes.json().catch(() => ({}))
if (!createRes.ok) fail(`create HTTP ${createRes.status}: ${createData.error || JSON.stringify(createData)}`)
const instanceId = createData.id || createData.instance?.id
if (!instanceId) fail(`create sem id: ${JSON.stringify(createData)}`)
ok(`instância criada: ${instanceId.slice(0, 8)}…`)

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
const rawCode = String(pairData.code || '').trim().toUpperCase()
if (!/^[A-Z0-9]{8}$/.test(rawCode)) fail(`código inválido: ${JSON.stringify(pairData)}`)
ok(`pairing-code: ${rawCode.slice(0, 4)}-${rawCode.slice(4)} phone=${pairData.phone || TEST_PHONE}`)

console.log('\nTudo OK (affiliate pairing)')