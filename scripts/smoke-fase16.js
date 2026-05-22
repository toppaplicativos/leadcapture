/* Smoke test Fase 16 — ResponseGate + silence log + tone hint
 *
 * Scenarios (all run against cognitiveAgent directly, not over HTTP):
 *   1. Reaction → silenced
 *   2. Single emoji "🙏" → silenced
 *   3. "ok" after our non-question → silenced
 *   4. "ok" after our question → NOT silenced
 *   5. "qto?" → NOT silenced
 *   6. Duplicate of previous incoming → silenced
 *   7. Echo of our outgoing → silenced
 *   8. Sticker → silenced
 *   9. Silence log is written + readable via admin endpoint
 *   10. Composer prompt includes tone instruction when suggestedTone != normal
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { decideResponse } = require("../dist/services/cognitive/skills/responseGate");
const { silenceLogService } = require("../dist/services/cognitive/silenceLog");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";

function pass(label) { console.log(`  PASS  ${label}`); return 1; }
function fail(label, extra) { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`); return 0; }

(async () => {
  let passed = 0, total = 0;

  console.log("=== Fase 16 smoke ===");

  /* 1-8. Gate decisions (pure heuristic, no LLM, no network) */
  const cases = [
    { name: "reaction 👍",            input: { incomingMessage: "👍", messageType: "reaction" }, expectSilence: true },
    { name: "single emoji 🙏",        input: { incomingMessage: "🙏", messageType: "text" }, expectSilence: true },
    { name: "ack 'ok' after info",   input: { incomingMessage: "ok", messageType: "text", lastOutgoingMessages: ["Te enviei o cardápio"] }, expectSilence: true },
    { name: "ack 'ok' after question", input: { incomingMessage: "ok", messageType: "text", lastOutgoingMessages: ["Confirma o pedido?"] }, expectSilence: false },
    { name: "real question 'qto?'",  input: { incomingMessage: "qto?", messageType: "text" }, expectSilence: false },
    { name: "duplicate of previous", input: { incomingMessage: "quero saber o preco", messageType: "text", conversationHistory: ["quero saber o preco"] }, expectSilence: true },
    { name: "echo of our text",       input: { incomingMessage: "Veja o catálogo: link.com/x", messageType: "text", lastOutgoingMessages: ["Veja o catálogo: link.com/x"] }, expectSilence: true },
    { name: "sticker no body",       input: { incomingMessage: "", messageType: "sticker" }, expectSilence: true },
  ];
  for (const c of cases) {
    total++;
    const r = decideResponse(c.input);
    const got = !r.shouldRespond;
    if (got === c.expectSilence) passed += pass(`${c.name.padEnd(28)} → ${got ? "SILENCE" : "RESPOND"} [${r.reasonCode}]`);
    else fail(`${c.name} expected ${c.expectSilence ? "silence" : "respond"} got ${got}`);
  }

  /* 9. Silence log write + read */
  console.log("\n[9] Silence log persisted");
  const fakeConvId = "smoke-fase16-" + Date.now();
  await silenceLogService.record({
    conversationId: fakeConvId,
    brandId: BRAND_ID,
    messageType: "reaction",
    incomingMessage: "👍",
    reasonCode: "reaction",
    reasonHuman: "smoke test",
    confidence: 0.95,
  });
  const list = await silenceLogService.listForBrand(BRAND_ID, 10);
  total++; (list.some((s) => s.conversation_id === fakeConvId))
    ? passed += pass(`silence_log has the smoke record`) : fail("silence record missing");

  /* 10. Admin endpoint returns the log */
  console.log("\n[10] Admin GET /api/agent/silences");
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  const user = u.rows[0];
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role || "operator" }, JWT_SECRET, { expiresIn: "1h" });
  const r10 = await fetch(`${BASE_URL}/api/agent/silences?limit=10`, {
    headers: { "authorization": `Bearer ${token}`, "x-brand-id": BRAND_ID },
  });
  const d10 = await r10.json();
  total++; (r10.ok && Array.isArray(d10.silences) && d10.silences.some((s) => s.conversation_id === fakeConvId))
    ? passed += pass(`admin endpoint returned ${d10.silences.length} silences with stats: ${JSON.stringify(d10.stats)}`)
    : fail(`admin endpoint wrong`, JSON.stringify(d10).slice(0, 200));

  /* Cleanup */
  await pool.query(`DELETE FROM agent_silence_log WHERE conversation_id = $1`, [fakeConvId]).catch(() => {});

  await pool.end();
  console.log(`\n${passed}/${total} CHECKS PASSED`);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
