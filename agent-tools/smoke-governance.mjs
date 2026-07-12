#!/usr/bin/env node
/**
 * Smoke — Platform Governance (enforcement + master ops).
 *
 * Env:
 *   BASE_URL          default https://app.leadcapture.online
 *   SMOKE_EMAIL       user admin (tenant)
 *   SMOKE_PASSWORD
 *   MASTER_EMAIL      optional super-admin (falls back to SMOKE_*)
 *   MASTER_PASSWORD
 *
 * Usage:
 *   node agent-tools/smoke-governance.mjs
 *   node agent-tools/smoke-governance.mjs https://app.leadcapture.online
 */

import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const smokeEnvPath = join(__dirname, ".env.smoke")
if (existsSync(smokeEnvPath)) {
  for (const line of readFileSync(smokeEnvPath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}

const BASE = (process.argv[2] || process.env.BASE_URL || "https://app.leadcapture.online").replace(/\/$/, "")
const email = process.env.SMOKE_EMAIL || ""
const password = process.env.SMOKE_PASSWORD || ""
const masterEmail = process.env.MASTER_EMAIL || email
const masterPassword = process.env.MASTER_PASSWORD || password

let failed = 0
const ok = (m) => console.log(`OK    ${m}`)
const fail = (m) => {
  failed++
  console.error(`FAIL  ${m}`)
}

async function req(method, path, { token, body, headers } = {}) {
  const h = { "Content-Type": "application/json", ...(headers || {}) }
  if (token) h.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ct = r.headers.get("content-type") || ""
  const data = ct.includes("application/json") ? await r.json().catch(() => ({})) : await r.text()
  return { status: r.status, data }
}

async function login(em, pw) {
  const r = await req("POST", "/api/auth/login", { body: { email: em, password: pw } })
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`login failed ${r.status}: ${JSON.stringify(r.data)}`)
  }
  return r.data.token
}

console.log(`\nSmoke Governance → ${BASE}\n`)

/* 0. Health readiness + version handshake */
{
  const h = await req("GET", "/api/health")
  if (h.status === 200 && (h.data?.status === "ok" || h.data?.ready === true)) {
    ok(`health ready db=${h.data?.checks?.database || "?"} v=${h.data?.version?.version || "?"}`)
  } else if (h.status === 200 && h.data?.status === "ok") {
    ok(`health ok (legacy shape)`)
  } else {
    fail(`health → ${h.status} ${JSON.stringify(h.data).slice(0, 140)}`)
  }
  const v = await req("GET", "/api/public/version")
  if (v.status === 200 && v.data?.platform?.version) {
    const sha = v.data.platform.git_sha || "?"
    const bt = v.data.platform.build_time || "?"
    ok(`public/version ${v.data.platform.version} sha=${sha} build=${bt}`)
    if (!v.data.platform.git_sha && !v.data.platform.build_time) {
      fail("public/version sem git_sha/build_time (build-meta ausente no deploy)")
    }
  } else {
    fail(`public/version → ${v.status}`)
  }
}

