export type ModelTier = "cheap" | "medium" | "expensive";
export type AICategory = "text" | "image" | "video";
export type AIProviderKey = "openai" | "gemini" | "grok" | "veo" | "kling";

export interface AIModelDef {
  id: string;
  label: string;
  tier: ModelTier;
  description?: string;
}

// ── Catalogo atualizado com model IDs reais das docs oficiais (Abril 2026) ──

export const AI_MODELS: Record<AICategory, Record<string, AIModelDef[]>> = {
  text: {
    openai: [
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "cheap", description: "Ultra rapido, menor custo" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "cheap", description: "Rapido e barato, 1M contexto" },
      { id: "gpt-4.1", label: "GPT-4.1", tier: "medium", description: "Melhor nao-reasoning, 1M contexto" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "cheap", description: "Versatil e acessivel" },
      { id: "gpt-4o", label: "GPT-4o", tier: "medium", description: "Rapido, inteligente, flexivel" },
      { id: "o4-mini", label: "o4-mini", tier: "medium", description: "Raciocinio rapido e eficiente" },
      { id: "o3", label: "o3", tier: "expensive", description: "Raciocinio avancado (math/code)" },
      { id: "gpt-5-nano", label: "GPT-5 Nano", tier: "cheap", description: "Mais rapido e economico GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 Mini", tier: "medium", description: "Near-frontier inteligencia" },
      { id: "gpt-5", label: "GPT-5", tier: "expensive", description: "Flagship com raciocinio configuravel" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", tier: "cheap", description: "Mais barato da serie 5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "medium", description: "Forte em codigo e agentes" },
      { id: "gpt-5.4", label: "GPT-5.4", tier: "expensive", description: "Melhor para agentes e codigo" },
    ],
    gemini: [
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", tier: "cheap", description: "Ultra rapido e economico" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "cheap", description: "Melhor custo-beneficio" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "expensive", description: "Raciocinio avancado" },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", tier: "cheap", description: "Preview — ultra economico" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", tier: "medium", description: "Preview — frontier-class" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tier: "expensive", description: "Preview — problema complexo" },
    ],
    grok: [
      { id: "grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast", tier: "cheap", description: "$0.20/M — rapido sem raciocinio" },
      { id: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast Reasoning", tier: "cheap", description: "$0.20/M — rapido com raciocinio" },
      { id: "grok-4.20-0309-non-reasoning", label: "Grok 4.20", tier: "expensive", description: "$2/M — flagship" },
      { id: "grok-4.20-0309-reasoning", label: "Grok 4.20 Reasoning", tier: "expensive", description: "$2/M — flagship com raciocinio" },
      { id: "grok-4.20-multi-agent-0309", label: "Grok 4.20 Multi-Agent", tier: "expensive", description: "$2/M — multi-agent" },
    ],
  },
  image: {
    openai: [
      { id: "gpt-image-1-mini", label: "GPT Image 1 Mini", tier: "cheap", description: "Geracao economica" },
      { id: "gpt-image-1", label: "GPT Image 1", tier: "medium", description: "Geracao de imagem" },
      { id: "gpt-image-1.5", label: "GPT Image 1.5", tier: "medium", description: "State-of-the-art geracao" },
    ],
    gemini: [
      { id: "gemini-2.5-flash-image", label: "Gemini Flash Image", tier: "cheap", description: "Geracao e edicao rapida" },
      { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image", tier: "cheap", description: "Preview — alta eficiencia" },
      { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", tier: "expensive", description: "Preview — studio 4K" },
      { id: "imagen-4.0-fast-generate-001", label: "Imagen 4 Fast", tier: "cheap", description: "Rapido text-to-image" },
      { id: "imagen-4.0-generate-001", label: "Imagen 4", tier: "medium", description: "Alta qualidade" },
      { id: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra", tier: "expensive", description: "Maior qualidade" },
    ],
    grok: [
      { id: "grok-imagine-image", label: "Imagine Image", tier: "cheap", description: "$0.02/img — geracao rapida" },
      { id: "grok-imagine-image-pro", label: "Imagine Image Pro", tier: "medium", description: "$0.07/img — alta qualidade" },
    ],
  },
  video: {
    veo: [
      { id: "veo-3.1-generate-preview", label: "Veo 3.1", tier: "expensive", description: "Cinematografico com audio" },
      { id: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite", tier: "medium", description: "Eficiente e rapido" },
    ],
    kling: [
      { id: "v2.1-master/text-to-video", label: "Kling 2.1 Master T2V", tier: "expensive", description: "Melhor qualidade texto→video" },
      { id: "v2.1-master/image-to-video", label: "Kling 2.1 Master I2V", tier: "expensive", description: "Melhor qualidade img→video" },
      { id: "v2.1-pro/image-to-video", label: "Kling 2.1 Pro I2V", tier: "medium", description: "Imagem para video" },
      { id: "v2.1-standard/image-to-video", label: "Kling 2.1 Std I2V", tier: "cheap", description: "Economico img→video" },
      { id: "v1.6-standard/text-to-video", label: "Kling 1.6 Std T2V", tier: "cheap", description: "Basico economico" },
    ],
    grok: [
      { id: "grok-imagine-video", label: "Imagine Video", tier: "medium", description: "$0.05/seg — 720p com audio nativo" },
    ],
    gemini: [
      { id: "gemini-2.5-flash", label: "Gemini Flash Nativo", tier: "cheap", description: "Video nativo Gemini" },
    ],
  },
};

export const DEFAULT_PREFERENCES = {
  text: { provider: "gemini", model: "gemini-2.5-flash" },
  image: { provider: "gemini", model: "gemini-2.5-flash-image" },
  video: { provider: "veo", model: "veo-3.1-generate-preview" },
};
