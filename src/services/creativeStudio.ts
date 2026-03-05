import axios from "axios";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { config } from "../config";
import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

type VideoJobStatus = "processing" | "completed" | "failed";

export type VideoJob = {
  id: string;
  userId: string;
  prompt: string;
  operationName: string;
  status: VideoJobStatus;
  model: string;
  createdAt: string;
  error?: string;
  videoUrl?: string;
};

export type CreativeAssetType = "text" | "image" | "video";

export type StudioImageType = "product" | "reference" | "background";

export type StudioAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type StudioQuality = "fast" | "high";

export type ProductStudioTextOverlay = {
  headline?: string;
  subheadline?: string;
  cta?: string;
  position?: "top" | "center" | "bottom";
  style?: "modern" | "elegant" | "bold" | "clean";
};

export type ProductStudioGenerateInput = {
  productId?: string;
  productAssetId?: string;
  referenceAssetIds?: string[];
  backgroundAssetId?: string;
  style?: string;
  scene?: string;
  lighting?: string;
  targetAudience?: string;
  predominantColors?: string;
  aspectRatio?: StudioAspectRatio;
  formats?: StudioAspectRatio[];
  textOverlay?: ProductStudioTextOverlay;
  variations?: number;
  quality?: StudioQuality;
  withAndWithoutText?: boolean;
  transparentBackground?: boolean;
  tags?: string[];
};

export type ProductStudioEditInput = {
  sourceAssetId: string;
  instruction: string;
  preserveProduct?: boolean;
  style?: string;
  aspectRatio?: StudioAspectRatio;
  tags?: string[];
};

export type ProductStudioCredits = {
  accountId: string;
  imagesGeneratedMonth: number;
  creditsRemaining: number;
  monthlyLimit: number;
  monthRef: string;
};

