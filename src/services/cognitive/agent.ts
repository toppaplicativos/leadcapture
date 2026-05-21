import { logger } from "../../utils/logger";
import { AIAgentProfileService } from "../aiAgentProfile";
import { KnowledgeBaseService } from "../knowledgeBase";
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
    if (!incomingMessage) throw new Error("incomingMessage is required");

    const conversationId = String(input.conversationId || "").trim();
    const history = Array.isArray(input.conversationHistory) ? input.conversationHistory.filter(Boolean) : [];
    const lastOutgoingMessages = (Array.isArray(input.lastOutgoingMessages) ? input.lastOutgoingMessages : []).slice(-3);

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
    const knowledgeBlock = kbContext ? `BASE DE CONHECIMENTO RELEVANTE:\n${kbContext}` : "";
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
      brandIdentityBlock,
      memoryBlock,
      lastOutgoingMessages,
      brandGuard,
      trace,
      maxLength: Math.max(180, Math.min(Number(profile.max_length || 500), 900)),
      includeEmojis: Boolean(profile.include_emojis),
      communicationRules: String(profile.communication_rules || "").trim(),
      trainingNotes: String(profile.training_notes || "").trim() || undefined,
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
