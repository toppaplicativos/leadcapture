/**
 * Lead Capture Mob — offline event replay with client_event_id idempotency.
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { DeliveryStatus, mobLogisticsService } from "./mobLogistics";

export type SyncIncomingEvent = {
  client_event_id: string;
  type: string;
  path?: string;
  method?: string;
  body?: Record<string, any>;
  created_at?: string;
};

let schemaReady = false;

async function ensureSyncSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS mob_client_events (
      id VARCHAR(36) PRIMARY KEY,
      client_event_id VARCHAR(80) NOT NULL,
      courier_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      result_json JSONB NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (courier_id, client_event_id)
    )
  `).catch(() => undefined);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_mob_client_events_courier ON mob_client_events (courier_id, created_at)`
  ).catch(() => undefined);
  schemaReady = true;
}

async function alreadyProcessed(
  courierId: string,
  clientEventId: string
): Promise<any | null> {
  const row = await queryOne<any>(
    `SELECT result_json FROM mob_client_events
     WHERE courier_id = ? AND client_event_id = ? LIMIT 1`,
    [courierId, clientEventId]
  ).catch(() => null);
  if (!row) return null;
  try {
    return typeof row.result_json === "string"
      ? JSON.parse(row.result_json)
      : row.result_json;
  } catch {
    return { ok: true, duplicate: true };
  }
}

async function markProcessed(
  courierId: string,
  clientEventId: string,
  eventType: string,
  result: any
) {
  await insert(
    `INSERT INTO mob_client_events (id, client_event_id, courier_id, event_type, result_json)
     VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), clientEventId, courierId, eventType, JSON.stringify(result)]
  ).catch(() => undefined);
}

export const mobSyncService = {
  async processEvents(
    courierId: string,
    events: SyncIncomingEvent[]
  ): Promise<Array<{ client_event_id: string; ok: boolean; error?: string; data?: any }>> {
    await ensureSyncSchema();
    const results: Array<{
      client_event_id: string;
      ok: boolean;
      error?: string;
      data?: any;
    }> = [];

    // Process in chronological order
    const ordered = [...events].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    for (const ev of ordered.slice(0, 80)) {
      const cid = String(ev.client_event_id || "").trim();
      if (!cid) {
        results.push({ client_event_id: "", ok: false, error: "client_event_id obrigatório" });
        continue;
      }

      const prev = await alreadyProcessed(courierId, cid);
      if (prev) {
        results.push({ client_event_id: cid, ok: true, data: { ...prev, duplicate: true } });
        continue;
      }

      try {
        const data = await this.dispatchOne(courierId, ev);
        await markProcessed(courierId, cid, ev.type || "unknown", data);
        results.push({ client_event_id: cid, ok: true, data });
      } catch (e: any) {
        const msg = e?.message || "Falha ao processar evento";
        logger.warn({ err: msg, type: ev.type, cid }, "mob sync event failed");
        results.push({ client_event_id: cid, ok: false, error: msg });
      }
    }

    return results;
  },

  async dispatchOne(courierId: string, ev: SyncIncomingEvent): Promise<any> {
    const body = ev.body || {};
    const type = String(ev.type || "");

    if (type === "location" || (ev.path || "").includes("/location")) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("lat/lng obrigatórios");
      }
      const result = await mobLogisticsService.recordLocation({
        courierId,
        deliveryId: body.delivery_id ? String(body.delivery_id) : undefined,
        brandId: body.brand_id ? String(body.brand_id) : undefined,
        lat,
        lng,
        accuracy: body.accuracy != null ? Number(body.accuracy) : undefined,
        speed: body.speed != null ? Number(body.speed) : undefined,
        heading: body.heading != null ? Number(body.heading) : undefined,
        batteryLevel: body.battery_level != null ? Number(body.battery_level) : undefined,
        source: body.source ? String(body.source) : "offline_sync",
        deviceId: body.device_id ? String(body.device_id) : undefined,
        recordedAt: body.recorded_at ? String(body.recorded_at) : body.offline_queued_at,
      });
      if (!result.accepted) {
        throw new Error(result.fraud?.message || "Localização rejeitada");
      }
      try {
        const { mobOpsService } = await import("./mobOps");
        const geofence = await mobOpsService.evaluateGeofences({
          courierId,
          lat,
          lng,
          deliveryId: body.delivery_id ? String(body.delivery_id) : undefined,
          accuracy: body.accuracy != null ? Number(body.accuracy) : undefined,
        });
        return { accepted: true, geofence };
      } catch {
        return { accepted: true };
      }
    }

    if (type === "status" || (ev.path || "").includes("/status")) {
      const deliveryId = String(
        body.delivery_id ||
          (ev.path || "").split("/deliveries/")[1]?.split("/")[0] ||
          ""
      ).trim();
      if (!deliveryId) throw new Error("delivery_id obrigatório");
      const toStatus = String(body.status || "").trim() as DeliveryStatus;
      if (!toStatus) throw new Error("status obrigatório");

      const delivery = await mobLogisticsService.getDeliveryById(deliveryId);
      if (!delivery || delivery.courier_id !== courierId) {
        throw new Error("Corrida não encontrada");
      }

      const updated = await mobLogisticsService.transitionStatus({
        deliveryId,
        toStatus,
        actorType: "courier",
        actorId: courierId,
        courierId,
        lat: body.lat != null ? Number(body.lat) : undefined,
        lng: body.lng != null ? Number(body.lng) : undefined,
        note: body.note ? String(body.note) : "Sincronizado offline",
        source: "offline_sync",
        proofPhotoUrl: body.proof_photo_url ? String(body.proof_photo_url) : undefined,
        deliveryPin: body.delivery_pin ? String(body.delivery_pin) : undefined,
        signatureUrl: body.signature_url ? String(body.signature_url) : undefined,
        otpCode: body.otp_code ? String(body.otp_code) : undefined,
      });
      return { delivery: updated };
    }

    if (type === "package_scan" || (ev.path || "").includes("/packages/scan")) {
      const deliveryId = String(
        body.delivery_id ||
          (ev.path || "").split("/deliveries/")[1]?.split("/")[0] ||
          ""
      ).trim();
      const code = String(body.code || body.qr || "").trim();
      if (!deliveryId || !code) throw new Error("delivery_id e code obrigatórios");
      const delivery = await mobLogisticsService.getDeliveryById(deliveryId);
      if (!delivery || delivery.courier_id !== courierId) {
        throw new Error("Corrida não encontrada");
      }
      const { mobPackagesService } = await import("./mobPackages");
      const phase = String(body.phase || "pickup") === "dropoff" ? "dropoff" : "pickup";
      return mobPackagesService.scan({
        deliveryId,
        codeOrQr: code,
        phase,
        courierId,
        note: body.note ? String(body.note) : "Scan offline",
      });
    }

    if (type === "package_status") {
      const deliveryId = String(body.delivery_id || "").trim();
      const packageId = String(body.package_id || "").trim();
      const status = String(body.status || "").trim() as any;
      if (!deliveryId || !packageId) throw new Error("delivery_id e package_id obrigatórios");
      const delivery = await mobLogisticsService.getDeliveryById(deliveryId);
      if (!delivery || delivery.courier_id !== courierId) {
        throw new Error("Corrida não encontrada");
      }
      const { mobPackagesService } = await import("./mobPackages");
      const pkg = await mobPackagesService.markStatus({
        packageId,
        deliveryId,
        status,
        courierId,
        note: body.note,
      });
      const conference = await mobPackagesService.getConference(deliveryId);
      return { package: pkg, conference };
    }

    if (type === "ops_status") {
      const status = String(body.status || "").trim() as "offline" | "available" | "busy";
      if (!["offline", "available", "busy"].includes(status)) {
        throw new Error("Status inválido");
      }
      const courier = await mobLogisticsService.setOpsStatus(courierId, status);
      return { courier };
    }

    if (type === "shift_end") {
      const { mobOpsService } = await import("./mobOps");
      const shift = await mobOpsService.endShift(courierId, {
        lat: body.lat != null ? Number(body.lat) : undefined,
        lng: body.lng != null ? Number(body.lng) : undefined,
        notes: body.notes ? String(body.notes) : "Encerrado offline",
      });
      return { shift };
    }

    throw new Error(`Tipo de evento não suportado: ${type}`);
  },
};
