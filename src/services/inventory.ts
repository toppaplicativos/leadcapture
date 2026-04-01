import { query, queryOne, update } from "../config/database";
import { v4 as uuidv4 } from "uuid";

/* ─────────── Types ─────────── */

export type MovementType =
  | "entrada"
  | "saida"
  | "ajuste"
  | "reserva"
  | "liberacao"
  | "expedicao";

export type MovementSource =
  | "pedido"
  | "manual"
  | "devolucao"
  | "inventario"
  | "perda"
  | "avaria"
  | "correcao"
  | "reposicao"
  | "sistema";

export type StockStatus = "normal" | "baixo" | "zerado";

export interface InventoryRecord {
  id: string;
  product_id: string;
  user_id: string;
  brand_id: string | null;
  stock_current: number;
  stock_reserved: number;
  stock_available: number;
  stock_min: number;
  cost_price: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  user_id: string;
  brand_id: string | null;
  type: MovementType;
  quantity: number;
  source: MovementSource;
  reference_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockProduct extends InventoryRecord {
  product_name: string;
  product_sku: string | null;
  product_price: number;
  product_image: string | null;
  product_unit: string;
  product_type: string;
  status: StockStatus;
}

/* ─────────── Service ─────────── */

export class InventoryService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) {
      await this.schemaPromise;
      return;
    }

    this.schemaPromise = (async () => {
      // Core inventory table – one row per product
      await query(`
        CREATE TABLE IF NOT EXISTS inventory (
          id VARCHAR(36) PRIMARY KEY,
          product_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          stock_current INT NOT NULL DEFAULT 0,
          stock_reserved INT NOT NULL DEFAULT 0,
          stock_available INT NOT NULL DEFAULT 0,
          stock_min INT NOT NULL DEFAULT 5,
          cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_inv_product (product_id, user_id, brand_id),
          KEY idx_inv_user_brand (user_id, brand_id),
          KEY idx_inv_available (stock_available)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Movement log – immutable audit trail
      await query(`
        CREATE TABLE IF NOT EXISTS inventory_movements (
          id VARCHAR(36) PRIMARY KEY,
          product_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          type VARCHAR(20) NOT NULL,
          quantity INT NOT NULL,
          stock_before INT NOT NULL DEFAULT 0,
          stock_after INT NOT NULL DEFAULT 0,
          source VARCHAR(30) NOT NULL DEFAULT 'manual',
          reference_id VARCHAR(64) NULL,
          reason TEXT NULL,
          created_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_mov_product (product_id),
          KEY idx_mov_user_brand (user_id, brand_id),
          KEY idx_mov_type (type),
          KEY idx_mov_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Reservations linked to orders
      await query(`
        CREATE TABLE IF NOT EXISTS stock_reservations (
          id VARCHAR(36) PRIMARY KEY,
          product_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          order_id VARCHAR(36) NOT NULL,
          quantity INT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_res_order (order_id),
          KEY idx_res_product (product_id),
          KEY idx_res_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      this.schemaReady = true;
    })().finally(() => {
      this.schemaPromise = null;
    });

    await this.schemaPromise;
  }

  /* ─────── helpers ─────── */

  private computeStatus(available: number, min: number): StockStatus {
    if (available <= 0) return "zerado";
    if (available <= min) return "baixo";
    return "normal";
  }

  private async getOrCreateInventory(
    productId: string,
    userId: string,
    brandId: string | null
  ): Promise<InventoryRecord> {
    await this.ensureSchema();

    let row = await queryOne<InventoryRecord>(
      `SELECT * FROM inventory WHERE product_id = ? AND user_id = ? AND COALESCE(brand_id,'') = COALESCE(?,'') LIMIT 1`,
      [productId, userId, brandId || null]
    );

    if (!row) {
      const id = uuidv4();
      await query(
        `INSERT INTO inventory (id, product_id, user_id, brand_id, stock_current, stock_reserved, stock_available, stock_min, cost_price)
         VALUES (?, ?, ?, ?, 0, 0, 0, 5, 0)`,
        [id, productId, userId, brandId || null]
      );
      row = await queryOne<InventoryRecord>(
        `SELECT * FROM inventory WHERE id = ? LIMIT 1`,
        [id]
      );
    }

    return row!;
  }

  private async recordMovement(params: {
    productId: string;
    userId: string;
    brandId: string | null;
    type: MovementType;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    source: MovementSource;
    referenceId?: string | null;
    reason?: string | null;
    createdBy?: string | null;
  }): Promise<void> {
    const id = uuidv4();
    await query(
      `INSERT INTO inventory_movements
        (id, product_id, user_id, brand_id, type, quantity, stock_before, stock_after, source, reference_id, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.productId,
        params.userId,
        params.brandId || null,
        params.type,
        params.quantity,
        params.stockBefore,
        params.stockAfter,
        params.source,
        params.referenceId || null,
        params.reason || null,
        params.createdBy || null,
      ]
    );
  }

  /* ─────── 1. Overview / Dashboard ─────── */

  async getOverview(
    userId: string,
    brandId: string | null
  ): Promise<Record<string, any>> {
    await this.ensureSchema();
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const baseParams = brandId ? [userId, brandId] : [userId];

    const summary = await queryOne<any>(
      `SELECT
        COUNT(*) AS total_products,
        SUM(CASE WHEN i.stock_available <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
        SUM(CASE WHEN i.stock_available > 0 AND i.stock_available <= i.stock_min THEN 1 ELSE 0 END) AS low_stock,
        SUM(i.stock_current * i.cost_price) AS total_value,
        SUM(i.stock_current) AS total_units,
        SUM(i.stock_reserved) AS total_reserved
       FROM inventory i
       WHERE i.user_id = ? AND ${bc}`,
      baseParams
    );

    const todayParams = brandId ? [userId, brandId] : [userId];
    const todayBc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";

    const todayMovements = await queryOne<any>(
      `SELECT
        SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) AS entries_today,
        SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END) AS exits_today
       FROM inventory_movements m
       WHERE m.user_id = ? AND ${todayBc}
         AND DATE(m.created_at) = CURDATE()`,
      todayParams
    );

    // Top selling (most exits in last 30 days)
    const topSelling = await query<any[]>(
      `SELECT m.product_id, COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              SUM(m.quantity) AS total_sold
       FROM inventory_movements m
       LEFT JOIN commerce_products p ON p.id = m.product_id
       LEFT JOIN products p2 ON p2.id = m.product_id
       WHERE m.user_id = ? AND ${todayBc}
         AND m.type IN ('saida','expedicao')
         AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY m.product_id, product_name
       ORDER BY total_sold DESC
       LIMIT 5`,
      todayParams
    );

    // Stale products (no movement in 30+ days)
    const staleProducts = await query<any[]>(
      `SELECT i.product_id, COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              i.stock_current,
              MAX(m.created_at) AS last_movement
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       LEFT JOIN inventory_movements m ON m.product_id = i.product_id AND m.user_id = i.user_id
       WHERE i.user_id = ? AND ${bc} AND i.stock_current > 0
       GROUP BY i.product_id, product_name, i.stock_current
       HAVING MAX(m.created_at) IS NULL OR MAX(m.created_at) < DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY i.stock_current DESC
       LIMIT 5`,
      baseParams
    );

    return {
      total_products: Number(summary?.total_products || 0),
      out_of_stock: Number(summary?.out_of_stock || 0),
      low_stock: Number(summary?.low_stock || 0),
      total_value: Number(summary?.total_value || 0),
      total_units: Number(summary?.total_units || 0),
      total_reserved: Number(summary?.total_reserved || 0),
      entries_today: Number(todayMovements?.entries_today || 0),
      exits_today: Number(todayMovements?.exits_today || 0),
      top_selling: topSelling || [],
      stale_products: staleProducts || [],
    };
  }

  /* ─────── 2. Product Stock List ─────── */

  async listStock(
    userId: string,
    brandId: string | null,
    filters?: { status?: StockStatus; search?: string; page?: number; limit?: number }
  ): Promise<{ items: StockProduct[]; total: number }> {
    await this.ensureSchema();
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const params: any[] = brandId ? [userId, brandId] : [userId];

    let where = `i.user_id = ? AND ${bc}`;

    if (filters?.status === "zerado") {
      where += " AND i.stock_available <= 0";
    } else if (filters?.status === "baixo") {
      where += " AND i.stock_available > 0 AND i.stock_available <= i.stock_min";
    } else if (filters?.status === "normal") {
      where += " AND i.stock_available > i.stock_min";
    }

    if (filters?.search) {
      where += " AND (COALESCE(p.nome,'') LIKE ? OR COALESCE(p2.name,'') LIKE ? OR COALESCE(p.id,'') LIKE ?)";
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    const countRow = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       WHERE ${where}`,
      params
    );

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const rows = await query<any[]>(
      `SELECT i.*,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              COALESCE(p.id, p2.id) AS product_sku,
              COALESCE(p.preco, p2.price, 0) AS product_price,
              COALESCE(p.imagem, p2.image_url) AS product_image,
              COALESCE(p2.unit, 'unidade') AS product_unit,
              COALESCE(p.tipo, 'fisico') AS product_type
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       WHERE ${where}
       ORDER BY i.stock_available ASC, product_name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items: StockProduct[] = (rows || []).map((r: any) => ({
      ...r,
      stock_current: Number(r.stock_current || 0),
      stock_reserved: Number(r.stock_reserved || 0),
      stock_available: Number(r.stock_available || 0),
      stock_min: Number(r.stock_min || 5),
      cost_price: Number(r.cost_price || 0),
      product_price: Number(r.product_price || 0),
      product_unit: String(r.product_unit || 'unidade'),
      product_type: String(r.product_type || 'fisico'),
      status: this.computeStatus(
        Number(r.stock_available || 0),
        Number(r.stock_min || 5)
      ),
    }));

    return { items, total: Number(countRow?.total || 0) };
  }

  /* ─────── 3. Single Product Stock ─────── */

  async getProductStock(
    userId: string,
    brandId: string | null,
    productId: string
  ): Promise<StockProduct | null> {
    await this.ensureSchema();
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const params = brandId
      ? [productId, userId, brandId]
      : [productId, userId];

    const row = await queryOne<any>(
      `SELECT i.*,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              COALESCE(p.id, p2.id) AS product_sku,
              COALESCE(p.preco, p2.price, 0) AS product_price,
              COALESCE(p.imagem, p2.image_url) AS product_image,
              COALESCE(p2.unit, 'unidade') AS product_unit,
              COALESCE(p.tipo, 'fisico') AS product_type
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       WHERE i.product_id = ? AND i.user_id = ? AND ${bc}
       LIMIT 1`,
      params
    );

    if (!row) return null;

    return {
      ...row,
      stock_current: Number(row.stock_current || 0),
      stock_reserved: Number(row.stock_reserved || 0),
      stock_available: Number(row.stock_available || 0),
      stock_min: Number(row.stock_min || 5),
      cost_price: Number(row.cost_price || 0),
      product_price: Number(row.product_price || 0),
      product_unit: String(row.product_unit || 'unidade'),
      product_type: String(row.product_type || 'fisico'),
      status: this.computeStatus(
        Number(row.stock_available || 0),
        Number(row.stock_min || 5)
      ),
    };
  }

  /* ─────── 4. Add Stock (entrada) ─────── */

  async addStock(
    userId: string,
    brandId: string | null,
    productId: string,
    quantity: number,
    source: MovementSource = "manual",
    reason?: string,
    createdBy?: string,
    referenceId?: string
  ): Promise<InventoryRecord> {
    if (quantity <= 0) throw new Error("Quantidade deve ser positiva");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);
    const before = inv.stock_current;
    const after = before + quantity;

    await query(
      `UPDATE inventory SET stock_current = ?, stock_available = stock_available + ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [after, quantity, inv.id]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "entrada",
      quantity,
      stockBefore: before,
      stockAfter: after,
      source,
      referenceId,
      reason,
      createdBy,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 5. Remove Stock (saida) ─────── */

  async removeStock(
    userId: string,
    brandId: string | null,
    productId: string,
    quantity: number,
    source: MovementSource = "manual",
    reason?: string,
    createdBy?: string,
    referenceId?: string
  ): Promise<InventoryRecord> {
    if (quantity <= 0) throw new Error("Quantidade deve ser positiva");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);

    if (inv.stock_available < quantity) {
      throw new Error(
        `Estoque insuficiente. Disponível: ${inv.stock_available}, Solicitado: ${quantity}`
      );
    }

    const before = inv.stock_current;
    const after = before - quantity;

    await query(
      `UPDATE inventory SET stock_current = ?, stock_available = stock_available - ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [after, quantity, inv.id]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "saida",
      quantity,
      stockBefore: before,
      stockAfter: after,
      source,
      referenceId,
      reason,
      createdBy,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 6. Adjust Stock (ajuste) ─────── */

  async adjustStock(
    userId: string,
    brandId: string | null,
    productId: string,
    newQuantity: number,
    reason: string,
    createdBy?: string
  ): Promise<InventoryRecord> {
    if (newQuantity < 0) throw new Error("Quantidade não pode ser negativa");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);
    const before = inv.stock_current;
    const diff = newQuantity - before;
    const newAvailable = inv.stock_available + diff;

    await query(
      `UPDATE inventory SET stock_current = ?, stock_available = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newQuantity, Math.max(0, newAvailable), inv.id]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "ajuste",
      quantity: Math.abs(diff),
      stockBefore: before,
      stockAfter: newQuantity,
      source: "inventario",
      reason,
      createdBy,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 7. Reserve Stock (order.created) ─────── */

  async reserveStock(
    userId: string,
    brandId: string | null,
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<InventoryRecord> {
    if (quantity <= 0) throw new Error("Quantidade deve ser positiva");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);

    if (inv.stock_available < quantity) {
      throw new Error(
        `Estoque insuficiente para reserva. Disponível: ${inv.stock_available}, Solicitado: ${quantity}`
      );
    }

    const before = inv.stock_current;

    await query(
      `UPDATE inventory SET stock_reserved = stock_reserved + ?, stock_available = stock_available - ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [quantity, quantity, inv.id]
    );

    // Record reservation
    const resId = uuidv4();
    await query(
      `INSERT INTO stock_reservations (id, product_id, user_id, brand_id, order_id, quantity, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [resId, productId, userId, brandId || null, orderId, quantity]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "reserva",
      quantity,
      stockBefore: before,
      stockAfter: before,
      source: "pedido",
      referenceId: orderId,
      reason: `Reserva para pedido ${orderId}`,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 8. Release Reservation (order.cancelled) ─────── */

  async releaseStock(
    userId: string,
    brandId: string | null,
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<InventoryRecord> {
    if (quantity <= 0) throw new Error("Quantidade deve ser positiva");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);
    const releaseQty = Math.min(quantity, inv.stock_reserved);

    if (releaseQty > 0) {
      await query(
        `UPDATE inventory SET stock_reserved = stock_reserved - ?, stock_available = stock_available + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [releaseQty, releaseQty, inv.id]
      );
    }

    // Mark reservation as cancelled
    await query(
      `UPDATE stock_reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND product_id = ? AND status = 'active'`,
      [orderId, productId]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "liberacao",
      quantity: releaseQty,
      stockBefore: inv.stock_current,
      stockAfter: inv.stock_current,
      source: "pedido",
      referenceId: orderId,
      reason: `Liberação de reserva do pedido ${orderId}`,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 9. Confirm Stock (order.payment_confirmed) ─────── */

  async confirmStockDeduction(
    userId: string,
    brandId: string | null,
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<InventoryRecord> {
    if (quantity <= 0) throw new Error("Quantidade deve ser positiva");
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);
    const deductReserved = Math.min(quantity, inv.stock_reserved);
    const before = inv.stock_current;
    const after = before - quantity;

    await query(
      `UPDATE inventory SET stock_current = ?, stock_reserved = stock_reserved - ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [Math.max(0, after), deductReserved, inv.id]
    );

    // Mark reservation confirmed
    await query(
      `UPDATE stock_reservations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND product_id = ? AND status = 'active'`,
      [orderId, productId]
    );

    await this.recordMovement({
      productId,
      userId,
      brandId,
      type: "saida",
      quantity,
      stockBefore: before,
      stockAfter: Math.max(0, after),
      source: "pedido",
      referenceId: orderId,
      reason: `Dedução por pagamento confirmado - pedido ${orderId}`,
    });

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 10. Register Expedition ─────── */

  async registerExpedition(
    userId: string,
    brandId: string | null,
    orderId: string,
    createdBy?: string
  ): Promise<{ movements: InventoryMovement[] }> {
    await this.ensureSchema();

    // Get order items
    const items = await query<any[]>(
      `SELECT product_id, quantidade FROM commerce_order_items WHERE order_id = ?`,
      [orderId]
    );

    const movements: InventoryMovement[] = [];

    for (const item of items || []) {
      if (!item.product_id) continue;
      const inv = await this.getOrCreateInventory(item.product_id, userId, brandId);
      const qty = Number(item.quantidade || 1);
      const movId = uuidv4();

      await query(
        `INSERT INTO inventory_movements
          (id, product_id, user_id, brand_id, type, quantity, stock_before, stock_after, source, reference_id, reason, created_by)
         VALUES (?, ?, ?, ?, 'expedicao', ?, ?, ?, 'pedido', ?, 'Expedição do pedido', ?)`,
        [
          movId,
          item.product_id,
          userId,
          brandId || null,
          qty,
          inv.stock_current,
          inv.stock_current,
          orderId,
          createdBy || null,
        ]
      );

      movements.push({
        id: movId,
        product_id: item.product_id,
        user_id: userId,
        brand_id: brandId,
        type: "expedicao",
        quantity: qty,
        source: "pedido",
        reference_id: orderId,
        reason: "Expedição do pedido",
        created_by: createdBy || null,
        created_at: new Date().toISOString(),
      });
    }

    return { movements };
  }

  /* ─────── 11. Movements List ─────── */

  async listMovements(
    userId: string,
    brandId: string | null,
    filters?: {
      productId?: string;
      type?: MovementType;
      source?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ items: any[]; total: number }> {
    await this.ensureSchema();
    const bc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";
    const params: any[] = brandId ? [userId, brandId] : [userId];
    let where = `m.user_id = ? AND ${bc}`;

    if (filters?.productId) {
      where += " AND m.product_id = ?";
      params.push(filters.productId);
    }
    if (filters?.type) {
      where += " AND m.type = ?";
      params.push(filters.type);
    }
    if (filters?.source) {
      where += " AND m.source = ?";
      params.push(filters.source);
    }
    if (filters?.dateFrom) {
      where += " AND m.created_at >= ?";
      params.push(filters.dateFrom);
    }
    if (filters?.dateTo) {
      where += " AND m.created_at <= ?";
      params.push(filters.dateTo);
    }

    const countRow = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM inventory_movements m WHERE ${where}`,
      params
    );

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const rows = await query<any[]>(
      `SELECT m.*, COALESCE(p.nome, p2.name, 'Produto') AS product_name
       FROM inventory_movements m
       LEFT JOIN commerce_products p ON p.id = m.product_id
       LEFT JOIN products p2 ON p2.id = m.product_id
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows || [],
      total: Number(countRow?.total || 0),
    };
  }

  /* ─────── 12. Product History (timeline) ─────── */

  async getProductHistory(
    userId: string,
    brandId: string | null,
    productId: string,
    limit: number = 50
  ): Promise<any[]> {
    await this.ensureSchema();
    const bc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";
    const params = brandId
      ? [productId, userId, brandId, Math.min(200, limit)]
      : [productId, userId, Math.min(200, limit)];

    return (
      (await query<any[]>(
        `SELECT m.*, COALESCE(p.nome, p2.name, 'Produto') AS product_name
         FROM inventory_movements m
         LEFT JOIN commerce_products p ON p.id = m.product_id
         LEFT JOIN products p2 ON p2.id = m.product_id
         WHERE m.product_id = ? AND m.user_id = ? AND ${bc}
         ORDER BY m.created_at DESC
         LIMIT ?`,
        params
      )) || []
    );
  }

  /* ─────── 13. Alerts ─────── */

  async getAlerts(
    userId: string,
    brandId: string | null
  ): Promise<any[]> {
    await this.ensureSchema();
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const params = brandId ? [userId, brandId] : [userId];

    const rows = await query<any[]>(
      `SELECT i.product_id,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              i.stock_current,
              i.stock_available,
              i.stock_min,
              CASE
                WHEN i.stock_available <= 0 THEN 'zerado'
                WHEN i.stock_available <= i.stock_min THEN 'baixo'
                ELSE 'normal'
              END AS alert_type
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       WHERE i.user_id = ? AND ${bc}
         AND (i.stock_available <= 0 OR i.stock_available <= i.stock_min)
       ORDER BY i.stock_available ASC`,
      params
    );

    return rows || [];
  }

  /* ─────── 14. Analytics ─────── */

  async getAnalytics(
    userId: string,
    brandId: string | null
  ): Promise<Record<string, any>> {
    await this.ensureSchema();
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const mbc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";
    const baseParams = brandId ? [userId, brandId] : [userId];

    // ABC curve - by value (stock_current * cost_price)
    const abcCurve = await query<any[]>(
      `SELECT i.product_id,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              i.stock_current,
              i.cost_price,
              (i.stock_current * i.cost_price) AS stock_value
       FROM inventory i
       LEFT JOIN commerce_products p ON p.id = i.product_id
       LEFT JOIN products p2 ON p2.id = i.product_id
       WHERE i.user_id = ? AND ${bc} AND i.stock_current > 0
       ORDER BY stock_value DESC
       LIMIT 50`,
      baseParams
    );

    // Turnover rate (average days between entries and exits per product)
    const turnover = await query<any[]>(
      `SELECT m.product_id,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END) AS total_exits,
              i.stock_current,
              CASE
                WHEN SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END) > 0
                THEN ROUND(i.stock_current * 30.0 / SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END), 1)
                ELSE NULL
              END AS days_of_stock
       FROM inventory_movements m
       JOIN inventory i ON i.product_id = m.product_id AND i.user_id = m.user_id
       LEFT JOIN commerce_products p ON p.id = m.product_id
       LEFT JOIN products p2 ON p2.id = m.product_id
       WHERE m.user_id = ? AND ${mbc}
         AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY m.product_id, product_name, i.stock_current
       ORDER BY total_exits DESC
       LIMIT 20`,
      baseParams
    );

    // Daily movement summary (last 30 days)
    const dailySummary = await query<any[]>(
      `SELECT DATE(m.created_at) AS day,
              SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) AS entries,
              SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END) AS exits,
              SUM(CASE WHEN m.type = 'ajuste' THEN 1 ELSE 0 END) AS adjustments
       FROM inventory_movements m
       WHERE m.user_id = ? AND ${mbc}
         AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(m.created_at)
       ORDER BY day DESC`,
      baseParams
    );

    return {
      abc_curve: abcCurve || [],
      turnover: turnover || [],
      daily_summary: dailySummary || [],
    };
  }

  /* ─────── 15. Reports ─────── */

  async getReports(
    userId: string,
    brandId: string | null,
    dateFrom?: string,
    dateTo?: string
  ): Promise<Record<string, any>> {
    await this.ensureSchema();
    const mbc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";
    const baseParams = brandId ? [userId, brandId] : [userId];

    let dateFilter = "";
    const dateParams: any[] = [];
    if (dateFrom) {
      dateFilter += " AND m.created_at >= ?";
      dateParams.push(dateFrom);
    }
    if (dateTo) {
      dateFilter += " AND m.created_at <= ?";
      dateParams.push(dateTo);
    }

    const movementSummary = await queryOne<any>(
      `SELECT
        SUM(CASE WHEN m.type = 'entrada' THEN m.quantity ELSE 0 END) AS total_entries,
        SUM(CASE WHEN m.type IN ('saida','expedicao') THEN m.quantity ELSE 0 END) AS total_exits,
        SUM(CASE WHEN m.type = 'ajuste' THEN 1 ELSE 0 END) AS total_adjustments,
        COUNT(*) AS total_movements
       FROM inventory_movements m
       WHERE m.user_id = ? AND ${mbc}${dateFilter}`,
      [...baseParams, ...dateParams]
    );

    // Top products by exits
    const topExits = await query<any[]>(
      `SELECT m.product_id,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              SUM(m.quantity) AS total
       FROM inventory_movements m
       LEFT JOIN commerce_products p ON p.id = m.product_id
       LEFT JOIN products p2 ON p2.id = m.product_id
       WHERE m.user_id = ? AND ${mbc} AND m.type IN ('saida','expedicao')${dateFilter}
       GROUP BY m.product_id, product_name
       ORDER BY total DESC
       LIMIT 10`,
      [...baseParams, ...dateParams]
    );

    // Least moving products
    const leastMoving = await query<any[]>(
      `SELECT m.product_id,
              COALESCE(p.nome, p2.name, 'Produto') AS product_name,
              SUM(m.quantity) AS total
       FROM inventory_movements m
       LEFT JOIN commerce_products p ON p.id = m.product_id
       LEFT JOIN products p2 ON p2.id = m.product_id
       WHERE m.user_id = ? AND ${mbc} AND m.type IN ('saida','expedicao')${dateFilter}
       GROUP BY m.product_id, product_name
       ORDER BY total ASC
       LIMIT 10`,
      [...baseParams, ...dateParams]
    );

    // Current value
    const bc = brandId
      ? "i.brand_id = ?"
      : "(i.brand_id IS NULL OR i.brand_id = '')";
    const valueRow = await queryOne<any>(
      `SELECT SUM(i.stock_current * i.cost_price) AS total_value,
              SUM(i.stock_current) AS total_units
       FROM inventory i
       WHERE i.user_id = ? AND ${bc}`,
      baseParams
    );

    return {
      movement_summary: {
        total_entries: Number(movementSummary?.total_entries || 0),
        total_exits: Number(movementSummary?.total_exits || 0),
        total_adjustments: Number(movementSummary?.total_adjustments || 0),
        total_movements: Number(movementSummary?.total_movements || 0),
      },
      top_selling: topExits || [],
      least_moving: leastMoving || [],
      stock_value: {
        total_value: Number(valueRow?.total_value || 0),
        total_units: Number(valueRow?.total_units || 0),
      },
    };
  }

  /* ─────── 16. Expedition List ─────── */

  async listExpeditions(
    userId: string,
    brandId: string | null,
    filters?: { page?: number; limit?: number }
  ): Promise<{ items: any[]; total: number }> {
    await this.ensureSchema();
    const mbc = brandId
      ? "m.brand_id = ?"
      : "(m.brand_id IS NULL OR m.brand_id = '')";
    const baseParams = brandId ? [userId, brandId] : [userId];

    const countRow = await queryOne<any>(
      `SELECT COUNT(DISTINCT m.reference_id) AS total
       FROM inventory_movements m
       WHERE m.user_id = ? AND ${mbc} AND m.type = 'expedicao'`,
      baseParams
    );

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const rows = await query<any[]>(
      `SELECT m.reference_id AS order_id,
              MIN(m.created_at) AS expedition_date,
              m.created_by,
              COUNT(*) AS items_count,
              SUM(m.quantity) AS total_units
       FROM inventory_movements m
       WHERE m.user_id = ? AND ${mbc} AND m.type = 'expedicao'
       GROUP BY m.reference_id, m.created_by
       ORDER BY expedition_date DESC
       LIMIT ? OFFSET ?`,
      [...baseParams, limit, offset]
    );

    return {
      items: rows || [],
      total: Number(countRow?.total || 0),
    };
  }

  /* ─────── 17. Update stock_min / cost_price settings ─────── */

  async updateSettings(
    userId: string,
    brandId: string | null,
    productId: string,
    settings: { stock_min?: number; cost_price?: number }
  ): Promise<InventoryRecord> {
    await this.ensureSchema();
    const inv = await this.getOrCreateInventory(productId, userId, brandId);

    const updates: string[] = [];
    const params: any[] = [];

    if (settings.stock_min !== undefined) {
      updates.push("stock_min = ?");
      params.push(Math.max(0, settings.stock_min));
    }
    if (settings.cost_price !== undefined) {
      updates.push("cost_price = ?");
      params.push(Math.max(0, settings.cost_price));
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(inv.id);
      await query(
        `UPDATE inventory SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }

    return (await this.getOrCreateInventory(productId, userId, brandId));
  }

  /* ─────── 18. Bulk init from commerce_products ─────── */

  async syncFromCommerceProducts(
    userId: string,
    brandId: string | null
  ): Promise<{ synced: number }> {
    await this.ensureSchema();
    const bc = brandId
      ? "brand_id = ?"
      : "(brand_id IS NULL OR brand_id = '')";
    const params = brandId ? [userId, brandId] : [userId];

    const products = await query<any[]>(
      `SELECT id, estoque, preco FROM commerce_products WHERE user_id = ? AND ${bc}`,
      params
    );

    let synced = 0;
    for (const p of products || []) {
      const existing = await queryOne<any>(
        `SELECT id FROM inventory WHERE product_id = ? AND user_id = ? AND COALESCE(brand_id,'') = COALESCE(?,'')`,
        [p.id, userId, brandId || null]
      );

      if (!existing) {
        const id = uuidv4();
        const stock = Number(p.estoque || 0);
        await query(
          `INSERT INTO inventory (id, product_id, user_id, brand_id, stock_current, stock_reserved, stock_available, stock_min, cost_price)
           VALUES (?, ?, ?, ?, ?, 0, ?, 5, 0)`,
          [id, p.id, userId, brandId || null, stock, stock]
        );
        synced++;
      }
    }

    return { synced };
  }

  /* ─────── 19. Order event handlers ─────── */

  async handleOrderCreated(
    userId: string,
    brandId: string | null,
    orderId: string,
    items: Array<{ product_id: string; quantity: number }>
  ): Promise<void> {
    for (const item of items) {
      if (!item.product_id) continue;
      try {
        await this.reserveStock(userId, brandId, item.product_id, item.quantity, orderId);
      } catch {
        // Log but don't block order creation
      }
    }
  }

  async handleOrderPaid(
    userId: string,
    brandId: string | null,
    orderId: string,
    items: Array<{ product_id: string; quantity: number }>
  ): Promise<void> {
    for (const item of items) {
      if (!item.product_id) continue;
      try {
        await this.confirmStockDeduction(userId, brandId, item.product_id, item.quantity, orderId);
      } catch {
        // Log but don't block
      }
    }
  }

  async handleOrderCancelled(
    userId: string,
    brandId: string | null,
    orderId: string,
    items: Array<{ product_id: string; quantity: number }>
  ): Promise<void> {
    for (const item of items) {
      if (!item.product_id) continue;
      try {
        await this.releaseStock(userId, brandId, item.product_id, item.quantity, orderId);
      } catch {
        // Log but don't block
      }
    }
  }
}
