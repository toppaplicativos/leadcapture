import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { offerCatalogService } from "../services/offerCatalog";
import { invalidateCatalogCacheByBrand } from "../services/storefrontCache";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware, attachBrandContext);

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const collections = await offerCatalogService.listCollections(userId, req.brandId || null);
    res.json({ success: true, collections });
  } catch (error: any) {
    logger.error(error, "Error listing collections");
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.body?.name || !String(req.body.name).trim()) {
      return res.status(400).json({ error: "Collection name is required" });
    }
    const collection = await offerCatalogService.createCollection(req.body, userId, req.brandId || null);
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.status(201).json({ success: true, collection });
  } catch (error: any) {
    logger.error(error, "Error creating collection");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const collection = await offerCatalogService.getCollection(String(req.params.id), userId);
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    res.json({ success: true, collection });
  } catch (error: any) {
    logger.error(error, "Error reading collection");
    res.status(500).json({ error: error.message });
  }
});

const updateHandler = async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const collection = await offerCatalogService.updateCollection(String(req.params.id), req.body || {}, userId);
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true, collection });
  } catch (error: any) {
    logger.error(error, "Error updating collection");
    res.status(500).json({ error: error.message });
  }
};

router.put("/:id", updateHandler);
router.patch("/:id", updateHandler);

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ok = await offerCatalogService.deleteCollection(String(req.params.id), userId);
    if (!ok) return res.status(404).json({ error: "Collection not found" });
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting collection");
    res.status(500).json({ error: error.message });
  }
});

export default router;
