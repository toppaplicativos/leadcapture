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

import { extractLeadsFromImage, extractLeadsFromText } from "./aiExtractor";
import { detectTableFormat, parseCsv, parseXlsx } from "./parsers";
import { normalizePhone } from "./phoneNormalizer";
import { markDuplicates } from "./dedup";
import type { ImportPreview, ParsedLead, SmartImportPayload } from "./types";

export { ImportPreview, ParsedLead, SmartImportPayload } from "./types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

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

async function runPipeline(
  payload: SmartImportPayload,
  scope: { userId: string; brandId: string }
): Promise<PipelineResult> {
  const warnings: string[] = [];

  /* ── Texto colado ───────────────────────────────────────────── */
  if (payload.mode === "text") {
    const text = String(payload.payload || "").trim();
    if (!text) throw new Error("Texto vazio");
    const rawLeads = await extractLeadsFromText(text, scope);
    return { rawLeads, sourceTag: "smart-import:text", pipelineWarnings: warnings, mode: "text" };
  }

  /* ── Imagem (foto, print, PDF tratado como imagem) ──────────── */
  if (payload.mode === "image") {
    const b64 = String(payload.payload || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) throw new Error("Imagem vazia");
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new Error(`Imagem muito grande (${(approxBytes / 1024 / 1024).toFixed(1)}MB). Maximo 10MB.`);
    }
    const rawLeads = await extractLeadsFromImage(b64, payload.mimeType || "image/jpeg", scope);
    return { rawLeads, sourceTag: imageTag(payload.mimeType), pipelineWarnings: warnings, mode: "image" };
  }

  /* ── Arquivo estruturado (CSV/XLS) ──────────────────────────── */
  if (payload.mode === "file") {
    const format = detectTableFormat(payload.mimeType, payload.fileName);
    if (format === "csv") {
      /* CSV chega como base64 (transport uniforme com xlsx); decodifica para texto */
      const text = Buffer.from(String(payload.payload || ""), "base64").toString("utf-8");
      const parsed = parseCsv(text);
      if (parsed.warning) warnings.push(parsed.warning);
      if (!parsed.rawText) throw new Error("CSV sem linhas validas");
      const rawLeads = await extractLeadsFromText(parsed.rawText, scope);
      return { rawLeads, sourceTag: fileNameTag(payload.fileName), pipelineWarnings: warnings, mode: "csv" };
    }

    if (format === "xlsx") {
      const parsed = parseXlsx(String(payload.payload || ""));
      if (parsed.warning) warnings.push(parsed.warning);
      if (!parsed.rawText) throw new Error("Planilha sem linhas validas");
      const rawLeads = await extractLeadsFromText(parsed.rawText, scope);
      return { rawLeads, sourceTag: fileNameTag(payload.fileName), pipelineWarnings: warnings, mode: "xlsx" };
    }

    /* Mime image dentro de file? Aceita por conveniência */
    const mimeIsImage = String(payload.mimeType || "").toLowerCase().startsWith("image/");
    const mimeIsPdf = String(payload.mimeType || "").toLowerCase().includes("pdf");
    if (mimeIsImage || mimeIsPdf) {
      const b64 = String(payload.payload || "").replace(/^data:[^;]+;base64,/, "");
      const rawLeads = await extractLeadsFromImage(b64, payload.mimeType || "image/jpeg", scope);
      return { rawLeads, sourceTag: imageTag(payload.mimeType), pipelineWarnings: warnings, mode: mimeIsPdf ? "pdf-image" : "image" };
    }

    throw new Error(`Formato de arquivo nao suportado: ${payload.mimeType || payload.fileName || "desconhecido"}`);
  }

  throw new Error(`Modo invalido: ${payload.mode}`);
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
