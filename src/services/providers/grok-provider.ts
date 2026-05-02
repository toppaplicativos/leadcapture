import { logger } from "../../utils/logger";
import type { TextGenerationResult } from "./openai-provider";

export class GrokProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "grok-3-mini-beta") {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generateText(prompt: string, options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<TextGenerationResult> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.7;

    // xAI API is OpenAI-compatible
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: options?.maxTokens || 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Grok API error ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as any;
    return {
      text: data.choices?.[0]?.message?.content || "",
      model,
      provider: "grok",
      tokens_used: data.usage?.total_tokens,
    };
  }

  async generateJson<T>(prompt: string, options?: { model?: string; temperature?: number }): Promise<T> {
    const result = await this.generateText(
      `${prompt}\n\nReturn ONLY valid JSON, no markdown.`,
      { ...options, temperature: options?.temperature ?? 0.3 }
    );
    try {
      const cleaned = result.text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`Failed to parse Grok JSON response: ${result.text.slice(0, 200)}`);
    }
  }

  static async testConnection(apiKey: string): Promise<{ ok: boolean; message: string; latency_ms: number }> {
    const start = Date.now();
    try {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latency_ms = Date.now() - start;
      if (res.ok) return { ok: true, message: "Grok/xAI conectado com sucesso", latency_ms };
      const body = (await res.json().catch(() => ({}))) as any;
      return { ok: false, message: body?.error?.message || `HTTP ${res.status}`, latency_ms };
    } catch (e: any) {
      return { ok: false, message: e.message, latency_ms: Date.now() - start };
    }
  }
}
