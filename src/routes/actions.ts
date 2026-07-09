import { Response, Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import {
  getPlatformActionsService,
  type ActionStatus,
  type ActionPriority,
} from "../services/platformActions";
import type { PushAppContext } from "../config/push-events";

const router = Router();
const actions = getPlatformActionsService();

router.use(authMiddleware);

function getUserId(req: AuthRequest): string | null {
  return String(req.user?.userId || "").trim() || null;
}

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const statusRaw = String(req.query.status || "").trim();
    const status = statusRaw
      ? (statusRaw.includes(",")
          ? statusRaw.split(",").map((s) => s.trim()) as ActionStatus[]
          : statusRaw as ActionStatus)
      : undefined;

    const result = await actions.listActions({
      assigned_to_user_id: userId,
      organization_id: req.query.organization_id ? String(req.query.organization_id) : undefined,
      app_context: req.query.app_context ? String(req.query.app_context) as PushAppContext : undefined,
      status,
      priority: req.query.priority ? String(req.query.priority) as ActionPriority : undefined,
      entity_type: req.query.entity_type ? String(req.query.entity_type) : undefined,
      entity_id: req.query.entity_id ? String(req.query.entity_id) : undefined,
      overdue: String(req.query.overdue || "").toLowerCase() === "true",
      limit: Number(req.query.limit || 20),
      offset: Number(req.query.offset || 0),
    });

    return res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list actions";
    return res.status(500).json({ error: message });
  }
});

router.get("/open-count", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const open_count = await actions.getOpenCount(
      userId,
      req.query.organization_id ? String(req.query.organization_id) : undefined,
    );
    return res.json({ success: true, open_count });
  } catch (error: unknown) {
    return res.json({ success: true, open_count: 0, degraded: true });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const action = await actions.getById(userId, String(req.params.id || "").trim());
    if (!action) return res.status(404).json({ error: "Action not found" });

    return res.json({ success: true, action });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get action";
    return res.status(500).json({ error: message });
  }
});

router.patch("/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const status = String((body as { status?: string }).status || "").trim() as ActionStatus;
    const allowed: ActionStatus[] = [
      "open", "in_progress", "waiting", "completed", "cancelled", "escalated", "reassigned",
    ];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const action = await actions.updateStatus(
      userId,
      String(req.params.id || "").trim(),
      status,
      (body as { notes?: string }).notes ? String((body as { notes?: string }).notes) : undefined,
    );
    if (!action) return res.status(404).json({ error: "Action not found" });

    return res.json({ success: true, action });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update action";
    return res.status(500).json({ error: message });
  }
});

export default router;