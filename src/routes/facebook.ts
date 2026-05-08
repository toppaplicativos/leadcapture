import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { facebookService } from "../services/facebook";
import { settingsService } from "../services/settings";

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

// ─── Connection ──────────────────────────────────────────────────────

router.get("/connection", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const conn = await facebookService.getConnection(brandId);
    if (!conn) return res.json({ success: true, connection: null });
    res.json({
      success: true,
      connection: {
        ...conn,
        page_access_token: conn.page_access_token ? "••••••••••••" : "",
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

  const { page_access_token } = req.body;
  if (!page_access_token) return res.status(400).json({ error: "Page access token obrigatorio" });

  try {
    // Step 1: Validate token by fetching page profile from Facebook Graph API
    const profileResp = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,fan_count,followers_count,category,about,picture,website,link&access_token=${encodeURIComponent(page_access_token)}`
    );

    if (!profileResp.ok) {
      const err: any = await profileResp.json().catch(() => ({}));
      return res.status(400).json({ error: err?.error?.message || "Token invalido ou expirado" });
    }

    const profile: any = await profileResp.json();
    const pageId = profile.id || "";
    const pageName = profile.name || "";

    // Extract picture URL — profile.picture returns { data: { url: "..." } }
    const pictureUrl = profile.picture?.data?.url || "";

    // Step 2: Save connection
    await facebookService.saveConnection(brandId, userId, {
      page_access_token,
      page_id: pageId,
    });

    // Step 3: Update profile info
    await facebookService.updateConnectionProfile(brandId, {
      page_name: pageName,
      fan_count: profile.fan_count || 0,
      followers_count: profile.followers_count || 0,
      page_category: profile.category || "",
      page_about: profile.about || "",
      page_picture_url: pictureUrl,
      website: profile.website || "",
    });

    res.json({
      success: true,
      profile: {
        page_id: pageId,
        name: pageName,
        fan_count: profile.fan_count || 0,
        followers_count: profile.followers_count || 0,
        category: profile.category || "",
        picture_url: pictureUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/connection", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    await facebookService.deleteConnection(brandId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test ────────────────────────────────────────────────────────────

router.post("/test", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await facebookService.testConnection(brandId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Profile ─────────────────────────────────────────────────────────

router.get("/profile", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const profile = await facebookService.getProfile(brandId);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Posts (local drafts) ────────────────────────────────────────────

router.get("/posts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(String(req.query.limit || "20"));
    const offset = parseInt(String(req.query.offset || "0"));
    const result = await facebookService.getPosts(brandId, { status, limit, offset });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const post = await facebookService.createPost(brandId, req.body);
    res.json({ success: true, post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/posts/:id", async (req: BrandRequest, res: Response) => {
  try {
    await facebookService.updatePost(String(req.params.id), req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/posts/:id", async (req: BrandRequest, res: Response) => {
  try {
    await facebookService.deletePost(String(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts/:id/publish", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await facebookService.publishPost(brandId, String(req.params.id));
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feed (live from Facebook API) ───────────────────────────────────

router.get("/feed", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const limit = parseInt(String(req.query.limit || "25"));
    const feed = await facebookService.fetchPosts(brandId, limit);
    res.json({ success: true, feed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Insights ────────────────────────────────────────────────────────

router.get("/insights", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const period = (req.query.period as any) || "day";
    const insights = await facebookService.fetchInsights(brandId, period);
    res.json({ success: true, insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Snapshot ────────────────────────────────────────────────────────

router.post("/snapshot", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    await facebookService.snapshotMetrics(brandId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
