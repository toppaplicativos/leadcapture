import { Router, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { AuthRequest } from "../middleware/auth";
import { CommerceService } from "../services/commerce";
import { InventoryService } from "../services/inventory";
import { ClientsService } from "../services/clients";
import { query, queryOne } from "../config/database";
import { ensureMobDeliveryForOrder, getMobTrackingForOrder } from "../services/mobOrderBridge";
import { mobLogisticsService } from "../services/mobLogistics";
import { manufacturingService } from "../services/manufacturing";

const router = Router();
const commerceService = new CommerceService();
const inventoryService = new InventoryService();
const clientsService = new ClientsService();
let auditSchemaPromise: Promise<void> | null = null;

function ensureStockAuditSchema(): Promise<void> {
  if (!auditSchemaPromise) {
    auditSchemaPromise = query(`
      CREATE TABLE IF NOT EXISTS stock_app_audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        manager_user_id VARCHAR(36) NOT NULL,
        manager_email VARCHAR(190),
        action VARCHAR(80) NOT NULL,
        entity_type VARCHAR(60),
        entity_id VARCHAR(80),
        method VARCHAR(10) NOT NULL,
        route VARCHAR(255) NOT NULL,
        status_code INT NOT NULL,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        metadata JSON,
        ip_address VARCHAR(100),
        user_agent VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).then(async () => {
      await query(`CREATE INDEX IF NOT EXISTS idx_stock_audit_brand_date ON stock_app_audit_logs (brand_id, created_at)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_stock_audit_manager_date ON stock_app_audit_logs (manager_user_id, created_at)`);
    }).catch((error) => {
      auditSchemaPromise = null;
      throw error;
    });
  }
  return auditSchemaPromise;
}

function classifyStockAction(method: string, path: string): { action: string; entityType: string } {
  const value = `${method.toUpperCase()} ${path}`;
  if (/orders\/pos/.test(value)) return { action: "pos_sale_created", entityType: "order" };
  if (/\/add$/.test(path)) return { action: "stock_added", entityType: "product" };
  if (/\/remove$/.test(path)) return { action: "stock_removed", entityType: "product" };
  if (/\/adjust$/.test(path)) return { action: "stock_adjusted", entityType: "product" };
  if (/\/settings$/.test(path)) return { action: "stock_settings_updated", entityType: "product" };
  if (/inventory\/sync/.test(path)) return { action: "catalog_synced", entityType: "catalog" };
  if (/expedition.*\/mob/.test(path)) return { action: "delivery_requested", entityType: "order" };
  if (/expedition/.test(path)) return { action: "expedition_updated", entityType: "order" };
  if (/clients/.test(path) && method === "DELETE") return { action: "client_deleted", entityType: "client" };
  if (/clients.*\/status/.test(path)) return { action: "client_status_updated", entityType: "client" };
  if (/clients/.test(path) && method === "POST") return { action: "client_created", entityType: "client" };
  if (/clients/.test(path)) return { action: "client_updated", entityType: "client" };
  if (/products/.test(path)) return { action: "product_updated", entityType: "product" };
  return { action: "operation_updated", entityType: "operation" };
}

function safeAuditMetadata(body: any): Record<string, unknown> {
  const source = body && typeof body === "object" ? body : {};
  const result: Record<string, unknown> = {};
  for (const key of ["quantity", "new_quantity", "reason", "source", "status", "payment_method", "fulfillment", "discount"]) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  if (Array.isArray(source.items)) result.items_count = source.items.length;
  return result;
}

router.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) return next();
  if (String(req.user?.credential_type || "").trim().toLowerCase() !== "estoque") return next();

  try {
    await ensureStockAuditSchema();
  } catch {
    // Auditoria nunca deve interromper a operação principal; a falha será observável nos logs do servidor.
    return next();
  }

  const ownerUserId = String(req.user?.owner_user_id || "").trim();
  const brandId = String(req.user?.brand_id || "").trim();
  const managerUserId = String(req.user?.userId || "").trim();
  if (!ownerUserId || !brandId || !managerUserId) return next();

  const route = req.path;
  const classification = classifyStockAction(req.method, route);
  const entityId = String(req.params?.orderId || req.params?.productId || req.params?.id || "").trim() || null;
  const metadata = safeAuditMetadata(req.body);

  res.once("finish", () => {
    void query(
      `INSERT INTO stock_app_audit_logs
       (id, owner_user_id, brand_id, manager_user_id, manager_email, action, entity_type, entity_id,
        method, route, status_code, success, metadata, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        randomUUID(), ownerUserId, brandId, managerUserId, String(req.user?.email || "").trim() || null,
        classification.action, classification.entityType, entityId, req.method.toUpperCase(), route,
        res.statusCode, res.statusCode < 400, JSON.stringify(metadata),
        String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").slice(0, 100) || null,
        String(req.headers["user-agent"] || "").slice(0, 500) || null,
      ]
    ).catch(() => undefined);
  });
  next();
});

