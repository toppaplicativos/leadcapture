import fs from "fs";
import path from "path";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { CreativeStudioService } from "./creativeStudio";

export type GalleryFolderSlug = "ia" | "uploads" | "campanhas" | "posts" | "produtos";
export type GalleryItemType = "image" | "video";
export type GalleryOrigin = "media_files" | "creative_assets" | "product_gallery";

export interface GalleryAssetMeta {
  folder?: GalleryFolderSlug;
  source?: string;
  tags?: string[];
  productId?: string;
  productName?: string;
  campaignId?: string;
  postId?: string;
  prompt?: string;
  model?: string;
  format?: string;
  usedInCampaign?: boolean;
  usedInPost?: boolean;
  width?: number;
  height?: number;
  duration?: number;
}

export interface GalleryItem {
  id: string;
  type: GalleryItemType;
  url: string;
  thumbnailUrl?: string;
  name: string;
  folder: GalleryFolderSlug;
  source: string;
  tags: string[];
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
  metadata: GalleryAssetMeta;
  origin: GalleryOrigin;
}

export interface GalleryFolder {
  slug: string;
  label: string;
  icon: string;
  count: number;
  isSystem: boolean;
}

export const SYSTEM_FOLDERS: Array<{ slug: GalleryFolderSlug; label: string; icon: string }> = [
  { slug: "ia", label: "Criativos IA", icon: "sparkles" },
  { slug: "uploads", label: "Uploads", icon: "upload" },
  { slug: "campanhas", label: "Campanhas", icon: "megaphone" },
  { slug: "posts", label: "Posts", icon: "camera" },
  { slug: "produtos", label: "Produtos", icon: "package" },
];

export interface GalleryListFilters {
  folder?: string;
  type?: GalleryItemType;
  tags?: string[];
  search?: string;
  source?: string;
  page?: number;
  limit?: number;
  sort?: "created_at" | "usage_count" | "name";
}

function parseJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
  return [];
}

function normalizeUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/uploads/")) return u.pathname;
    } catch {
      return raw;
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isUploadSource(source: string): boolean {
  const s = source.toLowerCase();
  return s === "upload" || s === "studio-upload" || s === "upload-manual" || s.includes("upload");
}

function resolveFolderFromMeta(meta: GalleryAssetMeta, origin: GalleryOrigin, source: string): GalleryFolderSlug {
  if (meta.usedInCampaign) return "campanhas";
  if (meta.usedInPost) return "posts";
  if (meta.folder && SYSTEM_FOLDERS.some((f) => f.slug === meta.folder)) return meta.folder as GalleryFolderSlug;
  if (origin === "product_gallery") return "produtos";
  if (isUploadSource(source)) return "uploads";
  return "ia";
}

function encodeId(origin: GalleryOrigin, id: string): string {
  if (origin === "media_files") return `mf:${id}`;
  if (origin === "creative_assets") return `ca:${id}`;
  return id;
}

function decodeId(encoded: string): { origin: GalleryOrigin; id: string } | null {
  const raw = String(encoded || "").trim();
  if (raw.startsWith("mf:")) return { origin: "media_files", id: raw.slice(3) };
  if (raw.startsWith("ca:")) return { origin: "creative_assets", id: raw.slice(3) };
  if (raw.startsWith("pg:")) return { origin: "product_gallery", id: raw };
  return null;
}

export class GalleryService {
  private ready = false;
  private creativeStudio = new CreativeStudioService();

  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).catch(() => undefined);
  }

  async ensureSchema(): Promise<void> {
    if (this.ready) return;

    await query(`
      CREATE TABLE IF NOT EXISTS gallery_folders (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        brand_id VARCHAR(36) NOT NULL,
        slug VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        icon VARCHAR(50) NULL,
        sort_order INT DEFAULT 0,
        is_system BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (brand_id, slug)
      )
    `).catch((err) => logger.warn(`gallery_folders DDL: ${err?.message || err}`));

    await this.ensureColumn("media_files", "brand_id", "VARCHAR(36) NULL");
    await this.ensureColumn("media_files", "folder_slug", "VARCHAR(50) DEFAULT 'uploads'");
    await this.ensureColumn("media_files", "source", "VARCHAR(30) DEFAULT 'upload'");
    await this.ensureColumn("media_files", "metadata_json", "JSONB NULL");
    await this.ensureColumn("media_files", "usage_count", "INT DEFAULT 0");

    this.ready = true;
  }

  async ensureFolders(brandId: string): Promise<void> {
    await this.ensureSchema();
    for (let i = 0; i < SYSTEM_FOLDERS.length; i++) {
      const f = SYSTEM_FOLDERS[i];
      const existing = await queryOne<any>(
        "SELECT id FROM gallery_folders WHERE brand_id = ? AND slug = ? LIMIT 1",
        [brandId, f.slug]
      );
      if (existing) continue;
      await query(
        `INSERT INTO gallery_folders (id, brand_id, slug, label, icon, sort_order, is_system)
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [uuidv4(), brandId, f.slug, f.label, f.icon, i]
      );
    }
  }

  private belongsToBrand(metadata: Record<string, any>, brandId?: string | null): boolean {
    const normalized = String(brandId || "").trim();
    const assetBrand =
      String(metadata?.brandId || metadata?.brand_id || metadata?.studio?.brandId || "").trim();
    if (normalized) return assetBrand === normalized || !assetBrand;
    return !assetBrand;
  }

  private mapMediaRow(row: any): GalleryItem | null {
    const category = String(row.category || "").toLowerCase();
    if (category !== "image" && category !== "video") return null;

    const meta = parseJson(row.metadata_json);
    const tags = parseTags(row.tags).length ? parseTags(row.tags) : parseTags(meta.tags);
    const source = String(row.source || meta.source || "upload");
    const assetMeta: GalleryAssetMeta = {
      ...meta,
      folder: (row.folder_slug || meta.folder) as GalleryFolderSlug,
      source,
      tags,
      usedInCampaign: Boolean(meta.usedInCampaign || meta.studio?.usedInCampaign),
      usedInPost: Boolean(meta.usedInPost || meta.studio?.usedInPost),
    };

    return {
      id: encodeId("media_files", String(row.id)),
      type: category as GalleryItemType,
      url: normalizeUrl(row.url || row.file_path),
      thumbnailUrl: row.thumbnail_url ? normalizeUrl(row.thumbnail_url) : undefined,
      name: String(row.original_name || "Arquivo"),
      folder: resolveFolderFromMeta(assetMeta, "media_files", source),
      source,
      tags,
      mimeType: row.mime_type || undefined,
      fileSize: row.file_size ? Number(row.file_size) : undefined,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      metadata: assetMeta,
      origin: "media_files",
    };
  }

  private mapCreativeAsset(asset: any): GalleryItem | null {
    const type = String(asset.type || asset.asset_type || "").toLowerCase();
    if (type !== "image" && type !== "video") return null;
    if (!asset.fileUrl) return null;

    const meta = (asset.metadata || {}) as Record<string, any>;
    const studio = meta.studio || {};
    const source = String(meta.source || asset.model || "ia");
    const tags = parseTags(studio.tags || meta.tags);
    const assetMeta: GalleryAssetMeta = {
      folder: meta.folder as GalleryFolderSlug,
      source,
      tags,
      productId: studio.productId || meta.productId,
      productName: tags.find((t) => t.toLowerCase().startsWith("productname:"))?.split(":").slice(1).join(":"),
      prompt: asset.prompt,
      model: asset.model,
      format: studio.format || meta.format,
      usedInCampaign: Boolean(studio.usedInCampaign || meta.usedInCampaign),
      usedInPost: Boolean(studio.usedInPost || meta.usedInPost),
      campaignId: studio.campaignId || meta.campaignId,
    };

    return {
      id: encodeId("creative_assets", String(asset.id)),
      type: type as GalleryItemType,
      url: normalizeUrl(asset.fileUrl),
      thumbnailUrl: meta.thumbnailUrl ? normalizeUrl(meta.thumbnailUrl) : undefined,
      name: String(asset.prompt || meta.name || "Criativo IA").slice(0, 120),
      folder: resolveFolderFromMeta(assetMeta, "creative_assets", source),
      source,
      tags,
      mimeType: type === "video" ? "video/mp4" : "image/png",
      createdAt: asset.createdAt || new Date().toISOString(),
      metadata: assetMeta,
      origin: "creative_assets",
    };
  }

  private async fetchMediaFiles(userId: string, brandId: string): Promise<GalleryItem[]> {
    const rows = await query<any[]>(
      `SELECT * FROM media_files
       WHERE user_id = ? AND is_active = TRUE
         AND category IN ('image', 'video')
         AND (brand_id = ? OR brand_id IS NULL OR brand_id = '')
       ORDER BY created_at DESC`,
      [userId, brandId]
    );
    return rows.map((r) => this.mapMediaRow(r)).filter(Boolean) as GalleryItem[];
  }

  private async fetchCreativeAssets(userId: string, brandId: string): Promise<GalleryItem[]> {
    await this.creativeStudio.listAssets(userId, { limit: 1, includeUploads: true }, brandId);
    const rows = await query<any[]>(
      `SELECT * FROM creative_assets
       WHERE user_id = ? AND asset_type IN ('image', 'video') AND file_url IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 500`,
      [userId]
    );
    return rows
      .map((row) => {
        const meta = parseJson(row.metadata);
        if (!this.belongsToBrand(meta, brandId)) return null;
        return this.mapCreativeAsset({
          id: row.id,
          type: row.asset_type,
          fileUrl: row.file_url,
          prompt: row.prompt,
          model: row.model,
          metadata: meta,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        });
      })
      .filter(Boolean) as GalleryItem[];
  }

  private async fetchProductGallery(brandId: string): Promise<GalleryItem[]> {
    const rows = await query<any[]>(
      `SELECT id, name, image_url, metadata_json, media_json, created_at
       FROM products
       WHERE (brand_id = ? OR brand_id IS NULL OR brand_id = '')
       ORDER BY created_at DESC
       LIMIT 200`,
      [brandId]
    );

    const items: GalleryItem[] = [];
    for (const row of rows) {
      const meta = parseJson(row.metadata_json);
      const media = parseJson(row.media_json);
      const gallery: string[] = Array.isArray(meta.gallery_images)
        ? meta.gallery_images
        : Array.isArray(meta.galleryImages)
          ? meta.galleryImages
          : Array.isArray(media.gallery)
            ? media.gallery
            : [];

      const urls = [row.image_url, ...gallery].filter(Boolean).map((u) => normalizeUrl(String(u)));
      const unique = [...new Set(urls)];

      unique.forEach((url, index) => {
        if (!url.startsWith("/uploads/") && !url.startsWith("http")) return;
        const assetMeta: GalleryAssetMeta = {
          folder: "produtos",
          source: "product",
          productId: String(row.id),
          productName: String(row.name || ""),
          tags: [`product:${row.id}`, `productname:${row.name}`],
        };
        items.push({
          id: `pg:${row.id}:${index}`,
          type: "image",
          url,
          name: String(row.name || "Produto"),
          folder: "produtos",
          source: "product",
          tags: assetMeta.tags || [],
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          metadata: assetMeta,
          origin: "product_gallery",
        });
      });
    }
    return items;
  }

  private applyFilters(items: GalleryItem[], filters: GalleryListFilters): GalleryItem[] {
    let out = [...items];

    if (filters.folder && filters.folder !== "all") {
      out = out.filter((i) => i.folder === filters.folder);
    }
    if (filters.type) {
      out = out.filter((i) => i.type === filters.type);
    }
    if (filters.source) {
      out = out.filter((i) => i.source.toLowerCase().includes(filters.source!.toLowerCase()));
    }
    if (filters.tags?.length) {
      out = out.filter((i) => filters.tags!.every((t) => i.tags.some((tag) => tag.toLowerCase() === t.toLowerCase())));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)) ||
          String(i.metadata.prompt || "").toLowerCase().includes(q)
      );
    }

    const sort = filters.sort || "created_at";
    out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return out;
  }

  async listItems(
    userId: string,
    brandId: string,
    filters: GalleryListFilters = {}
  ): Promise<{ items: GalleryItem[]; total: number; page: number; limit: number }> {
    await this.ensureFolders(brandId);

    const [media, creative, products] = await Promise.all([
      this.fetchMediaFiles(userId, brandId),
      this.fetchCreativeAssets(userId, brandId),
      this.fetchProductGallery(brandId),
    ]);

    const merged = this.applyFilters([...creative, ...media, ...products], filters);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 48));
    const offset = (page - 1) * limit;

    return {
      items: merged.slice(offset, offset + limit),
      total: merged.length,
      page,
      limit,
    };
  }

  async getFolders(userId: string, brandId: string): Promise<GalleryFolder[]> {
    await this.ensureFolders(brandId);
    const { items } = await this.listItems(userId, brandId, { limit: 1000 });

    const counts: Record<string, number> = { all: items.length };
    for (const f of SYSTEM_FOLDERS) counts[f.slug] = 0;
    for (const item of items) {
      counts[item.folder] = (counts[item.folder] || 0) + 1;
    }

    return [
      { slug: "all", label: "Todos", icon: "layout-grid", count: counts.all, isSystem: true },
      ...SYSTEM_FOLDERS.map((f) => ({
        slug: f.slug,
        label: f.label,
        icon: f.icon,
        count: counts[f.slug] || 0,
        isSystem: true,
      })),
    ];
  }

  async getItem(userId: string, brandId: string, encodedId: string): Promise<GalleryItem | null> {
    const decoded = decodeId(encodedId);
    if (!decoded) return null;

    const { items } = await this.listItems(userId, brandId, { limit: 1000 });
    return items.find((i) => i.id === encodedId) || null;
  }

  async generateThumbnail(filePath: string, storedName: string): Promise<string | null> {
    try {
      const thumbDir = path.join(path.dirname(filePath), "_thumbs");
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
      const base = path.parse(storedName).name;
      const thumbName = `${base}.webp`;
      const thumbPath = path.join(thumbDir, thumbName);
      await sharp(filePath).resize(320, 320, { fit: "cover" }).webp({ quality: 78 }).toFile(thumbPath);
      const rel = path.relative(path.join(__dirname, "../.."), thumbPath).replace(/\\/g, "/");
      return `/${rel}`;
    } catch (err: any) {
      logger.warn(`Thumbnail generation failed: ${err?.message || err}`);
      return null;
    }
  }

  async registerUpload(
    userId: string,
    brandId: string,
    file: Express.Multer.File,
    input?: { tags?: string[]; folder?: GalleryFolderSlug }
  ): Promise<GalleryItem> {
    await this.ensureSchema();

    const mime = file.mimetype;
    const category = mime.startsWith("video/") ? "video" : "image";
    const folder = path.join(__dirname, "../../uploads", category === "video" ? "videos" : "images");
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const ext = path.extname(file.originalname) || (category === "video" ? ".mp4" : ".png");
    const storedName = `${uuidv4()}${ext}`;
    const dest = path.join(folder, storedName);
    if (file.path !== dest) {
      fs.renameSync(file.path, dest);
    }

    const relativePath = `/uploads/${category === "video" ? "videos" : "images"}/${storedName}`;
    const thumbnailUrl = category === "image" ? await this.generateThumbnail(dest, storedName) : null;
    const tags = input?.tags || [];
    const folderSlug = input?.folder || "uploads";
    const metadata = { folder: folderSlug, source: "upload", tags };

    const id = uuidv4();
    await query(
      `INSERT INTO media_files
       (id, user_id, company_id, brand_id, original_name, stored_name, mime_type, file_size,
        file_path, url, thumbnail_url, category, tags, folder_slug, source, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        brandId,
        brandId,
        file.originalname,
        storedName,
        mime,
        file.size,
        relativePath,
        relativePath,
        thumbnailUrl,
        category,
        JSON.stringify(tags),
        folderSlug,
        "upload",
        JSON.stringify(metadata),
      ]
    );

    const row = await queryOne<any>("SELECT * FROM media_files WHERE id = ? LIMIT 1", [id]);
    return this.mapMediaRow(row)!;
  }

  async updateItem(
    userId: string,
    brandId: string,
    encodedId: string,
    patch: { tags?: string[]; name?: string; folder?: GalleryFolderSlug }
  ): Promise<GalleryItem | null> {
    const decoded = decodeId(encodedId);
    if (!decoded) return null;

    if (decoded.origin === "media_files") {
      const row = await queryOne<any>(
        "SELECT * FROM media_files WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
        [decoded.id, userId]
      );
      if (!row) return null;

      const meta = parseJson(row.metadata_json);
      if (patch.tags) {
        meta.tags = patch.tags;
        await query("UPDATE media_files SET tags = ?, metadata_json = ? WHERE id = ?", [
          JSON.stringify(patch.tags),
          JSON.stringify(meta),
          decoded.id,
        ]);
      }
      if (patch.name) {
        await query("UPDATE media_files SET original_name = ? WHERE id = ?", [patch.name, decoded.id]);
      }
      if (patch.folder) {
        meta.folder = patch.folder;
        await query("UPDATE media_files SET folder_slug = ?, metadata_json = ? WHERE id = ?", [
          patch.folder,
          JSON.stringify(meta),
          decoded.id,
        ]);
      }
      const updated = await queryOne<any>("SELECT * FROM media_files WHERE id = ? LIMIT 1", [decoded.id]);
      return this.mapMediaRow(updated);
    }

    if (decoded.origin === "creative_assets") {
      const asset = await this.creativeStudio.getAssetById(userId, decoded.id, brandId);
      if (!asset) return null;
      const meta = { ...(asset.metadata || {}) };
      const studio = { ...((meta as any).studio || {}) };
      if (patch.tags) studio.tags = patch.tags;
      if (patch.folder) meta.folder = patch.folder;
      (meta as any).studio = studio;
      await query("UPDATE creative_assets SET metadata = ? WHERE id = ? AND user_id = ?", [
        JSON.stringify(meta),
        decoded.id,
        userId,
      ]);
      const refreshed = await this.creativeStudio.getAssetById(userId, decoded.id, brandId);
      return refreshed ? this.mapCreativeAsset(refreshed) : null;
    }

    return null;
  }

  async deleteItem(userId: string, brandId: string, encodedId: string): Promise<boolean> {
    const decoded = decodeId(encodedId);
    if (!decoded) return false;

    if (decoded.origin === "media_files") {
      const row = await queryOne<any>(
        "SELECT * FROM media_files WHERE id = ? AND user_id = ? LIMIT 1",
        [decoded.id, userId]
      );
      if (!row) return false;
      await query("UPDATE media_files SET is_active = FALSE WHERE id = ?", [decoded.id]);
      return true;
    }

    if (decoded.origin === "creative_assets") {
      const asset = await this.creativeStudio.getAssetById(userId, decoded.id, brandId);
      if (!asset) return false;
      await query("DELETE FROM creative_assets WHERE id = ? AND user_id = ?", [decoded.id, userId]);
      return true;
    }

    return false;
  }

  async markUsed(
    userId: string,
    brandId: string,
    encodedId: string,
    context: "campaign" | "post" | "product",
    contextId?: string
  ): Promise<GalleryItem | null> {
    const decoded = decodeId(encodedId);
    if (!decoded) return null;

    if (decoded.origin === "creative_assets") {
      if (context === "campaign") {
        await this.creativeStudio.markAssetUsedInCampaign(userId, decoded.id, contextId, brandId);
      } else {
        const asset = await this.creativeStudio.getAssetById(userId, decoded.id, brandId);
        if (!asset) return null;
        const meta = { ...(asset.metadata || {}) };
        const studio = { ...((meta as any).studio || {}) };
        if (context === "post") {
          studio.usedInPost = true;
          studio.postId = contextId || null;
          (meta as any).usedInPost = true;
        }
        if (context === "product") {
          (meta as any).productId = contextId;
        }
        (meta as any).studio = studio;
        await query("UPDATE creative_assets SET metadata = ? WHERE id = ? AND user_id = ?", [
          JSON.stringify(meta),
          decoded.id,
          userId,
        ]);
      }
      const refreshed = await this.creativeStudio.getAssetById(userId, decoded.id, brandId);
      return refreshed ? this.mapCreativeAsset(refreshed) : null;
    }

    if (decoded.origin === "media_files") {
      const row = await queryOne<any>(
        "SELECT * FROM media_files WHERE id = ? AND user_id = ? LIMIT 1",
        [decoded.id, userId]
      );
      if (!row) return null;
      const meta = parseJson(row.metadata_json);
      if (context === "campaign") {
        meta.usedInCampaign = true;
        meta.campaignId = contextId;
        await query("UPDATE media_files SET folder_slug = 'campanhas', usage_count = usage_count + 1, metadata_json = ? WHERE id = ?", [
          JSON.stringify(meta),
          decoded.id,
        ]);
      } else if (context === "post") {
        meta.usedInPost = true;
        meta.postId = contextId;
        await query("UPDATE media_files SET folder_slug = 'posts', usage_count = usage_count + 1, metadata_json = ? WHERE id = ?", [
          JSON.stringify(meta),
          decoded.id,
        ]);
      } else {
        await query("UPDATE media_files SET usage_count = usage_count + 1 WHERE id = ?", [decoded.id]);
      }
      const updated = await queryOne<any>("SELECT * FROM media_files WHERE id = ? LIMIT 1", [decoded.id]);
      return this.mapMediaRow(updated);
    }

    return this.getItem(userId, brandId, encodedId);
  }

  async collectAllTags(userId: string, brandId: string): Promise<string[]> {
    const { items } = await this.listItems(userId, brandId, { limit: 1000 });
    const set = new Set<string>();
    for (const item of items) {
      for (const tag of item.tags) {
        if (!tag.startsWith("section:") && !tag.startsWith("product:") && !tag.startsWith("productname:")) {
          set.add(tag);
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }
}

export const galleryService = new GalleryService();