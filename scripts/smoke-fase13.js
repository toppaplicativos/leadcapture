/* Smoke test Fase 13 — coupon end-to-end cycle
 *
 * Scenarios:
 *   1. Admin POST /api/coupons → create cupom SMOKE13 = 10% off, min R$ 50
 *   2. Public POST /coupons/validate sem produto → must return valid=false (below_min_subtotal) for R$ 30
 *   3. Public POST /coupons/validate → must return valid=true + discount=R$5 for R$ 50
 *   4. POST /api/commerce/orders with cupom_codigo=SMOKE13 — verify desconto applied + redemption recorded + used_count++
 *   5. Try same cupom again (usage_limit_per_customer=1, same customer_phone) → must 400 COUPON_INVALID customer_limit_reached
 *   6. POST order with invalid code → 400 COUPON_INVALID not_found
 *   7. Cleanup: cancel orders + delete cupom
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { couponsService } = require("../dist/services/coupons");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const STORE_SLUG = "alhopronto";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";
const TEST_PHONE = "+5599999999999";

function pass(label) { console.log(`  PASS  ${label}`); return 1; }
function fail(label, extra) { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`); return 0; }

(async () => {
  let passed = 0, total = 0;
  const ps = new ProductsService();

  /* JWT */
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  const user = u.rows[0];
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role || "user" }, JWT_SECRET, { expiresIn: "1h" });
  const headers = { "content-type": "application/json", "authorization": `Bearer ${token}`, "x-brand-id": BRAND_ID };

  const products = await ps.getActiveProducts(USER_ID, BRAND_ID);
  const target = products.find(p => Number(p.price) >= 15) || products[0];
  console.log("=== Fase 13 smoke: coupon cycle ===");
  console.log("  product:", target.id, "-", target.name, "@ R$", target.price);

  /* Pre-clean any previous SMOKE13 cupom */
  await pool.query(`DELETE FROM coupon_redemptions WHERE coupon_id IN (SELECT id FROM coupons WHERE code = 'SMOKE13')`).catch(()=>{});
  await pool.query(`DELETE FROM coupons WHERE code = 'SMOKE13'`).catch(()=>{});

  /* 1. Admin POST /api/coupons */
  console.log("\n[1] Create cupom SMOKE13 = 10% off, min R$50, limit_per_customer=1");
  const r1 = await fetch(`${BASE_URL}/api/coupons`, {
    method: "POST", headers,
    body: JSON.stringify({
      code: "SMOKE13",
      description: "Smoke test 10% off",
      discount_type: "percentage",
      discount_value: 10,
      min_subtotal: 50,
      applies_to: "all",
      usage_limit_per_customer: 1,
    }),
  });
  const d1 = await r1.json();
  total++; r1.ok ? passed += pass(`cupom created ${d1.coupon?.code}`) : fail(`create failed: ${r1.status}`, JSON.stringify(d1).slice(0,200));
  const couponId = d1.coupon?.id;

  /* 2. Public validate R$30 — below min */
  console.log("\n[2] Public validate R$30 — must reject (below_min_subtotal)");
  const r2 = await fetch(`${BASE_URL}/api/storefront/public/stores/${STORE_SLUG}/coupons/validate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "SMOKE13", subtotal: 30 }),
  });
  const d2 = await r2.json();
  total++; (!d2.valid && d2.reason_code === "below_min_subtotal") ? passed += pass(`rejected R$30: ${d2.reason}`) : fail("expected rejection", JSON.stringify(d2));

  /* 3. Public validate R$50 — applies, discount=R$5 */
  console.log("\n[3] Public validate R$50 — must accept, discount R$5");
  const r3 = await fetch(`${BASE_URL}/api/storefront/public/stores/${STORE_SLUG}/coupons/validate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "SMOKE13", subtotal: 50 }),
  });
  const d3 = await r3.json();
  total++; (d3.valid && Math.abs(d3.discount_amount - 5) < 0.01 && Math.abs(d3.final_total - 45) < 0.01)
    ? passed += pass(`accepted: -R$${d3.discount_amount} → R$${d3.final_total}`) : fail("wrong discount", JSON.stringify(d3));

  /* 4. Create order qty=4 (R$60) com cupom */
  const qty4 = Math.ceil(50 / Number(target.price));
  const subtotalExpected = qty4 * Number(target.price);
  const discountExpected = Math.round(subtotalExpected * 0.1 * 100) / 100;
  const totalExpected = subtotalExpected - discountExpected;
  console.log(`\n[4] POST order qty=${qty4} (R$${subtotalExpected}) com cupom — espera desconto R$${discountExpected}`);
  const r4 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      cupom_codigo: "SMOKE13",
      customer_phone: TEST_PHONE,
      itens: [{ product_id: target.id, quantidade: qty4, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d4 = await r4.json();
  total++; r4.ok ? passed += pass(`order created (${d4.order?.id?.slice(0,8)})`) : fail(`order failed: ${r4.status}`, JSON.stringify(d4).slice(0,300));
  const order1Id = d4.order?.id;
  total++; (Math.abs(Number(d4.order?.desconto) - discountExpected) < 0.01) ? passed += pass(`desconto=${d4.order?.desconto}`) : fail(`wrong desconto`, `got ${d4.order?.desconto}`);
  total++; (Math.abs(Number(d4.order?.valor_total) - totalExpected) < 0.01) ? passed += pass(`valor_total=${d4.order?.valor_total}`) : fail(`wrong total`, `got ${d4.order?.valor_total}`);
  /* Verify redemption recorded */
  const redempt = await pool.query(`SELECT discount_applied FROM coupon_redemptions WHERE order_id = $1`, [order1Id]);
  total++; (redempt.rows.length === 1 && Math.abs(Number(redempt.rows[0].discount_applied) - discountExpected) < 0.01)
    ? passed += pass("redemption recorded") : fail("redemption missing/wrong", JSON.stringify(redempt.rows));
  /* Verify used_count incremented */
  const usedAfter = await pool.query(`SELECT used_count FROM coupons WHERE id = $1`, [couponId]);
  total++; (Number(usedAfter.rows[0].used_count) === 1) ? passed += pass("used_count=1") : fail(`used_count wrong`, `got ${usedAfter.rows[0].used_count}`);

  /* 5. Try same cupom again same customer → 400 customer_limit_reached */
  console.log("\n[5] POST order com cupom novamente — mesmo cliente, deve 400 customer_limit_reached");
  const r5 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      cupom_codigo: "SMOKE13",
      customer_phone: TEST_PHONE,
      itens: [{ product_id: target.id, quantidade: qty4, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d5 = await r5.json();
  total++; (r5.status === 400 && d5.code === "COUPON_INVALID" && d5.reason_code === "customer_limit_reached")
    ? passed += pass(`400 customer_limit_reached: ${d5.error}`) : fail(`expected 400 customer_limit`, `got ${r5.status} ${JSON.stringify(d5).slice(0,200)}`);

  /* 6. Cupom inexistente → 400 not_found */
  console.log("\n[6] POST order com cupom inexistente — 400 not_found");
  const r6 = await fetch(`${BASE_URL}/api/commerce/orders`, {
    method: "POST", headers,
    body: JSON.stringify({
      origem: "checkout_web",
      cupom_codigo: "NAOEXISTE99",
      customer_phone: "+5588888888888",
      itens: [{ product_id: target.id, quantidade: qty4, nome: target.name, valor_unitario: target.price }],
    }),
  });
  const d6 = await r6.json();
  total++; (r6.status === 400 && d6.code === "COUPON_INVALID" && d6.reason_code === "not_found")
    ? passed += pass(`400 not_found`) : fail(`expected 400 not_found`, `got ${r6.status} ${JSON.stringify(d6).slice(0,200)}`);

  /* 7. Cleanup */
  console.log("\n[7] Cleanup");
  if (order1Id) {
    await fetch(`${BASE_URL}/api/commerce/orders/${order1Id}/status`, {
      method: "PATCH", headers,
      body: JSON.stringify({ status_pedido: "cancelado" }),
    }).catch(() => {});
  }
  await pool.query(`DELETE FROM coupon_redemptions WHERE coupon_id = $1`, [couponId]).catch(()=>{});
  await pool.query(`DELETE FROM coupons WHERE id = $1`, [couponId]).catch(()=>{});
  console.log("  done");

  await pool.end();
  console.log(`\n${passed}/${total} CHECKS PASSED`);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
