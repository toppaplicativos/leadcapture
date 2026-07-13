/**
 * Public plans (landing + cadastro) — always from /api/public/plans.
 * Never hardcode commercial limits/features in UI.
 */

export type PlanFeatureKey = string

export type FeatureMeta = {
  key: PlanFeatureKey
  label: string
  group: string
  description: string
}

export type PlanLimits = {
  leads_per_day: number
  leads_per_month: number
  instances: number
  brands: number
  disparos_per_month: number
  features: Partial<Record<PlanFeatureKey, boolean>>
}

export type PublicPlan = {
  id: string
  slug: string
  name: string
  tagline: string | null
  price_cents: number
  interval: string
  billing_type: string
  features: string[] | string
  limits: PlanLimits | string | null
  is_featured: boolean
  is_active: boolean
  sort_order?: number
}

export type PublicPlansResponse = {
  plans: PublicPlan[]
  feature_catalog?: FeatureMeta[]
  feature_keys?: string[]
}

/** Fallback catalog only if API omits it (keys still driven by plan.limits). */
export const DEFAULT_FEATURE_CATALOG: FeatureMeta[] = [
  { key: 'radar', label: 'Radar geográfico', group: 'Captação', description: 'Busca de leads no mapa' },
  { key: 'smart_import', label: 'Importação inteligente', group: 'Captação', description: 'Import de listas com IA' },
  { key: 'prospect_ai', label: 'Inteligência de prospecção', group: 'Captação', description: 'IA de prospecção' },
  { key: 'crm', label: 'CRM, catálogo e vendas', group: 'Comercial', description: 'Clientes, produtos, pedidos, checkout' },
  { key: 'whatsapp', label: 'WhatsApp', group: 'Canais', description: 'Instâncias e inbox' },
  { key: 'campaigns', label: 'Campanhas', group: 'Canais', description: 'Campanhas e disparos' },
  { key: 'automations', label: 'Automações', group: 'Canais', description: 'Automações e regras' },
  { key: 'flow_builder', label: 'Construtor de fluxos', group: 'Canais', description: 'Flow builder' },
  { key: 'agent_workspace', label: 'Agente / workspace', group: 'IA', description: 'Atendente IA' },
  { key: 'creative_ai', label: 'Criativos IA', group: 'IA', description: 'Posts e galeria' },
  { key: 'video_studio', label: 'Video studio', group: 'IA', description: 'Vídeo' },
  { key: 'meta_integration', label: 'Instagram + Facebook', group: 'Presença', description: 'Meta' },
  { key: 'custom_domain', label: 'Domínio customizado', group: 'Presença', description: 'Domínio próprio' },
  { key: 'corporate_email', label: 'E-mail corporativo', group: 'Presença', description: '@seudominio' },
  { key: 'affiliates', label: 'Programa de afiliados', group: 'Rede', description: 'Afiliados da marca' },
  { key: 'multi_brand', label: 'Multi-marca', group: 'Rede', description: 'Várias orgs' },
  { key: 'api', label: 'API e webhooks', group: 'Enterprise', description: 'API dedicada' },
]

export function moneyBR(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return 'Sob consulta'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function asFeatureList(v: PublicPlan['features']): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

export function parsePlanLimits(raw: any): PlanLimits {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      obj = {}
    }
  }
  if (!obj || typeof obj !== 'object') obj = {}
  const f =
    obj.features && typeof obj.features === 'object' ? (obj.features as Record<string, boolean>) : {}
  return {
    leads_per_day: Number(obj.leads_per_day ?? 0),
    leads_per_month: Number(obj.leads_per_month ?? 0),
    instances: Number(obj.instances ?? 0),
    brands: Number(obj.brands ?? 0),
    disparos_per_month: Number(obj.disparos_per_month ?? 0),
    features: { ...f },
  }
}

export function formatLimit(n: number, unit = ''): string {
  if (!Number.isFinite(n) || n < 0 || n === -1) return 'Ilimitado'
  return `${Math.floor(n).toLocaleString('pt-BR')}${unit}`
}

