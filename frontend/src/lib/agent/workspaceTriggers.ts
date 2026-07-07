/** Gatilhos prontos — disparam skill direto (sem orquestrador LLM). */
export type WorkspaceTrigger = {
  skill: string
  userLabel: string
  assistantMessage?: string
  context?: Record<string, unknown>
}

const TRIGGERS: Record<string, WorkspaceTrigger> = {
  dashboard: {
    skill: 'dashboard.overview',
    userLabel: 'Ver painel',
    assistantMessage: 'Resumo do seu negócio:',
  },
  leads: {
    skill: 'crm.leads.table',
    userLabel: 'Ver leads',
    assistantMessage: 'Seus leads recentes:',
  },
  busca: {
    skill: 'lead.prospect',
    userLabel: 'Prospectar no mapa',
    assistantMessage: 'Vamos prospectar no mapa. Qual segmento e cidade?',
  },
  mensagens: {
    skill: 'messages.inbox',
    userLabel: 'Ver conversas',
    assistantMessage: 'Últimas conversas:',
  },
  campanhas: {
    skill: 'campaigns.list',
    userLabel: 'Ver campanhas',
    assistantMessage: 'Suas campanhas:',
  },
  agente: {
    skill: 'workspace.overview',
    userLabel: 'Status do agente',
    assistantMessage: 'Prontidão do seu agente IA:',
  },
  habilidades: {
    skill: 'skills.list',
    userLabel: 'Ver habilidades',
    assistantMessage: 'Habilidades do agente:',
  },
  produtos: {
    skill: 'catalog.products',
    userLabel: 'Ver produtos',
    assistantMessage: 'Resumo do catálogo:',
  },
  'criar-produto': {
    skill: 'catalog.products.create',
    userLabel: 'Criar produto',
    assistantMessage: 'Vamos criar um produto. Preencha o formulário:',
  },
  pedidos: {
    skill: 'catalog.orders',
    userLabel: 'Ver pedidos',
    assistantMessage: 'Pedidos recentes:',
  },
  estoque: {
    skill: 'catalog.products.table',
    userLabel: 'Ver estoque',
    assistantMessage: 'Produtos e estoque:',
  },
  criativos: {
    skill: 'creative.generate',
    userLabel: 'Criativos IA',
    assistantMessage: 'Abrindo criativos IA…',
  },
  galeria: {
    skill: 'gallery.open',
    userLabel: 'Abrir galeria',
    assistantMessage: 'Sua galeria de mídia:',
  },
  'video-studio': {
    skill: 'video.create',
    userLabel: 'Video Studio',
    assistantMessage: 'Abrindo Video Studio…',
  },
  fluxos: {
    skill: 'flow.builder',
    userLabel: 'Editor de fluxos',
    assistantMessage: 'Abrindo editor de fluxos…',
  },
  automacoes: {
    skill: 'flow.builder',
    userLabel: 'Automações',
    assistantMessage: 'Abrindo automações…',
  },
  whatsapp: {
    skill: 'workspace.overview',
    userLabel: 'Conectar WhatsApp',
    assistantMessage: 'Vamos vincular pelo código no seu número:',
  },
  configuracoes: {
    skill: 'workspace.navigate',
    userLabel: 'Configurações',
    assistantMessage: 'Abrindo configurações…',
  },
  'tirar-pedido': {
    skill: 'order.assisted',
    userLabel: 'Fazer pedido',
    assistantMessage: 'Vamos montar esse pedido. Para quem é?',
  },
  clientes: {
    skill: 'crm.clients.table',
    userLabel: 'Ver clientes',
    assistantMessage: 'Sua base de clientes:',
  },
}

const PATH_TO_KEY: Record<string, string> = {
  '/admin': 'dashboard',
  '/dashboard': 'dashboard',
  '/leads': 'leads',
  '/clientes': 'clientes',
  '/busca': 'busca',
  '/mensagens': 'mensagens',
  '/campanhas': 'campanhas',
  '/campanha': 'campanhas',
  '/agente': 'agente',
  '/habilidades': 'habilidades',
  '/skills': 'habilidades',
  '/produtos': 'produtos',
  '/pedidos': 'pedidos',
  '/estoque': 'estoque',
  '/criativos': 'criativos',
  '/creative': 'criativos',
  '/galeria': 'galeria',
  '/video-studio': 'video-studio',
  '/fluxos': 'fluxos',
  '/automacoes': 'automacoes',
  '/whatsapp': 'whatsapp',
  '/configuracoes': 'configuracoes',
  '/tirar-pedido': 'tirar-pedido',
}

/** Chips e atalhos com skill dedicada */
export const OBJECTIVE_TRIGGERS: WorkspaceTrigger[] = [
  { skill: 'lead.prospect', userLabel: 'Prospectar', assistantMessage: 'Vamos prospectar no mapa. Qual segmento e cidade?' },
  { skill: 'crm.leads.table', userLabel: 'Leads', assistantMessage: 'Seus leads recentes:' },
  { skill: 'crm.clients.table', userLabel: 'Clientes', assistantMessage: 'Sua base de clientes:' },
  { skill: 'messages.inbox', userLabel: 'Responder cliente', assistantMessage: 'Últimas conversas:' },
  { skill: 'catalog.products', userLabel: 'Produtos', assistantMessage: 'Seu catálogo:' },
  { skill: 'catalog.products.create', userLabel: 'Criar produto', assistantMessage: 'Vamos criar um produto. Preencha o formulário:' },
  { skill: 'gallery.open', userLabel: 'Galeria', assistantMessage: 'Assets da marca:' },
  { skill: 'campaigns.list', userLabel: 'Campanhas', assistantMessage: 'Suas campanhas:' },
  { skill: 'catalog.orders', userLabel: 'Pedidos', assistantMessage: 'Seus pedidos recentes:' },
  { skill: 'order.assisted', userLabel: 'Fazer pedido', assistantMessage: 'Vamos montar esse pedido. Para quem é?' },
]

export function resolveTrigger(navKeyOrPath: string): WorkspaceTrigger | null {
  const raw = String(navKeyOrPath || '').trim()
  if (!raw) return null
  if (TRIGGERS[raw]) return TRIGGERS[raw]
  const key = PATH_TO_KEY[raw] || PATH_TO_KEY[raw.replace(/\/$/, '')]
  return key ? TRIGGERS[key] || null : null
}

export function resolveTriggerBySkill(skillId: string): WorkspaceTrigger | null {
  const entry = Object.values(TRIGGERS).find((t) => t.skill === skillId)
  return entry || null
}