/* Smoke test Fase 5: service config + availability + booking */
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

  /* 1. Convert one product to a service with a clear schedule */
  console.log("=== [1] Configure a product as a service ===");
  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  const target = products.find((p) => p.name.includes("Pasta de Alho Saborizada Chimichurri") && p.name.includes("Dona de Casa"));
  if (!target) { console.error("target product not found"); process.exit(1); }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  /* Build hours for ALL weekdays so the test works any day */
  const weekday_hours = [0,1,2,3,4,5,6].map(d => ({ weekday: d, start: '09:00', end: '17:00' }));

  await ps.updateProduct(target.id, {
    type: "service",
    cta_type: "schedule",
    subtitle: "Aula de culinária com chimichurri",
    service_config: {
      duration_minutes: 60,
      buffer_minutes: 15,
      max_per_slot: 1,
      weekday_hours,
      requires_address: false,
      advance_notice_hours: 0,
      max_advance_days: 14,
    },
  }, userId, brandId);
  console.log("converted:", target.name, "→ service");

  /* 2. Public catalog exposes service_config */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const catJson = await cat.json();
  const apiProduct = catJson.all_products.find(p => p.name === target.name);
  console.log("\n=== [2] Public catalog exposes service ===");
  console.log("  type:", apiProduct?.type, "| cta:", apiProduct?.cta_type);
  console.log("  service_config.duration_minutes:", apiProduct?.service_config?.duration_minutes);
  console.log("  service_config.weekday_hours.length:", apiProduct?.service_config?.weekday_hours?.length);

  /* 3. Fetch availability */
  const ymd = tomorrow.toISOString().slice(0,10);
  console.log("\n=== [3] Fetch availability for", ymd, "===");
  const av = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/availability?product_id=${apiProduct.id}&date=${ymd}`);
  const avJson = await av.json();
  console.log("  slots returned:", (avJson.slots || []).length);
  console.log("  first 5:", (avJson.slots || []).slice(0, 5).map(s => s.label).join(", "));

  /* 4. Create a booking on the first available slot */
  if ((avJson.slots || []).length === 0) {
    console.log("  no slots — skipping booking step");
  } else {
    const firstSlot = avJson.slots[0];
    console.log("\n=== [4] Place a booking on", firstSlot.label, "===");
    const bk = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: apiProduct.id,
        start_at: firstSlot.start,
        end_at: firstSlot.end,
        name: "Maria Smoke",
        phone: "11999990001",
        email: "smoke@booking.dev",
        message: "Primeira aula!",
      }),
    });
    const bkJson = await bk.json();
    console.log("  booking response:", JSON.stringify(bkJson, null, 2));

    /* 5. Re-fetch availability — slot should be lower */
    const av2 = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/availability?product_id=${apiProduct.id}&date=${ymd}`);
    const av2Json = await av2.json();
    const slotAfter = (av2Json.slots || []).find(s => s.start === firstSlot.start);
    console.log("  slot available after booking:", slotAfter?.available, "/", slotAfter?.capacity);

    /* 6. Agent context test */
    console.log("\n=== [6] Agent reasoning about scheduling ===");
    const r = await cognitiveAgent.respond({
      userId, brandId,
      conversationId: "smoke-fase5-" + Date.now(),
      incomingMessage: "olá, vcs tem horário pra essa aula amanhã?",
      conversationHistory: [],
      lastOutgoingMessages: [],
    });
    console.log("  agent reply:", r.text.slice(0, 300));

    /* Cleanup the booking */
    if (bkJson.booking?.customer_id) {
      await pool.query("DELETE FROM customers WHERE id = $1", [bkJson.booking.customer_id]);
      console.log("  cleanup: removed test booking");
    }
  }

  /* Revert product to its original state */
  await ps.updateProduct(target.id, {
    type: "food",
    cta_type: "buy",
    service_config: {},
  }, userId, brandId);
  console.log("\n=== Cleanup: product reverted to food/buy ===");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
