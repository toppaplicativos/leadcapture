import pg from 'pg'
import { readFileSync } from 'fs'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
for (const line of envText.split(/\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/) || line.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const BRAND = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'

try {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position`,
  )
  console.log('products cols:', cols.rows.map((r) => r.column_name).join(', '))

  const prods = await pool.query(`SELECT * FROM products WHERE brand_id = $1 LIMIT 20`, [BRAND])
  for (const p of prods.rows) {
    console.log(
      JSON.stringify({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        is_active: p.is_active,
        price: p.price ?? p.unit_price,
        unit: p.unit,
        category: p.category,
      }),
    )
  }

  const matCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'affiliate_materials' ORDER BY ordinal_position`,
  )
  console.log('materials cols:', matCols.rows.map((r) => r.column_name).join(', '))
  const mats = await pool.query(`SELECT * FROM affiliate_materials WHERE brand_id = $1 LIMIT 20`, [BRAND])
  console.log('materials count', mats.rows.length)
  for (const m of mats.rows) {
    console.log(JSON.stringify(m, null, 0).slice(0, 300))
  }
} catch (e) {
  console.error(e)
} finally {
  await pool.end()
}
