/**
 * Agent silence log admin route (Fase 16.3)
 *
 * Lets the operator see what the agent decided NOT to respond to.
 * Without this, "the agent didn't reply" looks like a bug — with this, it's
 * an auditable, tunable behavior.
 */
import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { silenceLogService } from "../services/cognitive/silenceLog";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);
router.use(requireBrandContext);

router.get("/silences", async (req: BrandRequest, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const [list, stats] = await Promise.all([
      silenceLogService.listForBrand(req.brandId || null, limit),
      silenceLogService.statsByReason(req.brandId || null, 7),
    ]);
    res.json({ success: true, silences: list, stats, period: "last_7_days" });
  } catch (e: any) {
    logger.error(e, "[agentSilences.list]");
    res.status(500).json({ error: e.message });
  }
});

export default router;
