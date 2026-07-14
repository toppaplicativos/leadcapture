import fs from 'fs'
import pg from 'pg'

const env = fs.readFileSync('/root/leadcapture/.env', 'utf8')
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const p = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

const plans = await p.query('SELECT slug, name, limits FROM plans ORDER BY name LIMIT 30')
for (const r of plans.rows) {
  let lim = r.limits
  if (typeof lim === 'string') {
    try { lim = JSON.parse(lim) } catch { lim = {} }
  }
  console.log(r.slug, '|', r.name, '| campaigns=', lim?.features?.campaigns)
}
const tables = ['campaigns', 'whatsapp_campaigns', 'message_campaigns']
for (const t of tables) {
  try {
    const c = await p.query(`SELECT COUNT(*)::int AS n FROM ${t}`)
    console.log('table', t, c.rows[0].n)
  } catch (e) {
    console.log('table', t, 'missing')
  }
}
await p.end()
