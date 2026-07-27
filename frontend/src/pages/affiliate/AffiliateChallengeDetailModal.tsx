/**
 * Modal de premiação / desafio no app afiliado.
 * - Capa 1:1 compacta ao lado do título (não banner esticado)
 * - Regras colapsadas com “Ver tudo”
 * - Ações (Aceitar / Agora não) sempre fixas no rodapé — sem scroll para achar o botão
 * - Após aceite: tela de sucesso “Parabéns, você está na disputa”
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Gift, X, CheckCircle2, Loader2, Target, Trophy, ChevronDown, ChevronUp, PartyPopper,
} from 'lucide-react'

const money = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatChallengeMetricValue(metric: string, v: number) {
  const n = Number(v || 0)
  if (metric === 'sales_gmv' || metric === 'commission') return money(n)
  if (metric === 'sales_kg') {
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
  }
  return n.toLocaleString('pt-BR')
}

export const CHALLENGE_METRIC_LABEL: Record<string, string> = {
  sales_gmv: 'Total vendido (R$)',
  sales_kg: 'Quantidade (kg)',
  sales_count: 'Pedidos',
  commission: 'Comissão',
  clicks: 'Cliques',
  conversions: 'Conversões',
  claims: 'Oportunidades',
}

export type ChallengeDetail = {
  id: string
  title?: string
  prize_label?: string | null
  prize_description?: string | null
  description?: string | null
  rules_text?: string | null
  cover_url?: string | null
  metric?: string
  target_value?: number
  progress_value?: number
  progress_pct?: number
  status?: string
  is_winner?: boolean
  rank_at_win?: number | null
  eligible?: boolean
  eligibility_reason?: string | null
  requires_acceptance?: boolean
  enrollment_status?: string | null
}

type Props = {
  challenge: ChallengeDetail
  primary?: string
  acting?: boolean
  /** Aceite concluído com sucesso — mostra tela de parabéns */
  acceptedSuccess?: boolean
  /** Mostra meta / progresso (hub de ranking); no nudge da home pode ocultar */
  showProgress?: boolean
  onClose: () => void
  /** Deve retornar Promise; erros são capturados aqui e exibidos no modal */
  onAccept?: () => void | Promise<void>
  onDecline?: () => void | Promise<void>
  /** CTA secundário genérico (ex.: Ver ranking) */
  secondaryLabel?: string
  onSecondary?: () => void
}

