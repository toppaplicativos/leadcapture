/**
 * Modal de TAREFA — diretor central de execução.
 * Diferente do modal de contato (detalhes/histórico): aqui se executa o que o dia pede
 * (follow-up, qualificar, proposta, pós-venda…), com template e resultado.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck, Check, ChevronRight, Clock3, Loader2, Send, X, Zap, MessageCircle, Ban, Phone,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import type { AttendanceOpportunity } from '@/pages/affiliate/AffiliateAttendanceWorkspace'
import { WhatsAppSendModal, type WaSendLead } from '@/components/WhatsAppSendModal'
import {
  enqueueProgress,
  isNetworkLikeError,
  patchFromAction,
  patchOpportunitiesCache,
  type ProgressPatch,
} from '@/lib/affiliate-crm-local'
import { formatCountdown, formatDueAt, isTaskDue } from '@/lib/affiliate-contact-ops'

export type AttendanceTaskItem = {
  id: string
  ref_type: string
  ref_id: string
  task_type: string
  instruction?: string | null
  template_id?: string | null
  due_at: string
  status: string
  contact_name?: string | null
}

type Props = {
  task: AttendanceTaskItem
  ctx: AppContext
  onClose: () => void
  onChanged?: (patch?: ProgressPatch) => void
  onOpenContact?: (item: AttendanceOpportunity) => void
  onConnectWhatsApp?: () => void
}

const TASK_META: Record<string, { title: string; tone: 'due' | 'ok' | 'warn'; defaultTemplate: string }> = {
  first_contact: { title: 'Primeiro contato', tone: 'due', defaultTemplate: 'optin' },
  followup_1: { title: 'Follow-up', tone: 'warn', defaultTemplate: 'followup' },
  followup_2: { title: '2º follow-up', tone: 'warn', defaultTemplate: 'followup' },
  qualify: { title: 'Qualificar interesse', tone: 'ok', defaultTemplate: 'followup' },
  proposal: { title: 'Enviar proposta', tone: 'ok', defaultTemplate: 'proposta' },
  close: { title: 'Fechar / decidir', tone: 'ok', defaultTemplate: 'proposta' },
  post_sale: { title: 'Pós-venda', tone: 'ok', defaultTemplate: 'followup' },
}

/** Templates sugeridos no compositor conforme tipo de tarefa */
const TEMPLATE_CHIPS: { id: string; label: string }[] = [
  { id: 'optin', label: '1ª mensagem' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'proposta', label: 'Proposta' },
]

const DESTRUCTIVE_ACTIONS = new Set(['lost', 'channel_unavailable', 'not_matching', 'dismiss'])

function isPersistedTaskId(id: string) {
  return Boolean(id)
    && !id.startsWith('legacy-')
    && !id.startsWith('from-contact-')
}

