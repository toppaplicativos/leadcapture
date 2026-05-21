/* Smoke test for Bug 2 — PUT /api/products/:id must persist ALL OfferEntity fields.
 * Mints a JWT locally (default dev secret) and hits the deployed API.
 *
 * Run: node scripts/smoke-bug-fixes.js
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";

(async () => {
  /* Fetch user email for JWT payload */
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  if (!u.rows.length) { console.error("user not found"); process.exit(1); }
  const user = u.rows[0];

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role || "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("=== Smoke Bug 2: PUT /api/products/:id ===");
  console.log("  user:", user.email, "/ jwt minted");

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(USER_ID, BRAND_ID);
  if (products.length === 0) { console.error("no products to test"); process.exit(1); }
  const target = products[0];
  console.log("  target product:", target.id, "-", target.name);

  /* Snapshot original — restore at end so we don't leave junk in production */
  const before = {
    type: target.type, subtitle: target.subtitle, cta_type: target.cta_type,
    attributes: target.attributes, seo: target.seo,
    service_config: target.service_config, configurator: target.configurator,
    bundle_items: target.bundle_items,
  };

  const headers = {
    "content-type": "application/json",
    "authorization": `Bearer ${token}`,
    "x-brand-id": BRAND_ID,
  };

  const stamp = Date.now();
  const payload = {
    name: target.name,
    category: target.category,
    price: target.price,
    type: "physical_product",
    subtitle: `[smoke ${stamp}] subtitle ok`,
    cta_type: "buy",
    attributes: { _smoke_test: String(stamp) },
    seo: { meta_title: `[smoke ${stamp}]` },
    service_config: { _smoke: stamp },
    configurator: { enabled: false, groups: [] },
    bundle_items: [],
  };

  const r = await fetch(`${BASE_URL}/api/products/${target.id}`, {
    method: "PUT", headers, body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("PUT failed:", r.status, d); process.exit(1); }
  console.log("  PUT 200, server returned id:", d.product?.id);

  /* Read back via service (bypasses any HTTP cache) */
  const after = await ps.getProduct(target.id, USER_ID, BRAND_ID);
  const checks = [
    ["subtitle includes stamp", String(after.subtitle || "").includes(String(stamp))],
    ["attributes._smoke_test set", String(after.attributes?._smoke_test || "") === String(stamp)],
    ["seo.meta_title includes stamp", String(after.seo?.meta_title || "").includes(String(stamp))],
    ["service_config._smoke set", String(after.service_config?._smoke || "") === String(stamp)],
    ["cta_type = buy", after.cta_type === "buy"],
    ["type = physical_product", after.type === "physical_product"],
  ];
  let passed = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (ok) passed++;
  }

  /* Restore original */
  await ps.updateProduct(target.id, before, USER_ID, BRAND_ID);
  console.log("  restored original values");

  await pool.end();
  if (passed === checks.length) {
    console.log(`\nALL ${checks.length} CHECKS PASSED`);
    process.exit(0);
  } else {
    console.log(`\n${passed}/${checks.length} passed`);
    process.exit(1);
  }
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