export function intervalLabel(interval: string, billingType?: string): string {
  if (billingType === 'one_time') return ''
  const i = String(interval || 'monthly').toLowerCase()
  if (i === 'yearly' || i === 'year' || i === 'annual') return '/ano'
  if (i === 'weekly' || i === 'week') return '/semana'
  return '/mês'
}

export function planPriceLabel(plan: PublicPlan): { price: string; period: string } {
  const period = intervalLabel(plan.interval, plan.billing_type)
  if (!plan.price_cents || plan.price_cents <= 0) {
    return { price: 'Sob consulta', period: '' }
  }
  return { price: moneyBR(plan.price_cents), period }
}

export function planHighlight(plan: PublicPlan): { highlight: string; sub: string } {
  const lim = parsePlanLimits(plan.limits)
  return {
    highlight: `${formatLimit(lim.leads_per_month)} leads/mês`,
    sub: `${formatLimit(lim.leads_per_day)} leads captados por dia`,
  }
}

export type MatrixCell = boolean | string

export type MatrixRow = {
  key: string
  label: string
  cells: MatrixCell[] // aligned with plans[]
}

export type MatrixGroup = {
  group: string
  rows: MatrixRow[]
}

export function buildComparisonMatrix(
  plans: PublicPlan[],
  catalog: FeatureMeta[] = DEFAULT_FEATURE_CATALOG,
): MatrixGroup[] {
  if (!plans.length) return []

  const limits = plans.map(p => parsePlanLimits(p.limits))

  const limitRows: MatrixRow[] = [
    {
      key: 'leads_per_day',
      label: 'Leads captados/dia',
      cells: limits.map(l => formatLimit(l.leads_per_day)),
    },
    {
      key: 'leads_per_month',
      label: 'Leads captados/mês',
      cells: limits.map(l => formatLimit(l.leads_per_month)),
    },
    {
      key: 'brands',
      label: 'Marcas (organizações)',
      cells: limits.map(l => formatLimit(l.brands)),
    },
    {
      key: 'instances',
      label: 'Números WhatsApp',
      cells: limits.map(l => formatLimit(l.instances)),
    },
    {
      key: 'disparos_per_month',
      label: 'Disparos em massa/mês',
      cells: limits.map(l => formatLimit(l.disparos_per_month)),
    },
  ]

  const groups = new Map<string, MatrixRow[]>()
  groups.set('Limites', limitRows)

  for (const meta of catalog) {
    const row: MatrixRow = {
      key: meta.key,
      label: meta.label,
      cells: limits.map(l => l.features[meta.key] === true),
    }
    const list = groups.get(meta.group) || []
    list.push(row)
    groups.set(meta.group, list)
  }

  // Stable order: Limites first, then catalog groups in catalog order
  const order: string[] = ['Limites']
  for (const meta of catalog) {
    if (!order.includes(meta.group)) order.push(meta.group)
  }
  for (const g of groups.keys()) {
    if (!order.includes(g)) order.push(g)
  }

  return order
    .filter(g => groups.has(g))
    .map(group => ({ group, rows: groups.get(group)! }))
}

let cache: { at: number; data: PublicPlansResponse } | null = null
const TTL_MS = 60_000

export async function fetchPublicPlans(force = false): Promise<PublicPlansResponse> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data
  const r = await fetch('/api/public/plans')
  if (!r.ok) throw new Error(`plans_http_${r.status}`)
  const d = (await r.json()) as PublicPlansResponse
  const plans = Array.isArray(d.plans) ? d.plans.filter(p => p.is_active !== false) : []
  const data: PublicPlansResponse = {
    plans,
    feature_catalog:
      Array.isArray(d.feature_catalog) && d.feature_catalog.length
        ? d.feature_catalog
        : DEFAULT_FEATURE_CATALOG,
    feature_keys: d.feature_keys,
  }
  cache = { at: Date.now(), data }
  return data
}
