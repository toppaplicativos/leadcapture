import { Router, type Request, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { attachCustomerApp, recordUsage, resolveRegistrationToken } from "../services/usageBilling";

const router = Router();
router.get("/registration/:token", async (req: Request, res: Response) => {
  const context = await resolveRegistrationToken(String(req.params.token || ""));
  if (!context) return res.status(404).json({ error: "registration_link_not_found" });
  return res.json({ success: true, app: context });
});
router.post("/attach", authMiddleware, async (req: AuthRequest, res: Response) => {
  const context = await attachCustomerApp({ userId: String(req.userId || ""), brandId: req.body?.brand_id || null, token: req.body?.token });
  if (!context) return res.status(404).json({ error: "registration_link_not_found" });
  return res.json({ success: true, app: context });
});
router.post("/events", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await recordUsage({ userId: String(req.userId || ""), brandId: req.body?.brand_id || null, appId: String(req.body?.app_id || ""), eventKey: String(req.body?.event_key || ""), externalId: String(req.body?.external_id || ""), quantity: req.body?.quantity });
    return res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
  } catch (error: any) { return res.status(error?.message === "usage_rule_not_found" ? 404 : 400).json({ error: error?.message || "usage_record_failed" }); }
});
export default router;
