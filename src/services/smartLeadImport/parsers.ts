/**
 * Parsers determinísticos para arquivos estruturados (CSV/XLSX).
 *
 * Os parsers retornam um TEXTO bruto formatado como "linha-por-contato",
 * que depois alimenta o extractor de IA — assim a IA decide quais colunas
 * são nome, telefone, email mesmo que o cabeçalho seja inconsistente
 * ("Tel" vs "celular" vs "phone").
 *
 * Vantagem: parsers simples e determinísticos para o I/O do arquivo,
 * IA só para mapeamento semântico (que ela faz bem).
 */

import * as Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTable {
  /** Texto bruto pronto pra IA */
  rawText: string;
  /** Número de linhas detectadas */
  rowCount: number;
  /** Cabeçalhos detectados, se houver */
  headers: string[];
  /** Aviso textual se algo estranho */
  warning?: string;
}

function rowsToText(rows: Record<string, any>[], headers: string[]): string {
  /* Formata cada linha como "header1: valor1 | header2: valor2 | ..." */
  return rows
    .map((row, idx) => {
      const cells = headers
        .map((h) => {
          const v = row[h];
          if (v === null || v === undefined || v === "") return null;
          return `${h}: ${String(v).trim()}`;
        })
        .filter(Boolean)
        .join(" | ");
      return cells ? `[${idx + 1}] ${cells}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export function parseCsv(content: string): ParsedTable {
  const trimmed = content.trim();
  if (!trimmed) return { rawText: "", rowCount: 0, headers: [], warning: "arquivo CSV vazio" };

  const result = Papa.parse<Record<string, any>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const rows = (result.data || []).filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim()));

  return {
    rawText: rowsToText(rows, headers),
    rowCount: rows.length,
    headers,
    warning: result.errors?.length ? `${result.errors.length} erros de parsing` : undefined,
  };
}

export function parseXlsx(base64: string): ParsedTable {
  try {
    const buffer = Buffer.from(base64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rawText: "", rowCount: 0, headers: [], warning: "planilha sem abas" };
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    if (!rows.length) return { rawText: "", rowCount: 0, headers: [], warning: "aba vazia" };

    const headers = Object.keys(rows[0]).map((h) => String(h).trim());
    const filtered = rows.filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim()));

    return {
      rawText: rowsToText(filtered, headers),
      rowCount: filtered.length,
      headers,
    };
  } catch (err: any) {
    return { rawText: "", rowCount: 0, headers: [], warning: `falha ao ler XLS: ${err.message}` };
  }
}

/** Detecta tipo a partir de mime + extensão */
export function detectTableFormat(mimeType?: string, fileName?: string): "csv" | "xlsx" | "unknown" {
  const mime = String(mimeType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();

  if (mime.includes("csv") || name.endsWith(".csv")) return "csv";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsm")
  ) {
    return "xlsx";
  }
  return "unknown";
}
