import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { ProductsService } from "../services/products";
import { logger } from "../utils/logger";

const router = Router();
const productsService = new ProductsService();

router.use(authMiddleware, attachBrandContext);

// GET all categories
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const categories = await productsService.getCategories(userId, req.brandId);
    res.json({ success: true, categories });
  } catch (error: any) {
    logger.error(error, "Error listing categories");
    res.status(500).json({ error: error.message });
  }
});

// POST create category
router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, description, color } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color))) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    const category = await productsService.createCategory({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      color: color ? String(color) : "#3b82f6",
    }, userId, req.brandId);

    res.json({ success: true, category });
  } catch (error: any) {
    logger.error(error, "Error creating category");
    res.status(500).json({ error: error.message });
  }
});

// PUT update category
router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id);
    const { name, description, color } = req.body || {};

    if (color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color))) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    const updated = await productsService.updateCategory(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      color: color !== undefined ? String(color) : undefined,
    }, userId, req.brandId);

    if (!updated) return res.status(404).json({ error: "Category not found" });
    res.json({ success: true, category: updated });
  } catch (error: any) {
    logger.error(error, "Error updating category");
    res.status(500).json({ error: error.message });
  }
});

// DELETE category
router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ok = await productsService.deleteCategory(String(req.params.id), userId, req.brandId);
    if (!ok) return res.status(404).json({ error: "Category not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting category");
    res.status(500).json({ error: error.message });
  }
});

export default router;
