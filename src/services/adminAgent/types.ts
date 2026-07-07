export type ComponentType =
  | "text"
  | "button"
  | "kpi_row"
  | "readiness_card"
  | "checklist"
  | "nav_suggestions"
  | "skill_list"
  | "table"
  | "form"
  | "lead_card"
  | "confirmation"
  | "option_picker"
  | "prospect_stats"
  | "inbox_stats"
  | "products_stats"
  | "campaigns_stats"
  | "gallery_stats"
  | "leads_stats";

export type PresentationMode = "inline" | "canvas";

export interface ComponentSpec {
  id: string;
  type: ComponentType;
  props?: Record<string, unknown>;
}

export type AgentActionType = "navigate" | "open_modal" | "send_message";

export interface AgentAction {
  type: AgentActionType;
  payload: Record<string, unknown>;
}

export interface AgentTurn {
  message: string;
  squad?: string;
  skill?: string;
  objective?: string;
  components?: ComponentSpec[];
  actions?: AgentAction[];
  nextSkill?: string;
  presentation?: PresentationMode;
  canvasRoute?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  squad: string;
  kind?: "business" | "ui";
  objectives?: string[];
  intents: string[];
  permissions: string[];
  ui: ComponentType[];
  requiresCanvas?: boolean;
}

export interface SquadDefinition {
  id: string;
  name: string;
  description: string;
  skills: string[];
}

export interface SkillContext {
  nextSkill?: string;
  leadId?: string;
  search?: string;
  [key: string]: unknown;
}

export interface ComponentEvent {
  componentId: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface AdminAgentContext {
  userId: string;
  brandId: string | null;
  currentPath?: string;
  skillContext?: SkillContext;
  componentEvent?: ComponentEvent;
  /** Dispara skill direto — pula seleção LLM (gatilhos de navegação). */
  directSkill?: string;
}

export interface SkillSelection {
  squad: string;
  skill: string;
  message: string;
  reasoning?: string;
  context?: Record<string, unknown>;
  nextSkill?: string;
}