import { Response, Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { AutomationsService } from "../services/automations";
import { AutomationRuntimeService } from "../services/automationRuntime";

const router = Router();
const automationsService = new AutomationsService();

function getAutomationRuntime(req: AuthRequest): AutomationRuntimeService {
  const runtime = req.app.get("automationRuntime") as AutomationRuntimeService | undefined;
  if (!runtime) {
    throw new Error("Automation runtime not available");
  }
  return runtime;
}

router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await automationsService.listRules(userId);
    res.json({ success: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/outbound-metrics", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const metrics = await automationsService.getOutboundMetrics(userId);
    res.json({ success: true, metrics });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runtime/status", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const runtime = getAutomationRuntime(req);
    const runtimeStatus = await runtime.getRuntimeStatus(userId);
    res.json({ success: true, runtime: runtimeStatus });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runtime/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const runtime = getAutomationRuntime(req);
    const settings = await runtime.getRuntimeSettings(userId);
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/runtime/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const runtime = getAutomationRuntime(req);
    const settings = await runtime.updateRuntimeSettings(userId, req.body || {});
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runtime/dead-letters", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const runtime = getAutomationRuntime(req);
    const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query?.limit) || 50)));
    const deadLetters = await runtime.listDeadLetters(userId, limit);
    res.json({ success: true, dead_letters: deadLetters });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/runtime/dead-letters/:id/retry",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const runtime = getAutomationRuntime(req);
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "Dead letter id is required" });
      const retried = await runtime.retryDeadLetter(userId, id);
      if (!retried) return res.status(404).json({ error: "Dead letter not found or not retryable" });
      res.json({ success: true, retried: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post("/outbound-event", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await automationsService.recordOutboundEvent(userId, req.body || {});
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/scoring", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const scoring = await automationsService.updateScoring(userId, req.body || {});
    res.json({ success: true, scoring });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:code", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Automation code is required" });

    const rule = await automationsService.updateRule(userId, code, req.body || {});
    if (!rule) return res.status(404).json({ error: "Automation not found" });
    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:code/reset", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Automation code is required" });

    const rule = await automationsService.resetRule(userId, code);
    if (!rule) return res.status(404).json({ error: "Automation not found" });
    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
