/**
 * Unified brand context pack for multi-channel replies (IG + WA).
 * Global training + channel overrides + catalog/KB/skills.
 */

import { AIAgentProfileService } from "./aiAgentProfile";
import { KnowledgeBaseService } from "./knowledgeBase";
import { ProductsService } from "./products";
import { getActiveSkillsBlock } from "./brandSkillsRuntime";
import { getChannelAttendance, type ChannelAttendance } from "./channelAttendance";
import {
  type AttendanceChannel,
  clampChannelMaxChars,
  platformHardCap,
} from "./channelLimits";
import { logger } from "../utils/logger";
import { buildProductIntelligenceBlock } from "./cognitive/skills/productIntelligence";

const profileService = new AIAgentProfileService();
const knowledgeBase = new KnowledgeBaseService();
const productsService = new ProductsService();

export type CatalogItemLite = {
  name: string;
  price: number | string | null;
  unit?: string | null;
  description?: string;
};

export type BrandContextPack = {
  brandId: string;
  channel: AttendanceChannel;
  brand_name: string;
  persona: string;
  tone: string;
  guidelines: string;
  training_global: string;
  training_channel: string;
  value_proposition: string;
  first_contact_script: string;
  objective: string;
  communication_rules: string;
  preferred_terms: string[];
  forbidden_terms: string[];
  faq: Array<{ q: string; a: string }>;
  catalog_block: string;
  /** Lightweight items for deterministic catalog fallback when AI is down */
  catalog_items: CatalogItemLite[];
  knowledge_block: string;
  skills_block: string;
  sales_mode: string;
  objections: Array<{ signal: string; response: string }>;
  max_chars: number;
  max_bubbles: number;
  split_long_replies: boolean;
  platform_hard_cap: number;
  channel_cfg: ChannelAttendance;
};

function compactCatalog(full: string, maxLen = 3500): string {
  if (!full || full.length <= maxLen) return full || "";
  return `${full.slice(0, maxLen)}\n…(catálogo truncado para o prompt; use só fatos acima)`;
}

