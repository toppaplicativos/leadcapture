/**
 * /api/automation-defs — CRUD de automações compostas (modelo Tattoo AI).
 */

import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { automationDefinitionsService } from "../services/automationDefinitions";
import { runAutomationDefinition } from "../services/automationDefinitionRunner";
import { logger } from "../utils/logger";

const router = Router();
router.use(attachBrandContext);

function brandId(req: BrandRequest): string | null {
  return req.brandId || null;
}

function paramId(req: BrandRequest): string {
  return String(req.params.id || "");
}

router.get("/kpis", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const kpis = await automationDefinitionsService.getKpis(bid, req.user!.userId);
    res.json({ success: true, kpis });
  } catch (e: any) {
    logger.error(e, "GET /api/automation-defs/kpis");
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const platform = typeof req.query.platform === "string" ? req.query.platform : undefined;
    const automacoes = await automationDefinitionsService.list(bid, req.user!.userId, { platform });
    res.json({ success: true, automacoes });
  } catch (e: any) {
    logger.error(e, "GET /api/automation-defs");
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

/** Install Instagram reply seed pack (inactive fill-missing). */
router.post("/seed/instagram", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const { seedInstagramReplyDefinitions } = await import("../services/automationDefinitionSeeds");
    const force = Boolean(req.body?.force);
    const result = await seedInstagramReplyDefinitions(bid, req.user!.userId, {
      force,
      mode: "fill-missing",
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    logger.error(e, "POST /api/automation-defs/seed/instagram");
    res.status(500).json({ error: e?.message || "Erro ao semear" });
  }
});

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const created = await automationDefinitionsService.create(bid, req.user!.userId, req.body);
    res.status(201).json({ success: true, automacao: created });
  } catch (e: any) {
    logger.error(e, "POST /api/automation-defs");
    res.status(500).json({ error: e?.message || "Erro ao criar" });
  }
});

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const item = await automationDefinitionsService.getById(bid, req.user!.userId, paramId(req));
    if (!item) return res.status(404).json({ error: "Automação não encontrada" });
    res.json({ success: true, automacao: item });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

router.patch("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const updated = await automationDefinitionsService.update(bid, req.user!.userId, paramId(req), req.body);
    if (!updated) return res.status(404).json({ error: "Automação não encontrada" });
    res.json({ success: true, automacao: updated });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao atualizar" });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    await automationDefinitionsService.delete(bid, req.user!.userId, paramId(req));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao excluir" });
  }
});

router.post("/:id/toggle", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const ativa = Boolean(req.body?.ativa);
    const updated = await automationDefinitionsService.toggle(bid, req.user!.userId, paramId(req), ativa);
    if (!updated) return res.status(404).json({ error: "Automação não encontrada" });
    res.json({ success: true, automacao: updated });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

router.post("/:id/duplicate", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const copy = await automationDefinitionsService.duplicate(bid, req.user!.userId, paramId(req));
    if (!copy) return res.status(404).json({ error: "Automação não encontrada" });
    res.json({ success: true, automacao: copy });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

router.post("/:id/execute", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const automation = await automationDefinitionsService.getById(bid, req.user!.userId, paramId(req));
    if (!automation) return res.status(404).json({ error: "Automação não encontrada" });

    const result = await runAutomationDefinition(automation, { triggeredBy: "manual" });
    res.json({ success: result.ok, result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro na execução" });
  }
});

router.get("/:id/runs", async (req: BrandRequest, res: Response) => {
  try {
    const bid = brandId(req);
    if (!bid) return res.status(400).json({ error: "Brand ativo não definido" });
    const runs = await automationDefinitionsService.listRuns(paramId(req), bid);
    res.json({ success: true, runs });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro" });
  }
});

export default router;