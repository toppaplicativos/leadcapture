import { GoogleGenerativeAI } from "@google/generative-ai";
import { Lead } from "../types";
import { logger } from "../utils/logger";
import { IntegrationScope, integrationService } from "./integrations";

export type GeminiExecutionOptions = IntegrationScope & {
  model?: string;
  temperature?: number;
};

type GeminiClient = {
  model: any;
  modelName: string;
};

const CLIENT_CACHE_TTL_MS = 60_000;

function parseJsonBlock<T>(value: string): T {
  const cleaned = String(value || "").trim();
  const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || cleaned;
  return JSON.parse(candidate) as T;
}

export class GeminiService {
  private clientCache = new Map<string, { value: GeminiClient; expires: number }>();

  private normalizeScope(options?: GeminiExecutionOptions): GeminiExecutionOptions {
    return {
      accountId: String(options?.accountId || "").trim() || undefined,
      userId: String(options?.userId || "").trim() || undefined,
      brandId: String(options?.brandId || "").trim() || undefined,
      model: String(options?.model || "").trim() || undefined,
      temperature: Number.isFinite(Number(options?.temperature)) ? Number(options?.temperature) : undefined,
    };
  }

  private scopeCacheKey(scope?: GeminiExecutionOptions): string {
    const accountId = String(scope?.accountId || "").trim();
    const userId = String(scope?.userId || "").trim();
    const brandId = String(scope?.brandId || "").trim();
    return accountId || (userId && brandId ? `${userId}::${brandId}` : userId || "__global__");
  }

  private async resolveClient(options?: GeminiExecutionOptions): Promise<GeminiClient> {
    const scope = this.normalizeScope(options);
    const integration = await integrationService.getProvider("gemini", scope);
    const apiKey = String(integration.key || "").trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
    }

    const modelName =
      scope.model ||
      String(integration.config.model || "").trim() ||
      process.env.GEMINI_CAMPAIGN_MODEL ||
      process.env.GEMINI_TEXT_MODEL ||
      "gemini-2.0-flash";

    const cacheKey = `${this.scopeCacheKey(scope)}::${modelName}::${apiKey.slice(-8)}`;
    const cached = this.clientCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const generationConfig: Record<string, any> = {};
    const temperature = Number.isFinite(Number(scope.temperature))
      ? Number(scope.temperature)
      : Number(integration.config.temperature);
    if (Number.isFinite(temperature)) {
      generationConfig.temperature = temperature;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      Object.keys(generationConfig).length > 0
        ? { model: modelName, generationConfig }
        : { model: modelName }
    );

