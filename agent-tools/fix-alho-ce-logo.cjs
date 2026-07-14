/**
 * Alho Pronto CE aponta logo para https://alhopronto.online/... (404).
 * Espelha para o logo válido da marca principal Alho Pronto em /uploads/...
 */
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const root = process.cwd()
const env = fs.readFileSync(path.join(root, '.env'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  const mainBrand = await p.query(
    `SELECT id, name, logo_url FROM brand_units WHERE name ILIKE 'Alho Pronto' AND name NOT ILIKE '%CE%' LIMIT 1`,
  )
  const ce = await p.query(
    `SELECT id, name, logo_url FROM brand_units WHERE name ILIKE '%Alho Pronto CE%' LIMIT 1`,
  )
  console.log('main', mainBrand.rows[0])
  console.log('ce before', ce.rows[0])
  if (!ce.rows[0]) {
    console.log('CE brand not found')
    await p.end()
    return
  }
  const fallback = mainBrand.rows[0]?.logo_url || '/brand-mark.png'
  const cur = String(ce.rows[0].logo_url || '')
  if (cur.includes('f3e67766') || cur.includes('alhopronto.online')) {
    await p.query(`UPDATE brand_units SET logo_url = $1, updated_at = NOW() WHERE id = $2`, [
      fallback,
      ce.rows[0].id,
    ])
    console.log('ce logo updated to', fallback)
  } else {
    console.log('ce logo already ok:', cur)
  }
  const after = await p.query(`SELECT id, name, logo_url FROM brand_units WHERE id = $1`, [ce.rows[0].id])
  console.log('ce after', after.rows[0])
  await p.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
