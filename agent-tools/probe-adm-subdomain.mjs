#!/usr/bin/env node
const base = (process.argv[2] || 'https://adm.leadcapture.online').replace(/\/$/, '')

const paths = ['/', '/login', '/admin', '/admin/planos', '/api/health']

let failed = 0
for (const p of paths) {
  const url = `${base}${p}`
  try {
    const r = await fetch(url, { redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    console.log(`${r.status} ${p}${loc ? ` → ${loc}` : ''}`)
    if (r.status >= 500) failed++
  } catch (err) {
    console.log(`ERR ${p} ${err.message}`)
    failed++
  }
}

if (failed) process.exit(1)
console.log('OK adm subdomain probe')