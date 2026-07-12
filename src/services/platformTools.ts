/**
 * Platform tools / feature flags — global SaaS kill-switches and modules.
 * Stored in master_settings.key = "platform_tools".
 */

import { masterService } from "./master"
import { DEFAULT_PREFERENCES } from "../config/ai-models"

export type PlatformModules = {
  whatsapp: boolean
  instagram: boolean
  facebook: boolean
  campaigns: boolean
  automations: boolean
  catalog: boolean
  affiliates: boolean
  ai_creatives: boolean
  prospect_radar: boolean
  video_studio: boolean
  agent_workspace: boolean
  flow_builder: boolean
  lead_import: boolean
}

export type PlatformTools = {
  maintenance_mode: boolean
  maintenance_message: string
  signup_enabled: boolean
  public_signup: boolean
  modules: PlatformModules
  default_ai_preferences: typeof DEFAULT_PREFERENCES
  /**
   * When true (default), AI model routing uses Master · Algoritmos (global).
   * When false, falls back to per-org __preferences__ (legacy).
   */
  algorithms_v1_enabled?: boolean
}

export const DEFAULT_PLATFORM_TOOLS: PlatformTools = {
  maintenance_mode: false,
  maintenance_message: "",
  signup_enabled: true,
  public_signup: true,
  modules: {
    whatsapp: true,
    instagram: true,
    facebook: true,
    campaigns: true,
    automations: true,
    catalog: true,
    affiliates: true,
    ai_creatives: true,
    prospect_radar: true,
    video_studio: true,
    agent_workspace: true,
    flow_builder: true,
    lead_import: true,
  },
  default_ai_preferences: DEFAULT_PREFERENCES,
  algorithms_v1_enabled: true,
}

/** API path prefix → platform module key */
export const ROUTE_MODULE_MAP: Array<{ prefix: string; module: keyof PlatformModules }> = [
  { prefix: "/api/instagram", module: "instagram" },
  { prefix: "/api/facebook", module: "facebook" },
  { prefix: "/api/campaigns-v2", module: "campaigns" },
  { prefix: "/api/ai-campaign", module: "campaigns" },
  { prefix: "/api/automations", module: "automations" },
  { prefix: "/api/automation-defs", module: "automations" },
  { prefix: "/api/brand-automations", module: "automations" },
  { prefix: "/api/flows", module: "flow_builder" },
  { prefix: "/api/video-studio", module: "video_studio" },
  { prefix: "/api/affiliates", module: "affiliates" },
  { prefix: "/api/affiliate-programs", module: "affiliates" },
  { prefix: "/api/lead-import", module: "lead_import" },
  { prefix: "/api/admin-agent", module: "agent_workspace" },
]

/** Nav section key → platform module (frontend) */
export const NAV_MODULE_MAP: Record<string, keyof PlatformModules | null> = {
  dashboard: null,
  leads: "prospect_radar",
  clientes: null,
  busca: "prospect_radar",
  mensagens: "whatsapp",
  campanhas: "campaigns",
  automacoes: "automations",
  fluxos: "flow_builder",
  habilidades: "agent_workspace",
  criativos: "ai_creatives",
  galeria: "ai_creatives",
  "video-studio": "video_studio",
  agente: "agent_workspace",
  atendente: "agent_workspace",
  notificacoes: null,
  instagram: "instagram",
  facebook: "facebook",
  produtos: "catalog",
  pedidos: "catalog",
  "tirar-pedido": "catalog",
  estoque: "catalog",
  afiliados: "affiliates",
  cupons: "catalog",
  avaliacoes: "catalog",
  loja: "catalog",
  pagamentos: "catalog",
  frete: "catalog",
  dominio: "catalog",
  whatsapp: "whatsapp",
  configuracoes: null,
  emails: null,
  "provedores-ia": null,
}

const CACHE_TTL_MS = 15_000
let cache: { tools: PlatformTools; expires: number } | null = null

export function mergePlatformTools(stored: Partial<PlatformTools> | null | undefined): PlatformTools {
  const base = DEFAULT_PLATFORM_TOOLS
  if (!stored || typeof stored !== "object") return { ...base, modules: { ...base.modules } }
  return {
    ...base,
    ...stored,
    modules: { ...base.modules, ...(stored.modules || {}) },
    default_ai_preferences: {
      ...base.default_ai_preferences,
      ...(stored.default_ai_preferences || {}),
    },
    maintenance_message: String(stored.maintenance_message ?? base.maintenance_message ?? ""),
  }
}

export async function getPlatformTools(force = false): Promise<PlatformTools> {
  if (!force && cache && cache.expires > Date.now()) return cache.tools
  try {
    const stored = await masterService.getSetting<Partial<PlatformTools>>("platform_tools")
    const tools = mergePlatformTools(stored)
    cache = { tools, expires: Date.now() + CACHE_TTL_MS }
    return tools
  } catch {
    return { ...DEFAULT_PLATFORM_TOOLS, modules: { ...DEFAULT_PLATFORM_TOOLS.modules } }
  }
}

export function invalidatePlatformToolsCache(): void {
  cache = null
}

export async function isModuleEnabled(module: keyof PlatformModules): Promise<boolean> {
  const tools = await getPlatformTools()
  return tools.modules[module] !== false
}

export async function getPublicPlatformStatus(): Promise<{
  maintenance_mode: boolean
  maintenance_message: string
  signup_enabled: boolean
  public_signup: boolean
  modules: PlatformModules
}> {
  const tools = await getPlatformTools()
  return {
    maintenance_mode: !!tools.maintenance_mode,
    maintenance_message: tools.maintenance_message || "",
    signup_enabled: tools.signup_enabled !== false,
    public_signup: tools.public_signup !== false,
    modules: tools.modules,
  }
}
