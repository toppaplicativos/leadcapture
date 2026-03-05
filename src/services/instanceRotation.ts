import { randomUUID } from "crypto";
import { query, queryOne, update } from "../config/database";
import { InstanceManager } from "../core/instanceManager";
import { logger } from "../utils/logger";

export type RotationMode = "balanced" | "conservative" | "aggressive";

type RotationSettings = {
  user_id: string;
  enabled: boolean;
  mode: RotationMode;
  health_min: number;
  risk_max: number;
  global_slowdown_factor: number;
  block_threshold_24h: number;
};

type RotationPoolRow = {
  instance_id: string;
  status_override: string;
  priority_weight: number;
  daily_limit: number;
  hourly_limit: number;
  per_minute_limit: number;
  min_interval_seconds: number;
};

type Candidate = {
  instanceId: string;
  status: string;
  healthScore: number;
  riskScore: number;
  dailyLimit: number;
  hourlyLimit: number;
  perMinuteLimit: number;
  sentToday: number;
  sentLastHour: number;
  sentLastMinute: number;
  failedLastHour: number;
  lastUsedAt: string | null;
  minIntervalSeconds: number;
  secondsSinceLastUse: number;
  priorityWeight: number;
  eligible: boolean;
  reason?: string;
};

export type RotationPoolItem = Candidate & {
  selected: boolean;
};

export type RotationPoolSnapshot = {
  settings: RotationSettings;
  items: RotationPoolItem[];
};

type SelectOptions = {
  leadId?: string;
  preferredInstanceId?: string;
  excludedInstanceIds?: string[];
};

type SendOptions = {
  userId: string;
  phone: string;
  message: string;
  leadId?: string;
  campaignId?: string;
  automationCode?: string;
  preferredInstanceId?: string;
  maxAttempts?: number;
};

