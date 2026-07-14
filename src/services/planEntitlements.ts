/**
 * Plan entitlements — resolve subscription + limits/features for a user/brand.
 * Enforces commercial plan gates (features, brand count, instances, leads).
 */

import { query, queryOne } from "../config/database"
import { getPlatformTools, type PlatformModules } from "./platformTools"

/**
 * Capabilities that a commercial plan can enable/disable.
 * These are enforced by planGuard + getEntitlements (modules + assertPlanFeature).
 */
export type PlanFeatureKey =
  | "radar"
  | "crm"
  | "smart_import"
  | "prospect_ai"
  | "creative_ai"
  | "video_studio"
  | "meta_integration"
  | "custom_domain"
  | "corporate_email"
  | "campaigns"
  | "automations"
  | "flow_builder"
  | "whatsapp"
  | "agent_workspace"
  | "multi_brand"
  | "api"
  | "affiliates"

/** Ordered catalog for master UI + docs (single source of truth for labels). */
export const PLAN_FEATURE_CATALOG: Array<{
  key: PlanFeatureKey
  label: string
  group: string
  description: string
}> = [
  { key: "radar", label: "Radar geográfico", group: "Captação", description: "Busca de leads no mapa" },
  { key: "smart_import", label: "Importação inteligente", group: "Captação", description: "Import de listas com IA" },
  { key: "prospect_ai", label: "Inteligência de prospecção", group: "Captação", description: "IA de prospecção" },
  { key: "crm", label: "CRM, catálogo e vendas", group: "Comercial", description: "Clientes, produtos, pedidos, checkout, pagamentos" },
  { key: "whatsapp", label: "WhatsApp", group: "Canais", description: "Instâncias, inbox e disparos WhatsApp" },
  { key: "campaigns", label: "Campanhas", group: "Canais", description: "Campanhas e disparos em massa" },
  { key: "automations", label: "Automações", group: "Canais", description: "Automações e regras de fluxo" },
  { key: "flow_builder", label: "Construtor de fluxos", group: "Canais", description: "Flow builder visual" },
  { key: "agent_workspace", label: "Agente / workspace", group: "IA", description: "Atendente IA e workspace do agente" },
  { key: "creative_ai", label: "Criativos IA", group: "IA", description: "Posts, anúncios, galeria e copy" },
  { key: "video_studio", label: "Video studio", group: "IA", description: "Geração e edição de vídeo" },
  { key: "meta_integration", label: "Instagram + Facebook", group: "Presença", description: "Integrações Meta" },
  { key: "custom_domain", label: "Domínio customizado", group: "Presença", description: "Domínio próprio da loja" },
  { key: "corporate_email", label: "E-mail corporativo", group: "Presença", description: "Caixas @seudominio" },
  { key: "affiliates", label: "Programa de afiliados", group: "Rede", description: "Afiliados da marca e repasses" },
  { key: "multi_brand", label: "Multi-marca", group: "Rede", description: "Mais de uma organização" },
  { key: "api", label: "API e webhooks", group: "Enterprise", description: "Acesso API dedicado" },
]

export const ALL_PLAN_FEATURE_KEYS: PlanFeatureKey[] = PLAN_FEATURE_CATALOG.map((f) => f.key)

export type PlanLimits = {
  leads_per_day: number
  leads_per_month: number
  instances: number
  brands: number
  disparos_per_month: number
  features: Partial<Record<PlanFeatureKey, boolean>>
}

