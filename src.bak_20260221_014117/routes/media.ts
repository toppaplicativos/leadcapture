import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { logger } from "../utils/logger";
import { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mime = file.mimetype;
    let folder = "documents";
    if (mime.startsWith("image/")) folder = "images";
    else if (mime.startsWith("video/")) folder = "videos";
    else if (mime.startsWith("audio/")) folder = "audio";

    const uploadPath = path.join(__dirname, "../../uploads", folder);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/mpeg", "video/quicktime",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv"
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo nao permitido: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

function getCategory(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

// POST /api/media/upload - Upload single file
router.post("/upload", upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const file = req.file;
    const id = uuidv4();
    const category = getCategory(file.mimetype);
    const relativePath = `/uploads/${category === "document" ? "documents" : category + "s"}/${file.filename}`;
    const url = `${req.protocol}://${req.get("host")}${relativePath}`;

    await getPool().execute(
      `INSERT INTO media_files (id, user_id, company_id, original_name, stored_name, mime_type, file_size, file_path, url, category, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user!.userId, req.body.company_id || null, file.originalname, file.filename,
       file.mimetype, file.size, relativePath, url, category, req.body.tags ? JSON.stringify(req.body.tags.split(",")) : null]
    );

    res.json({
      success: true,
      file: { id, originalName: file.originalname, storedName: file.filename, mimeType: file.mimetype,
              fileSize: file.size, url, category }
    });
  } catch (error: any) {
    logger.error(error, "Erro no upload");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/media/upload-multiple - Upload multiple files
router.post("/upload-multiple", upload.array("files", 10), async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const results = [];
    for (const file of files) {
      const id = uuidv4();
      const category = getCategory(file.mimetype);
      const relativePath = `/uploads/${category === "document" ? "documents" : category + "s"}/${file.filename}`;
      const url = `${req.protocol}://${req.get("host")}${relativePath}`;

      await getPool().execute(
        `INSERT INTO media_files (id, user_id, original_name, stored_name, mime_type, file_size, file_path, url, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user!.userId, file.originalname, file.filename, file.mimetype, file.size, relativePath, url, category]
      );
      results.push({ id, originalName: file.originalname, url, category });
    }

    res.json({ success: true, files: results, count: results.length });
  } catch (error: any) {
    logger.error(error, "Erro no upload multiplo");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/media - List user's media files
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { category, page = "1", limit = "50" } = req.query;
    let where = "user_id = ? AND is_active = TRUE";
    const params: any[] = [req.user!.userId];

    if (category) { where += " AND category = ?"; params.push(category); }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    // LIMIT/OFFSET passed via template literal to avoid mysql2 prepared stmt issue

    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT * FROM media_files WHERE ${where} ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`, params
    );

    res.json({ success: true, files: rows, page: pageNum, limit: limitNum });
  } catch (error: any) {
    logger.error(error, "Erro ao listar media");
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/media/:id - Delete media file
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT * FROM media_files WHERE id = ? AND user_id = ?", [req.params.id, req.user!.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Arquivo nao encontrado" });

    const file = rows[0] as any;
    const fullPath = path.join(__dirname, "../..", file.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    await getPool().execute("UPDATE media_files SET is_active = FALSE WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Arquivo removido" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar media");
    res.status(500).json({ error: error.message });
  }
});

export default router;
