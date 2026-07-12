import { GeminiService } from "./gemini";
import { aiRouter } from "./aiRouter";
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
  /** userId do solicitante — quando presente, usa o provider configurado pelo usuario */
  userId?: string;
  /** brandId do solicitante */
  brandId?: string;
}

interface AIAnalysisResult {
  sentiment: "positive" | "negative" | "neutral";
  intent: string;
  suggestedResponse: string;
  keywords: string[];
}

export class AIService {
  private readonly gemini = new GeminiService();

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
      const fullPrompt = `${systemPrompt}\n\nSolicitacao: ${prompt}`;
      const scope = { userId: options.userId, brandId: options.brandId };
      const result = await aiRouter.generateText(fullPrompt, scope, {
        functionKey: "text.whatsapp.legacy",
      });
      return result.text;
    } catch (error) {
      logger.error(error, "Erro ao gerar mensagem customizada");
      throw new Error("Falha ao gerar mensagem com IA");
    }
  }

  async analyzeMessage(
    message: string,
    scope?: { userId?: string; brandId?: string },
  ): Promise<AIAnalysisResult> {
    const prompt = `Analise a seguinte mensagem de WhatsApp e retorne um JSON com:
- sentiment: "positive", "negative" ou "neutral"
- intent: intencao principal do remetente (ex: "interesse_compra", "reclamacao", "duvida", "agradecimento")
- suggestedResponse: uma sugestao de resposta curta e profissional em portugues
- keywords: array com palavras-chave principais

Mensagem: "${message}"

Retorne APENAS o JSON valido, sem markdown.`;

    try {
      return await aiRouter.generateJson<AIAnalysisResult>(prompt, scope || {}, {
        functionKey: "text.message.analyze",
      });
    } catch (error) {
      logger.error(error, "Erro ao analisar mensagem");
      return {
        sentiment: "neutral",
        intent: "indefinido",
        suggestedResponse: "Obrigado pela mensagem! Como posso ajudar?",
        keywords: [],
      };
    }
  }

  async improveMessage(
    originalMessage: string,
    instructions: string = "",
    scope?: { userId?: string; brandId?: string },
  ): Promise<string> {
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
      const r = await aiRouter.generateText(prompt, scope || {}, {
        functionKey: "text.message.improve",
      });
      return r.text;
    } catch (error) {
      logger.error(error, "Erro ao melhorar mensagem");
      throw new Error("Falha ao melhorar mensagem");
    }
  }

  async generateBulkVariations(
    baseMessage: string,
    count: number = 5,
    scope?: { userId?: string; brandId?: string },
  ): Promise<string[]> {
    const prompt = `Gere ${count} variacoes da seguinte mensagem de WhatsApp Business.
Cada variacao deve manter a mesma intencao mas com palavras diferentes para evitar bloqueio por spam.

Mensagem base: "${baseMessage}"

Retorne APENAS um JSON array com as ${count} variacoes. Sem markdown.`;

    try {
      return await aiRouter.generateJson<string[]>(prompt, scope || {}, {
        functionKey: "text.message.variations",
      });
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
      thankyou: `Crie uma mensagem de agradecimento pos-compra para {nome} que adquiriu {produto}. Empresa: {empresa}.`,
    };

    let templatePrompt = templates[templateName] || templateName;
    for (const [key, value] of Object.entries(variables)) {
      templatePrompt = templatePrompt.replace(new RegExp(`{${key}}`, "g"), value);
    }

    return this.generateCustomMessage(templatePrompt);
  }
}