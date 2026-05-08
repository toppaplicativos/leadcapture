import { logger } from "../../utils/logger";

export interface TextGenerationResult {
  text: string;
  model: string;
  provider: string;
  tokens_used?: number;
}

export class OpenAIProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "gpt-4.1-mini") {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generateText(prompt: string, options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<TextGenerationResult> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.7;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      throw new Error(`OpenAI API error ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as any;
    return {
      text: data.choices?.[0]?.message?.content || "",
      model,
      provider: "openai",
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
      throw new Error(`Failed to parse OpenAI JSON response: ${result.text.slice(0, 200)}`);
    }
  }

  /**
   * Generate an image with `gpt-image-1` (or any image model the user
   * picks in Provedores IA → Image preferences). When references are
   * passed, uses /v1/images/edits which accepts up to 16 input images —
   * lets us pass product photo + brand logo as visual references so the
   * model paints them faithfully.
   */
  async generateImage(prompt: string, options: {
    model?: string;
    references?: Array<{ name: string; buffer: Buffer; mimeType?: string }>;
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    quality?: "low" | "medium" | "high" | "auto";
  } = {}): Promise<{ base64: string; model: string; revisedPrompt?: string }> {
    const model = options.model || "gpt-image-1";
    const size = options.size || "1024x1024";
    const quality = options.quality || "high";
    const refs = options.references || [];

    let response: Response;
    if (refs.length > 0) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      form.append("n", "1");
      for (const r of refs.slice(0, 16)) {
        const blob = new Blob([new Uint8Array(r.buffer)], { type: r.mimeType || "image/png" });
        form.append("image[]", blob, r.name);
      }
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form as any,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Image API error ${response.status}: ${(err as any)?.error?.message || response.statusText}`);
    }

    const data = (await response.json()) as any;
    const first = data.data?.[0];
    const b64 = first?.b64_json;
    if (!b64) throw new Error(`OpenAI Image API returned no image data`);
    return { base64: b64, model, revisedPrompt: first?.revised_prompt };
  }

  static async testConnection(apiKey: string): Promise<{ ok: boolean; message: string; latency_ms: number }> {
    const start = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latency_ms = Date.now() - start;
      if (res.ok) return { ok: true, message: "OpenAI conectado com sucesso", latency_ms };
      const body = (await res.json().catch(() => ({}))) as any;
      return { ok: false, message: body?.error?.message || `HTTP ${res.status}`, latency_ms };
    } catch (e: any) {
      return { ok: false, message: e.message, latency_ms: Date.now() - start };
    }
  }
}