function requireStockCredential(req: AuthRequest, res: Response): { ownerUserId: string; brandId: string; managerUserId: string } | null {
  const credentialType = String(req.user?.credential_type || "").trim().toLowerCase();
  const ownerUserId = String(req.user?.owner_user_id || "").trim();
  const brandId = String(req.user?.brand_id || "").trim();
  const managerUserId = String(req.user?.userId || "").trim();

  if (credentialType !== "estoque") {
    res.status(403).json({ error: "Credencial inválida para app de estoque" });
    return null;
  }

  if (!ownerUserId || !brandId || !managerUserId) {
    res.status(403).json({ error: "Token de estoque incompleto" });
    return null;
  }

  return { ownerUserId, brandId, managerUserId };
}

router.get("/me", async (req: AuthRequest, res: Response) => {
  const context = requireStockCredential(req, res);
  if (!context) return;

  const brand = await queryOne<any>(
    `SELECT id, slug, name, logo_url, primary_color, secondary_color
     FROM brand_units
     WHERE id = ?
     LIMIT 1`,
    [context.brandId]
  );

  const manager = await queryOne<any>(
    `SELECT name, email, phone, last_login_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [context.managerUserId]
  );

  if (!brand) {
    return res.status(403).json({ error: "Brand vinculada ao token de estoque não existe" });
  }

  res.json({
    success: true,
    user: {
      id: context.managerUserId,
      name: String(manager?.name || "Gerente de estoque").trim(),
      email: String(manager?.email || req.user?.email || "").trim() || null,
      phone: String(manager?.phone || "").trim() || null,
      last_login_at: manager?.last_login_at || null,
      role: "manager",
      credential_type: "estoque",
      owner_user_id: context.ownerUserId,
      brand_id: context.brandId,
    },
    brand: {
      id: String(brand.id || "").trim(),
      slug: String(brand.slug || "").trim() || null,
      name: String(brand.name || "").trim() || null,
      logo_url: String(brand.logo_url || "").trim() || null,
      primary_color: String(brand.primary_color || "").trim() || null,
      secondary_color: String(brand.secondary_color || "").trim() || null,
    },
  });
});

router.get("/audit", async (req: AuthRequest, res: Response) => {
  try {
    const context = requireStockCredential(req, res);
    if (!context) return;
    await ensureStockAuditSchema();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 40, 100));
    const rows = await query<any[]>(
      `SELECT id, action, entity_type, entity_id, method, route, status_code, success, metadata, created_at
       FROM stock_app_audit_logs
       WHERE owner_user_id = ? AND brand_id = ? AND manager_user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [context.ownerUserId, context.brandId, context.managerUserId, limit]
    );
    res.json({ success: true, items: rows, total: rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao carregar histórico de atividade" });
  }
});

router.get("/products", async (req: AuthRequest, res: Response) => {
  try {
    const context = requireStockCredential(req, res);
    if (!context) return;

    const products = await commerceService.listProducts(context.ownerUserId, context.brandId);
    res.json({ success: true, products, brand_id: context.brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao listar produtos" });
  }
});

router.put("/products/:id", async (req: AuthRequest, res: Response) => {
  try {
    const context = requireStockCredential(req, res);
    if (!context) return;

    const payload = {
      estoque: req.body?.estoque,
      preco: req.body?.preco,
      preco_promocional: req.body?.preco_promocional,
      ativo: req.body?.ativo,
    };

    const product = await commerceService.updateProduct(
      context.ownerUserId,
      context.brandId,
      String(req.params.id || ""),
      payload
    );

    if (!product) return res.status(404).json({ error: "Produto não encontrado" });

    res.json({ success: true, product, brand_id: context.brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao atualizar produto" });
  }
});

/* ── Inventory routes ── */

router.get("/inventory/overview", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const data = await inventoryService.getOverview(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar overview" });
  }
});

router.get("/inventory/stock", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const filters = {
      status: req.query.status as any,
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 50, 200),
    };
    const data = await inventoryService.listStock(ctx.ownerUserId, ctx.brandId, filters);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar estoque" });
  }
});

router.get("/inventory/stock/:productId", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const data = await inventoryService.getProductStock(ctx.ownerUserId, ctx.brandId, String(req.params.productId));
    if (!data) return res.status(404).json({ error: "Produto não encontrado no inventário" });
    res.json({ success: true, product: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar produto" });
  }
});

router.post("/inventory/stock/:productId/add", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { quantity, reason, source } = req.body || {};
    await inventoryService.addStock(ctx.ownerUserId, ctx.brandId, String(req.params.productId), Number(quantity), source || "manual", String(reason || ""));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao adicionar estoque" });
  }
});

