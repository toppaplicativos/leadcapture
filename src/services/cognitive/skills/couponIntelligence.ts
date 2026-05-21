/**
 * COUPON INTELLIGENCE (Fase 13)
 *
 * Surfaces active coupons to the agent so it can offer them as objection handlers
 * ("essa peça custa R$ 80, mas tenho o cupom BEMVINDO10 que tira 10% — fica R$ 72").
 *
 * Conservative by design: only shows coupons that are CURRENTLY usable (active,
 * not expired, not exhausted, no targeting that would exclude generic offers).
 * For coupons with product/category targeting, the block tells the agent that
 * it only applies to specific items, leaving the decision to the Reasoner.
 */

import type { Coupon } from "../../coupons";

function moneyBR(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "R$ 0,00";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDiscount(c: Coupon): string {
  if (c.discount_type === "percentage") {
    const cap = c.max_discount_cap !== null && c.max_discount_cap > 0
      ? ` (limite ${moneyBR(c.max_discount_cap)})`
      : "";
    return `${c.discount_value}% de desconto${cap}`;
  }
  return `${moneyBR(c.discount_value)} de desconto`;
}

function formatLine(c: Coupon): string {
  const parts: string[] = [`▸ ${c.code} — ${formatDiscount(c)}`];

  const conds: string[] = [];
  if (c.min_subtotal !== null && c.min_subtotal > 0) {
    conds.push(`pedido mínimo ${moneyBR(c.min_subtotal)}`);
  }
  if (c.applies_to === "product") {
    conds.push(`vale apenas para produtos específicos (verifique se está no carrinho antes de ofertar)`);
  } else if (c.applies_to === "category" || c.applies_to === "collection") {
    conds.push(`vale apenas para categoria/coleção específica`);
  }
  if (c.usage_limit_per_customer !== null) {
    conds.push(`máx ${c.usage_limit_per_customer}× por cliente`);
  }
  if (c.usage_limit_total !== null) {
    const remaining = Math.max(0, c.usage_limit_total - c.used_count);
    conds.push(`restam ${remaining} usos no total`);
  }
  const expiry = formatExpiry(c.expires_at);
  if (expiry) conds.push(`válido até ${expiry}`);

  if (conds.length > 0) parts.push(`  • condições: ${conds.join(" · ")}`);
  if (c.description) parts.push(`  • obs: ${c.description.trim()}`);

  return parts.join("\n");
}

export function buildCouponIntelligenceBlock(coupons: Coupon[]): string {
  if (!Array.isArray(coupons) || coupons.length === 0) return "";

  /* Sort by priority for the agent: unconditional > with min > targeted */
  const sorted = [...coupons].sort((a, b) => {
    const scoreA = (a.applies_to === "all" ? 0 : 2) + (a.min_subtotal ? 1 : 0);
    const scoreB = (b.applies_to === "all" ? 0 : 2) + (b.min_subtotal ? 1 : 0);
    return scoreA - scoreB;
  });

  return [
    "═══ CUPONS ATIVOS DA LOJA ═══",
    "(Use como ferramenta de fechamento — quando o cliente hesita em preço, ofereça um cupom aplicável.)",
    "",
    ...sorted.map((c) => formatLine(c)),
    "",
    "REGRAS DE USO DOS CUPONS:",
    "- SÓ ofereça cupom quando fizer sentido (cliente travou em preço, comprou pouco, voltou pra reclamar de algo).",
    "- Cite o CÓDIGO EXATO em MAIÚSCULAS (ex: BEMVINDO10) — o cliente vai digitar exatamente assim no checkout.",
    "- Confira a condição antes: se o cupom exige pedido mínimo de R$ 50 e o carrinho está em R$ 30, ofereça SÓ se sugerir produto pra completar.",
    "- Para cupons \"vale apenas para produtos específicos\", confirme primeiro que o produto desejado está na lista — senão NÃO mencione.",
    "- Nunca prometa desconto maior que o cupom dá. Cite o valor exato sempre que possível.",
  ].join("\n");
}
