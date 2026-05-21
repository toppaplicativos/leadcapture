/* Smoke test Fase 11: bundles end-to-end */
require("dotenv").config();
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { cognitiveAgent } = require("../dist/services/cognitive");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products.find(p => p.name.includes("Alho Descascado Tipo A – 1kg (Dona de Casa)"));
  const item1 = products.find(p => p.name.includes("Pasta de Alho com Sal 500g") && p.name.includes("Dona de Casa"));
  const item2 = products.find(p => p.name.includes("Pasta de Alho Saborizada Chimichurri 500g") && p.name.includes("Dona de Casa"));
  if (!target || !item1 || !item2) { console.error("missing products"); process.exit(1); }

  /* 1. Configure target as a bundle */
  console.log("=== [1] Converting", target.name, "→ bundle ===");
  await ps.updateProduct(target.id, {
    type: "bundle",
    subtitle: "Kit cozinheiro: alho + pasta + chimichurri",
    bundle_items: [
      { product_id: target.id, quantity: 1, note: "Alho descascado 1kg" },
      { product_id: item1.id, quantity: 1, note: "Pasta de alho com sal" },
      { product_id: item2.id, quantity: 1, note: "Chimichurri" },
    ],
  }, userId, brandId);
  console.log("  bundle saved with 3 items");

  /* 2. Verify catalog API */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const j = await cat.json();
  const apiProduct = j.all_products.find(p => p.name === target.name);
  console.log("\n=== [2] Public catalog ===");
  console.log("  type:", apiProduct?.type);
  console.log("  bundle_items count:", (apiProduct?.bundle_items || []).length);
  (apiProduct?.bundle_items || []).forEach(bi => {
    const found = j.all_products.find(p => p.id === bi.product_id);
    console.log("  -", bi.quantity + "x", bi.note || "(no note)", "| resolves to:", found?.name || "MISSING");
  });

  /* 3. Agent reply */
  console.log("\n=== [3] Agent reasoning ===");
  const r = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-fase11-" + Date.now(),
    incomingMessage: `o que tem nesse kit cozinheiro? vale a pena?`,
    conversationHistory: [],
    lastOutgoingMessages: [],
  });
  console.log("  reply:", r.text.slice(0, 500));

  /* Cleanup */
  console.log("\n=== Cleanup ===");
  await ps.updateProduct(target.id, { type: "food", subtitle: null, bundle_items: [] }, userId, brandId);
  console.log("  reverted");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
