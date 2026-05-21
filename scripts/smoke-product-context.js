/* Smoke test: ensure the agent now sees full product descriptions and uses them in replies.
 * Uses the Alho Pronto brand which has a Gemini key configured. */
require("dotenv").config();
const { Pool } = require("pg");
const { ProductsService } = require("../dist/services/products");
const { buildProductIntelligenceBlock } = require("../dist/services/cognitive/skills/productIntelligence");
const { cognitiveAgent } = require("../dist/services/cognitive");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";

  const brand = await pool.query("SELECT name FROM brand_units WHERE id = $1", [brandId]);
  console.log("brand:", brand.rows[0]?.name);

  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);

  console.log("\n=== Catalog summary ===");
  console.log("active products:", products.length);
  products.forEach(p => {
    console.log(`  - ${p.name}: desc=${(p.description||"").length} chars, features=${(p.features||[]).length}, images=${(p.images||[]).length}`);
  });

  const block = buildProductIntelligenceBlock(products);
  console.log("\n=== Catalog block ===");
  console.log("size:", block.length, "chars (~", Math.round(block.length / 4), "tokens)");
  console.log("\n--- first 2500 chars ---");
  console.log(block.slice(0, 2500));
  if (block.length > 2500) console.log("...[+", block.length - 2500, "more chars]");

  /* Pick a product that has a long description to ask a specific detail question */
  const richProduct = products
    .filter(p => (p.description || "").length > 200)
    .sort((a, b) => (b.description.length - a.description.length))[0];

  if (!richProduct) {
    console.log("\n(no product with rich description to test against — skipping live agent call)");
    process.exit(0);
  }

  console.log("\n=== LIVE AGENT TEST ===");
  console.log("Testing against rich-description product:", richProduct.name);
  const ask = `me fala mais sobre o ${richProduct.name.toLowerCase()}, quero saber detalhes`;
  console.log("Q:", ask);

  const r = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-prod-" + Date.now(),
    incomingMessage: ask,
    conversationHistory: [],
    lastOutgoingMessages: [],
  });
  console.log("\nA:", r.text);
  console.log("\nmeta:", JSON.stringify({
    stage: r.reasoning?.funnel_stage,
    products_mentioned: r.reasoning?.mentioned_products,
    catalogApplied: r.catalogApplied,
    latency_ms: r.latencyMs,
  }, null, 2));

  /* Verify response actually cites details from the description (not generic) */
  const desc = (richProduct.description || "").toLowerCase();
  const reply = (r.text || "").toLowerCase();
  const descTokens = desc
    .split(/[\s,\.\!\?\n]+/)
    .filter(t => t.length >= 5 && !/^\d+$/.test(t))
    .slice(0, 30);
  const hits = descTokens.filter(t => reply.includes(t));
  console.log("\nGROUNDING CHECK: " + hits.length + " distinctive words from description present in reply");
  console.log("  matched:", hits.slice(0, 12));

  process.exit(0);
})().catch(e => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
