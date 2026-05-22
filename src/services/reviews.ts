/**
 * Reviews & Social Proof (Fase 14)
 *
 * Customer-submitted product reviews with moderation. The aggregate
 * (avg + count + distribution) is denormalized onto the products row so
 * the public catalog and the cognitive agent can read "★4.7 (23)" with
 * a single SELECT — no JOIN, no aggregation at request time.
 *
 * Workflow:
 *   1. Customer submits via public endpoint → status="pending"
 *   2. Admin moderates (approve / reject) → recomputeProductAggregates
 *   3. Approved reviews appear in catalog + agent context
 *
 * verified_purchase is auto-set when the submitter's phone+order_id match
 * a real order in commerce_orders.
 */
import { randomUUID } from "crypto";
import { getPool, query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Review {
  id: string;
  product_id: string;
  brand_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  rating: number;       // 1-5
  comment: string | null;
  verified_purchase: boolean;
  order_id: string | null;
  status: ReviewStatus;
  created_at: string;
  moderated_at: string | null;
}

export interface ReviewAggregates {
  product_id: string;
  count: number;
  avg: number;             // 0 when count = 0
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  highlights: string[];    // top short snippets from approved reviews (not implemented yet — placeholder)
}

class ReviewsService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) { await this.schemaPromise; return; }

    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS product_reviews (
          id VARCHAR(36) PRIMARY KEY,
          product_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          customer_id VARCHAR(64) NULL,
          customer_name VARCHAR(140) NOT NULL,
          customer_phone VARCHAR(40) NULL,
          rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
          comment TEXT NULL,
          verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
          order_id VARCHAR(64) NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          metadata_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          moderated_at TIMESTAMP NULL
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON product_reviews (product_id, status, created_at DESC)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_reviews_brand_status ON product_reviews (brand_id, status, created_at DESC)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_reviews_phone ON product_reviews (customer_phone) WHERE customer_phone IS NOT NULL`).catch(() => {});

      /* Denormalize aggregates onto products so catalog/agent reads stay cheap.
       * Defensive add-column — Fase 12 used the same pattern for stock columns. */
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_avg DECIMAL(3,2) NOT NULL DEFAULT 0`).catch(() => {});
      await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_count INTEGER NOT NULL DEFAULT 0`).catch(() => {});

      this.schemaReady = true;
    })().finally(() => { this.schemaPromise = null; });

    await this.schemaPromise;
  }

  /* ─── public submission ─── */

  /**
   * Customer-facing creation. Always lands as `pending` (admin moderates).
   * `verified_purchase` is auto-flagged when phone + order_id (or just order_id) match
   * a real order for this product.
   */
  async createPublic(input: {
    productId: string;
    brandId: string | null;
    customerName: string;
    customerPhone?: string | null;
    customerId?: string | null;
    rating: number;
    comment?: string | null;
    orderId?: string | null;
  }): Promise<Review> {
    await this.ensureSchema();
    const rating = Math.max(1, Math.min(5, Math.floor(Number(input.rating) || 0)));
    if (rating < 1) throw new Error("rating deve estar entre 1 e 5");
    const name = String(input.customerName || "").trim();
    if (!name) throw new Error("nome obrigatório");

    let verified = false;
    if (input.orderId) {
      const phone = (input.customerPhone || "").replace(/\D/g, "");
      const order = await queryOne<any>(
        `SELECT o.id
           FROM commerce_orders o
           JOIN commerce_order_items i ON i.order_id = o.id
          WHERE o.id = ? AND i.product_id = ?
            ${phone ? "AND REGEXP_REPLACE(COALESCE(o.customer_phone,''), '\\D', '', 'g') = ?" : ""}
          LIMIT 1`,
        phone
          ? [input.orderId, input.productId, phone]
          : [input.orderId, input.productId]
      ).catch(() => null);
      verified = !!order;
    }

    const id = randomUUID();
    await query(
      `INSERT INTO product_reviews
        (id, product_id, brand_id, customer_id, customer_name, customer_phone,
         rating, comment, verified_purchase, order_id, status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '{}'::jsonb)`,
      [
        id,
        input.productId,
        input.brandId || null,
        input.customerId || null,
        name,
        input.customerPhone || null,
        rating,
        input.comment ? String(input.comment).trim().slice(0, 2000) : null,
        verified,
        input.orderId || null,
      ]
    );
    const created = await queryOne<any>(`SELECT * FROM product_reviews WHERE id = ?`, [id]);
    return this.mapRow(created);
  }

  /* ─── public listing ─── */

  async listForProductPublic(productId: string, limit = 20): Promise<Review[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM product_reviews
        WHERE product_id = ? AND status = 'approved'
        ORDER BY verified_purchase DESC, created_at DESC
        LIMIT ?`,
      [productId, limit]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  /**
   * Aggregate metrics — denormalized into products table but also computable
   * on-the-fly. We return the in-table value for speed; recomputeProductAggregates
   * keeps it in sync.
   */
  async getAggregates(productId: string): Promise<ReviewAggregates> {
    await this.ensureSchema();
    const dist = await query<any[]>(
      `SELECT rating, COUNT(*)::int AS n
         FROM product_reviews
        WHERE product_id = ? AND status = 'approved'
        GROUP BY rating`,
      [productId]
    );
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewAggregates["distribution"];
    let count = 0;
    let sum = 0;
    for (const row of dist || []) {
      const r = Math.max(1, Math.min(5, Number(row.rating))) as 1 | 2 | 3 | 4 | 5;
      const n = Number(row.n) || 0;
      distribution[r] = n;
      count += n;
      sum += r * n;
    }
    const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
    return { product_id: productId, count, avg, distribution, highlights: [] };
  }

  /* ─── admin moderation ─── */

  async listAdmin(brandId: string | null, status: ReviewStatus | "all" = "all", limit = 100): Promise<Review[]> {
    await this.ensureSchema();
    const where: string[] = ["COALESCE(brand_id,'') = COALESCE(?,'')"];
    const params: any[] = [brandId || null];
    if (status !== "all") { where.push("status = ?"); params.push(status); }
    params.push(limit);
    const rows = await query<any[]>(
      `SELECT * FROM product_reviews WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
      params
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  async countPending(brandId: string | null): Promise<number> {
    await this.ensureSchema();
    const r = await queryOne<any>(
      `SELECT COUNT(*)::int AS n FROM product_reviews WHERE COALESCE(brand_id,'') = COALESCE(?,'') AND status = 'pending'`,
      [brandId || null]
    );
    return Number(r?.n || 0);
  }

  async moderate(id: string, status: ReviewStatus): Promise<Review | null> {
    await this.ensureSchema();
    if (!["approved", "rejected", "pending"].includes(status)) throw new Error("status inválido");
    const existing = await queryOne<any>(`SELECT product_id FROM product_reviews WHERE id = ?`, [id]);
    if (!existing) return null;
    await query(
      `UPDATE product_reviews SET status = ?, moderated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );
    /* Recompute aggregates on the product so denorm columns stay accurate. */
    await this.recomputeProductAggregates(String(existing.product_id)).catch((e) =>
      logger.warn(`[reviews] recompute failed for ${existing.product_id}: ${e?.message || e}`)
    );
    const row = await queryOne<any>(`SELECT * FROM product_reviews WHERE id = ?`, [id]);
    return this.mapRow(row);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureSchema();
    const existing = await queryOne<any>(`SELECT product_id FROM product_reviews WHERE id = ?`, [id]);
    if (!existing) return false;
    await query(`DELETE FROM product_reviews WHERE id = ?`, [id]);
    await this.recomputeProductAggregates(String(existing.product_id)).catch(() => {});
    return true;
  }

  /* ─── aggregate maintenance ─── */

  /**
   * Refresh products.reviews_avg + reviews_count from approved reviews.
   * Cheap: 1 query. Called from moderate(), createPublic() after approval,
   * and admin delete().
   */
  async recomputeProductAggregates(productId: string): Promise<void> {
    await this.ensureSchema();
    const r = await queryOne<any>(
      `SELECT COUNT(*)::int AS n, COALESCE(AVG(rating), 0)::float AS avg
         FROM product_reviews
        WHERE product_id = ? AND status = 'approved'`,
      [productId]
    );
    const count = Number(r?.n || 0);
    const avg = count > 0 ? Math.round(Number(r?.avg || 0) * 100) / 100 : 0;
    await getPool().query(
      `UPDATE products SET reviews_count = ?, reviews_avg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [count, avg, productId]
    );
  }

  /* ─── helpers ─── */

  private mapRow(row: any): Review {
    return {
      id: String(row.id),
      product_id: String(row.product_id),
      brand_id: row.brand_id ? String(row.brand_id) : null,
      customer_id: row.customer_id ? String(row.customer_id) : null,
      customer_name: String(row.customer_name || ""),
      customer_phone: row.customer_phone ? String(row.customer_phone) : null,
      rating: Number(row.rating),
      comment: row.comment || null,
      verified_purchase: Boolean(row.verified_purchase),
      order_id: row.order_id ? String(row.order_id) : null,
      status: (row.status as ReviewStatus) || "pending",
      created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
      moderated_at: row.moderated_at ? new Date(row.moderated_at).toISOString() : null,
    };
  }
}

export const reviewsService = new ReviewsService();
