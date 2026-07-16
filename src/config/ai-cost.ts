/**
 * Estimativa de custo e adequação modelo × função do app.
 * Usado no Master · Algoritmos na escolha de provider/modelo.
 */

import {
  AI_MODELS,
  type AICategory,
  type AIModelDef,
  type ModelTier,
} from "./ai-models"

export type UsageProfile = {
  /** tokens de entrada estimados por chamada */
  input_tokens?: number
  /** tokens de saída estimados por chamada */
  output_tokens?: number
  /** imagens por chamada */
  images?: number
  /** segundos de vídeo por chamada */
  video_seconds?: number
  /** caracteres TTS */
  tts_chars?: number
  /** volume relativo (1 = normal, 5 = alto) */
  volume?: number
  /** capacidades desejadas */
  needs?: string[]
}

/** Perfis típicos de uso no LeadCapture por function_key (ou prefixo) */
const USAGE_BY_FUNCTION: Record<string, UsageProfile> = {
  "text.router.default": { input_tokens: 600, output_tokens: 400, volume: 3, needs: ["chat", "json"] },
  "text.cognitive.reason": { input_tokens: 1200, output_tokens: 350, volume: 4, needs: ["chat", "json"] },
  "text.cognitive.compose": { input_tokens: 900, output_tokens: 280, volume: 4, needs: ["chat", "copy"] },
  "text.whatsapp.legacy": { input_tokens: 800, output_tokens: 250, volume: 4, needs: ["chat"] },
  "text.campaign.message": { input_tokens: 700, output_tokens: 220, volume: 5, needs: ["chat", "copy"] },
  "text.message.analyze": { input_tokens: 500, output_tokens: 180, volume: 3, needs: ["chat", "json"] },
  "text.message.improve": { input_tokens: 450, output_tokens: 200, volume: 2, needs: ["chat", "copy"] },
  "text.message.variations": { input_tokens: 600, output_tokens: 500, volume: 3, needs: ["chat", "copy"] },
  "text.memory.update": { input_tokens: 1000, output_tokens: 300, volume: 3, needs: ["chat", "json"] },
  "text.response.classify": { input_tokens: 400, output_tokens: 80, volume: 5, needs: ["classify", "json"] },
  "text.prospect.match": { input_tokens: 800, output_tokens: 250, volume: 3, needs: ["chat", "json"] },
  "text.admin.orchestrator": { input_tokens: 2000, output_tokens: 600, volume: 2, needs: ["chat", "json", "reason_light"] },
  "text.admin.memory": { input_tokens: 1500, output_tokens: 400, volume: 2, needs: ["chat", "json"] },
  "text.admin.summary": { input_tokens: 3000, output_tokens: 500, volume: 1, needs: ["chat"] },
  "text.admin.product_draft": { input_tokens: 900, output_tokens: 450, volume: 1, needs: ["chat", "copy"] },
  "text.campaign.squad": { input_tokens: 1800, output_tokens: 700, volume: 2, needs: ["chat", "json"] },
  "text.automation.tasks": { input_tokens: 700, output_tokens: 300, volume: 3, needs: ["chat", "json"] },
  "text.skill.trainer": { input_tokens: 2500, output_tokens: 800, volume: 1, needs: ["chat", "json"] },
  "text.skill.templates": { input_tokens: 1000, output_tokens: 500, volume: 1, needs: ["chat"] },
  "text.lead.ideas": { input_tokens: 600, output_tokens: 350, volume: 2, needs: ["chat", "copy"] },
  "text.import.extract": { input_tokens: 1500, output_tokens: 600, volume: 2, needs: ["chat", "json"] },
  "text.followup.narrative": { input_tokens: 800, output_tokens: 300, volume: 3, needs: ["chat", "copy"] },
  "text.composition.director": { input_tokens: 1200, output_tokens: 500, volume: 2, needs: ["chat", "json"] },
  "text.affiliate.program_fill": { input_tokens: 900, output_tokens: 500, volume: 1, needs: ["chat", "json"] },
  "text.affiliate.product_learn": { input_tokens: 1100, output_tokens: 400, volume: 2, needs: ["chat", "json"] },
  "text.instagram.reply": { input_tokens: 700, output_tokens: 180, volume: 4, needs: ["chat", "copy"] },
  "text.instagram.caption": { input_tokens: 500, output_tokens: 200, volume: 3, needs: ["chat", "copy"] },
  "text.creative.copy": { input_tokens: 600, output_tokens: 220, volume: 3, needs: ["chat", "copy"] },
  "text.product.description": { input_tokens: 500, output_tokens: 280, volume: 2, needs: ["chat", "copy"] },
  "text.storefront.compose": { input_tokens: 900, output_tokens: 450, volume: 1, needs: ["chat", "json"] },
  "text.video.spec": { input_tokens: 1200, output_tokens: 700, volume: 1, needs: ["chat", "json"] },
  "text.landing.chat": { input_tokens: 800, output_tokens: 300, volume: 3, needs: ["chat"] },
  "text.skill.vision_ocr": { input_tokens: 1500, output_tokens: 400, volume: 1, needs: ["vision", "json"] },

  "image.product.studio": { images: 1, volume: 3, needs: ["product_studio"] },
  "image.creative.simple": { images: 1, volume: 3, needs: ["t2i"] },
  "image.creative.remix": { images: 1, volume: 2, needs: ["edit", "i2i"] },
  "image.admin.product": { images: 1, volume: 1, needs: ["product_studio"] },
  "image.vision.analyze": { input_tokens: 1200, output_tokens: 300, volume: 2, needs: ["vision"] },
  "image.import.extract": { input_tokens: 1500, output_tokens: 500, volume: 2, needs: ["vision", "json"] },

  "video.generate.veo": { video_seconds: 6, volume: 1, needs: ["t2v"] },
  "video.generate.atlas": { video_seconds: 6, volume: 1, needs: ["t2v", "i2v"] },
  "video.studio.remotion": { input_tokens: 1000, output_tokens: 600, volume: 1, needs: ["chat", "json"] },

  "audio.tts.default": { tts_chars: 400, volume: 2, needs: ["tts"] },
  "audio.tts.atlas": { tts_chars: 400, volume: 2, needs: ["tts"] },
}

