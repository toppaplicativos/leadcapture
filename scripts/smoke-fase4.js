/* Smoke test Fase 4: configurator end-to-end */
require("dotenv").config();
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { resolveConfigurator } = require("../dist/services/configuratorEngine");
const { cognitiveAgent } = require("../dist/services/cognitive");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  /* Pick a product to convert into pizza-style configurable */
  const target = products[0];

  /* 1. Set configurator: Tamanho (required, 1) + Sabores (1-3) + Borda (0-1) */
  console.log("=== [1] Configure", target.name, "with configurator ===");
  await ps.updateProduct(target.id, {
    type: "food",
    cta_type: "buy",
    configurator: {
      enabled: true,
      groups: [
        {
          id: "size", name: "Tamanho",
          required: true, min_select: 1, max_select: 1, position: 0,
          options: [
            { id: "p", name: "Pequena (4 fatias)", price_delta: 0 },
            { id: "m", name: "Média (6 fatias)", price_delta: 10 },
            { id: "g", name: "Grande (8 fatias)", price_delta: 20 },
          ],
        },
        {
          id: "flavors", name: "Sabores",
          required: true, min_select: 1, max_select: 3, position: 1,
          options: [
            { id: "mussarela", name: "Mussarela", price_delta: 0 },
            { id: "calabresa", name: "Calabresa", price_delta: 5 },
            { id: "frango", name: "Frango c/ Catupiry", price_delta: 7 },
            { id: "portuguesa", name: "Portuguesa", price_delta: 8 },
          ],
        },
        {
          id: "borda", name: "Borda recheada",
          required: false, min_select: 0, max_select: 1, position: 2,
          options: [
            { id: "catupiry", name: "Catupiry", price_delta: 8 },
            { id: "cheddar", name: "Cheddar", price_delta: 8 },
          ],
        },
      ],
    },
  }, userId, brandId);
  console.log("  configurator set");

  /* 2. Verify catalog API exposes configurator */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const j = await cat.json();
  const apiProduct = j.all_products.find(p => p.name === target.name);
  console.log("\n=== [2] Public catalog ===");
  console.log("  configurator.enabled:", apiProduct?.configurator?.enabled);
  console.log("  groups:", (apiProduct?.configurator?.groups || []).map(g => `${g.name}(${g.options.length} opts)`).join(", "));

  /* 3. Engine validation tests */
  console.log("\n=== [3] Engine validation ===");
  const cfg = apiProduct.configurator;
  /* OK: Média + Calabresa + Mussarela + Catupiry */
  const r1 = resolveConfigurator(cfg, [
    { group_id: "size", option_ids: ["m"] },
    { group_id: "flavors", option_ids: ["calabresa", "mussarela"] },
    { group_id: "borda", option_ids: ["catupiry"] },
  ]);
  console.log("  combo válido: price_delta=", r1.price_delta_total, "summary=", r1.summary);

  /* FAIL: missing required group "size" */
  try {
    resolveConfigurator(cfg, [{ group_id: "flavors", option_ids: ["mussarela"] }]);
    console.log("  combo sem tamanho: PASSOU (NÃO DEVIA)");
  } catch (e) {
    console.log("  combo sem tamanho: rejeitado corretamente — \"" + e.message + "\"");
  }

  /* FAIL: too many flavors */
  try {
    resolveConfigurator(cfg, [
      { group_id: "size", option_ids: ["m"] },
      { group_id: "flavors", option_ids: ["mussarela", "calabresa", "frango", "portuguesa"] },
    ]);
    console.log("  4 sabores: PASSOU (NÃO DEVIA)");
  } catch (e) {
    console.log("  4 sabores: rejeitado — \"" + e.message + "\"");
  }

  /* 4. End-to-end order with configurator */
  console.log("\n=== [4] Order with configurator ===");
  const orderResp = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        product_id: apiProduct.id,
        quantity: 1,
        configurator_selections: [
          { group_id: "size", option_ids: ["g"] },          // +20
          { group_id: "flavors", option_ids: ["calabresa", "frango"] },  // +5 +7
          { group_id: "borda", option_ids: ["catupiry"] },  // +8
        ],
      }],
      customer: { name: "Pizza Test", phone: "11999990123", email: "pizza@test.dev" },
      payment_method: "pix",
    }),
  });
  const orderJson = await orderResp.json();
  if (!orderResp.ok) {
    console.log("  order failed:", JSON.stringify(orderJson));
  } else {
    console.log("  order:", orderJson.order?.order_number, "| total expected delta=40 over base");
  }

  /* 5. Agent context */
  console.log("\n=== [5] Agent reasoning ===");
  const r = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-fase4-" + Date.now(),
    incomingMessage: `quero a ${apiProduct.name.toLowerCase()} média com calabresa e mussarela. tem borda recheada?`,
    conversationHistory: [],
    lastOutgoingMessages: [],
  });
  console.log("  reply:", r.text.slice(0, 400));

  /* Cleanup */
  console.log("\n=== Cleanup ===");
  await ps.updateProduct(target.id, { configurator: { enabled: false, groups: [] } }, userId, brandId);
  if (orderJson.order?.order_number) {
    await pool.query("DELETE FROM commerce_order_items WHERE order_id IN (SELECT id FROM commerce_orders WHERE numero = $1)", [orderJson.order.order_number]).catch(() => {});
    await pool.query("DELETE FROM commerce_orders WHERE numero = $1", [orderJson.order.order_number]).catch(() => {});
  }
  console.log("  done");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
