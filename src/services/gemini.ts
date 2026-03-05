import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { Lead } from "../types";
import { logger } from "../utils/logger";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private modelName: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.modelName =
      process.env.GEMINI_CAMPAIGN_MODEL ||
      process.env.GEMINI_TEXT_MODEL ||
      "gemini-2.0-flash";
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  async generateMessage(lead: Lead, templatePrompt: string): Promise<string> {
    try {
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

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      logger.info(`Generated message for lead: ${lead.name} using ${this.modelName}`);
      return text.trim();
    } catch (error: any) {
      logger.error(`Error generating message: ${error.message}`);
      throw error;
    }
  }

  async generateFollowUp(lead: Lead, previousMessages: string[]): Promise<string> {
    try {
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

      const result = await this.model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: any) {
      logger.error(`Error generating follow-up: ${error.message}`);
      throw error;
    }
  }

  async analyzeImages(
    images: Array<{ base64: string; mimeType: string; name?: string }>,
    prompt: string,
    context?: string,
    detailedAnalysis?: boolean
  ): Promise<string> {
    try {
      // Preparar conteúdo com imagens
      const parts: any[] = [];

      // Adicionar contexto se fornecido
      if (context) {
        parts.push(`CONTEXTO:\n${context}\n\n`);
      }

      // Adicionar imagens em base64
      for (let i = 0; i < images.length; i++) {
        const image = images[i];

        parts.push({
          inlineData: {
            data: image.base64,
            mimeType: image.mimeType
          }
        });

        // Adicionar identificador da imagem se houver múltiplas
        if (images.length > 1) {
          parts.push(`[IMAGEM ${i + 1}: ${image.name || `Image ${i + 1}`}]\n`);
        }
      }

      // Adicionar prompt
      if (detailedAnalysis) {
        parts.push(`\n${prompt}\n\nForneca uma analise DETALHADA e COMPLETA.`);
      } else {
        parts.push(`\n${prompt}`);
      }

      logger.info(`Analisando ${images.length} imagem(ns) com Gemini...`);

      const result = await this.model.generateContent({
        contents: [{ role: "user", parts }]
      });

      const response = result.response;
      const text = response.text();

      logger.info(`Analise de imagens concluida com ${this.modelName}`);

      return text.trim();
    } catch (error: any) {
      logger.error(`Erro ao analisar imagens: ${error.message}`);
      throw error;
    }
  }

  async generatePlainText(prompt: string): Promise<string> {
    try {
      const textPrompt = String(prompt || "").trim();
      if (!textPrompt) return "";

      const result = await this.model.generateContent(textPrompt);
      const response = result.response;
      const text = response.text();
      return String(text || "").trim();
    } catch (error: any) {
      logger.error(`Error generating plain text: ${error.message}`);
      throw error;
    }
  }
}
