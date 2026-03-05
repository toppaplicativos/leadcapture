import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { ProductsService } from "../services/products";
import { logger } from "../utils/logger";

const router = Router();
const productsService = new ProductsService();

router.use(authMiddleware);

// GET all price tables
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const priceTables = await productsService.getPriceTables();
    res.json({ success: true, priceTables });
  } catch (error: any) {
    logger.error(error, "Error listing price tables");
    res.status(500).json({ error: error.message });
  }
});

// POST create price table
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, validFrom, validUntil, products, active } = req.body || {};
    
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    const priceTable = await productsService.createPriceTable({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      products: Array.isArray(products) ? products : [],
      is_active: active !== false,
      active: active !== false,
    });

    res.json({ success: true, priceTable });
  } catch (error: any) {
    logger.error(error, "Error creating price table");
    res.status(500).json({ error: error.message });
  }
});

// PUT update price table
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, description, validFrom, validUntil, products, active } = req.body || {};

    const updated = await productsService.updatePriceTable(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      validFrom: validFrom !== undefined ? new Date(validFrom) : undefined,
      validUntil: validUntil !== undefined ? new Date(validUntil) : undefined,
      products: products !== undefined ? (Array.isArray(products) ? products : []) : undefined,
      is_active: active !== undefined ? active : undefined,
      active: active !== undefined ? active : undefined,
    });

    if (!updated) return res.status(404).json({ error: "Price table not found" });
    res.json({ success: true, priceTable: updated });
  } catch (error: any) {
    logger.error(error, "Error updating price table");
    res.status(500).json({ error: error.message });
  }
});

// DELETE price table
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ok = await productsService.deletePriceTable(String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Price table not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting price table");
    res.status(500).json({ error: error.message });
  }
});

export default router;
