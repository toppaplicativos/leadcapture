import { Response, Router } from "express";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { getNotificationService, NotificationChannel, NotificationPriority, NotificationType } from "../services/notifications";
import { getNotificationPlatformService } from "../services/notificationPlatform";
import type { PushAppContext } from "../config/push-events";
import { logger } from "../utils/logger";

const router = Router();
const notifications = getNotificationService();

router.use(authMiddleware);

function getUserId(req: AuthRequest): string | null {
  const userId = String(req.user?.userId || "").trim();
  return userId || null;
}

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const type = String(req.query.type || "").trim() as NotificationType;
    const priority = String(req.query.priority || "").trim() as NotificationPriority;
    const readRaw = String(req.query.read || "").trim().toLowerCase();
    const read = readRaw ? readRaw === "true" || readRaw === "1" : undefined;

    const filterRaw = String(req.query.filter || "").trim().toLowerCase();
    let readFilter = read;
    let actionRequired: boolean | undefined;
    let criticalOnly = false;
    let archived = false;

    if (filterRaw === "unread") readFilter = false;
    else if (filterRaw === "critical") criticalOnly = true;
    else if (filterRaw === "action") actionRequired = true;
    else if (filterRaw === "archived") archived = true;

    const result = await notifications.listNotifications({
      user_id: userId,
      type: type || undefined,
      priority: priority || undefined,
      read: readFilter,
      store_id: req.query.store_id ? String(req.query.store_id) : undefined,
      app_target: req.query.app_target ? String(req.query.app_target) : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      action_required: actionRequired,
      critical_only: criticalOnly,
      archived: filterRaw === "archived" ? true : archived || undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit,
      offset,
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.warn({ err: error }, "Notifications list fallback activated");
    return res.json({ success: true, notifications: [], total: 0, degraded: true });
  }
});

router.get("/unread-count", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const unread_count = await notifications.getUnreadCount(userId);
    return res.json({ success: true, unread_count });
  } catch (error: any) {
    logger.warn({ err: error }, "Notifications unread-count fallback activated");
    return res.json({ success: true, unread_count: 0, degraded: true });
  }
});

router.post("/read-all", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const affected = await notifications.markAllAsRead(userId);
    return res.json({ success: true, affected });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/read", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const ok = await notifications.markAsRead(userId, String(req.params.id || "").trim());
    if (!ok) return res.status(404).json({ error: "Notification not found" });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/:id/archive", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const ok = await notifications.archiveNotification(userId, String(req.params.id || "").trim());
    if (!ok) return res.status(404).json({ error: "Notification not found" });

    const unread = await notifications.getUnreadCount(userId);
    return res.json({ success: true, unread_count: unread });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/preferences/events", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const appContext = String(req.query.app_context || "admin").trim() as PushAppContext;
    const platform = getNotificationPlatformService();
    const preferences = await platform.listUserPreferences(userId, appContext);
    return res.json({ success: true, preferences, app_context: appContext });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/preferences/events/:eventKey", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const appContext = String(body.app_context || req.query.app_context || "admin").trim() as PushAppContext;
    const platform = getNotificationPlatformService();
    const eventKey = String(req.params.eventKey || "").trim();

    const eventConfig = await platform.resolveEventConfig(eventKey);
    if (eventConfig && !eventConfig.can_be_disabled_by_user) {
      const disabling = body.push_enabled === false || body.in_app_enabled === false;
      if (disabling) {
        return res.status(400).json({ error: "Este evento crítico não pode ser totalmente desativado" });
      }
    }

    const preference = await platform.upsertUserPreference({
      user_id: userId,
      app_context: appContext,
      event_key: eventKey,
      category: body.category ? String(body.category) : eventConfig?.category || null,
      push_enabled: typeof body.push_enabled === "boolean" ? body.push_enabled : undefined,
      in_app_enabled: typeof body.in_app_enabled === "boolean" ? body.in_app_enabled : undefined,
      sound_enabled: typeof body.sound_enabled === "boolean" ? body.sound_enabled : undefined,
      email_enabled: typeof body.email_enabled === "boolean" ? body.email_enabled : undefined,
      silent_hours_enabled: typeof body.silent_hours_enabled === "boolean" ? body.silent_hours_enabled : undefined,
    });

    return res.json({ success: true, preference });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/preferences", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const preferences = await notifications.getPreferences(userId);
    return res.json({ success: true, preferences });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/preferences", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const input = (body as any).preferences || body;
    const preferences = await notifications.updatePreferences(userId, input);
    return res.json({ success: true, preferences });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/analytics", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const analytics = await notifications.getAnalytics(userId);
    return res.json({ success: true, analytics });
  } catch (error: any) {
    logger.warn({ err: error }, "Notifications analytics fallback activated");
    return res.json({
      success: true,
      analytics: {
        totals: {
          total: 0,
          read_count: 0,
          unread_count: 0,
          avg_time_to_read_seconds: null,
        },
        by_priority: [],
        top_events: [],
        deliveries: [],
      },
      degraded: true,
    });
  }
});

router.post("/test", requireRole(["admin", "manager"]), async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const channels = Array.isArray(body.channels)
      ? body.channels.map((item: unknown) => String(item).trim().toLowerCase() as NotificationChannel)
      : undefined;

    const notification = await notifications.createNotification({
      user_id: userId,
      type: (String(body.type || "system").trim() as NotificationType) || "system",
      event: String(body.event || "notification_test").trim() || "notification_test",
      title: String(body.title || "Teste de notificação"),
      message: String(body.message || "Sua notificação de teste foi enviada com sucesso."),
      priority: (String(body.priority || "medium") as NotificationPriority) || "medium",
      channels,
      store_id: body.store_id ? String(body.store_id) : undefined,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    return res.json({ success: true, notification });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
