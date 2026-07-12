/**
 * Tenant entitlements (plan + platform modules) for admin UI gates.
 */

import { NAV_ITEMS, type NavItem } from '@/lib/admin/nav'

export type PlatformModules = Record<string, boolean>

export type Entitlements = {
  subscription: {
    id: string | null
    status: string
    plan_id: string | null
    plan_slug: string | null
    plan_name: string | null
    brand_id: string | null
    current_period_end: string | null
  }
  limits: Record<string, any>
  features: Record<string, boolean>
  modules: PlatformModules
  usage: {
    brands: number
    instances: number
    leads_today: number
    leads_month: number
  }
  brand: {
    id: string | null
    status: string | null
    active: boolean
  }
  maintenance_mode: boolean
  is_super_admin: boolean
}

/** Nav section key → platform module key (null = always visible) */
export const NAV_MODULE_MAP: Record<string, string | null> = {
  dashboard: null,
  leads: 'prospect_radar',
  clientes: null,
  busca: 'prospect_radar',
  mensagens: 'whatsapp',
  campanhas: 'campaigns',
  automacoes: 'automations',
  fluxos: 'flow_builder',
  habilidades: 'agent_workspace',
  criativos: 'ai_creatives',
  galeria: 'ai_creatives',
  'video-studio': 'video_studio',
  agente: 'agent_workspace',
  atendente: 'agent_workspace',
  notificacoes: null,
  instagram: 'instagram',
  facebook: 'facebook',
  produtos: 'catalog',
  pedidos: 'catalog',
  'tirar-pedido': 'catalog',
  estoque: 'catalog',
  afiliados: 'affiliates',
  cupons: 'catalog',
  avaliacoes: 'catalog',
  loja: 'catalog',
  pagamentos: 'catalog',
  frete: 'catalog',
  dominio: 'catalog',
  whatsapp: 'whatsapp',
  configuracoes: null,
  emails: null,
  'provedores-ia': null,
}

let cache: { data: Entitlements; at: number } | null = null
const TTL = 30_000

function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('lead-system-token')
  if (token) headers.Authorization = `Bearer ${token}`
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

export async function fetchEntitlements(force = false): Promise<Entitlements | null> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data
  const token = localStorage.getItem('lead-system-token')
  if (!token) return null
  try {
    const r = await fetch('/api/entitlements', { headers: adminHeaders() })
    if (!r.ok) return null
    const d = await r.json()
    const ent = d.entitlements as Entitlements
    cache = { data: ent, at: Date.now() }
    return ent
  } catch {
    return null
  }
}

export function invalidateEntitlementsCache() {
  cache = null
}

export function isNavAllowed(navKey: string, modules?: PlatformModules | null): boolean {
  if (!modules) return true
  const mod = NAV_MODULE_MAP[navKey]
  if (!mod) return true
  return modules[mod] !== false
}

export function filterNavItems(items: NavItem[] = NAV_ITEMS, modules?: PlatformModules | null): NavItem[] {
  return items.filter(item => isNavAllowed(item.key, modules))
}

export async function fetchPublicPlatformStatus(): Promise<{
  maintenance_mode: boolean
  maintenance_message: string
  signup_enabled: boolean
  public_signup: boolean
  modules: PlatformModules
} | null> {
  try {
    const r = await fetch('/api/public/platform-status')
    if (!r.ok) return null
    const d = await r.json()
    return d.status
  } catch {
    return null
  }
}
