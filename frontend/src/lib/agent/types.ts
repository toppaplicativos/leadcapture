export type ComponentType =
  | 'text'
  | 'button'
  | 'kpi_row'
  | 'readiness_card'
  | 'checklist'
  | 'nav_suggestions'
  | 'skill_list'
  | 'table'
  | 'form'
  | 'lead_card'
  | 'confirmation'
  | 'option_picker'
  | 'prospect_stats'
  | 'inbox_stats'
  | 'products_stats'
  | 'campaigns_stats'
  | 'gallery_stats'
  | 'leads_stats'
  | 'clients_stats'
  | 'orders_stats'
  | 'instagram_stats'

export type PresentationMode = 'inline' | 'canvas'

export interface ComponentSpec {
  id: string
  type: ComponentType
  props?: Record<string, unknown>
}

export type AgentActionType = 'navigate' | 'open_modal' | 'send_message'

export interface AgentAction {
  type: AgentActionType
  payload: Record<string, unknown>
}

export interface AgentTurn {
  message: string
  squad?: string
  skill?: string
  objective?: string
  components?: ComponentSpec[]
  actions?: AgentAction[]
  nextSkill?: string
  presentation?: PresentationMode
  canvasRoute?: string
}

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  turn?: AgentTurn
  loading?: boolean
}

export type AgentModalId = 'ai-campaign' | 'skill-trainer'

export interface SkillContext {
  nextSkill?: string
  leadId?: string
  search?: string
  channel?: string
  customer?: string
  [key: string]: unknown
}

export interface ComponentEvent {
  componentId: string
  action: string
  payload?: Record<string, unknown>
}

export interface TriggerSkillOptions {
  label?: string
  context?: SkillContext
  assistantMessage?: string
}

export interface AgentCallbacks {
  onNavigate: (path: string) => void
  onTriggerNav: (navKeyOrPath: string) => void
  onOpenModal: (modal: AgentModalId) => void
  onSendMessage: (text: string, opts?: { componentEvent?: ComponentEvent; skillContext?: SkillContext; directSkill?: string }) => void
  onComponentEvent?: (event: ComponentEvent, skillContext?: SkillContext) => void
}