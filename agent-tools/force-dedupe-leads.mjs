/**
 * One-shot: remove duplicate customers by (owner, brand, google_place_id), keep oldest.
 * Then create unique index.
 */
import fs from "fs";
import pg from "pg";

const { Pool } = pg;
let cs = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!cs && fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^(DATABASE_URL|POSTGRES_URL)=(.*)$/);
    if (m) {
      cs = m[2].trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
}
if (!cs) {
  console.error("no db");
  process.exit(1);
}

const p = new Pool({ connectionString: cs });

async function countDups() {
  const r = await p.query(`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(c-1),0)::int AS extra FROM (
      SELECT COUNT(*) AS c
      FROM customers
      WHERE google_place_id IS NOT NULL AND btrim(google_place_id) <> ''
      GROUP BY owner_user_id, COALESCE(brand_id::text,''), google_place_id
      HAVING COUNT(*) > 1
    ) t
  `);
  return r.rows[0];
}

try {
  console.log("before", await countDups());

  // Re-point campaign_leads that point to doomed duplicate ids → keep oldest
  // First identify doomed ids
  const doomed = await p.query(`
    SELECT c.id AS doomed_id, k.keep_id
    FROM customers c
    INNER JOIN LATERAL (
      SELECT d.id AS keep_id
      FROM customers d
      WHERE d.google_place_id = c.google_place_id
        AND COALESCE(d.owner_user_id::text,'') = COALESCE(c.owner_user_id::text,'')
        AND COALESCE(d.brand_id::text,'') = COALESCE(c.brand_id::text,'')
        AND d.google_place_id IS NOT NULL AND btrim(d.google_place_id) <> ''
      ORDER BY d.created_at ASC NULLS LAST, d.id::text ASC
      LIMIT 1
    ) k ON true
    WHERE c.google_place_id IS NOT NULL AND btrim(c.google_place_id) <> ''
      AND c.id <> k.keep_id
  `);
  console.log("doomed_rows", doomed.rows.length);

  // Update campaign_leads references if table exists
  try {
    let remapped = 0;
    for (const row of doomed.rows) {
      const u = await p.query(
        `UPDATE campaign_leads SET lead_id = $1 WHERE lead_id = $2 AND lead_id <> $1`,
        [row.keep_id, row.doomed_id]
      );
      remapped += u.rowCount || 0;
    }
    console.log("campaign_leads_remapped", remapped);
  } catch (e) {
    console.log("campaign_leads skip", e.message);
  }

  const del = await p.query(`
    DELETE FROM customers c
    USING customers d
    WHERE c.google_place_id IS NOT NULL
      AND btrim(c.google_place_id) <> ''
      AND c.google_place_id = d.google_place_id
      AND COALESCE(c.owner_user_id::text, '') = COALESCE(d.owner_user_id::text, '')
      AND COALESCE(c.brand_id::text, '') = COALESCE(d.brand_id::text, '')
      AND (
        COALESCE(c.created_at, '1970-01-01'::timestamp) > COALESCE(d.created_at, '1970-01-01'::timestamp)
        OR (
          COALESCE(c.created_at, '1970-01-01'::timestamp) = COALESCE(d.created_at, '1970-01-01'::timestamp)
          AND c.id::text > d.id::text
        )
      )
  `);
  console.log("deleted", del.rowCount);
  console.log("after", await countDups());

  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_owner_brand_place
    ON customers (
      owner_user_id,
      (COALESCE(brand_id::text, '')),
      google_place_id
    )
    WHERE google_place_id IS NOT NULL AND btrim(google_place_id) <> ''
  `);
  console.log("unique index ok");
} catch (e) {
  console.error("FAIL", e);
  process.exit(1);
} finally {
  await p.end();
}
