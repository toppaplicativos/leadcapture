import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { integrationService } from "../services/integrations";
import { AI_MODELS, DEFAULT_PREFERENCES } from "../config/ai-models";
import { aiRouter } from "../services/aiRouter";

const router = Router();

router.use(attachBrandContext);

function requireUserId(req: BrandRequest, res: Response): string | null {
  const userId = String(req.user?.userId || req.userId || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

function resolveScope(req: BrandRequest) {
  return {
    userId: String(req.user?.userId || req.userId || "").trim() || undefined,
    brandId: String(req.brandId || "").trim() || undefined,
  };
}

router.get("/models-catalog", async (_req: BrandRequest, res: Response) => {
  res.json({ success: true, models: AI_MODELS, defaults: DEFAULT_PREFERENCES });
});

router.get("/preferences", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const prefs = await aiRouter.getPreferences({ userId, brandId: req.brandId || undefined });
    res.json({ success: true, preferences: prefs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/preferences", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    await aiRouter.savePreferences(req.body, { userId, brandId: req.brandId || undefined });
    const prefs = await aiRouter.getPreferences({ userId, brandId: req.brandId || undefined });
    res.json({ success: true, preferences: prefs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/providers", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const providers = await integrationService.listProviders(resolveScope(req));
    res.json({ success: true, providers });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list integrations" });
  }
});

router.get("/logs", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const logs = await integrationService.listLogs(resolveScope(req), {
      provider: req.query?.provider ? String(req.query.provider) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list integration logs" });
  }
});

router.get("/:provider", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const provider = await integrationService.getAdminSnapshot(String(req.params.provider || ""), resolveScope(req));
    res.json({ success: true, provider });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Invalid provider" });
  }
});

router.put("/:provider", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const provider = await integrationService.saveProvider(
      String(req.params.provider || ""),
      {
        key: req.body?.key,
        config: req.body?.config,
        is_active: req.body?.is_active,
        priority: req.body?.priority,
      },
      resolveScope(req)
    );

    res.json({ success: true, provider });
  } catch (error: any) {
    const message = String(error?.message || "Failed to save integration");
    if (message.includes("Unsupported provider")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

router.post("/:provider/test", async (req: BrandRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await integrationService.testConnection(
      String(req.params.provider || ""),
      {
        key: req.body?.key,
        config: req.body?.config,
      },
      resolveScope(req)
    );

    res.status(result.ok ? 200 : 502).json({ success: result.ok, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Invalid provider" });
  }
});

export default router;