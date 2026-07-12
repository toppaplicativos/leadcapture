import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, X, Loader2, CheckCircle2, Circle, Copy, ExternalLink,
  Rocket, Link2, AlertCircle,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { COMMISSION_MODE_OPTIONS, commissionValueLabel, normalizeCommissionMode } from '@/lib/affiliate-commission'
import { PAYOUT_FREQUENCY_OPTIONS, PAYOUT_METHOD_OPTIONS } from '@/lib/affiliates/program-config'

type Phase = 'form' | 'pipeline' | 'success' | 'error'

type PipelineStep = {
  id: string
  label: string
  detail: string
}

const PIPELINE: PipelineStep[] = [
  { id: 'brief', label: 'Lendo a oferta', detail: 'Entendendo oportunidade e prazos' },
  { id: 'legal', label: 'Termos e políticas', detail: 'Redigindo regras e conduta em HTML' },
  { id: 'onboard', label: 'Onboarding', detail: 'Orientação e treinamentos' },
  { id: 'learn', label: 'Área de aprendizado', detail: '6 módulos da aba Aprender' },
  { id: 'materials', label: 'Materiais e leads', detail: 'Copies e mensagens de distribuição' },
  { id: 'save', label: 'Salvando no programa', detail: 'Configurações, campanha e publicação' },
]

type Props = {
  open: boolean
  onClose: () => void
  onDone: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
  defaults?: {
    commission_mode?: string
    commission_value?: number
    payment_days?: number
    min_withdrawal?: number
    opportunity_hint?: string
  }
}

type FillResult = {
  program_id: string
  program_name: string
  activated: boolean
  share: {
    partners_marketplace_url: string
    affiliate_app_path: string
    subdomain: string | null
  }
  summary: {
    learning_modules: number
    trainings: number
    materials: number
    payment_days: number
    commission_label: string
    payout_label: string
  }
}

