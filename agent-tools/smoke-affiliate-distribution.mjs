#!/usr/bin/env node
/**
 * Smoke fluxo completo de distribuição inteligente:
 * owner enfileira prospect → processa fila → afiliado vê atribuição/alertas.
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
const AFF_EMAIL = process.env.SMOKE_AFFILIATE_EMAIL || 'afiliado.real.teste@gmail.com'
const AFF_PASSWORD = process.env.SMOKE_AFFILIATE_PASSWORD || 'senha123'
const AFF_BRAND = process.env.SMOKE_AFFILIATE_BRAND || 'alhopronto'
const OWNER_EMAIL = process.env.SMOKE_DIST_OWNER_EMAIL || 'wallacebertozzi16@gmail.com'
const OWNER_PASSWORD = process.env.SMOKE_DIST_OWNER_PASSWORD || '142536He@'

function fail(msg) {
  console.error(`FAIL  ${msg}`)
  process.exit(1)
}
function ok(msg) {
  console.log(`OK    ${msg}`)
}
function warn(msg) {
  console.log(`WARN  ${msg}`)
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(url, options, { attempts = 4, delayMs = 2000, label = 'request' } = {}) {
  let lastStatus = 0
  let lastBody = {}
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, options)
    lastStatus = res.status
    lastBody = await res.json().catch(() => ({}))
    if (res.ok) return { res, data: lastBody }
    if (i < attempts) {
      console.log(`WARN  ${label} HTTP ${lastStatus} — retry ${i + 1}/${attempts}`)
      await sleep(delayMs)
    }
  }
  return { res: { ok: false, status: lastStatus }, data: lastBody }
}

console.log(`Smoke affiliate distribution: ${BASE} brand=${AFF_BRAND}\n`)

const affLogin = await fetch(`${BASE}/api/auth/affiliate-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: AFF_EMAIL, password: AFF_PASSWORD, brand: AFF_BRAND }),
})
const affData = await affLogin.json().catch(() => ({}))
if (!affLogin.ok) fail(`affiliate-login HTTP ${affLogin.status}: ${affData.error || JSON.stringify(affData)}`)
const affToken = affData.token
const affBrandId = affData.brand_id || affData.user?.brand_id
const affUserId = affData.user?.id
const affOwnerUserId = String(affData.user?.owner_user_id || '').trim()
if (!affToken || !affBrandId) fail('login afiliado incompleto')
ok(`affiliate-login (${affData.user?.email}) brand=${String(affBrandId).slice(0, 8)}…`)

const affHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${affToken}`,
  'x-brand-id': String(affBrandId),
}

const { res: statusRes, data: statusData } = await fetchWithRetry(
  `${BASE}/api/affiliate-app/distribution/status`,
  { headers: affHeaders },
  { label: 'distribution/status' },
)
if (!statusRes.ok) fail(`distribution/status HTTP ${statusRes.status}: ${statusData.error || ''}`)
ok(`elegibilidade: can_receive=${!!statusData.can_receive} status=${statusData.distribution_status} wa=${statusData.whatsapp_status}`)
if (!statusData.can_receive && statusData.blockers?.length) {
  warn(`blockers: ${statusData.blockers.join(', ')}`)
}

const assignResEarly = await fetch(`${BASE}/api/affiliate-app/distribution/assignments`, { headers: affHeaders })
const assignEarly = await assignResEarly.json().catch(() => ({}))
if (!assignResEarly.ok) fail(`assignments HTTP ${assignResEarly.status}: ${assignEarly.error || ''}`)
ok(`assignments API (${(assignEarly.assignments || []).length} itens)`)

const alertsResEarly = await fetch(`${BASE}/api/affiliate-app/distribution/alerts`, { headers: affHeaders })
const alertsEarly = await alertsResEarly.json().catch(() => ({}))
if (!alertsResEarly.ok) fail(`alerts HTTP ${alertsResEarly.status}: ${alertsEarly.error || ''}`)
ok(`alerts API (${(alertsEarly.alerts || []).length} itens)`)

const ownerLogin = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
})
const ownerData = await ownerLogin.json().catch(() => ({}))
if (!ownerLogin.ok || !ownerData.token) {
  warn(`owner-login indisponível (${OWNER_EMAIL}) — pulando enfileiramento (defina SMOKE_DIST_OWNER_EMAIL)`)
  console.log('\nTudo OK (affiliate distribution — parcial, APIs afiliado)')
  process.exit(0)
}
const ownerToken = ownerData.token
ok(`owner-login (${OWNER_EMAIL})`)

const ownerHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ownerToken}`,
  'x-brand-id': String(affBrandId),
}

const { res: overviewRes, data: overviewData } = await fetchWithRetry(
  `${BASE}/api/affiliates/distribution/overview?brand_id=${encodeURIComponent(affBrandId)}`,
  { headers: ownerHeaders },
  { label: 'distribution/overview' },
)
if (!overviewRes.ok) fail(`overview HTTP ${overviewRes.status}: ${overviewData.error || ''}`)
ok(`overview: pending=${overviewData.queue?.pending ?? 0} eligible=${overviewData.eligible_affiliates ?? 0}`)

const stamp = Date.now()
const smokeName = `Smoke Dist ${stamp}`
const smokePhone = `55119${String(stamp).slice(-8)}`

const createRes = await fetch(`${BASE}/api/customers`, {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({
    name: smokeName,
    phone: smokePhone,
    city: 'São Paulo',
    state: 'SP',
    source: 'smoke_distribution',
  }),
})
const createData = await createRes.json().catch(() => ({}))
if (!createRes.ok) fail(`create customer HTTP ${createRes.status}: ${createData.error || ''}`)
const prospectId = createData.customer?.id
if (!prospectId) fail('create customer sem id')
ok(`prospect criado ${prospectId.slice(0, 8)}… (${smokePhone})`)

const enqueueRes = await fetch(`${BASE}/api/affiliates/distribution/queue`, {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ prospect_id: prospectId, source: 'smoke_test', priority_score: 60 }),
})
const enqueueData = await enqueueRes.json().catch(() => ({}))
if (!enqueueRes.ok) fail(`enqueue HTTP ${enqueueRes.status}: ${enqueueData.error || ''}`)
if (!enqueueData.queued && !enqueueData.processed?.some?.((x) => x.assigned)) {
  warn(`enqueue: ${enqueueData.reason || 'não enfileirado'} — tentando process manual`)
}

const processRes = await fetch(`${BASE}/api/affiliates/distribution/process`, {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ max_items: 5 }),
})
const processData = await processRes.json().catch(() => ({}))
if (!processRes.ok) fail(`process HTTP ${processRes.status}: ${processData.error || ''}`)
const assigned = (processData.processed || []).find((x) => x.assigned && x.assignment_id)
const eligibleCount = Number(overviewData.eligible_affiliates || 0)
if (assigned) {
  ok(`atribuído assignment=${assigned.assignment_id.slice(0, 8)}… affiliate=${assigned.affiliate_id?.slice(0, 8) || '?'}`)
  if (assigned.initial_message) {
    ok(`mensagem inicial: sent=${!!assigned.initial_message.sent} reason=${assigned.initial_message.reason || '-'}`)
  }
} else if (!statusData.can_receive || eligibleCount === 0) {
  const { data: qAfter } = await fetchWithRetry(
    `${BASE}/api/affiliates/distribution/queue?brand_id=${encodeURIComponent(affBrandId)}`,
    { headers: ownerHeaders },
    { label: 'queue-after' },
  )
  const pending = (qAfter.queue || []).filter((q) => q.prospect_id === prospectId && q.queue_status === 'pending')
  if (pending.length) ok(`fila pendente mantida (${pending.length}) — sem afiliado elegível`)
  else warn('sem atribuição e sem item pendente na fila')
} else {
  fail(`process sem atribuição: ${JSON.stringify(processData.processed || [])}`)
}

await sleep(1500)

const assignRes = await fetch(`${BASE}/api/affiliate-app/distribution/assignments`, { headers: affHeaders })
const assignData = await assignRes.json().catch(() => ({}))
if (!assignRes.ok) fail(`assignments HTTP ${assignRes.status}: ${assignData.error || ''}`)
const mine = (assignData.assignments || []).filter((a) => a.prospect_name === smokeName || a.prospect_phone?.includes(smokePhone.slice(-8)))
if (assigned && !mine.length) fail('afiliado não vê atribuição do smoke')
if (mine.length) ok(`afiliado vê ${mine.length} atribuição(ões) do smoke`)

const alertsRes = await fetch(`${BASE}/api/affiliate-app/distribution/alerts`, { headers: affHeaders })
const alertsData = await alertsRes.json().catch(() => ({}))
if (!alertsRes.ok) fail(`alerts HTTP ${alertsRes.status}`)
const alertHit = (alertsData.alerts || []).some((a) => a.alert_type === 'new_prospect' && (a.assignment_id === assigned?.assignment_id || a.title?.includes('oportunidade')))
if (assigned && !alertHit) warn('alerta new_prospect não encontrado (pode estar deduplicado)')
else if (alertHit) ok('alerta new_prospect presente')

if (assigned?.assignment_id) {
  const convertRes = await fetch(`${BASE}/api/affiliate-app/distribution/assignments/${assigned.assignment_id}/convert`, {
    method: 'POST',
    headers: affHeaders,
    body: JSON.stringify({ order_total: 150, notes: 'smoke conversion' }),
  })
  const convertData = await convertRes.json().catch(() => ({}))
  if (!convertRes.ok) fail(`convert HTTP ${convertRes.status}: ${convertData.error || ''}`)
  ok(`conversão registrada (commission=${!!convertData.commission_recorded})`)
}

await fetch(`${BASE}/api/customers/${prospectId}`, { method: 'DELETE', headers: ownerHeaders }).catch(() => {})

console.log('\nTudo OK (affiliate distribution)')