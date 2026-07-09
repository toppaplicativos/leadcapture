/**
 * Push Notification Center — Web Push nativo (Service Worker + VAPID).
 * Complementa NotificationService (in-app + socket) com entrega OS-level.
 */

import webpush from "web-push"
import { createHash, randomUUID } from "crypto"
import { query, queryOne } from "../config/database"
import { config } from "../config"
import { logger } from "../utils/logger"
import { masterService } from "./master"
import {
  PUSH_EVENT_SEED,
  type PushAppContext,
  type PushEventDefinition,
  type PushPriority,
} from "../config/push-events"

export type PushPermissionStatus = "granted" | "denied" | "default" | "revoked"

export type DevicePushPreferences = {
  device_enabled: boolean
  sound_enabled: boolean
  vibrate_enabled: boolean
  show_preview: boolean
  show_sensitive: boolean
  critical_override_quiet: boolean
  quiet_hours: {
    enabled: boolean
    start: string
    end: string
    days: number[]
    allow_critical: boolean
    allow_security: boolean
    allow_sales: boolean
  }
  sounds: Record<string, string>
  events: Record<string, boolean>
  sound_events: Record<string, boolean>
}

const DEFAULT_DEVICE_PREFS: DevicePushPreferences = {
  device_enabled: true,
  sound_enabled: true,
  vibrate_enabled: true,
  show_preview: true,
  show_sensitive: true,
  critical_override_quiet: true,
  quiet_hours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    allow_critical: true,
    allow_security: true,
    allow_sales: false,
  },
  sounds: {
    default: "default",
    critical: "alert_critical",
    new_lead: "new_lead",
    sale: "sale",
    order: "order",
    stock: "stock",
    support: "support",
    connection: "connection",
  },
  events: {},
  sound_events: {},
}

export type PushSubscriptionRow = {
  id: string
  user_id: string
  organization_id: string | null
  app_context: PushAppContext
  device_id: string
  browser: string | null
  operating_system: string | null
  push_endpoint: string
  permission_status: PushPermissionStatus
  is_active: boolean
  sound_enabled: boolean
  preferences_json: DevicePushPreferences
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

function parseJson<T>(v: any, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === "object") return v as T
  if (typeof v !== "string") return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

function mergePrefs(raw: Partial<DevicePushPreferences> | null | undefined): DevicePushPreferences {
  const incoming = raw || {}
  return {
    ...DEFAULT_DEVICE_PREFS,
    ...incoming,
    quiet_hours: { ...DEFAULT_DEVICE_PREFS.quiet_hours, ...(incoming.quiet_hours || {}) },
    sounds: { ...DEFAULT_DEVICE_PREFS.sounds, ...(incoming.sounds || {}) },
    events: { ...(incoming.events || {}) },
    sound_events: { ...(incoming.sound_events || {}) },
  }
}

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 32)
}

function parseTimeMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function isQuietHours(prefs: DevicePushPreferences, now = new Date()): boolean {
  const q = prefs.quiet_hours
  if (!q.enabled) return false
  const day = now.getDay()
  if (q.days?.length && !q.days.includes(day)) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const start = parseTimeMinutes(q.start)
  const end = parseTimeMinutes(q.end)
  if (start === end) return false
  if (start < end) return mins >= start && mins < end
  return mins >= start || mins < end
}

export class PushNotificationService {
  private schemaReady = false
  private vapidReady = false

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return
    if (!config.postgres.connectionString && !config.postgres.host) {
      this.schemaReady = true
      return
    }

