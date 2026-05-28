/**
 * ═══════════════════════════════════════════════════════════════════
 * /api/brand-skills — CRUD + treinador SSE multimodal
 * ═══════════════════════════════════════════════════════════════════
 *
 * GET    /              — lista skills do brand ativo
 * GET    /:id           — detalhe + materiais + runs recentes
 * POST   /:id/toggle    — ativa/pausa
 * PUT    /:id           — patch (name, instructions, is_active, etc)
 * DELETE /:id           — remove
 *
 * POST   /train-stream  — wizard SSE
 *   Aceita multipart/form-data com:
 *     - prompt (text)        — descricao livre
 *     - files[] (binary)     — imagens, tabelas (CSV/XLSX)
 *     - text_attachments[]   — texto adicional (paste de print, conversa)
 *
 *   Body do upload pode ser JSON-only se nao houver arquivos (text-only training).
 *
 *   Stream:
 *     data: {"step":1,"name":"intakeMaterials","status":"running"}
 *     data: {"step":1,"status":"done","output":{...}}
 *     ...
 *     data: {"step":8,"name":"final","output":{skill_id, ...}}
 */

import { Router, Response } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { AuthRequest } from "../middleware/auth";
import { brandSkillsService } from "../services/brandSkills";
import { getTemplatesWithStatus, activateTemplate } from "../services/skillTemplates";
import {
  executeSkillTrainerSquad,
  isBrandSkillTrainerRunning,
  type SkillSquadEvent,
  type SkillMaterialInput,
} from "../services/skillTrainerSquad";
import { logger } from "../utils/logger";

const router = Router();
router.use(attachBrandContext);

/* ───────────────── Upload setup ───────────────── */

function sanitizePathPart(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function detectMaterialKind(mimetype: string, originalName: string): "image" | "table" | null {
  const mime = String(mimetype || "").toLowerCase();
  const ext = path.extname(originalName || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/csv" || mime === "application/vnd.ms-excel" ||
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      [".csv", ".xls", ".xlsx", ".tsv"].includes(ext)) {
    return "table";
  }
  return null;
}

const skillMaterialsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const authReq = req as AuthRequest;
      const userId = sanitizePathPart(String(authReq.user?.userId || "anonymous"));
      const dir = path.resolve(process.cwd(), "uploads", "skill-materials", userId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8) || ".bin";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const kind = detectMaterialKind(file.mimetype, file.originalname);
    if (!kind) return cb(new Error(`Tipo nao suportado: ${file.mimetype} / ${file.originalname}`));
    cb(null, true);
  },
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

/* ═══════════════════════════════════════════════════════════════════
   Rotas estaticas PRIMEIRO — antes de qualquer /:id para nao conflitar
   ═══════════════════════════════════════════════════════════════════ */

/* GET / — lista skills do brand */
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const list = await brandSkillsService.listForBrand(req.user!.userId, brandId);
    res.json({
      success: true,
      skills: list,
      stats: {
        total: list.length,
        active: list.filter((s) => s.is_active).length,
        paused: list.filter((s) => !s.is_active).length,
        by_type: list.reduce((acc: any, s) => {
          acc[s.skill_type] = (acc[s.skill_type] || 0) + 1;
          return acc;
        }, {}),
      },
    });
  } catch (e: any) {
    logger.error(e, "GET /api/brand-skills");
    res.status(500).json({ error: e?.message || "Erro ao listar skills" });
  }
});

/* GET /status/running — verifica se squad esta rodando */
router.get("/status/running", async (req: BrandRequest, res: Response) => {
  const brandId = req.brandId || "";
  res.json({ running: brandId ? isBrandSkillTrainerRunning(brandId) : false, brand_id: brandId || null });
});

/* GET /templates — galeria de templates com flag already_active */
router.get("/templates", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const templates = await getTemplatesWithStatus(req.user!.userId, brandId);
    res.json({ success: true, templates });
  } catch (e: any) {
    logger.error(e, "GET /api/brand-skills/templates");
    res.status(500).json({ error: e?.message || "Erro ao listar templates" });
  }
});

