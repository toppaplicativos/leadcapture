/* Smoke test Fase 6: product relations + SEO */
require("dotenv").config();
const { Pool } = require("pg");
const { productRelationsService } = require("../dist/services/offerCatalog");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { ProductsService } = require("../dist/services/products");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  /* Verify table exists */
  const tab = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'product_relations'");
  console.log("[0] product_relations table:", tab.rowCount ? "OK" : "MISSING");

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products[0];
  const related1 = products[1];
  const related2 = products[2];

  /* 1. Set 2 relations + SEO */
  console.log("\n=== [1] Set relations + SEO on", target.name, "===");
  await productRelationsService.replaceRelations(target.id, [
    { related_product_id: related1.id, type: "related", position: 0 },
    { related_product_id: related2.id, type: "related", position: 1 },
  ]);
  await ps.updateProduct(target.id, {
    seo: {
      meta_title: "Alho de qualidade premium — Alho Pronto",
      meta_description: "Pacotes de alho descascado prontos para uso. Padronizado, fresco e selecionado.",
    },
  }, userId, brandId);
  console.log("  set 2 relations + seo meta");

  /* 2. Public catalog API exposes both */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const j = await cat.json();
  const apiProduct = j.all_products.find(p => p.name === target.name);
  console.log("\n=== [2] Public catalog ===");
  console.log("  related_product_ids:", apiProduct?.related_product_ids);
  console.log("  seo.meta_title:", apiProduct?.seo?.meta_title);
  console.log("  seo.meta_description:", apiProduct?.seo?.meta_description);
  /* Verify the related IDs resolve to real products in the catalog */
  const relatedFound = (apiProduct?.related_product_ids || []).map(id => j.all_products.find(p => p.id === id)?.name);
  console.log("  resolved related names:", relatedFound);

  /* Cleanup */
  console.log("\n=== Cleanup ===");
  await productRelationsService.replaceRelations(target.id, []);
  await ps.updateProduct(target.id, { seo: {} }, userId, brandId);
  console.log("  reverted");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
