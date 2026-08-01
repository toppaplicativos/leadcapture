/**
 * Modal de TAREFA — fluxo em fases (product register / Impeccable).
 *
 * 1. overview  → visão da tarefa + "O que fazer" + seguir
 * 2. contact   → mensagem (template certo) ou ligação
 * 3. result    → registrar resultado da tarefa
 * 4. done      → feedback + próxima tarefa
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, ListTodo, Loader2, MessageCircle, Phone, Send, X,
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
  contact_channel?: 'whatsapp' | 'phone' | 'instagram' | 'note' | 'system' | null
  due_at: string
  status: string
  contact_name?: string | null
}

type Props = {
  task: AttendanceTaskItem
  ctx: AppContext
  onClose: () => void
  onChanged?: (patch?: ProgressPatch) => void
  nextTask?: AttendanceTaskItem | null
  onNextTask?: (task: AttendanceTaskItem) => void
  onOpenContact?: (item: AttendanceOpportunity) => void
  onConnectWhatsApp?: () => void
}

type Phase = 'overview' | 'contact' | 'result' | 'done'

const TASK_META: Record<string, { title: string; tone: 'due' | 'ok' | 'warn'; defaultTemplate: string; blurb: string }> = {
  first_contact: {
    title: 'C1 · Abertura',
    tone: 'due',
    defaultTemplate: 'optin',
    blurb: 'Bate porta — Grande Ideia + Problema 1. Registre se houve resposta.',
  },
  followup_1: {
    title: 'C2 · Check-in',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Outro ângulo (D+2). Retome e registre o resultado.',
  },
  followup_2: {
    title: 'C3 · Consciência',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Implicação + futuro positivo (D+5).',
  },
  followup_3: {
    title: 'C4 · Prova',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Prova social e números (D+8).',
  },
  followup_4: {
    title: 'C5 · Educação',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Ensina conceito sem pressão (D+12).',
  },
  followup_5: {
    title: 'C6 · Caso real',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Storytelling de transformação (D+16).',
  },
  followup_6: {
    title: 'C7 · Valor puro',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Presente / conteúdo gratuito (D+20).',
  },
  followup_7: {
    title: 'C8 · Break-up',
    tone: 'warn',
    defaultTemplate: 'followup',
    blurb: 'Última chance com dignidade (D+25).',
  },
  qualify: {
    title: 'Qualificar interesse',
    tone: 'ok',
    defaultTemplate: 'followup',
    blurb: 'Saiu da régua cold — confirme fit e interesse real.',
  },
  proposal: {
    title: 'Enviar proposta',
    tone: 'ok',
    defaultTemplate: 'proposta',
    blurb: 'Envie a proposta e anote a reação.',
  },
  close: {
    title: 'Fechar / decidir',
    tone: 'ok',
    defaultTemplate: 'proposta',
    blurb: 'Empurre a decisão e registre o desfecho.',
  },
  post_sale: {
    title: 'Pós-venda',
    tone: 'ok',
    defaultTemplate: 'followup',
    blurb: 'Toque de pós-venda e encerramento.',
  },
}

const DESTRUCTIVE_ACTIONS = new Set(['lost', 'not_matching', 'dismiss'])
const CONFIRM_ACTIONS = new Set([...DESTRUCTIVE_ACTIONS, 'channel_unavailable', 'release_phone_pool'])

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

function taskRequiresPhone(task: AttendanceTaskItem) {
  if (task.contact_channel === 'phone') return true
  if (task.contact_channel === 'whatsapp') return false
  const instruction = String(task.instruction || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return /\b(contato|tentar|ligar|ligacao)\b.*\b(telefone|telefonico|ligar|ligacao)\b/.test(instruction)
    || /\b(telefone|telefonico|ligar|ligacao)\b.*\b(contato|tentar)\b/.test(instruction)
}

function channelStageTitle(title: string, phoneOnly: boolean) {
  return title.replace(/^C(\d+)\b/, `C$1-${phoneOnly ? 'Tel' : 'WA'}`)
}

const PHASE_LABEL: Record<Phase, string> = {
  overview: 'Visão',
  contact: 'Mensagem',
  result: 'Resultado',
  done: 'Concluído',
}

export function AffiliateTaskWorkspace({
  task,
  ctx,
  onClose,
  onChanged,
  nextTask,
  onNextTask,
  onOpenContact,
  onConnectWhatsApp,
}: Props) {
  const phoneRequiredByTask = useMemo(() => taskRequiresPhone(task), [task])
  const baseMeta = TASK_META[task.task_type] || {
    title: 'Tarefa',
    tone: 'due' as const,
    defaultTemplate: task.template_id || 'followup',
    blurb: 'Execute o contato e registre o resultado.',
  }
  const meta = {
    ...baseMeta,
    title: channelStageTitle(baseMeta.title, phoneRequiredByTask),
  }

  const [templateId, setTemplateId] = useState(
    () => task.template_id || meta.defaultTemplate,
  )
  const [phase, setPhase] = useState<Phase>('overview')
  const [contact, setContact] = useState<AttendanceOpportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [nextTaskFeedback, setNextTaskFeedback] = useState<{ due_at: string; instruction?: string | null } | null>(null)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const [taskChannel, setTaskChannel] = useState<'whatsapp' | 'phone'>(
    () => phoneRequiredByTask ? 'phone' : 'whatsapp',
  )
  const [managedTemplates, setManagedTemplates] = useState<Array<{
    program_id?: string | null
    message_step: number
    trigger_result: string
    title: string
    body: string
  }>>([])
  const [managedProgramId, setManagedProgramId] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    setTemplateId(task.template_id || meta.defaultTemplate)
    setPhase('overview')
    setDoneMsg(null)
    setNextTaskFeedback(null)
    setError(null)
    setConfirmAction(null)
    setShowComposer(false)
    setTaskChannel(phoneRequiredByTask ? 'phone' : 'whatsapp')
  }, [task.id, task.template_id, meta.defaultTemplate, phoneRequiredByTask])

  useEffect(() => {
    let cancelled = false
    affiliateApi.messageTemplates()
      .then((result) => {
        if (cancelled) return
        setManagedTemplates(Array.isArray(result.templates) ? result.templates : [])
        setManagedProgramId(String(result.program_id || '').trim() || null)
      })
      .catch(() => {
        if (!cancelled) {
          setManagedTemplates([])
          setManagedProgramId(null)
        }
      })
    return () => { cancelled = true }
  }, [task.id, ctx.cacheVersion])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    affiliateApi
      .opportunities('all', 1, 150, { includeClosed: true })
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

  useEffect(() => {
    if (phoneRequiredByTask || contact?.phone_only || contact?.contact_mode === 'phone_only') {
      setTaskChannel('phone')
    }
  }, [contact?.contact_mode, contact?.phone_only, phoneRequiredByTask])

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

  const phoneDigits = String(contact?.channels?.phone || contact?.phone || contact?.channels?.whatsapp || '').replace(/\D/g, '')
  const taskConfirmsWhatsApp = task.contact_channel === 'whatsapp' || (!phoneRequiredByTask && /^followup_|^first_contact$/.test(task.task_type))
  const hasWa = taskConfirmsWhatsApp
    ? phoneDigits.length >= 8
    : contact?.has_whatsapp ?? (
      contact?.contact_mode !== 'phone_only'
      && !contact?.phone_only
      && phoneDigits.length >= 8
    )
  const hasPhone = phoneDigits.length >= 8
  const persistedTaskId = isPersistedTaskId(task.id) ? task.id : undefined
  const executable = isTaskDue(task.due_at)

  const managedTemplate = useMemo(() => {
    /* C1–C8: task_type followup_N → mensagem N+1; first_contact → C1 (ou opt-in) */
    const stepByTask: Record<string, number> = {
      first_contact: templateId === 'optin' ? 0 : 1,
      followup_1: 2,
      followup_2: 3,
      followup_3: 4,
      followup_4: 5,
      followup_5: 6,
      followup_6: 7,
      followup_7: 8,
      qualify: 3,
      proposal: 4,
      close: 4,
      post_sale: 3,
    }
    const triggerByTask: Record<string, string> = {
      first_contact: templateId === 'optin' ? 'optin' : 'start',
      followup_1: 'no_answer',
      followup_2: 'no_answer',
      followup_3: 'no_answer',
      followup_4: 'no_answer',
      followup_5: 'no_answer',
      followup_6: 'no_answer',
      followup_7: 'no_answer',
      qualify: 'replied',
      proposal: 'negotiating',
      close: 'negotiating',
      post_sale: 'replied',
    }
    const step = stepByTask[task.task_type] ?? (templateId === 'optin' ? 0 : 1)
    const trigger = triggerByTask[task.task_type] || (step === 0 ? 'optin' : step === 1 ? 'start' : 'no_answer')
    const candidates = managedTemplates
      .filter((item) => Number(item.message_step) === step)
      .sort((left, right) => {
        const leftRank = managedProgramId && left.program_id === managedProgramId ? 0 : 1
        const rightRank = managedProgramId && right.program_id === managedProgramId ? 0 : 1
        return leftRank - rightRank
      })
    const selected = candidates.find((item) => item.trigger_result === trigger)
      || candidates.find((item) => item.trigger_result === 'no_answer')
      || candidates.find((item) => item.trigger_result === 'start')
    return selected
      ? { body: selected.body, title: selected.title, source: selected.program_id ? 'Programa' : 'Marca' }
      : null
  }, [managedProgramId, managedTemplates, task.task_type, templateId])

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
    if (action === 'release_phone_pool') {
      try {
        const res = await affiliateApi.releaseOpportunityToPhonePool(contact.ref_type, contact.ref_id)
        const patch = patchFromAction(contact.ref_type, contact.ref_id, 'dismiss', {
          note: 'Liberado para a rede · somente telefone',
        })
        patchOpportunitiesCache(patch)
        onChanged?.(patch)
        setDoneMsg(res.toast)
        setPhase('done')
        ctx.showToast(res.toast)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao liberar para a rede')
        ctx.showToast(e instanceof Error ? e.message : 'Falha ao liberar para a rede', 'err')
      } finally {
        setSaving(null)
      }
      return
    }
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
    try {
      const res = await affiliateApi.progressOpportunity(contact.ref_type, contact.ref_id, payload)
      patchOpportunitiesCache(patch)

      if (action === 'sent' || action === 'called' || extra?.stayOpen) {
        onChanged?.({ ...patch, action: action === 'called' ? 'called' : 'sent' })
        setPhase('result')
        setDoneMsg(null)
        ctx.showToast(
          res.toast
          || (action === 'called'
            ? 'Ligação registrada · escolha o resultado'
            : 'Mensagem registrada · escolha o resultado'),
        )
      } else {
        onChanged?.(patch)
        const exitMsg: Record<string, string> = {
          lost: 'Excluído · contato saiu da fila',
          channel_unavailable: 'Canal indisponível · contato excluído',
          not_matching: 'Não correspondente · contato excluído',
          dismiss: 'Oculto · removido da sua lista',
        }
        const toast = exitMsg[action] || res.toast || 'Tarefa concluída'
        setDoneMsg(toast)
        setNextTaskFeedback(res.next_task ? {
          due_at: res.next_task.due_at,
          instruction: res.next_task.instruction,
        } : null)
        setPhase('done')
        ctx.showToast(toast)
      }
    } catch (e) {
      if (isNetworkLikeError(e)) {
        enqueueProgress(contact.ref_type, contact.ref_id, payload)
        patchOpportunitiesCache(patch)
        ctx.showToast('Salvo no aparelho — sincroniza depois')
        if (action === 'sent' || action === 'called' || extra?.stayOpen) {
          setPhase('result')
        } else {
          onChanged?.(patch)
          setPhase('done')
          setDoneMsg('Salvo offline')
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
    if (CONFIRM_ACTIONS.has(action)) {
      setConfirmAction(action)
      return
    }
    void runProgress(action)
  }

  const quickOutcomes = useMemo(() => {
    if (task.task_type === 'post_sale') {
      return [
        { action: 'post_sale_completed', label: 'Pós-venda concluído', desc: 'Encerrar esta tarefa' },
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
        { action: 'channel_unavailable', label: 'Telefone inválido', desc: 'Remover definitivamente' },
        { action: 'release_phone_pool', label: 'Liberar para a rede', desc: 'Outro afiliado tenta ligar · sem pontos' },
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
      { action: 'channel_unavailable', label: 'Sem WhatsApp', desc: 'Manter comigo para ligar' },
      { action: 'release_phone_pool', label: 'Liberar para ligações', desc: 'Outro afiliado assume · sem pontos' },
      { action: 'lost', label: 'Sem interesse', desc: 'Excluir da fila' },
    ]
  }, [task.task_type, taskChannel])

  const confirmCopy: Record<string, { title: string; body: string }> = {
    lost: {
      title: 'Excluir sem interesse?',
      body: 'O contato sai da sua fila. Fica no histórico só para consulta e para não voltar à toa.',
    },
    channel_unavailable: {
      title: taskChannel === 'phone' ? 'Telefone realmente inválido?' : 'WhatsApp indisponível?',
      body: taskChannel === 'phone'
        ? 'Remove definitivamente este contato da rede. Use apenas se o telefone não existe ou está inválido.'
        : 'O contato continua com você e a próxima tentativa será por ligação.',
    },
    release_phone_pool: {
      title: 'Confirmar que você não pode ligar?',
      body: 'O contato volta para a fila como “Só telefone”. Outro afiliado poderá assumir a ligação e o telefone continuará disponível.',
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

  const contactName = contact?.name || task.contact_name || 'Contato'
  const whatToDo = task.instruction || contact?.next_action || meta.blurb

  const primaryMessageLabel =
    task.task_type === 'proposal' || templateId === 'proposta'
      ? 'Enviar proposta'
      : task.task_type === 'first_contact' || templateId === 'optin'
        ? 'Enviar 1ª mensagem'
        : task.task_type === 'post_sale'
          ? 'Enviar pós-venda'
          : 'Enviar follow-up'

  function goBackPhase() {
    if (phase === 'contact') setPhase('overview')
    else if (phase === 'result') setPhase('contact')
    else onClose()
  }

  const stepIndex = phase === 'overview' ? 0 : phase === 'contact' ? 1 : phase === 'result' ? 2 : 3

  return (
    <>
      <div
        className="fixed inset-0 z-[520] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Tarefa: ${meta.title}`}
        onMouseDown={() => {
          if (phase !== 'done') onClose()
        }}
      >
        <div
          className="relative flex max-h-[min(94dvh,720px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-md sm:rounded-[22px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center py-2 sm:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-neutral-300" />
          </div>

          {/* Top bar */}
          <header className="shrink-0 border-b border-neutral-100 px-4 pb-3 pt-0.5 sm:px-5 sm:pt-4">
            <div className="flex items-center gap-2">
              {phase !== 'overview' && phase !== 'done' ? (
                <button
                  type="button"
                  aria-label="Voltar"
                  onClick={goBackPhase}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-600 active:bg-neutral-100"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <span className="w-0 sm:w-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-neutral-500">
                  {PHASE_LABEL[phase]}
                  {phase !== 'done' ? ` · ${stepIndex + 1}/3` : ''}
                </p>
                <h2 className="truncate text-[16px] font-bold tracking-tight text-neutral-950">
                  {meta.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-500 active:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Step dots */}
            {phase !== 'done' && (
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={[
                      'h-1 flex-1 rounded-full transition-colors',
                      i <= stepIndex ? 'bg-neutral-900' : 'bg-neutral-200',
                    ].join(' ')}
                  />
                ))}
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-neutral-500">
                <Loader2 size={16} className="animate-spin" /> Carregando…
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                {error}
              </div>
            )}

            {!loading && contact && phase === 'overview' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[13px] font-semibold text-neutral-950">{contactName}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-600">
                    <Clock3 size={13} />
                    {formatDue(task.due_at)}
                  </p>
                </div>

                <section className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3.5">
                  <p className="text-[11px] font-bold text-neutral-500">O que fazer</p>
                  <p className="mt-1.5 text-[14px] font-medium leading-snug text-neutral-950">
                    {whatToDo}
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-neutral-600">
                    {meta.blurb}
                  </p>
                </section>

                {!executable && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950">
                    Disponível {formatDueAt(task.due_at)} ({formatCountdown(task.due_at)}).
                  </div>
                )}

                <button
                  type="button"
                  disabled={!executable}
                  onClick={() => setPhase('contact')}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                >
                  {phoneRequiredByTask ? 'Seguir para ligação' : 'Seguir para contato'}
                  <ChevronRight size={17} />
                </button>

                {onOpenContact && (
                  <button
                    type="button"
                    onClick={() => onOpenContact(contact)}
                    className="flex min-h-10 w-full items-center justify-center text-[12px] font-semibold text-neutral-500"
                  >
                    Ver ficha e histórico
                  </button>
                )}
              </div>
            )}

            {!loading && contact && phase === 'contact' && (
              <div className="space-y-5">
                <div>
                  <p className="text-[13px] font-semibold text-neutral-950">{contactName}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">
                    {phoneRequiredByTask
                      ? 'Esta tarefa é exclusivamente por telefone.'
                      : 'Escolha o canal e faça o contato para avançar.'}
                  </p>
                </div>

                {phoneRequiredByTask ? (
                  <div className="flex min-h-11 items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-neutral-700 shadow-sm">
                      <Phone size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-neutral-950">Contato por telefone</p>
                      <p className="text-[11px] text-neutral-500">WhatsApp já foi tentado e está indisponível</p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1"
                    role="tablist"
                    aria-label="Canal"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={taskChannel === 'whatsapp'}
                      disabled={contact.phone_only || contact.contact_mode === 'phone_only'}
                      onClick={() => setTaskChannel('whatsapp')}
                      className={[
                        'min-h-9 rounded-lg text-[12px] font-semibold transition',
                        taskChannel === 'whatsapp'
                          ? 'bg-white text-neutral-950 shadow-sm'
                          : 'text-neutral-600',
                      ].join(' ')}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={taskChannel === 'phone'}
                      onClick={() => setTaskChannel('phone')}
                      className={[
                        'min-h-9 rounded-lg text-[12px] font-semibold transition',
                        taskChannel === 'phone'
                          ? 'bg-white text-neutral-950 shadow-sm'
                          : 'text-neutral-600',
                      ].join(' ')}
                    >
                      Telefone
                    </button>
                  </div>
                )}

                {taskChannel === 'whatsapp' ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700">
                          <MessageCircle size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-neutral-500">Template desta tarefa</p>
                          <p className="mt-0.5 text-[14px] font-semibold text-neutral-950">
                            {managedTemplate?.title || primaryMessageLabel}
                          </p>
                          {managedTemplate?.source ? (
                            <p className="mt-0.5 text-[11px] text-neutral-500">
                              Base: {managedTemplate.source}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-neutral-500">
                              Modelo padrão da etapa
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!hasWa || !!saving || !executable}
                      onClick={() => setShowComposer(true)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Send size={16} />
                      {primaryMessageLabel}
                    </button>

                    {!hasWa && (
                      <p className="text-[12px] leading-relaxed text-amber-900">
                        WhatsApp indisponível para este contato. Use Telefone ou libere para a rede.
                        {onConnectWhatsApp ? (
                          <>
                            {' '}
                            <button type="button" className="font-bold underline" onClick={onConnectWhatsApp}>
                              Abrir conexões
                            </button>
                          </>
                        ) : null}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={!hasPhone || !!saving || !executable}
                      onClick={() => {
                        const d = phoneDigits
                        if (d.length < 8) return
                        window.location.href = `tel:+${d.startsWith('55') ? d : d}`
                        ctx.showToast('Discando… registre a ligação ao voltar')
                      }}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Phone size={16} /> Ligar agora
                    </button>
                    <button
                      type="button"
                      disabled={!hasPhone || !!saving || !executable}
                      onClick={() => void runProgress('called', { channel: 'phone', stayOpen: true })}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 disabled:opacity-40"
                    >
                      {saving === 'called' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Já liguei · registrar e seguir
                    </button>
                    {phoneRequiredByTask && (
                      <button
                        type="button"
                        disabled={!!saving || !executable}
                        onClick={() => requestOutcome('release_phone_pool')}
                        className="flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-neutral-600 active:bg-neutral-50 disabled:opacity-40"
                      >
                        Não posso fazer contato por telefone
                      </button>
                    )}
                    {phoneRequiredByTask && (
                      <p className="px-2 text-center text-[11px] leading-relaxed text-neutral-500">
                        O contato volta para a fila e o telefone continua disponível para outro afiliado.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!loading && contact && phase === 'result' && (
              <div className="space-y-4">
                <div>
                  <p className="text-[13px] font-semibold text-neutral-950">{contactName}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">
                    Contato feito. Como foi o resultado desta tarefa?
                  </p>
                </div>

                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200">
                  {quickOutcomes.map((o) => (
                    <li key={o.action}>
                      <button
                        type="button"
                        disabled={!!saving || !executable}
                        onClick={() => requestOutcome(o.action)}
                        className="flex min-h-[54px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-neutral-50 disabled:opacity-45"
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block text-[13px] font-semibold text-neutral-950">
                            {o.label}
                          </strong>
                          <span className="block text-[11px] text-neutral-500">{o.desc}</span>
                        </span>
                        {saving === o.action ? (
                          <Loader2 size={16} className="shrink-0 animate-spin text-neutral-400" />
                        ) : (
                          <ChevronRight size={16} className="shrink-0 text-neutral-300" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && phase === 'done' && (
              <div className="py-2">
                <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 px-5 py-5 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                    <CheckCircle2 size={28} strokeWidth={2.4} />
                  </span>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Resultado salvo
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight text-neutral-950">Tarefa concluída</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                    {doneMsg || 'Registrado com sucesso.'}
                  </p>
                </div>

                {nextTask ? (
                  <div className="mt-4 overflow-hidden rounded-[20px] border border-neutral-200 bg-white">
                    <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700">
                        <ListTodo size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                          Próxima da sua fila
                        </p>
                        <p className="truncate text-sm font-bold text-neutral-950">
                          {nextTask.contact_name || 'Contato'}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-neutral-900">
                        {nextTask.instruction || 'Continuar o atendimento'}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-neutral-500">
                        {formatDueAt(nextTask.due_at)}
                      </p>
                    </div>
                  </div>
                ) : nextTaskFeedback ? (
                  <div className="mt-4 rounded-[20px] border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                      Próximo contato agendado
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                      {nextTaskFeedback.instruction || 'Continuar o atendimento'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDueAt(nextTaskFeedback.due_at)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-4 text-center">
                    <p className="text-sm font-semibold text-neutral-900">Fila concluída por agora</p>
                    <p className="mt-1 text-xs text-neutral-500">Não há outra tarefa liberada neste momento.</p>
                  </div>
                )}

                {nextTask && onNextTask ? (
                  <button
                    type="button"
                    onClick={() => onNextTask(nextTask)}
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-bold text-white shadow-sm active:scale-[0.99]"
                  >
                    Ir para a próxima tarefa
                    <ArrowRight size={17} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className={[
                    'flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold',
                    nextTask && onNextTask
                      ? 'mt-2 text-neutral-600 active:bg-neutral-50'
                      : 'mt-4 bg-neutral-950 text-white',
                  ].join(' ')}
                >
                  Voltar para tarefas
                </button>
              </div>
            )}
          </div>

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
                    className={[
                      'h-11 rounded-xl text-sm font-bold text-white disabled:opacity-50',
                      confirmAction === 'release_phone_pool' ? 'bg-neutral-900' : 'bg-red-600',
                    ].join(' ')}
                  >
                    {saving === confirmAction
                      ? '…'
                      : confirmAction === 'release_phone_pool'
                        ? 'Sim, devolver à fila'
                        : 'Confirmar'}
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
          initialSenderName={String(ctx.affiliate?.display_name || '').trim()}
          initialValueProposition={String(ctx.brand?.slogan || '').trim()}
          initialTemplateId={templateId}
          managedTemplate={managedTemplate}
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
          onSent={async (_lead, finalMessage) => {
            setShowComposer(false)
            /* Enviar → avança para fase de resultado */
            await runProgress('sent', { message: finalMessage, stayOpen: true })
          }}
        />
      )}
    </>
  )
}
