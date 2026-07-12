/**
 * Canonical AI algorithm registry — Master · Algoritmos
 * Each function_key maps a product action to provider+model (global SaaS policy).
 * @see docs/AI_ALGORITHMS_MIGRATION_PLAN.md
 */

import { DEFAULT_PREFERENCES, type AICategory } from "./ai-models"

export type AlgorithmModality = "text" | "image" | "video" | "vision"

export type AlgorithmDef = {
  function_key: string
  modality: AlgorithmModality
  label: string
  description?: string
  group_name: string
  provider: string
  model: string
  fallback_provider?: string | null
  fallback_model?: string | null
  temperature?: number | null
  /** Coming soon — no runtime adapter yet */
  coming_soon?: boolean
}

const T = DEFAULT_PREFERENCES.text
const I = DEFAULT_PREFERENCES.image
const V = DEFAULT_PREFERENCES.video

/** Seed defaults — master can override in ai_algorithms table without code deploy */
export const ALGORITHM_REGISTRY: AlgorithmDef[] = [
  // ── Text ──────────────────────────────────────────────────────────────
  {
    function_key: "text.router.default",
    modality: "text",
    label: "Texto genérico (router)",
    description: "Fallback de generateText/generateJson quando functionKey omitido",
    group_name: "Sistema",
    provider: T.provider,
    model: T.model,
    temperature: 0.5,
  },
  {
    function_key: "text.cognitive.reason",
    modality: "text",
    label: "WhatsApp · raciocínio",
    group_name: "WhatsApp",
    provider: T.provider,
    model: T.model,
    temperature: 0.3,
  },
  {
    function_key: "text.cognitive.compose",
    modality: "text",
    label: "WhatsApp · composição",
    group_name: "WhatsApp",
    provider: T.provider,
    model: T.model,
    temperature: 0.6,
  },
  {
    function_key: "text.whatsapp.legacy",
    modality: "text",
    label: "WhatsApp · agent legado",
    group_name: "WhatsApp",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.campaign.message",
    modality: "text",
    label: "Campanha · mensagem outbound",
    group_name: "Campanhas",
    provider: T.provider,
    model: T.model,
    temperature: 0.7,
  },
  {
    function_key: "text.message.analyze",
    modality: "text",
    label: "Analisar mensagem",
    group_name: "Mensagens",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.message.improve",
    modality: "text",
    label: "Melhorar mensagem",
    group_name: "Mensagens",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.message.variations",
    modality: "text",
    label: "Variações em massa",
    group_name: "Mensagens",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.memory.update",
    modality: "text",
    label: "Memory engine",
    group_name: "WhatsApp",
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0.2,
  },
  {
    function_key: "text.response.classify",
    modality: "text",
    label: "Classificar resposta",
    group_name: "WhatsApp",
    provider: T.provider,
    model: T.model,
    temperature: 0.1,
  },
  {
    function_key: "text.prospect.match",
    modality: "text",
    label: "Prospecção · match produto",
    group_name: "CRM / Leads",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
  {
    function_key: "text.admin.orchestrator",
    modality: "text",
    label: "Admin agent · orquestração",
    group_name: "Admin Agent",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.admin.memory",
    modality: "text",
    label: "Admin agent · memória",
    group_name: "Admin Agent",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.admin.summary",
    modality: "text",
    label: "Admin agent · resumo sessão",
    group_name: "Admin Agent",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.admin.product_draft",
    modality: "text",
    label: "Admin agent · rascunho produto",
    group_name: "Admin Agent",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.campaign.squad",
    modality: "text",
    label: "Squad campanha IA",
    group_name: "Campanhas",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.automation.tasks",
    modality: "text",
    label: "Automações · tarefas IA",
    group_name: "Automações",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.skill.trainer",
    modality: "text",
    label: "Treino de skill",
    group_name: "Habilidades",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.skill.templates",
    modality: "text",
    label: "Templates de skill",
    group_name: "Habilidades",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.lead.ideas",
    modality: "text",
    label: "Ideias de lead",
    group_name: "CRM / Leads",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.import.extract",
    modality: "text",
    label: "Import inteligente · texto",
    group_name: "CRM / Leads",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.followup.narrative",
    modality: "text",
    label: "Follow-up · narrativa",
    group_name: "CRM / Leads",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.composition.director",
    modality: "text",
    label: "Direção de composição",
    group_name: "Criativos",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.affiliate.program_fill",
    modality: "text",
    label: "Afiliados · preencher programa",
    group_name: "Afiliados",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.affiliate.product_learn",
    modality: "text",
    label: "Afiliados · aprendizado produto",
    group_name: "Afiliados",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.instagram.reply",
    modality: "text",
    label: "Instagram · resposta IA",
    group_name: "Instagram",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.instagram.caption",
    modality: "text",
    label: "Instagram · legenda",
    group_name: "Instagram",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.creative.copy",
    modality: "text",
    label: "Criativos · copy",
    group_name: "Criativos",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.product.description",
    modality: "text",
    label: "Produto · descrição",
    group_name: "Loja",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.storefront.compose",
    modality: "text",
    label: "Loja · página AI",
    group_name: "Loja",
    provider: T.provider,
    model: T.model,
  },
  {
    function_key: "text.video.spec",
    modality: "text",
    label: "Video Studio · spec JSON",
    group_name: "Vídeo",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
  {
    function_key: "text.landing.chat",
    modality: "text",
    label: "Landing · chat Mira",
    group_name: "Sistema",
    provider: "openai",
    model: "gpt-4o-mini",
    fallback_provider: "gemini",
    fallback_model: "gemini-2.5-flash",
  },
  {
    function_key: "text.skill.vision_ocr",
    modality: "vision",
    label: "Skill · OCR / intake visão",
    group_name: "Habilidades",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },

  // ── Image ─────────────────────────────────────────────────────────────
  {
    function_key: "image.product.studio",
    modality: "image",
    label: "Estúdio de produto",
    group_name: "Criativos",
    provider: I.provider,
    model: I.model,
  },
  {
    function_key: "image.creative.simple",
    modality: "image",
    label: "Criativo simples",
    group_name: "Criativos",
    provider: I.provider,
    model: I.model,
  },
  {
    function_key: "image.creative.remix",
    modality: "image",
    label: "Remix / edição de imagem",
    group_name: "Criativos",
    provider: I.provider,
    model: I.model,
  },
  {
    function_key: "image.admin.product",
    modality: "image",
    label: "Admin agent · imagem produto",
    group_name: "Admin Agent",
    provider: I.provider,
    model: I.model,
  },
  {
    function_key: "image.vision.analyze",
    modality: "vision",
    label: "Análise / OCR / legendas",
    group_name: "Visão",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },
  {
    function_key: "image.import.extract",
    modality: "vision",
    label: "Import leads de imagem",
    group_name: "CRM / Leads",
    provider: "gemini",
    model: "gemini-2.5-flash",
  },

  // ── Video ─────────────────────────────────────────────────────────────
  {
    function_key: "video.generate.veo",
    modality: "video",
    label: "Geração Veo",
    group_name: "Vídeo",
    provider: V.provider === "veo" ? "veo" : V.provider,
    model: V.model,
  },
  {
    function_key: "video.generate.grok",
    modality: "video",
    label: "Imagine Video (Grok)",
    group_name: "Vídeo",
    provider: "grok",
    model: "grok-imagine-video",
    coming_soon: true,
  },
  {
    function_key: "video.generate.kling",
    modality: "video",
    label: "Kling text/image→video",
    group_name: "Vídeo",
    provider: "kling",
    model: "v2.1-standard/image-to-video",
    coming_soon: true,
  },
]

export const MODALITY_DEFAULT_KEYS: Record<AICategory, string> = {
  text: "text.router.default",
  image: "image.product.studio",
  video: "video.generate.veo",
}

export function getAlgorithmDef(functionKey: string): AlgorithmDef | undefined {
  return ALGORITHM_REGISTRY.find((a) => a.function_key === functionKey)
}

export function listAlgorithmsByModality(modality: string): AlgorithmDef[] {
  return ALGORITHM_REGISTRY.filter((a) => a.modality === modality)
}
