import { Router, type Request, type Response } from "express"
import { buildOpenAIPayload, type ChatMessage } from "../services/landingAgent"
import { masterService } from "../services/master"
import { integrationService } from "../services/integrations"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { logger } from "../utils/logger"

const router = Router()

/* ────────────────────────────────────────────────────────────
   Rate limiter — in-memory, per IP, sliding window of 60s.
   ──────────────────────────────────────────────────────────── */

interface Bucket { ts: number[]; }
const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 12

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const b = buckets.get(ip) || { ts: [] }
  b.ts = b.ts.filter(t => now - t < WINDOW_MS)
  if (b.ts.length >= MAX_PER_WINDOW) return true
  b.ts.push(now)
  buckets.set(ip, b)
  return false
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of buckets) {
    b.ts = b.ts.filter(t => now - t < WINDOW_MS)
    if (b.ts.length === 0) buckets.delete(ip)
  }
}, 5 * 60_000).unref()

/* ────────────────────────────────────────────────────────────
   Provider resolution — cascata em 3 camadas:
   1. master_settings.openai_landing_chat_key (config explicita pra landing)
   2. process.env.LANDING_AI_OPENAI_KEY / OPENAI_API_KEY
   3. Fallback automatico: primeira integration ATIVA de openai/grok/gemini
      (qualquer account) — funciona como "system provider" pra endpoint publico
   ──────────────────────────────────────────────────────────── */

type ResolvedProvider =
  | { kind: "openai-compat"; key: string; model: string; baseUrl: string; providerName: "openai" | "grok" }
  | { kind: "gemini"; key: string; model: string }

async function resolveProvider(): Promise<ResolvedProvider | null> {
  /* Camada 1: master_settings (configurado via UI Master Integracoes) */
  const masterKey = await masterService.getSetting<string>("openai_landing_chat_key").catch(() => null)
  if (masterKey) {
    const model =
      (await masterService.getSetting<string>("openai_landing_chat_model").catch(() => null)) ||
      process.env.LANDING_AI_MODEL ||
      "gpt-4o-mini"
    return {
      kind: "openai-compat",
      key: masterKey,
      model,
      baseUrl: "https://api.openai.com/v1/chat/completions",
      providerName: "openai",
    }
  }

  /* Camada 2: env vars */
  const envKey = process.env.LANDING_AI_OPENAI_KEY || process.env.OPENAI_API_KEY
  if (envKey) {
    return {
      kind: "openai-compat",
      key: envKey,
      model: process.env.LANDING_AI_MODEL || "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      providerName: "openai",
    }
  }

  /* Camada 3: qualquer integration ativa.
     Ordem: gemini > grok > openai (gemini tem free tier amplo, openai costuma quota exausta).
     Cada chave eh testada na requisicao - se uma falhar com quota, frontend mostra erro. */
  const any = await integrationService
    .findAnyActiveProvider(["gemini", "grok", "openai"])
    .catch(() => null)
  if (!any || !any.key) return null

  if (any.provider === "openai") {
    return {
      kind: "openai-compat",
      key: any.key,
      model: String(any.config?.model || "gpt-4o-mini"),
      baseUrl: "https://api.openai.com/v1/chat/completions",
      providerName: "openai",
    }
  }
  if (any.provider === "grok") {
    return {
      kind: "openai-compat",
      key: any.key,
      model: String(any.config?.model || "grok-3-mini"),
      baseUrl: "https://api.x.ai/v1/chat/completions",
      providerName: "grok",
    }
  }
  if (any.provider === "gemini") {
    return {
      kind: "gemini",
      key: any.key,
      model: String(any.config?.model || "gemini-2.5-flash"),
    }
  }
  return null
}

/* ────────────────────────────────────────────────────────────
   POST /api/landing/chat — streamed (SSE) chat completion
   ──────────────────────────────────────────────────────────── */

