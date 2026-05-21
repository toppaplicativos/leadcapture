/**
 * Product Stock Service (Fase 12 — OfferEntity inventory layer)
 *
 * Single source of truth for the `products.stock_quantity` column (and
 * `product_variants.stock_quantity`). Append-only audit in `stock_movements`.
 *
 * NOTE on coexistence with `src/services/inventory.ts`:
 *   The legacy `InventoryService` works on a separate `inventory` table with
 *   reservations and cost tracking — geared for the admin InventoryPage and
 *   operational reports. This new layer operates DIRECTLY on the product row
 *   so that the public catalog, ProductIntelligence skill, and order flow can
 *   read/write stock with a single SELECT/UPDATE, no JOIN. They can be kept
 *   in sync by mirroring adjust() calls — but for now this is the authoritative
 *   layer for the OfferEntity stack.
 *
 * Stock model:
 *   - `products.stock_quantity = NULL` → unlimited (default for services, configurators,
 *     digital goods). adjust() becomes a safe no-op.
 *   - `products.stock_quantity >= 0` → tracked. status auto-recomputed:
 *       0                              → "out_of_stock"
 *       qty <= stock_threshold_low     → "low_stock"
 *       qty >  stock_threshold_low     → "in_stock"
 *
 * Movements reasons:
 *   "order:created"   delta < 0
 *   "order:cancelled" delta > 0  (restore on cancel)
 *   "order:refunded"  delta > 0
 *   "restock"         delta > 0  (manual admin add)
 *   "manual"          any        (admin override; meta carries notes)
 *   "recount"         delta = 0  (audit note only)
 *   "initial"         delta > 0  (first stock set on a new product)
 */
