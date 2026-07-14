/**
 * Lead Capture Mob — operational shifts, check-in and geofencing (spec §13–14, §18).
 * Independent domain from deliveries/fleet; integrates via courier_id + delivery_id.
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import { mobLogisticsService } from "./mobLogistics";

export type ShiftStatus = "active" | "paused" | "ended";

export type MobShift = {
  id: string;
  courier_id: string;
  owner_user_id: string | null;
  brand_id: string | null;
  status: ShiftStatus;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  vehicle_id: string | null;
  checkin_json: any;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  notes: string | null;
  created_at?: string;
};

export type GeofenceEventType =
  | "arrive_pickup"
  | "leave_pickup"
  | "near_dropoff"
  | "arrive_dropoff"
  | "leave_route"
  | "return_unit";

export type MobGeofenceEvent = {
  id: string;
  courier_id: string;
  delivery_id: string | null;
  brand_id: string | null;
  event_type: GeofenceEventType;
  lat: number;
  lng: number;
  distance_m: number | null;
  meta_json: any;
  created_at?: string;
};

export type CheckInPayload = {
  vehicle_id?: string | null;
  confirm_identity?: boolean;
  confirm_vehicle?: boolean;
  confirm_gps?: boolean;
  confirm_internet?: boolean;
  confirm_notifications?: boolean;
  confirm_kit?: boolean;
  fuel_or_battery_pct?: number | null;
  vehicle_ok?: boolean;
  selfie_url?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  brand_id?: string | null;
  owner_user_id?: string | null;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function parseJson(value: any, fallback: any = null): any {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapShift(row: any): MobShift {
  return {
    id: String(row.id),
    courier_id: String(row.courier_id),
    owner_user_id: row.owner_user_id || null,
    brand_id: row.brand_id || null,
    status: (row.status || "active") as ShiftStatus,
    started_at: row.started_at,
    ended_at: row.ended_at || null,
    paused_at: row.paused_at || null,
    vehicle_id: row.vehicle_id || null,
    checkin_json: parseJson(row.checkin_json, {}),
    start_lat: row.start_lat != null ? num(row.start_lat) : null,
    start_lng: row.start_lng != null ? num(row.start_lng) : null,
    end_lat: row.end_lat != null ? num(row.end_lat) : null,
    end_lng: row.end_lng != null ? num(row.end_lng) : null,
    notes: row.notes || null,
    created_at: row.created_at,
  };
}

async function ensureOpsSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS mob_shifts (
        id VARCHAR(36) PRIMARY KEY,
        courier_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NULL,
        brand_id VARCHAR(36) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        paused_at TIMESTAMP NULL,
        vehicle_id VARCHAR(36) NULL,
        checkin_json JSONB NULL,
        start_lat DOUBLE PRECISION NULL,
        start_lng DOUBLE PRECISION NULL,
        end_lat DOUBLE PRECISION NULL,
        end_lng DOUBLE PRECISION NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_geofence_events (
        id VARCHAR(36) PRIMARY KEY,
        courier_id VARCHAR(36) NOT NULL,
        delivery_id VARCHAR(36) NULL,
        brand_id VARCHAR(36) NULL,
        event_type VARCHAR(40) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        distance_m DOUBLE PRECISION NULL,
        meta_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_shifts_courier ON mob_shifts (courier_id, status)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_geofence_courier ON mob_geofence_events (courier_id, created_at)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_geofence_delivery ON mob_geofence_events (delivery_id, event_type)`
    ).catch(() => undefined);

    // Org geofence radii on settings
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS geofence_pickup_m INT NOT NULL DEFAULT 120`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN geofence_pickup_m INT NOT NULL DEFAULT 120`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS geofence_dropoff_m INT NOT NULL DEFAULT 80`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN geofence_dropoff_m INT NOT NULL DEFAULT 80`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS require_shift_checkin BOOLEAN NOT NULL DEFAULT TRUE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN require_shift_checkin BOOLEAN NOT NULL DEFAULT TRUE`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS geofence_auto_status BOOLEAN NOT NULL DEFAULT TRUE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN geofence_auto_status BOOLEAN NOT NULL DEFAULT TRUE`
      ).catch(() => undefined);
    });

    schemaReady = true;
    logger.info("Mob ops schema ready (shifts + geofence)");
  })().finally(() => {
    schemaPromise = null;
  });

  await schemaPromise;
}

/** Debounce: skip duplicate geofence event of same type within window */
async function recentlyFired(
  courierId: string,
  deliveryId: string | null,
  eventType: string,
  minutes = 8
): Promise<boolean> {
  const mins = Math.max(1, Math.min(minutes, 60));
  const row = await queryOne<any>(
    deliveryId
      ? `SELECT id FROM mob_geofence_events
         WHERE courier_id = ? AND event_type = ? AND delivery_id = ?
           AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         LIMIT 1`
      : `SELECT id FROM mob_geofence_events
         WHERE courier_id = ? AND event_type = ? AND delivery_id IS NULL
           AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         LIMIT 1`,
    deliveryId ? [courierId, eventType, deliveryId, mins] : [courierId, eventType, mins]
  ).catch(() => null);
  return !!row;
}

