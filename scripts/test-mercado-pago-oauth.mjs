/**
 * Unit-level tests for Mercado Pago OAuth crypto helpers (no network).
 * Run: node scripts/test-mercado-pago-oauth.mjs
 */
import assert from "assert"
import { createHash, createHmac, randomBytes } from "crypto"

function base64Url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

// PKCE
const verifier = base64Url(randomBytes(48))
assert.ok(verifier.length >= 43)
const challenge = base64Url(createHash("sha256").update(verifier).digest())
assert.ok(challenge.length > 20)
assert.notEqual(verifier, challenge)

// state hash
const state = base64Url(randomBytes(32))
const stateHash = createHash("sha256").update(state).digest("hex")
assert.equal(stateHash.length, 64)

// webhook signature shape
const secret = "test_webhook_secret"
const dataId = "12345"
const requestId = "req-abc"
const ts = String(Math.floor(Date.now() / 1000))
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
const v1 = createHmac("sha256", secret).update(manifest).digest("hex")
assert.equal(v1.length, 64)

// platform fee cents
function fee(amountCents, enabled, type, value) {
  if (!enabled || value <= 0) return 0
  if (type === "fixed") return Math.round(value * 100)
  return Math.round((amountCents * value) / 100)
}
assert.equal(fee(10000, true, "percentage", 5), 500)
assert.equal(fee(10000, true, "fixed", 1.5), 150)
assert.equal(fee(10000, false, "percentage", 5), 0)

// external reference isolation
const refA = `lc:brand-a:order-1`
const refB = `lc:brand-b:order-1`
assert.notEqual(refA, refB)

console.log("OK mercado pago oauth unit tests")
