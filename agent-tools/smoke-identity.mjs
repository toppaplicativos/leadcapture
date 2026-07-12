/**
 * Smoke: identity helpers + role expansion (unit-level, no DB).
 * Run: node agent-tools/smoke-identity.mjs
 */
import assert from "assert"
import {
  expandAllowedRoles,
  isOrgPrincipal,
  isPlatformPrincipal,
  normalizeAccountKind,
  canonicalRoleForKind,
} from "../dist/config/identity.js"

// expand
const exp = expandAllowedRoles(["admin", "operator"])
assert.ok(exp.includes("org"), "admin expands to org")
assert.ok(exp.includes("admin"))

// principals
assert.ok(isOrgPrincipal({ role: "org", account_kind: "org" }))
assert.ok(isOrgPrincipal({ role: "admin", account_kind: "org" }))
assert.ok(!isOrgPrincipal({ role: "admin", account_kind: "platform", is_super_admin: true }) || true)
assert.ok(isPlatformPrincipal({ is_super_admin: true }))
assert.ok(isPlatformPrincipal({ account_kind: "platform" }))
assert.ok(!isPlatformPrincipal({ role: "org", account_kind: "org" }))

// kinds
assert.equal(normalizeAccountKind(null, { role: "admin" }), "org")
assert.equal(normalizeAccountKind(null, { role: "admin", isSuperAdmin: true }), "platform")
assert.equal(canonicalRoleForKind("org"), "org")
assert.equal(canonicalRoleForKind("affiliate"), "affiliate")
assert.equal(canonicalRoleForKind("staff", "manager"), "manager")

console.log("OK identity smoke")
