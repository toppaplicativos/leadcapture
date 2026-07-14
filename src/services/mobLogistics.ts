/**
 * Lead Capture Mob — logistics platform core.
 * Multi-tenant deliveries, global couriers, org memberships, pricing, geo, audit.
 */
import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { insert, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

/* ── Status machine ── */

export const DELIVERY_STATUSES = [
  "order_received",
  "payment_pending",
  "payment_approved",
  "preparing",
  "ready_for_dispatch",
  "awaiting_courier",
  "offered_to_courier",
  "accepted_by_courier",
  "courier_to_pickup",
  "courier_at_pickup",
  "picked_up",
  "en_route",
  "near_destination",
  "at_destination",
  "delivered",
  "delivery_failed",
  "redelivery_needed",
  "returning_to_store",
  "cancelled",
  "under_review",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Valid transitions for MVP (manual + courier flows). */
const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  order_received: ["payment_pending", "payment_approved", "preparing", "cancelled"],
  payment_pending: ["payment_approved", "cancelled"],
  payment_approved: ["preparing", "ready_for_dispatch", "cancelled"],
  preparing: ["ready_for_dispatch", "cancelled"],
  ready_for_dispatch: ["awaiting_courier", "offered_to_courier", "accepted_by_courier", "cancelled"],
  awaiting_courier: ["offered_to_courier", "accepted_by_courier", "cancelled"],
  offered_to_courier: ["accepted_by_courier", "awaiting_courier", "cancelled"],
  accepted_by_courier: ["courier_to_pickup", "cancelled", "under_review"],
  courier_to_pickup: ["courier_at_pickup", "cancelled", "under_review"],
  courier_at_pickup: ["picked_up", "cancelled", "under_review"],
  picked_up: ["en_route", "returning_to_store", "under_review"],
  en_route: ["near_destination", "at_destination", "delivery_failed", "under_review"],
  near_destination: ["at_destination", "delivery_failed", "under_review"],
  at_destination: ["delivered", "delivery_failed", "under_review"],
  delivered: [],
  delivery_failed: ["redelivery_needed", "returning_to_store", "cancelled", "under_review"],
  redelivery_needed: ["awaiting_courier", "offered_to_courier", "accepted_by_courier", "cancelled"],
  returning_to_store: ["cancelled", "under_review", "order_received"],
  cancelled: [],
  under_review: [
    "awaiting_courier",
    "accepted_by_courier",
    "courier_to_pickup",
    "en_route",
    "delivered",
    "cancelled",
    "redelivery_needed",
  ],
};

export const COURIER_CADASTRO_STATUSES = [
  "incomplete",
  "awaiting_documents",
  "under_review",
  "approved",
  "rejected",
  "suspended",
  "blocked",
  "inactive",
] as const;

export type CourierCadastroStatus = (typeof COURIER_CADASTRO_STATUSES)[number];

export const COURIER_OPS_STATUSES = ["offline", "available", "busy"] as const;
export type CourierOpsStatus = (typeof COURIER_OPS_STATUSES)[number];

export const MEMBERSHIP_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
  "inactive",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type PricingModel = "fixed" | "per_km" | "distance_bands" | "zones";

export type MobSettings = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  enabled: boolean;
  operation_name: string | null;
  contact_phone: string | null;
  logistics_manager_name: string | null;
  default_origin_address: string | null;
  default_origin_lat: number | null;
  default_origin_lng: number | null;
  prep_time_minutes: number;
  max_radius_km: number | null;
  modes_json: any;
  business_hours_json: any;
  delivery_days_json: any;
  cancel_policy: string | null;
  redelivery_policy: string | null;
  show_courier_location_to_customer: boolean;
  distribution_mode: "manual" | "auto" | "sequential" | "simultaneous" | "direct";
  offer_timeout_seconds: number;
  max_concurrent_per_courier: number;
  pricing_model: PricingModel;
  pricing_config_json: any;
  notification_prefs_json: any;
  /** pin | photo | pin_and_photo */
  proof_mode?: string;
  pin_max_attempts?: number;
  default_sla_minutes?: number | null;
  require_signature?: boolean;
  require_otp?: boolean;
  /** warn | block | off */
  geo_fraud_mode?: string;
  /** Days to keep GPS trail points (LGPD). 0 = never purge. Default 30. */
  gps_retention_days?: number;
  geofence_pickup_m?: number;
  geofence_dropoff_m?: number;
  require_shift_checkin?: boolean;
  geofence_auto_status?: boolean;
  require_package_scan?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MobCourier = {
  id: string;
  user_id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string;
  photo_url: string | null;
  address_json: any;
  emergency_contact_json: any;
  vehicle_json: any;
  documents_json: any;
  pix_key: string | null;
  cadastro_status: CourierCadastroStatus;
  ops_status: CourierOpsStatus;
  rating_avg: number;
  rating_count: number;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  onboarding_json: any;
  created_at?: string;
  updated_at?: string;
};

export type MobMembership = {
  id: string;
  courier_id: string;
  owner_user_id: string;
  brand_id: string;
  unit_id: string | null;
  bond_type: string;
  status: MembershipStatus;
  invite_id: string | null;
  remuneration_json: any;
  permissions_json: any;
  terms_accepted_at: string | null;
  approved_at: string | null;
  rating_avg: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MobDelivery = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  order_id: string | null;
  unit_id: string | null;
  courier_id: string | null;
  membership_id: string | null;
  modality: "own" | "pickup" | "third_party";
  status: DeliveryStatus;
  priority: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  products_total: number;
  delivery_fee: number;
  courier_payout: number | null;
  payment_method: string | null;
  distance_km: number | null;
  eta_minutes: number | null;
  route_json: any;
  quote_snapshot_json: any;
  notes: string | null;
  pickup_code: string | null;
  delivery_pin: string | null;
  proof_photo_url: string | null;
  tracking_token: string;
  tracking_expires_at: string | null;
  offered_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  metadata_json: any;
  created_at?: string;
  updated_at?: string;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

async function ensureMobSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) {
    await schemaPromise;
    return;
  }

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS mob_settings (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        operation_name VARCHAR(160) NULL,
        contact_phone VARCHAR(40) NULL,
        logistics_manager_name VARCHAR(160) NULL,
        default_origin_address TEXT NULL,
        default_origin_lat DOUBLE PRECISION NULL,
        default_origin_lng DOUBLE PRECISION NULL,
        prep_time_minutes INT NOT NULL DEFAULT 30,
        max_radius_km DOUBLE PRECISION NULL,
        modes_json JSONB NULL,
        business_hours_json JSONB NULL,
        delivery_days_json JSONB NULL,
        cancel_policy TEXT NULL,
        redelivery_policy TEXT NULL,
        show_courier_location_to_customer BOOLEAN NOT NULL DEFAULT TRUE,
        distribution_mode VARCHAR(32) NOT NULL DEFAULT 'manual',
        offer_timeout_seconds INT NOT NULL DEFAULT 30,
        max_concurrent_per_courier INT NOT NULL DEFAULT 3,
        pricing_model VARCHAR(32) NOT NULL DEFAULT 'fixed',
        pricing_config_json JSONB NULL,
        notification_prefs_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (owner_user_id, brand_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_couriers (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        full_name VARCHAR(180) NOT NULL,
        cpf VARCHAR(20) NULL,
        birth_date DATE NULL,
        phone VARCHAR(40) NULL,
        whatsapp VARCHAR(40) NULL,
        email VARCHAR(190) NOT NULL,
        photo_url TEXT NULL,
        address_json JSONB NULL,
        emergency_contact_json JSONB NULL,
        vehicle_json JSONB NULL,
        documents_json JSONB NULL,
        pix_key VARCHAR(120) NULL,
        cadastro_status VARCHAR(32) NOT NULL DEFAULT 'incomplete',
        ops_status VARCHAR(20) NOT NULL DEFAULT 'offline',
        rating_avg DECIMAL(4,2) NOT NULL DEFAULT 0,
        rating_count INT NOT NULL DEFAULT 0,
        last_lat DOUBLE PRECISION NULL,
        last_lng DOUBLE PRECISION NULL,
        last_location_at TIMESTAMP NULL,
        onboarding_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id),
        UNIQUE (email)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_courier_memberships (
        id VARCHAR(36) PRIMARY KEY,
        courier_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        unit_id VARCHAR(36) NULL,
        bond_type VARCHAR(40) NOT NULL DEFAULT 'autonomous',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        invite_id VARCHAR(36) NULL,
        remuneration_json JSONB NULL,
        permissions_json JSONB NULL,
        terms_accepted_at TIMESTAMP NULL,
        approved_at TIMESTAMP NULL,
        rating_avg DECIMAL(4,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (courier_id, brand_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_invites (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        invite_code VARCHAR(64) NOT NULL,
        label VARCHAR(120) NULL,
        unit_id VARCHAR(36) NULL,
        max_uses INT NULL,
        used_count INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        expires_at TIMESTAMP NULL,
        created_by VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (invite_code)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_deliveries (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        order_id VARCHAR(36) NULL,
        unit_id VARCHAR(36) NULL,
        courier_id VARCHAR(36) NULL,
        membership_id VARCHAR(36) NULL,
        modality VARCHAR(32) NOT NULL DEFAULT 'own',
        status VARCHAR(40) NOT NULL DEFAULT 'order_received',
        priority INT NOT NULL DEFAULT 0,
        customer_name VARCHAR(180) NULL,
        customer_phone VARCHAR(40) NULL,
        customer_email VARCHAR(180) NULL,
        pickup_address TEXT NULL,
        pickup_lat DOUBLE PRECISION NULL,
        pickup_lng DOUBLE PRECISION NULL,
        dropoff_address TEXT NULL,
        dropoff_lat DOUBLE PRECISION NULL,
        dropoff_lng DOUBLE PRECISION NULL,
        products_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
        courier_payout DECIMAL(12,2) NULL,
        payment_method VARCHAR(40) NULL,
        distance_km DOUBLE PRECISION NULL,
        eta_minutes INT NULL,
        route_json JSONB NULL,
        quote_snapshot_json JSONB NULL,
        notes TEXT NULL,
        pickup_code VARCHAR(20) NULL,
        delivery_pin VARCHAR(12) NULL,
        proof_photo_url TEXT NULL,
        tracking_token VARCHAR(96) NOT NULL,
        tracking_expires_at TIMESTAMP NULL,
        offered_at TIMESTAMP NULL,
        accepted_at TIMESTAMP NULL,
        picked_up_at TIMESTAMP NULL,
        delivered_at TIMESTAMP NULL,
        cancelled_at TIMESTAMP NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tracking_token)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_delivery_events (
        id VARCHAR(36) PRIMARY KEY,
        delivery_id VARCHAR(36) NOT NULL,
        from_status VARCHAR(40) NULL,
        to_status VARCHAR(40) NOT NULL,
        actor_type VARCHAR(32) NOT NULL,
        actor_id VARCHAR(36) NULL,
        courier_id VARCHAR(36) NULL,
        lat DOUBLE PRECISION NULL,
        lng DOUBLE PRECISION NULL,
        source VARCHAR(40) NULL,
        device_info VARCHAR(255) NULL,
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_location_points (
        id BIGSERIAL PRIMARY KEY,
        courier_id VARCHAR(36) NOT NULL,
        delivery_id VARCHAR(36) NULL,
        brand_id VARCHAR(36) NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION NULL,
        speed DOUBLE PRECISION NULL,
        heading DOUBLE PRECISION NULL,
        battery_level DOUBLE PRECISION NULL,
        source VARCHAR(40) NULL,
        recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_delivery_offers (
        id VARCHAR(36) PRIMARY KEY,
        delivery_id VARCHAR(36) NOT NULL,
        courier_id VARCHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        responded_at TIMESTAMP NULL,
        UNIQUE (delivery_id, courier_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_routes (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        courier_id VARCHAR(36) NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'planning',
        total_distance_km DOUBLE PRECISION NULL,
        total_stops INT NOT NULL DEFAULT 0,
        optimized_json JSONB NULL,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_route_stops (
        id VARCHAR(36) PRIMARY KEY,
        route_id VARCHAR(36) NOT NULL,
        delivery_id VARCHAR(36) NOT NULL,
        stop_order INT NOT NULL DEFAULT 0,
        stop_type VARCHAR(16) NOT NULL DEFAULT 'dropoff',
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        lat DOUBLE PRECISION NULL,
        lng DOUBLE PRECISION NULL,
        address TEXT NULL,
        label VARCHAR(180) NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(
      `ALTER TABLE mob_deliveries ADD COLUMN IF NOT EXISTS route_id VARCHAR(36) NULL`
    ).catch(async () => {
      await query(`ALTER TABLE mob_deliveries ADD COLUMN route_id VARCHAR(36) NULL`).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_deliveries ADD COLUMN IF NOT EXISTS route_stop_order INT NULL`
    ).catch(async () => {
      await query(`ALTER TABLE mob_deliveries ADD COLUMN route_stop_order INT NULL`).catch(() => undefined);
    });

    // Proof / COD / PIN security columns
    const extraCols: Array<[string, string]> = [
      ["pin_attempts", "INT NOT NULL DEFAULT 0"],
      ["pin_locked_at", "TIMESTAMP NULL"],
      ["cod_required", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["cod_amount", "DECIMAL(12,2) NULL"],
      ["cod_collected_at", "TIMESTAMP NULL"],
      ["cod_collected_by", "VARCHAR(36) NULL"],
      ["proof_required", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["sla_minutes", "INT NULL"],
      ["sla_deadline_at", "TIMESTAMP NULL"],
      ["signature_url", "TEXT NULL"],
      ["signature_required", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["otp_required", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["delivery_otp_hash", "VARCHAR(128) NULL"],
      ["delivery_otp_expires_at", "TIMESTAMP NULL"],
      ["delivery_otp_attempts", "INT NOT NULL DEFAULT 0"],
      ["delivery_otp_verified_at", "TIMESTAMP NULL"],
      ["geo_fraud_score", "INT NOT NULL DEFAULT 0"],
      ["geo_fraud_flags_json", "JSONB NULL"],
      ["last_device_id", "VARCHAR(64) NULL"],
    ];
    for (const [col, ddl] of extraCols) {
      await query(`ALTER TABLE mob_deliveries ADD COLUMN IF NOT EXISTS ${col} ${ddl}`).catch(async () => {
        await query(`ALTER TABLE mob_deliveries ADD COLUMN ${col} ${ddl}`).catch(() => undefined);
      });
    }

    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS proof_mode VARCHAR(32) NOT NULL DEFAULT 'pin'`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN proof_mode VARCHAR(32) NOT NULL DEFAULT 'pin'`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS pin_max_attempts INT NOT NULL DEFAULT 5`
    ).catch(async () => {
      await query(`ALTER TABLE mob_settings ADD COLUMN pin_max_attempts INT NOT NULL DEFAULT 5`).catch(
        () => undefined
      );
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS default_sla_minutes INT NULL`
    ).catch(async () => {
      await query(`ALTER TABLE mob_settings ADD COLUMN default_sla_minutes INT NULL`).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS require_signature BOOLEAN NOT NULL DEFAULT FALSE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN require_signature BOOLEAN NOT NULL DEFAULT FALSE`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS require_otp BOOLEAN NOT NULL DEFAULT FALSE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN require_otp BOOLEAN NOT NULL DEFAULT FALSE`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS geo_fraud_mode VARCHAR(24) NOT NULL DEFAULT 'warn'`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN geo_fraud_mode VARCHAR(24) NOT NULL DEFAULT 'warn'`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS gps_retention_days INT NOT NULL DEFAULT 30`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN gps_retention_days INT NOT NULL DEFAULT 30`
      ).catch(() => undefined);
    });

    schemaReady = true;
    logger.info("Mob logistics schema ready");
  })().finally(() => {
    schemaPromise = null;
  });

  await schemaPromise;
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

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Road-distance estimate: haversine × factor (real routing API later). */
export function estimateRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  factor = 1.35
): number {
  return Math.round(haversineKm(lat1, lng1, lat2, lng2) * factor * 100) / 100;
}

function generatePin(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String(Math.floor(Math.random() * 10));
  return s;
}

function generateTrackingToken(): string {
  return randomBytes(24).toString("base64url");
}

function generateInviteCode(): string {
  return randomBytes(10).toString("base64url");
}

function mapCourier(row: any): MobCourier {
  return {
    ...row,
    address_json: parseJson(row.address_json, null),
    emergency_contact_json: parseJson(row.emergency_contact_json, null),
    vehicle_json: parseJson(row.vehicle_json, null),
    documents_json: parseJson(row.documents_json, null),
    onboarding_json: parseJson(row.onboarding_json, {}),
    rating_avg: num(row.rating_avg),
    rating_count: num(row.rating_count),
    last_lat: row.last_lat != null ? num(row.last_lat) : null,
    last_lng: row.last_lng != null ? num(row.last_lng) : null,
  };
}

function mapSettings(row: any): MobSettings {
  return {
    ...row,
    enabled: !!row.enabled,
    show_courier_location_to_customer: row.show_courier_location_to_customer !== false,
    modes_json: parseJson(row.modes_json, { own: true, pickup: true, third_party: false }),
    business_hours_json: parseJson(row.business_hours_json, null),
    delivery_days_json: parseJson(row.delivery_days_json, null),
    pricing_config_json: parseJson(row.pricing_config_json, {
      fixed_fee: 12,
      free_above: null,
      min_order: null,
      base_fee: 5,
      per_km: 2,
      min_distance_km: 0,
      max_distance_km: null,
      min_fee: null,
      max_fee: null,
      free_km: 0,
      bands: [],
    }),
    notification_prefs_json: parseJson(row.notification_prefs_json, {}),
    prep_time_minutes: num(row.prep_time_minutes, 30),
    max_radius_km: row.max_radius_km != null ? num(row.max_radius_km) : null,
    offer_timeout_seconds: num(row.offer_timeout_seconds, 30),
    max_concurrent_per_courier: num(row.max_concurrent_per_courier, 3),
    default_origin_lat: row.default_origin_lat != null ? num(row.default_origin_lat) : null,
    default_origin_lng: row.default_origin_lng != null ? num(row.default_origin_lng) : null,
    proof_mode: String(row.proof_mode || "pin"),
    pin_max_attempts: num(row.pin_max_attempts, 5),
    default_sla_minutes: row.default_sla_minutes != null ? num(row.default_sla_minutes) : null,
    require_signature: !!row.require_signature,
    require_otp: !!row.require_otp,
    geo_fraud_mode: String(row.geo_fraud_mode || "warn"),
    gps_retention_days: Math.max(0, Math.min(num(row.gps_retention_days, 30), 365)),
    geofence_pickup_m: Math.max(40, Math.min(num(row.geofence_pickup_m, 120), 500)),
    geofence_dropoff_m: Math.max(30, Math.min(num(row.geofence_dropoff_m, 80), 400)),
    require_shift_checkin: row.require_shift_checkin !== false,
    geofence_auto_status: row.geofence_auto_status !== false,
    require_package_scan: !!row.require_package_scan,
  };
}

function mapDelivery(row: any): MobDelivery {
  return {
    ...row,
    products_total: num(row.products_total),
    delivery_fee: num(row.delivery_fee),
    courier_payout: row.courier_payout != null ? num(row.courier_payout) : null,
    distance_km: row.distance_km != null ? num(row.distance_km) : null,
    eta_minutes: row.eta_minutes != null ? num(row.eta_minutes) : null,
    priority: num(row.priority),
    pickup_lat: row.pickup_lat != null ? num(row.pickup_lat) : null,
    pickup_lng: row.pickup_lng != null ? num(row.pickup_lng) : null,
    dropoff_lat: row.dropoff_lat != null ? num(row.dropoff_lat) : null,
    dropoff_lng: row.dropoff_lng != null ? num(row.dropoff_lng) : null,
    route_json: parseJson(row.route_json, null),
    quote_snapshot_json: parseJson(row.quote_snapshot_json, null),
    metadata_json: parseJson(row.metadata_json, null),
    pin_attempts: num(row.pin_attempts),
    cod_required: !!row.cod_required,
    cod_amount: row.cod_amount != null ? num(row.cod_amount) : null,
    proof_required: !!row.proof_required,
    sla_minutes: row.sla_minutes != null ? num(row.sla_minutes) : null,
  };
}

/** Check if delivery is past SLA deadline */
export function isDeliveryLate(d: { sla_deadline_at?: string | null; status?: string }): boolean {
  if (!d.sla_deadline_at) return false;
  if (["delivered", "cancelled"].includes(String(d.status || ""))) return false;
  return new Date(d.sla_deadline_at).getTime() < Date.now();
}

function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return true;
  const allowed = STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export class MobLogisticsService {
  async ensureSchema() {
    await ensureMobSchema();
  }

  /* ── Settings ── */

  async getOrCreateSettings(ownerUserId: string, brandId: string): Promise<MobSettings> {
    await this.ensureSchema();
    const existing = await queryOne<any>(
      `SELECT * FROM mob_settings WHERE owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [ownerUserId, brandId]
    );
    if (existing) return mapSettings(existing);

    const id = randomUUID();
    await insert(
      `INSERT INTO mob_settings (
        id, owner_user_id, brand_id, enabled, operation_name, modes_json, pricing_model, pricing_config_json
      ) VALUES (?, ?, ?, FALSE, ?, ?, 'fixed', ?)`,
      [
        id,
        ownerUserId,
        brandId,
        "Operação logística",
        JSON.stringify({ own: true, pickup: true, third_party: false }),
        JSON.stringify({
          fixed_fee: 12,
          free_above: null,
          base_fee: 5,
          per_km: 2,
          free_km: 0,
          bands: [],
        }),
      ]
    );
    const row = await queryOne<any>(`SELECT * FROM mob_settings WHERE id = ? LIMIT 1`, [id]);
    return mapSettings(row);
  }

  async updateSettings(
    ownerUserId: string,
    brandId: string,
    patch: Partial<MobSettings> & Record<string, any>
  ): Promise<MobSettings> {
    const current = await this.getOrCreateSettings(ownerUserId, brandId);
    const fields: string[] = [];
    const params: any[] = [];

    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    if (patch.enabled !== undefined) set("enabled", !!patch.enabled);
    if (patch.operation_name !== undefined) set("operation_name", patch.operation_name || null);
    if (patch.contact_phone !== undefined) set("contact_phone", patch.contact_phone || null);
    if (patch.logistics_manager_name !== undefined)
      set("logistics_manager_name", patch.logistics_manager_name || null);
    if (patch.default_origin_address !== undefined)
      set("default_origin_address", patch.default_origin_address || null);
    if (patch.default_origin_lat !== undefined) set("default_origin_lat", patch.default_origin_lat);
    if (patch.default_origin_lng !== undefined) set("default_origin_lng", patch.default_origin_lng);
    if (patch.prep_time_minutes !== undefined) set("prep_time_minutes", num(patch.prep_time_minutes, 30));
    if (patch.max_radius_km !== undefined) set("max_radius_km", patch.max_radius_km);
    if (patch.modes_json !== undefined) set("modes_json", JSON.stringify(patch.modes_json));
    if (patch.business_hours_json !== undefined)
      set("business_hours_json", JSON.stringify(patch.business_hours_json));
    if (patch.delivery_days_json !== undefined)
      set("delivery_days_json", JSON.stringify(patch.delivery_days_json));
    if (patch.cancel_policy !== undefined) set("cancel_policy", patch.cancel_policy || null);
    if (patch.redelivery_policy !== undefined) set("redelivery_policy", patch.redelivery_policy || null);
    if (patch.show_courier_location_to_customer !== undefined)
      set("show_courier_location_to_customer", !!patch.show_courier_location_to_customer);
    if (patch.distribution_mode !== undefined) set("distribution_mode", patch.distribution_mode);
    if (patch.offer_timeout_seconds !== undefined)
      set("offer_timeout_seconds", num(patch.offer_timeout_seconds, 30));
    if (patch.max_concurrent_per_courier !== undefined)
      set("max_concurrent_per_courier", num(patch.max_concurrent_per_courier, 3));
    if (patch.pricing_model !== undefined) set("pricing_model", patch.pricing_model);
    if (patch.pricing_config_json !== undefined)
      set("pricing_config_json", JSON.stringify(patch.pricing_config_json));
    if (patch.notification_prefs_json !== undefined)
      set("notification_prefs_json", JSON.stringify(patch.notification_prefs_json));
    if (patch.proof_mode !== undefined) set("proof_mode", String(patch.proof_mode || "pin"));
    if (patch.pin_max_attempts !== undefined)
      set("pin_max_attempts", Math.max(3, Math.min(num(patch.pin_max_attempts, 5), 10)));
    if (patch.default_sla_minutes !== undefined)
      set("default_sla_minutes", patch.default_sla_minutes != null ? num(patch.default_sla_minutes) : null);
    if (patch.require_signature !== undefined) set("require_signature", !!patch.require_signature);
    if (patch.require_otp !== undefined) set("require_otp", !!patch.require_otp);
    if (patch.geo_fraud_mode !== undefined)
      set("geo_fraud_mode", String(patch.geo_fraud_mode || "warn"));
    if (patch.gps_retention_days !== undefined)
      set("gps_retention_days", Math.max(0, Math.min(num(patch.gps_retention_days, 30), 365)));
    if (patch.geofence_pickup_m !== undefined)
      set("geofence_pickup_m", Math.max(40, Math.min(num(patch.geofence_pickup_m, 120), 500)));
    if (patch.geofence_dropoff_m !== undefined)
      set("geofence_dropoff_m", Math.max(30, Math.min(num(patch.geofence_dropoff_m, 80), 400)));
    if (patch.require_shift_checkin !== undefined)
      set("require_shift_checkin", !!patch.require_shift_checkin);
    if (patch.geofence_auto_status !== undefined)
      set("geofence_auto_status", !!patch.geofence_auto_status);
    if ((patch as any).require_package_scan !== undefined)
      set("require_package_scan", !!(patch as any).require_package_scan);

    if (fields.length) {
      fields.push("updated_at = NOW()");
      params.push(current.id);
      await update(`UPDATE mob_settings SET ${fields.join(", ")} WHERE id = ?`, params);
    }

    return this.getOrCreateSettings(ownerUserId, brandId);
  }

  /* ── Pricing ── */

  calculateQuote(input: {
    settings: MobSettings;
    distanceKm: number;
    productsTotal?: number;
  }): {
    delivery_fee: number;
    distance_km: number;
    eta_minutes: number;
    available: boolean;
    reason?: string;
    breakdown: Record<string, any>;
  } {
    const { settings, distanceKm } = input;
    const productsTotal = num(input.productsTotal);
    const cfg = settings.pricing_config_json || {};
    const maxRadius = settings.max_radius_km != null ? num(settings.max_radius_km) : null;

    if (maxRadius != null && distanceKm > maxRadius) {
      return {
        delivery_fee: 0,
        distance_km: distanceKm,
        eta_minutes: 0,
        available: false,
        reason: `Fora do raio de atendimento (${maxRadius} km)`,
        breakdown: { model: settings.pricing_model, max_radius_km: maxRadius },
      };
    }

    let fee = 0;
    const breakdown: Record<string, any> = {
      model: settings.pricing_model,
      distance_km: distanceKm,
      products_total: productsTotal,
    };

    if (settings.pricing_model === "per_km") {
      const base = num(cfg.base_fee, 5);
      const perKm = num(cfg.per_km, 2);
      const freeKm = num(cfg.free_km, 0);
      const billable = Math.max(0, distanceKm - freeKm);
      fee = base + billable * perKm;
      if (cfg.min_fee != null) fee = Math.max(fee, num(cfg.min_fee));
      if (cfg.max_fee != null) fee = Math.min(fee, num(cfg.max_fee));
      breakdown.base_fee = base;
      breakdown.per_km = perKm;
      breakdown.free_km = freeKm;
      breakdown.billable_km = billable;
    } else if (settings.pricing_model === "distance_bands") {
      const bands: Array<{ up_to_km: number; fee: number }> = Array.isArray(cfg.bands)
        ? cfg.bands
        : [];
      const sorted = [...bands].sort((a, b) => num(a.up_to_km) - num(b.up_to_km));
      let matched: number | null = null;
      for (const b of sorted) {
        if (distanceKm <= num(b.up_to_km)) {
          matched = num(b.fee);
          break;
        }
      }
      if (matched == null) {
        return {
          delivery_fee: 0,
          distance_km: distanceKm,
          eta_minutes: 0,
          available: false,
          reason: "Distância acima das faixas configuradas",
          breakdown: { ...breakdown, bands: sorted },
        };
      }
      fee = matched;
      breakdown.band_fee = fee;
    } else {
      // fixed (default)
      fee = num(cfg.fixed_fee, 12);
      breakdown.fixed_fee = fee;
    }

    if (cfg.free_above != null && productsTotal >= num(cfg.free_above) && num(cfg.free_above) > 0) {
      breakdown.free_shipping_applied = true;
      fee = 0;
    }
    if (cfg.min_order != null && productsTotal < num(cfg.min_order)) {
      return {
        delivery_fee: fee,
        distance_km: distanceKm,
        eta_minutes: 0,
        available: false,
        reason: `Pedido mínimo de R$ ${num(cfg.min_order).toFixed(2)}`,
        breakdown,
      };
    }

    fee = Math.round(fee * 100) / 100;
    const avgSpeedKmh = 25;
    const travelMin = Math.ceil((distanceKm / avgSpeedKmh) * 60);
    const eta = num(settings.prep_time_minutes, 30) + travelMin;

    return {
      delivery_fee: fee,
      distance_km: distanceKm,
      eta_minutes: eta,
      available: true,
      breakdown,
    };
  }

  /* ── Couriers (global) ── */

  async getCourierByUserId(userId: string): Promise<MobCourier | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(`SELECT * FROM mob_couriers WHERE user_id = ? LIMIT 1`, [userId]);
    return row ? mapCourier(row) : null;
  }

  async getCourierById(id: string): Promise<MobCourier | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(`SELECT * FROM mob_couriers WHERE id = ? LIMIT 1`, [id]);
    return row ? mapCourier(row) : null;
  }

  async getCourierByEmail(email: string): Promise<MobCourier | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM mob_couriers WHERE LOWER(email) = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    return row ? mapCourier(row) : null;
  }

  async registerCourier(input: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    whatsapp?: string;
    cpf?: string;
  }): Promise<{ courier: MobCourier; userId: string; passwordHash: string }> {
    await this.ensureSchema();
    const email = input.email.trim().toLowerCase();
    const existing = await this.getCourierByEmail(email);
    if (existing) throw new Error("E-mail já cadastrado no Lead Capture Mob");

    const userId: string = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 12);

    // Ensure user row for JWT identity (reuse users table if present)
    const userExists = await queryOne<any>(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
    let finalUserId: string = userId;
    if (userExists) {
      finalUserId = String(userExists.id);
    } else {
      await insert(
        `INSERT INTO users (id, email, password_hash, name, phone, role, account_kind, is_active)
         VALUES (?, ?, ?, ?, ?, 'courier', 'courier', TRUE)`,
        [userId, email, passwordHash, input.full_name, input.phone || null]
      ).catch(async () => {
        await insert(
          `INSERT INTO users (id, email, password_hash, name, role, is_active)
           VALUES (?, ?, ?, ?, 'courier', TRUE)`,
          [userId, email, passwordHash, input.full_name]
        ).catch(async () => {
          await insert(
            `INSERT INTO users (id, email, password_hash, name)
             VALUES (?, ?, ?, ?)`,
            [userId, email, passwordHash, input.full_name]
          );
        });
      });
    }

    const id: string = randomUUID();
    await insert(
      `INSERT INTO mob_couriers (
        id, user_id, full_name, cpf, phone, whatsapp, email, cadastro_status, ops_status, onboarding_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'incomplete', 'offline', ?)`,
      [
        id,
        finalUserId,
        input.full_name.trim(),
        input.cpf || null,
        input.phone || null,
        input.whatsapp || input.phone || null,
        email,
        JSON.stringify({
          phone_confirmed: false,
          email_confirmed: false,
          documents_sent: false,
          terms_accepted: false,
          geo_enabled: false,
          push_enabled: false,
          vehicle_validated: false,
        }),
      ]
    );

    if (userExists) {
      // update password for courier login
      await update(`UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?`, [
        passwordHash,
        finalUserId,
      ]).catch(() => undefined);
    }

    const courier = (await this.getCourierById(id))!;
    return { courier, userId: finalUserId, passwordHash };
  }

  async loginCourier(email: string, password: string): Promise<{ courier: MobCourier; userId: string } | null> {
    await this.ensureSchema();
    const emailNorm = email.trim().toLowerCase();
    const user = await queryOne<any>(
      `SELECT id, password_hash FROM users WHERE LOWER(email) = ? LIMIT 1`,
      [emailNorm]
    );
    if (!user) return null;
    const ok = await bcrypt.compare(password, String(user.password_hash || ""));
    if (!ok) return null;
    const courier = await this.getCourierByUserId(String(user.id));
    if (!courier) return null;
    if (courier.cadastro_status === "blocked") throw new Error("Conta bloqueada");
    return { courier, userId: String(user.id) };
  }

  async updateCourierProfile(
    courierId: string,
    patch: Record<string, any>
  ): Promise<MobCourier | null> {
    await this.ensureSchema();
    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    if (patch.full_name !== undefined) set("full_name", String(patch.full_name).trim());
    if (patch.cpf !== undefined) set("cpf", patch.cpf || null);
    if (patch.birth_date !== undefined) set("birth_date", patch.birth_date || null);
    if (patch.phone !== undefined) set("phone", patch.phone || null);
    if (patch.whatsapp !== undefined) set("whatsapp", patch.whatsapp || null);
    if (patch.photo_url !== undefined) set("photo_url", patch.photo_url || null);
    if (patch.pix_key !== undefined) set("pix_key", patch.pix_key || null);
    if (patch.address_json !== undefined) set("address_json", JSON.stringify(patch.address_json));
    if (patch.emergency_contact_json !== undefined)
      set("emergency_contact_json", JSON.stringify(patch.emergency_contact_json));
    if (patch.vehicle_json !== undefined) set("vehicle_json", JSON.stringify(patch.vehicle_json));
    if (patch.documents_json !== undefined)
      set("documents_json", JSON.stringify(patch.documents_json));
    if (patch.onboarding_json !== undefined)
      set("onboarding_json", JSON.stringify(patch.onboarding_json));
    if (patch.cadastro_status !== undefined) set("cadastro_status", patch.cadastro_status);
    if (patch.ops_status !== undefined) set("ops_status", patch.ops_status);

    if (!fields.length) return this.getCourierById(courierId);
    fields.push("updated_at = NOW()");
    params.push(courierId);
    await update(`UPDATE mob_couriers SET ${fields.join(", ")} WHERE id = ?`, params);
    return this.getCourierById(courierId);
  }

  async setOpsStatus(courierId: string, opsStatus: CourierOpsStatus): Promise<MobCourier | null> {
    return this.updateCourierProfile(courierId, { ops_status: opsStatus });
  }

  /* ── Memberships ── */

  async listMembershipsForCourier(courierId: string): Promise<any[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT m.*, s.operation_name, s.enabled AS org_enabled, b.name AS brand_name, b.slug AS brand_slug, b.logo_url
       FROM mob_courier_memberships m
       LEFT JOIN mob_settings s ON s.owner_user_id = m.owner_user_id AND s.brand_id = m.brand_id
       LEFT JOIN brand_units b ON b.id = m.brand_id
       WHERE m.courier_id = ?
       ORDER BY m.created_at DESC`,
      [courierId]
    );
    return rows || [];
  }

  async listMembershipsForOrg(ownerUserId: string, brandId: string): Promise<any[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT m.*, c.full_name, c.phone, c.email, c.photo_url, c.ops_status, c.vehicle_json,
              c.rating_avg AS courier_rating, c.last_lat, c.last_lng, c.last_location_at
       FROM mob_courier_memberships m
       INNER JOIN mob_couriers c ON c.id = m.courier_id
       WHERE m.owner_user_id = ? AND m.brand_id = ?
       ORDER BY m.created_at DESC`,
      [ownerUserId, brandId]
    );
    return (rows || []).map((r) => ({
      ...r,
      vehicle_json: parseJson(r.vehicle_json, null),
    }));
  }

  async createInvite(input: {
    ownerUserId: string;
    brandId: string;
    label?: string;
    unitId?: string;
    maxUses?: number;
    createdBy?: string;
    expiresAt?: string | null;
  }): Promise<any> {
    await this.ensureSchema();
    const id = randomUUID();
    const code = generateInviteCode();
    await insert(
      `INSERT INTO mob_invites (
        id, owner_user_id, brand_id, invite_code, label, unit_id, max_uses, status, expires_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        id,
        input.ownerUserId,
        input.brandId,
        code,
        input.label || null,
        input.unitId || null,
        input.maxUses ?? null,
        input.expiresAt || null,
        input.createdBy || null,
      ]
    );
    return queryOne(`SELECT * FROM mob_invites WHERE id = ? LIMIT 1`, [id]);
  }

  async getInviteByCode(code: string): Promise<any | null> {
    await this.ensureSchema();
    return queryOne(
      `SELECT i.*, b.name AS brand_name, b.logo_url, s.operation_name
       FROM mob_invites i
       LEFT JOIN brand_units b ON b.id = i.brand_id
       LEFT JOIN mob_settings s ON s.owner_user_id = i.owner_user_id AND s.brand_id = i.brand_id
       WHERE i.invite_code = ? LIMIT 1`,
      [code.trim()]
    );
  }

  async acceptInvite(courierId: string, inviteCode: string): Promise<MobMembership> {
    await this.ensureSchema();
    const invite = await this.getInviteByCode(inviteCode);
    if (!invite || invite.status !== "active") throw new Error("Convite inválido ou expirado");
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error("Convite expirado");
    }
    if (invite.max_uses != null && num(invite.used_count) >= num(invite.max_uses)) {
      throw new Error("Convite esgotado");
    }

    const existing = await queryOne<any>(
      `SELECT * FROM mob_courier_memberships WHERE courier_id = ? AND brand_id = ? LIMIT 1`,
      [courierId, invite.brand_id]
    );
    if (existing) {
      if (existing.status === "rejected" || existing.status === "inactive") {
        await update(
          `UPDATE mob_courier_memberships SET status = 'pending', invite_id = ?, updated_at = NOW() WHERE id = ?`,
          [invite.id, existing.id]
        );
      }
      const row = await queryOne<any>(`SELECT * FROM mob_courier_memberships WHERE id = ?`, [
        existing.id,
      ]);
      return row as MobMembership;
    }

    const id = randomUUID();
    await insert(
      `INSERT INTO mob_courier_memberships (
        id, courier_id, owner_user_id, brand_id, unit_id, bond_type, status, invite_id
      ) VALUES (?, ?, ?, ?, ?, 'autonomous', 'pending', ?)`,
      [id, courierId, invite.owner_user_id, invite.brand_id, invite.unit_id || null, invite.id]
    );
    await update(
      `UPDATE mob_invites SET used_count = used_count + 1, updated_at = NOW() WHERE id = ?`,
      [invite.id]
    );
    const row = await queryOne<any>(`SELECT * FROM mob_courier_memberships WHERE id = ?`, [id]);
    return row as MobMembership;
  }

  async updateMembershipStatus(
    ownerUserId: string,
    brandId: string,
    membershipId: string,
    status: MembershipStatus,
    notes?: string
  ): Promise<any | null> {
    await this.ensureSchema();
    const m = await queryOne<any>(
      `SELECT * FROM mob_courier_memberships WHERE id = ? AND owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [membershipId, ownerUserId, brandId]
    );
    if (!m) return null;

    const approvedAt = status === "approved" ? new Date().toISOString() : m.approved_at;
    await update(
      `UPDATE mob_courier_memberships
       SET status = ?, notes = COALESCE(?, notes), approved_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, notes ?? null, approvedAt, membershipId]
    );

    if (status === "approved") {
      await update(
        `UPDATE mob_couriers SET cadastro_status = 'approved', updated_at = NOW()
         WHERE id = ? AND cadastro_status IN ('incomplete','awaiting_documents','under_review')`,
        [m.courier_id]
      ).catch(() => undefined);
    }

    return queryOne(`SELECT * FROM mob_courier_memberships WHERE id = ?`, [membershipId]);
  }

  /* ── Deliveries ── */

  async createDelivery(input: {
    ownerUserId: string;
    brandId: string;
    orderId?: string;
    unitId?: string;
    modality?: "own" | "pickup" | "third_party";
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    pickupAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
    dropoffAddress?: string;
    dropoffLat?: number;
    dropoffLng?: number;
    productsTotal?: number;
    paymentMethod?: string;
    notes?: string;
    priority?: number;
    status?: DeliveryStatus;
  }): Promise<MobDelivery> {
    await this.ensureSchema();
    const settings = await this.getOrCreateSettings(input.ownerUserId, input.brandId);

    const pickupLat = input.pickupLat ?? settings.default_origin_lat;
    const pickupLng = input.pickupLng ?? settings.default_origin_lng;
    const pickupAddress = input.pickupAddress || settings.default_origin_address || null;

    let distanceKm: number | null = null;
    let quote: any = null;
    if (
      pickupLat != null &&
      pickupLng != null &&
      input.dropoffLat != null &&
      input.dropoffLng != null
    ) {
      distanceKm = estimateRoadDistanceKm(
        num(pickupLat),
        num(pickupLng),
        num(input.dropoffLat),
        num(input.dropoffLng)
      );
      quote = this.calculateQuote({
        settings,
        distanceKm,
        productsTotal: input.productsTotal,
      });
    }

    const id = randomUUID();
    const trackingToken = generateTrackingToken();
    const trackingExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const status: DeliveryStatus = input.status || "order_received";
    const payMethod = String(input.paymentMethod || "").toLowerCase();
    const codRequired = payMethod === "dinheiro" || payMethod === "money" || payMethod === "cod";
    const proofMode = String(settings.proof_mode || "pin");
    const proofRequired = proofMode === "photo" || proofMode === "pin_and_photo";
    const signatureRequired = !!settings.require_signature;
    const otpRequired = !!settings.require_otp;
    const slaMin = settings.default_sla_minutes != null ? num(settings.default_sla_minutes) : null;
    const etaMin = quote?.eta_minutes ?? settings.prep_time_minutes;
    const slaDeadline =
      slaMin != null
        ? new Date(Date.now() + (slaMin + num(etaMin, 0)) * 60 * 1000).toISOString()
        : null;

    await insert(
      `INSERT INTO mob_deliveries (
        id, owner_user_id, brand_id, order_id, unit_id, modality, status, priority,
        customer_name, customer_phone, customer_email,
        pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        products_total, delivery_fee, payment_method,
        distance_km, eta_minutes, quote_snapshot_json, notes,
        pickup_code, delivery_pin, tracking_token, tracking_expires_at,
        cod_required, cod_amount, proof_required, signature_required, otp_required,
        sla_minutes, sla_deadline_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )`,
      [
        id,
        input.ownerUserId,
        input.brandId,
        input.orderId || null,
        input.unitId || null,
        input.modality || "own",
        status,
        input.priority || 0,
        input.customerName || null,
        input.customerPhone || null,
        input.customerEmail || null,
        pickupAddress,
        pickupLat,
        pickupLng,
        input.dropoffAddress || null,
        input.dropoffLat ?? null,
        input.dropoffLng ?? null,
        num(input.productsTotal),
        quote?.delivery_fee ?? 0,
        input.paymentMethod || null,
        distanceKm,
        etaMin,
        quote ? JSON.stringify(quote) : null,
        input.notes || null,
        generatePin(4),
        generatePin(4),
        trackingToken,
        trackingExpires,
        codRequired,
        codRequired ? num(input.productsTotal) + num(quote?.delivery_fee) : null,
        proofRequired,
        signatureRequired,
        otpRequired,
        slaMin,
        slaDeadline,
      ]
    );

    await this.appendEvent({
      deliveryId: id,
      fromStatus: null,
      toStatus: status,
      actorType: "system",
      source: "create_delivery",
      note: "Entrega criada",
    });

    return (await this.getDeliveryById(id))!;
  }

  async getDeliveryById(id: string): Promise<MobDelivery | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(`SELECT * FROM mob_deliveries WHERE id = ? LIMIT 1`, [id]);
    return row ? mapDelivery(row) : null;
  }

  async getDeliveryByTrackingToken(token: string): Promise<MobDelivery | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM mob_deliveries WHERE tracking_token = ? LIMIT 1`,
      [token]
    );
    if (!row) return null;
    if (row.tracking_expires_at && new Date(row.tracking_expires_at) < new Date()) {
      return null;
    }
    return mapDelivery(row);
  }

  async listDeliveriesForOrg(
    ownerUserId: string,
    brandId: string,
    filters?: { status?: string; courierId?: string; limit?: number }
  ): Promise<any[]> {
    await this.ensureSchema();
    const limit = Math.min(num(filters?.limit, 100), 300);
    let sql = `
      SELECT d.*, c.full_name AS courier_name, c.phone AS courier_phone, c.photo_url AS courier_photo,
             c.ops_status AS courier_ops_status, c.last_lat AS courier_lat, c.last_lng AS courier_lng
      FROM mob_deliveries d
      LEFT JOIN mob_couriers c ON c.id = d.courier_id
      WHERE d.owner_user_id = ? AND d.brand_id = ?`;
    const params: any[] = [ownerUserId, brandId];
    if (filters?.status) {
      sql += ` AND d.status = ?`;
      params.push(filters.status);
    }
    if (filters?.courierId) {
      sql += ` AND d.courier_id = ?`;
      params.push(filters.courierId);
    }
    sql += ` ORDER BY d.created_at DESC LIMIT ${limit}`;
    const rows = await query<any[]>(sql, params);
    const now = Date.now();
    return (rows || []).map((r) => {
      const d = mapDelivery(r);
      const deadline = (d as any).sla_deadline_at
        ? new Date((d as any).sla_deadline_at).getTime()
        : null;
      const late =
        deadline != null &&
        deadline < now &&
        !["delivered", "cancelled"].includes(String(d.status));
      return {
        ...d,
        is_late: late,
        minutes_over_sla: late && deadline != null ? Math.floor((now - deadline) / 60000) : 0,
      };
    });
  }

  async listDeliveriesForCourier(
    courierId: string,
    filters?: { status?: string; activeOnly?: boolean }
  ): Promise<MobDelivery[]> {
    await this.ensureSchema();
    let sql = `SELECT * FROM mob_deliveries WHERE courier_id = ?`;
    const params: any[] = [courierId];
    if (filters?.status) {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.activeOnly) {
      sql += ` AND status NOT IN ('delivered','cancelled')`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;
    const rows = await query<any[]>(sql, params);
    return (rows || []).map(mapDelivery);
  }

  private maskOfferRow(r: any): any {
    const d = mapDelivery(r);
    return {
      ...d,
      customer_phone: null,
      customer_email: null,
      dropoff_address: d.dropoff_address
        ? String(d.dropoff_address).split(",").slice(-2).join(",").trim()
        : null,
      delivery_pin: null,
      pickup_code: null,
      operation_name: r.operation_name,
      brand_name: r.brand_name,
      offer_id: r.offer_id || null,
      offer_expires_at: r.offer_expires_at || null,
      offer_mode: r.offer_mode || r.distribution_mode || "manual",
      seconds_remaining:
        r.offer_expires_at != null
          ? Math.max(0, Math.floor((new Date(r.offer_expires_at).getTime() - Date.now()) / 1000))
          : null,
    };
  }

  async listAvailableOffers(courierId: string): Promise<any[]> {
    await this.ensureSchema();

    // 1) Personal timed offers (sequential / exclusive)
    const personal = await query<any[]>(
      `SELECT d.*, s.operation_name, s.distribution_mode, b.name AS brand_name,
              o.id AS offer_id, o.expires_at AS offer_expires_at, 'sequential' AS offer_mode
       FROM mob_delivery_offers o
       INNER JOIN mob_deliveries d ON d.id = o.delivery_id
       INNER JOIN mob_courier_memberships m
         ON m.courier_id = o.courier_id AND m.brand_id = d.brand_id
        AND m.owner_user_id = d.owner_user_id AND m.status = 'approved'
       LEFT JOIN mob_settings s ON s.owner_user_id = d.owner_user_id AND s.brand_id = d.brand_id
       LEFT JOIN brand_units b ON b.id = d.brand_id
       WHERE o.courier_id = ?
         AND o.status = 'pending'
         AND (o.expires_at IS NULL OR o.expires_at > NOW())
         AND d.status IN ('ready_for_dispatch','awaiting_courier','offered_to_courier')
         AND d.modality = 'own'
       ORDER BY o.offered_at ASC
       LIMIT 20`,
      [courierId]
    ).catch(() => []);

    // 2) Open pool: no exclusive pending offer for another courier
    const open = await query<any[]>(
      `SELECT d.*, s.operation_name, s.distribution_mode, b.name AS brand_name,
              NULL AS offer_id, NULL AS offer_expires_at,
              COALESCE(s.distribution_mode, 'manual') AS offer_mode
       FROM mob_deliveries d
       INNER JOIN mob_courier_memberships m
         ON m.brand_id = d.brand_id AND m.owner_user_id = d.owner_user_id
         AND m.courier_id = ? AND m.status = 'approved'
       LEFT JOIN mob_settings s ON s.owner_user_id = d.owner_user_id AND s.brand_id = d.brand_id
       LEFT JOIN brand_units b ON b.id = d.brand_id
       WHERE d.courier_id IS NULL
         AND d.status IN ('ready_for_dispatch','awaiting_courier','offered_to_courier')
         AND d.modality = 'own'
         AND COALESCE(s.distribution_mode, 'manual') IN ('manual','simultaneous','auto','direct')
         AND NOT EXISTS (
           SELECT 1 FROM mob_delivery_offers ox
           WHERE ox.delivery_id = d.id AND ox.status = 'pending'
             AND (ox.expires_at IS NULL OR ox.expires_at > NOW())
             AND ox.courier_id <> ?
         )
       ORDER BY d.priority DESC, d.created_at ASC
       LIMIT 50`,
      [courierId, courierId]
    ).catch(() => []);

    const byId = new Map<string, any>();
    for (const r of [...(personal || []), ...(open || [])]) {
      if (!byId.has(String(r.id))) byId.set(String(r.id), this.maskOfferRow(r));
    }
    return Array.from(byId.values());
  }

  /**
   * Rank available couriers for sequential / auto dispatch.
   * Score = distance to pickup (km) + active load penalty − rating bonus.
   * Lower score = better (offered first).
   */
  async listCandidateCouriers(
    ownerUserId: string,
    brandId: string,
    opts?: {
      excludeCourierIds?: string[];
      pickupLat?: number | null;
      pickupLng?: number | null;
      maxConcurrent?: number;
    }
  ): Promise<
    Array<{
      courier_id: string;
      user_id: string;
      full_name: string;
      ops_status: string;
      distance_to_pickup_km: number | null;
      active_load: number;
      score: number;
    }>
  > {
    await this.ensureSchema();
    const exclude = (opts?.excludeCourierIds || []).filter(Boolean);
    const maxConcurrent = Math.max(1, num(opts?.maxConcurrent, 3));
    const rows = await query<any[]>(
      `SELECT c.id AS courier_id, c.user_id, c.full_name, c.ops_status,
              c.last_lat, c.last_lng, c.rating_avg,
              (
                SELECT COUNT(*)::int FROM mob_deliveries d
                WHERE d.courier_id = c.id
                  AND d.status NOT IN ('delivered','cancelled')
              ) AS active_load
       FROM mob_courier_memberships m
       INNER JOIN mob_couriers c ON c.id = m.courier_id
       WHERE m.owner_user_id = ? AND m.brand_id = ? AND m.status = 'approved'
         AND c.ops_status IN ('available', 'busy')
         AND c.cadastro_status NOT IN ('blocked','suspended','rejected')
       LIMIT 60`,
      [ownerUserId, brandId]
    );

    const pickupLat = opts?.pickupLat != null ? num(opts.pickupLat) : null;
    const pickupLng = opts?.pickupLng != null ? num(opts.pickupLng) : null;

    const ranked = (rows || [])
      .filter((r) => !exclude.includes(String(r.courier_id)))
      .map((r) => {
        const load = num(r.active_load);
        const lat = r.last_lat != null ? num(r.last_lat) : null;
        const lng = r.last_lng != null ? num(r.last_lng) : null;
        let distanceKm: number | null = null;
        if (pickupLat != null && pickupLng != null && lat != null && lng != null) {
          distanceKm = Math.round(haversineKm(lat, lng, pickupLat, pickupLng) * 100) / 100;
        }
        const rating = num(r.rating_avg);
        // Prefer closer, less loaded, higher rated; unknown distance last
        const distScore = distanceKm == null ? 50 : distanceKm;
        const loadScore = load * 8;
        const ratingBonus = Math.min(5, rating) * 0.6;
        const busyPenalty = String(r.ops_status) === "busy" ? 4 : 0;
        const overCap = load >= maxConcurrent ? 1000 : 0;
        const score = distScore + loadScore + busyPenalty + overCap - ratingBonus;
        return {
          courier_id: String(r.courier_id),
          user_id: String(r.user_id),
          full_name: String(r.full_name || ""),
          ops_status: String(r.ops_status || "offline"),
          distance_to_pickup_km: distanceKm,
          active_load: load,
          score,
        };
      })
      .filter((c) => c.score < 500)
      .sort((a, b) => a.score - b.score || (a.distance_to_pickup_km ?? 99) - (b.distance_to_pickup_km ?? 99));

    return ranked.slice(0, 40);
  }

  async getRejectedCourierIds(deliveryId: string): Promise<string[]> {
    const rows = await query<any[]>(
      `SELECT courier_id FROM mob_delivery_offers
       WHERE delivery_id = ? AND status IN ('rejected','expired')`,
      [deliveryId]
    ).catch(() => []);
    return (rows || []).map((r) => String(r.courier_id));
  }

  /**
   * Start or advance sequential/simultaneous offers for a delivery.
   * Returns the offered courier id (sequential) or list (simultaneous).
   */
  async dispatchOffers(deliveryId: string): Promise<{
    mode: string;
    offered_to: string[];
    expires_at: string | null;
  }> {
    await this.ensureSchema();
    const delivery = await this.getDeliveryById(deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");
    if (delivery.courier_id && delivery.status === "accepted_by_courier") {
      return { mode: "assigned", offered_to: [delivery.courier_id], expires_at: null };
    }
    if (["delivered", "cancelled"].includes(delivery.status)) {
      return { mode: "closed", offered_to: [], expires_at: null };
    }

    const settings = await this.getOrCreateSettings(delivery.owner_user_id, delivery.brand_id);
    const mode = settings.distribution_mode || "manual";
    const timeoutSec = Math.max(10, Math.min(num(settings.offer_timeout_seconds, 30), 180));

    if (mode === "manual" || mode === "direct") {
      return { mode, offered_to: [], expires_at: null };
    }

    // Expire any pending exclusive offers first
    await query(
      `UPDATE mob_delivery_offers
       SET status = 'expired', responded_at = NOW()
       WHERE delivery_id = ? AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      [deliveryId]
    ).catch(() => undefined);

    const rejected = await this.getRejectedCourierIds(deliveryId);
    const candidates = await this.listCandidateCouriers(delivery.owner_user_id, delivery.brand_id, {
      excludeCourierIds: rejected,
      pickupLat: delivery.pickup_lat,
      pickupLng: delivery.pickup_lng,
      maxConcurrent: settings.max_concurrent_per_courier,
    });

    if (!candidates.length) {
      if (delivery.status !== "awaiting_courier") {
        try {
          await this.transitionStatus({
            deliveryId,
            toStatus: "awaiting_courier",
            actorType: "system",
            source: "dispatch_no_candidates",
            note: "Sem entregadores disponíveis",
          });
        } catch {
          /* ignore */
        }
      }
      return { mode, offered_to: [], expires_at: null };
    }

    const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

    if (mode === "simultaneous" || mode === "auto") {
      // Offer to all available; first accept wins
      const offered: string[] = [];
      for (const c of candidates.slice(0, 12)) {
        await insert(
          `INSERT INTO mob_delivery_offers (id, delivery_id, courier_id, status, offered_at, expires_at)
           VALUES (?, ?, ?, 'pending', NOW(), ?)`,
          [randomUUID(), deliveryId, c.courier_id, expiresAt]
        ).catch(async () => {
          await update(
            `UPDATE mob_delivery_offers
             SET status = 'pending', offered_at = NOW(), expires_at = ?, responded_at = NULL
             WHERE delivery_id = ? AND courier_id = ?`,
            [expiresAt, deliveryId, c.courier_id]
          ).catch(() => undefined);
        });
        offered.push(c.courier_id);
      }
      try {
        if (delivery.status !== "offered_to_courier") {
          await this.transitionStatus({
            deliveryId,
            toStatus: "offered_to_courier",
            actorType: "system",
            source: "dispatch_simultaneous",
            note: `Oferta simultânea para ${offered.length} entregadores`,
          });
        }
      } catch {
        await update(
          `UPDATE mob_deliveries SET status = 'offered_to_courier', offered_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [deliveryId]
        ).catch(() => undefined);
      }
      return { mode, offered_to: offered, expires_at: expiresAt };
    }

    // sequential — one at a time
    const next = candidates[0];
    // clear other pending
    await update(
      `UPDATE mob_delivery_offers SET status = 'expired', responded_at = NOW()
       WHERE delivery_id = ? AND status = 'pending' AND courier_id <> ?`,
      [deliveryId, next.courier_id]
    ).catch(() => undefined);

    await insert(
      `INSERT INTO mob_delivery_offers (id, delivery_id, courier_id, status, offered_at, expires_at)
       VALUES (?, ?, ?, 'pending', NOW(), ?)`,
      [randomUUID(), deliveryId, next.courier_id, expiresAt]
    ).catch(async () => {
      await update(
        `UPDATE mob_delivery_offers
         SET status = 'pending', offered_at = NOW(), expires_at = ?, responded_at = NULL
         WHERE delivery_id = ? AND courier_id = ?`,
        [expiresAt, deliveryId, next.courier_id]
      ).catch(() => undefined);
    });

    try {
      if (delivery.status !== "offered_to_courier") {
        await this.transitionStatus({
          deliveryId,
          toStatus: "offered_to_courier",
          actorType: "system",
          source: "dispatch_sequential",
          note: `Oferta sequencial → ${next.full_name || next.courier_id}`,
        });
      } else {
        await update(
          `UPDATE mob_deliveries SET offered_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [deliveryId]
        );
      }
    } catch {
      await update(
        `UPDATE mob_deliveries SET status = 'offered_to_courier', offered_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [deliveryId]
      ).catch(() => undefined);
    }

    await this.appendEvent({
      deliveryId,
      fromStatus: delivery.status,
      toStatus: "offered_to_courier",
      actorType: "system",
      courierId: next.courier_id,
      source: "sequential_offer",
      note: `Oferecida a ${next.full_name || next.courier_id} (${timeoutSec}s)`,
    });

    return { mode: "sequential", offered_to: [next.courier_id], expires_at: expiresAt };
  }

  /** Expire timed offers and advance sequential queue. */
  async processExpiredOffers(): Promise<{ expired: number; redispatched: number }> {
    await this.ensureSchema();
    const expiredRows = await query<any[]>(
      `SELECT o.id, o.delivery_id, o.courier_id, d.owner_user_id, d.brand_id, s.distribution_mode
       FROM mob_delivery_offers o
       INNER JOIN mob_deliveries d ON d.id = o.delivery_id
       LEFT JOIN mob_settings s ON s.owner_user_id = d.owner_user_id AND s.brand_id = d.brand_id
       WHERE o.status = 'pending'
         AND o.expires_at IS NOT NULL
         AND o.expires_at <= NOW()
         AND d.status IN ('offered_to_courier','awaiting_courier','ready_for_dispatch')
         AND d.courier_id IS NULL
       LIMIT 50`
    ).catch(() => []);

    let expired = 0;
    let redispatched = 0;
    const deliveryIds = new Set<string>();

    for (const row of expiredRows || []) {
      await update(
        `UPDATE mob_delivery_offers SET status = 'expired', responded_at = NOW() WHERE id = ? AND status = 'pending'`,
        [row.id]
      );
      expired++;
      deliveryIds.add(String(row.delivery_id));
      await this.appendEvent({
        deliveryId: String(row.delivery_id),
        fromStatus: "offered_to_courier",
        toStatus: "offered_to_courier",
        actorType: "system",
        courierId: String(row.courier_id),
        source: "offer_expired",
        note: "Oferta expirou sem aceite",
      }).catch(() => undefined);
    }

    for (const deliveryId of deliveryIds) {
      const d = await this.getDeliveryById(deliveryId);
      if (!d || d.courier_id || ["delivered", "cancelled", "accepted_by_courier"].includes(d.status)) {
        continue;
      }
      const settings = await this.getOrCreateSettings(d.owner_user_id, d.brand_id);
      if (["sequential", "simultaneous", "auto"].includes(settings.distribution_mode)) {
        const result = await this.dispatchOffers(deliveryId);
        if (result.offered_to.length) redispatched++;
      }
    }

    return { expired, redispatched };
  }

  async assignCourier(input: {
    deliveryId: string;
    courierId: string;
    ownerUserId: string;
    brandId: string;
    actorId?: string;
    direct?: boolean;
  }): Promise<MobDelivery> {
    await this.ensureSchema();
    const delivery = await this.getDeliveryById(input.deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");
    if (delivery.owner_user_id !== input.ownerUserId || delivery.brand_id !== input.brandId) {
      throw new Error("Entrega de outra organização");
    }

    const membership = await queryOne<any>(
      `SELECT * FROM mob_courier_memberships
       WHERE courier_id = ? AND brand_id = ? AND owner_user_id = ? AND status = 'approved' LIMIT 1`,
      [input.courierId, input.brandId, input.ownerUserId]
    );
    if (!membership) throw new Error("Entregador não vinculado/aprovado nesta organização");

    const nextStatus: DeliveryStatus = input.direct ? "accepted_by_courier" : "offered_to_courier";
    if (!canTransition(delivery.status as DeliveryStatus, nextStatus)) {
      throw new Error(`Transição inválida: ${delivery.status} → ${nextStatus}`);
    }

    await update(
      `UPDATE mob_deliveries
       SET courier_id = ?, membership_id = ?, status = ?,
           offered_at = COALESCE(offered_at, NOW()),
           accepted_at = ${input.direct ? "NOW()" : "accepted_at"},
           updated_at = NOW()
       WHERE id = ?`,
      [input.courierId, membership.id, nextStatus, input.deliveryId]
    );

    await this.appendEvent({
      deliveryId: input.deliveryId,
      fromStatus: delivery.status,
      toStatus: nextStatus,
      actorType: "org",
      actorId: input.actorId || input.ownerUserId,
      courierId: input.courierId,
      source: input.direct ? "direct_assign" : "offer",
      note: input.direct ? "Atribuição direta" : "Oferecida ao entregador",
    });

    return (await this.getDeliveryById(input.deliveryId))!;
  }

  async courierAccept(courierId: string, deliveryId: string): Promise<MobDelivery> {
    await this.ensureSchema();
    const delivery = await this.getDeliveryById(deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");

    if (delivery.courier_id && delivery.courier_id !== courierId) {
      throw new Error("Entrega já atribuída a outro entregador");
    }

    const membership = await queryOne<any>(
      `SELECT * FROM mob_courier_memberships
       WHERE courier_id = ? AND brand_id = ? AND owner_user_id = ? AND status = 'approved' LIMIT 1`,
      [courierId, delivery.brand_id, delivery.owner_user_id]
    );
    if (!membership) throw new Error("Sem vínculo aprovado com esta organização");

    const from = delivery.status as DeliveryStatus;
    const to: DeliveryStatus = "accepted_by_courier";
    if (
      delivery.courier_id === courierId &&
      from === "accepted_by_courier"
    ) {
      return delivery;
    }
    if (!canTransition(from, to) && !["ready_for_dispatch", "awaiting_courier", "offered_to_courier"].includes(from)) {
      throw new Error(`Não é possível aceitar no status ${from}`);
    }

    // Race-safe accept: only if still unassigned or already mine
    const accepted = await update(
      `UPDATE mob_deliveries
       SET courier_id = ?, membership_id = ?, status = ?, accepted_at = NOW(), updated_at = NOW()
       WHERE id = ? AND (courier_id IS NULL OR courier_id = ?)
         AND status NOT IN ('delivered','cancelled')`,
      [courierId, membership.id, to, deliveryId, courierId]
    ).catch(() => ({ affectedRows: 0 }));

    // Also claim if offered exclusively to this courier via offers table
    await update(
      `UPDATE mob_delivery_offers
       SET status = 'accepted', responded_at = NOW()
       WHERE delivery_id = ? AND courier_id = ? AND status = 'pending'`,
      [deliveryId, courierId]
    ).catch(() => undefined);

    // Expire all other pending offers for this delivery
    await update(
      `UPDATE mob_delivery_offers
       SET status = 'expired', responded_at = NOW()
       WHERE delivery_id = ? AND status = 'pending' AND courier_id <> ?`,
      [deliveryId, courierId]
    ).catch(() => undefined);

    const final = await this.getDeliveryById(deliveryId);
    if (!final || final.courier_id !== courierId) {
      throw new Error("Outro entregador aceitou primeiro");
    }

    await this.setOpsStatus(courierId, "busy");
    await this.appendEvent({
      deliveryId,
      fromStatus: from,
      toStatus: to,
      actorType: "courier",
      actorId: courierId,
      courierId,
      source: "courier_accept",
      note: "Aceita pelo entregador",
    });

    void accepted;
    return final;
  }

  async courierReject(
    courierId: string,
    deliveryId: string,
    note?: string
  ): Promise<{ redispatched: boolean; offered_to: string[]; expires_at: string | null; mode?: string }> {
    await this.ensureSchema();
    const delivery = await this.getDeliveryById(deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");
    if (delivery.courier_id && delivery.courier_id !== courierId) {
      throw new Error("Entrega de outro entregador");
    }

    if (delivery.courier_id === courierId) {
      await update(
        `UPDATE mob_deliveries
         SET courier_id = NULL, membership_id = NULL, status = 'awaiting_courier',
             offered_at = NULL, accepted_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [deliveryId]
      );
    }

    await update(
      `UPDATE mob_delivery_offers
       SET status = 'rejected', responded_at = NOW()
       WHERE delivery_id = ? AND courier_id = ? AND status = 'pending'`,
      [deliveryId, courierId]
    ).catch(async () => {
      await insert(
        `INSERT INTO mob_delivery_offers (id, delivery_id, courier_id, status, responded_at)
         VALUES (?, ?, ?, 'rejected', NOW())`,
        [randomUUID(), deliveryId, courierId]
      ).catch(() => undefined);
    });

    await this.appendEvent({
      deliveryId,
      fromStatus: delivery.status,
      toStatus: delivery.courier_id === courierId ? "awaiting_courier" : delivery.status,
      actorType: "courier",
      actorId: courierId,
      courierId,
      source: "courier_reject",
      note: note || "Recusada pelo entregador",
    });

    // Advance sequential queue
    let redispatched = false;
    let offered_to: string[] = [];
    let expires_at: string | null = null;
    let mode: string | undefined;
    try {
      const settings = await this.getOrCreateSettings(delivery.owner_user_id, delivery.brand_id);
      if (["sequential", "simultaneous", "auto"].includes(settings.distribution_mode)) {
        const result = await this.dispatchOffers(deliveryId);
        redispatched = result.offered_to.length > 0;
        offered_to = result.offered_to;
        expires_at = result.expires_at;
        mode = result.mode;
      }
    } catch {
      /* ignore */
    }
    return { redispatched, offered_to, expires_at, mode };
  }

  /**
   * PIN attempts + proof mode enforcement.
   * Locks after pin_max_attempts (default 5).
   */
  async assertDeliveryProof(
    delivery: MobDelivery,
    input: {
      deliveryPin?: string;
      proofPhotoUrl?: string;
      signatureUrl?: string;
      otpCode?: string;
      skipPinIfOtp?: boolean;
    }
  ): Promise<void> {
    const settings = await this.getOrCreateSettings(delivery.owner_user_id, delivery.brand_id);
    const proofMode = String(settings.proof_mode || "pin");
    const maxAttempts = Math.max(3, Math.min(num(settings.pin_max_attempts, 5), 10));

    if ((delivery as any).pin_locked_at) {
      throw new Error(
        "PIN bloqueado por excesso de tentativas. Contate a loja para desbloquear."
      );
    }

    // COD must be collected before complete when required
    if ((delivery as any).cod_required && !(delivery as any).cod_collected_at) {
      throw new Error("Confirme o recebimento do pagamento (dinheiro) antes de concluir a entrega");
    }

    // OTP verification (optional path or required)
    let otpOk = !!(delivery as any).delivery_otp_verified_at;
    const otpRequired = !!(delivery as any).otp_required || !!settings.require_otp;
    if (otpRequired || input.otpCode) {
      if (!otpOk) {
        if (input.otpCode) {
          const { verifyDeliveryOtp } = await import("./mobOtp");
          await verifyDeliveryOtp({ deliveryId: delivery.id, code: input.otpCode, maxAttempts });
          otpOk = true;
        } else if (otpRequired) {
          throw new Error("Confirme o OTP enviado ao WhatsApp do cliente");
        }
      }
    }

    // OTP válido pode substituir o PIN (ainda exige foto/assinatura se configurados)
    const needsPin =
      !otpOk && (proofMode === "pin" || proofMode === "pin_and_photo" || !!delivery.delivery_pin);
    const needsPhoto =
      proofMode === "photo" || proofMode === "pin_and_photo" || !!(delivery as any).proof_required;
    const needsSignature = !!(delivery as any).signature_required || !!settings.require_signature;

    if (needsPin && delivery.delivery_pin) {
      const pin = String(input.deliveryPin || "").trim();
      if (!pin) {
        throw new Error("Informe o PIN de confirmação do cliente para concluir a entrega");
      }
      if (pin !== String(delivery.delivery_pin).trim()) {
        const attempts = num((delivery as any).pin_attempts) + 1;
        if (attempts >= maxAttempts) {
          await update(
            `UPDATE mob_deliveries
             SET pin_attempts = ?, pin_locked_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [attempts, delivery.id]
          );
          await this.appendEvent({
            deliveryId: delivery.id,
            fromStatus: delivery.status,
            toStatus: delivery.status,
            actorType: "courier",
            source: "pin_lock",
            note: `PIN bloqueado após ${attempts} tentativas`,
          });
          throw new Error(
            `PIN inválido. Bloqueado após ${maxAttempts} tentativas. Contate a loja.`
          );
        }
        await update(
          `UPDATE mob_deliveries SET pin_attempts = ?, updated_at = NOW() WHERE id = ?`,
          [attempts, delivery.id]
        );
        await this.appendEvent({
          deliveryId: delivery.id,
          fromStatus: delivery.status,
          toStatus: delivery.status,
          actorType: "courier",
          source: "pin_fail",
          note: `PIN inválido (tentativa ${attempts}/${maxAttempts})`,
        });
        throw new Error(`PIN inválido. Tentativa ${attempts} de ${maxAttempts}.`);
      }
      await update(
        `UPDATE mob_deliveries SET pin_attempts = 0, updated_at = NOW() WHERE id = ?`,
        [delivery.id]
      ).catch(() => undefined);
    }

    if (needsPhoto) {
      const photo = String(input.proofPhotoUrl || delivery.proof_photo_url || "").trim();
      if (!photo) {
        throw new Error("Envie a foto do comprovante de entrega para concluir");
      }
    }

    if (needsSignature) {
      const sig = String(input.signatureUrl || (delivery as any).signature_url || "").trim();
      if (!sig) {
        throw new Error("Colete a assinatura do cliente na tela para concluir");
      }
    }
  }

  async unlockDeliveryPin(deliveryId: string, actorId?: string): Promise<MobDelivery> {
    await this.ensureSchema();
    await update(
      `UPDATE mob_deliveries
       SET pin_attempts = 0, pin_locked_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [deliveryId]
    );
    await this.appendEvent({
      deliveryId,
      fromStatus: null,
      toStatus: "under_review",
      actorType: "org",
      actorId,
      source: "pin_unlock",
      note: "PIN desbloqueado pela organização",
    }).catch(() => undefined);
    // don't change status — just unlock
    return (await this.getDeliveryById(deliveryId))!;
  }

  async collectCod(input: {
    deliveryId: string;
    courierId: string;
    amount?: number;
    note?: string;
  }): Promise<MobDelivery> {
    await this.ensureSchema();
    const d = await this.getDeliveryById(input.deliveryId);
    if (!d) throw new Error("Entrega não encontrada");
    if (d.courier_id && d.courier_id !== input.courierId) {
      throw new Error("Entrega de outro entregador");
    }
    if (!(d as any).cod_required) {
      throw new Error("Esta entrega não exige cobrança na entrega");
    }
    if ((d as any).cod_collected_at) {
      return d;
    }
    const amount = input.amount != null ? num(input.amount) : num((d as any).cod_amount);
    await update(
      `UPDATE mob_deliveries
       SET cod_collected_at = NOW(), cod_collected_by = ?, cod_amount = ?, updated_at = NOW()
       WHERE id = ?`,
      [input.courierId, amount, input.deliveryId]
    );
    await this.appendEvent({
      deliveryId: input.deliveryId,
      fromStatus: d.status,
      toStatus: d.status,
      actorType: "courier",
      actorId: input.courierId,
      courierId: input.courierId,
      source: "cod_collect",
      note: input.note || `Pagamento em dinheiro recebido: R$ ${amount.toFixed(2)}`,
    });
    return (await this.getDeliveryById(input.deliveryId))!;
  }

  async transitionStatus(input: {
    deliveryId: string;
    toStatus: DeliveryStatus;
    actorType: "org" | "courier" | "system" | "customer";
    actorId?: string;
    courierId?: string;
    lat?: number;
    lng?: number;
    note?: string;
    source?: string;
    deviceInfo?: string;
    proofPhotoUrl?: string;
    deliveryPin?: string;
    signatureUrl?: string;
    otpCode?: string;
  }): Promise<MobDelivery> {
    await this.ensureSchema();
    const delivery = await this.getDeliveryById(input.deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");

    const from = delivery.status as DeliveryStatus;
    const to = input.toStatus;
    if (!canTransition(from, to)) {
      throw new Error(`Transição inválida: ${from} → ${to}`);
    }

    if (to === "delivered") {
      await this.assertDeliveryProof(delivery, {
        deliveryPin: input.deliveryPin,
        proofPhotoUrl: input.proofPhotoUrl,
        signatureUrl: input.signatureUrl,
        otpCode: input.otpCode,
      });
    }

    // Package/volume scan conference (spec §16)
    if (to === "picked_up" || to === "delivered") {
      const { mobPackagesService } = await import("./mobPackages");
      const settings = await this.getOrCreateSettings(delivery.owner_user_id, delivery.brand_id);
      const requireScan =
        !!(delivery as any).require_package_scan || !!(settings as any).require_package_scan;
      if (requireScan || num((delivery as any).package_count) > 0) {
        await mobPackagesService.ensureForDelivery({
          id: delivery.id,
          owner_user_id: delivery.owner_user_id,
          brand_id: delivery.brand_id,
          package_count: (delivery as any).package_count,
          require_package_scan: requireScan,
        });
        await mobPackagesService.assertScanComplete(
          {
            id: delivery.id,
            require_package_scan: requireScan,
            package_count: (delivery as any).package_count,
          },
          to === "picked_up" ? "pickup" : "dropoff"
        );
      }
    }

    const extra: string[] = ["status = ?", "updated_at = NOW()"];
    const params: any[] = [to];

    if (to === "picked_up") {
      extra.push("picked_up_at = NOW()");
    }
    if (to === "delivered") {
      extra.push("delivered_at = NOW()");
      if (input.proofPhotoUrl) {
        extra.push("proof_photo_url = ?");
        params.push(input.proofPhotoUrl);
      }
      if (input.signatureUrl) {
        extra.push("signature_url = ?");
        params.push(input.signatureUrl);
      }
    }
    if (to === "cancelled") {
      extra.push("cancelled_at = NOW()");
    }

    params.push(input.deliveryId);
    await update(`UPDATE mob_deliveries SET ${extra.join(", ")} WHERE id = ?`, params);

    if (to === "delivered" || to === "cancelled") {
      if (delivery.courier_id) {
        const active = await queryOne<any>(
          `SELECT COUNT(*)::int AS n FROM mob_deliveries
           WHERE courier_id = ? AND status NOT IN ('delivered','cancelled') AND id <> ?`,
          [delivery.courier_id, input.deliveryId]
        );
        if (!num(active?.n)) {
          await this.setOpsStatus(delivery.courier_id, "available");
        }
      }
    }

    await this.appendEvent({
      deliveryId: input.deliveryId,
      fromStatus: from,
      toStatus: to,
      actorType: input.actorType,
      actorId: input.actorId,
      courierId: input.courierId || delivery.courier_id || undefined,
      lat: input.lat,
      lng: input.lng,
      source: input.source || "status_change",
      deviceInfo: input.deviceInfo,
      note: input.note,
    });

    return (await this.getDeliveryById(input.deliveryId))!;
  }

  async appendEvent(input: {
    deliveryId: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    actorId?: string;
    courierId?: string;
    lat?: number;
    lng?: number;
    source?: string;
    deviceInfo?: string;
    note?: string;
  }) {
    await insert(
      `INSERT INTO mob_delivery_events (
        id, delivery_id, from_status, to_status, actor_type, actor_id, courier_id,
        lat, lng, source, device_info, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.deliveryId,
        input.fromStatus,
        input.toStatus,
        input.actorType,
        input.actorId || null,
        input.courierId || null,
        input.lat ?? null,
        input.lng ?? null,
        input.source || null,
        input.deviceInfo || null,
        input.note || null,
      ]
    );
  }

  async listEvents(deliveryId: string): Promise<any[]> {
    await this.ensureSchema();
    return (
      (await query<any[]>(
        `SELECT * FROM mob_delivery_events WHERE delivery_id = ? ORDER BY created_at ASC`,
        [deliveryId]
      )) || []
    );
  }

  /* ── Geolocation ── */

  async recordLocation(input: {
    courierId: string;
    deliveryId?: string;
    brandId?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    batteryLevel?: number;
    source?: string;
    deviceId?: string;
    recordedAt?: string;
  }): Promise<{ accepted: boolean; fraud?: any }> {
    await this.ensureSchema();
    const { evaluateLocationSample, hashDeviceId } = await import("./mobGeoFraud");

    const courier = await this.getCourierById(input.courierId);
    const prev =
      courier?.last_lat != null && courier?.last_lng != null
        ? {
            lat: courier.last_lat,
            lng: courier.last_lng,
            recordedAt: courier.last_location_at,
            deviceId: (courier as any).last_device_id || null,
          }
        : null;

    const deviceHash = hashDeviceId(input.deviceId);
    const fraud = evaluateLocationSample(prev, {
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      speed: input.speed,
      heading: input.heading,
      recordedAt: input.recordedAt || new Date().toISOString(),
      deviceId: deviceHash,
    });

    // Resolve fraud mode from brand of active delivery or default warn
    let mode = "warn";
    if (input.deliveryId) {
      const d = await this.getDeliveryById(input.deliveryId);
      if (d) {
        const s = await this.getOrCreateSettings(d.owner_user_id, d.brand_id);
        mode = String(s.geo_fraud_mode || "warn");
      }
    }

    if (fraud.severity === "block" && mode === "block") {
      if (input.deliveryId) {
        await this.appendEvent({
          deliveryId: input.deliveryId,
          fromStatus: null,
          toStatus: "under_review",
          actorType: "system",
          courierId: input.courierId,
          lat: input.lat,
          lng: input.lng,
          source: "geo_fraud_block",
          note: `GPS rejeitado: ${(fraud.flags || []).join(", ")}`,
        }).catch(() => undefined);
      }
      return { accepted: false, fraud };
    }

    await insert(
      `INSERT INTO mob_location_points (
        courier_id, delivery_id, brand_id, lat, lng, accuracy, speed, heading, battery_level, source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        input.courierId,
        input.deliveryId || null,
        input.brandId || null,
        input.lat,
        input.lng,
        input.accuracy ?? null,
        input.speed ?? null,
        input.heading ?? null,
        input.batteryLevel ?? null,
        input.source || "app",
      ]
    );

    const fraudScore = fraud.severity === "block" ? 30 : fraud.severity === "warn" ? 10 : 0;
    await update(
      `UPDATE mob_couriers
       SET last_lat = ?, last_lng = ?, last_location_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [input.lat, input.lng, input.courierId]
    );

    if (input.deliveryId && (fraudScore > 0 || deviceHash)) {
      await update(
        `UPDATE mob_deliveries
         SET geo_fraud_score = COALESCE(geo_fraud_score, 0) + ?,
             geo_fraud_flags_json = ?,
             last_device_id = COALESCE(?, last_device_id),
             updated_at = NOW()
         WHERE id = ?`,
        [
          fraudScore,
          fraud.flags?.length ? JSON.stringify(fraud.flags) : null,
          deviceHash,
          input.deliveryId,
        ]
      ).catch(() => undefined);

      if (fraud.flags?.length) {
        await this.appendEvent({
          deliveryId: input.deliveryId,
          fromStatus: null,
          toStatus: "under_review",
          actorType: "system",
          courierId: input.courierId,
          lat: input.lat,
          lng: input.lng,
          source: "geo_fraud_warn",
          note: `Alerta GPS: ${fraud.flags.join(", ")}${
            fraud.implied_speed_kmh != null ? ` (~${fraud.implied_speed_kmh} km/h)` : ""
          }`,
        }).catch(() => undefined);
      }
    }

    return { accepted: true, fraud: fraud.severity === "none" ? undefined : fraud };
  }

  async getOrgMapState(ownerUserId: string, brandId: string): Promise<{
    couriers: any[];
    deliveries: any[];
    routes: any[];
    active_couriers: any[];
    settings: MobSettings;
    summary: {
      online: number;
      available: number;
      busy: number;
      active_deliveries: number;
      late: number;
      unassigned: number;
    };
  }> {
    const settings = await this.getOrCreateSettings(ownerUserId, brandId);
    const memberships = await this.listMembershipsForOrg(ownerUserId, brandId);
    const couriers = memberships
      .filter((m) => m.status === "approved")
      .map((m) => ({
        membership_id: m.id,
        courier_id: m.courier_id,
        full_name: m.full_name,
        photo_url: m.photo_url,
        phone: m.phone,
        ops_status: m.ops_status,
        last_lat: m.last_lat != null ? num(m.last_lat) : null,
        last_lng: m.last_lng != null ? num(m.last_lng) : null,
        last_location_at: m.last_location_at,
        vehicle_json: m.vehicle_json,
      }));

    const deliveries = await this.listDeliveriesForOrg(ownerUserId, brandId, { limit: 80 });
    const active = deliveries.filter(
      (d) => !["delivered", "cancelled"].includes(String(d.status))
    );

    // Active load per courier
    const loadByCourier = new Map<string, number>();
    for (const d of active) {
      if (!d.courier_id) continue;
      loadByCourier.set(d.courier_id, (loadByCourier.get(d.courier_id) || 0) + 1);
    }

    const active_couriers = couriers
      .filter((c) => c.ops_status === "available" || c.ops_status === "busy")
      .map((c) => ({
        ...c,
        active_load: loadByCourier.get(c.courier_id) || 0,
        is_online: true,
      }));

    // Active multi-stop routes with stops for polylines
    const routeRows = await query<any[]>(
      `SELECT r.id, r.courier_id, r.status, r.total_distance_km, r.total_stops, c.full_name AS courier_name
       FROM mob_routes r
       LEFT JOIN mob_couriers c ON c.id = r.courier_id
       WHERE r.owner_user_id = ? AND r.brand_id = ?
         AND r.status IN ('planning','active')
       ORDER BY r.updated_at DESC
       LIMIT 30`,
      [ownerUserId, brandId]
    ).catch(() => []);

    const routes: any[] = [];
    for (const r of routeRows || []) {
      const stops = await query<any[]>(
        `SELECT id, delivery_id, stop_order, stop_type, status, lat, lng, address, label
         FROM mob_route_stops WHERE route_id = ? ORDER BY stop_order ASC`,
        [r.id]
      ).catch(() => []);
      routes.push({
        ...r,
        total_distance_km: r.total_distance_km != null ? num(r.total_distance_km) : null,
        stops: (stops || []).map((s) => ({
          ...s,
          lat: s.lat != null ? num(s.lat) : null,
          lng: s.lng != null ? num(s.lng) : null,
        })),
      });
    }

    // Enrich deliveries with SLA lateness
    const now = Date.now();
    const enriched = active.map((d) => {
      const deadline = (d as any).sla_deadline_at
        ? new Date((d as any).sla_deadline_at).getTime()
        : null;
      const late = deadline != null && deadline < now;
      const minutes_over =
        late && deadline != null ? Math.floor((now - deadline) / 60000) : 0;
      return {
        ...d,
        is_late: late,
        minutes_over_sla: minutes_over,
        is_priority: num(d.priority) > 0,
      };
    });

    return {
      couriers,
      deliveries: enriched,
      routes,
      active_couriers,
      settings,
      summary: {
        online: active_couriers.length,
        available: active_couriers.filter((c) => c.ops_status === "available").length,
        busy: active_couriers.filter((c) => c.ops_status === "busy").length,
        active_deliveries: enriched.length,
        late: enriched.filter((d) => d.is_late).length,
        unassigned: enriched.filter((d) => !d.courier_id).length,
      },
    };
  }

  async getCourierDashboard(courierId: string): Promise<{
    courier: MobCourier;
    memberships: any[];
    active: MobDelivery[];
    available_count: number;
    today: { completed: number; earnings: number };
  }> {
    const courier = (await this.getCourierById(courierId))!;
    const memberships = await this.listMembershipsForCourier(courierId);
    const active = await this.listDeliveriesForCourier(courierId, { activeOnly: true });
    const offers = await this.listAvailableOffers(courierId);

    const todayRows = await query<any[]>(
      `SELECT COUNT(*)::int AS completed,
              COALESCE(SUM(COALESCE(courier_payout, delivery_fee)), 0)::float AS earnings
       FROM mob_deliveries
       WHERE courier_id = ?
         AND status = 'delivered'
         AND delivered_at::date = CURRENT_DATE`,
      [courierId]
    ).catch(() => [{ completed: 0, earnings: 0 }]);

    return {
      courier,
      memberships,
      active,
      available_count: offers.length,
      today: {
        completed: num(todayRows?.[0]?.completed),
        earnings: num(todayRows?.[0]?.earnings),
      },
    };
  }

  async getPublicTracking(token: string): Promise<any | null> {
    const delivery = await this.getDeliveryByTrackingToken(token);
    if (!delivery) return null;

    const settings = await this.getOrCreateSettings(delivery.owner_user_id, delivery.brand_id);
    const brand = await queryOne<any>(
      `SELECT id, name, logo_url, slug FROM brand_units WHERE id = ? LIMIT 1`,
      [delivery.brand_id]
    );
    const events = await this.listEvents(delivery.id);

    let courierPublic: any = null;
    let location: any = null;
    if (delivery.courier_id) {
      const c = await this.getCourierById(delivery.courier_id);
      if (c) {
        const firstName = String(c.full_name || "").split(" ")[0];
        courierPublic = {
          first_name: firstName,
          vehicle_type: parseJson(c.vehicle_json, {})?.type || null,
          photo_url: c.photo_url,
        };
        if (
          settings.show_courier_location_to_customer &&
          !["delivered", "cancelled"].includes(delivery.status) &&
          c.last_lat != null &&
          c.last_lng != null
        ) {
          location = {
            lat: c.last_lat,
            lng: c.last_lng,
            updated_at: c.last_location_at,
          };
        }
      }
    }

    const publicEvents = events.map((e) => ({
      status: e.to_status,
      at: e.created_at,
      note: e.note,
    }));

    return {
      organization: {
        name: brand?.name || settings.operation_name || "Loja",
        logo_url: brand?.logo_url || null,
        contact_phone: settings.contact_phone,
      },
      delivery: {
        id: delivery.id,
        order_id: delivery.order_id,
        status: delivery.status,
        eta_minutes: delivery.eta_minutes,
        distance_km: delivery.distance_km,
        delivery_fee: delivery.delivery_fee,
        dropoff_address: delivery.dropoff_address,
        pickup_address: null, // internal
        modality: delivery.modality,
        delivery_pin: ["at_destination", "near_destination", "en_route", "picked_up"].includes(
          delivery.status
        )
          ? delivery.delivery_pin
          : null,
        created_at: delivery.created_at,
        delivered_at: delivery.delivered_at,
      },
      courier: courierPublic,
      location,
      timeline: publicEvents,
      show_map: !!settings.show_courier_location_to_customer,
    };
  }

  async orgReports(ownerUserId: string, brandId: string): Promise<any> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::int AS delivered,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancelled,
         SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END)::int AS in_progress,
         COALESCE(SUM(delivery_fee), 0)::float AS fees_total,
         COALESCE(AVG(distance_km), 0)::float AS avg_distance_km
       FROM mob_deliveries
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    const couriers = await queryOne<any>(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int AS pending
       FROM mob_courier_memberships
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    return { deliveries: row || {}, couriers: couriers || {} };
  }

  /**
   * Daily finance report for logistics ops.
   * Aggregates fees, COD collected, free shipping, cancelled, km, courier payouts.
   */
  async financeDailyReport(
    ownerUserId: string,
    brandId: string,
    opts?: { from?: string; to?: string; days?: number }
  ): Promise<{
    range: { from: string; to: string };
    totals: any;
    days: any[];
    by_courier: any[];
  }> {
    await this.ensureSchema();
    const days = Math.max(1, Math.min(num(opts?.days, 14), 90));
    const toDate = opts?.to ? new Date(opts.to) : new Date();
    const fromDate = opts?.from
      ? new Date(opts.from)
      : new Date(toDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);

    const totals = await queryOne<any>(
      `SELECT
         COUNT(*)::int AS deliveries_total,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::int AS delivered,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancelled,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0)::float AS fees_collected,
         COALESCE(SUM(CASE WHEN status = 'delivered' AND delivery_fee = 0 THEN 1 ELSE 0 END), 0)::int AS free_shipping_count,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(courier_payout, delivery_fee * 0.7) ELSE 0 END), 0)::float AS courier_payouts_est,
         COALESCE(SUM(CASE WHEN cod_collected_at IS NOT NULL THEN COALESCE(cod_amount, 0) ELSE 0 END), 0)::float AS cod_collected,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(distance_km, 0) ELSE 0 END), 0)::float AS km_delivered,
         COALESCE(AVG(CASE WHEN status = 'delivered' THEN distance_km END), 0)::float AS avg_km,
         SUM(CASE WHEN geo_fraud_score > 0 THEN 1 ELSE 0 END)::int AS fraud_flagged
       FROM mob_deliveries
       WHERE owner_user_id = ? AND brand_id = ?
         AND created_at::date >= ?::date
         AND created_at::date <= ?::date`,
      [ownerUserId, brandId, fromStr, toStr]
    ).catch(() =>
      queryOne<any>(
        `SELECT
           COUNT(*)::int AS deliveries_total,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::int AS delivered,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancelled,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0)::float AS fees_collected,
           COALESCE(SUM(CASE WHEN status = 'delivered' AND delivery_fee = 0 THEN 1 ELSE 0 END), 0)::int AS free_shipping_count,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(courier_payout, delivery_fee * 0.7) ELSE 0 END), 0)::float AS courier_payouts_est,
           COALESCE(SUM(CASE WHEN cod_collected_at IS NOT NULL THEN COALESCE(cod_amount, 0) ELSE 0 END), 0)::float AS cod_collected,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(distance_km, 0) ELSE 0 END), 0)::float AS km_delivered,
           COALESCE(AVG(CASE WHEN status = 'delivered' THEN distance_km END), 0)::float AS avg_km,
           0::int AS fraud_flagged
         FROM mob_deliveries
         WHERE owner_user_id = ? AND brand_id = ?
           AND DATE(created_at) >= ?
           AND DATE(created_at) <= ?`,
        [ownerUserId, brandId, fromStr, toStr]
      )
    );

    const dayRows =
      (await query<any[]>(
        `SELECT
           created_at::date AS day,
           COUNT(*)::int AS total,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::int AS delivered,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancelled,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0)::float AS fees,
           COALESCE(SUM(CASE WHEN cod_collected_at IS NOT NULL THEN COALESCE(cod_amount, 0) ELSE 0 END), 0)::float AS cod,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(distance_km, 0) ELSE 0 END), 0)::float AS km
         FROM mob_deliveries
         WHERE owner_user_id = ? AND brand_id = ?
           AND created_at::date >= ?::date
           AND created_at::date <= ?::date
         GROUP BY created_at::date
         ORDER BY day DESC`,
        [ownerUserId, brandId, fromStr, toStr]
      ).catch(() =>
        query<any[]>(
          `SELECT
             DATE(created_at) AS day,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
             SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
             COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0) AS fees,
             COALESCE(SUM(CASE WHEN cod_collected_at IS NOT NULL THEN COALESCE(cod_amount, 0) ELSE 0 END), 0) AS cod,
             COALESCE(SUM(CASE WHEN status = 'delivered' THEN COALESCE(distance_km, 0) ELSE 0 END), 0) AS km
           FROM mob_deliveries
           WHERE owner_user_id = ? AND brand_id = ?
             AND DATE(created_at) >= ?
             AND DATE(created_at) <= ?
           GROUP BY DATE(created_at)
           ORDER BY day DESC`,
          [ownerUserId, brandId, fromStr, toStr]
        )
      )) || [];

    const byCourier =
      (await query<any[]>(
        `SELECT
           d.courier_id,
           c.full_name,
           COUNT(*)::int AS delivered,
           COALESCE(SUM(d.delivery_fee), 0)::float AS fees,
           COALESCE(SUM(COALESCE(d.courier_payout, d.delivery_fee * 0.7)), 0)::float AS payout_est,
           COALESCE(SUM(COALESCE(d.distance_km, 0)), 0)::float AS km,
           COALESCE(SUM(CASE WHEN d.cod_collected_at IS NOT NULL THEN COALESCE(d.cod_amount, 0) ELSE 0 END), 0)::float AS cod
         FROM mob_deliveries d
         LEFT JOIN mob_couriers c ON c.id = d.courier_id
         WHERE d.owner_user_id = ? AND d.brand_id = ?
           AND d.status = 'delivered'
           AND d.created_at::date >= ?::date
           AND d.created_at::date <= ?::date
           AND d.courier_id IS NOT NULL
         GROUP BY d.courier_id, c.full_name
         ORDER BY delivered DESC
         LIMIT 50`,
        [ownerUserId, brandId, fromStr, toStr]
      ).catch(() => [])) || [];

    const t = totals || {};
    const fees = num(t.fees_collected);
    const payouts = num(t.courier_payouts_est);
    return {
      range: { from: fromStr, to: toStr },
      totals: {
        ...t,
        fees_collected: fees,
        courier_payouts_est: payouts,
        margin_est: Math.round((fees - payouts) * 100) / 100,
        cod_collected: num(t.cod_collected),
        km_delivered: num(t.km_delivered),
        avg_km: num(t.avg_km),
      },
      days: dayRows.map((r) => ({
        day: r.day,
        total: num(r.total),
        delivered: num(r.delivered),
        cancelled: num(r.cancelled),
        fees: num(r.fees),
        cod: num(r.cod),
        km: num(r.km),
      })),
      by_courier: byCourier.map((r) => ({
        courier_id: r.courier_id,
        full_name: r.full_name || "—",
        delivered: num(r.delivered),
        fees: num(r.fees),
        payout_est: num(r.payout_est),
        km: num(r.km),
        cod: num(r.cod),
      })),
    };
  }

  /**
   * LGPD: purge GPS trail points older than each org's retention window.
   * Brands with gps_retention_days = 0 skip brand purge (global safety max still applies).
   * Also invalidates public tracking tokens past tracking_expires_at.
   */
  async purgeExpiredLocationData(): Promise<{
    location_points_deleted: number;
    tracking_tokens_expired: number;
  }> {
    await this.ensureSchema();
    let location_points_deleted = 0;
    let tracking_tokens_expired = 0;

    // Safety ceiling: never keep points older than 90 days
    try {
      const r = await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM mob_location_points
         WHERE recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [90]
      ).catch(() => null);
      const dead = num(r?.c);
      if (dead > 0) {
        await query(
          `DELETE FROM mob_location_points
           WHERE recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [90]
        ).catch(() => undefined);
        location_points_deleted += dead;
      }
    } catch {
      /* ignore */
    }

    const brands =
      (await query<any[]>(
        `SELECT brand_id, owner_user_id, COALESCE(gps_retention_days, 30)::int AS days
         FROM mob_settings WHERE COALESCE(gps_retention_days, 30) > 0`
      ).catch(() => [])) || [];

    for (const b of brands) {
      const days = Math.max(1, Math.min(num(b.days, 30), 365));
      try {
        const before = await queryOne<any>(
          `SELECT COUNT(*)::int AS c FROM mob_location_points
           WHERE brand_id = ? AND recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [b.brand_id, days]
        ).catch(() => null);
        const c = num(before?.c);
        if (c > 0) {
          await query(
            `DELETE FROM mob_location_points
             WHERE brand_id = ? AND recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [b.brand_id, days]
          ).catch(() => undefined);
          location_points_deleted += c;
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const exp = await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM mob_deliveries
         WHERE tracking_expires_at IS NOT NULL AND tracking_expires_at < NOW()
           AND tracking_token NOT LIKE 'exp:%'`
      ).catch(() => null);
      tracking_tokens_expired = num(exp?.c);
      if (tracking_tokens_expired > 0) {
        await query(
          `UPDATE mob_deliveries
           SET tracking_token = CONCAT('exp:', LEFT(tracking_token, 48)),
               updated_at = NOW()
           WHERE tracking_expires_at IS NOT NULL AND tracking_expires_at < NOW()
             AND tracking_token NOT LIKE 'exp:%'`
        ).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }

    if (location_points_deleted || tracking_tokens_expired) {
      logger.info(
        { location_points_deleted, tracking_tokens_expired },
        "Mob LGPD purge"
      );
    }
    return { location_points_deleted, tracking_tokens_expired };
  }

  /* ── Multi-stop routes ── */

  /**
   * Nearest-neighbor optimization of stops starting from origin.
   * Each delivery contributes pickup then dropoff (if not yet picked up).
   */
  optimizeStopsOrder(
    stops: Array<{
      delivery_id: string;
      stop_type: "pickup" | "dropoff";
      lat: number | null;
      lng: number | null;
      address?: string | null;
      label?: string | null;
      status?: string;
    }>,
    origin?: { lat: number; lng: number } | null
  ): { ordered: typeof stops; total_distance_km: number } {
    const pending = stops.filter((s) => s.status !== "completed" && s.status !== "skipped");
    const done = stops.filter((s) => s.status === "completed" || s.status === "skipped");
    const remaining = [...pending];
    const ordered: typeof stops = [...done];
    let curLat = origin?.lat ?? remaining.find((s) => s.lat != null)?.lat ?? 0;
    let curLng = origin?.lng ?? remaining.find((s) => s.lng != null)?.lng ?? 0;
    let total = 0;

    // Respect pickup-before-dropoff for same delivery
    const droppedPickup = new Set(
      done.filter((s) => s.stop_type === "pickup").map((s) => s.delivery_id)
    );

    while (remaining.length) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        if (s.stop_type === "dropoff" && !droppedPickup.has(s.delivery_id)) {
          // need pickup first unless already done earlier
          const needPickup = remaining.some(
            (x) => x.delivery_id === s.delivery_id && x.stop_type === "pickup"
          );
          if (needPickup) continue;
        }
        if (s.lat == null || s.lng == null) {
          if (bestIdx < 0) bestIdx = i;
          continue;
        }
        const d = haversineKm(curLat, curLng, s.lat, s.lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) bestIdx = 0;
      const next = remaining.splice(bestIdx, 1)[0];
      if (next.lat != null && next.lng != null && Number.isFinite(bestDist) && bestDist < Infinity) {
        total += bestDist;
        curLat = next.lat;
        curLng = next.lng;
      }
      if (next.stop_type === "pickup") droppedPickup.add(next.delivery_id);
      ordered.push(next);
    }

    return {
      ordered: ordered.map((s, i) => ({ ...s, stop_order: i })),
      total_distance_km: Math.round(total * 100) / 100,
    };
  }

  async buildStopsFromDeliveries(
    deliveries: MobDelivery[],
    opts?: { includeCompletedPickups?: boolean }
  ) {
    const stops: Array<{
      delivery_id: string;
      stop_type: "pickup" | "dropoff";
      lat: number | null;
      lng: number | null;
      address?: string | null;
      label?: string | null;
      status?: string;
    }> = [];

    for (const d of deliveries) {
      const picked =
        ["picked_up", "en_route", "near_destination", "at_destination", "delivered"].includes(
          d.status
        ) || !!d.picked_up_at;

      if (!picked || opts?.includeCompletedPickups) {
        if (!picked) {
          stops.push({
            delivery_id: d.id,
            stop_type: "pickup",
            lat: d.pickup_lat,
            lng: d.pickup_lng,
            address: d.pickup_address,
            label: `Coleta · ${d.customer_name || d.id.slice(0, 6)}`,
            status: "pending",
          });
        }
      }
      if (d.status !== "delivered" && d.status !== "cancelled") {
        stops.push({
          delivery_id: d.id,
          stop_type: "dropoff",
          lat: d.dropoff_lat,
          lng: d.dropoff_lng,
          address: d.dropoff_address,
          label: `Entrega · ${d.customer_name || d.id.slice(0, 6)}`,
          status: "pending",
        });
      }
    }
    return stops;
  }

  async createOrUpdateRoute(input: {
    ownerUserId: string;
    brandId: string;
    courierId: string;
    deliveryIds: string[];
    origin?: { lat: number; lng: number } | null;
    activate?: boolean;
    weights?: {
      distance?: number;
      time?: number;
      cost?: number;
      punctuality?: number;
      urgency?: number;
    };
  }): Promise<any> {
    await this.ensureSchema();
    if (!input.deliveryIds.length) throw new Error("Informe ao menos uma entrega");

    const deliveries: MobDelivery[] = [];
    for (const id of input.deliveryIds) {
      const d = await this.getDeliveryById(id);
      if (!d) throw new Error(`Entrega ${id} não encontrada`);
      if (d.owner_user_id !== input.ownerUserId || d.brand_id !== input.brandId) {
        throw new Error("Entrega de outra organização");
      }
      deliveries.push(d);
    }

    // Prefer courier's last location as origin
    let origin = input.origin || null;
    if (!origin) {
      const c = await this.getCourierById(input.courierId);
      if (c?.last_lat != null && c?.last_lng != null) {
        origin = { lat: c.last_lat, lng: c.last_lng };
      } else if (deliveries[0]?.pickup_lat != null && deliveries[0]?.pickup_lng != null) {
        origin = { lat: deliveries[0].pickup_lat!, lng: deliveries[0].pickup_lng! };
      }
    }

    // Multi-objective routing engine (distance/time/cost/punctuality/urgency)
    const { mobRoutingService } = await import("./mobRouting");
    const plan = await mobRoutingService.planForDeliveries({
      deliveries,
      origin,
      weights: (input as any).weights,
    });
    const ordered = plan.ordered;
    const total_distance_km = plan.total_distance_km;

    // Close previous active routes for this courier in brand
    await update(
      `UPDATE mob_routes SET status = 'cancelled', updated_at = NOW()
       WHERE courier_id = ? AND brand_id = ? AND status IN ('planning','active')`,
      [input.courierId, input.brandId]
    ).catch(() => undefined);

    const routeId = randomUUID();
    const status = input.activate === false ? "planning" : "active";
    await insert(
      `INSERT INTO mob_routes (
        id, owner_user_id, brand_id, courier_id, status, total_distance_km, total_stops,
        optimized_json, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status === "active" ? "NOW()" : "NULL"})`,
      [
        routeId,
        input.ownerUserId,
        input.brandId,
        input.courierId,
        status,
        total_distance_km,
        ordered.length,
        JSON.stringify({
          origin,
          algorithm: plan.algorithm,
          weights: plan.weights,
          total_time_minutes: plan.total_time_minutes,
          total_cost_est: plan.total_cost_est,
          metrics_by_stop: plan.metrics_by_stop,
          reasons: plan.reasons,
        }),
      ]
    );

    let order = 0;
    for (const s of ordered) {
      await insert(
        `INSERT INTO mob_route_stops (
          id, route_id, delivery_id, stop_order, stop_type, status, lat, lng, address, label
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          randomUUID(),
          routeId,
          s.delivery_id,
          order++,
          s.stop_type,
          s.lat,
          s.lng,
          s.address || null,
          s.label || null,
        ]
      );
    }

    for (let i = 0; i < deliveries.length; i++) {
      await update(
        `UPDATE mob_deliveries SET route_id = ?, route_stop_order = ?, updated_at = NOW() WHERE id = ?`,
        [routeId, i, deliveries[i].id]
      ).catch(() => undefined);
      if (!deliveries[i].courier_id) {
        try {
          await this.assignCourier({
            deliveryId: deliveries[i].id,
            courierId: input.courierId,
            ownerUserId: input.ownerUserId,
            brandId: input.brandId,
            direct: true,
          });
        } catch {
          /* may already be assigned */
        }
      }
    }

    return this.getRouteById(routeId);
  }

  async getRouteById(routeId: string): Promise<any | null> {
    await this.ensureSchema();
    const route = await queryOne<any>(`SELECT * FROM mob_routes WHERE id = ? LIMIT 1`, [routeId]);
    if (!route) return null;
    const stops = await query<any[]>(
      `SELECT s.*, d.customer_name, d.status AS delivery_status, d.delivery_pin, d.pickup_code
       FROM mob_route_stops s
       LEFT JOIN mob_deliveries d ON d.id = s.delivery_id
       WHERE s.route_id = ?
       ORDER BY s.stop_order ASC`,
      [routeId]
    );
    return {
      ...route,
      optimized_json: parseJson(route.optimized_json, null),
      total_distance_km: route.total_distance_km != null ? num(route.total_distance_km) : null,
      stops: stops || [],
    };
  }

  async getActiveRouteForCourier(courierId: string): Promise<any | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT id FROM mob_routes
       WHERE courier_id = ? AND status IN ('planning','active')
       ORDER BY updated_at DESC LIMIT 1`,
      [courierId]
    );
    if (!row) return null;
    return this.getRouteById(String(row.id));
  }

  /** Auto-build multi-stop route from all active deliveries of a courier */
  async optimizeCourierActiveRoute(courierId: string): Promise<any | null> {
    await this.ensureSchema();
    const active = await this.listDeliveriesForCourier(courierId, { activeOnly: true });
    if (active.length < 1) return null;
    const first = active[0];
    return this.createOrUpdateRoute({
      ownerUserId: first.owner_user_id,
      brandId: first.brand_id,
      courierId,
      deliveryIds: active.map((d) => d.id),
      activate: true,
    });
  }

  async completeRouteStop(input: {
    routeId: string;
    stopId: string;
    courierId: string;
  }): Promise<any> {
    await this.ensureSchema();
    const route = await this.getRouteById(input.routeId);
    if (!route || route.courier_id !== input.courierId) {
      throw new Error("Rota não encontrada");
    }
    const stop = (route.stops || []).find((s: any) => s.id === input.stopId);
    if (!stop) throw new Error("Parada não encontrada");

    await update(
      `UPDATE mob_route_stops SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [input.stopId]
    );

    // Advance delivery status lightly based on stop type
    try {
      if (stop.stop_type === "pickup") {
        const d = await this.getDeliveryById(stop.delivery_id);
        if (d && ["accepted_by_courier", "courier_to_pickup", "courier_at_pickup"].includes(d.status)) {
          await this.transitionStatus({
            deliveryId: d.id,
            toStatus: d.status === "accepted_by_courier" ? "courier_to_pickup" : "picked_up",
            actorType: "courier",
            courierId: input.courierId,
            source: "route_stop",
            note: "Parada de coleta concluída na rota",
          }).catch(async () => {
            if (d.status !== "picked_up") {
              await this.transitionStatus({
                deliveryId: d.id,
                toStatus: "picked_up",
                actorType: "courier",
                courierId: input.courierId,
                source: "route_stop",
              }).catch(() => undefined);
            }
          });
        }
      }
    } catch {
      /* non-blocking */
    }

    const remaining = await queryOne<any>(
      `SELECT COUNT(*)::int AS n FROM mob_route_stops
       WHERE route_id = ? AND status = 'pending'`,
      [input.routeId]
    );
    if (!num(remaining?.n)) {
      await update(
        `UPDATE mob_routes SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [input.routeId]
      );
    } else if (route.status === "planning") {
      await update(
        `UPDATE mob_routes SET status = 'active', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = ?`,
        [input.routeId]
      );
    }

    return this.getRouteById(input.routeId);
  }

  async listRoutesForOrg(ownerUserId: string, brandId: string, limit = 30): Promise<any[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT r.*, c.full_name AS courier_name
       FROM mob_routes r
       LEFT JOIN mob_couriers c ON c.id = r.courier_id
       WHERE r.owner_user_id = ? AND r.brand_id = ?
       ORDER BY r.created_at DESC
       LIMIT ${Math.min(limit, 100)}`,
      [ownerUserId, brandId]
    );
    return rows || [];
  }
}

export const mobLogisticsService = new MobLogisticsService();
export { canTransition, STATUS_TRANSITIONS };
