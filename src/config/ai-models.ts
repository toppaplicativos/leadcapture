/**
 * Catálogo canônico de modelos de IA (Master · Algoritmos + compositor de criativos).
 *
 * Estratégia 2026-07:
 * - Texto/chat: modelos BARATOS (a inteligência do produto está no prompt/treino;
 *   raciocínio frontier raramente vale o custo).
 * - Imagem (estúdio de criativos): preferir modelos com REFERÊNCIA (produto + logo)
 *   para consistência de marca. Default Gemini 3.1 Flash Image.
 * - Atlas Cloud concentra APIs (texto/imagem/vídeo/áudio) numa única chave;
 *   providers nativos (openai/gemini/grok) permanecem disponíveis.
 *
 * Preços Atlas LLM: /v1/models (USD por token). Imagem: docs atlascloud.ai/pricing.
 */

export type ModelTier = "cheap" | "medium" | "expensive";
export type AICategory = "text" | "image" | "video" | "audio";
export type AIProviderKey = "openai" | "gemini" | "grok" | "veo" | "kling" | "atlas";

export interface AIModelDef {
  id: string;
  label: string;
  tier: ModelTier;
  description?: string;
  /** Custo aproximado legível (USD) — auditoria / UI */
  cost_label?: string;
  input_usd_per_mtok?: number;
  output_usd_per_mtok?: number;
  usd_per_image?: number;
  usd_per_second?: number;
  /** Função principal (ex: "chat_json", "product_studio") */
  functions?: string[];
  /** Aceita imagens de referência (produto/logo) — crítico no estúdio */
  supports_references?: boolean;
  /** Recomendado para o seletor do compositor de criativos da org */
  studio_selectable?: boolean;
}

// ── Catálogo ──────────────────────────────────────────────────────────────

