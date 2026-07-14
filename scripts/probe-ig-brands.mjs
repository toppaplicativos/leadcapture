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

const userId = '9ebbc422-758f-4556-9b6b-ddf4985615e2'
const brandId = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'

try {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'brand_units' ORDER BY 1`,
  )
  console.log('brand_units cols', cols.rows.map((r) => r.column_name).join(', '))

  const brand = await pool.query(`SELECT * FROM brand_units WHERE id = $1`, [brandId])
  console.log('ig brand', brand.rows.map((r) => ({ id: r.id, name: r.name, user_id: r.user_id })))

  const ctx = await pool.query(`SELECT * FROM user_brand_context WHERE user_id = $1`, [userId])
  console.log('user_brand_context', ctx.rows)

  const owned = await pool.query(
    `SELECT id, name FROM brand_units WHERE user_id = $1 LIMIT 30`,
    [userId],
  )
  console.log('owned brands', owned.rows)

  // any other user contexts pointing to this brand
  const ctx2 = await pool.query(
    `SELECT * FROM user_brand_context WHERE active_brand_id = $1`,
    [brandId],
  )
  console.log('contexts on ig brand', ctx2.rows)
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await pool.end()
}
