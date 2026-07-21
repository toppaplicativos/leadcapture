/**
 * Copiloto de atendimento do afiliado — gera respostas com o mesmo treinamento
 * da marca usado no atendimento automático (channel pack, KB, catálogo, learning).
 */
import { queryOne } from "../config/database";
import { GeminiService } from "./gemini";
import { AIRouter } from "./aiRouter";
import { affiliateProductLearningService } from "./affiliateProductLearning";
import { AffiliatesService } from "./affiliates";
import { KnowledgeBaseService } from "./knowledgeBase";
import { logger } from "../utils/logger";

const gemini = new GeminiService();
const aiRouter = new AIRouter();
const affiliatesService = new AffiliatesService();
const knowledgeBase = new KnowledgeBaseService();

export type AttendanceAssistImage = {
  base64: string;
  mimeType: string;
};

export type AttendanceAssistInput = {
  ownerUserId: string;
  brandId: string;
  affiliateUserId: string;
  conversation?: string;
  instruction?: string;
  image?: AttendanceAssistImage | null;
  productId?: string | null;
};

export type AttendanceAssistProduct = {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  promo_price: number | null;
  image_url: string | null;
  category: string | null;
  unit: string | null;
  has_guide: boolean;
  reason?: string | null;
};

export type AttendanceAssistResult = {
  reply: string;
  customer_question_summary: string;
  notes_for_affiliate: string;
  extracted_text: string | null;
  products: AttendanceAssistProduct[];
  training_used: boolean;
  knowledge_used: boolean;
  catalog_used: boolean;
  provider?: string;
};

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAssistJson(raw: string): {
  reply: string;
  customer_question_summary: string;
  notes_for_affiliate: string;
  product_names: string[];
  product_reasons: Record<string, string>;
} {
  const trimmed = String(raw || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : (trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed);
  let parsed: any = {};
  try {
    parsed = JSON.parse(candidate);
  } catch {
    /* fallback: treat entire model output as reply */
    return {
      reply: trimmed.replace(/^["']|["']$/g, ""),
      customer_question_summary: "",
      notes_for_affiliate: "",
      product_names: [],
      product_reasons: {},
    };
  }

  const names = Array.isArray(parsed.product_names || parsed.produtos || parsed.suggested_products)
    ? (parsed.product_names || parsed.produtos || parsed.suggested_products)
        .map((v: unknown) => {
          if (typeof v === "string") return v.trim();
          if (v && typeof v === "object") return String((v as any).name || (v as any).nome || "").trim();
          return "";
        })
        .filter(Boolean)
    : [];

  const reasons: Record<string, string> = {};
  const reasonList = Array.isArray(parsed.product_reasons) ? parsed.product_reasons : [];
  for (const item of reasonList) {
    const n = String(item?.name || item?.nome || "").trim();
    const r = String(item?.reason || item?.motivo || "").trim();
    if (n && r) reasons[n.toLowerCase()] = r;
  }

  return {
    reply: String(parsed.reply || parsed.resposta || parsed.message || "").trim(),
    customer_question_summary: String(
      parsed.customer_question_summary || parsed.resumo_pergunta || parsed.summary || "",
    ).trim(),
    notes_for_affiliate: String(
      parsed.notes_for_affiliate || parsed.notas || parsed.dica || "",
    ).trim(),
    product_names: names.slice(0, 5),
    product_reasons: reasons,
  };
}

function scoreProductMatch(queryText: string, product: {
  name: string;
  category?: string | null;
  description?: string;
  features?: string[];
}): number {
  const q = queryText.toLowerCase();
  const name = String(product.name || "").toLowerCase();
  if (!name) return 0;
  let score = 0;
  if (q.includes(name)) score += 12;
  for (const token of name.split(/\s+/).filter((t) => t.length > 2)) {
    if (q.includes(token)) score += 2;
  }
  const cat = String(product.category || "").toLowerCase();
  if (cat && q.includes(cat)) score += 3;
  for (const f of product.features || []) {
    const ft = String(f || "").toLowerCase();
    if (ft.length > 3 && q.includes(ft)) score += 1;
  }
  const desc = String(product.description || "").toLowerCase().slice(0, 200);
  for (const token of q.split(/\s+/).filter((t) => t.length > 4).slice(0, 12)) {
    if (desc.includes(token)) score += 0.5;
  }
  return score;
}

async function extractTextFromScreenshot(
  image: AttendanceAssistImage,
  scope: { userId: string; brandId: string },
): Promise<string> {
  const mime = String(image.mimeType || "image/jpeg").toLowerCase();
  const safeMime = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)
    ? mime
    : "image/jpeg";
  const base64 = String(image.base64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!base64 || base64.length < 80) throw new Error("Imagem inválida ou muito pequena");
  if (base64.length > 6_000_000) throw new Error("Imagem muito grande — use print com menos de ~4 MB");

  const prompt = `Você analisa um print de conversa de WhatsApp/chat de vendas.
Extraia o texto da conversa na ordem cronológica, no formato:
Cliente: ...
Afiliado: ...
Cliente: ...

Regras:
- Inclua TODAS as falas legíveis.
- Se não for possível ler algo, use [ilegível].
- Não invente mensagens.
- Se não houver conversa, descreva o que há na imagem em 1 linha.
- Responda SOMENTE com o texto extraído.`;

  const text = await gemini.analyzeImages(
    [{ base64, mimeType: safeMime, name: "print-conversa" }],
    prompt,
    undefined,
    false,
    { userId: scope.userId, brandId: scope.brandId },
  );
  return String(text || "").trim();
}

export async function runAffiliateAttendanceAssist(
  input: AttendanceAssistInput,
): Promise<AttendanceAssistResult> {
  const ownerUserId = String(input.ownerUserId || "").trim();
  const brandId = String(input.brandId || "").trim();
  if (!ownerUserId || !brandId) throw new Error("Contexto de marca inválido");

  let conversation = String(input.conversation || "").trim().slice(0, 8000);
  const instruction = String(input.instruction || "").trim().slice(0, 600);
  let extractedText: string | null = null;

  if (input.image?.base64) {
    try {
      extractedText = await extractTextFromScreenshot(input.image, {
        userId: ownerUserId,
        brandId,
      });
      if (extractedText) {
        conversation = conversation
          ? `${conversation}\n\n--- Texto do print ---\n${extractedText}`
          : extractedText;
      }
    } catch (e: any) {
      logger.warn(`[affiliateAttendanceAssist] OCR falhou: ${e?.message || e}`);
      if (!conversation) {
        throw new Error(e?.message || "Não foi possível ler o print. Tente colar o texto da conversa.");
      }
    }
  }

  if (!conversation) {
    throw new Error("Cole a conversa ou envie um print da pergunta do cliente");
  }

  const brandRow = await queryOne<any>(
    `SELECT name, slogan FROM brand_units WHERE id = ? LIMIT 1`,
    [brandId],
  ).catch(() => null);
  const brandName = String(brandRow?.name || "").trim() || "a marca";
  const brandSlogan = String(brandRow?.slogan || "").trim();

  const catalog = await affiliateProductLearningService.listCatalog(ownerUserId, brandId).catch(() => []);
  const catalogSlice = (catalog || []).slice(0, 40);
  const focusProduct = input.productId
    ? catalogSlice.find((p) => p.id === String(input.productId))
    : null;

  let channelTraining = "";
  let channelRules = "";
  let salesMode = "";
  let objectionsBlock = "";
  let skillsBlock = "";
  let trainingUsed = false;
  let knowledgeBlock = "";
  let knowledgeUsed = false;
  try {
    const { buildBrandContextPack } = await import("./brandContextPack");
    const pack = await buildBrandContextPack({
      brandId,
      userId: ownerUserId,
      channel: "whatsapp",
      inboundText: conversation.slice(-1200),
    });
    channelTraining = [
      String(pack.training_global || "").trim(),
      String(pack.training_channel || "").trim(),
      String(pack.value_proposition || "").trim()
        ? `Proposta de valor: ${pack.value_proposition}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2800);
    channelRules = String(pack.guidelines || pack.channel_cfg?.channel_rules || "")
      .trim()
      .slice(0, 1000);
    salesMode = String(pack.sales_mode || "").trim();
    skillsBlock = String(pack.skills_block || "").trim().slice(0, 1800);
    knowledgeBlock = String(pack.knowledge_block || "").trim().slice(0, 2200);
    knowledgeUsed = Boolean(knowledgeBlock);
    if (Array.isArray(pack.objections) && pack.objections.length) {
      objectionsBlock = pack.objections
        .slice(0, 8)
        .map((o: any) => `- Sinal: ${o.signal} → Resposta: ${o.response}`)
        .join("\n");
    }
    trainingUsed = Boolean(
      channelTraining || channelRules || objectionsBlock || skillsBlock || knowledgeBlock,
    );
  } catch (e: any) {
    logger.warn(`[affiliateAttendanceAssist] brandContextPack: ${e?.message || e}`);
  }

  if (!knowledgeBlock) {
    try {
      knowledgeBlock = String(
        await knowledgeBase.searchForContext(conversation.slice(-1500), ownerUserId, brandId),
      )
        .trim()
        .slice(0, 2200);
      knowledgeUsed = Boolean(knowledgeBlock);
    } catch {
      /* optional */
    }
  }

  let learningBlock = "";
  try {
    const modules = await affiliatesService.listLearningModules(ownerUserId, brandId, true);
    learningBlock = (modules || [])
      .slice(0, 6)
      .map((m: any) => {
        const body = stripHtml(String(m.content_html || "")).slice(0, 400);
        return body ? `### ${m.title}\n${body}` : "";
      })
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2200);
    if (learningBlock) trainingUsed = true;
  } catch {
    /* optional */
  }

  /* Guias de produto relevantes (score) para enriquecer o prompt */
  let guidesBlock = "";
  try {
    const ranked = [...catalogSlice]
      .map((p) => ({ p, score: scoreProductMatch(conversation, p) }))
      .filter((x) => x.score > 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const guideParts: string[] = [];
    for (const { p } of ranked) {
      if (!p.has_guide) continue;
      const guide = await affiliateProductLearningService.getGuide(ownerUserId, brandId, p.id);
      if (!guide?.structure) continue;
      const s = guide.structure;
      const objections = (s.objections || [])
        .slice(0, 3)
        .map((o) => `  · ${o.objection} → ${o.response}`)
        .join("\n");
      guideParts.push(
        [
          `Produto: ${p.name}`,
          s.summary ? `Resumo: ${s.summary}` : "",
          s.strong_points?.length ? `Pontos fortes: ${s.strong_points.slice(0, 4).join("; ")}` : "",
          objections ? `Objeções:\n${objections}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    guidesBlock = guideParts.join("\n\n").slice(0, 2000);
    if (guidesBlock) trainingUsed = true;
  } catch {
    /* optional */
  }

  const catalogLines = catalogSlice
    .map((p) => {
      const price =
        p.promo_price != null && p.promo_price < p.price
          ? `R$ ${p.promo_price} (de R$ ${p.price})`
          : `R$ ${p.price}`;
      return `- ${p.name}${p.category ? ` [${p.category}]` : ""} · ${price}${p.unit ? `/${p.unit}` : ""}`;
    })
    .join("\n");

  const focusLine = focusProduct
    ? `Produto em foco (priorizar se fizer sentido): ${focusProduct.name}`
    : "";

  const prompt = `Você é o copiloto de atendimento de um AFILIADO da marca "${brandName}".
O afiliado está conversando com o CLIENTE FINAL (não é recrutamento de afiliados).
Gere UMA resposta pronta para o afiliado copiar e colar no WhatsApp.

MARCA: ${brandName}${brandSlogan ? ` · Slogan: ${brandSlogan}` : ""}
${salesMode ? `Modo de vendas: ${salesMode}` : ""}
${focusLine}

CONVERSA / PERGUNTA DO CLIENTE:
"""
${conversation}
"""

${instruction ? `Instrução extra do afiliado: ${instruction}` : ""}

${channelTraining ? `TREINAMENTO DA MARCA (mesma base do atendimento automático):\n${channelTraining}` : ""}
${channelRules ? `REGRAS DO CANAL:\n${channelRules}` : ""}
${objectionsBlock ? `OBJEÇÕES TREINADAS:\n${objectionsBlock}` : ""}
${skillsBlock ? `SKILLS ATIVAS:\n${skillsBlock}` : ""}
${knowledgeBlock ? `BASE DE CONHECIMENTO RELEVANTE:\n${knowledgeBlock}` : ""}
${learningBlock ? `MÓDULOS DE APRENDIZADO DO PROGRAMA:\n${learningBlock}` : ""}
${guidesBlock ? `GUIAS DE PRODUTO RELEVANTES:\n${guidesBlock}` : ""}

CATÁLOGO DISPONÍVEL (use só nomes desta lista se sugerir produtos):
${catalogLines || "(sem produtos no momento)"}

Regras obrigatórias:
1. Responda como o afiliado falando com o cliente — tom humano, WhatsApp, pt-BR.
2. NÃO invente preço, frete, prazo, promoção ou estoque que não estejam no contexto.
3. NÃO mencione comissão, programa de afiliados, "ser parceiro" ou recrutamento.
4. Se faltar dado, diga de forma honesta e ofereça próximo passo (ex.: confirmar com a loja).
5. Inclua no máximo 1–3 produtos do catálogo quando ajudarem a converter; se nenhum servir, lista vazia.
6. A resposta (reply) deve ser curta (ideal 2–6 frases), com pergunta ou CTA claro.
7. notes_for_affiliate é só para o afiliado (não copiar pro cliente): dica operacional.

Responda APENAS com JSON válido (sem markdown):
{
  "reply": "mensagem pronta para o WhatsApp",
  "customer_question_summary": "resumo em 1 frase do que o cliente quer",
  "notes_for_affiliate": "dica curta para o afiliado",
  "product_names": ["Nome exato do catálogo", "..."],
  "product_reasons": [{"name": "Nome", "reason": "por que sugerir"}]
}`;

  const generated = await aiRouter.generateText(
    prompt,
    { userId: ownerUserId, brandId },
    { temperature: 0.45, functionKey: "text.affiliate.attendance_assist" },
  );

  const parsed = parseAssistJson(generated.text || "");
  let reply = parsed.reply;
  if (!reply) {
    /* último recurso: texto cru */
    reply = String(generated.text || "").trim().slice(0, 2000);
  }
  if (!reply) throw new Error("A IA não gerou uma resposta. Tente reformular a pergunta.");

  /* Mapear produtos sugeridos ao catálogo real */
  const products: AttendanceAssistProduct[] = [];
  const usedIds = new Set<string>();

  const pushProduct = (p: (typeof catalogSlice)[0], reason?: string) => {
    if (!p || usedIds.has(p.id)) return;
    usedIds.add(p.id);
    products.push({
      id: p.id,
      name: p.name,
      slug: p.slug || null,
      price: Number(p.price || 0),
      promo_price: p.promo_price ?? null,
      image_url: p.image_url || null,
      category: p.category || null,
      unit: p.unit || null,
      has_guide: Boolean(p.has_guide),
      reason: reason || null,
    });
  };

  for (const name of parsed.product_names) {
    const lower = name.toLowerCase();
    const exact = catalogSlice.find((p) => p.name.toLowerCase() === lower);
    const partial = exact
      || catalogSlice.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()));
    if (partial) {
      pushProduct(partial, parsed.product_reasons[lower] || parsed.product_reasons[partial.name.toLowerCase()]);
    }
  }

  if (focusProduct) {
    pushProduct(focusProduct, "Produto que você selecionou");
  }

  /* Se IA não sugeriu, rankeia por match na conversa */
  if (products.length === 0 && catalogSlice.length) {
    const ranked = [...catalogSlice]
      .map((p) => ({ p, score: scoreProductMatch(conversation + " " + reply, p) }))
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const { p } of ranked) pushProduct(p, "Relacionado à conversa");
  }

  return {
    reply: reply.slice(0, 2500),
    customer_question_summary: parsed.customer_question_summary.slice(0, 300),
    notes_for_affiliate: parsed.notes_for_affiliate.slice(0, 400),
    extracted_text: extractedText,
    products: products.slice(0, 3),
    training_used: trainingUsed,
    knowledge_used: knowledgeUsed,
    catalog_used: products.length > 0 || catalogSlice.length > 0,
    provider: generated.provider,
  };
}
