/**
 * Lead Capture Mob — fleet domain.
 * Vehicle types catalog, org vehicles, documents, delivery↔vehicle compatibility.
 * Independent lifecycle from deliveries/couriers (spec §1–5).
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

/* ── Types ── */

export type VehicleOwnership = "own" | "rented" | "third_party";

export type VehicleOpsStatus =
  | "pending_approval"
  | "available"
  | "in_use"
  | "maintenance"
  | "blocked"
  | "docs_expired"
  | "inactive"
  | "temporarily_unavailable";

export type VehicleDocStatus = "pending" | "approved" | "rejected" | "expired";

export type MaintenanceKind =
  | "preventive"
  | "corrective"
  | "emergency"
  | "periodic"
  | "oil"
  | "tires"
  | "brakes"
  | "electrical"
  | "refrigeration"
  | "cleaning"
  | "safety_inspection"
  | "other";

export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "overdue";

export type MobVehicleMaintenance = {
  id: string;
  vehicle_id: string;
  owner_user_id: string;
  brand_id: string;
  kind: MaintenanceKind;
  status: MaintenanceStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  odometer_km: number | null;
  workshop: string | null;
  description: string | null;
  parts_replaced: string | null;
  cost: number | null;
  invoice_url: string | null;
  next_due_at: string | null;
  next_due_odometer: number | null;
  responsible: string | null;
  downtime_hours: number | null;
  blocks_vehicle: boolean;
  created_at?: string;
  updated_at?: string;
  vehicle_label?: string | null;
  vehicle_plate?: string | null;
};

export type MobVehicleType = {
  id: string;
  owner_user_id: string | null;
  brand_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  max_distance_km: number | null;
  avg_speed_kmh: number | null;
  max_concurrent_orders: number;
  cost_per_km: number | null;
  requires_cnh: boolean;
  cnh_category: string | null;
  allows_refrigerated: boolean;
  allows_fragile: boolean;
  allows_food: boolean;
  allows_high_value: boolean;
  allows_multi_stop: boolean;
  rain_ok: boolean;
  intercity_ok: boolean;
  is_system: boolean;
  active: boolean;
  sort_order: number;
};

export type MobVehicle = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  vehicle_type_id: string;
  courier_id: string | null;
  label: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  plate: string | null;
  renavam: string | null;
  chassi: string | null;
  capacity_kg: number | null;
  capacity_m3: number | null;
  max_volumes: number | null;
  fuel_type: string | null;
  avg_consumption: number | null;
  autonomy_km: number | null;
  odometer_km: number | null;
  ownership: VehicleOwnership;
  has_trunk: boolean;
  has_refrigeration: boolean;
  has_tracker: boolean;
  has_insurance: boolean;
  status: VehicleOpsStatus;
  photos_json: any;
  notes: string | null;
  metadata_json: any;
  created_at?: string;
  updated_at?: string;
  /** joined */
  type?: MobVehicleType | null;
  courier_name?: string | null;
};

export type MobVehicleDocument = {
  id: string;
  vehicle_id: string;
  owner_user_id: string;
  brand_id: string;
  doc_type: string;
  doc_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  file_url: string | null;
  status: VehicleDocStatus;
  validated_by: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  created_at?: string;
};

export type DeliveryCargoProfile = {
  weight_kg?: number | null;
  volume_m3?: number | null;
  package_count?: number | null;
  requires_refrigeration?: boolean;
  is_fragile?: boolean;
  is_food?: boolean;
  high_value?: boolean;
  distance_km?: number | null;
  multi_stop?: boolean;
};

export type CompatibilityResult = {
  ok: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
};

const SYSTEM_TYPES: Array<
  Omit<MobVehicleType, "id" | "owner_user_id" | "brand_id" | "is_system" | "active"> & {
    slug: string;
  }
> = [
  {
    slug: "on_foot",
    name: "A pé",
    description: "Corrida a pé / caminhando",
    icon: "footprints",
    category: "light",
    max_weight_kg: 8,
    max_volume_m3: 0.05,
    max_distance_km: 3,
    avg_speed_kmh: 5,
    max_concurrent_orders: 2,
    cost_per_km: 0.5,
    requires_cnh: false,
    cnh_category: null,
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: false,
    allows_multi_stop: true,
    rain_ok: false,
    intercity_ok: false,
    sort_order: 10,
  },
  {
    slug: "bicycle",
    name: "Bicicleta",
    description: "Bicicleta convencional",
    icon: "bike",
    category: "light",
    max_weight_kg: 20,
    max_volume_m3: 0.12,
    max_distance_km: 12,
    avg_speed_kmh: 15,
    max_concurrent_orders: 3,
    cost_per_km: 0.8,
    requires_cnh: false,
    cnh_category: null,
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: false,
    allows_multi_stop: true,
    rain_ok: false,
    intercity_ok: false,
    sort_order: 20,
  },
  {
    slug: "ebike",
    name: "Bicicleta elétrica",
    description: "Bike com assistência elétrica",
    icon: "bike",
    category: "light",
    max_weight_kg: 25,
    max_volume_m3: 0.15,
    max_distance_km: 25,
    avg_speed_kmh: 22,
    max_concurrent_orders: 4,
    cost_per_km: 1,
    requires_cnh: false,
    cnh_category: null,
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: false,
    allows_multi_stop: true,
    rain_ok: false,
    intercity_ok: false,
    sort_order: 25,
  },
  {
    slug: "motorcycle",
    name: "Motocicleta",
    description: "Moto / scooter com baú",
    icon: "motorbike",
    category: "standard",
    max_weight_kg: 40,
    max_volume_m3: 0.25,
    max_distance_km: 80,
    avg_speed_kmh: 35,
    max_concurrent_orders: 5,
    cost_per_km: 1.5,
    requires_cnh: true,
    cnh_category: "A",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 30,
  },
  {
    slug: "tricycle",
    name: "Triciclo",
    description: "Triciclo de carga",
    icon: "truck",
    category: "standard",
    max_weight_kg: 80,
    max_volume_m3: 0.6,
    max_distance_km: 40,
    avg_speed_kmh: 25,
    max_concurrent_orders: 6,
    cost_per_km: 1.8,
    requires_cnh: true,
    cnh_category: "A",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: false,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: false,
    sort_order: 35,
  },
  {
    slug: "car",
    name: "Carro",
    description: "Automóvel de passeio",
    icon: "car",
    category: "standard",
    max_weight_kg: 150,
    max_volume_m3: 0.8,
    max_distance_km: 150,
    avg_speed_kmh: 40,
    max_concurrent_orders: 8,
    cost_per_km: 2.5,
    requires_cnh: true,
    cnh_category: "B",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 40,
  },
  {
    slug: "light_utility",
    name: "Utilitário leve",
    description: "Fiorino / similar",
    icon: "van",
    category: "cargo",
    max_weight_kg: 500,
    max_volume_m3: 3,
    max_distance_km: 200,
    avg_speed_kmh: 40,
    max_concurrent_orders: 12,
    cost_per_km: 3.2,
    requires_cnh: true,
    cnh_category: "B",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 50,
  },
  {
    slug: "van",
    name: "Van",
    description: "Van de carga",
    icon: "van",
    category: "cargo",
    max_weight_kg: 1200,
    max_volume_m3: 8,
    max_distance_km: 300,
    avg_speed_kmh: 45,
    max_concurrent_orders: 20,
    cost_per_km: 4,
    requires_cnh: true,
    cnh_category: "B",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 55,
  },
  {
    slug: "pickup",
    name: "Caminhonete",
    description: "Pickup / caçamba",
    icon: "truck",
    category: "cargo",
    max_weight_kg: 1000,
    max_volume_m3: 4,
    max_distance_km: 400,
    avg_speed_kmh: 50,
    max_concurrent_orders: 10,
    cost_per_km: 4.5,
    requires_cnh: true,
    cnh_category: "B",
    allows_refrigerated: false,
    allows_fragile: false,
    allows_food: false,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 60,
  },
  {
    slug: "small_truck",
    name: "Caminhão pequeno",
    description: "3/4 ou similar",
    icon: "truck",
    category: "heavy",
    max_weight_kg: 3500,
    max_volume_m3: 20,
    max_distance_km: 500,
    avg_speed_kmh: 50,
    max_concurrent_orders: 30,
    cost_per_km: 6,
    requires_cnh: true,
    cnh_category: "C",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 70,
  },
  {
    slug: "medium_truck",
    name: "Caminhão médio",
    description: "Carga média",
    icon: "truck",
    category: "heavy",
    max_weight_kg: 8000,
    max_volume_m3: 40,
    max_distance_km: 800,
    avg_speed_kmh: 55,
    max_concurrent_orders: 40,
    cost_per_km: 8,
    requires_cnh: true,
    cnh_category: "C",
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 75,
  },
  {
    slug: "reefer_truck",
    name: "Caminhão refrigerado",
    description: "Carga refrigerada / congelada",
    icon: "snowflake",
    category: "special",
    max_weight_kg: 5000,
    max_volume_m3: 25,
    max_distance_km: 600,
    avg_speed_kmh: 50,
    max_concurrent_orders: 25,
    cost_per_km: 10,
    requires_cnh: true,
    cnh_category: "C",
    allows_refrigerated: true,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 80,
  },
  {
    slug: "third_party",
    name: "Veículo terceirizado",
    description: "Frota de parceiro / terceirizado",
    icon: "users",
    category: "partner",
    max_weight_kg: null,
    max_volume_m3: null,
    max_distance_km: null,
    avg_speed_kmh: 40,
    max_concurrent_orders: 15,
    cost_per_km: null,
    requires_cnh: true,
    cnh_category: null,
    allows_refrigerated: true,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: true,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: true,
    sort_order: 90,
  },
  {
    slug: "custom",
    name: "Outro / personalizado",
    description: "Tipo configurável pela organização",
    icon: "box",
    category: "custom",
    max_weight_kg: null,
    max_volume_m3: null,
    max_distance_km: null,
    avg_speed_kmh: null,
    max_concurrent_orders: 5,
    cost_per_km: null,
    requires_cnh: false,
    cnh_category: null,
    allows_refrigerated: false,
    allows_fragile: true,
    allows_food: true,
    allows_high_value: false,
    allows_multi_stop: true,
    rain_ok: true,
    intercity_ok: false,
    sort_order: 100,
  },
];

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

