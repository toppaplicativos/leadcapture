#!/usr/bin/env node
/**
 * Smoke do hub WhatsApp — login, lista instâncias, reset + pairing-code.
 * Uso: node agent-tools/smoke-pairing.mjs [baseUrl]
 * Credenciais: SMOKE_EMAIL / SMOKE_PASSWORD ou agent-tools/.env.smoke
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
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''
const TEST_PHONE = process.env.SMOKE_PAIRING_PHONE || '5511999999999'

function fail(msg) {
  console.error(`FAIL  ${msg}`)
  process.exit(1)
}
function ok(msg) {
  console.log(`OK    ${msg}`)
}

if (!EMAIL || !PASSWORD) fail('Defina SMOKE_EMAIL e SMOKE_PASSWORD')

console.log(`Smoke pairing: ${BASE}\n`)

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const loginData = await loginRes.json().catch(() => ({}))
if (!loginRes.ok) fail(`login HTTP ${loginRes.status}: ${loginData.error || 'erro'}`)
const token = loginData.token || loginData.accessToken
if (!token) fail('login sem token')
ok('login API')

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
const brandId = loginData.active_brand_id || loginData.brand_id
if (brandId) headers['x-brand-id'] = String(brandId)

const listRes = await fetch(`${BASE}/api/instances`, { headers })
const listData = await listRes.json().catch(() => ({}))
if (!listRes.ok) fail(`instances HTTP ${listRes.status}: ${listData.error || 'erro'}`)
const instances = Array.isArray(listData) ? listData : (listData.instances || [])
if (!instances.length) fail('nenhuma instância WhatsApp — crie uma em Configurações')
ok(`instances: ${instances.length} sessão(ões)`)

const pick = instances.find((i) => i.status !== 'connected' && i.status !== 'authenticated') || instances[0]
const instanceId = pick.id
ok(`instância alvo: ${pick.name} (${instanceId.slice(0, 8)}…)`)

const resetRes = await fetch(`${BASE}/api/instances/${instanceId}/reset-pairing`, {
  method: 'POST',
  headers,
})
const resetData = await resetRes.json().catch(() => ({}))
if (!resetRes.ok) fail(`reset-pairing HTTP ${resetRes.status}: ${resetData.error || 'erro'}`)
ok('reset-pairing')

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 90000)
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
  fail(`pairing-code timeout/abort: ${e.message}`)
}
clearTimeout(timer)

const pairData = await pairRes.json().catch(() => ({}))
if (!pairRes.ok) {
  fail(`pairing-code HTTP ${pairRes.status}: ${pairData.error || JSON.stringify(pairData)}`)
}
const rawCode = String(pairData.code || '').trim().toUpperCase()
if (!/^[A-Z0-9]{8}$/.test(rawCode)) fail(`código inválido: ${JSON.stringify(pairData)}`)
ok(`pairing-code gerado: ${rawCode.slice(0, 4)}-${rawCode.slice(4)} (phone=${pairData.phone || TEST_PHONE})`)

console.log('\nTudo OK (pairing)')