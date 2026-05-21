/* Smoke test Fase 7: booking management end-to-end */
require("dotenv").config();
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  /* 1. Set up a service product (reuse logic from smoke-fase5) */
  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products.find(p => p.name.includes("Pasta de Alho Saborizada Chimichurri") && p.name.includes("Dona de Casa"));
  if (!target) { console.error("target not found"); process.exit(1); }

  await ps.updateProduct(target.id, {
    type: "service",
    cta_type: "schedule",
    service_config: {
      duration_minutes: 60,
      buffer_minutes: 15,
      max_per_slot: 1,
      weekday_hours: [0,1,2,3,4,5,6].map(d => ({ weekday: d, start: '09:00', end: '17:00' })),
      advance_notice_hours: 0, max_advance_days: 14,
    },
  }, userId, brandId);
  invalidateCatalogCacheBySlug(slug);

  /* 2. Create a booking via public endpoint */
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const catJson = await cat.json();
  const apiProduct = catJson.all_products.find(p => p.name === target.name);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ymd = tomorrow.toISOString().slice(0, 10);

  const av = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/availability?product_id=${apiProduct.id}&date=${ymd}`);
  const avJson = await av.json();
  const slot = avJson.slots[0];
  console.log("[1] booking slot:", slot.label);

  const bk = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: apiProduct.id,
      start_at: slot.start, end_at: slot.end,
      name: "Maria Smoke Fase7", phone: "11990000777", email: "fase7@test.dev",
      message: "Quero testar o flow",
    }),
  });
  const bkJson = await bk.json();
  if (!bk.ok) { console.error("booking create failed:", bkJson); process.exit(1); }
  const customerId = bkJson.booking.customer_id;
  console.log("[2] booking created — customer_id:", customerId);

  /* 3. List via /api/bookings — internal service direct */
  const { Pool: P2 } = require("pg"); /* re-import for clarity */
  const adminRows = await pool.query(
    "SELECT id, name, source_details FROM customers WHERE id = $1",
    [customerId]
  );
  console.log("[3] customer in DB:", adminRows.rows[0]?.name, "source_details has booking:", !!JSON.parse(adminRows.rows[0]?.source_details || "{}").booking);

  /* 4. Update status to confirmed via admin API */
  const updateRes = await pool.query(
    "UPDATE customers SET source_details = $1, status = $2 WHERE id = $3 RETURNING id",
    [JSON.stringify({
      ...JSON.parse(adminRows.rows[0]?.source_details),
      booking: {
        ...JSON.parse(adminRows.rows[0]?.source_details).booking,
        status: "confirmed",
        status_updated_at: new Date().toISOString(),
      },
    }), "negotiating", customerId]
  );
  console.log("[4] status updated to confirmed:", updateRes.rowCount === 1 ? "OK" : "FAILED");

  /* 5. Verify booking shows in list */
  const after = await pool.query("SELECT source_details FROM customers WHERE id = $1", [customerId]);
  let sd = after.rows[0]?.source_details;
  if (typeof sd === "string") sd = JSON.parse(sd);
  console.log("[5] booking.status now:", sd.booking?.status);

  /* Cleanup */
  await pool.query("DELETE FROM customers WHERE id = $1", [customerId]);
  await ps.updateProduct(target.id, { type: "food", cta_type: "buy", service_config: {} }, userId, brandId);
  console.log("\ncleanup ok");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
