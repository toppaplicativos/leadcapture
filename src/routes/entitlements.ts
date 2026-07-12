/**
 * GET /api/entitlements — tenant-facing plan + modules + usage snapshot.
 */

import { Router, Response } from "express"
import { authenticateToken, type AuthRequest } from "../middleware/auth"
import { getEntitlements } from "../services/planEntitlements"
import { getPublicPlatformStatus } from "../services/platformTools"
import { resolveRequestBrandId } from "../middleware/permissions"
import { getPlatformVersion } from "../config/platformVersion"

const router = Router()

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || (req.user as any)?.userId
    if (!userId) return res.status(401).json({ error: "Não autenticado" })
    const brandId = resolveRequestBrandId(req)
    const entitlements = await getEntitlements(String(userId), brandId)
    return res.json({
      entitlements,
      platform: getPlatformVersion(),
      request_id: req.requestId || null,
      synced_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal", request_id: req.requestId || null })
  }
})

export default router

/** Mount on public routes: GET /api/public/platform-status */
export async function publicPlatformStatusHandler(_req: any, res: Response) {
  try {
    const status = await getPublicPlatformStatus()
    return res.json({ status })
  } catch (err: any) {
    return res.status(500).json({ error: "internal" })
  }
}
