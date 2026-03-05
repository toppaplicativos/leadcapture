import { Router, Request, Response } from "express";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";
import multer from "multer";
import { AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { queryOne } from "../config/database";
import { AIService } from "../services/ai";
import { AIAgentProfileService } from "../services/aiAgentProfile";
import { KnowledgeBaseService } from "../services/knowledgeBase";
import { CreativeStudioService } from "../services/creativeStudio";
import { ContextEnginePayload, ContextEngineService } from "../services/contextEngine";
import { logger } from "../utils/logger";

const router = Router();
const aiService = new AIService();
const aiAgentProfileService = new AIAgentProfileService();
const knowledgeBaseService = new KnowledgeBaseService();
const creativeStudio = new CreativeStudioService();
const contextEngine = new ContextEngineService();

router.use(requireBrandContext);

function resolveBrandCompanyId(req: BrandRequest): string | undefined {
  const brandId = String(req.brandId || "").trim();
  return brandId || undefined;
}

function sanitizePathPart(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeImageExt(originalName: string): string {
  const ext = path.extname(String(originalName || "")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
  return ".png";
}

const creativesImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const authReq = req as AuthRequest;
      const userId = String(authReq.user?.userId || "anonymous");
      const safeUserId = sanitizePathPart(userId);
      const destinationDir = path.resolve(process.cwd(), "uploads", "creatives", "images", safeUserId);
      fs.mkdirSync(destinationDir, { recursive: true });
      cb(null, destinationDir);
    },
    filename: (req, file, cb) => {
      const ext = normalizeImageExt(file.originalname || "");
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

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

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch {
      // ignore JSON parse errors and use CSV fallback
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveSuggestionPrompt(
  payload: ContextEnginePayload,
  suggestionKey: unknown,
  module: "text" | "image" | "video" | "campaign" | "outbound"
): string {
  const key = String(suggestionKey || "").trim();
  if (!key) return "";
  return contextEngine.getSuggestion(payload, key, module)?.prompt || "";
}

function contextNotReadyResponse(
  res: Response,
  contextPayload: ContextEnginePayload,
  moduleLabel: string
) {
  return res.status(412).json({
    error: `Complete o Contexto Mestre para habilitar geracao inteligente de ${moduleLabel}.`,
    contextScore: contextPayload.score,
    profileComplete: contextPayload.profileComplete,
    missingFields: contextPayload.missingFields,
    fields: contextPayload.fields
  });
}

router.get("/agent-profile", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await aiAgentProfileService.getByUserId(userId, resolveBrandCompanyId(req));
    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error(`Error fetching AI agent profile: ${error.message}`);
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.json({ success: true, profile: buildDefaultAgentProfile(userId) });
  }
});

router.put("/agent-profile", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const profile = await aiAgentProfileService.upsertByUserId(userId, {
      ...(req.body || {}),
      company_id: resolveBrandCompanyId(req),
    });
    res.json({ success: true, profile });
  } catch (error: any) {
    logger.error(`Error updating AI agent profile: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to update AI agent profile" });
  }
});

router.post("/train", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, content, category, tags } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const entry = await knowledgeBaseService.create(userId, {
      title: String(title),
      content: String(content),
      category: category ? String(category) : "training",
      tags: tags ? String(tags) : undefined,
      company_id: resolveBrandCompanyId(req),
      active: true,
    });

    res.status(201).json({ success: true, entry });
  } catch (error: any) {
    logger.error(`Error training AI agent: ${error.message}`);
    res.status(500).json({ error: "Failed to save training data" });
  }
});

router.get("/training-data", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { category, search, active } = req.query;
    const entries = await knowledgeBaseService.getAll({
      user_id: userId,
      category: typeof category === "string" ? category : undefined,
      search: typeof search === "string" ? search : undefined,
      active: active === undefined ? true : active === "true",
      company_id: resolveBrandCompanyId(req),
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

router.post("/generate-response", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { message, context, tone } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const activeCompanyId = resolveBrandCompanyId(req);
    const profile = await aiAgentProfileService.getByUserId(userId, activeCompanyId);
    const normalizedTone =
      tone === "formal" || tone === "casual" || tone === "friendly" || tone === "professional"
        ? tone
        : profile.tone;

    const [kbContext, behaviorBlock] = await Promise.all([
      knowledgeBaseService.searchForContext(
        String(message),
        userId,
        activeCompanyId || profile.company_id
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

router.get("/creatives/context", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const contextPayload = await contextEngine.getResolvedContext(userId);
    res.json({ success: true, context: contextPayload });
  } catch (error: any) {
    logger.error(`Creative context fetch failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to load creative context" });
  }
});

router.put("/creatives/context", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const contextPayload = await contextEngine.updateManualProfile(userId, req.body || {});
    res.json({ success: true, context: contextPayload });
  } catch (error: any) {
    logger.error(`Creative context update failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to update creative context" });
  }
});

router.post("/creatives/rewrite", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { text, target, useContext, tone, objective, maxCharacters } = req.body || {};
    if (!text || String(text).trim().length < 6) {
      return res.status(400).json({ error: "text is required (min 6 chars)" });
    }

    const smartMode = parseBoolean(useContext);
    let contextPayload: ContextEnginePayload | null = null;

    if (smartMode) {
      contextPayload = await contextEngine.getResolvedContext(userId);
      if (!contextPayload.profileComplete) {
        return contextNotReadyResponse(res, contextPayload, "reescrita");
      }
    }

    const rewritePrompt = [
      contextPayload ? contextPayload.contextBlock : "",
      "Reescreva o texto a seguir para campanha de WhatsApp.",
      target ? `Formato de saida desejado: ${String(target).trim()}.` : "",
      tone ? `Tom desejado: ${String(tone).trim()}.` : "",
      objective ? `Objetivo: ${String(objective).trim()}.` : "",
      "Entregue apenas o texto final, sem markdown.",
      `Texto original:\n${String(text).trim()}`
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await creativeStudio.generateText(userId, {
      prompt: rewritePrompt,
      tone: tone ? String(tone).trim() : contextPayload?.global.toneOfVoice,
      objective: objective ? String(objective).trim() : contextPayload?.global.goals[0],
      audience: contextPayload?.global.targetAudience || undefined,
      maxCharacters: maxCharacters ? Number(maxCharacters) : undefined
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({
      success: true,
      text: result.text,
      model: result.model,
      asset: result.asset,
      contextApplied: !!contextPayload,
      contextScore: contextPayload?.score || null
    });
  } catch (error: any) {
    logger.error(`Creative rewrite failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to rewrite creative text" });
  }
});

