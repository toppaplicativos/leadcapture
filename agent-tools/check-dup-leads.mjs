import fs from "fs";
import pg from "pg";

const { Pool } = pg;
let cs = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!cs && fs.existsSync(".env")) {
  const env = fs.readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^(DATABASE_URL|POSTGRES_URL)=(.*)$/);
    if (m) {
      cs = m[2].trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
}
if (!cs) {
  console.error("no db url");
  process.exit(1);
}

const p = new Pool({ connectionString: cs });
try {
  const total = await p.query("SELECT COUNT(*)::int AS n FROM customers");
  console.log("total", total.rows[0].n);

  const byPlace = await p.query(`
    SELECT google_place_id, COUNT(*)::int AS c
    FROM customers
    WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> ''
    GROUP BY google_place_id
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `);
  console.log("dup_place_groups", byPlace.rows.length);
  console.log(JSON.stringify(byPlace.rows.slice(0, 10), null, 2));

  const placeExtra = await p.query(`
    SELECT COALESCE(SUM(c - 1), 0)::int AS extra FROM (
      SELECT COUNT(*) AS c FROM customers
      WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> ''
      GROUP BY google_place_id HAVING COUNT(*) > 1
    ) t
  `);
  console.log("extra_rows_by_place_id", placeExtra.rows[0]);

  const byPhoneOwner = await p.query(`
    SELECT
      owner_user_id,
      brand_id,
      REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') AS p,
      COUNT(*)::int AS c
    FROM customers
    WHERE phone IS NOT NULL AND TRIM(phone) <> ''
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1 AND LENGTH(REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g')) >= 8
    ORDER BY c DESC
    LIMIT 15
  `);
  console.log("dup_phone_owner_brand_groups", byPhoneOwner.rows.length);
  console.log(JSON.stringify(byPhoneOwner.rows.slice(0, 10), null, 2));

  const byPlaceOwner = await p.query(`
    SELECT owner_user_id, brand_id, google_place_id, COUNT(*)::int AS c
    FROM customers
    WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> ''
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 15
  `);
  console.log("dup_place_owner_brand_groups", byPlaceOwner.rows.length);
  console.log(JSON.stringify(byPlaceOwner.rows.slice(0, 10), null, 2));

  const sample = await p.query(`
    SELECT id, name, phone, google_place_id, brand_id, owner_user_id, created_at::text
    FROM customers
    WHERE google_place_id IN (
      SELECT google_place_id FROM customers
      WHERE google_place_id IS NOT NULL AND TRIM(google_place_id) <> ''
      GROUP BY google_place_id HAVING COUNT(*) > 1
      LIMIT 3
    )
    ORDER BY google_place_id, created_at
    LIMIT 24
  `);
  console.log("samples", JSON.stringify(sample.rows, null, 2));

  const idx = await p.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'customers'
      AND (indexdef ILIKE '%google_place%' OR indexdef ILIKE '%phone%' OR indexname ILIKE '%unique%')
  `);
  console.log("indexes", JSON.stringify(idx.rows, null, 2));
} finally {
  await p.end();
}