    await query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        organization_id VARCHAR(36) NULL,
        app_context VARCHAR(32) NOT NULL,
        device_id VARCHAR(64) NOT NULL,
        browser VARCHAR(80) NULL,
        operating_system VARCHAR(80) NULL,
        push_endpoint TEXT NOT NULL,
        push_p256dh TEXT NOT NULL,
        push_auth TEXT NOT NULL,
        permission_status VARCHAR(20) NOT NULL DEFAULT 'granted',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        preferences_json JSONB NOT NULL DEFAULT '{}',
        last_seen_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_endpoint ON push_subscriptions (push_endpoint)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_push_sub_user_ctx ON push_subscriptions (user_id, app_context)`)

    await query(`
      CREATE TABLE IF NOT EXISTS push_event_policies (
        id VARCHAR(36) PRIMARY KEY,
        app_context VARCHAR(32) NOT NULL,
        event_key VARCHAR(80) NOT NULL,
        category VARCHAR(40) NOT NULL,
        label VARCHAR(120) NOT NULL,
        description TEXT NULL,
        default_priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        mandatory BOOLEAN NOT NULL DEFAULT FALSE,
        channels_json JSONB NOT NULL DEFAULT '["in_app","push"]',
        sound_key VARCHAR(40) NULL,
        profile_rules_json JSONB NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_push_event_ctx_key
        ON push_event_policies (app_context, event_key)
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS push_delivery_log (
        id BIGSERIAL PRIMARY KEY,
        notification_id VARCHAR(64) NULL,
        subscription_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NOT NULL,
        app_context VARCHAR(32) NOT NULL,
        event_key VARCHAR(80) NOT NULL,
        status VARCHAR(20) NOT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(`CREATE INDEX IF NOT EXISTS idx_push_delivery_created ON push_delivery_log (created_at DESC)`)

    await this.seedEventPolicies()
    this.schemaReady = true
  }

  private async seedEventPolicies(): Promise<void> {
    for (const ev of PUSH_EVENT_SEED) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM push_event_policies WHERE app_context = ? AND event_key = ? LIMIT 1`,
        [ev.app_context, ev.event_key],
      )
      if (existing) continue
      await query(
        `INSERT INTO push_event_policies
           (id, app_context, event_key, category, label, description, default_priority,
            default_enabled, mandatory, sound_key, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          ev.app_context,
          ev.event_key,
          ev.category,
          ev.label,
          ev.description || null,
          ev.default_priority,
          ev.default_enabled,
          ev.mandatory,
          ev.sound_key || null,
          ev.sort_order,
        ],
      )
    }
    const flag = await masterService.getSetting<string>("push_events_seeded_at")
    if (!flag) {
      await masterService.setSetting("push_events_seeded_at", new Date().toISOString())
    }
  }

  /**
   * Chave pública VAPID URL-safe base64 deve decodificar em 65 bytes (uncompressed P-256 point).
   * Placeholders do .env (ex.: "sua-chave-publica-aqui") quebram o subscribe do browser.
   */
  private isValidVapidPublicKey(raw: string | null | undefined): boolean {
    const key = String(raw || "").trim()
    if (!key || key.length < 80) return false
    if (/sua-chave|your-|example|placeholder|changeme|xxx/i.test(key)) return false
    try {
      const pad = "=".repeat((4 - (key.length % 4)) % 4)
      const b64 = (key + pad).replace(/-/g, "+").replace(/_/g, "/")
      const buf = Buffer.from(b64, "base64")
      return buf.length === 65 && buf[0] === 0x04
    } catch {
      return false
    }
  }

  private isValidVapidPrivateKey(raw: string | null | undefined): boolean {
    const key = String(raw || "").trim()
    if (!key || key.length < 20) return false
    if (/sua-chave|your-|example|placeholder|changeme|xxx/i.test(key)) return false
    try {
      const pad = "=".repeat((4 - (key.length % 4)) % 4)
      const b64 = (key + pad).replace(/-/g, "+").replace(/_/g, "/")
      const buf = Buffer.from(b64, "base64")
      // private key is 32 bytes for P-256
      return buf.length === 32
    } catch {
      return false
    }
  }

  private async ensureVapid(): Promise<{ publicKey: string; privateKey: string; subject: string }> {
    const sub =
      String(process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || "").trim()
      || (await masterService.getSetting<string>("vapid_subject"))
      || "mailto:admin@leadcapture.online"

    if (this.vapidReady) {
      const pub = process.env.VAPID_PUBLIC_KEY || (await masterService.getSetting<string>("vapid_public_key"))
      const priv = process.env.VAPID_PRIVATE_KEY || (await masterService.getSetting<string>("vapid_private_key"))
      if (this.isValidVapidPublicKey(pub) && this.isValidVapidPrivateKey(priv)) {
        webpush.setVapidDetails(sub, String(pub).trim(), String(priv).trim())
        return { publicKey: String(pub).trim(), privateKey: String(priv).trim(), subject: sub }
      }
      // cache stale — revalida abaixo
      this.vapidReady = false
    }

    let pub = process.env.VAPID_PUBLIC_KEY || (await masterService.getSetting<string>("vapid_public_key"))
    let priv = process.env.VAPID_PRIVATE_KEY || (await masterService.getSetting<string>("vapid_private_key"))

    // Env com placeholder ou chave corrompida: ignora e usa DB / gera par novo
    if (!this.isValidVapidPublicKey(pub) || !this.isValidVapidPrivateKey(priv)) {
      const dbPub = await masterService.getSetting<string>("vapid_public_key")
      const dbPriv = await masterService.getSetting<string>("vapid_private_key")
      if (this.isValidVapidPublicKey(dbPub) && this.isValidVapidPrivateKey(dbPriv)) {
        pub = dbPub
        priv = dbPriv
        logger.warn(
          "VAPID env inválido/placeholder — usando chaves válidas do banco (system_settings)",
        )
      } else {
        const keys = webpush.generateVAPIDKeys()
        pub = keys.publicKey
        priv = keys.privateKey
        await masterService.setSetting("vapid_public_key", pub)
        await masterService.setSetting("vapid_private_key", priv)
        await masterService.setSetting("vapid_subject", sub)
        logger.info("Generated valid VAPID keys for Web Push (previous keys were missing/invalid)")
      }
    }

    const publicKey = String(pub).trim()
    const privateKey = String(priv).trim()
    if (!this.isValidVapidPublicKey(publicKey) || !this.isValidVapidPrivateKey(privateKey)) {
      throw new Error("Falha ao carregar chaves VAPID válidas para push")
    }

    webpush.setVapidDetails(sub, publicKey, privateKey)
    this.vapidReady = true
    return { publicKey, privateKey, subject: sub }
  }

  async getPublicVapidKey(): Promise<string> {
    await this.ensureSchema()
    const { publicKey } = await this.ensureVapid()
    return publicKey
  }

  async listEventPolicies(appContext?: PushAppContext): Promise<PushEventDefinition[]> {
    await this.ensureSchema()
    const rows = await query<any[]>(
      appContext
        ? `SELECT * FROM push_event_policies WHERE is_active = TRUE AND app_context = ? ORDER BY sort_order, label`
        : `SELECT * FROM push_event_policies WHERE is_active = TRUE ORDER BY app_context, sort_order, label`,
      appContext ? [appContext] : [],
    )
    return (rows || []).map(r => ({
      id: r.id,
      event_key: r.event_key,
      app_context: r.app_context,
      category: r.category,
      label: r.label,
      description: r.description,
      default_priority: r.default_priority,
      default_enabled: !!r.default_enabled,
      mandatory: !!r.mandatory,
      sound_key: r.sound_key,
      sort_order: r.sort_order,
      is_active: !!r.is_active,
    }))
  }

  async updateEventPolicy(
    id: string,
    patch: Partial<{
      label: string
      description: string
      default_priority: PushPriority
      default_enabled: boolean
      mandatory: boolean
      sound_key: string
      is_active: boolean
      sort_order: number
    }>,
  ): Promise<void> {
    await this.ensureSchema()
    const fields: string[] = []
    const values: any[] = []
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      fields.push(`${k} = ?`)
      values.push(v)
    }
    if (!fields.length) return
    fields.push("updated_at = NOW()")
    values.push(id)
    await query(`UPDATE push_event_policies SET ${fields.join(", ")} WHERE id = ?`, values)
  }

  async registerSubscription(input: {
    userId: string
    organizationId?: string | null
    appContext: PushAppContext
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
    deviceId?: string
    browser?: string
    operatingSystem?: string
    preferences?: Partial<DevicePushPreferences>
  }): Promise<PushSubscriptionRow> {
    await this.ensureSchema()
    const endpoint = String(input.subscription.endpoint || "").trim()
    if (!endpoint) throw new Error("missing_endpoint")

    const deviceId = String(input.deviceId || endpointHash(endpoint)).trim()
    const prefs = mergePrefs(input.preferences)
    const id = randomUUID()

    await query(
      `INSERT INTO push_subscriptions
         (id, user_id, organization_id, app_context, device_id, browser, operating_system,
          push_endpoint, push_p256dh, push_auth, permission_status, is_active, sound_enabled,
          preferences_json, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'granted', TRUE, ?, ?, NOW())
       ON CONFLICT (push_endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         organization_id = EXCLUDED.organization_id,
         app_context = EXCLUDED.app_context,
         device_id = EXCLUDED.device_id,
         browser = EXCLUDED.browser,
         operating_system = EXCLUDED.operating_system,
         push_p256dh = EXCLUDED.push_p256dh,
         push_auth = EXCLUDED.push_auth,
         permission_status = 'granted',
         is_active = TRUE,
         sound_enabled = EXCLUDED.sound_enabled,
         preferences_json = EXCLUDED.preferences_json,
         last_seen_at = NOW(),
         updated_at = NOW()`,
      [
        id,
        input.userId,
        input.organizationId || null,
        input.appContext,
        deviceId,
        input.browser || null,
        input.operatingSystem || null,
        endpoint,
        input.subscription.keys.p256dh,
        input.subscription.keys.auth,
        prefs.sound_enabled,
        JSON.stringify(prefs),
      ],
    )

    const row = await queryOne<any>(`SELECT * FROM push_subscriptions WHERE push_endpoint = ?`, [endpoint])
    return this.mapSubscription(row)
  }

  async unregisterSubscription(userId: string, endpoint: string): Promise<boolean> {
    await this.ensureSchema()
    await query(
      `UPDATE push_subscriptions SET is_active = FALSE, permission_status = 'revoked', updated_at = NOW()
       WHERE user_id = ? AND push_endpoint = ?`,
      [userId, endpoint],
    )
    return true
  }

  async listDevices(userId: string, appContext?: PushAppContext): Promise<PushSubscriptionRow[]> {
    await this.ensureSchema()
    const rows = await query<any[]>(
      appContext
        ? `SELECT * FROM push_subscriptions WHERE user_id = ? AND app_context = ? AND is_active = TRUE ORDER BY last_seen_at DESC NULLS LAST`
        : `SELECT * FROM push_subscriptions WHERE user_id = ? AND is_active = TRUE ORDER BY last_seen_at DESC NULLS LAST`,
      appContext ? [userId, appContext] : [userId],
    )
    return (rows || []).map(r => this.mapSubscription(r))
  }

  async updateDevicePreferences(
    userId: string,
    subscriptionId: string,
    patch: Partial<DevicePushPreferences> & { sound_enabled?: boolean; is_active?: boolean },
  ): Promise<PushSubscriptionRow | null> {
    await this.ensureSchema()
    const row = await queryOne<any>(
      `SELECT * FROM push_subscriptions WHERE id = ? AND user_id = ? LIMIT 1`,
      [subscriptionId, userId],
    )
    if (!row) return null

    const prefs = mergePrefs({ ...parseJson(row.preferences_json, {}), ...patch })
    if ("events" in patch && patch.events) {
      prefs.events = { ...prefs.events, ...patch.events }
    }
    if ("sound_events" in patch && patch.sound_events) {
      prefs.sound_events = { ...prefs.sound_events, ...patch.sound_events }
    }

    const fields = ["preferences_json = ?", "updated_at = NOW()", "last_seen_at = NOW()"]
    const values: any[] = [JSON.stringify(prefs)]
    if (patch.sound_enabled !== undefined) {
      fields.push("sound_enabled = ?")
      values.push(!!patch.sound_enabled)
    }
    if (patch.is_active !== undefined || patch.device_enabled !== undefined) {
      const active = patch.is_active ?? patch.device_enabled
      fields.push("is_active = ?")
      values.push(!!active)
    }
    values.push(subscriptionId, userId)
    await query(`UPDATE push_subscriptions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values)
    const updated = await queryOne<any>(`SELECT * FROM push_subscriptions WHERE id = ?`, [subscriptionId])
    return updated ? this.mapSubscription(updated) : null
  }

  private mapSubscription(row: any): PushSubscriptionRow {
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
      app_context: row.app_context as PushAppContext,
      device_id: String(row.device_id),
      browser: row.browser,
      operating_system: row.operating_system,
      push_endpoint: String(row.push_endpoint),
      permission_status: row.permission_status,
      is_active: !!row.is_active,
      sound_enabled: !!row.sound_enabled,
      preferences_json: mergePrefs(parseJson(row.preferences_json, {})),
      last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    }
  }

  private async shouldSendToDevice(
    sub: PushSubscriptionRow,
    eventKey: string,
    priority: PushPriority,
    policy: { mandatory: boolean; default_enabled: boolean } | null,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!sub.is_active) return { ok: false, reason: "device_inactive" }
    const prefs = sub.preferences_json
    if (!prefs.device_enabled) return { ok: false, reason: "device_disabled" }

    const mandatory = policy?.mandatory
    const eventEnabled = prefs.events[eventKey]
    const defaultOn = policy?.default_enabled !== false
    if (!mandatory && eventEnabled === false) return { ok: false, reason: "event_disabled" }
    if (!mandatory && eventEnabled === undefined && !defaultOn) return { ok: false, reason: "event_default_off" }

    if (isQuietHours(prefs)) {
      const q = prefs.quiet_hours
      if (priority === "critical" && (prefs.critical_override_quiet || q.allow_critical)) {
        return { ok: true }
      }
      if (priority === "critical" && mandatory) return { ok: true }
      return { ok: false, reason: "quiet_hours" }
    }
    return { ok: true }
  }

  async sendToUser(input: {
    userId: string
    appContext?: PushAppContext
    eventKey: string
    title: string
    body: string
    priority?: PushPriority
    url?: string
    notificationId?: string
    metadata?: Record<string, any>
  }): Promise<{ sent: number; skipped: number; failed: number }> {
    await this.ensureSchema()
    await this.ensureVapid()

    const policy = await queryOne<any>(
      `SELECT * FROM push_event_policies WHERE event_key = ? ${input.appContext ? "AND app_context = ?" : ""} LIMIT 1`,
      input.appContext ? [input.eventKey, input.appContext] : [input.eventKey],
    )

    const priority: PushPriority = input.priority || policy?.default_priority || "normal"
    const subs = await this.listDevices(input.userId, input.appContext)
    let sent = 0
    let skipped = 0
    let failed = 0

    for (const sub of subs) {
      const gate = await this.shouldSendToDevice(sub, input.eventKey, priority, policy)
      if (!gate.ok) {
        skipped++
        await this.logDelivery({
          notificationId: input.notificationId,
          subscriptionId: sub.id,
          userId: input.userId,
          appContext: sub.app_context,
          eventKey: input.eventKey,
          status: "skipped",
          errorMessage: gate.reason,
        })
        continue
      }

      const soundKey = policy?.sound_key || sub.preferences_json.sounds.default || "default"
      const eventSoundPref = sub.preferences_json.sound_events?.[input.eventKey]
      const playSound = sub.sound_enabled && eventSoundPref !== false
      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        tag: `${input.eventKey}:${input.notificationId || randomUUID().slice(0, 8)}`,
        requireInteraction: priority === "critical",
        data: {
          url: input.url || "/",
          event: input.eventKey,
          priority,
          notification_id: input.notificationId,
          sound: playSound ? soundKey : null,
          vibrate: sub.preferences_json.vibrate_enabled ? [200, 100, 200] : null,
          ...input.metadata,
        },
      })

      const keysRow = await queryOne<{ push_p256dh: string; push_auth: string }>(
        `SELECT push_p256dh, push_auth FROM push_subscriptions WHERE id = ?`,
        [sub.id],
      )
      if (!keysRow) {
        skipped++
        continue
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.push_endpoint,
            keys: { p256dh: keysRow.push_p256dh, auth: keysRow.push_auth },
          },
          payload,
          { TTL: priority === "critical" ? 86400 : 43200 },
        )
        sent++
        await this.logDelivery({
          notificationId: input.notificationId,
          subscriptionId: sub.id,
          userId: input.userId,
          appContext: sub.app_context,
          eventKey: input.eventKey,
          status: "sent",
        })
      } catch (err: any) {
        const statusCode = err?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await query(`UPDATE push_subscriptions SET is_active = FALSE, updated_at = NOW() WHERE id = ?`, [sub.id])
        }
        failed++
        await this.logDelivery({
          notificationId: input.notificationId,
          subscriptionId: sub.id,
          userId: input.userId,
          appContext: sub.app_context,
          eventKey: input.eventKey,
          status: "failed",
          errorMessage: err?.message || String(err),
        })
      }
    }

    return { sent, skipped, failed }
  }

  private async logDelivery(entry: {
    notificationId?: string
    subscriptionId?: string
    userId: string
    appContext: PushAppContext
    eventKey: string
    status: string
    errorMessage?: string
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO push_delivery_log (notification_id, subscription_id, user_id, app_context, event_key, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.notificationId || null,
          entry.subscriptionId || null,
          entry.userId,
          entry.appContext,
          entry.eventKey,
          entry.status,
          entry.errorMessage || null,
        ],
      )
    } catch (err: any) {
      logger.warn(`push delivery log failed: ${err?.message}`)
    }
  }

  async listDeliveryAudit(limit = 100): Promise<any[]> {
    await this.ensureSchema()
    return await query(
      `SELECT * FROM push_delivery_log ORDER BY created_at DESC LIMIT ?`,
      [Math.min(500, Math.max(10, limit))],
    )
  }
}

let instance: PushNotificationService | null = null

export function getPushNotificationService(): PushNotificationService {
  if (!instance) instance = new PushNotificationService()
  return instance
}