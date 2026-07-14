import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { CommerceService } from "../services/commerce";
import { InventoryService } from "../services/inventory";
import { ClientsService } from "../services/clients";
import { query, queryOne } from "../config/database";

const router = Router();
const commerceService = new CommerceService();
const inventoryService = new InventoryService();
const clientsService = new ClientsService();

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

  if (!brand) {
    return res.status(403).json({ error: "Brand vinculada ao token de estoque não existe" });
  }

  res.json({
    success: true,
    user: {
      id: context.managerUserId,
      email: String(req.user?.email || "").trim() || null,
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
    res.json({ success: true, ...result });
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
              o.valor_total AS total,
              o.created_at,
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
       WHERE o.user_id = ?
         AND o.brand_id = ?
         AND o.status_pedido = 'pago'
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [ctx.ownerUserId, brandId, limit]
    );

    const pending = (rows || [])
      .filter((r) => !Number(r.already_expedited))
      .map((r) => ({
        id: String(r.id),
        customer_name: r.customer_name || null,
        customer_phone: r.customer_phone || null,
        status_pedido: r.status_pedido || "pago",
        total: Number(r.total || 0),
        created_at: r.created_at,
        items_count: Number(r.items_count || 0),
        already_expedited: false,
      }));

    res.json({ success: true, orders: pending, total: pending.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar pedidos pendentes" });
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
