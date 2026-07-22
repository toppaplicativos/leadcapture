import { useEffect, useState } from 'react'
import {
  ChevronLeft, Loader2, CheckCircle2, Lock, Circle, Copy, Link2, Ticket,
} from 'lucide-react'
import { partnersApi } from '@/lib/api-partners'
import { formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'
import type { AffiliateProgramStep } from '@/lib/affiliates/programs-types'

type Props = {
  enrollmentId: string
  primary?: string
  onClose: () => void
  showToast: (text: string, type?: 'ok' | 'err') => void
}

export function PartnersProgramOnboarding({ enrollmentId, primary = '#16a34a', onClose, showToast }: Props) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [policyAccepted, setPolicyAccepted] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await partnersApi.onboarding(enrollmentId)
      setData(res)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro ao carregar o que falta concluir', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [enrollmentId])

  async function completeStep(step: AffiliateProgramStep, extra?: Record<string, unknown>) {
    if (step.locked) return showToast('Conclua a etapa anterior primeiro', 'err')
    setSubmitting(step.id)
    try {
      const res = await partnersApi.completeOnboarding(enrollmentId, {
        item_type: 'step',
        item_id: step.id,
        payload: extra,
      })
      setData(res)
      showToast('Etapa concluída!')
      if (res.resources_unlocked) showToast('Link e cupom liberados!')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro ao concluir etapa', 'err')
    } finally {
      setSubmitting(null)
    }
  }

  async function completeTraining(trainingId: string) {
    setSubmitting(trainingId)
    try {
      const res = await partnersApi.completeOnboarding(enrollmentId, {
        item_type: 'training',
        item_id: trainingId,
        payload: { completed: true },
      })
      setData(res)
      showToast('Treinamento concluído!')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSubmitting(null)
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Não foi possível copiar', 'err')
    }
  }

  if (loading || !data) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  const enrollment = data.enrollment
  const steps: AffiliateProgramStep[] = data.steps || []
  const commission = formatCommissionShort(
    normalizeCommissionMode(enrollment.commission_mode),
    Number(enrollment.commission_value || 0),
  )

  return (
    <div className="affiliate-onboard pb-2">
      <button type="button" onClick={onClose} className="affiliate-hub__back">
        <ChevronLeft size={14} /> Voltar
      </button>

      <div className="affiliate-card p-4 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">Concluir o solicitado</p>
        <h2 className="font-extrabold text-base text-[#1c1c1e]">{enrollment.program_name}</h2>
        <p className="text-xs text-[#636366] mt-1">Comissão deste programa: <strong>{commission}</strong></p>
      </div>

      {data.resources_unlocked && (
        <div className="affiliate-card p-4 mb-3 border border-emerald-200 bg-emerald-50/50">
          <p className="text-sm font-bold text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} /> Recursos liberados
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#636366] flex items-center gap-1"><Link2 size={12} /> Link</span>
              <button type="button" className="text-xs font-bold" style={{ color: primary }} onClick={() => copyText(data.enrollment_code, 'Link copiado!')}>
                <Copy size={11} className="inline" /> {data.enrollment_code}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#636366] flex items-center gap-1"><Ticket size={12} /> Cupom</span>
              <button type="button" className="text-xs font-bold" style={{ color: primary }} onClick={() => copyText(data.coupon_code, 'Cupom copiado!')}>
                <Copy size={11} className="inline" /> {data.coupon_code}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="affiliate-onboard__steps">
        {steps.filter((s) => s.step_type !== 'resource_unlock').map((step) => {
          const done = step.progress?.status === 'completed'
          const locked = !!step.locked && !done
          const isTerms = step.step_type === 'terms_accept'
          const isPolicy = step.step_type === 'policy_accept'
          const isOrientation = step.step_type === 'orientation'

          return (
            <article key={step.id} className={`affiliate-onboard__step affiliate-card${locked ? ' affiliate-onboard__step--locked' : ''}`}>
              <div className="affiliate-onboard__step-head">
                {done ? (
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                ) : locked ? (
                  <Lock size={16} className="text-[#c7c7cc] shrink-0" />
                ) : (
                  <Circle size={16} className="text-[#c7c7cc] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[#1c1c1e]">{step.title}</p>
                  {step.description && <p className="text-[11px] text-[#8e8e93] mt-0.5">{step.description}</p>}
                </div>
              </div>

              {!done && !locked && (
                <div className="affiliate-onboard__step-body">
                  {isTerms && enrollment.terms_html && (
                    <div
                      className="affiliate-onboard__html text-xs text-[#636366] prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: enrollment.terms_html }}
                    />
                  )}
                  {isPolicy && enrollment.policies_html && (
                    <div
                      className="affiliate-onboard__html text-xs text-[#636366]"
                      dangerouslySetInnerHTML={{ __html: enrollment.policies_html }}
                    />
                  )}
                  {isOrientation && enrollment.orientation_html && (
                    <div
                      className="affiliate-onboard__html text-xs text-[#636366]"
                      dangerouslySetInnerHTML={{ __html: enrollment.orientation_html }}
                    />
                  )}

                  {(step.trainings || []).map((tr) => (
                    <div key={tr.id} className="affiliate-onboard__training mt-2 p-3 rounded-xl bg-[#f9f9fb]">
                      <p className="font-semibold text-xs">{tr.title}</p>
                      {tr.content_html && (
                        <div className="text-[11px] text-[#636366] mt-1" dangerouslySetInnerHTML={{ __html: tr.content_html }} />
                      )}
                      {tr.progress?.status !== 'completed' && (
                        <button
                          type="button"
                          className="mt-2 text-xs font-bold"
                          style={{ color: primary }}
                          disabled={submitting === tr.id}
                          onClick={() => completeTraining(tr.id)}
                        >
                          {submitting === tr.id ? 'Salvando…' : 'Marcar treinamento como concluído'}
                        </button>
                      )}
                    </div>
                  ))}

                  {isTerms && (
                    <label className="flex items-center gap-2 mt-3 text-xs font-semibold text-[#1c1c1e]">
                      <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                      Li e aceito os termos deste programa
                    </label>
                  )}
                  {isPolicy && (
                    <label className="flex items-center gap-2 mt-3 text-xs font-semibold text-[#1c1c1e]">
                      <input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} />
                      Confirmo ciência sobre comissão, pagamento e conduta
                    </label>
                  )}

                  <button
                    type="button"
                    className="affiliate-market__btn mt-3 w-full"
                    style={{ backgroundColor: primary }}
                    disabled={
                      submitting === step.id
                      || (isTerms && !termsAccepted)
                      || (isPolicy && !policyAccepted)
                    }
                    onClick={() => completeStep(step, {
                      terms_accepted: isTerms ? termsAccepted : undefined,
                      policy_accepted: isPolicy ? policyAccepted : undefined,
                    })}
                  >
                    {submitting === step.id ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Concluir etapa'}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}