/* POST /templates/:templateId/activate — ativa + personaliza para o brand */
router.post("/templates/:templateId/activate", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const templateId = String(req.params.templateId || "").trim();
    if (!templateId) return res.status(400).json({ error: "templateId obrigatorio" });
    const result = await activateTemplate(req.user!.userId, brandId, templateId);
    res.json({ success: true, skill: result.skill, customized: result.customized });
  } catch (e: any) {
    logger.error(e, "POST /api/brand-skills/templates/:id/activate");
    res.status(500).json({ error: e?.message || "Erro ao ativar template" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   Rotas dinamicas /:id — DEPOIS das estaticas
   ═══════════════════════════════════════════════════════════════════ */

router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const id = String(req.params.id);
    const skill = await brandSkillsService.findById(req.user!.userId, brandId, id);
    if (!skill) return res.status(404).json({ error: "Skill nao encontrada" });
    const materials = await brandSkillsService.listMaterials(skill.id);
    const runs = await brandSkillsService.listRuns(req.user!.userId, brandId, skill.id, 20);
    res.json({ success: true, skill, materials, runs });
  } catch (e: any) {
    logger.error(e, "GET /api/brand-skills/:id");
    res.status(500).json({ error: e?.message || "Erro ao buscar skill" });
  }
});

router.post("/:id/toggle", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const skill = await brandSkillsService.toggle(req.user!.userId, brandId, String(req.params.id));
    if (!skill) return res.status(404).json({ error: "Skill nao encontrada" });
    res.json({ success: true, skill });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao toggle" });
  }
});

router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const skill = await brandSkillsService.patch(req.user!.userId, brandId, String(req.params.id), req.body || {});
    if (!skill) return res.status(404).json({ error: "Skill nao encontrada" });
    res.json({ success: true, skill });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao atualizar" });
  }
});

router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = req.brandId;
    if (!brandId) return res.status(400).json({ error: "Brand ativo nao definido" });
    const ok = await brandSkillsService.remove(req.user!.userId, brandId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Skill nao encontrada" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao remover" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   POST /train-stream — wizard SSE multimodal
   ═══════════════════════════════════════════════════════════════════ */

router.post(
  "/train-stream",
  skillMaterialsUpload.array("files", 10),
  async (req: BrandRequest, res: Response) => {
    const brandId = req.brandId;
    if (!brandId) {
      return res.status(400).json({ error: "Brand ativo nao definido. Passe x-brand-id no header." });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    /* Prompt vem como campo form-data (text) */
    const prompt = String((req.body?.prompt) || "").trim();
    /* text_attachments — pode vir como array de strings (paste de texto/print).
     * Aceita tanto "text_attachments" (correto) quanto "text_attachments[]" (FormData legado
     * com bracket notation — multer armazena literal, sem parsear como array). */
    let textAttachments: string[] = [];
    const rawText = req.body?.text_attachments ?? req.body?.["text_attachments[]"];
    if (Array.isArray(rawText)) {
      textAttachments = rawText.map((t: any) => String(t || "").trim()).filter(Boolean);
    } else if (typeof rawText === "string" && rawText.trim()) {
      textAttachments = [rawText.trim()];
    }

    if (!prompt && textAttachments.length === 0 && (!req.files || (req.files as any[]).length === 0)) {
      return res.status(400).json({ error: "Forneça pelo menos um prompt, anexo de texto ou arquivo" });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ error: "Prompt muito longo (max 4000 chars)" });
    }

    /* Monta inputs pro squad */
    const materials: SkillMaterialInput[] = [];
    for (const txt of textAttachments) {
      materials.push({ kind: "text", content: txt.slice(0, 8000) });
    }
    const files = (req.files as Express.Multer.File[]) || [];
    for (const f of files) {
      const kind = detectMaterialKind(f.mimetype, f.originalname);
      if (!kind) continue;
      materials.push({
        kind,
        filePath: f.path,
        mimeType: f.mimetype,
        originalFilename: f.originalname,
      });
    }

    /* SSE setup */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let disconnected = false;
    req.on("close", () => { disconnected = true; });
    const heartbeat = setInterval(() => {
      if (disconnected) return;
      try { res.write(": heartbeat\n\n"); } catch { /* */ }
    }, 15_000);

    const emit = (event: SkillSquadEvent) => {
      if (disconnected) return;
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* */ }
    };

    try {
      emit({ step: 0, name: "intakeMaterials", status: "info" as any, message: "Iniciando treinador de skill..." });
      await executeSkillTrainerSquad(
        { brandId, userId, promptText: prompt, materials },
        emit,
      );
      res.write("data: [DONE]\n\n");
    } catch (err: any) {
      logger.error(err, "brand-skills/train-stream fatal");
      emit({ step: 0, name: "error", status: "error", message: err?.message || "Erro inesperado" });
      res.write("data: [DONE]\n\n");
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  },
);

export default router;