function mapType(row: any): MobVehicleType {
  return {
    id: String(row.id),
    owner_user_id: row.owner_user_id || null,
    brand_id: row.brand_id || null,
    slug: String(row.slug),
    name: String(row.name),
    description: row.description || null,
    icon: String(row.icon || "truck"),
    category: String(row.category || "standard"),
    max_weight_kg: row.max_weight_kg != null ? num(row.max_weight_kg) : null,
    max_volume_m3: row.max_volume_m3 != null ? num(row.max_volume_m3) : null,
    max_distance_km: row.max_distance_km != null ? num(row.max_distance_km) : null,
    avg_speed_kmh: row.avg_speed_kmh != null ? num(row.avg_speed_kmh) : null,
    max_concurrent_orders: num(row.max_concurrent_orders, 3),
    cost_per_km: row.cost_per_km != null ? num(row.cost_per_km) : null,
    requires_cnh: !!row.requires_cnh,
    cnh_category: row.cnh_category || null,
    allows_refrigerated: !!row.allows_refrigerated,
    allows_fragile: row.allows_fragile !== false,
    allows_food: row.allows_food !== false,
    allows_high_value: !!row.allows_high_value,
    allows_multi_stop: row.allows_multi_stop !== false,
    rain_ok: row.rain_ok !== false,
    intercity_ok: !!row.intercity_ok,
    is_system: !!row.is_system,
    active: row.active !== false,
    sort_order: num(row.sort_order, 50),
  };
}

function mapVehicle(row: any): MobVehicle {
  return {
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    brand_id: String(row.brand_id),
    vehicle_type_id: String(row.vehicle_type_id),
    courier_id: row.courier_id || null,
    label: row.label || null,
    make: row.make || null,
    model: row.model || null,
    year: row.year != null ? num(row.year) : null,
    color: row.color || null,
    plate: row.plate || null,
    renavam: row.renavam || null,
    chassi: row.chassi || null,
    capacity_kg: row.capacity_kg != null ? num(row.capacity_kg) : null,
    capacity_m3: row.capacity_m3 != null ? num(row.capacity_m3) : null,
    max_volumes: row.max_volumes != null ? num(row.max_volumes) : null,
    fuel_type: row.fuel_type || null,
    avg_consumption: row.avg_consumption != null ? num(row.avg_consumption) : null,
    autonomy_km: row.autonomy_km != null ? num(row.autonomy_km) : null,
    odometer_km: row.odometer_km != null ? num(row.odometer_km) : null,
    ownership: (row.ownership || "own") as VehicleOwnership,
    has_trunk: !!row.has_trunk,
    has_refrigeration: !!row.has_refrigeration,
    has_tracker: !!row.has_tracker,
    has_insurance: !!row.has_insurance,
    status: (row.status || "available") as VehicleOpsStatus,
    photos_json: parseJson(row.photos_json, {}),
    notes: row.notes || null,
    metadata_json: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    courier_name: row.courier_name || null,
  };
}

function mapDoc(row: any): MobVehicleDocument {
  return {
    id: String(row.id),
    vehicle_id: String(row.vehicle_id),
    owner_user_id: String(row.owner_user_id),
    brand_id: String(row.brand_id),
    doc_type: String(row.doc_type),
    doc_number: row.doc_number || null,
    issued_at: row.issued_at || null,
    expires_at: row.expires_at || null,
    file_url: row.file_url || null,
    status: (row.status || "pending") as VehicleDocStatus,
    validated_by: row.validated_by || null,
    validated_at: row.validated_at || null,
    rejection_reason: row.rejection_reason || null,
    created_at: row.created_at,
  };
}

function mapMaintenance(row: any): MobVehicleMaintenance {
  return {
    id: String(row.id),
    vehicle_id: String(row.vehicle_id),
    owner_user_id: String(row.owner_user_id),
    brand_id: String(row.brand_id),
    kind: (row.kind || "other") as MaintenanceKind,
    status: (row.status || "scheduled") as MaintenanceStatus,
    scheduled_at: row.scheduled_at || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    odometer_km: row.odometer_km != null ? num(row.odometer_km) : null,
    workshop: row.workshop || null,
    description: row.description || null,
    parts_replaced: row.parts_replaced || null,
    cost: row.cost != null ? num(row.cost) : null,
    invoice_url: row.invoice_url || null,
    next_due_at: row.next_due_at || null,
    next_due_odometer: row.next_due_odometer != null ? num(row.next_due_odometer) : null,
    responsible: row.responsible || null,
    downtime_hours: row.downtime_hours != null ? num(row.downtime_hours) : null,
    blocks_vehicle: row.blocks_vehicle !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vehicle_label: row.vehicle_label || null,
    vehicle_plate: row.vehicle_plate || null,
  };
}

