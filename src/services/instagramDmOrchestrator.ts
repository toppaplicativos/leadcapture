/**
 * Unified Instagram DM reply orchestration (per brand).
 *
 * Standard pattern for every brand:
 *  1) dm_keyword  — active automations whose palavrasChave match the inbound text
 *  2) resposta_padrao_dm — default template/behavior when no keyword wins
 *
 * Both paths use the same automation_definitions + hybrid dispatcher.
 * Content is brand-scoped (AI settings persona/FAQ/guidelines + def pipeline templates).
 */

import { logger } from "../utils/logger";
import { dispatchInstagramEvent } from "./instagramEventDispatcher";
import { instagramService } from "./instagram";

export type HandleIncomingDmInput = {
  brandId: string;
  userId: string;
  igUserId: string;
  senderId: string;
  messageText: string;
  messageId: string;
  postbackPayload?: string;
  postbackTitle?: string;
  isButton?: boolean;
};

export type HandleIncomingDmResult = {
  path: "keyword" | "default" | "none";
  keywordMatched: boolean;
  defaultMatched: boolean;
  results: Array<{ slug: string; status: string; error?: string; source?: string }>;
};

/**
 * Load brand context used by default/keyword AI templates.
 * Prefer unified brandContextPack (global training + channel + catalog);
 * fall back to instagram_ai_settings if pack fails.
 */
export async function loadBrandReplyContext(
  brandId: string,
  userId?: string,
): Promise<{
  brand_name: string;
  persona: string;
  tone: string;
  guidelines: string;
  faq: Array<{ q: string; a: string }>;
  max_chars: number;
  training_channel?: string;
  catalog_block?: string;
  sales_mode?: string;
}> {
  try {
    if (userId) {
      const { buildBrandContextPack } = await import("./brandContextPack");
      const pack = await buildBrandContextPack({
        brandId,
        userId,
        channel: "instagram",
      });
      return {
        brand_name: pack.brand_name,
        persona: pack.persona,
        tone: pack.tone,
        guidelines: [pack.guidelines, pack.training_global, pack.training_channel]
          .filter(Boolean)
          .join("\n"),
        faq: pack.faq,
        max_chars: pack.max_chars,
        training_channel: pack.training_channel,
        catalog_block: pack.catalog_block?.slice(0, 500),
        sales_mode: pack.sales_mode,
      };
    }
  } catch {
    /* fall through */
  }
  const settings = await instagramService.getAiSettings(brandId);
  const profile = await instagramService.getProfile(brandId).catch(() => null);
  return {
    brand_name: String(settings.brand_name || profile?.name || profile?.username || "nossa loja"),
    persona: String(settings.persona || profile?.biography || ""),
    tone: String(settings.tone || "caloroso e direto"),
    guidelines: String(settings.guidelines || ""),
    faq: Array.isArray(settings.faq) ? (settings.faq as Array<{ q: string; a: string }>) : [],
    max_chars: Number(settings.max_chars || 900),
  };
}

/**
 * Core DM handler — keyword first, then default. Same for all brands.
 */
export async function handleIncomingInstagramDm(
  input: HandleIncomingDmInput,
): Promise<HandleIncomingDmResult> {
  const text = String(input.messageText || "").trim();
  const brandContext = await loadBrandReplyContext(input.brandId, input.userId);

  const basePayload = {
    sender_id: input.senderId,
    text,
    mid: input.messageId,
    postback_payload: input.postbackPayload || "",
    postback_title: input.postbackTitle || "",
    is_button: Boolean(input.isButton),
    brand_context: brandContext,
  };

  // ── 1) Keyword path (and button payloads) ──
  // Active automations with evento=dm_keyword + matching palavrasChave
  const keywordDispatch = await dispatchInstagramEvent({
    brandId: input.brandId,
    userId: input.userId,
    igUserId: input.igUserId,
    evento: "dm_keyword",
    triggeredBy: input.senderId,
    payload: { ...basePayload, evento: "dm_keyword" },
    matchKeyword: text || input.postbackPayload || "",
  });

  const keywordSuccess = keywordDispatch.results.some((r) => r.status === "success");
  logger.info(
    `[IG DM] brand=${input.brandId} path=keyword matched=${keywordDispatch.matched} success=${keywordSuccess} mode=${keywordDispatch.mode}`,
  );

  if (keywordSuccess) {
    return {
      path: "keyword",
      keywordMatched: true,
      defaultMatched: false,
      results: keywordDispatch.results,
    };
  }

  // ── 2) Default path (no keyword / keyword failed) ──
  // Active automations with evento=resposta_padrao_dm (templates + brand context)
  const defaultDispatch = await dispatchInstagramEvent({
    brandId: input.brandId,
    userId: input.userId,
    igUserId: input.igUserId,
    evento: "resposta_padrao_dm",
    triggeredBy: input.senderId,
    payload: {
      ...basePayload,
      evento: "resposta_padrao_dm",
      // Hint for compose: prefer brand context + FAQ over empty AI
      use_brand_context: true,
    },
  });

  const defaultSuccess = defaultDispatch.results.some((r) => r.status === "success");
  logger.info(
    `[IG DM] brand=${input.brandId} path=default matched=${defaultDispatch.matched} success=${defaultSuccess} mode=${defaultDispatch.mode}`,
  );

  return {
    path: defaultSuccess ? "default" : "none",
    keywordMatched: keywordDispatch.matched > 0,
    defaultMatched: defaultDispatch.matched > 0,
    results: [...keywordDispatch.results, ...defaultDispatch.results],
  };
}