export function AffiliateAiFillModal({ open, onClose, onDone, showToast, defaults }: Props) {
  const [phase, setPhase] = useState<Phase>('form')
  const [pipelineIdx, setPipelineIdx] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<FillResult | null>(null)
  const [activating, setActivating] = useState(false)
  const [activated, setActivated] = useState(false)

  const [opportunity, setOpportunity] = useState(defaults?.opportunity_hint || '')
  const [paymentDays, setPaymentDays] = useState(Number(defaults?.payment_days ?? 1))
  const [commissionMode, setCommissionMode] = useState(normalizeCommissionMode(defaults?.commission_mode || 'percentage'))
  const [commissionValue, setCommissionValue] = useState(Number(defaults?.commission_value ?? 10))
  const [payoutMethod, setPayoutMethod] = useState('pix_direct')
  const [payoutFrequency, setPayoutFrequency] = useState('daily')
  const [minAmount, setMinAmount] = useState(Number(defaults?.min_withdrawal ?? 20))
  const [extraNotes, setExtraNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setPhase('form')
    setPipelineIdx(0)
    setError('')
    setResult(null)
    setActivated(false)
    setOpportunity(defaults?.opportunity_hint || '')
    setPaymentDays(Number(defaults?.payment_days ?? 1))
    setCommissionMode(normalizeCommissionMode(defaults?.commission_mode || 'percentage'))
    setCommissionValue(Number(defaults?.commission_value ?? 10))
    setMinAmount(Number(defaults?.min_withdrawal ?? 20))
  }, [open, defaults])

  // Pipeline visual avança enquanto a request roda
  useEffect(() => {
    if (phase !== 'pipeline') return
    setPipelineIdx(0)
    const timers: number[] = []
    PIPELINE.forEach((_, i) => {
      if (i === 0) return
      timers.push(
        window.setTimeout(() => {
          setPipelineIdx((prev) => Math.max(prev, i))
        }, i * 1400),
      )
    })
    return () => timers.forEach((t) => clearTimeout(t))
  }, [phase])

  const progressPct = useMemo(() => {
    if (phase === 'success') return 100
    if (phase !== 'pipeline') return 0
    return Math.min(95, Math.round(((pipelineIdx + 1) / PIPELINE.length) * 100))
  }, [phase, pipelineIdx])

  if (!open) return null

  async function runFill() {
    const brief = opportunity.trim()
    if (brief.length < 20) {
      showToast('Descreva a oferta com pelo menos 20 caracteres', 'err')
      return
    }
    if (!Number.isFinite(paymentDays) || paymentDays < 0) {
      showToast('Informe o prazo em dias após confirmação', 'err')
      return
    }

    setPhase('pipeline')
    setError('')
    setPipelineIdx(0)

    const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
    try {
      const r = await fetch('/api/affiliates/program/ai-fill', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          brand_id: brandId,
          opportunity_description: brief,
          payment_days: paymentDays,
          commission_mode: commissionMode,
          commission_value: commissionValue,
          payout_method: payoutMethod,
          payout_frequency: payoutFrequency,
          payout_min_amount: minAmount,
          cookie_days: 30,
          auto_approve: false,
          // não força desligar/ligar — preserva; ativação opcional no sucesso
          activate: undefined,
          extra_notes: extraNotes.trim() || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha na geração')

      setPipelineIdx(PIPELINE.length - 1)
      setResult({
        program_id: d.program_id,
        program_name: d.program_name,
        activated: !!d.activated,
        share: d.share,
        summary: d.summary,
      })
      setActivated(!!d.activated)
      // pequeno beat visual no último step
      await new Promise((res) => setTimeout(res, 450))
      setPhase('success')
      showToast('Programa preenchido com IA!')
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar')
      setPhase('error')
    }
  }

  async function toggleActivate(next: boolean) {
    if (!result?.program_id) return
    setActivating(true)
    try {
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/affiliates/program/ai-activate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          brand_id: brandId,
          program_id: result.program_id,
          activate: next,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setActivated(next)
      showToast(next ? 'Programa ativo no mercado!' : 'Programa desativado do mercado')
      onDone()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setActivating(false)
    }
  }

  function copyShare() {
    if (!result) return
    const url = result.share.subdomain
      ? `https://${result.share.subdomain}`
      : result.share.partners_marketplace_url
    void navigator.clipboard.writeText(url).then(() => showToast('Link copiado!'))
  }

  const shareUrl = result
    ? (result.share.subdomain
      ? `https://${result.share.subdomain}`
      : result.share.partners_marketplace_url)
    : ''

  return (
    <div className="aff-ai-modal" role="dialog" aria-modal="true" aria-labelledby="aff-ai-title">
      <button type="button" className="aff-ai-modal__backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="aff-ai-modal__panel">
        <header className="aff-ai-modal__head">
          <div className="aff-ai-modal__badge" aria-hidden="true">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="aff-ai-title" className="aff-ai-modal__title">
              {phase === 'success' ? 'Programa pronto' : 'Criar programa com IA'}
            </h2>
            <p className="aff-ai-modal__sub">
              {phase === 'form' && 'Só o essencial: oferta e prazos. O resto a IA preenche.'}
              {phase === 'pipeline' && 'Montando termos, aprendizado, materiais e configurações…'}
              {phase === 'success' && 'Conteúdo aplicado. Compartilhe ou ative no mercado.'}
              {phase === 'error' && 'Algo falhou — ajuste o brief e tente de novo.'}
            </p>
          </div>
          <button type="button" className="aff-ai-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {phase === 'form' && (
          <div className="aff-ai-modal__body">
            <label className="aff-ai-field aff-ai-field--required">
              <span>Oferta / oportunidade</span>
              <textarea
                value={opportunity}
                onChange={(e) => setOpportunity(e.target.value)}
                rows={4}
                placeholder="Ex.: Indique nossos produtos ou serviços; comissão de 10% por venda paga; público ideal e região de atuação."
                autoFocus
              />
              <em>Obrigatório · mínimo 20 caracteres ({opportunity.trim().length}/20)</em>
            </label>

            <div className="aff-ai-grid">
              <label className="aff-ai-field aff-ai-field--required">
                <span>Prazo de repasse (dias após confirmação)</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(Number(e.target.value))}
                />
                <em>Obrigatório · ex.: 1 = diário após confirmação</em>
              </label>
              <label className="aff-ai-field">
                <span>Saque mínimo (R$)</span>
                <input type="number" min={0} step="0.01" value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))} />
              </label>
              <label className="aff-ai-field">
                <span>Modo de comissão</span>
                <select value={commissionMode} onChange={(e) => setCommissionMode(normalizeCommissionMode(e.target.value))}>
                  {COMMISSION_MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="aff-ai-field">
                <span>{commissionValueLabel(commissionMode)}</span>
                <input type="number" min={0} step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(Number(e.target.value))} />
              </label>
              <label className="aff-ai-field">
                <span>Forma de repasse</span>
                <select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
                  {PAYOUT_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="aff-ai-field">
                <span>Periodicidade</span>
                <select value={payoutFrequency} onChange={(e) => setPayoutFrequency(e.target.value)}>
                  {PAYOUT_FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="aff-ai-field">
              <span>Notas extras (opcional)</span>
              <textarea
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                rows={2}
                placeholder="Ex.: regras de conduta; o que o afiliado não deve prometer; tom de voz; restrições de região."
              />
            </label>

            <div className="aff-ai-modal__actions">
              <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="affiliates-page__btn affiliates-page__btn--primary aff-ai-modal__cta"
                onClick={() => void runFill()}
                disabled={opportunity.trim().length < 20}
              >
                <Sparkles size={14} />
                Gerar programa completo
              </button>
            </div>
          </div>
        )}

        {phase === 'pipeline' && (
          <div className="aff-ai-modal__body aff-ai-pipeline">
            <div className="aff-ai-pipeline__bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="aff-ai-pipeline__bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="aff-ai-pipeline__pct tabular-nums">{progressPct}%</p>
            <ol className="aff-ai-pipeline__list">
              {PIPELINE.map((step, i) => {
                const done = i < pipelineIdx
                const current = i === pipelineIdx
                return (
                  <li
                    key={step.id}
                    className={`aff-ai-pipeline__item${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span className="aff-ai-pipeline__icon" aria-hidden="true">
                      {done ? <CheckCircle2 size={18} /> : current ? <Loader2 size={18} className="animate-spin" /> : <Circle size={18} />}
                    </span>
                    <div className="min-w-0">
                      <p className="aff-ai-pipeline__label">{step.label}</p>
                      <p className="aff-ai-pipeline__detail">{step.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {phase === 'error' && (
          <div className="aff-ai-modal__body aff-ai-error">
            <AlertCircle size={28} className="text-amber-600" />
            <p className="aff-ai-error__msg">{error || 'Falha na geração'}</p>
            <div className="aff-ai-modal__actions">
              <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={onClose}>
                Fechar
              </button>
              <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" onClick={() => setPhase('form')}>
                Voltar e ajustar
              </button>
            </div>
          </div>
        )}

        {phase === 'success' && result && (
          <div className="aff-ai-modal__body aff-ai-success">
            <div className="aff-ai-success__hero">
              <div className="aff-ai-success__icon" aria-hidden="true">
                <Rocket size={22} />
              </div>
              <div>
                <p className="aff-ai-success__name">{result.program_name}</p>
                <p className="aff-ai-success__meta">
                  {result.summary.commission_label} · {result.summary.payout_label}
                </p>
              </div>
            </div>

            <ul className="aff-ai-success__stats">
              <li><strong>{result.summary.learning_modules}</strong> módulos</li>
              <li><strong>{result.summary.trainings}</strong> treinos</li>
              <li><strong>{result.summary.materials}</strong> materiais</li>
              <li><strong>{result.summary.payment_days}d</strong> prazo</li>
            </ul>

            <div className="aff-ai-success__share">
              <p className="aff-ai-success__share-label">
                <Link2 size={14} /> Link para compartilhar o programa
              </p>
              <div className="aff-ai-success__share-row">
                <code className="aff-ai-success__url">{shareUrl}</code>
                <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost affiliates-page__btn--sm" onClick={copyShare}>
                  <Copy size={13} /> Copiar
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="affiliates-page__btn affiliates-page__btn--ghost affiliates-page__btn--sm"
                >
                  <ExternalLink size={13} /> Abrir
                </a>
              </div>
              {result.share.affiliate_app_path && (
                <p className="aff-ai-success__app-path">
                  App do afiliado: <code>{result.share.affiliate_app_path}</code>
                </p>
              )}
            </div>

            <div className={`aff-ai-success__activate${activated ? ' is-on' : ''}`}>
              <div className="min-w-0">
                <p className="aff-ai-success__activate-title">
                  {activated ? 'Programa ativo no mercado' : 'Ativar no mercado de parceiros'}
                </p>
                <p className="aff-ai-success__activate-desc">
                  {activated
                    ? 'Candidatos já podem ver e se candidatar à campanha.'
                    : 'Opcional — publique quando o conteúdo estiver revisado.'}
                </p>
              </div>
              <button
                type="button"
                className={`affiliates-page__btn ${activated ? 'affiliates-page__btn--ghost' : 'affiliates-page__btn--primary'}`}
                disabled={activating}
                onClick={() => void toggleActivate(!activated)}
              >
                {activating ? <Loader2 size={14} className="animate-spin" /> : null}
                {activated ? 'Desativar' : 'Ativar agora'}
              </button>
            </div>

            <div className="aff-ai-modal__actions">
              <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" onClick={onClose}>
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
