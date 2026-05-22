/**
 * Normalização de telefone para padrão E.164 brasileiro (+55..).
 *
 * Usa libphonenumber-js. Tenta heurística BR-first: se vier só dígitos sem
 * country code, assume Brasil. Se a string tiver "+" no início, respeita.
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const DEFAULT_COUNTRY: CountryCode = "BR";

export interface NormalizedPhone {
  /** Formato E.164 (+5585999998888) — null se inválido */
  e164: string | null;
  /** Formato nacional brasileiro ((85) 99999-8888) — bom para UI */
  national: string | null;
  /** Número original limpo, sem garantia de validade */
  raw: string;
  /** Erro humano se houve (ex: "muito curto") */
  warning?: string;
}

export function normalizePhone(input: unknown): NormalizedPhone {
  const raw = String(input || "").trim();
  if (!raw) return { e164: null, national: null, raw: "" };

  /* Limpeza inicial — mantém o + se vier */
  const cleaned = raw.replace(/[^\d+]/g, "");

  /* Heurística: se começa com 0 (estilo "0xx85..."), remove o zero */
  const withoutLeadingZero = cleaned.startsWith("0") && !cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  try {
    const parsed = parsePhoneNumberFromString(withoutLeadingZero, DEFAULT_COUNTRY);
    if (!parsed) return { e164: null, national: null, raw, warning: "formato nao reconhecido" };
    if (!parsed.isValid()) {
      return { e164: null, national: null, raw, warning: "telefone invalido" };
    }
    return {
      e164: parsed.number, // E.164
      national: parsed.formatNational(),
      raw,
    };
  } catch {
    return { e164: null, national: null, raw, warning: "falha ao parsear telefone" };
  }
}

/** Compara dois fones — qualquer formato — e retorna true se forem o MESMO contato. */
export function phoneEquals(a: unknown, b: unknown): boolean {
  const aE = normalizePhone(a).e164;
  const bE = normalizePhone(b).e164;
  if (!aE || !bE) {
    /* Fallback: comparação por últimos 8 dígitos (cobre número sem DDI/DDD) */
    const aDigits = String(a || "").replace(/\D/g, "");
    const bDigits = String(b || "").replace(/\D/g, "");
    if (!aDigits || !bDigits) return false;
    return aDigits.slice(-8) === bDigits.slice(-8);
  }
  return aE === bE;
}
