import { Router, Response } from "express";
import { ClientsService } from "../services/clients";
import { AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { logger } from "../utils/logger";
import { FlowExecutorService } from "../services/flowExecutor";

const router = Router();
const clientsService = new ClientsService();

router.use(attachBrandContext);

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const client = await clientsService.create(req.user!.userId, req.body, req.brandId);
    res.status(201).json({ success: true, client });
    // Fire flow automation trigger (non-blocking)
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
    // Fire flow trigger if status changed (non-blocking)
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