router.post("/inventory/stock/:productId/remove", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { quantity, reason, source } = req.body || {};
    await inventoryService.removeStock(ctx.ownerUserId, ctx.brandId, String(req.params.productId), Number(quantity), source || "manual", String(reason || ""));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao remover estoque" });
  }
});

router.post("/inventory/stock/:productId/adjust", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { new_quantity, reason } = req.body || {};
    await inventoryService.adjustStock(ctx.ownerUserId, ctx.brandId, String(req.params.productId), Number(new_quantity), String(reason || ""));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao ajustar estoque" });
  }
});

router.put("/inventory/stock/:productId/settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { stock_min, cost_price } = req.body || {};
    await inventoryService.updateSettings(ctx.ownerUserId, ctx.brandId, String(req.params.productId), { stock_min, cost_price });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao salvar configurações" });
  }
});

router.get("/inventory/movements", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const filters = {
      type: req.query.type as any,
      source: req.query.source as any,
      product_id: req.query.product_id as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 50, 200),
    };
    const data = await inventoryService.listMovements(ctx.ownerUserId, ctx.brandId, filters);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar movimentações" });
  }
});

router.get("/inventory/movements/:productId", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const data = await inventoryService.getProductHistory(ctx.ownerUserId, ctx.brandId, String(req.params.productId));
    res.json({ success: true, movements: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar histórico" });
  }
});

router.get("/inventory/alerts", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const data = await inventoryService.getAlerts(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, alerts: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar alertas" });
  }
});

router.get("/inventory/analytics", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const data = await inventoryService.getAnalytics(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar analytics" });
  }
});

router.post("/inventory/sync", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const result = await inventoryService.syncFromCommerceProducts(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao sincronizar" });
  }
});

/* ── Aliases for /inventory/products → mirror admin /api/inventory/products
   Allows the InventoryPage to work in stock-mode using the same API surface. ── */

router.get("/inventory/products", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const filters = {
      status: req.query.status as any,
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 50, 200),
    };
    const data = await inventoryService.listStock(ctx.ownerUserId, ctx.brandId, filters);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar produtos" });
  }
});

