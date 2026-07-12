/**
 * Registry table-driven dos módulos do workspace conversacional.
 * Fonte única de labels / rotas — evita espalhar strings e flags ad hoc.
 */
import { MODULE_PRIORITY, MODULE_STATUS_LABELS, resolveActiveModuleId } from './workspaceTriggers'

export type WorkspaceModuleDef = {
  id: string
  label: string
  /** Rota gerencial embutida no canvas (desktop). */
  canvasRoute: string
  /** Skills que abrem este módulo (prefixo ou id exato). */
  skills: string[]
}

export const WORKSPACE_MODULE_DEFS: WorkspaceModuleDef[] = [
  { id: 'inbox', label: 'Mensagens', canvasRoute: '/mensagens', skills: ['messages.inbox'] },
  { id: 'prospect', label: 'Prospecção', canvasRoute: '/busca', skills: ['lead.prospect'] },
  { id: 'leads', label: 'Leads', canvasRoute: '/leads', skills: ['crm.leads.table', 'crm.leads.list', 'crm.leads.search', 'crm.lead.find', 'crm.lead.detail'] },
  { id: 'orders', label: 'Pedidos', canvasRoute: '/pedidos', skills: ['catalog.orders'] },
  { id: 'products', label: 'Produtos', canvasRoute: '/produtos', skills: ['catalog.products', 'catalog.products.table', 'catalog.products.create'] },
  { id: 'clients', label: 'Clientes', canvasRoute: '/clientes', skills: ['crm.clients.table', 'crm.clients.list'] },
  { id: 'campaigns', label: 'Campanhas', canvasRoute: '/campanhas', skills: ['campaigns.list', 'campaigns.create', 'campaign.builder'] },
  { id: 'gallery', label: 'Galeria', canvasRoute: '/galeria', skills: ['gallery.open'] },
  { id: 'instagram', label: 'Instagram', canvasRoute: '/instagram', skills: ['instagram.open', 'instagram.post.create', 'instagram.analyze'] },
  { id: 'facebook', label: 'Facebook', canvasRoute: '/facebook', skills: ['facebook.open', 'facebook.post.create', 'facebook.analyze'] },
  { id: 'automations', label: 'Automações', canvasRoute: '/automacoes', skills: ['automation.open', 'automation.create', 'flow.builder'] },
  { id: 'affiliates', label: 'Afiliados', canvasRoute: '/afiliados', skills: ['affiliate.open', 'affiliate.create', 'affiliate.config'] },
  { id: 'dashboard', label: 'Painel', canvasRoute: '/dashboard', skills: ['dashboard.overview', 'dashboard.show'] },
  { id: 'skills', label: 'Habilidades', canvasRoute: '/habilidades', skills: ['skills.list'] },
  { id: 'settings', label: 'Configurações', canvasRoute: '/configuracoes', skills: ['settings.open'] },
  { id: 'store', label: 'Loja', canvasRoute: '/loja', skills: ['design.edit'] },
]

export function moduleLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return MODULE_STATUS_LABELS[id] || WORKSPACE_MODULE_DEFS.find((m) => m.id === id)?.label || id
}

export function canvasRouteForModule(id: string | null | undefined): string | null {
  if (!id) return null
  return WORKSPACE_MODULE_DEFS.find((m) => m.id === id)?.canvasRoute || null
}

export function moduleIdForSkill(skill?: string | null): string | null {
  if (!skill) return null
  const hit = WORKSPACE_MODULE_DEFS.find((m) => m.skills.includes(skill))
  return hit?.id || null
}

/** Reexport — API estável para shell e testes. */
export { MODULE_PRIORITY, resolveActiveModuleId }

/** Domínios com edição inline no chat (piloto). */
export const CONVERSATIONAL_EDITABLE_MODULES = ['leads'] as const

export function isConversationalEditable(moduleId: string | null | undefined): boolean {
  return !!moduleId && (CONVERSATIONAL_EDITABLE_MODULES as readonly string[]).includes(moduleId)
}
