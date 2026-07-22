import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Briefcase, ChevronRight, Loader2, Sparkles, Clock, CheckCircle2, Ban,
  Search, Store, Percent, Users,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import { formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'
import type { MarketplaceOpportunity } from '@/lib/affiliates/programs-types'
import type { AppContext } from '@/pages/affiliate/types'
import { AffiliateProgramOnboarding } from '@/pages/affiliate/AffiliateProgramOnboarding'

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  not_applied: { label: 'Disponível', color: '#16a34a', icon: Sparkles },
  pending: { label: 'Em análise', color: '#f59e0b', icon: Clock },
  rejected: { label: 'Não aprovado', color: '#ef4444', icon: Ban },
  onboarding: { label: 'A concluir', color: '#0ea5e9', icon: Briefcase },
  active: { label: 'Ativo', color: '#16a34a', icon: CheckCircle2 },
  suspended: { label: 'Suspenso', color: '#ef4444', icon: Ban },
}

type FilterKey = 'all' | 'available' | 'mine' | 'pending'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'available', label: 'Disponíveis' },
  { key: 'mine', label: 'Meus' },
  { key: 'pending', label: 'Em análise' },
]

type Props = {
  ctx: AppContext
  onOpenProgram?: (programId: string) => void
}

export function AffiliateMarketplace({ ctx }: Props) {
  const [searchParams] = useSearchParams()
  const programRef = String(searchParams.get('program') || '').trim()
  const onboardingFromQuery = String(searchParams.get('onboarding') || '').trim()
  const handledProgramRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<MarketplaceOpportunity[]>([])
  const [applying, setApplying] = useState<string | null>(null)
  const [onboardingId, setOnboardingId] = useState<string | null>(onboardingFromQuery || null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  async function load() {
    setLoading(true)
    try {
      const res = await affiliateApi.marketplace()
      setItems(res.opportunities || [])
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao carregar o mercado', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function apply(programId: string) {
    setApplying(programId)
    try {
      const res = await affiliateApi.applyProgram(programId)
      ctx.showToast(res.auto_approved ? 'Inscrição iniciada!' : 'Candidatura enviada!')
      if (res.enrollment?.id) setOnboardingId(res.enrollment.id)
      await load()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro na candidatura', 'err')
    } finally {
      setApplying(null)
    }
  }

  useEffect(() => { void load() }, [ctx.cacheVersion])

  // Deep link do gate de liberação: /mercado?onboarding=<enrollmentId>
  useEffect(() => {
    if (onboardingFromQuery) setOnboardingId(onboardingFromQuery)
  }, [onboardingFromQuery])

  useEffect(() => {
    if (!programRef || handledProgramRef.current || loading || !items.length) return
    const target = items.find((op) => op.id === programRef || op.slug === programRef)
    if (!target) return
    handledProgramRef.current = true
    if (target.can_continue && target.enrollment?.id) {
      setOnboardingId(target.enrollment.id)
      return
    }
    if (target.can_apply) {
      void apply(target.id)
    }
  }, [programRef, loading, items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((op) => {
      if (filter === 'available' && !op.can_apply) return false
      if (filter === 'mine' && !['active', 'onboarding'].includes(op.participation_status)) return false
      if (filter === 'pending' && op.participation_status !== 'pending') return false
      if (!q) return true
      const hay = `${op.name || ''} ${op.description || ''} ${op.offers?.[0]?.title || ''} ${op.offers?.[0]?.product_name || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query, filter])

  const counts = useMemo(() => ({
    all: items.length,
    available: items.filter((i) => i.can_apply).length,
    mine: items.filter((i) => ['active', 'onboarding'].includes(i.participation_status)).length,
    pending: items.filter((i) => i.participation_status === 'pending').length,
  }), [items])

  if (onboardingId) {
    return (
      <AffiliateProgramOnboarding
        ctx={ctx}
        enrollmentId={onboardingId}
        onClose={() => { setOnboardingId(null); void load() }}
      />
    )
  }

  if (loading) {
    return (
      <div className="affiliate-market pb-2">
        <div className="affiliate-skel h-28 w-full" />
        <div className="affiliate-skel h-12 w-full" />
        <div className="affiliate-skel h-24 w-full" />
        <div className="affiliate-skel h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="affiliate-market pb-2">
      <header className="affiliate-market__intro">
        <div className="affiliate-market__intro-icon" style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}>
          <Store size={20} strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <h2 className="affiliate-market__intro-title">Mercado</h2>
          <p className="affiliate-market__intro-sub">
            Programas com regras e comissões próprias. Candidate-se e libere recursos.
          </p>
        </div>
      </header>

      <div className="affiliate-market__search affiliate-card">
        <Search size={16} className="text-[#8e8e93] shrink-0" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar programa ou oferta…"
          className="affiliate-market__search-input"
          aria-label="Buscar no mercado"
        />
      </div>

      <div className="affiliate-market__filters" role="tablist" aria-label="Filtrar mercado">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = counts[f.key]
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`affiliate-market__filter${active ? ' affiliate-market__filter--on' : ''}`}
              style={active ? { backgroundColor: `${ctx.primary}14`, color: ctx.primary } : undefined}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="affiliate-market__filter-count">{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="affiliate-market__empty affiliate-card">
          <div className="affiliate-market__empty-icon">
            <Store size={26} className="opacity-40" />
          </div>
          <p className="affiliate-market__empty-title">
            {items.length === 0 ? 'Nenhum programa no mercado' : 'Nada neste filtro'}
          </p>
          <p className="affiliate-market__empty-sub">
            {items.length === 0
              ? 'Novos programas aparecem aqui quando a marca publicar.'
              : 'Ajuste a busca ou escolha outro filtro.'}
          </p>
          {filter !== 'all' && (
            <button type="button" className="affiliate-market__empty-reset" onClick={() => setFilter('all')}>
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <div className="affiliate-market__list">
          {filtered.map((op) => {
            const st = STATUS_LABEL[op.participation_status] || STATUS_LABEL.not_applied
            const Icon = st.icon
            const commission = formatCommissionShort(
              normalizeCommissionMode(op.commission_mode),
              Number(op.commission_value || 0),
            )
            const offerLabel = op.offers?.[0]?.title || op.offers?.[0]?.product_name || 'Catálogo / ofertas vinculadas'

            return (
              <article key={op.id} className="affiliate-market__card affiliate-market__card--rich affiliate-card">
                <div
                  className="affiliate-market__card-cover"
                  style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary || ctx.primary})` }}
                >
                  <div className="affiliate-market__card-cover-main">
                    <div className="affiliate-market__card-avatar affiliate-market__card-avatar--lg">
                      <Briefcase size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="affiliate-market__card-name affiliate-market__card-name--on-cover">{op.name}</p>
                      <p className="affiliate-market__card-offer affiliate-market__card-offer--on-cover">{offerLabel}</p>
                    </div>
                  </div>
                  <span className="affiliate-market__badge affiliate-market__badge--on-cover">
                    <Icon size={11} /> {st.label}
                  </span>
                </div>

                <div className="affiliate-market__card-body">
                  {op.description && (
                    <p className="affiliate-market__card-desc">{op.description}</p>
                  )}

                  <div className="affiliate-market__card-stats affiliate-market__card-stats--3">
                    <div className="affiliate-market__stat affiliate-market__stat--compact">
                      <p className="affiliate-market__stat-label">Comissão</p>
                      <p className="affiliate-market__stat-value" style={{ color: ctx.primary }}>{commission}</p>
                    </div>
                    <div className="affiliate-market__stat affiliate-market__stat--compact">
                      <p className="affiliate-market__stat-label">Prospects</p>
                      <p className="affiliate-market__stat-value tabular-nums">
                        {Number(op.prospects_captured ?? op.leads_captured ?? 0).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="affiliate-market__stat affiliate-market__stat--compact">
                      <p className="affiliate-market__stat-label">Ofertas</p>
                      <p className="affiliate-market__stat-value tabular-nums">{op.offers?.length || 0}</p>
                    </div>
                  </div>

                  <div className="affiliate-market__actions">
                    {op.can_apply && (
                      <button
                        type="button"
                        className="affiliate-market__btn affiliate-market__btn--block"
                        style={{ backgroundColor: ctx.primary }}
                        disabled={applying === op.id}
                        onClick={() => apply(op.id)}
                      >
                        {applying === op.id ? <Loader2 size={14} className="animate-spin" /> : null}
                        Candidatar-se
                      </button>
                    )}
                    {op.can_continue && op.enrollment?.id && (
                      <button
                        type="button"
                        className="affiliate-market__btn affiliate-market__btn--outline affiliate-market__btn--block"
                        style={{ color: ctx.primary, borderColor: `${ctx.primary}40` }}
                        onClick={() => setOnboardingId(op.enrollment!.id)}
                      >
                        Concluir o solicitado <ChevronRight size={14} />
                      </button>
                    )}
                    {op.participation_status === 'active' && (
                      <span className="affiliate-market__status-note affiliate-market__status-note--ok">
                        <CheckCircle2 size={12} /> Recursos liberados
                      </span>
                    )}
                    {op.participation_status === 'pending' && (
                      <span className="affiliate-market__status-note affiliate-market__status-note--warn">
                        <Clock size={12} /> Aguardando aprovação
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
