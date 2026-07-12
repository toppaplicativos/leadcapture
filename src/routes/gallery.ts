import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { logger } from "../utils/logger";
import { galleryService, GalleryFolderSlug } from "../services/gallery";
import { resolveUploadKind } from "../utils/uploadMedia";

const router = Router();
router.use(requireBrandContext);

const uploadDir = path.join(__dirname, "../../uploads/gallery-tmp");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const kind = resolveUploadKind(file.mimetype, file.originalname);
    if (kind) cb(null, true);
    else cb(new Error("Envie apenas imagens (JPG, PNG, WEBP, HEIC) ou videos (MP4, MOV)."));
  },
});

function withMulterErrorHandling(middleware: (req: any, res: any, cb: (err?: any) => void) => void) {
  return (req: BrandRequest, res: Response, next: NextFunction) => {
    middleware(req, res, (err?: any) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Arquivo muito grande. Maximo 100 MB.", code: err.code });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message || "Upload invalido", code: err.code });
      }
      return res.status(400).json({ error: err?.message || "Tipo de arquivo nao suportado" });
    });
  };
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

router.get("/folders", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const folders = await galleryService.getFolders(userId, brandId);
    res.json({ success: true, folders });
  } catch (error: any) {
    logger.error(error, "gallery folders");
    res.status(500).json({ error: error.message });
  }
});

/** Cria pasta custom em Publicidade (fonte de conteúdo p/ campanhas/automações/posts) */
router.post("/folders", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "");
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const folder = await galleryService.createCustomFolder(brandId, {
      label: String(req.body?.label || req.body?.name || "").trim(),
      section: req.body?.section === "library" ? "library" : "publicidade",
      icon: req.body?.icon ? String(req.body.icon) : undefined,
    });
    res.status(201).json({ success: true, folder });
  } catch (error: any) {
    logger.error(error, "gallery folder create");
    res.status(400).json({ error: error.message || "Falha ao criar pasta" });
  }
});

router.delete("/folders/:slug", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "");
    if (!brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const ok = await galleryService.deleteCustomFolder(brandId, String(req.params.slug || ""));
    if (!ok) return res.status(404).json({ error: "Pasta não encontrada" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "gallery folder delete");
    res.status(400).json({ error: error.message || "Falha ao remover pasta" });
  }
});

router.get("/tags", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const tags = await galleryService.collectAllTags(userId, brandId);
    res.json({ success: true, tags });
  } catch (error: any) {
    logger.error(error, "gallery tags");
    res.status(500).json({ error: error.message });
  }
});

router.get("/stats", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const { items, total } = await galleryService.listItems(userId, brandId, { limit: 1000 });
    const images = items.filter((i) => i.type === "image").length;
    const videos = items.filter((i) => i.type === "video").length;
    res.json({ success: true, stats: { total, images, videos } });
  } catch (error: any) {
    logger.error(error, "gallery stats");
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const tagsRaw = String(req.query.tags || "");
    const result = await galleryService.listItems(userId, brandId, {
      folder: req.query.folder ? String(req.query.folder) : undefined,
      type: req.query.type === "video" ? "video" : req.query.type === "image" ? "image" : undefined,
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      source: req.query.source ? String(req.query.source) : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 48,
      sort: (req.query.sort as any) || "created_at",
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(error, "gallery list");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const item = await galleryService.getItem(userId, brandId, String(req.params.id));
    if (!item) return res.status(404).json({ error: "Item não encontrado" });
    res.json({ success: true, item });
  } catch (error: any) {
    logger.error(error, "gallery get");
    res.status(500).json({ error: error.message });
  }
});

router.post("/upload", withMulterErrorHandling(upload.single("file")), async (req: BrandRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const tags = parseTags(req.body?.tags);
    const folder = (req.body?.folder as GalleryFolderSlug) || "uploads";
    const item = await galleryService.registerUpload(userId, brandId, req.file, { tags, folder });
    res.json({ success: true, item });
  } catch (error: any) {
    logger.error(error, "gallery upload");
    res.status(500).json({ error: error.message });
  }
});

router.post("/upload-multiple", withMulterErrorHandling(upload.array("files", 20)), async (req: BrandRequest, res: Response) => {
  try {
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const tags = parseTags(req.body?.tags);
    const items = [];
    for (const file of files) {
      items.push(await galleryService.registerUpload(userId, brandId, file, { tags }));
    }
    res.json({ success: true, items, count: items.length });
  } catch (error: any) {
    logger.error(error, "gallery upload-multiple");
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const item = await galleryService.updateItem(userId, brandId, String(req.params.id), {
      tags: req.body?.tags ? parseTags(req.body.tags) : undefined,
      name: req.body?.name ? String(req.body.name) : undefined,
      folder: req.body?.folder ? (String(req.body.folder) as GalleryFolderSlug) : undefined,
    });
    if (!item) return res.status(404).json({ error: "Item não encontrado" });
    res.json({ success: true, item });
  } catch (error: any) {
    logger.error(error, "gallery patch");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const ok = await galleryService.deleteItem(userId, brandId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Item não encontrado" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "gallery delete");
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/use", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = String(req.brandId || "");
    const context = String(req.body?.context || "campaign") as "campaign" | "post" | "product";
    const contextId = req.body?.contextId ? String(req.body.contextId) : undefined;
    const item = await galleryService.markUsed(userId, brandId, String(req.params.id), context, contextId);
    if (!item) return res.status(404).json({ error: "Item não encontrado" });
    res.json({ success: true, item });
  } catch (error: any) {
    logger.error(error, "gallery use");
    res.status(500).json({ error: error.message });
  }
});

export default router;