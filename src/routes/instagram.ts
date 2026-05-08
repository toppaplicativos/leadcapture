import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { instagramService } from "../services/instagram";
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

  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: "Access token obrigatorio" });

  try {
    // Step 1: Validate token by fetching profile from Instagram API
    const profileResp = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website&access_token=${encodeURIComponent(access_token)}`
    );

    if (!profileResp.ok) {
      const err: any = await profileResp.json().catch(() => ({}));
      return res.status(400).json({ error: err?.error?.message || "Token invalido ou expirado" });
    }

    const profile: any = await profileResp.json();
    const igUserId = profile.user_id || profile.id || "";

    // Step 2: Get global app settings
    const appId = (await settingsService.getSetting("meta_app_id")) || "";
    const appSecret = (await settingsService.getSetting("meta_app_secret")) || "";

    // Step 3: Save connection
    await instagramService.saveConnection(brandId, userId, {
      access_token,
      account_id: igUserId,
      app_id: appId,
      app_secret: appSecret,
    });

    // Step 4: Update profile info
    await instagramService.updateConnectionProfile(brandId, {
      ig_user_id: igUserId,
      username: profile.username || "",
      name: profile.name || "",
      profile_picture_url: profile.profile_picture_url || "",
      followers_count: profile.followers_count || 0,
      follows_count: profile.follows_count || 0,
      media_count: profile.media_count || 0,
      biography: profile.biography || "",
      website: profile.website || "",
    });

    res.json({
      success: true,
      profile: {
        username: profile.username,
        name: profile.name,
        profile_picture_url: profile.profile_picture_url,
        followers_count: profile.followers_count || 0,
        media_count: profile.media_count || 0,
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

// ─── Meta App Settings (system_settings table) ────────────────────

function maskValue(val: string | null, visibleChars: number = 6): string {
  if (!val) return "";
  if (val.length <= visibleChars) return val;
  return val.slice(0, visibleChars) + "••••••••";
}

router.get("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const keys = ["meta_app_id", "meta_app_secret", "meta_webhook_verify_token"];
    const settings = await settingsService.getSettings(keys);
    const redirectUri =
      process.env.META_OAUTH_REDIRECT_URI || "https://app.leadcapture.online/api/meta/oauth/callback";

    res.json({
      success: true,
      settings: {
        meta_app_id: maskValue(settings.meta_app_id),
        meta_app_secret: maskValue(settings.meta_app_secret),
        meta_webhook_verify_token: settings.meta_webhook_verify_token || "",
        redirect_uri: redirectUri,
        has_app_id: !!settings.meta_app_id,
        has_app_secret: !!settings.meta_app_secret,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const { meta_app_id, meta_app_secret, meta_webhook_verify_token } = req.body as {
      meta_app_id?: string;
      meta_app_secret?: string;
      meta_webhook_verify_token?: string;
    };

    if (meta_app_id !== undefined && meta_app_id !== "") {
      await settingsService.setSetting("meta_app_id", meta_app_id.trim());
    }
    if (meta_app_secret !== undefined && meta_app_secret !== "") {
      await settingsService.setSetting("meta_app_secret", meta_app_secret.trim());
    }
    if (meta_webhook_verify_token !== undefined) {
      await settingsService.setSetting(
        "meta_webhook_verify_token",
        meta_webhook_verify_token.trim(),
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
