/**
 * Smart Lead Import — orquestrador.
 *
 * Pipeline:
 *   1) Detecta tipo (texto, CSV/XLS, imagem)
 *   2) Converte para texto (parser ou Gemini Vision)
 *   3) IA extrai leads estruturados (aiRouter.generateJson)
 *   4) Normaliza (nome Title Case, fone E.164, email lowercase, tags)
 *   5) Marca duplicados (banco + lote)
 *   6) Devolve ImportPreview pro frontend revisar
 */

import sharp from "sharp";
import { extractLeadsFromImage, extractLeadsFromText } from "./aiExtractor";
import { detectTableFormat, parseCsv, parseXlsx } from "./parsers";
import { normalizePhone } from "./phoneNormalizer";
import { markDuplicates } from "./dedup";
import { logger } from "../../utils/logger";
import type { ImportPreview, ParsedLead, SmartImportPayload } from "./types";

export { ImportPreview, ParsedLead, SmartImportPayload } from "./types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (raw decoded)
/* Above this, we downscale before sending to Gemini Vision. Vision models work
 * fine at moderate resolutions and we save bandwidth + API cost + latency. */
const IMAGE_DOWNSCALE_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MB
const IMAGE_MAX_DIMENSION = 1600; // longest edge after downscale

function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      /* Pequenas exceções para PT-BR — preposições e artigos minúsculos no meio */
      const lower = ["da", "de", "do", "das", "dos", "e", "di"];
      if (lower.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    /* Primeira palavra sempre capitalizada */
    .replace(/^./, (c) => c.toUpperCase());
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  /* Aceita só se tiver @ e ponto depois */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function buildTags(opts: {
  sourceTag: string;
  interest?: string | null;
  temperature?: string | null;
}): string[] {
  const tags: string[] = ["smart-import", opts.sourceTag];
  if (opts.interest) {
    /* Tag legível do interesse, slug-style */
    const slug = String(opts.interest)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (slug) tags.push(`interesse:${slug}`);
  }
  if (opts.temperature) tags.push(`temperatura:${opts.temperature}`);
  return Array.from(new Set(tags));
}

function fileNameTag(fileName?: string): string {
  if (!fileName) return "smart-import:file";
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "smart-import:csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) return "smart-import:xlsx";
  if (lower.endsWith(".pdf")) return "smart-import:pdf";
  return "smart-import:file";
}

function imageTag(mimeType?: string): string {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("pdf")) return "smart-import:pdf";
  return "smart-import:image";
}

interface PipelineResult {
  rawLeads: any[];
  sourceTag: string;
  pipelineWarnings: string[];
  mode: string;
}

/* Bug-7: structured timing helper. Each stage emits a single log line on
 * completion (success or fail) with ms + relevant counts. Helps pinpoint
 * which stage failed when a user reports "the import broke". */
async function timed<T>(stage: string, brandId: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    logger.info({ stage, brand: brandId, ms: Date.now() - t0 }, `[smartLeadImport] ${stage} ok`);
    return result;
  } catch (err: any) {
    logger.warn({ stage, brand: brandId, ms: Date.now() - t0, err_code: err?.code, err_msg: err?.message }, `[smartLeadImport] ${stage} FAILED`);
    throw err;
  }
}

/**
 * Downscale large images before sending to Gemini Vision.
 * - Skips when already small.
 * - Converts to JPEG (Vision handles it best + lossy = smaller).
 * - Falls back to the original on sharp failure (don't block the import).
 */
