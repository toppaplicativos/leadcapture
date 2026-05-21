/* Smoke test Fase 1.5 (collections rail) + Fase 3.5 (variant-aware orders) */
require("dotenv").config();
const { Pool } = require("pg");
const { offerCatalogService } = require("../dist/services/offerCatalog");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { ProductsService } = require("../dist/services/products");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products.find((p) => p.name.includes("Alho Descascado Tipo A – 1kg (Dona de Casa)"));
  if (!target) { console.error("target missing"); process.exit(1); }

  /* 1. Create variants */
  console.log("=== Setup ===");
  const variants = await offerCatalogService.replaceVariants(target.id, [
    { name: "250g", attributes: { peso: "250g" }, price: 4.5, position: 0 },
    { name: "500g", attributes: { peso: "500g" }, price: 8.0, position: 1 },
    { name: "1kg", attributes: { peso: "1kg" }, price: 15.0, position: 2 },
  ]);
  console.log("variants:", variants.length);
  const col = await offerCatalogService.createCollection({
    name: "Smoke Collection",
    type: "manual",
    product_ids: [target.id, products[1].id],
  }, userId, brandId);
  console.log("collection created:", col.name, "products:", col.product_ids.length);

  /* 2. Verify public catalog returns variants + collections */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const catJson = await cat.json();
  const apiProduct = catJson.all_products.find((p) => p.name === target.name);
  console.log("\n=== Catalog API ===");
  console.log("variants exposed:", (apiProduct?.variants || []).length);
  console.log("collections exposed:", (catJson.collections || []).length);
  (catJson.collections || []).forEach((c) => console.log("  -", c.name, `(${c.product_ids.length} products)`));

  /* 3. Place an order picking the 500g variant */
  const storefrontProductId = apiProduct.id;
  const variant500g = (apiProduct.variants || []).find((v) => v.name === "500g");
  console.log("\n=== Placing order (500g variant) ===");
  const orderResp = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        product_id: storefrontProductId,
        quantity: 2,
        variant_id: variant500g.id,
        variant_name: variant500g.name,
        variant_attributes: variant500g.attributes,
      }],
      customer: {
        name: "Cliente Smoke",
        phone: "11999999999",
        email: "smoke@test.dev",
      },
      payment_method: "pix",
    }),
  });
  const orderJson = await orderResp.json();
  if (!orderResp.ok) {
    console.log("order failed:", JSON.stringify(orderJson));
  } else {
    console.log("order created:", orderJson.order?.order_number);
  }

  /* 4. Look up the order in commerce_order_items to verify variant info persisted */
  const orderRow = await pool.query(
    "SELECT i.product_id, i.quantidade, i.valor_unitario, i.metadata_json, i.nome FROM commerce_orders o INNER JOIN commerce_order_items i ON i.order_id = o.id WHERE o.numero = $1",
    [orderJson.order?.order_number]
  );
  console.log("\n=== Order items in DB ===");
  orderRow.rows.forEach((r) => {
    let md = r.metadata_json;
    if (typeof md === "string") { try { md = JSON.parse(md); } catch {} }
    console.log("  -", r.nome, "qty=", r.quantidade, "preço unit=", r.valor_unitario);
    console.log("    metadata.variant_name:", md?.variant_name);
    console.log("    metadata.variant_id:", md?.variant_id);
  });

  /* Cleanup */
  console.log("\n=== Cleanup ===");
  await offerCatalogService.replaceVariants(target.id, []);
  await offerCatalogService.deleteCollection(col.id, userId);
  if (orderJson.order?.order_number) {
    await pool.query("DELETE FROM commerce_order_items WHERE order_id IN (SELECT id FROM commerce_orders WHERE numero = $1)", [orderJson.order.order_number]);
    await pool.query("DELETE FROM commerce_orders WHERE numero = $1", [orderJson.order.order_number]);
    console.log("test order removed");
  }
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
