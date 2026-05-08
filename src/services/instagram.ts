import { query, queryOne, update, insert } from "../config/database";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";

export type InstagramConnection = {
  id: string;
  brand_id: string;
  user_id: string;
  access_token: string;
  account_id: string;
  app_id: string;
  app_secret: string;
  ig_user_id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
  token_expires_at?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InstagramPost = {
  id: string;
  brand_id: string;
  ig_media_id?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at?: string;
  published_at?: string;
  likes_count?: number;
  comments_count?: number;
  impressions?: number;
  reach?: number;
  saved?: number;
  created_at?: string;
  updated_at?: string;
};

export type InstagramMetrics = {
  id: string;
  brand_id: string;
  date: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  impressions: number;
  reach: number;
  profile_views: number;
  accounts_engaged: number;
  created_at?: string;
};

const IG_GRAPH_URL = "https://graph.instagram.com/v21.0";

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS instagram_connections (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      access_token TEXT NOT NULL,
      account_id VARCHAR(255) NOT NULL DEFAULT '',
      app_id VARCHAR(255) NOT NULL DEFAULT '',
      app_secret VARCHAR(255) NOT NULL DEFAULT '',
      ig_user_id VARCHAR(255),
      username VARCHAR(255),
      name VARCHAR(255),
      profile_picture_url TEXT,
      followers_count INT DEFAULT 0,
      follows_count INT DEFAULT 0,
      media_count INT DEFAULT 0,
      biography TEXT,
      website VARCHAR(500),
      token_expires_at TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ig_brand (brand_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_posts (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      ig_media_id VARCHAR(255),
      media_type VARCHAR(50) NOT NULL DEFAULT 'IMAGE',
      media_url TEXT,
      thumbnail_url TEXT,
      caption TEXT,
      permalink TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      scheduled_at TIMESTAMP NULL,
      published_at TIMESTAMP NULL,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      impressions INT DEFAULT 0,
      reach_count INT DEFAULT 0,
      saved INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_metrics (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      date DATE NOT NULL,
      followers_count INT DEFAULT 0,
      follows_count INT DEFAULT 0,
      media_count INT DEFAULT 0,
      impressions INT DEFAULT 0,
      reach_count INT DEFAULT 0,
      profile_views INT DEFAULT 0,
      accounts_engaged INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ig_metrics (brand_id, date)
    )
  `);
}

let tablesReady = false;
async function init() {
  if (tablesReady) return;
  await ensureTables();
  tablesReady = true;
}

class InstagramService {
  async getConnection(brandId: string): Promise<InstagramConnection | null> {
    await init();
    return queryOne<InstagramConnection>(
      `SELECT * FROM instagram_connections WHERE brand_id = ? LIMIT 1`,
      [brandId]
    );
  }

  async saveConnection(
    brandId: string,
    userId: string,
    data: { access_token: string; account_id: string; app_id: string; app_secret: string }
  ): Promise<InstagramConnection> {
    await init();
    const existing = await this.getConnection(brandId);

    if (existing) {
      await update(
        `UPDATE instagram_connections
         SET access_token = ?, account_id = ?, app_id = ?, app_secret = ?, updated_at = NOW()
         WHERE brand_id = ?`,
        [data.access_token, data.account_id, data.app_id, data.app_secret, brandId]
      );
      return { ...existing, ...data };
    }

    const id = randomUUID();
    await insert(
      `INSERT INTO instagram_connections (id, brand_id, user_id, access_token, account_id, app_id, app_secret)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, brandId, userId, data.access_token, data.account_id, data.app_id, data.app_secret]
    );
    return {
      id, brand_id: brandId, user_id: userId,
      ...data, is_active: true,
    };
  }

  async deleteConnection(brandId: string): Promise<void> {
    await init();
    await update(`DELETE FROM instagram_connections WHERE brand_id = ?`, [brandId]);
  }

  async updateConnectionProfile(brandId: string, data: {
    ig_user_id?: string; username?: string; name?: string;
    profile_picture_url?: string; followers_count?: number;
    follows_count?: number; media_count?: number;
    biography?: string; website?: string; token_expires_at?: string;
  }): Promise<void> {
    await init();
    await update(
      `UPDATE instagram_connections
       SET ig_user_id = ?, username = ?, name = ?, profile_picture_url = ?,
           followers_count = ?, follows_count = ?, media_count = ?,
           biography = ?, website = ?, token_expires_at = ?,
           is_active = true, updated_at = NOW()
       WHERE brand_id = ?`,
      [
        data.ig_user_id || "", data.username || "", data.name || "",
        data.profile_picture_url || "", data.followers_count || 0,
        data.follows_count || 0, data.media_count || 0,
        data.biography || "", data.website || "",
        data.token_expires_at || null, brandId,
      ]
    );
  }

  async testConnection(brandId: string): Promise<{ ok: boolean; message: string; profile?: any }> {
    const conn = await this.getConnection(brandId);
    if (!conn || !conn.access_token) {
      return { ok: false, message: "Nenhuma conexao Instagram configurada" };
    }

    try {
      // Instagram Business Login API uses graph.instagram.com and "me" endpoint
      const resp = await fetch(
        `${IG_GRAPH_URL}/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website&access_token=${conn.access_token}`
      );
      if (!resp.ok) {
        const err: any = await resp.json().catch(() => ({}));
        return { ok: false, message: err?.error?.message || `HTTP ${resp.status}` };
      }
      const profile: any = await resp.json();
      const igUserId = profile.user_id || profile.id || conn.account_id;

      await update(
        `UPDATE instagram_connections
         SET ig_user_id = ?, username = ?, name = ?, profile_picture_url = ?,
             followers_count = ?, follows_count = ?, media_count = ?,
             biography = ?, website = ?, is_active = true, updated_at = NOW()
         WHERE brand_id = ?`,
        [
          igUserId, profile.username, profile.name, profile.profile_picture_url,
          profile.followers_count || 0, profile.follows_count || 0, profile.media_count || 0,
          profile.biography || "", profile.website || "", brandId,
        ]
      );

      return { ok: true, message: "Conectado com sucesso", profile: { ...profile, id: igUserId } };
    } catch (err: any) {
      return { ok: false, message: err.message || "Erro ao conectar" };
    }
  }

  async getProfile(brandId: string): Promise<any> {
    const conn = await this.getConnection(brandId);
    if (!conn) return null;

    if (conn.username) {
      return {
        id: conn.ig_user_id,
        username: conn.username,
        name: conn.name,
        profile_picture_url: conn.profile_picture_url,
        followers_count: conn.followers_count || 0,
        follows_count: conn.follows_count || 0,
        media_count: conn.media_count || 0,
        biography: conn.biography,
        website: conn.website,
        is_connected: true,
        token_valid: true,
      };
    }

    const test = await this.testConnection(brandId);
    if (!test.ok) return { is_connected: false, token_valid: false };
    return { ...test.profile, is_connected: true, token_valid: true };
  }

  async fetchMedia(brandId: string, limit = 12): Promise<any[]> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token || !conn?.account_id) return [];

    try {
      const resp = await fetch(
        `${IG_GRAPH_URL}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${conn.access_token}`
      );
      if (!resp.ok) return [];
      const data: any = await resp.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async fetchInsights(brandId: string, period: "day" | "week" | "days_28" = "day"): Promise<any> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token || !conn?.account_id) return null;

    try {
      const metrics = "impressions,reach,profile_views,accounts_engaged";
      const resp = await fetch(
        `${IG_GRAPH_URL}/me/insights?metric=${metrics}&period=${period}&access_token=${conn.access_token}`
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async snapshotMetrics(brandId: string): Promise<void> {
    const conn = await this.getConnection(brandId);
    if (!conn) return;

    const profile = await this.getProfile(brandId);
    if (!profile?.is_connected) return;

    const today = new Date().toISOString().slice(0, 10);
    const id = randomUUID();

    try {
      await insert(
        `INSERT INTO instagram_metrics (id, brand_id, date, followers_count, follows_count, media_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           followers_count = VALUES(followers_count),
           follows_count = VALUES(follows_count),
           media_count = VALUES(media_count)`,
        [id, brandId, today, profile.followers_count || 0, profile.follows_count || 0, profile.media_count || 0]
      );
    } catch (err: any) {
      logger.error("[Instagram] snapshot error:", err.message);
    }
  }

  async getMetrics(brandId: string, days = 30): Promise<InstagramMetrics[]> {
    await init();
    const rows = await query<InstagramMetrics[]>(
      `SELECT * FROM instagram_metrics
       WHERE brand_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY date ASC`,
      [brandId, days]
    );
    return rows || [];
  }

  async getPosts(brandId: string, filters?: { status?: string; limit?: number; offset?: number }): Promise<{ posts: InstagramPost[]; total: number }> {
    await init();
    const conditions = [`brand_id = ?`];
    const params: any[] = [brandId];

    if (filters?.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }

    const where = conditions.join(" AND ");
    const countRow = await queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM instagram_posts WHERE ${where}`, params);
    const total = countRow?.cnt || 0;

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    const rows = await query<InstagramPost[]>(
      `SELECT * FROM instagram_posts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { posts: rows || [], total };
  }

  async createPost(brandId: string, data: Partial<InstagramPost>): Promise<InstagramPost> {
    await init();
    const id = randomUUID();
    const post: InstagramPost = {
      id,
      brand_id: brandId,
      media_type: data.media_type || "IMAGE",
      media_url: data.media_url,
      thumbnail_url: data.thumbnail_url,
      caption: data.caption,
      status: data.status || "draft",
      scheduled_at: data.scheduled_at,
    };

    await insert(
      `INSERT INTO instagram_posts (id, brand_id, media_type, media_url, thumbnail_url, caption, status, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, brandId, post.media_type, post.media_url || null, post.thumbnail_url || null, post.caption || null, post.status, post.scheduled_at || null]
    );
    return post;
  }

  async updatePost(postId: string, data: Partial<InstagramPost>): Promise<void> {
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
    await update(`UPDATE instagram_posts SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  async deletePost(postId: string): Promise<void> {
    await init();
    await update(`DELETE FROM instagram_posts WHERE id = ?`, [postId]);
  }

  async publishPost(brandId: string, postId: string): Promise<{ ok: boolean; message: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, message: "Instagram nao conectado" };

    const post = await queryOne<InstagramPost>(`SELECT * FROM instagram_posts WHERE id = ? AND brand_id = ?`, [postId, brandId]);
    if (!post) return { ok: false, message: "Post nao encontrado" };
    if (!post.media_url) return { ok: false, message: "Post sem midia" };

    try {
      await this.updatePost(postId, { status: "publishing" });

      let containerId: string;
      if (post.media_type === "VIDEO" || post.media_type === "REELS") {
        const resp = await fetch(`${IG_GRAPH_URL}/me/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_url: post.media_url,
            caption: post.caption || "",
            media_type: post.media_type === "REELS" ? "REELS" : "VIDEO",
            access_token: conn.access_token,
          }),
        });
        const d: any = await resp.json();
        containerId = d.id;
      } else {
        const resp = await fetch(`${IG_GRAPH_URL}/me/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: post.media_url,
            caption: post.caption || "",
            access_token: conn.access_token,
          }),
        });
        const d: any = await resp.json();
        containerId = d.id;
      }

      if (!containerId) {
        await this.updatePost(postId, { status: "failed" });
        return { ok: false, message: "Falha ao criar container de midia" };
      }

      const pubResp = await fetch(`${IG_GRAPH_URL}/me/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerId, access_token: conn.access_token }),
      });
      const pubData: any = await pubResp.json();

      if (pubData.id) {
        await this.updatePost(postId, {
          status: "published",
          ig_media_id: pubData.id,
          published_at: new Date().toISOString(),
        });
        return { ok: true, message: "Publicado com sucesso" };
      } else {
        await this.updatePost(postId, { status: "failed" });
        return { ok: false, message: pubData?.error?.message || "Falha ao publicar" };
      }
    } catch (err: any) {
      await this.updatePost(postId, { status: "failed" });
      return { ok: false, message: err.message };
    }
  }

  async getConversations(brandId: string): Promise<any[]> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token || !conn?.account_id) return [];

    try {
      const resp = await fetch(
        `${IG_GRAPH_URL}/me/conversations?fields=participants,messages{message,from,created_time}&platform=instagram&access_token=${conn.access_token}`
      );
      if (!resp.ok) return [];
      const data: any = await resp.json();
      return data.data || [];
    } catch {
      return [];
    }
  }
}

export const instagramService = new InstagramService();
