import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, ChevronRight, Loader2, Sparkles, Clock, CheckCircle2, Ban } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import { formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'
import type { MarketplaceOpportunity } from '@/lib/affiliates/programs-types'
import type { AppContext } from '@/pages/affiliate/types'
import { AffiliateProgramOnboarding } from '@/pages/affiliate/AffiliateProgramOnboarding'

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  not_applied: { label: 'Disponível', color: '#16a34a', icon: Sparkles },
  pending: { label: 'Aguardando análise', color: '#f59e0b', icon: Clock },
  rejected: { label: 'Não aprovado', color: '#ef4444', icon: Ban },
  onboarding: { label: 'Em onboarding', color: '#0ea5e9', icon: Briefcase },
  active: { label: 'Ativo', color: '#16a34a', icon: CheckCircle2 },
  suspended: { label: 'Suspenso', color: '#ef4444', icon: Ban },
}

type Props = {
  ctx: AppContext
  onOpenProgram?: (programId: string) => void
}

export function AffiliateMarketplace({ ctx }: Props) {
  const [searchParams] = useSearchParams()
  const programRef = String(searchParams.get('program') || '').trim()
  const handledProgramRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<MarketplaceOpportunity[]>([])
  const [applying, setApplying] = useState<string | null>(null)
  const [onboardingId, setOnboardingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await affiliateApi.marketplace()
      setItems(res.opportunities || [])
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao carregar oportunidades', 'err')
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
      <div className="grid place-items-center py-16">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  return (
    <div className="affiliate-market pb-2">
      <div
        className="affiliate-market__hero affiliate-card"
        style={{ background: `linear-gradient(145deg, ${ctx.primary}, ${ctx.secondary})` }}
      >
        <Briefcase size={18} className="text-white/85" />
        <h2 className="affiliate-market__title">Mercado de oportunidades</h2>
        <p className="affiliate-market__sub">Programas independentes com regras, comissões e ganhos próprios</p>
      </div>

      {items.length === 0 ? (
        <div className="affiliate-card p-6 text-center">
          <p className="text-sm font-semibold text-[#1c1c1e]">Nenhuma oportunidade aberta</p>
          <p className="text-xs text-[#8e8e93] mt-1">Novos programas aparecerão aqui quando a marca publicar.</p>
        </div>
      ) : (
        <div className="affiliate-market__list">
          {items.map((op) => {
            const st = STATUS_LABEL[op.participation_status] || STATUS_LABEL.not_applied
            const Icon = st.icon
            const commission = formatCommissionShort(
              normalizeCommissionMode(op.commission_mode),
              Number(op.commission_value || 0),
            )
            const offerLabel = op.offers?.[0]?.title || op.offers?.[0]?.product_name || 'Catálogo / ofertas vinculadas'

            return (
              <article key={op.id} className="affiliate-market__card affiliate-card">
                <div className="affiliate-market__card-head">
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-[#1c1c1e] truncate">{op.name}</p>
                    <p className="text-[10px] text-[#8e8e93] mt-0.5">{offerLabel}</p>
                  </div>
                  <span className="affiliate-market__badge" style={{ color: st.color, backgroundColor: `${st.color}14` }}>
                    <Icon size={11} /> {st.label}
                  </span>
                </div>

                {op.description && (
                  <p className="text-xs text-[#636366] mt-2 leading-relaxed line-clamp-3">{op.description}</p>
                )}

                <div className="affiliate-market__meta">
                  <span>Comissão: <strong>{commission}</strong></span>
                  {op.offers?.length ? <span>{op.offers.length} oferta(s)</span> : null}
                </div>

                <div className="affiliate-market__actions">
                  {op.can_apply && (
                    <button
                      type="button"
                      className="affiliate-market__btn"
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
                      className="affiliate-market__btn affiliate-market__btn--outline"
                      style={{ color: ctx.primary, borderColor: `${ctx.primary}40` }}
                      onClick={() => setOnboardingId(op.enrollment!.id)}
                    >
                      Continuar onboarding <ChevronRight size={14} />
                    </button>
                  )}
                  {op.participation_status === 'active' && (
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Recursos liberados
                    </span>
                  )}
                  {op.participation_status === 'pending' && (
                    <span className="text-[10px] font-bold text-amber-600">Aguardando aprovação do admin</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}