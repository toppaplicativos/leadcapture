/**
 * LeadCapture Connect (Android companion)
 * Devices, instance bindings, and remote command queue.
 */
import { randomUUID } from "crypto";
import { query, queryOne, insert } from "../config/database";
import { logger } from "../utils/logger";
import {
  buildInstanceAccessFilter,
  ensureWhatsAppInstanceOwnerSchema,
  instanceBelongsToScope,
  resolveInstanceAuthScope,
  type InstanceAuthScope,
} from "./instanceOwnership";
import { socketManager } from "../core/socketManager";

export type ConnectCommandType =
  | "OPEN_PAIRING"
  | "SHOW_QR"
  | "OPEN_WHATSAPP_NATIVE"
  | "REFRESH_STATUS"
  | "CREATE_LOCAL_SLOT"
  | "PAUSE_SLOT"
  | "DELETE_BINDING"
  | "SYNC_NOW";

export type ConnectCommandStatus = "pending" | "accepted" | "done" | "failed" | "expired";

export type ConnectDeviceRow = {
  id: string;
  user_id: string;
  owner_user_id: string;
  brand_id: string | null;
  device_id: string;
  display_name: string | null;
  model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  app_version: string | null;
  fcm_token: string | null;
  last_seen_at: string | null;
  last_heartbeat_json: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ConnectBindingRow = {
  id: string;
  user_id: string;
  owner_user_id: string;
  brand_id: string | null;
  device_id: string;
  local_clone_id: number | null;
  instance_id: string;
  label: string | null;
  color_hex: string | null;
  group_name: string | null;
  app_type: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConnectCommandRow = {
  id: string;
  user_id: string;
  owner_user_id: string;
  brand_id: string | null;
  device_id: string;
  command_type: ConnectCommandType;
  payload_json: any;
  status: ConnectCommandStatus;
  result_json: any;
  expires_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export async function ensureConnectSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS connect_devices (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        device_id VARCHAR(80) NOT NULL,
        display_name VARCHAR(120) NULL,
        model VARCHAR(120) NULL,
        manufacturer VARCHAR(120) NULL,
        os_version VARCHAR(40) NULL,
        app_version VARCHAR(40) NULL,
        fcm_token TEXT NULL,
        last_seen_at TIMESTAMP NULL,
        last_heartbeat_json JSONB NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, device_id)
      )
    `).catch((e) => logger.warn(`[connect] devices table: ${e?.message}`));

    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_devices_owner ON connect_devices (owner_user_id, is_active)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_devices_device ON connect_devices (device_id)`
    ).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS connect_bindings (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        device_id VARCHAR(80) NOT NULL,
        local_clone_id INT NULL,
        instance_id VARCHAR(64) NOT NULL,
        label VARCHAR(120) NULL,
        color_hex VARCHAR(16) NULL,
        group_name VARCHAR(80) NULL,
        app_type VARCHAR(40) NOT NULL DEFAULT 'WHATSAPP',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_sync_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (device_id, instance_id)
      )
    `).catch((e) => logger.warn(`[connect] bindings table: ${e?.message}`));

    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_bindings_user ON connect_bindings (user_id, is_active)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_bindings_instance ON connect_bindings (instance_id)`
    ).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS connect_commands (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        device_id VARCHAR(80) NOT NULL,
        command_type VARCHAR(40) NOT NULL,
        payload_json JSONB NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        result_json JSONB NULL,
        expires_at TIMESTAMP NULL,
        accepted_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((e) => logger.warn(`[connect] commands table: ${e?.message}`));

    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_commands_device_status
       ON connect_commands (device_id, status, created_at)`
    ).catch(() => undefined);

    await query(`
      CREATE TABLE IF NOT EXISTS connect_activity (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        device_id VARCHAR(80) NULL,
        instance_id VARCHAR(64) NULL,
        event_key VARCHAR(60) NOT NULL,
        message TEXT NULL,
        meta_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((e) => logger.warn(`[connect] activity table: ${e?.message}`));

    await query(
      `CREATE INDEX IF NOT EXISTS idx_connect_activity_user ON connect_activity (user_id, created_at DESC)`
    ).catch(() => undefined);

    schemaReady = true;
  })();
  try {
    await schemaPromise;
  } finally {
    schemaPromise = null;
  }
}

