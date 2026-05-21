require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const brandName = "Macramê Vó Nina";
  const testSlogan = "Pulseiras artesanais com a alma da Vó Nina";

  await pool.query("UPDATE brand_units SET slogan = $1 WHERE name = $2", [testSlogan, brandName]);
  console.log("brand_units.slogan set to:", testSlogan);

  const r = await pool.query("SELECT id FROM brand_units WHERE name = $1", [brandName]);
  const brandId = r.rows[0].id;

  /* Trigger storefront sync via service */
  const { StorefrontService } = require("../dist/services/storefront");
  const svc = new StorefrontService();
  const s = await pool.query("SELECT * FROM storefront_stores WHERE brand_id = $1 LIMIT 1", [brandId]);
  const store = s.rows[0];

  /* synchronizeStoreBrandIdentity is private — go through public path */
  /* Reset throttle to force sync */
  if (StorefrontService._syncThrottle) StorefrontService._syncThrottle.clear();
  const bundle = await svc.resolvePublicStore({ slug: store.slug });
  console.log("resolvePublicStore done. bundle.store.brand.slogan =", JSON.stringify(bundle?.store?.brand?.slogan));

  /* Now invalidate catalog cache and inspect what the API would return */
  const catalogResponse = await fetch(`http://localhost:3001/api/storefront/public/stores/${store.slug}/catalog`);
  const json = await catalogResponse.json();
  console.log("catalog API brand.slogan =", JSON.stringify(json?.store?.brand?.slogan));

  await pool.end();
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
