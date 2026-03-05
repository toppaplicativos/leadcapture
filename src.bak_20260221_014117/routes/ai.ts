import { Router, Request, Response } from "express";
import path from "path";
import { AuthRequest } from "../middleware/auth";
import { queryOne } from "../config/database";
import { AIService } from "../services/ai";
import { AIAgentProfileService } from "../services/aiAgentProfile";
import { KnowledgeBaseService } from "../services/knowledgeBase";
import { CreativeStudioService } from "../services/creativeStudio";
import { logger } from "../utils/logger";

const router = Router();
const aiService = new AIService();
const aiAgentProfileService = new AIAgentProfileService();
const knowledgeBaseService = new KnowledgeBaseService();
const creativeStudio = new CreativeStudioService();

type OwnedInstanceRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
};

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function buildUploadAbsolutePath(fileUrl: string): string {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const normalized = fileUrl.replace(/\\/g, "/");
  const relative = normalized.startsWith("/uploads/")
    ? normalized.slice("/uploads/".length)
    : normalized.replace(/^\/+/, "");
  const absolute = path.resolve(uploadsRoot, relative);

  if (!absolute.startsWith(uploadsRoot)) {
    throw new Error("Invalid creative file path");
  }

  return absolute;
}

function inferMediaTypeByPath(filePath: string): "image" | "video" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".mov" || ext === ".webm" || ext === ".mkv") {
    return "video";
  }
  return "image";
}

function buildDefaultAgentProfile(userId: string) {
  return {
    user_id: userId,
    company_id: undefined,
    agent_name: "Assistente Comercial",
    tone: "professional",
    language: "pt-BR",
    include_emojis: true,
    max_length: 500,
    objective: "",
    business_context: "",
    communication_rules: "",
    training_notes: "",
    forbidden_terms: [],
    preferred_terms: [],
  };
}

router.get("/agent-profile", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await aiAgentProfileService.getByUserId(userId);
    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error(`Error fetching AI agent profile: ${error.message}`);
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.json({ success: true, profile: buildDefaultAgentProfile(userId) });
  }
});

router.put("/agent-profile", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await aiAgentProfileService.upsertByUserId(userId, req.body || {});
    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error(`Error updating AI agent profile: ${error.message}`);
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const fallback = {
      ...buildDefaultAgentProfile(userId),
      ...(req.body || {}),
      user_id: userId,
    };
    res.json({ success: true, profile: fallback });
  }
});

router.post("/train", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, content, category, tags, company_id } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const entry = await knowledgeBaseService.create(userId, {
      title: String(title),
      content: String(content),
      category: category ? String(category) : "training",
      tags: tags ? String(tags) : undefined,
      company_id: company_id !== undefined ? (company_id as any) : undefined,
      active: true,
    });

    res.status(201).json({ success: true, entry });
  } catch (error: any) {
    logger.error(`Error training AI agent: ${error.message}`);
    res.status(500).json({ error: "Failed to save training data" });
  }
});

router.get("/training-data", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { category, search, active } = req.query;
    const entries = await knowledgeBaseService.getAll({
      user_id: userId,
      category: typeof category === "string" ? category : undefined,
      search: typeof search === "string" ? search : undefined,
      active: active === undefined ? true : active === "true",
    });

    res.json({ success: true, entries });
  } catch (error: any) {
    logger.error(`Error listing training data: ${error.message}`);
    res.json({ success: true, entries: [] });
  }
});

router.post("/analyze-message", async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    const analysis = await aiService.analyzeMessage(String(message));
    res.json({ success: true, ...analysis });
  } catch (error: any) {
    logger.error(`Error analyzing message: ${error.message}`);
    res.status(500).json({ error: "Failed to analyze message" });
  }
});