export type CreativeAsset = {
  id: string;
  type: CreativeAssetType;
  prompt?: string;
  model?: string;
  status: VideoJobStatus;
  text?: string;
  fileUrl?: string;
  parentAssetId?: string;
  metadata?: Record<string, any>;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type GenerateTextInput = {
  prompt: string;
  tone?: string;
  objective?: string;
  audience?: string;
  maxCharacters?: number;
};

type GenerateImageInput = {
  prompt: string;
  style?: string;
  format?: "square" | "portrait" | "landscape";
};

type GenerateVideoInput = {
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
};

type RemixImageInput = {
  sourceAssetId?: string;
  sourceUrl?: string;
  instructions: string;
  style?: string;
  format?: "square" | "portrait" | "landscape";
};

export class CreativeStudioService {
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private readonly videoJobs = new Map<string, VideoJob>();
  private assetsTableReady = false;
  private creditsTableReady = false;

  private normalizeBrandId(brandId?: string | null): string | null {
    const normalized = String(brandId || "").trim();
    return normalized || null;
  }

  private creditsAccountId(userId: string, brandId?: string | null): string {
    const normalizedBrandId = this.normalizeBrandId(brandId);
    return `${userId}::${normalizedBrandId || "__default__"}`;
  }

  private extractAssetBrandId(metadata: Record<string, any> | undefined): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const a = String(metadata.brandId || "").trim();
    const b = String(metadata.brand_id || "").trim();
    return a || b || null;
  }

  private belongsToBrand(metadata: Record<string, any> | undefined, brandId?: string | null): boolean {
    const normalizedBrandId = this.normalizeBrandId(brandId);
    const assetBrandId = this.extractAssetBrandId(metadata);
    if (normalizedBrandId) return assetBrandId === normalizedBrandId;
    return !assetBrandId;
  }

  private isGalleryGeneratedAsset(metadata: Record<string, any> | undefined): boolean {
    const source = String(metadata?.source || "").trim().toLowerCase();
    if (!source) return true;
    if (source === "upload" || source === "studio-upload") return false;
    return !source.includes("upload");
  }

  private getApiKey(): string {
    const apiKey = config.geminiApiKey;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    return apiKey;
  }

  private sanitizePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  private extractTextFromCandidate(candidate: any): string {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) return "";
    const textPart = parts.find((part: any) => typeof part?.text === "string");
    return textPart?.text?.trim() || "";
  }

  private parseJsonSafely(value: any): Record<string, any> | undefined {
    if (!value) return undefined;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private toFormatFromAspect(aspectRatio?: StudioAspectRatio): "square" | "portrait" | "landscape" {
    if (aspectRatio === "9:16" || aspectRatio === "4:5") return "portrait";
    if (aspectRatio === "16:9") return "landscape";
    return "square";
  }

  private currentMonthRef(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  private normalizeTagList(tags?: string[] | null): string[] {
    if (!Array.isArray(tags)) return [];
    return Array.from(
      new Set(
        tags
          .map((item) => String(item || "").trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 24);
  }

  private buildProductStudioPrompt(input: ProductStudioGenerateInput, includeText = true): string {
    const text = input.textOverlay || {};
    const pieces = [
      "Create a professional commercial product photo using the uploaded product image as the main object.",
      input.style ? `Style: ${input.style}.` : "Style: premium commercial.",
      input.scene ? `Scene: ${input.scene}.` : "Scene: clean studio setup.",
      input.lighting ? `Lighting: ${input.lighting}.` : "Lighting: soft daylight with realistic shadows.",
      input.targetAudience ? `Audience: ${input.targetAudience}.` : "Audience: conversion-focused marketing.",
      input.predominantColors ? `Predominant colors: ${input.predominantColors}.` : "",
      "Use realistic materials, accurate product proportions, high detail and premium ad composition.",
      input.transparentBackground
        ? "Prefer transparent or isolated product-friendly background where feasible."
        : "",
      includeText && (text.headline || text.subheadline || text.cta)
        ? [
            "Integrate the following text in a clean commercial layout:",
            text.headline ? `Headline: \"${text.headline}\"` : "",
            text.subheadline ? `Subheadline: \"${text.subheadline}\"` : "",
            text.cta ? `CTA: \"${text.cta}\"` : "",
            text.position ? `Text position: ${text.position}.` : "",
            text.style ? `Text style: ${text.style}.` : ""
          ]
            .filter(Boolean)
            .join("\n")
        : "Do not add any textual overlay.",
      "No watermark. Keep typography readable if text is included."
    ];

    return pieces.filter(Boolean).join("\n");
  }

  private async loadAssetAsInlineData(userId: string, assetId: string): Promise<{ mimeType: string; data: string; fileUrl: string }> {
    const asset = await this.getAssetById(userId, assetId);
    if (!asset || asset.type !== "image" || !asset.fileUrl) {
      throw new Error(`Image asset not found: ${assetId}`);
    }

    const absolute = this.buildFileAbsolutePath(asset.fileUrl);
    const buffer = await fs.readFile(absolute);
    return {
      mimeType: this.getMimeTypeFromPath(absolute),
      data: buffer.toString("base64"),
      fileUrl: asset.fileUrl
    };
  }

  private async requestImageFromParts(userId: string, model: string, prompt: string, imageInlineParts: Array<{ mimeType: string; data: string }>) {
    const apiKey = this.getApiKey();
    const response = await axios.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              ...imageInlineParts.map((part) => ({
                inlineData: {
                  mimeType: part.mimeType,
                  data: part.data
                }
              }))
            ]
          }
        ]
      },
      {
        params: { key: apiKey },
        timeout: 120000
      }
    );

    const candidate = response.data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    const caption = this.extractTextFromCandidate(candidate);
    const base64Image = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

    if (!base64Image) {
      throw new Error("Image generation returned no inline image data");
    }

    const safeUserId = this.sanitizePathPart(userId);
    const fileName = `${Date.now()}-${randomUUID()}-studio.png`;
    const absoluteDir = path.resolve(process.cwd(), "uploads", "creatives", "images", safeUserId);
    await this.ensureDir(absoluteDir);
    const filePath = path.join(absoluteDir, fileName);
    await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));

    return {
      imageUrl: `/uploads/creatives/images/${safeUserId}/${fileName}`,
      caption
    };
  }

  private buildFileAbsolutePath(fileUrl: string): string {
    const normalized = fileUrl.replace(/\\/g, "/");
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const relative = normalized.startsWith("/uploads/") ? normalized.slice("/uploads/".length) : normalized;
    const candidate = path.resolve(uploadsRoot, relative);

    if (!candidate.startsWith(uploadsRoot)) {
      throw new Error("Invalid file path");
    }

    return candidate;
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".webp") return "image/webp";
    return "image/png";
  }

  private mapAssetRow(row: any): CreativeAsset {
    return {
      id: String(row.id),
      type: row.asset_type,
      prompt: row.prompt || undefined,
      model: row.model || undefined,
      status: row.status,
      text: row.text_content || undefined,
      fileUrl: row.file_url || undefined,
      parentAssetId: row.parent_asset_id || undefined,
      metadata: this.parseJsonSafely(row.metadata),
      error: row.error_message || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  private async ensureAssetsTable(): Promise<void> {
    if (this.assetsTableReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS creative_assets (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        asset_type ENUM('text','image','video') NOT NULL,
        prompt TEXT NULL,
        model VARCHAR(120) NULL,
        status ENUM('processing','completed','failed') NOT NULL DEFAULT 'completed',
        text_content LONGTEXT NULL,
        file_url TEXT NULL,
        parent_asset_id VARCHAR(36) NULL,
        operation_name VARCHAR(255) NULL,
        error_message TEXT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_creative_assets_user_created (user_id, created_at),
        INDEX idx_creative_assets_user_type (user_id, asset_type),
        INDEX idx_creative_assets_parent (parent_asset_id)
      )
    `);

    this.assetsTableReady = true;
  }

  private async ensureCreditsTable(): Promise<void> {
    if (this.creditsTableReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS creative_account_credits (
        account_id VARCHAR(36) NOT NULL PRIMARY KEY,
        images_generated_month INT NOT NULL DEFAULT 0,
        credits_remaining INT NOT NULL DEFAULT 200,
        monthly_limit INT NOT NULL DEFAULT 200,
        month_ref VARCHAR(7) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    this.creditsTableReady = true;
  }

  private async ensureCreditsRow(userId: string, brandId?: string | null): Promise<void> {
    await this.ensureCreditsTable();
    const accountId = this.creditsAccountId(userId, brandId);
    const monthRef = this.currentMonthRef();

    await query(
      `INSERT IGNORE INTO creative_account_credits (account_id, images_generated_month, credits_remaining, monthly_limit, month_ref)
       VALUES (?, 0, 200, 200, ?)`,
      [accountId, monthRef]
    );

    const row = await queryOne<any>(
      `SELECT account_id, images_generated_month, credits_remaining, monthly_limit, month_ref
       FROM creative_account_credits
       WHERE account_id = ? LIMIT 1`,
      [accountId]
    );

    if (!row) return;
    if (String(row.month_ref || "") !== monthRef) {
      await update(
        `UPDATE creative_account_credits
         SET images_generated_month = 0,
             credits_remaining = monthly_limit,
             month_ref = ?
         WHERE account_id = ?`,
        [monthRef, accountId]
      );
    }
  }

  async getProductStudioCredits(userId: string, brandId?: string | null): Promise<ProductStudioCredits> {
    await this.ensureCreditsRow(userId, brandId);
    const accountId = this.creditsAccountId(userId, brandId);
    const row = await queryOne<any>(
      `SELECT account_id, images_generated_month, credits_remaining, monthly_limit, month_ref
       FROM creative_account_credits
       WHERE account_id = ? LIMIT 1`,
      [accountId]
    );

    return {
      accountId: String(row?.account_id || accountId),
      imagesGeneratedMonth: Number(row?.images_generated_month || 0),
      creditsRemaining: Number(row?.credits_remaining || 0),
      monthlyLimit: Number(row?.monthly_limit || 0),
      monthRef: String(row?.month_ref || this.currentMonthRef())
    };
  }

  async consumeProductStudioCredits(userId: string, amount = 1, brandId?: string | null): Promise<ProductStudioCredits> {
    await this.ensureCreditsRow(userId, brandId);
    const accountId = this.creditsAccountId(userId, brandId);
    const toConsume = Math.max(1, Math.floor(amount));
    const credits = await this.getProductStudioCredits(userId, brandId);

    if (credits.creditsRemaining < toConsume) {
      throw new Error("Insufficient credits for image generation");
    }

    await update(
      `UPDATE creative_account_credits
       SET credits_remaining = credits_remaining - ?,
           images_generated_month = images_generated_month + ?
       WHERE account_id = ?`,
      [toConsume, toConsume, accountId]
    );

    return this.getProductStudioCredits(userId, brandId);
  }

  private async saveAsset(input: {
    userId: string;
    brandId?: string | null;
    type: CreativeAssetType;
    prompt?: string;
    model?: string;
    status?: VideoJobStatus;
    text?: string;
    fileUrl?: string;
    parentAssetId?: string;
    operationName?: string;
    error?: string;
    metadata?: Record<string, any>;
  }): Promise<CreativeAsset> {
    await this.ensureAssetsTable();

    const id = randomUUID();
    const mergedMetadata = {
      ...(input.metadata || {}),
      brandId: this.normalizeBrandId(input.brandId),
    };

    await query(
      `INSERT INTO creative_assets
       (id, user_id, asset_type, prompt, model, status, text_content, file_url, parent_asset_id, operation_name, error_message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.userId,
        input.type,
        input.prompt || null,
        input.model || null,
        input.status || "completed",
        input.text || null,
        input.fileUrl || null,
        input.parentAssetId || null,
        input.operationName || null,
        input.error || null,
        JSON.stringify(mergedMetadata)
      ]
    );

    const created = await queryOne<any>("SELECT * FROM creative_assets WHERE id = ?", [id]);
    if (!created) throw new Error("Failed to persist creative asset");
    return this.mapAssetRow(created);
  }

  private async updateAssetById(
    userId: string,
    id: string,
    patch: Partial<{
      status: VideoJobStatus;
      fileUrl: string;
      error: string;
      metadata: Record<string, any>;
    }>,
    brandId?: string | null
  ): Promise<CreativeAsset | null> {
    await this.ensureAssetsTable();

    const fields: string[] = [];
    const values: any[] = [];

    if (patch.status) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (patch.fileUrl !== undefined) {
      fields.push("file_url = ?");
      values.push(patch.fileUrl || null);
    }
    if (patch.error !== undefined) {
      fields.push("error_message = ?");
      values.push(patch.error || null);
    }
    if (patch.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(patch.metadata || {}));
    }

    if (fields.length > 0) {
      values.push(id, userId);
      await update(
        `UPDATE creative_assets SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
        values
      );
    }

    const row = await queryOne<any>(
      "SELECT * FROM creative_assets WHERE id = ? AND user_id = ?",
      [id, userId]
    );
    if (!row) return null;
    const mapped = this.mapAssetRow(row);
    if (!this.belongsToBrand(mapped.metadata, brandId)) return null;
    return mapped;
  }

  async listAssets(
    userId: string,
    filters?: { type?: CreativeAssetType; search?: string; limit?: number; offset?: number; includeUploads?: boolean },
    brandId?: string | null
  ): Promise<{ assets: CreativeAsset[]; total: number }> {
    await this.ensureAssetsTable();

    let where = "WHERE user_id = ?";
    const params: any[] = [userId];

    if (filters?.type) {
      where += " AND asset_type = ?";
      params.push(filters.type);
    }
    if (filters?.search) {
      where += " AND (prompt LIKE ? OR text_content LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s);
    }

    const limit = Math.max(1, Math.min(100, filters?.limit || 30));
    const offset = Math.max(0, filters?.offset || 0);

    const rows = await query<any[]>(
      `SELECT * FROM creative_assets ${where} ORDER BY created_at DESC`,
      params
    );

    const includeUploads = Boolean(filters?.includeUploads);
    const allAssets = rows
      .map((row) => this.mapAssetRow(row))
      .filter((asset) => this.belongsToBrand(asset.metadata, brandId))
      .filter((asset) => (includeUploads ? true : this.isGalleryGeneratedAsset(asset.metadata)));

    const total = allAssets.length;
    const assets = allAssets.slice(offset, offset + limit);

    return { assets, total };
  }

  async getAssetById(userId: string, assetId: string, brandId?: string | null): Promise<CreativeAsset | null> {
    await this.ensureAssetsTable();
    const row = await queryOne<any>(
      "SELECT * FROM creative_assets WHERE id = ? AND user_id = ? LIMIT 1",
      [assetId, userId]
    );
    if (!row) return null;
    const mapped = this.mapAssetRow(row);
    if (!this.belongsToBrand(mapped.metadata, brandId)) return null;
    return mapped;
  }

  async registerUploadedImage(
    userId: string,
    input: {
      fileUrl: string;
      originalName?: string;
      caption?: string;
      prompt?: string;
    },
    brandId?: string | null
  ): Promise<{ imageUrl: string; caption: string; model: string; asset: CreativeAsset }> {
    await this.ensureAssetsTable();

    const imageUrl = String(input.fileUrl || "").trim();
    if (!imageUrl) {
      throw new Error("Image file URL is required");
    }

    const caption = String(input.caption || "").trim();
    const prompt = String(input.prompt || caption || input.originalName || "Upload manual de imagem").trim();
    const model = "upload-manual";

    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "image",
      prompt,
      model,
      status: "completed",
      fileUrl: imageUrl,
      metadata: {
        caption,
        source: "upload",
        originalName: input.originalName || null
      }
    });

    return {
      imageUrl,
      caption,
      model,
      asset
    };
  }

  async registerStudioImage(
    userId: string,
    input: {
      fileUrl: string;
      imageType?: StudioImageType;
      productId?: string;
      originalName?: string;
      caption?: string;
      tags?: string[];
    },
    brandId?: string | null
  ): Promise<CreativeAsset> {
    const imageType: StudioImageType = input.imageType || "product";
    const tags = this.normalizeTagList(input.tags);

    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "image",
      prompt: input.caption || `Upload ${imageType}`,
      model: "upload-manual",
      status: "completed",
      fileUrl: input.fileUrl,
      metadata: {
        studio: {
          imageType,
          productId: input.productId || null,
          tags,
          usedInCampaign: false,
          version: 1
        },
        caption: input.caption || "",
        source: "studio-upload",
        originalName: input.originalName || null
      }
    });

    return asset;
  }

  async generateText(
    userId: string,
    input: GenerateTextInput,
    brandId?: string | null
  ): Promise<{ text: string; model: string; asset: CreativeAsset }> {
    const model = config.creatives.textModel;
    const apiKey = this.getApiKey();

    const instruction = [
      "Voce e um especialista em marketing de performance para campanhas de WhatsApp.",
      "Responda em portugues, direto ao ponto, com alta conversao.",
      input.tone ? `Tom desejado: ${input.tone}.` : "",
      input.objective ? `Objetivo da peca: ${input.objective}.` : "",
      input.audience ? `Publico alvo: ${input.audience}.` : "",
      input.maxCharacters ? `Limite maximo de ${input.maxCharacters} caracteres.` : "",
      "Entregue somente o texto final, sem markdown."
    ]
      .filter(Boolean)
      .join("\n");

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      {
        contents: [
          {
            parts: [
              {
                text: `${instruction}\n\nPedido:\n${input.prompt}`
              }
            ]
          }
        ]
      },
      {
        params: { key: apiKey },
        timeout: 30000
      }
    );

    const text = this.extractTextFromCandidate(response.data?.candidates?.[0]);
    if (!text) throw new Error("Model did not return text content");

    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "text",
      prompt: input.prompt,
      model,
      status: "completed",
      text,
      metadata: {
        tone: input.tone || null,
        objective: input.objective || null,
        audience: input.audience || null,
        maxCharacters: input.maxCharacters || null
      }
    });

    return { text, model, asset };
  }

  async generateImage(
    userId: string,
    input: GenerateImageInput,
    brandId?: string | null
  ): Promise<{ imageUrl: string; caption: string; model: string; asset: CreativeAsset }> {
    const model = config.creatives.imageModel;
    const apiKey = this.getApiKey();

    const formatHint =
      input.format === "portrait"
        ? "Formato vertical 9:16."
        : input.format === "landscape"
        ? "Formato horizontal 16:9."
        : "Formato quadrado 1:1.";

    const prompt = [input.prompt, input.style ? `Estilo visual: ${input.style}.` : "", formatHint, "Nao incluir marcas d'agua."]
      .filter(Boolean)
      .join("\n");

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { params: { key: apiKey }, timeout: 60000 }
    );

    const candidate = response.data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    const caption = this.extractTextFromCandidate(candidate);
    const base64Image = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    if (!base64Image) throw new Error("Image generation returned no inline image data");

    const safeUserId = this.sanitizePathPart(userId);
    const fileName = `${Date.now()}-${randomUUID()}.png`;
    const absoluteDir = path.resolve(process.cwd(), "uploads", "creatives", "images", safeUserId);
    await this.ensureDir(absoluteDir);
    const filePath = path.join(absoluteDir, fileName);
    await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));

    const imageUrl = `/uploads/creatives/images/${safeUserId}/${fileName}`;
    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "image",
      prompt: input.prompt,
      model,
      status: "completed",
      fileUrl: imageUrl,
      metadata: {
        caption,
        style: input.style || null,
        format: input.format || "square",
      },
    });

    return { imageUrl, caption, model, asset };
  }

  async remixImage(
    userId: string,
    input: RemixImageInput,
    brandId?: string | null
  ): Promise<{ imageUrl: string; caption: string; model: string; asset: CreativeAsset }> {
    const model = config.creatives.imageModel;
    const apiKey = this.getApiKey();
    await this.ensureAssetsTable();

    let parentAssetId: string | undefined;
    let sourceUrl = input.sourceUrl;

    if (input.sourceAssetId) {
      const sourceAsset = await this.getAssetById(userId, input.sourceAssetId, brandId);
      if (!sourceAsset || sourceAsset.type !== "image" || !sourceAsset.fileUrl) {
        throw new Error("Source image asset not found");
      }
      sourceUrl = sourceAsset.fileUrl;
      parentAssetId = sourceAsset.id;
    }

    if (!sourceUrl) {
      throw new Error("sourceAssetId or sourceUrl is required");
    }

    const sourcePath = this.buildFileAbsolutePath(sourceUrl);
    const sourceBuffer = await fs.readFile(sourcePath);
    const sourceBase64 = sourceBuffer.toString("base64");
    const mimeType = this.getMimeTypeFromPath(sourcePath);

    const formatHint =
      input.format === "portrait"
        ? "Formato de saida vertical 9:16."
        : input.format === "landscape"
        ? "Formato de saida horizontal 16:9."
        : "Formato de saida quadrado 1:1.";

    const prompt = [
      "Edite/remixe a imagem enviada mantendo qualidade comercial.",
      input.instructions,
      input.style ? `Estilo desejado: ${input.style}.` : "",
      formatHint,
      "Nao incluir texto ilegivel nem marca d'agua.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: sourceBase64 } },
            ],
          },
        ],
      },
      { params: { key: apiKey }, timeout: 90000 }
    );

    const candidate = response.data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    const caption = this.extractTextFromCandidate(candidate);
    const base64Image = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

    if (!base64Image) throw new Error("Image remix returned no inline image data");

    const safeUserId = this.sanitizePathPart(userId);
    const fileName = `${Date.now()}-${randomUUID()}-remix.png`;
    const absoluteDir = path.resolve(process.cwd(), "uploads", "creatives", "images", safeUserId);
    await this.ensureDir(absoluteDir);
    const filePath = path.join(absoluteDir, fileName);
    await fs.writeFile(filePath, Buffer.from(base64Image, "base64"));

    const imageUrl = `/uploads/creatives/images/${safeUserId}/${fileName}`;
    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "image",
      prompt: input.instructions,
      model,
      status: "completed",
      fileUrl: imageUrl,
      parentAssetId,
      metadata: {
        caption,
        style: input.style || null,
        format: input.format || "square",
        sourceUrl,
      },
    });

    return { imageUrl, caption, model, asset };
  }

  async generateProductStudioImages(
    userId: string,
    input: ProductStudioGenerateInput,
    brandId?: string | null
  ): Promise<{ assets: CreativeAsset[]; model: string; credits: ProductStudioCredits }> {
    const model = config.creatives.imageModel;
    await this.ensureAssetsTable();

    const formatsRaw = Array.isArray(input.formats) && input.formats.length > 0 ? input.formats : [input.aspectRatio || "1:1"];
    const formats = formatsRaw.slice(0, 4);
    const variations = Math.max(1, Math.min(4, Math.floor(input.variations || 1)));
    const withAndWithoutText = !!input.withAndWithoutText;
    const promptVersions = withAndWithoutText ? [true, false] : [true];
    const jobsCount = formats.length * variations * promptVersions.length;

    await this.consumeProductStudioCredits(userId, jobsCount, brandId);

    const sourceAssetIds: string[] = [];
    if (input.productAssetId) sourceAssetIds.push(input.productAssetId);
    if (input.backgroundAssetId) sourceAssetIds.push(input.backgroundAssetId);
    if (Array.isArray(input.referenceAssetIds)) sourceAssetIds.push(...input.referenceAssetIds.filter(Boolean));

    const uniqueSourceIds = Array.from(new Set(sourceAssetIds)).slice(0, 6);
    const inlineRefs = await Promise.all(uniqueSourceIds.map(async (assetId) => this.loadAssetAsInlineData(userId, assetId)));

    const createdAssets: CreativeAsset[] = [];
    const tags = this.normalizeTagList(input.tags);

    for (const format of formats) {
      const normalizedFormat = this.toFormatFromAspect(format);
      for (let i = 0; i < variations; i += 1) {
        for (const includeText of promptVersions) {
          const prompt = this.buildProductStudioPrompt({ ...input, aspectRatio: format }, includeText);

          const result = await this.requestImageFromParts(
            userId,
            model,
            `${prompt}\n\nOutput ratio target: ${format}.`,
            inlineRefs.map((item) => ({ mimeType: item.mimeType, data: item.data }))
          );

          const asset = await this.saveAsset({
            userId,
            brandId,
            type: "image",
            prompt,
            model,
            status: "completed",
            fileUrl: result.imageUrl,
            metadata: {
              caption: result.caption,
              studio: {
                module: "product-ai-studio",
                productId: input.productId || null,
                sourceAssetIds: uniqueSourceIds,
                format,
                normalizedFormat,
                variationIndex: i + 1,
                textIncluded: includeText,
                quality: input.quality || "high",
                tags,
                usedInCampaign: false,
                version: 1,
              },
            },
          });

          createdAssets.push(asset);
        }
      }
    }

    const credits = await this.getProductStudioCredits(userId, brandId);
    return { assets: createdAssets, model, credits };
  }

  async editProductStudioImage(
    userId: string,
    input: ProductStudioEditInput,
    brandId?: string | null
  ): Promise<{ asset: CreativeAsset; model: string; credits: ProductStudioCredits }> {
    const sourceAsset = await this.getAssetById(userId, input.sourceAssetId, brandId);
    if (!sourceAsset || sourceAsset.type !== "image" || !sourceAsset.fileUrl) {
      throw new Error("Source image asset not found");
    }

    await this.consumeProductStudioCredits(userId, 1, brandId);

    const sourceInline = await this.loadAssetAsInlineData(userId, input.sourceAssetId);
    const model = config.creatives.imageModel;
    const prompt = [
      "Modify the existing image according to the instruction while preserving commercial realism.",
      input.preserveProduct !== false ? "Keep the product unchanged." : "",
      input.style ? `Target style: ${input.style}.` : "",
      input.aspectRatio ? `Output ratio target: ${input.aspectRatio}.` : "",
      `Instruction: ${input.instruction}`,
      "No watermark.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.requestImageFromParts(userId, model, prompt, [{ mimeType: sourceInline.mimeType, data: sourceInline.data }]);

    const tags = this.normalizeTagList(input.tags);
    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "image",
      prompt,
      model,
      status: "completed",
      fileUrl: result.imageUrl,
      parentAssetId: sourceAsset.id,
      metadata: {
        caption: result.caption,
        studio: {
          module: "product-ai-studio",
          editMode: true,
          sourceAssetIds: [sourceAsset.id],
          tags,
          usedInCampaign: false,
          version: Number((sourceAsset.metadata as any)?.studio?.version || 1) + 1,
          aspectRatio: input.aspectRatio || null,
        },
      },
    });

    const credits = await this.getProductStudioCredits(userId, brandId);
    return { asset, model, credits };
  }

  async listProductStudioGallery(
    userId: string,
    filters?: {
      productId?: string;
      tag?: string;
      format?: StudioAspectRatio;
      usedInCampaign?: boolean;
      limit?: number;
      offset?: number;
    },
    brandId?: string | null
  ): Promise<{ assets: CreativeAsset[]; total: number }> {
    const list = await this.listAssets(
      userId,
      {
        type: "image",
        limit: Math.max(1, Math.min(200, filters?.limit || 60)),
        offset: Math.max(0, filters?.offset || 0),
        includeUploads: true,
      },
      brandId
    );

    const filtered = list.assets.filter((asset) => {
      const studio = (asset.metadata as any)?.studio;
      if (!studio) return false;
      if (filters?.productId && String(studio.productId || "") !== String(filters.productId)) return false;
      if (filters?.format && String(studio.format || "") !== String(filters.format)) return false;
      if (typeof filters?.usedInCampaign === "boolean" && Boolean(studio.usedInCampaign) !== filters.usedInCampaign) return false;
      if (filters?.tag) {
        const tags = Array.isArray(studio.tags) ? studio.tags.map((item: any) => String(item)) : [];
        if (!tags.includes(String(filters.tag).toLowerCase())) return false;
      }
      return true;
    });

    return { assets: filtered, total: filtered.length };
  }

  async markAssetUsedInCampaign(
    userId: string,
    assetId: string,
    campaignId?: string,
    brandId?: string | null
  ): Promise<CreativeAsset | null> {
    const asset = await this.getAssetById(userId, assetId, brandId);
    if (!asset) return null;

    const metadata = {
      ...(asset.metadata || {}),
      studio: {
        ...((asset.metadata as any)?.studio || {}),
        usedInCampaign: true,
        usedInCampaignAt: new Date().toISOString(),
        campaignId: campaignId || null,
      },
    };

    return this.updateAssetById(userId, assetId, { metadata }, brandId);
  }

  async startVideoGeneration(userId: string, input: GenerateVideoInput, brandId?: string | null): Promise<VideoJob> {
    const model = config.creatives.videoModel;
    const apiKey = this.getApiKey();

    const body: Record<string, unknown> = { instances: [{ prompt: input.prompt }] };
    if (input.aspectRatio) body.parameters = { aspectRatio: input.aspectRatio };

    const response = await axios.post(`${this.baseUrl}/models/${model}:predictLongRunning`, body, {
      params: { key: apiKey },
      timeout: 30000,
    });

    const operationName: string | undefined = response.data?.name;
    if (!operationName) throw new Error("Video generation operation was not created");

    const asset = await this.saveAsset({
      userId,
      brandId,
      type: "video",
      prompt: input.prompt,
      model,
      status: "processing",
      operationName,
      metadata: { aspectRatio: input.aspectRatio || "16:9" },
    });

    const job: VideoJob = {
      id: asset.id,
      userId,
      prompt: input.prompt,
      operationName,
      status: "processing",
      model,
      createdAt: asset.createdAt,
    };

    this.videoJobs.set(job.id, job);
    return job;
  }

  async getVideoJob(userId: string, jobId: string, brandId?: string | null): Promise<VideoJob | null> {
    await this.ensureAssetsTable();
    let job = this.videoJobs.get(jobId);

    if (!job || job.userId !== userId) {
      const row = await queryOne<any>(
        "SELECT * FROM creative_assets WHERE id = ? AND user_id = ? AND asset_type = 'video' LIMIT 1",
        [jobId, userId]
      );
      if (!row) return null;
      const mapped = this.mapAssetRow(row);
      if (!this.belongsToBrand(mapped.metadata, brandId)) return null;

      job = {
        id: String(row.id),
        userId: String(row.user_id),
        prompt: row.prompt || "",
        operationName: row.operation_name || "",
        status: row.status,
        model: row.model || config.creatives.videoModel,
        createdAt: new Date(row.created_at).toISOString(),
        error: row.error_message || undefined,
        videoUrl: row.file_url || undefined,
      };
      this.videoJobs.set(job.id, job);
    }

    if (job.status === "completed" || job.status === "failed") return job;

    const apiKey = this.getApiKey();

    try {
      const operationResponse = await axios.get(`${this.baseUrl}/${job.operationName}`, {
        params: { key: apiKey },
        timeout: 20000,
      });

      const op = operationResponse.data;
      if (!op?.done) return job;

      if (op?.error) {
        job.status = "failed";
        job.error = op.error?.message || "Video generation failed";
        await this.updateAssetById(userId, job.id, { status: "failed", error: job.error }, brandId);
        return job;
      }

      const videoUri: string | undefined =
        op?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        op?.response?.generatedSamples?.[0]?.video?.uri;

      if (!videoUri) {
        job.status = "failed";
        job.error = "Video operation completed without downloadable URI";
        await this.updateAssetById(userId, job.id, { status: "failed", error: job.error }, brandId);
        return job;
      }

      const safeUserId = this.sanitizePathPart(userId);
      const fileName = `${Date.now()}-${randomUUID()}.mp4`;
      const absoluteDir = path.resolve(process.cwd(), "uploads", "creatives", "videos", safeUserId);
      await this.ensureDir(absoluteDir);
      const filePath = path.join(absoluteDir, fileName);

      const fileResponse = await axios.get(videoUri, {
        headers: { "x-goog-api-key": apiKey },
        responseType: "arraybuffer",
        timeout: 180000,
      });

      await fs.writeFile(filePath, Buffer.from(fileResponse.data));

      job.status = "completed";
      job.videoUrl = `/uploads/creatives/videos/${safeUserId}/${fileName}`;
      await this.updateAssetById(
        userId,
        job.id,
        {
          status: "completed",
          fileUrl: job.videoUrl,
          error: "",
          metadata: {
            ...(await this.getAssetById(userId, job.id, brandId))?.metadata,
            sourceVideoUri: videoUri,
          },
        },
        brandId
      );

      return job;
    } catch (error: any) {
      logger.error(`Video status check failed: ${error.message}`);
      job.status = "failed";
      job.error = error.message || "Unexpected error while checking video job";
      await this.updateAssetById(userId, job.id, { status: "failed", error: job.error }, brandId);
      return job;
    }
  }
}
