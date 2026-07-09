import { randomUUID } from "crypto";
import { getPool, queryOne } from "../config/database";
import { config } from "../config";
import { logger } from "../utils/logger";
import { socketManager } from "../core/socketManager";
import { getPushNotificationService } from "./pushNotifications";
import type { PushAppContext, PushPriority } from "../config/push-events";

export type NotificationType = "system" | "user" | "support";
export type NotificationPriority = "low" | "medium" | "high" | "critical";
export type NotificationChannel = "in_app" | "email" | "whatsapp" | "push" | "webhook";

export type NotificationPayload = {
  notification_id: string;
  type: NotificationType;
  event: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  read: boolean;
  user_id: string;
  store_id?: string | null;
  created_at: string;
  metadata: Record<string, any>;
  app_target?: string | null;
  brand_id?: string | null;
  category?: string | null;
  event_type?: string | null;
  deep_link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action_required?: boolean;
  cta_label?: string | null;
  related_action_id?: string | null;
  is_archived?: boolean;
  group_key?: string | null;
};

export type CreateNotificationInput = {
  type: NotificationType;
  event: string;
  title: string;
  message: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  user_id: string;
  store_id?: string | null;
  metadata?: Record<string, any>;
};

export type CreatePlatformNotificationInput = {
  user_id: string;
  event_key: string;
  title: string;
  message: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  app_target?: string | null;
  brand_id?: string | null;
  category?: string | null;
  event_type?: string | null;
  deep_link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action_required?: boolean;
  cta_label?: string | null;
  group_key?: string | null;
  sound_key?: string | null;
  metadata?: Record<string, any>;
};

