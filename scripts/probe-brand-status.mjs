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

try {
  const brands = await pool.query(
    `SELECT id, name, status, COALESCE(status,'null') AS status_raw FROM brand_units WHERE user_id = $1 OR id = $2`,
    ['9ebbc422-758f-4556-9b6b-ddf4985615e2', 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'],
  )
  console.log('brands', brands.rows)

  // sample media path for 404 image
  const media = await pool.query(
    `SELECT id, logo_url FROM brand_units WHERE id = $1`,
    ['dc8f901e-857b-4cfb-b353-86cd5146d1fd'],
  )
  console.log('logo', media.rows)
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await pool.end()
}