    const client = { model, modelName };
    this.clientCache.set(cacheKey, { value: client, expires: Date.now() + CLIENT_CACHE_TTL_MS });
    return client;
  }

  private async logFailure(error: any, options?: GeminiExecutionOptions): Promise<void> {
    const message = String(error?.message || error || "Gemini request failed");
    logger.error(`Error calling Gemini: ${message}`);
    await integrationService.logEvent("gemini", "error", message, this.normalizeScope(options), {
      action: "gemini_request",
    });
  }

  async generateMessage(lead: Lead, templatePrompt: string, options?: GeminiExecutionOptions): Promise<string> {
    try {
      const { model, modelName } = await this.resolveClient(options);
      const prompt = `Voce e um assistente de vendas profissional. Gere uma mensagem de WhatsApp personalizada para o seguinte lead.

REGRAS IMPORTANTES:
- A mensagem deve ser curta (maximo 3 paragrafos)
- Tom profissional mas amigavel
- Personalizada com o nome do negocio
- Inclua uma proposta de valor clara
- Termine com uma pergunta ou call-to-action
- NAO use emojis em excesso (maximo 2-3)
- Escreva em portugues brasileiro
- O bloco TEMPLATE/CONTEXTO DA CAMPANHA e obrigatorio e tem prioridade maxima.
- Se houver conflito entre qualquer regra geral e o TEMPLATE/CONTEXTO DA CAMPANHA, siga o TEMPLATE/CONTEXTO DA CAMPANHA.
- Nao invente nome de atendente/remetente. So use nome proprio se estiver explicitamente no TEMPLATE/CONTEXTO DA CAMPANHA.
- Nao invente produto, volume, promocao ou condicao comercial que nao esteja no TEMPLATE/CONTEXTO DA CAMPANHA.
- Se o TEMPLATE/CONTEXTO DA CAMPANHA indicar foco comercial/industrial/atacado, nao ofereca item de varejo/menor volume.

DADOS DO LEAD:
- Nome do negocio: ${lead.name}
- Endereco: ${lead.address || "Nao informado"}
- Categoria: ${lead.category || "Nao informada"}
- Avaliacao: ${lead.rating ? lead.rating + "/5" : "Nao informada"}
- Website: ${lead.website || "Nao possui"}

TEMPLATE/CONTEXTO DA CAMPANHA:
${templatePrompt}

Gere APENAS a mensagem, sem explicacoes adicionais.`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      logger.info(`Generated message for lead: ${lead.name} using ${modelName}`);
      return String(text || "").trim();
    } catch (error: any) {
      await this.logFailure(error, options);
      throw error;
    }
  }

  async generateFollowUp(lead: Lead, previousMessages: string[], options?: GeminiExecutionOptions): Promise<string> {
    try {
      const { model } = await this.resolveClient(options);
      const prompt = `Voce e um assistente de vendas. Gere uma mensagem de follow-up para WhatsApp.

REGRAS:
- Mensagem curta e direta
- Referencia a conversa anterior
- Tom amigavel, nao insistente
- Maximo 2 paragrafos
- Portugues brasileiro

LEAD: ${lead.name}
CATEGORIA: ${lead.category || "Nao informada"}

MENSAGENS ANTERIORES:
${previousMessages.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Gere APENAS a mensagem de follow-up.`;

      const result = await model.generateContent(prompt);
      return String(result.response.text() || "").trim();
    } catch (error: any) {
      await this.logFailure(error, options);
      throw error;
    }
  }

  async analyzeImages(
    images: Array<{ base64: string; mimeType: string; name?: string }>,
    prompt: string,
    context?: string,
    detailedAnalysis?: boolean,
    options?: GeminiExecutionOptions
  ): Promise<string> {
    try {
      const { model, modelName } = await this.resolveClient(options);
      const parts: any[] = [];

      if (context) {
        parts.push(`CONTEXTO:\n${context}\n\n`);
      }

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        parts.push({
          inlineData: {
            data: image.base64,
            mimeType: image.mimeType,
          },
        });

        if (images.length > 1) {
          parts.push(`[IMAGEM ${i + 1}: ${image.name || `Image ${i + 1}`} ]\n`);
        }
      }

      parts.push(detailedAnalysis ? `\n${prompt}\n\nForneca uma analise DETALHADA e COMPLETA.` : `\n${prompt}`);

      logger.info(`Analisando ${images.length} imagem(ns) com Gemini...`);

      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });

      logger.info(`Analise de imagens concluida com ${modelName}`);
      return String(result.response.text() || "").trim();
    } catch (error: any) {
      await this.logFailure(error, options);
      throw error;
    }
  }

  async generatePlainText(prompt: string, options?: GeminiExecutionOptions): Promise<string> {
    try {
      const textPrompt = String(prompt || "").trim();
      if (!textPrompt) return "";

      const { model } = await this.resolveClient(options);
      const result = await model.generateContent(textPrompt);
      return String(result.response.text() || "").trim();
    } catch (error: any) {
      await this.logFailure(error, options);
      throw error;
    }
  }

  async generateJson<T>(prompt: string, options?: GeminiExecutionOptions): Promise<T> {
    const text = await this.generatePlainText(prompt, options);
    return parseJsonBlock<T>(text);
  }
}