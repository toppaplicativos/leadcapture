/**
 * Helpers de estado operacional do contato (fase + último resultado + próxima tarefa).
 * Multi-canal: WhatsApp + Telefone — tentativas separadas, cadência unificada.
 */

export type OpsPhase = 'to_contact' | 'contacted' | 'engaged' | 'closed' | 'new'

export type ContactChannel = 'whatsapp' | 'phone' | 'note' | 'system'

export type OpsNextTask = {
  id: string
  task_type: string
  instruction?: string | null
  template_id?: string | null
  due_at: string
  is_due: boolean
  seconds_until_due: number
}

export type ChannelAttemptSummary = {
  channel: ContactChannel
  label: string
  attempts: number
  last_action: string | null
  last_action_label: string | null
  last_at: string | null
}

export type ContactOpsState = {
  phase: OpsPhase | string
  status_code?: string | null
  last_action?: string | null
  last_action_label?: string | null
  last_action_at?: string | null
  last_channel?: ContactChannel | null
  next_task: OpsNextTask | null
  phase_label: string
  next_step_label: string
  can_send_message: boolean
  can_call: boolean
  can_register_result: boolean
  can_execute_task: boolean
  can_update_result: boolean
  channel_summary: ChannelAttemptSummary[]
}

const ACTION_LABELS: Record<string, string> = {
  sent: 'Mensagem enviada',
  followup: 'Follow-up (mensagem)',
  replied: 'Respondeu',
  negotiating: 'Em negociação',
  auto_reply: 'Foi bot',
  no_answer: 'Sem resposta',
  waiting: 'Lembrar depois',
  channel_unavailable: 'Canal indisponível',
  not_matching: 'Não correspondente',
  lost: 'Excluído',
  dismiss: 'Oculto',
  note: 'Anotação',
  convert: 'Convertido',
  claim: 'Assumido',
  called: 'Ligação realizada',
  voicemail: 'Caixa postal / recado',
  busy: 'Linha ocupada',
  callback_requested: 'Pediu retorno',
}

const PHASE_LABELS: Record<string, string> = {
  new: 'Fila',
  to_contact: 'Fila',
  contacted: 'Contatado',
  engaged: 'Conversa',
  closed: 'Excluído',
}

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  note: 'Anotação',
  system: 'Sistema',
}

const PHONE_ACTIONS = new Set(['called', 'voicemail', 'busy', 'callback_requested'])
const INITIATING = new Set(['sent', 'followup', 'called'])

export function channelLabel(channel?: string | null): string {
  const c = String(channel || 'whatsapp') as ContactChannel
  return CHANNEL_LABELS[c] || c
}

export function normalizeChannel(raw?: string | null, action?: string | null): ContactChannel {
  const c = String(raw || '').trim().toLowerCase() as ContactChannel
  if (c === 'whatsapp' || c === 'phone' || c === 'note' || c === 'system') return c
  const a = String(action || '').toLowerCase()
  if (PHONE_ACTIONS.has(a)) return 'phone'
  if (a === 'note') return 'note'
  if (a === 'claim' || a === 'received' || a === 'interaction') return 'system'
  return 'whatsapp'
}

export function actionLabel(action?: string | null, channel?: string | null): string {
  if (!action) return '—'
  const a = String(action)
  const ch = normalizeChannel(channel, a)
  if (ch === 'phone' && !PHONE_ACTIONS.has(a)) {
    if (a === 'replied') return 'Atendeu / conversou'
    if (a === 'no_answer') return 'Não atendeu'
    if (a === 'waiting') return 'Retorno agendado (telefone)'
    if (a === 'negotiating') return 'Negociação (telefone)'
    if (a === 'channel_unavailable') return 'Telefone indisponível'
    if (a === 'not_matching') return 'Número errado'
  }
  return ACTION_LABELS[a] || a
}

export function phaseLabel(phase?: string | null): string {
  if (!phase) return 'Fila'
  return PHASE_LABELS[phase] || phase
}

export function isInitiatingAction(action?: string | null): boolean {
  return INITIATING.has(String(action || '').toLowerCase())
}

export function isTaskDue(dueAt?: string | null, now = Date.now()): boolean {
  if (!dueAt) return false
  const ts = new Date(dueAt).getTime()
  if (Number.isNaN(ts)) return false
  return ts <= now
}

export function secondsUntilDue(dueAt?: string | null, now = Date.now()): number {
  if (!dueAt) return 0
  const ts = new Date(dueAt).getTime()
  if (Number.isNaN(ts)) return 0
  return Math.round((ts - now) / 1000)
}

