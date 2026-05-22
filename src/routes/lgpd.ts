/**
 * LGPD routes (Fase 15.5 + 15.7)
 *
 * - PUBLIC (no auth): POST /api/lgpd/opt-out — anyone can ask to be removed.
 * - ADMIN (auth + brand): GET /api/lgpd/optouts — read-only list for transparency.
 *
 * No POST/PATCH on the admin side: opt-outs are a one-way ratchet. Admin can
 * only OBSERVE, not undo, by design. If you need to re-add a deleted lead,
 * the data subject must explicitly opt back in (separate flow, not built here).
 */
import { Router, Request, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { lgpdOptoutService, normalizePhone, normalizeEmail } from "../services/lgpdOptout";
import { rateLimit } from "../middleware/rateLimit";
import { logger } from "../utils/logger";

const publicRouter = Router();
const adminRouter = Router();

/* ─── PUBLIC: opt-out submission ─── */

/**
 * Aggressive rate-limit on the public endpoint to prevent abuse — someone
 * could try to flood with bogus opt-outs to disrupt the lead database.
 * 5 per 5min per IP is plenty for legitimate use (one person asking once).
 */
publicRouter.post("/opt-out",
  rateLimit({ name: "lgpd-optout", max: 5, windowMs: 5 * 60_000, keyFn: (r) => `lgpd:${r.ip || "unknown"}` }),
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const phone = normalizePhone(body.phone);
      const email = normalizeEmail(body.email);
      if (!phone && !email) {
        return res.status(400).json({
          error: "Informe pelo menos um identificador (telefone ou email).",
          code: "MISSING_IDENTIFIER",
        });
      }
      /* Cheap validation: phone needs at least 10 digits BR-style; email needs @ + dot */
      if (phone && (phone.length < 10 || phone.length > 13)) {
        return res.status(400).json({ error: "Telefone inválido. Use formato com DDD (ex: 11999998888).", code: "INVALID_PHONE" });
      }
      if (email && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email)) {
        return res.status(400).json({ error: "Email inválido.", code: "INVALID_EMAIL" });
      }

      const ip = String(req.ip || req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const ua = String(req.headers["user-agent"] || "").slice(0, 500) || null;

      const result = await lgpdOptoutService.register({
        phone,
        email,
        reason: body.reason || null,
        ip,
        userAgent: ua,
        source: "public_form",
      });

      logger.info(
        `[lgpd] opt-out submitted phone=${phone ? "***" + phone.slice(-4) : "-"} email=${email ? "***@" + (email.split("@")[1] || "") : "-"} removed=${result.removed.total} duplicate=${result.alreadyRegistered}`
      );

      res.status(200).json({
        success: true,
        message: result.alreadyRegistered
          ? "Sua solicitação já estava registrada. Removemos novamente qualquer registro que tenha sido recapturado."
          : "Sua solicitação foi registrada. Seus dados foram removidos e não voltarão a ser capturados.",
        records_removed: result.removed.total,
      });
    } catch (e: any) {
      logger.error(e, "[lgpd.opt-out]");
      res.status(500).json({ error: e?.message || "Falha ao processar solicitação. Tente novamente em alguns minutos." });
    }
  }
);

/* ─── ADMIN: read-only list of opt-outs (transparency for operator) ─── */

adminRouter.use(authMiddleware);
adminRouter.use(requireBrandContext);

adminRouter.get("/optouts", async (_req: BrandRequest, res: Response) => {
  try {
    const [list, total] = await Promise.all([
      lgpdOptoutService.listAll(500),
      lgpdOptoutService.count(),
    ]);
    /* Mask phone/email in the response — operator doesn't need full PII to
     * see "alguém com phone terminado em 8888 pediu opt-out em DD/MM" */
    const masked = list.map((o) => ({
      id: o.id,
      phone_masked: o.phone_normalized ? "***" + o.phone_normalized.slice(-4) : null,
      email_masked: o.email_normalized
        ? o.email_normalized.charAt(0) + "***@" + (o.email_normalized.split("@")[1] || "")
        : null,
      reason: o.reason,
      requested_at: o.requested_at,
      source: o.source,
      removed_records_count: o.removed_records_count,
    }));
    res.json({ success: true, optouts: masked, total });
  } catch (e: any) {
    logger.error(e, "[lgpd.list]");
    res.status(500).json({ error: e.message });
  }
});

/* Admin can manually register an opt-out on behalf of a customer who asked
 * over phone/WhatsApp instead of filling the public form. */
adminRouter.post("/optouts", async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);
    if (!phone && !email) {
      return res.status(400).json({ error: "Informe telefone ou email." });
    }
    const result = await lgpdOptoutService.register({
      phone, email,
      reason: body.reason || `Solicitação registrada pelo operador ${req.user?.email || req.user?.userId}`,
      source: "admin",
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { publicRouter as lgpdPublicRoutes, adminRouter as lgpdAdminRoutes };
