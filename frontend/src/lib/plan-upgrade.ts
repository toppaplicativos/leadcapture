/**
 * Global plan-upgrade gate — opens a modal when the user hits a plan wall
 * (API 403 entitlement or client-side module check).
 */

export type PlanUpgradeReason =
  | 'plan_feature_required'
  | 'module_disabled'
  | 'plan_brand_limit'
  | 'plan_multi_brand_required'
  | 'plan_instance_limit'
  | 'plan_leads_day_limit'
  | 'plan_leads_month_limit'
  | 'brand_inactive'
  | 'maintenance_mode'
  | 'generic'

export type PlanUpgradePayload = {
  code: PlanUpgradeReason | string
  title: string
  message: string
  /** Human feature/module name when known */
  featureLabel?: string | null
  featureKey?: string | null
  planSlug?: string | null
  planName?: string | null
  used?: number | null
  limit?: number | null
  requestId?: string | null
}

type Listener = (payload: PlanUpgradePayload | null) => void

let openPayload: PlanUpgradePayload | null = null
const listeners = new Set<Listener>()

const FEATURE_LABELS: Record<string, string> = {
  radar: 'Radar geográfico',
  crm: 'CRM, catálogo e vendas',
  smart_import: 'Importação inteligente',
  prospect_ai: 'Inteligência de prospecção',
  creative_ai: 'Criativos IA',
  video_studio: 'Video Studio',
  meta_integration: 'Instagram e Facebook',
  custom_domain: 'Domínio customizado',
  corporate_email: 'E-mail corporativo',
  campaigns: 'Campanhas',
  automations: 'Automações',
  flow_builder: 'Construtor de fluxos',
  whatsapp: 'WhatsApp',
  agent_workspace: 'Agente / workspace',
  multi_brand: 'Multi-marca',
  api: 'API e webhooks',
  affiliates: 'Programa de afiliados',
  prospect_radar: 'Radar / prospecção',
  lead_import: 'Importação de leads',
  catalog: 'Catálogo e vendas',
  ai_creatives: 'Criativos IA',
  instagram: 'Instagram',
  facebook: 'Facebook',
  agent_workspace_mod: 'Agente IA',
}

export function featureLabel(key?: string | null): string {
  if (!key) return 'este recurso'
  return FEATURE_LABELS[key] || key.replace(/_/g, ' ')
}

export function buildUpgradePayload(input: {
  code?: string | null
  message?: string | null
  details?: Record<string, any> | null
  requestId?: string | null
}): PlanUpgradePayload {
  const code = String(input.code || 'generic')
  const details = input.details || {}
  const featureKey = String(details.feature || details.module || '').trim() || null
  const label = featureLabel(featureKey)
  const planSlug = details.plan ? String(details.plan) : null
  const used = details.used != null ? Number(details.used) : null
  const limit = details.limit != null ? Number(details.limit) : null

  const base = {
    code,
    featureKey,
    featureLabel: featureKey ? label : null,
    planSlug,
    planName: null as string | null,
    used,
    limit,
    requestId: input.requestId || null,
    message: String(input.message || '').trim(),
  }

  switch (code) {
    case 'plan_feature_required':
      return {
        ...base,
        title: 'Recurso fora do seu plano',
        message:
          base.message ||
          `${label} não está incluído no plano atual. Faça upgrade para liberar.`,
      }
    case 'module_disabled':
      return {
        ...base,
        title: 'Módulo indisponível',
        message:
          base.message ||
          `${label} está desabilitado para a sua conta ou plano.`,
      }
    case 'plan_brand_limit':
      return {
        ...base,
        title: 'Limite de marcas atingido',
        message:
          base.message ||
          `Seu plano permite ${limit ?? 'N'} marca(s). Você já usa ${used ?? 'o máximo'}.`,
      }
    case 'plan_multi_brand_required':
      return {
        ...base,
        title: 'Multi-marca não incluída',
        message:
          base.message ||
          'Seu plano permite apenas uma organização. Faça upgrade para multi-marca.',
      }
    case 'plan_instance_limit':
      return {
        ...base,
        title: 'Limite de WhatsApp atingido',
        message:
          base.message ||
          `Seu plano permite ${limit ?? 'N'} número(s) WhatsApp. Você já usa ${used ?? 'o máximo'}.`,
      }
    case 'plan_leads_day_limit':
      return {
        ...base,
        title: 'Limite diário de leads',
        message:
          base.message ||
          `Você atingiu o limite diário de captação (${limit ?? 'N'} leads).`,
      }
    case 'plan_leads_month_limit':
      return {
        ...base,
        title: 'Limite mensal de leads',
        message:
          base.message ||
          `Você atingiu o limite mensal de captação (${limit ?? 'N'} leads).`,
      }
    case 'brand_inactive':
      return {
        ...base,
        title: 'Organização inativa',
        message: base.message || 'Esta organização está suspensa ou arquivada.',
      }
    case 'maintenance_mode':
      return {
        ...base,
        title: 'Manutenção',
        message: base.message || 'A plataforma está em manutenção no momento.',
      }
    default:
      return {
        ...base,
        title: 'Ação bloqueada pelo plano',
        message: base.message || 'Seu plano atual não permite esta ação. Veja as opções de upgrade.',
      }
  }
}

export function subscribePlanUpgrade(listener: Listener): () => void {
  listeners.add(listener)
  listener(openPayload)
  return () => {
    listeners.delete(listener)
  }
}

export function getPlanUpgradePayload(): PlanUpgradePayload | null {
  return openPayload
}

export function openPlanUpgrade(payload: PlanUpgradePayload) {
  openPayload = payload
  listeners.forEach(l => l(openPayload))
}

export function closePlanUpgrade() {
  openPayload = null
  listeners.forEach(l => l(null))
}

/** Client-side gate helper */
export function openPlanUpgradeForFeature(
  featureKey: string,
  message?: string,
  planSlug?: string | null,
) {
  openPlanUpgrade(
    buildUpgradePayload({
      code: 'plan_feature_required',
      message: message || undefined,
      details: { feature: featureKey, plan: planSlug },
    }),
  )
}

export function openPlanUpgradeForModule(
  moduleKey: string,
  message?: string,
  planSlug?: string | null,
) {
  openPlanUpgrade(
    buildUpgradePayload({
      code: 'module_disabled',
      message: message || undefined,
      details: { module: moduleKey, plan: planSlug },
    }),
  )
}
