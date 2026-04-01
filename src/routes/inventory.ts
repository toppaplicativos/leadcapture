import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";
import { InventoryService } from "../services/inventory";

const router = Router();
const inventoryService = new InventoryService();
const brandUnitsService = new BrandUnitsService();

/* ─── helpers ─── */

function qs(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] || "");
  return String(val || "");
}

function getRequestedBrandId(req: any): string | null {
  const fromHeader = String(req.headers["x-brand-id"] || "").trim();
  if (fromHeader) return fromHeader;
  const fromQuery = String((req.query || {}).brand_id || "").trim();
  if (fromQuery) return fromQuery;
  const body = (req.body || {}) as Record<string, any>;
  const fromBody = String(body.brand_id || body.brandId || "").trim();
  if (fromBody) return fromBody;
  return null;
}

async function resolveBrandId(req: AuthRequest): Promise<string | null> {
  const userId = req.user?.userId as string | undefined;
  if (!userId) return null;
  return brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
}

/* ═══════════════════════════════════════════
   1. OVERVIEW / DASHBOARD
   ═══════════════════════════════════════════ */

router.get("/overview", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const data = await inventoryService.getOverview(userId, brandId);
    res.json({ success: true, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao carregar visão geral" });
  }
});

/* ═══════════════════════════════════════════
   2. PRODUCT STOCK LIST
   ═══════════════════════════════════════════ */

router.get("/products", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const filters = {
      status: (qs(req.query.status) || undefined) as any,
      search: qs(req.query.search) || undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    };

    const result = await inventoryService.listStock(userId, brandId, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao listar estoque" });
  }
});

/* ═══════════════════════════════════════════
   3. SINGLE PRODUCT STOCK
   ═══════════════════════════════════════════ */

router.get("/products/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const pid = String(req.params.id);
    const product = await inventoryService.getProductStock(userId, brandId, pid);
    if (!product) return res.status(404).json({ error: "Produto não encontrado no estoque" });
    res.json({ success: true, product });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao buscar produto" });
  }
});

/* ═══════════════════════════════════════════
   4. PRODUCT HISTORY (TIMELINE)
   ═══════════════════════════════════════════ */

router.get("/products/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const limit = Number(req.query.limit) || 50;
    const pid = String(req.params.id);
    const history = await inventoryService.getProductHistory(userId, brandId, pid, limit);
    res.json({ success: true, history });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao buscar histórico" });
  }
});

/* ═══════════════════════════════════════════
   5. ADD STOCK (ENTRADA)
   ═══════════════════════════════════════════ */

router.post("/products/:id/add", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { quantity, source, reason, reference_id } = req.body || {};
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: "Quantidade inválida" });
    }

    const pid = String(req.params.id);
    const result = await inventoryService.addStock(
      userId, brandId, pid, Number(quantity),
      source || "reposicao", reason, userId, reference_id
    );
    res.json({ success: true, inventory: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Falha ao adicionar estoque" });
  }
});

/* ═══════════════════════════════════════════
   6. REMOVE STOCK (SAÍDA)
   ═══════════════════════════════════════════ */

router.post("/products/:id/remove", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { quantity, source, reason, reference_id } = req.body || {};
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: "Quantidade inválida" });
    }

    const pid = String(req.params.id);
    const result = await inventoryService.removeStock(
      userId, brandId, pid, Number(quantity),
      source || "manual", reason, userId, reference_id
    );
    res.json({ success: true, inventory: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Falha ao remover estoque" });
  }
});

/* ═══════════════════════════════════════════
   7. ADJUST STOCK (AJUSTE)
   ═══════════════════════════════════════════ */

router.post("/products/:id/adjust", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { new_quantity, reason } = req.body || {};
    if (new_quantity === undefined || Number(new_quantity) < 0) {
      return res.status(400).json({ error: "Quantidade inválida" });
    }
    if (!reason) {
      return res.status(400).json({ error: "Motivo é obrigatório para ajustes" });
    }

    const pid = String(req.params.id);
    const result = await inventoryService.adjustStock(
      userId, brandId, pid, Number(new_quantity), reason, userId
    );
    res.json({ success: true, inventory: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Falha ao ajustar estoque" });
  }
});

/* ═══════════════════════════════════════════
   8. UPDATE STOCK SETTINGS (min / cost_price)
   ═══════════════════════════════════════════ */

router.put("/products/:id/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { stock_min, cost_price } = req.body || {};
    const pid = String(req.params.id);
    const result = await inventoryService.updateSettings(
      userId, brandId, pid, { stock_min, cost_price }
    );
    res.json({ success: true, inventory: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Falha ao atualizar configurações" });
  }
});

/* ═══════════════════════════════════════════
   9. MOVEMENTS LIST
   ═══════════════════════════════════════════ */

router.get("/movements", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const filters = {
      productId: qs(req.query.product_id) || undefined,
      type: (qs(req.query.type) || undefined) as any,
      source: qs(req.query.source) || undefined,
      dateFrom: qs(req.query.date_from) || undefined,
      dateTo: qs(req.query.date_to) || undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    };

    const result = await inventoryService.listMovements(userId, brandId, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao listar movimentações" });
  }
});

/* ═══════════════════════════════════════════
   10. EXPEDITION
   ═══════════════════════════════════════════ */

router.get("/expedition", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const filters = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    };

    const result = await inventoryService.listExpeditions(userId, brandId, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao listar expedições" });
  }
});

router.post("/expedition", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { order_id } = req.body || {};
    if (!order_id) {
      return res.status(400).json({ error: "order_id é obrigatório" });
    }

    const result = await inventoryService.registerExpedition(userId, brandId, order_id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Falha ao registrar expedição" });
  }
});

/* ═══════════════════════════════════════════
   11. ALERTS
   ═══════════════════════════════════════════ */

router.get("/alerts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const alerts = await inventoryService.getAlerts(userId, brandId);
    res.json({ success: true, alerts });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao buscar alertas" });
  }
});

/* ═══════════════════════════════════════════
   12. ANALYTICS
   ═══════════════════════════════════════════ */

router.get("/analytics", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const analytics = await inventoryService.getAnalytics(userId, brandId);
    res.json({ success: true, ...analytics });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao buscar analytics" });
  }
});

/* ═══════════════════════════════════════════
   13. REPORTS
   ═══════════════════════════════════════════ */

router.get("/reports", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const dateFrom = qs(req.query.date_from) || undefined;
    const dateTo = qs(req.query.date_to) || undefined;
    const reports = await inventoryService.getReports(userId, brandId, dateFrom, dateTo);
    res.json({ success: true, ...reports });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao gerar relatórios" });
  }
});

/* ═══════════════════════════════════════════
   14. SYNC FROM COMMERCE PRODUCTS
   ═══════════════════════════════════════════ */

router.post("/sync", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const result = await inventoryService.syncFromCommerceProducts(userId, brandId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao sincronizar produtos" });
  }
});

/* ═══════════════════════════════════════════
   15. EXPORT (CSV)
   ═══════════════════════════════════════════ */

router.get("/export", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const { items } = await inventoryService.listStock(userId, brandId, { limit: 1000 });

    const header = "Produto,SKU,Disponível,Reservado,Total,Estoque Mínimo,Preço Custo,Status\n";
    const rows = items.map((i) =>
      `"${(i.product_name || "").replace(/"/g, '""')}","${i.product_sku || ""}",${i.stock_available},${i.stock_reserved},${i.stock_current},${i.stock_min},${i.cost_price},"${i.status}"`
    ).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="estoque_${new Date().toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + header + rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Falha ao exportar" });
  }
});

export default router;
export { inventoryService };
