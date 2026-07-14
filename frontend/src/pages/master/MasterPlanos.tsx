import { useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Star,
  Save,
  Link2,
  Copy,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Infinity as InfinityIcon,
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

/** Mirrors backend PLAN_FEATURE_CATALOG — labels for master UI */
type FeatureKey =
  | 'radar'
  | 'crm'
  | 'smart_import'
  | 'prospect_ai'
  | 'creative_ai'
  | 'video_studio'
  | 'meta_integration'
  | 'custom_domain'
  | 'corporate_email'
  | 'campaigns'
  | 'automations'
  | 'flow_builder'
  | 'whatsapp'
  | 'agent_workspace'
  | 'multi_brand'
  | 'api'
  | 'affiliates'

type FeatureMeta = { key: FeatureKey; label: string; group: string; description: string }

const FALLBACK_FEATURE_CATALOG: FeatureMeta[] = [
  { key: 'radar', label: 'Radar geográfico', group: 'Captação', description: 'Busca de leads no mapa' },
  { key: 'smart_import', label: 'Importação inteligente', group: 'Captação', description: 'Import de listas com IA' },
  { key: 'prospect_ai', label: 'Inteligência de prospecção', group: 'Captação', description: 'IA de prospecção' },
  { key: 'crm', label: 'CRM, catálogo e vendas', group: 'Comercial', description: 'Clientes, produtos, pedidos, checkout, pagamentos' },
  { key: 'whatsapp', label: 'WhatsApp', group: 'Canais', description: 'Instâncias, inbox e disparos WhatsApp' },
  { key: 'campaigns', label: 'Campanhas', group: 'Canais', description: 'Campanhas e disparos em massa' },
  { key: 'automations', label: 'Automações', group: 'Canais', description: 'Automações e regras de fluxo' },
  { key: 'flow_builder', label: 'Construtor de fluxos', group: 'Canais', description: 'Flow builder visual' },
  { key: 'agent_workspace', label: 'Agente / workspace', group: 'IA', description: 'Atendente IA e workspace do agente' },
  { key: 'creative_ai', label: 'Criativos IA', group: 'IA', description: 'Posts, anúncios, galeria e copy' },
  { key: 'video_studio', label: 'Video studio', group: 'IA', description: 'Geração e edição de vídeo' },
  { key: 'meta_integration', label: 'Instagram + Facebook', group: 'Presença', description: 'Integrações Meta' },
  { key: 'custom_domain', label: 'Domínio customizado', group: 'Presença', description: 'Domínio próprio da loja' },
  { key: 'corporate_email', label: 'E-mail corporativo', group: 'Presença', description: 'Caixas @seudominio' },
  { key: 'affiliates', label: 'Programa de afiliados', group: 'Rede', description: 'Afiliados da marca e repasses' },
  { key: 'multi_brand', label: 'Multi-marca', group: 'Rede', description: 'Mais de uma organização' },
  { key: 'api', label: 'API e webhooks', group: 'Enterprise', description: 'Acesso API dedicado' },
]

type PlanLimits = {
  leads_per_day: number
  leads_per_month: number
  instances: number
  brands: number
  disparos_per_month: number
  features: Partial<Record<FeatureKey, boolean>>
}

interface Plan {
  id: string
  slug: string
  name: string
  tagline: string | null
  price_cents: number
  interval: string
  billing_type: 'subscription' | 'one_time' | string
  features: string[] | string
  limits: any
  is_active: boolean
  is_featured: boolean
  sort_order: number
  stripe_product_id: string | null
  stripe_price_id: string | null
  payment_link: string | null
  payment_link_id: string | null
}

type Draft = {
  name: string
  tagline: string
  price_cents: number
  interval: string
  billing_type: string
  is_active: boolean
  is_featured: boolean
  limits: PlanLimits
  /** Optional extra marketing lines (beyond auto bullets) */
  marketing_extra: string[]
}

const moneyBR = (cents: number) =>
  cents > 0
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Sob consulta'

function asStringList(v: Plan['features']): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

function parseLimits(raw: any): PlanLimits {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      obj = {}
    }
  }
  const f = (obj?.features && typeof obj.features === 'object' ? obj.features : {}) as Record<
    string,
    boolean
  >
  return {
    leads_per_day: Number(obj?.leads_per_day ?? 50),
    leads_per_month: Number(obj?.leads_per_month ?? 1500),
    instances: Number(obj?.instances ?? 1),
    brands: Number(obj?.brands ?? 1),
    disparos_per_month: Number(obj?.disparos_per_month ?? 200),
    features: { ...f },
  }
}