router.get("/inventory/products/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const product = await inventoryService.getProductStock(ctx.ownerUserId, ctx.brandId, String(req.params.id));
    if (!product) return res.status(404).json({ error: "Produto não encontrado" });
    res.json({ success: true, product });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar produto" });
  }
});

router.get("/inventory/products/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const limit = Number(req.query.limit) || 50;
    const history = await inventoryService.getProductHistory(ctx.ownerUserId, ctx.brandId, String(req.params.id), limit);
    res.json({ success: true, history });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar histórico" });
  }
});

router.post("/inventory/products/:id/add", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { quantity, source, reason, reference_id } = req.body || {};
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ error: "Quantidade inválida" });
    const result = await inventoryService.addStock(
      ctx.ownerUserId, ctx.brandId, String(req.params.id), Number(quantity),
      source || "reposicao", reason, ctx.managerUserId, reference_id
    );
    res.json({ success: true, inventory: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao adicionar estoque" });
  }
});

router.post("/inventory/products/:id/remove", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { quantity, source, reason, reference_id } = req.body || {};
    if (!quantity || Number(quantity) <= 0) return res.status(400).json({ error: "Quantidade inválida" });
    const result = await inventoryService.removeStock(
      ctx.ownerUserId, ctx.brandId, String(req.params.id), Number(quantity),
      source || "manual", reason, ctx.managerUserId, reference_id
    );
    res.json({ success: true, inventory: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao remover estoque" });
  }
});

router.post("/inventory/products/:id/adjust", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { new_quantity, reason } = req.body || {};
    if (new_quantity === undefined || Number(new_quantity) < 0) return res.status(400).json({ error: "Quantidade inválida" });
    if (!reason) return res.status(400).json({ error: "Motivo é obrigatório para ajustes" });
    const result = await inventoryService.adjustStock(
      ctx.ownerUserId, ctx.brandId, String(req.params.id), Number(new_quantity), reason, ctx.managerUserId
    );
    res.json({ success: true, inventory: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao ajustar estoque" });
  }
});

router.put("/inventory/products/:id/settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { stock_min, cost_price } = req.body || {};
    const result = await inventoryService.updateSettings(ctx.ownerUserId, ctx.brandId, String(req.params.id), { stock_min, cost_price });
    res.json({ success: true, inventory: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar configurações" });
  }
});

router.get("/inventory/expedition", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const filters = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    };
    const result = await inventoryService.listExpeditions(ctx.ownerUserId, ctx.brandId, filters);
    const enriched = await Promise.all((result.items || []).map(async (entry: any) => {
      const order = await queryOne<any>(
        `SELECT o.customer_name, o.customer_phone, o.customer_email, o.valor_total AS total,
                o.origem AS origin, o.created_at, m.notes AS delivery_address,
                COALESCE(m.business_status, o.status_pedido) AS status_pedido,
                m.payment_status, m.delivery_status
         FROM commerce_orders o LEFT JOIN order_management_meta m ON m.order_id = o.id
         WHERE o.id = ? AND o.user_id = ? AND o.brand_id = ? LIMIT 1`,
        [entry.order_id, ctx.ownerUserId, ctx.brandId],
      );
      const orderItems = await query<any[]>(
        `SELECT product_id, nome, quantidade, valor_unitario, valor_total
         FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`,
        [entry.order_id],
      );
      const tracking = await getMobTrackingForOrder(ctx.ownerUserId, ctx.brandId, String(entry.order_id)).catch(() => ({ tracking_url: null, delivery_id: null, status: null }));
      return {
        ...entry,
        ...(order || {}),
        items: (orderItems || []).map((item) => ({ product_id: item.product_id, name: item.nome, quantity: Number(item.quantidade || 0), unit_price: Number(item.valor_unitario || 0), total: Number(item.valor_total || 0) })),
        tracking_url: tracking.tracking_url,
        mob_delivery_id: tracking.delivery_id,
        mob_status: tracking.status,
      };
    }));
    res.json({ success: true, ...result, items: enriched });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar expedições" });
  }
});

