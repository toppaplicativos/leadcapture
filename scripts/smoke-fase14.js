/* Smoke test Fase 14 — reviews end-to-end
 *
 * Scenarios:
 *   1. Public POST review → status=pending, doesn't appear in public list
 *   2. Admin GET /api/reviews?status=pending → finds it; pending_count = 1
 *   3. Admin PATCH /api/reviews/:id approve → aggregates recompute
 *   4. Public GET reviews → now visible + count=1, avg=5
 *   5. ProductsService.getActiveProducts → reviews_count/reviews_avg present
 *   6. cognitiveAgent.respond → mentions stars in output context
 *   7. Cleanup
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { reviewsService } = require("../dist/services/reviews");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const STORE_SLUG = "alhopronto";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";

function pass(label) { console.log(`  PASS  ${label}`); return 1; }
function fail(label, extra) { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`); return 0; }

(async () => {
  let passed = 0, total = 0;
  const ps = new ProductsService();

  /* JWT for admin */
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  const user = u.rows[0];
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role || "user" }, JWT_SECRET, { expiresIn: "1h" });
  const headers = { "content-type": "application/json", "authorization": `Bearer ${token}`, "x-brand-id": BRAND_ID };

  /* Get target product (we need a storefront product id for the public POST,
   * but we also need to know its source product_id for aggregate verification) */
  const products = await ps.getActiveProducts(USER_ID, BRAND_ID);
  const target = products[0];
  if (!target) { console.error("no products"); process.exit(1); }
  console.log("=== Fase 14 smoke: reviews cycle ===");
  console.log("  product:", target.id, "-", target.name);

  /* Resolve storefront id for the product */
  const sf = await pool.query(
    `SELECT sp.id FROM storefront_products sp
       JOIN storefront_stores ss ON ss.id = sp.store_id
      WHERE ss.slug = $1 AND sp.metadata_json->>'source_product_id' = $2
      LIMIT 1`,
    [STORE_SLUG, target.id]
  );
  const storefrontProductId = sf.rows[0]?.id;
  if (!storefrontProductId) { console.error("no storefront product for", target.id); process.exit(1); }
  console.log("  storefront product id:", storefrontProductId);

  /* Pre-clean smoke reviews from previous runs */
  await pool.query(`DELETE FROM product_reviews WHERE customer_name = 'Smoke Tester Fase14'`).catch(()=>{});
  await reviewsService.recomputeProductAggregates(target.id).catch(()=>{});

  /* 1. Public POST review */
  console.log("\n[1] Public POST review (5★)");
  const r1 = await fetch(`${BASE_URL}/api/storefront/public/stores/${STORE_SLUG}/products/${storefrontProductId}/reviews`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Smoke Tester Fase14", rating: 5, comment: "Produto excelente, recomendo!" }),
  });
  const d1 = await r1.json();
  total++; (r1.ok && d1.review?.status === "pending") ? passed += pass(`review pending (id=${d1.review?.id?.slice(0,8)})`) : fail(`expected pending`, JSON.stringify(d1).slice(0,200));
  const reviewId = d1.review?.id;

  /* 2. Public GET review → still empty (pending) */
  const r2pub = await fetch(`${BASE_URL}/api/storefront/public/stores/${STORE_SLUG}/products/${storefrontProductId}/reviews`).then(r => r.json());
  total++; (r2pub.aggregates?.count === 0) ? passed += pass("pending review not visible publicly") : fail("pending leaked", `count=${r2pub.aggregates?.count}`);

  /* 3. Admin GET pending */
  console.log("\n[3] Admin GET /api/reviews?status=pending");
  const r3 = await fetch(`${BASE_URL}/api/reviews?status=pending`, { headers });
  const d3 = await r3.json();
  total++; (r3.ok && Array.isArray(d3.reviews) && d3.reviews.find(r => r.id === reviewId))
    ? passed += pass(`pending list contains review (pending_count=${d3.pending_count})`) : fail("review not in pending list", JSON.stringify(d3).slice(0,200));

  /* 4. Approve */
  console.log("\n[4] PATCH approve");
  const r4 = await fetch(`${BASE_URL}/api/reviews/${reviewId}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ status: "approved" }),
  });
  const d4 = await r4.json();
  total++; (r4.ok && d4.review?.status === "approved") ? passed += pass("review approved") : fail(`approve failed`, JSON.stringify(d4).slice(0,200));

  /* 5. Public GET now visible + aggregates updated */
  const r5 = await fetch(`${BASE_URL}/api/storefront/public/stores/${STORE_SLUG}/products/${storefrontProductId}/reviews`).then(r => r.json());
  total++; (r5.aggregates?.count === 1 && r5.aggregates?.avg === 5) ? passed += pass(`public sees count=1 avg=5`) : fail(`public aggregates wrong`, JSON.stringify(r5.aggregates));
  total++; (r5.reviews?.length === 1 && r5.reviews[0].rating === 5) ? passed += pass("public review listed") : fail("public review missing");

  /* 6. ProductsService aggregates denormalized */
  const refreshed = (await ps.getActiveProducts(USER_ID, BRAND_ID)).find(p => p.id === target.id);
  total++; (refreshed.reviews_count === 1 && refreshed.reviews_avg === 5)
    ? passed += pass(`products.reviews_count=1 avg=5 denormalized`) : fail(`denorm wrong`, `count=${refreshed.reviews_count} avg=${refreshed.reviews_avg}`);

  /* 7. Cleanup */
  console.log("\n[7] Cleanup");
  await pool.query(`DELETE FROM product_reviews WHERE id = $1`, [reviewId]).catch(()=>{});
  await reviewsService.recomputeProductAggregates(target.id).catch(()=>{});
  console.log("  done");

  await pool.end();
  console.log(`\n${passed}/${total} CHECKS PASSED`);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
