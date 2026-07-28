import fs from 'fs'
import pg from 'pg'
import { randomUUID } from 'crypto'

const APPLY = process.argv.includes('--apply')
const BRAND_ID = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const env = fs.readFileSync('.env', 'utf8')
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/)
let url = (match && match[1]) || ''
if (url.includes(':5432')) url = url.replace(':5432', ':6543')
if (!url) throw new Error('DATABASE_URL missing')

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 })

try {
  const brand = await pool.query(
    `SELECT b.id, b.name, b.slug, b.user_id
     FROM brand_units b WHERE b.id = $1 AND LOWER(b.slug) = 'alhopronto' LIMIT 1`,
    [BRAND_ID],
  )
  if (!brand.rows[0]) throw new Error('Alho Pronto brand guard failed')
  const current = await pool.query(
    `SELECT enabled, track_lots, base_weight_unit
     FROM manufacturing_settings WHERE brand_id = $1 LIMIT 1`,
    [BRAND_ID],
  ).catch(() => ({ rows: [] }))
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', brand: brand.rows[0], current: current.rows[0] || null }, null, 2))
  if (APPLY) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS manufacturing_settings (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        track_lots BOOLEAN NOT NULL DEFAULT TRUE,
        base_weight_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
        updated_by VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, brand_id)
      )
    `)
    await pool.query(
      `INSERT INTO manufacturing_settings
       (id, user_id, brand_id, enabled, track_lots, base_weight_unit)
       VALUES ($1, $2, $3, TRUE, TRUE, 'kg')
       ON CONFLICT (user_id, brand_id)
       DO UPDATE SET enabled = TRUE, track_lots = TRUE, base_weight_unit = 'kg', updated_at = CURRENT_TIMESTAMP`,
      [randomUUID(), brand.rows[0].user_id, BRAND_ID],
    )
    console.log(JSON.stringify({ applied: true, enabled: true }, null, 2))
  }
} finally {
  await pool.end()
}
