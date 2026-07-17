/**
 * Shared Instagram reply composition + send helpers.
 * Uses brandContextPack (global training + channel + catalog/KB/skills),
 * conversation history, communication contact registry, structured slots,
 * and multi-bubble split so long replies are not mid-cut.
 */

import { instagramService } from "./instagram";
import { aiRouter } from "./aiRouter";
import {
  buildBrandContextPack,
  buildCatalogAwareFallback,
  formatPackForPrompt,
} from "./brandContextPack";
import { bubbleDelayMs, splitMessageIntoBubbles } from "./messageSplit";
import { CHANNEL_HARD_CAPS, clampChannelMaxChars } from "./channelLimits";
import {
  detectFunnelStageLight,
  formatSalesModeBlock,
  igConversationId,
  matchConfiguredObjections,
} from "./salesChannelHelpers";
import { conversationMemoryService } from "./cognitive/conversationMemory";
import { EMPTY_MEMORY, type ReasoningTrace } from "./cognitive/types";
import {
  advanceFunnelFromSlots,
  extractSlotsFromHistory,
  formatHistoryLines,
  formatObjectiveAttendanceBlock,
  lastOutgoingFromHistory,
  mergeSlots,
  slotsToFacts,
  slotsToPreferences,
  stripMidConversationGreeting,
  upsertCommunicationContact,
  type HistoryMessage,
} from "./attendanceMemory";
import { logger } from "../utils/logger";

export interface ComposeReplyInput {
  brandId: string;
  userId: string;
  inboundText: string;
  fallbackMessage: string;
  iaGenerated?: boolean;
  /** Static message overrides AI when set and iaGenerated is false */
  mensagem?: string;
  maxChars?: number;
  extraPromptLines?: string[];
  username?: string;
  /** Instagram-scoped sender id — enables conversation memory + history */
  senderId?: string;
}

export interface ComposeReplyResult {
  reply: string;
  /** Bubbles ready to send sequentially (respects max_chars + split). */
  bubbles: string[];
  source: "static" | "faq" | "ai" | "fallback";
  max_chars: number;
}

/** Apply simple brand placeholders in templates. */
export function applyBrandPlaceholders(
  text: string,
  ctx?: { brand_name?: string; username?: string },
): string {
  return String(text || "")
    .replace(/\{brand\}/gi, ctx?.brand_name || "nossa loja")
    .replace(/\{marca\}/gi, ctx?.brand_name || "nossa loja")
    .replace(/\{username\}/gi, ctx?.username || "")
    .replace(/\{nome\}/gi, ctx?.username || "");
}

function toBubbles(
  text: string,
  maxChars: number,
  maxBubbles: number,
  split: boolean,
): string[] {
  const t = String(text || "").trim();
  if (!t) return [];
  if (!split || t.length <= maxChars) {
    return [t.length > maxChars ? t.slice(0, maxChars) : t];
  }
  return splitMessageIntoBubbles(t, maxChars, maxBubbles);
}

