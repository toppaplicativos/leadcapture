import {
  Zap, Play, MessageSquare, Clock, GitBranch, Target, Mail,
  Phone, Tag, Star, Globe, Bell, Bot, Square, CheckCircle2,
  UserRound, Pause, type LucideIcon,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'

export type CatalogItem = {
  type: string
  subtype: string
  label: string
  desc: string
  icon: LucideIcon | typeof WhatsAppIcon
  group: 'trigger' | 'message' | 'collect' | 'logic' | 'action' | 'end'
}

export const NODE_ICON: Record<string, LucideIcon | typeof WhatsAppIcon> = {
  trigger: Zap,
  action: Play,
  condition: GitBranch,
  delay: Clock,
  wait: Pause,
  collect: Target,
  end: Square,
}

export const NODE_TONE: Record<string, { chip: string; icon: string; ring: string; bar: string }> = {
  trigger: {
    chip: 'bg-gray-900 text-white',
    icon: 'bg-gray-900 text-white',
    ring: 'ring-gray-900/20',
    bar: 'bg-gray-900',
  },
  action: {
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
    icon: 'bg-emerald-50 text-emerald-700',
    ring: 'ring-emerald-500/25',
    bar: 'bg-emerald-500',
  },
  message: {
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
    icon: 'bg-emerald-50 text-emerald-700',
    ring: 'ring-emerald-500/25',
    bar: 'bg-emerald-500',
  },
  condition: {
    chip: 'bg-amber-50 text-amber-900 ring-1 ring-amber-100',
    icon: 'bg-amber-50 text-amber-800',
    ring: 'ring-amber-500/25',
    bar: 'bg-amber-500',
  },
  delay: {
    chip: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
    icon: 'bg-gray-100 text-gray-600',
    ring: 'ring-gray-400/30',
    bar: 'bg-gray-400',
  },
  wait: {
    chip: 'bg-sky-50 text-sky-900 ring-1 ring-sky-100',
    icon: 'bg-sky-50 text-sky-700',
    ring: 'ring-sky-500/25',
    bar: 'bg-sky-500',
  },
  collect: {
    chip: 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-100',
    icon: 'bg-indigo-50 text-indigo-700',
    ring: 'ring-indigo-500/25',
    bar: 'bg-indigo-500',
  },
  end: {
    chip: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
    icon: 'bg-gray-200 text-gray-700',
    ring: 'ring-gray-400/30',
    bar: 'bg-gray-400',
  },
}

export function toneForNode(type: string, subtype?: string) {
  if (subtype === 'send_message' || subtype === 'ai_message' || subtype === 'send_image') {
    return NODE_TONE.message
  }
  return NODE_TONE[type] || NODE_TONE.action
}

export const TRIGGER_CATALOG: CatalogItem[] = [
  { type: 'trigger', subtype: 'message_received', label: 'Mensagem recebida', desc: 'WhatsApp — opcional palavras-chave', icon: WhatsAppIcon, group: 'trigger' },
  { type: 'trigger', subtype: 'new_lead', label: 'Novo lead', desc: 'Quando um contato é criado', icon: Zap, group: 'trigger' },
  { type: 'trigger', subtype: 'lead_status_change', label: 'Status alterado', desc: 'Mudança no funil do lead', icon: GitBranch, group: 'trigger' },
  { type: 'trigger', subtype: 'order_created', label: 'Pedido criado', desc: 'Novo pedido na loja', icon: Target, group: 'trigger' },
]

export const MESSAGE_CATALOG: CatalogItem[] = [
  { type: 'action', subtype: 'send_message', label: 'Enviar mensagem', desc: 'Texto, mídia, botões e lista', icon: WhatsAppIcon, group: 'message' },
  { type: 'action', subtype: 'ai_message', label: 'Mensagem com IA', desc: 'Texto controlado por instrução', icon: Bot, group: 'message' },
  { type: 'action', subtype: 'send_image', label: 'Enviar imagem', desc: 'URL ou legenda + imagem', icon: Mail, group: 'message' },
]

export const COLLECT_CATALOG: CatalogItem[] = [
  { type: 'wait', subtype: 'wait_reply', label: 'Aguardar resposta', desc: 'Pausa até a próxima mensagem', icon: Pause, group: 'collect' },
  { type: 'wait', subtype: 'wait_button', label: 'Aguardar botão/escolha', desc: 'Casa payload/número com opções', icon: CheckCircle2, group: 'collect' },
  { type: 'collect', subtype: 'collect_name', label: 'Coletar nome', desc: 'Salva em {{context.name}}', icon: UserRound, group: 'collect' },
  { type: 'collect', subtype: 'collect_email', label: 'Coletar e-mail', desc: 'Valida formato', icon: Mail, group: 'collect' },
  { type: 'collect', subtype: 'collect_phone', label: 'Coletar telefone', desc: 'Valida DDD', icon: Phone, group: 'collect' },
  { type: 'collect', subtype: 'collect_text', label: 'Coletar texto', desc: 'Campo livre em variável', icon: MessageSquare, group: 'collect' },
  { type: 'collect', subtype: 'collect_confirm', label: 'Confirmar sim/não', desc: 'Ramos yes/no no canvas', icon: CheckCircle2, group: 'collect' },
]

export const LOGIC_CATALOG: CatalogItem[] = [
  { type: 'condition', subtype: 'score_check', label: 'Score ≥ X', desc: 'Bifurca por pontuação', icon: Star, group: 'logic' },
  { type: 'condition', subtype: 'tag_check', label: 'Tem tag?', desc: 'Bifurca por tag', icon: Tag, group: 'logic' },
  { type: 'condition', subtype: 'status_check', label: 'Status = X', desc: 'Bifurca por status', icon: GitBranch, group: 'logic' },
  { type: 'condition', subtype: 'value_check', label: 'Valor ≥ X', desc: 'Bifurca por valor de pedido', icon: Target, group: 'logic' },
  { type: 'delay', subtype: 'wait_minutes', label: 'Aguardar tempo', desc: 'Pausa curta (demo)', icon: Clock, group: 'logic' },
]

export const ACTION_CATALOG: CatalogItem[] = [
  { type: 'action', subtype: 'change_status', label: 'Mudar status', desc: 'Atualiza status do lead', icon: GitBranch, group: 'action' },
  { type: 'action', subtype: 'add_tag', label: 'Adicionar tag', desc: 'Marca o contato', icon: Tag, group: 'action' },
  { type: 'action', subtype: 'update_score', label: 'Atualizar score', desc: 'Incrementa pontuação', icon: Star, group: 'action' },
  { type: 'action', subtype: 'send_notification', label: 'Notificar equipe', desc: 'Alerta no painel', icon: Bell, group: 'action' },
  { type: 'action', subtype: 'webhook', label: 'Webhook', desc: 'Chamada HTTP externa', icon: Globe, group: 'action' },
  { type: 'action', subtype: 'handoff_agent', label: 'Atendente humano', desc: 'Transfere e pausa o bot', icon: Phone, group: 'action' },
]

export const ALL_CATALOG: CatalogItem[] = [
  ...TRIGGER_CATALOG,
  ...MESSAGE_CATALOG,
  ...COLLECT_CATALOG,
  ...LOGIC_CATALOG,
  ...ACTION_CATALOG,
]

export function statusBadgeVariant(status: string): 'success' | 'warning' | 'neutral' | 'danger' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'warning'
  if (status === 'failed') return 'danger'
  if (status === 'waiting_user' || status === 'waiting_agent') return 'info'
  return 'neutral'
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Ativo',
    paused: 'Pausado',
    draft: 'Rascunho',
    running: 'Em execução',
    waiting_user: 'Aguardando cliente',
    waiting_agent: 'Com atendente',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    expired: 'Expirado',
  }
  return map[status] || status
}

