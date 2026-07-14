const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const root = process.cwd()
const env = fs.readFileSync(path.join(root, '.env'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  const withLogo = await p.query(
    `SELECT id, name, logo_url FROM brand_units
     WHERE logo_url IS NOT NULL AND logo_url <> ''
       AND logo_url NOT ILIKE '%alhopronto.online%'
       AND logo_url NOT ILIKE '%f3e67766%'
       AND name ILIKE '%alho%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 10`,
  )
  console.log('alho with logo', withLogo.rows)
  const good =
    withLogo.rows.find((r) => String(r.logo_url).includes('/uploads/'))?.logo_url
    || '/brand-mark.png'
  const ceId = '204355c2-dccf-488e-83e5-615153056a95'
  await p.query(`UPDATE brand_units SET logo_url = $1, updated_at = NOW() WHERE id = $2`, [good, ceId])
  // also fix any brand still pointing to dead alhopronto.online logos
  const fixed = await p.query(
    `UPDATE brand_units
     SET logo_url = $1, updated_at = NOW()
     WHERE logo_url ILIKE '%alhopronto.online%' OR logo_url ILIKE '%f3e67766%'
     RETURNING id, name, logo_url`,
    [good],
  )
  console.log('fixed rows', fixed.rows)
  await p.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
