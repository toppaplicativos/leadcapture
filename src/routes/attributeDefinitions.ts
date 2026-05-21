import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { attributeDefinitionService } from "../services/offerCatalog";
import { invalidateCatalogCacheByBrand } from "../services/storefrontCache";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware, attachBrandContext);

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const definitions = await attributeDefinitionService.list(userId, req.brandId || null);
    res.json({ success: true, definitions });
  } catch (error: any) {
    logger.error(error, "Error listing attribute definitions");
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const def = await attributeDefinitionService.create(req.body || {}, userId, req.brandId || null);
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.status(201).json({ success: true, definition: def });
  } catch (error: any) {
    const msg = String(error?.message || "");
    const bad = msg.includes("required") || msg.includes("invalid") || msg.includes("já existe");
    res.status(bad ? 400 : 500).json({ error: msg || "Failed to create" });
  }
});

const updateHandler = async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const def = await attributeDefinitionService.update(String(req.params.id), req.body || {}, userId);
    if (!def) return res.status(404).json({ error: "Definition not found" });
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true, definition: def });
  } catch (error: any) {
    logger.error(error, "Error updating attribute definition");
    res.status(500).json({ error: error.message });
  }
};

router.put("/:id", updateHandler);
router.patch("/:id", updateHandler);

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ok = await attributeDefinitionService.delete(String(req.params.id), userId);
    if (!ok) return res.status(404).json({ error: "Definition not found" });
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting attribute definition");
    res.status(500).json({ error: error.message });
  }
});

export default router;
