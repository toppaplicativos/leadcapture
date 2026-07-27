/**
 * Reconciles customers.status with the affiliate workflow for Alho Pronto.
 *
 * Dry-run by default:
 *   node agent-tools/repair-alho-root-lead-statuses.mjs
 * Apply:
 *   node agent-tools/repair-alho-root-lead-statuses.mjs --apply
 *
 * Recovery assignments without a new contact action intentionally remain new.
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

const reconciliationCte = `
  WITH assignment_base AS (
    SELECT pa.*,
           (
             SELECT a.action
               FROM affiliate_manual_actions a
              WHERE a.brand_id = pa.brand_id
                AND a.affiliate_id = pa.affiliate_id
                AND a.ref_type = 'assignment'
                AND a.ref_id = pa.id
              ORDER BY a.created_at DESC
              LIMIT 1
           ) AS latest_action,
           EXISTS (
             SELECT 1
               FROM affiliate_manual_actions a
              WHERE a.brand_id = pa.brand_id
                AND a.affiliate_id = pa.affiliate_id
                AND a.ref_type = 'assignment'
                AND a.ref_id = pa.id
                AND a.action IN (
                  'sent','followup','called','voicemail','busy','callback_requested',
                  'auto_reply','no_answer','waiting','replied','negotiating','convert'
                )
           ) AS has_contact_action
      FROM prospect_assignments pa
     WHERE pa.brand_id = $1
       AND COALESCE(pa.prospect_ref_table, 'customers') = 'customers'
       AND pa.prospect_id IS NOT NULL
  ),
  rollup AS (
    SELECT prospect_id,
           BOOL_OR(
             COALESCE(assignment_status, 'assigned') NOT IN ('lost','recycled','converted')
             AND COALESCE(conversion_status, 'open') <> 'converted'
           ) AS has_active,
           BOOL_OR(
             assignment_status = 'converted' OR conversion_status = 'converted'
             OR current_stage = 'converted'
           ) AS has_converted,
           BOOL_OR(
             assignment_status = 'lost' OR conversion_status = 'lost'
             OR current_stage = 'lost'
           ) AS has_lost,
           BOOL_OR(has_contact_action) AS has_contact_action,
           BOOL_OR(current_stage IN (
             'contact_attempted','initial_message_sent','awaiting_response',
             'engaged','needs_human_attention','proposal_sent'
           )) AS has_progressed_stage,
           BOOL_OR(current_stage = 'proposal_sent') AS has_proposal,
           BOOL_OR(current_stage IN ('engaged','needs_human_attention')) AS has_engaged,
           BOOL_AND(
             COALESCE(source, '') ILIKE '%recover%'
             OR COALESCE(metadata_json::text, '') ILIKE '%recover%'
             OR COALESCE(notes, '') ILIKE '%recuper%'
           ) FILTER (
             WHERE COALESCE(assignment_status, 'assigned') NOT IN ('lost','recycled','converted')
           ) AS active_only_recovery,
           (
             SELECT ab2.latest_action
               FROM assignment_base ab2
              WHERE ab2.prospect_id = assignment_base.prospect_id
                AND ab2.latest_action IS NOT NULL
              ORDER BY ab2.last_interaction_at DESC NULLS LAST, ab2.updated_at DESC
              LIMIT 1
           ) AS latest_action
      FROM assignment_base
     GROUP BY prospect_id
  ),
  desired AS (
    SELECT c.id,
           c.status AS current_status,
           CASE
             WHEN r.has_converted THEN 'converted'
             WHEN NOT r.has_active AND r.has_lost THEN 'lost'
             WHEN r.latest_action = 'negotiating' OR r.has_proposal THEN 'negotiating'
             WHEN r.latest_action = 'replied' OR r.has_engaged THEN 'replied'
             WHEN r.latest_action = 'channel_unavailable' AND r.has_active THEN 'phone_only'
             WHEN r.has_contact_action OR r.has_progressed_stage THEN 'contacted'
             WHEN r.has_active AND NOT COALESCE(r.active_only_recovery, FALSE) THEN 'assigned'
             ELSE 'new'
           END AS desired_status
      FROM customers c
      JOIN rollup r ON r.prospect_id = c.id
     WHERE c.brand_id = $1
  )
`

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

  const summary = await client.query(
    `${reconciliationCte}
     SELECT desired_status,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE current_status IS DISTINCT FROM desired_status)::int AS to_update
       FROM desired
      GROUP BY desired_status
      ORDER BY total DESC`,
    [BRAND_ID],
  )
  const changes = await client.query(
    `${reconciliationCte}
     SELECT current_status, desired_status, COUNT(*)::int AS total
       FROM desired
      WHERE current_status IS DISTINCT FROM desired_status
      GROUP BY current_status, desired_status
      ORDER BY total DESC`,
    [BRAND_ID],
  )
  const updateTotal = changes.rows.reduce((sum, row) => sum + Number(row.total || 0), 0)

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    brand: brand.rows[0],
    desired: summary.rows,
    changes: changes.rows,
    update_total: updateTotal,
  }, null, 2))

  if (updateTotal > 1500) {
    throw new Error(`Safety limit exceeded: ${updateTotal} candidates`)
  }

  if (APPLY && updateTotal > 0) {
    const updated = await client.query(
      `${reconciliationCte}
       UPDATE customers c
          SET status = d.desired_status,
              updated_at = CURRENT_TIMESTAMP
         FROM desired d
        WHERE c.id = d.id
          AND c.brand_id = $1
          AND c.status IS DISTINCT FROM d.desired_status`,
      [BRAND_ID],
    )
    if (updated.rowCount !== updateTotal) {
      throw new Error(`Concurrent change detected: expected ${updateTotal}, updated ${updated.rowCount}`)
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
