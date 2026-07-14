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
const CE = '204355c2-dccf-488e-83e5-615153056a95'

function len(v) {
  return String(v || '').length
}

try {
  const brandCols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'brand_units' ORDER BY ordinal_position`,
  )
  console.log('=== BRAND COLS ===', brandCols.rows.map((r) => r.column_name).join(', '))
  const brand = await pool.query(`SELECT * FROM brand_units WHERE id = $1`, [BRAND])
  console.log('=== BRAND ===')
  console.log(JSON.stringify(brand.rows[0], null, 2))

  const cfg = await pool.query(`SELECT * FROM affiliate_program_config WHERE brand_id = $1`, [BRAND])
  console.log('=== CONFIG LEGACY ===')
  if (cfg.rows[0]) {
    const c = cfg.rows[0]
    console.log(
      JSON.stringify(
        {
          id: c.id,
          is_enabled: c.is_enabled,
          accept_new: c.accept_new_affiliates,
          auto_approve: c.auto_approve_affiliates,
          commission_mode: c.default_commission_mode,
          commission_value: c.default_commission_value,
          commission_pct: c.default_commission_pct,
          commission_rules: c.commission_rules,
          cookie_days: c.cookie_days,
          min_withdrawal: c.min_withdrawal,
          payment_days: c.payment_days,
          app_subdomain: c.app_subdomain,
          share_title: c.share_title,
          share_description: c.share_description,
          share_image_url: c.share_image_url,
          promotion_tone: c.promotion_tone,
          terms_len: len(c.terms_html),
          training_len: len(c.training_html),
          terms_preview: String(c.terms_html || '').slice(0, 300),
          training_preview: String(c.training_html || '').slice(0, 300),
        },
        null,
        2,
      ),
    )
  } else {
    console.log('NONE')
  }

  const progs = await pool.query(
    `SELECT id, name, slug, status, is_default, is_marketplace_visible, commission_mode, commission_value,
            commission_rules, eligibility_rules, payout_method, payout_frequency, payout_min_amount, payout_notes,
            payment_days, min_withdrawal, cookie_days, accept_applications, auto_approve_applications,
            description, share_title, share_description, promotion_tone,
            terms_html, policies_html, orientation_html
     FROM affiliate_programs WHERE brand_id = $1 ORDER BY is_default DESC, sort_order`,
    [BRAND],
  )
  console.log('=== PROGRAMS COUNT ===', progs.rows.length)
  for (const p of progs.rows) {
    console.log(
      JSON.stringify(
        {
          id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status,
          is_default: p.is_default,
          marketplace: p.is_marketplace_visible,
          commission_mode: p.commission_mode,
          commission_value: p.commission_value,
          commission_rules: p.commission_rules,
          eligibility_rules: p.eligibility_rules,
          payout_method: p.payout_method,
          payout_frequency: p.payout_frequency,
          payout_min_amount: p.payout_min_amount,
          payout_notes: p.payout_notes,
          payment_days: p.payment_days,
          min_withdrawal: p.min_withdrawal,
          cookie_days: p.cookie_days,
          accept_applications: p.accept_applications,
          auto_approve: p.auto_approve_applications,
          description: p.description,
          share_title: p.share_title,
          share_description: p.share_description,
          promotion_tone: p.promotion_tone,
          terms_len: len(p.terms_html),
          policies_len: len(p.policies_html),
          orientation_len: len(p.orientation_html),
          terms_preview: String(p.terms_html || '').slice(0, 250),
          policies_preview: String(p.policies_html || '').slice(0, 250),
          orientation_preview: String(p.orientation_html || '').slice(0, 250),
        },
        null,
        2,
      ),
    )

    const steps = await pool.query(
      `SELECT slug, title, step_type, sort_order, is_required, description
       FROM affiliate_program_steps WHERE program_id = $1 ORDER BY sort_order`,
      [p.id],
    )
    const trainings = await pool.query(
      `SELECT title, content_type, sort_order, is_required, length(coalesce(content_html,'')) AS content_len
       FROM affiliate_program_trainings WHERE program_id = $1 ORDER BY sort_order`,
      [p.id],
    )
    const offers = await pool.query(
      `SELECT title, product_id, product_type, product_category, is_active, description
       FROM affiliate_program_offers WHERE program_id = $1`,
      [p.id],
    )
    const apps = await pool.query(
      `SELECT status, count(*)::int AS n FROM affiliate_program_applications WHERE program_id = $1 GROUP BY status`,
      [p.id],
    )
    const enrolls = await pool.query(
      `SELECT status, count(*)::int AS n FROM affiliate_program_enrollments WHERE program_id = $1 GROUP BY status`,
      [p.id],
    )
    console.log('steps', JSON.stringify(steps.rows, null, 2))
    console.log('trainings', JSON.stringify(trainings.rows, null, 2))
    console.log('offers', JSON.stringify(offers.rows, null, 2))
    console.log('apps', apps.rows, 'enrolls', enrolls.rows)
  }

  const learn = await pool.query(
    `SELECT slug, title, module_type, is_published, is_required, sort_order,
            length(coalesce(content_html,'')) AS content_len, content_html
     FROM affiliate_learning_modules WHERE brand_id = $1 ORDER BY sort_order`,
    [BRAND],
  )
  console.log('=== LEARNING ===')
  for (const m of learn.rows) {
    console.log(
      JSON.stringify({
        slug: m.slug,
        title: m.title,
        type: m.module_type,
        pub: m.is_published,
        req: m.is_required,
        len: m.content_len,
        preview: String(m.content_html || '').slice(0, 150),
      }),
    )
  }

  const mats = await pool
    .query(
      `SELECT title, material_type, channel, is_published, length(coalesce(content_html,'')) AS content_len
       FROM affiliate_materials WHERE brand_id = $1`,
      [BRAND],
    )
    .catch((e) => ({ rows: [{ err: e.message }] }))
  console.log('=== MATERIALS ===', JSON.stringify(mats.rows, null, 2))

  const affs = await pool.query(
    `SELECT status, count(*)::int AS n FROM affiliates WHERE brand_id = $1 GROUP BY status`,
    [BRAND],
  )
  console.log('=== AFFILIATES ===', affs.rows)

  const dist = await pool
    .query(`SELECT * FROM lead_distribution_rules WHERE brand_id = $1`, [BRAND])
    .catch((e) => ({ rows: [{ err: e.message }] }))
  console.log(
    '=== DISTRIBUTION ===',
    JSON.stringify(
      (dist.rows || []).map((r) =>
        r.err
          ? r
          : {
              is_enabled: r.is_enabled,
              max_daily: r.max_daily_per_affiliate,
              rotation: r.rotation_mode,
              req_wa: r.require_whatsapp_connected,
              req_train: r.require_training_complete,
              req_terms: r.require_terms_accepted,
              req_pix: r.require_pix_key,
              auto_enqueue: r.auto_enqueue_capture,
              initial_msg_len: len(r.initial_message_template),
              followup_msg_len: len(r.followup_message_template),
            },
      ),
      null,
      2,
    ),
  )

  // products — try common schemas
  let prods
  try {
    prods = await pool.query(
      `SELECT count(*)::int AS n FROM products WHERE brand_id = $1`,
      [BRAND],
    )
  } catch {
    try {
      prods = await pool.query(
        `SELECT count(*)::int AS n FROM catalog_products WHERE brand_id = $1`,
        [BRAND],
      )
    } catch (e) {
      prods = { rows: [{ err: e.message }] }
    }
  }
  console.log('=== PRODUCTS ===', prods.rows)

  const ceProgs = await pool.query(
    `SELECT id, name, status, is_default,
            length(coalesce(terms_html,'')) AS t,
            length(coalesce(policies_html,'')) AS p,
            length(coalesce(orientation_html,'')) AS o,
            payout_method, payout_frequency, payout_min_amount, payment_days
     FROM affiliate_programs WHERE brand_id = $1`,
    [CE],
  )
  console.log('=== CE PROGRAMS (ref) ===', JSON.stringify(ceProgs.rows, null, 2))

  const ceLearn = await pool.query(
    `SELECT slug, is_published, is_required, length(coalesce(content_html,'')) AS len
     FROM affiliate_learning_modules WHERE brand_id = $1 ORDER BY sort_order`,
    [CE],
  )
  console.log('=== CE LEARNING (ref) ===', ceLearn.rows)
} catch (e) {
  console.error('ERR', e)
} finally {
  await pool.end()
}