router.post("/generate-response", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { message, context, tone, company_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const profile = await aiAgentProfileService.getByUserId(userId);
    const normalizedTone =
      tone === "formal" || tone === "casual" || tone === "friendly" || tone === "professional"
        ? tone
        : profile.tone;

    const [kbContext, behaviorBlock] = await Promise.all([
      knowledgeBaseService.searchForContext(
        String(message),
        userId,
        company_id ? String(company_id) : profile.company_id
      ),
      Promise.resolve(aiAgentProfileService.buildBehaviorBlock(profile)),
    ]);

    const mergedContext = [
      context ? String(context) : "",
      behaviorBlock,
      kbContext ? `Base de conhecimento relevante:\n${kbContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const generated = await aiService.generateCustomMessage(String(message), {
      tone: normalizedTone,
      context: mergedContext,
      maxLength: profile.max_length,
      language: profile.language,
      includeEmojis: profile.include_emojis,
      agentName: profile.agent_name,
      objective: profile.objective,
      communicationRules: profile.communication_rules,
      trainingNotes: profile.training_notes,
      preferredTerms: profile.preferred_terms,
      forbiddenTerms: profile.forbidden_terms,
    });
    res.json({ success: true, message: generated });
  } catch (error: any) {
    logger.error(`Error generating response: ${error.message}`);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

router.post("/qualify-lead", async (req: Request, res: Response) => {
  try {
    const { conversationHistory } = req.body;
    if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return res.status(400).json({ error: "Conversation history is required" });
    }

    const transcript = conversationHistory.map((line: unknown) => String(line)).join("\n");
    const analysis = await aiService.analyzeMessage(transcript);
    const score = analysis.sentiment === "positive" ? 80 : analysis.sentiment === "neutral" ? 55 : 30;

    res.json({
      success: true,
      score,
      grade: score >= 75 ? "A" : score >= 50 ? "B" : "C",
      recommendation: score >= 75 ? "hot_lead" : score >= 50 ? "warm_lead" : "cold_lead",
      reasoning: `Intento detectado: ${analysis.intent}`,
      suggestedNextStep: analysis.suggestedResponse,
    });
  } catch (error: any) {
    logger.error(`Error qualifying lead: ${error.message}`);
    res.status(500).json({ error: "Failed to qualify lead" });
  }
});

router.post("/creatives/text", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, tone, objective, audience, maxCharacters } = req.body || {};
    if (!prompt || String(prompt).trim().length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const result = await creativeStudio.generateText(userId, {
      prompt: String(prompt).trim(),
      tone: tone ? String(tone) : undefined,
      objective: objective ? String(objective) : undefined,
      audience: audience ? String(audience) : undefined,
      maxCharacters: maxCharacters ? Number(maxCharacters) : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative text generation failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to generate creative text" });
  }
});

router.post("/creatives/image", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, style, format } = req.body || {};
    if (!prompt || String(prompt).trim().length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const result = await creativeStudio.generateImage(userId, {
      prompt: String(prompt).trim(),
      style: style ? String(style) : undefined,
      format:
        format === "portrait" || format === "landscape" || format === "square"
          ? format
          : "square",
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative image generation failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to generate creative image" });
  }
});

router.get("/creatives/gallery", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const type = req.query.type;
    const search = req.query.search;
    const limit = req.query.limit;
    const offset = req.query.offset;

    const result = await creativeStudio.listAssets(userId, {
      type: type === "text" || type === "image" || type === "video" ? type : undefined,
      search: typeof search === "string" && search.trim() ? search.trim() : undefined,
      limit: typeof limit === "string" ? Number(limit) : undefined,
      offset: typeof offset === "string" ? Number(offset) : undefined,
    });

    res.json({
      success: true,
      assets: result.assets,
      total: result.total,
    });
  } catch (error: any) {
    logger.error(`Creative gallery listing failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to list creative assets" });
  }
});

router.post("/creatives/image/remix", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { sourceAssetId, sourceUrl, instructions, style, format } = req.body || {};
    if (!instructions || String(instructions).trim().length < 5) {
      return res.status(400).json({ error: "Instructions are required (min 5 chars)" });
    }
    if (!sourceAssetId && !sourceUrl) {
      return res.status(400).json({ error: "sourceAssetId or sourceUrl is required" });
    }

    const result = await creativeStudio.remixImage(userId, {
      sourceAssetId: sourceAssetId ? String(sourceAssetId) : undefined,
      sourceUrl: sourceUrl ? String(sourceUrl) : undefined,
      instructions: String(instructions).trim(),
      style: style ? String(style) : undefined,
      format:
        format === "portrait" || format === "landscape" || format === "square"
          ? format
          : "square",
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative image remix failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to remix creative image" });
  }
});

