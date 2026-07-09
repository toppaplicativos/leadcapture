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

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
})
const data = await login.json()

const affLogin = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.SMOKE_AFFILIATE_EMAIL || 'afiliado.real.teste@gmail.com',
    password: process.env.SMOKE_AFFILIATE_PASSWORD || 'senha123',
    brand: process.env.SMOKE_AFFILIATE_BRAND || 'alhopronto',
  }),
})
const affData = await affLogin.json()
const affBrand = affData.brand_id || affData.user?.brand_id || process.argv[3] || ''
const headers = {
  Authorization: `Bearer ${data.token}`,
  'Content-Type': 'application/json',
  'x-brand-id': affBrand,
}
console.log('x-brand-id:', affBrand)

for (const url of [
  `${BASE}/api/instances`,
  `${BASE}/api/instances?scope=brand`,
  `${BASE}/api/instances?owner_type=affiliate`,
]) {
  const res = await fetch(url, { headers })
  const text = await res.text()
  console.log('\n---', url.replace(BASE, ''), res.status, '---')
  console.log(text.slice(0, 1200))
}