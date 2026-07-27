/**
 * Repairs the isolated Alho Pronto regression where a failed channel with
 * another channel still available reset an already-worked assignment to
 * `assigned_to_affiliate`.
 *
 * Dry-run by default. Use --apply to commit.
 */
import fs from 'fs'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const BRAND_ID = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const env = fs.readFileSync('.env', 'utf8')
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/)
let url = (match && match[1]) || ''
if (url.includes(':5432')) url = url.replace(':5432', ':6543')
if (!url) throw new Error('DATABASE_URL missing')

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const brand = await client.query(
    `SELECT id, name, slug FROM brand_units WHERE id = $1 FOR SHARE`,
    [BRAND_ID],
  )
  if (brand.rows[0]?.slug !== 'alhopronto') {
    throw new Error('Target brand mismatch; refusing repair')
  }

  const candidates = await client.query(
    `WITH latest AS (
       SELECT pa.id,
              (
                SELECT a.action
                  FROM affiliate_manual_actions a
                 WHERE a.brand_id = pa.brand_id
                   AND a.affiliate_id = pa.affiliate_id
                   AND a.ref_type = 'assignment'
                   AND a.ref_id = pa.id
                 ORDER BY a.created_at DESC
                 LIMIT 1
              ) AS latest_action
         FROM prospect_assignments pa
        WHERE pa.brand_id = $1
          AND pa.current_stage = 'assigned_to_affiliate'
          AND pa.assignment_status = 'active'
          AND pa.last_interaction_at IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM affiliate_manual_actions a
             WHERE a.brand_id = pa.brand_id
               AND a.affiliate_id = pa.affiliate_id
               AND a.ref_type = 'assignment'
               AND a.ref_id = pa.id
               AND a.action IN (
                 'sent','followup','called','voicemail','busy','callback_requested',
                 'auto_reply','no_answer','waiting','replied','negotiating','convert'
               )
          )
     )
     SELECT id, latest_action
       FROM latest
      WHERE latest_action = 'channel_unavailable'
      ORDER BY id
      FOR UPDATE`,
    [BRAND_ID],
  )

  const count = candidates.rowCount || 0
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    brand: brand.rows[0],
    candidates: count,
    target_stage: 'contact_attempted',
  }, null, 2))

  if (count > 200) {
    throw new Error(`Safety limit exceeded: ${count} candidates`)
  }

  if (APPLY && count > 0) {
    const ids = candidates.rows.map((row) => row.id)
    const updated = await client.query(
      `UPDATE prospect_assignments
          SET current_stage = 'contact_attempted'
        WHERE brand_id = $1
          AND id = ANY($2::text[])
          AND current_stage = 'assigned_to_affiliate'
          AND assignment_status = 'active'`,
      [BRAND_ID, ids],
    )
    if (updated.rowCount !== count) {
      throw new Error(`Concurrent change detected: expected ${count}, updated ${updated.rowCount}`)
    }
    await client.query('COMMIT')
    console.log(JSON.stringify({ committed: true, updated: updated.rowCount }, null, 2))
  } else {
    await client.query('ROLLBACK')
    console.log(JSON.stringify({ committed: false, updated: 0 }, null, 2))
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  client.release()
  await pool.end()
}