/**
 * Pedidos pagos ainda não expedidos — fila operacional do gestor de estoque.
 * Also available for admin via rewrite of /api/inventory/expedition/pending.
 */
router.get("/inventory/expedition/pending", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const brandId = ctx.brandId;

    const rows = await query<any[]>(
      `SELECT o.id,
              o.customer_name,
              o.customer_phone,
              o.status_pedido,
              o.origem,
              EXISTS(SELECT 1 FROM affiliate_sales af WHERE af.order_id = o.id LIMIT 1) AS affiliate_order,
              o.customer_email,
              o.valor_total AS total,
              o.created_at,
              m.business_status,
              m.payment_status,
              m.delivery_status,
              m.notes AS delivery_address,
              (SELECT COUNT(*) FROM commerce_order_items i WHERE i.order_id = o.id) AS items_count,
              EXISTS(
                SELECT 1 FROM inventory_movements m
                WHERE m.user_id = o.user_id
                  AND m.brand_id = o.brand_id
                  AND m.type = 'expedicao'
                  AND m.reference_id = o.id
                LIMIT 1
              ) AS already_expedited
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ?
         AND o.brand_id = ?
         AND COALESCE(m.business_status, o.status_pedido) NOT IN ('entregue', 'cancelado')
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [ctx.ownerUserId, brandId, limit]
    );

    const visible = (rows || [])
      .filter((r) => !Number(r.already_expedited))
    const orderIds = visible.map((r) => String(r.id))
    const itemRows = orderIds.length
      ? await query<any[]>(
          `SELECT order_id, product_id, nome, quantidade, valor_unitario, valor_total
           FROM commerce_order_items WHERE order_id IN (${orderIds.map(() => "?").join(",")})
           ORDER BY id ASC`,
          orderIds,
        )
      : []
    const itemsByOrder = new Map<string, any[]>()
    for (const item of itemRows || []) {
      const list = itemsByOrder.get(String(item.order_id)) || []
      list.push({
        product_id: item.product_id || null,
        name: item.nome || "Produto",
        quantity: Number(item.quantidade || 0),
        unit_price: Number(item.valor_unitario || 0),
        total: Number(item.valor_total || 0),
      })
      itemsByOrder.set(String(item.order_id), list)
    }

    const pending = await Promise.all(visible.map(async (r) => {
      const tracking = await getMobTrackingForOrder(ctx.ownerUserId, brandId, String(r.id)).catch(() => ({
        tracking_url: null, delivery_id: null, status: null,
      }))
      return {
        id: String(r.id),
        customer_name: r.customer_name || null,
        customer_phone: r.customer_phone || null,
        customer_email: r.customer_email || null,
        status_pedido: r.business_status || r.status_pedido || "novo",
        payment_status: r.payment_status || (r.status_pedido === "pago" ? "paid" : "pending"),
        delivery_status: r.delivery_status || "nao_iniciado",
        delivery_address: r.delivery_address || null,
        origin: Number(r.affiliate_order) ? "affiliate" : (r.origem || "site"),
        total: Number(r.total || 0),
        created_at: r.created_at,
        items_count: Number(r.items_count || 0),
        items: itemsByOrder.get(String(r.id)) || [],
        mob_delivery_id: tracking.delivery_id,
        mob_status: tracking.status,
        tracking_url: tracking.tracking_url,
        already_expedited: false,
      }
    }));

    res.json({ success: true, orders: pending, total: pending.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar pedidos pendentes" });
  }
});

/** Venda presencial: cria pedido real, reserva estoque e registra pagamento no caixa. */
router.post("/orders/pos", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: "Adicione ao menos um produto" });
    const paymentRaw = String(body.payment_method || "").toLowerCase();
    const paymentMethod = ["dinheiro", "prazo", "a_combinar"].includes(paymentRaw) ? "desconhecido" : paymentRaw;
    if (!["pix", "cartao", "boleto", "desconhecido"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Forma de pagamento inválida" });
    }
    const paymentStatus = body.payment_status === "pending" ? "pending" : "paid";
    const installments = Math.max(1, Math.min(60, Math.trunc(Number(body.installments || 1))));
    const dueDate = String(body.due_date || "").trim() || null;
    const orderNotes = String(body.order_notes || "").trim().slice(0, 2000) || null;
    const deliveryAddress = String(body.delivery_address || "").trim().slice(0, 1000) || null;
    const customerId = String(body.customer_id || "").trim() || null;

    const created = await commerceService.createOrder(ctx.ownerUserId, ctx.brandId, {
      origem: "whatsapp",
      forma_pagamento: paymentMethod,
      customer_name: String(body.customer_name || "Consumidor final").trim(),
      customer_email: String(body.customer_email || "").trim() || undefined,
      customer_phone: String(body.customer_phone || "").trim() || undefined,
      desconto: Math.max(0, Number(body.discount || 0)),
      allow_manual_pricing: true,
      checkout_base_url: `${req.protocol}://${req.get("host") || ""}`,
      itens: rawItems.map((item: any) => ({
        product_id: String(item.product_id || "").trim(),
        nome: String(item.product_name || "Produto").trim(),
        quantidade: Number(item.quantity || 0),
        valor_unitario: Number(item.unit_price || 0),
      })),
    });

    await query(
      `UPDATE commerce_orders
          SET origem = 'pdv', status_pedido = ?, data_pagamento = ?, data_atualizacao = NOW()
        WHERE id = ? AND user_id = ? AND brand_id = ?`,
      [
        paymentStatus === "paid" ? "pago" : "aguardando_pagamento",
        paymentStatus === "paid" ? new Date() : null,
        created.order.id,
        ctx.ownerUserId,
        ctx.brandId,
      ],
    );
    await query(
      `INSERT INTO commerce_order_events (order_id, event_type, payload_json)
       VALUES (?, ?, ?)`,
      [created.order.id, paymentStatus === "paid" ? "venda_pdv_concluida" : "pedido_pdv_criado", JSON.stringify({
        manager_user_id: ctx.managerUserId,
        payment_method: paymentRaw,
        payment_status: paymentStatus,
        installments,
        due_date: dueDate,
        fulfillment: body.fulfillment === "entrega" ? "entrega" : "retirada",
        delivery_address: deliveryAddress,
        order_notes: orderNotes,
        customer_id: customerId,
        customer_email: String(body.customer_email || "").trim() || null,
        pricing_mode: "manual_allowed",
      })],
    ).catch(() => undefined);

    res.status(201).json({
      success: true,
      order: {
        ...created.order,
        status_pedido: paymentStatus === "paid" ? "pago" : "aguardando_pagamento",
        origem: "pdv",
      },
      items: created.items,
      receipt_number: String(created.order.id).slice(0, 8).toUpperCase(),
    });
  } catch (error: any) {
    if (error?.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({ error: error.message, code: error.code, shortages: error.shortages || [] });
    }
    const message = String(error?.message || "Falha ao concluir venda");
    res.status(/obrigat|carrinho|inválid/i.test(message) ? 400 : 500).json({ error: message });
  }
});