export async function composeInstagramReply(input: ComposeReplyInput): Promise<ComposeReplyResult> {
  const pack = await buildBrandContextPack({
    brandId: input.brandId,
    userId: input.userId,
    channel: "instagram",
    inboundText: input.inboundText,
  });

  const hard = CHANNEL_HARD_CAPS.instagram.text;
  const maxChars = clampChannelMaxChars(
    "instagram",
    input.maxChars || pack.max_chars || hard,
  );
  const maxBubbles = pack.max_bubbles || 3;
  const split = pack.split_long_replies !== false;
  const brandName = pack.brand_name || "nossa loja";

  // Static template
  if (input.mensagem && input.iaGenerated === false) {
    const reply = applyBrandPlaceholders(input.mensagem, {
      brand_name: brandName,
      username: input.username,
    });
    return {
      reply,
      bubbles: toBubbles(reply, maxChars, maxBubbles, split),
      source: "static",
      max_chars: maxChars,
    };
  }

  // FAQ: channel + pack
  const settings = await instagramService.getAiSettings(input.brandId);
  const faqSettings = {
    ...settings,
    faq: [...(Array.isArray(settings.faq) ? (settings.faq as any[]) : []), ...pack.faq],
  };
  const faqHit = instagramService.matchFaqAnswer(faqSettings, input.inboundText);
  if (faqHit) {
    const reply = applyBrandPlaceholders(faqHit, {
      brand_name: brandName,
      username: input.username,
    });
    // Still register contact / memory lightly so next AI turn has context
    void persistAttendanceContext(input, pack.sales_mode, null, null, "faq");
    return {
      reply,
      bubbles: toBubbles(reply, maxChars, maxBubbles, split),
      source: "faq",
      max_chars: maxChars,
    };
  }

  let reply = applyBrandPlaceholders(
    input.fallbackMessage ||
      input.mensagem ||
      `Oi! Recebemos sua mensagem na {brand} 💚 Em breve retornamos.`,
    { brand_name: brandName, username: input.username },
  );
  let source: ComposeReplyResult["source"] = "fallback";

  // ── Conversation context (history + memory + slots) ──────────────────────
  // Always key by sender when available (not only when sales_mode is on)
  const convId = input.senderId ? igConversationId(input.brandId, input.senderId) : "";

  let historyMessages: HistoryMessage[] = [];
  let historyLines: string[] = [];
  let lastOutgoing: string[] = [];
  let memoryBlock = "";
  let mem = convId ? EMPTY_MEMORY(convId) : null;
  let slots = extractSlotsFromHistory([], input.inboundText);

  if (convId && input.senderId) {
    try {
      const rows = await instagramService.listMessagesForSender(
        input.brandId,
        input.senderId,
        25,
      );
      historyMessages = rows.map((r) => ({
        direction: r.direction,
        text: r.text,
        created_at: r.created_at,
      }));
      // Exclude the very latest inbound if it is a duplicate of current (already stored)
      const last = historyMessages[historyMessages.length - 1];
      const inboundNorm = String(input.inboundText || "").trim();
      if (
        last?.direction === "incoming" &&
        String(last.text || "").trim() === inboundNorm
      ) {
        // keep it — extractor needs full history including current
      }
      historyLines = formatHistoryLines(historyMessages, 20);
      lastOutgoing = lastOutgoingFromHistory(historyMessages, 3);
      slots = extractSlotsFromHistory(historyMessages, input.inboundText);

      mem = (await conversationMemoryService.load(convId)) || EMPTY_MEMORY(convId);
      // Prefer slots already stored in memory preferences
      if (mem.preferences?.uso && !slots.use_case) {
        slots = mergeSlots(slots, {
          use_case: mem.preferences.uso as any,
          confirmed_facts: [`uso=${mem.preferences.uso}`],
        });
      }
      if (mem.preferences?.intencao === "comprar") {
        slots = mergeSlots(slots, { purchase_intent: true });
      }
      memoryBlock = conversationMemoryService.toPromptBlock(mem);
    } catch (e: any) {
      logger.warn(`[composeIG] history/memory load failed: ${e?.message || e}`);
    }

    // Register / update communication contact (fire-and-forget after compose too)
    try {
      await upsertCommunicationContact({
        brandId: input.brandId,
        channel: "instagram",
        externalId: input.senderId,
        username: input.username || null,
        conversationId: convId,
        slots,
        bumpMessage: true,
      });
    } catch {
      /* ignore */
    }
  }

  const lightStage = detectFunnelStageLight(input.inboundText);
  const stage = advanceFunnelFromSlots(slots, lightStage);
  const salesBlock =
    pack.sales_mode !== "off"
      ? formatSalesModeBlock(pack.sales_mode, stage, pack.objections || [])
      : "";
  const hitObjections = matchConfiguredObjections(input.inboundText, pack.objections || []);
  const objectiveBlock = formatObjectiveAttendanceBlock(slots, {
    turnCount: mem?.turn_count || 0,
    historyDepth: historyLines.length,
  });

  if (input.iaGenerated !== false) {
    try {
      const historyBlock = historyLines.length
        ? `HISTÓRICO DESTA CONVERSA (mais antigo → mais novo — use para NÃO repetir perguntas nem reiniciar atendimento):\n${historyLines.join("\n")}`
        : "HISTÓRICO: (primeira mensagem ou histórico indisponível)";

      const lastOutBlock = lastOutgoing.length
        ? `SUAS ÚLTIMAS RESPOSTAS NESTA CONVERSA (não repetir abertura/estrutura):\n${lastOutgoing
            .map((m, i) => `R${i + 1}: ${m}`)
            .join("\n")}`
        : "";

      const antiLoop =
        historyLines.length >= 2
          ? [
              "ANTI-LOOP:",
              "- Não cumprimente de novo se já houve troca de mensagens.",
              "- Não pergunte casa/negócio/revenda se o uso já aparece no histórico ou na memória.",
              "- Se o cliente disse 'quero comprar', avance para produto+preço+quantidade — não reabra segmentação.",
            ].join("\n")
          : "";

      const lines = [
        formatPackForPrompt(pack, input.inboundText),
        salesBlock,
        memoryBlock,
        objectiveBlock,
        historyBlock,
        lastOutBlock,
        antiLoop,
        hitObjections.length
          ? `Objeção detectada no texto — priorize: ${hitObjections.map((o) => o.response).join(" | ")}`
          : "",
        ...(input.extraPromptLines || []),
      ];
      if (input.username) lines.push(`Usuario Instagram: @${input.username}`);
      if (slots.name) lines.push(`Nome do cliente (registrado): ${slots.name}`);

      const aiResp = await aiRouter.generateText(
        lines.filter(Boolean).join("\n\n"),
        { userId: input.userId, brandId: input.brandId },
        { functionKey: "text.instagram.reply", temperature: 0.55 },
      );
      const generated = String(aiResp?.text || "").trim();
      if (generated) {
        reply = stripMidConversationGreeting(generated, historyLines.length);
        source = "ai";
      }
    } catch (e: any) {
      logger.warn(`[composeIG] AI generate failed: ${e?.message || e}`);
    }
  }

  // Deterministic catalog fallback
  if (source === "fallback" && pack.catalog_items?.length) {
    const catalogReply = buildCatalogAwareFallback(
      pack.catalog_items,
      input.inboundText,
      brandName,
      maxChars,
    );
    if (catalogReply) {
      reply = catalogReply;
      source = "fallback";
    }
  }

  // Persist real memory (facts + preferences + contact slots)
  if (convId) {
    void persistAttendanceContext(input, pack.sales_mode, mem, slots, source, {
      stage,
      hitObjections: hitObjections.map((o) => o.signal),
      salesBlock,
      tone: pack.tone,
      historyDepth: historyLines.length,
    });
  }

  return {
    reply,
    bubbles: toBubbles(reply, maxChars, maxBubbles, split),
    source,
    max_chars: maxChars,
  };
}

