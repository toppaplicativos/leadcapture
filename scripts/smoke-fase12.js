/* Smoke test Fase 12 — inventory cycle end-to-end
 *
 * Scenarios:
 *   1. Set stock=3 on a test product → verify status=in_stock (or low_stock if threshold=5)
 *   2. Create order qty=1 → verify stock=2 + movement recorded
 *   3. Create another order qty=2 → verify stock=0 + status=out_of_stock
 *   4. Try to create one more qty=1 → must fail with 409 INSUFFICIENT_STOCK
 *   5. Cancel one of the orders → verify stock returns + status flips back
 *   6. Restore product to original stock_quantity (cleanup)
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { productStockService } = require("../dist/services/productStock");
const { commerceService } = require("../dist/services/commerce");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";

function pass(label) { console.log(`  PASS  ${label}`); return 1; }
function fail(label, extra) { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`); return 0; }

(async () => {
  let passed = 0, total = 0;
  const ps = new ProductsService();

  /* Fetch user for JWT */
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  const user = u.rows[0];
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role || "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  const headers = {
    "content-type": "application/json",
    "authorization": `Bearer ${token}`,
    "x-brand-id": BRAND_ID,
  };

  /* Pick a test product */
  const products = await ps.getActiveProducts(USER_ID, BRAND_ID);
  if (products.length === 0) { console.error("no products"); process.exit(1); }
  const target = products.find(p => Number(p.price) > 0) || products[0];
  console.log("=== Fase 12 smoke: full inventory cycle ===");
  console.log("  product:", target.id, "-", target.name, "@ R$", target.price);
  const beforeQty = target.stock_quantity;
  const beforeThr = target.stock_threshold_low;
  console.log("  original stock_quantity:", beforeQty, "/ threshold:", beforeThr);

  /* 1. Set stock=3 + threshold=10 → low_stock (3 <= 10) */
  console.log("\n[1] Set stock_quantity=3, threshold=10");
  await ps.updateProduct(target.id, { stock_quantity: 3, stock_threshold_low: 10 }, USER_ID, BRAND_ID);
  let lvl = await productStockService.getStock(target.id);
  total++; (lvl.quantity === 3) ? passed += pass("stock=3 after update") : fail("stock not 3", `got ${lvl.quantity}`);
  total++; (lvl.status === "low_stock") ? passed += pass("status=low_stock") : fail("status wrong", `got ${lvl.status}`);

  /* 2. Order qty=1 via HTTP — verify decrement + movement */
  console.log("\n[2] POST /api/commerce/orders qty=1");
  const r2 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      itens: [{ product_id: target.id, quantidade: 1, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d2 = await r2.json();
  total++; r2.ok ? passed += pass(`order 1 created (${d2.order?.id?.slice(0,8)})`) : fail(`order failed: ${r2.status}`, JSON.stringify(d2).slice(0,200));
  const order1Id = d2.order?.id;
  lvl = await productStockService.getStock(target.id);
  total++; (lvl.quantity === 2) ? passed += pass("stock decremented to 2") : fail("stock not 2", `got ${lvl.quantity}`);
  const movs1 = await productStockService.listMovements(target.id, 5);
  total++; (movs1.find(m => m.order_id === order1Id && m.reason === "order:created" && m.delta === -1))
    ? passed += pass("movement recorded for order 1") : fail("movement missing", JSON.stringify(movs1[0] || {}));

  /* 3. Order qty=2 — verify hits 0 + out_of_stock */
  console.log("\n[3] POST order qty=2 — should empty stock");
  const r3 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      itens: [{ product_id: target.id, quantidade: 2, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d3 = await r3.json();
  total++; r3.ok ? passed += pass(`order 2 created (${d3.order?.id?.slice(0,8)})`) : fail(`order failed: ${r3.status}`, JSON.stringify(d3).slice(0,200));
  const order2Id = d3.order?.id;
  lvl = await productStockService.getStock(target.id);
  total++; (lvl.quantity === 0) ? passed += pass("stock at 0") : fail("stock not 0", `got ${lvl.quantity}`);
  total++; (lvl.status === "out_of_stock") ? passed += pass("status=out_of_stock") : fail("status wrong", `got ${lvl.status}`);

  /* 4. Try one more — must 409 */
  console.log("\n[4] POST order qty=1 — must 409 INSUFFICIENT_STOCK");
  const r4 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      itens: [{ product_id: target.id, quantidade: 1, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d4 = await r4.json();
  total++; (r4.status === 409 && d4.code === "INSUFFICIENT_STOCK")
    ? passed += pass("409 with INSUFFICIENT_STOCK code") : fail(`expected 409, got ${r4.status}`, JSON.stringify(d4).slice(0,200));

  /* 5. Cancel order 2 (qty=2) — stock should jump from 0 back to 2 */
  console.log("\n[5] PATCH order 2 → cancelado — stock should release");
  const r5 = await fetch(`${BASE_URL}/api/commerce/orders/${order2Id}/status`, {
    method: "PATCH", headers,
    body: JSON.stringify({ status_pedido: "cancelado" }),
  });
  const d5 = await r5.json();
  total++; r5.ok ? passed += pass("order cancelled") : fail(`cancel failed: ${r5.status}`, JSON.stringify(d5).slice(0,200));
  lvl = await productStockService.getStock(target.id);
  total++; (lvl.quantity === 2) ? passed += pass("stock back to 2") : fail("stock not 2 after cancel", `got ${lvl.quantity}`);
  const movs2 = await productStockService.listMovements(target.id, 5);
  total++; (movs2.find(m => m.order_id === order2Id && m.reason === "order:cancelled"))
    ? passed += pass("cancellation movement recorded") : fail("cancel movement missing");

  /* 6. Cleanup: restore original stock + cancel order 1 + delete movements */
  console.log("\n[6] Cleanup");
  if (order1Id) {
    await fetch(`${BASE_URL}/api/commerce/orders/${order1Id}/status`, {
      method: "PATCH", headers,
      body: JSON.stringify({ status_pedido: "cancelado" }),
    }).catch(() => {});
  }
  await ps.updateProduct(target.id, {
    stock_quantity: beforeQty,
    stock_threshold_low: beforeThr || 5,
  }, USER_ID, BRAND_ID);
  /* Optionally clean smoke movements to keep stock_movements table tidy */
  await pool.query("DELETE FROM stock_movements WHERE order_id = $1 OR order_id = $2", [order1Id, order2Id]).catch(() => {});
  console.log("  restored to original");

  await pool.end();
  console.log(`\n${passed}/${total} CHECKS PASSED`);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
