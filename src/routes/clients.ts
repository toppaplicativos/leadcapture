import { Router, Response } from "express";
import { ClientsService } from "../services/clients";
import { AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { logger } from "../utils/logger";
import { FlowExecutorService } from "../services/flowExecutor";
import { getPool } from "../config/database";

const router = Router();
const clientsService = new ClientsService();

router.use(attachBrandContext);

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const client = await clientsService.create(req.user!.userId, req.body, req.brandId);
    res.status(201).json({ success: true, client });
    try {
      FlowExecutorService.get().fire("new_lead", req.user!.userId, {
        clientId: client.id,
        name: client.name,
        phone: client.phone,
        city: (client as any).city,
        tags: (client as any).tags ?? [],
        lead_score: (client as any).lead_score ?? 0,
        status: (client as any).status ?? "new",
      }).catch(() => {});
    } catch { /* executor not yet initialized */ }
  } catch (error: any) {
    logger.error(error, "Erro ao criar cliente");
    res.status(500).json({ error: error.message });
  }
});

/* Filter-options pra UI de filtros (similar a /api/customers/filter-options).
   Retorna agregados de status, source, city, state, tags + total. */
router.get("/filter-options", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = req.brandId || undefined;
    const pool = getPool();
    const brandClause = brandId ? "AND (brand_id = ? OR brand_id IS NULL)" : "";
    const brandArgs = brandId ? [brandId] : [];
    const args = [userId, ...brandArgs];

    /* Total */
    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM clients WHERE user_id = ? ${brandClause}`,
      args,
    ) as any;
    const total = Number(totalRes?.rows?.[0]?.n ?? totalRes?.[0]?.n ?? 0);

    /* Helpers: aggregate por coluna */
    const agg = async (col: string) => {
      const r = await pool.query(
        `SELECT ${col} AS value, COUNT(*)::int AS count FROM clients
         WHERE user_id = ? ${brandClause} AND ${col} IS NOT NULL AND ${col}::text <> ''
         GROUP BY ${col} ORDER BY count DESC LIMIT 50`,
        args,
      ) as any;
      return (r?.rows ?? r ?? []).map((row: any) => ({ value: String(row.value), count: Number(row.count) }));
    };

    const [statuses, sources, cities, states] = await Promise.all([
      agg("status").catch(() => []),
      agg("source").catch(() => []),
      agg("city").catch(() => []),
      agg("state").catch(() => []),
    ]);

    /* Tags — extrai tags únicas de jsonb/text array */
    let tags: string[] = [];
    try {
      const tagRes = await pool.query(
        `SELECT DISTINCT tags::text AS t FROM clients
         WHERE user_id = ? ${brandClause} AND tags IS NOT NULL
         LIMIT 500`,
        args,
      ) as any;
      const rows = tagRes?.rows ?? tagRes ?? [];
      const tagSet = new Set<string>();
      for (const row of rows) {
        const raw = String(row.t || '');
        const matches = raw.match(/"([^"]+)"/g) || [];
        for (const m of matches) tagSet.add(m.replace(/^"|"$/g, ''));
      }
      tags = Array.from(tagSet).sort();
    } catch { /* tabela sem coluna tags ou erro — devolve vazio */ }

    res.json({ total, categories: [], statuses, sources, cities, states, tags });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar filter-options de clientes");
    res.status(500).json({ error: error.message });
  }
});

/* Stats agregados (today, week, month, total) */
router.get("/stats", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = req.brandId || undefined;
    const pool = getPool();
    const brandClause = brandId ? "AND (brand_id = ? OR brand_id IS NULL)" : "";
    const args = brandId ? [userId, brandId] : [userId];

    const r = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END)::int AS today_count,
         SUM(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '7 day' THEN 1 ELSE 0 END)::int AS week_count,
         SUM(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '30 day' THEN 1 ELSE 0 END)::int AS month_count
       FROM clients WHERE user_id = ? ${brandClause}`,
      args,
    ) as any;
    /* Pool.query retorna em formatos diferentes (rows vs array direto) — normaliza */
    const row = Array.isArray(r) ? r[0] : (r?.rows?.[0] ?? r?.[0] ?? {});
    const stats = {
      total: Number(row?.total ?? 0),
      today_count: Number(row?.today_count ?? 0),
      week_count: Number(row?.week_count ?? 0),
      month_count: Number(row?.month_count ?? 0),
    };
    res.json({ success: true, stats });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar stats de clientes");
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const { status, source, company_id, search, page, limit } = req.query;
    const result = await clientsService.getAll(req.user!.userId, {
      status: status as string, source: source as string,
      company_id: company_id as string, search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      brand_id: req.brandId || undefined,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(error, "Erro ao listar clientes");
    res.status(500).json({ error: error.message });
  }
});