export type EntitlementsSnapshot = {
  subscription: {
    id: string | null
    status: string
    plan_id: string | null
    plan_slug: string | null
    plan_name: string | null
    brand_id: string | null
    current_period_end: string | null
  }
  limits: PlanLimits
  features: Record<PlanFeatureKey, boolean>
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

const UNLIMITED = -1

const DEFAULT_LIMITS: PlanLimits = {
  leads_per_day: 50,
  leads_per_month: 1500,
  instances: 1,
  brands: 1,
  disparos_per_month: 200,
  features: {
    radar: true,
    crm: true,
    smart_import: true,
    prospect_ai: true,
    creative_ai: false,
    video_studio: false,
    meta_integration: false,
    custom_domain: false,
    corporate_email: false,
    campaigns: false,
    automations: false,
    flow_builder: false,
    whatsapp: true,
    agent_workspace: true,
    multi_brand: false,
    api: false,
    affiliates: true,
  },
}

/** Platform module → required plan feature (null = no plan gate) */
export const MODULE_PLAN_FEATURE: Partial<Record<keyof PlatformModules, PlanFeatureKey | null>> = {
  whatsapp: "whatsapp",
  catalog: "crm",
  prospect_radar: "radar",
  lead_import: "smart_import",
  campaigns: "campaigns",
  automations: "automations",
  flow_builder: "flow_builder",
  ai_creatives: "creative_ai",
  video_studio: "video_studio",
  instagram: "meta_integration",
  facebook: "meta_integration",
  affiliates: "affiliates",
  agent_workspace: "agent_workspace",
}

function parseJson<T>(v: any, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === "object") return v as T
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

function normalizeLimits(raw: any): PlanLimits {
  const base = { ...DEFAULT_LIMITS, features: { ...DEFAULT_LIMITS.features } }
  const parsed = parseJson<Partial<PlanLimits>>(raw, {})
  const planFeatures = parseJson(parsed.features, {}) as Partial<Record<PlanFeatureKey, boolean>>
  const features = {
    ...base.features,
    ...planFeatures,
  } as Record<PlanFeatureKey, boolean>

  /* Backward-compat for plans saved before new keys existed */
  if (features.affiliates === undefined) features.affiliates = true
  if (features.whatsapp === undefined) features.whatsapp = true
  if (features.agent_workspace === undefined) features.agent_workspace = true
  if (features.flow_builder === undefined) {
    features.flow_builder = features.automations === true
  }
  if (features.video_studio === undefined) {
    features.video_studio = features.creative_ai === true
  }
  /*
   * Planos legados (ex.: scale) omitem `features.campaigns` no JSON.
   * DEFAULT é false (starter); se a chave não veio no plano, habilita campanhas
   * para não derrubar clientes pagos com 403 no chat/dashboard.
   * Starter define explicitamente campaigns:false.
   */
  if (!Object.prototype.hasOwnProperty.call(planFeatures, "campaigns")) {
    features.campaigns = true
  }
  return {
    leads_per_day: Number(parsed.leads_per_day ?? base.leads_per_day),
    leads_per_month: Number(parsed.leads_per_month ?? base.leads_per_month),
    instances: Number(parsed.instances ?? base.instances),
    brands: Number(parsed.brands ?? base.brands),
    disparos_per_month: Number(parsed.disparos_per_month ?? base.disparos_per_month),
    features,
  }
}

function isUnlimited(n: number): boolean {
  return n === UNLIMITED || n < 0
}

export function hasFeature(limits: PlanLimits, feature: PlanFeatureKey): boolean {
  const v = limits.features[feature]
  if (v === false) return false
  if (v === true) return true
  /* undefined → treat as false for gated features except crm/radar defaults */
  return false
}

/** Super-admin and active paid-like statuses get full access when no plan row */
const FULL_FEATURES: Record<PlanFeatureKey, boolean> = {
  radar: true,
  crm: true,
  smart_import: true,
  prospect_ai: true,
  creative_ai: true,
  video_studio: true,
  meta_integration: true,
  custom_domain: true,
  corporate_email: true,
  campaigns: true,
  automations: true,
  flow_builder: true,
  whatsapp: true,
  agent_workspace: true,
  multi_brand: true,
  api: true,
  affiliates: true,
}

const FULL_LIMITS: PlanLimits = {
  leads_per_day: -1,
  leads_per_month: -1,
  instances: -1,
  brands: -1,
  disparos_per_month: -1,
  features: FULL_FEATURES,
}

export async function isSuperAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false
  const row = await queryOne<{ is_super_admin: boolean }>(
    `SELECT is_super_admin FROM users WHERE id = ? AND is_active = true`,
    [userId],
  ).catch(() => null)
  return !!row?.is_super_admin
}

