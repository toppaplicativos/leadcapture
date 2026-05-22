import { queryOne } from "../config/database";
import { AIService } from "./ai";
import { AIAgentProfileService } from "./aiAgentProfile";
import { KnowledgeBaseService } from "./knowledgeBase";
import { ProductsService } from "./products";
import { logger } from "../utils/logger";
import { cognitiveAgent } from "./cognitive";

type GenerateWhatsAppReplyInput = {
  userId: string;
  brandId?: string | null;
  conversationId?: string | null;
  incomingMessage: string;
  conversationHistory?: string[];
  lastOutgoingMessages?: string[];
  maxHistoryLines?: number;
  /** Fase 16 — Baileys event type so ResponseGate can detect reactions/stickers. */
  incomingMessageType?: string;
};

type GenerateWhatsAppReplyResult = {
  text: string;
  profile: Awaited<ReturnType<AIAgentProfileService["getByUserId"]>>;
  knowledgeApplied: boolean;
  catalogApplied: boolean;
  shouldEscalate?: boolean;
  escalationReason?: string;
  /** Fase 16 — when the agent silenced (no text to send), this carries why. */
  silenced?: boolean;
  silenceReason?: string;
  cognitive?: {
    used: boolean;
    funnel_stage?: string;
    emotional_state?: string;
    confidence?: number;
    retries?: number;
    reasoner_ms?: number;
    composer_ms?: number;
    total_ms?: number;
    fallback_reason?: string;
  };
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

    // ── RULE: Pause AI outside business hours (18h-8h) ──
    // Check store settings for squad_rules
    let squadRules: Record<string, boolean> = {};
    try {
      const storeRow = await queryOne<any>(
        `SELECT settings_json FROM storefront_stores WHERE owner_user_id = ? AND brand_id = ? LIMIT 1`,
        [userId, brandId || ""]
      );
      const settings = storeRow?.settings_json ? (typeof storeRow.settings_json === 'string' ? JSON.parse(storeRow.settings_json) : storeRow.settings_json) : {};
      squadRules = settings?.squad_rules || {};
    } catch {}

    if (squadRules.pause_outside_hours) {
      const now = new Date();
      const hour = now.getHours(); // Server timezone (usually BRT)
      if (hour >= 18 || hour < 8) {
        logger.info(`AI paused outside business hours (${hour}h) — manual mode`);
        return {
          text: '', // Don't respond
          profile,
          knowledgeApplied: false,
          catalogApplied: false,
          shouldEscalate: true,
          escalationReason: 'outside_business_hours',
        };
      }
    }

    // ── SKILL: Context Curator — detect bots, qualify conversations ──
    const lowerMsg = incomingMessage.toLowerCase();

    // 1. Detect if response comes from another automation/bot
    const botSignals = [
      'digite', 'tecle', 'pressione', 'opcao', 'opção',
      'menu principal', 'voltar ao menu', 'atendimento eletronico',
      'para falar com', 'escolha uma das opcoes', 'escolha uma das opções',
      'não entendi, pode repetir', 'nao entendi, pode repetir',
      'obrigado por entrar em contato', 'seu protocolo',
      'aguarde um momento', 'transferindo para',
      'horario de atendimento', 'horário de atendimento',
      'fora do horario', 'fora do horário',
      'esta mensagem e automatica', 'esta mensagem é automática',
      'mensagem automatica', 'mensagem automática',
      'selecione.*\\d', // "selecione 1, 2, 3"
    ];
    const isBotResponse = botSignals.some(signal => {
      if (signal.includes('*')) return new RegExp(signal, 'i').test(lowerMsg);
      return lowerMsg.includes(signal);
    });
    // Also check: very structured messages with numbers as options
    const hasMenuPattern = /^\d[\.\)\-]\s|^[a-z]\)\s/m.test(incomingMessage);
    const isLikelyBot = isBotResponse || hasMenuPattern;

    if (isLikelyBot) {
      logger.info(`Bot detection: message from ${input.conversationHistory?.length || 0}-msg convo flagged as automation`);
      // Don't respond to bots — pause and flag for human review
      return {
        text: '', // Empty = don't send
        profile,
        knowledgeApplied: false,
        catalogApplied: false,
        shouldEscalate: true,
        escalationReason: 'bot_detected',
      };
    }

    // 2. Check for human escalation requests
    const escalationKeywords = ['atendente', 'humano', 'pessoa real', 'falar com alguem', 'gerente', 'supervisor', 'reclamacao', 'reclamar', 'problema grave', 'cancelar tudo'];
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

    // 3. COGNITIVE PIPELINE — primary path. Falls back to legacy single-pass on failure.
    try {
      const cognitive = await cognitiveAgent.respond({
        userId,
        brandId,
        conversationId: input.conversationId || null,
        incomingMessage,
        incomingMessageType: input.incomingMessageType || "text",
        conversationHistory: recentHistory,
        lastOutgoingMessages: Array.isArray(input.lastOutgoingMessages)
          ? input.lastOutgoingMessages.map((m) => String(m || "").trim()).filter(Boolean)
          : [],
      });

      /* Fase 16 — agent decided not to respond (reaction / ack / silence). Return
       * a clearly-marked empty reply so the inbox layer doesn't queue or send anything. */
      if ((cognitive as any).silenced) {
        return {
          text: "",
          profile,
          knowledgeApplied: false,
          catalogApplied: false,
          silenced: true,
          silenceReason: (cognitive as any).silenceReason || "gate",
          cognitive: {
            used: true,
            total_ms: cognitive.latencyMs.total,
          } as any,
        };
      }

      if (cognitive.shouldEscalate) {
        return {
          text: "",
          profile,
          knowledgeApplied: cognitive.knowledgeApplied,
          catalogApplied: cognitive.catalogApplied,
          shouldEscalate: true,
          escalationReason: cognitive.escalationReason || "cognitive_escalation",
          cognitive: {
            used: true,
            funnel_stage: cognitive.reasoning?.funnel_stage,
            emotional_state: cognitive.reasoning?.emotional_state,
            confidence: cognitive.reasoning?.confidence,
            reasoner_ms: cognitive.latencyMs.reasoner,
            composer_ms: cognitive.latencyMs.composer,
            total_ms: cognitive.latencyMs.total,
          },
        };
      }

      const text = String(cognitive.text || "").trim();
      if (text) {
        return {
          text,
          profile,
          knowledgeApplied: cognitive.knowledgeApplied,
          catalogApplied: cognitive.catalogApplied,
          cognitive: {
            used: true,
            funnel_stage: cognitive.reasoning?.funnel_stage,
            emotional_state: cognitive.reasoning?.emotional_state,
            confidence: cognitive.reasoning?.confidence,
            reasoner_ms: cognitive.latencyMs.reasoner,
            composer_ms: cognitive.latencyMs.composer,
            total_ms: cognitive.latencyMs.total,
          },
        };
      }
      logger.warn("Cognitive pipeline returned empty text — falling back to legacy path");
    } catch (e: any) {
      logger.warn(`Cognitive pipeline failed (${e?.message || e}) — falling back to legacy path`);
    }

    /* LEGACY FALLBACK — preserves prior behavior if cognitive path fails */
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
      userId,
      brandId: brandId || undefined,
    });

    return {
      text: String(text || "").trim(),
      profile,
      knowledgeApplied: Boolean(kbContext),
      catalogApplied: Boolean(catalogContext),
      cognitive: { used: false, fallback_reason: "legacy_path" },
    };
  }
}
