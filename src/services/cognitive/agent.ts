import { logger } from "../../utils/logger";
import { AIAgentProfileService } from "../aiAgentProfile";
import { KnowledgeBaseService } from "../knowledgeBase";
import { getActiveSkillsBlock } from "../brandSkillsRuntime";
import { ProductsService } from "../products";
import { offerCatalogService } from "../offerCatalog";
import { couponsService } from "../coupons";
import { queryOne } from "../../config/database";
import { Reasoner } from "./reasoner";
import { Composer } from "./composer";
import { conversationMemoryService } from "./conversationMemory";
import { buildBrandProtectionBlock, BrandGuardConfig } from "./skills/brandProtection";
import { buildProductIntelligenceBlock } from "./skills/productIntelligence";
import { buildCouponIntelligenceBlock } from "./skills/couponIntelligence";
import { decideResponse, SuggestedTone } from "./skills/responseGate";
import { silenceLogService } from "./silenceLog";
import { CognitiveInput, CognitiveOutput, EMPTY_MEMORY } from "./types";

/**
 * Top-level orchestrator for the cognitive pipeline.
 *
 * Pipeline:
 *   1. Load brand profile + memory + history + last outgoing replies + catalog + KB in parallel
 *   2. Reasoner pass → structured JSON analysis (intent, emotion, strategy)
 *   3. Composer pass → final WhatsApp text with humanization + brand guard checks (+ 1 retry if needed)
 *   4. Async: merge trace into conversation_memory (fire-and-forget — doesn't block response)
 */
export class CognitiveAgent {
  private readonly profileService = new AIAgentProfileService();
  private readonly knowledgeBaseService = new KnowledgeBaseService();
  private readonly productsService = new ProductsService();
  private readonly reasoner = new Reasoner();
  private readonly composer = new Composer();
  private productsUserScopeReady: boolean | null = null;

  private async ensureProductsUserScope(): Promise<boolean> {
    if (this.productsUserScopeReady !== null) return this.productsUserScopeReady;
    try {
      const row = await queryOne<any>("SHOW COLUMNS FROM products LIKE 'user_id'");
      this.productsUserScopeReady = Boolean(row);
    } catch {
      this.productsUserScopeReady = false;
    }
    return this.productsUserScopeReady;
  }