router.patch("/inventory/expedition/orders/:orderId", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const orderId = String(req.params.orderId || "").trim();
    const existing = await queryOne<any>(
      `SELECT id FROM commerce_orders WHERE id = ? AND user_id = ? AND brand_id = ? LIMIT 1`,
      [orderId, ctx.ownerUserId, ctx.brandId],
    );
    if (!existing) return res.status(404).json({ error: "Pedido não encontrado" });

    const customerName = String(req.body?.customer_name || "").trim();
    const customerPhone = String(req.body?.customer_phone || "").trim();
    const customerEmail = String(req.body?.customer_email || "").trim();
    const deliveryAddress = String(req.body?.delivery_address || "").trim();
    await query(
      `UPDATE commerce_orders SET customer_name = ?, customer_phone = ?, customer_email = ?, data_atualizacao = NOW()
       WHERE id = ? AND user_id = ? AND brand_id = ?`,
      [customerName || null, customerPhone || null, customerEmail || null, orderId, ctx.ownerUserId, ctx.brandId],
    );
    await query(
      `UPDATE order_management_meta SET notes = ?, updated_at = NOW() WHERE order_id = ? AND user_id = ?`,
      [deliveryAddress || null, orderId, ctx.ownerUserId],
    );
    await query(
      `INSERT INTO order_management_timeline
       (order_id, user_id, brand_id, status, event_key, actor_type, updated_by, payload_json)
       VALUES (?, ?, ?, 'dados_atualizados', 'order.expedition_details_updated', 'admin', ?, ?)`,
      [orderId, ctx.ownerUserId, ctx.brandId, ctx.managerUserId, JSON.stringify({ customerName, customerPhone, customerEmail, deliveryAddress })],
    ).catch(() => undefined);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar pedido" });
  }
});

