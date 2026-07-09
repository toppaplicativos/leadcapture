/**
 * /api/push/* — Web Push nativo (registro de dispositivo + preferências).
 */

import { Router, type Response } from "express"
import { authenticateToken, type AuthRequest } from "../middleware/auth"
import { getPushNotificationService } from "../services/pushNotifications"
import type { PushAppContext } from "../config/push-events"
import { logger } from "../utils/logger"

const router = Router()
const pushService = getPushNotificationService()

const VALID_CONTEXTS = new Set<PushAppContext>(["master", "admin", "affiliate", "stock", "storefront"])

function parseContext(raw: unknown): PushAppContext {
  const ctx = String(raw || "admin").trim().toLowerCase() as PushAppContext
  return VALID_CONTEXTS.has(ctx) ? ctx : "admin"
}

/** Telemetria de interação com push nativo (clique, dismiss, exibição). */
router.post("/track", async (req, res: Response) => {
  try {
    const body = req.body || {}
    const interaction = String(body.interaction || "").trim().toLowerCase()
    if (!["displayed", "clicked", "dismissed", "ignored"].includes(interaction)) {
      return res.status(400).json({ error: "invalid_interaction" })
    }
    const { getNotificationPlatformService } = await import("../services/notificationPlatform")
    const platform = getNotificationPlatformService()
    await platform.recordInteraction({
      notification_id: body.notification_id || null,
      user_id: body.user_id || null,
      event_key: body.event_key || body.event || null,
      interaction: interaction as "displayed" | "clicked" | "dismissed" | "ignored",
      device_id: body.device_id || null,
      url: body.url || null,
      metadata: body.metadata || {},
    })
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.get("/vapid-public-key", async (_req, res: Response) => {
  try {
    const publicKey = await pushService.getPublicVapidKey()
    return res.json({ success: true, publicKey })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "vapid_unavailable" })
  }
})

router.use(authenticateToken)

router.get("/events", async (req: AuthRequest, res: Response) => {
  try {
    const appContext = req.query.app_context ? parseContext(req.query.app_context) : undefined
    const events = await pushService.listEventPolicies(appContext)
    return res.json({ success: true, events })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.get("/devices", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const appContext = req.query.app_context ? parseContext(req.query.app_context) : undefined
    const devices = await pushService.listDevices(userId, appContext)
    return res.json({
      success: true,
      devices: devices.map(d => ({
        ...d,
        push_endpoint: undefined,
        endpoint_preview: d.push_endpoint.slice(0, 48) + "…",
      })),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post("/subscribe", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const body = req.body || {}
    const subscription = body.subscription
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: "invalid_subscription" })
    }

    const device = await pushService.registerSubscription({
      userId,
      organizationId: body.organization_id || body.brand_id || req.headers["x-brand-id"] || null,
      appContext: parseContext(body.app_context),
      subscription,
      deviceId: body.device_id,
      browser: body.browser,
      operatingSystem: body.operating_system || body.os,
      preferences: body.preferences,
    })

    return res.json({ success: true, device: { ...device, push_endpoint: undefined } })
  } catch (err: any) {
    logger.error({ err: err?.message }, "push subscribe error")
    return res.status(500).json({ error: err?.message })
  }
})

router.delete("/subscribe", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const endpoint = String(req.body?.endpoint || "").trim()
    if (!endpoint) return res.status(400).json({ error: "missing_endpoint" })
    await pushService.unregisterSubscription(userId, endpoint)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.put("/devices/:id/preferences", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const updated = await pushService.updateDevicePreferences(userId, String(req.params.id), req.body || {})
    if (!updated) return res.status(404).json({ error: "device_not_found" })
    return res.json({ success: true, device: { ...updated, push_endpoint: undefined } })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

router.post("/test", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const body = req.body || {}
    const result = await pushService.sendToUser({
      userId,
      appContext: parseContext(body.app_context),
      eventKey: String(body.event_key || "notification_test"),
      title: String(body.title || "Teste de push nativo"),
      body: String(body.body || "Se você viu isso, o push Web está funcionando."),
      priority: body.priority || "normal",
      url: body.url || "/",
      metadata: { test: true },
    })
    return res.json({ success: true, result })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })
  }
})

export default router