router.post("/creatives/text", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, tone, objective, audience, maxCharacters, useContext, suggestionKey } = req.body || {};
    const smartMode = parseBoolean(useContext);
    const rawPrompt = String(prompt || "").trim();
    let finalPrompt = rawPrompt;
    let contextPayload: ContextEnginePayload | null = null;

    if (smartMode) {
      contextPayload = await contextEngine.getResolvedContext(userId);
      if (!contextPayload.profileComplete) {
        return contextNotReadyResponse(res, contextPayload, "texto");
      }

      const suggestionPrompt = resolveSuggestionPrompt(contextPayload, suggestionKey, "text");
      finalPrompt = rawPrompt || suggestionPrompt;
      if (!finalPrompt) {
        finalPrompt =
          "Crie uma copy de WhatsApp de alta conversao com CTA claro, focada no objetivo do negocio.";
      }
      finalPrompt = contextEngine.buildPromptWithContext(contextPayload, "text", finalPrompt);
    }

    if (!finalPrompt || finalPrompt.length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const result = await creativeStudio.generateText(userId, {
      prompt: finalPrompt,
      tone: tone ? String(tone) : contextPayload?.global.toneOfVoice,
      objective: objective ? String(objective) : contextPayload?.global.goals[0],
      audience: audience ? String(audience) : contextPayload?.global.targetAudience,
      maxCharacters: maxCharacters ? Number(maxCharacters) : undefined,
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({
      success: true,
      ...result,
      contextApplied: !!contextPayload,
      contextScore: contextPayload?.score || null,
      suggestionKey: suggestionKey ? String(suggestionKey) : null
    });
  } catch (error: any) {
    logger.error(`Creative text generation failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to generate creative text" });
  }
});

router.post("/creatives/image", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompt, style, format, useContext, suggestionKey } = req.body || {};
    const smartMode = parseBoolean(useContext);
    const rawPrompt = String(prompt || "").trim();
    let finalPrompt = rawPrompt;
    let contextPayload: ContextEnginePayload | null = null;

    if (smartMode) {
      contextPayload = await contextEngine.getResolvedContext(userId);
      if (!contextPayload.profileComplete) {
        return contextNotReadyResponse(res, contextPayload, "imagem");
      }

      const suggestionPrompt = resolveSuggestionPrompt(contextPayload, suggestionKey, "image");
      finalPrompt = rawPrompt || suggestionPrompt;
      if (!finalPrompt) {
        finalPrompt = "Crie uma imagem publicitaria comercial com foco em conversao.";
      }
      finalPrompt = contextEngine.buildPromptWithContext(contextPayload, "image", finalPrompt);
    }

    if (!finalPrompt || finalPrompt.length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const result = await creativeStudio.generateImage(userId, {
      prompt: finalPrompt,
      style: style ? String(style) : undefined,
      format:
        format === "portrait" || format === "landscape" || format === "square"
          ? format
          : "square",
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({
      success: true,
      ...result,
      contextApplied: !!contextPayload,
      contextScore: contextPayload?.score || null,
      suggestionKey: suggestionKey ? String(suggestionKey) : null
    });
  } catch (error: any) {
    logger.error(`Creative image generation failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to generate creative image" });
  }
});

router.post(
  "/creatives/image/upload",
  creativesImageUpload.single("image"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Image file is required" });
      }

      const safeUserId = sanitizePathPart(userId);
      const imageUrl = `/uploads/creatives/images/${safeUserId}/${file.filename}`;
      const caption = String(req.body?.caption || "").trim();
      const prompt = String(req.body?.prompt || "").trim();

      const result = await creativeStudio.registerUploadedImage(userId, {
        fileUrl: imageUrl,
        originalName: file.originalname,
        caption,
        prompt
      }, resolveBrandCompanyId(req as BrandRequest));

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error: any) {
      logger.error(`Creative image upload failed: ${error.message}`);
      res.status(500).json({ error: error.message || "Failed to upload creative image" });
    }
  }
);

