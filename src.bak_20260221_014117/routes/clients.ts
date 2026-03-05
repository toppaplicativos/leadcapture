import { Router, Response } from "express";
import { ClientsService } from "../services/clients";
import { AuthRequest } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
const clientsService = new ClientsService();

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const client = await clientsService.create(req.user!.userId, req.body);
    res.status(201).json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao criar cliente");
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { status, source, company_id, search, page, limit } = req.query;
    const result = await clientsService.getAll(req.user!.userId, {
      status: status as string, source: source as string,
      company_id: company_id as string, search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(error, "Erro ao listar clientes");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const client = await clientsService.getById(req.params.id as string, req.user!.userId);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar cliente");
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const client = await clientsService.update(req.params.id as string, req.user!.userId, req.body);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar cliente");
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status e obrigatorio" });
    const client = await clientsService.updateStatus(req.params.id as string, req.user!.userId, status);
    if (!client) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, client });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar status");
    res.status(500).json({ error: error.message });
  }
});

router.post("/import-leads", async (req: AuthRequest, res: Response) => {
  try {
    const { leads, source } = req.body;
    if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: "Leads deve ser um array" });
    const imported = await clientsService.importFromLeads(req.user!.userId, leads, source);
    res.json({ success: true, imported, total: leads.length });
  } catch (error: any) {
    logger.error(error, "Erro ao importar leads");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await clientsService.delete(req.params.id as string, req.user!.userId);
    if (!deleted) return res.status(404).json({ error: "Cliente nao encontrado" });
    res.json({ success: true, message: "Cliente removido" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar cliente");
    res.status(500).json({ error: error.message });
  }
});

export default router;
