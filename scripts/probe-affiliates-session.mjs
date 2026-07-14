import pg from "pg"
import { readFileSync } from "fs"

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8")
for (const line of envText.split(/\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (!m) continue
  const k = m[1].trim()
  let v = m[2].trim().replace(/^["']|["']$/g, "")
  if (!process.env[k]) process.env[k] = v
}

const base = process.env.APP_URL || "https://app.leadcapture.online"
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function login(email, password) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, token: j.token || j.access_token || j.data?.token, body: j }
}

async function chat(token, brandId, skill = "affiliate.open") {
  const r = await fetch(`${base}/api/admin-agent/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-brand-id": brandId,
    },
    body: JSON.stringify({
      message: "",
      directSkill: skill,
      currentPath: "/admin",
      skillContext: { label: "Afiliados" },
    }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}

async function affiliatesStats(token, brandId) {
  const r = await fetch(`${base}/api/affiliates/stats?brand_id=${encodeURIComponent(brandId)}`, {
    headers: { Authorization: `Bearer ${token}`, "x-brand-id": brandId },
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}

async function main() {
  await client.connect()
  const brands = await client.query(
    `SELECT id, name, slug, user_id, status FROM brand_units ORDER BY created_at DESC LIMIT 20`,
  )
  console.log("=== brands ===")
  for (const b of brands.rows) {
    console.log(`- ${b.name} | ${b.slug} | status=${b.status} | owner=${b.user_id} | ${b.id}`)
  }

  const users = await client.query(
    `SELECT id, email, name FROM users
     WHERE email ILIKE '%elenice%' OR email ILIKE '%alho%' OR name ILIKE '%alho%'
        OR email ILIKE '%admin%' OR name ILIKE '%pronto%'
     LIMIT 20`,
  )
  console.log("=== users ===")
  console.log(users.rows)

  const smoke = await login("eleniceventura72@gmail.com", "salao1234")
  console.log("smoke login", smoke.status, !!smoke.token)

  if (smoke.token) {
    // brands API
    const br = await fetch(`${base}/api/brands`, {
      headers: { Authorization: `Bearer ${smoke.token}` },
    })
    const bj = await br.json().catch(() => ({}))
    const list = bj.brands || bj.data || []
    console.log("smoke brands API", br.status, Array.isArray(list) ? list.map((x) => x.name) : bj)

    for (const b of Array.isArray(list) ? list : []) {
      const c1 = await chat(smoke.token, b.id)
      console.log("chat", b.name, c1.status, c1.body.error || c1.body.message || "ok")
      const c2 = await chat(smoke.token, b.id) // second concurrent-ish sequential
      console.log("chat2", b.name, c2.status, c2.body.error || c2.body.message || "ok")
      const s = await affiliatesStats(smoke.token, b.id)
      console.log("stats", b.name, s.status, s.body.error || s.body.message || "ok")
    }

    // race: parallel chats without sessionId for same brand
    if (list[0]) {
      const b = list[0]
      const results = await Promise.all([
        chat(smoke.token, b.id),
        chat(smoke.token, b.id),
        chat(smoke.token, b.id),
      ])
      console.log(
        "race",
        results.map((r) => `${r.status}:${r.body.error || r.body.message || "ok"}`),
      )
    }
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