/** Starter journey: mensagem → coleta nome → confirmação */
export function defaultJourneyNodes() {
  const nodes = [
    {
      id: 'trigger-1',
      type: 'trigger',
      subtype: 'message_received',
      label: 'Mensagem recebida',
      data: { keywords: 'pedido,quero,ola,olá' },
    },
    {
      id: 'msg-1',
      type: 'action',
      subtype: 'send_message',
      label: 'Boas-vindas',
      data: {
        message: 'Olá! Sou o assistente. Vou te ajudar com o pedido.',
        mensagemSteps: [
          {
            id: 'step-welcome',
            tipo: 'texto' as const,
            caption: 'Olá! Sou o assistente. Vou te ajudar com o pedido.',
          },
        ],
      },
    },
    {
      id: 'collect-1',
      type: 'collect',
      subtype: 'collect_name',
      label: 'Coletar nome',
      data: {
        prompt: 'Como posso te chamar?',
        variable_name: 'name',
        max_attempts: 3,
        timeout_minutes: 1440,
      },
    },
    {
      id: 'msg-2',
      type: 'action',
      subtype: 'send_message',
      label: 'Confirmação',
      data: {
        message: 'Prazer, {{context.name}}! Em breve seguimos com seu pedido.',
        mensagemSteps: [
          {
            id: 'step-confirm',
            tipo: 'texto' as const,
            caption: 'Prazer, {{context.name}}! Em breve seguimos com seu pedido.',
          },
        ],
      },
    },
    { id: 'end-1', type: 'end', subtype: 'end', label: 'Encerrar', data: {} },
  ]
  const connections = [
    { id: 'c1', from: 'trigger-1', fromHandle: 'main', to: 'msg-1' },
    { id: 'c2', from: 'msg-1', fromHandle: 'main', to: 'collect-1' },
    { id: 'c3', from: 'collect-1', fromHandle: 'main', to: 'msg-2' },
    { id: 'c4', from: 'msg-2', fromHandle: 'main', to: 'end-1' },
  ]
  return { nodes, connections }
}
