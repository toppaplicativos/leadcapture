import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { CampaignEngineService } from "../services/campaignEngine";
import { ResponseIntelligenceService } from "../services/responseIntelligence";
import { InstanceManager } from "../core/instanceManager";
import { InstanceRotationService } from "../services/instanceRotation";
import { logger } from "../utils/logger";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";

type AuthRequest = { user?: { userId: string; email: string; role: string } };

const campaignTestMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/campaign-test-media");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const uploadCampaignTestMedia = multer({
  storage: campaignTestMediaStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

export function createCampaignRoutes(
  instanceManager: InstanceManager,
  rotationEngine?: InstanceRotationService,
  campaignEngine?: CampaignEngineService
): Router {
  const router = Router();
  const engine = campaignEngine || new CampaignEngineService(instanceManager, rotationEngine);
  const responseIntelligence = new ResponseIntelligenceService();

  router.use(attachBrandContext);

  // ─── Campaign CRUD ─────────────────────────────────────────────

  // List campaigns
  router.get("/", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const campaigns = await engine.listCampaigns(userId, req.brandId);
      res.json({ success: true, campaigns });
    } catch (error: any) {
      logger.error(`List campaigns error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // List destination targets (groups/contacts from conversations)
  router.get("/destinations", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const search = String(req.query.search || "").trim() || undefined;
      const instanceId = String(req.query.instanceId || "").trim() || undefined;
      const targetTypeRaw = String(req.query.targetType || "group").trim().toLowerCase();
      const targetType = targetTypeRaw === "contact" || targetTypeRaw === "channel" || targetTypeRaw === "all" ? targetTypeRaw : "group";
      const limit = Number(req.query.limit || 120);

      let liveTargets: Array<{
        jid: string;
        name: string;
        instance_id: string;
        instance_name?: string;
        target_type: "group" | "contact" | "channel";
        last_message_at?: string | null;
      }> = [];

      if (instanceId) {
        const instance = instanceManager.getInstance(instanceId, userId);
        if (instance?.status === "connected") {
          liveTargets = await instanceManager.listConnectedDestinationTargets(instanceId, {
            search,
            targetType: targetType as "group" | "contact" | "channel" | "all",
            limit,
          });
        }
      }

      const historicalTargets = await engine.listDestinationTargets(
        userId,
        { search, instanceId, targetType: targetType as "group" | "contact" | "channel" | "all", limit, connectedOnly: true },
        req.brandId,
      );

      const merged = [...liveTargets, ...historicalTargets];
      const deduped: typeof historicalTargets = [];
      const seen = new Set<string>();

      for (const item of merged) {
        const key = `${item.instance_id}::${item.jid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= Math.max(20, Math.min(limit, 400))) break;
      }

      const needsChannelEnrichment = Boolean(instanceId) && (targetType === "channel" || targetType === "all");
      const targets = needsChannelEnrichment
        ? await instanceManager.enrichConnectedChannelTargets(instanceId!, deduped as any)
        : deduped;

      res.json({ success: true, targets });
    } catch (error: any) {
      logger.error(`List campaign destination targets error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Backward-compatible alias focused on groups
  router.get("/groups", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const search = String(req.query.search || "").trim() || undefined;
      const instanceId = String(req.query.instanceId || "").trim() || undefined;
      const limit = Number(req.query.limit || 120);

      let liveGroups: Array<{
        jid: string;
        name: string;
        instance_id: string;
        instance_name?: string;
        target_type: "group" | "contact" | "channel";
        last_message_at?: string | null;
      }> = [];

      if (instanceId) {
        const instance = instanceManager.getInstance(instanceId, userId);
        if (instance?.status === "connected") {
          liveGroups = await instanceManager.listConnectedDestinationTargets(instanceId, {
            search,
            targetType: "group",
            limit,
          });
        }
      }

      const historicalGroups = await engine.listDestinationTargets(
        userId,
        { search, instanceId, targetType: "group", limit, connectedOnly: true },
        req.brandId,
      );

      const merged = [...liveGroups, ...historicalGroups];
      const deduped: typeof historicalGroups = [];
      const seen = new Set<string>();
      for (const item of merged) {
        const key = `${item.instance_id}::${item.jid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= Math.max(20, Math.min(limit, 400))) break;
      }

      res.json({ success: true, groups: deduped });
    } catch (error: any) {
      logger.error(`List campaign groups error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single campaign
  router.get("/:id", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const campaign = await engine.getCampaign(userId, String(req.params.id), req.brandId);
      if (!campaign) return res.status(404).json({ error: "Campanha nao encontrada" });

      res.json({ success: true, campaign });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get campaign metrics
  router.get("/:id/metrics", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const metrics = await engine.getCampaignMetrics(userId, String(req.params.id), req.brandId);
      res.json({ success: true, metrics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get campaign leads
  router.get("/:id/leads", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const status = req.query.status as string | undefined;
      const leads = await engine.getCampaignLeads(userId, String(req.params.id), status as any, req.brandId);
      res.json({ success: true, leads });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create campaign
  router.post("/", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const {
        name, instanceId, messageTemplate, aiPrompt, useAI,
        filter, speedControl, scheduledAt, campaignMode, status,
        useInstanceRotation, rotationMode,
        settings,
      } = req.body;

      if (!name || !instanceId) {
        return res.status(400).json({ error: "name e instanceId sao obrigatorios" });
      }

      const campaign = await engine.createCampaign(userId, {
        name,
        instanceId,
        messageTemplate: messageTemplate || null,
        aiPrompt: aiPrompt || null,
        useAI: !!useAI,
        filter: filter || {},
        speedControl: speedControl || {},
        scheduledAt: scheduledAt || null,
        initialStatus: status === "active" || status === "paused" || status === "draft" ? status : "draft",
        campaignMode: campaignMode || "educational",
        useInstanceRotation: !!useInstanceRotation,
        rotationMode: rotationMode || "balanced",
        settings: settings && typeof settings === "object" ? settings : undefined,
      }, req.brandId);

      if (status === "active" && !scheduledAt) {
        const startResult = await engine.startCampaign(userId, campaign.id, req.brandId);
        if (!startResult.ok) {
          return res.status(400).json({ error: startResult.message });
        }
      }

      const refreshed = await engine.getCampaign(userId, campaign.id, req.brandId);

      res.json({ success: true, campaign: refreshed || campaign, message: `Campanha criada com ${campaign.target_count} leads` });
    } catch (error: any) {
      logger.error(`Create campaign error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Update campaign
  router.put("/:id", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const {
        name, instanceId, messageTemplate, aiPrompt, useAI,
        filter, speedControl, scheduledAt, campaignMode,
        useInstanceRotation, rotationMode, settings,
      } = req.body;

      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (instanceId !== undefined) updateData.instanceId = instanceId;
      if (messageTemplate !== undefined) updateData.messageTemplate = messageTemplate;
      if (aiPrompt !== undefined) updateData.aiPrompt = aiPrompt;
      if (useAI !== undefined) updateData.useAI = !!useAI;
      if (filter !== undefined) updateData.filter = filter;
      if (speedControl !== undefined) updateData.speedControl = speedControl;
      if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt;
      if (campaignMode !== undefined) updateData.campaignMode = campaignMode;
      if (useInstanceRotation !== undefined) updateData.useInstanceRotation = !!useInstanceRotation;
      if (rotationMode !== undefined) updateData.rotationMode = rotationMode;
      if (settings !== undefined) updateData.settings = settings;

      const campaign = await engine.updateCampaign(
        userId,
        String(req.params.id),
        updateData,
        req.brandId
      );

      if (!campaign) {
        return res.status(404).json({ error: "Campanha nao encontrada" });
      }

      res.json({ success: true, campaign, message: "Campanha atualizada com sucesso" });
    } catch (error: any) {
      logger.error(`Update campaign error: ${error.message}`);
      const status = error.message?.includes("Apenas campanhas") ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  // Test send (composition + delivery check)
  router.post("/test-send", uploadCampaignTestMedia.single("image"), async (req: BrandRequest, res) => {
    const uploadedImagePath = req.file?.path;
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      if (req.file && !String(req.file.mimetype || "").startsWith("image/")) {
        return res.status(400).json({ error: "Only image files are allowed for campaign test" });
      }

      const leadRaw = req.body?.lead;
      const lead = typeof leadRaw === "string" ? (() => {
        try { return JSON.parse(leadRaw); } catch { return undefined; }
      })() : leadRaw;

      const useTextAsCaptionRaw = String(req.body?.useTextAsCaption || "").trim().toLowerCase();
      const useTextAsCaption = useTextAsCaptionRaw === "1" || useTextAsCaptionRaw === "true" || useTextAsCaptionRaw === "yes";

      const result = await engine.sendCampaignTest(userId, {
        instanceId: String(req.body?.instanceId || ""),
        templatePrompt: String(req.body?.templatePrompt || ""),
        testPhone: req.body?.testPhone ? String(req.body.testPhone) : undefined,
        lead,
        mediaImagePath: uploadedImagePath,
        mediaImageCaption: req.body?.imageCaption ? String(req.body.imageCaption) : undefined,
        useTextAsCaption,
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      const message = String(error?.message || "Failed to send campaign test");
      if (message.includes("not found")) return res.status(404).json({ error: message });
      if (message.includes("required") || message.includes("connected") || message.includes("No test destination")) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    } finally {
      if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
        try {
          fs.unlinkSync(uploadedImagePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  // Preview leads (dry-run filter)
  router.post("/preview", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const filter = req.body.filter || {};
      const result = await engine.previewCampaign(userId, filter, req.brandId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Campaign actions ──────────────────────────────────────────

  // Start campaign
  router.post("/:id/start", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await engine.startCampaign(userId, String(req.params.id), req.brandId);
      const status = result.ok ? 200 : 400;
      res.status(status).json({ success: result.ok, message: result.message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Pause campaign
  router.post("/:id/pause", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await engine.pauseCampaign(userId, String(req.params.id), req.brandId);
      res.json({ success: result.ok, message: result.message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel campaign
  router.post("/:id/cancel", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await engine.cancelCampaign(userId, String(req.params.id), req.brandId);
      res.json({ success: result.ok, message: result.message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop (alias for cancel, backward compat)
  router.post("/:id/stop", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const result = await engine.cancelCampaign(userId, String(req.params.id), req.brandId);
      res.json({ success: result.ok, message: result.message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Response Intelligence ─────────────────────────────────────

  // Classify a text (for testing/preview)
  router.post("/intelligence/classify", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { text, useAI } = req.body;
      if (!text) return res.status(400).json({ error: "text is required" });

      const classification = useAI
        ? await responseIntelligence.classifyWithAI(text)
        : responseIntelligence.classifyText(text);

      res.json({ success: true, classification });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get high-score leads (ready for human handoff)
  router.get("/intelligence/hot-leads", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const threshold = Number(req.query.threshold || 70);
      const leads = await responseIntelligence.getHighScoreLeads(userId, threshold);
      res.json({ success: true, leads });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process incoming reply (hook for inbox integration)
  router.post("/intelligence/process-reply", async (req: BrandRequest, res) => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { phone, text, timestamp } = req.body;
      if (!phone || !text) return res.status(400).json({ error: "phone and text are required" });

      const result = await engine.processIncomingReply(
        userId,
        String(phone),
        String(text),
        Number(timestamp || Date.now()),
        req.brandId
      );

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createCampaignRoutes;