export function AffiliateChallengeDetailModal({
  challenge: ch,
  primary = '#171717',
  acting = false,
  acceptedSuccess = false,
  showProgress = true,
  onClose,
  onAccept,
  onDecline,
  secondaryLabel,
  onSecondary,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false)
  const [localActing, setLocalActing] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localSuccess, setLocalSuccess] = useState(false)

  useEffect(() => {
    setLocalSuccess(false)
    setLocalError('')
  }, [ch.id])

  const busy = acting || localActing
  const showSuccess = acceptedSuccess || localSuccess

  const metric = String(ch.metric || 'sales_gmv')
  const status = String(ch.status || '').toLowerCase()
  const enroll = String(ch.enrollment_status || '').toLowerCase()
  const needsAccept =
    status === 'active'
    && !ch.is_winner
    && ch.eligible !== false
    && !!ch.requires_acceptance
    && enroll !== 'accepted'
    && enroll !== 'declined'
    && !showSuccess

  const isParticipating =
    (enroll === 'accepted' || showSuccess) && !ch.is_winner && status === 'active'

  async function handleAccept() {
    if (!onAccept || busy) return
    setLocalError('')
    setLocalActing(true)
    try {
      await onAccept()
      setLocalSuccess(true)
    } catch (e: any) {
      setLocalError(e?.message || 'Não foi possível aceitar. Tente de novo.')
    } finally {
      setLocalActing(false)
    }
  }

  async function handleDecline() {
    if (busy) return
    setLocalError('')
    setLocalActing(true)
    try {
      if (onDecline) await onDecline()
      else onClose()
    } catch (e: any) {
      setLocalError(e?.message || 'Não foi possível recusar.')
    } finally {
      setLocalActing(false)
    }
  }

  const rules = String(ch.rules_text || '').trim()
  const desc = String(ch.description || '').trim()
  const prizeDetail = String(ch.prize_description || '').trim()
  const hasLongDesc = desc.length > 120
  const hasRules = rules.length > 0

  const footer = (
    <div className="shrink-0 border-t border-neutral-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
      {localError && (
        <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 font-medium">
          {localError}
        </p>
      )}
      {ch.is_winner && !showSuccess && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex items-center gap-2">
          <Trophy size={18} className="text-amber-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">Você venceu!</p>
            {ch.rank_at_win != null && (
              <p className="text-[11px] text-amber-800">Pódio: #{ch.rank_at_win}</p>
            )}
          </div>
        </div>
      )}
      {ch.eligible === false && ch.eligibility_reason && !showSuccess && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {ch.eligibility_reason}
        </p>
      )}
      <div className="flex gap-2">
        {needsAccept ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="flex-1 h-12 rounded-2xl border border-neutral-200 text-sm font-bold text-neutral-700 active:scale-[0.98] transition disabled:opacity-60"
              onClick={() => void handleDecline()}
            >
              Agora não
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-[1.25] h-12 rounded-2xl text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.98] transition shadow-sm"
              style={{ background: primary }}
              onClick={() => void handleAccept()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Aceitar desafio
            </button>
          </>
        ) : (
          <>
            {onSecondary && (
              <button
                type="button"
                className="flex-1 h-12 rounded-2xl border border-neutral-200 text-sm font-bold text-neutral-700"
                onClick={onSecondary}
              >
                {secondaryLabel || 'Ver mais'}
              </button>
            )}
            <button
              type="button"
              className="flex-1 h-12 rounded-2xl text-white text-sm font-bold"
              style={{ background: primary }}
              onClick={onClose}
            >
              {showSuccess || isParticipating ? 'Continuar' : 'Fechar'}
            </button>
          </>
        )}
      </div>
    </div>
  )

  const body = (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-[2001] w-full sm:max-w-[420px] max-h-[min(88vh,640px)] flex flex-col rounded-t-[22px] sm:rounded-[22px] bg-white shadow-2xl overflow-hidden">
        {/* Header compacto: capa 1:1 + título */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="flex justify-end -mr-1 mb-1">
            <button
              type="button"
              className="w-9 h-9 grid place-items-center rounded-full hover:bg-neutral-100 text-neutral-500"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-[88px] h-[88px] sm:w-[96px] sm:h-[96px] shrink-0 rounded-2xl overflow-hidden border border-neutral-100 bg-neutral-50 shadow-sm">
              {ch.cover_url ? (
                <img
                  src={ch.cover_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full grid place-items-center"
                  style={{ background: `linear-gradient(145deg, ${primary}22, ${primary}08)` }}
                >
                  <Gift size={28} style={{ color: primary }} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                id="challenge-detail-title"
                className="text-[16px] sm:text-[17px] font-extrabold text-[#1c1c1e] tracking-tight leading-snug line-clamp-3"
              >
                {ch.title}
              </h2>
              {ch.prize_label && (
                <p className="mt-1 text-sm font-bold leading-snug" style={{ color: primary }}>
                  {ch.prize_label}
                </p>
              )}
              {(showSuccess || enroll === 'accepted') && !ch.is_winner && (
                <span className="mt-1.5 inline-flex text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Participando
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Conteúdo — só o essencial; regras sob demanda */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2 space-y-2.5">
          {showSuccess && (
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white px-4 py-5 text-center">
              <div
                className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-3"
                style={{ background: `${primary}18`, color: primary }}
              >
                <PartyPopper size={28} />
              </div>
              <p className="text-base font-extrabold text-[#1c1c1e] tracking-tight">
                Parabéns! Você está na disputa
              </p>
              <p className="text-sm text-neutral-600 mt-1.5 leading-snug">
                {ch.prize_label
                  ? `Meta em jogo: ${ch.prize_label}. Continue vendendo para subir no ranking.`
                  : 'Seu aceite foi confirmado. Continue vendendo para conquistar o prêmio.'}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={13} /> Participando
              </div>
            </div>
          )}

          {!showSuccess && showProgress && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-neutral-50 py-2 px-2.5 border border-neutral-100 text-center">
                <p className="text-[10px] text-neutral-500 font-semibold">Meta</p>
                <p className="text-sm font-extrabold tabular-nums text-neutral-900 leading-tight mt-0.5">
                  {formatChallengeMetricValue(metric, Number(ch.target_value))}
                </p>
                <p className="text-[10px] text-neutral-400 truncate">
                  {CHALLENGE_METRIC_LABEL[metric] || metric}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50 py-2 px-2.5 border border-neutral-100 text-center">
                <p className="text-[10px] text-neutral-500 font-semibold">Seu progresso</p>
                <p className="text-sm font-extrabold tabular-nums text-neutral-900 leading-tight mt-0.5">
                  {formatChallengeMetricValue(metric, Number(ch.progress_value || 0))}
                </p>
                <p className="text-[10px] text-neutral-400">{ch.progress_pct || 0}%</p>
              </div>
            </div>
          )}

          {!showSuccess && showProgress && Number(ch.progress_pct || 0) > 0 && !ch.is_winner && (
            <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Number(ch.progress_pct || 0))}%`,
                  background: primary,
                }}
              />
            </div>
          )}

          {!showSuccess && prizeDetail && (
            <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Prêmio</p>
              <p className="text-xs text-neutral-800 leading-snug mt-0.5 line-clamp-3">{prizeDetail}</p>
            </div>
          )}

          {!showSuccess && desc && (
            <div>
              <p className={`text-sm text-neutral-600 leading-snug ${!descOpen && hasLongDesc ? 'line-clamp-2' : ''}`}>
                {desc}
              </p>
              {hasLongDesc && (
                <button
                  type="button"
                  className="mt-0.5 text-[11px] font-bold"
                  style={{ color: primary }}
                  onClick={() => setDescOpen((v) => !v)}
                >
                  {descOpen ? 'Ver menos' : 'Ver tudo'}
                </button>
              )}
            </div>
          )}

          {!showSuccess && hasRules && (
            <div className="rounded-xl border border-neutral-200 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-neutral-50 active:bg-neutral-50"
                onClick={() => setRulesOpen((v) => !v)}
                aria-expanded={rulesOpen}
              >
                <span className="text-[12px] font-bold text-neutral-800 inline-flex items-center gap-1.5">
                  <Target size={13} className="text-neutral-400" />
                  Regras da premiação
                </span>
                {rulesOpen
                  ? <ChevronUp size={16} className="text-neutral-400 shrink-0" />
                  : <ChevronDown size={16} className="text-neutral-400 shrink-0" />}
              </button>
              {rulesOpen && (
                <div className="px-3 pb-3 pt-0 border-t border-neutral-100">
                  <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed pt-2">
                    {rules}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {footer}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(body, document.body)
}
