import { useEffect, useState } from 'react'
import {
  ChevronLeft, Loader2, Building2, Sparkles, GraduationCap, Layers,
  Package, FileText, ChevronRight, Clock, CheckCircle2,
} from 'lucide-react'
import { partnersApi } from '@/lib/api-partners'

type Props = {
  programRef: string
  onBack: () => void
  onOnboarding: (enrollmentId: string) => void
  showToast: (text: string, type?: 'ok' | 'err') => void
  onApplied?: () => void
}

export function PartnersProgramDetail({ programRef, onBack, onOnboarding, showToast, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [program, setProgram] = useState<any>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    setLoading(true)
    partnersApi.programDetail(programRef)
      .then((res) => setProgram(res.program))
      .catch((e: Error) => showToast(e.message, 'err'))
      .finally(() => setLoading(false))
  }, [programRef, showToast])

  async function apply() {
    if (!program?.can_apply) return
    if (!termsAccepted) {
      showToast('Aceite os termos para continuar', 'err')
      return
    }
    setApplying(true)
    try {
      const res = await partnersApi.applyProgram(program.id, { accepted_terms: true })
      showToast(res.auto_approved ? 'Inscrição iniciada!' : 'Candidatura enviada!')
      if (res.enrollment?.id) {
        onOnboarding(res.enrollment.id)
      } else {
        const refreshed = await partnersApi.programDetail(program.id)
        setProgram(refreshed.program)
      }
      onApplied?.()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro na candidatura', 'err')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  if (!program) {
    return (
      <div className="affiliate-card p-6 text-center">
        <p className="text-sm font-semibold">Programa não encontrado</p>
        <button type="button" className="mt-3 text-xs font-bold text-[#16a34a]" onClick={onBack}>Voltar</button>
      </div>
    )
  }

  const primary = program.organization?.primary_color || '#16a34a'
  const hasTerms = !!String(program.terms_html || '').trim()

  return (
    <div className="pb-2 space-y-3">
      <button type="button" onClick={onBack} className="affiliate-hub__back">
        <ChevronLeft size={14} /> Mercado
      </button>

      <div
        className="affiliate-card p-4 text-white"
        style={{ background: `linear-gradient(145deg, ${primary}, ${program.organization?.secondary_color || '#22c55e'})` }}
      >
        <div className="flex items-start gap-3">
          {program.organization?.logo_url ? (
            <img src={program.organization.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white/25" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/20 grid place-items-center"><Building2 size={20} /></div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">{program.organization?.name}</p>
            <h1 className="text-lg font-extrabold tracking-tight">{program.name}</h1>
            {program.organization?.slogan && (
              <p className="text-xs text-white/80 mt-1">{program.organization.slogan}</p>
            )}
          </div>
        </div>
        <p className="text-sm font-bold mt-3">Comissão: {program.commission_label}</p>
      </div>

      {program.description && (
        <div className="affiliate-card p-4">
          <p className="text-xs font-extrabold text-[#1c1c1e] mb-2">Sobre a oportunidade</p>
          <p className="text-sm text-[#636366] leading-relaxed">{program.description}</p>
        </div>
      )}

      {program.eligibility_rules && (
        <div className="affiliate-card p-4">
          <p className="text-xs font-extrabold text-[#1c1c1e] mb-2 flex items-center gap-1"><FileText size={14} /> Requisitos</p>
          <p className="text-sm text-[#636366] whitespace-pre-wrap">{program.eligibility_rules}</p>
        </div>
      )}

      {(program.offers || []).length > 0 && (
        <div className="affiliate-card p-4">
          <p className="text-xs font-extrabold text-[#1c1c1e] mb-2 flex items-center gap-1"><Package size={14} /> Ofertas ({program.offers.length})</p>
          <ul className="space-y-2">
            {program.offers.map((o: any) => (
              <li key={o.id} className="text-sm text-[#636366] border-b border-[#f2f2f7] pb-2 last:border-0">
                <strong className="text-[#1c1c1e]">{o.title || o.product_name}</strong>
                {o.product_name && o.title ? ` · ${o.product_name}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="affiliate-card p-4">
        <p className="text-xs font-extrabold text-[#1c1c1e] mb-2 flex items-center gap-1"><Layers size={14} /> Onboarding</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#636366]">
          <span>{program.onboarding?.required_steps_count || 0} etapa(s) obrigatória(s)</span>
          <span className="flex items-center gap-1"><GraduationCap size={12} /> {program.onboarding?.required_trainings_count || 0} treinamento(s)</span>
        </div>
      </div>

      {program.commission_rules && (
        <div className="affiliate-card p-4">
          <p className="text-xs font-extrabold text-[#1c1c1e] mb-2">Regras comerciais</p>
          <p className="text-sm text-[#636366] whitespace-pre-wrap">{program.commission_rules}</p>
        </div>
      )}

      {hasTerms && (
        <div className="affiliate-card p-4">
          <p className="text-xs font-extrabold text-[#1c1c1e] mb-2">Termos do programa</p>
          <div
            className="affiliate-onboard__html text-xs text-[#636366] max-h-48 overflow-y-auto prose prose-sm"
            dangerouslySetInnerHTML={{ __html: program.terms_html }}
          />
        </div>
      )}

      <div className="affiliate-card p-4 sticky bottom-20 z-10 shadow-md">
        {program.can_apply && (
          <>
            <label className="flex items-start gap-2 text-xs font-semibold text-[#1c1c1e] mb-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                Li e aceito os termos{hasTerms ? ' exibidos acima' : ' do programa'} e desejo me candidatar
              </span>
            </label>
            <button
              type="button"
              className="affiliate-market__btn w-full"
              style={{ backgroundColor: primary }}
              disabled={applying || !termsAccepted}
              onClick={() => apply()}
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Candidatar-se ao programa
            </button>
          </>
        )}

        {program.can_continue && program.enrollment?.id && (
          <button
            type="button"
            className="affiliate-market__btn w-full"
            style={{ backgroundColor: primary }}
            onClick={() => onOnboarding(program.enrollment.id)}
          >
            Continuar onboarding <ChevronRight size={14} />
          </button>
        )}

        {program.participation_status === 'pending' && (
          <p className="text-sm font-bold text-amber-600 flex items-center gap-2 justify-center">
            <Clock size={16} /> Aguardando aprovação da organização
          </p>
        )}

        {program.participation_status === 'active' && (
          <p className="text-sm font-bold text-emerald-600 flex items-center gap-2 justify-center">
            <CheckCircle2 size={16} /> Você já participa deste programa
          </p>
        )}
      </div>
    </div>
  )
}