// IMPORTANT: /real must be BEFORE /:id so Express doesn't treat "real" as an id param
router.get("/real", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = req.brandId || undefined;
    const { search, page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 50);
    const offset = (pageNum - 1) * limitNum;
    const searchTerm = (search as string || '').trim();

    const pool = getPool();
    const brandArgs: any[] = brandId ? [brandId] : [];
    const searchClause = searchTerm ? `WHERE (phone LIKE ? OR name LIKE ? OR email LIKE ?)` : '';
    const searchArgs = searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`] : [];

    const sql = `
      SELECT phone, name, email, SUM(order_count) as order_count,
             SUM(total_spent) as total_spent, MAX(last_order_at) as last_order_at,
             MAX(source_type) as source_type
      FROM (
        SELECT o.customer_phone as phone,
               MAX(o.customer_name) as name,
               MAX(o.customer_email) as email,
               COUNT(*) as order_count,
               SUM(COALESCE(o.valor_total, 0)) as total_spent,
               MAX(o.created_at) as last_order_at,
               'order' as source_type
        FROM commerce_orders o
        JOIN order_management_meta m ON m.order_id = o.id AND m.user_id = ?
        ${brandId ? 'AND m.brand_id = ?' : ''}
        WHERE o.customer_phone IS NOT NULL AND o.customer_phone != ''
        GROUP BY o.customer_phone

        UNION ALL

        SELECT c.phone, c.name, c.email,
               0 as order_count, 0 as total_spent,
               NULL as last_order_at,
               'manual' as source_type
        FROM clients c
        WHERE c.user_id = ? AND c.source = 'manual' AND (c.is_active IS NULL OR c.is_active = 1)
        ${brandId ? 'AND (c.brand_id = ? OR c.brand_id IS NULL)' : ''}
        AND (c.phone IS NULL OR c.phone NOT IN (
          SELECT DISTINCT o2.customer_phone FROM commerce_orders o2
          JOIN order_management_meta m2 ON m2.order_id = o2.id AND m2.user_id = ?
          ${brandId ? 'AND m2.brand_id = ?' : ''}
          WHERE o2.customer_phone IS NOT NULL
        ))
      ) combined
      ${searchClause}
      GROUP BY phone, name, email
      ORDER BY last_order_at DESC, name ASC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT phone FROM (
          SELECT o.customer_phone as phone FROM commerce_orders o
          JOIN order_management_meta m ON m.order_id = o.id AND m.user_id = ?
          ${brandId ? 'AND m.brand_id = ?' : ''}
          WHERE o.customer_phone IS NOT NULL AND o.customer_phone != ''
          GROUP BY o.customer_phone
          UNION ALL
          SELECT c.phone FROM clients c
          WHERE c.user_id = ? AND c.source = 'manual' AND (c.is_active IS NULL OR c.is_active = 1)
          ${brandId ? 'AND (c.brand_id = ? OR c.brand_id IS NULL)' : ''}
          AND (c.phone IS NULL OR c.phone NOT IN (
            SELECT DISTINCT o2.customer_phone FROM commerce_orders o2
            JOIN order_management_meta m2 ON m2.order_id = o2.id AND m2.user_id = ?
            ${brandId ? 'AND m2.brand_id = ?' : ''}
            WHERE o2.customer_phone IS NOT NULL
          ))
        ) inner_q
      ) outer_q
    `;

    const mainArgs: any[] = [userId, ...brandArgs, userId, ...brandArgs, userId, ...brandArgs];
    const [rows]: any = await pool.execute(sql, [...mainArgs, ...searchArgs, limitNum, offset]);
    const countArgs: any[] = [userId, ...brandArgs, userId, ...brandArgs, userId, ...brandArgs];
    const [[countRow]]: any = await pool.execute(countSql, countArgs);

    res.json({ success: true, clients: rows, total: countRow?.total || 0, page: pageNum, limit: limitNum });
  } catch (error: any) {
    logger.error(error, "Erro ao listar clientes reais");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const client = await clientsService.getById(req.params.id as string, req.user!.userId, req.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar cliente");
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const client = await clientsService.update(req.params.id as string, req.user!.userId, req.body, req.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
    if (req.body.status) {
      try {
        FlowExecutorService.get().fire("lead_status_change", req.user!.userId, {
          clientId: client.id,
          name: client.name,
          phone: client.phone,
          status: req.body.status,
          prevStatus: (client as any).status,
        }).catch(() => {});
      } catch { /* executor not yet initialized */ }
    }
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar cliente");
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/status", async (req: BrandRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status e obrigatorio" });
    const client = await clientsService.updateStatus(req.params.id as string, req.user!.userId, status, req.brandId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar status");
    res.status(500).json({ error: error.message });
  }
});

router.post("/import-leads", async (req: BrandRequest, res: Response) => {
  try {
    const { leads, source } = req.body;
    if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: "Leads deve ser um array" });
    const imported = await clientsService.importFromLeads(req.user!.userId, leads, source, req.brandId);
    res.json({ success: true, imported, total: leads.length });
  } catch (error: any) {
    logger.error(error, "Erro ao importar leads");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const deleted = await clientsService.delete(req.params.id as string, req.user!.userId, req.brandId);
    if (!deleted) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, message: "Cliente removido" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar cliente");
    res.status(500).json({ error: error.message });
  }
});

export default router;
