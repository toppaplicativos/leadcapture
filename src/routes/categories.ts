import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { ProductsService } from "../services/products";
import { logger } from "../utils/logger";

const router = Router();
const productsService = new ProductsService();
const CATEGORY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const categoryCoverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/category-covers");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const uploadCategoryCover = multer({
  storage: categoryCoverStorage,
  limits: { fileSize: CATEGORY_IMAGE_MAX_BYTES }
});

function withMulterErrorHandling(middleware: (req: any, res: any, cb: (err?: any) => void) => void) {
  return (req: BrandRequest, res: Response, next: NextFunction) => {
    middleware(req, res, (err?: any) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `Image too large. Max ${Math.floor(CATEGORY_IMAGE_MAX_BYTES / (1024 * 1024))}MB` });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message || "Invalid upload" });
      }
      logger.error(err, "Category cover upload failed");
      return res.status(400).json({ error: "Invalid upload payload" });
    });
  };
}

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

    const { name, description, color, coverImage } = req.body || {};
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
      coverImage: coverImage ? String(coverImage) : "",
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
    const { name, description, color, coverImage } = req.body || {};

    if (color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color))) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    const updated = await productsService.updateCategory(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      color: color !== undefined ? String(color) : undefined,
      coverImage: coverImage !== undefined ? String(coverImage) : undefined,
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

// POST upload cover image for a category
router.post("/:id/cover", withMulterErrorHandling(uploadCategoryCover.single("image")), async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image file is required" });
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    const id = String(req.params.id);
    const relativeUrl = `/uploads/category-covers/${file.filename}`;
    const absoluteUrl = `${req.protocol}://${req.get("host")}${relativeUrl}`;

    const updated = await productsService.updateCategory(id, { coverImage: absoluteUrl }, userId, req.brandId);
    if (!updated) return res.status(404).json({ error: "Category not found" });

    res.json({ success: true, category: updated, coverImage: absoluteUrl });
  } catch (error: any) {
    logger.error(error, "Error uploading category cover");
    res.status(500).json({ error: error.message });
  }
});

export default router;
