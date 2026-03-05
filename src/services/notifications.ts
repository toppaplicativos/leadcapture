import { randomUUID } from "crypto";
import { getPool, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { socketManager } from "../core/socketManager";

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

export type NotificationListFilters = {
  user_id: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  read?: boolean;
  store_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export class NotificationService {
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const pool = getPool();

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

    this.schemaReady = true;
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
        await this.recordDelivery(notification.notification_id, channel, "sent", notification.user_id);
        logger.info(`[Notification] push sent placeholder: ${notification.event} -> ${notification.user_id}`);
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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
    };
  }

  async listNotifications(filters: NotificationListFilters): Promise<{ notifications: NotificationPayload[]; total: number }> {
    await this.ensureSchema();

    const where: string[] = ["user_id = ?"];
    const params: any[] = [filters.user_id];

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
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
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
