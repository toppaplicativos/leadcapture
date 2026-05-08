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

  /**
   * Generate an image via xAI's image API. Grok Imagine excels at rendering
   * legible typography directly inside the image (no SVG overlay needed).
   *
   * Note: xAI's image API is text-to-image only — it does NOT accept a
   * reference image like Gemini's vision model. Caller must put product
   * details (packaging color, shape, text on label) in the prompt itself.
   *
   * Returns a base64 PNG string ready to write to disk.
   */
  async generateImage(prompt: string, options?: {
    model?: string;
    n?: number;
    /** Aspect ratio hint — xAI Imagine returns 1024×768 by default and we
     *  post-crop to the exact target downstream. */
    aspectRatio?: "1:1" | "9:16" | "4:5" | "16:9";
  }): Promise<{ base64: string; model: string; revisedPrompt?: string }> {
    /* Available xAI image models (verified against /v1/models on a live
     * key): grok-imagine-image, grok-imagine-image-pro,
     * grok-imagine-image-quality. Default to "pro" for ad-grade output. */
    const model = options?.model || "grok-imagine-image-pro";
    const aspectHint = options?.aspectRatio
      ? `\n\nFINAL OUTPUT FORMAT: ${options.aspectRatio} aspect ratio.`
      : "";

    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: prompt + aspectHint,
        n: Math.max(1, Math.min(4, options?.n || 1)),
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Grok Image API error ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as any;
    const first = data.data?.[0];
    const b64 = first?.b64_json;
    if (!b64) {
      throw new Error(`Grok Image API returned no image data`);
    }
    return {
      base64: b64,
      model,
      revisedPrompt: first?.revised_prompt,
    };
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
