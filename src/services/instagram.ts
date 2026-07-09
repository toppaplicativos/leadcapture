import path from "path";
import { query, queryOne, update, insert } from "../config/database";
import { logger } from "../utils/logger";
import { randomUUID } from "crypto";
import { galleryService } from "./gallery";

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

export type InstagramMediaItem = {
  url: string;
  type: "image" | "video";
  order: number;
  gallery_id?: string;
};

export type InstagramPost = {
  id: string;
  brand_id: string;
  ig_media_id?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS" | "STORIES";
  media_url?: string;
  media_items?: InstagramMediaItem[];
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduled_at?: string;
  published_at?: string;
  error_message?: string | null;
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

export type InstagramAccountInsights = {
  reach: number;
  views: number;
  profile_views: number;
  accounts_engaged: number;
  total_interactions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

export type InstagramAnalytics = {
  period_days: number;
  profile: {
    username: string;
    name: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
    profile_picture_url?: string;
    biography?: string;
    website?: string;
  };
  account: InstagramAccountInsights;
  media_summary: {
    total_likes: number;
    total_comments: number;
    posts_analyzed: number;
    engagement_rate: number;
  };
  fetched_at: string;
  source: "instagram_api";
};

export type InstagramPostCounts = {
  published_ig: number;
  scheduled: number;
  drafts: number;
  failed: number;
  publishing: number;
  total_local: number;
};

export type InstagramDashboard = {
  profile: InstagramAnalytics["profile"];
  analytics: InstagramAnalytics;
  post_counts: InstagramPostCounts;
  conversations_count: number;
  recent_media: any[];
  token_valid: boolean;
};

export type InstagramMessageRow = {
  id: string;
  connection_id: string;
  brand_id: string;
  sender_id: string;
  message_id: string;
  message_text: string | null;
  direction: "incoming" | "outgoing";
  created_at: string;
};

export type InstagramConversationThread = {
  id: string;
  sender_id: string;
  username?: string;
  updated_time?: string;
  last_message?: string;
  last_message_at?: string;
  message_count: number;
  source: "api" | "local" | "merged";
  messages: Array<{
    id: string;
    message: string;
    from_id?: string;
    from_username?: string;
    direction: "incoming" | "outgoing";
    created_time: string;
  }>;
};

export type InstagramConversationsResult = {
  conversations: InstagramConversationThread[];
  meta: {
    api_count: number;
    local_count: number;
    api_error?: string;
  };
};

export type InstagramMediaInsights = {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  total_interactions: number;
  profile_visits: number;
  follows: number;
  profile_activity: number;
  reposts: number;
  ig_reels_avg_watch_time?: number;
  ig_reels_video_view_total_time?: number;
  reels_skip_rate?: number;
  replies?: number;
};

export type InstagramPostAnalysis = {
  media: {
    id: string;
    caption?: string;
    media_type: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
    children?: Array<{ id?: string; media_type?: string; media_url?: string; thumbnail_url?: string }>;
  };
  insights: InstagramMediaInsights;
  insights_error?: string;
  computed: {
    engagement_rate: number;
    reach_rate: number;
    view_rate: number;
    save_rate: number;
    comment_rate: number;
    interaction_rate: number;
    performance_label: "excelente" | "bom" | "medio" | "baixo";
    strategic_notes: string[];
  };
  account_context: {
    followers_count: number;
    username?: string;
  };
  snapshots_count: number;
  fetched_at: string;
};

const IG_GRAPH_URL = "https://graph.instagram.com/v21.0";

const ACCOUNT_INSIGHT_METRICS = [
  "reach",
  "views",
  "profile_views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "saves",
  "shares",
].join(",");

function emptyAccountInsights(): InstagramAccountInsights {
  return {
    reach: 0,
    views: 0,
    profile_views: 0,
    accounts_engaged: 0,
    total_interactions: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
  };
}

function parseInsightValue(metric: any): number {
  if (!metric || typeof metric !== "object") return 0;
  const total = Number(metric.total_value?.value);
  if (Number.isFinite(total)) return total;
  const legacy = Number(metric.values?.[0]?.value);
  if (Number.isFinite(legacy)) return legacy;
  return 0;
}

function parseInsightsPayload(raw: any): InstagramAccountInsights {
  const out = emptyAccountInsights();
  if (!raw?.data || !Array.isArray(raw.data)) return out;
  for (const metric of raw.data) {
    const name = String(metric?.name || "");
    const val = parseInsightValue(metric);
    if (name in out) (out as any)[name] = val;
  }
  return out;
}

function emptyMediaInsights(): InstagramMediaInsights {
  return {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
    total_interactions: 0,
    profile_visits: 0,
    follows: 0,
    profile_activity: 0,
    reposts: 0,
  };
}

function parseMediaInsightsPayload(raw: any): InstagramMediaInsights {
  const out = emptyMediaInsights();
  if (!raw?.data || !Array.isArray(raw.data)) return out;
  for (const metric of raw.data) {
    const name = String(metric?.name || "");
    const val = parseInsightValue(metric);
    if (name in out) (out as any)[name] = val;
    else if (name === "ig_reels_avg_watch_time") out.ig_reels_avg_watch_time = val;
    else if (name === "ig_reels_video_view_total_time") out.ig_reels_video_view_total_time = val;
    else if (name === "reels_skip_rate") out.reels_skip_rate = val;
    else if (name === "replies") out.replies = val;
  }
  return out;
}

function metricsForMediaType(mediaType: string): string[] {
  const t = String(mediaType || "IMAGE").toUpperCase();
  if (t === "REELS") {
    return [
      "views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "reposts",
      "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate",
    ];
  }
  if (t === "STORY") {
    return ["views", "reach", "replies", "shares", "profile_visits", "navigation"];
  }
  return [
    "views", "reach", "likes", "comments", "saved", "shares", "total_interactions",
    "profile_visits", "follows", "profile_activity", "reposts",
  ];
}

function buildStrategicNotes(
  insights: InstagramMediaInsights,
  computed: InstagramPostAnalysis["computed"],
  followers: number,
): string[] {
  const notes: string[] = [];
  if (computed.engagement_rate >= 5) notes.push("Engajamento acima de 5% — desempenho forte para decisões de repost ou série similar.");
  else if (computed.engagement_rate >= 2) notes.push("Engajamento saudável — vale replicar formato e horário deste post.");
  else if (computed.engagement_rate < 0.5 && followers > 500) notes.push("Engajamento baixo — teste novo gancho na legenda ou formato visual diferente.");

  if (computed.reach_rate >= 25) notes.push("Alcance expandiu além da base de seguidores — bom candidato para impulsionar.");
  if (insights.saved > 0 && insights.likes > 0 && insights.saved / insights.likes >= 0.08) {
    notes.push("Alta taxa de salvamentos — conteúdo educativo ou referência; priorize este tema no calendário.");
  }
  if (insights.comments > 0 && insights.likes > 0 && insights.comments / insights.likes >= 0.05) {
    notes.push("Comentários proporcionais altos — reforça comunidade; responda rápido para manter o alcance.");
  }
  if (insights.profile_visits > 0 && insights.reach > 0 && insights.profile_visits / insights.reach >= 0.03) {
    notes.push("Visitas ao perfil relevantes — CTA na legenda está convertendo interesse em descoberta da marca.");
  }
  if (insights.follows > 0) notes.push(`${insights.follows} novos seguidores atribuídos a este post — analise o que diferenciou este conteúdo.`);
  if (insights.shares > 0 && insights.reach > 0 && insights.shares / insights.reach >= 0.01) {
    notes.push("Compartilhamentos expressivos — conteúdo com potencial viral orgânico.");
  }
  if (notes.length === 0) notes.push("Capture snapshots periodicamente para comparar evolução e calibrar a estratégia de conteúdo.");
  return notes.slice(0, 5);
}

function performanceLabel(rate: number): InstagramPostAnalysis["computed"]["performance_label"] {
  if (rate >= 5) return "excelente";
  if (rate >= 2) return "bom";
  if (rate >= 0.5) return "medio";
  return "baixo";
}

const PRODUCTION_PUBLIC_BASE = "https://app.leadcapture.online";

function sanitizePublicBase(raw: string): string {
  let value = String(raw || "").trim();
  value = value.replace(/^["']+|["']+$/g, "");
  value = value.replace(/\\/g, "");
  value = value.replace(/\/+$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value.replace(/^\/+/, "")}`;
  }
  return value;
}

function sanitizeMediaUrl(url: string): string {
  return String(url || "").trim().replace(/\\/g, "");
}

function isLocalBaseUrl(base: string): boolean {
  const clean = sanitizePublicBase(base);
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(clean);
}

function getPublicAppBaseUrl(): string {
  const candidates = [
    process.env.APP_PUBLIC_URL,
    process.env.FRONTEND_PUBLIC_URL,
    process.env.CHECKOUT_BASE_URL,
    process.env.PUBLIC_URL,
  ]
    .map((value) => sanitizePublicBase(String(value || "")))
    .filter(Boolean);

  for (const base of candidates) {
    if (!isLocalBaseUrl(base) && /^https?:\/\/[a-z0-9.-]+/i.test(base)) return base;
  }

  return PRODUCTION_PUBLIC_BASE;
}

function extractUrlPathname(url: string): string {
  const clean = sanitizeMediaUrl(url);
  try {
    return new URL(clean).pathname;
  } catch {
    return clean.replace(/^https?:\/\/[^/]+/i, "");
  }
}

function resolvePublicMediaUrl(url: string): string {
  const trimmed = sanitizeMediaUrl(url);
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(trimmed)) {
      const base = getPublicAppBaseUrl();
      const pathname = extractUrlPathname(trimmed);
      return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    }
    return trimmed;
  }

  const base = getPublicAppBaseUrl();
  const pathname = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${pathname}`;
}

/** Instagram Content Publishing aceita JPEG — sempre servir /uploads via proxy publico. */
function resolveInstagramImageUrl(url: string): string {
  const publicUrl = resolvePublicMediaUrl(url);
  if (!publicUrl) return "";

  const pathname = extractUrlPathname(publicUrl);
  if (pathname.startsWith("/uploads/")) {
    const base = getPublicAppBaseUrl();
    const encoded = encodeURIComponent(pathname);
    return `${base}/api/img?src=${encoded}&fm=jpeg&w=1920&q=92`;
  }
  return publicUrl;
}

function resolveInstagramVideoUrl(url: string): string {
  return resolvePublicMediaUrl(url);
}

function parseMediaItems(raw: unknown): InstagramMediaItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item, index): InstagramMediaItem => {
        const row = item as InstagramMediaItem;
        const galleryId = String(row.gallery_id || (row as any).galleryId || "").trim();
        return {
          url: String(row.url || "").trim(),
          type: row.type === "video" ? "video" : "image",
          order: Number.isFinite(row.order) ? Number(row.order) : index,
          gallery_id: galleryId || undefined,
        };
      })
      .filter((item) => item.url);
  }
  if (typeof raw === "string") {
    try {
      return parseMediaItems(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

async function markGalleryPublishedFromInstagramPost(
  conn: InstagramConnection,
  postId: string,
  mediaItems: InstagramMediaItem[],
  publishedAt: string
): Promise<void> {
  try {
    await galleryService.markPublishedFromPost(conn.user_id, conn.brand_id, {
      postId,
      channel: "instagram",
      publishedAt,
      items: mediaItems.map((item) => ({ galleryId: item.gallery_id, url: item.url })),
    });
  } catch (err: any) {
    logger.warn(`[Instagram] Falha ao marcar midia publicada na galeria: ${err?.message || err}`);
  }
}

function normalizeMediaItemsInput(
  mediaType: InstagramPost["media_type"],
  items?: InstagramMediaItem[],
  fallbackUrl?: string
): InstagramMediaItem[] {
  const sorted = [...(items || [])].sort((a, b) => a.order - b.order);
  if (sorted.length) {
    return sorted.map((item, index) => ({
      url: item.url,
      type: item.type === "video" ? "video" : "image",
      order: index,
      gallery_id: item.gallery_id,
    }));
  }
  const url = String(fallbackUrl || "").trim();
  if (!url) return [];
  const type = mediaType === "REELS" || mediaType === "VIDEO" ? "video" : "image";
  return [{ url, type, order: 0 }];
}

async function createIgMediaContainer(
  accessToken: string,
  payload: Record<string, unknown>
): Promise<{ id?: string; error?: string; raw?: any }> {
  const resp = await fetch(`${IG_GRAPH_URL}/me/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  });
  const data: any = await resp.json();
  if (data?.id) return { id: data.id };
  const errMsg = data?.error?.message || "Falha ao criar container de midia";
  logger.error(
    `[Instagram] createIgMediaContainer failed: ${errMsg} | response=${JSON.stringify(data?.error || data)}`
  );
  return { error: errMsg, raw: data };
}

async function waitForMediaContainer(
  accessToken: string,
  containerId: string,
  maxAttempts = 30
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetch(`${IG_GRAPH_URL}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const data: any = await resp.json();
    const status = String(data?.status_code || "");
    if (status === "FINISHED" || status === "PUBLISHED") return { ok: true };
    if (status === "ERROR" || status === "EXPIRED") {
      return { ok: false, error: `Container ${status.toLowerCase()}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { ok: false, error: "Timeout aguardando processamento da midia no Instagram" };
}

async function fetchIgMediaPermalink(accessToken: string, igMediaId: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await fetch(
        `${IG_GRAPH_URL}/${igMediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
      );
      const data: any = await resp.json();
      if (data?.permalink) return String(data.permalink);
    } catch {
      /* retry */
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return undefined;
}

async function publishIgContainer(
  accessToken: string,
  containerId: string
): Promise<{ ok: boolean; igMediaId?: string; error?: string }> {
  const pubResp = await fetch(`${IG_GRAPH_URL}/me/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
  });
  const pubData: any = await pubResp.json();
  if (pubData?.id) return { ok: true, igMediaId: pubData.id };
  return { ok: false, error: pubData?.error?.message || "Falha ao publicar" };
}

function normalizeInstagramPost(row: InstagramPost): InstagramPost {
  return {
    ...row,
    media_items: parseMediaItems((row as any).media_items),
  };
}

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

  await query(`ALTER TABLE instagram_posts ADD COLUMN media_items JSONB NULL`).catch(() => undefined);
  await query(`ALTER TABLE instagram_posts ADD COLUMN error_message TEXT NULL`).catch(() => undefined);

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

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_messages (
      id VARCHAR(36) PRIMARY KEY,
      connection_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      sender_id VARCHAR(255) NOT NULL,
      message_id VARCHAR(255) NOT NULL,
      message_text TEXT,
      direction VARCHAR(16) NOT NULL DEFAULT 'incoming',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ig_message (message_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_media_snapshots (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      ig_media_id VARCHAR(255) NOT NULL,
      media_type VARCHAR(32),
      caption_preview VARCHAR(500),
      metrics JSONB NOT NULL,
      computed JSONB,
      captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_caption_templates (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      label VARCHAR(255) NOT NULL DEFAULT 'Template',
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ig_caption_tpl_brand (brand_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_ai_settings (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      brand_name VARCHAR(255) DEFAULT '',
      persona TEXT,
      tone VARCHAR(255) DEFAULT '',
      max_chars INT DEFAULT 500,
      guidelines TEXT,
      faq_json JSONB NULL,
      rules_json JSONB NULL,
      auto_reply_dm BOOLEAN DEFAULT false,
      auto_reply_comments BOOLEAN DEFAULT false,
      notify_whatsapp BOOLEAN DEFAULT false,
      notify_phone VARCHAR(32) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ig_ai_brand (brand_id)
    )
  `);

  await query(`ALTER TABLE instagram_ai_settings ADD COLUMN notify_whatsapp BOOLEAN DEFAULT false`).catch(() => undefined);
  await query(`ALTER TABLE instagram_ai_settings ADD COLUMN notify_phone VARCHAR(32) DEFAULT ''`).catch(() => undefined);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_queue_alert_log (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      post_id VARCHAR(36),
      alert_type VARCHAR(32) NOT NULL DEFAULT 'publish_failed',
      message TEXT,
      channel VARCHAR(16) DEFAULT 'in_app',
      delivered BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ig_queue_alert_brand (brand_id, created_at)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS instagram_webhook_events (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36),
      ig_user_id VARCHAR(255) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      field VARCHAR(64),
      triggered_by VARCHAR(255),
      dedup_key VARCHAR(255) NOT NULL,
      payload JSONB,
      dispatch_result JSONB,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ig_webhook_dedup (dedup_key)
    )
  `);
}

let tablesReady = false;
async function init() {
  if (tablesReady) return;
  await ensureTables();
  tablesReady = true;
}

type WhatsappNotifyFn = (userId: string, phone: string, message: string) => Promise<boolean>;

class InstagramService {
  private whatsappNotifier: WhatsappNotifyFn | null = null;

  setWhatsappNotifier(fn: WhatsappNotifyFn | null): void {
    this.whatsappNotifier = fn;
  }

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
         SET access_token = ?, account_id = ?, app_id = ?, app_secret = ?,
             is_active = true, updated_at = NOW()
         WHERE brand_id = ?`,
        [data.access_token, data.account_id, data.app_id, data.app_secret, brandId]
      );
      return { ...existing, ...data, is_active: true };
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

  async getProfile(brandId: string, opts?: { refresh?: boolean }): Promise<any> {
    const conn = await this.getConnection(brandId);
    if (!conn) return null;

    const fromConn = () => ({
      id: conn.ig_user_id || conn.account_id,
      username: conn.username || "",
      name: conn.name || "",
      profile_picture_url: conn.profile_picture_url || "",
      followers_count: conn.followers_count || 0,
      follows_count: conn.follows_count || 0,
      media_count: conn.media_count || 0,
      biography: conn.biography || "",
      website: conn.website || "",
      // Conta vinculada se há token — não exige is_active (campo pode estar stale)
      is_connected: !!(conn.access_token && String(conn.access_token).trim()),
      token_valid: true,
    });

    if (!conn.access_token) {
      return { ...fromConn(), is_connected: false, token_valid: false };
    }

    const shouldRefresh = opts?.refresh !== false;
    if (shouldRefresh) {
      const test = await this.testConnection(brandId);
      if (test.ok && test.profile) {
        return {
          id: test.profile.id || test.profile.user_id || conn.ig_user_id || conn.account_id,
          username: test.profile.username || conn.username,
          name: test.profile.name || conn.name,
          profile_picture_url: test.profile.profile_picture_url || conn.profile_picture_url,
          followers_count: test.profile.followers_count ?? conn.followers_count ?? 0,
          follows_count: test.profile.follows_count ?? conn.follows_count ?? 0,
          media_count: test.profile.media_count ?? conn.media_count ?? 0,
          biography: test.profile.biography || conn.biography,
          website: test.profile.website || conn.website,
          is_connected: true,
          token_valid: true,
        };
      }
      // Token no banco mas Graph falhou: ainda é "conectado" (link salvo), token_valid=false
      return {
        ...fromConn(),
        is_connected: true,
        token_valid: false,
        error: test.message,
      };
    }

    return fromConn();
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

  async fetchMediaDetail(brandId: string, mediaId: string): Promise<any | null> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return null;

    const fields = [
      "id", "caption", "media_type", "media_url", "thumbnail_url", "permalink",
      "timestamp", "like_count", "comments_count",
      "children{media_type,media_url,thumbnail_url,id}",
    ].join(",");

    try {
      const resp = await fetch(
        `${IG_GRAPH_URL}/${mediaId}?fields=${fields}&access_token=${encodeURIComponent(conn.access_token)}`,
      );
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        logger.warn(`[Instagram] media detail ${mediaId}: ${data?.error?.message || resp.status}`);
        return null;
      }
      return data;
    } catch (err: any) {
      logger.error(`[Instagram] fetchMediaDetail: ${err.message}`);
      return null;
    }
  }

  async fetchMediaInsights(
    brandId: string,
    mediaId: string,
    mediaType: string,
  ): Promise<{ parsed: InstagramMediaInsights; error?: string; raw?: any }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { parsed: emptyMediaInsights(), error: "Instagram nao conectado" };

    const metrics = metricsForMediaType(mediaType);
    const params = new URLSearchParams({
      metric: metrics.join(","),
      period: "lifetime",
      access_token: conn.access_token,
    });

    try {
      const resp = await fetch(`${IG_GRAPH_URL}/${mediaId}/insights?${params}`);
      const raw: any = await resp.json().catch(() => ({}));
      let parsed = emptyMediaInsights();
      let error: string | undefined;

      if (resp.ok) {
        parsed = parseMediaInsightsPayload(raw);
      } else {
        error = raw?.error?.message || `HTTP ${resp.status}`;
        for (const metric of metrics) {
          const single = await fetch(
            `${IG_GRAPH_URL}/${mediaId}/insights?metric=${metric}&period=lifetime&access_token=${encodeURIComponent(conn.access_token)}`,
          );
          const singleRaw: any = await single.json().catch(() => ({}));
          if (single.ok) {
            parsed = { ...parsed, ...parseMediaInsightsPayload(singleRaw) };
          }
        }
      }

      const detail = await this.fetchMediaDetail(brandId, mediaId);
      if (detail) {
        if (!parsed.likes) parsed.likes = Number(detail.like_count || 0);
        if (!parsed.comments) parsed.comments = Number(detail.comments_count || 0);
      }
      return { parsed, error, raw: resp.ok ? raw : undefined };
    } catch (err: any) {
      return { parsed: emptyMediaInsights(), error: err.message };
    }
  }

  async getPostAnalysis(brandId: string, mediaId: string): Promise<InstagramPostAnalysis | null> {
    await init();
    const profile = await this.getProfile(brandId);
    const media = await this.fetchMediaDetail(brandId, mediaId);
    if (!media?.id) return null;

    const mediaType = String(media.media_type || "IMAGE");
    const insightResult = await this.fetchMediaInsights(brandId, mediaId, mediaType);
    const insights = insightResult.parsed;

    const likes = insights.likes || Number(media.like_count || 0);
    const comments = insights.comments || Number(media.comments_count || 0);
    const followers = Number(profile?.followers_count || 0);
    const interactions = insights.total_interactions || (likes + comments + insights.saved + insights.shares);

    const engagement_rate = followers > 0
      ? Number((((likes + comments + insights.saved + insights.shares) / followers) * 100).toFixed(2))
      : 0;
    const reach_rate = followers > 0 && insights.reach > 0
      ? Number(((insights.reach / followers) * 100).toFixed(2))
      : 0;
    const view_rate = followers > 0 && insights.views > 0
      ? Number(((insights.views / followers) * 100).toFixed(2))
      : 0;
    const save_rate = insights.reach > 0
      ? Number(((insights.saved / insights.reach) * 100).toFixed(2))
      : 0;
    const comment_rate = insights.reach > 0
      ? Number(((comments / insights.reach) * 100).toFixed(2))
      : 0;
    const interaction_rate = insights.reach > 0
      ? Number(((interactions / insights.reach) * 100).toFixed(2))
      : 0;

    const computed = {
      engagement_rate,
      reach_rate,
      view_rate,
      save_rate,
      comment_rate,
      interaction_rate,
      performance_label: performanceLabel(engagement_rate),
      strategic_notes: buildStrategicNotes(insights, {
        engagement_rate, reach_rate, view_rate, save_rate, comment_rate, interaction_rate,
        performance_label: performanceLabel(engagement_rate), strategic_notes: [],
      }, followers),
    };

    const snapRows = await query<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM instagram_media_snapshots WHERE brand_id = ? AND ig_media_id = ?`,
      [brandId, mediaId],
    );
    const snapshots_count = Number(snapRows?.[0]?.cnt || 0);

    return {
      media: {
        id: String(media.id),
        caption: media.caption,
        media_type: mediaType,
        media_url: media.media_url,
        thumbnail_url: media.thumbnail_url,
        permalink: media.permalink,
        timestamp: media.timestamp,
        like_count: Number(media.like_count || 0),
        comments_count: Number(media.comments_count || 0),
        children: media.children?.data || media.children || undefined,
      },
      insights,
      insights_error: insightResult.error,
      computed,
      account_context: {
        followers_count: followers,
        username: profile?.username,
      },
      snapshots_count,
      fetched_at: new Date().toISOString(),
    };
  }

  async snapshotPostAnalysis(brandId: string, mediaId: string): Promise<{ ok: boolean; snapshot_id?: string }> {
    const analysis = await this.getPostAnalysis(brandId, mediaId);
    if (!analysis) return { ok: false };

    await init();
    const id = randomUUID();
    const captionPreview = String(analysis.media.caption || "").slice(0, 500);
    await insert(
      `INSERT INTO instagram_media_snapshots (id, brand_id, ig_media_id, media_type, caption_preview, metrics, computed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        brandId,
        mediaId,
        analysis.media.media_type,
        captionPreview,
        JSON.stringify(analysis.insights),
        JSON.stringify(analysis.computed),
      ],
    );
    return { ok: true, snapshot_id: id };
  }

  async listMediaSnapshots(brandId: string, mediaId: string, limit = 10): Promise<any[]> {
    await init();
    const rows = await query<any[]>(
      `SELECT id, ig_media_id, media_type, caption_preview, metrics, computed, captured_at
       FROM instagram_media_snapshots
       WHERE brand_id = ? AND ig_media_id = ?
       ORDER BY captured_at DESC
       LIMIT ?`,
      [brandId, mediaId, limit],
    );
    return rows || [];
  }

  async fetchInsights(
    brandId: string,
    opts?: { days?: number; period?: "day" | "week" | "days_28" }
  ): Promise<{ raw: any; parsed: InstagramAccountInsights; error?: string } | null> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return null;

    const days = Math.max(1, Math.min(90, Number(opts?.days || 7)));
    const period = opts?.period || "day";

    try {
      const params = new URLSearchParams({
        metric: ACCOUNT_INSIGHT_METRICS,
        period,
        metric_type: "total_value",
        access_token: conn.access_token,
      });
      if (days > 1) {
        const until = Math.floor(Date.now() / 1000);
        const since = until - days * 86400;
        params.set("since", String(since));
        params.set("until", String(until));
      }

      const resp = await fetch(`${IG_GRAPH_URL}/me/insights?${params}`);
      const raw: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const errMsg = raw?.error?.message || `HTTP ${resp.status}`;
        logger.warn(`[Instagram] insights error: ${errMsg}`);
        return { raw, parsed: emptyAccountInsights(), error: errMsg };
      }
      return { raw, parsed: parseInsightsPayload(raw) };
    } catch (err: any) {
      logger.error("[Instagram] fetchInsights error:", err.message);
      return null;
    }
  }

  async fetchAnalytics(
    brandId: string,
    days = 7,
    opts?: { refreshProfile?: boolean; mediaLimit?: number },
  ): Promise<InstagramAnalytics | null> {
    // refreshProfile default false: evita Meta Graph em todo paint do canvas.
    // snapshotMetrics / refresh manual ainda pedem refresh explícito.
    const refreshProfile = opts?.refreshProfile === true;
    const mediaLimit = Math.max(1, Math.min(50, Number(opts?.mediaLimit || 12)));

    const [profile, insights, media] = await Promise.all([
      this.getProfile(brandId, { refresh: refreshProfile }),
      this.fetchInsights(brandId, { days }).catch(() => null),
      this.fetchMedia(brandId, mediaLimit).catch(() => [] as any[]),
    ]);

    if (!profile?.is_connected) return null;

    const account = insights?.parsed || emptyAccountInsights();
    const list = Array.isArray(media) ? media : [];

    let totalLikes = 0;
    let totalComments = 0;
    for (const item of list) {
      totalLikes += Number(item.like_count || 0);
      totalComments += Number(item.comments_count || 0);
    }
    const postsAnalyzed = list.length;
    const followers = Number(profile.followers_count || 0);
    const engagementRate = followers > 0 && postsAnalyzed > 0
      ? Number((((totalLikes + totalComments) / postsAnalyzed) / followers) * 100).toFixed(2)
      : 0;

    return {
      period_days: days,
      profile: {
        username: profile.username || "",
        name: profile.name || "",
        followers_count: followers,
        follows_count: Number(profile.follows_count || 0),
        media_count: Number(profile.media_count || 0),
        profile_picture_url: profile.profile_picture_url,
        biography: profile.biography,
        website: profile.website,
      },
      account,
      media_summary: {
        total_likes: totalLikes,
        total_comments: totalComments,
        posts_analyzed: postsAnalyzed,
        engagement_rate: Number(engagementRate),
      },
      fetched_at: new Date().toISOString(),
      source: "instagram_api",
    };
  }

  async snapshotMetrics(brandId: string): Promise<void> {
    const analytics = await this.fetchAnalytics(brandId, 1, { refreshProfile: true, mediaLimit: 1 });
    if (!analytics) return;

    const today = new Date().toISOString().slice(0, 10);
    const id = randomUUID();
    const { profile, account } = analytics;

    try {
      await insert(
        `INSERT INTO instagram_metrics (id, brand_id, date, followers_count, follows_count, media_count, impressions, reach_count, profile_views, accounts_engaged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           followers_count = VALUES(followers_count),
           follows_count = VALUES(follows_count),
           media_count = VALUES(media_count),
           impressions = VALUES(impressions),
           reach_count = VALUES(reach_count),
           profile_views = VALUES(profile_views),
           accounts_engaged = VALUES(accounts_engaged)`,
        [
          id, brandId, today,
          profile.followers_count || 0,
          profile.follows_count || 0,
          profile.media_count || 0,
          account.views || 0,
          account.reach || 0,
          account.profile_views || 0,
          account.accounts_engaged || 0,
        ]
      );
    } catch (err: any) {
      logger.error("[Instagram] snapshot error:", err.message);
    }
  }

  async getMetrics(brandId: string, days = 30): Promise<InstagramMetrics[]> {
    await init();
    const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
    // Postgres-compatible (DATE_SUB/CURDATE é MySQL e gerava 500)
    const rows = await query<any[]>(
      `SELECT * FROM instagram_metrics
       WHERE brand_id = ?
         AND date >= (CURRENT_DATE - (?::text || ' days')::interval)
       ORDER BY date ASC`,
      [brandId, safeDays]
    ).catch(async () => {
      // Fallback se coluna date tiver outro tipo/nome
      return query<any[]>(
        `SELECT * FROM instagram_metrics
         WHERE brand_id = ?
         ORDER BY date ASC
         LIMIT 90`,
        [brandId],
      ).catch(() => [] as any[]);
    });
    return (rows || []).map((row) => ({
      ...row,
      reach: Number(row.reach ?? row.reach_count ?? 0),
    }));
  }

  async getPostCounts(brandId: string): Promise<InstagramPostCounts> {
    await init();
    const rows = await query<{ status: string; cnt: number }[]>(
      `SELECT status, COUNT(*) as cnt FROM instagram_posts WHERE brand_id = ? GROUP BY status`,
      [brandId]
    );
    const counts: InstagramPostCounts = {
      published_ig: 0,
      scheduled: 0,
      drafts: 0,
      failed: 0,
      publishing: 0,
      total_local: 0,
    };
    for (const row of rows || []) {
      const n = Number(row.cnt || 0);
      counts.total_local += n;
      if (row.status === "scheduled") counts.scheduled = n;
      else if (row.status === "draft") counts.drafts = n;
      else if (row.status === "failed") counts.failed = n;
      else if (row.status === "publishing") counts.publishing = n;
      else if (row.status === "published") counts.published_ig += n;
    }
    return counts;
  }

  async fetchDashboard(brandId: string): Promise<InstagramDashboard | null> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token && !conn?.username) return null;

    // Tudo em paralelo: profile DB + insights + media + counts + DMs locais.
    // Antes era waterfall sequencial (analytics → media×50 → media×9 + conversas Meta).
    const emptyCounts = {
      published_ig: 0, scheduled: 0, drafts: 0, failed: 0, publishing: 0, total_local: 0,
    };

    const [profile, insights, media, postCounts, localThreads] = await Promise.all([
      this.getProfile(brandId, { refresh: false }),
      this.fetchInsights(brandId, { days: 7 }).catch(() => null),
      this.fetchMedia(brandId, 12).catch(() => [] as any[]),
      this.getPostCounts(brandId).catch(() => emptyCounts),
      // Contagem de DMs via threads locais — evita round-trip Meta só pelo badge do overview
      this.listLocalMessageThreads(brandId).catch(() => [] as any[]),
    ]);

    if (!profile?.is_connected && !conn.access_token) return null;

    const list = Array.isArray(media) ? media : [];
    let totalLikes = 0;
    let totalComments = 0;
    for (const item of list) {
      totalLikes += Number(item.like_count || 0);
      totalComments += Number(item.comments_count || 0);
    }
    const postsAnalyzed = list.length;
    const baseProfile = {
      username: profile?.username || conn.username || "",
      name: profile?.name || conn.name || "",
      followers_count: Number(profile?.followers_count || conn.followers_count || 0),
      follows_count: Number(profile?.follows_count || conn.follows_count || 0),
      media_count: Number(profile?.media_count || conn.media_count || 0),
      profile_picture_url: profile?.profile_picture_url || conn.profile_picture_url || "",
      biography: profile?.biography || conn.biography || "",
      website: profile?.website || conn.website || "",
    };
    const followers = baseProfile.followers_count;
    const engagementRate = followers > 0 && postsAnalyzed > 0
      ? Number((((totalLikes + totalComments) / postsAnalyzed) / followers) * 100).toFixed(2)
      : 0;

    const analytics: InstagramAnalytics = {
      period_days: 7,
      profile: baseProfile,
      account: insights?.parsed || emptyAccountInsights(),
      media_summary: {
        total_likes: totalLikes,
        total_comments: totalComments,
        posts_analyzed: postsAnalyzed,
        engagement_rate: Number(engagementRate),
      },
      fetched_at: new Date().toISOString(),
      source: "instagram_api",
    };

    return {
      profile: analytics.profile,
      analytics,
      post_counts: {
        ...postCounts,
        published_ig: analytics.profile.media_count || postCounts.published_ig,
      },
      conversations_count: Array.isArray(localThreads) ? localThreads.length : 0,
      recent_media: list.slice(0, 9),
      token_valid: profile?.token_valid !== false,
    };
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
    return { posts: (rows || []).map(normalizeInstagramPost), total };
  }

  async getPost(brandId: string, postId: string): Promise<InstagramPost | null> {
    await init();
    const row = await queryOne<InstagramPost>(
      `SELECT * FROM instagram_posts WHERE id = ? AND brand_id = ?`,
      [postId, brandId]
    );
    return row ? normalizeInstagramPost(row) : null;
  }

  async getQueueAlerts(
    brandId: string,
    since?: string
  ): Promise<{ failed_count: number; alerts: Array<Partial<InstagramPost>> }> {
    await init();
    const sinceDate =
      since && !Number.isNaN(new Date(since).getTime())
        ? new Date(since)
        : new Date(Date.now() - 60 * 60 * 1000);
    const failedRow = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM instagram_posts WHERE brand_id = ? AND status = 'failed'`,
      [brandId]
    );
    const rows = await query<InstagramPost[]>(
      `SELECT id, caption, status, updated_at, error_message, media_type, scheduled_at, permalink
       FROM instagram_posts
       WHERE brand_id = ? AND status IN ('published', 'failed') AND updated_at >= ?
       ORDER BY updated_at DESC LIMIT 20`,
      [brandId, sinceDate]
    );
    return {
      failed_count: failedRow?.cnt || 0,
      alerts: (rows || []).map((r) => ({
        id: r.id,
        caption: r.caption,
        status: r.status,
        updated_at: r.updated_at,
        error_message: r.error_message,
        media_type: r.media_type,
        scheduled_at: r.scheduled_at,
        permalink: r.permalink,
      })),
    };
  }

  async duplicatePost(brandId: string, postId: string): Promise<InstagramPost | null> {
    const source = await this.getPost(brandId, postId);
    if (!source) return null;
    return this.createPost(brandId, {
      media_type: source.media_type,
      media_url: source.media_url,
      media_items: source.media_items,
      thumbnail_url: source.thumbnail_url,
      caption: source.caption,
      status: "draft",
      scheduled_at: undefined,
      error_message: null,
    });
  }

  async listCaptionTemplates(brandId: string): Promise<Array<{ id: string; label: string; body: string; custom: boolean }>> {
    await init();
    const rows = await query<any[]>(
      `SELECT id, label, body FROM instagram_caption_templates WHERE brand_id = ? ORDER BY created_at DESC LIMIT 50`,
      [brandId],
    );
    return (rows || []).map((r) => ({
      id: String(r.id),
      label: String(r.label || "Template"),
      body: String(r.body || ""),
      custom: true,
    }));
  }

  async saveCaptionTemplate(brandId: string, data: { label?: string; body: string }): Promise<{ id: string; label: string; body: string; custom: boolean }> {
    await init();
    const id = randomUUID();
    const label = String(data.label || "Meu template").trim() || "Meu template";
    const body = String(data.body || "").trim();
    await insert(
      `INSERT INTO instagram_caption_templates (id, brand_id, label, body) VALUES (?, ?, ?, ?)`,
      [id, brandId, label, body],
    );
    return { id, label, body, custom: true };
  }

  async deleteCaptionTemplate(brandId: string, templateId: string): Promise<boolean> {
    await init();
    const result = await update(
      `DELETE FROM instagram_caption_templates WHERE id = ? AND brand_id = ?`,
      [templateId, brandId],
    );
    return Number((result as any)?.affectedRows ?? 1) > 0;
  }

  private parseJsonArray<T>(raw: unknown, fallback: T[] = []): T[] {
    if (!raw) return fallback;
    if (Array.isArray(raw)) return raw as T[];
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed as T[] : fallback;
    } catch {
      return fallback;
    }
  }

  async getAiSettings(brandId: string): Promise<Record<string, unknown>> {
    await init();
    const row = await queryOne<any>(
      `SELECT * FROM instagram_ai_settings WHERE brand_id = ?`,
      [brandId],
    );
    if (!row) {
      const profile = await this.getProfile(brandId);
      return {
        brand_name: profile?.name || "",
        persona: profile?.biography || "",
        tone: "caloroso e direto",
        max_chars: 500,
        guidelines: "",
        faq: [],
        rules: [],
        auto_reply_dm: false,
        auto_reply_comments: false,
        notify_whatsapp: false,
        notify_phone: "",
      };
    }
    return {
      brand_name: row.brand_name || "",
      persona: row.persona || "",
      tone: row.tone || "",
      max_chars: Number(row.max_chars || 500),
      guidelines: row.guidelines || "",
      faq: this.parseJsonArray<{ q: string; a: string }>(row.faq_json),
      rules: this.parseJsonArray<string>(row.rules_json).map(String),
      auto_reply_dm: Boolean(row.auto_reply_dm),
      auto_reply_comments: Boolean(row.auto_reply_comments),
      notify_whatsapp: Boolean(row.notify_whatsapp),
      notify_phone: String(row.notify_phone || ""),
    };
  }

  async saveAiSettings(brandId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    await init();
    const existing = await queryOne<any>(`SELECT id FROM instagram_ai_settings WHERE brand_id = ?`, [brandId]);
    const faq = this.parseJsonArray<{ q: string; a: string }>(data.faq, []);
    const rules = this.parseJsonArray<string>(data.rules, []).map(String);
    const payload = {
      brand_name: String(data.brand_name || ""),
      persona: String(data.persona || ""),
      tone: String(data.tone || ""),
      max_chars: Math.max(100, Math.min(2000, Number(data.max_chars || 500))),
      guidelines: String(data.guidelines || ""),
      faq_json: JSON.stringify(faq),
      rules_json: JSON.stringify(rules),
      auto_reply_dm: Boolean(data.auto_reply_dm),
      auto_reply_comments: Boolean(data.auto_reply_comments),
      notify_whatsapp: Boolean(data.notify_whatsapp),
      notify_phone: String(data.notify_phone || "").replace(/\D/g, ""),
    };

    if (existing?.id) {
      await update(
        `UPDATE instagram_ai_settings SET brand_name=?, persona=?, tone=?, max_chars=?, guidelines=?, faq_json=?, rules_json=?, auto_reply_dm=?, auto_reply_comments=?, notify_whatsapp=?, notify_phone=?, updated_at=NOW() WHERE brand_id=?`,
        [
          payload.brand_name, payload.persona, payload.tone, payload.max_chars, payload.guidelines,
          payload.faq_json, payload.rules_json, payload.auto_reply_dm, payload.auto_reply_comments,
          payload.notify_whatsapp, payload.notify_phone, brandId,
        ],
      );
    } else {
      await insert(
        `INSERT INTO instagram_ai_settings (id, brand_id, brand_name, persona, tone, max_chars, guidelines, faq_json, rules_json, auto_reply_dm, auto_reply_comments, notify_whatsapp, notify_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(), brandId, payload.brand_name, payload.persona, payload.tone, payload.max_chars,
          payload.guidelines, payload.faq_json, payload.rules_json, payload.auto_reply_dm, payload.auto_reply_comments,
          payload.notify_whatsapp, payload.notify_phone,
        ],
      );
    }

    const conn = await this.getConnection(brandId);
    if (conn?.user_id) {
      await this.syncAiAutomations(brandId, conn.user_id, payload.auto_reply_dm, payload.auto_reply_comments);
    }

    return this.getAiSettings(brandId);
  }

  async syncAiAutomations(
    brandId: string,
    userId: string,
    autoReplyDm: boolean,
    autoReplyComments: boolean,
  ): Promise<void> {
    try {
      const { brandAutomationsService } = await import("./brandAutomations");
      if (autoReplyDm) {
        await brandAutomationsService.activateSlug(userId, brandId, "ig-webhook-dm-reply");
        await this.subscribeWebhooks(brandId);
      }
      if (autoReplyComments) {
        await brandAutomationsService.activateSlug(userId, brandId, "ig-webhook-comment-keyword");
        await this.subscribeWebhooks(brandId);
      }
    } catch (err: any) {
      logger.warn(`[Instagram] syncAiAutomations: ${err.message}`);
    }
  }

  matchFaqAnswer(settings: Record<string, unknown>, message: string): string | null {
    const faq = this.parseJsonArray<{ q: string; a: string }>(settings.faq, []);
    const hay = String(message || "").toLowerCase();
    for (const item of faq) {
      const q = String(item.q || "").trim().toLowerCase();
      const a = String(item.a || "").trim();
      if (!q || !a) continue;
      if (hay.includes(q) || q.split(/\s+/).filter((w) => w.length > 3).some((w) => hay.includes(w))) {
        return a;
      }
    }
    return null;
  }

  async getAiProductionStatus(brandId: string): Promise<Record<string, unknown>> {
    await init();
    const settings = await this.getAiSettings(brandId);
    const conn = await this.getConnection(brandId);
    const rows = await query<any[]>(
      `SELECT catalog_slug, status FROM brand_automations WHERE brand_id = ? AND catalog_slug IN ('ig-webhook-dm-reply', 'ig-webhook-comment-keyword')`,
      [brandId],
    );
    const automations = Object.fromEntries((rows || []).map((r) => [r.catalog_slug, r.status]));
    const lastEvent = await queryOne<any>(
      `SELECT event_type, processed_at, dispatch_result FROM instagram_webhook_events WHERE brand_id = ? ORDER BY processed_at DESC LIMIT 1`,
      [brandId],
    );
    return {
      connected: Boolean(conn?.access_token),
      username: conn?.username || null,
      auto_reply_dm: settings.auto_reply_dm,
      auto_reply_comments: settings.auto_reply_comments,
      dm_automation_status: automations["ig-webhook-dm-reply"] || "inactive",
      comment_automation_status: automations["ig-webhook-comment-keyword"] || "inactive",
      last_webhook_at: lastEvent?.processed_at || null,
      last_webhook_type: lastEvent?.event_type || null,
      notify_whatsapp: settings.notify_whatsapp,
      notify_phone: settings.notify_phone,
    };
  }

  async recordQueueAlert(brandId: string, postId: string, message: string): Promise<void> {
    await init();
    const id = randomUUID();
    let delivered = false;
    let channel = "in_app";

    const settings = await this.getAiSettings(brandId);
    const conn = await this.getConnection(brandId);
    const post = await queryOne<InstagramPost>(`SELECT caption, scheduled_at FROM instagram_posts WHERE id = ?`, [postId]);
    const snippet = String(post?.caption || "Post").slice(0, 60);
    const when = post?.scheduled_at
      ? new Date(post.scheduled_at).toLocaleString("pt-BR")
      : "agora";

    if (settings.notify_whatsapp && settings.notify_phone && conn?.user_id && this.whatsappNotifier) {
      try {
        const waMsg = `⚠️ Instagram: falha ao publicar post agendado (${when}).\n"${snippet}"\nMotivo: ${message.slice(0, 200)}`;
        const sent = await this.whatsappNotifier(conn.user_id, String(settings.notify_phone), waMsg);
        if (sent) {
          delivered = true;
          channel = "whatsapp";
        }
      } catch (err: any) {
        logger.warn(`[Instagram] notify whatsapp failed: ${err.message}`);
      }
    }

    await insert(
      `INSERT INTO instagram_queue_alert_log (id, brand_id, post_id, alert_type, message, channel, delivered) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, brandId, postId, "publish_failed", message, channel, delivered],
    );
  }

  async listQueueAlertHistory(brandId: string, limit = 20): Promise<any[]> {
    await init();
    const rows = await query<any[]>(
      `SELECT a.*, p.caption, p.status as post_status
       FROM instagram_queue_alert_log a
       LEFT JOIN instagram_posts p ON p.id = a.post_id
       WHERE a.brand_id = ?
       ORDER BY a.created_at DESC LIMIT ?`,
      [brandId, limit],
    );
    return rows || [];
  }

  async bulkPostsAction(
    brandId: string,
    action: "delete" | "draft" | "publish" | "schedule",
    ids: string[],
    scheduledAt?: string,
  ): Promise<{ ok: number; failed: number; results: Array<{ id: string; ok: boolean; error?: string }> }> {
    const unique = [...new Set(ids.map(String))].filter(Boolean).slice(0, 50);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let ok = 0;
    let failed = 0;

    for (const id of unique) {
      try {
        const post = await this.getPost(brandId, id);
        if (!post) {
          results.push({ id, ok: false, error: "nao encontrado" });
          failed += 1;
          continue;
        }
        if (action === "delete") {
          await this.deletePost(id);
          results.push({ id, ok: true });
          ok += 1;
        } else if (action === "draft") {
          await this.updatePost(id, { status: "draft", scheduled_at: undefined, error_message: undefined });
          results.push({ id, ok: true });
          ok += 1;
        } else if (action === "schedule") {
          if (!scheduledAt) throw new Error("scheduled_at obrigatorio");
          await this.updatePost(id, { status: "scheduled", scheduled_at: scheduledAt, error_message: undefined });
          results.push({ id, ok: true });
          ok += 1;
        } else if (action === "publish") {
          const pub = await this.publishPost(brandId, id);
          if (pub.ok) {
            results.push({ id, ok: true });
            ok += 1;
          } else {
            results.push({ id, ok: false, error: pub.message });
            failed += 1;
          }
        }
      } catch (err: any) {
        results.push({ id, ok: false, error: err.message });
        failed += 1;
      }
    }
    return { ok, failed, results };
  }

  async seedAiSettings(brandId: string, userId: string): Promise<Record<string, unknown>> {
    const profile = await this.getProfile(brandId);
    const current = await this.getAiSettings(brandId);

    let businessContext = "";
    try {
      const { AIAgentProfileService } = await import("./aiAgentProfile");
      const agentSvc = new AIAgentProfileService();
      const agent = await agentSvc.getByUserId(userId, brandId);
      businessContext = String(agent?.business_context || agent?.training_notes || "").trim();
    } catch {}

    const guidelines = [
      businessContext ? `Contexto do negócio: ${businessContext}` : "",
      profile?.website ? `Site: ${profile.website}` : "",
    ].filter(Boolean).join("\n");

    return this.saveAiSettings(brandId, {
      ...current,
      brand_name: profile?.name || current.brand_name,
      persona: profile?.biography || current.persona,
      guidelines: guidelines || current.guidelines,
    });
  }

  buildAiReplyPrompt(settings: Record<string, unknown>, message: string): string {
    const faq = this.parseJsonArray<{ q: string; a: string }>(settings.faq, []);
    const rules = this.parseJsonArray<string>(settings.rules, []).map(String);
    const faqBlock = faq.length
      ? faq.map((f) => `P: ${f.q}\nR: ${f.a}`).join("\n\n")
      : "(nenhuma FAQ cadastrada)";

    return [
      "Você é o atendente virtual da marca no Instagram Direct.",
      `Marca: ${settings.brand_name || "marca"}`,
      `Persona: ${settings.persona || "atendente prestativo"}`,
      `Tom de voz: ${settings.tone || "amigável"}`,
      `Máximo de caracteres: ${settings.max_chars || 500}`,
      settings.guidelines ? `Diretrizes:\n${settings.guidelines}` : "",
      rules.length ? `Regras:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
      `FAQ:\n${faqBlock}`,
      "",
      `Mensagem do cliente: ${message}`,
      "",
      "Responda em português do Brasil, de forma natural para Instagram DM. Não use markdown.",
    ].filter(Boolean).join("\n\n");
  }

  async getPostingSuggestions(brandId: string): Promise<{
    best_hour: number;
    best_minute: number;
    best_label: string;
    heatmap: Array<{ hour: number; score: number; samples: number }>;
    source: "media_history" | "default";
  }> {
    const media = await this.fetchMedia(brandId, 50);
    const hourScores = new Array(24).fill(0);
    const hourCounts = new Array(24).fill(0);

    for (const item of media || []) {
      if (!item.timestamp) continue;
      const h = new Date(item.timestamp).getHours();
      const engagement = Number(item.like_count || 0) + Number(item.comments_count || 0) * 2;
      hourScores[h] += engagement;
      hourCounts[h]++;
    }

    const heatmap = hourScores.map((score, hour) => ({
      hour,
      score: hourCounts[hour] > 0 ? Math.round((score / hourCounts[hour]) * 10) / 10 : 0,
      samples: hourCounts[hour],
    }));

    const ranked = [...heatmap].filter((h) => h.samples > 0).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const defaultHour = 18;
    const bestHour = best?.hour ?? defaultHour;

    return {
      best_hour: bestHour,
      best_minute: 0,
      best_label: `${String(bestHour).padStart(2, "0")}:00`,
      heatmap,
      source: best ? "media_history" : "default",
    };
  }

  async createPost(brandId: string, data: Partial<InstagramPost>): Promise<InstagramPost> {
    await init();
    const id = randomUUID();
    const mediaType = data.media_type || "IMAGE";
    const mediaItems = normalizeMediaItemsInput(mediaType, data.media_items, data.media_url);
    const post: InstagramPost = {
      id,
      brand_id: brandId,
      media_type: mediaType,
      media_url: mediaItems[0]?.url || data.media_url,
      media_items: mediaItems,
      thumbnail_url: data.thumbnail_url,
      caption: data.caption,
      status: data.status || "draft",
      scheduled_at: data.scheduled_at,
    };

    await insert(
      `INSERT INTO instagram_posts (id, brand_id, media_type, media_url, thumbnail_url, caption, status, scheduled_at, media_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        brandId,
        post.media_type,
        post.media_url || null,
        post.thumbnail_url || null,
        post.caption || null,
        post.status,
        post.scheduled_at || null,
        mediaItems.length ? JSON.stringify(mediaItems) : null,
      ]
    );
    return post;
  }

  async updatePost(postId: string, data: Partial<InstagramPost>): Promise<void> {
    await init();
    const sets: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (key === "id" || key === "brand_id") continue;
      if (key === "media_items") {
        sets.push(`${key} = ?`);
        params.push(Array.isArray(val) ? JSON.stringify(val) : val ?? null);
        continue;
      }
      sets.push(`${key} = ?`);
      params.push(val === undefined ? null : val);
    }
    if (sets.length === 0) return;
    sets.push(`updated_at = NOW()`);
    params.push(postId);
    await update(`UPDATE instagram_posts SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  private async failPublish(
    postId: string,
    message: string,
    brandId?: string
  ): Promise<{ ok: false; message: string; post_id: string }> {
    if (!brandId) {
      const row = await queryOne<{ brand_id: string }>(`SELECT brand_id FROM instagram_posts WHERE id = ?`, [postId]);
      brandId = row?.brand_id;
    }
    await this.updatePost(postId, { status: "failed", error_message: message });
    if (brandId) {
      void this.recordQueueAlert(brandId, postId, message).catch(() => undefined);
    }
    return { ok: false, message, post_id: postId };
  }

  async deletePost(postId: string): Promise<void> {
    await init();
    await update(`DELETE FROM instagram_posts WHERE id = ?`, [postId]);
  }

  async publishPost(
    brandId: string,
    postId: string
  ): Promise<{ ok: boolean; message: string; ig_media_id?: string; permalink?: string; post_id?: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, message: "Instagram nao conectado" };

    const rawPost = await queryOne<InstagramPost>(`SELECT * FROM instagram_posts WHERE id = ? AND brand_id = ?`, [postId, brandId]);
    if (!rawPost) return { ok: false, message: "Post nao encontrado" };
    const post = normalizeInstagramPost(rawPost);
    const mediaItems = normalizeMediaItemsInput(post.media_type, post.media_items, post.media_url);
    if (!mediaItems.length) return { ok: false, message: "Post sem midia" };

    try {
      await this.updatePost(postId, { status: "publishing" });

      let containerId: string | undefined;

      if (post.media_type === "CAROUSEL_ALBUM") {
        if (mediaItems.length < 2 || mediaItems.length > 10) {
          return this.failPublish(postId, "Carrossel requer entre 2 e 10 midias");
        }

        const childIds: string[] = [];
        for (let i = 0; i < mediaItems.length; i++) {
          const item = mediaItems[i];
          const childPayload: Record<string, unknown> = { is_carousel_item: true };
          if (item.type === "video") {
            childPayload.media_type = "VIDEO";
            childPayload.video_url = resolveInstagramVideoUrl(item.url);
          } else {
            childPayload.image_url = resolveInstagramImageUrl(item.url);
          }

          logger.info(
            `[Instagram] Carousel child ${i + 1}/${mediaItems.length} type=${item.type} url=${String(childPayload.image_url || childPayload.video_url)}`
          );

          const child = await createIgMediaContainer(conn.access_token, childPayload);
          if (!child.id) {
            return this.failPublish(postId, child.error || `Falha ao criar item ${i + 1} do carrossel`);
          }

          const childReady = await waitForMediaContainer(conn.access_token, child.id);
          if (!childReady.ok) {
            return this.failPublish(postId, childReady.error || `Item ${i + 1} do carrossel nao ficou pronto`);
          }
          childIds.push(child.id);
        }

        const parent = await createIgMediaContainer(conn.access_token, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: post.caption || "",
        });
        containerId = parent.id;
        if (!containerId) {
          return this.failPublish(postId, parent.error || "Falha ao criar carrossel");
        }

        const parentReady = await waitForMediaContainer(conn.access_token, containerId);
        if (!parentReady.ok) {
          return this.failPublish(postId, parentReady.error || "Carrossel nao ficou pronto para publicar");
        }
      } else if (post.media_type === "REELS") {
        const videoUrl = resolveInstagramVideoUrl(mediaItems[0].url);
        const created = await createIgMediaContainer(conn.access_token, {
          media_type: "REELS",
          video_url: videoUrl,
          caption: post.caption || "",
          share_to_feed: true,
        });
        containerId = created.id;
        if (!containerId) {
          return this.failPublish(postId, created.error || "Falha ao criar Reels");
        }
        const ready = await waitForMediaContainer(conn.access_token, containerId, 30);
        if (!ready.ok) {
          return this.failPublish(postId, ready.error || "Reels ainda em processamento ou com erro");
        }
      } else if (post.media_type === "VIDEO") {
        const videoUrl = resolveInstagramVideoUrl(mediaItems[0].url);
        const created = await createIgMediaContainer(conn.access_token, {
          media_type: "VIDEO",
          video_url: videoUrl,
          caption: post.caption || "",
        });
        containerId = created.id;
        if (!containerId) {
          return this.failPublish(postId, created.error || "Falha ao criar video no feed");
        }
        const ready = await waitForMediaContainer(conn.access_token, containerId, 30);
        if (!ready.ok) {
          return this.failPublish(postId, ready.error || "Video ainda em processamento ou com erro");
        }
      } else if (post.media_type === "STORIES") {
        const imageUrl = resolveInstagramImageUrl(mediaItems[0].url);
        const created = await createIgMediaContainer(conn.access_token, {
          media_type: "STORIES",
          image_url: imageUrl,
        });
        containerId = created.id;
        if (!containerId) {
          return this.failPublish(postId, created.error || "Falha ao criar Story");
        }
        const ready = await waitForMediaContainer(conn.access_token, containerId, 15);
        if (!ready.ok) {
          return this.failPublish(postId, ready.error || "Story ainda em processamento");
        }
      } else {
        const imageUrl = resolveInstagramImageUrl(mediaItems[0].url);
        logger.info(`[Instagram] Publishing image postId=${postId} url=${imageUrl}`);
        const created = await createIgMediaContainer(conn.access_token, {
          image_url: imageUrl,
          caption: post.caption || "",
        });
        containerId = created.id;
        if (!containerId) {
          const hint = created.error?.includes("photo or video")
            ? " O Instagram nao conseguiu baixar a imagem. Verifique se a URL publica esta acessivel."
            : "";
          return this.failPublish(postId, `${created.error || "Falha ao criar container de imagem"}${hint}`);
        }
        const ready = await waitForMediaContainer(conn.access_token, containerId, 15);
        if (!ready.ok) {
          return this.failPublish(postId, ready.error || "Imagem ainda em processamento");
        }
      }

      if (!containerId) {
        return this.failPublish(postId, "Falha ao criar container de midia");
      }

      const published = await publishIgContainer(conn.access_token, containerId);
      if (published.ok && published.igMediaId) {
        const permalink = await fetchIgMediaPermalink(conn.access_token, published.igMediaId);
        const publishedAt = new Date().toISOString();
        await this.updatePost(postId, {
          status: "published",
          ig_media_id: published.igMediaId,
          permalink: permalink || undefined,
          published_at: publishedAt,
          error_message: undefined,
          scheduled_at: undefined,
        });
        await markGalleryPublishedFromInstagramPost(conn, postId, mediaItems, publishedAt);
        return {
          ok: true,
          message: "Publicado com sucesso",
          ig_media_id: published.igMediaId,
          permalink,
          post_id: postId,
        };
      }

      return this.failPublish(postId, published.error || "Falha ao publicar");
    } catch (err: any) {
      return this.failPublish(postId, err.message || "Erro inesperado ao publicar");
    }
  }

  /**
   * Publish an image directly to Instagram (feed post or story).
   * Creates the draft, publishes, and returns the result in one call.
   */
  async publishImageDirect(brandId: string, input: {
    imageUrl: string;
    caption?: string;
    mediaType?: "IMAGE" | "STORIES";
    locationId?: string;
    altText?: string;
    userTags?: { username: string; x: number; y: number }[];
  }): Promise<{ ok: boolean; message: string; postId?: string; igMediaId?: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, message: "Instagram nao conectado. Conecte sua conta na aba Instagram." };

    const mediaType = input.mediaType || "IMAGE";
    const isStory = mediaType === "STORIES";
    const resolvedImageUrl = resolveInstagramImageUrl(input.imageUrl);

    // Save as draft first
    const post = await this.createPost(brandId, {
      media_type: isStory ? "IMAGE" : "IMAGE",
      media_url: input.imageUrl,
      caption: isStory ? undefined : input.caption,
      status: "publishing",
    });

    try {
      // Build container payload
      const containerPayload: Record<string, any> = {
        access_token: conn.access_token,
      };

      if (isStory) {
        containerPayload.media_type = "STORIES";
        containerPayload.image_url = resolvedImageUrl;
        if (input.userTags?.length) {
          containerPayload.user_tags = input.userTags;
        }
      } else {
        containerPayload.image_url = resolvedImageUrl;
        containerPayload.caption = input.caption || "";
        if (input.locationId) containerPayload.location_id = input.locationId;
        if (input.altText) containerPayload.alt_text = input.altText;
        if (input.userTags?.length) {
          containerPayload.user_tags = input.userTags;
        }
      }

      logger.info(`[Instagram] Creating container for ${mediaType}: ${JSON.stringify({ ...containerPayload, access_token: "***" })}`);

      const containerResp = await fetch(`${IG_GRAPH_URL}/me/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerPayload),
      });
      const containerData: any = await containerResp.json();

      if (!containerData.id) {
        await this.updatePost(post.id, { status: "failed" });
        const errMsg = containerData?.error?.message || "Falha ao criar container de midia no Instagram";
        logger.error(`[Instagram] Container creation failed: ${errMsg}`);
        return { ok: false, message: errMsg, postId: post.id };
      }

      const ready = await waitForMediaContainer(conn.access_token, containerData.id, 15);
      if (!ready.ok) {
        await this.updatePost(post.id, { status: "failed" });
        return { ok: false, message: ready.error || "Imagem ainda em processamento", postId: post.id };
      }

      const published = await publishIgContainer(conn.access_token, containerData.id);
      if (published.ok && published.igMediaId) {
        const publishedAt = new Date().toISOString();
        await this.updatePost(post.id, {
          status: "published",
          ig_media_id: published.igMediaId,
          published_at: publishedAt,
        });
        await markGalleryPublishedFromInstagramPost(
          conn,
          post.id,
          normalizeMediaItemsInput("IMAGE", undefined, input.imageUrl),
          publishedAt
        );
        logger.info(`[Instagram] Published successfully: ${published.igMediaId}`);
        return {
          ok: true,
          message: isStory ? "Story publicado com sucesso" : "Post publicado com sucesso",
          postId: post.id,
          igMediaId: published.igMediaId,
        };
      }

      await this.updatePost(post.id, { status: "failed" });
      const errMsg = published.error || "Falha ao publicar no Instagram";
      logger.error(`[Instagram] Publish failed: ${errMsg}`);
      return { ok: false, message: errMsg, postId: post.id };
    } catch (err: any) {
      await this.updatePost(post.id, { status: "failed" });
      logger.error(`[Instagram] publishImageDirect error: ${err.message}`);
      return { ok: false, message: err.message, postId: post.id };
    }
  }

  /**
   * Search for locations using Facebook Pages Search API.
   */
  async searchLocations(brandId: string, searchQuery: string): Promise<{ id: string; name: string; address?: string }[]> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return [];

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        fields: "id,name,location",
        type: "place",
        limit: "10",
        access_token: conn.access_token,
      });
      // Location search uses the Facebook Graph API (not Instagram)
      const resp = await fetch(`https://graph.facebook.com/v21.0/pages/search?${params}`);
      if (!resp.ok) {
        const err: any = await resp.json().catch(() => ({}));
        logger.warn(`[Instagram] Location search failed: ${err?.error?.message || resp.status}`);
        return [];
      }
      const data: any = await resp.json();
      return (data.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        address: p.location
          ? [p.location.street, p.location.city, p.location.state, p.location.country].filter(Boolean).join(", ")
          : undefined,
      }));
    } catch (err: any) {
      logger.error(`[Instagram] Location search error: ${err.message}`);
      return [];
    }
  }

  private async graphGet(path: string, token: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    try {
      const resp = await fetch(`${IG_GRAPH_URL}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
      }
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async listLocalMessageThreads(brandId: string, limit = 50): Promise<InstagramConversationThread[]> {
    await init();
    const rows = await query<InstagramMessageRow[]>(
      `SELECT * FROM instagram_messages
       WHERE brand_id = ?
       ORDER BY created_at DESC
       LIMIT 500`,
      [brandId],
    );
    const bySender = new Map<string, InstagramMessageRow[]>();
    for (const row of rows || []) {
      const list = bySender.get(row.sender_id) || [];
      list.push(row);
      bySender.set(row.sender_id, list);
    }

    const threads: InstagramConversationThread[] = [];
    for (const [senderId, msgs] of bySender.entries()) {
      const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const last = sorted[sorted.length - 1];
      threads.push({
        id: `local:${senderId}`,
        sender_id: senderId,
        updated_time: last?.created_at,
        last_message: last?.message_text || "",
        last_message_at: last?.created_at,
        message_count: sorted.length,
        source: "local",
        messages: sorted.map((m) => ({
          id: m.message_id || m.id,
          message: m.message_text || "",
          from_id: m.direction === "incoming" ? m.sender_id : undefined,
          direction: m.direction,
          created_time: m.created_at,
        })),
      });
    }

    threads.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
    return threads.slice(0, limit);
  }

  private async fetchApiConversationThread(
    conversationId: string,
    token: string,
    igUserId: string,
  ): Promise<InstagramConversationThread | null> {
    const detail = await this.graphGet(
      `/${conversationId}?fields=messages.limit(20){id,message,from,created_time}`,
      token,
    );
    if (!detail.ok || !detail.data) return null;

    const rawMessages = detail.data?.messages?.data || [];
    const messages = rawMessages
      .map((m: any) => {
        const fromId = String(m.from?.id || "");
        const direction: "incoming" | "outgoing" = fromId && fromId === igUserId ? "outgoing" : "incoming";
        return {
          id: String(m.id || ""),
          message: String(m.message || ""),
          from_id: fromId || undefined,
          from_username: m.from?.username ? String(m.from.username) : undefined,
          direction,
          created_time: String(m.created_time || ""),
        };
      })
      .filter((m: { id: string }) => m.id)
      .sort((a: { created_time: string }, b: { created_time: string }) =>
        new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
      );

    const peer = messages.find((m: { direction: string }) => m.direction === "incoming");
    const last = messages[messages.length - 1];
    const senderId = peer?.from_id || `unknown:${conversationId}`;

    return {
      id: conversationId,
      sender_id: senderId,
      username: peer?.from_username,
      updated_time: detail.data?.updated_time || last?.created_time,
      last_message: last?.message || "",
      last_message_at: last?.created_time,
      message_count: messages.length,
      source: "api",
      messages,
    };
  }

  private async fetchApiConversations(brandId: string, conn: InstagramConnection): Promise<{
    threads: InstagramConversationThread[];
    error?: string;
  }> {
    const igUserId = String(conn.ig_user_id || conn.account_id || "");
    const list = await this.graphGet("/me/conversations?platform=instagram&limit=25", conn.access_token);
    if (!list.ok) {
      logger.warn(`[Instagram] conversations list: ${list.error}`);
      return { threads: [], error: list.error };
    }

    const items: Array<{ id: string; updated_time?: string }> = list.data?.data || [];
    const threads: InstagramConversationThread[] = [];

    for (const item of items.slice(0, 20)) {
      if (!item?.id) continue;
      const thread = await this.fetchApiConversationThread(item.id, conn.access_token, igUserId);
      if (thread) {
        thread.updated_time = thread.updated_time || item.updated_time;
        threads.push(thread);
      }
    }

    threads.sort((a, b) => new Date(b.last_message_at || b.updated_time || 0).getTime()
      - new Date(a.last_message_at || a.updated_time || 0).getTime());
    return { threads };
  }

  private mergeConversationThreads(
    apiThreads: InstagramConversationThread[],
    localThreads: InstagramConversationThread[],
  ): InstagramConversationThread[] {
    const merged = new Map<string, InstagramConversationThread>();

    for (const thread of apiThreads) {
      merged.set(thread.sender_id, { ...thread, source: "api" });
    }

    for (const local of localThreads) {
      const existing = merged.get(local.sender_id);
      if (!existing) {
        merged.set(local.sender_id, local);
        continue;
      }

      const seen = new Set(existing.messages.map((m) => m.id));
      const extra = local.messages.filter((m) => !seen.has(m.id));
      const messages = [...existing.messages, ...extra].sort(
        (a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
      );
      const last = messages[messages.length - 1];
      merged.set(local.sender_id, {
        ...existing,
        source: "merged",
        message_count: messages.length,
        messages,
        last_message: last?.message || existing.last_message,
        last_message_at: last?.created_time || existing.last_message_at,
        updated_time: last?.created_time || existing.updated_time,
      });
    }

    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.last_message_at || b.updated_time || 0).getTime()
        - new Date(a.last_message_at || a.updated_time || 0).getTime(),
    );
  }

  async getConversations(brandId: string): Promise<InstagramConversationsResult> {
    const conn = await this.getConnection(brandId);
    const localThreads = await this.listLocalMessageThreads(brandId);

    if (!conn?.access_token) {
      return {
        conversations: localThreads,
        meta: { api_count: 0, local_count: localThreads.length, api_error: "Instagram nao conectado" },
      };
    }

    const { threads: apiThreads, error } = await this.fetchApiConversations(brandId, conn);
    const conversations = this.mergeConversationThreads(apiThreads, localThreads);

    return {
      conversations,
      meta: {
        api_count: apiThreads.length,
        local_count: localThreads.length,
        api_error: error,
      },
    };
  }

  async getConversationMessages(
    brandId: string,
    threadId: string,
  ): Promise<InstagramConversationThread | null> {
    const result = await this.getConversations(brandId);
    const found = result.conversations.find((c) => c.id === threadId);
    if (found) return found;

    if (threadId.startsWith("local:")) {
      const senderId = threadId.slice("local:".length);
      const local = result.conversations.find((c) => c.sender_id === senderId);
      return local || null;
    }

    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return null;
    const igUserId = String(conn.ig_user_id || conn.account_id || "");
    return this.fetchApiConversationThread(threadId, conn.access_token, igUserId);
  }

  async getConnectionByIgUserId(igUserId: string): Promise<InstagramConnection | null> {
    await init();
    return queryOne<InstagramConnection>(
      `SELECT * FROM instagram_connections WHERE ig_user_id = ? OR account_id = ? LIMIT 1`,
      [String(igUserId), String(igUserId)],
    );
  }

  async storeIncomingMessage(input: {
    connectionId: string;
    brandId: string;
    senderId: string;
    messageId: string;
    messageText: string;
    timestamp?: string;
  }): Promise<void> {
    await this.storeMessage({
      ...input,
      direction: "incoming",
    });
  }

  async storeOutgoingMessage(input: {
    connectionId: string;
    brandId: string;
    recipientId: string;
    messageId: string;
    messageText: string;
    timestamp?: string;
  }): Promise<void> {
    await this.storeMessage({
      connectionId: input.connectionId,
      brandId: input.brandId,
      senderId: input.recipientId,
      messageId: input.messageId,
      messageText: input.messageText,
      timestamp: input.timestamp,
      direction: "outgoing",
    });
  }

  private async storeMessage(input: {
    connectionId: string;
    brandId: string;
    senderId: string;
    messageId: string;
    messageText: string;
    timestamp?: string;
    direction: "incoming" | "outgoing";
  }): Promise<void> {
    await init();
    const id = randomUUID();
    await insert(
      `INSERT INTO instagram_messages (id, connection_id, brand_id, sender_id, message_id, message_text, direction, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE message_text = VALUES(message_text), direction = VALUES(direction)`,
      [
        id,
        input.connectionId,
        input.brandId,
        input.senderId,
        input.messageId,
        input.messageText,
        input.direction,
        input.timestamp || new Date().toISOString(),
      ],
    );
  }

  async recordWebhookEvent(input: {
    brandId?: string;
    igUserId: string;
    eventType: string;
    field?: string;
    triggeredBy?: string;
    dedupKey: string;
    payload: Record<string, any>;
    dispatchResult?: Record<string, any>;
  }): Promise<boolean> {
    await init();
    try {
      await insert(
        `INSERT INTO instagram_webhook_events
           (id, brand_id, ig_user_id, event_type, field, triggered_by, dedup_key, payload, dispatch_result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.brandId || null,
          input.igUserId,
          input.eventType,
          input.field || null,
          input.triggeredBy || null,
          input.dedupKey,
          JSON.stringify(input.payload),
          input.dispatchResult ? JSON.stringify(input.dispatchResult) : null,
        ],
      );
      return true;
    } catch (err: any) {
      if (/duplicate|unique|uq_ig_webhook_dedup/i.test(String(err?.message || ""))) {
        return false;
      }
      logger.warn(`[Instagram] recordWebhookEvent: ${err.message}`);
      return false;
    }
  }

  async sendDm(
    brandId: string,
    recipientId: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, error: "Instagram nao conectado" };

    const igUserId = conn.ig_user_id || conn.account_id;
    if (!igUserId) return { ok: false, error: "IG user id ausente na conexao" };

    try {
      const resp = await fetch(`${IG_GRAPH_URL}/${igUserId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: text.slice(0, 1000) },
          access_token: conn.access_token,
        }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
      }
      const messageId = data?.message_id || data?.id;
      if (messageId) {
        await this.storeOutgoingMessage({
          connectionId: conn.id,
          brandId,
          recipientId,
          messageId: String(messageId),
          messageText: text,
        });
      }
      return { ok: true, messageId };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async replyToComment(
    brandId: string,
    commentId: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string; replyId?: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, error: "Instagram nao conectado" };

    try {
      const params = new URLSearchParams({
        message: text.slice(0, 2200),
        access_token: conn.access_token,
      });
      const resp = await fetch(`${IG_GRAPH_URL}/${commentId}/replies?${params}`, { method: "POST" });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
      }
      return { ok: true, replyId: data?.id };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async listWebhookEvents(brandId: string, limit = 30): Promise<any[]> {
    await init();
    const rows = await query<any[]>(
      `SELECT id, event_type, field, triggered_by, dedup_key, payload, dispatch_result, processed_at
       FROM instagram_webhook_events
       WHERE brand_id = ?
       ORDER BY processed_at DESC
       LIMIT ?`,
      [brandId, limit],
    );
    return rows || [];
  }

  async subscribeWebhooks(brandId: string): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.getConnection(brandId);
    if (!conn?.access_token) return { ok: false, error: "Instagram nao conectado" };

    const igUserId = conn.ig_user_id || conn.account_id;
    if (!igUserId) return { ok: false, error: "IG user id ausente" };

    try {
      const resp = await fetch(`${IG_GRAPH_URL}/${igUserId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: ["messages", "comments", "mentions", "message_reactions"],
          access_token: conn.access_token,
        }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.success === false) {
        return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

export const instagramService = new InstagramService();
