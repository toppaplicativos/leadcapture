import { Router, Response } from "express";
import { CompaniesService } from "../services/companies";
import { authMiddleware } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { logger } from "../utils/logger";

const router = Router();
const companiesService = new CompaniesService();
router.use(authMiddleware, attachBrandContext);

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const company = await companiesService.create(userId, req.body, req.brandId);
    res.status(201).json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao criar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const companies = await companiesService.getAll(userId, req.brandId);
    res.json({ success: true, companies });
  } catch (error: any) {
    logger.error(error, "Erro ao listar empresas");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const company = await companiesService.getById(req.params.id as string, userId, req.brandId);
    if (!company) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const company = await companiesService.update(req.params.id as string, userId, req.body, req.brandId);
    if (!company) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, company });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar empresa");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const deleted = await companiesService.delete(req.params.id as string, userId, req.brandId);
    if (!deleted) return res.status(404).json({ error: "Empresa nao encontrada" });
    res.json({ success: true, message: "Empresa removida" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar empresa");
    res.status(500).json({ error: error.message });
  }
});

export default router;
