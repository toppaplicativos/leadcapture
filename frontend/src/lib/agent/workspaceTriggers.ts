/** Gatilhos prontos — disparam skill direto (sem orquestrador LLM) ou abrem canvas. */
export type WorkspaceTrigger = {
  skill: string
  userLabel: string
  assistantMessage?: string
  context?: Record<string, unknown>
  /** Quando setado, triggerSkill abre o canvas nesta rota (página gerencial). */
  canvasPath?: string
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
    canvasPath: '/agente',
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
    skill: 'nav.estoque',
    userLabel: 'Estoque',
    assistantMessage: 'Abrindo estoque…',
    canvasPath: '/estoque',
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
  instagram: {
    skill: 'instagram.open',
    userLabel: 'Abrir Instagram',
    assistantMessage: 'Sua conta Instagram:',
  },
  facebook: {
    skill: 'facebook.open',
    userLabel: 'Abrir Facebook',
    assistantMessage: 'Sua página Facebook:',
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
    skill: 'automation.open',
    userLabel: 'Automações',
    assistantMessage: 'Suas automações — gestão central de gatilhos e respostas:',
    canvasPath: '/automacoes',
  },
  afiliados: {
    skill: 'affiliate.open',
    userLabel: 'Afiliados',
    assistantMessage: 'Seu programa de parceiros:',
  },
  whatsapp: {
    skill: 'whatsapp.connect',
    userLabel: 'WhatsApp',
    assistantMessage: 'Gerenciamento de WhatsApp da organização:',
    canvasPath: '/whatsapp',
  },
  configuracoes: {
    skill: 'settings.open',
    userLabel: 'Configurações',
    assistantMessage: 'Configurações da organização — conta, usuário e marcas:',
    canvasPath: '/configuracoes',
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
  cupons: {
    skill: 'nav.cupons',
    userLabel: 'Cupons',
    assistantMessage: 'Abrindo cupons…',
    canvasPath: '/cupons',
  },
  frete: {
    skill: 'nav.frete',
    userLabel: 'Frete',
    assistantMessage: 'Abrindo frete…',
    canvasPath: '/frete',
  },
  loja: {
    skill: 'design.edit',
    userLabel: 'Loja',
    assistantMessage: 'Abrindo studio da loja…',
    canvasPath: '/loja',
  },
  emails: {
    skill: 'nav.emails',
    userLabel: 'Emails',
    assistantMessage: 'Abrindo emails…',
    canvasPath: '/emails',
  },
  notificacoes: {
    skill: 'nav.notificacoes',
    userLabel: 'Notificações',
    assistantMessage: 'Abrindo notificações…',
    canvasPath: '/notificacoes',
  },
  pagamentos: {
    skill: 'nav.pagamentos',
    userLabel: 'Pagamentos',
    assistantMessage: 'Abrindo pagamentos…',
    canvasPath: '/pagamentos',
  },
  avaliacoes: {
    skill: 'nav.avaliacoes',
    userLabel: 'Avaliações',
    assistantMessage: 'Abrindo avaliações…',
    canvasPath: '/avaliacoes',
  },
  dominio: {
    skill: 'nav.dominio',
    userLabel: 'Domínio',
    assistantMessage: 'Abrindo domínio…',
    canvasPath: '/dominio',
  },
  atendente: {
    skill: 'nav.atendente',
    userLabel: 'Atendente',
    assistantMessage: 'Abrindo configuração do atendente…',
    canvasPath: '/atendente',
  },
  'provedores-ia': {
    skill: 'nav.provedores-ia',
    userLabel: 'Provedores IA',
    assistantMessage: 'Abrindo provedores de IA…',
    canvasPath: '/provedores-ia',
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
  '/instagram': 'instagram',
  '/facebook': 'facebook',
  '/video-studio': 'video-studio',
  '/fluxos': 'fluxos',
  '/automacoes': 'automacoes',
  '/afiliados': 'afiliados',
  '/whatsapp': 'whatsapp',
  '/configuracoes': 'configuracoes',
  '/tirar-pedido': 'tirar-pedido',
  '/cupons': 'cupons',
  '/frete': 'frete',
  '/loja': 'loja',
  '/design': 'loja',
  '/emails': 'emails',
  '/notificacoes': 'notificacoes',
  '/pagamentos': 'pagamentos',
  '/avaliacoes': 'avaliacoes',
  '/dominio': 'dominio',
  '/atendente': 'atendente',
  '/provedores-ia': 'provedores-ia',
}

/** Skills que abrem canvas gerencial sem passar pelo orquestrador LLM. */
export const CANVAS_NAV_SKILLS: Record<string, string> = {
  'settings.open': '/configuracoes',
  'nav.cupons': '/cupons',
  'nav.frete': '/frete',
  'nav.emails': '/emails',
  'nav.notificacoes': '/notificacoes',
  'nav.estoque': '/estoque',
  'nav.pagamentos': '/pagamentos',
  'nav.avaliacoes': '/avaliacoes',
  'nav.dominio': '/dominio',
  'nav.atendente': '/atendente',
  'nav.provedores-ia': '/provedores-ia',
  'design.edit': '/loja',
  'workspace.overview': '/agente',
  'agent.configure': '/atendente',
  'dashboard.overview': '/dashboard',
  'dashboard.show': '/dashboard',
  'flow.builder': '/fluxos',
  'creative.generate': '/criativos',
  'campaign.builder': '/campanhas',
  'catalog.products': '/produtos',
  'catalog.products.table': '/produtos',
  'catalog.orders': '/pedidos',
  'crm.leads.table': '/leads',
  'crm.leads.list': '/leads',
  'crm.clients.table': '/clientes',
  'crm.clients.list': '/clientes',
  'gallery.open': '/galeria',
  'instagram.open': '/instagram',
  'facebook.open': '/facebook',
  'automation.open': '/automacoes',
  'affiliate.open': '/afiliados',
  'messages.inbox': '/mensagens',
  'campaigns.list': '/campanhas',
  'skills.list': '/habilidades',
}

/** Grupos de intenção — progressive disclosure (≤5 no 1º nível). */
export type ObjectiveGroupId = 'atender' | 'captar' | 'vender' | 'marca' | 'mais'

export type ObjectiveGroup = {
  id: ObjectiveGroupId
  label: string
  /** Uma linha: o que este grupo resolve */
  hint: string
  items: WorkspaceTrigger[]
}

export const OBJECTIVE_GROUPS: ObjectiveGroup[] = [
  {
    id: 'atender',
    label: 'Atender',
    hint: 'Mensagens, WhatsApp e automações',
    items: [
      { skill: 'messages.inbox', userLabel: 'Responder cliente', assistantMessage: 'Últimas conversas:' },
      { skill: 'whatsapp.connect', userLabel: 'WhatsApp', assistantMessage: 'Hub de conexão — vincule pelo código:' },
      { skill: 'automation.open', userLabel: 'Automações', assistantMessage: 'Hub de automações (todas as finalidades):' },
      { skill: 'automation.create', userLabel: 'Criar automação', assistantMessage: 'Descreva a automação que você quer:' },
      { skill: 'flow.builder', userLabel: 'Editor de fluxos', assistantMessage: 'Abrindo editor de fluxos…' },
      { skill: 'nav.notificacoes', userLabel: 'Notificações', assistantMessage: 'Abrindo notificações…', canvasPath: '/notificacoes' },
    ],
  },
  {
    id: 'captar',
    label: 'Captar',
    hint: 'Mapa, leads e clientes',
    items: [
      { skill: 'lead.prospect', userLabel: 'Prospectar', assistantMessage: 'Vamos prospectar no mapa. Qual segmento e cidade?' },
      { skill: 'crm.leads.table', userLabel: 'Leads', assistantMessage: 'Seus leads recentes:' },
      { skill: 'crm.clients.table', userLabel: 'Clientes', assistantMessage: 'Sua base de clientes:' },
      { skill: 'dashboard.overview', userLabel: 'Painel', assistantMessage: 'Resumo do seu negócio:' },
    ],
  },
  {
    id: 'vender',
    label: 'Vender',
    hint: 'Catálogo, pedidos, campanhas e loja',
    items: [
      { skill: 'catalog.products', userLabel: 'Produtos', assistantMessage: 'Seu catálogo:' },
      { skill: 'catalog.products.create', userLabel: 'Criar produto', assistantMessage: 'Vamos criar um produto. Preencha o formulário:' },
      { skill: 'catalog.orders', userLabel: 'Pedidos', assistantMessage: 'Seus pedidos recentes:' },
      { skill: 'order.assisted', userLabel: 'Fazer pedido', assistantMessage: 'Vamos montar esse pedido. Para quem é?' },
      { skill: 'campaigns.list', userLabel: 'Campanhas', assistantMessage: 'Suas campanhas:' },
      { skill: 'affiliate.open', userLabel: 'Afiliados', assistantMessage: 'Seu programa de parceiros:' },
      { skill: 'nav.cupons', userLabel: 'Cupons', assistantMessage: 'Abrindo cupons…', canvasPath: '/cupons' },
      { skill: 'nav.estoque', userLabel: 'Estoque', assistantMessage: 'Abrindo estoque…', canvasPath: '/estoque' },
      { skill: 'nav.frete', userLabel: 'Frete', assistantMessage: 'Abrindo frete…', canvasPath: '/frete' },
      { skill: 'nav.pagamentos', userLabel: 'Pagamentos', assistantMessage: 'Abrindo pagamentos…', canvasPath: '/pagamentos' },
    ],
  },
  {
    id: 'marca',
    label: 'Marca',
    hint: 'Redes, mídia e criativos',
    items: [
      { skill: 'gallery.open', userLabel: 'Galeria', assistantMessage: 'Assets da marca:' },
      { skill: 'creative.generate', userLabel: 'Criativos IA', assistantMessage: 'Abrindo criativos IA…' },
      { skill: 'video.create', userLabel: 'Video Studio', assistantMessage: 'Abrindo Video Studio…' },
      { skill: 'instagram.open', userLabel: 'Instagram', assistantMessage: 'Sua conta Instagram:' },
      { skill: 'instagram.post.create', userLabel: 'Criar post IG', assistantMessage: 'Sobre o que é o post?' },
      { skill: 'facebook.open', userLabel: 'Facebook', assistantMessage: 'Sua página Facebook:' },
      { skill: 'facebook.post.create', userLabel: 'Post Facebook', assistantMessage: 'Sobre o que é o post no Facebook?' },
      { skill: 'design.edit', userLabel: 'Loja', assistantMessage: 'Abrindo studio da loja…', canvasPath: '/loja' },
    ],
  },
  {
    id: 'mais',
    label: 'Mais',
    hint: 'Agente, config e operação avançada',
    items: [
      { skill: 'workspace.overview', userLabel: 'Agente IA', assistantMessage: 'Prontidão do seu agente IA:', canvasPath: '/agente' },
      { skill: 'skills.list', userLabel: 'Habilidades', assistantMessage: 'Habilidades do agente:' },
      { skill: 'nav.atendente', userLabel: 'Atendente', assistantMessage: 'Abrindo atendente…', canvasPath: '/atendente' },
      { skill: 'settings.open', userLabel: 'Configurações', assistantMessage: 'Configurações da organização — conta, usuário e marcas:', canvasPath: '/configuracoes' },
      { skill: 'nav.emails', userLabel: 'Emails', assistantMessage: 'Abrindo emails…', canvasPath: '/emails' },
      { skill: 'nav.provedores-ia', userLabel: 'Provedores IA', assistantMessage: 'Abrindo provedores…', canvasPath: '/provedores-ia' },
      { skill: 'nav.avaliacoes', userLabel: 'Avaliações', assistantMessage: 'Abrindo avaliações…', canvasPath: '/avaliacoes' },
      { skill: 'nav.dominio', userLabel: 'Domínio', assistantMessage: 'Abrindo domínio…', canvasPath: '/dominio' },
    ],
  },
]

/** Flat list (compat / menu completo) — derivado dos grupos. */
export const OBJECTIVE_TRIGGERS: WorkspaceTrigger[] = OBJECTIVE_GROUPS.flatMap((g) => g.items)

/**
 * Atalhos do dia a dia (≤5) — chips pós-mensagem e quick-start.
 * Prioriza o job mais comum da lojista: atender → captar → vender.
 */
export const QUICK_STARTERS: WorkspaceTrigger[] = [
  { skill: 'messages.inbox', userLabel: 'Responder cliente', assistantMessage: 'Últimas conversas:' },
  { skill: 'lead.prospect', userLabel: 'Prospectar', assistantMessage: 'Vamos prospectar no mapa. Qual segmento e cidade?' },
  { skill: 'crm.leads.table', userLabel: 'Leads', assistantMessage: 'Seus leads recentes:' },
  { skill: 'catalog.orders', userLabel: 'Pedidos', assistantMessage: 'Seus pedidos recentes:' },
  { skill: 'catalog.products', userLabel: 'Produtos', assistantMessage: 'Seu catálogo:' },
]

/** Labels de módulo para status espacial (rail · canvas). */
export const MODULE_STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospecção',
  inbox: 'Mensagens',
  products: 'Produtos',
  campaigns: 'Campanhas',
  gallery: 'Galeria',
  instagram: 'Instagram',
  facebook: 'Facebook',
  automations: 'Automações',
  affiliates: 'Afiliados',
  leads: 'Leads',
  clients: 'Clientes',
  orders: 'Pedidos',
  dashboard: 'Painel',
  skills: 'Habilidades',
  settings: 'Configurações',
  store: 'Loja',
}

/** Ordem de prioridade para um único módulo ativo (Linear-style). */
export const MODULE_PRIORITY: Array<keyof typeof MODULE_STATUS_LABELS> = [
  'inbox', 'prospect', 'leads', 'orders', 'products', 'clients',
  'campaigns', 'gallery', 'instagram', 'facebook', 'automations',
  'affiliates', 'settings', 'store', 'dashboard', 'skills',
]

export function resolveActiveModuleId(
  flags: Partial<Record<string, boolean>>,
): string | null {
  return MODULE_PRIORITY.find((id) => flags[id]) || null
}

export function resolveCanvasPathForSkill(skillId?: string): string | null {
  if (!skillId) return null
  if (CANVAS_NAV_SKILLS[skillId]) return CANVAS_NAV_SKILLS[skillId]
  const fromGroups = OBJECTIVE_TRIGGERS.find((t) => t.skill === skillId)
  return fromGroups?.canvasPath || null
}

export function resolveTrigger(navKeyOrPath: string): WorkspaceTrigger | null {
  const raw = String(navKeyOrPath || '').trim()
  if (!raw) return null
  if (TRIGGERS[raw]) return TRIGGERS[raw]
  const key = PATH_TO_KEY[raw] || PATH_TO_KEY[raw.replace(/\/$/, '')]
  return key ? TRIGGERS[key] || null : null
}

export function resolveTriggerBySkill(skillId: string): WorkspaceTrigger | null {
  const entry = Object.values(TRIGGERS).find((t) => t.skill === skillId)
  if (entry) return entry
  return OBJECTIVE_TRIGGERS.find((t) => t.skill === skillId) || null
}

/** Domínios NAV que a auditoria exige alcançáveis sem free-text. */
export const REQUIRED_DOMAIN_KEYS = [
  'cupons',
  'frete',
  'loja',
  'emails',
  'notificacoes',
  'estoque',
  'criativos',
  'fluxos',
  'agente',
] as const

/** Mapa de cobertura: domínio → skill/path resolvível. */
export function listDomainCoverage(): Array<{
  domain: string
  skill: string
  path: string | null
  groupId: string | null
}> {
  const rows: Array<{ domain: string; skill: string; path: string | null; groupId: string | null }> = []
  for (const domain of REQUIRED_DOMAIN_KEYS) {
    const trigger = resolveTrigger(domain)
    const skill = trigger?.skill || ''
    const path = trigger?.canvasPath
      || resolveCanvasPathForSkill(skill)
      || (skill ? null : `/${domain}`)
    const groupId = OBJECTIVE_GROUPS.find((g) =>
      g.items.some((i) => i.skill === skill),
    )?.id || null
    rows.push({ domain, skill, path, groupId })
  }
  return rows
}
