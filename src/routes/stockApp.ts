import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { CommerceService } from "../services/commerce";
import { InventoryService } from "../services/inventory";
import { queryOne } from "../config/database";

const router = Router();
const commerceService = new CommerceService();
const inventoryService = new InventoryService();

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
    `SELECT id, slug, name, logo_url
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
    await inventoryService.syncFromCommerceProducts(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao sincronizar" });
  }
});

export default router;