export const AI_MODELS: Record<AICategory, Record<string, AIModelDef[]>> = {
  text: {
    /** Provider unificado — preferido para chat/copy barato */
    atlas: [
      {
        id: "google/gemini-2.5-flash-lite",
        label: "Atlas · Gemini 2.5 Flash Lite",
        tier: "cheap",
        cost_label: "~$0.10 / $0.40 por 1M tok",
        description: "Default recomendado para chat/copy — rápido, barato, JSON ok",
        functions: ["chat", "copy", "json", "classify"],
      },
      {
        id: "deepseek-ai/deepseek-v4-flash",
        label: "Atlas · DeepSeek V4 Flash",
        tier: "cheap",
        cost_label: "~$0.14 / $0.28 por 1M tok",
        description: "Excelente custo/benefício; forte em follow instruções",
        functions: ["chat", "copy", "json"],
      },
      {
        id: "openai/gpt-5-nano",
        label: "Atlas · GPT-5 Nano",
        tier: "cheap",
        cost_label: "~$0.05 / $0.40 por 1M tok",
        description: "Ultra barato OpenAI via Atlas",
        functions: ["chat", "copy"],
      },
      {
        id: "openai/gpt-4.1-nano",
        label: "Atlas · GPT-4.1 Nano",
        tier: "cheap",
        cost_label: "~$0.10 / $0.40 por 1M tok",
        description: "Nano estável para mensagens curtas",
        functions: ["chat", "copy"],
      },
      {
        id: "openai/gpt-4o-mini",
        label: "Atlas · GPT-4o Mini",
        tier: "cheap",
        cost_label: "~$0.15 / $0.60 por 1M tok",
        description: "Mini versátil",
        functions: ["chat", "json"],
      },
      {
        id: "google/gemini-2.5-flash",
        label: "Atlas · Gemini 2.5 Flash",
        tier: "cheap",
        cost_label: "~$0.30 / $2.50 por 1M tok",
        description: "Um degrau acima quando precisar de um pouco mais de qualidade",
        functions: ["chat", "copy", "json", "vision"],
      },
      {
        id: "qwen/qwen3.5-flash",
        label: "Atlas · Qwen 3.5 Flash",
        tier: "cheap",
        cost_label: "~$0.10 / $0.40 por 1M tok",
        description: "Alternativa barata multilíngue",
        functions: ["chat", "copy"],
      },
      {
        id: "deepseek-ai/DeepSeek-V3.1",
        label: "Atlas · DeepSeek V3.1",
        tier: "medium",
        cost_label: "~$0.30 / $0.95 por 1M tok",
        description: "Quando o treino pedir mais qualidade sem ir pro flagship",
        functions: ["chat", "json", "reason_light"],
      },
      {
        id: "google/gemini-3.1-flash-lite",
        label: "Atlas · Gemini 3.1 Flash Lite",
        tier: "cheap",
        cost_label: "~$0.25 / $1.50 por 1M tok",
        input_usd_per_mtok: 0.25,
        output_usd_per_mtok: 1.5,
        description: "Geração mais nova flash-lite",
        functions: ["chat", "copy"],
      },
      // ── Catálogo expandido (Atlas 400+ · subset curado p/ o app) ──
      {
        id: "deepseek-ai/DeepSeek-V3",
        label: "Atlas · DeepSeek V3",
        tier: "medium",
        cost_label: "~$0.27 / $1.10 por 1M tok",
        input_usd_per_mtok: 0.27,
        output_usd_per_mtok: 1.1,
        description: "Forte em JSON e raciocínio leve",
        functions: ["chat", "json", "reason_light"],
      },
      {
        id: "deepseek-ai/DeepSeek-R1",
        label: "Atlas · DeepSeek R1",
        tier: "medium",
        cost_label: "~$0.55 / $2.19 por 1M tok",
        input_usd_per_mtok: 0.55,
        output_usd_per_mtok: 2.19,
        description: "Raciocínio — use só em orquestração/admin",
        functions: ["chat", "reason", "json"],
      },
      {
        id: "qwen/qwen2.5-72b-instruct",
        label: "Atlas · Qwen 2.5 72B",
        tier: "medium",
        cost_label: "~$0.35 / $1.40 por 1M tok",
        input_usd_per_mtok: 0.35,
        output_usd_per_mtok: 1.4,
        description: "Multilíngue forte (PT-BR ok)",
        functions: ["chat", "copy", "json"],
      },
      {
        id: "qwen/qwen2.5-32b-instruct",
        label: "Atlas · Qwen 2.5 32B",
        tier: "cheap",
        cost_label: "~$0.18 / $0.70 por 1M tok",
        input_usd_per_mtok: 0.18,
        output_usd_per_mtok: 0.7,
        functions: ["chat", "copy", "json"],
      },
      {
        id: "moonshotai/kimi-k2",
        label: "Atlas · Kimi K2",
        tier: "medium",
        cost_label: "~$0.50 / $2.00 por 1M tok",
        input_usd_per_mtok: 0.5,
        output_usd_per_mtok: 2,
        description: "Contexto longo — resumos/memória",
        functions: ["chat", "json"],
      },
      {
        id: "zai-org/glm-4.5",
        label: "Atlas · GLM 4.5",
        tier: "medium",
        cost_label: "~$0.40 / $1.60 por 1M tok",
        input_usd_per_mtok: 0.4,
        output_usd_per_mtok: 1.6,
        functions: ["chat", "json", "copy"],
      },
      {
        id: "meta-llama/llama-4-scout",
        label: "Atlas · Llama 4 Scout",
        tier: "cheap",
        cost_label: "~$0.15 / $0.60 por 1M tok",
        input_usd_per_mtok: 0.15,
        output_usd_per_mtok: 0.6,
        functions: ["chat", "copy"],
      },
      {
        id: "meta-llama/llama-4-maverick",
        label: "Atlas · Llama 4 Maverick",
        tier: "medium",
        cost_label: "~$0.30 / $1.20 por 1M tok",
        input_usd_per_mtok: 0.3,
        output_usd_per_mtok: 1.2,
        functions: ["chat", "json"],
      },
      {
        id: "mistralai/mistral-small-3.1",
        label: "Atlas · Mistral Small 3.1",
        tier: "cheap",
        cost_label: "~$0.12 / $0.48 por 1M tok",
        input_usd_per_mtok: 0.12,
        output_usd_per_mtok: 0.48,
        functions: ["chat", "copy", "json"],
      },
      {
        id: "mistralai/mistral-large-latest",
        label: "Atlas · Mistral Large",
        tier: "expensive",
        cost_label: "~$2.00 / $6.00 por 1M tok",
        input_usd_per_mtok: 2,
        output_usd_per_mtok: 6,
        description: "Só tarefas críticas de baixa frequência",
        functions: ["chat", "reason", "json"],
      },
      {
        id: "anthropic/claude-sonnet-4",
        label: "Atlas · Claude Sonnet 4",
        tier: "expensive",
        cost_label: "~$3.00 / $15.00 por 1M tok",
        input_usd_per_mtok: 3,
        output_usd_per_mtok: 15,
        description: "Qualidade top — evitar em volume WhatsApp",
        functions: ["chat", "reason", "json", "copy"],
      },
      {
        id: "anthropic/claude-haiku-4.5",
        label: "Atlas · Claude Haiku 4.5",
        tier: "medium",
        cost_label: "~$0.80 / $4.00 por 1M tok",
        input_usd_per_mtok: 0.8,
        output_usd_per_mtok: 4,
        functions: ["chat", "copy", "json"],
      },
      {
        id: "google/gemini-2.5-pro",
        label: "Atlas · Gemini 2.5 Pro",
        tier: "expensive",
        cost_label: "~$1.25 / $10.00 por 1M tok",
        input_usd_per_mtok: 1.25,
        output_usd_per_mtok: 10,
        functions: ["chat", "reason", "json", "vision"],
      },
      {
        id: "openai/gpt-4.1-mini",
        label: "Atlas · GPT-4.1 Mini",
        tier: "cheap",
        cost_label: "~$0.40 / $1.60 por 1M tok",
        input_usd_per_mtok: 0.4,
        output_usd_per_mtok: 1.6,
        functions: ["chat", "json", "copy"],
      },
      {
        id: "openai/gpt-4.1",
        label: "Atlas · GPT-4.1",
        tier: "medium",
        cost_label: "~$2.00 / $8.00 por 1M tok",
        input_usd_per_mtok: 2,
        output_usd_per_mtok: 8,
        functions: ["chat", "json", "reason_light"],
      },
      {
        id: "x-ai/grok-3-mini",
        label: "Atlas · Grok 3 Mini",
        tier: "cheap",
        cost_label: "~$0.30 / $0.50 por 1M tok",
        input_usd_per_mtok: 0.3,
        output_usd_per_mtok: 0.5,
        functions: ["chat", "copy"],
      },
    ],
    openai: [
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "cheap", cost_label: "nativo OpenAI", functions: ["chat"] },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "cheap", cost_label: "nativo OpenAI", functions: ["chat", "json"] },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "cheap", cost_label: "nativo OpenAI", functions: ["chat"] },
      { id: "gpt-5-nano", label: "GPT-5 Nano", tier: "cheap", cost_label: "nativo OpenAI", functions: ["chat"] },
      { id: "gpt-5-mini", label: "GPT-5 Mini", tier: "medium", cost_label: "nativo OpenAI", functions: ["chat"] },
      { id: "gpt-5.4", label: "GPT-5.4", tier: "expensive", cost_label: "flagship", functions: ["chat", "reason"] },
    ],
    gemini: [
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "cheap", cost_label: "nativo Google", functions: ["chat", "json"] },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "cheap", cost_label: "nativo Google", functions: ["chat", "json", "vision"] },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "expensive", cost_label: "nativo Google", functions: ["reason"] },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", tier: "cheap", functions: ["chat"] },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", tier: "medium", functions: ["chat"] },
    ],
    grok: [
      { id: "grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast", tier: "cheap", cost_label: "~$0.20/M", functions: ["chat"] },
      { id: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast Reasoning", tier: "cheap", functions: ["chat"] },
      { id: "grok-4.20-0309-non-reasoning", label: "Grok 4.20", tier: "expensive", functions: ["chat"] },
    ],
  },

  image: {
    /** Default path nativo — multi-ref (produto + logo) via generateContent */
    gemini: [
      {
        id: "gemini-3.1-flash-image",
        label: "Gemini 3.1 Flash Image",
        tier: "cheap",
        cost_label: "custo-benefício (default estúdio)",
        description: "Default do compositor — rápido, multi-referência produto+logo",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gemini-3.1-flash-image-preview",
        label: "Gemini 3.1 Flash Image (preview)",
        tier: "cheap",
        description: "Alias preview do Flash Image",
        functions: ["product_studio", "t2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gemini-2.5-flash-image",
        label: "Gemini 2.5 Flash Image",
        tier: "cheap",
        description: "Geração/edição rápida estável",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gemini-3-pro-image-preview",
        label: "Gemini 3 Pro Image",
        tier: "expensive",
        description: "Studio 4K — só quando qualidade máxima",
        functions: ["product_studio", "t2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "imagen-4.0-fast-generate-001",
        label: "Imagen 4 Fast",
        tier: "cheap",
        description: "Text-to-image (sem multi-ref forte)",
        functions: ["t2i"],
        supports_references: false,
        studio_selectable: false,
      },
    ],
    openai: [
      {
        id: "gpt-image-2",
        label: "GPT Image 2",
        tier: "medium",
        cost_label: "~$0.01–0.41/img (varia por qualidade)",
        description: "Elite em tipografia e lógica espacial — até 10 refs",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gpt-image-1.5",
        label: "GPT Image 1.5",
        tier: "medium",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gpt-image-1",
        label: "GPT Image 1",
        tier: "medium",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "gpt-image-1-mini",
        label: "GPT Image 1 Mini",
        tier: "cheap",
        functions: ["t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
    ],
    atlas: [
      {
        id: "google/gemini-3.1-flash-image",
        label: "Atlas · Gemini 3.1 Flash Image",
        tier: "cheap",
        cost_label: "via Atlas",
        description: "Mesmo default via chave Atlas — multi-ref",
        functions: ["product_studio", "t2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "google/gemini-3.1-flash-image-preview",
        label: "Atlas · Gemini 3.1 Flash Image Preview",
        tier: "cheap",
        functions: ["product_studio", "t2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "google/gemini-2.5-flash-image",
        label: "Atlas · Gemini 2.5 Flash Image",
        tier: "cheap",
        functions: ["product_studio", "t2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "openai/gpt-image-2",
        label: "Atlas · GPT Image 2",
        tier: "medium",
        cost_label: "via Atlas",
        description: "GPT Image 2 com fatura Atlas — multi-ref",
        functions: ["product_studio", "t2i", "edit"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "google/nano-banana-2/text-to-image",
        label: "Atlas · Nano Banana 2",
        tier: "medium",
        cost_label: "~$0.07–0.16/img",
        description: "Até 14 refs — séries de personagem/marca",
        functions: ["product_studio", "t2i", "i2i"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "seedream-3.0",
        label: "Atlas · Seedream 3.0",
        tier: "medium",
        cost_label: "~$0.02–0.04/img",
        description: "Volume/produção — i2i com refs",
        functions: ["t2i", "i2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "flux-kontext-dev",
        label: "Atlas · Flux Kontext",
        tier: "medium",
        cost_label: "~$0.03–0.05/img",
        description: "Edição com contexto/ref — forte em consistência",
        functions: ["i2i", "edit", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "flux-1.1-pro",
        label: "Atlas · Flux 1.1 Pro",
        tier: "medium",
        cost_label: "~$0.03–0.06/img",
        description: "Qualidade alta (ref limitada em alguns modos)",
        functions: ["t2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "flux-dev",
        label: "Atlas · Flux Dev",
        tier: "cheap",
        cost_label: "econômico",
        description: "Rascunho / volume",
        functions: ["t2i"],
        supports_references: false,
        studio_selectable: false,
      },
      {
        id: "bytedance/seedream-4.5",
        label: "Atlas · Seedream 4.5",
        tier: "medium",
        cost_label: "~$0.03–0.05/img",
        usd_per_image: 0.04,
        description: "Qualidade alta ByteDance — bom em tipografia",
        functions: ["t2i", "i2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "bytedance/seedream-5.0-lite",
        label: "Atlas · Seedream 5.0 Lite",
        tier: "cheap",
        cost_label: "~$0.02–0.04/img",
        usd_per_image: 0.03,
        functions: ["t2i", "i2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "black-forest-labs/flux-2-pro",
        label: "Atlas · Flux 2 Pro",
        tier: "medium",
        cost_label: "~$0.04–0.08/img",
        usd_per_image: 0.05,
        functions: ["t2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "ideogram/ideogram-v3",
        label: "Atlas · Ideogram V3",
        tier: "medium",
        cost_label: "~$0.06/img",
        usd_per_image: 0.06,
        description: "Excelente texto em imagem (artes com copy)",
        functions: ["t2i", "product_studio"],
        supports_references: false,
        studio_selectable: true,
      },
      {
        id: "qwen/qwen-image",
        label: "Atlas · Qwen Image",
        tier: "medium",
        cost_label: "~$0.04/img",
        usd_per_image: 0.04,
        description: "Multilíngue — texto legível",
        functions: ["t2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
      {
        id: "google/imagen-4-fast",
        label: "Atlas · Imagen 4 Fast",
        tier: "cheap",
        cost_label: "~$0.02/img",
        usd_per_image: 0.02,
        functions: ["t2i"],
        supports_references: false,
        studio_selectable: false,
      },
      {
        id: "google/nano-banana-2-lite/text-to-image",
        label: "Atlas · Nano Banana 2 Lite",
        tier: "cheap",
        cost_label: "~$0.04–0.08/img",
        usd_per_image: 0.05,
        functions: ["t2i", "product_studio"],
        supports_references: true,
        studio_selectable: true,
      },
    ],
    grok: [
      {
        id: "grok-imagine-image",
        label: "Imagine Image",
        tier: "cheap",
        cost_label: "~$0.02/img",
        description: "T2I only — tipografia nativa, sem ref de produto",
        functions: ["t2i"],
        supports_references: false,
        studio_selectable: false,
      },
      {
        id: "grok-imagine-image-pro",
        label: "Imagine Image Pro",
        tier: "medium",
        cost_label: "~$0.07/img",
        functions: ["t2i"],
        supports_references: false,
        studio_selectable: false,
      },
    ],
  },

  video: {
    atlas: [
      { id: "kling-v2.0", label: "Atlas · Kling v2.0", tier: "medium", cost_label: "~$0.08/s", usd_per_second: 0.08, functions: ["t2v", "i2v"] },
      { id: "kling-v2.1", label: "Atlas · Kling v2.1", tier: "expensive", cost_label: "~$0.12/s", usd_per_second: 0.12, functions: ["t2v", "i2v"] },
      { id: "kling-v3.0", label: "Atlas · Kling V3.0", tier: "expensive", cost_label: "~$0.14/s", usd_per_second: 0.14, functions: ["t2v", "i2v"] },
      { id: "minimax/video-01", label: "Atlas · MiniMax / Hailuo Video", tier: "medium", cost_label: "~$0.06/s", usd_per_second: 0.06, functions: ["t2v", "i2v"] },
      { id: "bytedance/seedance-1.5-pro", label: "Atlas · Seedance 1.5 Pro", tier: "medium", cost_label: "~$0.08/s", usd_per_second: 0.08, functions: ["t2v", "i2v"] },
      { id: "bytedance/seedance-2.0", label: "Atlas · Seedance 2.0", tier: "expensive", cost_label: "~$0.12/s", usd_per_second: 0.12, functions: ["t2v", "i2v"] },
      { id: "bytedance/seedance-2.0-mini", label: "Atlas · Seedance 2.0 Mini", tier: "cheap", cost_label: "~$0.05/s", usd_per_second: 0.05, functions: ["t2v"] },
      { id: "alibaba/wan-2.6", label: "Atlas · Wan 2.6", tier: "medium", cost_label: "~$0.07/s", usd_per_second: 0.07, functions: ["t2v", "i2v"] },
      { id: "alibaba/wan-2.7", label: "Atlas · Wan 2.7", tier: "medium", cost_label: "~$0.08/s", usd_per_second: 0.08, functions: ["t2v", "i2v"] },
      { id: "vidu/vidu-q2", label: "Atlas · Vidu Q2", tier: "medium", cost_label: "~$0.07/s", usd_per_second: 0.07, functions: ["t2v", "i2v"] },
      { id: "google/veo-3.1", label: "Atlas · Veo 3.1", tier: "expensive", cost_label: "~$0.20/s", usd_per_second: 0.2, functions: ["t2v"] },
      { id: "luma/ray-2", label: "Atlas · Luma Ray 2", tier: "expensive", cost_label: "~$0.15/s", usd_per_second: 0.15, functions: ["t2v", "i2v"] },
      { id: "x-ai/grok-imagine-video", label: "Atlas · Grok Imagine Video", tier: "medium", cost_label: "~$0.05/s", usd_per_second: 0.05, functions: ["t2v"] },
    ],
    veo: [
      { id: "veo-3.1-generate-preview", label: "Veo 3.1", tier: "expensive", functions: ["t2v"] },
      { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite", tier: "medium", functions: ["t2v"] },
    ],
    kling: [
      { id: "v2.1-master/text-to-video", label: "Kling 2.1 Master T2V", tier: "expensive", functions: ["t2v"] },
      { id: "v2.1-standard/image-to-video", label: "Kling 2.1 Std I2V", tier: "cheap", functions: ["i2v"] },
    ],
    grok: [
      { id: "grok-imagine-video", label: "Imagine Video", tier: "medium", cost_label: "~$0.05/s", functions: ["t2v"] },
    ],
    gemini: [
      { id: "gemini-2.5-flash", label: "Gemini Flash Nativo", tier: "cheap", functions: ["t2v"] },
    ],
  },

  audio: {
    atlas: [
      { id: "minimax/speech-02-hd", label: "Atlas · MiniMax Speech HD", tier: "medium", cost_label: "TTS HD", functions: ["tts"] },
      { id: "minimax/speech-02-turbo", label: "Atlas · MiniMax Speech Turbo", tier: "cheap", cost_label: "TTS rápido", functions: ["tts"] },
      { id: "openai/tts-1", label: "Atlas · OpenAI TTS-1", tier: "cheap", functions: ["tts"] },
      { id: "openai/tts-1-hd", label: "Atlas · OpenAI TTS-1 HD", tier: "medium", functions: ["tts"] },
      { id: "elevenlabs/eleven-multilingual-v2", label: "Atlas · ElevenLabs Multilingual v2", tier: "medium", functions: ["tts"] },
      { id: "elevenlabs/eleven-turbo-v2.5", label: "Atlas · ElevenLabs Turbo v2.5", tier: "cheap", functions: ["tts"] },
      { id: "suno/chirp-v4", label: "Atlas · Suno Chirp v4", tier: "medium", cost_label: "música", functions: ["music"] },
    ],
  },
};

/**
 * Defaults de plataforma — tudo via Atlas (chave única + custo unificado).
 * Texto barato; imagem com multi-ref; vídeo i2v barato o bastante para apps.
 */
export const DEFAULT_PREFERENCES = {
  text: { provider: "atlas", model: "google/gemini-2.5-flash-lite" },
  image: { provider: "atlas", model: "google/gemini-3.1-flash-image" },
  video: { provider: "atlas", model: "kling-v2.0" },
  audio: { provider: "atlas", model: "minimax/speech-02-turbo" },
};

/** Opções do seletor no compositor de criativos (só modelos com referência ou T2I explícito no studio). */
export function listStudioImageModels(): Array<
  AIModelDef & { provider: string }
> {
  const out: Array<AIModelDef & { provider: string }> = [];
  const imageCatalog = AI_MODELS.image;
  for (const [provider, models] of Object.entries(imageCatalog)) {
    for (const m of models) {
      if (m.studio_selectable) {
        out.push({ ...m, provider });
      }
    }
  }
  /* Default first */
  out.sort((a, b) => {
    if (a.id === DEFAULT_PREFERENCES.image.model && a.provider === DEFAULT_PREFERENCES.image.provider)
      return -1;
    if (b.id === DEFAULT_PREFERENCES.image.model && b.provider === DEFAULT_PREFERENCES.image.provider)
      return 1;
    if (a.tier === b.tier) return a.label.localeCompare(b.label);
    const order = { cheap: 0, medium: 1, expensive: 2 };
    return order[a.tier] - order[b.tier];
  });
  return out;
}

/**
 * Modelos descontinuados (Google Gemini API shutdown 2026-06-01 e aliases).
 * Nunca devem ser selecionáveis no catálogo nem usados em runtime.
 * @see https://ai.google.dev/gemini-api/docs/deprecations
 */
export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  // Gemini 2.0 line — shut down 2026-06-01
  "google/gemini-2.0-flash-lite": "google/gemini-2.5-flash-lite",
  "google/gemini-2.0-flash-lite-001": "google/gemini-2.5-flash-lite",
  "google/gemini-2.0-flash": "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001": "google/gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite-001": "gemini-2.5-flash-lite",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-001": "gemini-2.5-flash",
};

export function isRetiredModelId(modelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(RETIRED_MODEL_REPLACEMENTS, String(modelId || "").trim());
}

/** Se o model id estiver aposentado, devolve o substituto vivo; senão o próprio id. */
export function resolveLiveModelId(modelId: string): string {
  const id = String(modelId || "").trim();
  return RETIRED_MODEL_REPLACEMENTS[id] || id;
}