async function preprocessImage(b64: string, mimeType: string): Promise<{ base64: string; mimeType: string; downscaled: boolean }> {
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes <= IMAGE_DOWNSCALE_THRESHOLD_BYTES) {
    return { base64: b64, mimeType, downscaled: false };
  }
  try {
    const buf = Buffer.from(b64, "base64");
    const resized = await sharp(buf)
      .rotate() // honor EXIF orientation
      .resize({ width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    return { base64: resized.toString("base64"), mimeType: "image/jpeg", downscaled: true };
  } catch (err: any) {
    /* Sharp can fail on exotic inputs (HEIC without delegate, broken file).
     * Fall back to original — Gemini will either accept it or fail clearly. */
    logger.warn({ err_msg: err?.message, mime: mimeType }, "[smartLeadImport] image downscale failed, sending original");
    return { base64: b64, mimeType, downscaled: false };
  }
}

/** Infer mime when client didn't send it (some browsers omit on paste). */
function inferMime(payload: SmartImportPayload): string {
  const m = String(payload.mimeType || "").toLowerCase();
  if (m) return m;
  const fn = String(payload.fileName || "").toLowerCase();
  if (fn.endsWith(".png")) return "image/png";
  if (fn.endsWith(".webp")) return "image/webp";
  if (fn.endsWith(".gif")) return "image/gif";
  if (fn.endsWith(".pdf")) return "application/pdf";
  if (fn.endsWith(".csv")) return "text/csv";
  if (fn.endsWith(".xlsx") || fn.endsWith(".xls")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  /* Heuristic: data URL prefix tells us, but we already stripped it. Default to JPEG. */
  return "image/jpeg";
}

async function runPipeline(
  payload: SmartImportPayload,
  scope: { userId: string; brandId: string }
): Promise<PipelineResult> {
  const warnings: string[] = [];
  const inferredMime = inferMime(payload);

  /* ── Texto colado ───────────────────────────────────────────── */
  if (payload.mode === "text") {
    const text = String(payload.payload || "").trim();
    if (!text) throw new Error("Texto vazio");
    const rawLeads = await timed("extract:text", scope.brandId, () => extractLeadsFromText(text, scope));
    logger.info({ stage: "pipeline_done", mode: "text", count: rawLeads.length, brand: scope.brandId }, "[smartLeadImport] pipeline done");
    return { rawLeads, sourceTag: "smart-import:text", pipelineWarnings: warnings, mode: "text" };
  }

  /* ── Imagem (foto, print, PDF tratado como imagem) ──────────── */
  if (payload.mode === "image") {
    const b64Raw = String(payload.payload || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64Raw) throw new Error("Imagem vazia");
    const approxBytes = Math.floor((b64Raw.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new Error(`Imagem muito grande (${(approxBytes / 1024 / 1024).toFixed(1)}MB). Máximo 10MB.`);
    }
    const pre = await timed("preprocess:image", scope.brandId, () => preprocessImage(b64Raw, inferredMime));
    if (pre.downscaled) warnings.push("Imagem reduzida para acelerar processamento.");
    const rawLeads = await timed("extract:image", scope.brandId, () => extractLeadsFromImage(pre.base64, pre.mimeType, scope));
    logger.info({ stage: "pipeline_done", mode: "image", count: rawLeads.length, downscaled: pre.downscaled, brand: scope.brandId }, "[smartLeadImport] pipeline done");
    return { rawLeads, sourceTag: imageTag(pre.mimeType), pipelineWarnings: warnings, mode: "image" };
  }

  /* ── Arquivo estruturado (CSV/XLS) ──────────────────────────── */
  if (payload.mode === "file") {
    const format = detectTableFormat(inferredMime, payload.fileName);
    if (format === "csv") {
      const text = Buffer.from(String(payload.payload || ""), "base64").toString("utf-8");
      const parsed = parseCsv(text);
      if (parsed.warning) warnings.push(parsed.warning);
      if (!parsed.rawText) throw new Error("CSV sem linhas válidas");
      const rawLeads = await timed("extract:csv", scope.brandId, () => extractLeadsFromText(parsed.rawText, scope));
      logger.info({ stage: "pipeline_done", mode: "csv", count: rawLeads.length, brand: scope.brandId }, "[smartLeadImport] pipeline done");
      return { rawLeads, sourceTag: fileNameTag(payload.fileName), pipelineWarnings: warnings, mode: "csv" };
    }

    if (format === "xlsx") {
      const parsed = parseXlsx(String(payload.payload || ""));
      if (parsed.warning) warnings.push(parsed.warning);
      if (!parsed.rawText) throw new Error("Planilha sem linhas válidas");
      const rawLeads = await timed("extract:xlsx", scope.brandId, () => extractLeadsFromText(parsed.rawText, scope));
      logger.info({ stage: "pipeline_done", mode: "xlsx", count: rawLeads.length, brand: scope.brandId }, "[smartLeadImport] pipeline done");
      return { rawLeads, sourceTag: fileNameTag(payload.fileName), pipelineWarnings: warnings, mode: "xlsx" };
    }

    /* Image / PDF inside a "file" upload — accept and treat as image */
    const mimeIsImage = inferredMime.startsWith("image/");
    const mimeIsPdf = inferredMime.includes("pdf");
    if (mimeIsImage || mimeIsPdf) {
      const b64Raw = String(payload.payload || "").replace(/^data:[^;]+;base64,/, "");
      const pre = await timed("preprocess:image", scope.brandId, () => preprocessImage(b64Raw, inferredMime));
      if (pre.downscaled) warnings.push("Imagem reduzida para acelerar processamento.");
      const rawLeads = await timed("extract:image-from-file", scope.brandId, () => extractLeadsFromImage(pre.base64, pre.mimeType, scope));
      logger.info({ stage: "pipeline_done", mode: mimeIsPdf ? "pdf-image" : "image", count: rawLeads.length, downscaled: pre.downscaled, brand: scope.brandId }, "[smartLeadImport] pipeline done");
      return { rawLeads, sourceTag: imageTag(pre.mimeType), pipelineWarnings: warnings, mode: mimeIsPdf ? "pdf-image" : "image" };
    }

    throw new Error(`Formato de arquivo não suportado: ${inferredMime || payload.fileName || "desconhecido"}`);
  }

  throw new Error(`Modo inválido: ${payload.mode}`);
}

export async function generateImportPreview(
  payload: SmartImportPayload,
  scope: { userId: string; brandId: string }
): Promise<ImportPreview> {
  const { rawLeads, sourceTag, pipelineWarnings, mode } = await runPipeline(payload, scope);

  /* ── Normalização ─────────────────────────────────────────── */
  const normalized: ParsedLead[] = rawLeads
    .map((raw, idx) => {
      const phoneInfo = normalizePhone(raw?.phone);
      const email = normalizeEmail(raw?.email);
      const name = titleCase(raw?.name) || (raw?.company ? titleCase(raw.company) : null) || "Sem nome";

      const warnings: string[] = [];
      if (phoneInfo.warning) warnings.push(`fone: ${phoneInfo.warning}`);
      if (!phoneInfo.e164 && !email) warnings.push("sem telefone nem email");

      const tags = buildTags({
        sourceTag,
        interest: raw?.interest || null,
        temperature: raw?.temperature || null,
      });

      const lead: ParsedLead = {
        index: idx,
        name,
        phone: phoneInfo.e164,
        email,
        company: raw?.company ? titleCase(raw.company) : null,
        city: raw?.city ? titleCase(raw.city) : null,
        state: raw?.state ? String(raw.state).toUpperCase().slice(0, 2) : null,
        interest: raw?.interest || null,
        notes: raw?.notes || null,
        temperature: (raw?.temperature as any) || null,
        tags,
        warnings,
        duplicateOf: null,
        raw,
      };
      return lead;
    })
    /* Remove totalmente vazios */
    .filter((l) => l.name !== "Sem nome" || l.phone || l.email);

  /* ── Marca duplicados ─────────────────────────────────────── */
  const withDups = await markDuplicates(normalized, scope.userId, scope.brandId);

  /* ── Stats ────────────────────────────────────────────────── */
  const stats = {
    total: withDups.length,
    newLeads: withDups.filter((l) => !l.duplicateOf).length,
    duplicates: withDups.filter((l) => !!l.duplicateOf).length,
    withoutPhone: withDups.filter((l) => !l.phone).length,
    withInterest: withDups.filter((l) => !!l.interest).length,
  };

  return {
    mode,
    leads: withDups,
    stats,
    pipelineWarnings,
    sourceTag,
  };
}
