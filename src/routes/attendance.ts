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
import { buildBrandContextPack, formatPackForPrompt } from "../services/brandContextPack";
import { splitMessageIntoBubbles } from "../services/messageSplit";

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
    const brandId = String(req.brandId || "");
    const userId = String(req.userId || (req as any).user?.userId || "");
    if (!brandId || !userId) return res.status(400).json({ error: "brand_id e user obrigatorios" });

    const text = String(req.body?.text || "ola, quanto custa?").trim();
    const pack = await buildBrandContextPack({
      brandId,
      userId,
      channel,
      inboundText: text,
    });

    if (channel === "instagram") {
      const composed = await composeInstagramReply({
        brandId,
        userId,
        inboundText: text,
        fallbackMessage: "Obrigado pela mensagem! Em breve retornamos.",
        iaGenerated: true,
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

    // WhatsApp: preview pack + split only (full cognitive path stays on live inbox)
    const previewHint = formatPackForPrompt(pack, text).slice(0, 400);
    const sample =
      pack.first_contact_script?.trim() ||
      `Oi! Aqui é o atendimento da ${pack.brand_name}. Como posso ajudar?`;
    const bubbles = pack.split_long_replies
      ? splitMessageIntoBubbles(sample, pack.max_chars, pack.max_bubbles)
      : [sample.slice(0, pack.max_chars)];

    res.json({
      success: true,
      channel,
      bubbles,
      source: "preview",
      max_chars: pack.max_chars,
      platform_hard_cap: pack.platform_hard_cap,
      sales_mode: pack.sales_mode,
      pack_preview: previewHint,
      used: {
        catalog: Boolean(pack.catalog_block),
        knowledge: Boolean(pack.knowledge_block),
        skills: Boolean(pack.skills_block),
        training_channel: Boolean(pack.training_channel),
        training_global: Boolean(pack.training_global),
      },
      note: "Preview WA usa pack unificado; resposta live usa o cognitive agent no inbox.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
