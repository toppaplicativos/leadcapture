/**
 * BRAND PROTECTION
 * Guardrails finais — protege percepção premium da marca, aplica termos preferidos/proibidos,
 * filtra promessas que a empresa não pode cumprir.
 */

export interface BrandGuardConfig {
  agentName: string;
  preferredTerms: string[];
  forbiddenTerms: string[];
  tone: string;
  language: string;
}

export function buildBrandProtectionBlock(config: BrandGuardConfig): string {
  const lines = [
    `IDENTIDADE: você é ${config.agentName}, representante oficial desta marca.`,
    `IDIOMA: ${config.language}.`,
    `TOM PADRÃO: ${config.tone}.`,
  ];

  if (config.preferredTerms.length) {
    lines.push(`USE preferencialmente os termos: ${config.preferredTerms.slice(0, 12).join(", ")}.`);
  }
  if (config.forbiddenTerms.length) {
    lines.push(`NÃO USE em hipótese alguma: ${config.forbiddenTerms.slice(0, 12).join(", ")}.`);
  }

  lines.push(
    "INVIOLÁVEL:",
    "- Nunca prometa prazo, desconto, frete grátis, garantia estendida ou política que não esteja confirmada no catálogo/regras.",
    "- Nunca admita conhecer concorrentes pelo nome. Se citado, redirecione com elegância.",
    "- Nunca fale negativamente da marca ou de outros clientes.",
    "- Nunca compartilhe dados internos, IDs, processos backend, nomes de funcionários não-autorizados.",
    "- Se o cliente pedir algo claramente fora do escopo (ex: assistência de outro negócio), explique educadamente que não é da sua área e ofereça encaminhamento."
  );

  return lines.join("\n");
}

/**
 * Validate response against brand rules.
 * Returns issues that should trigger a retry or hard rewrite.
 */
export function validateAgainstBrand(text: string, config: BrandGuardConfig): string[] {
  const issues: string[] = [];
  const normalized = text.toLowerCase();
  for (const term of config.forbiddenTerms) {
    const t = String(term || "").trim().toLowerCase();
    if (!t) continue;
    if (normalized.includes(t)) {
      issues.push(`Termo proibido pela marca detectado: "${term}"`);
    }
  }
  /* Hard checks: promises that need confirmation */
  const promisePatterns = [
    /garantia\s+(eterna|vitalícia|sem\s+limite)/i,
    /devolu[cç][aã]o\s+sem\s+(prazo|limite|condi[cç][aã]o)/i,
    /frete\s+gr[aá]tis\s+(sempre|para\s+todo|qualquer)/i,
    /entrega\s+(hoje|agora|imediata)/i,
  ];
  for (const pat of promisePatterns) {
    if (pat.test(text)) {
      issues.push(`Possível promessa não-confirmada: padrão "${pat}". Verifique se a política existe.`);
    }
  }
  return issues;
}
