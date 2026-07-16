/**
 * API — Saúde e Elegibilidade WhatsApp
 */
import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { whatsappSendEligibility } from "../services/whatsappSendEligibility";
import { logger } from "../utils/logger";

const router = Router();

function brandId(req: AuthRequest): string | null {
  return String(req.headers["x-brand-id"] || "").trim() || null;
}

/** Dashboard por seção + totais 24h */
router.get("/health", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const data = await whatsappSendEligibility.getHealthDashboard({
      userId,
      brandId: brandId(req),
    });
    res.json(data);
  } catch (e: any) {
    logger.error(`[wa_eligibility] health: ${e?.message || e}`);
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

/** Registrar consentimento com origem/evidência */
router.post("/consents", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { phone, purpose, origin, evidence, source } = req.body || {};
    if (!phone || !origin) {
      return res.status(400).json({ error: "phone e origin são obrigatórios" });
    }
    const result = await whatsappSendEligibility.registerConsent({
      phone: String(phone),
      userId,
      brandId: brandId(req),
      purpose: purpose ? String(purpose) : "marketing",
      origin: String(origin),
      evidence: evidence ? String(evidence) : null,
      source: source ? String(source) : "admin",
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed" });
  }
});

/** Bloquear telefone globalmente (ou por marca) */
router.post("/blocks", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { phone, reason, scope } = req.body || {};
    if (!phone) return res.status(400).json({ error: "phone é obrigatório" });
    const result = await whatsappSendEligibility.blockPhone({
      phone: String(phone),
      reason: reason ? String(reason) : "manual_block",
      source: "admin",
      scope: scope === "brand" || scope === "user" ? scope : "global",
      userId,
      brandId: brandId(req),
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed" });
  }
});

/** Opt-out + purge filas */
router.post("/opt-out", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { phone, reason } = req.body || {};
    if (!phone) return res.status(400).json({ error: "phone é obrigatório" });
    const result = await whatsappSendEligibility.registerOptOutAndPurge({
      phone: String(phone),
      reason: reason ? String(reason) : "admin_opt_out",
      source: "admin",
      userId,
      brandId: brandId(req),
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed" });
  }
});

/** Pausar / retomar seção por qualidade */
router.post("/instances/:id/pause", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const paused = req.body?.paused !== false;
    const reason = req.body?.reason ? String(req.body.reason) : "Pausa manual pelo painel";
    await whatsappSendEligibility.setInstancePaused(String(req.params.id), paused, reason);
    res.json({ success: true, paused });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed" });
  }
});

/** Pré-check (UI / campanha) */
router.post("/check", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const decision = await whatsappSendEligibility.assertCanSend({
      phone: req.body?.phone,
      jid: req.body?.jid,
      instanceId: req.body?.instanceId,
      userId,
      brandId: brandId(req),
      purpose: req.body?.purpose || "marketing",
      source: req.body?.source || "manual",
      content: req.body?.content,
      brandName: req.body?.brandName,
      contactOrigin: req.body?.contactOrigin,
    });
    res.json(decision);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed" });
  }
});

export default router;
