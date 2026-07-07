#!/usr/bin/env node
/**
 * Pós-deploy: valida que o frontend não quebra (evita tela branca).
 * Uso: node agent-tools/verify-deploy.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')

async function fetchStatus(url) {
  const res = await fetch(url, { redirect: 'follow' })
  const ct = res.headers.get('content-type') || ''
  const text = ct.includes('text') ? (await res.text()).slice(0, 120) : ''
  return { status: res.status, ct, snippet: text }
}

function extractAssetUrls(html) {
  const urls = new Set()
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(m[1])
  return [...urls]
}

let failed = 0

async function check(name, ok, detail = '') {
  if (!ok) {
    failed++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    console.log(`OK    ${name}`)
  }
}

console.log(`Verificando ${BASE}\n`)

const index = await fetchStatus(`${BASE}/`)
await check('index.html', index.status === 200, `status ${index.status}`)

const assets = extractAssetUrls(index.snippet.length ? index.snippet : (await fetch(`${BASE}/`).then((r) => r.text())))
const mainJs = assets.find((u) => u.includes('index-') && u.endsWith('.js'))
if (mainJs) {
  const main = await fetchStatus(`${BASE}${mainJs}`)
  await check('main bundle JS', main.status === 200 && main.ct.includes('javascript'), main.ct)
}

const sampleChunks = assets.filter((u) => u.endsWith('.js')).slice(0, 8)
for (const path of sampleChunks) {
  const r = await fetchStatus(`${BASE}${path}`)
  await check(`chunk ${path.split('/').pop()}`, r.status === 200 && r.ct.includes('javascript'), r.ct)
}

const missing = await fetchStatus(`${BASE}/assets/__verify_missing_chunk__.js`)
await check('missing chunk → 404 (not HTML)', missing.status === 404, `status ${missing.status} ct=${missing.ct}`)

const agent = await fetchStatus(`${BASE}/api/admin-agent/squads`)
await check('admin-agent route', agent.status === 401 || agent.status === 200, `status ${agent.status}`)

const adminRes = await fetch(`${BASE}/admin`, { redirect: 'follow' })
const adminHtml = await adminRes.text()
const adminOk =
  adminRes.status === 200 &&
  (adminHtml.includes('id="root"') || adminHtml.includes("id='root'")) &&
  /\/assets\/index-[^"]+\.js/.test(adminHtml)
await check('/admin SPA', adminOk, `status ${adminRes.status}`)

console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)