function fmtLimit(n: number, unit = ''): string {
  if (n < 0 || n === -1) return 'Ilimitado'
  return `${n.toLocaleString('pt-BR')}${unit}`
}

function buildMarketingBullets(limits: PlanLimits, catalog: FeatureMeta[]): string[] {
  const bullets: string[] = []
  bullets.push(`Até ${fmtLimit(limits.leads_per_day)} leads/dia · ${fmtLimit(limits.leads_per_month)}/mês`)
  bullets.push(
    `${fmtLimit(limits.brands)} marca(s) · ${fmtLimit(limits.instances)} WhatsApp · ${fmtLimit(limits.disparos_per_month)} disparos/mês`,
  )
  for (const meta of catalog) {
    if (limits.features[meta.key] === true) {
      bullets.push(meta.label)
    }
  }
  return bullets
}

/**
 * Dark console fields — visual classes only.
 * Real dark bg/ink enforced by .master-console input rules in index.css
 * (global product inputs force white surface otherwise).
 */
const fieldClass =
  'master-plan-field w-full h-10 px-3.5 rounded-xl text-[13px] font-medium focus:outline-none'
const areaClass =
  'master-plan-field w-full px-3.5 py-2.5 rounded-xl text-[13px] font-mono resize-none focus:outline-none'
const selectClass = `${fieldClass} appearance-none cursor-pointer`