async function persistAttendanceContext(
  input: ComposeReplyInput,
  _salesMode: string,
  mem: ReturnType<typeof EMPTY_MEMORY> | null,
  slots: ReturnType<typeof extractSlotsFromHistory> | null,
  source: string,
  meta?: {
    stage?: any;
    hitObjections?: string[];
    salesBlock?: string;
    tone?: string;
    historyDepth?: number;
  },
): Promise<void> {
  if (!input.senderId) return;
  const convId = igConversationId(input.brandId, input.senderId);
  try {
    const currentSlots =
      slots || extractSlotsFromHistory([], input.inboundText);
    await upsertCommunicationContact({
      brandId: input.brandId,
      channel: "instagram",
      externalId: input.senderId,
      username: input.username || null,
      conversationId: convId,
      slots: currentSlots,
      bumpMessage: source === "faq" || source === "fallback",
    });

    // Save structured conversation memory on AI (and also when we learned slots on any path)
    const facts = slotsToFacts(currentSlots);
    const prefs = slotsToPreferences(currentSlots);
    if (!facts.length && source !== "ai") return;

    const base = mem || (await conversationMemoryService.load(convId)) || EMPTY_MEMORY(convId);
    const stage = meta?.stage || advanceFunnelFromSlots(currentSlots, detectFunnelStageLight(input.inboundText));

    // Real bot-signal detection for IG memory (was hardcoded false — score never rose)
    let botDetected = false;
    let botSignals: string[] = [];
    try {
      const { detectBotPhrases } = await import("./botLoopGuard");
      botSignals = detectBotPhrases(input.inboundText);
      botDetected = botSignals.length >= 2 || (botSignals.length >= 1 && /op[cç][aã]o|menu|protocolo|digite\s+\d/i.test(input.inboundText));
    } catch {
      /* ignore */
    }

    const lightTrace = {
      emotional_state: "neutral" as const,
      frustration_signals: [] as string[],
      bot_interaction_detected: botDetected,
      bot_signals: botSignals.slice(0, 6),
      surface_intent: input.inboundText.slice(0, 120),
      real_intent: currentSlots.purchase_intent
        ? "quer comprar"
        : input.inboundText.slice(0, 120),
      funnel_stage: stage,
      mentioned_products: currentSlots.product_hint ? [currentSlots.product_hint] : [],
      objections_detected: meta?.hitObjections || [],
      pending_facts_to_address: currentSlots.missing_slots.slice(0, 3),
      facts_learned_this_turn: facts,
      response_strategy:
        currentSlots.next_action || String(meta?.salesBlock || "").slice(0, 200),
      tone_adjustment: meta?.tone || "natural",
      must_acknowledge: currentSlots.use_case ? [`uso=${currentSlots.use_case}`] : [],
      must_avoid: [
        "reperguntar uso já informado",
        "reiniciar com Olá se conversa avançada",
        "menu genérico de segmentação com intenção clara",
      ],
      risks: [],
      should_escalate: false,
      escalation_reason: null,
      confidence: source === "ai" ? 0.7 : 0.5,
    } as ReasoningTrace;

    const merged = await conversationMemoryService.merge(convId, base, lightTrace, {
      preferences: prefs,
      customer_name: currentSlots.name || null,
      extra_facts: facts,
    });
    await conversationMemoryService.save(merged);
  } catch (e: any) {
    logger.warn(`[composeIG] persistAttendanceContext failed: ${e?.message || e}`);
  }
}

