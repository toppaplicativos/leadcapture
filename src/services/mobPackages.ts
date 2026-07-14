/**
 * Lead Capture Mob — package/volume conference with QR codes (spec §16).
 * Independent entity lifecycle linked to delivery; scan on pickup and dropoff.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

export type PackageStatus =
  | "pending"
  | "scanned_pickup"
  | "loaded"
  | "in_transit"
  | "scanned_dropoff"
  | "delivered"
  | "missing"
  | "damaged"
  | "returned"
  | "wrong";

export type MobPackage = {
  id: string;
  delivery_id: string;
  owner_user_id: string;
  brand_id: string;
  code: string;
  barcode: string | null;
  qr_payload: string;
  sequence: number;
  label: string | null;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volume_m3: number | null;
  category: string | null;
  is_fragile: boolean;
  requires_refrigeration: boolean;
  seal_number: string | null;
  status: PackageStatus;
  scanned_pickup_at: string | null;
  scanned_dropoff_at: string | null;
  scanned_by: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PackageConference = {
  delivery_id: string;
  total: number;
  pending: number;
  scanned_pickup: number;
  loaded: number;
  scanned_dropoff: number;
  missing: number;
  damaged: number;
  packages: MobPackage[];
  pickup_complete: boolean;
  dropoff_complete: boolean;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function mapPkg(row: any): MobPackage {
  return {
    id: String(row.id),
    delivery_id: String(row.delivery_id),
    owner_user_id: String(row.owner_user_id),
    brand_id: String(row.brand_id),
    code: String(row.code),
    barcode: row.barcode || null,
    qr_payload: String(row.qr_payload || row.code),
    sequence: num(row.sequence, 1),
    label: row.label || null,
    weight_kg: row.weight_kg != null ? num(row.weight_kg) : null,
    length_cm: row.length_cm != null ? num(row.length_cm) : null,
    width_cm: row.width_cm != null ? num(row.width_cm) : null,
    height_cm: row.height_cm != null ? num(row.height_cm) : null,
    volume_m3: row.volume_m3 != null ? num(row.volume_m3) : null,
    category: row.category || null,
    is_fragile: !!row.is_fragile,
    requires_refrigeration: !!row.requires_refrigeration,
    seal_number: row.seal_number || null,
    status: (row.status || "pending") as PackageStatus,
    scanned_pickup_at: row.scanned_pickup_at || null,
    scanned_dropoff_at: row.scanned_dropoff_at || null,
    scanned_by: row.scanned_by || null,
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function genCode(prefix = "MOB"): string {
  const raw = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function qrPayload(deliveryId: string, code: string): string {
  // Stable scannable payload — app can type code or scan this string
  const hash = createHash("sha1").update(`${deliveryId}:${code}`).digest("hex").slice(0, 8);
  return `LCM|${code}|${hash}`;
}

async function ensurePackageSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS mob_packages (
        id VARCHAR(36) PRIMARY KEY,
        delivery_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        code VARCHAR(48) NOT NULL,
        barcode VARCHAR(64) NULL,
        qr_payload VARCHAR(120) NOT NULL,
        sequence INT NOT NULL DEFAULT 1,
        label VARCHAR(160) NULL,
        weight_kg DOUBLE PRECISION NULL,
        length_cm DOUBLE PRECISION NULL,
        width_cm DOUBLE PRECISION NULL,
        height_cm DOUBLE PRECISION NULL,
        volume_m3 DOUBLE PRECISION NULL,
        category VARCHAR(64) NULL,
        is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
        requires_refrigeration BOOLEAN NOT NULL DEFAULT FALSE,
        seal_number VARCHAR(64) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        scanned_pickup_at TIMESTAMP NULL,
        scanned_dropoff_at TIMESTAMP NULL,
        scanned_by VARCHAR(36) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (code)
      )
    `);

    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_packages_delivery ON mob_packages (delivery_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mob_packages_qr ON mob_packages (qr_payload)`
    ).catch(() => undefined);

    await query(
      `ALTER TABLE mob_deliveries ADD COLUMN IF NOT EXISTS require_package_scan BOOLEAN NOT NULL DEFAULT FALSE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_deliveries ADD COLUMN require_package_scan BOOLEAN NOT NULL DEFAULT FALSE`
      ).catch(() => undefined);
    });
    await query(
      `ALTER TABLE mob_settings ADD COLUMN IF NOT EXISTS require_package_scan BOOLEAN NOT NULL DEFAULT FALSE`
    ).catch(async () => {
      await query(
        `ALTER TABLE mob_settings ADD COLUMN require_package_scan BOOLEAN NOT NULL DEFAULT FALSE`
      ).catch(() => undefined);
    });

    schemaReady = true;
    logger.info("Mob packages schema ready");
  })().finally(() => {
    schemaPromise = null;
  });

  await schemaPromise;
}

export const mobPackagesService = {
  async ensureSchema() {
    await ensurePackageSchema();
  },

  async listByDelivery(deliveryId: string): Promise<MobPackage[]> {
    await ensurePackageSchema();
    const rows =
      (await query<any[]>(
        `SELECT * FROM mob_packages WHERE delivery_id = ? ORDER BY sequence ASC, created_at ASC`,
        [deliveryId]
      )) || [];
    return rows.map(mapPkg);
  },

  async getConference(deliveryId: string): Promise<PackageConference> {
    const packages = await this.listByDelivery(deliveryId);
    const total = packages.length;
    const pending = packages.filter((p) => p.status === "pending").length;
    const scanned_pickup = packages.filter((p) =>
      ["scanned_pickup", "loaded", "in_transit", "scanned_dropoff", "delivered"].includes(p.status)
    ).length;
    const loaded = packages.filter((p) =>
      ["loaded", "in_transit", "scanned_dropoff", "delivered"].includes(p.status)
    ).length;
    const scanned_dropoff = packages.filter((p) =>
      ["scanned_dropoff", "delivered"].includes(p.status)
    ).length;
    const missing = packages.filter((p) => p.status === "missing").length;
    const damaged = packages.filter((p) => p.status === "damaged").length;

    return {
      delivery_id: deliveryId,
      total,
      pending,
      scanned_pickup,
      loaded,
      scanned_dropoff,
      missing,
      damaged,
      packages,
      pickup_complete: total === 0 || (scanned_pickup + missing + damaged >= total && pending === 0),
      dropoff_complete:
        total === 0 ||
        packages.every((p) =>
          ["scanned_dropoff", "delivered", "missing", "returned", "damaged"].includes(p.status)
        ),
    };
  },

  async createPackages(input: {
    deliveryId: string;
    ownerUserId: string;
    brandId: string;
    count?: number;
    items?: Array<{
      label?: string;
      weight_kg?: number;
      length_cm?: number;
      width_cm?: number;
      height_cm?: number;
      category?: string;
      is_fragile?: boolean;
      requires_refrigeration?: boolean;
      seal_number?: string;
      barcode?: string;
    }>;
  }): Promise<MobPackage[]> {
    await ensurePackageSchema();
    const existing = await this.listByDelivery(input.deliveryId);
    let seq = existing.length;

    type ItemIn = NonNullable<typeof input.items>[number];
    const items: ItemIn[] =
      input.items && input.items.length
        ? input.items
        : Array.from({ length: Math.max(1, Math.min(num(input.count, 1), 50)) }, () => ({} as ItemIn));

    const created: MobPackage[] = [];
    for (const it of items) {
      seq += 1;
      const id = randomUUID();
      const code = genCode("MOB");
      const payload = qrPayload(input.deliveryId, code);
      let volume: number | null = null;
      if (it.length_cm != null && it.width_cm != null && it.height_cm != null) {
        volume =
          Math.round(((num(it.length_cm) * num(it.width_cm) * num(it.height_cm)) / 1_000_000) * 1000) /
          1000;
      }

      await insert(
        `INSERT INTO mob_packages (
          id, delivery_id, owner_user_id, brand_id, code, barcode, qr_payload, sequence,
          label, weight_kg, length_cm, width_cm, height_cm, volume_m3, category,
          is_fragile, requires_refrigeration, seal_number, status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
        [
          id,
          input.deliveryId,
          input.ownerUserId,
          input.brandId,
          code,
          it.barcode || null,
          payload,
          seq,
          it.label || `Volume ${seq}`,
          it.weight_kg ?? null,
          it.length_cm ?? null,
          it.width_cm ?? null,
          it.height_cm ?? null,
          volume,
          it.category || null,
          !!it.is_fragile,
          !!it.requires_refrigeration,
          it.seal_number || null,
        ]
      );
      const row = await queryOne<any>(`SELECT * FROM mob_packages WHERE id = ?`, [id]);
      if (row) created.push(mapPkg(row));
    }

    // Mark delivery as requiring scan if packages exist
    if (created.length) {
      await update(
        `UPDATE mob_deliveries SET require_package_scan = TRUE, package_count = ?, updated_at = NOW()
         WHERE id = ?`,
        [existing.length + created.length, input.deliveryId]
      ).catch(async () => {
        await update(
          `UPDATE mob_deliveries SET require_package_scan = TRUE, updated_at = NOW() WHERE id = ?`,
          [input.deliveryId]
        ).catch(() => undefined);
      });
    }

    return created;
  },

  /**
   * Ensure default packages from delivery.package_count if none exist.
   */
  async ensureForDelivery(delivery: {
    id: string;
    owner_user_id: string;
    brand_id: string;
    package_count?: number | null;
    require_package_scan?: boolean;
  }): Promise<MobPackage[]> {
    const existing = await this.listByDelivery(delivery.id);
    if (existing.length) return existing;
    const count = Math.max(0, Math.min(num(delivery.package_count, 0), 50));
    if (count < 1 && !delivery.require_package_scan) return [];
    const n = count > 0 ? count : 1;
    return this.createPackages({
      deliveryId: delivery.id,
      ownerUserId: delivery.owner_user_id,
      brandId: delivery.brand_id,
      count: n,
    });
  },

  async findByCodeOrQr(codeOrQr: string): Promise<MobPackage | null> {
    await ensurePackageSchema();
    const raw = String(codeOrQr || "").trim();
    if (!raw) return null;
    // Accept "LCM|CODE|hash" or plain code
    let code = raw;
    if (raw.startsWith("LCM|")) {
      const parts = raw.split("|");
      code = parts[1] || raw;
    }
    const row = await queryOne<any>(
      `SELECT * FROM mob_packages WHERE code = ? OR qr_payload = ? OR barcode = ? LIMIT 1`,
      [code, raw, raw]
    );
    return row ? mapPkg(row) : null;
  },

  async scan(input: {
    deliveryId: string;
    codeOrQr: string;
    phase: "pickup" | "dropoff";
    courierId: string;
    note?: string;
  }): Promise<{ package: MobPackage; conference: PackageConference; wrong_delivery?: boolean }> {
    await ensurePackageSchema();
    const pkg = await this.findByCodeOrQr(input.codeOrQr);
    if (!pkg) throw new Error("Código/QR não encontrado");

    if (pkg.delivery_id !== input.deliveryId) {
      // Mark wrong if somehow scanned
      await update(
        `UPDATE mob_packages SET status = 'wrong', notes = ?, updated_at = NOW() WHERE id = ?`,
        [`Escaneado na entrega errada ${input.deliveryId}`, pkg.id]
      ).catch(() => undefined);
      throw new Error(
        `Volume ${pkg.code} pertence a outra entrega — não carregue este pacote`
      );
    }

    if (input.phase === "pickup") {
      if (["scanned_dropoff", "delivered", "returned"].includes(pkg.status)) {
        throw new Error("Volume já finalizado");
      }
      await update(
        `UPDATE mob_packages
         SET status = 'scanned_pickup', scanned_pickup_at = NOW(), scanned_by = ?,
             notes = COALESCE(?, notes), updated_at = NOW()
         WHERE id = ?`,
        [input.courierId, input.note || null, pkg.id]
      );
    } else {
      if (!["scanned_pickup", "loaded", "in_transit", "scanned_dropoff"].includes(pkg.status)) {
        if (pkg.status === "pending") {
          throw new Error("Volume ainda não foi conferido na coleta");
        }
        if (pkg.status === "missing") {
          throw new Error("Volume marcado como ausente");
        }
      }
      await update(
        `UPDATE mob_packages
         SET status = 'scanned_dropoff', scanned_dropoff_at = NOW(), scanned_by = ?,
             notes = COALESCE(?, notes), updated_at = NOW()
         WHERE id = ?`,
        [input.courierId, input.note || null, pkg.id]
      );
    }

    const updated = await queryOne<any>(`SELECT * FROM mob_packages WHERE id = ?`, [pkg.id]);
    const conference = await this.getConference(input.deliveryId);
    return { package: mapPkg(updated), conference };
  },

  async markStatus(input: {
    packageId: string;
    deliveryId: string;
    status: "missing" | "damaged" | "loaded" | "returned" | "pending";
    courierId?: string;
    note?: string;
  }): Promise<MobPackage> {
    await ensurePackageSchema();
    const pkg = await queryOne<any>(
      `SELECT * FROM mob_packages WHERE id = ? AND delivery_id = ?`,
      [input.packageId, input.deliveryId]
    );
    if (!pkg) throw new Error("Volume não encontrado");

    await update(
      `UPDATE mob_packages
       SET status = ?, notes = COALESCE(?, notes), scanned_by = COALESCE(?, scanned_by), updated_at = NOW()
       WHERE id = ?`,
      [input.status, input.note || null, input.courierId || null, input.packageId]
    );
    const row = await queryOne<any>(`SELECT * FROM mob_packages WHERE id = ?`, [input.packageId]);
    return mapPkg(row);
  },

  async confirmLoad(deliveryId: string, courierId: string): Promise<PackageConference> {
    await ensurePackageSchema();
    await update(
      `UPDATE mob_packages
       SET status = 'loaded', updated_at = NOW(), scanned_by = ?
       WHERE delivery_id = ? AND status = 'scanned_pickup'`,
      [courierId, deliveryId]
    );
    return this.getConference(deliveryId);
  },

  /**
   * Gate for status transitions — throws if scan required and incomplete.
   */
  async assertScanComplete(
    delivery: {
      id: string;
      require_package_scan?: boolean;
      package_count?: number | null;
    },
    phase: "pickup" | "dropoff"
  ): Promise<void> {
    await ensurePackageSchema();
    const conf = await this.getConference(delivery.id);
    if (conf.total === 0) {
      // No packages tracked — ok unless explicitly required with count
      if (delivery.require_package_scan && num(delivery.package_count) > 0) {
        throw new Error("Volumes ainda não foram gerados para esta entrega");
      }
      return;
    }

    if (phase === "pickup" && !conf.pickup_complete) {
      throw new Error(
        `Conferência de coleta incompleta: ${conf.scanned_pickup}/${conf.total} volumes escaneados`
      );
    }
    if (phase === "dropoff" && !conf.dropoff_complete) {
      throw new Error(
        `Conferência de entrega incompleta: ${conf.scanned_dropoff}/${conf.total} volumes escaneados`
      );
    }
  },
};
