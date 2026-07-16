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

/** Fluxo inicial operacional: abertura -> entendimento -> solução -> conclusão. */
export function defaultSupportFlow() {
  const nodes = [
    {
      id: 'trigger-1',
      type: 'trigger',
      subtype: 'message_received',
      label: 'Cliente inicia o atendimento',
      phaseId: 'inicio',
      data: { keywords: '', phaseId: 'inicio' },
    },
    {
      id: 'msg-1',
      type: 'action',
      subtype: 'send_message',
      label: 'Receber e orientar',
      phaseId: 'inicio',
      data: {
        message: 'Olá! Sou o assistente da equipe. Vou entender o que você precisa e acompanhar seu atendimento até a conclusão.',
        wait_for_reply: false,
        phaseId: 'inicio',
        mensagemSteps: [
          {
            id: 'step-welcome',
            tipo: 'texto' as const,
            caption: 'Olá! Sou o assistente da equipe. Vou entender o que você precisa e acompanhar seu atendimento até a conclusão.',
          },
        ],
      },
    },
    {
      id: 'collect-1',
      type: 'collect',
      subtype: 'collect_name',
      label: 'Identificar o cliente',
      phaseId: 'entendimento',
      data: {
        prompt: 'Antes de começarmos, como posso te chamar?',
        variable_name: 'name',
        max_attempts: 3,
        timeout_minutes: 1440,
        phaseId: 'entendimento',
      },
    },
    {
      id: 'collect-2',
      type: 'collect',
      subtype: 'collect_text',
      label: 'Entender a necessidade',
      phaseId: 'entendimento',
      data: {
        prompt: 'Certo, {{context.name}}. Conte com suas palavras como podemos ajudar hoje.',
        variable_name: 'need',
        max_attempts: 3,
        timeout_minutes: 1440,
        phaseId: 'entendimento',
      },
    },
    {
      id: 'ai-1',
      type: 'action',
      subtype: 'ai_message',
      label: 'Preparar e enviar a solução',
      phaseId: 'resolucao',
      data: {
        ai_instruction: 'Responda à necessidade em {{context.need}} usando somente informações confirmadas da organização. Seja claro, objetivo e acolhedor. Se faltarem dados, explique o próximo passo sem inventar informações.',
        ai_instrucao: 'Responda à necessidade em {{context.need}} usando somente informações confirmadas da organização. Seja claro, objetivo e acolhedor. Se faltarem dados, explique o próximo passo sem inventar informações.',
        phaseId: 'resolucao',
      },
    },
    {
      id: 'confirm-1', type: 'collect', subtype: 'collect_confirm', label: 'Confirmar se foi resolvido', phaseId: 'conclusao',
      data: { prompt: 'Consegui resolver sua necessidade?', variable_name: 'resolved', max_attempts: 3, timeout_minutes: 1440, phaseId: 'conclusao' },
    },
    {
      id: 'msg-success', type: 'action', subtype: 'send_message', label: 'Encerrar com sucesso', phaseId: 'conclusao',
      data: {
        message: 'Perfeito, {{context.name}}! Atendimento concluído. Se precisar novamente, é só chamar.',
        wait_for_reply: false,
        phaseId: 'conclusao',
        mensagemSteps: [{ id: 'step-success', tipo: 'texto' as const, caption: 'Perfeito, {{context.name}}! Atendimento concluído. Se precisar novamente, é só chamar.' }],
      },
    },
    {
      id: 'handoff-1', type: 'action', subtype: 'handoff_agent', label: 'Transferir para atendente', phaseId: 'conclusao',
      data: { reason: 'Cliente informou que a necessidade ainda não foi resolvida.', message: 'Entendi. Vou transferir seu atendimento para uma pessoa da equipe continuar com você.', phaseId: 'conclusao' },
    },
    { id: 'end-success', type: 'end', subtype: 'completed', label: 'Atendimento concluído', phaseId: 'conclusao', data: { phaseId: 'conclusao' } },
    { id: 'end-handoff', type: 'end', subtype: 'handoff', label: 'Atendimento encaminhado', phaseId: 'conclusao', data: { phaseId: 'conclusao' } },
  ]
  const connections = [
    { id: 'c1', from: 'trigger-1', fromHandle: 'main', to: 'msg-1' },
    { id: 'c2', from: 'msg-1', fromHandle: 'main', to: 'collect-1' },
    { id: 'c3', from: 'collect-1', fromHandle: 'main', to: 'collect-2' },
    { id: 'c4', from: 'collect-2', fromHandle: 'main', to: 'ai-1' },
    { id: 'c5', from: 'ai-1', fromHandle: 'main', to: 'confirm-1' },
    { id: 'c6', from: 'confirm-1', fromHandle: 'yes', to: 'msg-success' },
    { id: 'c7', from: 'msg-success', fromHandle: 'main', to: 'end-success' },
    { id: 'c8', from: 'confirm-1', fromHandle: 'no', to: 'handoff-1' },
    { id: 'c9', from: 'handoff-1', fromHandle: 'main', to: 'end-handoff' },
  ]
  const phases = [
    { id: 'inicio', name: 'Começo', description: 'Recebe o cliente e explica como o atendimento funcionará.', color: '#171717', order: 1 },
    { id: 'entendimento', name: 'Entendimento', description: 'Identifica o cliente e registra sua necessidade.', color: '#4f46e5', order: 2 },
    { id: 'resolucao', name: 'Resolução', description: 'A IA prepara uma resposta usando o contexto confirmado da organização.', color: '#059669', order: 3 },
    { id: 'conclusao', name: 'Conclusão', description: 'Confirma a resolução ou transfere para atendimento humano.', color: '#d97706', order: 4 },
  ]
  return { nodes, connections, phases }
}

