import { randomUUID } from "crypto";
import { getPool, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import type { PushAppContext } from "../config/push-events";
import type { PlatformActionType } from "../config/notification-events";

export type ActionStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "completed"
  | "cancelled"
  | "expired"
  | "escalated"
  | "reassigned";

export type ActionPriority = "low" | "normal" | "high" | "urgent" | "critical";

export type PlatformAction = {
  id: string;
  organization_id: string;
  app_context: PushAppContext;
  assigned_to_user_id: string;
  assigned_to_role?: string | null;
  created_by: string;
  source_event_key: string;
  source_notification_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  description?: string | null;
  action_type: PlatformActionType;
  priority: ActionPriority;
  status: ActionStatus;
  due_at?: string | null;
  created_at: string;
  completed_at?: string | null;
  sla_minutes?: number | null;
  requires_confirmation: boolean;
  requires_evidence: boolean;
  metadata: Record<string, unknown>;
};

export type CreatePlatformActionInput = {
  organization_id: string;
  app_context: PushAppContext;
  assigned_to_user_id: string;
  assigned_to_role?: string | null;
  created_by?: string;
  source_event_key: string;
  source_notification_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  description?: string | null;
  action_type: PlatformActionType;
  priority?: ActionPriority;
  sla_minutes?: number | null;
  requires_confirmation?: boolean;
  requires_evidence?: boolean;
  metadata?: Record<string, unknown>;
};

export type ActionListFilters = {
  assigned_to_user_id: string;
  organization_id?: string;
  app_context?: PushAppContext;
  status?: ActionStatus | ActionStatus[];
  priority?: ActionPriority;
  entity_type?: string;
  entity_id?: string;
  overdue?: boolean;
  limit?: number;
  offset?: number;
};

export class PlatformActionsService {
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const pool = getPool();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS platform_actions (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        app_context VARCHAR(32) NOT NULL DEFAULT 'admin',
        assigned_to_user_id VARCHAR(36) NOT NULL,
        assigned_to_role VARCHAR(64) NULL,
        created_by VARCHAR(36) NOT NULL DEFAULT 'system',
        source_event_key VARCHAR(120) NOT NULL,
        source_notification_id VARCHAR(64) NULL,
        entity_type VARCHAR(64) NULL,
        entity_id VARCHAR(64) NULL,
        title VARCHAR(190) NOT NULL,
        description TEXT NULL,
        action_type VARCHAR(64) NOT NULL DEFAULT 'generic',
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        due_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        sla_minutes INT NULL,
        requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
        requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
        metadata_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_platform_actions_assignee_status
      ON platform_actions (assigned_to_user_id, status, due_at)
    `).catch(() => undefined);
    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_platform_actions_org
      ON platform_actions (organization_id, created_at)
    `).catch(() => undefined);
    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_platform_actions_entity
      ON platform_actions (entity_type, entity_id)
    `).catch(() => undefined);
    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_platform_actions_notification
      ON platform_actions (source_notification_id)
    `).catch(() => undefined);

    this.schemaReady = true;
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value as T;
    if (typeof value !== "string") return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private mapRow(row: Record<string, unknown>): PlatformAction {
    return {
      id: String(row.id),
      organization_id: String(row.organization_id),
      app_context: String(row.app_context || "admin") as PushAppContext,
      assigned_to_user_id: String(row.assigned_to_user_id),
      assigned_to_role: row.assigned_to_role ? String(row.assigned_to_role) : null,
      created_by: String(row.created_by || "system"),
      source_event_key: String(row.source_event_key),
      source_notification_id: row.source_notification_id ? String(row.source_notification_id) : null,
      entity_type: row.entity_type ? String(row.entity_type) : null,
      entity_id: row.entity_id ? String(row.entity_id) : null,
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      action_type: String(row.action_type || "generic") as PlatformActionType,
      priority: String(row.priority || "normal") as ActionPriority,
      status: String(row.status || "open") as ActionStatus,
      due_at: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
      created_at: new Date(String(row.created_at)).toISOString(),
      completed_at: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
      sla_minutes: row.sla_minutes != null ? Number(row.sla_minutes) : null,
      requires_confirmation: Boolean(row.requires_confirmation),
      requires_evidence: Boolean(row.requires_evidence),
      metadata: this.parseJson<Record<string, unknown>>(row.metadata_json, {}),
    };
  }

  private computeDueAt(slaMinutes?: number | null): Date | null {
    const mins = Number(slaMinutes || 0);
    if (!mins || mins <= 0) return null;
    return new Date(Date.now() + mins * 60_000);
  }

  async createAction(input: CreatePlatformActionInput): Promise<PlatformAction> {
    await this.ensureSchema();

    const userId = String(input.assigned_to_user_id || "").trim();
    const orgId = String(input.organization_id || "").trim();
    const title = String(input.title || "").trim();
    if (!userId) throw new Error("assigned_to_user_id is required");
    if (!orgId) throw new Error("organization_id is required");
    if (!title) throw new Error("title is required");

    const id = `act_${randomUUID()}`;
    const priority = (["low", "normal", "high", "urgent", "critical"] as ActionPriority[]).includes(
      input.priority as ActionPriority,
    )
      ? (input.priority as ActionPriority)
      : "normal";
    const dueAt = this.computeDueAt(input.sla_minutes);

    const pool = getPool();
    await pool.execute(
      `INSERT INTO platform_actions (
        id, organization_id, app_context, assigned_to_user_id, assigned_to_role,
        created_by, source_event_key, source_notification_id, entity_type, entity_id,
        title, description, action_type, priority, status, due_at, sla_minutes,
        requires_confirmation, requires_evidence, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      [
        id,
        orgId,
        String(input.app_context || "admin"),
        userId,
        input.assigned_to_role || null,
        String(input.created_by || "system"),
        String(input.source_event_key || "").trim(),
        input.source_notification_id || null,
        input.entity_type || null,
        input.entity_id || null,
        title,
        input.description || null,
        String(input.action_type || "generic"),
        priority,
        dueAt,
        input.sla_minutes ?? null,
        input.requires_confirmation ? 1 : 0,
        input.requires_evidence ? 1 : 0,
        JSON.stringify(input.metadata || {}),
      ],
    );

    return (await this.getById(userId, id))!;
  }

  async getById(userId: string, actionId: string): Promise<PlatformAction | null> {
    await this.ensureSchema();
    const row = await queryOne<Record<string, unknown>>(
      `SELECT * FROM platform_actions WHERE id = ? AND assigned_to_user_id = ? LIMIT 1`,
      [actionId, userId],
    );
    return row ? this.mapRow(row) : null;
  }

  async listActions(filters: ActionListFilters): Promise<{ actions: PlatformAction[]; total: number }> {
    await this.ensureSchema();

    const where: string[] = ["assigned_to_user_id = ?"];
    const params: unknown[] = [filters.assigned_to_user_id];

    if (filters.organization_id) {
      where.push("organization_id = ?");
      params.push(filters.organization_id);
    }
    if (filters.app_context) {
      where.push("app_context = ?");
      params.push(filters.app_context);
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (statuses.length === 1) {
        where.push("status = ?");
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
    }
    if (filters.priority) {
      where.push("priority = ?");
      params.push(filters.priority);
    }
    if (filters.entity_type) {
      where.push("entity_type = ?");
      params.push(filters.entity_type);
    }
    if (filters.entity_id) {
      where.push("entity_id = ?");
      params.push(filters.entity_id);
    }
    if (filters.overdue) {
      where.push("due_at IS NOT NULL AND due_at < NOW() AND status IN ('open', 'in_progress', 'waiting')");
    }

    const limit = Math.max(1, Math.min(200, Number(filters.limit || 20)));
    const offset = Math.max(0, Number(filters.offset || 0));
    const pool = getPool();

    const [rows] = await pool.query<Record<string, unknown>[]>(
      `SELECT * FROM platform_actions WHERE ${where.join(" AND ")}
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
           WHEN 'normal' THEN 3 ELSE 4
         END,
         due_at ASC NULLS LAST,
         created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [countRows] = await pool.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM platform_actions WHERE ${where.join(" AND ")}`,
      params,
    );

    return {
      actions: (rows || []).map((row) => this.mapRow(row)),
      total: Number(countRows?.[0]?.total || 0),
    };
  }

  async updateStatus(
    userId: string,
    actionId: string,
    status: ActionStatus,
    notes?: string,
  ): Promise<PlatformAction | null> {
    await this.ensureSchema();
    const pool = getPool();
    const completed = status === "completed" || status === "cancelled";

    const [result] = await pool.execute(
      `UPDATE platform_actions
       SET status = ?, completed_at = ${completed ? "NOW()" : "completed_at"}, updated_at = NOW()
       WHERE id = ? AND assigned_to_user_id = ?`,
      [status, actionId, userId],
    );

    if (Number((result as { affectedRows?: number })?.affectedRows || 0) === 0) return null;

    if (notes) {
      const existing = await queryOne<{ metadata_json: string | null }>(
        `SELECT metadata_json FROM platform_actions WHERE id = ? LIMIT 1`,
        [actionId],
      );
      const meta = this.parseJson<Record<string, unknown>>(existing?.metadata_json, {});
      meta.completion_notes = notes;
      await pool.execute(`UPDATE platform_actions SET metadata_json = ? WHERE id = ?`, [
        JSON.stringify(meta),
        actionId,
      ]);
    }

    return this.getById(userId, actionId);
  }

  async getOpenCount(userId: string, organizationId?: string): Promise<number> {
    await this.ensureSchema();
    const clauses = [
      "assigned_to_user_id = ?",
      "status IN ('open', 'in_progress', 'waiting', 'escalated')",
    ];
    const params: unknown[] = [userId];
    if (organizationId) {
      clauses.push("organization_id = ?");
      params.push(organizationId);
    }
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM platform_actions WHERE ${clauses.join(" AND ")}`,
      params,
    );
    return Number(row?.total || 0);
  }

  /** Marca ações vencidas como expired — chamado pelo scheduler futuro. */
  async expireOverdueActions(): Promise<number> {
    await this.ensureSchema();
    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE platform_actions
       SET status = 'expired', updated_at = NOW()
       WHERE status IN ('open', 'in_progress', 'waiting')
         AND due_at IS NOT NULL AND due_at < NOW()`,
    );
    const affected = Number((result as { affectedRows?: number })?.affectedRows || 0);
    if (affected > 0) {
      logger.info(`[PlatformActions] ${affected} ações marcadas como expired`);
    }
    return affected;
  }
}

let platformActionsInstance: PlatformActionsService | null = null;

export function getPlatformActionsService(): PlatformActionsService {
  if (!platformActionsInstance) {
    platformActionsInstance = new PlatformActionsService();
  }
  return platformActionsInstance;
}