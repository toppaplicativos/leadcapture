/* Probe Alho Pronto WhatsApp instances on prod DB */
const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "dist", ".env"),
    "/root/leadcapture/.env",
  ];
  for (const p of candidates) {
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
  const cs =
    process.env.DATABASE_URL ||
    process.env.DB_URL ||
    process.env.POSTGRES_URL ||
    "";
  if (!cs) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const c = new Client({ connectionString: cs });
  await c.connect();

  const brands = await c.query(
    `SELECT id, name, slug, user_id
     FROM brand_units
     WHERE name ILIKE '%alho%' OR slug ILIKE '%alho%' OR name ILIKE '%pronto%'
     ORDER BY name`
  );
  console.log("brands found:", brands.rows.length);
  for (const b of brands.rows) {
    console.log("\n=== BRAND", b.name, "|", b.slug, "|", b.id, "| user", b.user_id);
    const byBrand = await c.query(
      `SELECT id, name, phone, status, brand_id, owner_type, owner_actor_id, created_by, created_at
       FROM whatsapp_instances WHERE brand_id = $1 ORDER BY created_at DESC`,
      [b.id]
    );
    console.log("by brand_id exact:", byBrand.rows.length);
    byBrand.rows.forEach((i) =>
      console.log(
        " ",
        i.name,
        i.status,
        i.owner_type,
        "actor",
        i.owner_actor_id,
        "created_by",
        i.created_by
      )
    );

    const byOwner = await c.query(
      `SELECT wi.id, wi.name, wi.status, wi.brand_id, bu.name AS brand_name, wi.owner_type, wi.created_by
       FROM whatsapp_instances wi
       LEFT JOIN brand_units bu ON bu.id = wi.brand_id
       WHERE wi.created_by = $1
       ORDER BY wi.created_at DESC`,
      [b.user_id]
    );
    console.log("by created_by=brand.user_id:", byOwner.rows.length);
    byOwner.rows.forEach((i) =>
      console.log(" ", i.name, i.status, i.owner_type, "brand=", i.brand_name || i.brand_id || "NULL")
    );

    const filterNow = await c.query(
      `SELECT id, name, status, brand_id, owner_type, created_by
       FROM whatsapp_instances wi
       WHERE (wi.brand_id = $1 OR (wi.brand_id IS NULL AND wi.created_by = $2))
       ORDER BY created_at DESC`,
      [b.id, b.user_id]
    );
    console.log("current API filter would return:", filterNow.rows.length);
  }

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