/**
 * Production may have a legacy subscriptions table:
 *   (id, account_id, plan_id, billing_cycle, status, next_billing_date, brand_id, …)
 * while the product code expects:
 *   (id, user_id, brand_id, plan_id, status, gateway, trial_ends_at, period_*, metadata, …)
 * Bring the table forward and keep dual-read for account_id ↔ user_id.
 */
let subsSchemaReady = false
let subsSchemaPromise: Promise<void> | null = null
let subsColsCache: Set<string> | null = null

async function getSubscriptionColumns(): Promise<Set<string>> {
  if (subsColsCache) return subsColsCache
  const rows = await query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions'`,
  ).catch(() => [])
  subsColsCache = new Set(
    (Array.isArray(rows) ? rows : []).map((r: any) => String(r.column_name || r.COLUMN_NAME || "")),
  )
  return subsColsCache
}

export async function ensureSubscriptionsSchema(): Promise<void> {
  if (subsSchemaReady) return
  if (subsSchemaPromise) return subsSchemaPromise
  subsSchemaPromise = (async () => {
    // Base table if nothing exists yet
    await query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NULL,
        account_id VARCHAR(36) NULL,
        brand_id VARCHAR(36) NULL,
        plan_id VARCHAR(36) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'trialing',
        billing_cycle VARCHAR(24) NULL,
        gateway VARCHAR(24) NULL,
        gateway_customer_id VARCHAR(120) NULL,
        gateway_subscription_id VARCHAR(120) NULL,
        trial_ends_at TIMESTAMPTZ NULL,
        current_period_start TIMESTAMPTZ NULL,
        current_period_end TIMESTAMPTZ NULL,
        next_billing_date TIMESTAMPTZ NULL,
        canceled_at TIMESTAMPTZ NULL,
        metadata JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => undefined)

    const alters = [
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id VARCHAR(36)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS brand_id VARCHAR(36)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(24)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway VARCHAR(24)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_customer_id VARCHAR(120)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS gateway_subscription_id VARCHAR(120)`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS metadata JSONB`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    ]
    for (const sql of alters) {
      await query(sql).catch(() => undefined)
    }

    // Bridge legacy account_id ↔ user_id
    await query(
      `UPDATE subscriptions SET user_id = account_id
        WHERE (user_id IS NULL OR user_id = '') AND account_id IS NOT NULL AND account_id <> ''`,
    ).catch(() => undefined)
    await query(
      `UPDATE subscriptions SET account_id = user_id
        WHERE (account_id IS NULL OR account_id = '') AND user_id IS NOT NULL AND user_id <> ''`,
    ).catch(() => undefined)

    // Soften NOT NULL on billing_cycle if present (legacy required it)
    await query(
      `ALTER TABLE subscriptions ALTER COLUMN billing_cycle DROP NOT NULL`,
    ).catch(() => undefined)
    await query(
      `ALTER TABLE subscriptions ALTER COLUMN account_id DROP NOT NULL`,
    ).catch(() => undefined)

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions (account_id)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_brand ON subscriptions (brand_id)`)
    } catch {
      /* ignore */
    }

    subsColsCache = null
    subsSchemaReady = true
  })().finally(() => {
    subsSchemaPromise = null
  })
  return subsSchemaPromise
}

export async function resolveSubscription(userId: string, brandId?: string | null) {
  await ensureSubscriptionsSchema()
  const bid = String(brandId || "").trim()
  const uid = String(userId || "").trim()

  if (bid) {
    const byBrand = await queryOne<any>(
      `SELECT s.*, p.slug AS plan_slug, p.name AS plan_name, p.limits AS plan_limits
         FROM subscriptions s
         LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.brand_id = ?
          AND s.status IN ('active', 'trialing', 'past_due')
        ORDER BY s.updated_at DESC NULLS LAST
        LIMIT 1`,
      [bid],
    ).catch(() => null)
    if (byBrand) return byBrand
  }

  // Dual owner column: user_id (new) or account_id (legacy)
  return await queryOne<any>(
    `SELECT s.*, p.slug AS plan_slug, p.name AS plan_name, p.limits AS plan_limits
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE (s.user_id = ? OR s.account_id = ?)
        AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1`,
    [uid, uid],
  ).catch(() => null)
}

export async function getUsage(userId: string): Promise<EntitlementsSnapshot["usage"]> {
  const brands = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM brand_units WHERE user_id = ? AND COALESCE(status, 'active') <> 'archived'`,
    [userId],
  ).catch(() => ({ count: "0" }))

  // Só sessões do sistema (admin) contam no plano — sessões de afiliados
  // são por organização/parceiro e não bloqueiam o limite do plano da marca.
  const instances = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM whatsapp_instances
      WHERE created_by = ?
        AND (owner_type = 'admin' OR owner_type IS NULL OR owner_type = '')`,
    [userId],
  ).catch(() => ({ count: "0" }))

  const leadsToday = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers
      WHERE user_id = ? AND created_at >= date_trunc('day', NOW())`,
    [userId],
  ).catch(() => ({ count: "0" }))

  const leadsMonth = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers
      WHERE user_id = ? AND created_at >= date_trunc('month', NOW())`,
    [userId],
  ).catch(() => ({ count: "0" }))

  return {
    brands: Number(brands?.count || 0),
    instances: Number(instances?.count || 0),
    leads_today: Number(leadsToday?.count || 0),
    leads_month: Number(leadsMonth?.count || 0),
  }
}

export async function getBrandStatus(brandId: string | null | undefined): Promise<{
  id: string | null
  status: string | null
  active: boolean
}> {
  const id = String(brandId || "").trim()
  if (!id) return { id: null, status: null, active: true }
  const row = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM brand_units WHERE id = ? LIMIT 1`,
    [id],
  ).catch(() => null)
  if (!row) return { id, status: "missing", active: false }
  const status = String(row.status || "active").toLowerCase()
  return {
    id: row.id,
    status,
    active: status === "active",
  }
}

