/**
 * ═══════════════════════════════════════════════════════════════════
 * /api/automations — CRUD do brand_automations
 * ═══════════════════════════════════════════════════════════════════
 *
 * Endpoints:
 *   GET    /catalog            — lista os 14 templates do catalogo (global)
 *   GET    /                   — lista automacoes do BRAND ativo com merge do catalog
 *   POST   /:slug/toggle       — ativa/pausa uma automation_catalog pra o brand
 *   PUT    /:id                — atualiza config/frequency/cron de uma brand_automation
 *   POST   /:id/run            — executa manualmente (retorna result do run)
 *   GET    /:id/runs           — lista historico de execucoes
 *   GET    /stats              — totais (Total/Ativas/Pausadas/Erro) do brand
 */

import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { brandAutomationsService, type AutomationFrequency } from "../services/brandAutomations";
import { runOne } from "../services/automationScheduler";
import { isTaskImplemented } from "../services/automationTasks";
import { logger } from "../utils/logger";

const router = Router();
router.use(attachBrandContext);

/* ──────────── Catalog (global) ──────────── */

router.get("/catalog", async (req: BrandRequest, res: Response) => {
  try {
    const list = await brandAutomationsService.listCatalog();
    res.json({
      success: true,
      catalog: list.map((t) => ({ ...t, is_implemented: isTaskImplemented(t.task_type) })),
    });
  } catch (e: any) {
    logger.error(e, "GET /api/automations/catalog");
    res.status(500).json({ error: e?.message || "Erro ao carregar catalogo" });
  }
});

/* ──────────── Por brand ──────────── */

function getBrandId(req: BrandRequest): string | null {
  return req.brandId || null;
}

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido. Passe x-brand-id no header." });

    const list = await brandAutomationsService.listForBrand(req.user!.userId, brandId);
    res.json({
      success: true,
      automations: list.map((item) => ({
        ...item,
        is_implemented: isTaskImplemented(item.task_type),
      })),
    });
  } catch (e: any) {
    logger.error(e, "GET /api/automations");
    res.status(500).json({ error: e?.message || "Erro ao carregar automacoes" });
  }
});

router.get("/stats", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.json({ success: true, stats: { total: 0, active: 0, paused: 0, error: 0 } });

    const list = await brandAutomationsService.listForBrand(req.user!.userId, brandId);
    let active = 0, paused = 0, errorCount = 0;
    for (const item of list) {
      if (!item.state) continue;
      if (item.state.status === "active") active++;
      else if (item.state.status === "paused") paused++;
      else if (item.state.status === "error") errorCount++;
    }
    res.json({
      success: true,
      stats: {
        total: list.length, /* total = catalogo inteiro */
        configured: list.filter((i) => i.state).length,
        active,
        paused,
        error: errorCount,
      },
    });
  } catch (e: any) {
    logger.error(e, "GET /api/automations/stats");
    res.status(500).json({ error: e?.message || "Erro ao carregar stats" });
  }
});

router.post("/:slug/toggle", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const result = await brandAutomationsService.toggle(req.user!.userId, brandId, String(req.params.slug || ""));
    res.json({ success: true, automation: result });
  } catch (e: any) {
    logger.error(e, `POST /api/automations/:slug/toggle`);
    res.status(500).json({ error: e?.message || "Erro ao toggle" });
  }
});

router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });

    const patch: any = {};
    if (req.body?.config !== undefined && typeof req.body.config === "object") {
      patch.config = req.body.config;
    }
    if (req.body?.frequency !== undefined) {
      const VALID: AutomationFrequency[] = [
        "every_5min", "every_15min", "every_30min", "hourly", "every_2h", "every_6h", "every_12h",
        "daily", "weekly", "monthly",
      ];
      if (!VALID.includes(req.body.frequency)) {
        return res.status(400).json({ error: `frequency invalida. Opcoes: ${VALID.join(", ")}` });
      }
      patch.frequency = req.body.frequency;
    }
    if (req.body?.cron_expression !== undefined) {
      patch.cron_expression = req.body.cron_expression || null;
    }
    const updated = await brandAutomationsService.updateConfig(req.user!.userId, brandId, String(req.params.id || ""), patch);
    if (!updated) return res.status(404).json({ error: "Automacao nao encontrada" });
    res.json({ success: true, automation: updated });
  } catch (e: any) {
    logger.error(e, "PUT /api/automations/:id");
    res.status(500).json({ error: e?.message || "Erro ao atualizar" });
  }
});

router.post("/:id/run", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });

    const auto = await brandAutomationsService.findById(req.user!.userId, brandId, String(req.params.id || ""));
    if (!auto) return res.status(404).json({ error: "Automacao nao encontrada" });

    /* Precisa do task_type — busca no catalog */
    const catalog = await brandAutomationsService.listCatalog();
    const tpl = catalog.find((t) => t.slug === auto.catalog_slug);
    if (!tpl) return res.status(500).json({ error: "Template do catalogo nao encontrado" });

    const result = await runOne(
      {
        id: auto.id,
        brand_id: auto.brand_id,
        user_id: auto.user_id,
        catalog_slug: auto.catalog_slug,
        config: auto.config,
        task_type: tpl.task_type,
        catalog_name: tpl.name,
      },
      "manual",
    );
    res.json({ success: result.status === "success", run: result });
  } catch (e: any) {
    logger.error(e, "POST /api/automations/:id/run");
    res.status(500).json({ error: e?.message || "Erro ao executar" });
  }
});

router.get("/:id/runs", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = getBrandId(req);
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const runs = await brandAutomationsService.listRuns(req.user!.userId, brandId, String(req.params.id || ""), limit);
    res.json({ success: true, runs });
  } catch (e: any) {
    logger.error(e, "GET /api/automations/:id/runs");
    res.status(500).json({ error: e?.message || "Erro ao buscar historico" });
  }
});

export default router;
