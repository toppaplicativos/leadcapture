import { Router, type Request, type Response } from "express"
import { buildOpenAIPayload, type ChatMessage } from "../services/landingAgent"
import { masterService } from "../services/master"
import { logger } from "../utils/logger"

const router = Router()

/* ────────────────────────────────────────────────────────────
   Rate limiter — in-memory, per IP, sliding window of 60s.
   Public endpoint, so we cap aggressive usage. Resets per process.
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

// Periodic cleanup (every 5 min, drop empty buckets)
setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of buckets) {
    b.ts = b.ts.filter(t => now - t < WINDOW_MS)
    if (b.ts.length === 0) buckets.delete(ip)
  }
}, 5 * 60_000).unref()

/* ────────────────────────────────────────────────────────────
   POST /api/landing/chat — streamed (SSE) chat completion
   Body: { messages: [{ role: 'user'|'assistant', content: string }] }
   Stream: Server-Sent Events, each "data: {token}" line is text fragment,
           final event is "data: [DONE]".
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

  // Validation
  if (messages.length === 0) {
    return res.status(400).json({ error: "no_messages" })
  }
  if (messages.length > 30) {
    // Cap conversation length to prevent token bombs
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

  // Priority: master_settings (DB, set via /master/integracoes UI) → env var fallback
  const apiKey =
    (await masterService.getSetting<string>("openai_landing_chat_key").catch(() => null)) ||
    process.env.LANDING_AI_OPENAI_KEY ||
    process.env.OPENAI_API_KEY
  if (!apiKey) {
    logger.warn("openai_landing_chat_key not configured — landing chat unavailable")
    return res.status(503).json({
      error: "ai_not_configured",
      message: "Assistente temporariamente indisponível. Tente o trial direto em /login.",
    })
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders?.()

  const model =
    (await masterService.getSetting<string>("openai_landing_chat_model").catch(() => null)) ||
    process.env.LANDING_AI_MODEL ||
    "gpt-4o-mini"
  const payload = buildOpenAIPayload(messages, model)

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "")
      logger.error({ status: upstream.status, errText: errText.slice(0, 300) }, "landing chat upstream error")
      res.write(`data: ${JSON.stringify({ error: true, message: "Falha ao conversar com a IA. Tente de novo em alguns segundos." })}\n\n`)
      res.write("data: [DONE]\n\n")
      return res.end()
    }

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    let clientDisconnected = false
    req.on("close", () => { clientDisconnected = true })

    while (true) {
      if (clientDisconnected) {
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
        if (payloadStr === "[DONE]") {
          res.write("data: [DONE]\n\n")
          return res.end()
        }
        try {
          const json = JSON.parse(payloadStr)
          const token = json?.choices?.[0]?.delta?.content
          if (typeof token === "string" && token.length > 0) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`)
          }
        } catch {
          // Skip non-JSON lines (OpenAI sometimes sends keep-alive)
        }
      }
    }

    res.write("data: [DONE]\n\n")
    return res.end()
  } catch (err: any) {
    logger.error({ err: err?.message }, "landing chat fatal error")
    if (!res.headersSent) {
      return res.status(500).json({ error: "internal" })
    }
    res.write(`data: ${JSON.stringify({ error: true, message: "Erro inesperado. Tente novamente." })}\n\n`)
    res.write("data: [DONE]\n\n")
    return res.end()
  }
})

export default router
