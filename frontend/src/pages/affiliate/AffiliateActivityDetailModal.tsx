/**
 * Modal de registro do Histórico operacional.
 * Mostra o que foi feito, permite conferir conversa no canal e abrir a ficha —
 * sem jogar o afiliado na lista de Contatos sem contexto.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Ban, CheckCircle2, Clock3, Copy, ExternalLink, History,
  Loader2, MessageCircle, UserRound, X,
} from 'lucide-react'
import { affiliateApi, AffiliateApiError } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import type { AttendanceOpportunity } from '@/pages/affiliate/AffiliateAttendanceWorkspace'
import { WhatsAppIcon } from '@/components/icons'

export type ActivityFeedItem = {
  id: string
  ref_type: string
  ref_id: string
  contact_name: string
  phone?: string | null
  contact_status?: string | null
  contact_exists?: boolean
  contact_removed?: boolean
  contact_archived?: boolean
  action: string
  label: string
  message?: string | null
  note?: string | null
  at: string | null
}

type Props = {
  activity: ActivityFeedItem
  ctx: AppContext
  onClose: () => void
  /** Abre ficha do contato (modal de atendimento) */
  onOpenContact?: (item: AttendanceOpportunity) => void
  /** Abre tarefa do dia se houver */
  onExecuteTask?: (item: AttendanceOpportunity) => void
}

const ACTION_META: Record<string, { title: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; desc: string }> = {
  sent: { title: 'Mensagem enviada', tone: 'ok', desc: 'Você registrou o envio de uma mensagem.' },
  followup: { title: 'Follow-up', tone: 'ok', desc: 'Follow-up registrado na operação.' },
  replied: { title: 'Resposta registrada', tone: 'ok', desc: 'Contato respondeu / conversa aberta.' },
  negotiating: { title: 'Negociação', tone: 'ok', desc: 'Marcado como em negociação.' },
  auto_reply: { title: 'Resposta automática', tone: 'warn', desc: 'Identificado como bot / resposta automática.' },
  no_answer: { title: 'Sem resposta', tone: 'warn', desc: 'Sem resposta humana no momento.' },
  waiting: { title: 'Lembrar depois', tone: 'neutral', desc: 'Retorno agendado para mais tarde.' },
  channel_unavailable: { title: 'Canal indisponível', tone: 'danger', desc: 'WhatsApp/telefone não funcionava.' },
  not_matching: { title: 'Não correspondente', tone: 'danger', desc: 'Contato fora do perfil / inválido.' },
  lost: { title: 'Excluído', tone: 'danger', desc: 'Sem interesse — removido da sua fila.' },
  dismiss: { title: 'Oculto', tone: 'danger', desc: 'Oportunidade recusada / ocultada.' },
  note: { title: 'Anotação', tone: 'neutral', desc: 'Nota adicionada ao contato.' },
  ai_draft: { title: 'Rascunho IA', tone: 'neutral', desc: 'Mensagem assistida gerada.' },
  claim: { title: 'Assumido', tone: 'ok', desc: 'Você assumiu este atendimento.' },
  convert: { title: 'Convertido', tone: 'ok', desc: 'Cliente registrado.' },
  pool_skip: { title: 'Recusado no pool', tone: 'warn', desc: 'Pulou na lista de disponíveis.' },
}

function digits(phone?: string | null) {
  return String(phone || '').replace(/\D/g, '')
}