const TIER_USD: Record<ModelTier, { in: number; out: number; img: number; sec: number }> = {
  cheap: { in: 0.15, out: 0.6, img: 0.03, sec: 0.04 },
  medium: { in: 0.5, out: 1.5, img: 0.06, sec: 0.08 },
  expensive: { in: 2.5, out: 10, img: 0.15, sec: 0.15 },
}

export function resolveUsageProfile(functionKey: string): UsageProfile {
  if (USAGE_BY_FUNCTION[functionKey]) return USAGE_BY_FUNCTION[functionKey]
  if (functionKey.startsWith("text.")) return { input_tokens: 700, output_tokens: 300, volume: 2, needs: ["chat"] }
  if (functionKey.startsWith("image.")) return { images: 1, volume: 2, needs: ["t2i"] }
  if (functionKey.startsWith("video.")) return { video_seconds: 6, volume: 1, needs: ["t2v"] }
  if (functionKey.startsWith("audio.")) return { tts_chars: 300, volume: 2, needs: ["tts"] }
  return { input_tokens: 500, output_tokens: 250, volume: 2 }
}

export function findModelDef(
  modality: string,
  provider: string,
  model: string,
): (AIModelDef & { provider: string }) | null {
  const mod = (modality === "vision" ? "text" : modality) as AICategory
  const list = (AI_MODELS as any)?.[mod]?.[provider] as AIModelDef[] | undefined
  if (!list) return null
  const hit = list.find((m) => m.id === model)
  return hit ? { ...hit, provider } : null
}

