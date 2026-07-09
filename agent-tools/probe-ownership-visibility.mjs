#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const smokeFile = join(__dir, '.env.smoke')
if (existsSync(smokeFile)) {
  for (const line of readFileSync(smokeFile, 'utf8').split('\n')) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

const BASE = 'https://app.leadcapture.online'
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString())

const aff = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.SMOKE_AFFILIATE_EMAIL || 'afiliado.real.teste@gmail.com',
    password: process.env.SMOKE_AFFILIATE_PASSWORD || 'senha123',
    brand: process.env.SMOKE_AFFILIATE_BRAND || 'alhopronto',
  }),
}).then((r) => r.json())

const admin = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
}).then((r) => r.json())

const affJwt = decode(aff.token)
const adminJwt = decode(admin.token)
console.log('affiliate actor:', affJwt.userId, 'owner:', affJwt.owner_user_id, 'brand:', aff.brand_id)
console.log('admin user:', adminJwt.userId)

const adminHeaders = { Authorization: `Bearer ${admin.token}` }
const all = await fetch(`${BASE}/api/instances`, { headers: adminHeaders }).then((r) => r.json())
const brand = await fetch(`${BASE}/api/instances?scope=brand`, {
  headers: { ...adminHeaders, 'x-brand-id': String(aff.brand_id) },
}).then((r) => r.json())

console.log('\nadmin all:', all.error || `${(all.instances||[]).length} instances`)
console.log('admin scope=brand+affBrand:', brand.error || `${(brand.instances||[]).length} instances`)
const affOwned = (brand.instances || []).filter((i) => i.owner_type === 'affiliate')
console.log('affiliate-owned in brand scope:', affOwned.length, affOwned.map((i) => i.name).slice(0, 5))