router.get("/inventory/expedition/mob/couriers", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const memberships = await mobLogisticsService.listMembershipsForOrg(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, couriers: (memberships || []).filter((m: any) => m.status === "approved") });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar entregadores" });
  }
});

router.post("/inventory/expedition/orders/:orderId/mob", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const orderId = String(req.params.orderId || "").trim();
    const order = await queryOne<any>(
      `SELECT o.*, m.notes AS delivery_address, COALESCE(m.business_status, o.status_pedido) AS business_status
       FROM commerce_orders o LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.id = ? AND o.user_id = ? AND o.brand_id = ? LIMIT 1`,
      [orderId, ctx.ownerUserId, ctx.brandId],
    );
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
    if (!['pago', 'em_preparacao', 'em_entrega'].includes(String(order.business_status || ''))) {
      return res.status(409).json({ error: "Confirme o pagamento antes de enviar a entrega ao MOB" });
    }
    const ensured = await ensureMobDeliveryForOrder({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      orderId,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      productsTotal: Number(order.valor_total || 0),
      paymentMethod: order.forma_pagamento,
      deliveryAddress: order.delivery_address,
      businessStatus: order.business_status,
      forceCreate: true,
    });
    if (!ensured.delivery) return res.status(400).json({ error: "Não foi possível criar a entrega no MOB" });
    const courierId = String(req.body?.courier_id || "").trim();
    let delivery = ensured.delivery;
    if (courierId) {
      delivery = await mobLogisticsService.assignCourier({
        deliveryId: delivery.id,
        courierId,
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        actorId: ctx.managerUserId,
        direct: true,
      });
    }
    res.json({ success: true, delivery, tracking_url: ensured.tracking_url });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao integrar entrega ao MOB" });
  }
});

router.post("/inventory/expedition", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { order_id } = req.body || {};
    if (!order_id) return res.status(400).json({ error: "order_id é obrigatório" });
    const result = await inventoryService.registerExpedition(ctx.ownerUserId, ctx.brandId, order_id, ctx.managerUserId);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar expedição" });
  }
});

router.get("/inventory/reports", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const dateFrom = String(req.query.date_from || "") || undefined;
    const dateTo = String(req.query.date_to || "") || undefined;
    const reports = await inventoryService.getReports(ctx.ownerUserId, ctx.brandId, dateFrom, dateTo);
    res.json({ success: true, ...reports });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao gerar relatórios" });
  }
});

