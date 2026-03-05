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

  private async saveAsset(input: {
    userId: string;
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
        input.metadata ? JSON.stringify(input.metadata) : null
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
    }>
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
    return row ? this.mapAssetRow(row) : null;
  }

  async listAssets(
    userId: string,
    filters?: { type?: CreativeAssetType; search?: string; limit?: number; offset?: number }
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

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM creative_assets ${where}`,
      params
    );
    const total = Number(countRow?.total || 0);
    const limit = Math.max(1, Math.min(100, filters?.limit || 30));
    const offset = Math.max(0, filters?.offset || 0);

    const rows = await query<any[]>(
      `SELECT * FROM creative_assets ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return { assets: rows.map((row) => this.mapAssetRow(row)), total };
  }

  async getAssetById(userId: string, assetId: string): Promise<CreativeAsset | null> {
    await this.ensureAssetsTable();
    const row = await queryOne<any>(
      "SELECT * FROM creative_assets WHERE id = ? AND user_id = ? LIMIT 1",
      [assetId, userId]
    );
    return row ? this.mapAssetRow(row) : null;
  }

  async generateText(
    userId: string,
    input: GenerateTextInput
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
    input: GenerateImageInput
  ): Promise<{ imageUrl: string; caption: string; model: string; asset: CreativeAsset }> {
    const model = config.creatives.imageModel;
    const apiKey = this.getApiKey();

    const formatHint =
      input.format === "portrait"
        ? "Formato vertical 9:16."
        : input.format === "landscape"
        ? "Formato horizontal 16:9."
        : "Formato quadrado 1:1.";

    const prompt = [
      input.prompt,
      input.style ? `Estilo visual: ${input.style}.` : "",
      formatHint,
      "Nao incluir marcas d'agua."
    ]
      .filter(Boolean)
      .join("\n");

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        params: { key: apiKey },
        timeout: 60000
      }
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
      type: "image",
      prompt: input.prompt,
      model,
      status: "completed",
      fileUrl: imageUrl,
      metadata: {
        caption,
        style: input.style || null,
        format: input.format || "square"
      }
    });

    return {
      imageUrl,
      caption,
      model,
      asset
    };
  }

  async remixImage(
    userId: string,
    input: RemixImageInput
  ): Promise<{ imageUrl: string; caption: string; model: string; asset: CreativeAsset }> {
    const model = config.creatives.imageModel;
    const apiKey = this.getApiKey();
    await this.ensureAssetsTable();

    let parentAssetId: string | undefined;
    let sourceUrl = input.sourceUrl;

    if (input.sourceAssetId) {
      const sourceAsset = await this.getAssetById(userId, input.sourceAssetId);
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
      "Nao incluir texto ilegivel nem marca d'agua."
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
              {
                inlineData: {
                  mimeType,
                  data: sourceBase64
                }
              }
            ]
          }
        ]
      },
      {
        params: { key: apiKey },
        timeout: 90000
      }
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
        sourceUrl
      }
    });

    return { imageUrl, caption, model, asset };
  }

  async startVideoGeneration(userId: string, input: GenerateVideoInput): Promise<VideoJob> {
    const model = config.creatives.videoModel;
    const apiKey = this.getApiKey();

    const body: Record<string, unknown> = {
      instances: [{ prompt: input.prompt }]
    };

    if (input.aspectRatio) {
      body.parameters = { aspectRatio: input.aspectRatio };
    }

    const response = await axios.post(
      `${this.baseUrl}/models/${model}:predictLongRunning`,
      body,
      {
        params: { key: apiKey },
        timeout: 30000
      }
    );

    const operationName: string | undefined = response.data?.name;
    if (!operationName) throw new Error("Video generation operation was not created");

    const asset = await this.saveAsset({
      userId,
      type: "video",
      prompt: input.prompt,
      model,
      status: "processing",
      operationName,
      metadata: {
        aspectRatio: input.aspectRatio || "16:9"
      }
    });

    const job: VideoJob = {
      id: asset.id,
      userId,
      prompt: input.prompt,
      operationName,
      status: "processing",
      model,
      createdAt: asset.createdAt
    };

    this.videoJobs.set(job.id, job);
    return job;
  }

  async getVideoJob(userId: string, jobId: string): Promise<VideoJob | null> {
    await this.ensureAssetsTable();
    let job = this.videoJobs.get(jobId);

    if (!job || job.userId !== userId) {
      const row = await queryOne<any>(
        "SELECT * FROM creative_assets WHERE id = ? AND user_id = ? AND asset_type = 'video' LIMIT 1",
        [jobId, userId]
      );
      if (!row) return null;
      job = {
        id: String(row.id),
        userId: String(row.user_id),
        prompt: row.prompt || "",
        operationName: row.operation_name || "",
        status: row.status,
        model: row.model || config.creatives.videoModel,
        createdAt: new Date(row.created_at).toISOString(),
        error: row.error_message || undefined,
        videoUrl: row.file_url || undefined
      };
      this.videoJobs.set(job.id, job);
    }

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    const apiKey = this.getApiKey();

    try {
      const operationResponse = await axios.get(`${this.baseUrl}/${job.operationName}`, {
        params: { key: apiKey },
        timeout: 20000
      });

      const op = operationResponse.data;
      if (!op?.done) {
        return job;
      }

      if (op?.error) {
        job.status = "failed";
        job.error = op.error?.message || "Video generation failed";
        await this.updateAssetById(userId, job.id, {
          status: "failed",
          error: job.error
        });
        return job;
      }

      const videoUri: string | undefined =
        op?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        op?.response?.generatedSamples?.[0]?.video?.uri;

      if (!videoUri) {
        job.status = "failed";
        job.error = "Video operation completed without downloadable URI";
        await this.updateAssetById(userId, job.id, {
          status: "failed",
          error: job.error
        });
        return job;
      }

      const safeUserId = this.sanitizePathPart(userId);
      const fileName = `${Date.now()}-${randomUUID()}.mp4`;
      const absoluteDir = path.resolve(process.cwd(), "uploads", "creatives", "videos", safeUserId);
      await this.ensureDir(absoluteDir);
      const filePath = path.join(absoluteDir, fileName);

      const fileResponse = await axios.get(videoUri, {
        headers: {
          "x-goog-api-key": apiKey
        },
        responseType: "arraybuffer",
        timeout: 180000
      });

      await fs.writeFile(filePath, Buffer.from(fileResponse.data));

      job.status = "completed";
      job.videoUrl = `/uploads/creatives/videos/${safeUserId}/${fileName}`;
      await this.updateAssetById(userId, job.id, {
        status: "completed",
        fileUrl: job.videoUrl,
        error: "",
        metadata: {
          ...(await this.getAssetById(userId, job.id))?.metadata,
          sourceVideoUri: videoUri
        }
      });
      return job;
    } catch (error: any) {
      logger.error(`Video status check failed: ${error.message}`);
      job.status = "failed";
      job.error = error.message || "Unexpected error while checking video job";
      await this.updateAssetById(userId, job.id, {
        status: "failed",
        error: job.error
      });
      return job;
    }
  }
}
