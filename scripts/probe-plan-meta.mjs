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

try {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY 1`,
  )
  console.log('sub cols', cols.rows.map((r) => r.column_name).join(', '))

  const subs = await pool.query(`SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 10`, [userId])
  console.log('subs', JSON.stringify(subs.rows, null, 2).slice(0, 3000))

  // plans with limits json
  const planCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'plans' ORDER BY 1`,
  )
  console.log('plan cols', planCols.rows.map((r) => r.column_name).join(', '))

  const plans = await pool.query(`SELECT * FROM plans LIMIT 5`)
  for (const p of plans.rows) {
    console.log('--- plan', p.name, p.id)
    console.log(JSON.stringify({ features: p.features, limits: p.limits, slug: p.slug }, null, 2).slice(0, 800))
  }

  const user = await pool.query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId])
  console.log('super', user.rows)
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await pool.end()
}
