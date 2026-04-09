import { Router, Response } from "express";
import { ClientTypesService } from "../services/clientTypes";
import { AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { logger } from "../utils/logger";

const router = Router();
const clientTypesService = new ClientTypesService();

router.use(attachBrandContext);

// POST /api/client-types - Create a new client type
router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const { name, description, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: "Name é obrigatório" });

    const type = await clientTypesService.create(
      req.user!.userId,
      { name, description, color, icon },
      req.brandId || undefined
    );

    res.status(201).json({ success: true, type });
  } catch (error: any) {
    logger.error(error, "Erro ao criar tipo de cliente");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/client-types - List all client types
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const types = await clientTypesService.list(req.user!.userId, req.brandId || undefined);
    res.json({ success: true, types });
  } catch (error: any) {
    logger.error(error, "Erro ao listar tipos de cliente");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/client-types/:id - Get a specific client type
router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const type = await clientTypesService.getById(String(req.params.id), req.user!.userId, req.brandId || undefined);
    if (!type) return res.status(404).json({ error: "Tipo não encontrado" });
    res.json({ success: true, type });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar tipo de cliente");
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/client-types/:id - Update a client type
router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const type = await clientTypesService.update(
      String(req.params.id),
      req.user!.userId,
      req.body as any,
      req.brandId || undefined
    );
    if (!type) return res.status(404).json({ error: "Tipo não encontrado" });
    res.json({ success: true, type });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar tipo de cliente");
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/client-types/:id - Delete a client type
router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const deleted = await clientTypesService.delete(String(req.params.id), req.user!.userId, req.brandId || undefined);
    if (!deleted) return res.status(404).json({ error: "Tipo não encontrado" });
    res.json({ success: true, message: "Tipo removido com sucesso" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar tipo de cliente");
    res.status(500).json({ error: error.message });
  }
});

export default router;
