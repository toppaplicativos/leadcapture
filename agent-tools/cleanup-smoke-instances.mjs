#!/usr/bin/env node
/**
 * Remove instâncias de smoke (Smoke Afiliado, Smoke Iso, etc.)
 * Uso: node agent-tools/cleanup-smoke-instances.mjs [baseUrl]
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
const EMAIL = process.env.SMOKE_EMAIL
const PASSWORD = process.env.SMOKE_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('defina SMOKE_EMAIL e SMOKE_PASSWORD')
  process.exit(1)
}

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
const loginData = await loginRes.json().catch(() => ({}))
if (!loginRes.ok) {
  console.error('login falhou', loginData.error)
  process.exit(1)
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${loginData.token}`,
}

const listRes = await fetch(`${BASE}/api/instances`, { headers })
const listData = await listRes.json().catch(() => ({}))
const instances = Array.isArray(listData) ? listData : (listData.instances || [])
const smoke = instances.filter((i) => /^(Smoke |Smoke Afiliado|Smoke Iso)/i.test(String(i.name || '')))

let removed = 0
for (const inst of smoke) {
  const r = await fetch(`${BASE}/api/instances/${inst.id}`, { method: 'DELETE', headers })
  if (r.ok) {
    removed++
    console.log(`removido: ${inst.name} (${inst.id.slice(0, 8)}…)`)
  }
}
console.log(`\n${removed}/${smoke.length} sessões smoke removidas`)