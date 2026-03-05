import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { ProductsService } from "../services/products";
import { logger } from "../utils/logger";

const router = Router();
const productsService = new ProductsService();

router.use(authMiddleware);

// GET all products
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const products = await productsService.getProducts();
    res.json({ success: true, products });
  } catch (error: any) {
    logger.error(error, "Error listing products");
    res.status(500).json({ error: error.message });
  }
});

// POST create product
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category, price, promoPrice, unit, features, active } = req.body || {};
    
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!category || String(category).trim().length === 0) {
      return res.status(400).json({ error: "Category is required" });
    }

    if (!price || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    const product = await productsService.createProduct({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      category: String(category).trim(),
      price: parseFloat(price),
      promoPrice: promoPrice ? parseFloat(promoPrice) : undefined,
      unit: unit ? String(unit).trim() : "unidade",
      features: Array.isArray(features) ? features : [],
      is_active: active !== false,
      active: active !== false,
    });

    res.json({ success: true, product });
  } catch (error: any) {
    logger.error(error, "Error creating product");
    res.status(500).json({ error: error.message });
  }
});

// PUT update product
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, description, category, price, promoPrice, unit, features, active } = req.body || {};

    const updated = await productsService.updateProduct(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      category: category !== undefined ? String(category).trim() : undefined,
      price: price !== undefined ? parseFloat(price) : undefined,
      promoPrice: promoPrice !== undefined ? parseFloat(promoPrice) : undefined,
      unit: unit !== undefined ? String(unit).trim() : undefined,
      features: features !== undefined ? (Array.isArray(features) ? features : []) : undefined,
      is_active: active !== undefined ? active : undefined,
      active: active !== undefined ? active : undefined,
    });

    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product: updated });
  } catch (error: any) {
    logger.error(error, "Error updating product");
    res.status(500).json({ error: error.message });
  }
});

// DELETE product
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ok = await productsService.deleteProduct(String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting product");
    res.status(500).json({ error: error.message });
  }
});

export default router;