/** Countdown legível: "agora" | "atrasada 2h" | "em 1d 4h" */
export function formatCountdown(dueAt?: string | null, now = Date.now()): string {
  if (!dueAt) return '—'
  const sec = secondsUntilDue(dueAt, now)
  if (sec <= 0) {
    const late = Math.abs(sec)
    if (late < 60) return 'atrasada · agora'
    if (late < 3600) return `atrasada · ${Math.floor(late / 60)} min`
    if (late < 86400) return `atrasada · ${Math.floor(late / 3600)}h`
    return `atrasada · ${Math.floor(late / 86400)}d`
  }
  if (sec < 60) return 'libera em instantes'
  if (sec < 3600) return `em ${Math.floor(sec / 60)} min`
  if (sec < 86400) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return m ? `em ${h}h ${m}min` : `em ${h}h`
  }
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  return h ? `em ${d}d ${h}h` : `em ${d}d`
}

export function formatDueAt(dueAt?: string | null): string {
  if (!dueAt) return ''
  try {
    return new Date(dueAt).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(dueAt)
  }
}

export function normalizeNextTask(
  raw?: {
    id: string
    task_type: string
    instruction?: string | null
    template_id?: string | null
    due_at: string
    is_due?: boolean
  } | null,
  now = Date.now(),
): OpsNextTask | null {
  if (!raw?.id || !raw.due_at) return null
  const due = isTaskDue(raw.due_at, now)
  return {
    id: raw.id,
    task_type: raw.task_type,
    instruction: raw.instruction ?? null,
    template_id: raw.template_id ?? null,
    due_at: raw.due_at,
    is_due: raw.is_due != null ? Boolean(raw.is_due) : due,
    seconds_until_due: secondsUntilDue(raw.due_at, now),
  }
}

export function buildContactOpsState(input: {
  phase?: string | null
  status_code?: string | null
  last_action?: string | null
  last_action_at?: string | null
  last_channel?: ContactChannel | string | null
  followup_due?: boolean
  channel_summary?: ChannelAttemptSummary[] | null
  next_task?: {
    id: string
    task_type: string
    instruction?: string | null
    template_id?: string | null
    due_at: string
    is_due?: boolean
  } | null
  closed?: boolean
}): ContactOpsState {
  const phase = input.closed
    ? 'closed'
    : (input.phase || 'to_contact')
  const next = normalizeNextTask(input.next_task)
  const closed = phase === 'closed'
  const last = input.last_action || null
  const lastChannel = normalizeChannel(input.last_channel, last)
  const hasLast = Boolean(last && last !== 'claim')

  let next_step_label = 'Continuar atendimento'
  if (closed) {
    next_step_label = 'Excluído · sem ação na fila'
  } else if (next?.is_due) {
    next_step_label = next.instruction || 'Executar tarefa agora'
  } else if (next) {
    next_step_label = `Próxima ${formatCountdown(next.due_at)} · ${formatDueAt(next.due_at)}`
  } else if (phase === 'new' || phase === 'to_contact') {
    next_step_label = 'Primeiro contato — WhatsApp ou ligação'
  } else if (phase === 'contacted') {
    next_step_label = 'Aguardar ou retomar (mensagem / ligação)'
  } else if (phase === 'engaged') {
    next_step_label = 'Avançar conversa / proposta'
  }

  const awaitingFirstResult = isInitiatingAction(last)
  const can_execute_task = Boolean(next?.is_due) && !closed
  const can_register_result =
    !closed && (can_execute_task || awaitingFirstResult || Boolean(input.followup_due && !next))
  const can_update_result = !closed && hasLast && !awaitingFirstResult
  const can_send_message = !closed
  const can_call = !closed

  return {
    phase,
    status_code: input.status_code || null,
    last_action: last,
    last_action_label: last ? actionLabel(last, lastChannel) : null,
    last_action_at: input.last_action_at || null,
    last_channel: last ? lastChannel : null,
    next_task: next,
    phase_label: phaseLabel(phase),
    next_step_label,
    can_send_message,
    can_call,
    can_register_result,
    can_execute_task,
    can_update_result,
    channel_summary: Array.isArray(input.channel_summary) ? input.channel_summary : [],
  }
}

/** Abre discador nativo / app de telefone */
export function openPhoneDialer(phoneDigits: string): void {
  let d = String(phoneDigits || '').replace(/\D/g, '')
  if (d.length < 8) return
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) d = `55${d}`
  window.location.href = `tel:+${d}`
}

export function formatCallDuration(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return ''
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}min ${r}s` : `${m}min`
}