function formatWhen(iso: string | null) {
  if (!iso) return 'Agora'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusLabel(status?: string | null) {
  const s = String(status || '').toLowerCase()
  if (!s) return null
  const map: Record<string, string> = {
    new: 'Novo',
    contacted: 'Contactado',
    awaiting_response: 'Aguardando resposta',
    engaged: 'Em conversa',
    negotiating: 'Negociando',
    proposal_sent: 'Proposta enviada',
    lost: 'Excluído',
    converted: 'Convertido',
    recycled: 'Reciclado',
    assigned: 'Atribuído',
    active: 'Ativo',
  }
  return map[s] || status
}

export function AffiliateActivityDetailModal({
  activity,
  ctx,
  onClose,
  onOpenContact,
  onExecuteTask,
}: Props) {
  const meta = ACTION_META[activity.action] || {
    title: activity.label || 'Ação',
    tone: 'neutral' as const,
    desc: 'Registro da sua operação.',
  }

  const [loadingContact, setLoadingContact] = useState(true)
  const [contact, setContact] = useState<AttendanceOpportunity | null>(null)
  const [contactGone, setContactGone] = useState(Boolean(activity.contact_removed))
  const [contactArchived, setContactArchived] = useState(Boolean(activity.contact_archived))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const EXIT_ACTIONS = new Set([
    'lost', 'channel_unavailable', 'not_matching', 'dismiss', 'pool_skip', 'convert',
  ])
  const activityIsExit = EXIT_ACTIONS.has(String(activity.action || '').toLowerCase())

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadingContact(true)
    setLoadError(null)
    setContactGone(Boolean(activity.contact_removed))
    setContactArchived(Boolean(activity.contact_archived) || activityIsExit)

    /* Se API já disse removido, não gasta round-trip pesado */
    if (activity.contact_removed === true) {
      setContact(null)
      setContactArchived(true)
      setLoadingContact(false)
      return
    }

    ;(async () => {
      try {
        /* 1) Timeline do contato (404 = removido da operação do afiliado) */
        try {
          await affiliateApi.opportunityHistory(activity.ref_type, activity.ref_id)
        } catch (e: unknown) {
          const status = e instanceof AffiliateApiError ? e.status : 0
          const msg = e instanceof Error ? e.message : ''
          if (status === 404 || /não encontrado|nao encontrado/i.test(msg)) {
            if (!cancelled) {
              setContactGone(true)
              setContactArchived(true)
              setContact(null)
              setLoadingContact(false)
            }
            return
          }
        }

        /* 2) Snapshot na lista (aberta + arquivo) */
        const r = await affiliateApi.opportunities('all', 1, 400, { includeClosed: true })
        if (cancelled) return
        const open = Array.isArray(r.all_open) ? r.all_open : []
        const closed = Array.isArray(r.all_closed) ? r.all_closed : []
        const hitOpen = open.find(
          (i: any) =>
            String(i.ref_id) === String(activity.ref_id)
            && String(i.ref_type) === String(activity.ref_type),
        ) as AttendanceOpportunity | undefined
        const hitClosed = closed.find(
          (i: any) =>
            String(i.ref_id) === String(activity.ref_id)
            && String(i.ref_type) === String(activity.ref_type),
        ) as AttendanceOpportunity | undefined

        if (hitOpen) {
          setContact(hitOpen)
          setContactGone(false)
          setContactArchived(hitOpen.operational_phase === 'closed' || activityIsExit)
        } else if (hitClosed || activity.contact_archived || activityIsExit) {
          /* Arquivado: ficha só em modo “não disponível” */
          const base = hitClosed || {
            id: `${activity.ref_type}:${activity.ref_id}`,
            ref_type: activity.ref_type as 'affiliate_lead' | 'assignment',
            ref_id: activity.ref_id,
            name: activity.contact_name || 'Contato',
            phone: activity.phone || null,
            channels: activity.phone ? { whatsapp: activity.phone } : undefined,
            has_whatsapp: digits(activity.phone).length >= 8,
            operational_phase: 'closed' as const,
            status_code: activity.contact_status || activity.action || 'lost',
            followup_due: false,
          }
          setContact({
            ...base,
            operational_phase: 'closed',
            status_code: base.status_code || activity.action || 'lost',
            followup_due: false,
          })
          setContactGone(false)
          setContactArchived(true)
        } else if (activity.contact_exists === false) {
          setContactGone(true)
          setContactArchived(true)
          setContact(null)
        } else {
          const phone = activity.phone || null
          setContact({
            id: `${activity.ref_type}:${activity.ref_id}`,
            ref_type: activity.ref_type as 'affiliate_lead' | 'assignment',
            ref_id: activity.ref_id,
            name: activity.contact_name || 'Contato',
            phone,
            channels: phone ? { whatsapp: phone } : undefined,
            has_whatsapp: digits(phone).length >= 8,
            operational_phase: 'contacted',
            status_code: activity.contact_status || undefined,
            followup_due: false,
          })
          setContactGone(false)
          setContactArchived(false)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Falha ao carregar contato')
          if (activity.contact_removed || activityIsExit) {
            setContactGone(true)
            setContactArchived(true)
          }
        }
      } finally {
        if (!cancelled) setLoadingContact(false)
      }
    })()

    return () => { cancelled = true }
  }, [activity, activityIsExit])

  const phone = useMemo(() => {
    return digits(contact?.phone || contact?.channels?.whatsapp || activity.phone)
  }, [contact, activity.phone])

  const hasWa = phone.length >= 8

  function openConversation() {
    if (!hasWa) {
      ctx.showToast('Sem número de WhatsApp neste registro', 'err')
      return
    }
    window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer')
    ctx.showToast('Abrindo conversa no WhatsApp…')
  }

  function copyPhone() {
    if (!hasWa) return
    navigator.clipboard.writeText(phone).then(
      () => {
        setCopied(true)
        ctx.showToast('Número copiado')
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => ctx.showToast('Falha ao copiar', 'err'),
    )
  }

  function openFicha() {
    if (!contact || contactGone) return
    /* Arquivado: abre ficha só no modo “não disponível” */
    onOpenContact?.({
      ...contact,
      operational_phase: contactArchived ? 'closed' : contact.operational_phase,
      status_code: contactArchived
        ? (contact.status_code || activity.action || 'lost')
        : contact.status_code,
      followup_due: contactArchived ? false : contact.followup_due,
    })
  }

  /** Negativas: sem conferir conversa, sem número, sem “ver status” */
  const isNegativeExit = new Set([
    'lost', 'channel_unavailable', 'not_matching', 'dismiss', 'pool_skip',
  ]).has(String(activity.action || '').toLowerCase())

  const canOpenFicha =
    Boolean(contact)
    && !contactGone
    && !loadingContact
    && !isNegativeExit
    && !contactArchived
  const canShowChannelActions = hasWa && !isNegativeExit && !contactGone
  const canExecuteTask =
    Boolean(contact)
    && !contactGone
    && !contactArchived
    && !isNegativeExit
    && Boolean(contact?.followup_due)
    && Boolean(onExecuteTask)

  const toneClass =
    meta.tone === 'ok'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
      : meta.tone === 'warn'
        ? 'bg-amber-50 text-amber-900 border-amber-100'
        : meta.tone === 'danger'
          ? 'bg-red-50 text-red-800 border-red-100'
          : 'bg-neutral-50 text-neutral-800 border-neutral-200'

  return (
    <div
      className="fixed inset-0 z-[530] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Registro da atividade"
      onMouseDown={onClose}
    >
      <div
        className="relative flex max-h-[min(94dvh,760px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-md sm:rounded-[22px]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center py-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>

        <header className="flex items-start gap-3 border-b border-neutral-200 px-4 pb-3 pt-1 sm:px-5 sm:pt-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${toneClass}`}>
            <History size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Registro do histórico
            </p>
            <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              <Clock3 size={11} className="mr-1 inline" />
              {formatWhen(activity.at)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-2xl text-neutral-500 active:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 space-y-3">
          {/* Contato */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white border border-neutral-200 text-neutral-700">
                <UserRound size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-neutral-950">
                  {activity.contact_name || contact?.name || 'Contato'}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {statusLabel(contact?.status_code || activity.contact_status) || meta.desc}
                </p>
              </div>
            </div>
            {/* Número só em casos ativos — em exclusão não expor */}
            {canShowChannelActions && (
              <p className="mt-2 text-[12px] font-medium tabular-nums text-neutral-700">
                +{phone}
              </p>
            )}
          </div>

          {(contactGone || contactArchived || isNegativeExit) && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-3.5 py-3 text-red-950">
              <div className="flex gap-2.5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" />
                <div>
                  <p className="text-[13px] font-bold">Contato excluído</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-red-900/90">
                    {String(activity.action) === 'channel_unavailable'
                      ? 'Canal indisponível. Não há como conferir conversa — o atendimento saiu da sua fila.'
                      : String(activity.action) === 'not_matching'
                        ? 'Não correspondente. Contato excluído da sua fila.'
                        : 'Excluído da sua operação ativa. O registro no histórico existe só para consulta e para não recaptar à toa.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Detalhe da ação */}
          <div className="rounded-2xl border border-neutral-200 bg-white px-3.5 py-3 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              O que foi feito
            </p>
            <p className="text-[13px] font-semibold text-neutral-950">{activity.label || meta.title}</p>
            <p className="text-[12px] text-neutral-600 leading-relaxed">{meta.desc}</p>

            {activity.message && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
                  Mensagem enviada
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-emerald-950">
                  {activity.message}
                </p>
              </div>
            )}

            {activity.note && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  Anotação
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-neutral-800">
                  {activity.note}
                </p>
              </div>
            )}

            {!activity.message && !activity.note && (
              <p className="text-[12px] text-neutral-500">
                Sem texto de mensagem ou nota neste registro — só o resultado da etapa.
              </p>
            )}
          </div>

          {loadingContact && (
            <div className="flex items-center gap-2 text-xs text-neutral-500 py-1">
              <Loader2 size={14} className="animate-spin" />
              Verificando se o contato ainda existe…
            </div>
          )}

          {loadError && !contactGone && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
              {loadError}
            </div>
          )}
        </div>

        <footer className="border-t border-neutral-200 px-4 py-3 sm:px-5 space-y-2">
          {isNegativeExit || contactGone || contactArchived ? (
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 w-full items-center justify-center rounded-[16px] bg-neutral-950 text-sm font-bold text-white"
            >
              Entendi
            </button>
          ) : (
            <>
              {canShowChannelActions && (
                <button
                  type="button"
                  onClick={openConversation}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#25D366] px-4 text-sm font-bold text-white active:scale-[0.99]"
                >
                  <WhatsAppIcon size={18} />
                  Conferir conversa
                  <ExternalLink size={14} className="opacity-80" />
                </button>
              )}

              <div className={`grid gap-2 ${canShowChannelActions ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {canShowChannelActions && (
                  <button
                    type="button"
                    onClick={copyPhone}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 active:bg-neutral-50"
                  >
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado' : 'Copiar número'}
                  </button>
                )}
                {canOpenFicha && (
                  <button
                    type="button"
                    onClick={openFicha}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 active:bg-neutral-50"
                  >
                    <MessageCircle size={14} />
                    Abrir ficha
                  </button>
                )}
              </div>

              {canExecuteTask && contact && onExecuteTask && (
                <button
                  type="button"
                  onClick={() => onExecuteTask(contact)}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-950 active:bg-amber-100"
                >
                  Executar tarefa do dia
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