export async function getEntitlements(
  userId: string,
  brandId?: string | null,
): Promise<EntitlementsSnapshot> {
  const superAdmin = await isSuperAdminUser(userId)
  const tools = await getPlatformTools()
  const brand = await getBrandStatus(brandId)
  const usage = await getUsage(userId)

  if (superAdmin) {
    return {
      subscription: {
        id: null,
        status: "super_admin",
        plan_id: null,
        plan_slug: "super",
        plan_name: "Super Admin",
        brand_id: brandId || null,
        current_period_end: null,
      },
      limits: FULL_LIMITS,
      features: FULL_FEATURES,
      modules: tools.modules,
      usage,
      brand,
      maintenance_mode: !!tools.maintenance_mode,
      is_super_admin: true,
    }
  }

  const sub = await resolveSubscription(userId, brandId)
  let limits = DEFAULT_LIMITS
  let features = { ...DEFAULT_LIMITS.features } as Record<PlanFeatureKey, boolean>

  if (sub) {
    limits = normalizeLimits(sub.plan_limits)
    features = { ...DEFAULT_LIMITS.features, ...limits.features } as Record<PlanFeatureKey, boolean>
  } else {
    /* No subscription: keep starter-like defaults (already DEFAULT_LIMITS) */
    features = { ...DEFAULT_LIMITS.features } as Record<PlanFeatureKey, boolean>
  }

  /* Effective modules = platform modules AND plan features where applicable */
  const modules = { ...tools.modules } as PlatformModules
  for (const [mod, feat] of Object.entries(MODULE_PLAN_FEATURE) as Array<
    [keyof PlatformModules, PlanFeatureKey | null]
  >) {
    if (tools.modules[mod] === false) {
      modules[mod] = false
      continue
    }
    if (feat && features[feat] === false) {
      modules[mod] = false
    }
  }

  return {
    subscription: {
      id: sub?.id || null,
      status: sub?.status || "none",
      plan_id: sub?.plan_id || null,
      plan_slug: sub?.plan_slug || null,
      plan_name: sub?.plan_name || null,
      brand_id: sub?.brand_id || null,
      current_period_end: sub?.current_period_end || null,
    },
    limits,
    features,
    modules,
    usage,
    brand,
    maintenance_mode: !!tools.maintenance_mode,
    is_super_admin: false,
  }
}