router.post("/chat", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown"

  if (rateLimited(ip)) {
    return res.status(429).json({
      error: "rate_limited",
      message: "Muitas mensagens em pouco tempo. Aguarde um instante.",
    })
  }

  const messages: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : []

  if (messages.length === 0) {
    return res.status(400).json({ error: "no_messages" })
  }
  if (messages.length > 30) {
    messages.splice(0, messages.length - 30)
  }
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") {
      return res.status(400).json({ error: "bad_role" })
    }
    if (typeof m.content !== "string" || m.content.length > 2000) {
      return res.status(400).json({ error: "bad_content" })
    }
  }

  const provider = await resolveProvider()
  if (!provider) {
    logger.warn("landing chat: nenhum provider de IA configurado (master_settings/env/integrations)")
    return res.status(503).json({
      error: "ai_not_configured",
      message: "Assistente temporariamente indisponível. Tente o trial direto em /login.",
    })
  }

  /* SSE setup */
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders?.()

  let clientDisconnected = false
  req.on("close", () => { clientDisconnected = true })

  try {
    if (provider.kind === "openai-compat") {
      await streamOpenAICompat(provider, messages, res, () => clientDisconnected)
    } else {
      await streamGemini(provider, messages, res, () => clientDisconnected)
    }
    res.write("data: [DONE]\n\n")
    return res.end()
  } catch (err: any) {
    logger.error({ err: err?.message, provider: provider.kind }, "landing chat fatal error")
    if (!res.headersSent) {
      return res.status(500).json({ error: "internal" })
    }
    try {
      res.write(`data: ${JSON.stringify({ error: true, message: "Erro inesperado. Tente novamente." })}\n\n`)
      res.write("data: [DONE]\n\n")
    } catch { /* connection already closed */ }
    return res.end()
  }
})

/* ────────────────────────────────────────────────────────────
   Streaming handler: OpenAI-compat (OpenAI + Grok)
   ──────────────────────────────────────────────────────────── */

async function streamOpenAICompat(
  provider: Extract<ResolvedProvider, { kind: "openai-compat" }>,
  messages: ChatMessage[],
  res: Response,
  isDisconnected: () => boolean,
): Promise<void> {
  const payload = buildOpenAIPayload(messages, provider.model)

  const upstream = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify(payload),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "")
    logger.error(
      { status: upstream.status, provider: provider.providerName, errText: errText.slice(0, 300) },
      "landing chat upstream error",
    )
    res.write(`data: ${JSON.stringify({ error: true, message: "Falha ao conversar com a IA. Tente de novo em alguns segundos." })}\n\n`)
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    if (isDisconnected()) {
      try { await reader.cancel() } catch { /* */ }
      break
    }
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const payloadStr = trimmed.slice(5).trim()
      if (payloadStr === "[DONE]") return
      try {
        const json = JSON.parse(payloadStr)
        const token = json?.choices?.[0]?.delta?.content
        if (typeof token === "string" && token.length > 0) {
          res.write(`data: ${JSON.stringify({ token })}\n\n`)
        }
      } catch { /* skip non-JSON lines (keep-alive) */ }
    }
  }
}

/* ────────────────────────────────────────────────────────────
   Streaming handler: Gemini (chunkado em palavras pra simular streaming
   no formato SSE compativel com o frontend)
   ──────────────────────────────────────────────────────────── */

async function streamGemini(
  provider: Extract<ResolvedProvider, { kind: "gemini" }>,
  messages: ChatMessage[],
  res: Response,
  isDisconnected: () => boolean,
): Promise<void> {
  const payload = buildOpenAIPayload(messages, provider.model)
  /* Concatena historico + system message em um unico prompt pro Gemini */
  const promptParts: string[] = []
  for (const m of payload.messages) {
    const roleLabel = m.role === "system" ? "[INSTRUCAO]" : m.role === "user" ? "USUARIO" : "ASSISTENTE"
    promptParts.push(`${roleLabel}: ${m.content}`)
  }
  promptParts.push("ASSISTENTE:")
  const fullPrompt = promptParts.join("\n\n")

  /* Instancia direta do client - usamos a chave que ja resolvemos (qualquer integration ativa).
     GeminiService padrao busca via integrationService.getProvider("gemini") com scope vazio,
     que so encontra integration global - aqui aceitamos QUALQUER chave gemini ativa. */
  let fullText = ""
  try {
    const genAI = new GoogleGenerativeAI(provider.key)
    const model = genAI.getGenerativeModel({
      model: provider.model,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    })
    const result = await model.generateContent(fullPrompt)
    fullText = String(result.response.text() || "").trim()
  } catch (err: any) {
    logger.error({ err: err?.message }, "landing chat: gemini call failed")
    res.write(`data: ${JSON.stringify({ error: true, message: "Falha ao conversar com a IA. Tente de novo em alguns segundos." })}\n\n`)
    return
  }

  /* Chunk em palavras com pequeno delay pra dar UX de streaming */
  const tokens = fullText.split(/(\s+)/)
  for (const tok of tokens) {
    if (isDisconnected()) break
    if (!tok) continue
    res.write(`data: ${JSON.stringify({ token: tok })}\n\n`)
    /* Pequeno delay (~10ms) entre chunks pra simular tipagem */
    await new Promise<void>((r) => setTimeout(r, 10))
  }
}

export default router
