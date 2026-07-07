import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { query, queryOne, update, insert } from "../config/database";
import { InstanceManager } from "../core/instanceManager";
import { ContextEngineService } from "./contextEngine";
import { GeminiService } from "./gemini";
import { InstanceRotationService, RotationMode } from "./instanceRotation";
import { aiRouter } from "./aiRouter";
import { logger } from "../utils/logger";

// ─── Name enrichment helpers ────────────────────────────────────

const PT_BR_LOWER_WORDS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del", "la", "le"]);
const JUNK_NAME_PATTERNS = [
  /^\d+$/, // only digits
  /^[+\d\s()-]+$/, // phone-like
  /^\.+$/, // only dots
  /^null$/i,
  /^undefined$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^teste?$/i,
  /^user$/i,
  /^contato$/i,
  /^cliente$/i,
  /^lead$/i,
];

function isJunkName(name: string): boolean {
  const t = name.trim();
  if (!t || t.length < 2) return true;
  return JUNK_NAME_PATTERNS.some((rx) => rx.test(t));
}

function normalizeContactName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let name = String(raw).trim();
  if (!name) return null;

  // Strip leading/trailing special chars and excessive whitespace
  name = name.replace(/^[~\-_.*#@!]+|[~\-_.*#@!]+$/g, "").trim();
  name = name.replace(/\s{2,}/g, " ");

  if (isJunkName(name)) return null;

  // titleCase with PT-BR preposition support
  name = name
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && PT_BR_LOWER_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  // First word always capitalized (safety)
  name = name.replace(/^./, (c) => c.toUpperCase());

  // If result is still junk after normalization, discard
  if (isJunkName(name)) return null;

  return name;
}

// ─── Types ──────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
export type CampaignLeadStatus =
  | "pending"
  | "validating"
  | "ready"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "skipped"
  | "opted_out";

export type ReplyClassification = "interested" | "neutral" | "negative" | "opt_out";

export type CampaignFilterCriteria = {
  statuses?: string[];
  tagsInclude?: string[];
  tagsExclude?: string[];
  cities?: string[];
  segments?: string[];
  scoreMin?: number;
  scoreMax?: number;
  hasWhatsapp?: boolean;
  sources?: string[];
};

export type CampaignSpeedControl = {
  maxPerMinute: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  dailyLimit: number;
  autoPauseOnBlockRate: number; // percentage 0-100
};

export type CampaignDestinationType = "lead_list" | "group" | "group_sequence";
export type CampaignDestinationTargetType = "group" | "contact" | "channel";

export type CampaignDestinationTarget = {
  jid: string;
  name: string;
  instance_id: string;
  instance_name?: string;
  target_type: CampaignDestinationTargetType;
  last_message_at?: string | null;
};

type CampaignDestinationSettings = {
  type: CampaignDestinationType;
  targetType: CampaignDestinationTargetType;
  targets: CampaignDestinationTarget[];
};

export type CampaignCreateInput = {
  name: string;
  instanceId: string;
  messageTemplate?: string;
  aiPrompt?: string;
  useAI: boolean;
  filter: CampaignFilterCriteria;
  speedControl: CampaignSpeedControl;
  scheduledAt?: string;
  initialStatus?: "draft" | "paused" | "active";
  campaignMode?: "aggressive" | "educational" | "relationship";
  useInstanceRotation?: boolean;
  rotationMode?: RotationMode;
  settings?: Record<string, unknown>;
};

type CampaignFinalActions = {
  nextStatus?: string;
  addTags?: string[];
};

type CampaignActionWindow = {
  enabled?: boolean;
  start?: string;
  end?: string;
};

type CampaignComposerSettings = {
  intentText?: string;
  personalizedPerLead?: boolean;
  useAutoVariations?: boolean;
};

type CampaignSendResult = {
  ok: boolean;
  instanceId?: string;
  error?: string;
};

export type Campaign = {
  id: string;
  user_id: string;
  brand_id: string | null;
  company_id: string | null;
  instance_id: string;
  name: string;
  message_template: string | null;
  ai_prompt: string | null;
  use_ai: boolean;
  filter_json: CampaignFilterCriteria;
  speed_json: CampaignSpeedControl;
  campaign_mode: string;
  settings?: Record<string, unknown>;
  use_instance_rotation?: boolean;
  rotation_mode?: RotationMode;
  target_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  interested_count: number;
  neutral_count: number;
  negative_count: number;
  opted_out_count: number;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignLeadRecord = {
  id: string;
  campaign_id: string;
  lead_id: string;
  phone: string;
  whatsapp_valid: boolean | null;
  whatsapp_jid: string | null;
  message_text: string | null;
  ai_generated: boolean;
  status: CampaignLeadStatus;
  sent_at: string | null;
  replied_at: string | null;
  reply_text: string | null;
  reply_classification: ReplyClassification | null;
  score_delta: number;
  tags_added: string[];
  error_message: string | null;
  attempt_count: number;
  lead_name?: string;
  lead_city?: string;
  lead_category?: string;
};

export type CampaignMetrics = {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  skipped: number;
  interested: number;
  neutral: number;
  negative: number;
  opted_out: number;
  responseRate: number;
  deliveryRate: number;
  interestRate: number;
  lastMessage?: {
    text: string;
    truncated: boolean;
    status: string | null;
    sentAt: string | null;
    eventAt: string | null;
    phone: string | null;
  } | null;
};

// ─── Default speed settings ──────────────────────────────────────

const DEFAULT_SPEED: CampaignSpeedControl = {
  maxPerMinute: 3,
  minIntervalSeconds: 10,
  maxIntervalSeconds: 30,
  dailyLimit: 200,
  autoPauseOnBlockRate: 15,
};

// ─── Helpers ──────────────────────────────────────────────────────

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function buildPhoneCandidates(value: unknown): string[] {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  return Array.from(
    new Set(
      [
        normalized,
        normalized.length > 13 ? normalized.slice(-13) : "",
        normalized.length > 11 ? normalized.slice(-11) : "",
        normalized.length > 10 ? normalized.slice(-10) : "",
        normalized.length > 8 ? normalized.slice(-8) : "",
      ].filter((candidate) => candidate.length >= 8)
    )
  );
}

function buildJidLikePatterns(phoneCandidates: string[]): string[] {
  return Array.from(new Set(phoneCandidates.filter(Boolean).map((candidate) => `${candidate}@%`)));
}

function isTransientInstanceConnectionError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  if (!message) return false;

  return (
    message.includes("instance not connected") ||
    message.includes("instance not found") ||
    message.includes("not initialized") ||
    message.includes("offline") ||
    message.includes("socket closed")
  );
}

function parseJsonSafe(value: unknown): any {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(i => String(i).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(i => String(i).trim()).filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "t" || normalized === "yes";
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return isTruthyFlag(value);
}

function randomDelay(min: number, max: number): number {
  return Math.floor(min * 1000 + Math.random() * (max - min) * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCurrentMinutesForTimeZone(now: Date, timeZone?: string): number {
  if (!timeZone) {
    return now.getHours() * 60 + now.getMinutes();
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).formatToParts(now);

    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
    return Math.max(0, Math.min(1439, hour * 60 + minute));
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDestinationType(value: unknown): CampaignDestinationType {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "group" || raw === "group_sequence") return raw;
  return "lead_list";
}

function normalizeDestinationTargetType(value: unknown): CampaignDestinationTargetType {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "channel") return "channel";
  if (raw === "contact") return "contact";
  return "group";
}

function normalizeJid(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits}@s.whatsapp.net`;
}

function normalizeLeadStatusValue(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    novo: "new",
    new_lead: "new",
    contatado: "contacted",
    respondeu: "replied",
    negociando: "negotiating",
    convertido: "converted",
    perdido: "lost",
    inativo: "inactive",
  };

  return aliases[compact] || compact;
}

function normalizeStatusFilterInput(statuses: unknown): string[] {
  if (!Array.isArray(statuses)) return [];
  const normalized = statuses
    .map((item) => normalizeLeadStatusValue(item))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function normalizeCampaignFilterInput(filter: CampaignFilterCriteria | undefined | null): CampaignFilterCriteria {
  const source = filter || {};
  const normalizedStatuses = normalizeStatusFilterInput(source.statuses);
  return {
    ...source,
    statuses: normalizedStatuses.length ? normalizedStatuses : ["new"],
  };
}

const STATUS_VARIANTS_MAP: Record<string, string[]> = {
  new: ["new", "novo", "new lead", "lead novo", "novo lead"],
  contacted: ["contacted", "contatado", "contatados", "contato iniciado", "em contato"],
  replied: ["replied", "respondeu", "respondido", "engajado"],
  negotiating: ["negotiating", "negociando", "em negociacao", "em negociação"],
  converted: ["converted", "convertido", "cliente", "won", "fechado"],
  lost: ["lost", "perdido", "descartado", "nao interessado", "não interessado"],
  inactive: ["inactive", "inativo"],
};

function expandStatusFilterVariants(statuses: string[]): string[] {
  const result = new Set<string>();

  for (const status of statuses) {
    const canonical = normalizeLeadStatusValue(status);
    const variants = STATUS_VARIANTS_MAP[canonical] || [canonical || String(status || "").trim().toLowerCase()];
    for (const variant of variants) {
      const normalized = String(variant || "").trim().toLowerCase();
      if (normalized) result.add(normalized);
    }
  }

  return [...result];
}

function isInDailyWindow(now: Date, start: string, end: string, timeZone?: string): boolean {
  const [startH, startM] = String(start || "").split(":").map((v) => Number(v || 0));
  const [endH, endM] = String(end || "").split(":").map((v) => Number(v || 0));
  const nowMinutes = getCurrentMinutesForTimeZone(now, timeZone);
  const startMinutes = Math.max(0, Math.min(1439, startH * 60 + startM));
  const endMinutes = Math.max(0, Math.min(1439, endH * 60 + endM));

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

// ─── Service ──────────────────────────────────────────────────────

export class CampaignEngineService {
  private schemaReady = false;
  private activeCampaigns = new Map<string, boolean>();
  private readonly contextEngine = new ContextEngineService();
  private readonly gemini = new GeminiService();

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async indexExists(tableName: string, indexName: string): Promise<boolean> {
    try {
      const row = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM pg_indexes
         WHERE tablename = ? AND indexname = ?`,
        [tableName, indexName]
      );
      return Number(row?.total || 0) > 0;
    } catch {
      try {
        const row = await queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
          [tableName, indexName]
        );
        return Number(row?.total || 0) > 0;
      } catch {
        try {
          const rows = await query<any[]>(`SHOW INDEX FROM ${tableName} WHERE Key_name = ?`, [indexName]);
          return Array.isArray(rows) && rows.length > 0;
        } catch {
          return false;
        }
      }
    }
  }

  private async ensureColumn(tableName: string, columnName: string, definition: string): Promise<void> {
    const exists = await this.columnExists(tableName, columnName);
    if (!exists) {
      try {
        await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      } catch (error: any) {
        const message = String(error?.message || "").toLowerCase();
        if (error?.code === "ER_DUP_FIELDNAME" || message.includes("duplicate column")) {
          return;
        }
        throw error;
      }
    }
  }

  private async ensureIndex(tableName: string, indexName: string, columnName: string): Promise<void> {
    const exists = await this.indexExists(tableName, indexName);
    if (!exists) {
      await query(`CREATE INDEX ${indexName} ON ${tableName} (${columnName})`);
    }
  }

  constructor(
    private readonly instanceManager: InstanceManager,
    private readonly rotationEngine?: InstanceRotationService
  ) {}

  // ─── Schema ────────────────────────────────────────────────────

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS campaign_leads (
        id VARCHAR(36) PRIMARY KEY,
        campaign_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) DEFAULT NULL,
        lead_id VARCHAR(64) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        whatsapp_valid TINYINT(1) DEFAULT NULL,
        whatsapp_jid VARCHAR(120) DEFAULT NULL,
        message_text TEXT,
        ai_generated TINYINT(1) DEFAULT 0,
        status ENUM('pending','validating','ready','sending','sent','delivered','read','replied','failed','skipped','opted_out') DEFAULT 'pending',
        sent_at TIMESTAMP NULL,
        delivered_at TIMESTAMP NULL,
        read_at TIMESTAMP NULL,
        replied_at TIMESTAMP NULL,
        reply_text TEXT,
        reply_classification ENUM('interested','neutral','negative','opt_out') DEFAULT NULL,
        score_delta INT DEFAULT 0,
        tags_added JSON,
        error_message TEXT,
        attempt_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_campaign_lead (campaign_id, lead_id),
        KEY idx_cl_campaign (campaign_id),
        KEY idx_cl_user (user_id),
        KEY idx_cl_brand (brand_id),
        KEY idx_cl_lead (lead_id),
        KEY idx_cl_status (status),
        KEY idx_cl_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureColumn("campaign_history", "use_ai", "TINYINT(1) DEFAULT 0");
    await this.ensureColumn("campaign_history", "filter_json", "JSON");
    await this.ensureColumn("campaign_history", "speed_json", "JSON");
    await this.ensureColumn("campaign_history", "campaign_mode", "VARCHAR(40) DEFAULT 'educational'");
    await this.ensureColumn("campaign_history", "settings", "JSON");
    await this.ensureColumn("campaign_history", "interested_count", "INT DEFAULT 0");
    await this.ensureColumn("campaign_history", "neutral_count", "INT DEFAULT 0");
    await this.ensureColumn("campaign_history", "negative_count", "INT DEFAULT 0");
    await this.ensureColumn("campaign_history", "opted_out_count", "INT DEFAULT 0");
    await this.ensureColumn("campaign_history", "use_instance_rotation", "TINYINT(1) DEFAULT 0");
    await this.ensureColumn("campaign_history", "rotation_mode", "VARCHAR(20) DEFAULT 'balanced'");
    await this.ensureColumn("campaign_history", "brand_id", "VARCHAR(36) DEFAULT NULL");
    await this.ensureColumn("campaign_leads", "brand_id", "VARCHAR(36) DEFAULT NULL");
    await this.ensureIndex("campaign_history", "idx_campaign_history_brand", "brand_id");
    await this.ensureIndex("campaign_leads", "idx_campaign_leads_brand", "brand_id");

    this.schemaReady = true;
  }

  // ─── Customer columns ──────────────────────────────────────────

  private customerColumnsCache: string[] | null = null;
  private campaignHistoryColumnsCache: string[] | null = null;

  private async getCustomerColumns(): Promise<Set<string>> {
    if (!this.customerColumnsCache) {
      const rows = await query<any[]>("SHOW COLUMNS FROM customers");
      this.customerColumnsCache = rows.map(r => String(r.Field || ""));
    }
    return new Set(this.customerColumnsCache);
  }

  private async getOwnerColumn(): Promise<string | null> {
    const cols = await this.getCustomerColumns();
    if (cols.has("owner_user_id")) return "owner_user_id";
    if (cols.has("user_id")) return "user_id";
    return null;
  }

  private async getCityColumn(): Promise<string | null> {
    const cols = await this.getCustomerColumns();
    if (cols.has("city")) return "city";
    if (cols.has("address_city")) return "address_city";
    return null;
  }

  private async getCategoryColumn(): Promise<string | null> {
    const cols = await this.getCustomerColumns();
    if (cols.has("category")) return "category";
    return null;
  }

  private async hasCustomerColumn(column: string): Promise<boolean> {
    const cols = await this.getCustomerColumns();
    return cols.has(column);
  }

  private async getCampaignHistoryColumns(): Promise<Set<string>> {
    if (!this.campaignHistoryColumnsCache) {
      const rows = await query<any[]>("SHOW COLUMNS FROM campaign_history");
      this.campaignHistoryColumnsCache = rows.map((row) => String(row.Field || ""));
    }
    return new Set(this.campaignHistoryColumnsCache);
  }

  /**
   * Extract the pool of allowed instance IDs from campaign settings.
   * Returns campaignCore.poolInstanceIds[] when rotation is enabled, else [].
   */
  private resolveCampaignPoolIds(campaign: Campaign): string[] {
    try {
      const settings = typeof campaign.settings === "string"
        ? JSON.parse(campaign.settings)
        : (campaign.settings || {});
      const core = (settings as any)?.campaignCore || {};
      const pool = Array.isArray(core.poolInstanceIds) ? core.poolInstanceIds : [];
      return pool.map((id: any) => String(id || "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private normalizeCampaignDestinationSettings(settingsInput: Record<string, unknown> | null | undefined): CampaignDestinationSettings {
    const settings = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
    const destinationRaw = ((settings as any).destination || {}) as Record<string, unknown>;
    const type = normalizeDestinationType(destinationRaw.type);
    const targetType = normalizeDestinationTargetType(destinationRaw.targetType);

    const targetsRaw = Array.isArray(destinationRaw.targets) ? destinationRaw.targets : [];
    const normalizedTargets: CampaignDestinationTarget[] = [];
    const seen = new Set<string>();

    for (const item of targetsRaw) {
      const jid = normalizeJid((item as any)?.jid);
      const instance_id = String((item as any)?.instance_id || (item as any)?.instanceId || "").trim();
      if (!jid || !instance_id) continue;

      const target_type = normalizeDestinationTargetType((item as any)?.target_type || (item as any)?.targetType || targetType);
      const key = `${instance_id}::${jid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      normalizedTargets.push({
        jid,
        instance_id,
        instance_name: String((item as any)?.instance_name || (item as any)?.instanceName || "").trim() || undefined,
        name: String((item as any)?.name || (item as any)?.contact_name || jid).trim() || jid,
        target_type,
        last_message_at: (item as any)?.last_message_at ? String((item as any)?.last_message_at) : null,
      });
    }

    return {
      type,
      targetType: targetType,
      targets: normalizedTargets,
    };
  }

  async listDestinationTargets(
    userId: string,
    input?: { search?: string; instanceId?: string; targetType?: "group" | "contact" | "channel" | "all"; limit?: number; connectedOnly?: boolean },
    brandId?: string | null,
  ): Promise<CampaignDestinationTarget[]> {
    await this.ensureSchema();

    const filters = input || {};
    const targetType = String(filters.targetType || "group").toLowerCase();
    const search = String(filters.search || "").trim();
    const instanceId = String(filters.instanceId || "").trim();
    const limit = Math.max(20, Math.min(Number(filters.limit || 120), 400));
    const normalizedBrandId = String(brandId || "").trim();

    const hasInstanceBrand = await this.columnExists("whatsapp_instances", "brand_id");
    const connectedOnly = filters.connectedOnly !== false;

    let sql = `
      SELECT
        c.remote_jid,
        c.contact_name,
        c.instance_id,
        c.is_group,
        i.name AS instance_name,
        COALESCE(c.last_message_at, c.updated_at, c.created_at) AS last_message_at
      FROM whatsapp_conversations c
      JOIN whatsapp_instances i ON i.id = c.instance_id
      WHERE i.created_by = ?
    `;

    const params: any[] = [userId];

    if (hasInstanceBrand) {
      if (normalizedBrandId) {
        sql += " AND i.brand_id = ?";
        params.push(normalizedBrandId);
      } else {
        sql += " AND i.brand_id IS NULL";
      }
    }

    if (connectedOnly) {
      sql += " AND i.status = 'connected'";
    }

    if (instanceId) {
      sql += " AND c.instance_id = ?";
      params.push(instanceId);
    }

    if (targetType === "group") {
      sql += " AND (c.is_group = 1 OR c.remote_jid LIKE '%@g.us')";
    } else if (targetType === "channel") {
      sql += " AND (c.remote_jid LIKE '%@newsletter' OR c.remote_jid LIKE '%@broadcast')";
    } else if (targetType === "contact") {
      sql += " AND (COALESCE(c.is_group, 0) = 0 AND c.remote_jid NOT LIKE '%@g.us' AND c.remote_jid NOT LIKE '%@newsletter' AND c.remote_jid NOT LIKE '%@broadcast')";
    }

    if (search) {
      sql += " AND (c.contact_name LIKE ? OR c.remote_jid LIKE ? OR i.name LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    sql += " ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC LIMIT ?";
    params.push(limit);

    const rows = await query<any[]>(sql, params);

    const seen = new Set<string>();
    const mapped: CampaignDestinationTarget[] = [];

    for (const row of rows) {
      const jid = normalizeJid(row?.remote_jid);
      if (!jid) continue;
      const resolvedTargetType: CampaignDestinationTargetType =
        jid.endsWith("@newsletter") || jid.endsWith("@broadcast")
          ? "channel"
          : (Boolean(Number(row?.is_group || 0)) || jid.endsWith("@g.us") ? "group" : "contact");

      const key = `${row.instance_id}::${jid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      mapped.push({
        jid,
        name: String(row?.contact_name || jid),
        instance_id: String(row?.instance_id || ""),
        instance_name: String(row?.instance_name || ""),
        target_type: resolvedTargetType,
        last_message_at: row?.last_message_at ? new Date(row.last_message_at).toISOString() : null,
      });
    }

    return mapped;
  }

  // ─── Lead filtering ────────────────────────────────────────────

  async filterLeads(userId: string, filter: CampaignFilterCriteria): Promise<any[]> {
    await this.ensureSchema();

    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();

    const conditions: string[] = [];
    const params: any[] = [];

    // Owner
    if (ownerCol) {
      conditions.push(`${ownerCol} = ?`);
      params.push(userId);
    }

    if (cols.has("brand_id")) {
      conditions.push(`brand_id IS NULL`);
    }

    // Must have phone
    if (cols.has("phone")) {
      conditions.push(`phone IS NOT NULL AND TRIM(phone) != ''`);
    }

    // Status filter
    if (filter.statuses?.length) {
      const expandedStatuses = expandStatusFilterVariants(filter.statuses);
      if (expandedStatuses.length > 0) {
        const placeholders = expandedStatuses.map(() => "?").join(",");
        conditions.push(`LOWER(TRIM(COALESCE(status, ''))) IN (${placeholders})`);
        params.push(...expandedStatuses);
      }
    }

    // City filter
    if (filter.cities?.length) {
      const cityCol = cols.has("city") ? "city" : cols.has("address_city") ? "address_city" : null;
      if (cityCol) {
        const placeholders = filter.cities.map(() => "?").join(",");
        conditions.push(`${cityCol} IN (${placeholders})`);
        params.push(...filter.cities);
      }
    }

    // Source filter
    if (filter.sources?.length && cols.has("source")) {
      const placeholders = filter.sources.map(() => "?").join(",");
      conditions.push(`source IN (${placeholders})`);
      params.push(...filter.sources);
    }

    // Score filter
    if (cols.has("lead_score")) {
      if (typeof filter.scoreMin === "number") {
        conditions.push("lead_score >= ?");
        params.push(filter.scoreMin);
      }
      if (typeof filter.scoreMax === "number") {
        conditions.push("lead_score <= ?");
        params.push(filter.scoreMax);
      }
    }

    // Category/segment filter via source_details or category column
    if (filter.segments?.length) {
      if (cols.has("category")) {
        const placeholders = filter.segments.map(() => "?").join(",");
        conditions.push(`category IN (${placeholders})`);
        params.push(...filter.segments);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const selectCols = [
      "id", "name", "phone",
      cols.has("status") ? "status" : "'new' AS status",
      cols.has("tags") ? "tags" : "NULL AS tags",
      cols.has("city") ? "city" : cols.has("address_city") ? "address_city AS city" : "NULL AS city",
      cols.has("state") ? "state" : "NULL AS state",
      cols.has("category") ? "category" : "NULL AS category",
      cols.has("lead_score") ? "lead_score" : "0 AS lead_score",
      cols.has("source") ? "source" : "'manual' AS source",
      cols.has("source_details") ? "source_details" : "NULL AS source_details",
    ].join(", ");

    let leads = await query<any[]>(
      `SELECT ${selectCols} FROM customers ${where} ORDER BY id ASC`,
      params
    );

    // Tag-based filtering in JS (MySQL JSON searching is complex across schemas)
    if (filter.tagsInclude?.length) {
      leads = leads.filter(lead => {
        const tags = parseJsonArray(lead.tags);
        const tagsLower = new Set(tags.map(t => t.toLowerCase()));
        return filter.tagsInclude!.some(tag => tagsLower.has(tag.toLowerCase()));
      });
    }

    if (filter.tagsExclude?.length) {
      leads = leads.filter(lead => {
        const tags = parseJsonArray(lead.tags);
        const tagsLower = new Set(tags.map(t => t.toLowerCase()));
        return !filter.tagsExclude!.some(tag => tagsLower.has(tag.toLowerCase()));
      });
    }

    // WhatsApp filter
    if (filter.hasWhatsapp === true) {
      leads = leads.filter(lead => {
        const details = parseJsonSafe(lead.source_details);
        const validation = details?.whatsapp_validation || {};
        return validation?.has_whatsapp === true || isTruthyFlag(lead.whatsapp_valid);
      });
    }

    // Exclude opted_out leads
    leads = leads.filter(lead => {
      const tags = parseJsonArray(lead.tags);
      const tagsLower = new Set(tags.map(t => t.toLowerCase()));
      return !tagsLower.has("opt_out") && !tagsLower.has("bloqueado");
    });

    return leads;
  }

  // ─── Campaign CRUD ─────────────────────────────────────────────

  async createCampaign(userId: string, input: CampaignCreateInput, brandId?: string | null): Promise<Campaign> {
    await this.ensureSchema();

    const id = randomUUID();
    const speed = { ...DEFAULT_SPEED, ...input.speedControl };
    const filter = normalizeCampaignFilterInput(input.filter || {});
    const mode = input.campaignMode || "educational";

    const sourceSettings = input.settings && typeof input.settings === "object" ? input.settings : {};
    const destinationSettings = this.normalizeCampaignDestinationSettings(sourceSettings);
    const hasDestinationTargets = destinationSettings.type !== "lead_list" && destinationSettings.targets.length > 0;

    // Count matching leads
    const leads = hasDestinationTargets ? [] : await this.filterLeadsByBrand(userId, filter, brandId);

    const requestedInitialStatus = String(input.initialStatus || "draft").toLowerCase();
    let status: CampaignStatus = input.scheduledAt ? "scheduled" : "draft";
    if (!input.scheduledAt && requestedInitialStatus === "paused") {
      status = "paused";
    }

    const normalizedBrandId = String(brandId || "").trim() || null;
    const mergedSettings = {
      campaignMode: mode,
      ...sourceSettings,
      destination: destinationSettings,
      finalActions: {
        nextStatus: String((sourceSettings as any)?.finalActions?.nextStatus || "").trim() || undefined,
        addTags: parseTagList((sourceSettings as any)?.finalActions?.addTags),
      },
      actionWindow: {
        enabled: Boolean((sourceSettings as any)?.actionWindow?.enabled),
        start: String((sourceSettings as any)?.actionWindow?.start || "08:00"),
        end: String((sourceSettings as any)?.actionWindow?.end || "20:00"),
      },
      requestedInitialStatus,
    };

    await query(
      `INSERT INTO campaign_history (
        id, user_id, brand_id, instance_id, name, message_template, ai_prompt, use_ai,
        filter_json, speed_json, campaign_mode, target_count, status, scheduled_at, settings
        , use_instance_rotation, rotation_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, normalizedBrandId, input.instanceId, input.name,
        input.messageTemplate || null,
        input.aiPrompt || null,
        input.useAI ? true : false,
        JSON.stringify(filter),
        JSON.stringify(speed),
        mode,
        hasDestinationTargets ? destinationSettings.targets.length : leads.length,
        status,
        input.scheduledAt || null,
        JSON.stringify(mergedSettings),
        input.useInstanceRotation ? true : false,
        String(input.rotationMode || "balanced"),
      ]
    );

    // Create campaign_leads records
    if (hasDestinationTargets) {
      for (const target of destinationSettings.targets) {
        const jid = normalizeJid(target.jid);
        const compactPhone = normalizePhone(jid).slice(0, 20) || "0000000000";
        const syntheticLeadId = `dest:${target.target_type}:${jid}`.slice(0, 64);

        await query(
          `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, whatsapp_jid, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE id = id`,
          [randomUUID(), id, userId, normalizedBrandId, syntheticLeadId, compactPhone, jid]
        );
      }
    } else {
      for (const lead of leads) {
        const phone = normalizePhone(lead.phone);
        if (!phone) continue;

        await query(
          `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE id = id`,
          [randomUUID(), id, userId, normalizedBrandId, String(lead.id), phone]
        );
      }
    }

    return this.getCampaign(userId, id, normalizedBrandId) as Promise<Campaign>;
  }

  async updateCampaign(
    userId: string,
    campaignId: string,
    input: Partial<CampaignCreateInput>,
    brandId?: string | null
  ): Promise<Campaign | null> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim() || null;

    // Only allow editing campaigns in draft, scheduled, or paused status
    const existing = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!existing) return null;

    if (!["draft", "scheduled", "paused"].includes(existing.status)) {
      throw new Error("Apenas campanhas em rascunho, agendadas ou pausadas podem ser editadas");
    }

    const existingDestination = this.normalizeCampaignDestinationSettings(existing.settings || {});

    const effectiveSettings = {
      ...(existing.settings || {}),
      ...((input.settings && typeof input.settings === "object") ? input.settings : {}),
    } as Record<string, unknown>;
    const effectiveDestination = this.normalizeCampaignDestinationSettings(effectiveSettings);

    const destinationSignature = (destination: CampaignDestinationSettings): string => {
      const targets = (destination.targets || [])
        .map((item) => `${item.instance_id}::${item.jid}::${item.target_type}`)
        .sort();
      return `${destination.type}|${destination.targetType}|${targets.join("|")}`;
    };

    const destinationChanged = destinationSignature(existingDestination) !== destinationSignature(effectiveDestination);

    const sets: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      sets.push("name = ?");
      params.push(input.name);
    }

    if (input.instanceId !== undefined) {
      const normalizedInstanceId = String(input.instanceId || "").trim();
      if (normalizedInstanceId) {
        sets.push("instance_id = ?");
        params.push(normalizedInstanceId);
      }
    }

    if (input.messageTemplate !== undefined) {
      sets.push("message_template = ?");
      params.push(input.messageTemplate || null);
    }

    if (input.aiPrompt !== undefined) {
      sets.push("ai_prompt = ?");
      params.push(input.aiPrompt || null);
    }

    if (input.useAI !== undefined) {
      sets.push("use_ai = ?");
      params.push(input.useAI ? true : false);
    }

    if (input.campaignMode !== undefined) {
      sets.push("campaign_mode = ?");
      params.push(input.campaignMode);
    }

    if (input.filter !== undefined && (effectiveDestination.type === "lead_list" || effectiveDestination.targets.length === 0)) {
      const normalizedFilter = normalizeCampaignFilterInput(input.filter || {});
      sets.push("filter_json = ?");
      params.push(JSON.stringify(normalizedFilter));
    }

    if (input.speedControl !== undefined) {
      const speed = { ...DEFAULT_SPEED, ...input.speedControl };
      sets.push("speed_json = ?");
      params.push(JSON.stringify(speed));
    }

    if (input.scheduledAt !== undefined) {
      sets.push("scheduled_at = ?");
      params.push(input.scheduledAt || null);
    }

    if (input.useInstanceRotation !== undefined) {
      sets.push("use_instance_rotation = ?");
      params.push(input.useInstanceRotation ? true : false);
    }

    if (input.rotationMode !== undefined) {
      sets.push("rotation_mode = ?");
      params.push(input.rotationMode);
    }

    if (input.settings !== undefined) {
      const existingSettings = existing.settings || {};
      const mergedSettings = {
        ...existingSettings,
        ...input.settings,
      };
      sets.push("settings = ?");
      params.push(JSON.stringify(mergedSettings));
    }

    const shouldRebuildPendingTargets = input.filter !== undefined || destinationChanged;

    if (shouldRebuildPendingTargets) {
      const effectiveFilter = normalizeCampaignFilterInput((input.filter || existing.filter_json || {}) as CampaignFilterCriteria);

      await query(
        `DELETE FROM campaign_leads
         WHERE campaign_id = ?
           AND user_id = ?
           AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
           AND status IN ('pending','validating','ready')`,
        normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
      );

      if (effectiveDestination.type !== "lead_list" && effectiveDestination.targets.length > 0) {
        for (const target of effectiveDestination.targets) {
          const jid = normalizeJid(target.jid);
          const compactPhone = normalizePhone(jid).slice(0, 20) || "0000000000";
          const syntheticLeadId = `dest:${target.target_type}:${jid}`.slice(0, 64);

          await query(
            `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, whatsapp_jid, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
             ON DUPLICATE KEY UPDATE id = id`,
            [randomUUID(), campaignId, userId, normalizedBrandId, syntheticLeadId, compactPhone, jid]
          );
        }

        sets.push("target_count = ?");
        params.push(effectiveDestination.targets.length);
      } else {
        const leads = await this.filterLeadsByBrand(userId, effectiveFilter, normalizedBrandId);

        for (const lead of leads) {
          const phone = normalizePhone(lead.phone);
          if (!phone) continue;
          await query(
            `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')
             ON DUPLICATE KEY UPDATE id = id`,
            [randomUUID(), campaignId, userId, normalizedBrandId, String(lead.id), phone]
          );
        }

        sets.push("target_count = ?");
        params.push(leads.length);
      }
    }

    if (sets.length === 0) {
      return existing;
    }

    sets.push("updated_at = NOW()");

    const sql = `UPDATE campaign_history SET ${sets.join(", ")} WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`;
    params.push(campaignId, userId);
    if (normalizedBrandId) params.push(normalizedBrandId);

    await update(sql, params);

    return this.getCampaign(userId, campaignId, normalizedBrandId);
  }

  async getCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<Campaign | null> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim();
    const row = await queryOne<any>(
      `SELECT * FROM campaign_history WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"} LIMIT 1`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    if (!row) return null;
    return this.mapCampaign(row);
  }

  async listCampaigns(userId: string, brandId?: string | null): Promise<Campaign[]> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim();
    const rows = await query<any[]>(
      `SELECT * FROM campaign_history WHERE user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"} ORDER BY created_at DESC LIMIT 50`,
      normalizedBrandId ? [userId, normalizedBrandId] : [userId]
    );

    return rows.map(row => this.mapCampaign(row));
  }

  async duplicateCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<Campaign | null> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim() || null;
    const existing = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!existing) return null;

    const duplicatedName = `${existing.name} (Copia)`;

    return this.createCampaign(
      userId,
      {
        name: duplicatedName,
        instanceId: existing.instance_id,
        messageTemplate: existing.message_template || undefined,
        aiPrompt: existing.ai_prompt || undefined,
        useAI: Boolean(existing.use_ai),
        filter: existing.filter_json || {},
        speedControl: existing.speed_json || DEFAULT_SPEED,
        campaignMode: (existing.campaign_mode as "aggressive" | "educational" | "relationship") || "educational",
        useInstanceRotation: Boolean(existing.use_instance_rotation),
        rotationMode: existing.rotation_mode || "balanced",
        settings: existing.settings || {},
        initialStatus: "draft",
      },
      normalizedBrandId
    );
  }

  async deleteCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<{ ok: boolean; message: string }> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim() || null;
    const existing = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!existing) {
      return { ok: false, message: "Campanha nao encontrada" };
    }

    this.activeCampaigns.set(campaignId, false);
    this.activeCampaigns.delete(campaignId);

    await query(
      `DELETE FROM campaign_leads
       WHERE campaign_id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    await query(
      `DELETE FROM campaign_history
       WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    return { ok: true, message: "Campanha removida com sucesso" };
  }

  async getCampaignLeads(userId: string, campaignId: string, status?: CampaignLeadStatus, brandId?: string | null): Promise<CampaignLeadRecord[]> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim();

    const cityCol = await this.getCityColumn();
    const categoryCol = await this.getCategoryColumn();
    let sql = `SELECT cl.*, c.name AS lead_name,
           ${cityCol ? `c.${cityCol} AS lead_city` : "NULL AS lead_city"},
           ${categoryCol ? `c.${categoryCol} AS lead_category` : "NULL AS lead_category"}
               FROM campaign_leads cl
               LEFT JOIN customers c ON c.id = cl.lead_id
           WHERE cl.campaign_id = ? AND cl.user_id = ? AND ${normalizedBrandId ? "cl.brand_id = ?" : "cl.brand_id IS NULL"}`;
    const params: any[] = normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId];

    if (status) {
      sql += " AND cl.status = ?";
      params.push(status);
    }

    sql += " ORDER BY cl.created_at ASC";

    const rows = await query<any[]>(sql, params);
    return rows.map(row => this.mapCampaignLead(row));
  }

  async getCampaignMetrics(userId: string, campaignId: string, brandId?: string | null): Promise<CampaignMetrics> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim();

    const history = await queryOne<any>(
      `SELECT sent_count, delivered_count, read_count, replied_count,
              interested_count, neutral_count, negative_count, opted_out_count
       FROM campaign_history
       WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
       LIMIT 1`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    const rows = await query<any[]>(
      `SELECT status, reply_classification, COUNT(*) AS cnt
       FROM campaign_leads
       WHERE campaign_id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
       GROUP BY status, reply_classification`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    const counts: Record<string, number> = {};
    let total = 0;
    let interested = 0, neutral = 0, negative = 0, opted_out = 0;

    for (const row of rows) {
      const st = String(row.status || "pending");
      const cnt = Number(row.cnt || 0);
      counts[st] = (counts[st] || 0) + cnt;
      total += cnt;

      if (row.reply_classification === "interested") interested += cnt;
      if (row.reply_classification === "neutral") neutral += cnt;
      if (row.reply_classification === "negative") negative += cnt;
      if (row.reply_classification === "opt_out") opted_out += cnt;
    }

    const sentFromLeadStatuses =
      (counts["sent"] || 0) +
      (counts["delivered"] || 0) +
      (counts["read"] || 0) +
      (counts["replied"] || 0);
    const deliveredFromLeadStatuses = (counts["delivered"] || 0) + (counts["read"] || 0) + (counts["replied"] || 0);
    const readFromLeadStatuses = (counts["read"] || 0) + (counts["replied"] || 0);
    const repliedFromLeadStatuses = counts["replied"] || 0;

    const sent = Math.max(sentFromLeadStatuses, Number(history?.sent_count || 0));
    const delivered = Math.max(deliveredFromLeadStatuses, Number(history?.delivered_count || 0));
    const replied = Math.max(repliedFromLeadStatuses, Number(history?.replied_count || 0));
    const read = Math.max(readFromLeadStatuses, Number(history?.read_count || 0), replied);

    interested = Math.max(interested, Number(history?.interested_count || 0));
    neutral = Math.max(neutral, Number(history?.neutral_count || 0));
    negative = Math.max(negative, Number(history?.negative_count || 0));
    opted_out = Math.max(opted_out, Number(history?.opted_out_count || 0));

    const pending =
      (counts["pending"] || 0) +
      (counts["validating"] || 0) +
      (counts["ready"] || 0) +
      (counts["sending"] || 0);

    const lastOutboundMessage = await queryOne<any>(
      `SELECT content, status, sent_at, phone
       FROM message_log
       WHERE campaign_id = ? AND user_id = ? AND direction = 'outbound'
       ORDER BY sent_at DESC
       LIMIT 1`,
      [campaignId, userId]
    );

    const lastLeadEvent = await queryOne<any>(
      `SELECT status, phone, sent_at, delivered_at, read_at, replied_at, updated_at, created_at
       FROM campaign_leads
       WHERE campaign_id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
       ORDER BY COALESCE(replied_at, read_at, delivered_at, sent_at, updated_at, created_at) DESC
       LIMIT 1`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    const rawMessage = String(lastOutboundMessage?.content || "").trim();
    const truncated = rawMessage.length > 160;
    const messagePreview = truncated ? `${rawMessage.slice(0, 157)}...` : rawMessage;

    const lastMessage =
      rawMessage || lastLeadEvent
        ? {
            text: messagePreview,
            truncated,
            status: String(lastLeadEvent?.status || lastOutboundMessage?.status || "").trim() || null,
            sentAt: lastOutboundMessage?.sent_at ? String(lastOutboundMessage.sent_at) : null,
            eventAt: (lastLeadEvent?.replied_at ||
              lastLeadEvent?.read_at ||
              lastLeadEvent?.delivered_at ||
              lastLeadEvent?.sent_at ||
              lastLeadEvent?.updated_at ||
              lastLeadEvent?.created_at)
              ? String(
                  lastLeadEvent?.replied_at ||
                    lastLeadEvent?.read_at ||
                    lastLeadEvent?.delivered_at ||
                    lastLeadEvent?.sent_at ||
                    lastLeadEvent?.updated_at ||
                    lastLeadEvent?.created_at
                )
              : null,
            phone: String(lastOutboundMessage?.phone || lastLeadEvent?.phone || "").trim() || null,
          }
        : null;

    return {
      total,
      pending,
      sent,
      delivered,
      read,
      replied,
      failed: counts["failed"] || 0,
      skipped: counts["skipped"] || 0,
      interested,
      neutral,
      negative,
      opted_out,
      responseRate: sent > 0 ? Number(((replied / sent) * 100).toFixed(1)) : 0,
      deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0,
      interestRate: replied > 0 ? Number(((interested / replied) * 100).toFixed(1)) : 0,
      lastMessage,
    };
  }

  // ─── Campaign execution ────────────────────────────────────────

  private async getRunnableQueueCount(
    userId: string,
    campaignId: string,
    brandId?: string | null
  ): Promise<number> {
    const normalizedBrandId = String(brandId || "").trim() || null;
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM campaign_leads
       WHERE campaign_id = ?
         AND user_id = ?
         AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
         AND status IN ('pending','ready')`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );
    return Number(row?.total || 0);
  }

  private async ensureCampaignQueueReady(
    userId: string,
    campaign: Campaign,
    brandId?: string | null
  ): Promise<number> {
    const normalizedBrandId = String(brandId || "").trim() || null;
    const currentQueue = await this.getRunnableQueueCount(userId, campaign.id, normalizedBrandId);
    if (currentQueue > 0) return currentQueue;

    const destination = this.normalizeCampaignDestinationSettings(campaign.settings || {});

    if (destination.type !== "lead_list" && destination.targets.length > 0) {
      for (const target of destination.targets) {
        const jid = normalizeJid(target.jid);
        if (!jid) continue;
        const compactPhone = normalizePhone(jid).slice(0, 20) || "0000000000";
        const syntheticLeadId = `dest:${target.target_type}:${jid}`.slice(0, 64);

        await query(
          /* Qualify column refs with the table name so Postgres' ON CONFLICT DO UPDATE
           * doesn't throw "column reference 'status' is ambiguous" (it can't tell if you
           * mean the existing row or EXCLUDED). MySQL accepts the qualified form too. */
          `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, whatsapp_jid, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE
             phone = VALUES(phone),
             whatsapp_jid = COALESCE(campaign_leads.whatsapp_jid, VALUES(whatsapp_jid)),
             status = CASE
               WHEN campaign_leads.status IN ('sent','delivered','read','replied','opted_out') THEN campaign_leads.status
               ELSE 'pending'
             END,
             error_message = NULL,
             updated_at = NOW()`,
          [randomUUID(), campaign.id, userId, normalizedBrandId, syntheticLeadId, compactPhone, jid]
        );
      }

      await update(
        `UPDATE campaign_history SET target_count = ? WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
        normalizedBrandId
          ? [destination.targets.length, campaign.id, userId, normalizedBrandId]
          : [destination.targets.length, campaign.id, userId]
      );
    } else {
      const leads = await this.filterLeadsByBrand(userId, campaign.filter_json || {}, normalizedBrandId);

      for (const lead of leads) {
        const phone = normalizePhone(lead.phone);
        if (!phone) continue;

        await query(
          /* See note above on qualifying column refs for Postgres ON CONFLICT compatibility. */
          `INSERT INTO campaign_leads (id, campaign_id, user_id, brand_id, lead_id, phone, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE
             phone = VALUES(phone),
             status = CASE
               WHEN campaign_leads.status IN ('sent','delivered','read','replied','opted_out') THEN campaign_leads.status
               ELSE 'pending'
             END,
             error_message = NULL,
             updated_at = NOW()`,
          [randomUUID(), campaign.id, userId, normalizedBrandId, String(lead.id), phone]
        );
      }

      await update(
        `UPDATE campaign_history SET target_count = ? WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
        normalizedBrandId ? [leads.length, campaign.id, userId, normalizedBrandId] : [leads.length, campaign.id, userId]
      );
    }

    return this.getRunnableQueueCount(userId, campaign.id, normalizedBrandId);
  }

  async startCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<{ ok: boolean; message: string }> {
    await this.ensureSchema();

    const normalizedBrandId = String(brandId || "").trim() || null;
    const campaign = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!campaign) return { ok: false, message: "Campanha nao encontrada" };

    if (campaign.status === "running") {
      if (this.activeCampaigns.get(campaignId)) {
        return { ok: true, message: "Campanha ja esta em execucao" };
      }

      const queueCount = await this.ensureCampaignQueueReady(userId, campaign, normalizedBrandId);
      if (queueCount <= 0) {
        return { ok: false, message: "Campanha sem fila elegivel para disparo (pending/ready = 0)" };
      }

      this.activeCampaigns.set(campaignId, true);
      this.executeCampaign(userId, campaignId, normalizedBrandId).catch((err) => {
        logger.error(`Campaign ${campaignId} resume failed: ${err.message}`);
      });

      return { ok: true, message: `Campanha retomada com ${queueCount} leads na fila` };
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled" && campaign.status !== "paused") {
      return { ok: false, message: `Campanha nao pode ser iniciada (status: ${campaign.status})` };
    }

    let startMessageSuffix = "";

    if (campaign.use_instance_rotation && this.rotationEngine) {
      // Validate the pool — at least one allowed instance must be connected
      const poolIds = this.resolveCampaignPoolIds(campaign);
      const connectedInPool = poolIds.length > 0
        ? poolIds.filter(id => {
            const i = this.instanceManager.getInstance(id, userId) ?? this.instanceManager.getInstance(id);
            return i?.status === "connected";
          })
        : [];

      if (poolIds.length > 0 && connectedInPool.length === 0) {
        return { ok: false, message: "Nenhuma instancia do pool da campanha esta conectada. Verifique o WhatsApp Manager." };
      }

      // If pool is empty, fall back to any connected instance
      if (poolIds.length === 0) {
        const selected = await this.rotationEngine.selectInstance(userId, { preferredInstanceId: campaign.instance_id });
        if (!selected) {
          return { ok: false, message: "Nenhuma instancia conectada disponivel para rotacao" };
        }
      }
      // IMPORTANT: do NOT mutate campaign.instance_id — preserve user's original preference.
      // Rotation selects per-message, not per-campaign.
    } else {
      // Verify fixed instance — skip ownership filter (instances may be shared across users)
      const instance = this.instanceManager.getInstance(campaign.instance_id, userId)
        ?? this.instanceManager.getInstance(campaign.instance_id);
      if (!instance || instance.status !== "connected") {
        return { ok: false, message: `Instancia WhatsApp ${campaign.instance_id?.slice(0, 8) || '?'} nao esta conectada. Reconecte em WhatsApp Manager.` };
      }
    }

    const queueCount = await this.ensureCampaignQueueReady(userId, campaign, normalizedBrandId);
    if (queueCount <= 0) {
      return { ok: false, message: "Nenhum lead elegivel para disparo inicial" };
    }

    await update(
      `UPDATE campaign_history SET status = 'running', started_at = NOW() WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    this.activeCampaigns.set(campaignId, true);

    // Run in background
    this.executeCampaign(userId, campaignId, normalizedBrandId).catch(err => {
      logger.error(`Campaign ${campaignId} execution failed: ${err.message}`);
    });

    return { ok: true, message: `Campanha iniciada com ${queueCount} leads na fila${startMessageSuffix}` };
  }

  async pauseCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<{ ok: boolean; message: string }> {
    this.activeCampaigns.set(campaignId, false);
    const normalizedBrandId = String(brandId || "").trim() || null;

    await update(
      `UPDATE campaign_history SET status = 'paused' WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"} AND status = 'running'`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    return { ok: true, message: "Campanha pausada" };
  }

  async cancelCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<{ ok: boolean; message: string }> {
    this.activeCampaigns.set(campaignId, false);
    const normalizedBrandId = String(brandId || "").trim() || null;

    await update(
      `UPDATE campaign_history SET status = 'cancelled', completed_at = NOW() WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    // Cancel pending leads
    await update(
      `UPDATE campaign_leads SET status = 'skipped' WHERE campaign_id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"} AND status IN ('pending','validating','ready')`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    return { ok: true, message: "Campanha cancelada" };
  }

  async reExecuteCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<{ ok: boolean; message: string }> {
    await this.ensureSchema();
    const normalizedBrandId = String(brandId || "").trim() || null;
    const campaign = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!campaign) return { ok: false, message: "Campanha nao encontrada" };

    if (!["completed", "cancelled", "failed"].includes(campaign.status)) {
      return { ok: false, message: `Campanha nao pode ser reexecutada (status: ${campaign.status})` };
    }

    // Reset campaign status to draft
    await update(
      `UPDATE campaign_history SET status = 'draft', started_at = NULL, completed_at = NULL, sent_count = 0, failed_count = 0, delivered_count = 0, read_count = 0, replied_count = 0, interested_count = 0, neutral_count = 0, negative_count = 0, opted_out_count = 0, updated_at = NOW() WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    // Reset all leads back to pending
    await update(
      `UPDATE campaign_leads SET status = 'pending', error_message = NULL, sent_at = NULL, delivered_at = NULL, read_at = NULL, replied_at = NULL, reply_text = NULL, reply_classification = NULL, score_delta = 0, tags_added = NULL, whatsapp_valid = NULL, message_text = NULL, ai_generated = FALSE, attempt_count = 0 WHERE campaign_id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    return { ok: true, message: "Campanha resetada para rascunho. Pronta para reexecucao." };
  }

  async sendCampaignTest(
    userId: string,
    input: {
      instanceId: string;
      templatePrompt: string;
      testPhone?: string;
      mediaImagePath?: string;
      mediaImageCaption?: string;
      useTextAsCaption?: boolean;
      lead?: {
        name?: string;
        phone?: string;
        address?: string;
        city?: string;
        state?: string;
        category?: string;
      };
    }
  ): Promise<{ message: string; sentTo: string; usedDefaultNumber: boolean; preview: string }> {
    const instanceId = String(input.instanceId || "").trim();
    const templatePrompt = String(input.templatePrompt || "").trim();
    if (!instanceId || !templatePrompt) {
      throw new Error("instanceId and templatePrompt are required");
    }

    const instance = await queryOne<{ id: string; phone: string | null }>(
      "SELECT id, phone FROM whatsapp_instances WHERE id = ? AND created_by = ? LIMIT 1",
      [instanceId, userId]
    );
    if (!instance) throw new Error("Instance not found");

    const explicitPhone = normalizePhone(input.testPhone);
    const fallbackPhone = normalizePhone(instance.phone);
    const sentTo = explicitPhone || fallbackPhone;
    if (!sentTo) {
      throw new Error("No test destination number available. Connect this instance first or provide testPhone.");
    }

    const runtimeInstance = this.instanceManager.getInstance(instanceId, userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    const lead = input.lead || {};
    const leadContext = {
      id: "test-lead",
      name: String(lead.name || "Contato de Teste"),
      phone: sentTo,
      address: String(lead.address || ""),
      city: String(lead.city || ""),
      state: String(lead.state || ""),
      category: String(lead.category || ""),
      status: "new" as const,
      messagesSent: [] as string[],
      messagesReceived: [] as string[],
      createdAt: new Date(),
    };

    let generated = templatePrompt;
    try {
      generated = await this.gemini.generateMessage(leadContext, templatePrompt, { userId });
    } catch {
      generated = templatePrompt;
    }

    const hasImage = Boolean(String(input.mediaImagePath || "").trim());
    const useTextAsCaption = Boolean(input.useTextAsCaption);

    const preview = `[TESTE DE CAMPANHA]\n${generated}`;

    if (hasImage) {
      const explicitCaption = String(input.mediaImageCaption || "").trim();
      const resolvedCaption = explicitCaption || (useTextAsCaption ? generated : "");

      const sentMedia = await this.instanceManager.sendMedia(instanceId, sentTo, {
        mediaType: "image",
        filePath: String(input.mediaImagePath || ""),
        caption: resolvedCaption || undefined,
      });

      if (!sentMedia) {
        throw new Error("Failed to send test image");
      }

      return {
        message: "Test image sent successfully",
        sentTo,
        usedDefaultNumber: explicitPhone.length === 0,
        preview: resolvedCaption ? `[TESTE DE CAMPANHA · IMAGEM]\n${resolvedCaption}` : "[TESTE DE CAMPANHA · IMAGEM]",
      };
    }

    const sent = await this.instanceManager.sendMessage(instanceId, sentTo, preview);
    if (!sent) {
      throw new Error("Failed to send test message");
    }

    return {
      message: "Test message sent successfully",
      sentTo,
      usedDefaultNumber: explicitPhone.length === 0,
      preview,
    };
  }

  // ─── Core execution loop ───────────────────────────────────────

  private async executeCampaign(userId: string, campaignId: string, brandId?: string | null): Promise<void> {
    logger.info(`[Campaign ${campaignId}] Starting execution`);

    const normalizedBrandId = String(brandId || "").trim() || null;
    const campaign = await this.getCampaign(userId, campaignId, normalizedBrandId);
    if (!campaign) return;

    const speed = campaign.speed_json || DEFAULT_SPEED;
    const useAI = campaign.use_ai;
    const campaignSettings = parseJsonSafe((campaign as any).settings);
    const actionWindow = (campaignSettings?.actionWindow || {}) as CampaignActionWindow;
    const schedulerSettings = parseJsonSafe(campaignSettings?.scheduler || {});
    const actionWindowTimeZone = String(schedulerSettings?.timeZone || campaignSettings?.timeZone || "").trim() || undefined;
    const finalActions = (campaignSettings?.finalActions || {}) as CampaignFinalActions;
    let contextPayload: any = null;

    if (useAI) {
      try {
        contextPayload = await this.contextEngine.getResolvedContext(userId, normalizedBrandId || undefined);
      } catch (err: any) {
        logger.warn(`[Campaign ${campaignId}] Context engine failed: ${err.message}`);
      }
    }

    // Get pending leads
    const cityCol = await this.getCityColumn();
    const categoryCol = await this.getCategoryColumn();
    const hasStateCol = await this.hasCustomerColumn("state");
    const hasTagsCol = await this.hasCustomerColumn("tags");
    const hasSourceDetailsCol = await this.hasCustomerColumn("source_details");
    const pendingLeads = await query<any[]>(
      `SELECT cl.*, c.name AS lead_name, c.phone AS lead_phone, ${cityCol ? `c.${cityCol} AS lead_city` : "NULL AS lead_city"},
              ${categoryCol ? `c.${categoryCol} AS lead_category` : "NULL AS lead_category"},
              ${hasStateCol ? "c.state AS lead_state" : "NULL AS lead_state"},
              ${hasTagsCol ? "c.tags AS lead_tags" : "NULL AS lead_tags"},
              ${hasSourceDetailsCol ? "c.source_details AS source_details" : "NULL AS source_details"}
       FROM campaign_leads cl
       LEFT JOIN customers c ON c.id = cl.lead_id
       WHERE cl.campaign_id = ? AND cl.user_id = ? AND ${normalizedBrandId ? "cl.brand_id = ?" : "cl.brand_id IS NULL"} AND cl.status IN ('pending','ready')
       ORDER BY cl.created_at ASC`,
      normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
    );

    let sentThisRun = 0;
    let failedConsecutive = 0;
    const maxConsecutiveFails = 5;

    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i];
      // Check if campaign was paused/cancelled
      if (!this.activeCampaigns.get(campaignId)) {
        logger.info(`[Campaign ${campaignId}] Stopped by user`);
        break;
      }

      const runtimeStatusRow = await queryOne<{ status: string }>(
        `SELECT status
         FROM campaign_history
         WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"}
         LIMIT 1`,
        normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
      );
      const runtimeStatus = String(runtimeStatusRow?.status || "").trim().toLowerCase();
      if (runtimeStatus && runtimeStatus !== "running") {
        this.activeCampaigns.set(campaignId, false);
        logger.info(`[Campaign ${campaignId}] Stopped due to status change (${runtimeStatus})`);
        break;
      }

      // Daily limit check
      if (sentThisRun >= speed.dailyLimit) {
        logger.info(`[Campaign ${campaignId}] Daily limit reached: ${sentThisRun}`);
        break;
      }

      if (
        actionWindow?.enabled &&
        actionWindow.start &&
        actionWindow.end &&
        !isInDailyWindow(new Date(), actionWindow.start, actionWindow.end, actionWindowTimeZone)
      ) {
        await sleep(30_000);
        i--;
        continue;
      }

      // Auto-pause on high block rate
      if (sentThisRun > 10 && failedConsecutive >= maxConsecutiveFails) {
        logger.warn(`[Campaign ${campaignId}] Auto-paused: ${failedConsecutive} consecutive failures`);
        await this.pauseCampaign(userId, campaignId, normalizedBrandId);
        break;
      }

      const destinationJid = normalizeJid(lead.whatsapp_jid || "");
      const isSyntheticDestination = String(lead.lead_id || "").startsWith("dest:");
      const phone = normalizePhone(lead.phone || lead.lead_phone || destinationJid);
      if (!phone && !destinationJid) {
        await update(
          `UPDATE campaign_leads SET status = 'skipped', error_message = 'Sem telefone' WHERE id = ?`,
          [lead.id]
        );
        continue;
      }

      // Step 0: Re-check current lead status against campaign filter before sending
      if (!isSyntheticDestination) {
        const eligibility = await this.recheckLeadEligibility(userId, String(lead.lead_id || ""), campaign);
        if (!eligibility.ok) {
          await update(
            `UPDATE campaign_leads SET status = 'skipped', error_message = ? WHERE id = ?`,
            [eligibility.reason || "Lead fora do filtro da campanha", lead.id]
          );
          continue;
        }
      }

      // Step 1: Validate WhatsApp number
      let jid: string | undefined;
      if (destinationJid) {
        jid = destinationJid;
        await update(
          `UPDATE campaign_leads SET whatsapp_valid = TRUE, whatsapp_jid = ? WHERE id = ?`,
          [jid, lead.id]
        );
      } else {
        try {
          // When rotation is enabled, use first connected pool instance for validation
          // (campaign.instance_id may be a stale/missing ID when pool is configured)
          const validationInstanceId = (() => {
            if (campaign.use_instance_rotation) {
              const poolIds = this.resolveCampaignPoolIds(campaign);
              const connected = poolIds.find((id) => {
                const inst =
                  this.instanceManager.getInstance(id, userId) ??
                  this.instanceManager.getInstance(id);
                return inst?.status === "connected";
              });
              if (connected) return connected;
            }
            return campaign.instance_id;
          })();
          const validation = await withTimeout(
            this.instanceManager.checkWhatsAppNumber(validationInstanceId, phone),
            15000,
            "Timeout na validacao WhatsApp"
          );
          if (!validation.exists) {
            await update(
              `UPDATE campaign_leads SET status = 'skipped', whatsapp_valid = FALSE, error_message = 'Numero sem WhatsApp' WHERE id = ?`,
              [lead.id]
            );

            // Update the lead's source_details with validation result
            await this.markLeadWhatsAppInvalid(userId, lead.lead_id);
            continue;
          }
          jid = validation.jid;

          await update(
            `UPDATE campaign_leads SET whatsapp_valid = TRUE, whatsapp_jid = ? WHERE id = ?`,
            [jid || null, lead.id]
          );
        } catch (err: any) {
          logger.warn(`[Campaign ${campaignId}] Validation failed for ${phone}: ${err.message}`);

          if (isTransientInstanceConnectionError(err)) {
            logger.warn(
              `[Campaign ${campaignId}] Instance unavailable during validation; keeping queue pending for retry`
            );
            break;
          }

          await update(
            `UPDATE campaign_leads SET status = 'skipped', error_message = ? WHERE id = ?`,
            [`Erro validacao: ${err.message}`, lead.id]
          );
          continue;
        }
      }

      // Step 1.5: Name enrichment — fetch + normalize contact name when missing
      const nameEnrichmentEnabled = Boolean((campaignSettings as any)?.nameEnrichment?.enabled);
      if (nameEnrichmentEnabled && !lead.lead_name?.trim()) {
        let enrichedName: string | null = null;

        // Source 1: whatsapp_conversations table (already captured pushName)
        if (!enrichedName && (jid || phone)) {
          try {
            const phoneCandidates = [jid, phone, `${phone}@s.whatsapp.net`].filter(Boolean);
            const placeholders = phoneCandidates.map(() => "?").join(",");
            const convRow = await queryOne<{ contact_push_name?: string; contact_name?: string }>(
              `SELECT contact_push_name, contact_name FROM whatsapp_conversations
               WHERE remote_jid IN (${placeholders}) AND contact_push_name IS NOT NULL
               ORDER BY last_message_at DESC LIMIT 1`,
              phoneCandidates
            );
            if (convRow?.contact_push_name) enrichedName = normalizeContactName(convRow.contact_push_name);
            if (!enrichedName && convRow?.contact_name) enrichedName = normalizeContactName(convRow.contact_name);
          } catch {}
        }

        // Source 2: WhatsApp business profile / contact store via Baileys
        if (!enrichedName && jid) {
          try {
            const validationInstanceId = campaign.use_instance_rotation
              ? this.resolveCampaignPoolIds(campaign).find((id) => {
                  const inst = this.instanceManager.getInstance(id, userId) ?? this.instanceManager.getInstance(id);
                  return inst?.status === "connected";
                }) || campaign.instance_id
              : campaign.instance_id;
            const remoteName = await withTimeout(
              this.instanceManager.fetchContactName(validationInstanceId, jid),
              5000,
              "Timeout buscando nome"
            );
            if (remoteName) enrichedName = normalizeContactName(remoteName);
          } catch {}
        }

        if (enrichedName) {
          lead.lead_name = enrichedName;
          // Persist to customers table so future campaigns already have the name
          try {
            await update(`UPDATE customers SET name = ? WHERE id = ? AND (name IS NULL OR name = '')`, [enrichedName, lead.lead_id]);
          } catch {}
          logger.info(`[Campaign ${campaignId}] Name enriched for ${phone}: ${enrichedName}`);
        }
      }

      // Step 2: Generate or use template message
      let messageText = campaign.message_template || "";

      if (useAI) {
        try {
          const leadContext = {
            id: lead.lead_id,
            name: lead.lead_name || "Lead",
            phone,
            address: lead.lead_city || "",
            category: lead.lead_category || "",
            city: lead.lead_city || "",
            state: lead.lead_state || "",
            status: "new" as const,
            messagesSent: [] as string[],
            messagesReceived: [] as string[],
            createdAt: new Date(),
          };

          const campaignPrompt = this.buildCampaignFirstTouchPrompt(campaign, lead, campaignSettings);

          const primaryInstruction = campaignPrompt || campaign.ai_prompt || campaign.message_template || "";
          const contextualBlock = String(contextPayload?.contextBlock || "").trim();

          // Build AI prompt with strict precedence to campaign instruction
          const fullPrompt = [
            "HIERARQUIA DE INSTRUCOES (OBRIGATORIA):",
            "1) INSTRUCAO DA CAMPANHA (prioridade maxima, cumprir literalmente)",
            "2) CONTEXTO COMPLEMENTAR (usar apenas para enriquecer sem contrariar a instrucao da campanha)",
            "",
            "REGRAS CRITICAS:",
            "- Nunca invente nome de atendente, empresa, produto, oferta, volume ou condicao comercial.",
            "- Se a instrucao da campanha definir nome do atendente (ex.: Elenice), use exatamente esse nome.",
            "- Se a campanha indicar foco comercial/industrial/atacado, nao ofereca produto de varejo/menor volume.",
            "",
            `INSTRUCAO DA CAMPANHA:\n${primaryInstruction}`,
            contextualBlock ? `CONTEXTO COMPLEMENTAR:\n${contextualBlock}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");

          messageText = await this.gemini.generateMessage(leadContext, fullPrompt, {
            userId,
            brandId: normalizedBrandId || undefined,
          });
        } catch (err: any) {
          logger.warn(`[Campaign ${campaignId}] AI generation failed for ${lead.lead_name}: ${err.message}`);
          // Fall back to template
          messageText = this.fillTemplate(this.buildFallbackTemplate(campaign, campaignSettings), lead);
        }
      } else {
        messageText = this.fillTemplate(this.buildFallbackTemplate(campaign, campaignSettings), lead);
      }

      if (!messageText.trim()) {
        await update(
          `UPDATE campaign_leads SET status = 'skipped', error_message = 'Mensagem vazia' WHERE id = ?`,
          [lead.id]
        );
        continue;
      }

      // Step 3: Send message
      await update(
        `UPDATE campaign_leads SET status = 'sending', message_text = ?, ai_generated = ? WHERE id = ?`,
        [messageText, useAI ? true : false, lead.id]
      );

      // Extract media + link config from campaign settings
      const mediaConfig = this.extractCampaignMediaConfig(campaignSettings);
      const hasMedia =
        Boolean(mediaConfig.imagePath) ||
        mediaConfig.videoPaths.length > 0 ||
        Boolean(mediaConfig.audioPath) ||
        Boolean(mediaConfig.documentPath);
      const hasLink = Boolean(mediaConfig.linkUrl);

      // Resolve which instance will actually send this message.
      // When rotation is ON, pick per-message from the campaign's allowed pool.
      // When rotation is OFF, always use the campaign's fixed instance.
      const poolIds = campaign.use_instance_rotation ? this.resolveCampaignPoolIds(campaign) : [];
      let sendingInstanceId = campaign.instance_id;

      if (campaign.use_instance_rotation && this.rotationEngine) {
        const rotated = await this.rotationEngine.selectInstance(userId, {
          leadId: String(lead.lead_id || ""),
          preferredInstanceId: campaign.instance_id,
          allowedInstanceIds: poolIds.length > 0 ? poolIds : undefined,
          distributionMode: (campaign.rotation_mode as "balanced" | "conservative" | "aggressive") || "balanced",
        });
        if (rotated) sendingInstanceId = rotated;
      }

      try {
        const sendResult = await withTimeout<CampaignSendResult>(
          // Path A: media or link present → use rich-message helper with selected instance
          hasMedia || hasLink
            ? this.sendCampaignMessageWithMedia(
                sendingInstanceId,
                jid,
                phone,
                messageText,
                mediaConfig
              )
            // Path B: text-only via JID
            : jid
            ? (async () => {
                const ok = await this.instanceManager.sendMessageByJid(sendingInstanceId, jid, messageText);
                return {
                  ok,
                  instanceId: sendingInstanceId,
                  error: ok ? undefined : "Envio falhou",
                };
              })()
            // Path C: text-only with rotation + failover (tries multiple instances)
            : campaign.use_instance_rotation && this.rotationEngine
            ? this.rotationEngine.sendTextWithFailover({
                userId,
                phone,
                message: messageText,
                leadId: String(lead.lead_id || ""),
                campaignId,
                automationCode: "campaign_v2",
                preferredInstanceId: sendingInstanceId,
                allowedInstanceIds: poolIds.length > 0 ? poolIds : undefined,
                maxAttempts: 3,
              })
            // Path D: text-only direct send (rotation off)
            : (async () => {
                const ok = await this.instanceManager.sendMessage(sendingInstanceId, phone, messageText);
                return {
                  ok,
                  instanceId: sendingInstanceId,
                  error: ok ? undefined : "Envio falhou",
                };
              })(),
          // Media uploads can take longer than text, so allow extra time when media is present
          hasMedia ? 60000 : 20000,
          "Timeout no envio da mensagem"
        );

        const sent = sendResult.ok;
        const usedInstanceId = sendResult.instanceId || sendingInstanceId;

        // Record metric for rotation engine so it knows which instance actually sent
        if (campaign.use_instance_rotation && this.rotationEngine && usedInstanceId) {
          await this.rotationEngine.recordSendMetric({
            userId,
            instanceId: usedInstanceId,
            leadId: String(lead.lead_id || ""),
            campaignId,
            automationCode: "campaign_v2",
            status: sent ? "sent" : "failed",
          }).catch(() => {});
        }

        if (sent) {
          const tagsToAdd = ["campanha_disparada", "primeiro_contato_enviado", "aguardando_resposta"];

          await update(
            `UPDATE campaign_leads
             SET status = 'sent',
                 sent_at = NOW(),
                 delivered_at = COALESCE(delivered_at, NOW()),
                 tags_added = ?,
                 attempt_count = attempt_count + 1
             WHERE id = ?`,
            [JSON.stringify(tagsToAdd), lead.id]
          );

          // Update campaign counters
          await update(
            `UPDATE campaign_history
             SET sent_count = sent_count + 1,
                 delivered_count = delivered_count + 1
             WHERE id = ?`,
            [campaignId]
          );

          // Update lead status and tags in customers table
          if (!isSyntheticDestination) {
            await this.updateLeadAfterSend(userId, lead.lead_id, campaignId, tagsToAdd);
            if (finalActions && (finalActions.nextStatus || (finalActions.addTags || []).length)) {
              await this.applyFinalActionsAfterSend(userId, lead.lead_id, finalActions);
            }

            // Log message
            await this.logMessage(userId, lead.lead_id, campaignId, usedInstanceId, phone, messageText, useAI);
          }

          sentThisRun++;
          failedConsecutive = 0;

          logger.info(`[Campaign ${campaignId}] Sent ${sentThisRun} to ${lead.lead_name || phone}`);
        } else {
          failedConsecutive++;
          await update(
            `UPDATE campaign_leads SET status = 'failed', error_message = ?, attempt_count = attempt_count + 1 WHERE id = ?`,
            [sendResult.error || "Envio falhou", lead.id]
          );
          await update(
            `UPDATE campaign_history SET failed_count = failed_count + 1 WHERE id = ?`,
            [campaignId]
          );
        }
      } catch (err: any) {
        failedConsecutive++;
        await update(
          `UPDATE campaign_leads SET status = 'failed', error_message = ?, attempt_count = attempt_count + 1 WHERE id = ?`,
          [err.message, lead.id]
        );
        await update(
          `UPDATE campaign_history SET failed_count = failed_count + 1 WHERE id = ?`,
          [campaignId]
        );
      }

      // Anti-blocking delay — rotation-aware.
      // When rotation is ON with multiple instances, the rotation engine manages per-instance
      // cooldowns (min_interval, per_minute_limit, hourly_limit). We use a shorter base delay
      // between sends so the engine can distribute across instances efficiently.
      // When rotation is OFF (single instance), use the campaign's global speed settings.
      if (campaign.use_instance_rotation && this.rotationEngine) {
        const poolIds = this.resolveCampaignPoolIds(campaign);
        const connectedCount = poolIds.filter(id => {
          const inst = this.instanceManager.getInstance(id, userId) ?? this.instanceManager.getInstance(id);
          return inst?.status === "connected";
        }).length;
        if (connectedCount > 1) {
          // Multiple instances: short delay (3-6s) — rotation engine handles per-instance pacing
          const rotationDelay = randomDelay(3, Math.max(4, Math.floor(speed.minIntervalSeconds / connectedCount)));
          await sleep(rotationDelay);
        } else {
          // Single instance even with rotation on: use campaign speed
          const delay = randomDelay(speed.minIntervalSeconds, speed.maxIntervalSeconds);
          await sleep(delay);
        }
      } else {
        const delay = randomDelay(speed.minIntervalSeconds, speed.maxIntervalSeconds);
        await sleep(delay);
      }
    }

    // Check if campaign completed
    if (this.activeCampaigns.get(campaignId)) {
      const remainingQueue = await this.getRunnableQueueCount(userId, campaignId, normalizedBrandId);
      if (remainingQueue > 0) {
        this.activeCampaigns.delete(campaignId);
        logger.info(`[Campaign ${campaignId}] Execution ended with ${remainingQueue} leads still pending/ready`);
        return;
      }

      await update(
        `UPDATE campaign_history SET status = 'completed', completed_at = NOW() WHERE id = ? AND user_id = ? AND ${normalizedBrandId ? "brand_id = ?" : "brand_id IS NULL"} AND status = 'running'`,
        normalizedBrandId ? [campaignId, userId, normalizedBrandId] : [campaignId, userId]
      );
      this.activeCampaigns.delete(campaignId);
      logger.info(`[Campaign ${campaignId}] Completed. Total sent: ${sentThisRun}`);
    }
  }

  // ─── Post-send updates ─────────────────────────────────────────

  private async updateLeadAfterSend(
    userId: string,
    leadId: string,
    campaignId: string,
    tagsToAdd: string[]
  ): Promise<void> {
    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();

    const fields: string[] = [];
    const values: any[] = [];

    // Update status to "contacted"
    if (cols.has("status")) {
      fields.push("status = 'contacted'");
    }

    // Update last_contact_at
    if (cols.has("last_contact_at")) {
      fields.push("last_contact_at = NOW()");
    }

    // Add tags
    if (cols.has("tags")) {
      const currentLead = await queryOne<any>(
        `SELECT tags FROM customers WHERE id = ? LIMIT 1`,
        [leadId]
      );
      const currentTags = parseJsonArray(currentLead?.tags);
      const allTags = [...new Set([...currentTags, ...tagsToAdd, `campanha_${campaignId.substring(0, 8)}`])];
      fields.push("tags = ?");
      values.push(JSON.stringify(allTags));
    }

    if (!fields.length) return;

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(leadId);

    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      values.push(userId);
    }

    await update(sql, values);
  }

  private async recheckLeadEligibility(
    userId: string,
    leadId: string,
    campaign: Campaign
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!leadId) {
      return { ok: false, reason: "Lead sem identificacao" };
    }

    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();
    const statusCol = cols.has("status") ? "status" : "'new' AS status";

    let sql = `SELECT ${statusCol} FROM customers WHERE id = ?`;
    const params: any[] = [leadId];

    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      params.push(userId);
    }

    if (cols.has("brand_id")) {
      if (campaign.brand_id) {
        sql += " AND brand_id = ?";
        params.push(campaign.brand_id);
      } else {
        sql += " AND brand_id IS NULL";
      }
    }

    sql += " LIMIT 1";

    const row = await queryOne<any>(sql, params);
    if (!row) {
      return { ok: false, reason: "Lead nao encontrado para esta brand" };
    }

    const campaignFilter = normalizeCampaignFilterInput(campaign.filter_json || {});
    const requiredStatuses = normalizeStatusFilterInput(campaignFilter.statuses);
    const allowedStatuses = new Set(requiredStatuses.length ? requiredStatuses : ["new"]);

    const currentStatus = normalizeLeadStatusValue(row.status || "new");
    if (!allowedStatuses.has(currentStatus)) {
      return {
        ok: false,
        reason: `Status atual (${currentStatus || "desconhecido"}) fora do filtro da campanha`,
      };
    }

    return { ok: true };
  }

  private async applyFinalActionsAfterSend(
    userId: string,
    leadId: string,
    actions: CampaignFinalActions
  ): Promise<void> {
    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();

    const fields: string[] = [];
    const values: any[] = [];

    const nextStatus = String(actions.nextStatus || "").trim();
    if (nextStatus && cols.has("status")) {
      fields.push("status = ?");
      values.push(nextStatus);
    }

    const addTags = parseTagList(actions.addTags);
    if (addTags.length && cols.has("tags")) {
      const currentLead = await queryOne<any>(
        `SELECT tags FROM customers WHERE id = ? LIMIT 1`,
        [leadId]
      );
      const currentTags = parseJsonArray(currentLead?.tags);
      const mergedTags = [...new Set([...currentTags, ...addTags])];
      fields.push("tags = ?");
      values.push(JSON.stringify(mergedTags));
    }

    if (!fields.length) return;

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(leadId);

    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      values.push(userId);
    }

    await update(sql, values);
  }

  private async markLeadWhatsAppInvalid(userId: string, leadId: string): Promise<void> {
    const cols = await this.getCustomerColumns();
    if (!cols.has("source_details")) return;

    const row = await queryOne<any>(`SELECT source_details FROM customers WHERE id = ? LIMIT 1`, [leadId]);
    const details = parseJsonSafe(row?.source_details);
    details.whatsapp_validation = {
      ...(details.whatsapp_validation || {}),
      has_whatsapp: false,
      status: "invalid",
      checked_at: new Date().toISOString(),
    };

    const ownerCol = await this.getOwnerColumn();
    let sql = `UPDATE customers SET source_details = ? WHERE id = ?`;
    const params: any[] = [JSON.stringify(details), leadId];
    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      params.push(userId);
    }
    await update(sql, params);
  }

  private async logMessage(
    userId: string,
    leadId: string,
    campaignId: string,
    instanceId: string,
    phone: string,
    content: string,
    aiGenerated: boolean
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO message_log (id, user_id, client_id, campaign_id, instance_id, phone, direction, message_type, content, status, ai_generated, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'text', ?, 'sent', ?, NOW())`,
        [randomUUID(), userId, leadId, campaignId, instanceId, phone, content, aiGenerated ? true : false]
      );
    } catch (err: any) {
      logger.debug?.(`Message log insert failed: ${err.message}`);
    }
  }

  private async findLatestReplyCandidate(
    userId: string,
    phoneCandidates: string[],
    normalizedPhone: string,
    brandId?: string | null,
    forceCrossBrand = false
  ): Promise<any | null> {
    if (!phoneCandidates.length) return null;

    const normalizedBrandId = String(brandId || "").trim();
    const phonePlaceholders = phoneCandidates.map(() => "?").join(", ");
    const jidPatterns = buildJidLikePatterns(phoneCandidates);
    const jidMatchSql = jidPatterns.length
      ? ` OR ${jidPatterns.map(() => "cl.whatsapp_jid LIKE ?").join(" OR ")}`
      : "";
    const whereBrand = forceCrossBrand
      ? ""
      : normalizedBrandId
        ? " AND cl.brand_id = ?"
        : " AND cl.brand_id IS NULL";

    const directParams: any[] = [userId, ...phoneCandidates, ...jidPatterns];
    if (!forceCrossBrand && normalizedBrandId) directParams.push(normalizedBrandId);
    directParams.push(normalizedPhone, `${normalizedPhone}@%`);

    const directMatch = await queryOne<any>(
      `SELECT cl.*, ch.id AS campaign_id, ch.ai_prompt
       FROM campaign_leads cl
       JOIN campaign_history ch ON ch.id = cl.campaign_id
       WHERE cl.user_id = ?
         AND (cl.phone IN (${phonePlaceholders})${jidMatchSql})
         AND (
           cl.status IN ('sent','delivered','read','replied','opted_out')
           OR cl.sent_at IS NOT NULL
         )
         ${whereBrand}
       ORDER BY
         CASE
           WHEN cl.phone = ? THEN 0
           WHEN cl.whatsapp_jid LIKE ? THEN 1
           ELSE 2
         END,
         COALESCE(cl.replied_at, cl.read_at, cl.delivered_at, cl.sent_at, cl.updated_at, cl.created_at) DESC
       LIMIT 1`,
      directParams
    );

    if (directMatch) return directMatch;

    const fallbackParams: any[] = [userId, ...phoneCandidates];
    if (!forceCrossBrand && normalizedBrandId) fallbackParams.push(normalizedBrandId);
    fallbackParams.push(normalizedPhone);

    return queryOne<any>(
      `SELECT cl.*, ch.id AS campaign_id, ch.ai_prompt, ml.last_outbound_at
       FROM (
         SELECT campaign_id, user_id, client_id, phone, MAX(sent_at) AS last_outbound_at
         FROM message_log
         WHERE user_id = ?
           AND direction = 'outbound'
           AND phone IN (${phonePlaceholders})
         GROUP BY campaign_id, user_id, client_id, phone
       ) ml
       JOIN campaign_leads cl
         ON cl.campaign_id = ml.campaign_id
        AND cl.user_id = ml.user_id
        AND (cl.lead_id = ml.client_id OR cl.phone = ml.phone)
       JOIN campaign_history ch ON ch.id = cl.campaign_id
       WHERE 1 = 1
         ${whereBrand}
       ORDER BY
         CASE WHEN cl.phone = ? THEN 0 ELSE 1 END,
         COALESCE(cl.replied_at, cl.read_at, cl.delivered_at, cl.sent_at, ml.last_outbound_at, cl.updated_at, cl.created_at) DESC
       LIMIT 1`,
      fallbackParams
    );
  }

  // ─── Response processing ───────────────────────────────────────

  async processIncomingReply(
    userId: string,
    phone: string,
    messageText: string,
    timestamp: number,
    brandId?: string | null
  ): Promise<{ campaignId: string; classification: ReplyClassification; scoreDelta: number } | null> {
    const normalizedBrandId = String(brandId || "").trim();
    await this.ensureSchema();

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      logger.warn(`[CampaignReply] phone vazio/invalido recebido. raw="${phone}" userId=${userId} brandId=${normalizedBrandId || "(null)"}`);
      return null;
    }

    const phoneCandidates = buildPhoneCandidates(normalizedPhone);
    const ctx = `[CampaignReply phone=${normalizedPhone} userId=${userId.slice(0, 8)} brandId=${normalizedBrandId.slice(0, 8) || "(null)"}]`;

    let campaignLead = await this.findLatestReplyCandidate(
      userId,
      phoneCandidates,
      normalizedPhone,
      normalizedBrandId,
      false
    );
    let crossBrand = false;
    /* Fallback cross-brand: roda SEMPRE quando o primeiro lookup falha.
       Antes exigia normalizedBrandId nao-vazio, o que impedia o fallback quando a
       instancia estava sem brand_id (caso comum em instancias criadas antes do
       contexto de brand existir). Agora pega a resposta independente do brand
       da instancia — a campanha de origem manda no escopo. */
    if (!campaignLead) {
      campaignLead = await this.findLatestReplyCandidate(
        userId,
        phoneCandidates,
        normalizedPhone,
        normalizedBrandId,
        true
      );
      if (campaignLead) crossBrand = true;
    }

    if (!campaignLead) {
      /* Diagnostico: lead pode existir mas em status pending/failed, ou ter brand_id divergente.
         Logamos counters globais para ajudar diagnostico. */
      let pendingCount = 0;
      let totalCount = 0;
      try {
        const stats = await queryOne<{ total: number | string; pending: number | string }>(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN status IN ('pending','validating','failed','skipped') THEN 1 ELSE 0 END) AS pending
           FROM campaign_leads
           WHERE user_id = ?
             AND (phone IN (${phoneCandidates.map(() => "?").join(", ")}))`,
          [userId, ...phoneCandidates]
        );
        totalCount = Number(stats?.total) || 0;
        pendingCount = Number(stats?.pending) || 0;
      } catch {
        /* schema antigo — ignora */
      }

      if (totalCount > 0) {
        logger.warn(
          `${ctx} nao achou campaign_lead "matchavel" mas ${totalCount} row(s) existe(m) em campaign_leads (${pendingCount} em status pending/failed/skipped). Possivel causa: brand_id divergente entre campanha e instancia, ou status do lead exclui pelo filtro.`
        );
      } else {
        logger.info(`${ctx} sem campaign_lead correspondente — esse numero nao recebeu mensagem de campanha ainda (ou recebeu antes do tracking estar ativo).`);
      }
      return null;
    }

    if (crossBrand) {
      logger.warn(
        `${ctx} match encontrado APENAS via fallback cross-brand. Campanha foi criada em outro brand (brand_id=${String(campaignLead.brand_id || "").slice(0, 8) || "(null)"}) e a mensagem entrou em instancia de brand ${normalizedBrandId.slice(0, 8) || "(null)"}. Veja se sua instancia WhatsApp tem o brand_id correto.`
      );
    }

    // Classify the response
    const classification = this.classifyResponse(messageText);
    const scoreDelta = this.getScoreDelta(classification);

    const previousStatus = String(campaignLead.status || "").trim().toLowerCase();
    const previousClassification = String(campaignLead.reply_classification || "").trim() as ReplyClassification | "";
    const wasAlreadyReplied = previousStatus === "replied";

    // Update campaign_lead
    await update(
      `UPDATE campaign_leads
       SET status = 'replied',
           replied_at = COALESCE(replied_at, NOW()),
           read_at = COALESCE(read_at, NOW()),
           delivered_at = COALESCE(delivered_at, NOW()),
           reply_text = ?,
           reply_classification = ?,
           score_delta = ?
       WHERE id = ?`,
      [messageText, classification, scoreDelta, campaignLead.id]
    );

    // Update campaign counters
    const classificationDelta = {
      interested: 0,
      neutral: 0,
      negative: 0,
      optedOut: 0,
    };

    if (wasAlreadyReplied) {
      if (previousClassification && previousClassification !== classification) {
        if (previousClassification === "interested") classificationDelta.interested -= 1;
        if (previousClassification === "neutral") classificationDelta.neutral -= 1;
        if (previousClassification === "negative") classificationDelta.negative -= 1;
        if (previousClassification === "opt_out") classificationDelta.optedOut -= 1;

        if (classification === "interested") classificationDelta.interested += 1;
        if (classification === "neutral") classificationDelta.neutral += 1;
        if (classification === "negative") classificationDelta.negative += 1;
        if (classification === "opt_out") classificationDelta.optedOut += 1;
      }
    } else {
      if (classification === "interested") classificationDelta.interested = 1;
      if (classification === "neutral") classificationDelta.neutral = 1;
      if (classification === "negative") classificationDelta.negative = 1;
      if (classification === "opt_out") classificationDelta.optedOut = 1;
    }

    const repliedDelta = wasAlreadyReplied ? 0 : 1;
    const readDelta = !wasAlreadyReplied && (previousStatus === "sent" || previousStatus === "delivered") ? 1 : 0;

    const campaignBrandId = String(campaignLead.brand_id || "").trim();

    await update(
      `UPDATE campaign_history
       SET replied_count = GREATEST(0, replied_count + ?),
           read_count = GREATEST(0, read_count + ?),
           interested_count = GREATEST(0, interested_count + ?),
           neutral_count = GREATEST(0, neutral_count + ?),
           negative_count = GREATEST(0, negative_count + ?),
           opted_out_count = GREATEST(0, opted_out_count + ?)
       WHERE id = ? AND user_id = ? AND ${campaignBrandId ? "brand_id = ?" : "brand_id IS NULL"}`,
      campaignBrandId
        ? [
            repliedDelta,
            readDelta,
            classificationDelta.interested,
            classificationDelta.neutral,
            classificationDelta.negative,
            classificationDelta.optedOut,
            campaignLead.campaign_id,
            userId,
            campaignBrandId,
          ]
        : [
            repliedDelta,
            readDelta,
            classificationDelta.interested,
            classificationDelta.neutral,
            classificationDelta.negative,
            classificationDelta.optedOut,
            campaignLead.campaign_id,
            userId,
          ]
    );

    // Update lead tags and score
    await this.updateLeadAfterReply(userId, campaignLead.lead_id, classification, scoreDelta);

    logger.info(
      `${ctx} resposta registrada — campaign=${String(campaignLead.campaign_id || "").slice(0, 8)} classification=${classification} scoreDelta=${scoreDelta} repliedDelta=${repliedDelta} (was=${previousStatus || "(novo)"}).`
    );

    return {
      campaignId: campaignLead.campaign_id,
      classification,
      scoreDelta,
    };
  }

  // ─── Response classification ───────────────────────────────────

  private classifyResponse(text: string): ReplyClassification {
    const lower = text.toLowerCase().trim();

    // Opt-out signals
    const optOutPatterns = [
      "nao quero", "para de", "pare de", "nao me", "sair", "remover",
      "cancelar", "desinscrever", "nao tenho interesse", "nao preciso",
      "nao envie mais", "bloquear", "parar", "nao mande mais",
      "spam", "chega", "nao incomode", "me tire", "tire meu numero",
    ];
    if (optOutPatterns.some(p => lower.includes(p))) return "opt_out";

    // Negative signals
    const negativePatterns = [
      "nao obrigado", "sem interesse", "nao no momento", "agora nao",
      "nao estou", "estou satisfeito", "ja tenho", "nao preciso",
      "talvez depois", "nao e comigo", "numero errado",
    ];
    if (negativePatterns.some(p => lower.includes(p))) return "negative";

    // Interested signals
    const interestedPatterns = [
      "quero", "interesse", "sim", "manda", "envia", "quanto custa",
      "qual o preco", "qual valor", "como funciona", "me conta",
      "pode me", "quero saber", "gostaria", "tenho interesse",
      "falar mais", "mais detalhe", "mais informac", "pode explicar",
      "vamos conversar", "quero ver", "me fala", "whatsapp",
      "liga", "ligar", "agenda", "marcar", "horario", "disponivel",
      "preco", "valor", "orcamento", "proposta", "quando posso",
    ];
    if (interestedPatterns.some(p => lower.includes(p))) return "interested";

    // Short positive responses
    if (["sim", "ok", "pode ser", "opa", "bom dia", "boa tarde", "boa noite", "oi", "ola"].includes(lower)) {
      return "interested";
    }

    return "neutral";
  }

  private getScoreDelta(classification: ReplyClassification): number {
    switch (classification) {
      case "interested": return 30;
      case "neutral": return 5;
      case "negative": return -15;
      case "opt_out": return -50;
    }
  }

  private async updateLeadAfterReply(
    userId: string,
    leadId: string,
    classification: ReplyClassification,
    scoreDelta: number
  ): Promise<void> {
    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();

    const fields: string[] = [];
    const values: any[] = [];

    // Tags based on classification
    const tagsToAdd: string[] = ["respondeu"];
    let newStatus: string | null = null;

    switch (classification) {
      case "interested":
        tagsToAdd.push("interessado", "lead_quente");
        newStatus = "replied";
        break;
      case "neutral":
        tagsToAdd.push("lead_morno");
        break;
      case "negative":
        tagsToAdd.push("sem_interesse");
        newStatus = "lost";
        break;
      case "opt_out":
        tagsToAdd.push("opt_out", "bloqueado");
        newStatus = "lost";
        break;
    }

    // Remove aguardando_resposta tag, add new tags
    if (cols.has("tags")) {
      const currentLead = await queryOne<any>(
        `SELECT tags FROM customers WHERE id = ? LIMIT 1`,
        [leadId]
      );
      const currentTags = parseJsonArray(currentLead?.tags);
      const filteredTags = currentTags.filter(t => t.toLowerCase() !== "aguardando_resposta");
      const allTags = [...new Set([...filteredTags, ...tagsToAdd])];
      fields.push("tags = ?");
      values.push(JSON.stringify(allTags));
    }

    // Update status
    if (newStatus && cols.has("status")) {
      fields.push("status = ?");
      values.push(newStatus);
    }

    // Update score
    if (cols.has("lead_score")) {
      fields.push("lead_score = GREATEST(0, lead_score + ?)");
      values.push(scoreDelta);
    }

    // Update last_contact_at
    if (cols.has("last_contact_at")) {
      fields.push("last_contact_at = NOW()");
    }

    if (!fields.length) return;

    let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
    values.push(leadId);

    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      values.push(userId);
    }

    await update(sql, values);
  }

  // ─── Campaign media helpers ────────────────────────────────────

  /**
   * Resolve a media URL stored in campaign settings to an absolute filesystem path.
   * The frontend stores media as URLs like "/uploads/images/abc.jpg" via /api/media/upload.
   * This converts that to an absolute path on disk so it can be read for sending.
   * Also supports external HTTP URLs by downloading them to a temp cache.
   */
  private resolveCampaignMediaPath(mediaUrl: string | null | undefined): string | null {
    const cleaned = String(mediaUrl || "").trim();
    if (!cleaned) return null;

    // External URL — try to extract local path first if same domain
    if (/^https?:\/\//i.test(cleaned)) {
      const localMatch = cleaned.match(/\/uploads\/(.+)$/);
      if (localMatch) {
        const localPath = path.resolve(process.cwd(), "uploads", localMatch[1]);
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return localPath;
      }
      return this.downloadExternalMedia(cleaned);
    }

    const relative = cleaned.replace(/^\/+/, "");
    if (!relative.startsWith("uploads/")) return null;
    const absolute = path.resolve(process.cwd(), relative);
    if (!absolute.startsWith(path.resolve(process.cwd(), "uploads"))) return null;
    if (!fs.existsSync(absolute)) {
      logger.warn(`[Campaign] Media file not found: ${absolute}`);
      return null;
    }
    return absolute;
  }

  private downloadExternalMedia(url: string): string | null {
    try {
      const cacheDir = path.resolve(process.cwd(), "uploads", "media-cache");
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const hash = require("crypto").createHash("md5").update(url).digest("hex");
      const ext = (url.match(/\.(jpe?g|png|webp|gif|mp4|webm|pdf)(\?|$)/i) || [])[1] || "jpg";
      const cached = path.join(cacheDir, `${hash}.${ext}`);
      if (fs.existsSync(cached) && fs.statSync(cached).size > 0) return cached;
      const { execSync } = require("child_process");
      execSync(`curl -sL -o "${cached}" "${url}"`, { timeout: 30000 });
      if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
        logger.info(`[Campaign] Downloaded external media: ${url} → ${cached}`);
        return cached;
      }
      return null;
    } catch (err: any) {
      logger.warn(`[Campaign] Failed to download external media ${url}: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract media + link configuration from a campaign's settings JSON.
   */
  private extractCampaignMediaConfig(campaignSettings: any): {
    imagePath: string | null;
    imageCaption: string;
    imageUseTextAsCaption: boolean;
    videoPaths: string[];
    videoCaption: string;
    videoUseTextAsCaption: boolean;
    audioPath: string | null;
    audioVoiceNote: boolean;
    documentPath: string | null;
    documentName: string | null;
    linkUrl: string;
    product: { id: string; name: string; price: number; description: string } | null;
  } {
    const media = (campaignSettings && typeof campaignSettings === "object" && (campaignSettings as any).media) || {};
    const videoFiles: string[] = [];
    if (Array.isArray((media as any).videoFiles)) {
      for (const f of (media as any).videoFiles) {
        const p = this.resolveCampaignMediaPath(f);
        if (p) videoFiles.push(p);
      }
    }
    if (videoFiles.length === 0) {
      const legacy = this.resolveCampaignMediaPath((media as any).videoFileName);
      if (legacy) videoFiles.push(legacy);
    }
    const product = (media as any).product || null;
    let productImagePath: string | null = null;
    if (product?.imageUrl) {
      productImagePath = this.resolveCampaignMediaPath(product.imageUrl);
    }

    return {
      imagePath: this.resolveCampaignMediaPath((media as any).imageFileName) || productImagePath,
      imageCaption: String((media as any).imageCaption || "").trim(),
      imageUseTextAsCaption: Boolean((media as any).imageUseTextAsCaption),
      videoPaths: videoFiles.slice(0, 5),
      videoCaption: String((media as any).videoCaption || "").trim(),
      videoUseTextAsCaption: Boolean((media as any).videoUseTextAsCaption),
      audioPath: this.resolveCampaignMediaPath((media as any).audioFileName),
      audioVoiceNote: Boolean((media as any).audioVoiceNote),
      documentPath: this.resolveCampaignMediaPath((media as any).documentFileName),
      documentName: String((media as any).documentName || "").trim() || null,
      linkUrl: String((media as any).linkUrl || "").trim(),
      product: product ? { id: product.id, name: product.name, price: product.price, description: product.description || "" } : null,
    };
  }

  /**
   * Append a link URL to the message text so WhatsApp generates a link preview.
   * If the link is already in the text, returns the text unchanged.
   */
  private appendLinkToMessage(messageText: string, linkUrl: string): string {
    const url = String(linkUrl || "").trim();
    if (!url) return messageText;
    // If the URL is already present in the message, leave it alone
    if (messageText.includes(url)) return messageText;
    return `${messageText.trimEnd()}\n\n${url}`;
  }

  /**
   * Send a campaign message to a single lead, including any configured media + link.
   * Returns true if at least the primary message was delivered.
   *
   * Send order:
   *   1. Image (caption = text if useTextAsCaption, else explicit caption)
   *   2. Video (caption = text if useTextAsCaption, else explicit caption)
   *   3. Audio (voice note option)
   *   4. Document
   *   5. Text message (with link appended if configured) — only if not already used as caption
   */
  private async sendCampaignMessageWithMedia(
    instanceId: string,
    jid: string | null | undefined,
    phone: string,
    messageText: string,
    media: ReturnType<CampaignEngineService["extractCampaignMediaConfig"]>
  ): Promise<{ ok: boolean; instanceId: string; error?: string }> {
    const finalText = this.appendLinkToMessage(messageText, media.linkUrl);
    let textSent = false;
    let anyMediaSent = false;
    let lastError: string | undefined;

    // STRATEGY: Send TEXT FIRST (guaranteed small + fast delivery),
    // then send each media as a SEPARATE message.
    // Never use caption — captions on broken media cause messages to
    // appear as "loading" on recipient's WhatsApp and never display the text.

    // 1. Send text first (ALWAYS separate, never as caption)
    if (finalText.trim()) {
      try {
        const ok = jid
          ? await this.instanceManager.sendMessageByJid(instanceId, jid, finalText)
          : await this.instanceManager.sendMessage(instanceId, phone, finalText);
        if (ok) {
          textSent = true;
          logger.info(`[Campaign media] Text sent successfully to ${jid || phone}`);
        } else {
          lastError = "text send failed";
          logger.warn(`[Campaign media] Text send failed to ${jid || phone}`);
        }
      } catch (err: any) {
        lastError = `text: ${err.message}`;
        logger.error(`[Campaign media] Text send error: ${err.message}`);
      }

      // Small delay between text and media so recipient sees them in order
      if (textSent) await new Promise((r) => setTimeout(r, 1500));
    }

    const sendMedia = async (
      mediaType: "image" | "video" | "audio" | "document",
      filePath: string,
      opts: { voiceNote?: boolean; fileName?: string } = {}
    ): Promise<boolean> => {
      try {
        // Validate file exists and has size before sending
        if (!fs.existsSync(filePath)) {
          lastError = `${mediaType}: file not found`;
          logger.error(`[Campaign media] File not found: ${filePath}`);
          return false;
        }
        const stat = fs.statSync(filePath);
        if (stat.size === 0) {
          lastError = `${mediaType}: file empty`;
          logger.error(`[Campaign media] File is empty: ${filePath}`);
          return false;
        }

        const ok = jid
          ? await this.instanceManager.sendMediaByJid(instanceId, jid, {
              mediaType,
              filePath,
              voiceNote: opts.voiceNote,
              fileName: opts.fileName,
            })
          : await this.instanceManager.sendMedia(instanceId, phone, {
              mediaType,
              filePath,
              voiceNote: opts.voiceNote,
              fileName: opts.fileName,
            });
        if (ok) {
          anyMediaSent = true;
          logger.info(`[Campaign media] ${mediaType} sent successfully to ${jid || phone}`);
        } else {
          lastError = `${mediaType} send failed`;
          logger.warn(`[Campaign media] ${mediaType} send failed to ${jid || phone}`);
        }
        return ok;
      } catch (err: any) {
        lastError = `${mediaType}: ${err.message}`;
        logger.error(`[Campaign media] ${mediaType} error: ${err.message}`);
        return false;
      }
    };

    // 2. Image (always separate message, no caption)
    if (media.imagePath) {
      await sendMedia("image", media.imagePath);
      await new Promise((r) => setTimeout(r, 800));
    }

    // 3. Videos (up to 5, sequential with delay)
    for (let vi = 0; vi < media.videoPaths.length; vi++) {
      await sendMedia("video", media.videoPaths[vi]);
      if (vi < media.videoPaths.length - 1) {
        const delay = 2000 + Math.floor(Math.random() * 1500);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // 4. Audio
    if (media.audioPath) {
      await sendMedia("audio", media.audioPath, { voiceNote: media.audioVoiceNote });
      await new Promise((r) => setTimeout(r, 800));
    }

    // 5. Document
    if (media.documentPath) {
      await sendMedia("document", media.documentPath, {
        fileName: media.documentName || undefined,
      });
    }

    // Succeeded if text OR any media arrived. Text is the critical piece.
    const ok = textSent || anyMediaSent;
    return {
      ok,
      instanceId,
      error: ok ? undefined : (lastError || "Envio falhou"),
    };
  }

  // ─── Template filling ──────────────────────────────────────────

  private fillTemplate(template: string, lead: any): string {
    const values: Record<string, string> = {
      nome: String(lead.lead_name || lead.name || "").trim() || "Prezado(a)",
      telefone: normalizePhone(lead.phone || lead.lead_phone),
      cidade: String(lead.lead_city || lead.city || "sua cidade").trim(),
      estado: String(lead.lead_state || lead.state || "").trim(),
      segmento: String(lead.lead_category || lead.category || "seu segmento").trim(),
      categoria: String(lead.lead_category || lead.category || "").trim(),
    };

    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key.toLowerCase()] || "");
  }

  private hashSeed(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private resolveCampaignModeDirective(mode: string): string {
    const normalized = String(mode || "educational").trim().toLowerCase();
    if (normalized === "aggressive") {
      return "Tom comercial direto, objetivo e orientado a conversao, sem ser rude.";
    }
    if (normalized === "relationship") {
      return "Tom consultivo, humano e de relacionamento, priorizando dialogo e confianca.";
    }
    return "Tom educativo, util e objetivo, ajudando o lead a entender valor antes da oferta.";
  }

  private buildCampaignFirstTouchPrompt(campaign: Campaign, lead: any, campaignSettings: any): string {
    const composer = parseJsonSafe(campaignSettings?.composer || {}) as CampaignComposerSettings;
    const triggers = parseJsonSafe(campaignSettings?.triggers || {});

    const intentText = String(composer.intentText || "").trim();
    const baseInstruction = String(campaign.ai_prompt || campaign.message_template || "").trim();
    const personalized = composer.personalizedPerLead !== false;
    const autoVariations = composer.useAutoVariations !== false;
    const isInitialTrigger = Boolean(triggers?.onNewLead ?? true);

    const seed = String(lead?.lead_id || lead?.id || lead?.phone || lead?.lead_phone || campaign.id || "seed");
    const variationIndex = (this.hashSeed(seed) % 3) + 1;

    const leadName = String(lead?.lead_name || lead?.name || "Lead").trim() || "Lead";
    const leadCity = String(lead?.lead_city || lead?.city || "").trim();
    const leadCategory = String(lead?.lead_category || lead?.category || "").trim();

    const objective = intentText || baseInstruction || "Executar primeiro contato comercial com contexto real da campanha.";
    const strictContext = [baseInstruction, intentText].filter(Boolean).join("\n\n");

    const personalizationLine = personalized
      ? `Personalize para este lead quando houver dado real: nome=${leadName}; cidade=${leadCity || "nao informada"}; segmento=${leadCategory || "nao informado"}.`
      : "Nao personalize por lead; use mensagem padronizada consistente para toda a campanha.";

    const variationLine = autoVariations
      ? `Use variacao numero ${variationIndex} (de 3) para evitar repeticao, mantendo o mesmo objetivo.`
      : "Use versao unica e consistente (sem variacoes entre leads).";

    return [
      `OBJETIVO DA CAMPANHA: ${objective}`,
      `MODO DA CAMPANHA: ${this.resolveCampaignModeDirective(campaign.campaign_mode)}`,
      isInitialTrigger
        ? "CONTEXTO DE DISPARO: Esta e uma mensagem inicial de primeiro contato da campanha."
        : "CONTEXTO DE DISPARO: Respeite o gatilho configurado para este envio.",
      "REGRAS OBRIGATORIAS:",
      "- Nao invente fatos, nomes, produtos, promocoes ou condicoes que nao estejam no contexto.",
      "- Nao se apresente com nome proprio se o nome do atendente nao estiver explicitamente definido no contexto base.",
      "- Se o contexto base definir o nome do atendente, use exatamente esse nome, sem trocar.",
      "- Se o contexto base indicar foco comercial/industrial/atacado, priorize volumes comerciais e evite oferta de menor volume/varejo.",
      "- Nao mude o objetivo definido pela composicao da campanha.",
      "- Mensagem curta, clara e coerente com o contexto, com CTA simples no final.",
      personalizationLine,
      variationLine,
      strictContext ? `CONTEXTO BASE DA COMPOSICAO:\n${strictContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private buildFallbackTemplate(campaign: Campaign, campaignSettings: any): string {
    const explicitTemplate = String(campaign.message_template || "").trim();
    if (explicitTemplate) return explicitTemplate;

    const composer = parseJsonSafe(campaignSettings?.composer || {}) as CampaignComposerSettings;
    const intentText = String(composer.intentText || "").trim();
    if (intentText) {
      return `Oi {{nome}}, tudo bem? ${intentText} Podemos falar rapidamente?`;
    }

    const aiPrompt = String(campaign.ai_prompt || "").trim();
    if (aiPrompt) return aiPrompt;

    return "Oi {{nome}}, tudo bem? Quero te apresentar uma proposta rapida que pode ajudar seu negocio. Podemos falar?";
  }

  // ─── Map helpers ───────────────────────────────────────────────

  private mapCampaign(row: any): Campaign {
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      brand_id: row.brand_id ? String(row.brand_id) : null,
      company_id: row.company_id || null,
      instance_id: String(row.instance_id || ""),
      name: String(row.name || ""),
      message_template: row.message_template || null,
      ai_prompt: row.ai_prompt || null,
      use_ai: Number(row.use_ai || 0) === 1,
      filter_json: parseJsonSafe(row.filter_json) as CampaignFilterCriteria,
      speed_json: { ...DEFAULT_SPEED, ...parseJsonSafe(row.speed_json) } as CampaignSpeedControl,
      campaign_mode: String(row.campaign_mode || "educational"),
      settings: parseJsonSafe(row.settings),
      use_instance_rotation: Number(row.use_instance_rotation || 0) === 1,
      rotation_mode: (String(row.rotation_mode || "balanced") as RotationMode) || "balanced",
      target_count: Number(row.target_count || 0),
      sent_count: Number(row.sent_count || 0),
      delivered_count: Number(row.delivered_count || 0),
      read_count: Number(row.read_count || 0),
      replied_count: Number(row.replied_count || 0),
      failed_count: Number(row.failed_count || 0),
      interested_count: Number(row.interested_count || 0),
      neutral_count: Number(row.neutral_count || 0),
      negative_count: Number(row.negative_count || 0),
      opted_out_count: Number(row.opted_out_count || 0),
      status: String(row.status || "draft") as CampaignStatus,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: new Date(row.created_at || Date.now()).toISOString(),
      updated_at: new Date(row.updated_at || Date.now()).toISOString(),
    };
  }

  private mapCampaignLead(row: any): CampaignLeadRecord {
    return {
      id: String(row.id),
      campaign_id: String(row.campaign_id),
      lead_id: String(row.lead_id),
      phone: String(row.phone || ""),
      whatsapp_valid: toNullableBoolean(row.whatsapp_valid),
      whatsapp_jid: row.whatsapp_jid || null,
      message_text: row.message_text || null,
      ai_generated: Number(row.ai_generated || 0) === 1,
      status: String(row.status || "pending") as CampaignLeadStatus,
      sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      replied_at: row.replied_at ? new Date(row.replied_at).toISOString() : null,
      reply_text: row.reply_text || null,
      reply_classification: row.reply_classification || null,
      score_delta: Number(row.score_delta || 0),
      tags_added: parseJsonArray(row.tags_added),
      error_message: row.error_message || null,
      attempt_count: Number(row.attempt_count || 0),
      lead_name: row.lead_name || undefined,
      lead_city: row.lead_city || undefined,
      lead_category: row.lead_category || undefined,
    };
  }

  // ─── Preview (dry-run) ─────────────────────────────────────────

  async previewCampaign(
    userId: string,
    filter: CampaignFilterCriteria,
    brandId?: string | null
  ): Promise<{ count: number; leads: Array<{ id: string; name: string; phone: string; city: string; category: string; tags: string[] }> }> {
    const allLeads = await this.filterLeadsByBrand(userId, filter, brandId);

    const mapped = allLeads.slice(0, 100).map(lead => ({
      id: String(lead.id),
      name: String(lead.name || ""),
      phone: String(lead.phone || ""),
      city: String(lead.city || ""),
      category: String(lead.category || ""),
      tags: parseJsonArray(lead.tags),
    }));

    return { count: allLeads.length, leads: mapped };
  }

  // ─── Check for scheduled campaigns ─────────────────────────────

  async processScheduledCampaigns(): Promise<void> {
    await this.ensureSchema();

    const due = await query<any[]>(
      `SELECT id, user_id, brand_id, name FROM campaign_history
       WHERE status = 'scheduled' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC LIMIT 5`
    );

    for (const row of due) {
      logger.info(`[Scheduler] Starting scheduled campaign ${row.id} ("${row.name}")`);
      const result = await this.startCampaign(row.user_id, row.id, row.brand_id || null);
      if (!result.ok) {
        logger.warn(`[Scheduler] Campanha "${row.name}" (${row.id}) falhou ao iniciar: ${result.message}`);
      }
    }
  }

  async resumeRunningCampaigns(): Promise<void> {
    await this.ensureSchema();

    const runningRows = await query<any[]>(
      `SELECT id, user_id, brand_id
       FROM campaign_history
       WHERE status = 'running'
       ORDER BY started_at DESC
       LIMIT 30`
    );

    for (const row of runningRows) {
      const campaignId = String(row.id || "").trim();
      const userId = String(row.user_id || "").trim();
      const brandId = String(row.brand_id || "").trim() || null;
      if (!campaignId || !userId) continue;
      if (this.activeCampaigns.get(campaignId)) continue;

      const campaign = await this.getCampaign(userId, campaignId, brandId);
      if (!campaign) continue;

      const queueCount = await this.ensureCampaignQueueReady(userId, campaign, brandId);
      if (queueCount <= 0) continue;

      this.activeCampaigns.set(campaignId, true);
      this.executeCampaign(userId, campaignId, brandId).catch((err) => {
        logger.error(`Campaign ${campaignId} auto-resume failed: ${err.message}`);
      });
      logger.info(`[Scheduler] Resumed running campaign ${campaignId} with ${queueCount} pending leads`);
    }
  }

  isCampaignActive(campaignId: string): boolean {
    return this.activeCampaigns.get(campaignId) === true;
  }

  private async filterLeadsByBrand(
    userId: string,
    filter: CampaignFilterCriteria,
    brandId?: string | null
  ): Promise<any[]> {
    await this.ensureSchema();

    const cols = await this.getCustomerColumns();
    const ownerCol = await this.getOwnerColumn();
    const normalizedBrandId = String(brandId || "").trim();

    const conditions: string[] = [];
    const params: any[] = [];

    if (ownerCol) {
      conditions.push(`${ownerCol} = ?`);
      params.push(userId);
    }

    if (cols.has("brand_id")) {
      if (normalizedBrandId) {
        conditions.push("brand_id = ?");
        params.push(normalizedBrandId);
      } else {
        conditions.push("brand_id IS NULL");
      }
    }

    if (cols.has("phone")) {
      conditions.push(`phone IS NOT NULL AND TRIM(phone) != ''`);
    }

    if (filter.statuses?.length) {
      const expandedStatuses = expandStatusFilterVariants(filter.statuses);
      if (expandedStatuses.length > 0) {
        const placeholders = expandedStatuses.map(() => "?").join(",");
        conditions.push(`LOWER(TRIM(COALESCE(status, ''))) IN (${placeholders})`);
        params.push(...expandedStatuses);
      }
    }

    if (filter.cities?.length) {
      const cityCol = cols.has("city") ? "city" : cols.has("address_city") ? "address_city" : null;
      if (cityCol) {
        const placeholders = filter.cities.map(() => "?").join(",");
        conditions.push(`${cityCol} IN (${placeholders})`);
        params.push(...filter.cities);
      }
    }

    if (filter.sources?.length && cols.has("source")) {
      const placeholders = filter.sources.map(() => "?").join(",");
      conditions.push(`source IN (${placeholders})`);
      params.push(...filter.sources);
    }

    if (cols.has("lead_score")) {
      if (typeof filter.scoreMin === "number") {
        conditions.push("lead_score >= ?");
        params.push(filter.scoreMin);
      }
      if (typeof filter.scoreMax === "number") {
        conditions.push("lead_score <= ?");
        params.push(filter.scoreMax);
      }
    }

    if (filter.segments?.length && cols.has("category")) {
      const placeholders = filter.segments.map(() => "?").join(",");
      conditions.push(`category IN (${placeholders})`);
      params.push(...filter.segments);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const selectCols = [
      "id", "name", "phone",
      cols.has("status") ? "status" : "'new' AS status",
      cols.has("tags") ? "tags" : "NULL AS tags",
      cols.has("city") ? "city" : cols.has("address_city") ? "address_city AS city" : "NULL AS city",
      cols.has("state") ? "state" : "NULL AS state",
      cols.has("category") ? "category" : "NULL AS category",
      cols.has("lead_score") ? "lead_score" : "0 AS lead_score",
      cols.has("source") ? "source" : "'manual' AS source",
      cols.has("source_details") ? "source_details" : "NULL AS source_details",
    ].join(", ");

    let leads = await query<any[]>(
      `SELECT ${selectCols} FROM customers ${where} ORDER BY id ASC`,
      params
    );

    if (filter.tagsInclude?.length) {
      leads = leads.filter(lead => {
        const tags = parseJsonArray(lead.tags);
        const tagsLower = new Set(tags.map(t => t.toLowerCase()));
        return filter.tagsInclude!.some(tag => tagsLower.has(tag.toLowerCase()));
      });
    }

    if (filter.tagsExclude?.length) {
      leads = leads.filter(lead => {
        const tags = parseJsonArray(lead.tags);
        const tagsLower = new Set(tags.map(t => t.toLowerCase()));
        return !filter.tagsExclude!.some(tag => tagsLower.has(tag.toLowerCase()));
      });
    }

    if (filter.hasWhatsapp === true) {
      leads = leads.filter(lead => {
        const details = parseJsonSafe(lead.source_details);
        const validation = details?.whatsapp_validation || {};
        return validation?.has_whatsapp === true || isTruthyFlag(lead.whatsapp_valid);
      });
    }

    leads = leads.filter(lead => {
      const tags = parseJsonArray(lead.tags);
      const tagsLower = new Set(tags.map(t => t.toLowerCase()));
      return !tagsLower.has("opt_out") && !tagsLower.has("bloqueado");
    });

    return leads;
  }
}