function parseCostLabel(def: AIModelDef | null): { in?: number; out?: number; img?: number; sec?: number } {
  if (!def?.cost_label) return {}
  const s = def.cost_label
  // "~$0.10 / $0.40 por 1M tok"
  const tok = s.match(/\$?\s*([0-9.]+)\s*\/\s*\$?\s*([0-9.]+)/)
  if (tok) return { in: Number(tok[1]), out: Number(tok[2]) }
  const img = s.match(/\$?\s*([0-9.]+)\s*(?:–|-|~)?\s*([0-9.]+)?\s*\/\s*img/i)
  if (img) return { img: Number(img[1]) }
  const sec = s.match(/\$?\s*([0-9.]+)\s*\/\s*s/i)
  if (sec) return { sec: Number(sec[1]) }
  return {}
}

export type CostEstimate = {
  function_key: string
  provider: string
  model: string
  modality: string
  usd_per_call: number
  usd_per_1k_calls: number
  usd_per_10k_calls: number
  breakdown: string
  volume_hint: string
  cost_label: string | null
  tier: ModelTier | null
  fit: {
    score: number
    grade: "excelente" | "bom" | "aceitável" | "fraco" | "inadequado"
    reasons: string[]
    can_deliver: boolean
  }
}

export function estimateAlgorithmCost(input: {
  function_key: string
  modality: string
  provider: string
  model: string
}): CostEstimate {
  const usage = resolveUsageProfile(input.function_key)
  const def = findModelDef(input.modality, input.provider, input.model)
  const tier = def?.tier || "medium"
  const fallback = TIER_USD[tier]
  const parsed = parseCostLabel(def)

  const inRate = def?.input_usd_per_mtok ?? parsed.in ?? fallback.in
  const outRate = def?.output_usd_per_mtok ?? parsed.out ?? fallback.out
  const imgRate = def?.usd_per_image ?? parsed.img ?? fallback.img
  const secRate = def?.usd_per_second ?? parsed.sec ?? fallback.sec

  let usd = 0
  const parts: string[] = []

  if (usage.input_tokens || usage.output_tokens) {
    const inTok = usage.input_tokens || 0
    const outTok = usage.output_tokens || 0
    const textCost = (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate
    usd += textCost
    parts.push(`texto ~${inTok}+${outTok} tok`)
  }
  if (usage.images) {
    const c = usage.images * imgRate
    usd += c
    parts.push(`${usage.images} img`)
  }
  if (usage.video_seconds) {
    const c = usage.video_seconds * secRate
    usd += c
    parts.push(`${usage.video_seconds}s vídeo`)
  }
  if (usage.tts_chars) {
    // rough: ~$0.015 / 1k chars for medium TTS
    const c = (usage.tts_chars / 1000) * (tier === "cheap" ? 0.01 : tier === "expensive" ? 0.04 : 0.015)
    usd += c
    parts.push(`${usage.tts_chars} chars TTS`)
  }

  const fit = scoreModelFit({
    function_key: input.function_key,
    modality: input.modality,
    provider: input.provider,
    model: input.model,
    def,
    usage,
    usd_per_call: usd,
  })

  const vol = usage.volume || 2
  const volumeHint =
    vol >= 4
      ? "Alto volume no app — priorize barato e estável"
      : vol <= 1
        ? "Baixo volume — pode pagar um pouco mais por qualidade"
        : "Volume médio — equilíbrio custo/qualidade"

  return {
    function_key: input.function_key,
    provider: input.provider,
    model: input.model,
    modality: input.modality,
    usd_per_call: Number(usd.toFixed(6)),
    usd_per_1k_calls: Number((usd * 1000).toFixed(4)),
    usd_per_10k_calls: Number((usd * 10000).toFixed(3)),
    breakdown: parts.join(" · ") || "estimativa por tier",
    volume_hint: volumeHint,
    cost_label: def?.cost_label || null,
    tier: def?.tier || null,
    fit,
  }
}

function scoreModelFit(input: {
  function_key: string
  modality: string
  provider: string
  model: string
  def: (AIModelDef & { provider: string }) | null
  usage: UsageProfile
  usd_per_call: number
}): CostEstimate["fit"] {
  const reasons: string[] = []
  let score = 70

  if (input.provider === "atlas") {
    score += 8
    reasons.push("Atlas unifica chave e fatura")
  } else {
    score -= 5
    reasons.push("Provider nativo — chave e faturamento separados")
  }

  const needs = input.usage.needs || []
  const fns = input.def?.functions || []
  if (needs.length && fns.length) {
    const hit = needs.filter((n) => fns.includes(n)).length
    const ratio = hit / needs.length
    if (ratio >= 1) {
      score += 15
      reasons.push("Cobre as capacidades da função")
    } else if (ratio >= 0.5) {
      score += 5
      reasons.push("Cobre parcialmente as capacidades")
    } else {
      score -= 20
      reasons.push("Pode faltar capacidade (JSON/vision/refs)")
    }
  }

  if (needs.includes("product_studio") || needs.includes("edit") || needs.includes("i2i")) {
    if (input.def?.supports_references) {
      score += 12
      reasons.push("Aceita referência de produto/logo")
    } else {
      score -= 25
      reasons.push("Sem multi-ref — fraco para estúdio de marca")
    }
  }

  const vol = input.usage.volume || 2
  if (vol >= 4 && input.def?.tier === "expensive") {
    score -= 18
    reasons.push("Flagship caro demais para volume alto")
  }
  if (vol >= 4 && input.def?.tier === "cheap") {
    score += 10
    reasons.push("Tier barato adequado a volume")
  }
  if (vol <= 1 && input.def?.tier === "expensive") {
    score += 5
    reasons.push("Custo alto aceitável em baixo volume")
  }

  // hard barriers
  if (input.function_key.includes("vision") && fns.length && !fns.includes("vision") && input.modality === "text") {
    score -= 15
    reasons.push("Função vision — prefira modelo com vision")
  }

  score = Math.max(0, Math.min(100, score))
  const grade: CostEstimate["fit"]["grade"] =
    score >= 85 ? "excelente" : score >= 70 ? "bom" : score >= 55 ? "aceitável" : score >= 40 ? "fraco" : "inadequado"

  if (score >= 55) {
    reasons.unshift("Adequado para entregar a solução no app")
  } else {
    reasons.unshift("Risco de não atender bem o caso de uso")
  }

  return {
    score,
    grade,
    reasons: reasons.slice(0, 5),
    can_deliver: score >= 55,
  }
}

/** Melhor default Atlas por modalidade + necessidades da função */
export function pickBestAtlasModel(functionKey: string, modality: string): { provider: "atlas"; model: string } {
  const usage = resolveUsageProfile(functionKey)
  const mod = (modality === "vision" ? "text" : modality) as AICategory
  const list = (AI_MODELS as any)?.[mod]?.atlas as AIModelDef[] | undefined
  if (!list?.length) {
    if (mod === "image") return { provider: "atlas", model: "google/gemini-3.1-flash-image" }
    if (mod === "video") return { provider: "atlas", model: "kling-v2.0" }
    if (mod === "audio") return { provider: "atlas", model: "minimax/speech-02-turbo" }
    return { provider: "atlas", model: "google/gemini-2.5-flash-lite" }
  }

  let best = list[0]
  let bestScore = -1
  for (const m of list) {
    const est = estimateAlgorithmCost({
      function_key: functionKey,
      modality: mod,
      provider: "atlas",
      model: m.id,
    })
    // prefer can_deliver + higher score - slight penalty on expensive high volume
    let s = est.fit.score
    if (!est.fit.can_deliver) s -= 30
    if ((usage.volume || 2) >= 4 && m.tier === "expensive") s -= 10
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  return { provider: "atlas", model: best.id }
}
