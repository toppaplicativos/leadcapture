/**
 * Atlas Cloud provider — unified gateway for text, image, video and audio.
 * Docs: https://atlascloud.ai/docs/en/
 *
 * Endpoints:
 *  - LLM (OpenAI-compatible): POST https://api.atlascloud.ai/v1/chat/completions
 *  - Image: POST https://api.atlascloud.ai/api/v1/model/generateImage
 *  - Video: POST https://api.atlascloud.ai/api/v1/model/generateVideo
 *  - Async result: GET  https://api.atlascloud.ai/api/v1/model/prediction/{id}
 *  - Models: GET https://api.atlascloud.ai/v1/models
 */

import type { TextGenerationResult } from "./openai-provider";

export const ATLAS_DEFAULT_BASE_URL = "https://api.atlascloud.ai";

export type AtlasAsyncStatus = "pending" | "processing" | "completed" | "failed" | "unknown";

export type AtlasPredictionResult = {
  id: string;
  status: AtlasAsyncStatus;
  /** Public URL(s) when ready */
  urls: string[];
  raw: any;
  error?: string;
};

function baseUrl(): string {
  return String(process.env.ATLAS_BASE_URL || ATLAS_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeStatus(raw: any): AtlasAsyncStatus {
  const s = String(raw?.status || raw?.state || raw?.data?.status || "").toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(s)) return "completed";
  if (["failed", "error", "canceled", "cancelled"].includes(s)) return "failed";
  if (["processing", "running", "in_progress"].includes(s)) return "processing";
  if (["pending", "queued", "created", "starting"].includes(s)) return "pending";
  if (raw?.outputs || raw?.output || raw?.data?.outputs || raw?.data?.output || raw?.url || raw?.urls) {
    return "completed";
  }
  return "unknown";
}

function extractUrls(payload: any): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) urls.push(v);
  };

  const walk = (node: any, depth = 0) => {
    if (!node || depth > 6) return;
    if (typeof node === "string") {
      push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const key of ["url", "image_url", "video_url", "audio_url", "file_url", "uri", "src"]) {
        if (node[key] != null) push(node[key]);
      }
      for (const key of ["outputs", "output", "results", "data", "images", "videos", "files", "urls"]) {
        if (node[key] != null) walk(node[key], depth + 1);
      }
    }
  };

  walk(payload);
  return Array.from(new Set(urls));
}

function extractPredictionId(payload: any): string | null {
  const id =
    payload?.id ||
    payload?.prediction_id ||
    payload?.data?.id ||
    payload?.data?.prediction_id ||
    payload?.task_id ||
    payload?.data?.task_id;
  return id != null ? String(id) : null;
}

export type AtlasLiveModel = {
  id: string;
  label: string;
  category: "text" | "image" | "video" | "audio" | "other";
  tier?: "cheap" | "medium" | "expensive";
  cost_label?: string;
  functions?: string[];
  supports_references?: boolean;
  raw?: any;
};

export class AtlasProvider {
  private apiKey: string;
  private defaultModel: string;
  private root: string;

  constructor(apiKey: string, defaultModel = "google/gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.root = baseUrl();
  }

