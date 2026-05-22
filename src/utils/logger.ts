import pino from "pino";

/* ─────────────────────────────────────────────────────────────────────────────
 * PII Sanitizer (Fase 15.3)
 *
 * Strips/masks PII before anything reaches the transport (stdout / pino-pretty
 * / production aggregator). Two layers:
 *
 *   1. `redact` (pino built-in) — for known field paths in log objects.
 *      Example: `logger.info({ customer: { phone: '11...' } })` redacts the path.
 *
 *   2. `hooks.logMethod` — for free-text logs like `logger.info(\`captured \${phone}\`)`.
 *      Runs regex substitution against every string argument.
 *
 * We KEEP the last 4 chars of phone numbers ("***1234") so debugging still works:
 * you can correlate logs against tickets/screenshots without exposing the full number.
 * For emails we keep the first char and the domain ("j***@gmail.com") — same reason.
 * CPF (raw or formatted) is fully redacted.
 * ───────────────────────────────────────────────────────────────────────────── */

/* Email — keep first char + domain. e.g. joao@gmail.com → j***@gmail.com */
const EMAIL_RE = /\b([\w.+-])[\w.+-]*@([\w-]+(?:\.[\w-]+)+)\b/gi;

/* Brazilian phone — stricter set of patterns. Each is conservative to avoid
 * false positives on UUIDs / order IDs (which often contain long digit runs).
 * Applied IN ORDER; first match wins per character span. */
const PHONE_PATTERNS: RegExp[] = [
  /* +55 prefix (international) */
  /\+55\s?\d{2}\s?9?\d{4}[\s-]?(\d{4})\b/g,
  /* (XX) 9XXXX-XXXX  or  (XX) XXXX-XXXX */
  /\(\d{2}\)\s?9?\d{4}[\s-]?(\d{4})\b/g,
  /* XX 9XXXX-XXXX with explicit space or dash (avoids matching long all-digit IDs) */
  /\b\d{2}[\s-]9\d{4}[\s-](\d{4})\b/g,
  /* Raw 10-13 digits — must be bracketed by non-word characters on BOTH sides,
   * so embedded sequences inside UUIDs (which have letters/hyphens around hex)
   * don't match. Examples that DO match: " 11999998888 ", "tel: 5511999998888;". */
  /(?<![\w])(?:55)?(\d{10,11}\d?)(?![\w])/g,
];

/* CPF — formatted (xxx.xxx.xxx-xx) and raw (11 contiguous digits NOT preceded by
 * a phone hint). We mask formatted CPF; raw 11-digit is too noisy to detect
 * confidently in free text — handled via the `redact` paths for fields like
 * `customer.cpf`. */
const CPF_FMT_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

function maskString(value: string): string {
  if (!value) return value;
  let out = value;
  out = out.replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}***@${domain}`);
  out = out.replace(CPF_FMT_RE, "***.***.***-**");
  for (const re of PHONE_PATTERNS) {
    out = out.replace(re, (full: string, lastChunk: string) => {
      const digits = full.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) return full;
      /* Keep last 4 digits of the actual phone (not the regex capture which may
       * include the optional 9th digit). */
      const last4 = digits.slice(-4);
      return `***${last4}`;
    });
  }
  return out;
}

function maskValue(value: unknown): unknown {
  if (typeof value === "string") return maskString(value);
  if (value && typeof value === "object") {
    /* Don't mutate caller's object — but for performance only walk when it's
     * a plain object/array. Errors keep their original .stack but message is masked. */
    if (Array.isArray(value)) return value.map(maskValue);
    if (value instanceof Error) {
      const masked: any = { name: value.name, message: maskString(value.message), stack: value.stack };
      return masked;
    }
    /* Plain object — shallow walk only (deep objects = log noise, performance) */
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskValue(v);
    }
    return out;
  }
  return value;
}

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,

  /* Path-based redaction — strips known sensitive field names anywhere in the log object.
   * Cheap; runs before serialization. Censored value becomes "[Redacted]". */
  redact: {
    paths: [
      "password", "*.password", "*.*.password",
      "token", "*.token", "*.*.token",
      "authorization", "*.authorization",
      "cpf", "*.cpf", "*.*.cpf",
      "bank_account", "*.bank_account",
    ],
    censor: "[Redacted]",
  },

  /* Free-text mask — catches `logger.info(\`phone \${number}\`)` patterns that
   * `redact` can't see. Runs on every log call. */
  hooks: {
    logMethod(this: any, inputArgs: unknown[], method: any) {
      const masked = inputArgs.map(maskValue);
      return method.apply(this, masked as any);
    },
  },
});

/* Exported for use by tests / one-off scripts that need to mask without going through pino. */
export const _piiMask = { maskString, maskValue };
