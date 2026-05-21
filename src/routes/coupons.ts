/**
 * Coupons routes (Fase 13)
 *
 * Mounted as:
 *   - /api/coupons        → admin CRUD (requires auth + brand context)
 *   - /api/storefront/public/stores/:slug/coupons/validate → public lookup (no auth)
 */
import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { couponsService } from "../services/coupons";
import { logger } from "../utils/logger";

const router = Router();

router.use(authMiddleware);
router.use(requireBrandContext);

/* ── ADMIN CRUD ── */

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const list = await couponsService.listAll(req.brandId || null);
    res.json({ success: true, coupons: list });
  } catch (e: any) {
    logger.error(e, "[coupons.list]");
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const body = req.body || {};
    const created = await couponsService.create({
      brand_id: req.brandId || null,
      code: String(body.code || "").trim(),
      description: body.description ?? null,
      discount_type: body.discount_type === "fixed" ? "fixed" : "percentage",
      discount_value: Number(body.discount_value || 0),
      min_subtotal: body.min_subtotal === undefined ? undefined : (body.min_subtotal === null ? null : Number(body.min_subtotal)),
      max_discount_cap: body.max_discount_cap === undefined ? undefined : (body.max_discount_cap === null ? null : Number(body.max_discount_cap)),
      applies_to: body.applies_to || "all",
      applies_to_ids: Array.isArray(body.applies_to_ids) ? body.applies_to_ids : [],
      starts_at: body.starts_at || null,
      expires_at: body.expires_at || null,
      usage_limit_total: body.usage_limit_total === undefined ? undefined : (body.usage_limit_total === null ? null : Number(body.usage_limit_total)),
      usage_limit_per_customer: body.usage_limit_per_customer === undefined ? undefined : (body.usage_limit_per_customer === null ? null : Number(body.usage_limit_per_customer)),
      active: body.active !== false,
      metadata: body.metadata || {},
    });
    res.status(201).json({ success: true, coupon: created });
  } catch (e: any) {
    /* dedupe/validation errors should be 400 */
    const msg = String(e?.message || "");
    if (msg.includes("obrigatório") || msg.includes("inválido") || msg.includes("já existe")) {
      return res.status(400).json({ error: msg });
    }
    logger.error(e, "[coupons.create]");
    res.status(500).json({ error: msg || "failed to create coupon" });
  }
});

router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const updated = await couponsService.update(String(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: "Coupon not found" });
    res.json({ success: true, coupon: updated });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("já existe") || msg.includes("renomear") || msg.includes("inválido")) {
      return res.status(400).json({ error: msg });
    }
    logger.error(e, "[coupons.update]");
    res.status(500).json({ error: msg });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const ok = await couponsService.delete(String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Coupon not found" });
    res.json({ success: true });
  } catch (e: any) {
    logger.error(e, "[coupons.delete]");
    res.status(500).json({ error: e.message });
  }
});

export default router;
