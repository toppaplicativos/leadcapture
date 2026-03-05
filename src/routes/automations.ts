import { Response, Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { AutomationsService } from "../services/automations";
import { AutomationRuntimeService } from "../services/automationRuntime";
import { InstanceRotationService } from "../services/instanceRotation";

const router = Router();
const automationsService = new AutomationsService();

router.use(authMiddleware, attachBrandContext);

function getAutomationRuntime(req: AuthRequest): AutomationRuntimeService {
  const runtime = req.app.get("automationRuntime") as AutomationRuntimeService | undefined;
  if (!runtime) {
    throw new Error("Automation runtime not available");
  }
  return runtime;
}

function getInstanceRotation(req: AuthRequest): InstanceRotationService {
  const rotation = req.app.get("instanceRotation") as InstanceRotationService | undefined;
  if (!rotation) {
    throw new Error("Instance rotation not available");
  }
  return rotation;
}

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const data = await automationsService.listRules(userId, req.brandId);
    res.json({ success: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rule = await automationsService.createRule(userId, req.brandId, req.body || {});
    res.status(201).json({ success: true, rule });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("name is required")) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get("/outbound-metrics", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const metrics = await automationsService.getOutboundMetrics(userId, req.brandId);
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

router.get("/runtime/rotation/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const rotation = getInstanceRotation(req);
    const settings = await rotation.getSettings(userId);
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/runtime/rotation/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const rotation = getInstanceRotation(req);
    const settings = await rotation.updateSettings(userId, req.body || {});
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runtime/rotation/pool", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const leadId = String(req.query?.leadId || "").trim() || undefined;
    const rotation = getInstanceRotation(req);
    const snapshot = await rotation.getPoolSnapshot(userId, leadId);
    res.json({ success: true, snapshot });
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

router.post("/outbound-event", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await automationsService.recordOutboundEvent(userId, req.body || {}, req.brandId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/scoring", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const scoring = await automationsService.updateScoring(userId, req.brandId, req.body || {});
    res.json({ success: true, scoring });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:code", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Automation code is required" });

    const rule = await automationsService.updateRule(userId, req.brandId, code, req.body || {});
    if (!rule) return res.status(404).json({ error: "Automation not found" });
    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:code/reset", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Automation code is required" });

    const rule = await automationsService.resetRule(userId, req.brandId, code);
    if (!rule) return res.status(404).json({ error: "Automation not found" });
    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