router.get("/inventory/export", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;

    const { items } = await inventoryService.listStock(ctx.ownerUserId, ctx.brandId, { limit: 1000 });

    const header = "Produto,SKU,Disponível,Reservado,Total,Estoque Mínimo,Preço Custo,Status\n";
    const rows = (items || [])
      .map(
        (i: any) =>
          `"${String(i.product_name || "").replace(/"/g, '""')}","${i.product_sku || ""}",${i.stock_available},${i.stock_reserved},${i.stock_current},${i.stock_min},${i.cost_price},"${i.status || ""}"`
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="estoque_${new Date().toISOString().split("T")[0]}.csv"`
    );
    res.send("\uFEFF" + header + rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao exportar" });
  }
});

router.get("/categories", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    // Return empty list — categories are managed in admin
    res.json({ success: true, categories: [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar categorias" });
  }
});

/* ── Manufacturing / transformation ── */

function manufacturingScope(ctx: any) {
  return { userId: ctx.ownerUserId, brandId: ctx.brandId, actorId: ctx.managerUserId };
}

router.get("/manufacturing/settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    res.json({ success: true, settings: await manufacturingService.settings(manufacturingScope(ctx)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar configuração de produção" });
  }
});

router.put("/manufacturing/settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const settings = await manufacturingService.updateSettings(manufacturingScope(ctx), req.body || {});
    res.json({ success: true, settings });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar configuração de produção" });
  }
});

router.get("/manufacturing/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    res.json({ success: true, ...(await manufacturingService.dashboard(manufacturingScope(ctx))) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar produção" });
  }
});

router.get("/manufacturing/materials", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    res.json({ success: true, materials: await manufacturingService.listMaterials(manufacturingScope(ctx)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar matérias-primas" });
  }
});

router.get("/manufacturing/lots", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    res.json({
      success: true,
      lots: await manufacturingService.listLots(manufacturingScope(ctx), String(req.query.available || "true") !== "false"),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar lotes" });
  }
});

router.get("/manufacturing/recipes", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    res.json({ success: true, recipes: await manufacturingService.listRecipes(manufacturingScope(ctx)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar fichas técnicas" });
  }
});

router.put("/manufacturing/recipes/:productId", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const recipe = await manufacturingService.saveRecipe(manufacturingScope(ctx), {
      ...(req.body || {}),
      product_id: req.params.productId,
    });
    res.json({ success: true, recipe });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar ficha técnica" });
  }
});

router.post("/manufacturing/plan", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const plan = await manufacturingService.planBatch(manufacturingScope(ctx), req.body || {});
    res.json({ success: true, ...plan });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao calcular consumo" });
  }
});

router.post("/manufacturing/receipts", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const lot = await manufacturingService.receive(manufacturingScope(ctx), req.body || {});
    res.status(201).json({ success: true, lot });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar entrada de matéria-prima" });
  }
});

router.post("/manufacturing/batches", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const batch = await manufacturingService.createBatch(manufacturingScope(ctx), req.body || {});
    res.status(201).json({ success: true, batch });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao concluir produção" });
  }
});

/* ── Client / Customer Management ── */

router.get("/clients", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { status, source, search, page, limit } = req.query;
    const result = await clientsService.getAll(ctx.ownerUserId, {
      status: status as string,
      source: source as string,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? Math.min(parseInt(limit as string), 200) : 50,
      brand_id: ctx.brandId,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar clientes" });
  }
});

router.get("/clients/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const client = await clientsService.getById(String(req.params.id), ctx.ownerUserId, ctx.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao buscar cliente" });
  }
});

router.post("/clients", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    if (!req.body?.name) return res.status(400).json({ error: "Nome obrigatorio" });
    const client = await clientsService.create(ctx.ownerUserId, req.body, ctx.brandId);
    res.status(201).json({ success: true, client });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao criar cliente" });
  }
});

router.put("/clients/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const client = await clientsService.update(String(req.params.id), ctx.ownerUserId, req.body, ctx.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar cliente" });
  }
});

router.patch("/clients/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: "Status obrigatorio" });
    const client = await clientsService.updateStatus(String(req.params.id), ctx.ownerUserId, status, ctx.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar status" });
  }
});

router.delete("/clients/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireStockCredential(req, res);
    if (!ctx) return;
    const ok = await clientsService.delete(String(req.params.id), ctx.ownerUserId, ctx.brandId);
    if (!ok) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao excluir cliente" });
  }
});

export default router;