export type NotificationListFilters = {
  user_id: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  read?: boolean;
  store_id?: string;
  app_target?: string;
  category?: string;
  action_required?: boolean;
  critical_only?: boolean;
  archived?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

export class NotificationService {
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const pool = getPool();

    if (config.postgres.connectionString || config.postgres.host) {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          type VARCHAR(20) NOT NULL,
          event VARCHAR(120) NOT NULL,
          title VARCHAR(190) NOT NULL,
          message TEXT NOT NULL,
          priority VARCHAR(20) NOT NULL DEFAULT 'medium',
          channels_json JSONB NULL,
          metadata_json JSONB NULL,
          store_id VARCHAR(64) NULL,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          read_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at)
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read)
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications (priority)
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications (event)
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notifications_store ON notifications (store_id)
      `);

      await this.ensureHubColumns();

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS notification_deliveries (
          id BIGSERIAL PRIMARY KEY,
          notification_id VARCHAR(64) NOT NULL,
          channel VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'queued',
          recipient VARCHAR(255) NULL,
          provider_message_id VARCHAR(255) NULL,
          error_message TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries (notification_id)
      `);
      await pool.execute(`
        CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries (status)
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          user_id VARCHAR(36) PRIMARY KEY,
          preferences_json JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.schemaReady = true;
      return;
    }

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        type ENUM('system','user','support') NOT NULL,
        event VARCHAR(120) NOT NULL,
        title VARCHAR(190) NOT NULL,
        message TEXT NOT NULL,
        priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
        channels_json JSON NULL,
        metadata_json JSON NULL,
        store_id VARCHAR(64) NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_created (user_id, created_at),
        INDEX idx_notifications_user_read (user_id, is_read),
        INDEX idx_notifications_priority (priority),
        INDEX idx_notifications_event (event),
        INDEX idx_notifications_store (store_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        notification_id VARCHAR(64) NOT NULL,
        channel ENUM('in_app','email','whatsapp','push','webhook') NOT NULL,
        status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
        recipient VARCHAR(255) NULL,
        provider_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_notification_deliveries_notification (notification_id),
        INDEX idx_notification_deliveries_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id VARCHAR(36) PRIMARY KEY,
        preferences_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureHubColumns();

    this.schemaReady = true;
  }

  private async ensureHubColumns(): Promise<void> {
    const pool = getPool();
    const columns: Array<[string, string]> = [
      ["app_target", "app_target VARCHAR(32) NULL"],
      ["brand_id", "brand_id VARCHAR(64) NULL"],
      ["category", "category VARCHAR(64) NULL"],
      ["event_type", "event_type VARCHAR(64) NULL"],
      ["deep_link", "deep_link VARCHAR(500) NULL"],
      ["entity_type", "entity_type VARCHAR(64) NULL"],
      ["entity_id", "entity_id VARCHAR(64) NULL"],
      ["action_required", "action_required BOOLEAN NOT NULL DEFAULT FALSE"],
      ["cta_label", "cta_label VARCHAR(120) NULL"],
      ["related_action_id", "related_action_id VARCHAR(64) NULL"],
      ["is_archived", "is_archived BOOLEAN NOT NULL DEFAULT FALSE"],
      ["group_key", "group_key VARCHAR(120) NULL"],
      ["expires_at", "expires_at TIMESTAMP NULL"],
    ];

    for (const [name, ddl] of columns) {
      try {
        const [rows] = await pool.query<any[]>(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = ?
           LIMIT 1`,
          [name],
        );
        if (!rows?.length) {
          await pool.execute(`ALTER TABLE notifications ADD COLUMN ${ddl}`);
        }
      } catch {
        await pool.execute(`ALTER TABLE notifications ADD COLUMN ${ddl}`).catch(() => undefined);
      }
    }

    await pool.execute(`CREATE INDEX idx_notifications_hub ON notifications (user_id, is_archived, is_read)`).catch(() => undefined);
    await pool.execute(`CREATE INDEX idx_notifications_action ON notifications (user_id, action_required)`).catch(() => undefined);
  }

  private normalizeChannels(channels?: NotificationChannel[]): NotificationChannel[] {
    const allowed: NotificationChannel[] = ["in_app", "email", "whatsapp", "push", "webhook"];
    const unique = new Set<NotificationChannel>();

    for (const channel of channels || []) {
      const normalized = String(channel || "").trim().toLowerCase() as NotificationChannel;
      if (allowed.includes(normalized)) unique.add(normalized);
    }

    if (unique.size === 0) unique.add("in_app");
    return Array.from(unique);
  }

  private parseJson<T>(value: any, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value as T;
    if (typeof value !== "string") return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  async getPreferences(userId: string): Promise<Record<string, NotificationChannel[]>> {
    await this.ensureSchema();

    const row = await queryOne<{ preferences_json: string | null }>(
      "SELECT preferences_json FROM notification_preferences WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (!row?.preferences_json) return {};
    return this.parseJson<Record<string, NotificationChannel[]>>(row.preferences_json, {});
  }

  async updatePreferences(userId: string, preferences: Record<string, NotificationChannel[]>): Promise<Record<string, NotificationChannel[]>> {
    await this.ensureSchema();
    const normalized: Record<string, NotificationChannel[]> = {};

    for (const [event, channels] of Object.entries(preferences || {})) {
      const eventKey = String(event || "").trim();
      if (!eventKey) continue;
      normalized[eventKey] = this.normalizeChannels(channels);
    }

    const pool = getPool();
    await pool.execute(
      `INSERT INTO notification_preferences (user_id, preferences_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE preferences_json = VALUES(preferences_json), updated_at = NOW()`,
      [userId, JSON.stringify(normalized)]
    );

    return normalized;
  }

  private async resolveChannelsForUser(userId: string, event: string, requested?: NotificationChannel[]): Promise<NotificationChannel[]> {
    const base = this.normalizeChannels(requested);
    const prefs = await this.getPreferences(userId);
    const fromPreference = prefs[String(event || "").trim()] || prefs["*"];
    if (!fromPreference || fromPreference.length === 0) return base;

    // Preferences override explicit channels to respect user choice
    return this.normalizeChannels(fromPreference);
  }

  private async recordDelivery(
    notificationId: string,
    channel: NotificationChannel,
    status: "queued" | "sent" | "failed" | "skipped",
    recipient?: string | null,
    errorMessage?: string | null
  ): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO notification_deliveries (notification_id, channel, status, recipient, error_message)
       VALUES (?, ?, ?, ?, ?)`,
      [notificationId, channel, status, recipient || null, errorMessage || null]
    );
  }

  private async dispatchChannel(channel: NotificationChannel, notification: NotificationPayload): Promise<void> {
    // In-app is persisted by default; realtime handled outside as broadcast.
    if (channel === "in_app") {
      await this.recordDelivery(notification.notification_id, channel, "sent", notification.user_id);
      return;
    }

    // Initial enterprise scaffolding for external channels.
    // You can plug providers here (SES/Sendgrid, Evolution API, FCM, webhook queues).
    try {
      if (channel === "email") {
        await this.recordDelivery(notification.notification_id, channel, "sent", notification.user_id);
        logger.info(`[Notification] email sent placeholder: ${notification.event} -> ${notification.user_id}`);
        return;
      }

      if (channel === "whatsapp") {
        await this.recordDelivery(notification.notification_id, channel, "sent", notification.user_id);
        logger.info(`[Notification] whatsapp sent placeholder: ${notification.event} -> ${notification.user_id}`);
        return;
      }

      if (channel === "push") {
        const push = getPushNotificationService();
        const priorityMap: Record<string, PushPriority> = {
          critical: "critical",
          high: "high",
          medium: "normal",
          low: "low",
        };
        const appContext = (notification.metadata?.app_context || "admin") as PushAppContext;
        const result = await push.sendToUser({
          userId: notification.user_id,
          appContext,
          eventKey: notification.event,
          title: notification.title,
          body: notification.message,
          priority: priorityMap[notification.priority] || "normal",
          url: notification.metadata?.url ? String(notification.metadata.url) : undefined,
          notificationId: notification.notification_id,
          metadata: notification.metadata,
        });
        const status = result.sent > 0 ? "sent" : result.failed > 0 ? "failed" : "skipped";
        await this.recordDelivery(
          notification.notification_id,
          channel,
          status,
          notification.user_id,
          status === "failed" ? `failed=${result.failed}` : status === "skipped" ? `skipped=${result.skipped}` : null,
        );
        return;
      }

      if (channel === "webhook") {
        await this.recordDelivery(notification.notification_id, channel, "sent", notification.user_id);
        logger.info(`[Notification] webhook sent placeholder: ${notification.event} -> ${notification.user_id}`);
        return;
      }

      await this.recordDelivery(notification.notification_id, channel, "skipped", notification.user_id);
    } catch (error: any) {
      await this.recordDelivery(notification.notification_id, channel, "failed", notification.user_id, String(error?.message || error));
    }
  }

  async createNotification(input: CreateNotificationInput): Promise<NotificationPayload> {
    await this.ensureSchema();

    const notificationId = `ntf_${randomUUID()}`;
    const priority: NotificationPriority = (["low", "medium", "high", "critical"] as NotificationPriority[]).includes(
      input.priority as NotificationPriority
    )
      ? (input.priority as NotificationPriority)
      : "medium";

    const userId = String(input.user_id || "").trim();
    const event = String(input.event || "").trim();
    if (!userId) throw new Error("user_id is required");
    if (!event) throw new Error("event is required");

    const channels = await this.resolveChannelsForUser(userId, event, input.channels);

    const payload: NotificationPayload = {
      notification_id: notificationId,
      type: input.type,
      event,
      title: String(input.title || "Notificação").trim() || "Notificação",
      message: String(input.message || "").trim(),
      priority,
      channels,
      read: false,
      user_id: userId,
      store_id: input.store_id ? String(input.store_id) : null,
      created_at: new Date().toISOString(),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    };

    const pool = getPool();
    await pool.execute(
      `INSERT INTO notifications (
        id, user_id, type, event, title, message, priority,
        channels_json, metadata_json, store_id, is_read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        payload.notification_id,
        payload.user_id,
        payload.type,
        payload.event,
        payload.title,
        payload.message,
        payload.priority,
        JSON.stringify(payload.channels),
        JSON.stringify(payload.metadata || {}),
        payload.store_id ?? null,
      ]
    );

    // Dispatch channels async but awaited for deterministic result in API actions
    for (const channel of payload.channels) {
      await this.dispatchChannel(channel, payload);
    }

    socketManager.emitNotification(userId, {
      id: payload.notification_id,
      type: payload.type,
      event: payload.event,
      title: payload.title,
      message: payload.message,
      priority: payload.priority,
      read: payload.read,
      created_at: payload.created_at,
      metadata: payload.metadata,
    });

    const unread = await this.getUnreadCount(userId);
    socketManager.emitNotificationBadge(userId, unread);

    return payload;
  }

  async createPlatformNotification(input: CreatePlatformNotificationInput): Promise<NotificationPayload> {
    await this.ensureSchema();

    const userId = String(input.user_id || "").trim();
    const eventKey = String(input.event_key || "").trim();
    if (!userId) throw new Error("user_id is required");
    if (!eventKey) throw new Error("event_key is required");

    const priority: NotificationPriority = (["low", "medium", "high", "critical"] as NotificationPriority[]).includes(
      input.priority as NotificationPriority,
    )
      ? (input.priority as NotificationPriority)
      : "medium";

    const channels = await this.resolveChannelsForUser(userId, eventKey, input.channels);
    const notificationId = `ntf_${randomUUID()}`;
    const metadata = {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      sound_key: input.sound_key || undefined,
    };

    const payload: NotificationPayload = {
      notification_id: notificationId,
      type: "system",
      event: eventKey,
      title: String(input.title || "Notificação").trim() || "Notificação",
      message: String(input.message || "").trim(),
      priority,
      channels,
      read: false,
      user_id: userId,
      store_id: input.brand_id ? String(input.brand_id) : null,
      created_at: new Date().toISOString(),
      metadata,
      app_target: input.app_target || null,
      brand_id: input.brand_id || null,
      category: input.category || null,
      event_type: input.event_type || null,
      deep_link: input.deep_link || null,
      entity_type: input.entity_type || null,
      entity_id: input.entity_id || null,
      action_required: Boolean(input.action_required),
      cta_label: input.cta_label || null,
      is_archived: false,
      group_key: input.group_key || null,
    };

    const pool = getPool();
    await pool.execute(
      `INSERT INTO notifications (
        id, user_id, type, event, title, message, priority,
        channels_json, metadata_json, store_id, is_read,
        app_target, brand_id, category, event_type, deep_link,
        entity_type, entity_id, action_required, cta_label, group_key
      ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.notification_id,
        payload.user_id,
        payload.event,
        payload.title,
        payload.message,
        payload.priority,
        JSON.stringify(payload.channels),
        JSON.stringify(payload.metadata || {}),
        payload.store_id ?? null,
        payload.app_target ?? null,
        payload.brand_id ?? null,
        payload.category ?? null,
        payload.event_type ?? null,
        payload.deep_link ?? null,
        payload.entity_type ?? null,
        payload.entity_id ?? null,
        payload.action_required ? 1 : 0,
        payload.cta_label ?? null,
        payload.group_key ?? null,
      ],
    );

    for (const channel of payload.channels) {
      await this.dispatchChannel(channel, payload);
    }

    socketManager.emitNotification(userId, {
      id: payload.notification_id,
      type: payload.type,
      event: payload.event,
      title: payload.title,
      message: payload.message,
      priority: payload.priority,
      read: payload.read,
      created_at: payload.created_at,
      metadata: payload.metadata,
      deep_link: payload.deep_link,
      action_required: payload.action_required,
      cta_label: payload.cta_label,
    });

    const unread = await this.getUnreadCount(userId);
    socketManager.emitNotificationBadge(userId, unread);

    return payload;
  }

  async linkAction(notificationId: string, actionId: string): Promise<void> {
    await this.ensureSchema();
    const pool = getPool();
    await pool.execute(
      `UPDATE notifications SET related_action_id = ?, updated_at = NOW() WHERE id = ?`,
      [actionId, notificationId],
    );
  }

  async archiveNotification(userId: string, notificationId: string): Promise<boolean> {
    await this.ensureSchema();
    const pool = getPool();
    const [result] = await pool.execute<any>(
      `UPDATE notifications SET is_archived = 1, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      [notificationId, userId],
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  private mapRow(row: any): NotificationPayload {
    return {
      notification_id: String(row.id),
      type: String(row.type) as NotificationType,
      event: String(row.event),
      title: String(row.title),
      message: String(row.message),
      priority: String(row.priority) as NotificationPriority,
      channels: this.parseJson<NotificationChannel[]>(row.channels_json, ["in_app"]),
      read: Boolean(row.is_read),
      user_id: String(row.user_id),
      store_id: row.store_id ? String(row.store_id) : null,
      created_at: new Date(row.created_at).toISOString(),
      metadata: this.parseJson<Record<string, any>>(row.metadata_json, {}),
      app_target: row.app_target ? String(row.app_target) : null,
      brand_id: row.brand_id ? String(row.brand_id) : null,
      category: row.category ? String(row.category) : null,
      event_type: row.event_type ? String(row.event_type) : null,
      deep_link: row.deep_link ? String(row.deep_link) : null,
      entity_type: row.entity_type ? String(row.entity_type) : null,
      entity_id: row.entity_id ? String(row.entity_id) : null,
      action_required: Boolean(row.action_required),
      cta_label: row.cta_label ? String(row.cta_label) : null,
      related_action_id: row.related_action_id ? String(row.related_action_id) : null,
      is_archived: Boolean(row.is_archived),
      group_key: row.group_key ? String(row.group_key) : null,
    };
  }

  async listNotifications(filters: NotificationListFilters): Promise<{ notifications: NotificationPayload[]; total: number }> {
    await this.ensureSchema();

    const where: string[] = ["user_id = ?"];
    const params: any[] = [filters.user_id];

    if (typeof filters.archived === "boolean") {
      where.push("is_archived = ?");
      params.push(filters.archived ? 1 : 0);
    } else {
      where.push("is_archived = 0");
    }

    if (filters.type) {
      where.push("type = ?");
      params.push(filters.type);
    }
    if (filters.priority) {
      where.push("priority = ?");
      params.push(filters.priority);
    }
    if (typeof filters.read === "boolean") {
      where.push("is_read = ?");
      params.push(filters.read ? 1 : 0);
    }
    if (filters.store_id) {
      where.push("store_id = ?");
      params.push(filters.store_id);
    }
    if (filters.app_target) {
      where.push("app_target = ?");
      params.push(filters.app_target);
    }
    if (filters.category) {
      where.push("category = ?");
      params.push(filters.category);
    }
    if (typeof filters.action_required === "boolean") {
      where.push("action_required = ?");
      params.push(filters.action_required ? 1 : 0);
    }
    if (filters.critical_only) {
      where.push("(priority = 'critical' OR event_type = 'critical_alert')");
    }
    if (filters.q) {
      where.push("(title LIKE ? OR message LIKE ? OR event LIKE ?)");
      const q = `%${String(filters.q).trim()}%`;
      params.push(q, q, q);
    }

    const limit = Math.max(1, Math.min(200, Number(filters.limit || 20)));
    const offset = Math.max(0, Number(filters.offset || 0));

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM notifications WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${where.join(" AND ")}`,
      params
    );

    return {
      notifications: rows.map((row) => this.mapRow(row)),
      total: Number(countRows?.[0]?.total || 0),
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    await this.ensureSchema();
    const row = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0 AND is_archived = 0",
      [userId]
    );
    return Number(row?.total || 0);
  }

  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    await this.ensureSchema();
    const pool = getPool();
    const [result] = await pool.execute<any>(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );

    if (Number(result?.affectedRows || 0) > 0) {
      socketManager.emitNotificationUpdated(userId, notificationId, { read: true });
      const unread = await this.getUnreadCount(userId);
      socketManager.emitNotificationBadge(userId, unread);
      return true;
    }
    return false;
  }

  async markAllAsRead(userId: string): Promise<number> {
    await this.ensureSchema();
    const pool = getPool();
    const [result] = await pool.execute<any>(
      "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0",
      [userId]
    );

    const affected = Number(result?.affectedRows || 0);
    socketManager.emitToUser(userId, "notification:all-read", { affected });
    socketManager.emitNotificationBadge(userId, 0);
    return affected;
  }

  async getAnalytics(userId: string): Promise<Record<string, any>> {
    await this.ensureSchema();
    const pool = getPool();

    const [totals] = await pool.query<any[]>(
      `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_count,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
          ROUND(AVG(CASE WHEN is_read = 1 AND read_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, created_at, read_at) END), 2) AS avg_time_to_read_seconds
       FROM notifications
       WHERE user_id = ?`,
      [userId]
    );

    const [byPriority] = await pool.query<any[]>(
      `SELECT priority, COUNT(*) AS total
       FROM notifications
       WHERE user_id = ?
       GROUP BY priority`,
      [userId]
    );

    const [byEvent] = await pool.query<any[]>(
      `SELECT event, COUNT(*) AS total
       FROM notifications
       WHERE user_id = ?
       GROUP BY event
       ORDER BY total DESC
       LIMIT 20`,
      [userId]
    );

    const [deliveryStats] = await pool.query<any[]>(
      `SELECT channel, status, COUNT(*) AS total
       FROM notification_deliveries nd
       INNER JOIN notifications n ON n.id = nd.notification_id
       WHERE n.user_id = ?
       GROUP BY channel, status`,
      [userId]
    );

    return {
      totals: totals?.[0] || {},
      by_priority: byPriority || [],
      top_events: byEvent || [],
      deliveries: deliveryStats || [],
    };
  }
}

let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