  /**
   * Lista modelos expostos pela conta (OpenAI-compatible + heurística de modalidade).
   * Amplia o catálogo estático do app quando a chave Atlas está configurada.
   */
  async listModels(): Promise<AtlasLiveModel[]> {
    const response = await fetch(`${this.root}/v1/models`, {
      method: "GET",
      headers: authHeaders(this.apiKey),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Atlas models API ${response.status}: ${(err as any)?.error?.message || response.statusText}`,
      );
    }
    const data = (await response.json()) as any;
    const rows: any[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data)
          ? data
          : [];

    const out: AtlasLiveModel[] = [];
    for (const r of rows) {
      const id = String(r?.id || r?.model || r?.name || "").trim();
      if (!id) continue;
      const lower = id.toLowerCase();
      let category: AtlasLiveModel["category"] = "text";
      if (
        /image|flux|seedream|imagen|ideogram|banana|dall|gpt-image|nano-banana/.test(lower)
      ) {
        category = "image";
      } else if (/video|kling|seedance|wan|veo|luma|vidu|minimax\/video|hailuo|ray-/.test(lower)) {
        category = "video";
      } else if (/tts|speech|eleven|suno|audio|voice|chirp/.test(lower)) {
        category = "audio";
      }

      const functions =
        category === "image"
          ? ["t2i", "product_studio"]
          : category === "video"
            ? ["t2v", "i2v"]
            : category === "audio"
              ? ["tts"]
              : ["chat", "json", "copy"];

      out.push({
        id,
        label: `Atlas · ${r?.owned_by ? `${r.owned_by}/` : ""}${id.split("/").pop()}`,
        category,
        tier: "medium",
        cost_label: "via Atlas (live)",
        functions,
        supports_references: category === "image",
        raw: r,
      });
    }
    return out;
  }

  // ── Text (OpenAI-compatible chat completions) ──────────────────────────

  async generateText(
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): Promise<TextGenerationResult> {
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.7;

    const response = await fetch(`${this.root}/v1/chat/completions`, {
      method: "POST",
      headers: authHeaders(this.apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: options?.maxTokens || 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Atlas Cloud API error ${response.status}: ${(err as any)?.error?.message || (err as any)?.msg || response.statusText}`,
      );
    }

    const data = (await response.json()) as any;
    return {
      text: data.choices?.[0]?.message?.content || "",
      model,
      provider: "atlas",
      tokens_used: data.usage?.total_tokens,
    };
  }