router.post(
  "/creatives/studio/upload",
  creativesImageUpload.array("images", 8),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const files = (req.files || []) as Express.Multer.File[];
      if (!files.length) {
        return res.status(400).json({ error: "At least one image file is required" });
      }

      const imageTypeRaw = String(req.body?.imageType || "product").trim().toLowerCase();
      const imageType =
        imageTypeRaw === "reference" || imageTypeRaw === "background" || imageTypeRaw === "product"
          ? imageTypeRaw
          : "product";

      const productId = String(req.body?.productId || "").trim() || undefined;
      const tags = parseStringArray(req.body?.tags);
      const caption = String(req.body?.caption || "").trim() || undefined;

      const safeUserId = sanitizePathPart(userId);
      const assets = await Promise.all(
        files.map(async (file) => {
          const imageUrl = `/uploads/creatives/images/${safeUserId}/${file.filename}`;
          return creativeStudio.registerStudioImage(userId, {
            fileUrl: imageUrl,
            imageType: imageType as any,
            productId,
            originalName: file.originalname,
            caption,
            tags
          }, resolveBrandCompanyId(req as BrandRequest));
        })
      );

      const credits = await creativeStudio.getProductStudioCredits(userId, resolveBrandCompanyId(req as BrandRequest));
      res.status(201).json({ success: true, assets, credits });
    } catch (error: any) {
      logger.error(`Creative studio upload failed: ${error.message}`);
      res.status(500).json({ error: error.message || "Failed to upload studio images" });
    }
  }
);

router.get("/creatives/studio/credits", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const credits = await creativeStudio.getProductStudioCredits(userId, resolveBrandCompanyId(req as BrandRequest));
    res.json({ success: true, credits });
  } catch (error: any) {
    logger.error(`Creative studio credits fetch failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to fetch studio credits" });
  }
});

router.post("/creatives/studio/generate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const variations = Number(body.variations || 1);
    const aspectRatio = String(body.aspectRatio || "1:1") as any;
    const formats = parseStringArray(body.formats) as any;
    const tags = parseStringArray(body.tags);

    const result = await creativeStudio.generateProductStudioImages(userId, {
      productId: body.productId ? String(body.productId) : undefined,
      productAssetId: body.productAssetId ? String(body.productAssetId) : undefined,
      backgroundAssetId: body.backgroundAssetId ? String(body.backgroundAssetId) : undefined,
      referenceAssetIds: parseStringArray(body.referenceAssetIds),
      style: body.style ? String(body.style) : undefined,
      scene: body.scene ? String(body.scene) : undefined,
      lighting: body.lighting ? String(body.lighting) : undefined,
      targetAudience: body.targetAudience ? String(body.targetAudience) : undefined,
      predominantColors: body.predominantColors ? String(body.predominantColors) : undefined,
      aspectRatio,
      formats,
      textOverlay: {
        headline: body.headline ? String(body.headline) : undefined,
        subheadline: body.subheadline ? String(body.subheadline) : undefined,
        cta: body.cta ? String(body.cta) : undefined,
        position: body.textPosition ? String(body.textPosition) as any : undefined,
        style: body.textStyle ? String(body.textStyle) as any : undefined,
      },
      variations: Number.isFinite(variations) ? variations : 1,
      quality: body.quality === "fast" ? "fast" : "high",
      withAndWithoutText: parseBoolean(body.withAndWithoutText),
      transparentBackground: parseBoolean(body.transparentBackground),
      tags,
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative studio generation failed: ${error.message}`);
    const status = String(error.message || "").includes("Insufficient credits") ? 402 : 500;
    res.status(status).json({ error: error.message || "Failed to generate studio images" });
  }
});