export const mobOpsService = {
  async ensureSchema() {
    await ensureOpsSchema();
  },

  async getActiveShift(courierId: string): Promise<MobShift | null> {
    await ensureOpsSchema();
    const row = await queryOne<any>(
      `SELECT * FROM mob_shifts
       WHERE courier_id = ? AND status IN ('active','paused')
       ORDER BY started_at DESC LIMIT 1`,
      [courierId]
    );
    return row ? mapShift(row) : null;
  },

  /**
   * Operational check-in + start shift.
   * Blocks when GPS missing (if confirmed false) or vehicle irregular (optional fleet check).
   */
  async startShift(
    courierId: string,
    checkin: CheckInPayload
  ): Promise<{ shift: MobShift; courier: any; blockers: string[] }> {
    await ensureOpsSchema();
    const blockers: string[] = [];

    const existing = await this.getActiveShift(courierId);
    if (existing) {
      return {
        shift: existing,
        courier: await mobLogisticsService.getCourierById(courierId),
        blockers: ["Já existe um turno ativo"],
      };
    }

    if (checkin.confirm_gps === false) {
      blockers.push("GPS precisa estar ativo para iniciar o turno");
    }
    if (checkin.confirm_identity === false) {
      blockers.push("Confirme sua identidade");
    }
    if (checkin.vehicle_ok === false) {
      blockers.push("Veículo reportado com problema — informe a central");
    }

    // Fleet vehicle status if provided
    if (checkin.vehicle_id && checkin.owner_user_id && checkin.brand_id) {
      try {
        const { mobFleetService } = await import("./mobFleet");
        const v = await mobFleetService.getVehicle(
          checkin.owner_user_id,
          checkin.brand_id,
          checkin.vehicle_id
        );
        if (v && ["blocked", "docs_expired", "maintenance", "inactive"].includes(v.status)) {
          blockers.push(`Veículo indisponível (status: ${v.status})`);
        }
      } catch {
        /* fleet optional */
      }
    }

    if (blockers.length) {
      throw new Error(blockers[0]);
    }

    const id = randomUUID();
    const checkinJson = {
      confirm_identity: checkin.confirm_identity !== false,
      confirm_vehicle: !!checkin.confirm_vehicle || !!checkin.vehicle_id,
      confirm_gps: checkin.confirm_gps !== false,
      confirm_internet: checkin.confirm_internet !== false,
      confirm_notifications: checkin.confirm_notifications !== false,
      confirm_kit: checkin.confirm_kit !== false,
      fuel_or_battery_pct: checkin.fuel_or_battery_pct ?? null,
      vehicle_ok: checkin.vehicle_ok !== false,
      selfie_url: checkin.selfie_url || null,
      notes: checkin.notes || null,
      at: new Date().toISOString(),
    };

    await insert(
      `INSERT INTO mob_shifts (
        id, courier_id, owner_user_id, brand_id, status, started_at,
        vehicle_id, checkin_json, start_lat, start_lng, notes
      ) VALUES (?, ?, ?, ?, 'active', NOW(), ?, ?, ?, ?, ?)`,
      [
        id,
        courierId,
        checkin.owner_user_id || null,
        checkin.brand_id || null,
        checkin.vehicle_id || null,
        JSON.stringify(checkinJson),
        checkin.lat ?? null,
        checkin.lng ?? null,
        checkin.notes || null,
      ]
    );

    const courier = await mobLogisticsService.setOpsStatus(courierId, "available");

    if (checkin.vehicle_id && checkin.owner_user_id && checkin.brand_id) {
      try {
        const { mobFleetService } = await import("./mobFleet");
        await mobFleetService.updateVehicle(
          checkin.owner_user_id,
          checkin.brand_id,
          checkin.vehicle_id,
          { status: "in_use", courier_id: courierId }
        );
      } catch {
        /* non-blocking */
      }
    }

    const shift = await this.getActiveShift(courierId);
    return { shift: shift!, courier, blockers: [] };
  },

  async pauseShift(courierId: string): Promise<MobShift> {
    await ensureOpsSchema();
    const shift = await this.getActiveShift(courierId);
    if (!shift) throw new Error("Nenhum turno ativo");
    if (shift.status === "paused") return shift;
    await update(
      `UPDATE mob_shifts SET status = 'paused', paused_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [shift.id]
    );
    await mobLogisticsService.setOpsStatus(courierId, "offline");
    return (await this.getActiveShift(courierId)) || { ...shift, status: "paused" };
  },

  async resumeShift(courierId: string): Promise<MobShift> {
    await ensureOpsSchema();
    const shift = await this.getActiveShift(courierId);
    if (!shift) throw new Error("Nenhum turno ativo");
    await update(
      `UPDATE mob_shifts SET status = 'active', paused_at = NULL, updated_at = NOW() WHERE id = ?`,
      [shift.id]
    );
    await mobLogisticsService.setOpsStatus(courierId, "available");
    const row = await queryOne<any>(`SELECT * FROM mob_shifts WHERE id = ?`, [shift.id]);
    return mapShift(row);
  },

  async endShift(
    courierId: string,
    opts?: { lat?: number; lng?: number; notes?: string }
  ): Promise<MobShift> {
    await ensureOpsSchema();
    const shift = await this.getActiveShift(courierId);
    if (!shift) throw new Error("Nenhum turno ativo");

    // Don't end if active deliveries
    const active = await mobLogisticsService.listDeliveriesForCourier(courierId, {
      activeOnly: true,
    });
    if (active.length) {
      throw new Error(
        `Ainda há ${active.length} entrega(s) ativa(s). Conclua ou devolva antes de encerrar o turno.`
      );
    }

    await update(
      `UPDATE mob_shifts
       SET status = 'ended', ended_at = NOW(), end_lat = ?, end_lng = ?,
           notes = COALESCE(?, notes), updated_at = NOW()
       WHERE id = ?`,
      [opts?.lat ?? null, opts?.lng ?? null, opts?.notes || null, shift.id]
    );

    await mobLogisticsService.setOpsStatus(courierId, "offline");

    if (shift.vehicle_id && shift.owner_user_id && shift.brand_id) {
      try {
        const { mobFleetService } = await import("./mobFleet");
        const v = await mobFleetService.getVehicle(
          shift.owner_user_id,
          shift.brand_id,
          shift.vehicle_id
        );
        if (v && v.status === "in_use") {
          await mobFleetService.updateVehicle(
            shift.owner_user_id,
            shift.brand_id,
            shift.vehicle_id,
            { status: "available" }
          );
        }
      } catch {
        /* non-blocking */
      }
    }

    const row = await queryOne<any>(`SELECT * FROM mob_shifts WHERE id = ?`, [shift.id]);
    return mapShift(row);
  },

  async listShifts(
    courierId: string,
    limit = 20
  ): Promise<Array<MobShift & { duration_minutes?: number }>> {
    await ensureOpsSchema();
    const rows =
      (await query<any[]>(
        `SELECT * FROM mob_shifts WHERE courier_id = ?
         ORDER BY started_at DESC LIMIT ${Math.min(limit, 50)}`,
        [courierId]
      )) || [];
    return rows.map((r) => {
      const s = mapShift(r);
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      const start = new Date(s.started_at).getTime();
      return {
        ...s,
        duration_minutes: Math.max(0, Math.round((end - start) / 60000)),
      };
    });
  },

  /**
   * Evaluate geofences on each location fix.
   * Never auto-completes delivery — only suggests status transitions when safe.
   */
  async evaluateGeofences(input: {
    courierId: string;
    lat: number;
    lng: number;
    deliveryId?: string | null;
    brandId?: string | null;
    accuracy?: number | null;
  }): Promise<{
    events: Array<{ type: GeofenceEventType; distance_m: number; delivery_id?: string }>;
    status_suggestions: Array<{ delivery_id: string; to_status: string; reason: string }>;
    applied: Array<{ delivery_id: string; to_status: string }>;
  }> {
    await ensureOpsSchema();
    const events: Array<{ type: GeofenceEventType; distance_m: number; delivery_id?: string }> =
      [];
    const status_suggestions: Array<{
      delivery_id: string;
      to_status: string;
      reason: string;
    }> = [];
    const applied: Array<{ delivery_id: string; to_status: string }> = [];

    // Skip poor accuracy
    if (input.accuracy != null && input.accuracy > 80) {
      return { events, status_suggestions, applied };
    }

    const deliveries = await mobLogisticsService.listDeliveriesForCourier(input.courierId, {
      activeOnly: true,
    });
    if (!deliveries.length) return { events, status_suggestions, applied };

    for (const d of deliveries) {
      if (input.deliveryId && d.id !== input.deliveryId) continue;

      let pickupM = 120;
      let dropoffM = 80;
      let autoStatus = true;
      try {
        const settings = await mobLogisticsService.getOrCreateSettings(
          d.owner_user_id,
          d.brand_id
        );
        pickupM = Math.max(40, Math.min(num((settings as any).geofence_pickup_m, 120), 500));
        dropoffM = Math.max(30, Math.min(num((settings as any).geofence_dropoff_m, 80), 400));
        autoStatus = (settings as any).geofence_auto_status !== false;
      } catch {
        /* defaults */
      }

      // Pickup fence
      if (d.pickup_lat != null && d.pickup_lng != null) {
        const dist = haversineM(input.lat, input.lng, d.pickup_lat, d.pickup_lng);
        if (dist <= pickupM) {
          const dup = await recentlyFired(input.courierId, d.id, "arrive_pickup");
          if (!dup) {
            await this.recordGeofenceEvent({
              courierId: input.courierId,
              deliveryId: d.id,
              brandId: d.brand_id,
              eventType: "arrive_pickup",
              lat: input.lat,
              lng: input.lng,
              distanceM: dist,
            });
            events.push({ type: "arrive_pickup", distance_m: Math.round(dist), delivery_id: d.id });
          }

          if (
            ["accepted_by_courier", "courier_to_pickup"].includes(d.status)
          ) {
            status_suggestions.push({
              delivery_id: d.id,
              to_status: "courier_at_pickup",
              reason: `Dentro de ${Math.round(dist)} m da coleta`,
            });
            if (autoStatus && d.status === "courier_to_pickup") {
              try {
                await mobLogisticsService.transitionStatus({
                  deliveryId: d.id,
                  toStatus: "courier_at_pickup",
                  actorType: "system",
                  courierId: input.courierId,
                  lat: input.lat,
                  lng: input.lng,
                  source: "geofence",
                  note: `Chegada detectada na coleta (${Math.round(dist)} m)`,
                });
                applied.push({ delivery_id: d.id, to_status: "courier_at_pickup" });
              } catch {
                /* invalid transition ok */
              }
            }
          }
        }
      }

      // Dropoff fence
      if (d.dropoff_lat != null && d.dropoff_lng != null) {
        const dist = haversineM(input.lat, input.lng, d.dropoff_lat, d.dropoff_lng);
        const near = dist <= dropoffM * 2.5;
        const arrive = dist <= dropoffM;

        if (near && !arrive) {
          const dup = await recentlyFired(input.courierId, d.id, "near_dropoff", 12);
          if (!dup) {
            await this.recordGeofenceEvent({
              courierId: input.courierId,
              deliveryId: d.id,
              brandId: d.brand_id,
              eventType: "near_dropoff",
              lat: input.lat,
              lng: input.lng,
              distanceM: dist,
            });
            events.push({
              type: "near_dropoff",
              distance_m: Math.round(dist),
              delivery_id: d.id,
            });
          }
          if (["picked_up", "en_route"].includes(d.status)) {
            status_suggestions.push({
              delivery_id: d.id,
              to_status: "near_destination",
              reason: `Aproximando do destino (${Math.round(dist)} m)`,
            });
            if (autoStatus && d.status === "en_route") {
              try {
                await mobLogisticsService.transitionStatus({
                  deliveryId: d.id,
                  toStatus: "near_destination",
                  actorType: "system",
                  courierId: input.courierId,
                  lat: input.lat,
                  lng: input.lng,
                  source: "geofence",
                  note: `Próximo do destino (${Math.round(dist)} m)`,
                });
                applied.push({ delivery_id: d.id, to_status: "near_destination" });
              } catch {
                /* ok */
              }
            }
          }
        }

        if (arrive) {
          const dup = await recentlyFired(input.courierId, d.id, "arrive_dropoff");
          if (!dup) {
            await this.recordGeofenceEvent({
              courierId: input.courierId,
              deliveryId: d.id,
              brandId: d.brand_id,
              eventType: "arrive_dropoff",
              lat: input.lat,
              lng: input.lng,
              distanceM: dist,
            });
            events.push({
              type: "arrive_dropoff",
              distance_m: Math.round(dist),
              delivery_id: d.id,
            });
          }
          if (["picked_up", "en_route", "near_destination"].includes(d.status)) {
            status_suggestions.push({
              delivery_id: d.id,
              to_status: "at_destination",
              reason: `No endereço do cliente (${Math.round(dist)} m)`,
            });
            // NEVER auto delivered — only at_destination
            if (autoStatus && d.status !== "at_destination") {
              try {
                await mobLogisticsService.transitionStatus({
                  deliveryId: d.id,
                  toStatus: "at_destination",
                  actorType: "system",
                  courierId: input.courierId,
                  lat: input.lat,
                  lng: input.lng,
                  source: "geofence",
                  note: `Chegada no destino (${Math.round(dist)} m) — confirme com PIN/foto`,
                });
                applied.push({ delivery_id: d.id, to_status: "at_destination" });
              } catch {
                /* ok */
              }
            }
          }
        }
      }
    }

    return { events, status_suggestions, applied };
  },

  async recordGeofenceEvent(input: {
    courierId: string;
    deliveryId?: string | null;
    brandId?: string | null;
    eventType: GeofenceEventType;
    lat: number;
    lng: number;
    distanceM?: number | null;
    meta?: any;
  }): Promise<void> {
    await insert(
      `INSERT INTO mob_geofence_events (
        id, courier_id, delivery_id, brand_id, event_type, lat, lng, distance_m, meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.courierId,
        input.deliveryId || null,
        input.brandId || null,
        input.eventType,
        input.lat,
        input.lng,
        input.distanceM ?? null,
        JSON.stringify(input.meta || {}),
      ]
    ).catch(() => undefined);
  },

  async listGeofenceEvents(opts: {
    courierId?: string;
    deliveryId?: string;
    brandId?: string;
    limit?: number;
  }): Promise<MobGeofenceEvent[]> {
    await ensureOpsSchema();
    let sql = `SELECT * FROM mob_geofence_events WHERE 1=1`;
    const params: any[] = [];
    if (opts.courierId) {
      sql += ` AND courier_id = ?`;
      params.push(opts.courierId);
    }
    if (opts.deliveryId) {
      sql += ` AND delivery_id = ?`;
      params.push(opts.deliveryId);
    }
    if (opts.brandId) {
      sql += ` AND brand_id = ?`;
      params.push(opts.brandId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${Math.min(num(opts.limit, 50), 100)}`;
    const rows = (await query<any[]>(sql, params).catch(() => [])) || [];
    return rows.map((r) => ({
      id: String(r.id),
      courier_id: String(r.courier_id),
      delivery_id: r.delivery_id || null,
      brand_id: r.brand_id || null,
      event_type: r.event_type,
      lat: num(r.lat),
      lng: num(r.lng),
      distance_m: r.distance_m != null ? num(r.distance_m) : null,
      meta_json: parseJson(r.meta_json, {}),
      created_at: r.created_at,
    }));
  },
};
