/**
 * Motor de atendimento multi-canal — Lead → Contato (WA/Telefone) → Resultado.
 * Tentativas por canal separadas; cadência unificada no contato.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Ban, Bot, Check, ChevronDown, ChevronRight, Clock3, History, Loader2, Mail, MapPin,
  MessageCircle, Phone, PhoneOff, Send, StickyNote, UserX, Voicemail, Wifi, WifiOff, X, Zap,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import { WhatsAppSendModal, type WaSendLead } from '@/components/WhatsAppSendModal'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import {
  enqueueProgress,
  isNetworkLikeError,
  patchFromAction,
  patchOpportunitiesCache,
  type ProgressPatch,
} from '@/lib/affiliate-crm-local'
import {
  actionLabel,
  buildContactOpsState,
  channelLabel,
  formatCallDuration,
  formatCountdown,
  formatDueAt,
  isInitiatingAction,
  normalizeChannel,
  openPhoneDialer,
  type ChannelAttemptSummary,
  type ContactChannel,
  type ContactOpsState,
  type OpsNextTask,
  normalizeNextTask,
} from '@/lib/affiliate-contact-ops'
import { ContactOpsStrip } from '@/pages/affiliate/ContactOpsStrip'
import { ContactChannelAttempts } from '@/pages/affiliate/ContactChannelAttempts'

export type AttendanceOpportunity = {
  id: string
  ref_type: 'affiliate_lead' | 'assignment'
  ref_id: string
  name: string
  phone?: string | null
  source_phone?: string | null
  contact_phone?: string | null
  responsible_name?: string | null
  email?: string | null
  instagram?: string | null
  address?: string | null
  channels?: {
    whatsapp?: string | null
    phone?: string | null
    email?: string | null
    instagram?: string | null
    address?: string | null
  }
  has_whatsapp?: boolean
  city?: string | null
  region?: string | null
  niche?: string | null
  product_name?: string | null
  brand_name?: string | null
  commercial_status?: string
  status_code?: string
  operational_phase?: string
  next_action?: string | null
  suggested_template?: string | null
  followup_due?: boolean
  next_followup_at?: string | null
  source_label?: string
  message?: string | null
  notes?: string | null
  received_at?: string | null
  last_interaction_at?: string | null
}

type Step = 'lead' | 'message' | 'result' | 'status'

type ProgressAction =
  | 'replied'
  | 'negotiating'
  | 'auto_reply'
  | 'no_answer'
  | 'waiting'
  | 'channel_unavailable'
  | 'not_matching'
  | 'lost'
  | 'dismiss'
  | 'note'
  | 'voicemail'
  | 'busy'
  | 'callback_requested'

type Props = {
  item: AttendanceOpportunity
  ctx: AppContext
  onClose: () => void
  /** Chamado após progresso; patch permite UI otimista na lista. */
  onChanged: (patch?: ProgressPatch) => void
  onConnectWhatsApp?: () => void
  /**
   * Se há tarefa do dia, a execução acontece no modal de Tarefas.
   * Este callback abre esse diretor (não executa aqui).
   */
  onExecutePendingTask?: () => void
}

type WaHealth = 'loading' | 'connected' | 'unstable' | 'offline' | 'unknown'

const PHASE_UI: Record<string, string> = {
  new: 'Fila',
  to_contact: 'Fila',
  contacted: 'Contatado',
  engaged: 'Conversa',
  closed: 'Excluído',
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'message', label: 'Contato' },
  { key: 'result', label: 'Resultado' },
  { key: 'status', label: 'Estado' },
]

/** Templates rápidos por fase (ids do WhatsAppSendModal). */
const QUICK_TEMPLATES: Array<{
  id: string
  label: string
  desc: string
  phases: string[]
}> = [
  { id: 'optin', label: 'Opt-in', desc: 'Autorização LGPD', phases: ['new', 'to_contact'] },
  { id: 'apresentacao', label: 'Apresentação', desc: 'Primeiro pitch', phases: ['new', 'to_contact', 'contacted'] },
  { id: 'followup', label: 'Follow-up', desc: 'Retomar conversa', phases: ['contacted', 'engaged'] },
  { id: 'reativacao', label: 'Reativar', desc: 'Lead esfriou', phases: ['contacted', 'engaged', 'closed'] },
  { id: 'proposta', label: 'Proposta', desc: 'Enviar proposta', phases: ['engaged'] },
]

type HistoryEvent = {
  action: string
  label: string
  message?: string | null
  note?: string | null
  at: string | null
  source?: string
  channel?: ContactChannel
  duration_sec?: number | null
}

