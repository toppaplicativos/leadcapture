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
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'instagram_connections' ORDER BY ordinal_position`,
  )
  console.log('columns:', cols.rows.map((r) => r.column_name).join(', '))

  const r = await pool.query(`
    SELECT id, brand_id, user_id, username, account_id, ig_user_id, is_active,
           (access_token IS NOT NULL AND length(trim(access_token)) > 0) AS has_token,
           length(coalesce(access_token,'')) AS token_len,
           updated_at
    FROM instagram_connections
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 20
  `)
  console.log('count', r.rows.length)
  for (const row of r.rows) console.log(JSON.stringify(row))
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await pool.end()
}
