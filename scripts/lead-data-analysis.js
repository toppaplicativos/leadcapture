const { Pool } = require("pg");
const pool = new Pool({
  connectionString: "postgresql://postgres.pkgqdewqaonkzhzprpgq:%40Milionarios2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const q = async (sql, params) => (await pool.query(sql, params || [])).rows;

  console.log("=== CITIES (top 20) ===");
  (await q("SELECT city, COUNT(*) as cnt FROM customers WHERE city IS NOT NULL AND TRIM(city) != '' GROUP BY city ORDER BY cnt DESC LIMIT 20")).forEach(r => console.log(r.cnt, r.city));

  console.log("=== STATUSES ===");
  (await q("SELECT status, COUNT(*) as cnt FROM customers GROUP BY status ORDER BY cnt DESC")).forEach(r => console.log(r.cnt, r.status));

  console.log("=== SOURCES ===");
  (await q("SELECT source, COUNT(*) as cnt FROM customers WHERE source IS NOT NULL GROUP BY source ORDER BY cnt DESC LIMIT 10")).forEach(r => console.log(r.cnt, r.source));

  console.log("=== TAGS (distinct) ===");
  const tagRows = await q("SELECT tags FROM customers WHERE tags IS NOT NULL AND tags::text != '[]' AND tags::text != 'null' LIMIT 50");
  const allTags = new Set();
  tagRows.forEach(r => {
    try {
      const t = typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags;
      if (Array.isArray(t)) t.forEach(tag => allTags.add(tag));
    } catch {}
  });
  console.log([...allTags].join(', '));

  console.log("=== STATES ===");
  (await q("SELECT state, COUNT(*) as cnt FROM customers WHERE state IS NOT NULL AND TRIM(state) != '' GROUP BY state ORDER BY cnt DESC LIMIT 10")).forEach(r => console.log(r.cnt, r.state));

  console.log("=== TOTAL ===");
  (await q("SELECT COUNT(*) as total FROM customers")).forEach(r => console.log(r.total));

  console.log("=== COLUMNS ===");
  (await q("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position")).forEach(r => console.log(r.column_name, '(' + r.data_type + ')'));

  await pool.end();
})();
