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
}
