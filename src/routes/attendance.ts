/**
 * Multi-channel attendance API (Instagram + WhatsApp).
 * GET/PUT /api/attendance[/:channel]
 * POST /api/attendance/:channel/test
 */

import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import {
  getChannelAttendance,
  listChannelAttendance,
  upsertChannelAttendance,
} from "../services/channelAttendance";
import type { AttendanceChannel } from "../services/channelLimits";
import { platformHardCap } from "../services/channelLimits";
import { composeInstagramReply } from "../services/instagramReplyHelpers";
import { buildBrandContextPack } from "../services/brandContextPack";
import { cognitiveAgent } from "../services/cognitive";

const router = Router();
router.use(attachBrandContext);

function parseChannel(raw: string): AttendanceChannel | null {
  const c = String(raw || "").toLowerCase();
  if (c === "instagram" || c === "whatsapp") return c;
  return null;
}

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "");
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatorio" });
    const data = await listChannelAttendance(brandId);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:channel", async (req: BrandRequest, res: Response) => {
  try {
    const channel = parseChannel(String(req.params.channel || ""));
    if (!channel) return res.status(400).json({ error: "channel deve ser instagram|whatsapp" });
    const brandId = String(req.brandId || "");
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatorio" });
    const attendance = await getChannelAttendance(brandId, channel);
    res.json({
      success: true,
      attendance,
      platform_hard_cap: platformHardCap(channel),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:channel", async (req: BrandRequest, res: Response) => {
  try {
    const channel = parseChannel(String(req.params.channel || ""));
    if (!channel) return res.status(400).json({ error: "channel deve ser instagram|whatsapp" });
    const brandId = String(req.brandId || "");
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatorio" });

    const body = req.body || {};
    const attendance = await upsertChannelAttendance(brandId, channel, {
      enabled: body.enabled,
      training_channel: body.training_channel,
      persona_override: body.persona_override,
      tone_override: body.tone_override,
      max_chars: body.max_chars,
      split_long_replies: body.split_long_replies,
      max_bubbles: body.max_bubbles,
      first_contact_override: body.first_contact_override,
      channel_rules: body.channel_rules,
      actions_json: body.actions_json,
      sales_mode: body.sales_mode,
      include_catalog: body.include_catalog,
      include_kb: body.include_kb,
      include_skills: body.include_skills,
      faq_json: body.faq_json,
    });

    res.json({
      success: true,
      attendance,
      platform_hard_cap: platformHardCap(channel),
      message: "Atendimento do canal salvo. Treinamento global permanece em /atendente.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Preview reply bubbles without sending */
router.post("/:channel/test", async (req: BrandRequest, res: Response) => {
  try {
    const channel = parseChannel(String(req.params.channel || ""));
    if (!channel) return res.status(400).json({ error: "channel deve ser instagram|whatsapp" });
    const brandId = String(req.brandId || "").trim();
    const userId = String(
      req.userId ||
        (req as any).user?.userId ||
        (req as any).user?.sub ||
        (req as any).user?.id ||
        "",
    ).trim();
    if (!brandId || !userId) {
      return res.status(400).json({
        error: "brand_id e user obrigatorios",
        detail: { brandId: brandId || null, hasUser: !!userId },
      });
    }

    const text = String(req.body?.text || "ola, quanto custa?").trim();
    const pack = await buildBrandContextPack({
      brandId,
      userId,
      channel,
      inboundText: text,
    });

    if (channel === "instagram") {
      // Stable test sender so multi-turn memory can be exercised from the panel
      const testSender = String(req.body?.sender_id || `test-user-${userId}`).slice(0, 64);
      const composed = await composeInstagramReply({
        brandId,
        userId,
        inboundText: text,
        fallbackMessage: "Obrigado pela mensagem! Em breve retornamos.",
        iaGenerated: true,
        senderId: testSender,
        username: String(req.body?.username || "teste").slice(0, 64),
      });
      return res.json({
        success: true,
        channel,
        bubbles: composed.bubbles,
        source: composed.source,
        max_chars: composed.max_chars,
        platform_hard_cap: pack.platform_hard_cap,
        sales_mode: pack.sales_mode,
        used: {
          catalog: Boolean(pack.catalog_block),
          knowledge: Boolean(pack.knowledge_block),
          skills: Boolean(pack.skills_block),
          training_channel: Boolean(pack.training_channel),
          training_global: Boolean(pack.training_global),
        },
      });
    }

    // WhatsApp: full cognitive pipeline (reasoner + composer) — same as live inbox
    const cognitive = await cognitiveAgent.respond({
      userId,
      brandId,
      conversationId: `attendance-test-wa-${userId}-${Date.now()}`,
      incomingMessage: text,
      conversationHistory: [],
      lastOutgoingMessages: [],
    });
    const replyText = String(cognitive?.text || "").trim();
    const maxChars = pack.max_chars || 900;
    const maxBubbles = pack.max_bubbles || 3;
    let bubbles: string[] = [];
    if (replyText) {
      if (pack.split_long_replies !== false && replyText.length > maxChars) {
        const { splitMessageIntoBubbles } = await import("../services/messageSplit");
        bubbles = splitMessageIntoBubbles(replyText, maxChars, maxBubbles);
      } else {
        bubbles = [replyText.length > maxChars ? replyText.slice(0, maxChars) : replyText];
      }
    }

    res.json({
      success: true,
      channel,
      bubbles,
      source: replyText ? "cognitive" : "empty",
      max_chars: maxChars,
      platform_hard_cap: pack.platform_hard_cap,
      sales_mode: pack.sales_mode,
      cognitive: {
        shouldEscalate: !!cognitive?.shouldEscalate,
        escalationReason: cognitive?.escalationReason || null,
        catalogApplied: !!cognitive?.catalogApplied,
        knowledgeApplied: !!cognitive?.knowledgeApplied,
        stage: cognitive?.reasoning?.funnel_stage || null,
        emotion: cognitive?.reasoning?.emotional_state || null,
      },
      used: {
        catalog: Boolean(pack.catalog_block),
        knowledge: Boolean(pack.knowledge_block),
        skills: Boolean(pack.skills_block),
        training_channel: Boolean(pack.training_channel),
        training_global: Boolean(pack.training_global),
      },
      note: "Preview WA usa o mesmo cognitive agent do inbox (reasoner + composer).",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
