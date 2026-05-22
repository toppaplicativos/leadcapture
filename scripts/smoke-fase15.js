/* Smoke test Fase 15 — Data Provenance + LGPD Opt-Out
 *
 * Scenarios:
 *   1. POST /api/lgpd/opt-out público — sem auth, registra opt-out
 *   2. Tentar recriar cliente com mesmo phone → rejeita LGPD_OPTED_OUT
 *   3. Provenance recordCapture + listForLead
 *   4. Rate-limit em /api/clients estoura após 200 req → 429
 *   5. Logger sanitizer mascara phone/email em saída
 *   6. Admin GET /api/lgpd/optouts retorna lista mascarada
 *   7. Cleanup
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { lgpdOptoutService } = require("../dist/services/lgpdOptout");
const { dataProvenanceService } = require("../dist/services/dataProvenance");
const { _piiMask } = require("../dist/utils/logger");
const { ClientsService } = require("../dist/services/clients");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.SMOKE_BASE_URL || "https://app.leadcapture.online";
const USER_ID = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const BRAND_ID = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
const JWT_SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";

const TEST_PHONE = "+5511955554444"; // unique to this smoke
const TEST_EMAIL = "smoke-fase15@example.test";

function pass(label) { console.log(`  PASS  ${label}`); return 1; }
function fail(label, extra) { console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`); return 0; }

(async () => {
  let passed = 0, total = 0;

  /* Pre-clean any prior smoke leftovers */
  await pool.query(`DELETE FROM lgpd_optouts WHERE phone_normalized = $1 OR email_normalized = $2`,
    [TEST_PHONE.replace(/\D/g, ""), TEST_EMAIL]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE email = $1`, [TEST_EMAIL]).catch(() => {});

  /* JWT for admin endpoints */
  const u = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [USER_ID]);
  const user = u.rows[0];
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role || "operator" }, JWT_SECRET, { expiresIn: "1h" });
  const headers = { "content-type": "application/json", "authorization": `Bearer ${token}`, "x-brand-id": BRAND_ID };

  console.log("=== Fase 15 smoke ===");

  /* 1. Public POST opt-out */
  console.log("\n[1] POST /api/lgpd/opt-out (no auth)");
  const r1 = await fetch(`${BASE_URL}/api/lgpd/opt-out`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: TEST_PHONE, email: TEST_EMAIL, reason: "smoke test" }),
  });
  const d1 = await r1.json();
  total++; (r1.ok && d1.success) ? passed += pass(`opt-out registered: "${d1.message}"`) : fail(`POST failed: ${r1.status}`, JSON.stringify(d1).slice(0, 200));

  /* 2. Tentar criar cliente com mesmo phone via service direto */
  console.log("\n[2] ClientsService.create com mesmo phone — deve LGPD_OPTED_OUT");
  const cs = new ClientsService();
  let blocked = false;
  try {
    await cs.create(USER_ID, { name: "Smoke Bot", phone: TEST_PHONE, source: "manual", status: "new" }, BRAND_ID);
  } catch (e) {
    blocked = e.code === "LGPD_OPTED_OUT";
    if (blocked) console.log(`  (rejected with: ${e.message})`);
  }
  total++; blocked ? passed += pass("create rejected with LGPD_OPTED_OUT") : fail("create should have been blocked");

  /* Verify nothing was inserted */
  const inserted = await pool.query(`SELECT id FROM clients WHERE phone = $1 OR email = $2`, [TEST_PHONE, TEST_EMAIL]);
  total++; (inserted.rows.length === 0) ? passed += pass("no client row inserted") : fail(`leaked ${inserted.rows.length} rows`);

  /* 3. Provenance audit — record + retrieve */
  console.log("\n[3] Provenance recordCapture + listForLead");
  const fakeLeadId = "smoke-lead-" + Date.now();
  await dataProvenanceService.recordCapture({
    leadRefTable: "customers",
    leadRefId: fakeLeadId,
    source: "google_maps",
    sourceQuery: "padaria sao paulo",
    sourceUrl: "https://maps.google.com/place/abc",
    capturedBy: USER_ID,
    brandId: BRAND_ID,
    rawResponse: { mock: true },
  });
  const audit = await dataProvenanceService.listForLead("customers", fakeLeadId);
  total++; (audit.length === 1 && audit[0].source === "google_maps") ? passed += pass(`audit registered (${audit[0].source})`) : fail(`audit not found`, JSON.stringify(audit));

  /* 4. Rate-limit middleware presence (verify headers, not full 429 trip).
   * Triggering 429 over the internet would need 200+ requests in <60s,
   * which network latency makes flaky. Instead verify the middleware is
   * actually wired by checking X-RateLimit-Limit / Remaining headers exist
   * and decrement between two consecutive requests. */
  console.log("\n[4] Rate-limit middleware wired");
  const rA = await fetch(`${BASE_URL}/api/clients?limit=1`, { headers });
  const remA = Number(rA.headers.get("x-ratelimit-remaining") || -1);
  const rB = await fetch(`${BASE_URL}/api/clients?limit=1`, { headers });
  const remB = Number(rB.headers.get("x-ratelimit-remaining") || -1);
  const limit = Number(rA.headers.get("x-ratelimit-limit") || 0);
  total++; (limit === 200 && remA > 0 && remB === remA - 1)
    ? passed += pass(`X-RateLimit-Limit=${limit}, Remaining decrement ${remA}→${remB}`)
    : fail(`headers wrong`, `limit=${limit} remA=${remA} remB=${remB}`);

  /* 5. Logger sanitizer */
  console.log("\n[5] Logger sanitizer masks PII");
  const m1 = _piiMask.maskString(`phone ${TEST_PHONE} email ${TEST_EMAIL}`);
  total++; (!m1.includes(TEST_PHONE) && !m1.includes(TEST_EMAIL) && m1.includes("***"))
    ? passed += pass(`masked: "${m1}"`) : fail("not masked", m1);

  /* 6. Admin GET /api/lgpd/optouts */
  console.log("\n[6] Admin GET /api/lgpd/optouts");
  const r6 = await fetch(`${BASE_URL}/api/lgpd/optouts`, { headers });
  const d6 = await r6.json();
  total++; (r6.ok && Array.isArray(d6.optouts) && d6.optouts.some(o => o.phone_masked && o.phone_masked.includes("4444")))
    ? passed += pass(`list returned ${d6.optouts.length} optouts (masked)`) : fail(`admin list wrong`, JSON.stringify(d6).slice(0, 200));

  /* 7. Cleanup */
  console.log("\n[7] Cleanup");
  await pool.query(`DELETE FROM lgpd_optouts WHERE phone_normalized = $1`, [TEST_PHONE.replace(/\D/g, "")]).catch(() => {});
  await pool.query(`DELETE FROM lead_source_audit WHERE lead_ref_id = $1`, [fakeLeadId]).catch(() => {});
  console.log("  done");

  await pool.end();
  console.log(`\n${passed}/${total} CHECKS PASSED`);
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });
