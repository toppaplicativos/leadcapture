/**
 * Frontend mirror of backend identity model (src/config/identity.ts).
 * Users ≠ Organizations: org owners are account_kind/role "org", not platform admin.
 */

export type AccountKind = 'org' | 'staff' | 'affiliate' | 'consumer' | 'platform'

export const ROLE_LABELS: Record<string, string> = {
  org: 'Organização',
  admin: 'Admin Master',
  platform: 'Admin Master',
  manager: 'Gerente',
  operator: 'Operador',
  affiliate: 'Afiliado',
  consumer: 'Consumidor',
  staff: 'Equipe',
}

export function roleLabel(role: string | null | undefined): string {
  const r = String(role || '').toLowerCase()
  return ROLE_LABELS[r] || r || '—'
}

export function isOrgRole(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase()
  return r === 'org' || r === 'admin' // admin only if master; UI should prefer account_kind
}

export function isOrgPrincipal(user: {
  role?: string | null
  account_kind?: string | null
  is_super_admin?: boolean
} | null | undefined): boolean {
  if (!user || user.is_super_admin) return false
  if (String(user.account_kind || '').toLowerCase() === 'org') return true
  const r = String(user.role || '').toLowerCase()
  return r === 'org' || r === 'admin'
}

export function isPlatformPrincipal(user: {
  role?: string | null
  account_kind?: string | null
  is_super_admin?: boolean
} | null | undefined): boolean {
  if (!user) return false
  if (user.is_super_admin) return true
  return String(user.account_kind || '').toLowerCase() === 'platform'
}
