#!/usr/bin/env node
import fs from 'fs'

const envPath = process.argv[2] || '/root/leadcapture/.env'
const publicUrl = 'https://app.leadcapture.online'
const keys = ['APP_PUBLIC_URL', 'FRONTEND_PUBLIC_URL', 'CHECKOUT_BASE_URL']
const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : []
const seen = new Set()
const out = []

for (const line of lines) {
  const key = line.includes('=') ? line.split('=')[0].trim() : ''
  if (keys.includes(key)) {
    out.push(`${key}="${publicUrl}"`)
    seen.add(key)
    continue
  }
  out.push(line)
}

for (const key of keys) {
  if (!seen.has(key)) out.push(`${key}="${publicUrl}"`)
}

fs.writeFileSync(envPath, out.join('\n').replace(/\n*$/, '\n'))
console.log('OK', envPath)
for (const key of keys) {
  console.log(out.find((l) => l.startsWith(`${key}=`)))
}