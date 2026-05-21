/* Smoke test Fase 1: Variants & Collections
 * Tests against the Alho Pronto brand which has Gemini key configured.
 */
require("dotenv").config();
const { Pool } = require("pg");
const { offerCatalogService } = require("../dist/services/offerCatalog");
const { cognitiveAgent } = require("../dist/services/cognitive");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { ProductsService } = require("../dist/services/products");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  /* Pick an "Alho descascado" product to add weight variants */
  const target = products.find((p) => p.name.includes("Alho Descascado Tipo A") && p.name.includes("1kg") && p.name.includes("Dona de Casa"));
  if (!target) { console.error("target product not found"); process.exit(1); }
  console.log("target:", target.name, "id:", target.id);

  /* 1. Replace variants */
  console.log("\n=== [1] Set 3 weight variants ===");
  const variants = await offerCatalogService.replaceVariants(target.id, [
    { name: "250g", sku: "ALHO-DC-250", attributes: { peso: "250g" }, price: 4.5, stock_quantity: 50, position: 0 },
    { name: "500g", sku: "ALHO-DC-500", attributes: { peso: "500g" }, price: 8.0, stock_quantity: 30, position: 1 },
    { name: "1kg", sku: "ALHO-DC-1KG", attributes: { peso: "1kg" }, price: 15.0, stock_quantity: 20, position: 2 },
  ]);
  variants.forEach((v) => console.log(`  - ${v.name}: R$${v.price} | sku=${v.sku} | stock=${v.stock_quantity}`));

  /* 2. Create a manual collection */
  console.log("\n=== [2] Create manual collection ===");
  const col = await offerCatalogService.createCollection(
    {
      name: "Alho do Dia",
      description: "Os mais saídos pra dona de casa",
      type: "manual",
      product_ids: [target.id, ...products.filter((p) => p.name.includes("Dona de Casa")).slice(0, 2).map((p) => p.id)],
      position: 0,
    },
    userId,
    brandId
  );
  console.log(`  created: ${col.name} (${col.id}) with ${col.product_ids.length} products`);

  /* 3. Verify public catalog API exposes both */
  invalidateCatalogCacheBySlug("alho-pronto");
  /* Find the correct slug for Alho Pronto brand dc8f901e */
  const stores = await pool.query("SELECT slug FROM storefront_stores WHERE brand_id = $1", [brandId]);
  const slug = stores.rows[0]?.slug;
  console.log("\n=== [3] Public /catalog response ===");
  console.log("store slug:", slug);
  invalidateCatalogCacheBySlug(slug);
  const resp = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const json = await resp.json();
  const apiProduct = (json.all_products || []).find((p) => p.name === target.name);
  console.log("  product variants:", apiProduct?.variants?.length || 0);
  (apiProduct?.variants || []).forEach((v) => console.log(`    - ${v.name}: R$${v.price}`));
  console.log("  collections returned:", (json.collections || []).length);
  (json.collections || []).forEach((c) => console.log(`    - ${c.name} (${c.product_ids.length} products)`));

  /* 4. Agent test — ask about variants */
  console.log("\n=== [4] Agent reads variants ===");
  const ask = "qual a diferença entre o alho de 250g e o de 1kg? preço e pra quem é cada um?";
  console.log("Q:", ask);
  const r = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-fase1-" + Date.now(),
    incomingMessage: ask,
    conversationHistory: [],
    lastOutgoingMessages: [],
  });
  console.log("\nA:", r.text);

  /* 5. Cleanup */
  console.log("\n=== cleanup ===");
  await offerCatalogService.replaceVariants(target.id, []);
  await offerCatalogService.deleteCollection(col.id, userId);
  console.log("  variants and collection removed");

  await pool.end();
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
