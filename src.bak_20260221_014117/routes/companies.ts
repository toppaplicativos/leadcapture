import { Router, Response } from "express";
import { CompaniesService } from "../services/companies";
import { AuthRequest } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
const companiesService = new CompaniesService();

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const company = await companiesService.create(req.user!.userId, req.body);
    res.status(201).json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao criar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const companies = await companiesService.getAll(req.user!.userId);
    res.json({ success: true, companies });
  } catch (error: any) {
    logger.error(error, "Erro ao listar empresas");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const company = await companiesService.getById(req.params.id as string, req.user!.userId);
    if (!company) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const company = await companiesService.update(req.params.id as string, req.user!.userId, req.body);
    if (!company) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await companiesService.delete(req.params.id as string, req.user!.userId);
    if (!deleted) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, message: "Empresa removida" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar empresa");
    res.status(500).json({ error: error.message });
  }
});

export default router;
