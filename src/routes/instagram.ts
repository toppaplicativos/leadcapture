import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { instagramService } from "../services/instagram";
import { brandAutomationsService } from "../services/brandAutomations";
import { isInstagramAutomation, isTaskImplemented } from "../services/automationTasks";
import { settingsService } from "../services/settings";
import { CreativeStudioService } from "../services/creativeStudio";
import { logger } from "../utils/logger";

const creativeStudio = new CreativeStudioService();

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

router.get("/media/:id/analysis", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const analysis = await instagramService.getPostAnalysis(brandId, String(req.params.id));
    if (!analysis) return res.status(404).json({ success: false, error: "Post nao encontrado" });
    const history = await instagramService.listMediaSnapshots(brandId, String(req.params.id), 5);
    res.json({ success: true, analysis, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/media/:id/snapshot", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await instagramService.snapshotPostAnalysis(brandId, String(req.params.id));
    if (!result.ok) return res.status(404).json({ success: false, error: "Falha ao salvar snapshot" });
    res.json({ success: true, snapshot_id: result.snapshot_id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/insights", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const days = parseInt(String(req.query.days || "7"), 10);
    const period = (req.query.period as "day" | "week" | "days_28") || "day";
    const result = await instagramService.fetchInsights(brandId, { days, period });
    if (!result) return res.json({ success: false, error: "Instagram nao conectado" });
    res.json({
      success: !result.error,
      insights: result.parsed,
      raw: result.raw,
      error: result.error || undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const days = parseInt(String(req.query.days || "7"), 10);
    const analytics = await instagramService.fetchAnalytics(brandId, days);
    if (!analytics) {
      return res.json({ success: false, error: "Instagram nao conectado ou token invalido" });
    }
    res.json({ success: true, analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const INSTAGRAM_SEED_SLUGS = [
  "weekly-performance-report",
  "profile-health-23h",
  "auto-reply-comments-4h",
  "mention-monitor-3h",
  "ig-webhook-dm-reply",
  "ig-webhook-comment-keyword",
  "ig-webhook-mention-thanks",
] as const;

router.post("/automations/seed", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;

  try {
    const conn = await instagramService.getConnection(brandId);
    if (!conn?.access_token) {
      return res.status(400).json({ error: "Conecte o Instagram antes de rodar o seed" });
    }

    const force = Boolean(req.body?.force);
    const existing = await brandAutomationsService.listForBrand(userId, brandId);
    const configured = existing.filter((item) => item.state?.status === "active").length;

    if (!force && configured >= 3) {
      return res.json({
        success: true,
        seeded: 0,
        message: "Automações Instagram já configuradas. Passe force=true para reativar.",
        slugs: INSTAGRAM_SEED_SLUGS,
      });
    }

    const activated: string[] = [];
    for (const slug of INSTAGRAM_SEED_SLUGS) {
      await brandAutomationsService.activateSlug(userId, brandId, slug);
      activated.push(slug);
    }

    const subscribe = await instagramService.subscribeWebhooks(brandId);

    res.json({
      success: true,
      seeded: activated.length,
      activated,
      webhook_subscribed: subscribe.ok,
      webhook_error: subscribe.error,
      brand_id: brandId,
      ig_username: conn.username || null,
    });
  } catch (err: any) {
    logger.error(`[Instagram] automations/seed error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post("/webhook/subscribe", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const result = await instagramService.subscribeWebhooks(brandId);
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/webhook/events", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    const rows = await instagramService.listWebhookEvents(brandId, limit);
    res.json({ success: true, events: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/automations", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const list = await brandAutomationsService.listForBrand(userId, brandId);
    const automations = list
      .filter((item) => isInstagramAutomation(item))
      .map((item) => ({ ...item, is_implemented: isTaskImplemented(item.task_type) }));
    const active = automations.filter((a) => a.state?.status === "active").length;
    const runs = automations.reduce((s, a) => s + Number(a.state?.run_count || 0), 0);
    const successes = automations.reduce((s, a) => s + Number(a.state?.success_count || 0), 0);
    res.json({
      success: true,
      automations,
      stats: { total: automations.length, active, runs, successes },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const dashboard = await instagramService.fetchDashboard(brandId);
    if (!dashboard) {
      return res.json({ success: false, error: "Instagram nao conectado ou token invalido" });
    }
    res.json({ success: true, dashboard });
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

function validateScheduledPostBody(body: Record<string, unknown>): string | null {
  if (body.status !== "scheduled") return null;
  const scheduledAt = body.scheduled_at;
  if (!scheduledAt) return "scheduled_at obrigatorio para agendamento";
  const d = new Date(String(scheduledAt));
  if (Number.isNaN(d.getTime())) return "scheduled_at invalido";
  const min = new Date(Date.now() + 15 * 60 * 1000);
  if (d < min) return "Agende pelo menos 15 minutos a frente";
  const max = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000);
  if (d > max) return "Agendamento limitado a 75 dias";
  return null;
}

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

router.get("/alerts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const since = req.query.since as string | undefined;
    const result = await instagramService.getQueueAlerts(brandId, since);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/caption-templates", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const templates = await instagramService.listCaptionTemplates(brandId);
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/caption-templates", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: "body obrigatorio" });
    const template = await instagramService.saveCaptionTemplate(brandId, {
      label: req.body?.label,
      body,
    });
    res.json({ success: true, template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/caption-templates/:id", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    await instagramService.deleteCaptionTemplate(brandId, String(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/scheduling/suggestions", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const suggestions = await instagramService.getPostingSuggestions(brandId);
    res.json({ success: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-settings", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const settings = await instagramService.getAiSettings(brandId);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/ai-settings", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const settings = await instagramService.saveAiSettings(brandId, req.body || {});
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-settings/seed", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const settings = await instagramService.seedAiSettings(brandId, userId);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-settings/status", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const status = await instagramService.getAiProductionStatus(brandId);
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/alerts/history", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const limit = parseInt(String(req.query.limit || "20"), 10);
    const history = await instagramService.listQueueAlertHistory(brandId, limit);
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts/bulk", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const action = String(req.body?.action || "") as "delete" | "draft" | "publish" | "schedule";
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: "ids obrigatorio" });
    if (!["delete", "draft", "publish", "schedule"].includes(action)) {
      return res.status(400).json({ error: "action invalida" });
    }
    const result = await instagramService.bulkPostsAction(
      brandId,
      action,
      ids,
      req.body?.scheduled_at,
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-settings/test", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "message obrigatorio" });
    const settings = await instagramService.getAiSettings(brandId);
    const prompt = instagramService.buildAiReplyPrompt(settings, message);
    const result = await creativeStudio.generateText(userId, {
      prompt,
      maxCharacters: Number(settings.max_chars || 500),
    }, brandId);
    res.json({ success: true, reply: String(result?.text || "").trim() });
  } catch (err: any) {
    logger.error(`[Instagram] ai-settings/test error: ${err.message}`);
    res.status(500).json({ error: err.message || "Falha ao testar resposta" });
  }
});

router.get("/posts/:id", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const post = await instagramService.getPost(brandId, String(req.params.id));
    if (!post) return res.status(404).json({ success: false, error: "Post nao encontrado" });
    res.json({ success: true, post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const body = req.body || {};
    const scheduleErr = validateScheduledPostBody(body);
    if (scheduleErr) return res.status(400).json({ success: false, error: scheduleErr });
    const post = await instagramService.createPost(brandId, body);
    res.json({ success: true, post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/posts/:id", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const postId = String(req.params.id);
    const existing = await instagramService.getPost(brandId, postId);
    if (!existing) return res.status(404).json({ success: false, error: "Post nao encontrado" });
    const body = req.body || {};
    const scheduleErr = validateScheduledPostBody(body);
    if (scheduleErr) return res.status(400).json({ success: false, error: scheduleErr });
    if (body.status === "draft") body.scheduled_at = body.scheduled_at ?? null;
    if (body.status && ["draft", "scheduled"].includes(String(body.status))) {
      body.error_message = null;
    }
    await instagramService.updatePost(postId, body);
    const post = await instagramService.getPost(brandId, postId);
    res.json({ success: true, post });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/posts/:id", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const postId = String(req.params.id);
    const existing = await instagramService.getPost(brandId, postId);
    if (!existing) return res.status(404).json({ success: false, error: "Post nao encontrado" });
    await instagramService.deletePost(postId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/posts/:id/duplicate", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const post = await instagramService.duplicatePost(brandId, String(req.params.id));
    if (!post) return res.status(404).json({ success: false, error: "Post nao encontrado" });
    res.json({ success: true, post });
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
    const result = await instagramService.getConversations(brandId);
    res.json({ success: true, conversations: result.conversations, meta: result.meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/conversations/:threadId", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const thread = await instagramService.getConversationMessages(brandId, String(req.params.threadId));
    if (!thread) return res.status(404).json({ success: false, error: "Conversa nao encontrada" });
    res.json({ success: true, conversation: thread });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/messages/send", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const { recipient_id, text } = req.body || {};
  if (!recipient_id || !String(text || "").trim()) {
    return res.status(400).json({ error: "recipient_id e text sao obrigatorios" });
  }
  try {
    const result = await instagramService.sendDm(brandId, String(recipient_id), String(text).trim());
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, message_id: result.messageId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Direct Publish (from image generator) ─────────────────────────

router.post("/publish-image", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const { imageUrl, caption, mediaType, locationId, altText, userTags } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl obrigatorio" });

    const result = await instagramService.publishImageDirect(brandId, {
      imageUrl,
      caption,
      mediaType: mediaType || "IMAGE",
      locationId,
      altText,
      userTags,
    });
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    logger.error(`[Instagram] publish-image error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post("/caption-generate", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { context, tone, objective } = req.body || {};

    const prompt = [
      "Gere uma legenda profissional e envolvente para um post no Instagram.",
      "A legenda deve ter no maximo 2000 caracteres.",
      "Inclua uma chamada para acao sutil.",
      "Ao final, sugira de 5 a 10 hashtags relevantes em portugues, separadas por espaco.",
      "Formato da resposta: primeiro a legenda, depois uma linha em branco, depois as hashtags.",
      context ? `Contexto: ${context}` : "",
      tone ? `Tom de voz: ${tone}` : "",
      objective ? `Objetivo: ${objective}` : "",
    ].filter(Boolean).join("\n");

    const result = await creativeStudio.generateText(userId, {
      prompt,
      tone: tone || undefined,
      objective: objective || undefined,
      maxCharacters: 2200,
    }, brandId);

    // Parse caption and hashtags from response
    const text = String(result?.text || "");
    const parts = text.split(/\n\s*\n/);
    let caption = parts[0] || text;
    const hashtagLine = parts[1] || "";
    const hashtagMatches = hashtagLine.match(/#[\wÀ-ɏà-ÿ]+/g) || [];

    // If hashtags are inline in caption, extract them
    if (hashtagMatches.length === 0) {
      const inlineHashtags = caption.match(/#[\wÀ-ɏà-ÿ]+/g) || [];
      if (inlineHashtags.length > 0) {
        caption = caption.replace(/#[\wÀ-ɏà-ÿ]+/g, "").trim();
        res.json({ success: true, caption, hashtags: inlineHashtags });
        return;
      }
    }

    res.json({ success: true, caption, hashtags: hashtagMatches });
  } catch (err: any) {
    logger.error(`[Instagram] caption-generate error: ${err.message}`);
    res.status(500).json({ error: err.message || "Falha ao gerar legenda" });
  }
});

router.get("/location-search", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ success: true, locations: [] });

    const locations = await instagramService.searchLocations(brandId, q);
    res.json({ success: true, locations });
  } catch (err: any) {
    logger.error(`[Instagram] location-search error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get("/connection-status", async (req: BrandRequest, res: Response) => {
  const brandId = requireBrand(req, res);
  if (!brandId) return;
  try {
    const conn = await instagramService.getConnection(brandId);
    res.json({
      success: true,
      connected: !!(conn?.access_token && conn?.is_active),
      username: conn?.username || null,
      profilePicture: conn?.profile_picture_url || null,
    });
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
