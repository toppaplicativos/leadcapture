/**
 * Read-only audit of affiliate lead/assignment status coherence for Alho Pronto.
 * Prints aggregates only; does not mutate data or expose contact PII.
 */
import fs from 'fs'
import pg from 'pg'

const env = fs.readFileSync('.env', 'utf8')
const match = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/)
let url = (match && match[1]) || ''
if (url.includes(':5432')) url = url.replace(':5432', ':6543')
if (!url) throw new Error('DATABASE_URL missing')

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

function print(label, rows) {
  console.log(`\n== ${label} ==`)
  console.log(JSON.stringify(rows, null, 2))
}

try {
  const brands = await pool.query(
    `SELECT id, name, slug
       FROM brand_units
      WHERE name ILIKE '%alho pronto%' OR slug ILIKE '%alho-pronto%' OR slug = 'alhopronto'
      ORDER BY name, slug`,
  )
  print('BRANDS', brands.rows)

  for (const brand of brands.rows) {
    const params = [brand.id]
    console.log(`\n######## ${brand.name} / ${brand.slug} / ${brand.id} ########`)

    const assignmentStages = await pool.query(
      `SELECT COALESCE(current_stage, '(null)') AS current_stage,
              COALESCE(assignment_status, '(null)') AS assignment_status,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE last_interaction_at IS NOT NULL)::int AS with_last_interaction,
              COUNT(*) FILTER (
                WHERE EXISTS (
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
              )::int AS with_contact_action
         FROM prospect_assignments pa
        WHERE pa.brand_id = $1
        GROUP BY 1,2
        ORDER BY total DESC`,
      params,
    )
    print('ASSIGNMENT_STAGE_COHERENCE', assignmentStages.rows)

    const staleAssignments = await pool.query(
      `SELECT
          COUNT(*)::int AS total_assignments,
          COUNT(*) FILTER (
            WHERE current_stage IN ('assigned_to_affiliate','assigned')
               OR current_stage IS NULL
          )::int AS still_new,
          COUNT(*) FILTER (
            WHERE (current_stage IN ('assigned_to_affiliate','assigned') OR current_stage IS NULL)
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
          )::int AS stale_new_with_contact_action,
          COUNT(*) FILTER (
            WHERE (current_stage IN ('assigned_to_affiliate','assigned') OR current_stage IS NULL)
              AND last_interaction_at IS NOT NULL
          )::int AS stale_new_with_last_interaction
        FROM prospect_assignments pa
       WHERE pa.brand_id = $1`,
      params,
    )
    print('STALE_ASSIGNMENTS', staleAssignments.rows[0])

    const staleLatestActions = await pool.query(
      `WITH stale AS (
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
                ) AS latest_action
           FROM prospect_assignments pa
          WHERE pa.brand_id = $1
            AND (pa.current_stage IN ('assigned_to_affiliate','assigned') OR pa.current_stage IS NULL)
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
       SELECT COALESCE(latest_action, '(null)') AS latest_action, COUNT(*)::int AS total
         FROM stale
        GROUP BY 1
        ORDER BY total DESC`,
      params,
    )
    print('STALE_ASSIGNMENT_LATEST_ACTION', staleLatestActions.rows)

    const actions = await pool.query(
      `SELECT action, COUNT(*)::int AS total,
              MIN(created_at) AS first_at,
              MAX(created_at) AS last_at
         FROM affiliate_manual_actions
        WHERE brand_id = $1
        GROUP BY action
        ORDER BY total DESC`,
      params,
    )
    print('MANUAL_ACTIONS', actions.rows)

    const actionRefTypes = await pool.query(
      `SELECT ref_type, action, COUNT(*)::int AS total
         FROM affiliate_manual_actions
        WHERE brand_id = $1
        GROUP BY ref_type, action
        ORDER BY ref_type, total DESC`,
      params,
    )
    print('ACTIONS_BY_REF_TYPE', actionRefTypes.rows)

    const affiliateLeadStatus = await pool.query(
      `SELECT COALESCE(affiliate_status, '(null)') AS affiliate_status,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM affiliate_manual_actions a
                   WHERE a.brand_id = al.brand_id
                     AND a.affiliate_id = al.affiliate_id
                     AND a.ref_type = 'affiliate_lead'
                     AND a.ref_id = al.id
                     AND a.action IN (
                       'sent','followup','called','voicemail','busy','callback_requested',
                       'auto_reply','no_answer','waiting','replied','negotiating','convert'
                     )
                )
              )::int AS with_contact_action
         FROM affiliate_leads al
        WHERE al.brand_id = $1
        GROUP BY 1
        ORDER BY total DESC`,
      params,
    ).catch(() => ({ rows: [] }))
    print('AFFILIATE_LEAD_STATUS_COHERENCE', affiliateLeadStatus.rows)

    const assignmentTimeline = await pool.query(
      `SELECT date_trunc('day', assigned_at)::date AS day,
              COUNT(*)::int AS assigned,
              COUNT(*) FILTER (
                WHERE COALESCE(source,'') ILIKE '%recover%'
                   OR COALESCE(metadata_json::text,'') ILIKE '%recover%'
                   OR COALESCE(notes,'') ILIKE '%recuper%'
              )::int AS recovery_like,
              COUNT(*) FILTER (
                WHERE EXISTS (
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
              )::int AS contacted
         FROM prospect_assignments pa
        WHERE pa.brand_id = $1
        GROUP BY 1
        ORDER BY day DESC NULLS LAST
        LIMIT 45`,
      params,
    )
    print('ASSIGNMENTS_BY_DAY', assignmentTimeline.rows)

    const sourceSummary = await pool.query(
      `SELECT COALESCE(source, '(null)') AS source,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE current_stage IN ('assigned_to_affiliate','assigned') OR current_stage IS NULL
              )::int AS still_new,
              COUNT(*) FILTER (
                WHERE EXISTS (
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
              )::int AS contacted
         FROM prospect_assignments pa
        WHERE pa.brand_id = $1
        GROUP BY 1
        ORDER BY total DESC`,
      params,
    )
    print('ASSIGNMENTS_BY_SOURCE', sourceSummary.rows)
  }
} finally {
  await pool.end()
}
