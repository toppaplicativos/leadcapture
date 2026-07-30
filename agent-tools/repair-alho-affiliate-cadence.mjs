import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { query, queryOne, closePool } = require('../dist/config/database')

const APPLY = process.argv.includes('--apply')
const BRAND_ID = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd'
const SINCE = '2026-07-29T00:00:00.000Z'
const INITIATING = new Set(['sent', 'followup', 'called'])
const STEP = {
  first_contact: 1,
  followup_1: 2,
  followup_2: 3,
  followup_3: 4,
  followup_4: 5,
  followup_5: 6,
  followup_6: 7,
  followup_7: 8,
}

const brand = await queryOne(
  `SELECT id, slug FROM brand_units WHERE id = ? LIMIT 1`,
  [BRAND_ID],
)
if (!brand || String(brand.slug) !== 'alhopronto') {
  throw new Error('Proteção acionada: a marca alvo não é Alho Pronto')
}

const candidates = await query(
  `SELECT p.*,
          (SELECT a.action
             FROM affiliate_manual_actions a
            WHERE a.affiliate_id = p.affiliate_id
              AND a.brand_id = p.brand_id
              AND a.ref_type = p.ref_type
              AND a.ref_id = p.ref_id
            ORDER BY a.created_at DESC
            LIMIT 1) AS last_action,
          (SELECT d.id
             FROM affiliate_attendance_tasks d
            WHERE d.brand_id = p.brand_id
              AND d.affiliate_id = p.affiliate_id
              AND d.ref_type = p.ref_type
              AND d.ref_id = p.ref_id
              AND d.status = 'done'
              AND d.updated_at <= p.created_at
            ORDER BY d.updated_at DESC
            LIMIT 1) AS previous_task_id,
          (SELECT d.task_type
             FROM affiliate_attendance_tasks d
            WHERE d.brand_id = p.brand_id
              AND d.affiliate_id = p.affiliate_id
              AND d.ref_type = p.ref_type
              AND d.ref_id = p.ref_id
              AND d.status = 'done'
              AND d.updated_at <= p.created_at
            ORDER BY d.updated_at DESC
            LIMIT 1) AS previous_task_type
     FROM affiliate_attendance_tasks p
    WHERE p.brand_id = ?
      AND p.status = 'pending'
      AND p.created_from_action IN ('sent', 'followup', 'called')
      AND COALESCE(p.instruction, '') NOT LIKE 'Resultado pendente%'
      AND p.created_at >= ?
    ORDER BY p.created_at ASC`,
  [BRAND_ID, SINCE],
)

const repairable = candidates.filter((row) => {
  if (!INITIATING.has(String(row.last_action || ''))) return false
  if (!row.previous_task_id) return true
  return Number(STEP[row.task_type] || 0) === Number(STEP[row.previous_task_type] || 0) + 1
})

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  brand: String(brand.slug),
  since: SINCE,
  candidates: candidates.length,
  repairable: repairable.length,
  reopen_previous: repairable.filter((row) => row.previous_task_id).length,
  cancel_anticipated_only: repairable.filter((row) => !row.previous_task_id).length,
  stages: repairable.map((row) => ({
    pending: row.task_type,
    previous: row.previous_task_type || null,
    instruction: row.instruction || null,
  })),
}, null, 2))

if (APPLY) {
  for (const row of repairable) {
    await query(
      `UPDATE affiliate_attendance_tasks
          SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND brand_id = ? AND status = 'pending'
          AND created_from_action IN ('sent', 'followup', 'called')`,
      [row.id, BRAND_ID],
    )

    if (row.previous_task_id) {
      await query(
        `UPDATE affiliate_attendance_tasks
            SET status = 'pending',
                completed_at = NULL,
                instruction = CASE
                  WHEN COALESCE(instruction, '') LIKE 'Resultado pendente%' THEN instruction
                  ELSE 'Resultado pendente · ' || COALESCE(instruction, 'concluir etapa atual')
                END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND brand_id = ? AND status = 'done'`,
        [row.previous_task_id, BRAND_ID],
      )
    }

    const table = row.ref_type === 'assignment' ? 'prospect_assignments' : 'affiliate_leads'
    await query(
      `UPDATE ${table} SET next_followup_at = NULL WHERE id = ? AND brand_id = ?`,
      [row.ref_id, BRAND_ID],
    )
  }
  console.log(`APPLIED ${repairable.length}`)
}

await closePool?.()
