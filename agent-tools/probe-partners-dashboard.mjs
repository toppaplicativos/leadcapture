#!/usr/bin/env node
/**
 * Smoke: partners-app dashboard + memberships
 * Uso: node agent-tools/probe-partners-dashboard.mjs [baseUrl] [email] [password]
 */
const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.argv[3] || process.env.PARTNERS_EMAIL || process.env.SMOKE_EMAIL || ''
const PASSWORD = process.argv[4] || process.env.PARTNERS_PASSWORD || process.env.SMOKE_PASSWORD || ''

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('ABORT: informe email e senha (ou PARTNERS_EMAIL / PARTNERS_PASSWORD)')
    process.exit(1)
  }

  const loginRes = await fetch(`${BASE}/api/auth/partners-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const loginData = await loginRes.json().catch(() => ({}))
  if (!loginRes.ok || !loginData.token) {
    console.error(`FAIL login HTTP ${loginRes.status}:`, loginData.error || loginData)
    process.exit(1)
  }
  console.log(`OK    partners-login (${EMAIL})`)

  const headers = {
    Authorization: `Bearer ${loginData.token}`,
    'Content-Type': 'application/json',
  }

  for (const path of ['/api/partners-app/dashboard', '/api/partners-app/memberships', '/api/partners-app/me']) {
    const r = await fetch(`${BASE}${path}`, { headers })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error(`FAIL  ${path} HTTP ${r.status}: ${d.error || JSON.stringify(d)}`)
      process.exit(1)
    }
    console.log(`OK    ${path} HTTP ${r.status}`)
  }

  console.log('Tudo OK (partners dashboard)')
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})