  async generateJson<T>(
    prompt: string,
    options?: { model?: string; temperature?: number },
  ): Promise<T> {
    const result = await this.generateText(`${prompt}\n\nReturn ONLY valid JSON, no markdown.`, {
      ...options,
      temperature: options?.temperature ?? 0.3,
    });
    try {
      const cleaned = result.text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`Failed to parse Atlas Cloud JSON response: ${result.text.slice(0, 200)}`);
    }
  }

  // ── Image ─────────────────────────────────────────────────────────────

  /**
   * Submit text-to-image (or image model) job.
   * Many Atlas image models are async — poll with getPrediction(id).
   */
  async generateImage(
    prompt: string,
    options?: {
      model?: string;
      /** Extra model-specific fields (size, aspect_ratio, seed, …) */
      params?: Record<string, unknown>;
    },
  ): Promise<{ predictionId: string | null; urls: string[]; model: string; raw: any }> {
    const model = options?.model || "seedream-3.0";
    const body = {
      model,
      prompt,
      ...(options?.params || {}),
    };

    const response = await fetch(`${this.root}/api/v1/model/generateImage`, {
      method: "POST",
      headers: authHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Atlas Image API error ${response.status}: ${(err as any)?.error?.message || (err as any)?.msg || response.statusText}`,
      );
    }

    const raw = await response.json();
    const predictionId = extractPredictionId(raw);
    const urls = extractUrls(raw);
    return { predictionId, urls, model, raw };
  }

  /**
   * Blocking helper: submit image job and poll until ready or timeout.
   * Returns first image URL (caller downloads/stores as needed).
   */
  async generateImageAndWait(
    prompt: string,
    options?: {
      model?: string;
      params?: Record<string, unknown>;
      pollIntervalMs?: number;
      timeoutMs?: number;
    },
  ): Promise<{ url: string; model: string; predictionId: string | null }> {
    const submitted = await this.generateImage(prompt, options);
    if (submitted.urls[0]) {
      return { url: submitted.urls[0], model: submitted.model, predictionId: submitted.predictionId };
    }
    if (!submitted.predictionId) {
      throw new Error("Atlas Image API returned neither URL nor prediction id");
    }

    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const pred = await this.getPrediction(submitted.predictionId);
      if (pred.status === "failed") {
        throw new Error(pred.error || "Atlas image generation failed");
      }
      if (pred.status === "completed" && pred.urls[0]) {
        return { url: pred.urls[0], model: submitted.model, predictionId: submitted.predictionId };
      }
    }

    throw new Error(`Atlas image generation timed out after ${timeoutMs}ms (id=${submitted.predictionId})`);
  }

  // ── Video ─────────────────────────────────────────────────────────────

  async generateVideo(
    prompt: string,
    options?: {
      model?: string;
      /** Image URL for image-to-video models */
      imageUrl?: string;
      params?: Record<string, unknown>;
    },
  ): Promise<{ predictionId: string | null; urls: string[]; model: string; raw: any }> {
    const model = options?.model || "kling-v2.0";
    const body: Record<string, unknown> = {
      model,
      prompt,
      ...(options?.params || {}),
    };
    if (options?.imageUrl) body.image = options.imageUrl;

    const response = await fetch(`${this.root}/api/v1/model/generateVideo`, {
      method: "POST",
      headers: authHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Atlas Video API error ${response.status}: ${(err as any)?.error?.message || (err as any)?.msg || response.statusText}`,
      );
    }

    const raw = await response.json();
    return {
      predictionId: extractPredictionId(raw),
      urls: extractUrls(raw),
      model,
      raw,
    };
  }

  // ── Audio (structural — TTS / media via same generate surface when model supports it) ─

  /**
   * Text-to-audio / TTS via Atlas model generate surface.
   * Model IDs vary; configure via Master · Algoritmos (`audio.tts`).
   * Structural: uses prediction pattern when async.
   */
  async generateAudio(
    prompt: string,
    options?: {
      model?: string;
      params?: Record<string, unknown>;
    },
  ): Promise<{ predictionId: string | null; urls: string[]; model: string; raw: any }> {
    const model = options?.model || "minimax/speech-02-hd";
    /* Atlas exposes audio models under model generate APIs; path may evolve.
     * Prefer dedicated endpoint if present, else generateImage-style model call. */
    const candidates = [
      `${this.root}/api/v1/model/generateAudio`,
      `${this.root}/api/v1/model/generate`,
    ];

    let lastErr: Error | null = null;
    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: authHeaders(this.apiKey),
          body: JSON.stringify({
            model,
            prompt,
            text: prompt,
            ...(options?.params || {}),
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          lastErr = new Error(
            `Atlas Audio API error ${response.status}: ${(err as any)?.error?.message || (err as any)?.msg || response.statusText}`,
          );
          continue;
        }
        const raw = await response.json();
        return {
          predictionId: extractPredictionId(raw),
          urls: extractUrls(raw),
          model,
          raw,
        };
      } catch (e: any) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }

    throw lastErr || new Error("Atlas Audio generation not available");
  }

  // ── Async polling ─────────────────────────────────────────────────────

  async getPrediction(predictionId: string): Promise<AtlasPredictionResult> {
    const response = await fetch(
      `${this.root}/api/v1/model/prediction/${encodeURIComponent(predictionId)}`,
      {
        method: "GET",
        headers: authHeaders(this.apiKey),
      },
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Atlas prediction API error ${response.status}: ${(err as any)?.error?.message || (err as any)?.msg || response.statusText}`,
      );
    }

    const raw = (await response.json()) as any;
    const status = normalizeStatus(raw);
    const urls = extractUrls(raw);
    const errorMsg =
      status === "failed"
        ? String(raw?.error || raw?.message || raw?.data?.error || "prediction failed")
        : undefined;

    return {
      id: String(predictionId),
      status,
      urls,
      raw,
      error: errorMsg,
    };
  }

  // ── Health ────────────────────────────────────────────────────────────

  static async testConnection(
    apiKey: string,
  ): Promise<{ ok: boolean; message: string; latency_ms: number }> {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl()}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latency_ms = Date.now() - start;
      if (res.ok) {
        return { ok: true, message: "Atlas Cloud conectado com sucesso", latency_ms };
      }
      const body = (await res.json().catch(() => ({}))) as any;
      return {
        ok: false,
        message: body?.error?.message || body?.msg || `HTTP ${res.status}`,
        latency_ms,
      };
    } catch (e: any) {
      return { ok: false, message: e.message, latency_ms: Date.now() - start };
    }
  }
}
