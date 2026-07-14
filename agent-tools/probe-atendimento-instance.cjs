/* Find Atendimento / 558596437477 and simulate list filters */
const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  for (const p of [
    path.join(process.cwd(), ".env"),
    "/root/leadcapture/.env",
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.trim().match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  });
  await c.connect();

  const phone = "558596437477";
  const hit = await c.query(
    `SELECT wi.id, wi.name, wi.phone, wi.status, wi.brand_id, wi.owner_type, wi.owner_actor_id, wi.created_by,
            bu.name AS brand_name, bu.slug AS brand_slug, bu.user_id AS brand_owner
     FROM whatsapp_instances wi
     LEFT JOIN brand_units bu ON bu.id = wi.brand_id
     WHERE wi.phone ILIKE $1 OR wi.phone ILIKE $2 OR wi.name ILIKE '%tendimento%'
     ORDER BY wi.created_at DESC`,
    [`%${phone}%`, `%${phone.slice(-11)}%`]
  );
  console.log("matches:", hit.rows.length);
  console.log(JSON.stringify(hit.rows, null, 2));

  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd"; // alhopronto
  const brand = await c.query(
    `SELECT id, name, slug, user_id FROM brand_units WHERE id = $1`,
    [brandId]
  );
  console.log("brand", brand.rows[0]);

  const owner = brand.rows[0]?.user_id;
  const all = await c.query(
    `SELECT name, phone, status, owner_type, owner_actor_id, brand_id, created_by
     FROM whatsapp_instances
     WHERE brand_id = $1
     ORDER BY created_at DESC`,
    [brandId]
  );
  console.log("\nall brand_id=alhopronto:", all.rows.length);
  all.rows.forEach((r) =>
    console.log(
      "-",
      r.name,
      r.phone || "no-phone",
      r.owner_type,
      "actor",
      String(r.owner_actor_id || "").slice(0, 8),
      r.status
    )
  );

  // Simulate affiliate filter for the Atendimento actor
  if (hit.rows[0]?.owner_actor_id) {
    const actor = hit.rows[0].owner_actor_id;
    const aff = await c.query(
      `SELECT name, phone, owner_type, owner_actor_id
       FROM whatsapp_instances
       WHERE brand_id = $1 AND owner_type = 'affiliate' AND owner_actor_id = $2`,
      [brandId, actor]
    );
    console.log("\naffiliate-only for Atendimento actor:", aff.rows.length);
    aff.rows.forEach((r) => console.log(" ", r.name, r.phone));
  }

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