/* 1. Public platform-status */
{
  const r = await req("GET", "/api/public/platform-status")
  if (r.status === 200 && r.data?.status && typeof r.data.status.maintenance_mode === "boolean") {
    ok(`public/platform-status maintenance=${r.data.status.maintenance_mode} signup=${r.data.status.signup_enabled}`)
  } else {
    fail(`public/platform-status → ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  }
}

/* 2. Public plans */
{
  const r = await req("GET", "/api/public/plans")
  if (r.status === 200 && Array.isArray(r.data?.plans)) {
    ok(`public/plans count=${r.data.plans.length}`)
  } else {
    fail(`public/plans → ${r.status}`)
  }
}

if (!email || !password) {
  fail("SMOKE_EMAIL/SMOKE_PASSWORD ausentes — testes autenticados pulados")
  process.exit(failed ? 1 : 0)
}

let tenantToken = null
try {
  tenantToken = await login(email, password)
  ok("tenant login")
} catch (e) {
  fail(`tenant login: ${e.message}`)
}

/* 3. Entitlements */
if (tenantToken) {
  const r = await req("GET", "/api/entitlements", { token: tenantToken })
  if (r.status === 200 && r.data?.entitlements?.modules) {
    const mods = r.data.entitlements.modules
    ok(`entitlements plan=${r.data.entitlements.subscription?.plan_slug || "none"} modules=${Object.keys(mods).length}`)
  } else {
    fail(`entitlements → ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`)
  }
}

/* 4. Content hub */
if (tenantToken) {
  const r = await req("GET", "/api/content-hub", { token: tenantToken })
  if (r.status === 200 && r.data?.hub) {
    ok(`content-hub materials=${(r.data.hub.affiliate_materials || []).length} skills=${(r.data.hub.skill_templates || []).length}`)
  } else {
    fail(`content-hub → ${r.status}`)
  }
}

/* 5. Roles catalog mounted (retry once — cold start may seed tables) */
if (tenantToken) {
  let r = await req("GET", "/api/roles/permissions", { token: tenantToken })
  if (r.status >= 500) {
    await new Promise((res) => setTimeout(res, 1500))
    r = await req("GET", "/api/roles/permissions", { token: tenantToken })
  }
  if (r.status === 200 && Array.isArray(r.data?.permissions)) {
    ok(`roles/permissions mounted (${r.data.permissions.length})`)
  } else if (r.status === 404) {
    fail("roles/permissions → 404 (rota não montada)")
  } else {
    fail(`roles/permissions → ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
  }
}

/* 6. Master suite */
let masterToken = null
try {
  masterToken = await login(masterEmail, masterPassword)
  const me = await req("GET", "/api/master/auth/me", { token: masterToken })
  if (me.status === 200) {
    ok(`master auth/me ${me.data?.user?.email || ""}`)
  } else if (me.status === 403) {
    fail("master auth — usuário smoke não é super_admin (defina MASTER_EMAIL)")
    masterToken = null
  } else {
    fail(`master auth/me → ${me.status}`)
    masterToken = null
  }
} catch (e) {
  fail(`master login: ${e.message}`)
}

if (masterToken) {
  const health = await req("GET", "/api/master/health", { token: masterToken })
  if (health.status === 200 && health.data?.health) {
    ok(`master/health wa_off=${health.data.health.whatsapp_not_connected} past_due=${health.data.health.subscriptions_past_due}`)
    if (health.data.platform?.git_sha) {
      ok(`master/health platform sha=${health.data.platform.git_sha}`)
    }
  } else {
    fail(`master/health → ${health.status}`)
  }

  const ver = await req("GET", "/api/master/version", { token: masterToken })
  if (ver.status === 200 && ver.data?.platform?.version) {
    ok(`master/version ${ver.data.platform.version} sha=${ver.data.platform.git_sha || "?"}`)
  } else {
    fail(`master/version → ${ver.status}`)
  }

  const tools = await req("GET", "/api/master/tools", { token: masterToken })
  if (tools.status === 200 && tools.data?.tools?.modules) {
    ok(`master/tools modules ok`)
  } else {
    fail(`master/tools → ${tools.status}`)
  }

  const packs = await req("GET", "/api/master/content-packs", { token: masterToken })
  if (packs.status === 200 && packs.data?.packs) {
    ok(`master/content-packs skills=${(packs.data.packs.skill_templates || []).length}`)
  } else {
    fail(`master/content-packs → ${packs.status}`)
  }

  const orgs = await req("GET", "/api/master/organizations?limit=5", { token: masterToken })
  if (orgs.status === 200 && Array.isArray(orgs.data?.organizations)) {
    ok(`master/organizations total=${orgs.data.total}`)
  } else {
    fail(`master/organizations → ${orgs.status}`)
  }
}

console.log(failed ? `\n${failed} falha(s)\n` : "\nTodos os checks de governança passaram.\n")
process.exit(failed ? 1 : 0)