export function scoreProductRelevance(name: string, desc: string, query: string): number {
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hay = `${name} ${desc}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!q.trim()) return 0;
  let score = 0;
  // Expand common quantity aliases so "quilo" matches "1kg"
  const expanded = q
    .replace(/\b1\s*kg\b/g, "1kg quilo")
    .replace(/\bquilos?\b/g, "quilo kg")
    .replace(/\bkilo\b/g, "quilo kg");
  for (const token of expanded.split(/\s+/).filter((t) => t.length > 2)) {
    if (hay.includes(token)) score += token.length > 4 ? 3 : 1;
  }
  return score;
}

function formatMoneyBR(price: number | string | null | undefined): string | null {
  if (price == null || price === "") return null;
  const n =
    typeof price === "number"
      ? price
      : parseFloat(String(price).replace(/[^\d,.-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * When AI fails (quota, timeout) but catalog has a clear product match,
 * answer with name + price instead of the generic "em breve retornamos".
 * Never invents prices — only items already in catalog_items.
 */
export function buildCatalogAwareFallback(
  items: CatalogItemLite[],
  inbound: string,
  brandName: string,
  maxChars = 450,
): string | null {
  if (!items?.length || !String(inbound || "").trim()) return null;

  const priceIntent =
    /pre[cç]o|valor|quanto\s+custa|custa\b|or[cç]amento|tabela|kg|quilo|kilo/i.test(
      inbound,
    );

  const scored = items
    .map((p) => ({
      p,
      s: scoreProductRelevance(p.name, p.description || "", inbound),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) return null;
  const best = scored[0];
  // Need a real product signal; price questions can use lower score threshold
  if (best.s < (priceIntent ? 2 : 5)) return null;

  const top = scored
    .slice(0, 2)
    .filter((x) => x.s >= Math.max(priceIntent ? 2 : 4, best.s - 4));

  const lines = top
    .map(({ p }) => {
      const pr = formatMoneyBR(p.price);
      if (!pr) return null;
      const unit = p.unit ? ` / ${p.unit}` : "";
      return `• ${p.name}: ${pr}${unit}`;
    })
    .filter(Boolean) as string[];

  if (!lines.length) return null;

  let msg =
    top.length === 1
      ? `${top[0].p.name} está ${formatMoneyBR(top[0].p.price)}${
          top[0].p.unit ? ` (${top[0].p.unit})` : ""
        }. Quer para casa ou revenda?`
      : `Na ${brandName || "nossa loja"}:\n${lines.join("\n")}\nQuer para casa ou revenda?`;

  if (msg.length > maxChars) msg = msg.slice(0, maxChars).trim();
  return msg;
}

/**
 * Build runtime context for a brand + channel + optional inbound text.
 */
export async function buildBrandContextPack(input: {
  brandId: string;
  userId: string;
  channel: AttendanceChannel;
  inboundText?: string;
}): Promise<BrandContextPack> {
  const { brandId, userId, channel } = input;
  const inbound = String(input.inboundText || "").trim();

  const channelCfg = await getChannelAttendance(brandId, channel);

  const [profile, knowledge, products, skillsBlock] = await Promise.all([
    profileService.getByUserId(userId, brandId).catch(() => profileService.getByUserId(userId)),
    channelCfg.include_kb
      ? knowledgeBase.searchForContext(inbound || "atendimento", userId, brandId).catch(() => "")
      : Promise.resolve(""),
    channelCfg.include_catalog
      ? productsService.getActiveProducts(userId, brandId).catch(() => [])
      : Promise.resolve([]),
    channelCfg.include_skills
      ? getActiveSkillsBlock({
          brandId,
          userId,
          messageText: inbound || "ajuda",
        }).catch(() => "")
      : Promise.resolve(""),
  ]);

  // Rank products by inbound relevance; keep top 15 for prompt size
  let productList = Array.isArray(products) ? products : [];
  if (inbound && productList.length > 15) {
    productList = [...productList]
      .map((p: any) => ({
        p,
        s: scoreProductRelevance(String(p.name || ""), String(p.description || ""), inbound),
      }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 15)
      .map((x) => x.p);
  } else {
    productList = productList.slice(0, 20);
  }

  let catalog_block = "";
  const catalog_items: CatalogItemLite[] = [];
  if (channelCfg.include_catalog && productList.length) {
    for (const p of productList.slice(0, 20) as any[]) {
      const price = p.promo_price ?? p.promoPrice ?? p.price ?? null;
      catalog_items.push({
        name: String(p.name || "").trim() || "Produto",
        price,
        unit: p.unit != null ? String(p.unit) : null,
        description: String(p.description || "").slice(0, 160),
      });
    }
    try {
      catalog_block = compactCatalog(buildProductIntelligenceBlock(productList as any));
    } catch (e: any) {
      logger.warn(`[brandContextPack] catalog: ${e?.message || e}`);
      catalog_block = catalog_items
        .slice(0, 12)
        .map((p) => {
          const pr = formatMoneyBR(p.price);
          return `- ${p.name}: ${pr || "?"}${p.description ? ` — ${p.description}` : ""}`;
        })
        .join("\n");
    }
  }

  // IG legacy FAQ + channel FAQ
  let faq = Array.isArray(channelCfg.faq_json) ? [...channelCfg.faq_json] : [];
  if (channel === "instagram") {
    try {
      const { instagramService } = await import("./instagram");
      const ig = await instagramService.getAiSettings(brandId);
      const igFaq = Array.isArray(ig.faq) ? (ig.faq as any[]) : [];
      faq = [...igFaq, ...faq];
    } catch {
      /* ignore */
    }
  }

  const brand_name =
    String((profile as any)?.agent_name ? "" : "") ||
    // prefer IG brand_name if present
    "";

  let resolvedBrandName = "nossa loja";
  try {
    if (channel === "instagram") {
      const { instagramService } = await import("./instagram");
      const ig = await instagramService.getAiSettings(brandId);
      resolvedBrandName = String(ig.brand_name || profile.agent_name || "nossa loja");
    } else {
      resolvedBrandName = String(profile.agent_name || "nossa loja");
    }
  } catch {
    resolvedBrandName = String(profile.agent_name || "nossa loja");
  }

  const persona =
    channelCfg.persona_override?.trim() ||
    String(profile.business_context || profile.training_notes || "").slice(0, 800);

  const tone =
    channelCfg.tone_override?.trim() ||
    String(profile.tone || "professional");

  const guidelines = [
    channelCfg.channel_rules?.trim(),
    profile.communication_rules?.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const max_chars = clampChannelMaxChars(channel, channelCfg.max_chars || profile.max_length);
  const hard = platformHardCap(channel);

  return {
    brandId,
    channel,
    brand_name: resolvedBrandName || brand_name || "nossa loja",
    persona,
    tone,
    guidelines,
    training_global: [
      profile.value_proposition ? `Proposta de valor: ${profile.value_proposition}` : "",
      profile.objective ? `Objetivo: ${profile.objective}` : "",
      profile.business_context ? `Contexto: ${profile.business_context}` : "",
      profile.training_notes ? `Treinamento: ${profile.training_notes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    training_channel: String(channelCfg.training_channel || ""),
    value_proposition: String(profile.value_proposition || ""),
    first_contact_script: String(
      channelCfg.first_contact_override || profile.first_contact_script || "",
    ),
    objective: String(profile.objective || ""),
    communication_rules: String(profile.communication_rules || ""),
    preferred_terms: profile.preferred_terms || [],
    forbidden_terms: profile.forbidden_terms || [],
    faq,
    catalog_block,
    catalog_items,
    knowledge_block: String(knowledge || ""),
    skills_block: String(skillsBlock || ""),
    sales_mode: channelCfg.sales_mode,
    objections: Array.isArray(profile.objections) ? profile.objections : [],
    max_chars: Math.min(max_chars, hard),
    max_bubbles: channelCfg.max_bubbles || 3,
    split_long_replies: channelCfg.split_long_replies !== false,
    platform_hard_cap: hard,
    channel_cfg: channelCfg,
  };
}