export class EntitlementError extends Error {
  code: string
  status: number
  details?: Record<string, any>

  constructor(code: string, message: string, status = 403, details?: Record<string, any>) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

/** Contas Meta já vinculadas não podem ser trancadas pelo plano (grandfather). */
async function hasExistingMetaConnection(brandId: string | null | undefined): Promise<boolean> {
  const bid = String(brandId || "").trim()
  if (!bid) return false
  const ig = await queryOne<{ id: string }>(
    `SELECT id FROM instagram_connections
      WHERE brand_id = ?
        AND access_token IS NOT NULL
        AND length(trim(access_token)) > 0
      LIMIT 1`,
    [bid],
  ).catch(() => null)
  if (ig) return true
  const fb = await queryOne<{ id: string }>(
    `SELECT id FROM facebook_connections
      WHERE brand_id = ?
        AND page_access_token IS NOT NULL
        AND length(trim(page_access_token)) > 0
      LIMIT 1`,
    [bid],
  ).catch(() => null)
  return !!fb
}

/** Marca já usa automações / fluxos — não trancar UI de automações. */
async function hasExistingAutomations(
  userId: string,
  brandId: string | null | undefined,
): Promise<boolean> {
  const bid = String(brandId || "").trim()
  const uid = String(userId || "").trim()
  if (bid) {
    const ba = await queryOne<{ id: string }>(
      `SELECT id FROM brand_automations WHERE brand_id = ? LIMIT 1`,
      [bid],
    ).catch(() => null)
    if (ba) return true
    // Instagram conectado usa aba de automações IG
    if (await hasExistingMetaConnection(bid)) return true
  }
  if (uid) {
    const rules = await queryOne<{ id: string }>(
      `SELECT id FROM automation_rules WHERE user_id = ? LIMIT 1`,
      [uid],
    ).catch(() => null)
    if (rules) return true
  }
  return false
}

/** Já tem histórico/disparos de campanha — grandfather (não bloquear 403 no chat). */
async function hasExistingCampaigns(userId: string): Promise<boolean> {
  const uid = String(userId || "").trim()
  if (!uid) return false
  const hist = await queryOne<{ id: string }>(
    `SELECT id FROM campaign_history WHERE user_id = ? LIMIT 1`,
    [uid],
  ).catch(() => null)
  if (hist) return true
  const leads = await queryOne<{ id: string }>(
    `SELECT id FROM campaign_leads WHERE user_id = ? LIMIT 1`,
    [uid],
  ).catch(() => null)
  return !!leads
}

export async function assertPlanFeature(
  userId: string,
  feature: PlanFeatureKey,
  brandId?: string | null,
): Promise<void> {
  if (await isSuperAdminUser(userId)) return
  const ent = await getEntitlements(userId, brandId)
  if (ent.features[feature] === false) {
    // Não derrubar Instagram/Facebook se a conta JÁ está conectada nesta marca
    if (feature === "meta_integration" && (await hasExistingMetaConnection(brandId))) {
      return
    }
    // Não derrubar aba de automações se a marca já opera com elas / Meta
    if (feature === "automations" && (await hasExistingAutomations(userId, brandId))) {
      return
    }
    // Não derrubar Campanhas se a conta já tem histórico de disparos
    if (feature === "campaigns" && (await hasExistingCampaigns(userId))) {
      return
    }
    throw new EntitlementError(
      "plan_feature_required",
      `Seu plano não inclui: ${feature}. Faça upgrade para continuar.`,
      403,
      { feature, plan: ent.subscription.plan_slug },
    )
  }
}

export async function assertBrandLimit(userId: string): Promise<void> {
  if (await isSuperAdminUser(userId)) return
  const ent = await getEntitlements(userId)
  const max = ent.limits.brands
  if (isUnlimited(max)) return
  if (ent.usage.brands >= max) {
    throw new EntitlementError(
      "plan_brand_limit",
      `Limite de marcas do plano atingido (${max}). Faça upgrade para criar mais.`,
      403,
      { used: ent.usage.brands, limit: max },
    )
  }
  if (!ent.features.multi_brand && ent.usage.brands >= 1) {
    throw new EntitlementError(
      "plan_multi_brand_required",
      "Seu plano permite apenas 1 marca. Faça upgrade para multi-brand.",
      403,
      { used: ent.usage.brands },
    )
  }
}

export async function assertInstanceLimit(userId: string): Promise<void> {
  if (await isSuperAdminUser(userId)) return
  const ent = await getEntitlements(userId)
  const max = ent.limits.instances
  if (isUnlimited(max)) return
  if (ent.usage.instances >= max) {
    throw new EntitlementError(
      "plan_instance_limit",
      `Limite de números WhatsApp do plano atingido (${max}).`,
      403,
      { used: ent.usage.instances, limit: max },
    )
  }
}

export async function assertLeadCaptureLimit(userId: string): Promise<void> {
  if (await isSuperAdminUser(userId)) return
  const ent = await getEntitlements(userId)
  const day = ent.limits.leads_per_day
  const month = ent.limits.leads_per_month
  if (!isUnlimited(day) && ent.usage.leads_today >= day) {
    throw new EntitlementError(
      "plan_leads_day_limit",
      `Limite diário de leads atingido (${day}).`,
      429,
      { used: ent.usage.leads_today, limit: day },
    )
  }
  if (!isUnlimited(month) && ent.usage.leads_month >= month) {
    throw new EntitlementError(
      "plan_leads_month_limit",
      `Limite mensal de leads atingido (${month}).`,
      429,
      { used: ent.usage.leads_month, limit: month },
    )
  }
}

export async function assertBrandActive(brandId: string | null | undefined): Promise<void> {
  const b = await getBrandStatus(brandId)
  if (!b.id) return
  if (!b.active) {
    throw new EntitlementError(
      "brand_inactive",
      b.status === "suspended"
        ? "Esta organização está suspensa. Contate o suporte."
        : "Esta organização está arquivada.",
      403,
      { brand_id: b.id, status: b.status },
    )
  }
}

export async function assignPlanToUser(params: {
  userId: string
  planId: string
  brandId?: string | null
  status?: string
  trialDays?: number
}): Promise<any> {
  await ensureSubscriptionsSchema()

  const plan = await queryOne<any>(`SELECT * FROM plans WHERE id = ?`, [params.planId])
  if (!plan) throw new EntitlementError("plan_not_found", "Plano não encontrado", 404)

  const userId = String(params.userId || "").trim()
  if (!userId) {
    throw new EntitlementError(
      "org_missing_owner",
      "Organização sem dono (user_id). Associe um usuário dono antes de atribuir plano.",
      400,
    )
  }

  const status = params.status || "active"
  const trialEnds =
    status === "trialing" && params.trialDays
      ? new Date(Date.now() + params.trialDays * 86400000)
      : null

  const brandId = params.brandId ? String(params.brandId).trim() : null
  const cols = await getSubscriptionColumns()
  const hasUserId = cols.has("user_id")
  const hasAccountId = cols.has("account_id")
  const hasCanceledAt = cols.has("canceled_at")
  const hasBillingCycle = cols.has("billing_cycle")
  const hasGateway = cols.has("gateway")
  const hasTrial = cols.has("trial_ends_at")
  const hasPeriodStart = cols.has("current_period_start")
  const hasPeriodEnd = cols.has("current_period_end")
  const hasNextBilling = cols.has("next_billing_date")
  const hasMetadata = cols.has("metadata")
  const hasUpdatedAt = cols.has("updated_at")

  /* Deactivate previous active subs (brand-scoped preferred) */
  const cancelSet = [
    `status = 'canceled'`,
    hasCanceledAt ? `canceled_at = NOW()` : null,
    hasUpdatedAt ? `updated_at = NOW()` : null,
  ]
    .filter(Boolean)
    .join(", ")

  if (brandId) {
    const ownerClause = [
      hasUserId ? `user_id = ?` : null,
      hasAccountId ? `account_id = ?` : null,
    ]
      .filter(Boolean)
      .join(" OR ")
    const ownerParams: any[] = []
    if (hasUserId) ownerParams.push(userId)
    if (hasAccountId) ownerParams.push(userId)
    await query(
      `UPDATE subscriptions SET ${cancelSet}
        WHERE brand_id = ?
          AND status IN ('active', 'trialing')
          ${ownerClause ? `AND (${ownerClause})` : ""}`,
      [brandId, ...ownerParams],
    ).catch(async () => {
      // Minimal cancel if canceled_at missing etc.
      await query(
        `UPDATE subscriptions SET status = 'canceled'
          WHERE brand_id = ? AND status IN ('active', 'trialing')`,
        [brandId],
      )
    })
  } else {
    const whereOwner = [
      hasUserId ? `user_id = ?` : null,
      hasAccountId ? `account_id = ?` : null,
    ]
      .filter(Boolean)
      .join(" OR ")
    const ownerParams: any[] = []
    if (hasUserId) ownerParams.push(userId)
    if (hasAccountId) ownerParams.push(userId)
    if (whereOwner) {
      await query(
        `UPDATE subscriptions SET ${cancelSet}
          WHERE (${whereOwner})
            AND (brand_id IS NULL OR brand_id = '')
            AND status IN ('active', 'trialing')`,
        ownerParams,
      ).catch(() => undefined)
    }
  }

  const { v4: uuidv4 } = await import("uuid")
  const id = uuidv4()
  const periodStart = new Date()
  const periodEnd = new Date(Date.now() + 30 * 86400000)
  const billingCycle =
    String(plan.interval || plan.billing_cycle || "monthly").toLowerCase() || "monthly"

  // Build column-safe INSERT for legacy + modern schemas
  const insertCols: string[] = ["id", "plan_id", "status"]
  const insertVals: any[] = [id, params.planId, status]
  if (hasUserId) {
    insertCols.push("user_id")
    insertVals.push(userId)
  }
  if (hasAccountId) {
    insertCols.push("account_id")
    insertVals.push(userId)
  }
  if (cols.has("brand_id")) {
    insertCols.push("brand_id")
    insertVals.push(brandId)
  }
  if (hasBillingCycle) {
    insertCols.push("billing_cycle")
    insertVals.push(billingCycle)
  }
  if (hasGateway) {
    insertCols.push("gateway")
    insertVals.push("manual")
  }
  if (hasTrial) {
    insertCols.push("trial_ends_at")
    insertVals.push(trialEnds)
  }
  if (hasPeriodStart) {
    insertCols.push("current_period_start")
    insertVals.push(periodStart)
  }
  if (hasPeriodEnd) {
    insertCols.push("current_period_end")
    insertVals.push(periodEnd)
  }
  if (hasNextBilling) {
    insertCols.push("next_billing_date")
    insertVals.push(periodEnd)
  }
  if (hasMetadata) {
    insertCols.push("metadata")
    insertVals.push(JSON.stringify({ source: "master_assign" }))
  }
  if (cols.has("created_at")) insertCols.push("created_at")
  if (hasUpdatedAt) insertCols.push("updated_at")

  const placeholders = insertCols
    .map((c) => {
      if (c === "created_at" || c === "updated_at") return "NOW()"
      return "?"
    })
    .join(", ")

  // Values only for non-NOW columns
  const valueParams = insertVals

  try {
    await query(
      `INSERT INTO subscriptions (${insertCols.join(", ")})
       VALUES (${placeholders})`,
      valueParams,
    )
  } catch (err: any) {
    throw new EntitlementError(
      "assign_failed",
      err?.message || "Falha ao gravar assinatura",
      400,
      { detail: String(err?.message || err) },
    )
  }

  return queryOne(
    `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE s.id = ?`,
    [id],
  )
}