export function MasterPlanos() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [catalog, setCatalog] = useState<FeatureMeta[]>(FALLBACK_FEATURE_CATALOG)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await masterApi.listPlans()
      setPlans(r.plans as Plan[])
      if (Array.isArray((r as any).feature_catalog) && (r as any).feature_catalog.length) {
        setCatalog((r as any).feature_catalog as FeatureMeta[])
      }
    } catch (err: any) {
      setError(err?.message || 'Erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const catalogByGroup = useMemo(() => {
    const map = new Map<string, FeatureMeta[]>()
    for (const f of catalog) {
      const list = map.get(f.group) || []
      list.push(f)
      map.set(f.group, list)
    }
    return Array.from(map.entries())
  }, [catalog])

  function startEdit(p: Plan) {
    const limits = parseLimits(p.limits)
    // ensure every catalog key present
    for (const meta of catalog) {
      if (limits.features[meta.key] === undefined) {
        // sensible defaults for missing keys
        if (meta.key === 'whatsapp' || meta.key === 'agent_workspace' || meta.key === 'affiliates') {
          limits.features[meta.key] = true
        } else if (meta.key === 'flow_builder') {
          limits.features[meta.key] = limits.features.automations === true
        } else if (meta.key === 'video_studio') {
          limits.features[meta.key] = limits.features.creative_ai === true
        } else {
          limits.features[meta.key] = false
        }
      }
    }
    setEditing(p.id)
    setDraft({
      name: p.name,
      tagline: p.tagline || '',
      price_cents: p.price_cents,
      interval: p.interval,
      billing_type: p.billing_type || 'subscription',
      is_active: p.is_active,
      is_featured: p.is_featured,
      limits,
      marketing_extra: [],
    })
  }

  function setLimitNum(key: keyof Omit<PlanLimits, 'features'>, value: string) {
    setDraft(d => {
      if (!d) return d
      const n = value.trim() === '' ? 0 : parseInt(value, 10)
      return {
        ...d,
        limits: {
          ...d.limits,
          [key]: Number.isFinite(n) ? n : 0,
        },
      }
    })
  }

  function toggleFeature(key: FeatureKey) {
    setDraft(d => {
      if (!d) return d
      const cur = d.limits.features[key] === true
      return {
        ...d,
        limits: {
          ...d.limits,
          features: { ...d.limits.features, [key]: !cur },
        },
      }
    })
  }

  async function save(id: string) {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const marketing = [
        ...buildMarketingBullets(draft.limits, catalog),
        ...draft.marketing_extra.filter(Boolean),
      ]
      // Deduplicate while preserving order
      const seen = new Set<string>()
      const features = marketing.filter(line => {
        const k = line.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

      await masterApi.updatePlan(id, {
        name: draft.name,
        tagline: draft.tagline,
        price_cents: draft.price_cents,
        interval: draft.interval,
        billing_type: draft.billing_type,
        is_active: draft.is_active,
        is_featured: draft.is_featured,
        limits: draft.limits,
        features,
      })
      setEditing(null)
      setDraft(null)
      setFlash('Plano salvo. Limites e módulos passam a valer no próximo refresh de entitlements dos tenants.')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Erro')
    } finally {
      setSaving(false)
      setTimeout(() => setFlash(null), 5000)
    }
  }

  async function syncStripe(id: string) {
    setSyncing(id)
    setError(null)
    try {
      await masterApi.syncPlanStripe(id)
      setFlash('Link de pagamento gerado com sucesso.')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Falha ao sincronizar com Stripe')
    } finally {
      setSyncing(null)
      setTimeout(() => setFlash(null), 4500)
    }
  }

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Planos" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Planos"
        subtitle="O que você marca aqui libera ou bloqueia de verdade (nav, APIs e limites). Os bullets da landing são gerados a partir dessas regras."
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}
      {flash && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-300">
          {flash}
        </div>
      )}

      <div className="space-y-3">
        {plans.map(p => {
          const isEditing = editing === p.id
          const billingType = (p.billing_type as string) || 'subscription'
          const isSyncing = syncing === p.id
          const limits = parseLimits(p.limits)
          const enabledKeys = catalog.filter(c => limits.features[c.key] === true)

          return (
            <MasterCard key={p.id} className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-[18px] font-bold tracking-tight">{p.name}</h3>
                  {p.is_featured && (
                    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-[10px] font-bold text-emerald-400">
                      <Star size={9} strokeWidth={2.5} />
                      Destaque
                    </span>
                  )}
                  {!p.is_active && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-400">
                      Inativo
                    </span>
                  )}
                  <span className="inline-flex items-center h-6 px-2 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-semibold text-white/70">
                    {billingType === 'subscription' ? 'Assinatura' : 'Pagamento único'}
                  </span>
                  <span className="text-[12px] font-mono text-white/40">{p.slug}</span>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-bold tracking-tight tabular-nums">
                    {moneyBR(p.price_cents)}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {billingType === 'subscription'
                      ? `por ${p.interval === 'monthly' || p.interval === 'month' ? 'mês' : p.interval}`
                      : 'pagamento único'}
                  </p>
                </div>
              </div>

              {isEditing && draft ? (
                <div className="space-y-5">
                  <Field label="Nome">
                    <input
                      type="text"
                      value={draft.name}
                      onChange={e => setDraft(d => (d ? { ...d, name: e.target.value } : d))}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Tagline">
                    <input
                      type="text"
                      value={draft.tagline}
                      onChange={e => setDraft(d => (d ? { ...d, tagline: e.target.value } : d))}
                      className={fieldClass}
                    />
                  </Field>

                  <Field label="Tipo de cobrança">
                    <div className="inline-flex bg-zinc-900 p-0.5 rounded-xl ring-1 ring-white/10">
                      {[
                        { value: 'subscription', label: 'Assinatura recorrente' },
                        { value: 'one_time', label: 'Pagamento único' },
                      ].map(opt => {
                        const sel = draft.billing_type === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setDraft(d => (d ? { ...d, billing_type: opt.value } : d))
                            }
                            className={`px-3.5 h-9 rounded-lg text-[12px] font-semibold transition ${
                              sel ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Preço (centavos)">
                      <input
                        type="number"
                        value={draft.price_cents}
                        onChange={e =>
                          setDraft(d =>
                            d
                              ? { ...d, price_cents: parseInt(e.target.value, 10) || 0 }
                              : d,
                          )
                        }
                        className={fieldClass + ' font-mono'}
                      />
                      <p className="text-[10px] text-white/40 mt-1 tabular-nums">
                        = {moneyBR(draft.price_cents || 0)}
                      </p>
                    </Field>
                    {draft.billing_type === 'subscription' && (
                      <Field label="Intervalo">
                        <select
                          value={draft.interval || 'monthly'}
                          onChange={e =>
                            setDraft(d => (d ? { ...d, interval: e.target.value } : d))
                          }
                          className={selectClass}
                        >
                          <option value="monthly" className="bg-zinc-900 text-white">
                            Mensal
                          </option>
                          <option value="yearly" className="bg-zinc-900 text-white">
                            Anual
                          </option>
                          <option value="weekly" className="bg-zinc-900 text-white">
                            Semanal
                          </option>
                        </select>
                      </Field>
                    )}
                  </div>

                  {/* ── Real limits ── */}
                  <div className="rounded-2xl ring-1 ring-white/10 bg-black/20 p-4 space-y-3">
                    <div>
                      <p className="text-[12px] font-bold text-white">Limites (enforced)</p>
                      <p className="text-[11px] text-white/45 mt-0.5">
                        Use <span className="font-mono text-white/70">-1</span> para ilimitado. Estes
                        valores bloqueiam criação de marcas, WhatsApp e captação de leads.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(
                        [
                          ['leads_per_day', 'Leads / dia'],
                          ['leads_per_month', 'Leads / mês'],
                          ['instances', 'Números WhatsApp'],
                          ['brands', 'Marcas (orgs)'],
                          ['disparos_per_month', 'Disparos / mês'],
                        ] as const
                      ).map(([key, label]) => (
                        <Field key={key} label={label}>
                          <div className="relative">
                            <input
                              type="number"
                              value={draft.limits[key]}
                              onChange={e => setLimitNum(key, e.target.value)}
                              className={fieldClass + ' font-mono pr-9'}
                            />
                            {(draft.limits[key] < 0 || draft.limits[key] === -1) && (
                              <InfinityIcon
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400"
                              />
                            )}
                          </div>
                        </Field>
                      ))}
                    </div>
                  </div>

                  {/* ── Real feature toggles ── */}
                  <div className="rounded-2xl ring-1 ring-white/10 bg-black/20 p-4 space-y-4">
                    <div>
                      <p className="text-[12px] font-bold text-white">Módulos do plano (libera / bloqueia)</p>
                      <p className="text-[11px] text-white/45 mt-0.5">
                        Cada switch controla nav + API. Desligado = 403 / item oculto no admin do tenant.
                      </p>
                    </div>
                    {catalogByGroup.map(([group, items]) => (
                      <div key={group}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-2">
                          {group}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {items.map(meta => {
                            const on = draft.limits.features[meta.key] === true
                            return (
                              <button
                                key={meta.key}
                                type="button"
                                onClick={() => toggleFeature(meta.key)}
                                className={`text-left px-3.5 py-3 rounded-xl ring-1 transition ${
                                  on
                                    ? 'bg-emerald-500/10 ring-emerald-500/30'
                                    : 'bg-zinc-900/80 ring-white/10 hover:ring-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[13px] font-semibold text-white">
                                    {meta.label}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wide ${
                                      on ? 'text-emerald-400' : 'text-white/35'
                                    }`}
                                  >
                                    {on ? 'Ativo' : 'Bloqueado'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/50 mt-1 leading-snug">
                                  {meta.description}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Field label="Bullets da landing (gerados + extras opcionais)">
                    <div className="rounded-xl ring-1 ring-white/10 bg-zinc-900/60 px-3.5 py-2.5 mb-2 space-y-1">
                      {buildMarketingBullets(draft.limits, catalog).map((line, i) => (
                        <p key={i} className="text-[12px] text-white/70 flex gap-2">
                          <span className="text-emerald-400">·</span>
                          {line}
                        </p>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Linhas extras só para marketing (opcional, uma por linha)"
                      value={draft.marketing_extra.join('\n')}
                      onChange={e =>
                        setDraft(d =>
                          d
                            ? {
                                ...d,
                                marketing_extra: e.target.value
                                  .split('\n')
                                  .map(s => s.trim())
                                  .filter(Boolean),
                              }
                            : d,
                        )
                      }
                      className={areaClass}
                    />
                  </Field>

                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_active}
                        onChange={e =>
                          setDraft(d => (d ? { ...d, is_active: e.target.checked } : d))
                        }
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="text-[12px] text-white/70">Ativo</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_featured}
                        onChange={e =>
                          setDraft(d => (d ? { ...d, is_featured: e.target.checked } : d))
                        }
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="text-[12px] text-white/70">Destacado na landing</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => save(p.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 disabled:opacity-30 active:scale-[0.98] transition"
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} strokeWidth={2} />
                      )}
                      Salvar plano
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null)
                        setDraft(null)
                      }}
                      className="h-10 px-4 rounded-xl bg-white/[0.06] text-white text-[13px] font-semibold ring-1 ring-white/10 hover:bg-white/10 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {p.tagline && (
                    <p className="text-[13px] text-white/60 mb-3">{p.tagline}</p>
                  )}

                  {/* Real limits summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    {(
                      [
                        ['Leads/dia', limits.leads_per_day],
                        ['Leads/mês', limits.leads_per_month],
                        ['WhatsApp', limits.instances],
                        ['Marcas', limits.brands],
                        ['Disparos/mês', limits.disparos_per_month],
                      ] as const
                    ).map(([label, n]) => (
                      <div
                        key={label}
                        className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] px-3 py-2"
                      >
                        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">
                          {label}
                        </p>
                        <p className="text-[14px] font-bold text-white tabular-nums mt-0.5">
                          {fmtLimit(n)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-2">
                      Módulos liberados ({enabledKeys.length}/{catalog.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalog.map(meta => {
                        const on = limits.features[meta.key] === true
                        return (
                          <span
                            key={meta.key}
                            title={meta.description}
                            className={`inline-flex h-7 items-center px-2.5 rounded-lg text-[11px] font-semibold ring-1 ${
                              on
                                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
                                : 'bg-white/[0.03] text-white/30 ring-white/10 line-through decoration-white/20'
                            }`}
                          >
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {asStringList(p.features).length > 0 && (
                    <ul className="space-y-1.5 mb-5">
                      {asStringList(p.features).map((f, i) => (
                        <li key={i} className="text-[13px] text-white/70 flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">·</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <StripeSection plan={p} isSyncing={isSyncing} onSync={() => syncStripe(p.id)} />

                  <div className="flex items-center gap-2 mt-5">
                    <button
                      onClick={() => startEdit(p)}
                      className="h-9 px-4 rounded-xl bg-white/[0.06] text-white text-[12px] font-semibold ring-1 ring-white/10 hover:bg-white/10 active:scale-[0.98] transition"
                    >
                      Configurar plano
                    </button>
                  </div>
                </>
              )}
            </MasterCard>
          )
        })}
      </div>
    </>
  )
}

/* ──────────────────────────── Stripe section ──────────────────────────── */

function StripeSection({
  plan,
  isSyncing,
  onSync,
}: {
  plan: Plan
  isSyncing: boolean
  onSync: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!plan.payment_link) return
    try {
      await navigator.clipboard.writeText(plan.payment_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  if (plan.price_cents <= 0) {
    return (
      <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] text-[12px] text-white/50">
        Defina um preço maior que zero para gerar link de pagamento.
      </div>
    )
  }

  if (!plan.payment_link) {
    return (
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] flex-wrap">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white">Sem link de pagamento</p>
          <p className="text-[11px] text-white/50 mt-0.5">
            Clique em &quot;Gerar link Stripe&quot; para criar produto + preço + checkout.
          </p>
        </div>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-gray-900 text-[12px] font-semibold hover:bg-gray-200 disabled:opacity-40 active:scale-[0.98] transition shrink-0"
        >
          {isSyncing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Link2 size={13} strokeWidth={2} />
          )}
          {isSyncing ? 'Gerando…' : 'Gerar link Stripe'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/[0.08] ring-1 ring-emerald-500/20">
        <CheckCircle2 size={14} strokeWidth={2.25} className="text-emerald-400 shrink-0" />
        <span className="text-[12px] font-semibold text-emerald-300">Link de pagamento ativo</span>
      </div>

      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]">
        <code className="flex-1 text-[11px] font-mono text-white/80 truncate px-2.5">
          {plan.payment_link}
        </code>
        <button
          onClick={copyLink}
          aria-label="Copiar"
          title="Copiar"
          className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          {copied ? (
            <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-400" />
          ) : (
            <Copy size={13} strokeWidth={1.75} />
          )}
        </button>
        <a
          href={plan.payment_link}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir"
          title="Abrir link"
          className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          <ExternalLink size={13} strokeWidth={1.75} />
        </a>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-white/40 pt-1">
        <span className="font-mono">product: {plan.stripe_product_id || '—'}</span>
        <span className="text-white/20">·</span>
        <span className="font-mono">price: {plan.stripe_price_id || '—'}</span>
      </div>

      <button
        onClick={onSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-white/[0.04] text-white/70 text-[11px] font-medium ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98] transition mt-1"
      >
        {isSyncing ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <RefreshCw size={11} strokeWidth={2} />
        )}
        Sincronizar (regenerar se preço mudou)
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-white/60 mb-1.5 tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}