async function ensureFleetSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS mob_vehicle_types (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NULL,
        brand_id VARCHAR(36) NULL,
        slug VARCHAR(64) NOT NULL,
        name VARCHAR(120) NOT NULL,
        description TEXT NULL,
        icon VARCHAR(40) NOT NULL DEFAULT 'truck',
        category VARCHAR(40) NOT NULL DEFAULT 'standard',
        max_weight_kg DOUBLE PRECISION NULL,
        max_volume_m3 DOUBLE PRECISION NULL,
        max_distance_km DOUBLE PRECISION NULL,
        avg_speed_kmh DOUBLE PRECISION NULL,
        max_concurrent_orders INT NOT NULL DEFAULT 3,
        cost_per_km DOUBLE PRECISION NULL,
        requires_cnh BOOLEAN NOT NULL DEFAULT FALSE,
        cnh_category VARCHAR(8) NULL,
        allows_refrigerated BOOLEAN NOT NULL DEFAULT FALSE,
        allows_fragile BOOLEAN NOT NULL DEFAULT TRUE,
        allows_food BOOLEAN NOT NULL DEFAULT TRUE,
        allows_high_value BOOLEAN NOT NULL DEFAULT FALSE,
        allows_multi_stop BOOLEAN NOT NULL DEFAULT TRUE,
        rain_ok BOOLEAN NOT NULL DEFAULT TRUE,
        intercity_ok BOOLEAN NOT NULL DEFAULT FALSE,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_vehicles (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        vehicle_type_id VARCHAR(36) NOT NULL,
        courier_id VARCHAR(36) NULL,
        label VARCHAR(120) NULL,
        make VARCHAR(80) NULL,
        model VARCHAR(80) NULL,
        year INT NULL,
        color VARCHAR(40) NULL,
        plate VARCHAR(20) NULL,
        renavam VARCHAR(40) NULL,
        chassi VARCHAR(40) NULL,
        capacity_kg DOUBLE PRECISION NULL,
        capacity_m3 DOUBLE PRECISION NULL,
        max_volumes INT NULL,
        fuel_type VARCHAR(40) NULL,
        avg_consumption DOUBLE PRECISION NULL,
        autonomy_km DOUBLE PRECISION NULL,
        odometer_km DOUBLE PRECISION NULL,
        ownership VARCHAR(24) NOT NULL DEFAULT 'own',
        has_trunk BOOLEAN NOT NULL DEFAULT FALSE,
        has_refrigeration BOOLEAN NOT NULL DEFAULT FALSE,
        has_tracker BOOLEAN NOT NULL DEFAULT FALSE,
        has_insurance BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(40) NOT NULL DEFAULT 'available',
        photos_json JSONB NULL,
        notes TEXT NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_vehicle_documents (
        id VARCHAR(36) PRIMARY KEY,
        vehicle_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        doc_type VARCHAR(64) NOT NULL,
        doc_number VARCHAR(80) NULL,
        issued_at DATE NULL,
        expires_at DATE NULL,
        file_url TEXT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        validated_by VARCHAR(36) NULL,
        validated_at TIMESTAMP NULL,
        rejection_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS mob_vehicle_maintenances (
        id VARCHAR(36) PRIMARY KEY,
        vehicle_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        kind VARCHAR(40) NOT NULL DEFAULT 'preventive',
        status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
        scheduled_at TIMESTAMP NULL,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        odometer_km DOUBLE PRECISION NULL,
        workshop VARCHAR(160) NULL,
        description TEXT NULL,
        parts_replaced TEXT NULL,
        cost DECIMAL(12,2) NULL,
        invoice_url TEXT NULL,
        next_due_at TIMESTAMP NULL,
        next_due_odometer DOUBLE PRECISION NULL,
        responsible VARCHAR(160) NULL,
        downtime_hours DOUBLE PRECISION NULL,
        blocks_vehicle BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_mob_vtype_system_slug ON mob_vehicle_types (slug) WHERE is_system = TRUE`
    ).catch(() => undefined);

    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_vehicles_org ON mob_vehicles (owner_user_id, brand_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_vehicles_courier ON mob_vehicles (courier_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_vdocs_vehicle ON mob_vehicle_documents (vehicle_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_vmaint_vehicle ON mob_vehicle_maintenances (vehicle_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_vmaint_org ON mob_vehicle_maintenances (owner_user_id, brand_id)`
    ).catch(() => undefined);

    // Delivery cargo + vehicle link (on mob_deliveries)
    const deliveryCols: Array<[string, string]> = [
      ["vehicle_id", "VARCHAR(36) NULL"],
      ["weight_kg", "DOUBLE PRECISION NULL"],
      ["volume_m3", "DOUBLE PRECISION NULL"],
      ["package_count", "INT NULL"],
      ["requires_refrigeration", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["is_fragile", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["is_food", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["high_value", "BOOLEAN NOT NULL DEFAULT FALSE"],
      ["route_type", "VARCHAR(32) NULL"],
      ["delivery_window_start", "TIMESTAMP NULL"],
      ["delivery_window_end", "TIMESTAMP NULL"],
    ];
    for (const [col, ddl] of deliveryCols) {
      await query(`ALTER TABLE mob_deliveries ADD COLUMN IF NOT EXISTS ${col} ${ddl}`).catch(
        async () => {
          await query(`ALTER TABLE mob_deliveries ADD COLUMN ${col} ${ddl}`).catch(() => undefined);
        }
      );
    }

    // Seed system types
    for (const t of SYSTEM_TYPES) {
      const existing = await queryOne<any>(
        `SELECT id FROM mob_vehicle_types WHERE is_system = TRUE AND slug = ? LIMIT 1`,
        [t.slug]
      ).catch(() => null);
      if (existing) continue;
      const id = randomUUID();
      await insert(
        `INSERT INTO mob_vehicle_types (
          id, owner_user_id, brand_id, slug, name, description, icon, category,
          max_weight_kg, max_volume_m3, max_distance_km, avg_speed_kmh,
          max_concurrent_orders, cost_per_km, requires_cnh, cnh_category,
          allows_refrigerated, allows_fragile, allows_food, allows_high_value,
          allows_multi_stop, rain_ok, intercity_ok, is_system, active, sort_order
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          null,
          null,
          t.slug,
          t.name,
          t.description,
          t.icon,
          t.category,
          t.max_weight_kg,
          t.max_volume_m3,
          t.max_distance_km,
          t.avg_speed_kmh,
          t.max_concurrent_orders,
          t.cost_per_km,
          t.requires_cnh,
          t.cnh_category,
          t.allows_refrigerated,
          t.allows_fragile,
          t.allows_food,
          t.allows_high_value,
          t.allows_multi_stop,
          t.rain_ok,
          t.intercity_ok,
          true,
          true,
          t.sort_order,
        ]
      ).catch((e: any) => logger.warn({ err: e?.message, slug: t.slug }, "seed vehicle type"));
    }

    schemaReady = true;
    logger.info("Mob fleet schema ready");
  })().finally(() => {
    schemaPromise = null;
  });

  await schemaPromise;
}

export const mobFleetService = {
  async ensureSchema() {
    await ensureFleetSchema();
  },

  /* ── Vehicle types ── */

  async listTypes(ownerUserId: string, brandId: string): Promise<MobVehicleType[]> {
    await ensureFleetSchema();
    const rows =
      (await query<any[]>(
        `SELECT * FROM mob_vehicle_types
         WHERE (is_system = TRUE AND active = TRUE)
            OR (owner_user_id = ? AND brand_id = ?)
         ORDER BY sort_order ASC, name ASC`,
        [ownerUserId, brandId]
      ).catch(() => [])) || [];
    return rows.map(mapType);
  },

  async createOrgType(
    ownerUserId: string,
    brandId: string,
    input: Partial<MobVehicleType> & { name: string; slug?: string }
  ): Promise<MobVehicleType> {
    await ensureFleetSchema();
    const id = randomUUID();
    const slug =
      String(input.slug || input.name)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 48) || `custom_${Date.now().toString(36)}`;

    await insert(
      `INSERT INTO mob_vehicle_types (
        id, owner_user_id, brand_id, slug, name, description, icon, category,
        max_weight_kg, max_volume_m3, max_distance_km, avg_speed_kmh,
        max_concurrent_orders, cost_per_km, requires_cnh, cnh_category,
        allows_refrigerated, allows_fragile, allows_food, allows_high_value,
        allows_multi_stop, rain_ok, intercity_ok, is_system, active, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        ownerUserId,
        brandId,
        slug,
        input.name,
        input.description || null,
        input.icon || "box",
        input.category || "custom",
        input.max_weight_kg ?? null,
        input.max_volume_m3 ?? null,
        input.max_distance_km ?? null,
        input.avg_speed_kmh ?? null,
        num(input.max_concurrent_orders, 5),
        input.cost_per_km ?? null,
        !!input.requires_cnh,
        input.cnh_category || null,
        !!input.allows_refrigerated,
        input.allows_fragile !== false,
        input.allows_food !== false,
        !!input.allows_high_value,
        input.allows_multi_stop !== false,
        input.rain_ok !== false,
        !!input.intercity_ok,
        false,
        input.active !== false,
        num(input.sort_order, 90),
      ]
    );
    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_types WHERE id = ?`, [id]);
    return mapType(row);
  },

  async updateOrgType(
    ownerUserId: string,
    brandId: string,
    typeId: string,
    patch: Partial<MobVehicleType>
  ): Promise<MobVehicleType> {
    await ensureFleetSchema();
    const current = await queryOne<any>(
      `SELECT * FROM mob_vehicle_types WHERE id = ? AND owner_user_id = ? AND brand_id = ? AND is_system = FALSE`,
      [typeId, ownerUserId, brandId]
    );
    if (!current) throw new Error("Tipo de veículo não encontrado ou é do sistema");

    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    if (patch.name !== undefined) set("name", patch.name);
    if (patch.description !== undefined) set("description", patch.description);
    if (patch.icon !== undefined) set("icon", patch.icon);
    if (patch.category !== undefined) set("category", patch.category);
    if (patch.max_weight_kg !== undefined) set("max_weight_kg", patch.max_weight_kg);
    if (patch.max_volume_m3 !== undefined) set("max_volume_m3", patch.max_volume_m3);
    if (patch.max_distance_km !== undefined) set("max_distance_km", patch.max_distance_km);
    if (patch.avg_speed_kmh !== undefined) set("avg_speed_kmh", patch.avg_speed_kmh);
    if (patch.max_concurrent_orders !== undefined)
      set("max_concurrent_orders", num(patch.max_concurrent_orders, 3));
    if (patch.cost_per_km !== undefined) set("cost_per_km", patch.cost_per_km);
    if (patch.requires_cnh !== undefined) set("requires_cnh", !!patch.requires_cnh);
    if (patch.cnh_category !== undefined) set("cnh_category", patch.cnh_category);
    if (patch.allows_refrigerated !== undefined)
      set("allows_refrigerated", !!patch.allows_refrigerated);
    if (patch.allows_fragile !== undefined) set("allows_fragile", !!patch.allows_fragile);
    if (patch.allows_food !== undefined) set("allows_food", !!patch.allows_food);
    if (patch.allows_high_value !== undefined) set("allows_high_value", !!patch.allows_high_value);
    if (patch.allows_multi_stop !== undefined) set("allows_multi_stop", !!patch.allows_multi_stop);
    if (patch.rain_ok !== undefined) set("rain_ok", !!patch.rain_ok);
    if (patch.intercity_ok !== undefined) set("intercity_ok", !!patch.intercity_ok);
    if (patch.active !== undefined) set("active", !!patch.active);
    if (patch.sort_order !== undefined) set("sort_order", num(patch.sort_order, 50));

    if (fields.length) {
      fields.push("updated_at = NOW()");
      params.push(typeId);
      await update(`UPDATE mob_vehicle_types SET ${fields.join(", ")} WHERE id = ?`, params);
    }
    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_types WHERE id = ?`, [typeId]);
    return mapType(row);
  },

  async getType(typeId: string): Promise<MobVehicleType | null> {
    await ensureFleetSchema();
    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_types WHERE id = ?`, [typeId]);
    return row ? mapType(row) : null;
  },

  /* ── Vehicles ── */

  async listVehicles(
    ownerUserId: string,
    brandId: string,
    opts?: { status?: string; courier_id?: string }
  ): Promise<MobVehicle[]> {
    await ensureFleetSchema();
    let sql = `
      SELECT v.*, c.full_name AS courier_name
      FROM mob_vehicles v
      LEFT JOIN mob_couriers c ON c.id = v.courier_id
      WHERE v.owner_user_id = ? AND v.brand_id = ?`;
    const params: any[] = [ownerUserId, brandId];
    if (opts?.status) {
      sql += ` AND v.status = ?`;
      params.push(opts.status);
    }
    if (opts?.courier_id) {
      sql += ` AND v.courier_id = ?`;
      params.push(opts.courier_id);
    }
    sql += ` ORDER BY v.updated_at DESC LIMIT 200`;
    const rows = (await query<any[]>(sql, params).catch(() => [])) || [];
    const types = await this.listTypes(ownerUserId, brandId);
    const typeMap = new Map(types.map((t) => [t.id, t]));
    return rows.map((r) => {
      const v = mapVehicle(r);
      v.type = typeMap.get(v.vehicle_type_id) || null;
      return v;
    });
  },

  async getVehicle(
    ownerUserId: string,
    brandId: string,
    vehicleId: string
  ): Promise<MobVehicle | null> {
    await ensureFleetSchema();
    const row = await queryOne<any>(
      `SELECT v.*, c.full_name AS courier_name
       FROM mob_vehicles v
       LEFT JOIN mob_couriers c ON c.id = v.courier_id
       WHERE v.id = ? AND v.owner_user_id = ? AND v.brand_id = ?`,
      [vehicleId, ownerUserId, brandId]
    );
    if (!row) return null;
    const v = mapVehicle(row);
    v.type = await this.getType(v.vehicle_type_id);
    return v;
  },

  async createVehicle(
    ownerUserId: string,
    brandId: string,
    input: Partial<MobVehicle> & { vehicle_type_id: string }
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const type = await this.getType(input.vehicle_type_id);
    if (!type || !type.active) throw new Error("Tipo de veículo inválido");
    if (!type.is_system && (type.owner_user_id !== ownerUserId || type.brand_id !== brandId)) {
      throw new Error("Tipo de veículo não pertence a esta organização");
    }

    const id = randomUUID();
    const label =
      input.label ||
      [input.make, input.model, input.plate].filter(Boolean).join(" ") ||
      type.name;

    await insert(
      `INSERT INTO mob_vehicles (
        id, owner_user_id, brand_id, vehicle_type_id, courier_id, label,
        make, model, year, color, plate, renavam, chassi,
        capacity_kg, capacity_m3, max_volumes, fuel_type, avg_consumption,
        autonomy_km, odometer_km, ownership, has_trunk, has_refrigeration,
        has_tracker, has_insurance, status, photos_json, notes, metadata_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        ownerUserId,
        brandId,
        input.vehicle_type_id,
        input.courier_id || null,
        label,
        input.make || null,
        input.model || null,
        input.year ?? null,
        input.color || null,
        input.plate || null,
        input.renavam || null,
        input.chassi || null,
        input.capacity_kg ?? type.max_weight_kg,
        input.capacity_m3 ?? type.max_volume_m3,
        input.max_volumes ?? null,
        input.fuel_type || null,
        input.avg_consumption ?? null,
        input.autonomy_km ?? null,
        input.odometer_km ?? null,
        input.ownership || "own",
        !!input.has_trunk,
        !!input.has_refrigeration || type.allows_refrigerated,
        !!input.has_tracker,
        !!input.has_insurance,
        input.status || "available",
        JSON.stringify(input.photos_json || {}),
        input.notes || null,
        JSON.stringify(input.metadata_json || {}),
      ]
    );
    const created = await this.getVehicle(ownerUserId, brandId, id);
    if (!created) throw new Error("Falha ao criar veículo");
    return created;
  },

  async updateVehicle(
    ownerUserId: string,
    brandId: string,
    vehicleId: string,
    patch: Partial<MobVehicle>
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const current = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!current) throw new Error("Veículo não encontrado");

    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    const keys: Array<keyof MobVehicle> = [
      "vehicle_type_id",
      "courier_id",
      "label",
      "make",
      "model",
      "year",
      "color",
      "plate",
      "renavam",
      "chassi",
      "capacity_kg",
      "capacity_m3",
      "max_volumes",
      "fuel_type",
      "avg_consumption",
      "autonomy_km",
      "odometer_km",
      "ownership",
      "has_trunk",
      "has_refrigeration",
      "has_tracker",
      "has_insurance",
      "status",
      "notes",
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) {
        if (k === "has_trunk" || k === "has_refrigeration" || k === "has_tracker" || k === "has_insurance") {
          set(k, !!patch[k]);
        } else {
          set(k, patch[k] as any);
        }
      }
    }
    if (patch.photos_json !== undefined) set("photos_json", JSON.stringify(patch.photos_json));
    if (patch.metadata_json !== undefined)
      set("metadata_json", JSON.stringify(patch.metadata_json));

    if (fields.length) {
      fields.push("updated_at = NOW()");
      params.push(vehicleId);
      await update(`UPDATE mob_vehicles SET ${fields.join(", ")} WHERE id = ?`, params);
    }
    const updated = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!updated) throw new Error("Veículo não encontrado");
    return updated;
  },

  /* ── Documents ── */

  async listDocuments(
    ownerUserId: string,
    brandId: string,
    vehicleId: string
  ): Promise<MobVehicleDocument[]> {
    await ensureFleetSchema();
    const rows =
      (await query<any[]>(
        `SELECT * FROM mob_vehicle_documents
         WHERE vehicle_id = ? AND owner_user_id = ? AND brand_id = ?
         ORDER BY expires_at ASC NULLS LAST, created_at DESC`,
        [vehicleId, ownerUserId, brandId]
      ).catch(() =>
        query<any[]>(
          `SELECT * FROM mob_vehicle_documents
           WHERE vehicle_id = ? AND owner_user_id = ? AND brand_id = ?
           ORDER BY created_at DESC`,
          [vehicleId, ownerUserId, brandId]
        )
      )) || [];
    return rows.map(mapDoc);
  },

  async addDocument(
    ownerUserId: string,
    brandId: string,
    vehicleId: string,
    input: Partial<MobVehicleDocument> & { doc_type: string }
  ): Promise<MobVehicleDocument> {
    await ensureFleetSchema();
    const vehicle = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!vehicle) throw new Error("Veículo não encontrado");

    const id = randomUUID();
    let status: VehicleDocStatus = (input.status as VehicleDocStatus) || "pending";
    if (input.expires_at) {
      const exp = new Date(input.expires_at);
      if (exp.getTime() < Date.now()) status = "expired";
    }

    await insert(
      `INSERT INTO mob_vehicle_documents (
        id, vehicle_id, owner_user_id, brand_id, doc_type, doc_number,
        issued_at, expires_at, file_url, status
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        vehicleId,
        ownerUserId,
        brandId,
        input.doc_type,
        input.doc_number || null,
        input.issued_at || null,
        input.expires_at || null,
        input.file_url || null,
        status,
      ]
    );

    if (status === "expired") {
      await this.updateVehicle(ownerUserId, brandId, vehicleId, {
        status: "docs_expired",
      }).catch(() => undefined);
    }

    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_documents WHERE id = ?`, [id]);
    return mapDoc(row);
  },

  async validateDocument(
    ownerUserId: string,
    brandId: string,
    docId: string,
    input: { status: "approved" | "rejected"; validated_by?: string; rejection_reason?: string }
  ): Promise<MobVehicleDocument> {
    await ensureFleetSchema();
    const doc = await queryOne<any>(
      `SELECT * FROM mob_vehicle_documents WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
      [docId, ownerUserId, brandId]
    );
    if (!doc) throw new Error("Documento não encontrado");

    await update(
      `UPDATE mob_vehicle_documents
       SET status = ?, validated_by = ?, validated_at = NOW(), rejection_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        input.status,
        input.validated_by || null,
        input.status === "rejected" ? input.rejection_reason || "Reprovado" : null,
        docId,
      ]
    );
    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_documents WHERE id = ?`, [docId]);
    return mapDoc(row);
  },

  /** Expire documents past due and optionally block vehicles. */
  async refreshDocumentExpiries(): Promise<{ expired_docs: number; blocked_vehicles: number }> {
    await ensureFleetSchema();
    const expired =
      (await query<any[]>(
        `UPDATE mob_vehicle_documents
         SET status = 'expired', updated_at = NOW()
         WHERE status IN ('pending','approved')
           AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE
         RETURNING id, vehicle_id`
      ).catch(async () => {
        await query(
          `UPDATE mob_vehicle_documents
           SET status = 'expired', updated_at = NOW()
           WHERE status IN ('pending','approved')
             AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE`
        );
        return [];
      })) || [];

    const vehicleIds = [...new Set(expired.map((r: any) => r.vehicle_id).filter(Boolean))];
    let blocked = 0;
    for (const vid of vehicleIds) {
      await update(
        `UPDATE mob_vehicles SET status = 'docs_expired', updated_at = NOW()
         WHERE id = ? AND status IN ('available','in_use','pending_approval')`,
        [vid]
      ).catch(() => undefined);
      blocked += 1;
    }
    return { expired_docs: expired.length || 0, blocked_vehicles: blocked };
  },

  /* ── Compatibility ── */

  /**
   * Explainable vehicle compatibility for a cargo profile (spec §5 + §57).
   */
  evaluateCompatibility(
    vehicle: MobVehicle,
    cargo: DeliveryCargoProfile,
    type?: MobVehicleType | null
  ): CompatibilityResult {
    const t = type || vehicle.type || null;
    const reasons: string[] = [];
    const blockers: string[] = [];
    let score = 100;

    const blockedStatuses: VehicleOpsStatus[] = [
      "blocked",
      "docs_expired",
      "inactive",
      "maintenance",
      "temporarily_unavailable",
      "pending_approval",
    ];
    if (blockedStatuses.includes(vehicle.status)) {
      blockers.push(`Veículo com status "${vehicle.status}" não pode operar`);
      score = 0;
    } else if (vehicle.status === "available") {
      reasons.push("Veículo disponível");
    } else if (vehicle.status === "in_use") {
      reasons.push("Veículo em uso (pode aceitar se capacidade restar)");
      score -= 10;
    }

    const capKg = vehicle.capacity_kg ?? t?.max_weight_kg ?? null;
    if (cargo.weight_kg != null && capKg != null && cargo.weight_kg > capKg) {
      blockers.push(
        `Peso ${cargo.weight_kg} kg excede capacidade ${capKg} kg (${t?.name || "tipo"})`
      );
      score = 0;
    } else if (cargo.weight_kg != null && capKg != null) {
      reasons.push(`Peso ${cargo.weight_kg} kg dentro da capacidade (${capKg} kg)`);
      if (cargo.weight_kg > capKg * 0.85) score -= 8;
    }

    const capVol = vehicle.capacity_m3 ?? t?.max_volume_m3 ?? null;
    if (cargo.volume_m3 != null && capVol != null && cargo.volume_m3 > capVol) {
      blockers.push(`Volume ${cargo.volume_m3} m³ excede capacidade ${capVol} m³`);
      score = 0;
    } else if (cargo.volume_m3 != null && capVol != null) {
      reasons.push(`Volume compatível (${cargo.volume_m3} / ${capVol} m³)`);
    }

    if (
      cargo.package_count != null &&
      vehicle.max_volumes != null &&
      cargo.package_count > vehicle.max_volumes
    ) {
      blockers.push(
        `${cargo.package_count} volumes excedem o máximo de ${vehicle.max_volumes} do veículo`
      );
      score = 0;
    }

    if (cargo.requires_refrigeration) {
      if (!vehicle.has_refrigeration && !t?.allows_refrigerated) {
        blockers.push("Pedido exige refrigeração; veículo/tipo não autorizado");
        score = 0;
      } else {
        reasons.push("Refrigeração disponível");
      }
    }

    if (cargo.is_fragile && t && !t.allows_fragile) {
      blockers.push("Tipo de veículo não autorizado para carga frágil");
      score = 0;
    }

    if (cargo.is_food && t && !t.allows_food) {
      blockers.push("Tipo de veículo não autorizado para alimentos");
      score = 0;
    }

    if (cargo.high_value && t && !t.allows_high_value) {
      blockers.push("Tipo de veículo não autorizado para alto valor");
      score = 0;
    } else if (cargo.high_value && t?.allows_high_value) {
      reasons.push("Autorizado para alto valor");
    }

    if (cargo.multi_stop && t && !t.allows_multi_stop) {
      blockers.push("Tipo de veículo não permite múltiplas paradas");
      score = 0;
    }

    if (
      cargo.distance_km != null &&
      t?.max_distance_km != null &&
      cargo.distance_km > t.max_distance_km
    ) {
      blockers.push(
        `Distância ${cargo.distance_km.toFixed(1)} km acima do máximo recomendado (${t.max_distance_km} km) para ${t.name}`
      );
      score = 0;
    } else if (cargo.distance_km != null && t?.max_distance_km != null) {
      reasons.push(
        `Distância ${cargo.distance_km.toFixed(1)} km adequada para ${t.name} (máx. ${t.max_distance_km} km)`
      );
    }

    if (t) reasons.push(`Tipo: ${t.name}`);
    if (vehicle.plate) reasons.push(`Placa ${vehicle.plate}`);

    const ok = blockers.length === 0 && score > 0;
    return {
      ok,
      score: ok ? Math.max(0, Math.min(100, score)) : 0,
      reasons,
      blockers,
    };
  },

  async checkDeliveryVehicle(
    ownerUserId: string,
    brandId: string,
    vehicleId: string,
    cargo: DeliveryCargoProfile
  ): Promise<CompatibilityResult & { vehicle: MobVehicle | null }> {
    const vehicle = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!vehicle) {
      return {
        ok: false,
        score: 0,
        reasons: [],
        blockers: ["Veículo não encontrado"],
        vehicle: null,
      };
    }
    const result = this.evaluateCompatibility(vehicle, cargo, vehicle.type);
    return { ...result, vehicle };
  },

  /**
   * Rank available vehicles for a cargo profile (explainable).
   */
  async recommendVehicles(
    ownerUserId: string,
    brandId: string,
    cargo: DeliveryCargoProfile,
    limit = 5
  ): Promise<Array<{ vehicle: MobVehicle; compatibility: CompatibilityResult }>> {
    const vehicles = await this.listVehicles(ownerUserId, brandId);
    const ranked = vehicles
      .map((v) => ({
        vehicle: v,
        compatibility: this.evaluateCompatibility(v, cargo, v.type),
      }))
      .filter((r) => r.compatibility.ok)
      .sort((a, b) => b.compatibility.score - a.compatibility.score)
      .slice(0, limit);
    return ranked;
  },

  async fleetSummary(ownerUserId: string, brandId: string) {
    await ensureFleetSchema();
    const vehicles = await this.listVehicles(ownerUserId, brandId);
    const byStatus: Record<string, number> = {};
    for (const v of vehicles) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
    }
    const docsDue =
      (await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM mob_vehicle_documents
         WHERE owner_user_id = ? AND brand_id = ?
           AND status IN ('pending','approved')
           AND expires_at IS NOT NULL
           AND expires_at <= CURRENT_DATE + INTERVAL '30 days'`,
        [ownerUserId, brandId]
      ).catch(() => ({ c: 0 }))) || { c: 0 };

    const maintOpen =
      (await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM mob_vehicle_maintenances
         WHERE owner_user_id = ? AND brand_id = ?
           AND status IN ('scheduled','in_progress','overdue')`,
        [ownerUserId, brandId]
      ).catch(() => ({ c: 0 }))) || { c: 0 };

    const maintDue =
      (await queryOne<any>(
        `SELECT COUNT(*)::int AS c FROM mob_vehicle_maintenances
         WHERE owner_user_id = ? AND brand_id = ?
           AND status IN ('scheduled','overdue')
           AND next_due_at IS NOT NULL
           AND next_due_at <= NOW() + INTERVAL '14 days'`,
        [ownerUserId, brandId]
      ).catch(() => ({ c: 0 }))) || { c: 0 };

    return {
      total: vehicles.length,
      available: byStatus.available || 0,
      in_use: byStatus.in_use || 0,
      maintenance: byStatus.maintenance || 0,
      blocked:
        (byStatus.blocked || 0) +
        (byStatus.docs_expired || 0) +
        (byStatus.inactive || 0),
      by_status: byStatus,
      docs_expiring_30d: num(docsDue.c),
      maintenances_open: num(maintOpen.c),
      maintenances_due_14d: num(maintDue.c),
    };
  },

  /* ── Maintenance ── */

  async listMaintenances(
    ownerUserId: string,
    brandId: string,
    opts?: { vehicle_id?: string; status?: string; limit?: number }
  ): Promise<MobVehicleMaintenance[]> {
    await ensureFleetSchema();
    let sql = `
      SELECT m.*, v.label AS vehicle_label, v.plate AS vehicle_plate
      FROM mob_vehicle_maintenances m
      LEFT JOIN mob_vehicles v ON v.id = m.vehicle_id
      WHERE m.owner_user_id = ? AND m.brand_id = ?`;
    const params: any[] = [ownerUserId, brandId];
    if (opts?.vehicle_id) {
      sql += ` AND m.vehicle_id = ?`;
      params.push(opts.vehicle_id);
    }
    if (opts?.status) {
      sql += ` AND m.status = ?`;
      params.push(opts.status);
    }
    sql += ` ORDER BY
      CASE m.status
        WHEN 'overdue' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'scheduled' THEN 2
        ELSE 3
      END,
      m.scheduled_at ASC NULLS LAST,
      m.created_at DESC
      LIMIT ${Math.min(num(opts?.limit, 100), 200)}`;
    const rows =
      (await query<any[]>(sql, params).catch(() =>
        query<any[]>(
          `SELECT m.*, v.label AS vehicle_label, v.plate AS vehicle_plate
           FROM mob_vehicle_maintenances m
           LEFT JOIN mob_vehicles v ON v.id = m.vehicle_id
           WHERE m.owner_user_id = ? AND m.brand_id = ?
           ORDER BY m.created_at DESC LIMIT 100`,
          [ownerUserId, brandId]
        )
      )) || [];
    return rows.map(mapMaintenance);
  },

  async createMaintenance(
    ownerUserId: string,
    brandId: string,
    input: Partial<MobVehicleMaintenance> & { vehicle_id: string; kind: MaintenanceKind }
  ): Promise<MobVehicleMaintenance> {
    await ensureFleetSchema();
    const vehicle = await this.getVehicle(ownerUserId, brandId, input.vehicle_id);
    if (!vehicle) throw new Error("Veículo não encontrado");

    const id = randomUUID();
    let status: MaintenanceStatus = (input.status as MaintenanceStatus) || "scheduled";
    if (input.scheduled_at && new Date(input.scheduled_at).getTime() < Date.now() - 86400000) {
      if (status === "scheduled") status = "overdue";
    }

    await insert(
      `INSERT INTO mob_vehicle_maintenances (
        id, vehicle_id, owner_user_id, brand_id, kind, status,
        scheduled_at, started_at, completed_at, odometer_km, workshop,
        description, parts_replaced, cost, invoice_url, next_due_at,
        next_due_odometer, responsible, downtime_hours, blocks_vehicle
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.vehicle_id,
        ownerUserId,
        brandId,
        input.kind,
        status,
        input.scheduled_at || null,
        input.started_at || null,
        input.completed_at || null,
        input.odometer_km ?? vehicle.odometer_km,
        input.workshop || null,
        input.description || null,
        input.parts_replaced || null,
        input.cost ?? null,
        input.invoice_url || null,
        input.next_due_at || null,
        input.next_due_odometer ?? null,
        input.responsible || null,
        input.downtime_hours ?? null,
        input.blocks_vehicle !== false,
      ]
    );

    if (
      input.blocks_vehicle !== false &&
      (status === "in_progress" || status === "overdue" || input.kind === "emergency")
    ) {
      await this.updateVehicle(ownerUserId, brandId, input.vehicle_id, {
        status: "maintenance",
      }).catch(() => undefined);
    }

    const row = await queryOne<any>(
      `SELECT m.*, v.label AS vehicle_label, v.plate AS vehicle_plate
       FROM mob_vehicle_maintenances m
       LEFT JOIN mob_vehicles v ON v.id = m.vehicle_id
       WHERE m.id = ?`,
      [id]
    );
    return mapMaintenance(row);
  },

  async updateMaintenance(
    ownerUserId: string,
    brandId: string,
    maintenanceId: string,
    patch: Partial<MobVehicleMaintenance>
  ): Promise<MobVehicleMaintenance> {
    await ensureFleetSchema();
    const current = await queryOne<any>(
      `SELECT * FROM mob_vehicle_maintenances
       WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
      [maintenanceId, ownerUserId, brandId]
    );
    if (!current) throw new Error("Manutenção não encontrada");

    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    if (patch.kind !== undefined) set("kind", patch.kind);
    if (patch.status !== undefined) set("status", patch.status);
    if (patch.scheduled_at !== undefined) set("scheduled_at", patch.scheduled_at);
    if (patch.started_at !== undefined) set("started_at", patch.started_at);
    if (patch.completed_at !== undefined) set("completed_at", patch.completed_at);
    if (patch.odometer_km !== undefined) set("odometer_km", patch.odometer_km);
    if (patch.workshop !== undefined) set("workshop", patch.workshop);
    if (patch.description !== undefined) set("description", patch.description);
    if (patch.parts_replaced !== undefined) set("parts_replaced", patch.parts_replaced);
    if (patch.cost !== undefined) set("cost", patch.cost);
    if (patch.invoice_url !== undefined) set("invoice_url", patch.invoice_url);
    if (patch.next_due_at !== undefined) set("next_due_at", patch.next_due_at);
    if (patch.next_due_odometer !== undefined) set("next_due_odometer", patch.next_due_odometer);
    if (patch.responsible !== undefined) set("responsible", patch.responsible);
    if (patch.downtime_hours !== undefined) set("downtime_hours", patch.downtime_hours);
    if (patch.blocks_vehicle !== undefined) set("blocks_vehicle", !!patch.blocks_vehicle);

    // Auto timestamps by status transitions
    if (patch.status === "in_progress" && !current.started_at) {
      set("started_at", new Date().toISOString());
    }
    if (patch.status === "completed") {
      if (!current.completed_at && patch.completed_at === undefined) {
        set("completed_at", new Date().toISOString());
      }
    }

    if (fields.length) {
      fields.push("updated_at = NOW()");
      params.push(maintenanceId);
      await update(`UPDATE mob_vehicle_maintenances SET ${fields.join(", ")} WHERE id = ?`, params);
    }

    const updated = await queryOne<any>(
      `SELECT * FROM mob_vehicle_maintenances WHERE id = ?`,
      [maintenanceId]
    );
    const m = mapMaintenance(updated);

    // Vehicle status side-effects
    if (m.blocks_vehicle) {
      if (m.status === "in_progress" || m.status === "overdue") {
        await this.updateVehicle(ownerUserId, brandId, m.vehicle_id, {
          status: "maintenance",
        }).catch(() => undefined);
      } else if (m.status === "completed" || m.status === "cancelled") {
        // Only free if no other open blocking maintenances
        const other = await queryOne<any>(
          `SELECT COUNT(*)::int AS c FROM mob_vehicle_maintenances
           WHERE vehicle_id = ? AND id <> ?
             AND status IN ('in_progress','overdue')
             AND blocks_vehicle = TRUE`,
          [m.vehicle_id, maintenanceId]
        ).catch(() => ({ c: 0 }));
        if (!num(other?.c)) {
          const v = await this.getVehicle(ownerUserId, brandId, m.vehicle_id);
          if (v?.status === "maintenance") {
            await this.updateVehicle(ownerUserId, brandId, m.vehicle_id, {
              status: "available",
            }).catch(() => undefined);
          }
        }
      }
    }

    // Sync odometer on complete
    if (m.status === "completed" && m.odometer_km != null) {
      await this.updateVehicle(ownerUserId, brandId, m.vehicle_id, {
        odometer_km: m.odometer_km,
      }).catch(() => undefined);
    }

    const row = await queryOne<any>(
      `SELECT m.*, v.label AS vehicle_label, v.plate AS vehicle_plate
       FROM mob_vehicle_maintenances m
       LEFT JOIN mob_vehicles v ON v.id = m.vehicle_id
       WHERE m.id = ?`,
      [maintenanceId]
    );
    return mapMaintenance(row);
  },

  /** Mark scheduled maintenances past due as overdue + block vehicle when configured. */
  async refreshOverdueMaintenances(): Promise<{ overdue: number; blocked: number }> {
    await ensureFleetSchema();
    const rows =
      (await query<any[]>(
        `UPDATE mob_vehicle_maintenances
         SET status = 'overdue', updated_at = NOW()
         WHERE status = 'scheduled'
           AND scheduled_at IS NOT NULL
           AND scheduled_at < NOW()
         RETURNING id, vehicle_id, owner_user_id, brand_id, blocks_vehicle`
      ).catch(async () => {
        await query(
          `UPDATE mob_vehicle_maintenances
           SET status = 'overdue', updated_at = NOW()
           WHERE status = 'scheduled'
             AND scheduled_at IS NOT NULL
             AND scheduled_at < NOW()`
        ).catch(() => undefined);
        return [];
      })) || [];

    let blocked = 0;
    for (const r of rows) {
      if (r.blocks_vehicle !== false) {
        await update(
          `UPDATE mob_vehicles SET status = 'maintenance', updated_at = NOW()
           WHERE id = ? AND status IN ('available','in_use','temporarily_unavailable')`,
          [r.vehicle_id]
        ).catch(() => undefined);
        blocked += 1;
      }
    }
    return { overdue: rows.length, blocked };
  },

  /* ── Courier-owned vehicle registration (pending approval) ── */

  VEHICLE_SENSITIVE_FIELDS: ["plate", "renavam", "chassi", "vehicle_type_id"] as const,

  async getVehicleByIdForCourier(
    courierId: string,
    vehicleId: string
  ): Promise<(MobVehicle & { owner_user_id: string; brand_id: string }) | null> {
    await ensureFleetSchema();
    const row = await queryOne<any>(
      `SELECT * FROM mob_vehicles WHERE id = ? AND courier_id = ? LIMIT 1`,
      [vehicleId, courierId]
    );
    if (!row) return null;
    const v = mapVehicle(row);
    v.type = await this.getType(v.vehicle_type_id);
    return v as MobVehicle & { owner_user_id: string; brand_id: string };
  },

  async createCourierVehicle(
    courierId: string,
    input: Partial<MobVehicle> & {
      vehicle_type_id: string;
      owner_user_id: string;
      brand_id: string;
    }
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const membership = await queryOne<any>(
      `SELECT * FROM mob_courier_memberships
       WHERE courier_id = ? AND owner_user_id = ? AND brand_id = ?
         AND status IN ('pending','approved')
       LIMIT 1`,
      [courierId, input.owner_user_id, input.brand_id]
    );
    if (!membership) {
      throw new Error("Vínculo com a loja não encontrado — aceite um convite primeiro");
    }

    const vehicle = await this.createVehicle(input.owner_user_id, input.brand_id, {
      ...input,
      courier_id: courierId,
      ownership: input.ownership || "own",
      status: "pending_approval",
    });

    // Soft cache on courier profile for map/dispatch legacy
    try {
      const { mobLogisticsService } = await import("./mobLogistics");
      await mobLogisticsService.updateCourierProfile(courierId, {
        vehicle_json: {
          type: vehicle.type?.slug || vehicle.type?.name || null,
          plate: vehicle.plate,
          make: vehicle.make,
          model: vehicle.model,
          vehicle_id: vehicle.id,
          status: vehicle.status,
        },
      });
    } catch {
      /* non-blocking */
    }

    return vehicle;
  },

  async updateCourierVehicle(
    courierId: string,
    vehicleId: string,
    patch: Partial<MobVehicle>
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const current = await this.getVehicleByIdForCourier(courierId, vehicleId);
    if (!current) throw new Error("Veículo não encontrado");

    const locked = current.status === "available" || current.status === "in_use";
    const safe: Partial<MobVehicle> = { ...patch };

    if (locked) {
      for (const k of ["plate", "renavam", "chassi", "vehicle_type_id"] as const) {
        if (patch[k] !== undefined && patch[k] !== (current as any)[k]) {
          throw new Error(
            "Placa, RENAVAM, chassi e tipo não podem ser alterados após aprovação do veículo"
          );
        }
        delete (safe as any)[k];
      }
      // courier cannot self-set status to available
      delete (safe as any).status;
      delete (safe as any).courier_id;
    } else {
      // while pending, keep pending_approval unless blocked/docs_expired
      if (safe.status && !["pending_approval", "inactive"].includes(String(safe.status))) {
        delete (safe as any).status;
      }
      if (!safe.status) safe.status = "pending_approval";
    }

    return this.updateVehicle(current.owner_user_id, current.brand_id, vehicleId, safe);
  },

  async resubmitVehicleDocument(
    courierId: string,
    vehicleId: string,
    docId: string,
    patch: Partial<MobVehicleDocument>
  ): Promise<MobVehicleDocument> {
    await ensureFleetSchema();
    const vehicle = await this.getVehicleByIdForCourier(courierId, vehicleId);
    if (!vehicle) throw new Error("Veículo não encontrado");

    const doc = await queryOne<any>(
      `SELECT * FROM mob_vehicle_documents
       WHERE id = ? AND vehicle_id = ? AND owner_user_id = ? AND brand_id = ?`,
      [docId, vehicleId, vehicle.owner_user_id, vehicle.brand_id]
    );
    if (!doc) throw new Error("Documento não encontrado");
    if (!["pending", "rejected", "expired"].includes(String(doc.status))) {
      throw new Error("Documento não pode ser reenviado neste status");
    }

    await update(
      `UPDATE mob_vehicle_documents
       SET doc_number = COALESCE(?, doc_number),
           issued_at = COALESCE(?, issued_at),
           expires_at = COALESCE(?, expires_at),
           file_url = COALESCE(?, file_url),
           status = 'pending',
           rejection_reason = NULL,
           validated_by = NULL,
           validated_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [
        patch.doc_number ?? null,
        patch.issued_at ?? null,
        patch.expires_at ?? null,
        patch.file_url ?? null,
        docId,
      ]
    );

    if (vehicle.status === "docs_expired" || vehicle.status === "blocked") {
      await this.updateVehicle(vehicle.owner_user_id, vehicle.brand_id, vehicleId, {
        status: "pending_approval",
      }).catch(() => undefined);
    }

    const row = await queryOne<any>(`SELECT * FROM mob_vehicle_documents WHERE id = ?`, [docId]);
    return mapDoc(row);
  },

  async approveVehicle(
    ownerUserId: string,
    brandId: string,
    vehicleId: string,
    opts?: { notes?: string }
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const vehicle = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!vehicle) throw new Error("Veículo não encontrado");

    const meta = {
      ...(vehicle.metadata_json || {}),
      approval: {
        status: "approved",
        at: new Date().toISOString(),
        notes: opts?.notes || null,
      },
    };

    // Approve pending docs
    await update(
      `UPDATE mob_vehicle_documents
       SET status = 'approved', validated_at = NOW(), updated_at = NOW()
       WHERE vehicle_id = ? AND owner_user_id = ? AND brand_id = ? AND status = 'pending'`,
      [vehicleId, ownerUserId, brandId]
    ).catch(() => undefined);

    return this.updateVehicle(ownerUserId, brandId, vehicleId, {
      status: "available",
      metadata_json: meta,
      notes: opts?.notes ? `${vehicle.notes || ""}\n[aprovação] ${opts.notes}`.trim() : vehicle.notes,
    });
  },

  async rejectVehicle(
    ownerUserId: string,
    brandId: string,
    vehicleId: string,
    opts?: { reason?: string }
  ): Promise<MobVehicle> {
    await ensureFleetSchema();
    const vehicle = await this.getVehicle(ownerUserId, brandId, vehicleId);
    if (!vehicle) throw new Error("Veículo não encontrado");

    const reason = opts?.reason || "Veículo recusado pela loja";
    const meta = {
      ...(vehicle.metadata_json || {}),
      approval: {
        status: "rejected",
        at: new Date().toISOString(),
        reason,
      },
    };

    await update(
      `UPDATE mob_vehicle_documents
       SET status = 'rejected',
           rejection_reason = COALESCE(rejection_reason, ?),
           updated_at = NOW()
       WHERE vehicle_id = ? AND owner_user_id = ? AND brand_id = ? AND status = 'pending'`,
      [reason, vehicleId, ownerUserId, brandId]
    ).catch(() => undefined);

    return this.updateVehicle(ownerUserId, brandId, vehicleId, {
      status: "blocked",
      metadata_json: meta,
      notes: `${vehicle.notes || ""}\n[recusa] ${reason}`.trim(),
    });
  },
};