type SendResult = {
  ok: boolean;
  instanceId?: string;
  error?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizePhoneDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

export class InstanceRotationService {
  private schemaReady = false;

  constructor(private readonly instanceManager: InstanceManager) {}

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS instance_rotation_settings (
        user_id VARCHAR(36) PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        mode ENUM('balanced','conservative','aggressive') NOT NULL DEFAULT 'balanced',
        health_min INT NOT NULL DEFAULT 60,
        risk_max INT NOT NULL DEFAULT 80,
        global_slowdown_factor DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        block_threshold_24h INT NOT NULL DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_rotation_settings_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS instance_rotation_pool (
        user_id VARCHAR(36) NOT NULL,
        instance_id VARCHAR(36) NOT NULL,
        status_override ENUM('online','paused','blocked') NOT NULL DEFAULT 'online',
        priority_weight INT NOT NULL DEFAULT 100,
        daily_limit INT NOT NULL DEFAULT 200,
        hourly_limit INT NOT NULL DEFAULT 45,
        per_minute_limit INT NOT NULL DEFAULT 3,
        min_interval_seconds INT NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, instance_id),
        KEY idx_rotation_pool_status (user_id, status_override)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS instance_rotation_metrics (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        instance_id VARCHAR(36) NOT NULL,
        lead_id VARCHAR(64) NULL,
        campaign_id VARCHAR(36) NULL,
        automation_code VARCHAR(120) NULL,
        direction ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound',
        status ENUM('sent','failed','blocked') NOT NULL,
        error_code VARCHAR(120) NULL,
        response_time_seconds INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_rotation_metrics_instance_time (instance_id, created_at),
        KEY idx_rotation_metrics_user_time (user_id, created_at),
        KEY idx_rotation_metrics_status_time (status, created_at),
        KEY idx_rotation_metrics_lead (user_id, lead_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS lead_instance_affinity (
        user_id VARCHAR(36) NOT NULL,
        lead_id VARCHAR(64) NOT NULL,
        instance_id VARCHAR(36) NOT NULL,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, lead_id),
        KEY idx_affinity_instance (user_id, instance_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    this.schemaReady = true;
  }

  private modeDefaults(mode: RotationMode): {
    daily_limit: number;
    hourly_limit: number;
    per_minute_limit: number;
    min_interval_seconds: number;
  } {
    if (mode === "aggressive") {
      return { daily_limit: 350, hourly_limit: 90, per_minute_limit: 6, min_interval_seconds: 6 };
    }
    if (mode === "conservative") {
      return { daily_limit: 120, hourly_limit: 24, per_minute_limit: 2, min_interval_seconds: 20 };
    }
    return { daily_limit: 220, hourly_limit: 48, per_minute_limit: 3, min_interval_seconds: 12 };
  }

  private async ensureSettings(userId: string): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO instance_rotation_settings (user_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [userId]
    );
  }

  private async ensurePoolForConnectedInstances(userId: string): Promise<void> {
    const settings = await this.getSettings(userId);
    const defaults = this.modeDefaults(settings.mode);

    const instances = await query<any[]>(
      `SELECT id
       FROM whatsapp_instances
       WHERE created_by = ?`,
      [userId]
    );

    for (const row of instances) {
      await query(
        `INSERT INTO instance_rotation_pool (
          user_id, instance_id, status_override, priority_weight, daily_limit, hourly_limit, per_minute_limit, min_interval_seconds
        ) VALUES (?, ?, 'online', 100, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE instance_id = instance_id`,
        [userId, String(row.id), defaults.daily_limit, defaults.hourly_limit, defaults.per_minute_limit, defaults.min_interval_seconds]
      );
    }
  }

  async getSettings(userId: string): Promise<RotationSettings> {
    await this.ensureSettings(userId);

    const row = await queryOne<any>(
      `SELECT user_id, enabled, mode, health_min, risk_max, global_slowdown_factor, block_threshold_24h
       FROM instance_rotation_settings
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    return {
      user_id: userId,
      enabled: Number(row?.enabled || 0) === 1,
      mode: (String(row?.mode || "balanced") as RotationMode) || "balanced",
      health_min: clamp(Number(row?.health_min || 60), 0, 100),
      risk_max: clamp(Number(row?.risk_max || 80), 0, 100),
      global_slowdown_factor: clamp(Number(row?.global_slowdown_factor || 1), 0.5, 3),
      block_threshold_24h: Math.max(1, Number(row?.block_threshold_24h || 3)),
    };
  }

  async updateSettings(
    userId: string,
    patch: Partial<Pick<RotationSettings, "enabled" | "mode" | "health_min" | "risk_max" | "global_slowdown_factor" | "block_threshold_24h">>
  ): Promise<RotationSettings> {
    await this.ensureSettings(userId);

    const fields: string[] = [];
    const values: any[] = [];

    if (patch.enabled !== undefined) {
      fields.push("enabled = ?");
      values.push(patch.enabled ? 1 : 0);
    }
    if (patch.mode) {
      const mode = ["balanced", "conservative", "aggressive"].includes(String(patch.mode))
        ? String(patch.mode)
        : "balanced";
      fields.push("mode = ?");
      values.push(mode);
    }
    if (patch.health_min !== undefined) {
      fields.push("health_min = ?");
      values.push(clamp(Number(patch.health_min), 0, 100));
    }
    if (patch.risk_max !== undefined) {
      fields.push("risk_max = ?");
      values.push(clamp(Number(patch.risk_max), 0, 100));
    }
    if (patch.global_slowdown_factor !== undefined) {
      fields.push("global_slowdown_factor = ?");
      values.push(clamp(Number(patch.global_slowdown_factor), 0.5, 3));
    }
    if (patch.block_threshold_24h !== undefined) {
      fields.push("block_threshold_24h = ?");
      values.push(Math.max(1, Math.floor(Number(patch.block_threshold_24h))));
    }

    if (fields.length) {
      values.push(userId);
      await update(
        `UPDATE instance_rotation_settings
         SET ${fields.join(", ")}, updated_at = NOW()
         WHERE user_id = ?`,
        values
      );
    }

    const next = await this.getSettings(userId);
    await this.ensurePoolForConnectedInstances(userId);
    return next;
  }

  private async getPoolRows(userId: string): Promise<Record<string, RotationPoolRow>> {
    await this.ensurePoolForConnectedInstances(userId);
    const rows = await query<any[]>(
      `SELECT instance_id, status_override, priority_weight, daily_limit, hourly_limit, per_minute_limit, min_interval_seconds
       FROM instance_rotation_pool
       WHERE user_id = ?`,
      [userId]
    );

    const map: Record<string, RotationPoolRow> = {};
    for (const row of rows) {
      map[String(row.instance_id)] = {
        instance_id: String(row.instance_id),
        status_override: String(row.status_override || "online"),
        priority_weight: Number(row.priority_weight || 100),
        daily_limit: Number(row.daily_limit || 200),
        hourly_limit: Number(row.hourly_limit || 45),
        per_minute_limit: Number(row.per_minute_limit || 3),
        min_interval_seconds: Number(row.min_interval_seconds || 10),
      };
    }
    return map;
  }

  private async getAffinityInstance(userId: string, leadId?: string): Promise<string | null> {
    if (!leadId) return null;
    const row = await queryOne<{ instance_id: string }>(
      `SELECT instance_id
       FROM lead_instance_affinity
       WHERE user_id = ? AND lead_id = ?
       LIMIT 1`,
      [userId, leadId]
    );
    return row?.instance_id || null;
  }

  private async setAffinity(userId: string, leadId: string, instanceId: string): Promise<void> {
    await query(
      `INSERT INTO lead_instance_affinity (user_id, lead_id, instance_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE instance_id = VALUES(instance_id), last_used_at = NOW()`,
      [userId, leadId, instanceId]
    );
  }

  async recordSendMetric(input: {
    userId: string;
    instanceId: string;
    leadId?: string;
    campaignId?: string;
    automationCode?: string;
    status: "sent" | "failed" | "blocked";
    errorCode?: string;
    responseTimeSeconds?: number;
  }): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO instance_rotation_metrics (
        id, user_id, instance_id, lead_id, campaign_id, automation_code, direction, status, error_code, response_time_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, 'outbound', ?, ?, ?)`,
      [
        randomUUID(),
        input.userId,
        input.instanceId,
        input.leadId || null,
        input.campaignId || null,
        input.automationCode || null,
        input.status,
        input.errorCode || null,
        input.responseTimeSeconds || null,
      ]
    );

    if (input.status === "sent" && input.leadId) {
      await this.setAffinity(input.userId, String(input.leadId), input.instanceId);
    }
  }

  private async candidateMetrics(instanceId: string): Promise<{
    sentToday: number;
    sentLastHour: number;
    sentLastMinute: number;
    failedLastHour: number;
    blocked24h: number;
    total24h: number;
    failed24h: number;
    lastUsedAt: string | null;
  }> {
    const rows = await query<any[]>(
      `SELECT
         SUM(CASE WHEN status = 'sent' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS sentToday,
         SUM(CASE WHEN status = 'sent' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS sentLastHour,
         SUM(CASE WHEN status = 'sent' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE) THEN 1 ELSE 0 END) AS sentLastMinute,
         SUM(CASE WHEN status IN ('failed','blocked') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS failedLastHour,
         SUM(CASE WHEN status = 'blocked' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS blocked24h,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS total24h,
         SUM(CASE WHEN status IN ('failed','blocked') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS failed24h,
         MAX(CASE WHEN status = 'sent' THEN created_at ELSE NULL END) AS lastUsedAt
       FROM instance_rotation_metrics
       WHERE instance_id = ?`,
      [instanceId]
    );

    const row = rows?.[0] || {};
    return {
      sentToday: Number(row.sentToday || 0),
      sentLastHour: Number(row.sentLastHour || 0),
      sentLastMinute: Number(row.sentLastMinute || 0),
      failedLastHour: Number(row.failedLastHour || 0),
      blocked24h: Number(row.blocked24h || 0),
      total24h: Number(row.total24h || 0),
      failed24h: Number(row.failed24h || 0),
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    };
  }

  private calcHealthRisk(metrics: {
    total24h: number;
    failed24h: number;
    blocked24h: number;
  }): { healthScore: number; riskScore: number } {
    const total = Math.max(1, metrics.total24h);
    const failRate = metrics.failed24h / total;
    const blockRate = metrics.blocked24h / total;

    const riskScore = clamp(Math.round(blockRate * 100 * 1.6 + failRate * 100 * 0.8), 0, 100);
    const healthScore = clamp(100 - Math.round(failRate * 100 * 0.9 + blockRate * 100 * 1.4), 0, 100);
    return { healthScore, riskScore };
  }

  private candidateScore(candidate: Candidate): number {
    const loadRatioHour = candidate.hourlyLimit > 0 ? candidate.sentLastHour / candidate.hourlyLimit : 1;
    const loadRatioDay = candidate.dailyLimit > 0 ? candidate.sentToday / candidate.dailyLimit : 1;
    const loadPenalty = (loadRatioHour * 40) + (loadRatioDay * 30);

    const timeBonus = Math.min(30, Math.floor(candidate.secondsSinceLastUse / 10));
    const healthBonus = candidate.healthScore * 0.9;
    const riskPenalty = candidate.riskScore * 0.8;
    const priorityBonus = Math.max(0, candidate.priorityWeight / 5);

    return healthBonus + timeBonus + priorityBonus - loadPenalty - riskPenalty;
  }

  private applyGlobalRiskThrottle(settings: RotationSettings, candidates: Candidate[]): Candidate[] {
    const blockedSum = candidates.reduce((sum, item) => sum + (item.riskScore > 90 ? 1 : 0), 0);
    if (blockedSum < settings.block_threshold_24h) return candidates;

    return candidates.map((item) => {
      const reduced = {
        ...item,
        hourlyLimit: Math.max(1, Math.floor(item.hourlyLimit * 0.7)),
        perMinuteLimit: Math.max(1, Math.floor(item.perMinuteLimit * 0.7)),
      };
      return reduced;
    });
  }

  async getPoolSnapshot(userId: string, leadId?: string): Promise<RotationPoolSnapshot> {
    await this.ensureSchema();
    const settings = await this.getSettings(userId);
    const pool = await this.getPoolRows(userId);
    const runtimeConnected = this.instanceManager.getAllInstances(userId).filter((i) => i.status === "connected");
    const affinity = await this.getAffinityInstance(userId, leadId);

    const candidatesRaw: Candidate[] = [];
    for (const runtime of runtimeConnected) {
      const poolRow = pool[runtime.id];
      if (!poolRow) continue;

      const m = await this.candidateMetrics(runtime.id);
      const hr = this.calcHealthRisk(m);
      const nowMs = Date.now();
      const lastMs = m.lastUsedAt ? new Date(m.lastUsedAt).getTime() : 0;
      const secondsSinceLastUse = lastMs > 0 ? Math.max(0, Math.floor((nowMs - lastMs) / 1000)) : 10_000;

      const base: Candidate = {
        instanceId: runtime.id,
        status: runtime.status,
        healthScore: hr.healthScore,
        riskScore: hr.riskScore,
        dailyLimit: poolRow.daily_limit,
        hourlyLimit: poolRow.hourly_limit,
        perMinuteLimit: poolRow.per_minute_limit,
        sentToday: m.sentToday,
        sentLastHour: m.sentLastHour,
        sentLastMinute: m.sentLastMinute,
        failedLastHour: m.failedLastHour,
        lastUsedAt: m.lastUsedAt,
        minIntervalSeconds: poolRow.min_interval_seconds,
        secondsSinceLastUse,
        priorityWeight: poolRow.priority_weight,
        eligible: true,
      };

      if (poolRow.status_override !== "online") {
        base.eligible = false;
        base.reason = `status_override:${poolRow.status_override}`;
      } else if (base.sentToday >= base.dailyLimit) {
        base.eligible = false;
        base.reason = "daily_limit";
      } else if (base.sentLastHour >= base.hourlyLimit) {
        base.eligible = false;
        base.reason = "hourly_limit";
      } else if (base.sentLastMinute >= base.perMinuteLimit) {
        base.eligible = false;
        base.reason = "per_minute_limit";
      } else if (base.healthScore < settings.health_min) {
        base.eligible = false;
        base.reason = "health_low";
      } else if (base.riskScore > settings.risk_max) {
        base.eligible = false;
        base.reason = "risk_high";
      } else if (base.secondsSinceLastUse < base.minIntervalSeconds) {
        base.eligible = false;
        base.reason = "min_interval";
      }

      candidatesRaw.push(base);
    }

    const throttled = this.applyGlobalRiskThrottle(settings, candidatesRaw);
    const sorted = [...throttled].sort((a, b) => this.candidateScore(b) - this.candidateScore(a));
    const selected = sorted.find((item) => item.eligible)?.instanceId || null;

    const items: RotationPoolItem[] = sorted.map((item) => ({
      ...item,
      selected: item.instanceId === (affinity || selected),
    }));

    return { settings, items };
  }

  async selectInstance(userId: string, options?: SelectOptions): Promise<string | null> {
    await this.ensureSchema();
    const settings = await this.getSettings(userId);

    const excluded = new Set((options?.excludedInstanceIds || []).map((id) => String(id)));
    const preferred = String(options?.preferredInstanceId || "").trim();

    const snapshot = await this.getPoolSnapshot(userId, options?.leadId);
    const eligible = snapshot.items.filter((item) => item.eligible && !excluded.has(item.instanceId));

    if (!settings.enabled) {
      if (preferred && !excluded.has(preferred)) {
        const preferredRuntime = this.instanceManager.getInstance(preferred, userId);
        if (preferredRuntime?.status === "connected") return preferred;
      }

      if (eligible[0]) return eligible[0].instanceId;
      const fallback = this.instanceManager.getAllInstances(userId).find((item) => item.status === "connected");
      return fallback?.id || null;
    }

    const affinity = await this.getAffinityInstance(userId, options?.leadId);
    if (affinity && !excluded.has(affinity)) {
      const affinityRow = eligible.find((item) => item.instanceId === affinity);
      if (affinityRow) return affinity;
    }

    if (preferred && !excluded.has(preferred)) {
      const preferredEligible = eligible.find((item) => item.instanceId === preferred);
      if (preferredEligible) return preferred;
    }

    if (!eligible.length) return null;
    return eligible[0].instanceId;
  }

  private buildPhoneCandidates(phone: string): string[] {
    const raw = normalizePhoneDigits(phone);
    if (!raw) return [];

    const candidates = new Set<string>();
    candidates.add(raw);

    const noLeadingZero = raw.replace(/^0+/, "");
    if (noLeadingZero) candidates.add(noLeadingZero);

    const normalized = noLeadingZero || raw;
    const likelyLocalBr = normalized.length === 10 || normalized.length === 11;
    if (likelyLocalBr && !normalized.startsWith("55")) {
      candidates.add(`55${normalized}`);
    }

    return Array.from(candidates).filter(Boolean);
  }

  async sendTextWithFailover(input: SendOptions): Promise<SendResult> {
    const maxAttempts = Math.max(1, Math.min(5, Math.floor(Number(input.maxAttempts || 3))));
    const excluded: string[] = [];
    let lastError = "no_instance_available";
    const phoneCandidates = this.buildPhoneCandidates(input.phone);

    if (!phoneCandidates.length) {
      logger.warn(`Rotation send failed for user ${input.userId}: invalid_phone`);
      return { ok: false, error: "invalid_phone" };
    }

    for (let i = 0; i < maxAttempts; i += 1) {
      const instanceId = await this.selectInstance(input.userId, {
        leadId: input.leadId,
        preferredInstanceId: i === 0 ? input.preferredInstanceId : undefined,
        excludedInstanceIds: excluded,
      });

      if (!instanceId) {
        lastError = "no_instance_available";
        break;
      }

      try {
        let sent = false;
        let candidateError = "send_failed";

        for (const candidatePhone of phoneCandidates) {
          const candidateSent = await this.instanceManager.sendMessage(instanceId, candidatePhone, input.message);
          if (candidateSent) {
            sent = true;
            break;
          }
          candidateError = "send_failed";
        }

        if (sent) {
          await this.recordSendMetric({
            userId: input.userId,
            instanceId,
            leadId: input.leadId,
            campaignId: input.campaignId,
            automationCode: input.automationCode,
            status: "sent",
          });

          return { ok: true, instanceId };
        }

        excluded.push(instanceId);
        lastError = candidateError;

        await this.recordSendMetric({
          userId: input.userId,
          instanceId,
          leadId: input.leadId,
          campaignId: input.campaignId,
          automationCode: input.automationCode,
          status: "failed",
          errorCode: "send_failed",
        });
      } catch (error: any) {
        const message = String(error?.message || "send_exception");
        excluded.push(instanceId);
        lastError = message;

        await this.recordSendMetric({
          userId: input.userId,
          instanceId,
          leadId: input.leadId,
          campaignId: input.campaignId,
          automationCode: input.automationCode,
          status: message.toLowerCase().includes("blocked") ? "blocked" : "failed",
          errorCode: message.slice(0, 110),
        });
      }
    }

    logger.warn(`Rotation send failed for user ${input.userId}: ${lastError}`);
    return { ok: false, error: lastError };
  }
}