  private normalizeBrandId(value?: string | null): string | null {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  async respond(input: CognitiveInput): Promise<CognitiveOutput> {
    const t0 = Date.now();
    const userId = String(input.userId || "").trim();
    if (!userId) throw new Error("userId is required");
    const brandId = this.normalizeBrandId(input.brandId);
    const incomingMessage = String(input.incomingMessage || "").trim();
    /* Note: incomingMessage CAN be empty (sticker/reaction with no text);
     * the gate handles those. We only fail when both message AND type are absent. */
    const messageType = String(input.incomingMessageType || "text");
    if (!incomingMessage && messageType === "text") throw new Error("incomingMessage is required");

    const conversationId = String(input.conversationId || "").trim();
    const history = Array.isArray(input.conversationHistory) ? input.conversationHistory.filter(Boolean) : [];
    const lastOutgoingMessages = (Array.isArray(input.lastOutgoingMessages) ? input.lastOutgoingMessages : []).slice(-3);
    /* Detecta primeiro contato: history vazio = lead nunca recebeu resposta do agente */
    const isFirstMessage = history.length === 0;

    /* ── PASS 0: ResponseGate (Fase 16) ──
     * Cheap deterministic check BEFORE we spend tokens on Reasoner. Catches:
     * reactions, ack-only messages, single emojis, duplicate sends, echo of our own text.
     * When silenced, we return immediately — no LLM calls, no memory write. */
    const gate = decideResponse({
      incomingMessage,
      messageType: messageType as any,
      conversationHistory: history.filter((h) => !h.startsWith("Atendente:")).map((h) => h.replace(/^Lead:\s*/, "")),
      lastOutgoingMessages,
    });
    if (!gate.shouldRespond) {
      silenceLogService.record({
        conversationId,
        brandId,
        messageType,
        incomingMessage,
        reasonCode: gate.reasonCode,
        reasonHuman: gate.reasonHuman,
        confidence: gate.confidence,
      }).catch(() => { /* best-effort */ });
      logger.info(
        `[CognitiveAgent] SILENCED conv=${conversationId.slice(0,8) || "-"} type=${messageType} reason=${gate.reasonCode} (${gate.reasonHuman})`
      );
      return {
        text: "",
        reasoning: null,
        memory: null,
        shouldEscalate: false,
        escalationReason: null,
        knowledgeApplied: false,
        catalogApplied: false,
        silenced: true,
        silenceReason: gate.reasonHuman,
        silenceReasonCode: gate.reasonCode,
        latencyMs: { reasoner: 0, composer: 0, total: Date.now() - t0 },
      };
    }
    /* Tone hint flows into the Composer below for emotional adjustment. */
    const suggestedTone: SuggestedTone = gate.suggestedTone;

    /* Parallel load all context */
    const profile = await this.profileService.getByUserId(userId, brandId || undefined);
    const [kbContext, products, memory, activeCoupons] = await Promise.all([
      this.knowledgeBaseService.searchForContext(incomingMessage, userId, brandId || profile.company_id).catch(() => ""),
      this.loadProducts(userId, brandId).catch(() => [] as any[]),
      conversationMemoryService.load(conversationId).catch(() => null),
      couponsService.listActive(brandId).catch(() => []),
    ]);

    const catalogCore = buildProductIntelligenceBlock(products);
    const couponBlock = buildCouponIntelligenceBlock(activeCoupons);
    /* Catalog and coupons are presented as a single "commercial offer surface" to the LLM —
     * less prompt fragmentation, fewer chances for the agent to forget either. */
    const catalogBlock = [catalogCore, couponBlock].filter(Boolean).join("\n\n");
    const knowledgeBlockBase = kbContext ? `BASE DE CONHECIMENTO RELEVANTE:\n${kbContext}` : "";
    /* Skills treinaveis do brand (brand_skills) — matching por keyword/exemplo
       contra a msg do lead, executores opcionais. Resultado vai junto com
       knowledgeBlock no prompt do reasoner e composer. Falha eh silenciosa. */
    const skillsBlock = await getActiveSkillsBlock({
      userId,
      brandId: brandId || "",
      messageText: incomingMessage,
      maxSkills: 5,
    }).catch((e: any) => { logger.warn(`brand-skills runtime falhou: ${e?.message}`); return ""; });
    /* knowledgeBlock = apenas KB textual. skillsBlock fica separado pra ser
       posicionado no fim do prompt do Composer (maior peso de atenção do LLM)
       com instrução imperativa de execução — não passivo como contexto. */
    const knowledgeBlock = knowledgeBlockBase;
    const memoryBlock = conversationMemoryService.toPromptBlock(memory);

    const brandGuard: BrandGuardConfig = {
      agentName: profile.agent_name,
      preferredTerms: profile.preferred_terms || [],
      forbiddenTerms: profile.forbidden_terms || [],
      tone: profile.tone,
      language: profile.language || "pt-BR",
    };
    const brandIdentityBlock = buildBrandProtectionBlock(brandGuard);

    /* PASS 1: Reasoner */
    const tReasoner = Date.now();
    const trace = await this.reasoner.analyze({
      userId,
      brandId,
      incomingMessage,
      conversationHistory: history,
      catalogBlock,
      knowledgeBlock,
      skillsBlock,
      brandIdentityBlock,
      memoryBlock,
      lastOutgoingMessages,
    });
    const reasonerMs = Date.now() - tReasoner;

    /* Early escalation if reasoner flagged it */
    if (trace.should_escalate) {
      this.persistMemoryAsync(conversationId, memory, trace);
      return {
        text: "",
        reasoning: trace,
        memory,
        shouldEscalate: true,
        escalationReason: trace.escalation_reason || "reasoner_escalation",
        knowledgeApplied: Boolean(knowledgeBlock),
        catalogApplied: Boolean(catalogBlock),
        latencyMs: {
          reasoner: reasonerMs,
          composer: 0,
          total: Date.now() - t0,
        },
      };
    }

    /* PASS 2: Composer */
    const tComposer = Date.now();
    const composed = await this.composer.compose({
      userId,
      brandId,
      incomingMessage,
      conversationHistory: history,
      catalogBlock,
      knowledgeBlock,
      skillsBlock,
      brandIdentityBlock,
      memoryBlock,
      lastOutgoingMessages,
      brandGuard,
      trace,
      maxLength: Math.max(180, Math.min(Number(profile.max_length || 500), 900)),
      includeEmojis: Boolean(profile.include_emojis),
      communicationRules: String(profile.communication_rules || "").trim(),
      trainingNotes: String(profile.training_notes || "").trim() || undefined,
      /* Fase 16.5 — emotional intelligence: gate detected the lead's tone
       * (seco/amigavel/respeitoso) so the Composer can match register. */
      suggestedTone,
      /* Abordagem inicial — guia humanizacao na primeira mensagem */
      isFirstMessage,
      firstContactScript: String(profile.first_contact_script || "").trim() || undefined,
    });
    const composerMs = Date.now() - tComposer;

    /* PASS 3: persist memory (fire-and-forget) */
    this.persistMemoryAsync(conversationId, memory, trace);

    const totalMs = Date.now() - t0;
    logger.info(
      `[CognitiveAgent] reply ready conv=${conversationId || "-"} stage=${trace.funnel_stage} emo=${trace.emotional_state} retries=${composed.retries} t=${totalMs}ms (R=${reasonerMs} C=${composerMs})`
    );

    return {
      text: composed.text,
      reasoning: trace,
      memory,
      shouldEscalate: false,
      escalationReason: null,
      knowledgeApplied: Boolean(knowledgeBlock),
      catalogApplied: Boolean(catalogBlock),
      latencyMs: {
        reasoner: reasonerMs,
        composer: composerMs,
        total: totalMs,
      },
    };
  }

  private async loadProducts(userId: string, brandId: string | null): Promise<any[]> {
    const hasUserScope = await this.ensureProductsUserScope();
    const products: any[] = hasUserScope
      ? await this.productsService.getActiveProducts(userId, brandId)
      : await this.productsService.getActiveProducts(undefined, brandId);
    /* Attach variants in one batch query so the agent reasons with sizes/colors/weights */
    if (products.length > 0) {
      try {
        const variantsByProduct = await offerCatalogService.getVariantsByProductIds(
          products.map((p) => String(p.id || "")).filter(Boolean)
        );
        for (const p of products) {
          (p as any).variants = variantsByProduct.get(String(p.id)) || [];
        }
      } catch (e: any) {
        logger.warn(`failed to attach variants to agent products: ${e?.message || e}`);
      }
    }
    /* Resolve bundle item names from the same product list so the agent doesn't see opaque IDs */
    const productsById = new Map(products.map((p) => [String(p.id), p]));
    for (const p of products) {
      const items = Array.isArray((p as any).bundle_items) ? (p as any).bundle_items : [];
      if (items.length === 0) continue;
      (p as any).bundle_items = items.map((bi: any) => {
        if (bi?.note) return bi;
        const found = productsById.get(String(bi?.product_id || ""));
        return {
          ...bi,
          note: found?.name || bi.note || undefined,
        };
      });
    }
    return products;
  }

  private persistMemoryAsync(conversationId: string, current: ReturnType<typeof EMPTY_MEMORY> | null, trace: Awaited<ReturnType<Reasoner["analyze"]>>): void {
    if (!conversationId) return;
    const baseline = current || EMPTY_MEMORY(conversationId);
    /* fire-and-forget: don't block reply */
    conversationMemoryService
      .merge(conversationId, baseline, trace)
      .then((merged) => conversationMemoryService.save(merged))
      .catch((e) => logger.warn(`memory persist failed: ${e?.message || e}`));
  }
}

export const cognitiveAgent = new CognitiveAgent();