function parseJsonField(raw: any): any {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function mapDevice(row: any): ConnectDeviceRow {
  return {
    ...row,
    last_heartbeat_json: parseJsonField(row.last_heartbeat_json),
    is_active: Boolean(row.is_active),
  };
}

function mapBinding(row: any): ConnectBindingRow {
  return {
    ...row,
    local_clone_id: row.local_clone_id != null ? Number(row.local_clone_id) : null,
    is_active: Boolean(row.is_active),
  };
}

function mapCommand(row: any): ConnectCommandRow {
  return {
    ...row,
    payload_json: parseJsonField(row.payload_json),
    result_json: parseJsonField(row.result_json),
  };
}

async function logActivity(input: {
  userId: string;
  ownerUserId: string;
  deviceId?: string | null;
  instanceId?: string | null;
  eventKey: string;
  message?: string;
  meta?: Record<string, any>;
}) {
  await insert(
    `INSERT INTO connect_activity
       (id, user_id, owner_user_id, device_id, instance_id, event_key, message, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.userId,
      input.ownerUserId,
      input.deviceId || null,
      input.instanceId || null,
      input.eventKey,
      input.message || null,
      input.meta ? JSON.stringify(input.meta) : null,
    ]
  ).catch(() => undefined);
}

export const connectDeviceService = {
  async registerDevice(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    displayName?: string;
    model?: string;
    manufacturer?: string;
    osVersion?: string;
    appVersion?: string;
    fcmToken?: string | null;
    brandId?: string | null;
  }): Promise<ConnectDeviceRow> {
    await ensureConnectSchema();
    const deviceId = String(input.deviceId || "").trim();
    if (!deviceId || deviceId.length < 8) {
      throw Object.assign(new Error("device_id inválido"), { status: 400, code: "invalid_device_id" });
    }

    const brandId = input.brandId || input.scope.brandId || null;
    const existing = await queryOne<any>(
      `SELECT * FROM connect_devices WHERE user_id = ? AND device_id = ? LIMIT 1`,
      [input.scope.actorUserId, deviceId]
    );

    const now = new Date().toISOString();
    if (existing) {
      await query(
        `UPDATE connect_devices SET
           owner_user_id = ?,
           brand_id = COALESCE(?, brand_id),
           display_name = COALESCE(?, display_name),
           model = COALESCE(?, model),
           manufacturer = COALESCE(?, manufacturer),
           os_version = COALESCE(?, os_version),
           app_version = COALESCE(?, app_version),
           fcm_token = COALESCE(?, fcm_token),
           last_seen_at = ?,
           is_active = TRUE,
           updated_at = ?
         WHERE id = ?`,
        [
          input.scope.ownerUserId,
          brandId,
          input.displayName || null,
          input.model || null,
          input.manufacturer || null,
          input.osVersion || null,
          input.appVersion || null,
          input.fcmToken ?? null,
          now,
          now,
          existing.id,
        ]
      );
      const updated = await queryOne<any>(`SELECT * FROM connect_devices WHERE id = ?`, [existing.id]);
      await logActivity({
        userId: input.scope.actorUserId,
        ownerUserId: input.scope.ownerUserId,
        deviceId,
        eventKey: "device_reconnected",
        message: "Dispositivo Connect re-registrado",
      });
      return mapDevice(updated);
    }

    const id = randomUUID();
    await insert(
      `INSERT INTO connect_devices
         (id, user_id, owner_user_id, brand_id, device_id, display_name, model, manufacturer,
          os_version, app_version, fcm_token, last_seen_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        id,
        input.scope.actorUserId,
        input.scope.ownerUserId,
        brandId,
        deviceId,
        input.displayName || null,
        input.model || null,
        input.manufacturer || null,
        input.osVersion || null,
        input.appVersion || null,
        input.fcmToken || null,
        now,
      ]
    );
    const created = await queryOne<any>(`SELECT * FROM connect_devices WHERE id = ?`, [id]);
    await logActivity({
      userId: input.scope.actorUserId,
      ownerUserId: input.scope.ownerUserId,
      deviceId,
      eventKey: "device_registered",
      message: "Dispositivo Connect registrado",
    });
    return mapDevice(created);
  },

  async heartbeat(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    battery?: number | null;
    network?: string | null;
    clonesSummary?: any;
    meta?: Record<string, any>;
  }): Promise<ConnectDeviceRow | null> {
    await ensureConnectSchema();
    const deviceId = String(input.deviceId || "").trim();
    const row = await queryOne<any>(
      `SELECT * FROM connect_devices WHERE user_id = ? AND device_id = ? AND is_active = TRUE LIMIT 1`,
      [input.scope.actorUserId, deviceId]
    );
    if (!row) return null;

    const heartbeat = {
      battery: input.battery ?? null,
      network: input.network ?? null,
      clones_summary: input.clonesSummary ?? null,
      meta: input.meta || {},
      at: new Date().toISOString(),
    };
    const now = new Date().toISOString();
    await query(
      `UPDATE connect_devices SET last_seen_at = ?, last_heartbeat_json = ?, updated_at = ? WHERE id = ?`,
      [now, JSON.stringify(heartbeat), now, row.id]
    );
    const updated = await queryOne<any>(`SELECT * FROM connect_devices WHERE id = ?`, [row.id]);
    return mapDevice(updated);
  },

  async listDevices(scope: InstanceAuthScope): Promise<ConnectDeviceRow[]> {
    await ensureConnectSchema();
    const rows = await query<any[]>(
      `SELECT * FROM connect_devices
       WHERE owner_user_id = ?
         AND (user_id = ? OR ? = ?)
         AND is_active = TRUE
       ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
      [scope.ownerUserId, scope.actorUserId, scope.actorUserId, scope.ownerUserId]
    ).catch(async () => {
      // Fallback without NULLS LAST for older engines
      return query<any[]>(
        `SELECT * FROM connect_devices
         WHERE owner_user_id = ?
           AND is_active = TRUE
         ORDER BY created_at DESC`,
        [scope.ownerUserId]
      );
    });
    return (rows || []).map(mapDevice);
  },

  async upsertBinding(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    instanceId: string;
    localCloneId?: number | null;
    label?: string | null;
    colorHex?: string | null;
    groupName?: string | null;
    appType?: string;
    brandId?: string | null;
  }): Promise<ConnectBindingRow> {
    await ensureConnectSchema();
    await ensureWhatsAppInstanceOwnerSchema();

    const deviceId = String(input.deviceId || "").trim();
    const instanceId = String(input.instanceId || "").trim();
    if (!deviceId || !instanceId) {
      throw Object.assign(new Error("device_id e instance_id são obrigatórios"), {
        status: 400,
        code: "missing_fields",
      });
    }

    const brandId = input.brandId || input.scope.brandId || null;
    const allowed = await instanceBelongsToScope(instanceId, input.scope, brandId);
    if (!allowed) {
      throw Object.assign(new Error("Instância não encontrada no escopo"), {
        status: 404,
        code: "instance_not_found",
      });
    }

    const existing = await queryOne<any>(
      `SELECT * FROM connect_bindings WHERE device_id = ? AND instance_id = ? LIMIT 1`,
      [deviceId, instanceId]
    );
    const now = new Date().toISOString();

    if (existing) {
      await query(
        `UPDATE connect_bindings SET
           user_id = ?,
           owner_user_id = ?,
           brand_id = COALESCE(?, brand_id),
           local_clone_id = COALESCE(?, local_clone_id),
           label = COALESCE(?, label),
           color_hex = COALESCE(?, color_hex),
           group_name = COALESCE(?, group_name),
           app_type = COALESCE(?, app_type),
           is_active = TRUE,
           last_sync_at = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          input.scope.actorUserId,
          input.scope.ownerUserId,
          brandId,
          input.localCloneId ?? null,
          input.label ?? null,
          input.colorHex ?? null,
          input.groupName ?? null,
          input.appType || "WHATSAPP",
          now,
          now,
          existing.id,
        ]
      );
      const updated = await queryOne<any>(`SELECT * FROM connect_bindings WHERE id = ?`, [existing.id]);
      await logActivity({
        userId: input.scope.actorUserId,
        ownerUserId: input.scope.ownerUserId,
        deviceId,
        instanceId,
        eventKey: "binding_updated",
        message: `Binding atualizado para instância ${instanceId}`,
      });
      try {
        socketManager.emitToUser(input.scope.ownerUserId, "connect:binding_updated", {
          binding: mapBinding(updated),
        });
      } catch {
        /* ignore */
      }
      return mapBinding(updated);
    }

    const id = randomUUID();
    await insert(
      `INSERT INTO connect_bindings
         (id, user_id, owner_user_id, brand_id, device_id, local_clone_id, instance_id,
          label, color_hex, group_name, app_type, is_active, last_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
      [
        id,
        input.scope.actorUserId,
        input.scope.ownerUserId,
        brandId,
        deviceId,
        input.localCloneId ?? null,
        instanceId,
        input.label || null,
        input.colorHex || null,
        input.groupName || null,
        input.appType || "WHATSAPP",
        now,
      ]
    );
    const created = await queryOne<any>(`SELECT * FROM connect_bindings WHERE id = ?`, [id]);
    await logActivity({
      userId: input.scope.actorUserId,
      ownerUserId: input.scope.ownerUserId,
      deviceId,
      instanceId,
      eventKey: "binding_created",
      message: `Binding criado para instância ${instanceId}`,
    });
    try {
      socketManager.emitToUser(input.scope.ownerUserId, "connect:binding_updated", {
        binding: mapBinding(created),
      });
    } catch {
      /* ignore */
    }
    return mapBinding(created);
  },

  async listBindings(input: {
    scope: InstanceAuthScope;
    deviceId?: string | null;
  }): Promise<ConnectBindingRow[]> {
    await ensureConnectSchema();
    const deviceId = input.deviceId ? String(input.deviceId).trim() : "";
    let rows: any[];
    if (deviceId) {
      rows = await query<any[]>(
        `SELECT * FROM connect_bindings
         WHERE owner_user_id = ? AND device_id = ? AND is_active = TRUE
         ORDER BY updated_at DESC`,
        [input.scope.ownerUserId, deviceId]
      );
    } else {
      rows = await query<any[]>(
        `SELECT * FROM connect_bindings
         WHERE owner_user_id = ? AND user_id = ? AND is_active = TRUE
         ORDER BY updated_at DESC`,
        [input.scope.ownerUserId, input.scope.actorUserId]
      );
    }
    return (rows || []).map(mapBinding);
  },

  async deleteBinding(input: {
    scope: InstanceAuthScope;
    bindingId: string;
  }): Promise<boolean> {
    await ensureConnectSchema();
    const row = await queryOne<any>(
      `SELECT * FROM connect_bindings WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [input.bindingId, input.scope.ownerUserId]
    );
    if (!row) return false;
    // affiliate can only delete own bindings
    if (input.scope.isAffiliate && String(row.user_id) !== input.scope.actorUserId) {
      return false;
    }
    await query(
      `UPDATE connect_bindings SET is_active = FALSE, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), input.bindingId]
    );
    await logActivity({
      userId: input.scope.actorUserId,
      ownerUserId: input.scope.ownerUserId,
      deviceId: row.device_id,
      instanceId: row.instance_id,
      eventKey: "binding_deleted",
      message: "Binding removido",
    });
    try {
      socketManager.emitToUser(input.scope.ownerUserId, "connect:binding_updated", {
        binding_id: input.bindingId,
        deleted: true,
      });
    } catch {
      /* ignore */
    }
    return true;
  },

  async enqueueCommand(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    commandType: ConnectCommandType;
    payload?: Record<string, any>;
    brandId?: string | null;
    ttlMinutes?: number;
  }): Promise<ConnectCommandRow> {
    await ensureConnectSchema();
    const deviceId = String(input.deviceId || "").trim();
    if (!deviceId) {
      throw Object.assign(new Error("device_id obrigatório"), { status: 400, code: "missing_device_id" });
    }
    const device = await queryOne<any>(
      `SELECT * FROM connect_devices WHERE device_id = ? AND owner_user_id = ? AND is_active = TRUE LIMIT 1`,
      [deviceId, input.scope.ownerUserId]
    );
    if (!device) {
      throw Object.assign(new Error("Dispositivo não registrado"), {
        status: 404,
        code: "device_not_found",
      });
    }

    const id = randomUUID();
    const ttl = Math.min(Math.max(Number(input.ttlMinutes || 30), 1), 24 * 60);
    const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
    const now = new Date().toISOString();

    await insert(
      `INSERT INTO connect_commands
         (id, user_id, owner_user_id, brand_id, device_id, command_type, payload_json, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        id,
        input.scope.actorUserId,
        input.scope.ownerUserId,
        input.brandId || input.scope.brandId || device.brand_id || null,
        deviceId,
        input.commandType,
        JSON.stringify(input.payload || {}),
        expiresAt,
      ]
    );

    const created = await queryOne<any>(`SELECT * FROM connect_commands WHERE id = ?`, [id]);
    const mapped = mapCommand(created);

    await logActivity({
      userId: input.scope.actorUserId,
      ownerUserId: input.scope.ownerUserId,
      deviceId,
      instanceId: input.payload?.instance_id || null,
      eventKey: "command_enqueued",
      message: `Comando ${input.commandType}`,
      meta: { command_id: id },
    });

    try {
      socketManager.emitToUser(String(device.user_id), "connect:command", {
        command: mapped,
      });
      if (String(device.user_id) !== input.scope.ownerUserId) {
        socketManager.emitToUser(input.scope.ownerUserId, "connect:command", { command: mapped });
      }
    } catch {
      /* ignore */
    }

    return mapped;
  },

  async listCommands(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    status?: ConnectCommandStatus | "open";
    limit?: number;
  }): Promise<ConnectCommandRow[]> {
    await ensureConnectSchema();
    const deviceId = String(input.deviceId || "").trim();
    const limit = Math.min(Math.max(Number(input.limit || 50), 1), 100);
    const status = input.status || "open";

    // expire old pending
    await query(
      `UPDATE connect_commands
       SET status = 'expired', updated_at = ?
       WHERE device_id = ?
         AND status = 'pending'
         AND expires_at IS NOT NULL
         AND expires_at < ?`,
      [new Date().toISOString(), deviceId, new Date().toISOString()]
    ).catch(() => undefined);

    let rows: any[];
    if (status === "open") {
      rows = await query<any[]>(
        `SELECT * FROM connect_commands
         WHERE device_id = ?
           AND owner_user_id = ?
           AND status IN ('pending', 'accepted')
         ORDER BY created_at ASC
         LIMIT ${limit}`,
        [deviceId, input.scope.ownerUserId]
      );
    } else {
      rows = await query<any[]>(
        `SELECT * FROM connect_commands
         WHERE device_id = ?
           AND owner_user_id = ?
           AND status = ?
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        [deviceId, input.scope.ownerUserId, status]
      );
    }
    return (rows || []).map(mapCommand);
  },

  async ackCommand(input: {
    scope: InstanceAuthScope;
    commandId: string;
    status: "accepted" | "done" | "failed";
    detail?: any;
  }): Promise<ConnectCommandRow | null> {
    await ensureConnectSchema();
    const row = await queryOne<any>(
      `SELECT * FROM connect_commands WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [input.commandId, input.scope.ownerUserId]
    );
    if (!row) return null;
    if (input.scope.isAffiliate && String(row.user_id) !== input.scope.actorUserId) {
      // device owner is actor — allow if device belongs to actor
      const device = await queryOne<any>(
        `SELECT user_id FROM connect_devices WHERE device_id = ? LIMIT 1`,
        [row.device_id]
      );
      if (!device || String(device.user_id) !== input.scope.actorUserId) return null;
    }

    const now = new Date().toISOString();
    const acceptedAt =
      input.status === "accepted" || !row.accepted_at ? now : row.accepted_at;
    const completedAt = input.status === "done" || input.status === "failed" ? now : null;

    await query(
      `UPDATE connect_commands SET
         status = ?,
         result_json = ?,
         accepted_at = COALESCE(accepted_at, ?),
         completed_at = COALESCE(?, completed_at),
         updated_at = ?
       WHERE id = ?`,
      [
        input.status,
        JSON.stringify(input.detail || {}),
        acceptedAt,
        completedAt,
        now,
        input.commandId,
      ]
    );

    const updated = await queryOne<any>(`SELECT * FROM connect_commands WHERE id = ?`, [
      input.commandId,
    ]);
    await logActivity({
      userId: input.scope.actorUserId,
      ownerUserId: input.scope.ownerUserId,
      deviceId: row.device_id,
      eventKey: `command_${input.status}`,
      message: `Comando ${row.command_type} → ${input.status}`,
      meta: { command_id: input.commandId },
    });

    try {
      socketManager.emitToUser(input.scope.ownerUserId, "connect:command_ack", {
        command: mapCommand(updated),
      });
    } catch {
      /* ignore */
    }
    return mapCommand(updated);
  },

  async listActivity(input: {
    scope: InstanceAuthScope;
    deviceId?: string | null;
    limit?: number;
  }) {
    await ensureConnectSchema();
    const limit = Math.min(Math.max(Number(input.limit || 40), 1), 100);
    const deviceId = input.deviceId ? String(input.deviceId).trim() : "";
    if (deviceId) {
      return query<any[]>(
        `SELECT * FROM connect_activity
         WHERE owner_user_id = ? AND device_id = ?
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        [input.scope.ownerUserId, deviceId]
      );
    }
    return query<any[]>(
      `SELECT * FROM connect_activity
       WHERE owner_user_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      [input.scope.ownerUserId, input.scope.actorUserId]
    );
  },

  /**
   * Snapshot for the Android app: instances in scope + bindings + open commands.
   */
  async getSyncSnapshot(input: {
    scope: InstanceAuthScope;
    deviceId: string;
    brandId?: string | null;
    instanceManager?: any;
  }) {
    await ensureConnectSchema();
    await ensureWhatsAppInstanceOwnerSchema();

    const brandId = input.brandId || input.scope.brandId || null;
    const accessFilter = buildInstanceAccessFilter(input.scope, brandId, "wi");

    let dbInstances: any[] = [];
    try {
      dbInstances = await query<any[]>(
        `SELECT wi.id, wi.name, wi.phone, wi.status, wi.created_at, wi.last_connected_at,
                wi.brand_id, wi.owner_type, wi.owner_actor_id
         FROM whatsapp_instances wi
         WHERE ${accessFilter.whereSql}
         ORDER BY wi.created_at DESC`,
        accessFilter.params
      );
    } catch (e: any) {
      logger.warn(`[connect] sync instances: ${e?.message}`);
      dbInstances = [];
    }

    const runtimeMap = new Map<string, any>();
    try {
      const all = input.instanceManager?.getAllInstances?.(input.scope.ownerUserId) || [];
      for (const inst of all) runtimeMap.set(inst.id, inst);
    } catch {
      /* ignore */
    }

    const instances = (dbInstances || []).map((row) => {
      const live = runtimeMap.get(row.id);
      return {
        id: row.id,
        name: row.name,
        phone: row.phone || live?.phone || null,
        status: live?.status || row.status || "disconnected",
        has_qr: !!(live?.qrCode),
        brand_id: row.brand_id || null,
        owner_type: row.owner_type || null,
        created_at: row.created_at,
        last_connected_at: row.last_connected_at || null,
      };
    });

    const bindings = await this.listBindings({
      scope: input.scope,
      deviceId: input.deviceId,
    });
    const commands = await this.listCommands({
      scope: input.scope,
      deviceId: input.deviceId,
      status: "open",
    });

    return {
      device_id: input.deviceId,
      brand_id: brandId,
      instances,
      bindings,
      commands,
      server_time: new Date().toISOString(),
    };
  },
};
