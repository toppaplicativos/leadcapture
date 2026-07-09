/**
 * Governança central de notificações — eventos, templates, preferências e logs.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { masterService } from "./master";
import type { PushAppContext, PushEventCategory, PushPriority } from "../config/push-events";
import {
  NOTIFICATION_EVENT_REGISTRY,
  getNotificationEventDefinition,
  resolveCanonicalEventKey,
  type NotificationEventType,
  type PlatformActionType,
} from "../config/notification-events";

export type NotificationEventTypeRow = {
  id: string;
  event_key: string;
  name: string;
  description: string | null;
  app_target: PushAppContext;
  category: PushEventCategory;
  type: NotificationEventType;
  default_priority: PushPriority;
  default_channel: string;
  can_push: boolean;
  can_sound: boolean;
  can_be_disabled_by_user: boolean;
  creates_action: boolean;
  is_critical: boolean;
  sound_key: string | null;
  group_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationTemplateRow = {
  id: string;
  event_type_id: string;
  title_template: string;
  body_template: string;
  cta_label: string | null;
  deep_link_template: string | null;
  sound_type: string | null;
  locale: string;
};

export type UserEventPreference = {
  id: string;
  user_id: string;
  app_context: PushAppContext;
  event_key: string;
  category: string | null;
  push_enabled: boolean;
  in_app_enabled: boolean;
  sound_enabled: boolean;
  email_enabled: boolean;
  silent_hours_enabled: boolean;
};

export type NotificationLogEntry = {
  id: string;
  notification_id: string | null;
  user_id: string;
  event_key: string;
  status: string;
  channel: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  device_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type EscalationRuleRow = {
  id: string;
  event_key: string;
  action_type: PlatformActionType;
  priority: string;
  sla_minutes: number;
  first_reminder_minutes: number | null;
  second_reminder_minutes: number | null;
  escalate_to_role: string | null;
  auto_reassign: boolean;
  auto_pause_related_flow: boolean;
  is_active: boolean;
};

export type ResolvedEventConfig = {
  event_key: string;
  app_target: PushAppContext;
  category: PushEventCategory;
  type: NotificationEventType;
  default_priority: PushPriority;
  title_template: string;
  body_template: string;
  cta_label?: string;
  deep_link_template?: string;
  channels: Array<"in_app" | "push">;
  action_required: boolean;
  can_be_disabled_by_user: boolean;
  can_push: boolean;
  can_sound: boolean;
  creates_action: boolean;
  is_critical: boolean;
  sound_key?: string;
  group_key?: string;
  auto_action?: {
    action_type: PlatformActionType;
    title_template: string;
    description_template?: string;
    sla_minutes?: number;
    priority?: string;
  };
};

const DEFAULT_ESCALATION_SEED: Array<Omit<EscalationRuleRow, "id">> = [
  {
    event_key: "affiliate.lead.hot",
    action_type: "reply_lead",
    priority: "urgent",
    sla_minutes: 15,
    first_reminder_minutes: 15,
    second_reminder_minutes: 30,
    escalate_to_role: "program_manager",
    auto_reassign: true,
    auto_pause_related_flow: false,
    is_active: true,
  },
  {
    event_key: "affiliate.whatsapp.disconnected",
    action_type: "reconnect_whatsapp",
    priority: "critical",
    sla_minutes: 10,
    first_reminder_minutes: 10,
    second_reminder_minutes: 30,
    escalate_to_role: "program_manager",
    auto_reassign: false,
    auto_pause_related_flow: true,
    is_active: true,
  },
  {
    event_key: "stock.product.critical_stock",
    action_type: "update_stock",
    priority: "urgent",
    sla_minutes: 60,
    first_reminder_minutes: 60,
    second_reminder_minutes: 120,
    escalate_to_role: "inventory_manager",
    auto_reassign: false,
    auto_pause_related_flow: false,
    is_active: true,
  },
  {
    event_key: "admin.support.sla_expired",
    action_type: "resolve_support",
    priority: "critical",
    sla_minutes: 30,
    first_reminder_minutes: 30,
    second_reminder_minutes: 60,
    escalate_to_role: "support_manager",
    auto_reassign: false,
    auto_pause_related_flow: false,
    is_active: true,
  },
];

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export class NotificationPlatformService {
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS notification_event_types (
        id VARCHAR(36) PRIMARY KEY,
        event_key VARCHAR(120) NOT NULL UNIQUE,
        name VARCHAR(190) NOT NULL,
        description TEXT NULL,
        app_target VARCHAR(32) NOT NULL,
        category VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        default_priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        default_channel VARCHAR(32) NOT NULL DEFAULT 'in_app,push',
        can_push BOOLEAN NOT NULL DEFAULT TRUE,
        can_sound BOOLEAN NOT NULL DEFAULT TRUE,
        can_be_disabled_by_user BOOLEAN NOT NULL DEFAULT TRUE,
        creates_action BOOLEAN NOT NULL DEFAULT FALSE,
        is_critical BOOLEAN NOT NULL DEFAULT FALSE,
        sound_key VARCHAR(40) NULL,
        group_key VARCHAR(120) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id VARCHAR(36) PRIMARY KEY,
        event_type_id VARCHAR(36) NOT NULL,
        title_template VARCHAR(500) NOT NULL,
        body_template TEXT NOT NULL,
        cta_label VARCHAR(120) NULL,
        deep_link_template VARCHAR(500) NULL,
        sound_type VARCHAR(40) NULL,
        locale VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_event_locale
        ON notification_templates (event_type_id, locale)
    `).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS notification_user_preferences (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        app_context VARCHAR(32) NOT NULL,
        event_key VARCHAR(120) NOT NULL,
        category VARCHAR(64) NULL,
        push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        silent_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_user_pref_unique
        ON notification_user_preferences (user_id, app_context, event_key)
    `).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id BIGSERIAL PRIMARY KEY,
        notification_id VARCHAR(64) NULL,
        user_id VARCHAR(36) NOT NULL,
        event_key VARCHAR(120) NOT NULL,
        status VARCHAR(32) NOT NULL,
        channel VARCHAR(32) NOT NULL,
        sent_at TIMESTAMPTZ NULL,
        delivered_at TIMESTAMPTZ NULL,
        read_at TIMESTAMPTZ NULL,
        clicked_at TIMESTAMPTZ NULL,
        failed_at TIMESTAMPTZ NULL,
        failure_reason TEXT NULL,
        device_id VARCHAR(64) NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs (user_id, created_at DESC)`).catch(() => undefined);
    await query(`CREATE INDEX IF NOT EXISTS idx_notification_logs_event ON notification_logs (event_key, created_at DESC)`).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS action_escalation_rules (
        id VARCHAR(36) PRIMARY KEY,
        event_key VARCHAR(120) NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        sla_minutes INTEGER NOT NULL DEFAULT 60,
        first_reminder_minutes INTEGER NULL,
        second_reminder_minutes INTEGER NULL,
        escalate_to_role VARCHAR(64) NULL,
        escalate_to_user_id VARCHAR(36) NULL,
        auto_reassign BOOLEAN NOT NULL DEFAULT FALSE,
        auto_pause_related_flow BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_action_escalation_event_type
        ON action_escalation_rules (event_key, action_type)
    `).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS action_logs (
        id BIGSERIAL PRIMARY KEY,
        action_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(36) NULL,
        event_type VARCHAR(64) NOT NULL,
        message TEXT NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs (action_id, created_at DESC)`).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS notification_batches (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        group_key VARCHAR(120) NOT NULL,
        event_key VARCHAR(120) NOT NULL,
        notification_id VARCHAR(64) NULL,
        item_count INTEGER NOT NULL DEFAULT 1,
        window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        summary_title VARCHAR(190) NULL,
        summary_body TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_batches_user_group
        ON notification_batches (user_id, group_key, last_event_at DESC)
    `).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS notification_click_events (
        id BIGSERIAL PRIMARY KEY,
        notification_id VARCHAR(64) NULL,
        user_id VARCHAR(36) NULL,
        event_key VARCHAR(120) NULL,
        interaction VARCHAR(32) NOT NULL,
        device_id VARCHAR(64) NULL,
        url TEXT NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_notification_click_events_notif
        ON notification_click_events (notification_id, created_at DESC)
    `).catch(() => undefined);

    await this.seedFromRegistry();
    await this.seedEscalationRules();
    this.schemaReady = true;
  }

  private async seedFromRegistry(): Promise<void> {
    for (const def of NOTIFICATION_EVENT_REGISTRY) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM notification_event_types WHERE event_key = ? LIMIT 1`,
        [def.event_key],
      );
      let eventTypeId = existing?.id;
      if (!eventTypeId) {
        eventTypeId = randomUUID();
        await query(
          `INSERT INTO notification_event_types
           (id, event_key, name, description, app_target, category, type, default_priority,
            default_channel, can_push, can_sound, can_be_disabled_by_user, creates_action,
            is_critical, sound_key, group_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventTypeId,
            def.event_key,
            def.title_template.replace(/\{\{[^}]+\}\}/g, "…").slice(0, 190),
            def.body_template.slice(0, 500),
            def.app_context,
            def.category,
            def.event_type,
            def.default_priority,
            def.channels.join(","),
            def.channels.includes("push"),
            !!def.sound_key,
            def.can_be_disabled_by_user,
            !!def.auto_action,
            def.event_type === "critical_alert" || def.default_priority === "critical",
            def.sound_key || null,
            def.group_key || null,
          ],
        );
      }

      const tpl = await queryOne<{ id: string }>(
        `SELECT id FROM notification_templates WHERE event_type_id = ? AND locale = 'pt-BR' LIMIT 1`,
        [eventTypeId],
      );
      if (!tpl) {
        await query(
          `INSERT INTO notification_templates
           (id, event_type_id, title_template, body_template, cta_label, deep_link_template, sound_type, locale)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pt-BR')`,
          [
            randomUUID(),
            eventTypeId,
            def.title_template,
            def.body_template,
            def.cta_label || null,
            def.deep_link_template || null,
            def.sound_key || null,
          ],
        );
      }
    }

    const flag = await masterService.getSetting<string>("notification_platform_seeded_at");
    if (!flag) {
      await masterService.setSetting("notification_platform_seeded_at", new Date().toISOString());
      logger.info(`[NotificationPlatform] ${NOTIFICATION_EVENT_REGISTRY.length} eventos sincronizados`);
    }
  }

  /** Antispam: agrupa eventos repetidos e resume após limite na janela. */
  async evaluateBatching(input: {
    user_id: string;
    event_key: string;
    group_key?: string | null;
    title: string;
    body: string;
    is_critical?: boolean;
    window_minutes?: number;
    max_individual?: number;
  }): Promise<{
    proceed: boolean;
    title: string;
    body: string;
    batch_id?: string;
    suppressed?: boolean;
  }> {
    await this.ensureSchema();
    const groupKey = String(input.group_key || "").trim();
    if (!groupKey || input.is_critical) {
      return { proceed: true, title: input.title, body: input.body };
    }

    const windowMin = Math.max(1, Number(input.window_minutes || 5));
    const maxIndividual = Math.max(2, Number(input.max_individual || 3));
    const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();

    const active = await queryOne<any>(
      `SELECT * FROM notification_batches
       WHERE user_id = ? AND group_key = ? AND last_event_at >= ?
       ORDER BY last_event_at DESC LIMIT 1`,
      [input.user_id, groupKey, cutoff],
    );

    if (!active) {
      const id = randomUUID();
      await query(
        `INSERT INTO notification_batches
         (id, user_id, group_key, event_key, item_count, summary_title, summary_body)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [id, input.user_id, groupKey, input.event_key, input.title, input.body],
      );
      return { proceed: true, title: input.title, body: input.body, batch_id: id };
    }

    const nextCount = Number(active.item_count || 0) + 1;
    if (nextCount <= maxIndividual) {
      await query(
        `UPDATE notification_batches SET item_count = ?, last_event_at = NOW(), event_key = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextCount, input.event_key, active.id],
      );
      return { proceed: true, title: input.title, body: input.body, batch_id: String(active.id) };
    }

    const summaryTitle = `Você tem ${nextCount} alertas em ${groupKey.replace(/_/g, " ")}`;
    const summaryBody = `Resumo: ${nextCount} eventos do tipo ${input.event_key} nos últimos ${windowMin} min.`;
    await query(
      `UPDATE notification_batches SET item_count = ?, last_event_at = NOW(), event_key = ?,
         summary_title = ?, summary_body = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextCount, input.event_key, summaryTitle, summaryBody, active.id],
    );

    if (active.notification_id) {
      return { proceed: false, title: summaryTitle, body: summaryBody, batch_id: String(active.id), suppressed: true };
    }

    return {
      proceed: true,
      title: summaryTitle,
      body: summaryBody,
      batch_id: String(active.id),
    };
  }

  async linkBatchNotification(batchId: string, notificationId: string): Promise<void> {
    await this.ensureSchema();
    await query(
      `UPDATE notification_batches SET notification_id = ?, updated_at = NOW() WHERE id = ?`,
      [notificationId, batchId],
    );
  }

  async recordInteraction(input: {
    notification_id?: string | null;
    user_id?: string | null;
    event_key?: string | null;
    interaction: "displayed" | "clicked" | "dismissed" | "ignored";
    device_id?: string | null;
    url?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureSchema();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO notification_click_events
       (notification_id, user_id, event_key, interaction, device_id, url, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.notification_id || null,
        input.user_id || null,
        input.event_key || null,
        input.interaction,
        input.device_id || null,
        input.url || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    if (input.notification_id && input.interaction === "clicked") {
      await query(
        `UPDATE notification_logs SET clicked_at = ?, status = 'clicked'
         WHERE notification_id = ? AND clicked_at IS NULL`,
        [now, input.notification_id],
      );
    }
    if (input.notification_id && input.interaction === "dismissed") {
      await query(
        `UPDATE notification_logs SET status = 'ignored'
         WHERE notification_id = ? AND status NOT IN ('clicked', 'read')`,
        [input.notification_id],
      );
    }
  }

  private async seedEscalationRules(): Promise<void> {
    for (const rule of DEFAULT_ESCALATION_SEED) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM action_escalation_rules WHERE event_key = ? AND action_type = ? LIMIT 1`,
        [rule.event_key, rule.action_type],
      );
      if (existing) continue;
      await query(
        `INSERT INTO action_escalation_rules
         (id, event_key, action_type, priority, sla_minutes, first_reminder_minutes,
          second_reminder_minutes, escalate_to_role, auto_reassign, auto_pause_related_flow)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          rule.event_key,
          rule.action_type,
          rule.priority,
          rule.sla_minutes,
          rule.first_reminder_minutes,
          rule.second_reminder_minutes,
          rule.escalate_to_role,
          rule.auto_reassign,
          rule.auto_pause_related_flow,
        ],
      );
    }
  }

  async resolveEventConfig(eventKey: string): Promise<ResolvedEventConfig | null> {
    await this.ensureSchema();
    const canonical = resolveCanonicalEventKey(eventKey);
    const row = await queryOne<any>(
      `SELECT et.*, t.title_template, t.body_template, t.cta_label, t.deep_link_template, t.sound_type
       FROM notification_event_types et
       LEFT JOIN notification_templates t ON t.event_type_id = et.id AND t.locale = 'pt-BR'
       WHERE et.event_key = ? AND et.is_active = TRUE
       LIMIT 1`,
      [canonical],
    );

    if (row) {
      const registry = getNotificationEventDefinition(canonical);
      const channels = String(row.default_channel || "in_app,push")
        .split(",")
        .map((c: string) => c.trim())
        .filter((c: string) => c === "in_app" || c === "push") as Array<"in_app" | "push">;

      return {
        event_key: row.event_key,
        app_target: row.app_target,
        category: row.category,
        type: row.type,
        default_priority: row.default_priority,
        title_template: row.title_template || registry?.title_template || "",
        body_template: row.body_template || registry?.body_template || "",
        cta_label: row.cta_label || registry?.cta_label,
        deep_link_template: row.deep_link_template || registry?.deep_link_template,
        channels: channels.length ? channels : ["in_app", "push"],
        action_required: registry?.action_required ?? false,
        can_be_disabled_by_user: !!row.can_be_disabled_by_user,
        can_push: !!row.can_push,
        can_sound: !!row.can_sound,
        creates_action: !!row.creates_action,
        is_critical: !!row.is_critical,
        sound_key: row.sound_type || row.sound_key || registry?.sound_key,
        group_key: row.group_key || registry?.group_key,
        auto_action: registry?.auto_action,
      };
    }

    const fallback = getNotificationEventDefinition(eventKey);
    if (!fallback) return null;
    return {
      event_key: fallback.event_key,
      app_target: fallback.app_context,
      category: fallback.category,
      type: fallback.event_type,
      default_priority: fallback.default_priority,
      title_template: fallback.title_template,
      body_template: fallback.body_template,
      cta_label: fallback.cta_label,
      deep_link_template: fallback.deep_link_template,
      channels: fallback.channels,
      action_required: fallback.action_required,
      can_be_disabled_by_user: fallback.can_be_disabled_by_user,
      can_push: fallback.channels.includes("push"),
      can_sound: !!fallback.sound_key,
      creates_action: !!fallback.auto_action,
      is_critical: fallback.event_type === "critical_alert",
      sound_key: fallback.sound_key,
      group_key: fallback.group_key,
      auto_action: fallback.auto_action,
    };
  }

  async getUserEventPreference(
    userId: string,
    eventKey: string,
    appContext: PushAppContext,
  ): Promise<UserEventPreference | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM notification_user_preferences
       WHERE user_id = ? AND event_key = ? AND app_context = ?
       LIMIT 1`,
      [userId, eventKey, appContext],
    );
    return row ? this.mapUserPref(row) : null;
  }

  async shouldDeliverToUser(
    userId: string,
    eventKey: string,
    appContext: PushAppContext,
    channel: "in_app" | "push",
    eventConfig: ResolvedEventConfig,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!eventConfig.can_be_disabled_by_user && eventConfig.is_critical) {
      return { ok: true };
    }

    const pref = await this.getUserEventPreference(userId, eventKey, appContext);
    if (!pref) return { ok: true };

    if (channel === "push" && !pref.push_enabled) return { ok: false, reason: "push_disabled" };
    if (channel === "in_app" && !pref.in_app_enabled) return { ok: false, reason: "in_app_disabled" };
    return { ok: true };
  }

  async shouldPlaySound(
    userId: string,
    eventKey: string,
    appContext: PushAppContext,
    eventConfig: ResolvedEventConfig,
  ): Promise<boolean> {
    if (!eventConfig.can_sound || !eventConfig.sound_key) return false;
    if (eventConfig.is_critical) return true;
    const pref = await this.getUserEventPreference(userId, eventKey, appContext);
    if (!pref) return true;
    return pref.sound_enabled;
  }

  async upsertUserPreference(input: {
    user_id: string;
    app_context: PushAppContext;
    event_key: string;
    category?: string | null;
    push_enabled?: boolean;
    in_app_enabled?: boolean;
    sound_enabled?: boolean;
    email_enabled?: boolean;
    silent_hours_enabled?: boolean;
  }): Promise<UserEventPreference> {
    await this.ensureSchema();
    const existing = await this.getUserEventPreference(
      input.user_id,
      input.event_key,
      input.app_context,
    );

    if (existing) {
      await query(
        `UPDATE notification_user_preferences SET
           push_enabled = COALESCE(?, push_enabled),
           in_app_enabled = COALESCE(?, in_app_enabled),
           sound_enabled = COALESCE(?, sound_enabled),
           email_enabled = COALESCE(?, email_enabled),
           silent_hours_enabled = COALESCE(?, silent_hours_enabled),
           category = COALESCE(?, category),
           updated_at = NOW()
         WHERE id = ?`,
        [
          input.push_enabled ?? null,
          input.in_app_enabled ?? null,
          input.sound_enabled ?? null,
          input.email_enabled ?? null,
          input.silent_hours_enabled ?? null,
          input.category ?? null,
          existing.id,
        ],
      );
      return (await this.getUserEventPreference(input.user_id, input.event_key, input.app_context))!;
    }

    const id = randomUUID();
    await query(
      `INSERT INTO notification_user_preferences
       (id, user_id, app_context, event_key, category, push_enabled, in_app_enabled,
        sound_enabled, email_enabled, silent_hours_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.user_id,
        input.app_context,
        input.event_key,
        input.category || null,
        input.push_enabled ?? true,
        input.in_app_enabled ?? true,
        input.sound_enabled ?? true,
        input.email_enabled ?? false,
        input.silent_hours_enabled ?? true,
      ],
    );
    return (await this.getUserEventPreference(input.user_id, input.event_key, input.app_context))!;
  }

  async listUserPreferences(userId: string, appContext?: PushAppContext): Promise<UserEventPreference[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      appContext
        ? `SELECT * FROM notification_user_preferences WHERE user_id = ? AND app_context = ? ORDER BY event_key`
        : `SELECT * FROM notification_user_preferences WHERE user_id = ? ORDER BY app_context, event_key`,
      appContext ? [userId, appContext] : [userId],
    );
    return (rows || []).map((r) => this.mapUserPref(r));
  }

  async logDelivery(input: {
    notification_id?: string | null;
    user_id: string;
    event_key: string;
    status: string;
    channel: string;
    device_id?: string | null;
    failure_reason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const isSuccess = ["sent", "delivered", "queued"].includes(input.status);
    const isFail = input.status === "failed" || input.status === "skipped";

    await query(
      `INSERT INTO notification_logs
       (notification_id, user_id, event_key, status, channel, sent_at, delivered_at,
        failed_at, failure_reason, device_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.notification_id || null,
        input.user_id,
        input.event_key,
        input.status,
        input.channel,
        isSuccess ? now : null,
        input.status === "delivered" ? now : null,
        isFail ? now : null,
        input.failure_reason || null,
        input.device_id || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async listLogs(opts?: { limit?: number; user_id?: string; event_key?: string }): Promise<NotificationLogEntry[]> {
    await this.ensureSchema();
    const limit = Math.min(500, Math.max(20, Number(opts?.limit || 100)));
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts?.user_id) {
      clauses.push("user_id = ?");
      params.push(opts.user_id);
    }
    if (opts?.event_key) {
      clauses.push("event_key = ?");
      params.push(opts.event_key);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await query<any[]>(
      `SELECT * FROM notification_logs ${where} ORDER BY created_at DESC LIMIT ${limit}`,
      params,
    );
    return (rows || []).map((r) => ({
      id: String(r.id),
      notification_id: r.notification_id ? String(r.notification_id) : null,
      user_id: String(r.user_id),
      event_key: String(r.event_key),
      status: String(r.status),
      channel: String(r.channel),
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      delivered_at: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
      read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
      clicked_at: r.clicked_at ? new Date(r.clicked_at).toISOString() : null,
      failed_at: r.failed_at ? new Date(r.failed_at).toISOString() : null,
      failure_reason: r.failure_reason ? String(r.failure_reason) : null,
      device_id: r.device_id ? String(r.device_id) : null,
      metadata: parseJson(r.metadata_json, {}),
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  async listEventTypes(appContext?: PushAppContext): Promise<NotificationEventTypeRow[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      appContext
        ? `SELECT * FROM notification_event_types WHERE app_target = ? ORDER BY category, event_key`
        : `SELECT * FROM notification_event_types ORDER BY app_target, category, event_key`,
      appContext ? [appContext] : [],
    );
    return (rows || []).map((r) => this.mapEventType(r));
  }

  async updateEventType(id: string, patch: Partial<NotificationEventTypeRow>): Promise<void> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: unknown[] = [];
    const allowed = [
      "name", "description", "default_priority", "default_channel", "can_push", "can_sound",
      "can_be_disabled_by_user", "creates_action", "is_critical", "sound_key", "group_key", "is_active",
    ] as const;
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (!fields.length) return;
    fields.push("updated_at = NOW()");
    values.push(id);
    await query(`UPDATE notification_event_types SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  async updateTemplate(eventTypeId: string, patch: Partial<NotificationTemplateRow>): Promise<void> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ["title_template", "body_template", "cta_label", "deep_link_template", "sound_type"] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (!fields.length) return;
    fields.push("updated_at = NOW()");
    values.push(eventTypeId);
    await query(
      `UPDATE notification_templates SET ${fields.join(", ")} WHERE event_type_id = ? AND locale = 'pt-BR'`,
      values,
    );
  }

  async getTemplate(eventTypeId: string): Promise<NotificationTemplateRow | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM notification_templates WHERE event_type_id = ? AND locale = 'pt-BR' LIMIT 1`,
      [eventTypeId],
    );
    if (!row) return null;
    return {
      id: String(row.id),
      event_type_id: String(row.event_type_id),
      title_template: String(row.title_template),
      body_template: String(row.body_template),
      cta_label: row.cta_label ? String(row.cta_label) : null,
      deep_link_template: row.deep_link_template ? String(row.deep_link_template) : null,
      sound_type: row.sound_type ? String(row.sound_type) : null,
      locale: String(row.locale),
    };
  }

  async listEscalationRules(): Promise<EscalationRuleRow[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(`SELECT * FROM action_escalation_rules ORDER BY event_key`);
    return (rows || []).map((r) => ({
      id: String(r.id),
      event_key: String(r.event_key),
      action_type: r.action_type,
      priority: String(r.priority),
      sla_minutes: Number(r.sla_minutes),
      first_reminder_minutes: r.first_reminder_minutes != null ? Number(r.first_reminder_minutes) : null,
      second_reminder_minutes: r.second_reminder_minutes != null ? Number(r.second_reminder_minutes) : null,
      escalate_to_role: r.escalate_to_role ? String(r.escalate_to_role) : null,
      auto_reassign: !!r.auto_reassign,
      auto_pause_related_flow: !!r.auto_pause_related_flow,
      is_active: !!r.is_active,
    }));
  }

  async updateEscalationRule(id: string, patch: Partial<EscalationRuleRow>): Promise<void> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of [
      "sla_minutes", "first_reminder_minutes", "second_reminder_minutes",
      "escalate_to_role", "auto_reassign", "auto_pause_related_flow", "is_active", "priority",
    ] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (!fields.length) return;
    fields.push("updated_at = NOW()");
    values.push(id);
    await query(`UPDATE action_escalation_rules SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  async logActionEvent(actionId: string, eventType: string, message?: string, userId?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO action_logs (action_id, user_id, event_type, message, metadata_json) VALUES (?, ?, ?, ?, ?)`,
      [actionId, userId || null, eventType, message || null, JSON.stringify(metadata || {})],
    );
  }

  private mapUserPref(row: any): UserEventPreference {
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      app_context: row.app_context,
      event_key: String(row.event_key),
      category: row.category ? String(row.category) : null,
      push_enabled: !!row.push_enabled,
      in_app_enabled: !!row.in_app_enabled,
      sound_enabled: !!row.sound_enabled,
      email_enabled: !!row.email_enabled,
      silent_hours_enabled: !!row.silent_hours_enabled,
    };
  }

  private mapEventType(row: any): NotificationEventTypeRow {
    return {
      id: String(row.id),
      event_key: String(row.event_key),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      app_target: row.app_target,
      category: row.category,
      type: row.type,
      default_priority: row.default_priority,
      default_channel: String(row.default_channel),
      can_push: !!row.can_push,
      can_sound: !!row.can_sound,
      can_be_disabled_by_user: !!row.can_be_disabled_by_user,
      creates_action: !!row.creates_action,
      is_critical: !!row.is_critical,
      sound_key: row.sound_key ? String(row.sound_key) : null,
      group_key: row.group_key ? String(row.group_key) : null,
      is_active: !!row.is_active,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}

let platformInstance: NotificationPlatformService | null = null;

export function getNotificationPlatformService(): NotificationPlatformService {
  if (!platformInstance) platformInstance = new NotificationPlatformService();
  return platformInstance;
}