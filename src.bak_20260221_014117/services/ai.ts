import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../utils/logger";

interface AIMessageOptions {
  tone?: "formal" | "casual" | "friendly" | "professional";
  maxLength?: number;
  language?: string;
  includeEmojis?: boolean;
  context?: string;
  agentName?: string;
  objective?: string;
  communicationRules?: string;
  trainingNotes?: string;
  preferredTerms?: string[];
  forbiddenTerms?: string[];
}

interface AIAnalysisResult {
  sentiment: "positive" | "negative" | "neutral";
  intent: string;
  suggestedResponse: string;
  keywords: string[];
}

export class AIService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }

  async generateCustomMessage(prompt: string, options: AIMessageOptions = {}): Promise<string> {
    const {
      tone = "professional",
      maxLength = 500,
      language = "pt-BR",
      includeEmojis = true,
      context = "",
      agentName = "Assistente Comercial",
      objective = "",
      communicationRules = "",
      trainingNotes = "",
      preferredTerms = [],
      forbiddenTerms = [],
    } = options;

    const systemPrompt = `Voce e ${agentName}, um assistente de marketing e vendas especializado em WhatsApp Business.
Idioma: ${language}
Tom: ${tone}
Maximo de caracteres: ${maxLength}
${includeEmojis ? "Use emojis moderadamente (2-3 max)" : "NAO use emojis"}
${context ? `Contexto adicional: ${context}` : ""}
${objective ? `Objetivo do agente: ${objective}` : ""}
${communicationRules ? `Regras de comunicacao: ${communicationRules}` : ""}
${trainingNotes ? `Treinamento interno da equipe: ${trainingNotes}` : ""}
${preferredTerms.length ? `Use preferencialmente os termos: ${preferredTerms.join(", ")}` : ""}
${forbiddenTerms.length ? `Evite completamente os termos: ${forbiddenTerms.join(", ")}` : ""}

Regras:
- Mensagem direta e objetiva
- Maximo 3 paragrafos curtos
- Inclua uma chamada para acao clara
- Personalize com os dados fornecidos quando disponivel
- Nao use markdown, apenas texto puro para WhatsApp`;

    try {
      const result = await this.model.generateContent(`${systemPrompt}\n\nSolicitacao: ${prompt}`);
      const response = result.response;
      return response.text().trim();
    } catch (error) {
      logger.error(error, "Erro ao gerar mensagem customizada");
      throw new Error("Falha ao gerar mensagem com IA");
    }
  }

  async analyzeMessage(message: string): Promise<AIAnalysisResult> {
    const prompt = `Analise a seguinte mensagem de WhatsApp e retorne um JSON com:
- sentiment: "positive", "negative" ou "neutral"
- intent: intencao principal do remetente (ex: "interesse_compra", "reclamacao", "duvida", "agradecimento")
- suggestedResponse: uma sugestao de resposta curta e profissional em portugues
- keywords: array com palavras-chave principais

Mensagem: "${message}"

Retorne APENAS o JSON valido, sem markdown.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error(error, "Erro ao analisar mensagem");
      return {
        sentiment: "neutral",
        intent: "indefinido",
        suggestedResponse: "Obrigado pela mensagem! Como posso ajudar?",
        keywords: []
      };
    }
  }

  async improveMessage(originalMessage: string, instructions: string = ""): Promise<string> {
    const prompt = `Melhore a seguinte mensagem de WhatsApp Business mantendo a essencia:

Mensagem original: "${originalMessage}"
${instructions ? `Instrucoes adicionais: ${instructions}` : ""}

Regras:
- Mantenha o tom profissional mas amigavel
- Corrija erros gramaticais
- Melhore a clareza e persuasao
- Maximo 3 paragrafos
- Use emojis moderadamente
- Retorne APENAS a mensagem melhorada, sem explicacoes`;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      logger.error(error, "Erro ao melhorar mensagem");
      throw new Error("Falha ao melhorar mensagem");
    }
  }

  async generateBulkVariations(baseMessage: string, count: number = 5): Promise<string[]> {
    const prompt = `Gere ${count} variacoes da seguinte mensagem de WhatsApp Business.
Cada variacao deve manter a mesma intencao mas com palavras diferentes para evitar bloqueio por spam.

Mensagem base: "${baseMessage}"

Retorne APENAS um JSON array com as ${count} variacoes. Sem markdown.`;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error(error, "Erro ao gerar variacoes");
      return [baseMessage];
    }
  }

  async generateFromTemplate(templateName: string, variables: Record<string, string>): Promise<string> {
    const templates: Record<string, string> = {
      welcome: `Crie uma mensagem de boas-vindas para um novo lead chamado {nome} que demonstrou interesse em {produto}. Mencione {empresa} como a empresa.`,
      followup: `Crie uma mensagem de follow-up para {nome}. Ultimo contato foi sobre {assunto}. Empresa: {empresa}.`,
      promotion: `Crie uma mensagem promocional sobre {produto} com desconto de {desconto}. Para o cliente {nome}. Empresa: {empresa}.`,
      reactivation: `Crie uma mensagem para reativar o cliente {nome} que nao compra ha {tempo}. Empresa: {empresa}. Oferta: {oferta}.`,
      appointment: `Crie uma mensagem confirmando agendamento para {nome} no dia {data} as {hora}. Empresa: {empresa}. Servico: {servico}.`,
      thankyou: `Crie uma mensagem de agradecimento pos-compra para {nome} que adquiriu {produto}. Empresa: {empresa}.`
    };

    let templatePrompt = templates[templateName] || templateName;
    
    for (const [key, value] of Object.entries(variables)) {
      templatePrompt = templatePrompt.replace(new RegExp(`{${key}}`, "g"), value);
    }

    return this.generateCustomMessage(templatePrompt);
  }
}
