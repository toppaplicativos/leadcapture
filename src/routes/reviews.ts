/**
 * Reviews admin routes (Fase 14)
 *
 * Mounted as `/api/reviews` — requires auth + brand context.
 * Public routes live in storefront.ts.
 */
import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { reviewsService } from "../services/reviews";
import { logger } from "../utils/logger";

const router = Router();

router.use(authMiddleware);
router.use(requireBrandContext);

/* List for moderation. Filters: ?status=pending|approved|rejected|all (default: all). */
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const status = String(req.query.status || "all") as any;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const [list, pending] = await Promise.all([
      reviewsService.listAdmin(req.brandId || null, status, limit),
      reviewsService.countPending(req.brandId || null),
    ]);
    res.json({ success: true, reviews: list, pending_count: pending });
  } catch (e: any) {
    logger.error(e, "[reviews.list]");
    res.status(500).json({ error: e.message });
  }
});

/* Aggregates for a specific product — useful for admin product detail view. */
router.get("/product/:productId/aggregates", async (req: BrandRequest, res: Response) => {
  try {
    const agg = await reviewsService.getAggregates(String(req.params.productId));
    res.json({ success: true, aggregates: agg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* Moderate: approve / reject / re-open (back to pending). */
router.patch("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const status = String(req.body?.status || "").trim();
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "status deve ser approved | rejected | pending" });
    }
    const updated = await reviewsService.moderate(String(req.params.id), status as any);
    if (!updated) return res.status(404).json({ error: "Review não encontrada" });
    res.json({ success: true, review: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const ok = await reviewsService.delete(String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Review não encontrada" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
