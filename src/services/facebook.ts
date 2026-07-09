import { query, queryOne, update, insert } from "../config/database";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";
import { galleryService } from "./gallery";

export type FacebookConnection = {
  id: string;
  brand_id: string;
  user_id: string;
  page_access_token: string;
  page_id: string;
  page_name?: string;
  page_category?: string;
  page_about?: string;
  page_picture_url?: string;
  fan_count?: number;
  followers_count?: number;
  website?: string;
  is_active: boolean;
  token_expires_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type FacebookPost = {
  id: string;
  brand_id: string;
  fb_post_id?: string;
  post_type: "text" | "photo" | "video" | "link";
  message?: string;
  link?: string;
  media_url?: string;
  permalink?: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at?: string;
  published_at?: string;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  reach?: number;
  created_at?: string;
  updated_at?: string;
};

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS facebook_connections (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      page_access_token TEXT NOT NULL,
      page_id VARCHAR(255) NOT NULL DEFAULT '',
      page_name VARCHAR(255),
      page_category VARCHAR(255),
      page_about TEXT,
      page_picture_url TEXT,
      fan_count INT DEFAULT 0,
      followers_count INT DEFAULT 0,
      website VARCHAR(500),
      is_active BOOLEAN DEFAULT true,
      token_expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_fb_brand (brand_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS facebook_posts (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      fb_post_id VARCHAR(255),
      post_type VARCHAR(50) NOT NULL DEFAULT 'text',
      message TEXT,
      link VARCHAR(1000),
      media_url TEXT,
      permalink VARCHAR(1000),
      status VARCHAR(50) DEFAULT 'draft',
      scheduled_at TIMESTAMP NULL,
      published_at TIMESTAMP NULL,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      shares_count INT DEFAULT 0,
      reach INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

let tablesReady = false;
async function init() {
  if (tablesReady) return;
  await ensureTables();
  tablesReady = true;
}

class FacebookService {
  async getConnection(brandId: string): Promise<FacebookConnection | null> {
    await init();
    return queryOne<FacebookConnection>(
      `SELECT * FROM facebook_connections WHERE brand_id = ? LIMIT 1`,
      [brandId]
    );
  }

  async saveConnection(
    brandId: string,
    userId: string,
    data: { page_access_token: string; page_id: string }
  ): Promise<FacebookConnection> {
    await init();
    const existing = await this.getConnection(brandId);

    if (existing) {
      await update(
        `UPDATE facebook_connections
         SET page_access_token = ?, page_id = ?, updated_at = NOW()
         WHERE brand_id = ?`,
        [data.page_access_token, data.page_id, brandId]
      );
      return { ...existing, ...data };
    }

    const id = randomUUID();
    await insert(
      `INSERT INTO facebook_connections (id, brand_id, user_id, page_access_token, page_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, brandId, userId, data.page_access_token, data.page_id]
    );
    return {
      id, brand_id: brandId, user_id: userId,
      ...data, is_active: true,
    };
  }

  async updateConnectionProfile(brandId: string, data: {
    page_name?: string; page_category?: string; page_about?: string;
    page_picture_url?: string; fan_count?: number;
    followers_count?: number; website?: string; token_expires_at?: string;
  }): Promise<void> {
    await init();
    await update(
      `UPDATE facebook_connections
       SET page_name = ?, page_category = ?, page_about = ?, page_picture_url = ?,
           fan_count = ?, followers_count = ?, website = ?, token_expires_at = ?,
           is_active = true, updated_at = NOW()
       WHERE brand_id = ?`,
      [
        data.page_name || "", data.page_category || "", data.page_about || "",
        data.page_picture_url || "", data.fan_count || 0,
        data.followers_count || 0, data.website || "",
        data.token_expires_at || null, brandId,
      ]
    );
  }

  async deleteConnection(brandId: string): Promise<void> {
    await init();
    await update(`DELETE FROM facebook_connections WHERE brand_id = ?`, [brandId]);
  }

  async testConnection(brandId: string): Promise<{ ok: boolean; message: string; profile?: any }> {
    const conn = await this.getConnection(brandId);
    if (!conn || !conn.page_access_token) {
      return { ok: false, message: "Nenhuma conexao Facebook configurada" };
    }

    try {
      const resp = await fetch(
        `${FB_GRAPH_URL}/${conn.page_id}?fields=name,fan_count,followers_count,category,about,picture,website,link&access_token=${conn.page_access_token}`
      );
      if (!resp.ok) {
        const err: any = await resp.json().catch(() => ({}));
        return { ok: false, message: err?.error?.message || `HTTP ${resp.status}` };
      }
      const profile: any = await resp.json();
      const pictureUrl = profile.picture?.data?.url || "";

      await update(
        `UPDATE facebook_connections
         SET page_name = ?, page_category = ?, page_about = ?, page_picture_url = ?,
             fan_count = ?, followers_count = ?, website = ?,
             is_active = true, updated_at = NOW()
         WHERE brand_id = ?`,
        [
          profile.name || "", profile.category || "", profile.about || "",
          pictureUrl, profile.fan_count || 0, profile.followers_count || 0,
          profile.website || "", brandId,
        ]
      );

      return { ok: true, message: "Conectado com sucesso", profile: { ...profile, picture_url: pictureUrl } };
    } catch (err: any) {
      return { ok: false, message: err.message || "Erro ao conectar" };
    }
  }

  async getProfile(brandId: string): Promise<any> {
    const conn = await this.getConnection(brandId);
    if (!conn) return null;

    if (conn.page_name) {
      return {
        id: conn.page_id,
        page_name: conn.page_name,
        page_category: conn.page_category,
        page_about: conn.page_about,
        page_picture_url: conn.page_picture_url,
        fan_count: conn.fan_count || 0,
        followers_count: conn.followers_count || 0,
        website: conn.website,
        is_connected: true,
        token_valid: true,
      };
    }

    const test = await this.testConnection(brandId);
    if (!test.ok) return { is_connected: false, token_valid: false };
    return { ...test.profile, is_connected: true, token_valid: true };
  }

  async fetchPosts(brandId: string, limit = 12): Promise<any[]> {
    const conn = await this.getConnection(brandId);
    if (!conn?.page_access_token || !conn?.page_id) return [];

    try {
      const resp = await fetch(
        `${FB_GRAPH_URL}/${conn.page_id}/posts?fields=id,message,created_time,full_picture,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=${limit}&access_token=${conn.page_access_token}`
      );
      if (!resp.ok) return [];
      const data: any = await resp.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async createPost(brandId: string, data: Partial<FacebookPost>): Promise<FacebookPost> {
    await init();
    const id = randomUUID();
    const post: FacebookPost = {
      id,
      brand_id: brandId,
      post_type: data.post_type || "text",
      message: data.message,
      link: data.link,
      media_url: data.media_url,
      status: data.status || "draft",
      scheduled_at: data.scheduled_at,
    };

    await insert(
      `INSERT INTO facebook_posts (id, brand_id, post_type, message, link, media_url, status, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, brandId, post.post_type, post.message || null, post.link || null, post.media_url || null, post.status, post.scheduled_at || null]
    );
    return post;
  }

  async updatePost(postId: string, data: Partial<FacebookPost>): Promise<void> {
    await init();
    const sets: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (key === "id" || key === "brand_id") continue;
      sets.push(`${key} = ?`);
      params.push(val);
    }
    if (sets.length === 0) return;
    sets.push(`updated_at = NOW()`);
    params.push(postId);
    await update(`UPDATE facebook_posts SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async deletePost(postId: string): Promise<void> {
    await init();
    await update(`DELETE FROM facebook_posts WHERE id = ?`, [postId]);
  }

  async publishPost(brandId: string, postId: string): Promise<{ ok: boolean; message: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.page_access_token) return { ok: false, message: "Facebook nao conectado" };

    const post = await queryOne<FacebookPost>(`SELECT * FROM facebook_posts WHERE id = ? AND brand_id = ?`, [postId, brandId]);
    if (!post) return { ok: false, message: "Post nao encontrado" };

    try {
      await this.updatePost(postId, { status: "publishing" });

      let endpoint: string;
      let body: Record<string, string> = { access_token: conn.page_access_token };

      if (post.post_type === "photo") {
        endpoint = `${FB_GRAPH_URL}/${conn.page_id}/photos`;
        body.url = post.media_url || "";
        if (post.message) body.message = post.message;
      } else if (post.post_type === "video") {
        endpoint = `${FB_GRAPH_URL}/${conn.page_id}/videos`;
        body.file_url = post.media_url || "";
        if (post.message) body.description = post.message;
      } else {
        // text or link
        endpoint = `${FB_GRAPH_URL}/${conn.page_id}/feed`;
        if (post.message) body.message = post.message;
        if (post.link) body.link = post.link;
      }

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: any = await resp.json();

      if (result.id || result.post_id) {
        const fbPostId = result.id || result.post_id;
        const publishedAt = new Date().toISOString();
        await this.updatePost(postId, {
          status: "published",
          fb_post_id: fbPostId,
          published_at: publishedAt,
        });
        if (post.media_url) {
          try {
            await galleryService.markPublishedFromPost(conn.user_id, brandId, {
              postId,
              channel: "facebook",
              publishedAt,
              items: [{ url: post.media_url }],
            });
          } catch (err: any) {
            logger.warn(`[Facebook] Falha ao marcar midia publicada na galeria: ${err?.message || err}`);
          }
        }
        return { ok: true, message: "Publicado com sucesso" };
      } else {
        await this.updatePost(postId, { status: "failed" });
        return { ok: false, message: result?.error?.message || "Falha ao publicar" };
      }
    } catch (err: any) {
      await this.updatePost(postId, { status: "failed" });
      return { ok: false, message: err.message };
    }
  }

  async getPosts(brandId: string, filters?: { status?: string; limit?: number; offset?: number }): Promise<{ posts: FacebookPost[]; total: number }> {
    await init();
    const conditions = [`brand_id = ?`];
    const params: any[] = [brandId];

    if (filters?.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }

    const where = conditions.join(" AND ");
    const countRow = await queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM facebook_posts WHERE ${where}`, params);
    const total = countRow?.cnt || 0;

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    const rows = await query<FacebookPost[]>(
      `SELECT * FROM facebook_posts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { posts: rows || [], total };
  }

  async snapshotMetrics(brandId: string): Promise<void> {
    const conn = await this.getConnection(brandId);
    if (!conn) return;
    const profile = await this.getProfile(brandId);
    if (!profile?.is_connected) return;
    // Metrics snapshot — can be extended later
    logger.info(`[Facebook] Snapshot for brand ${brandId}: ${profile.fan_count || 0} fans`);
  }

  async fetchInsights(brandId: string, period: "day" | "week" | "days_28" = "day"): Promise<any> {
    const conn = await this.getConnection(brandId);
    if (!conn?.page_access_token || !conn?.page_id) return null;

    try {
      const metrics = "page_impressions_unique,page_post_engagements,page_fan_adds";
      const resp = await fetch(
        `${FB_GRAPH_URL}/${conn.page_id}/insights?metric=${metrics}&period=${period}&access_token=${conn.page_access_token}`
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }
}

export const facebookService = new FacebookService();