import { getPool, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type StockReason =
  | "order:created"
  | "order:cancelled"
  | "order:refunded"
  | "restock"
  | "manual"
  | "recount"
  | "initial";

export type ProductStockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unlimited";

export interface StockLevel {
  product_id: string;
  variant_id: string | null;
  quantity: number | null;        // null = unlimited
  threshold_low: number;
  status: ProductStockStatus;
  is_tracked: boolean;
}

export interface AvailabilityItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export interface AvailabilityResult {
  ok: boolean;
  shortages: Array<{
    product_id: string;
    variant_id: string | null;
    requested: number;
    available: number;
    product_name?: string;
  }>;
}

function computeStatus(qty: number | null, threshold: number): ProductStockStatus {
  if (qty === null || qty === undefined) return "unlimited";
  if (qty <= 0) return "out_of_stock";
  if (qty <= Math.max(0, threshold)) return "low_stock";
  return "in_stock";
}

class ProductStockService {
  /**
   * Read current stock for product (and optionally variant).
   * Variant qty wins over product qty when the variant has its own stock_quantity.
   */
  async getStock(productId: string, variantId?: string | null): Promise<StockLevel> {
    if (variantId) {
      const v = await queryOne<any>(
        `SELECT pv.stock_quantity AS variant_qty, p.stock_threshold_low
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
          WHERE pv.id = ? AND pv.product_id = ?`,
        [variantId, productId]
      );
      if (v && v.variant_qty !== null && v.variant_qty !== undefined) {
        const qty = Number(v.variant_qty);
        const thr = Number(v.stock_threshold_low ?? 5);
        return {
          product_id: productId,
          variant_id: variantId,
          quantity: qty,
          threshold_low: thr,
          status: computeStatus(qty, thr),
          is_tracked: true,
        };
      }
    }
    const p = await queryOne<any>(
      `SELECT stock_quantity, stock_threshold_low, stock_status
         FROM products WHERE id = ?`,
      [productId]
    );
    if (!p) {
      return {
        product_id: productId,
        variant_id: variantId || null,
        quantity: null,
        threshold_low: 5,
        status: "unlimited",
        is_tracked: false,
      };
    }
    const qty = p.stock_quantity === null || p.stock_quantity === undefined ? null : Number(p.stock_quantity);
    const thr = Number(p.stock_threshold_low ?? 5);
    return {
      product_id: productId,
      variant_id: variantId || null,
      quantity: qty,
      threshold_low: thr,
      status: qty === null ? "unlimited" : computeStatus(qty, thr),
      is_tracked: qty !== null,
    };
  }

  /**
   * Pre-flight check: do all items have enough stock? Doesn't decrement.
   * Untracked items (qty=null) always pass.
   */
  async checkAvailability(items: AvailabilityItem[]): Promise<AvailabilityResult> {
    const shortages: AvailabilityResult["shortages"] = [];
    for (const item of items) {
      const lvl = await this.getStock(item.product_id, item.variant_id || null);
      if (!lvl.is_tracked) continue;
      if ((lvl.quantity || 0) < item.quantity) {
        const name = await this.getProductName(item.product_id);
        shortages.push({
          product_id: item.product_id,
          variant_id: lvl.variant_id,
          requested: item.quantity,
          available: lvl.quantity || 0,
          product_name: name,
        });
      }
    }
    return { ok: shortages.length === 0, shortages };
  }

  /**
   * Atomically adjust stock and append a movement row in the same transaction.
   * Acquires FOR UPDATE lock so concurrent decrements can't oversell.
   *
   * Returns the new balance (or null if untracked → no-op).
   */
  async adjust(input: {
    productId: string;
    variantId?: string | null;
    delta: number;
    reason: StockReason;
    orderId?: string | null;
    userId?: string | null;
    meta?: Record<string, any>;
  }): Promise<{ balance: number | null; status: ProductStockStatus; movement_id: number | null }> {
    const { productId, variantId, delta, reason, orderId, userId, meta } = input;

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.query("BEGIN");

      let balance: number | null = null;
      let threshold = 5;
      let tracked = false;
      let targetTable: "product_variants" | "products" = "products";

      /* Pick the row that owns the stock: variant if it has its own qty, else product */
      if (variantId) {
        const [vRows] = await conn.query(
          `SELECT pv.id, pv.stock_quantity, p.stock_threshold_low
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
            WHERE pv.id = ? AND pv.product_id = ?
            FOR UPDATE`,
          [variantId, productId]
        );
        const v = (vRows as any[])[0];
        if (v && v.stock_quantity !== null && v.stock_quantity !== undefined) {
          tracked = true;
          balance = Number(v.stock_quantity);
          threshold = Number(v.stock_threshold_low ?? 5);
          targetTable = "product_variants";
        }
      }

      if (!tracked) {
        const [pRows] = await conn.query(
          `SELECT stock_quantity, stock_threshold_low FROM products WHERE id = ? FOR UPDATE`,
          [productId]
        );
        const p = (pRows as any[])[0];
        if (!p) {
          await conn.query("ROLLBACK");
          throw new Error(`Product ${productId} not found`);
        }
        if (p.stock_quantity !== null && p.stock_quantity !== undefined) {
          tracked = true;
          balance = Number(p.stock_quantity);
          threshold = Number(p.stock_threshold_low ?? 5);
        }
      }

      /* Untracked → log nothing, return early */
      if (!tracked) {
        await conn.query("COMMIT");
        return { balance: null, status: "unlimited", movement_id: null };
      }

      /* Hard guard against overselling — fail loud rather than silently clamp */
      if (delta < 0 && (balance || 0) + delta < 0) {
        await conn.query("ROLLBACK");
        const err: any = new Error(
          `Insufficient stock for product ${productId}${variantId ? ` variant ${variantId}` : ""}: ` +
          `have ${balance}, requested ${Math.abs(delta)}`
        );
        err.code = "INSUFFICIENT_STOCK";
        throw err;
      }

      const newBalance = Math.max(0, (balance || 0) + delta);
      const status = computeStatus(newBalance, threshold);

      if (targetTable === "product_variants") {
        await conn.query(
          `UPDATE product_variants SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newBalance, variantId]
        );
        /* Sync product status from variant aggregate so catalog filters work */
        await this.recomputeProductStatusFromVariants(conn, productId);
      } else {
        await conn.query(
          `UPDATE products SET stock_quantity = ?, stock_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newBalance, status, productId]
        );
      }

      const [movRes] = await conn.query(
        `INSERT INTO stock_movements
           (product_id, variant_id, delta, reason, balance_after, order_id, user_id, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
         RETURNING id`,
        [
          productId,
          variantId || null,
          delta,
          reason,
          newBalance,
          orderId || null,
          userId || null,
          JSON.stringify(meta || {}),
        ]
      );
      const movementId = Array.isArray(movRes) && (movRes as any[])[0]?.id ? Number((movRes as any[])[0].id) : null;

      await conn.query("COMMIT");
      return { balance: newBalance, status, movement_id: movementId };
    } catch (e: any) {
      try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Recompute and persist product stock_status from current quantities.
   * Use after manual edits to the row outside of adjust().
   */
  async recomputeStatus(productId: string): Promise<ProductStockStatus> {
    const p = await queryOne<any>(
      `SELECT stock_quantity, stock_threshold_low FROM products WHERE id = ?`,
      [productId]
    );
    if (!p) return "unlimited";
    const qty = p.stock_quantity === null || p.stock_quantity === undefined ? null : Number(p.stock_quantity);
    const thr = Number(p.stock_threshold_low ?? 5);
    const status = computeStatus(qty, thr);
    await getPool().query(
      `UPDATE products SET stock_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, productId]
    );
    return status;
  }

  /**
   * List low-stock products for the alerts panel (admin).
   */
  async listLowStock(brandId?: string | null, limit = 50): Promise<any[]> {
    const params: any[] = [];
    let where = "stock_quantity IS NOT NULL AND stock_quantity <= stock_threshold_low AND active = TRUE";
    if (brandId) {
      where += " AND brand_id = ?";
      params.push(brandId);
    }
    params.push(limit);
    const rows = await getPool().query(
      `SELECT id, name, category, stock_quantity, stock_threshold_low, stock_status, image_url
         FROM products
        WHERE ${where}
        ORDER BY stock_quantity ASC, name ASC
        LIMIT ?`,
      params
    );
    const arr: any = rows;
    return Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : arr;
  }

  /**
   * Recent movements for product audit view.
   */
  async listMovements(productId: string, limit = 50): Promise<any[]> {
    const rows = await getPool().query(
      `SELECT id, variant_id, delta, reason, balance_after, order_id, user_id, meta_json, created_at
         FROM stock_movements
        WHERE product_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      [productId, limit]
    );
    const arr: any = rows;
    return Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : arr;
  }

  /* ── internals ── */

  private async getProductName(productId: string): Promise<string | undefined> {
    const r = await queryOne<any>(`SELECT name FROM products WHERE id = ?`, [productId]);
    return r?.name;
  }

  /**
   * Aggregate variant stock into the parent product's status so storefront
   * filters and badges keep working when the product itself has no stock_quantity.
   */
  private async recomputeProductStatusFromVariants(conn: any, productId: string): Promise<void> {
    const [rows] = await conn.query(
      `SELECT pv.stock_quantity, p.stock_threshold_low
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
        WHERE pv.product_id = ? AND pv.is_active = TRUE`,
      [productId]
    );
    const variants = (rows as any[]) || [];
    if (variants.length === 0) return;
    const threshold = Number(variants[0].stock_threshold_low ?? 5);
    let anyInStock = false;
    let anyLowStock = false;
    let allUntracked = true;
    for (const v of variants) {
      if (v.stock_quantity === null || v.stock_quantity === undefined) continue;
      allUntracked = false;
      const qty = Number(v.stock_quantity);
      if (qty > threshold) anyInStock = true;
      else if (qty > 0) anyLowStock = true;
    }
    if (allUntracked) return; // leave product status as-is
    const newStatus: ProductStockStatus = anyInStock ? "in_stock" : anyLowStock ? "low_stock" : "out_of_stock";
    await conn.query(
      `UPDATE products SET stock_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, productId]
    );
  }
}

export const productStockService = new ProductStockService();

/**
 * Reserve stock for a new order: pre-check then atomically decrement each item.
 * Throws { code: "INSUFFICIENT_STOCK", shortages } on any shortage — the caller
 * (orders route) should map that to a 409 response with the shortage list.
 */
export async function reserveStockForOrder(
  items: AvailabilityItem[],
  orderId: string,
  userId?: string | null
): Promise<void> {
  const check = await productStockService.checkAvailability(items);
  if (!check.ok) {
    const msg = check.shortages
      .map((s) => `${s.product_name || s.product_id}: pediu ${s.requested}, disponível ${s.available}`)
      .join("; ");
    const err: any = new Error(`Estoque insuficiente: ${msg}`);
    err.code = "INSUFFICIENT_STOCK";
    err.shortages = check.shortages;
    throw err;
  }
  for (const item of items) {
    await productStockService.adjust({
      productId: item.product_id,
      variantId: item.variant_id || null,
      delta: -Math.abs(item.quantity),
      reason: "order:created",
      orderId,
      userId,
    });
  }
}

/**
 * Release stock for a cancelled/refunded order. Best-effort: failures are
 * logged but don't throw — releasing on cancel is not worth blocking the cancel.
 */
export async function releaseStockForOrder(
  items: AvailabilityItem[],
  orderId: string,
  reason: "order:cancelled" | "order:refunded",
  userId?: string | null
): Promise<void> {
  for (const item of items) {
    try {
      await productStockService.adjust({
        productId: item.product_id,
        variantId: item.variant_id || null,
        delta: Math.abs(item.quantity),
        reason,
        orderId,
        userId,
      });
    } catch (e: any) {
      logger.warn(`releaseStock failed for ${item.product_id}: ${e?.message || e}`);
    }
  }
}
