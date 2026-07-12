/**
 * Shared Instagram reply composition + send helpers.
 * Uses brandContextPack (global training + channel + catalog/KB/skills)
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
  /** Instagram-scoped sender id — enables conversation memory */
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
  // Merge pack FAQ into settings-like object for matcher
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
      `Oi! Recebemos sua mensagem na {brand} 💚 Em breve retornamos. Digite *menu* para opções.`,
    { brand_name: brandName, username: input.username },
  );
  let source: ComposeReplyResult["source"] = "fallback";

  // Conversation memory + sales funnel (IG)
  const convId =
    input.senderId && pack.sales_mode !== "off"
      ? igConversationId(input.brandId, input.senderId)
      : "";
  let memoryBlock = "";
  if (convId) {
    try {
      const mem = await conversationMemoryService.load(convId);
      memoryBlock = conversationMemoryService.toPromptBlock(mem);
    } catch {
      /* ignore */
    }
  }
  const stage = detectFunnelStageLight(input.inboundText);
  const salesBlock = formatSalesModeBlock(pack.sales_mode, stage, pack.objections || []);
  const hitObjections = matchConfiguredObjections(input.inboundText, pack.objections || []);

  if (input.iaGenerated !== false) {
    try {
      const lines = [
        formatPackForPrompt(pack, input.inboundText),
        salesBlock,
        memoryBlock,
        hitObjections.length
          ? `Objeção detectada no texto — priorize: ${hitObjections.map((o) => o.response).join(" | ")}`
          : "",
        ...(input.extraPromptLines || []),
      ];
      if (input.username) lines.push(`Usuario Instagram: @${input.username}`);
      const aiResp = await aiRouter.generateText(
        lines.filter(Boolean).join("\n\n"),
        { userId: input.userId, brandId: input.brandId },
        { functionKey: "text.instagram.reply", temperature: 0.65 },
      );
      const generated = String(aiResp?.text || "").trim();
      if (generated) {
        reply = generated;
        source = "ai";
      }
    } catch {
      /* keep brand fallback template; catalog path below may still fill price */
    }
  }

  // Deterministic catalog fallback: if AI failed/empty but we have a product+price match
  if (source === "fallback" && pack.catalog_items?.length) {
    const catalogReply = buildCatalogAwareFallback(
      pack.catalog_items,
      input.inboundText,
      brandName,
      maxChars,
    );
    if (catalogReply) {
      reply = catalogReply;
      // Keep source as "fallback" so memory doesn't treat as full AI turn,
      // but consumers can detect price-bearing reply via content.
      source = "fallback";
    }
  }

  // Persist light memory for next IG turns (fire-and-forget)
  if (convId && source === "ai") {
    const lightTrace = {
      emotional_state: "neutral",
      frustration_signals: [],
      bot_interaction_detected: false,
      bot_signals: [],
      surface_intent: input.inboundText.slice(0, 120),
      real_intent: input.inboundText.slice(0, 120),
      funnel_stage: stage,
      mentioned_products: [],
      objections_detected: hitObjections.map((o) => o.signal),
      pending_facts_to_address: [],
      facts_learned_this_turn: [],
      response_strategy: salesBlock.slice(0, 200),
      tone_adjustment: pack.tone,
      must_acknowledge: [],
      must_avoid: [],
      risks: [],
      should_escalate: false,
      escalation_reason: null,
      confidence: 0.55,
    } as ReasoningTrace;
    conversationMemoryService
      .load(convId)
      .then((mem) => conversationMemoryService.merge(convId, mem || EMPTY_MEMORY(convId), lightTrace))
      .then((merged) => conversationMemoryService.save(merged))
      .catch(() => undefined);
  }

  return {
    reply,
    bubbles: toBubbles(reply, maxChars, maxBubbles, split),
    source,
    max_chars: maxChars,
  };
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
