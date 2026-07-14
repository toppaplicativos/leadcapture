const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const root = '/root/leadcapture'
const env = fs.readFileSync(path.join(root, '.env'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  const plans = await p.query('SELECT slug, name, limits FROM plans ORDER BY name LIMIT 30')
  for (const r of plans.rows) {
    let lim = r.limits
    if (typeof lim === 'string') {
      try { lim = JSON.parse(lim) } catch { lim = {} }
    }
    console.log(`${r.slug} | ${r.name} | campaigns=${lim?.features?.campaigns}`)
  }
  const tables = await p.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%campaign%'`,
  )
  console.log('tables', tables.rows.map((x) => x.tablename).join(', '))
  for (const t of tables.rows.map((x) => x.tablename)) {
    try {
      const c = await p.query(`SELECT COUNT(*)::int AS n FROM ${t}`)
      console.log('count', t, c.rows[0].n)
    } catch (e) {
      console.log('count', t, e.message)
    }
  }
  // brand logos pointing to missing files sample
  const logos = await p.query(
    `SELECT id, name, logo_url FROM brand_units WHERE logo_url IS NOT NULL AND logo_url <> '' LIMIT 15`,
  ).catch(() => ({ rows: [] }))
  console.log('logos sample', logos.rows)
  await p.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
