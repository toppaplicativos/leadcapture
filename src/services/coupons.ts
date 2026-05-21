/**
 * Coupons / Promo codes (Fase 13)
 *
 * Source of truth for promotional discount codes. The legacy `coupons` table
 * in `paymentConfig.ts` was MySQL-style and never used by the catalog flow —
 * this module replaces it with a Postgres-native schema scoped to brand_id
 * (which is what the rest of OfferEntity uses).
 *
 * Discount semantics:
 *   - percentage: discount = subtotal * (discount_value / 100), capped at max_discount_cap
 *   - fixed:      discount = min(discount_value, subtotal)
 *
 * Targeting (applies_to):
 *   - "all":      applies to every order (subject to min_subtotal)
 *   - "category": applies only when at least one item in the cart matches a
 *                 category id listed in applies_to_ids
 *   - "product":  applies only when at least one item is one of applies_to_ids
 *   - "collection": reserved — same semantics as category, distinguished for the agent
 *
 * Limits:
 *   - usage_limit_total: hard global cap (NULL = unlimited)
 *   - usage_limit_per_customer: hard per-customer cap (NULL = unlimited)
 *
 * Both limits are enforced AT redemption time inside a transaction, so two
 * concurrent orders that would push past the limit can't both succeed.
 */
import { randomUUID } from "crypto";
import { getPool, query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type CouponDiscountType = "percentage" | "fixed";
export type CouponAppliesTo = "all" | "category" | "product" | "collection";

export interface Coupon {
  id: string;
  brand_id: string | null;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_subtotal: number | null;
  max_discount_cap: number | null;
  applies_to: CouponAppliesTo;
  applies_to_ids: string[];
  starts_at: string | null;        // ISO
  expires_at: string | null;       // ISO
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  used_count: number;
  active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ValidateInput {
  code: string;
  brandId: string | null;
  subtotal: number;
  customerId?: string | null;
  productIds?: string[];
  categoryIds?: string[];
}

export interface ValidationResult {
  valid: boolean;
  coupon?: Coupon;
  /** discount in BRL, rounded to 2 decimals */
  discount_amount: number;
  final_total: number;
  reason?: string;          // human-friendly Portuguese explanation when invalid
  reason_code?:             // machine code for the agent / UI
    | "ok"
    | "not_found"
    | "inactive"
    | "not_started"
    | "expired"
    | "below_min_subtotal"
    | "global_limit_reached"
    | "customer_limit_reached"
    | "targeting_mismatch";
}

function toNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

class CouponsService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) { await this.schemaPromise; return; }

    this.schemaPromise = (async () => {
      /* Coupons — one row per code per brand. Code is uppercased on write so
       * lookup is case-insensitive without an index expression.
       *
       * NOTE: There's a legacy MySQL-flavored `coupons` table from paymentConfig.ts
       * that uses `account_id` instead of `brand_id` and was never actually wired
       * to the catalog flow. CREATE TABLE IF NOT EXISTS is a no-op when that legacy
       * table already exists, so we follow up with ALTER TABLE ... ADD COLUMN IF
       * NOT EXISTS for every column we need. Postgres 9.6+ supports ADD COLUMN IF NOT EXISTS. */
      await query(`
        CREATE TABLE IF NOT EXISTS coupons (
          id VARCHAR(36) PRIMARY KEY,
          brand_id VARCHAR(36) NULL,
          code VARCHAR(64) NOT NULL,
          description TEXT NULL,
          discount_type VARCHAR(16) NOT NULL DEFAULT 'percentage',
          discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
          min_subtotal DECIMAL(12,2) NULL,
          max_discount_cap DECIMAL(12,2) NULL,
          applies_to VARCHAR(20) NOT NULL DEFAULT 'all',
          applies_to_ids JSONB NOT NULL DEFAULT '[]',
          starts_at TIMESTAMP NULL,
          expires_at TIMESTAMP NULL,
          usage_limit_total INTEGER NULL,
          usage_limit_per_customer INTEGER NULL,
          used_count INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          metadata_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      /* Backfill columns when the table pre-exists from the legacy MySQL schema */
      const addCol = async (col: string, def: string) => {
        await query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch((e: any) =>
          logger.warn(`[coupons] ADD COLUMN ${col} skipped: ${e?.message || e}`)
        );
      };
      await addCol("brand_id", "VARCHAR(36) NULL");
      await addCol("description", "TEXT NULL");
      await addCol("discount_type", "VARCHAR(16) NOT NULL DEFAULT 'percentage'");
      await addCol("discount_value", "DECIMAL(12,2) NOT NULL DEFAULT 0");
      await addCol("min_subtotal", "DECIMAL(12,2) NULL");
      await addCol("max_discount_cap", "DECIMAL(12,2) NULL");
      await addCol("applies_to", "VARCHAR(20) NOT NULL DEFAULT 'all'");
      await addCol("applies_to_ids", "JSONB NOT NULL DEFAULT '[]'");
      await addCol("starts_at", "TIMESTAMP NULL");
      await addCol("expires_at", "TIMESTAMP NULL");
      await addCol("usage_limit_total", "INTEGER NULL");
      await addCol("usage_limit_per_customer", "INTEGER NULL");
      await addCol("used_count", "INTEGER NOT NULL DEFAULT 0");
      await addCol("metadata_json", "JSONB NOT NULL DEFAULT '{}'");
      /* Backfill from legacy column names when present (paymentConfig.ts legacy schema):
       *   legacy `value` → new `discount_value`
       *   legacy `expiration_date` → new `expires_at`
       *   legacy `usage_limit` → new `usage_limit_total`
       * Each UPDATE is best-effort — if the legacy column doesn't exist it errors and we skip. */
      await query(`UPDATE coupons SET discount_value = value WHERE discount_value = 0 AND value IS NOT NULL`).catch(() => {});
      await query(`UPDATE coupons SET expires_at = expiration_date WHERE expires_at IS NULL AND expiration_date IS NOT NULL`).catch(() => {});
      await query(`UPDATE coupons SET usage_limit_total = usage_limit WHERE usage_limit_total IS NULL AND usage_limit IS NOT NULL`).catch(() => {});
      /* Relax legacy NOT-NULL constraints we don't populate (account_id, value).
       * The new code path never sets these, so they must accept NULL. */
      await query(`ALTER TABLE coupons ALTER COLUMN account_id DROP NOT NULL`).catch(() => {});
      await query(`ALTER TABLE coupons ALTER COLUMN value DROP NOT NULL`).catch(() => {});

      /* Unique code per brand (NULL brand_id treated as ''). The legacy table may
       * already have a (account_id, code) UNIQUE which we don't touch — both can coexist. */
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_brand_code
          ON coupons (COALESCE(brand_id,''), code)
      `).catch(() => { /* index may exist with different definition; ignore */ });

      /* Redemptions — audit + lookup for per-customer limit check */
      await query(`
        CREATE TABLE IF NOT EXISTS coupon_redemptions (
          id BIGSERIAL PRIMARY KEY,
          coupon_id VARCHAR(36) NOT NULL,
          order_id VARCHAR(64) NOT NULL,
          customer_id VARCHAR(64) NULL,
          subtotal DECIMAL(12,2) NULL,
          discount_applied DECIMAL(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions (coupon_id, created_at DESC)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON coupon_redemptions (coupon_id, customer_id) WHERE customer_id IS NOT NULL`).catch(() => {});
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_redemptions_order ON coupon_redemptions (order_id)`).catch(() => {});

      this.schemaReady = true;
    })().finally(() => { this.schemaPromise = null; });

    await this.schemaPromise;
  }

  /* ── public lookups ── */

  async listAll(brandId: string | null): Promise<Coupon[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM coupons WHERE COALESCE(brand_id,'') = COALESCE(?,'') ORDER BY active DESC, created_at DESC`,
      [brandId || null]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  async listActive(brandId: string | null): Promise<Coupon[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM coupons
        WHERE COALESCE(brand_id,'') = COALESCE(?,'') AND active = TRUE
          AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
          AND (usage_limit_total IS NULL OR used_count < usage_limit_total)
        ORDER BY created_at DESC`,
      [brandId || null]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  async getByCode(code: string, brandId: string | null): Promise<Coupon | null> {
    await this.ensureSchema();
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    const row = await queryOne<any>(
      `SELECT * FROM coupons WHERE COALESCE(brand_id,'') = COALESCE(?,'') AND UPPER(code) = ? LIMIT 1`,
      [brandId || null, normalized]
    );
    return row ? this.mapRow(row) : null;
  }

  /**
   * Validate a coupon against the cart. Does NOT decrement anything — call apply()
   * inside the same transaction as the order INSERT to make redemption atomic.
   */
  async validate(input: ValidateInput): Promise<ValidationResult> {
    const subtotal = toNumber(input.subtotal, 0);
    const coupon = await this.getByCode(input.code, input.brandId);
    if (!coupon) {
      return { valid: false, discount_amount: 0, final_total: subtotal, reason: "Cupom não encontrado.", reason_code: "not_found" };
    }
    if (!coupon.active) {
      return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom desativado.", reason_code: "inactive" };
    }
    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
      return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom ainda não está vigente.", reason_code: "not_started" };
    }
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now) {
      return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom expirado.", reason_code: "expired" };
    }
    if (coupon.min_subtotal !== null && subtotal < coupon.min_subtotal) {
      return {
        valid: false, coupon, discount_amount: 0, final_total: subtotal,
        reason: `Pedido mínimo de R$ ${coupon.min_subtotal.toFixed(2)} para usar esse cupom.`,
        reason_code: "below_min_subtotal",
      };
    }
    if (coupon.usage_limit_total !== null && coupon.used_count >= coupon.usage_limit_total) {
      return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom esgotou o limite de usos.", reason_code: "global_limit_reached" };
    }
    if (coupon.usage_limit_per_customer !== null && input.customerId) {
      const usedByCustomer = await queryOne<any>(
        `SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ?`,
        [coupon.id, input.customerId]
      );
      if ((usedByCustomer?.n || 0) >= coupon.usage_limit_per_customer) {
        return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Você já usou esse cupom o número máximo de vezes.", reason_code: "customer_limit_reached" };
      }
    }
    /* Targeting: at least one product/category must match */
    if (coupon.applies_to === "product") {
      const wanted = new Set(coupon.applies_to_ids.map(String));
      const ok = (input.productIds || []).some((pid) => wanted.has(String(pid)));
      if (!ok) return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom não vale para os produtos do carrinho.", reason_code: "targeting_mismatch" };
    } else if (coupon.applies_to === "category" || coupon.applies_to === "collection") {
      const wanted = new Set(coupon.applies_to_ids.map(String));
      const ok = (input.categoryIds || []).some((cid) => wanted.has(String(cid)));
      if (!ok) return { valid: false, coupon, discount_amount: 0, final_total: subtotal, reason: "Cupom não vale para a categoria do carrinho.", reason_code: "targeting_mismatch" };
    }

    /* Compute discount */
    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = subtotal * (coupon.discount_value / 100);
      if (coupon.max_discount_cap !== null) discount = Math.min(discount, coupon.max_discount_cap);
    } else {
      discount = Math.min(coupon.discount_value, subtotal);
    }
    discount = Math.max(0, round2(discount));
    const final_total = Math.max(0, round2(subtotal - discount));

    return { valid: true, coupon, discount_amount: discount, final_total, reason_code: "ok" };
  }

  /**
   * Record a successful redemption + atomically bump used_count.
   * Re-validates limits inside the same transaction so a race can't oversell the cupon.
   * Idempotent on order_id thanks to uq_redemptions_order.
   */
  async apply(input: {
    couponId: string;
    orderId: string;
    customerId?: string | null;
    subtotal: number;
    discount: number;
  }): Promise<void> {
    await this.ensureSchema();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.query("BEGIN");

      const [rows] = await conn.query(
        `SELECT * FROM coupons WHERE id = ? FOR UPDATE`,
        [input.couponId]
      );
      const c = (rows as any[])[0];
      if (!c) { await conn.query("ROLLBACK"); throw new Error("coupon disappeared"); }
      if (!c.active) { await conn.query("ROLLBACK"); throw new Error("coupon became inactive"); }
      if (c.usage_limit_total !== null && Number(c.used_count) >= Number(c.usage_limit_total)) {
        await conn.query("ROLLBACK");
        const err: any = new Error("Cupom esgotou o limite de usos.");
        err.code = "COUPON_EXHAUSTED";
        throw err;
      }
      if (c.usage_limit_per_customer !== null && input.customerId) {
        const [rRows] = await conn.query(
          `SELECT COUNT(*)::int AS n FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ?`,
          [c.id, input.customerId]
        );
        const n = Number((rRows as any[])[0]?.n || 0);
        if (n >= Number(c.usage_limit_per_customer)) {
          await conn.query("ROLLBACK");
          const err: any = new Error("Limite por cliente atingido.");
          err.code = "COUPON_PER_CUSTOMER_LIMIT";
          throw err;
        }
      }

      /* Insert redemption (UNIQUE on order_id keeps this idempotent) */
      await conn.query(
        `INSERT INTO coupon_redemptions (coupon_id, order_id, customer_id, subtotal, discount_applied)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (order_id) DO NOTHING`,
        [c.id, input.orderId, input.customerId || null, input.subtotal, input.discount]
      );
      await conn.query(
        `UPDATE coupons SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [c.id]
      );

      await conn.query("COMMIT");
    } catch (e: any) {
      try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  /* ── CRUD ── */

  async create(input: Partial<Coupon> & { code: string; discount_type: CouponDiscountType; discount_value: number; brand_id: string | null }): Promise<Coupon> {
    await this.ensureSchema();
    const id = randomUUID();
    const code = String(input.code || "").trim().toUpperCase();
    if (!code) throw new Error("code obrigatório");
    if (!["percentage", "fixed"].includes(input.discount_type)) throw new Error("discount_type inválido");
    if (!Number.isFinite(Number(input.discount_value)) || Number(input.discount_value) <= 0) throw new Error("discount_value inválido");
    /* Duplicate code per brand */
    const existing = await this.getByCode(code, input.brand_id || null);
    if (existing) throw new Error("já existe cupom com esse código para esta marca");

    await query(
      `INSERT INTO coupons (
        id, brand_id, code, description, discount_type, discount_value,
        min_subtotal, max_discount_cap, applies_to, applies_to_ids,
        starts_at, expires_at, usage_limit_total, usage_limit_per_customer,
        used_count, active, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, 0, ?, ?::jsonb)`,
      [
        id,
        input.brand_id || null,
        code,
        input.description || null,
        input.discount_type,
        Number(input.discount_value),
        input.min_subtotal === undefined ? null : (input.min_subtotal === null ? null : Number(input.min_subtotal)),
        input.max_discount_cap === undefined ? null : (input.max_discount_cap === null ? null : Number(input.max_discount_cap)),
        input.applies_to || "all",
        JSON.stringify(Array.isArray(input.applies_to_ids) ? input.applies_to_ids : []),
        input.starts_at || null,
        input.expires_at || null,
        input.usage_limit_total === undefined ? null : (input.usage_limit_total === null ? null : Number(input.usage_limit_total)),
        input.usage_limit_per_customer === undefined ? null : (input.usage_limit_per_customer === null ? null : Number(input.usage_limit_per_customer)),
        input.active === false ? false : true,
        JSON.stringify(input.metadata || {}),
      ]
    );
    const created = await queryOne<any>(`SELECT * FROM coupons WHERE id = ?`, [id]);
    return this.mapRow(created);
  }

  async update(id: string, patch: Partial<Coupon>): Promise<Coupon | null> {
    await this.ensureSchema();
    const existing = await queryOne<any>(`SELECT * FROM coupons WHERE id = ?`, [id]);
    if (!existing) return null;
    const fields: string[] = [];
    const values: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); values.push(val); };
    if (patch.description !== undefined) set("description", patch.description || null);
    if (patch.discount_type !== undefined) set("discount_type", patch.discount_type);
    if (patch.discount_value !== undefined) set("discount_value", Number(patch.discount_value));
    if (patch.min_subtotal !== undefined) set("min_subtotal", patch.min_subtotal === null ? null : Number(patch.min_subtotal));
    if (patch.max_discount_cap !== undefined) set("max_discount_cap", patch.max_discount_cap === null ? null : Number(patch.max_discount_cap));
    if (patch.applies_to !== undefined) set("applies_to", patch.applies_to);
    if (patch.applies_to_ids !== undefined) {
      fields.push("applies_to_ids = ?::jsonb");
      values.push(JSON.stringify(Array.isArray(patch.applies_to_ids) ? patch.applies_to_ids : []));
    }
    if (patch.starts_at !== undefined) set("starts_at", patch.starts_at || null);
    if (patch.expires_at !== undefined) set("expires_at", patch.expires_at || null);
    if (patch.usage_limit_total !== undefined) set("usage_limit_total", patch.usage_limit_total === null ? null : Number(patch.usage_limit_total));
    if (patch.usage_limit_per_customer !== undefined) set("usage_limit_per_customer", patch.usage_limit_per_customer === null ? null : Number(patch.usage_limit_per_customer));
    if (patch.active !== undefined) set("active", Boolean(patch.active));
    if (patch.metadata !== undefined) {
      fields.push("metadata_json = ?::jsonb");
      values.push(JSON.stringify(patch.metadata || {}));
    }
    /* code rename: only if not used yet, and check uniqueness */
    if (patch.code !== undefined && patch.code) {
      const newCode = String(patch.code).trim().toUpperCase();
      if (newCode !== existing.code) {
        if (Number(existing.used_count) > 0) throw new Error("não é possível renomear cupom já utilizado");
        const dup = await this.getByCode(newCode, existing.brand_id || null);
        if (dup) throw new Error("já existe cupom com esse código");
        set("code", newCode);
      }
    }
    if (fields.length === 0) return this.mapRow(existing);
    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    await query(`UPDATE coupons SET ${fields.join(", ")} WHERE id = ?`, values);
    const refreshed = await queryOne<any>(`SELECT * FROM coupons WHERE id = ?`, [id]);
    return this.mapRow(refreshed);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureSchema();
    /* Prefer soft-delete to preserve redemption audit; only hard-delete if never used */
    const c = await queryOne<any>(`SELECT used_count FROM coupons WHERE id = ?`, [id]);
    if (!c) return false;
    if (Number(c.used_count) > 0) {
      await query(`UPDATE coupons SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    } else {
      await query(`DELETE FROM coupons WHERE id = ?`, [id]);
    }
    return true;
  }

  /* ── helpers ── */

  private mapRow(row: any): Coupon {
    return {
      id: String(row.id),
      brand_id: row.brand_id ? String(row.brand_id) : null,
      code: String(row.code),
      description: row.description || null,
      discount_type: row.discount_type as CouponDiscountType,
      discount_value: Number(row.discount_value),
      min_subtotal: row.min_subtotal === null || row.min_subtotal === undefined ? null : Number(row.min_subtotal),
      max_discount_cap: row.max_discount_cap === null || row.max_discount_cap === undefined ? null : Number(row.max_discount_cap),
      applies_to: (row.applies_to as CouponAppliesTo) || "all",
      applies_to_ids: this.parseJson(row.applies_to_ids, []),
      starts_at: row.starts_at ? new Date(row.starts_at).toISOString() : null,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      usage_limit_total: row.usage_limit_total === null || row.usage_limit_total === undefined ? null : Number(row.usage_limit_total),
      usage_limit_per_customer: row.usage_limit_per_customer === null || row.usage_limit_per_customer === undefined ? null : Number(row.usage_limit_per_customer),
      used_count: Number(row.used_count || 0),
      active: Boolean(row.active),
      metadata: this.parseJson(row.metadata_json, {}),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : "",
    };
  }

  private parseJson<T>(raw: any, fallback: T): T {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === "object") return raw as T;
    try { return JSON.parse(String(raw)) as T; } catch { return fallback; }
  }
}

export const couponsService = new CouponsService();