function formatEventWhen(at?: string | null) {
  if (!at) return ''
  try {
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return ''
    const now = Date.now()
    const diff = now - d.getTime()
    if (diff < 60_000) return 'agora'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} h`
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

type OutcomeItem = {
  action: ProgressAction
  title: string
  desc: string
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
  icon: typeof Check
}

function outcomeGroupsForChannel(channel: ContactChannel): Array<{ title: string; items: OutcomeItem[] }> {
  if (channel === 'phone') {
    return [
      {
        title: 'Resultado da ligação',
        items: [
          { action: 'replied', title: 'Atendeu / conversou', desc: 'Vai para Conversa', tone: 'ok', icon: Phone },
          { action: 'negotiating', title: 'Em negociação', desc: 'Interesse ou proposta no telefone', tone: 'ok', icon: Zap },
          { action: 'no_answer', title: 'Não atendeu', desc: 'Follow-up em 3 dias', tone: 'warn', icon: PhoneOff },
          { action: 'busy', title: 'Ocupado', desc: 'Tentar de novo amanhã', tone: 'warn', icon: Clock3 },
          { action: 'voicemail', title: 'Caixa postal', desc: 'Deixou recado · retomar em 2 dias', tone: 'warn', icon: Voicemail },
          { action: 'callback_requested', title: 'Pediu retorno', desc: 'Ligar ou WA amanhã', tone: 'neutral', icon: Clock3 },
        ],
      },
      {
        title: 'Sair da fila',
        items: [
          { action: 'not_matching', title: 'Número errado', desc: 'Não é o contato certo', tone: 'warn', icon: UserX },
          { action: 'channel_unavailable', title: 'Telefone morto', desc: 'Não existe / fora de área', tone: 'warn', icon: PhoneOff },
          { action: 'lost', title: 'Sem interesse', desc: 'Excluir da fila', tone: 'danger', icon: Ban },
          { action: 'dismiss', title: 'Ocultar para mim', desc: 'Some da sua lista', tone: 'danger', icon: X },
        ],
      },
    ]
  }
  return [
    {
      title: 'Avançar',
      items: [
        { action: 'replied', title: 'Respondeu', desc: 'Vai para Conversa', tone: 'ok', icon: MessageCircle },
        { action: 'negotiating', title: 'Em negociação', desc: 'Há interesse ou proposta', tone: 'ok', icon: Zap },
        {
          action: 'auto_reply',
          title: 'Resposta automática',
          desc: 'Mensagem entregue, mas quem respondeu foi um bot',
          tone: 'warn',
          icon: Bot,
        },
      ],
    },
    {
      title: 'Aguardar',
      items: [
        { action: 'no_answer', title: 'Sem resposta', desc: 'Follow-up em 3 dias', tone: 'warn', icon: Clock3 },
        { action: 'waiting', title: 'Lembrar depois', desc: 'Fica na fila com lembrete', tone: 'neutral', icon: Clock3 },
      ],
    },
    {
      title: 'Sair da fila',
      items: [
        {
          action: 'not_matching',
          title: 'Não correspondente',
          desc: 'Nicho errado, número mudou ou não é o público',
          tone: 'warn',
          icon: UserX,
        },
        { action: 'channel_unavailable', title: 'Canal indisponível', desc: 'WA/telefone não funciona', tone: 'warn', icon: PhoneOff },
        { action: 'lost', title: 'Sem interesse', desc: 'Excluir da fila', tone: 'danger', icon: Ban },
        { action: 'dismiss', title: 'Ocultar para mim', desc: 'Some da sua lista', tone: 'danger', icon: X },
      ],
    },
  ]
}

function toneClass(tone: string) {
  if (tone === 'ok') return 'border-emerald-200 bg-emerald-50/50 active:bg-emerald-50'
  if (tone === 'warn') return 'border-amber-200 bg-amber-50/40 active:bg-amber-50'
  if (tone === 'danger') return 'border-red-200 bg-red-50/40 active:bg-red-50'
  return 'border-neutral-200 bg-white active:bg-neutral-50'
}

function digits(phone?: string | null) {
  return String(phone || '').replace(/\D/g, '')
}

export function AffiliateAttendanceWorkspace({
  item,
  ctx,
  onClose,
  onChanged,
  onConnectWhatsApp,
  onExecutePendingTask,
}: Props) {
  const [operationalPhone, setOperationalPhone] = useState(item.contact_phone || item.channels?.phone || item.phone || '')
  const [responsibleName, setResponsibleName] = useState(item.responsible_name || item.name || '')
  const [showContactEditor, setShowContactEditor] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const phase = item.operational_phase || 'new'
  const alreadySent = phase === 'contacted' || phase === 'engaged' || phase === 'closed'
  const isClosed = phase === 'closed'
  const phone = operationalPhone
  const phoneDigits = digits(phone)
  const whatsappPhone = item.channels?.whatsapp || (item.has_whatsapp ? item.source_phone || item.phone : null)
  const whatsappDigits = digits(whatsappPhone)
  const hasWa = item.has_whatsapp ?? whatsappDigits.length >= 8
  const waDoubtful = hasWa && whatsappDigits.length > 0 && whatsappDigits.length < 10

  /**
   * Novo / fila → lead
   * Já houve progress e não é “só enviou” pedindo resultado imediato → status (anti-loop)
   * Enviado sem resultado de ciclo ainda → result
   */
  const [step, setStep] = useState<Step>(() => {
    if (isClosed) return 'status'
    if (!alreadySent) return 'lead'
    return 'status'
  })
  const [showComposer, setShowComposer] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sentOk, setSentOk] = useState(alreadySent)
  const [showConvert, setShowConvert] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waHealth, setWaHealth] = useState<WaHealth>('loading')
  const [waLabel, setWaLabel] = useState<string | null>(null)
  const [composerTemplateId, setComposerTemplateId] = useState(
    () =>
      item.suggested_template
      || (phase === 'contacted' || item.followup_due ? 'followup' : 'optin'),
  )
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [lastActionAt, setLastActionAt] = useState<string | null>(null)
  const [lastChannel, setLastChannel] = useState<ContactChannel | null>(null)
  const [channelSummary, setChannelSummary] = useState<ChannelAttemptSummary[]>([])
  const [activeChannel, setActiveChannel] = useState<ContactChannel>('whatsapp')
  const [callDurationMin, setCallDurationMin] = useState('')
  const [nextTask, setNextTask] = useState<OpsNextTask | null>(null)
  const [localPhase, setLocalPhase] = useState(phase)
  const [contactRegistered, setContactRegistered] = useState(alreadySent)

  const defaultTemplate =
    item.suggested_template
    || (phase === 'contacted' || item.followup_due ? 'followup' : 'optin')

  const quickTemplates = useMemo(() => {
    const p = phase || 'new'
    const list = QUICK_TEMPLATES.filter((t) => t.phases.includes(p))
    return list.length ? list : QUICK_TEMPLATES.filter((t) => t.id === 'optin' || t.id === 'followup')
  }, [phase])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /* Histórico do contato + última ação + próxima tarefa (agenda) */
  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    affiliateApi.opportunityHistory(item.ref_type, item.ref_id)
      .then((r) => {
        if (cancelled) return
        const events = Array.isArray(r.events) ? r.events : []
        setHistory(events)
        if (Array.isArray(r.channel_summary)) {
          setChannelSummary(r.channel_summary as ChannelAttemptSummary[])
        }
        const last = events.find((e) => e.source !== 'meta' && e.action && e.action !== 'received' && e.action !== 'interaction')
        if (last) {
          setLastAction(String(last.action))
          setLastActionAt(last.at || null)
          const ch = normalizeChannel(last.channel, last.action)
          setLastChannel(ch)
          setActiveChannel(ch === 'phone' || ch === 'whatsapp' ? ch : 'whatsapp')
          /* Se último foi tentativa sem outcome, ainda precisa resultado */
          if (isInitiatingAction(last.action)) {
            setStep((s) => (s === 'status' ? 'result' : s))
            setSentOk(true)
            setContactRegistered(true)
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        const local: HistoryEvent[] = []
        if (item.received_at) {
          local.push({
            action: 'received',
            label: item.source_label || 'Recebido',
            at: item.received_at,
            source: 'meta',
          })
        }
        if (item.last_interaction_at) {
          local.push({
            action: 'interaction',
            label: 'Última interação',
            note: item.notes,
            at: item.last_interaction_at,
            source: 'meta',
          })
        }
        setHistory(local)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    /* Próxima task (due ou agenda) */
    ;(async () => {
      try {
        const due = await affiliateApi.attendanceTasks({ mode: 'due' })
        if (cancelled) return
        let hit = (due.tasks || []).find(
          (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
        )
        if (!hit) {
          const up = await affiliateApi.attendanceTasks({ mode: 'upcoming', horizonDays: 30 })
          if (cancelled) return
          hit = (up.tasks || []).find(
            (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
          )
        }
        if (hit) {
          setNextTask(normalizeNextTask({
            id: hit.id,
            task_type: hit.task_type,
            instruction: hit.instruction,
            template_id: hit.template_id,
            due_at: hit.due_at,
          }))
        } else {
          setNextTask(null)
        }
      } catch {
        if (!cancelled) setNextTask(null)
      }
    })()

    return () => { cancelled = true }
  }, [item.ref_type, item.ref_id, item.received_at, item.last_interaction_at, item.notes, item.source_label])

  const ops: ContactOpsState = useMemo(
    () =>
      buildContactOpsState({
        phase: localPhase,
        status_code: item.status_code,
        last_action: lastAction,
        last_action_at: lastActionAt,
        last_channel: lastChannel,
        followup_due: item.followup_due,
        channel_summary: channelSummary,
        next_task: nextTask,
        closed: localPhase === 'closed',
      }),
    [localPhase, item.status_code, item.followup_due, lastAction, lastActionAt, lastChannel, channelSummary, nextTask],
  )

  const resultGroups = useMemo(() => outcomeGroupsForChannel(activeChannel), [activeChannel])

  /* Saúde do WhatsApp (instância do afiliado) */
  useEffect(() => {
    let cancelled = false
    setWaHealth('loading')
    Promise.allSettled([
      affiliateApi.distributionStatus(),
      affiliateApi.instances().catch(() => []),
    ]).then(([statusRes, instancesRes]) => {
      if (cancelled) return
      const status = statusRes.status === 'fulfilled' ? statusRes.value : null
      const instances = instancesRes.status === 'fulfilled'
        ? (Array.isArray(instancesRes.value) ? instancesRes.value : [])
        : []

      const waStatus = String(status?.whatsapp_status || '').toLowerCase()
      const connectedName = status?.connected_instance_name
        ? String(status.connected_instance_name)
        : null

      const connectedCount = instances.filter((i: any) => {
        const s = String(i.status || i.connection_status || '').toLowerCase()
        return s === 'connected' || s === 'open' || i.connected === true
      }).length

      if (waStatus === 'connected' || connectedCount > 0) {
        setWaHealth('connected')
        setWaLabel(connectedName || (connectedCount === 1 ? '1 conexão' : `${connectedCount} conexões`))
      } else if (waStatus === 'connecting' || waStatus === 'unstable' || waStatus === 'qr') {
        setWaHealth('unstable')
        setWaLabel(connectedName || 'Instável')
      } else if (waStatus === 'disconnected' || waStatus === 'offline' || instances.length > 0) {
        setWaHealth('offline')
        setWaLabel('Desconectado')
      } else {
        setWaHealth('unknown')
        setWaLabel(null)
      }
    }).catch(() => {
      if (!cancelled) {
        setWaHealth('unknown')
        setWaLabel(null)
      }
    })
    return () => { cancelled = true }
  }, [ctx.cacheVersion])

  function emitOptimistic(action: string, noteOut?: string, channel: ContactChannel = activeChannel) {
    const patch = patchFromAction(item.ref_type, item.ref_id, action, { note: noteOut })
    patchOpportunitiesCache(patch)
    onChanged(patch)
    const ch = normalizeChannel(channel, action)
    setLastChannel(ch)
    /* Atualiza timeline local na hora */
    setHistory((prev) => [
      {
        action,
        label: actionLabel(action, ch),
        note: noteOut || null,
        at: new Date().toISOString(),
        source: 'action',
        channel: ch,
      },
      ...prev,
    ])
    setChannelSummary((prev) => {
      const others = prev.filter((p) => p.channel !== ch)
      const cur = prev.find((p) => p.channel === ch)
      return [
        {
          channel: ch,
          label: channelLabel(ch),
          attempts: (cur?.attempts || 0) + 1,
          last_action: action,
          last_action_label: actionLabel(action, ch),
          last_at: new Date().toISOString(),
        },
        ...others,
      ]
    })
    return patch
  }

  function openWithTemplate(templateId: string) {
    /* Conexão Baileys NÃO é obrigatória: envio manual via app do celular (wa.me).
       Offline só afeta automação / recebimento automático. */
    if (!hasWa) {
      ctx.showToast('Este contato não tem número de WhatsApp', 'err')
      return
    }
    setComposerTemplateId(templateId)
    setStep('message')
    setShowComposer(true)
  }

  const place = [item.city, item.region].filter(Boolean).join(' · ')
  const unavailable =
    localPhase === 'closed'
    || isClosed
    || ['lost', 'channel_unavailable', 'not_matching', 'dismiss', 'converted', 'recycled'].includes(
      String(item.status_code || lastAction || '').toLowerCase(),
    )

  const lead: WaSendLead = useMemo(
    () => ({
      id: `${item.ref_type}:${item.ref_id}`,
      name: item.name,
      trade_name: item.name,
      phone: whatsappPhone || undefined,
      city: item.city || undefined,
      state: item.region || undefined,
      niche: item.niche || undefined,
      category: item.niche || undefined,
      product_name: item.product_name || undefined,
      brand_name: item.brand_name || ctx.brand?.name || undefined,
      notes: item.message || item.next_action || undefined,
    }),
    [item, whatsappPhone, ctx.brand?.name],
  )

  const stepIndex = step === 'status' ? 3 : STEPS.findIndex((s) => s.key === step)

  async function markSent(message?: string) {
    setSaving('sent')
    setError(null)
    setActiveChannel('whatsapp')
    const noteOut = note.trim() || undefined
    const payload = {
      action: 'sent' as const,
      channel: 'whatsapp' as const,
      message: message?.slice(0, 4000),
      note: noteOut,
    }
    /* UI otimista: avança o CONTATO e fica no Resultado (não fecha o modal). */
    setSentOk(true)
    setContactRegistered(true)
    setStep('result')
    emitOptimistic('sent', noteOut, 'whatsapp')
    try {
      const res = await affiliateApi.progressOpportunity(item.ref_type, item.ref_id, payload)
      setLastAction('sent')
      setLastActionAt(new Date().toISOString())
      setLastChannel('whatsapp')
      setLocalPhase(res.phase || 'contacted')
      if (res.next_task) {
        setNextTask(normalizeNextTask({ ...res.next_task, is_due: res.next_task.is_due }))
      }
      ctx.showToast(res.toast || 'Mensagem registrada · agora o resultado')
    } catch (e) {
      if (isNetworkLikeError(e)) {
        enqueueProgress(item.ref_type, item.ref_id, payload)
        ctx.showToast('Salvo no aparelho — sincroniza quando a rede voltar')
      } else {
        const msg = e instanceof Error ? e.message : 'Erro ao marcar enviado'
        setError(msg)
        ctx.showToast(msg, 'err')
      }
    } finally {
      setSaving(null)
    }
  }

  /** Abre discador e prepara registro da tentativa de ligação */
  function startPhoneCall() {
    if (phoneDigits.length < 8) {
      ctx.showToast('Este contato não tem telefone', 'err')
      return
    }
    setActiveChannel('phone')
    openPhoneDialer(phoneDigits)
    setStep('message')
    ctx.showToast('Discando… ao voltar, registre a ligação')
  }

  async function saveContact() {
    if (digits(operationalPhone).length < 8) {
      ctx.showToast('Informe um telefone válido', 'err')
      return
    }
    setContactSaving(true)
    try {
      const result = await affiliateApi.updateOpportunityContact(item.ref_type, item.ref_id, {
        responsible_name: responsibleName.trim(),
        contact_phone: operationalPhone.trim(),
      })
      setOperationalPhone(result.contact_phone || operationalPhone)
      setResponsibleName(result.responsible_name || responsibleName)
      setShowContactEditor(false)
      ctx.showToast('Contato atualizado · origem preservada')
      onChanged()
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Falha ao atualizar contato', 'err')
    } finally {
      setContactSaving(false)
    }
  }

  async function markCalled() {
    setSaving('called')
    setError(null)
    setActiveChannel('phone')
    const mins = Number(callDurationMin)
    const duration_sec =
      Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : undefined
    const noteOut = note.trim() || undefined
    const payload = {
      action: 'called' as const,
      channel: 'phone' as const,
      note: noteOut,
      ...(duration_sec != null ? { duration_sec } : {}),
    }
    setSentOk(true)
    setContactRegistered(true)
    setStep('result')
    emitOptimistic('called', noteOut, 'phone')
    try {
      const res = await affiliateApi.progressOpportunity(item.ref_type, item.ref_id, payload)
      setLastAction('called')
      setLastActionAt(new Date().toISOString())
      setLastChannel('phone')
      setLocalPhase(res.phase || 'contacted')
      if (res.next_task) {
        setNextTask(normalizeNextTask({ ...res.next_task, is_due: res.next_task.is_due }))
      }
      ctx.showToast(res.toast || 'Ligação registrada · agora o resultado')
    } catch (e) {
      if (isNetworkLikeError(e)) {
        enqueueProgress(item.ref_type, item.ref_id, payload)
        ctx.showToast('Salvo no aparelho — sincroniza quando a rede voltar')
      } else {
        const msg = e instanceof Error ? e.message : 'Erro ao registrar ligação'
        setError(msg)
        ctx.showToast(msg, 'err')
      }
    } finally {
      setSaving(null)
    }
  }

  const EXIT_ACTIONS = new Set(['lost', 'channel_unavailable', 'not_matching', 'dismiss'])

  async function applyOutcome(action: ProgressAction) {
    const isExit = EXIT_ACTIONS.has(action)
    if (
      isExit
      && !window.confirm(
        action === 'channel_unavailable'
          ? 'Marcar canal indisponível e remover este contato da sua fila?'
          : action === 'not_matching'
            ? 'Marcar como não correspondente e remover da sua fila?'
            : action === 'dismiss'
              ? 'Ocultar este contato da sua fila?'
              : 'Excluir este contato da sua fila?',
      )
    ) {
      return
    }
    setSaving(action)
    setError(null)
    const defaultNote: Partial<Record<ProgressAction, string>> = {
      channel_unavailable: 'Canal indisponível ao tentar contato',
      not_matching: 'Não correspondente (nicho errado, número mudou ou contato inválido)',
      auto_reply: 'Resposta automática (bot) — mensagem entregue, sem conversa humana',
      lost: 'Sem interesse — excluído da fila',
      dismiss: 'Oculto pelo afiliado',
    }
    const exitToasts: Partial<Record<ProgressAction, string>> = {
      channel_unavailable: 'Canal indisponível · contato excluído da fila',
      not_matching: 'Não correspondente · contato excluído da fila',
      lost: 'Excluído · contato saiu da fila',
      dismiss: 'Oculto · removido da sua lista',
    }
    const noteOut = note.trim() || defaultNote[action] || undefined
    const channel: ContactChannel =
      action === 'voicemail' || action === 'busy' || action === 'callback_requested'
        ? 'phone'
        : activeChannel === 'phone'
          ? 'phone'
          : 'whatsapp'
    const mins = Number(callDurationMin)
    const duration_sec =
      channel === 'phone' && Number.isFinite(mins) && mins > 0
        ? Math.round(mins * 60)
        : undefined
    const payload: Parameters<typeof affiliateApi.progressOpportunity>[2] = {
      action,
      channel,
      note: noteOut,
      reason: action,
      ...(action === 'waiting' || action === 'callback_requested' ? { followup_days: 1 } : {}),
      ...(duration_sec != null ? { duration_sec } : {}),
    }

    /* Otimista: contato avança de fase; onChanged no hub fecha e volta à Fila. */
    emitOptimistic(action, noteOut, channel)
    setLastChannel(channel)
    if (action === 'note') {
      ctx.showToast('Anotação salva')
    }

    try {
      const res = await affiliateApi.progressOpportunity(item.ref_type, item.ref_id, payload)
      setLastAction(action)
      setLastActionAt(new Date().toISOString())
      if (res.phase) setLocalPhase(res.phase)

      if (isExit) {
        ctx.showToast(exitToasts[action] || res.toast || 'Contato removido da fila')
        /* Fecha de imediato — exclusão não deixa ficha “viva” */
        onClose()
        return
      }

      if (res.next_task) {
        setNextTask(normalizeNextTask({ ...res.next_task, is_due: res.next_task.is_due }))
      } else if (action !== 'note') {
        setNextTask(null)
      }
      const taskHint = res.next_task?.due_at
        ? ` · próxima ${formatCountdown(res.next_task.due_at)}`
        : ''
      if (action !== 'note') {
        ctx.showToast((res.toast || 'Atualizado') + taskHint)
        setStep('status')
      }
    } catch (e) {
      if (isNetworkLikeError(e)) {
        enqueueProgress(item.ref_type, item.ref_id, payload)
        ctx.showToast(
          isExit
            ? 'Remoção salva no aparelho — sincroniza depois'
            : 'Salvo no aparelho — sincroniza quando a rede voltar',
        )
        if (isExit) {
          onClose()
          return
        }
        setStep('status')
      } else {
        const msg = e instanceof Error ? e.message : 'Erro ao atualizar'
        setError(msg)
        ctx.showToast(msg, 'err')
      }
    } finally {
      setSaving(null)
    }
  }

  async function convert() {
    setSaving('convert')
    setError(null)
    const notes = note.trim() || 'Convertido pelo afiliado'
    emitOptimistic('convert', notes)
    onClose()
    try {
      if (item.ref_type === 'assignment') {
        await affiliateApi.convertDistributionAssignment(item.ref_id, { notes })
      } else {
        await affiliateApi.updateLead(item.ref_id, {
          status: 'converted',
          notes: note.trim() || undefined,
        })
      }
      ctx.showToast('Cliente registrado · pós-venda em 2 dias')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao converter'
      ctx.showToast(msg, 'err')
    } finally {
      setSaving(null)
    }
  }

  const email = item.channels?.email || item.email
  const ig = item.channels?.instagram || item.instagram
  const address = item.channels?.address || item.address

  /* Contato excluído: só detalhes da exclusão — sem WA, sem número, sem “arquivo” na UI */
  if (unavailable) {
    const code = String(item.status_code || lastAction || '').toLowerCase()
    const reasonLabel =
      code === 'channel_unavailable' || lastAction === 'channel_unavailable'
        ? 'Canal indisponível'
        : code === 'not_matching' || lastAction === 'not_matching'
          ? 'Não correspondente'
          : lastAction === 'dismiss' || code === 'dismiss'
            ? 'Oculto da sua lista'
            : code === 'converted' || lastAction === 'convert'
              ? 'Convertido em cliente'
              : 'Excluído da fila'
    const detailBody =
      code === 'channel_unavailable' || lastAction === 'channel_unavailable'
        ? 'O número / WhatsApp não funciona ou não existe. Este contato saiu da sua fila e não há canal para conferir.'
        : code === 'not_matching' || lastAction === 'not_matching'
          ? 'Contato fora do perfil (nicho, dado inválido). Removido da sua fila de atendimento.'
          : lastAction === 'dismiss' || code === 'dismiss'
            ? 'Você ocultou este contato. Ele não volta na sua operação ativa.'
            : code === 'converted' || lastAction === 'convert'
              ? 'Registro de cliente. O atendimento de prospecção foi encerrado.'
              : 'Este contato não está mais na sua fila. O registro fica só no histórico.'

    return (
      <div
        className="fixed inset-0 z-[500] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Contato não disponível"
        onMouseDown={onClose}
      >
        <div
          className="relative w-full max-w-md overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex items-start gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-700">
              <Ban size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Contato não disponível
              </p>
              <h2 className="mt-0.5 truncate text-[17px] font-bold text-neutral-950">
                {item.name}
              </h2>
              <p className="mt-1 text-[12px] font-semibold text-red-800">
                {reasonLabel}
                {lastActionAt ? ` · ${formatDueAt(lastActionAt)}` : ''}
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
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <div className="rounded-2xl border border-red-100 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-950">
              <p className="font-bold">Exclusão registrada</p>
              <p className="mt-1.5 text-[12px] opacity-95">{detailBody}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 w-full items-center justify-center rounded-[16px] bg-neutral-950 text-sm font-bold text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[500] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Atendimento de ${item.name}`}
        onMouseDown={onClose}
      >
        <div
          className="relative flex max-h-[min(96dvh,820px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[22px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center py-2 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-neutral-300" />
          </div>

          <header className="flex items-start gap-3 border-b border-neutral-200 px-4 pb-3 pt-1 sm:px-5 sm:pt-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {PHASE_UI[localPhase] || PHASE_UI[phase] || 'Fila'}
                {place ? ` · ${place}` : ''}
                {item.niche ? ` · ${item.niche}` : ''}
              </p>
              <div className="mt-2">
                <ContactOpsStrip
                  ops={ops}
                  onExecuteTask={
                    ops.can_execute_task && onExecutePendingTask
                      ? () => onExecutePendingTask()
                      : undefined
                  }
                  onUpdateResult={
                    (ops.can_update_result || ops.can_register_result)
                      ? () => setStep('result')
                      : undefined
                  }
                />
              </div>
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

          {/* 3-step progress — Lead · Mensagem · Resultado */}
          <div className="border-b border-neutral-100 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5" aria-label="Progresso">
              {STEPS.map((entry, i) => {
                const done = i < stepIndex || (entry.key === 'message' && sentOk)
                const current = i === stepIndex
                return (
                  <div key={entry.key} className="min-w-0 flex-1">
                    <div
                      className={[
                        'h-1.5 rounded-full transition-colors duration-200',
                        done || current ? 'bg-neutral-950' : 'bg-neutral-200',
                      ].join(' ')}
                    />
                    <p
                      className={[
                        'mt-1.5 text-center text-[10px] font-semibold',
                        current ? 'text-neutral-950' : done ? 'text-neutral-600' : 'text-neutral-400',
                      ].join(' ')}
                    >
                      {entry.label}
                    </p>
                  </div>
                )
              })}
            </div>
            {contactRegistered && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                <Check size={12} strokeWidth={2.5} />
                {lastChannel === 'phone' || lastAction === 'called'
                  ? 'Ligação registrada · registre o resultado'
                  : 'Contato registrado · registre o resultado'}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {/* Saúde WhatsApp — informativo (automação). Atendimento manual NÃO exige conexão. */}
            {waHealth !== 'loading' && waHealth !== 'unknown' && (
              <div
                className={[
                  'mb-3 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs',
                  waHealth === 'connected'
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                    : waHealth === 'unstable'
                      ? 'border-amber-100 bg-amber-50 text-amber-950'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-800',
                ].join(' ')}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80">
                  {waHealth === 'connected' ? (
                    <Wifi size={15} className="text-emerald-700" />
                  ) : (
                    <WifiOff size={15} className={waHealth === 'unstable' ? 'text-amber-700' : 'text-neutral-500'} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {waHealth === 'connected'
                      ? 'Sessão sincronizada (automação)'
                      : waHealth === 'unstable'
                        ? 'Sessão instável'
                        : 'Sessão offline (opcional)'}
                  </p>
                  <p className="mt-0.5 text-[11px] opacity-80 leading-snug">
                    {waHealth === 'connected'
                      ? (waLabel
                        ? `Automação ativa · ${waLabel}`
                        : 'Automação e recebimento automático ativos')
                      : 'Não impede atendimento. Envie pelo celular e registre o resultado. Cadastre o número em Conexões/Perfil para atribuição do 1º contato.'}
                  </p>
                </div>
                {waHealth !== 'connected' && onConnectWhatsApp && (
                  <button
                    type="button"
                    onClick={onConnectWhatsApp}
                    className="shrink-0 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-neutral-800"
                  >
                    Conectar
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                <p className="font-semibold">Não foi possível atualizar</p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
              </div>
            )}

            {step === 'status' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                    Situação do contato
                  </h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Veja o que já foi feito e o próximo passo. Não re-registre o mesmo resultado.
                  </p>
                </div>

                {lastAction && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
                      Último resultado
                    </p>
                    <p className="mt-1 text-[14px] font-bold text-emerald-950">
                      {actionLabel(lastAction)}
                    </p>
                    {lastActionAt && (
                      <p className="mt-0.5 text-[11px] text-emerald-900/80">
                        {formatDueAt(lastActionAt)}
                      </p>
                    )}
                  </div>
                )}

                {nextTask && (
                  <div className={[
                    'rounded-2xl border px-3.5 py-3',
                    nextTask.is_due ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-neutral-50',
                  ].join(' ')}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      Próxima tarefa
                    </p>
                    <p className="mt-1 text-[13px] font-semibold text-neutral-950">
                      {nextTask.instruction || nextTask.task_type}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-neutral-600">
                      {nextTask.is_due
                        ? 'Liberada · execute agora'
                        : `Libera ${formatDueAt(nextTask.due_at)} · ${formatCountdown(nextTask.due_at)}`}
                    </p>
                    {nextTask.is_due && onExecutePendingTask && (
                      <button
                        type="button"
                        onClick={onExecutePendingTask}
                        className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-950 text-xs font-bold text-white"
                      >
                        Executar tarefa
                      </button>
                    )}
                  </div>
                )}

                {!nextTask && !isClosed && (
                  <p className="text-xs text-neutral-500">
                    Sem tarefa agendada. Você pode reenviar mensagem ou atualizar o resultado se algo mudou.
                  </p>
                )}

                {channelSummary.length > 0 && (
                  <ContactChannelAttempts
                    summary={channelSummary}
                    activeChannel={activeChannel}
                    onSelectChannel={(ch) => {
                      setActiveChannel(ch)
                      setStep('lead')
                    }}
                  />
                )}

                <div className="grid gap-2">
                  {hasWa && ops.can_send_message && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChannel('whatsapp')
                        openWithTemplate(composerTemplateId || defaultTemplate)
                      }}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-neutral-200 text-sm font-semibold text-neutral-800"
                    >
                      <Send size={15} />
                      Nova mensagem WhatsApp
                    </button>
                  )}
                  {phoneDigits.length >= 8 && ops.can_call && (
                    <button
                      type="button"
                      onClick={() => startPhoneCall()}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-sky-200 bg-sky-50 text-sm font-bold text-sky-950"
                    >
                      <Phone size={15} />
                      Ligar agora
                    </button>
                  )}
                  {(ops.can_update_result || ops.can_register_result) && (
                    <button
                      type="button"
                      onClick={() => setStep('result')}
                      className="flex min-h-11 w-full items-center justify-center rounded-[16px] bg-neutral-100 text-sm font-bold text-neutral-800"
                    >
                      {ops.can_register_result && isInitiatingAction(lastAction)
                        ? 'Registrar resultado'
                        : 'Atualizar resultado'}
                    </button>
                  )}
                  {hasWa && (
                    <button
                      type="button"
                      onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank', 'noopener,noreferrer')}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-[#25D366] text-sm font-bold text-white"
                    >
                      Conferir conversa
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'lead' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                    {phase === 'contacted' || phase === 'engaged'
                      ? (item.followup_due ? 'Retomar contato' : 'Continuar conversa')
                      : (item.next_action || 'Preparar contato')}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-600 leading-relaxed">
                    {phase === 'new' || phase === 'to_contact'
                      ? 'Escolha o canal: WhatsApp ou ligação. Depois registre o resultado da tentativa.'
                      : phase === 'contacted'
                        ? 'Já houve contato. Retome por mensagem ou telefone, ou registre o resultado.'
                        : phase === 'engaged'
                          ? 'Há conversa. Qualifique, envie proposta ou registre o resultado.'
                          : 'Confira os canais e avance o atendimento.'}
                  </p>
                </div>

                <ContactChannelAttempts
                  summary={channelSummary}
                  activeChannel={activeChannel}
                  onSelectChannel={setActiveChannel}
                />

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">Contato responsável</p>
                      <p className="mt-1 text-sm font-bold text-neutral-950">{responsibleName || item.name}</p>
                      <p className="text-xs text-neutral-600">{operationalPhone || 'Telefone não informado'}</p>
                    </div>
                    <button type="button" onClick={() => setShowContactEditor((v) => !v)} className="min-h-9 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-800">{showContactEditor ? 'Fechar' : 'Editar'}</button>
                  </div>
                  {showContactEditor && (
                    <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                      <input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder="Nome do responsável" className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-sky-600" />
                      <input value={operationalPhone} onChange={(e) => setOperationalPhone(e.target.value)} inputMode="tel" placeholder="Telefone para contato" className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-sky-600" />
                      <p className="text-[11px] leading-relaxed text-neutral-500">Número de origem preservado: {item.source_phone || item.phone || 'não informado'}</p>
                      <button type="button" disabled={contactSaving} onClick={() => void saveContact()} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-950 text-sm font-bold text-white disabled:opacity-50">{contactSaving ? 'Salvando…' : 'Salvar contato'}</button>
                    </div>
                  )}
                </div>

                {/* Seletor de canal de ação */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveChannel('whatsapp')}
                    className={[
                      'flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition',
                      activeChannel === 'whatsapp'
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-800',
                    ].join(' ')}
                  >
                    <WhatsAppIcon size={16} /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChannel('phone')}
                    className={[
                      'flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition',
                      activeChannel === 'phone'
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-neutral-200 bg-white text-neutral-800',
                    ].join(' ')}
                  >
                    <Phone size={16} /> Telefone
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ChannelTile
                    label="WhatsApp"
                    value={whatsappPhone || '—'}
                    active={hasWa}
                    warn={waDoubtful}
                    icon={<WhatsAppIcon size={16} />}
                    onCopy={hasWa ? () => {
                      navigator.clipboard.writeText(whatsappDigits).then(
                        () => ctx.showToast('Número copiado'),
                        () => ctx.showToast('Falha ao copiar', 'err'),
                      )
                    } : undefined}
                  />
                  <ChannelTile
                    label="Telefone"
                    value={phone || '—'}
                    active={phoneDigits.length >= 8}
                    icon={<Phone size={16} />}
                    onCopy={phoneDigits.length >= 8 ? () => {
                      navigator.clipboard.writeText(phoneDigits).then(
                        () => ctx.showToast('Telefone copiado'),
                        () => ctx.showToast('Falha ao copiar', 'err'),
                      )
                    } : undefined}
                  />
                  <ChannelTile
                    label="E-mail"
                    value={email || '—'}
                    active={!!email}
                    icon={<Mail size={16} />}
                  />
                  <ChannelTile
                    label="Instagram"
                    value={ig ? `@${String(ig).replace(/^@/, '')}` : '—'}
                    active={!!ig}
                    icon={<InstagramIcon size={16} />}
                  />
                  <ChannelTile
                    label="Endereço"
                    value={address || '—'}
                    active={!!address}
                    icon={<MapPin size={16} />}
                  />
                </div>

                {waDoubtful && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Número com poucos dígitos — pode ser WA duvidoso. Use “Canal indisponível” se não abrir.
                  </p>
                )}

                {(item.source_label || item.product_name) && (
                  <p className="text-xs text-neutral-500">
                    {[item.source_label, item.product_name].filter(Boolean).join(' · ')}
                  </p>
                )}

                {activeChannel === 'whatsapp' ? (
                  <>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                        Mensagem pronta
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {quickTemplates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled={!hasWa}
                            onClick={() => openWithTemplate(t.id)}
                            className={[
                              'min-h-9 rounded-xl border px-3 text-left transition active:scale-[0.99] disabled:opacity-40',
                              composerTemplateId === t.id
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-neutral-200 bg-white text-neutral-800',
                            ].join(' ')}
                            title={t.desc}
                          >
                            <span className="block text-[11px] font-bold leading-tight">{t.label}</span>
                            <span
                              className={[
                                'block text-[9px] leading-tight',
                                composerTemplateId === t.id ? 'text-white/70' : 'text-neutral-500',
                              ].join(' ')}
                            >
                              {t.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!hasWa || !!saving}
                      onClick={() => openWithTemplate(composerTemplateId || defaultTemplate)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Send size={16} />
                      {(composerTemplateId || defaultTemplate) === 'followup'
                        ? 'Enviar follow-up'
                        : (composerTemplateId || defaultTemplate) === 'optin'
                          ? 'Enviar opt-in'
                          : 'Abrir mensagem'}
                    </button>
                  </>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5">
                    <div>
                      <h4 className="text-[14px] font-bold text-sky-950">Ligação telefônica</h4>
                      <p className="mt-1 text-[12px] leading-relaxed text-sky-900/80">
                        Abra o discador, fale com o contato e volte aqui para registrar a tentativa e o resultado.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={phoneDigits.length < 8 || !!saving}
                      onClick={() => startPhoneCall()}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-sky-700 px-4 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
                    >
                      <Phone size={16} />
                      Ligar {phoneDigits.length >= 8 ? `· ${phoneDigits.slice(-4)}` : ''}
                    </button>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-sky-900/80">
                        Duração aproximada (min, opcional)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={240}
                        step={0.5}
                        value={callDurationMin}
                        onChange={(e) => setCallDurationMin(e.target.value)}
                        placeholder="Ex.: 3"
                        className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-700"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={phoneDigits.length < 8 || !!saving}
                      onClick={() => void markCalled()}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-sky-300 bg-white text-sm font-bold text-sky-950 disabled:opacity-40"
                    >
                      {saving === 'called' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      Já liguei · registrar tentativa
                    </button>
                  </div>
                )}

                {/* Timeline do contato */}
                <div className="rounded-2xl border border-neutral-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 text-left"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-800">
                      <History size={14} />
                      Histórico
                      {history.length > 0 && (
                        <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-bold text-neutral-600">
                          {history.length}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      size={16}
                      className={['text-neutral-400 transition', showHistory ? 'rotate-180' : ''].join(' ')}
                    />
                  </button>
                  {showHistory && (
                    <div className="border-t border-neutral-100 px-3.5 pb-3 pt-2">
                      {historyLoading ? (
                        <p className="flex items-center gap-1.5 py-2 text-[11px] text-neutral-400">
                          <Loader2 size={12} className="animate-spin" /> Carregando…
                        </p>
                      ) : history.length === 0 ? (
                        <p className="py-2 text-[11px] text-neutral-500 leading-relaxed">
                          Ainda sem eventos. Ao enviar ou registrar resultado, aparece aqui.
                        </p>
                      ) : (
                        <ol className="relative space-y-0 border-l border-neutral-200 ml-1.5 pl-3.5">
                          {history.slice(0, 12).map((ev, idx) => (
                            <li key={`${ev.action}-${ev.at}-${idx}`} className="relative pb-3 last:pb-0">
                              <span className="absolute -left-[calc(0.875rem+3.5px)] top-1.5 h-2 w-2 rounded-full bg-neutral-400 ring-2 ring-white" />
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[12px] font-semibold text-neutral-900 leading-snug">
                                  {ev.label}
                                  {ev.channel && ev.channel !== 'system' && ev.channel !== 'note' && (
                                    <span className="ml-1.5 inline-flex items-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-600">
                                      {channelLabel(ev.channel)}
                                    </span>
                                  )}
                                  {ev.duration_sec != null && ev.duration_sec > 0 && (
                                    <span className="ml-1 text-[10px] font-normal text-neutral-500">
                                      · {formatCallDuration(ev.duration_sec)}
                                    </span>
                                  )}
                                </p>
                                <time className="shrink-0 text-[10px] text-neutral-400 tabular-nums">
                                  {formatEventWhen(ev.at)}
                                </time>
                              </div>
                              {(ev.note || ev.message) && (
                                <p className="mt-0.5 text-[11px] text-neutral-500 leading-snug line-clamp-2">
                                  {ev.note || ev.message}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setStep('result')}
                  className="min-h-11 w-full rounded-[18px] bg-neutral-100 text-sm font-bold text-neutral-800"
                >
                  Já contatei · registrar resultado
                </button>
                <button
                  type="button"
                  onClick={() => setStep('result')}
                  className="min-h-11 w-full rounded-[18px] text-sm font-semibold text-neutral-500"
                >
                  Só anotar / sair da fila
                </button>
              </div>
            )}

            {step === 'message' && !showComposer && activeChannel === 'phone' && (
              <div className="space-y-4 py-2">
                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-center">
                  <Phone size={28} className="mx-auto text-sky-700" />
                  <p className="mt-2 text-[15px] font-bold text-sky-950">Ligação em andamento?</p>
                  <p className="mt-1 text-sm text-sky-900/80 leading-relaxed">
                    Ao terminar, registre a tentativa e o resultado. Duração é opcional.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-neutral-600">
                    Duração (min)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    step={0.5}
                    value={callDurationMin}
                    onChange={(e) => setCallDurationMin(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={!!saving}
                  onClick={() => void markCalled()}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-sky-700 text-sm font-bold text-white"
                >
                  {saving === 'called' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Registrar ligação
                </button>
                <button
                  type="button"
                  onClick={() => startPhoneCall()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-neutral-200 text-sm font-semibold text-neutral-800"
                >
                  <Phone size={15} /> Discador de novo
                </button>
                <button
                  type="button"
                  onClick={() => setStep('result')}
                  className="block w-full min-h-11 text-sm font-semibold text-neutral-600"
                >
                  Ir para resultado
                </button>
              </div>
            )}

            {step === 'message' && !showComposer && activeChannel !== 'phone' && (
              <div className="space-y-4 py-4 text-center">
                <p className="text-sm text-neutral-600">Compositor fechado</p>
                <button
                  type="button"
                  onClick={() => setShowComposer(true)}
                  className="min-h-11 rounded-[18px] bg-neutral-950 px-5 text-sm font-bold text-white"
                >
                  Abrir mensagem
                </button>
                <button
                  type="button"
                  onClick={() => setStep('result')}
                  className="block w-full min-h-11 text-sm font-semibold text-neutral-600"
                >
                  Ir para resultado
                </button>
              </div>
            )}

            {step === 'result' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                    Registrar resultado
                  </h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Resultado da tentativa em{' '}
                    <strong className="font-semibold text-neutral-900">
                      {channelLabel(activeChannel === 'phone' ? 'phone' : 'whatsapp')}
                    </strong>
                    . Reorganiza a Fila.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveChannel('whatsapp')}
                    className={[
                      'min-h-10 rounded-xl border text-[11px] font-bold',
                      activeChannel !== 'phone'
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700',
                    ].join(' ')}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChannel('phone')}
                    className={[
                      'min-h-10 rounded-xl border text-[11px] font-bold',
                      activeChannel === 'phone'
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700',
                    ].join(' ')}
                  >
                    Telefone
                  </button>
                </div>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700">
                    <StickyNote size={13} />
                    Anotação
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={
                      activeChannel === 'phone'
                        ? 'Ex.: pediu retorno amanhã · secretária · não atende…'
                        : 'Ex.: pediu retorno amanhã · número não existe…'
                    }
                    className="w-full resize-none rounded-2xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/5"
                  />
                </label>

                {resultGroups.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <p className="text-[11px] font-semibold text-neutral-500">{group.title}</p>
                    {group.items.map((o) => {
                      const Icon = o.icon
                      const busy = saving === o.action
                      return (
                        <button
                          key={o.action}
                          type="button"
                          disabled={!!saving}
                          onClick={() => void applyOutcome(o.action)}
                          className={[
                            'flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border p-3 text-left transition active:scale-[0.99] disabled:opacity-50',
                            toneClass(o.tone),
                          ].join(' ')}
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/90 text-neutral-800">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm text-neutral-950">{o.title}</strong>
                            <span className="mt-0.5 block text-xs text-neutral-600">{o.desc}</span>
                          </span>
                          <ChevronRight size={16} className="shrink-0 text-neutral-400" />
                        </button>
                      )
                    })}
                  </div>
                ))}

                <div className="rounded-2xl border border-neutral-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowConvert((v) => !v)}
                    className="flex min-h-11 w-full items-center justify-between px-3.5 text-left text-xs font-semibold text-neutral-600"
                  >
                    Avançado · cliente
                    <ChevronDown size={16} className={showConvert ? 'rotate-180 transition' : 'transition'} />
                  </button>
                  {showConvert && (
                    <div className="border-t border-neutral-100 px-3.5 pb-3.5 space-y-2">
                      <p className="text-[11px] leading-relaxed text-neutral-500">
                        Só se já comprou de verdade. Não é etapa obrigatória.
                      </p>
                      <button
                        type="button"
                        disabled={!!saving}
                        onClick={() => void convert()}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-emerald-700 text-sm font-bold text-white disabled:opacity-45"
                      >
                        {saving === 'convert' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        Registrar como cliente
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {step === 'result' && !contactRegistered && (
            <footer className="border-t border-neutral-200 px-4 py-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
              {activeChannel === 'phone' ? (
                <button
                  type="button"
                  onClick={() => void markCalled()}
                  disabled={!!saving || phoneDigits.length < 8}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-sky-700 text-sm font-bold text-white disabled:opacity-40"
                >
                  <Phone size={15} />
                  Registrar ligação antes do resultado
                </button>
              ) : hasWa ? (
                <button
                  type="button"
                  onClick={() => setShowComposer(true)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 text-sm font-bold text-white"
                >
                  <MessageCircle size={15} />
                  Abrir WhatsApp
                </button>
              ) : null}
            </footer>
          )}
        </div>
      </div>

      {showComposer && (
        <WhatsAppSendModal
          key={`${item.ref_id}-${composerTemplateId}`}
          leads={[lead]}
          initialBrandName={String(ctx.brand?.name || item.brand_name || '')}
          initialProductName={String(item.product_name || '').trim()}
          initialValueProposition={String(ctx.brand?.slogan || '').trim()}
          initialTemplateId={composerTemplateId || defaultTemplate}
          onClose={() => {
            setShowComposer(false)
            if (step === 'message' && !sentOk) setStep('lead')
          }}
          onAiPersonalize={async ({ lead: l, currentMessage, templateId }) => {
            const [refType, refId] = String(l.id || '').split(':')
            const result = await affiliateApi.assistOpportunity(refType, refId, {
              intent: templateId === 'optin' ? 'optin_authorization' : templateId,
              instruction: currentMessage.slice(0, 600),
            })
            return String(result.message || currentMessage)
          }}
          onSent={async () => {
            setShowComposer(false)
            await markSent()
          }}
        />
      )}
    </>
  )
}

function ChannelTile({
  label,
  value,
  active,
  warn,
  icon,
  onCopy,
}: {
  label: string
  value: string
  active: boolean
  warn?: boolean
  icon: ReactNode
  onCopy?: () => void
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-3 min-h-[76px] flex flex-col',
        warn
          ? 'border-amber-200 bg-amber-50'
          : active
            ? 'border-neutral-200 bg-neutral-50'
            : 'border-transparent bg-neutral-100/80 opacity-60',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 text-neutral-700">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-neutral-900 truncate flex-1">{value}</p>
      {onCopy && active && (
        <button type="button" onClick={onCopy} className="mt-1 text-[10px] font-bold text-emerald-700 text-left">
          Copiar
        </button>
      )}
    </div>
  )
}