export const defaultJourneyNodes = defaultSupportFlow

/** Jornada replicável para respostas positivas de campanhas de restaurante. */
export function defaultRestaurantOrderFlow() {
  const nodes = [
    { id: 'campaign-trigger', type: 'trigger', subtype: 'message_received', label: 'Quero saber mais', phaseId: 'interesse', data: { campaignSourceMode: 'campaign', campaignIds: [], campaignChoices: [], keywords: 'quero saber mais, saber mais, quero pedir, fazer pedido', phaseId: 'interesse' } },
    { id: 'welcome', type: 'action', subtype: 'send_message', label: 'Receber interesse', phaseId: 'interesse', data: { message: 'Ótimo! Vou te ajudar a montar seu pedido. Para sair a qualquer momento, responda PARAR.', wait_for_reply: false, phaseId: 'interesse' } },
    { id: 'name', type: 'collect', subtype: 'collect_name', label: 'Nome do cliente', phaseId: 'triagem', data: { prompt: 'Como posso te chamar?', variable_name: 'name', required: true, phaseId: 'triagem' } },
    { id: 'product', type: 'collect', subtype: 'collect_text', label: 'Escolher produto', phaseId: 'pedido', data: { prompt: 'Qual item do nosso cardápio você deseja pedir?', variable_name: 'product', required: true, phaseId: 'pedido' } },
    { id: 'quantity', type: 'collect', subtype: 'collect_number', label: 'Definir quantidade', phaseId: 'pedido', data: { prompt: 'Quantas unidades você deseja?', variable_name: 'quantity', required: true, min: 1, phaseId: 'pedido' } },
    { id: 'delivery', type: 'collect', subtype: 'collect_text', label: 'Dados de entrega', phaseId: 'entrega', data: { prompt: 'Informe endereço completo, número e referência para entrega.', variable_name: 'delivery_address', required: true, phaseId: 'entrega' } },
    { id: 'payment', type: 'wait', subtype: 'wait_button', label: 'Forma de pagamento', phaseId: 'pagamento', data: { prompt: 'Como prefere pagar?', variable_name: 'payment_method', options: [{ id: 'pix', label: 'Pix' }, { id: 'cartao', label: 'Cartão' }, { id: 'dinheiro', label: 'Dinheiro' }], phaseId: 'pagamento' } },
    { id: 'confirm', type: 'collect', subtype: 'collect_confirm', label: 'Confirmar pedido', phaseId: 'confirmacao', data: { prompt: 'Confirma o pedido de {{context.quantity}}x {{context.product}} para {{context.delivery_address}}?', variable_name: 'confirmed', phaseId: 'confirmacao' } },
    { id: 'create-order', type: 'action', subtype: 'create_order', label: 'Criar pedido', phaseId: 'confirmacao', data: { items: [], payment_method: '{{context.payment_method.id}}', phaseId: 'confirmacao' } },
    { id: 'success', type: 'action', subtype: 'send_message', label: 'Pedido realizado', phaseId: 'conclusao', data: { message: 'Pedido #{{context.order_id}} realizado com sucesso! Total: R$ {{context.order_total}}. Acompanhe e conclua o pagamento aqui: {{context.checkout_url}}', wait_for_reply: false, phaseId: 'conclusao' } },
    { id: 'cancelled', type: 'action', subtype: 'send_message', label: 'Pedido não confirmado', phaseId: 'conclusao', data: { message: 'Tudo bem, não criaremos o pedido. Se quiser recomeçar, envie QUERO SABER MAIS.', wait_for_reply: false, phaseId: 'conclusao' } },
    { id: 'end-success', type: 'end', subtype: 'order_created', label: 'Pedido confirmado', phaseId: 'conclusao', data: {} },
    { id: 'end-cancelled', type: 'end', subtype: 'cancelled', label: 'Encerrado sem pedido', phaseId: 'conclusao', data: {} },
  ]
  const chain = ['campaign-trigger', 'welcome', 'name', 'product', 'quantity', 'delivery', 'payment', 'confirm']
  const connections = chain.slice(0, -1).map((from, index) => ({ id: `order-c${index + 1}`, from, fromHandle: 'main', to: chain[index + 1] }))
  connections.push(
    { id: 'order-confirm-yes', from: 'confirm', fromHandle: 'yes', to: 'create-order' },
    { id: 'order-create-success', from: 'create-order', fromHandle: 'main', to: 'success' },
    { id: 'order-end-success', from: 'success', fromHandle: 'main', to: 'end-success' },
    { id: 'order-confirm-no', from: 'confirm', fromHandle: 'no', to: 'cancelled' },
    { id: 'order-end-cancelled', from: 'cancelled', fromHandle: 'main', to: 'end-cancelled' },
  )
  const phases = [
    { id: 'interesse', name: 'Interesse', order: 1 }, { id: 'triagem', name: 'Triagem', order: 2 },
    { id: 'pedido', name: 'Pedido', order: 3 }, { id: 'entrega', name: 'Entrega', order: 4 },
    { id: 'pagamento', name: 'Pagamento', order: 5 }, { id: 'confirmacao', name: 'Confirmação', order: 6 },
    { id: 'conclusao', name: 'Conclusão', order: 7 },
  ]
  return { nodes, connections, phases }
}
