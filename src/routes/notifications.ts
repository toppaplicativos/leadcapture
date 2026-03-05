import { Response, Router } from "express";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { getNotificationService, NotificationChannel, NotificationPriority, NotificationType } from "../services/notifications";
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

    const result = await notifications.listNotifications({
      user_id: userId,
      type: type || undefined,
      priority: priority || undefined,
      read,
      store_id: req.query.store_id ? String(req.query.store_id) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit,
      offset,
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/unread-count", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const unread_count = await notifications.getUnreadCount(userId);
    return res.json({ success: true, unread_count });
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
