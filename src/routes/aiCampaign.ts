/**
 * ═══════════════════════════════════════════════════════════════════
 * /api/ai-campaign — wizard de campanha via squad de IA com SSE streaming
 * ═══════════════════════════════════════════════════════════════════
 *
 * POST /squad-stream
 *   Body: { prompt: string, options?: { use_existing, use_prospect_ai, auto_start } }
 *   Resp: text/event-stream
 *     data: {"step":1, "name":"interpretBrief", "status":"running"}
 *     data: {"step":1, "status":"done", "output":{...}}
 *     ...
 *     data: {"step":8, "name":"final", "output":{campaign_id, ...}}
 *
 * GET /status
 *   Resp: { running: boolean }  (mutex global por brand)
 *
 * Reusa header X-Accel-Buffering: no (testado em landingChat - funciona via Caddy).
 */

import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { executeAICampaignSquad, isBrandSquadRunning, type SquadEvent } from "../services/aiCampaignSquad";
import { logger } from "../utils/logger";

const router = Router();
router.use(attachBrandContext);

/* GET /api/ai-campaign/status — checa se ja tem squad rodando pra esse brand */
router.get("/status", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId || "";
    if (!brandId) return res.json({ running: false, brand_id: null });
    res.json({ running: isBrandSquadRunning(brandId), brand_id: brandId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao checar status" });
  }
});

/* POST /api/ai-campaign/squad-stream — executa squad com SSE streaming */
router.post("/squad-stream", async (req: BrandRequest, res: Response) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "prompt eh obrigatorio" });
  if (prompt.length > 2000) return res.status(400).json({ error: "prompt muito longo (max 2000 caracteres)" });

  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const brandId = req.brandId || "";
  if (!brandId) {
    return res.status(400).json({ error: "Brand ativo nao definido. Passe x-brand-id no header." });
  }

  /* SSE setup — mesmos headers que landingChat */
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  const emit = (event: SquadEvent) => {
    if (clientDisconnected) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* connection closed */ }
  };

  /* Heartbeat a cada 15s pra manter conexao viva atraves de proxies */
  const heartbeat = setInterval(() => {
    if (clientDisconnected) return;
    try { res.write(": heartbeat\n\n"); } catch { /* */ }
  }, 15_000);

  try {
    emit({ step: 0, name: "interpretBrief", status: "info" as any, message: "Iniciando squad de IA…" });

    const options = req.body?.options || {};
    await executeAICampaignSquad(
      {
        prompt,
        userId,
        brandId,
        options: {
          use_existing: options?.use_existing !== false,
          use_prospect_ai: options?.use_prospect_ai !== false,
          auto_start: options?.auto_start === true,
        },
      },
      emit,
    );
    res.write("data: [DONE]\n\n");
  } catch (err: any) {
    logger.error(err, "aiCampaign squad-stream fatal");
    emit({ step: 0, name: "error", status: "error", message: err?.message || "Erro inesperado" });
    res.write("data: [DONE]\n\n");
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
