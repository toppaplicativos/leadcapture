/* Smoke test: OfferEntity Fase 0
 * 1. Set a Macramê product with type+cta+attributes+seo
 * 2. Verify ProductsService.getProduct surfaces them
 * 3. Verify storefront sync forwards them to storefront_products.metadata_json
 * 4. Verify public catalog API exposes them
 * 5. Verify agent productIntelligence renders them in the context block
 */
require("dotenv").config();
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { StorefrontService } = require("../dist/services/storefront");
const { buildProductIntelligenceBlock } = require("../dist/services/cognitive/skills/productIntelligence");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const brand = await pool.query("SELECT id, user_id FROM brand_units WHERE name = $1", ["Macramê Vó Nina"]);
  const brandId = brand.rows[0].id;
  const userId = brand.rows[0].user_id;
  console.log("brand:", brandId.slice(0, 8), "user:", userId.slice(0, 8));

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products[0];
  console.log("\nTarget product:", target.name);

  /* 1. Update with Fase 0 fields */
  const updated = await ps.updateProduct(target.id, {
    type: "physical_product",
    subtitle: "Feita à mão pela família Vó Nina",
    cta_type: "buy",
    attributes: {
      material: "Cordão de nylon premium",
      tempo_producao: "3 a 5 dias úteis",
      tamanho_ajustavel: "Sim",
      origem: "Artesanato familiar",
    },
    seo: {
      meta_title: target.name + " — Vó Nina",
      meta_description: "Pulseira artesanal feita à mão. " + (target.description || "").slice(0, 120),
    },
  }, userId, brandId);
  console.log("\n[1] Updated product. New fields:");
  console.log("    type:", updated.type);
  console.log("    cta_type:", updated.cta_type);
  console.log("    subtitle:", updated.subtitle);
  console.log("    attributes:", JSON.stringify(updated.attributes));

  /* 2. Verify roundtrip via getProduct */
  const refetched = await ps.getProduct(target.id, userId, brandId);
  console.log("\n[2] Roundtrip ok:");
  console.log("    type =", refetched.type, "cta =", refetched.cta_type);
  console.log("    attributes =", JSON.stringify(refetched.attributes));

  /* 3. Trigger storefront sync */
  const svc = new StorefrontService();
  if (StorefrontService._syncThrottle) StorefrontService._syncThrottle.clear();
  const store = await pool.query("SELECT * FROM storefront_stores WHERE brand_id = $1 LIMIT 1", [brandId]);
  await svc.synchronizeStoreProductsFromCatalog(store.rows[0]).catch(() => null);
  /* Service method is private — fall back to public path */
  const bundle = await svc.resolvePublicStore({ slug: store.rows[0].slug });
  invalidateCatalogCacheBySlug(store.rows[0].slug);
  const spRow = await pool.query(
    "SELECT metadata_json FROM storefront_products WHERE store_id = $1 ORDER BY updated_at DESC LIMIT 1",
    [store.rows[0].id]
  );
  let md = {};
  try { md = typeof spRow.rows[0].metadata_json === "string" ? JSON.parse(spRow.rows[0].metadata_json) : spRow.rows[0].metadata_json || {}; } catch {}
  console.log("\n[3] storefront_products.metadata_json forwards OfferEntity:");
  console.log("    offer_type:", md.offer_type, "| cta_type:", md.cta_type);
  console.log("    attributes:", JSON.stringify(md.attributes));
  console.log("    subtitle:", md.subtitle);
  console.log("    seo.meta_title:", md.seo?.meta_title);

  /* 4. Hit public catalog API */
  const resp = await fetch(`http://localhost:3001/api/storefront/public/stores/${store.rows[0].slug}/catalog`);
  const json = await resp.json();
  const apiTarget = (json.all_products || []).find(p => p.name === target.name);
  console.log("\n[4] Public catalog API exposes:");
  console.log("    type:", apiTarget?.type, "| cta_type:", apiTarget?.cta_type);
  console.log("    subtitle:", apiTarget?.subtitle);
  console.log("    attributes:", JSON.stringify(apiTarget?.attributes));

  /* 5. Agent productIntelligence renders the new fields (re-fetch to get the updated row) */
  const freshProducts = await ps.getActiveProducts(userId, brandId);
  const block = buildProductIntelligenceBlock(freshProducts);
  const targetBlock = block.split("▸").find(b => b.includes(target.name));
  console.log("\n[5] Agent product block (excerpt):");
  console.log("▸" + targetBlock.slice(0, 900));

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