router.post("/creatives/test-send", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { instanceId, assetId, message, caption, testPhone } = req.body || {};
    if (!instanceId) {
      return res.status(400).json({ error: "instanceId is required" });
    }
    if (!assetId && !message) {
      return res.status(400).json({ error: "assetId or message is required" });
    }

    const instance = await queryOne<OwnedInstanceRow>(
      "SELECT id, name, phone, status FROM whatsapp_instances WHERE id = ? AND created_by = ? LIMIT 1",
      [String(instanceId), userId]
    );
    if (!instance) return res.status(404).json({ error: "Instance not found" });

    const explicitPhone = normalizePhone(testPhone);
    const defaultPhone = normalizePhone(instance.phone);
    const destinationPhone = explicitPhone || defaultPhone;
    const usedDefaultNumber = explicitPhone.length === 0;

    if (!destinationPhone) {
      return res.status(400).json({
        error: "No test destination number available. Connect this instance first or provide testPhone.",
      });
    }

    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) {
      return res.status(500).json({ error: "Instance manager not available" });
    }

    const runtimeInstance = instanceManager.getInstance(String(instanceId), userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      return res.status(400).json({ error: "Instance not connected" });
    }

    if (message && !assetId) {
      const textPayload = String(message).trim();
      if (!textPayload) return res.status(400).json({ error: "message is empty" });

      const sent = await instanceManager.sendMessage(
        String(instanceId),
        destinationPhone,
        `[TESTE CRIATIVO]\n${textPayload}`
      );
      if (!sent) {
        return res.status(400).json({ error: "Failed to send test message" });
      }

      return res.json({
        success: true,
        message: "Creative test sent successfully",
        sentTo: destinationPhone,
        usedDefaultNumber,
      });
    }

    const asset = await creativeStudio.getAssetById(userId, String(assetId));
    if (!asset) return res.status(404).json({ error: "Creative asset not found" });

    if (asset.type === "text") {
      const textPayload = String(asset.text || message || "").trim();
      if (!textPayload) {
        return res.status(400).json({ error: "Selected text asset has no content" });
      }

      const sent = await instanceManager.sendMessage(
        String(instanceId),
        destinationPhone,
        `[TESTE CRIATIVO - TEXTO]\n${textPayload}`
      );
      if (!sent) return res.status(400).json({ error: "Failed to send text creative test" });

      return res.json({
        success: true,
        message: "Creative text test sent successfully",
        assetId: asset.id,
        assetType: asset.type,
        sentTo: destinationPhone,
        usedDefaultNumber,
      });
    }

    if (!asset.fileUrl) {
      return res.status(400).json({ error: "Selected creative asset has no file available" });
    }

    const filePath = buildUploadAbsolutePath(asset.fileUrl);
    const mediaType = inferMediaTypeByPath(filePath);
    const metadataCaption =
      asset.metadata && typeof asset.metadata.caption === "string"
        ? asset.metadata.caption
        : undefined;
    const mediaCaption = String(caption || metadataCaption || asset.prompt || "Teste de criativo").trim();

    const sent = await instanceManager.sendMedia(String(instanceId), destinationPhone, {
      mediaType,
      filePath,
      caption: `[TESTE CRIATIVO - ${asset.type.toUpperCase()}]\n${mediaCaption}`,
      fileName: path.basename(filePath),
    });

    if (!sent) {
      return res.status(400).json({ error: "Failed to send media creative test" });
    }

    res.json({
      success: true,
      message: "Creative media test sent successfully",
      assetId: asset.id,
      assetType: asset.type,
      sentTo: destinationPhone,
      usedDefaultNumber,
    });
  } catch (error: any) {
    logger.error(`Creative test send failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to send creative test" });
  }
});

router.post("/creatives/video", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, aspectRatio } = req.body || {};
    if (!prompt || String(prompt).trim().length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const job = await creativeStudio.startVideoGeneration(userId, {
      prompt: String(prompt).trim(),
      aspectRatio:
        aspectRatio === "16:9" || aspectRatio === "9:16" || aspectRatio === "1:1"
          ? aspectRatio
          : "16:9",
    });

    res.status(202).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        model: job.model,
      },
    });
  } catch (error: any) {
    logger.error(`Creative video generation start failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to start creative video generation" });
  }
});

router.get("/creatives/video/:jobId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const job = await creativeStudio.getVideoJob(userId, String(req.params.jobId));
    if (!job) return res.status(404).json({ error: "Video generation job not found" });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        model: job.model,
        createdAt: job.createdAt,
        videoUrl: job.videoUrl,
        error: job.error,
      },
    });
  } catch (error: any) {
    logger.error(`Creative video status check failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to check creative video status" });
  }
});

export default router;
