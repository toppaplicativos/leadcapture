/**
 * Lightweight funnel detection + sales blocks for multi-channel (IG/WA).
 * Complements full cognitive reasoner without requiring LLM for stage detect.
 */

import type { FunnelStage } from "./cognitive/types";
import { FUNNEL_PLAYBOOK, playbookForStage } from "./cognitive/skills/salesReasoning";

export type BrandObjection = { signal: string; response: string };

export function detectFunnelStageLight(text: string): FunnelStage {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!t.trim()) return "noise";

  if (/(caro|preco alto|muito caro|nao tenho|vou pensar|depois|mais barato|desconto|nao sei se)/.test(t)) {
    return "objection";
  }
  if (/(comprei|pedido|rastreio|entrega do|meu pedido|nota fiscal|garantia do produto)/.test(t)) {
    return "post_purchase";
  }
  if (/(quero comprar|como compro|link|fechar|pedir|fazer pedido|pagar|pix|cartao)/.test(t)) {
    return "decision";
  }
  if (/(quanto custa|preco|valor|catalogo|tem .*?|diferenca|qual melhor|opcoes)/.test(t)) {
    return "consideration";
  }
  if (/(horario|endereco|fica onde|frete|prazo de entrega|funciona)/.test(t)) {
    return "support";
  }
  if (t.length < 4 || /^(oi|ola|hey|eai|kk+|haha+|ok|blz)$/.test(t.trim())) {
    return "awareness";
  }
  return "awareness";
}

export function formatSalesModeBlock(
  salesMode: string,
  stage: FunnelStage,
  objections: BrandObjection[] = [],
): string {
  if (!salesMode || salesMode === "off") return "";

  const entry = playbookForStage(stage);
  const lines = [
    `MODO VENDAS: ${salesMode} | estágio detectado: ${stage}`,
    `Meta do estágio: ${entry.goal}`,
    `Faça: ${entry.do.join(" / ")}`,
    `Evite: ${entry.avoid.join(" / ")}`,
  ];

  if (salesMode === "full") {
    lines.push(
      "Conduza como consultor comercial: 1 pergunta no máximo, 1 próximo passo claro, use fatos do catálogo.",
    );
  } else if (salesMode === "assist") {
    lines.push("Ajude com informação e caminho de compra, sem pressão.");
  }

  if (objections.length) {
    lines.push("QUEBRA DE OBJEÇÕES CADASTRADAS (use se o sinal aparecer):");
    for (const o of objections.slice(0, 12)) {
      if (!o.signal || !o.response) continue;
      lines.push(`- Se o cliente indicar "${o.signal}" → ${o.response}`);
    }
  }

  return lines.join("\n");
}

export function matchConfiguredObjections(
  text: string,
  objections: BrandObjection[],
): BrandObjection[] {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return objections.filter((o) => {
    const sig = String(o.signal || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return sig && t.includes(sig);
  });
}

export function formatFullPlaybookBrief(): string {
  // Compact version of FUNNEL_PLAYBOOK for prompts
  return Object.entries(FUNNEL_PLAYBOOK)
    .map(([k, v]) => `[${k}] ${v.goal}`)
    .join(" | ");
}

export function igConversationId(brandId: string, senderId: string): string {
  return `ig:${brandId}:${senderId}`;
}