/** Prompt block shared by IG/WA composers */
export function formatPackForPrompt(pack: BrandContextPack, inboundText: string): string {
  const lines: string[] = [
    `Você é o assistente de atendimento da marca "${pack.brand_name}" no canal ${pack.channel}.`,
    pack.value_proposition ? `PROPOSTA DE VALOR: ${pack.value_proposition}` : "",
    pack.objective ? `OBJETIVO: ${pack.objective}` : "",
    pack.persona ? `PERSONA/CONTEXTO: ${pack.persona}` : "",
    pack.tone ? `TOM: ${pack.tone}` : "",
    pack.training_global ? `TREINAMENTO GLOBAL:\n${pack.training_global}` : "",
    pack.training_channel
      ? `TREINAMENTO ESPECÍFICO DO CANAL (${pack.channel}):\n${pack.training_channel}`
      : "",
    pack.guidelines ? `REGRAS:\n${pack.guidelines}` : "",
    pack.first_contact_script ? `ROTEIRO 1º CONTATO:\n${pack.first_contact_script}` : "",
    pack.preferred_terms?.length
      ? `Termos preferidos: ${pack.preferred_terms.join(", ")}`
      : "",
    pack.forbidden_terms?.length
      ? `Nunca use: ${pack.forbidden_terms.join(", ")}`
      : "",
    pack.catalog_block
      ? `CATÁLOGO (use só estes fatos de preço/produto; não invente):\n${pack.catalog_block}`
      : "",
    pack.knowledge_block ? `BASE DE CONHECIMENTO:\n${pack.knowledge_block}` : "",
    pack.skills_block ? `HABILIDADES ATIVAS:\n${pack.skills_block}` : "",
    pack.sales_mode !== "off"
      ? `MODO VENDAS: ${pack.sales_mode}. Se houver objeção (preço, "vou pensar"), reconheça e use fato do catálogo/garantia. Não discuta com o cliente.`
      : "",
    pack.objections?.length
      ? `OBJEÇÕES CADASTRADAS:\n${pack.objections
          .slice(0, 12)
          .map((o) => `- Se "${o.signal}" → ${o.response}`)
          .join("\n")}`
      : "",
    // Regras comerciais seguras (otimização de qualidade — não altera treino salvo)
    `REGRAS DE RESPOSTA COMERCIAL (obrigatórias):`,
    `1) Se o cliente perguntar preço, valor, quanto custa, ou citar produto/quantidade: use o CATÁLOGO acima. Informe nome do produto, unidade/embalagem e preço quando existir no catálogo.`,
    `2) Nunca responda só com "em breve retornamos", "aguarde" ou genéricos se houver fato de catálogo ou treinamento para a dúvida.`,
    `3) Depois do preço/fato, faça NO MÁXIMO 1 pergunta de próximo passo (ex.: casa ou revenda? quantidade?). Não abra menu genérico se a intenção já está clara.`,
    `4) Não invente preço. Se o item não estiver no catálogo, diga que confirma e peça 1 detalhe (tipo/quantidade).`,
    `5) Preserve o tom e as regras do TREINAMENTO GLOBAL — ele é a fonte principal de voz e objeções em texto.`,
    `LIMITE: cada mensagem deve ter no máximo ${pack.max_chars} caracteres.`,
    `Se precisar de mais conteúdo, separe em até ${pack.max_bubbles} bolhas com o separador exatamente:`,
    `\\n\\n---\\n\\n`,
    `Mensagem do cliente: """${inboundText}"""`,
    `Responda em português do Brasil, útil e direto. Sem markdown pesado.`,
  ];
  return lines.filter(Boolean).join("\n\n");
}