/**
 * Send one or more bubbles. Prefer multi-bubble when compose returns bubbles.
 */
export async function sendInstagramDm(
  brandId: string,
  recipientId: string,
  text: string,
  opts?: { bubbles?: string[]; delayBetweenMs?: boolean },
): Promise<{ ok: boolean; error?: string; messageId?: string; bubblesSent?: number }> {
  const hard = CHANNEL_HARD_CAPS.instagram.text;
  let bubbles = opts?.bubbles?.filter(Boolean);
  if (!bubbles?.length) {
    const t = String(text || "").trim();
    bubbles = t.length <= hard ? [t] : splitMessageIntoBubbles(t, hard, 3);
  }
  if (!bubbles.length) return { ok: false, error: "empty message" };

  let lastId: string | undefined;
  for (let i = 0; i < bubbles.length; i++) {
    const chunk = bubbles[i].slice(0, hard);
    if (opts?.delayBetweenMs !== false && i > 0) {
      await new Promise((r) => setTimeout(r, bubbleDelayMs(i)));
    }
    const sent = await instagramService.sendDm(brandId, recipientId, chunk);
    if (!sent.ok) {
      return {
        ok: false,
        error: sent.error || "send failed",
        messageId: lastId,
        bubblesSent: i,
      };
    }
    lastId = sent.messageId || lastId;
  }
  return { ok: true, messageId: lastId, bubblesSent: bubbles.length };
}

/**
 * Send DM from automation mensagemSteps — uses quick_replies or button template
 * when botoes/cta/link blocks are present (Meta Instagram Messaging API).
 */
export async function sendInstagramDmFromPipeline(
  brandId: string,
  recipientId: string,
  steps: Array<Record<string, any>>,
  fallbackText?: string,
): Promise<{ ok: boolean; error?: string; messageId?: string; kind?: string }> {
  const { buildMessageFromPipelineSteps } = await import("./instagramMessagingPayloads");
  const built = buildMessageFromPipelineSteps(steps, fallbackText);
  return instagramService.sendDmBuilt(brandId, recipientId, built);
}

export async function sendInstagramCommentReply(
  brandId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string; replyId?: string }> {
  const hard = 1000; // IG comment reply practical limit
  return instagramService.replyToComment(brandId, commentId, String(text || "").slice(0, hard));
}

export function resolveMessageFromPipelineConfig(config: Record<string, any>): {
  mensagem?: string;
  fallback: string;
  iaGenerated: boolean;
  delaySegundos: number;
} {
  const steps = Array.isArray(config.mensagemSteps) ? config.mensagemSteps : [];
  const textStep = steps.find((s: any) => s?.tipo === "texto" && (s.caption || s.url));
  const mensagem =
    config.mensagem ||
    textStep?.caption ||
    (typeof config.iaPrompt === "string" && config.iaGenerated === false ? config.iaPrompt : undefined);

  return {
    mensagem: mensagem ? String(mensagem) : undefined,
    fallback: String(
      config.fallback_message ||
        config.fallbackMessage ||
        config.mensagem ||
        "Obrigado pela mensagem! Em breve retornamos.",
    ),
    iaGenerated: config.iaGenerated !== false && config.ia_generated !== false,
    delaySegundos: Math.max(0, Number(config.delaySegundos ?? config.delay_seconds) || 0),
  };
}
