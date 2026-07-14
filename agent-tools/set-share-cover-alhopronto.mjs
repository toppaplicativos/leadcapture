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
const cover = '/uploads/images/0174b388-3c0a-4284-a39d-ce6d8edf4a82.png'

await pool.query(
  `UPDATE affiliate_program_config
   SET share_image_url = $1, updated_at = NOW()
   WHERE brand_id = $2`,
  [cover, BRAND],
)
await pool.query(
  `UPDATE affiliate_programs
   SET share_image_url = $1, updated_at = NOW()
   WHERE brand_id = $2 AND is_default = TRUE`,
  [cover, BRAND],
)
const r = await pool.query(
  `SELECT share_image_url, share_title, length(terms_html) t, length(training_html) tr
   FROM affiliate_program_config WHERE brand_id = $1`,
  [BRAND],
)
console.log(r.rows[0])
await pool.end()
