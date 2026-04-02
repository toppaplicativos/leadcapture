import { queryOne } from "../config/database";
import { AIService } from "./ai";
import { AIAgentProfileService } from "./aiAgentProfile";
import { KnowledgeBaseService } from "./knowledgeBase";
import { ProductsService } from "./products";
import { logger } from "../utils/logger";

type GenerateWhatsAppReplyInput = {
  userId: string;
  brandId?: string | null;
  incomingMessage: string;
  conversationHistory?: string[];
  maxHistoryLines?: number;
};

type GenerateWhatsAppReplyResult = {
  text: string;
  profile: Awaited<ReturnType<AIAgentProfileService["getByUserId"]>>;
  knowledgeApplied: boolean;
  catalogApplied: boolean;
  shouldEscalate?: boolean;
  escalationReason?: string;
};

export class WhatsAppAgentService {
  private readonly aiService = new AIService();
  private readonly aiAgentProfileService = new AIAgentProfileService();
  private readonly knowledgeBaseService = new KnowledgeBaseService();
  private readonly productsService = new ProductsService();
  private productsUserScopeReady: boolean | null = null;

  private normalizeBrandId(value?: string | null): string | null {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  private async ensureProductsUserScope(): Promise<boolean> {
    if (this.productsUserScopeReady !== null) return this.productsUserScopeReady;
    const row = await queryOne<any>("SHOW COLUMNS FROM products LIKE 'user_id'");
    this.productsUserScopeReady = Boolean(row);
    return this.productsUserScopeReady;
  }

  private buildCatalogContext(products: any[]): string {
    const lines = products
      .slice(0, 12)
      .map((product, index) => {
        const name = String(product?.name || "").trim();
        const category = String(product?.category || "").trim();
        const description = String(product?.description || "").trim().replace(/\s+/g, " ").slice(0, 160);
        const price = Number(product?.price || 0);
        const promoPrice = Number(product?.promoPrice || 0);
        const features = Array.isArray(product?.features)
          ? product.features.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 3)
          : [];

        const priceLabel = promoPrice > 0
          ? `R$ ${promoPrice.toFixed(2)} promocional (de R$ ${price.toFixed(2)})`
          : price > 0
          ? `R$ ${price.toFixed(2)}`
          : "preço sob consulta";

        return [
          `${index + 1}. ${name}`,
          category ? `categoria: ${category}` : "",
          priceLabel,
          description ? `descrição: ${description}` : "",
          features.length ? `destaques: ${features.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
      })
      .filter(Boolean);

    if (!lines.length) return "";

    return [
      "CATALOGO OFICIAL DA BRAND:",
      ...lines,
      "REGRA CRÍTICA: cite apenas produtos, categorias e preços presentes nesta lista. Se o item pedido não estiver aqui, diga que vai confirmar internamente antes de prometer qualquer coisa.",
    ].join("\n");
  }

  private async getCatalogContext(userId: string, brandId?: string | null): Promise<string> {
    try {
      const normalizedBrandId = this.normalizeBrandId(brandId);
      const hasUserScope = await this.ensureProductsUserScope();
      const products = hasUserScope
        ? await this.productsService.getActiveProducts(userId, normalizedBrandId)
        : await this.productsService.getActiveProducts(undefined, normalizedBrandId);
      return this.buildCatalogContext(products);
    } catch (error: any) {
      logger.warn(`Failed to build WhatsApp catalog context: ${error?.message || error}`);
      return "";
    }
  }

  private buildWhatsAppOperatingBlock(profile: Awaited<ReturnType<AIAgentProfileService["getByUserId"]>>): string {
    const rules: string[] = [
      "CANAL: WhatsApp.",
      "Responda como consultor comercial humano e ágil, sem parecer robótico.",
      "Escreva em blocos curtos, com leitura fácil no celular.",
      "Faça no máximo 1 pergunta objetiva por mensagem quando precisar avançar a conversa.",
      "Se houver intenção de compra, priorize qualificação, próximo passo e clareza comercial.",
      "Não use markdown, listas longas ou texto excessivo.",
      "Não invente prazo, estoque, preço, promoção, política ou garantia.",
      "Se faltar informação, admita isso e diga que vai confirmar.",
      "Quando fizer sentido, proponha continuação natural da conversa no próprio WhatsApp.",
    ];

    if (profile.objective?.trim()) {
      rules.push(`META DE NEGÓCIO: ${profile.objective.trim()}`);
    }

    return rules.join("\n");
  }

  async generateReply(input: GenerateWhatsAppReplyInput): Promise<GenerateWhatsAppReplyResult> {
    const userId = String(input.userId || "").trim();
    if (!userId) {
      throw new Error("userId is required");
    }

    const brandId = this.normalizeBrandId(input.brandId);
    const incomingMessage = String(input.incomingMessage || "").trim();
    if (!incomingMessage) {
      throw new Error("incomingMessage is required");
    }

    const historyLines = Array.isArray(input.conversationHistory)
      ? input.conversationHistory.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const recentHistory = historyLines.slice(-Math.max(1, Math.min(Number(input.maxHistoryLines || 12), 20)));

    const profile = await this.aiAgentProfileService.getByUserId(userId, brandId || undefined);
    // Check for escalation triggers before generating
    const escalationKeywords = ['atendente', 'humano', 'pessoa real', 'falar com alguem', 'gerente', 'supervisor', 'reclamacao', 'reclamar', 'problema grave', 'cancelar tudo'];
    const lowerMsg = incomingMessage.toLowerCase();
    const shouldEscalate = escalationKeywords.some(kw => lowerMsg.includes(kw));
    if (shouldEscalate) {
      return {
        text: `Entendi! Vou transferir você para um atendente humano agora. Um momento, por favor. 🙏`,
        profile,
        knowledgeApplied: false,
        catalogApplied: false,
        shouldEscalate: true,
        escalationReason: 'customer_requested_human',
      };
    }

    // Fetch context with error resilience
    const results = await Promise.allSettled([
      this.knowledgeBaseService.searchForContext(incomingMessage, userId, brandId || profile.company_id),
      Promise.resolve(this.aiAgentProfileService.buildBehaviorBlock(profile)),
      Promise.resolve(this.buildWhatsAppOperatingBlock(profile)),
      this.getCatalogContext(userId, brandId),
    ]);
    const kbContext = results[0].status === 'fulfilled' ? results[0].value : '';
    const behaviorBlock = results[1].status === 'fulfilled' ? results[1].value : '';
    const whatsappBlock = results[2].status === 'fulfilled' ? results[2].value : '';
    const catalogContext = results[3].status === 'fulfilled' ? results[3].value : '';

    const mergedContext = [
      recentHistory.length ? `HISTÓRICO RECENTE:\n${recentHistory.join("\n")}` : "",
      whatsappBlock,
      behaviorBlock,
      catalogContext,
      kbContext ? `BASE DE CONHECIMENTO RELEVANTE:\n${kbContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const text = await this.aiService.generateCustomMessage(incomingMessage, {
      tone: profile.tone,
      context: mergedContext,
      maxLength: Math.max(180, Math.min(Number(profile.max_length || 500), 900)),
      language: profile.language,
      includeEmojis: profile.include_emojis,
      agentName: profile.agent_name,
      objective: profile.objective,
      trainingNotes: profile.training_notes,
      preferredTerms: profile.preferred_terms,
      forbiddenTerms: profile.forbidden_terms,
      communicationRules: [
        String(profile.communication_rules || "").trim(),
        "Sempre mantenha a resposta pronta para WhatsApp: curta, útil e com próximo passo claro.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return {
      text: String(text || "").trim(),
      profile,
      knowledgeApplied: Boolean(kbContext),
      catalogApplied: Boolean(catalogContext),
    };
  }
}
