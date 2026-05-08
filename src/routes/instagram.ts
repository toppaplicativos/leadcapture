import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { instagramService } from "../services/instagram";

const router = Router();
router.use(attachBrandContext);

function requireBrand(req: BrandRequest, res: Response): string | null {
  const brandId = String(req.brandId || "").trim();
  if (!brandId) {
    res.status(400).json({ error: "Brand ID obrigatorio" });
    return null;
  }
  return brandId;
}

function requireUser(req: BrandRequest, res: Response): string | null {
  const userId = String(req.user?.userId || req.userId || "").trim();
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

router.get("/connection", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const conn = await instagramService.getConnection(brandId);
    if (!conn) return res.json({ success: true, connection: null });
    res.json({
      success: true,
      connection: {
        ...conn,
        access_token: conn.access_token ? "••••••••••••" : "",
        app_secret: conn.app_secret ? conn.app_secret.slice(0, 6) + "••••••" : "",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/connection", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;

  const { access_token, account_id, app_id, app_secret } = req.body;
  if (!access_token) return res.status(400).json({ error: "Access token obrigatorio" });

  try {
    const conn = await instagramService.saveConnection(brandId, userId, {
      access_token,
      account_id: account_id || "",
      app_id: app_id || "",
      app_secret: app_secret || "",
    });
    res.json({ success: true, connection: conn });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/connection", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    await instagramService.deleteConnection(brandId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/test", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await instagramService.testConnection(brandId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/profile", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const profile = await instagramService.getProfile(brandId);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/media", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const limit = parseInt(String(req.query.limit || "12"));
    const media = await instagramService.fetchMedia(brandId, limit);
    res.json({ success: true, media });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/insights", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const period = (req.query.period as any) || "day";
    const insights = await instagramService.fetchInsights(brandId, period);
    res.json({ success: true, insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/snapshot", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    await instagramService.snapshotMetrics(brandId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/metrics", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const days = parseInt(String(req.query.days || "30"));
    const metrics = await instagramService.getMetrics(brandId, days);
    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/posts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(String(req.query.limit || "20"));
    const offset = parseInt(String(req.query.offset || "0"));
    const result = await instagramService.getPosts(brandId, { status, limit, offset });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const post = await instagramService.createPost(brandId, req.body);
    res.json({ success: true, post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/posts/:id", async (req: BrandRequest, res: Response) => {
  try {
    await instagramService.updatePost(String(req.params.id), req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/posts/:id", async (req: BrandRequest, res: Response) => {
  try {
    await instagramService.deletePost(String(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts/:id/publish", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await instagramService.publishPost(brandId, String(req.params.id));
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/conversations", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const conversations = await instagramService.getConversations(brandId);
    res.json({ success: true, conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
