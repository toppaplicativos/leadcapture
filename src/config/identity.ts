/**
 * LeadCapture Identity Model
 *
 * Canonical principal types (users.account_kind) and legacy role compatibility.
 *
 * Hierarchy:
 *   Users
 *     ├─ consumer     — consumidor final (storefront, multi-brand)
 *     ├─ org          — dono/operador de Organização (possui brand_units)
 *     ├─ staff        — equipe da org (gerente de estoque, atendente…)
 *     ├─ affiliate    — afiliado / parceiro
 *     └─ platform     — Admin Master (is_super_admin = true)
 *
 * Organizations = brand_units (e seus brands/programas).
 * Memberships = user_brand_roles (+ credenciais de app: estoque, afiliado).
 *
 * LEGACY:
 *   users.role = "admin" meant "tenant owner". That is now "org".
 *   Only platform masters may keep role "admin" (with is_super_admin).
 */

export const ACCOUNT_KINDS = [
  "org",
  "staff",
  "affiliate",
  "consumer",
  "platform",
] as const

export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/** Canonical users.role values after normalization */
export const USER_ROLES = [
  "org", // organization owner / operator (was "admin")
  "manager", // stock gerente etc.
  "operator", // legacy staff
  "affiliate",
  "consumer",
  "admin", // ONLY platform master (is_super_admin)
  "platform", // optional explicit platform role
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const PRODUCT_ORG_LABEL = "Organização"
export const PRODUCT_ROLE_LABELS: Record<string, string> = {
  org: "Organização",
  admin: "Admin Master",
  platform: "Admin Master",
  manager: "Gerente",
  operator: "Operador",
  affiliate: "Afiliado",
  consumer: "Consumidor",
  staff: "Equipe",
}

/** Roles that may operate a tenant organization (own brands / manage team). */
export const ORG_OPERATOR_ROLES = new Set(["org", "admin", "operator"])

/** JWT / DB roles that represent org ownership (legacy admin included). */
export const ORG_OWNER_ROLES = new Set(["org", "admin"])

export function normalizeAccountKind(
  raw: unknown,
  opts?: { role?: string | null; isSuperAdmin?: boolean },
): AccountKind {
  if (opts?.isSuperAdmin) return "platform"
  const k = String(raw || "")
    .trim()
    .toLowerCase()
  if ((ACCOUNT_KINDS as readonly string[]).includes(k)) return k as AccountKind

  const role = String(opts?.role || "")
    .trim()
    .toLowerCase()
  if (role === "affiliate") return "affiliate"
  if (role === "manager" || role === "operator") return "staff"
  if (role === "consumer") return "consumer"
  if (role === "platform" || role === "admin") {
    // bare "admin" without super flag is legacy tenant → org
    return opts?.isSuperAdmin ? "platform" : role === "platform" ? "platform" : "org"
  }
  if (role === "org") return "org"
  return "org"
}

/**
 * Map legacy role labels to canonical ones at write-time.
 * - register/signup always → org
 * - never trust client for "admin" (platform only via is_super_admin tools)
 */
export function canonicalRoleForKind(kind: AccountKind, preferredRole?: string | null): string {
  switch (kind) {
    case "platform":
      return preferredRole === "platform" ? "platform" : "admin"
    case "org":
      return "org"
    case "affiliate":
      return "affiliate"
    case "consumer":
      return "consumer"
    case "staff": {
      const r = String(preferredRole || "manager").toLowerCase()
      if (r === "operator" || r === "manager") return r
      return "manager"
    }
    default:
      return "org"
  }
}

export function isOrgPrincipal(user: {
  role?: string | null
  account_kind?: string | null
  is_super_admin?: boolean | null
} | null | undefined): boolean {
  if (!user) return false
  if (user.is_super_admin) return false
  const kind = String(user.account_kind || "").toLowerCase()
  if (kind === "platform") return false
  if (kind === "org") return true
  const role = String(user.role || "").toLowerCase()
  return ORG_OWNER_ROLES.has(role) && kind !== "affiliate" && kind !== "consumer" && kind !== "staff"
}

export function isPlatformPrincipal(user: {
  role?: string | null
  account_kind?: string | null
  is_super_admin?: boolean | null
} | null | undefined): boolean {
  if (!user) return false
  if (user.is_super_admin === true) return true
  const kind = String(user.account_kind || "").toLowerCase()
  if (kind === "platform") return true
  return false
}

export function isAffiliatePrincipal(user: { role?: string | null; account_kind?: string | null } | null | undefined): boolean {
  if (!user) return false
  if (String(user.account_kind || "").toLowerCase() === "affiliate") return true
  return String(user.role || "").toLowerCase() === "affiliate"
}

export function isManagerPrincipal(user: { role?: string | null; account_kind?: string | null } | null | undefined): boolean {
  if (!user) return false
  if (String(user.role || "").toLowerCase() === "manager") return true
  return String(user.account_kind || "").toLowerCase() === "staff" && String(user.role || "").toLowerCase() === "manager"
}

export function isConsumerPrincipal(user: { role?: string | null; account_kind?: string | null } | null | undefined): boolean {
  if (!user) return false
  return String(user.account_kind || "").toLowerCase() === "consumer" || String(user.role || "").toLowerCase() === "consumer"
}

/**
 * Expand allowed roles for requireRole():
 * if "admin" is listed (legacy tenant owner), also allow "org".
 * if "org" is listed, also allow legacy "admin" for tokens not yet re-issued.
 * Platform masters (admin + super) remain matched by "admin".
 */
export function expandAllowedRoles(roles: string[]): string[] {
  const set = new Set(roles.map((r) => String(r).toLowerCase()))
  if (set.has("admin") || set.has("org")) {
    set.add("admin")
    set.add("org")
  }
  return Array.from(set)
}

export function roleLabel(role: string | null | undefined): string {
  const r = String(role || "").toLowerCase()
  return PRODUCT_ROLE_LABELS[r] || r || "—"
}

export function kindLabel(kind: string | null | undefined): string {
  const k = String(kind || "").toLowerCase()
  return PRODUCT_ROLE_LABELS[k] || k || "—"
}