function formatDue(iso: string) {
  try {
    const d = new Date(iso)
    const now = Date.now()
    if (d.getTime() < now) {
      return `Atrasada · ${d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    }
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    if (d.getTime() <= todayEnd.getTime()) {
      return `Hoje · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    }
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function AffiliateTaskWorkspace({
  task,
  ctx,
  onClose,
  onChanged,
  onOpenContact,
  onConnectWhatsApp,
}: Props) {
  const meta = TASK_META[task.task_type] || {
    title: 'Tarefa',
    tone: 'due' as const,
    defaultTemplate: task.template_id || 'followup',
  }
  const [templateId, setTemplateId] = useState(
    () => task.template_id || meta.defaultTemplate,
  )

  const [contact, setContact] = useState<AttendanceOpportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [sentRegistered, setSentRegistered] = useState(false)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const [taskChannel, setTaskChannel] = useState<'whatsapp' | 'phone'>('whatsapp')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    setTemplateId(task.template_id || meta.defaultTemplate)
  }, [task.id, task.template_id, meta.defaultTemplate])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSentRegistered(false)
    setDoneMsg(null)
    setConfirmAction(null)
    affiliateApi
      .opportunities('all', 1, 400, { includeClosed: true })
      .then((r) => {
        if (cancelled) return
        const open = Array.isArray(r.all_open) ? r.all_open : []
        const closed = Array.isArray(r.all_closed) ? r.all_closed : []
        const list = [...open, ...closed] as AttendanceOpportunity[]
        const hit = list.find(
          (i) =>
            String(i.ref_id) === String(task.ref_id)
            && String(i.ref_type) === String(task.ref_type),
        )
        if (hit) {
          setContact({
            ...hit,
            next_action: task.instruction || hit.next_action,
            suggested_template: templateId,
            followup_due: true,
          })
        } else {
          setContact({
            id: `${task.ref_type}:${task.ref_id}`,
            ref_type: task.ref_type as 'affiliate_lead' | 'assignment',
            ref_id: task.ref_id,
            name: task.contact_name || 'Contato',
            operational_phase: task.task_type === 'qualify' || task.task_type === 'proposal' ? 'engaged' : 'contacted',
            next_action: task.instruction || meta.title,
            suggested_template: templateId,
            followup_due: true,
            next_followup_at: task.due_at,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContact({
            id: `${task.ref_type}:${task.ref_id}`,
            ref_type: task.ref_type as 'affiliate_lead' | 'assignment',
            ref_id: task.ref_id,
            name: task.contact_name || 'Contato',
            operational_phase: 'contacted',
            next_action: task.instruction || meta.title,
            suggested_template: templateId,
            followup_due: true,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [task.id, task.ref_id, task.ref_type, task.contact_name, task.instruction, task.due_at, templateId, meta.title, task.task_type])

  const lead: WaSendLead | null = useMemo(() => {
    if (!contact) return null
    return {
      id: `${contact.ref_type}:${contact.ref_id}`,
      name: contact.name,
      trade_name: contact.name,
      phone: contact.phone || contact.channels?.whatsapp || undefined,
      city: contact.city || undefined,
      state: contact.region || undefined,
      niche: contact.niche || undefined,
      product_name: contact.product_name || undefined,
      brand_name: contact.brand_name || ctx.brand?.name || undefined,
      notes: task.instruction || contact.next_action || undefined,
    }
  }, [contact, ctx.brand?.name, task.instruction])

  const phoneDigits = String(contact?.phone || contact?.channels?.whatsapp || '').replace(/\D/g, '')
  const hasWa = phoneDigits.length >= 8
  const persistedTaskId = isPersistedTaskId(task.id) ? task.id : undefined
  const executable = isTaskDue(task.due_at)

  async function runProgress(
    action: string,
    extra?: { message?: string; note?: string; stayOpen?: boolean; channel?: 'whatsapp' | 'phone' },
  ) {
    if (!contact) return
    if (!executable && action !== 'note') {
      ctx.showToast(`Tarefa libera ${formatCountdown(task.due_at)}`, 'err')
      return
    }
    setSaving(action)
    setError(null)
    setConfirmAction(null)
    const channel =
      extra?.channel
      || (action === 'called' || action === 'voicemail' || action === 'busy' || action === 'callback_requested'
        ? 'phone'
        : taskChannel)
    const payload = {
      action: action as any,
      channel,
      message: extra?.message,
      note: extra?.note || task.instruction || undefined,
      reason: action,
      ...(persistedTaskId && action !== 'note' ? { task_id: persistedTaskId } : {}),
    }
    const patch = patchFromAction(contact.ref_type, contact.ref_id, action, {
      note: payload.note,
    })
    patchOpportunitiesCache(patch)
    /* Enviado no meio da tarefa: atualiza lista mas NÃO fecha o modal */
    if (action === 'sent' || action === 'called' || extra?.stayOpen) {
      onChanged?.({ ...patch, action: action === 'called' ? 'called' : 'sent' })
    } else {
      onChanged?.(patch)
    }
    try {
      const res = await affiliateApi.progressOpportunity(contact.ref_type, contact.ref_id, payload)
      if (action === 'sent' || action === 'called' || extra?.stayOpen) {
        setSentRegistered(true)
        setDoneMsg(null)
        ctx.showToast(
          res.toast
          || (action === 'called'
            ? 'Ligação registrada · agora o resultado'
            : 'Mensagem registrada · agora o resultado'),
        )
      } else {
        const exitMsg: Record<string, string> = {
          lost: 'Excluído · contato saiu da fila',
          channel_unavailable: 'Canal indisponível · contato excluído',
          not_matching: 'Não correspondente · contato excluído',
          dismiss: 'Oculto · removido da sua lista',
        }
        const toast = exitMsg[action] || res.toast || 'Tarefa concluída'
        setDoneMsg(toast)
        ctx.showToast(toast)
        /* Exclusão: fecha na hora; demais resultados: breve feedback */
        if (DESTRUCTIVE_ACTIONS.has(action)) {
          onClose()
        } else {
          window.setTimeout(() => onClose(), 450)
        }
      }
    } catch (e) {
      if (isNetworkLikeError(e)) {
        enqueueProgress(contact.ref_type, contact.ref_id, payload)
        ctx.showToast('Salvo no aparelho — sincroniza depois')
        if (action === 'sent' || action === 'called' || extra?.stayOpen) {
          setSentRegistered(true)
        } else {
          onClose()
        }
      } else {
        setError(e instanceof Error ? e.message : 'Falha ao concluir')
        ctx.showToast(e instanceof Error ? e.message : 'Falha ao concluir', 'err')
      }
    } finally {
      setSaving(null)
    }
  }

  function requestOutcome(action: string) {
    if (DESTRUCTIVE_ACTIONS.has(action)) {
      setConfirmAction(action)
      return
    }
    void runProgress(action)
  }

  /** Ações rápidas de resultado conforme tipo de tarefa + canal */
  const quickOutcomes = useMemo(() => {
    if (task.task_type === 'post_sale') {
      return [
        { action: 'note', label: 'Pós-venda feito', desc: 'Marcar como concluído' },
        { action: 'waiting', label: 'Lembrar depois', desc: 'Outro toque amanhã' },
      ]
    }
    if (taskChannel === 'phone') {
      return [
        { action: 'replied', label: 'Atendeu / conversou', desc: 'Vai para conversa' },
        { action: 'no_answer', label: 'Não atendeu', desc: 'Follow-up em 3 dias' },
        { action: 'busy', label: 'Ocupado', desc: 'Tentar amanhã' },
        { action: 'voicemail', label: 'Caixa postal', desc: 'Retomar em 2 dias' },
        { action: 'callback_requested', label: 'Pediu retorno', desc: 'Amanhã' },
        { action: 'channel_unavailable', label: 'Telefone morto', desc: 'Excluir da fila' },
        { action: 'lost', label: 'Sem interesse', desc: 'Excluir da fila' },
      ]
    }
    if (task.task_type === 'qualify' || task.task_type === 'proposal' || task.task_type === 'close') {
      return [
        { action: 'replied', label: 'Segue conversa', desc: 'Interesse ativo' },
        { action: 'negotiating', label: 'Em negociação', desc: 'Proposta / fechamento' },
        { action: 'no_answer', label: 'Sem resposta', desc: 'Novo follow-up em 3 dias' },
        { action: 'lost', label: 'Sem interesse', desc: 'Excluir da fila' },
      ]
    }
    return [
      { action: 'replied', label: 'Respondeu', desc: 'Vai para conversa' },
      { action: 'no_answer', label: 'Sem resposta', desc: 'Follow-up em 3 dias' },
      { action: 'auto_reply', label: 'Foi bot', desc: 'Retomar em 2 dias' },
      { action: 'channel_unavailable', label: 'Canal morto', desc: 'Excluir da fila' },
      { action: 'lost', label: 'Sem interesse', desc: 'Excluir da fila' },
    ]
  }, [task.task_type, taskChannel])

  const confirmCopy: Record<string, { title: string; body: string }> = {
    lost: {
      title: 'Excluir sem interesse?',
      body: 'O contato sai da sua fila. Fica no histórico só para consulta e para não voltar à toa.',
    },
    channel_unavailable: {
      title: 'Marcar canal indisponível?',
      body: 'Exclui este atendimento da sua fila. Use se o número não existe ou não tem WhatsApp.',
    },
    not_matching: {
      title: 'Marcar como não correspondente?',
      body: 'Remove da sua operação ativa (nicho errado, contato inválido).',
    },
    dismiss: {
      title: 'Ocultar este contato?',
      body: 'Some da sua fila. A ação não bloqueia outros afiliados no pool.',
    },
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[520] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Tarefa: ${meta.title}`}
        onMouseDown={onClose}
      >
        <div
          className="relative flex max-h-[min(96dvh,820px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[22px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center py-2 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-neutral-300" />
          </div>

          <header className="border-b border-neutral-200 px-4 pb-3 pt-1 sm:px-5 sm:pt-4">
            <div className="flex items-start gap-3">
              <span
                className={[
                  'grid h-11 w-11 shrink-0 place-items-center rounded-2xl',
                  meta.tone === 'warn' ? 'bg-amber-50 text-amber-800' : meta.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700',
                ].join(' ')}
              >
                <CalendarCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tarefa de hoje</p>
                <h2 className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                  {meta.title}
                </h2>
                <p className="mt-0.5 truncate text-xs text-neutral-600">
                  {contact?.name || task.contact_name || 'Contato'}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-amber-800">
                  <Clock3 size={12} className="mr-1 inline" />
                  {formatDue(task.due_at)}
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
            </div>
            {(task.instruction || contact?.next_action) && (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[12px] leading-snug text-neutral-800">
                <p className="font-bold text-neutral-950">O que fazer</p>
                <p className="mt-0.5">{task.instruction || contact?.next_action}</p>
              </div>
            )}
            {sentRegistered && (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-900">
                Contato registrado · escolha o resultado abaixo (modal permanece aberto)
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {loading && (
              <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
                <Loader2 size={16} className="animate-spin" /> Carregando contato…
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            {doneMsg && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900">
                <Check size={14} /> {doneMsg}
              </div>
            )}

            {!loading && contact && (
              <div className="space-y-4">
                {!executable && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950">
                    <p className="text-[13px] font-bold">Tarefa ainda não liberada</p>
                    <p className="mt-1 text-[12px] leading-relaxed">
                      Disponível {formatDueAt(task.due_at)} · {formatCountdown(task.due_at)}.
                      Envio e resultado ficam bloqueados até o horário.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskChannel('whatsapp')}
                    className={[
                      'min-h-10 rounded-xl border text-[11px] font-bold',
                      taskChannel === 'whatsapp'
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700',
                    ].join(' ')}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskChannel('phone')}
                    className={[
                      'min-h-10 rounded-xl border text-[11px] font-bold',
                      taskChannel === 'phone'
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700',
                    ].join(' ')}
                  >
                    Telefone
                  </button>
                </div>

                {taskChannel === 'whatsapp' ? (
                  <>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">Template da mensagem</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TEMPLATE_CHIPS.map((chip) => {
                          const on = templateId === chip.id
                          return (
                            <button
                              key={chip.id}
                              type="button"
                              disabled={!executable}
                              onClick={() => setTemplateId(chip.id)}
                              className={[
                                'h-9 rounded-full border px-3 text-[11px] font-semibold transition',
                                on
                                  ? 'border-neutral-900 bg-neutral-900 text-white'
                                  : 'border-neutral-200 bg-white text-neutral-700 active:bg-neutral-50',
                                !executable ? 'opacity-40' : '',
                              ].join(' ')}
                            >
                              {chip.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!hasWa || !!saving || !executable}
                      onClick={() => setShowComposer(true)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Send size={16} />
                      {task.task_type === 'proposal' || templateId === 'proposta'
                        ? 'Abrir mensagem de proposta'
                        : task.task_type === 'first_contact' || templateId === 'optin'
                          ? 'Abrir 1ª mensagem'
                          : task.task_type === 'post_sale'
                            ? 'Abrir mensagem de pós-venda'
                            : 'Abrir follow-up de hoje'}
                    </button>

                    {!hasWa && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        Sem WhatsApp neste contato. Use telefone ou marque canal indisponível.
                        {onConnectWhatsApp ? (
                          <>
                            {' '}
                            <button type="button" className="font-bold underline" onClick={onConnectWhatsApp}>
                              Conectar WhatsApp
                            </button>
                          </>
                        ) : null}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={!hasWa || !!saving || !executable}
                      onClick={() => {
                        const d = phoneDigits
                        if (d.length < 8) return
                        window.location.href = `tel:+${d.startsWith('55') ? d : d}`
                        ctx.showToast('Discando… registre a ligação ao voltar')
                      }}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-sky-700 px-4 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Phone size={16} />
                      Ligar agora
                    </button>
                    <button
                      type="button"
                      disabled={!hasWa || !!saving || !executable}
                      onClick={() => void runProgress('called', { channel: 'phone', stayOpen: true })}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-sky-200 bg-sky-50 text-sm font-bold text-sky-950 disabled:opacity-40"
                    >
                      {saving === 'called' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Já liguei · registrar tentativa
                    </button>
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                    {sentRegistered ? 'Registrar resultado (próximo passo)' : 'Registrar resultado da tarefa'}
                  </p>
                  <ul className="space-y-1.5">
                    {quickOutcomes.map((o) => (
                      <li key={o.action}>
                        <button
                          type="button"
                          disabled={!!saving || !executable}
                          onClick={() => requestOutcome(o.action)}
                          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 text-left active:bg-neutral-50 disabled:opacity-50"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700">
                            {o.action === 'replied' || o.action === 'negotiating' ? (
                              taskChannel === 'phone' ? <Phone size={16} /> : <MessageCircle size={16} />
                            ) : o.action === 'lost' || o.action === 'channel_unavailable' ? (
                              <Ban size={16} />
                            ) : (
                              <Zap size={16} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-[13px] text-neutral-950">{o.label}</strong>
                            <span className="block text-[11px] text-neutral-500">{o.desc}</span>
                          </span>
                          {saving === o.action ? (
                            <Loader2 size={16} className="animate-spin text-neutral-400" />
                          ) : (
                            <ChevronRight size={16} className="text-neutral-300" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {onOpenContact && (
                  <button
                    type="button"
                    onClick={() => onOpenContact(contact)}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700 active:bg-neutral-50"
                  >
                    Ver ficha do contato (histórico)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Confirmação de saída destrutiva */}
          {confirmAction && (
            <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 p-4 sm:items-center">
              <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
                <p className="text-[15px] font-bold text-neutral-950">
                  {confirmCopy[confirmAction]?.title || 'Confirmar ação?'}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                  {confirmCopy[confirmAction]?.body || 'Esta ação exclui o contato da sua fila aberta.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="h-11 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!!saving}
                    onClick={() => void runProgress(confirmAction)}
                    className="h-11 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving === confirmAction ? '…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showComposer && lead && contact && (
        <WhatsAppSendModal
          key={`task-${task.id}-${templateId}`}
          leads={[lead]}
          initialBrandName={String(ctx.brand?.name || contact.brand_name || '')}
          initialProductName={String(contact.product_name || '').trim()}
          initialValueProposition={String(ctx.brand?.slogan || '').trim()}
          initialTemplateId={templateId}
          /* trackedLinks vazio: o modal auto-carrega links do afiliado e restaura preferência. */
          trackedLinks={{}}
          onClose={() => setShowComposer(false)}
          onAiPersonalize={async ({ lead: l, currentMessage, templateId: tid }) => {
            const [refType, refId] = String(l.id || '').split(':')
            if (!refType || !refId) return currentMessage
            const result = await affiliateApi.assistOpportunity(refType, refId, {
              intent: tid === 'optin' ? 'optin_authorization' : tid,
              instruction: currentMessage.slice(0, 600),
            })
            return String(result.message || currentMessage)
          }}
          onSent={async () => {
            setShowComposer(false)
            /* Marca enviado; modal de tarefa permanece para registrar o resultado */
            await runProgress('sent', { stayOpen: true })
          }}
        />
      )}
    </>
  )
}