router.post("/creatives/studio/edit", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    if (!body.sourceAssetId || !body.instruction) {
      return res.status(400).json({ error: "sourceAssetId and instruction are required" });
    }

    const result = await creativeStudio.editProductStudioImage(userId, {
      sourceAssetId: String(body.sourceAssetId),
      instruction: String(body.instruction),
      preserveProduct: body.preserveProduct === undefined ? true : parseBoolean(body.preserveProduct),
      style: body.style ? String(body.style) : undefined,
      aspectRatio: body.aspectRatio ? String(body.aspectRatio) as any : undefined,
      tags: parseStringArray(body.tags)
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative studio edit failed: ${error.message}`);
    const status = String(error.message || "").includes("Insufficient credits") ? 402 : 500;
    res.status(status).json({ error: error.message || "Failed to edit studio image" });
  }
});

router.get("/creatives/studio/gallery", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const usedInCampaignQuery = String(req.query.usedInCampaign || "").trim();
    const usedInCampaign = usedInCampaignQuery
      ? usedInCampaignQuery === "true" || usedInCampaignQuery === "1"
      : undefined;

    const result = await creativeStudio.listProductStudioGallery(userId, {
      productId: req.query.productId ? String(req.query.productId) : undefined,
      tag: req.query.tag ? String(req.query.tag).toLowerCase() : undefined,
      format: req.query.format ? String(req.query.format) as any : undefined,
      usedInCampaign,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    }, resolveBrandCompanyId(req as BrandRequest));

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(`Creative studio gallery listing failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to list studio gallery" });
  }
});

router.post("/creatives/studio/asset/:assetId/use-campaign", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const assetId = String(req.params.assetId || "").trim();
    if (!assetId) return res.status(400).json({ error: "assetId is required" });

    const campaignId = req.body?.campaignId ? String(req.body.campaignId) : undefined;
    const asset = await creativeStudio.markAssetUsedInCampaign(
      userId,
      assetId,
      campaignId,
      resolveBrandCompanyId(req as BrandRequest)
    );
    if (!asset) return res.status(404).json({ error: "Creative asset not found" });

    res.json({ success: true, asset });
  } catch (error: any) {
    logger.error(`Creative studio mark-used failed: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to mark asset as used" });
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
    }, resolveBrandCompanyId(req as BrandRequest));

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
    }, resolveBrandCompanyId(req as BrandRequest));

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

    const asset = await creativeStudio.getAssetById(userId, String(assetId), resolveBrandCompanyId(req as BrandRequest));
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

    const { prompt, aspectRatio, useContext, suggestionKey } = req.body || {};
    const smartMode = parseBoolean(useContext);
    const rawPrompt = String(prompt || "").trim();
    let finalPrompt = rawPrompt;
    let contextPayload: ContextEnginePayload | null = null;

    if (smartMode) {
      contextPayload = await contextEngine.getResolvedContext(userId);
      if (!contextPayload.profileComplete) {
        return contextNotReadyResponse(res, contextPayload, "video");
      }

      const suggestionPrompt = resolveSuggestionPrompt(contextPayload, suggestionKey, "video");
      finalPrompt = rawPrompt || suggestionPrompt;
      if (!finalPrompt) {
        finalPrompt = "Crie roteiro de video curto para campanha de WhatsApp com CTA de conversa.";
      }
      finalPrompt = contextEngine.buildPromptWithContext(contextPayload, "video", finalPrompt);
    }

    if (!finalPrompt || finalPrompt.length < 8) {
      return res.status(400).json({ error: "Prompt is required (min 8 chars)" });
    }

    const job = await creativeStudio.startVideoGeneration(userId, {
      prompt: finalPrompt,
      aspectRatio:
        aspectRatio === "16:9" || aspectRatio === "9:16" || aspectRatio === "1:1"
          ? aspectRatio
          : "16:9",
    }, resolveBrandCompanyId(req as BrandRequest));

    res.status(202).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        model: job.model,
      },
      contextApplied: !!contextPayload,
      contextScore: contextPayload?.score || null,
      suggestionKey: suggestionKey ? String(suggestionKey) : null
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

    const job = await creativeStudio.getVideoJob(userId, String(req.params.jobId), resolveBrandCompanyId(req as BrandRequest));
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
