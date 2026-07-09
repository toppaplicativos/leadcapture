#!/usr/bin/env node
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

const loginRes = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, brand: BRAND }),
})
const loginData = await loginRes.json().catch(() => ({}))
if (!loginRes.ok) throw new Error(loginData.error || `login ${loginRes.status}`)

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${loginData.token}`,
  'x-brand-id': String(loginData.brand_id || loginData.user?.brand_id || ''),
}

const listRes = await fetch(`${BASE}/api/instances`, { headers })
const listData = await listRes.json().catch(() => ({}))
const instances = Array.isArray(listData) ? listData : (listData.instances || [])

const smoke = instances.filter((i) => /^(Smoke Afiliado|Smoke Iso)/i.test(String(i.name || '')))
console.log(`Encontradas ${smoke.length} sessões de smoke (de ${instances.length} total)`)

let removed = 0
for (const inst of smoke) {
  const r = await fetch(`${BASE}/api/instances/${inst.id}`, { method: 'DELETE', headers })
  if (r.ok) {
    removed += 1
    console.log(`OK    removida: ${inst.name}`)
  } else {
    const d = await r.json().catch(() => ({}))
    console.log(`FAIL  ${inst.name}: ${d.error || r.status}`)
  }
}

console.log(`\nRemovidas ${removed}/${smoke.length} sessões de teste`)