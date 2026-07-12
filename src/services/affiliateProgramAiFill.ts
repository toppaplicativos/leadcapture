/**
 * Gera e aplica um programa de afiliados completo a partir de poucos inputs.
 * Pipeline: brief → IA (JSON) → config + programa + aprendizado + treinos + materiais + distribuição.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { aiRouter } from "./aiRouter";
import { AffiliatesService } from "./affiliates";
import {
  affiliateProgramsService,
  normalizePayoutFrequency,
  normalizePayoutMethod,
} from "./affiliatePrograms";
import { affiliateDistributionService } from "./affiliateDistribution";
import { formatCommissionShort, normalizeCommissionMode } from "./affiliateCommission";

export type AiFillInput = {
  opportunity_description: string;
  /** Prazo de referência em dias após confirmação do pagamento */
  payment_days: number;
  commission_mode?: string;
  commission_value?: number;
  payout_method?: string;
  payout_frequency?: string;
  payout_min_amount?: number;
  cookie_days?: number;
  auto_approve?: boolean;
  /** Se true, publica no mercado (status active + is_enabled) */
  activate?: boolean;
  extra_notes?: string;
};

export type AiFillGenerated = {
  program_name: string;
  description: string;
  commission_rules: string;
  eligibility_rules: string;
  terms_html: string;
  policies_html: string;
  orientation_html: string;
  training_html: string;
  share_title: string;
  share_description: string;
  promotion_tone: string;
  payout_notes: string;
  learning_modules: Array<{
    slug: string;
    title: string;
    module_type: string;
    content_html: string;
    is_required: boolean;
    sort_order: number;
  }>;
  trainings: Array<{
    title: string;
    description: string;
    content_html: string;
    sort_order: number;
  }>;
  materials: Array<{
    title: string;
    channel: string;
    category: string;
    copy_text: string;
    sort_order: number;
  }>;
  dist_initial_message: string;
  dist_followup_message: string;
};

export type AiFillResult = {
  program_id: string;
  program_name: string;
  activated: boolean;
  share: {
    partners_marketplace_url: string;
    affiliate_app_path: string;
    subdomain: string | null;
  };
  summary: {
    learning_modules: number;
    trainings: number;
    materials: number;
    payment_days: number;
    commission_label: string;
    payout_label: string;
  };
  generated: AiFillGenerated;
};

const LEARNING_SLUGS = [
  "programa",
  "como-funciona",
  "produtos",
  "entrega",
  "comissao",
  "faq",
] as const;

function parseAiJson<T>(text: string): T {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = fenced ? fenced[1].trim() : trimmed;
  // tenta extrair objeto se vier texto extra
  if (!raw.startsWith("{")) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }
  return JSON.parse(raw) as T;
}

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapHtml(title: string, body: string): string {
  return `<div><h2>${esc(title)}</h2>${body}</div>`;
}

function p(text: string): string {
  return `<p>${esc(text)}</p>`;
}

function ul(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function commissionLabel(mode: string, value: number): string {
  return formatCommissionShort(normalizeCommissionMode(mode), Number(value || 0));
}

function payoutLabel(method: string, frequency: string, min: number, days: number): string {
  const methods: Record<string, string> = {
    pix_direct: "PIX direto",
    bank_deposit: "Depósito",
    wallet: "Carteira",
    other: "Outro",
  };
  const freqs: Record<string, string> = {
    daily: "diário",
    weekly: "semanal",
    biweekly: "quinzenal",
    monthly: "mensal",
    on_demand: "sob demanda",
  };
  return `${methods[method] || method} · ${freqs[frequency] || frequency} · mín. R$ ${min.toFixed(2).replace(".", ",")} · ${days}d após confirmação`;
}

function buildFallback(
  brandName: string,
  input: AiFillInput,
  commissionMode: string,
  commissionValue: number,
  payoutMethod: string,
  payoutFrequency: string,
  minAmount: number,
): AiFillGenerated {
  const days = Math.max(0, Number(input.payment_days) || 1);
  const comm = commissionLabel(commissionMode, commissionValue);
  const pay = payoutLabel(payoutMethod, payoutFrequency, minAmount, days);
  const offer = input.opportunity_description.trim();
  const brand = brandName || "a marca";

  const terms_html = wrapHtml(
    `Termos do Programa de Afiliados — ${brand}`,
    [
      p(`Ao participar, o parceiro concorda em divulgar produtos oficiais de ${brand} e receber comissão sobre vendas válidas.`),
      `<h3>1. Oferta</h3>${p(offer)}`,
      `<h3>2. Comissão</h3>${ul([
        `Modelo: ${comm}`,
        "Comissão só em pedidos pagos e confirmados",
        "Cancelamento, estorno ou não pagamento anulam a comissão",
      ])}`,
      `<h3>3. Pagamento</h3>${ul([
        pay,
        "PIX na chave cadastrada no perfil do parceiro",
      ])}`,
      `<h3>4. Atribuição</h3>${ul([
        `Cookie de ${Number(input.cookie_days || 30)} dias após o clique`,
        "Link exclusivo e/ou cupom do afiliado",
      ])}`,
      `<h3>5. Conduta</h3>${ul([
        "Proibido spam, auto-compra e uso indevido da marca",
        "Usar apenas materiais e preços oficiais",
      ])}`,
      `<h3>6. LGPD</h3>${p("Dados de clientes/leads só para a venda desta marca — sem revenda.")}`,
    ].join(""),
  );

  const policies_html = wrapHtml(
    `Políticas de Conduta — ${brand}`,
    [
      `<h3>Canais</h3>${ul([
        "Permitido: WhatsApp com opt-in, Instagram com materiais oficiais, indicação presencial",
        "Proibido: listas compradas, robôs sem consentimento, se passar pela loja oficial",
      ])}`,
      `<h3>Comunicação</h3>${p("Tom honesto, sem promessas enganosas ou descontos inventados.")}`,
      `<h3>Leads</h3>${p("Responder com agilidade; não repassar leads a terceiros fora do programa.")}`,
      `<h3>Consequências</h3>${p("Advertência, suspensão ou exclusão conforme gravidade.")}`,
    ].join(""),
  );

  const orientation_html = wrapHtml(
    `Bem-vindo(a) ao programa ${brand}`,
    [
      p(offer),
      `<h3>Como você ganha</h3>${p(`${comm}. Repasse: ${pay}.`)}`,
      `<h3>Checklist</h3>${ul([
        "Aceitar termos e políticas",
        "Concluir treinamentos",
        "Cadastrar PIX",
        "Testar link e cupom",
        "Conectar WhatsApp se for receber leads",
      ])}`,
    ].join(""),
  );

  const training_html = wrapHtml(
    `Treinamento rápido — ${brand}`,
    [
      p(offer),
      `<h3>Passos</h3>${ul([
        "Complete o onboarding",
        "Compartilhe link/cupom",
        "Acompanhe vendas no app",
        "Saque via PIX conforme regras",
      ])}`,
    ].join(""),
  );

  const learning_modules = LEARNING_SLUGS.map((slug, i) => {
    const map: Record<string, { title: string; type: string; required: boolean; html: string }> = {
      programa: {
        title: `O que é o programa ${brand}`,
        type: "programa",
        required: true,
        html: wrapHtml(`Programa ${brand}`, p(offer) + ul([`Comissão: ${comm}`, `Repasse: ${pay}`, "Cadastro gratuito"])),
      },
      "como-funciona": {
        title: "Como funciona na prática",
        type: "como_funciona",
        required: true,
        html: wrapHtml(
          "Como funciona",
          ul([
            "Onboarding e liberação de link/cupom",
            "Cadastro de PIX",
            "Divulgação ética",
            "Venda atribuída e comissão após confirmação",
            "Saque conforme periodicidade do programa",
          ]),
        ),
      },
      produtos: {
        title: "Produtos que você deve conhecer",
        type: "produtos",
        required: true,
        html: wrapHtml("Produtos", p(`Estude o catálogo de ${brand} e ofereça o SKU certo para cada perfil de cliente.`) + p(offer)),
      },
      entrega: {
        title: "Entrega e pós-venda",
        type: "entrega",
        required: false,
        html: wrapHtml(
          "Entrega",
          ul([
            "Não prometa prazo sem validar no catálogo",
            "Oriente o cliente pelo pedido oficial",
            "Cancelamentos anulam comissão",
          ]),
        ),
      },
      comissao: {
        title: "Comissões e saques",
        type: "comissao",
        required: true,
        html: wrapHtml("Comissões", p(comm) + p(pay) + ul(["Cadastre PIX no app", "Solicite saque com saldo liberado"])),
      },
      faq: {
        title: "Perguntas frequentes",
        type: "faq",
        required: false,
        html: wrapHtml(
          "FAQ",
          [
            p("Preciso pagar para ser afiliado? Não."),
            p(`Quanto ganho? ${comm}`),
            p(`Quando recebo? ${pay}`),
            p("Posso auto-comprar com meu cupom? Não — é fraude."),
          ].join(""),
        ),
      },
    };
    const m = map[slug];
    return {
      slug,
      title: m.title,
      module_type: m.type,
      content_html: m.html,
      is_required: m.required,
      sort_order: i + 1,
    };
  });

  return {
    program_name: `Parceiros ${brand}`,
    description: offer.slice(0, 500),
    commission_rules: `Comissão: ${comm}. Só em pedidos pagos/confirmados. Cancelamentos anulam. Repasse: ${pay}.`,
    eligibility_rules: "Maior de 18 anos; dados verdadeiros; PIX válido; aceitar termos e concluir onboarding.",
    terms_html,
    policies_html,
    orientation_html,
    training_html,
    share_title: `Seja parceiro ${brand} e ganhe comissão`,
    share_description: `${offer.slice(0, 180)} · ${comm} · ${pay}`,
    promotion_tone: "Amigável e direto, focado em qualidade e confiança. Sem promessas enganosas. Emojis com moderação.",
    payout_notes: `Pagamento ${pay}. Mantenha a chave PIX atualizada no app.`,
    learning_modules,
    trainings: [
      {
        title: "Produto e proposta de valor",
        description: "Como apresentar a oferta sem exageros",
        content_html: wrapHtml("Proposta de valor", p(offer)),
        sort_order: 10,
      },
      {
        title: "Link, cupom e primeira venda",
        description: "Rastreio e compartilhamento",
        content_html: wrapHtml("Link e cupom", ul(["Copie link e cupom no app", "Envie com benefício claro", "Peça para finalizar pelo seu link"])),
        sort_order: 20,
      },
      {
        title: "PIX e saques",
        description: "Financeiro do parceiro",
        content_html: wrapHtml("PIX", p(pay)),
        sort_order: 30,
      },
    ],
    materials: [
      {
        title: "WhatsApp — abertura",
        channel: "whatsapp",
        category: "promo",
        copy_text: `Oi! Sou parceiro da ${brand}. ${offer.slice(0, 120)} Posso te mandar o catálogo com meu cupom?`,
        sort_order: 10,
      },
      {
        title: "Instagram — legenda",
        channel: "instagram",
        category: "story",
        copy_text: `${brand} ✨ ${offer.slice(0, 100)}\nLink e cupom na bio / DM 👇`,
        sort_order: 20,
      },
    ],
    dist_initial_message: `Olá {{prospect_name}}! Sou {{affiliate_name}}, parceiro(a) da {{brand_name}}. ${offer.slice(0, 80)} Posso te ajudar com o catálogo?`,
    dist_followup_message: `Oi {{prospect_name}}! Ainda posso te ajudar com informações da {{brand_name}}? É só responder este WhatsApp.`,
  };
}

function normalizeGenerated(raw: any, fallback: AiFillGenerated): AiFillGenerated {
  const pickHtml = (v: unknown, fb: string) => {
    const s = String(v || "").trim();
    return s.length > 40 ? s : fb;
  };
  const modulesIn = Array.isArray(raw?.learning_modules) ? raw.learning_modules : [];
  const learning_modules = LEARNING_SLUGS.map((slug, i) => {
    const fb = fallback.learning_modules[i];
    const found =
      modulesIn.find((m: any) => String(m?.slug || "") === slug) ||
      modulesIn[i] ||
      {};
    return {
      slug,
      title: String(found.title || fb.title).trim() || fb.title,
      module_type: String(found.module_type || fb.module_type).trim() || fb.module_type,
      content_html: pickHtml(found.content_html, fb.content_html),
      is_required: found.is_required !== undefined ? !!found.is_required : fb.is_required,
      sort_order: Number(found.sort_order || fb.sort_order || i + 1),
    };
  });

  const trainingsIn = Array.isArray(raw?.trainings) ? raw.trainings : [];
  const trainings =
    trainingsIn.length > 0
      ? trainingsIn.slice(0, 6).map((t: any, i: number) => ({
          title: String(t?.title || `Treinamento ${i + 1}`).trim(),
          description: String(t?.description || "").trim(),
          content_html: pickHtml(t?.content_html, fallback.trainings[Math.min(i, fallback.trainings.length - 1)]?.content_html || "<p>Conteúdo</p>"),
          sort_order: Number(t?.sort_order || (i + 1) * 10),
        }))
      : fallback.trainings;

  const matsIn = Array.isArray(raw?.materials) ? raw.materials : [];
  const materials =
    matsIn.length > 0
      ? matsIn.slice(0, 8).map((m: any, i: number) => ({
          title: String(m?.title || `Material ${i + 1}`).trim(),
          channel: String(m?.channel || "whatsapp").trim() || "whatsapp",
          category: String(m?.category || "promo").trim() || "promo",
          copy_text: String(m?.copy_text || m?.text || "").trim() || fallback.materials[0]?.copy_text || "",
          sort_order: Number(m?.sort_order || (i + 1) * 10),
        }))
      : fallback.materials;

  return {
    program_name: String(raw?.program_name || fallback.program_name).trim() || fallback.program_name,
    description: String(raw?.description || fallback.description).trim() || fallback.description,
    commission_rules: String(raw?.commission_rules || fallback.commission_rules).trim(),
    eligibility_rules: String(raw?.eligibility_rules || fallback.eligibility_rules).trim(),
    terms_html: pickHtml(raw?.terms_html, fallback.terms_html),
    policies_html: pickHtml(raw?.policies_html, fallback.policies_html),
    orientation_html: pickHtml(raw?.orientation_html, fallback.orientation_html),
    training_html: pickHtml(raw?.training_html, fallback.training_html),
    share_title: String(raw?.share_title || fallback.share_title).trim().slice(0, 160),
    share_description: String(raw?.share_description || fallback.share_description).trim().slice(0, 320),
    promotion_tone: String(raw?.promotion_tone || fallback.promotion_tone).trim(),
    payout_notes: String(raw?.payout_notes || fallback.payout_notes).trim(),
    learning_modules,
    trainings,
    materials,
    dist_initial_message: String(raw?.dist_initial_message || fallback.dist_initial_message).trim(),
    dist_followup_message: String(raw?.dist_followup_message || fallback.dist_followup_message).trim(),
  };
}

function buildPrompt(ctx: {
  brandName: string;
  slogan?: string | null;
  domain?: string | null;
  products: string[];
  input: AiFillInput;
  commissionMode: string;
  commissionValue: number;
  payoutMethod: string;
  payoutFrequency: string;
  minAmount: number;
}): string {
  const days = Math.max(0, Number(ctx.input.payment_days) || 1);
  const cookie = Number(ctx.input.cookie_days || 30);
  return `Você é especialista em programas de afiliados no Brasil (e-commerce/food).
Crie o conteúdo COMPLETO de um programa de parceiros em português do Brasil.
Responda APENAS com JSON válido (sem markdown, sem comentários).

MARCA:
- Nome: ${ctx.brandName}
- Slogan: ${ctx.slogan || "—"}
- Domínio: ${ctx.domain || "—"}
- Produtos (amostra): ${ctx.products.slice(0, 12).join(" | ") || "catálogo da marca"}

BRIEF DO OPERADOR (obrigatório usar):
- Oferta/oportunidade: ${ctx.input.opportunity_description}
- Prazo de liberação do repasse: ${days} dia(s) após confirmação do pagamento do cliente
- Comissão: modo=${ctx.commissionMode}, valor=${ctx.commissionValue}
- Repasse: método=${ctx.payoutMethod}, frequência=${ctx.payoutFrequency}, mínimo=R$${ctx.minAmount}
- Cookie de atribuição: ${cookie} dias
- Notas extras: ${ctx.input.extra_notes || "—"}

REGRAS DE CONTEÚDO:
- HTML semântico simples: use apenas <div>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <br/>. Sem scripts, sem estilos inline, sem markdown.
- Textos profissionais, claros, sem jargão jurídico excessivo, mas cobrindo regras essenciais (atribuição, comissão, pagamento, conduta, LGPD, proibições).
- Não invente certificações, prazos de entrega ou preços de frete.
- learning_modules DEVE ter exatamente 6 itens com slugs: programa, como-funciona, produtos, entrega, comissao, faq.
- Cada content_html deve ter substância (mín. ~400 caracteres de texto útil).
- materials: 3–4 copies prontas (WhatsApp/Instagram), texto puro no copy_text (sem HTML).
- dist_*_message: usar placeholders {{prospect_name}}, {{affiliate_name}}, {{brand_name}}.

JSON schema:
{
  "program_name": "string",
  "description": "string curta para mercado",
  "commission_rules": "texto plano",
  "eligibility_rules": "texto plano",
  "terms_html": "html",
  "policies_html": "html",
  "orientation_html": "html",
  "training_html": "html (resumo legado)",
  "share_title": "string",
  "share_description": "string",
  "promotion_tone": "string",
  "payout_notes": "string",
  "learning_modules": [
    {"slug":"programa","title":"...","module_type":"programa","content_html":"...","is_required":true,"sort_order":1}
  ],
  "trainings": [
    {"title":"...","description":"...","content_html":"...","sort_order":10}
  ],
  "materials": [
    {"title":"...","channel":"whatsapp|instagram|geral","category":"promo|story","copy_text":"...","sort_order":10}
  ],
  "dist_initial_message": "string",
  "dist_followup_message": "string"
}`;
}

export class AffiliateProgramAiFillService {
  private affiliates = new AffiliatesService();

  async fill(
    ownerUserId: string,
    brandId: string,
    userId: string,
    input: AiFillInput,
  ): Promise<AiFillResult> {
    const opportunity = String(input.opportunity_description || "").trim();
    if (opportunity.length < 20) {
      throw new Error("Descreva a oferta/oportunidade com pelo menos 20 caracteres");
    }
    const paymentDays = Math.max(0, Math.min(90, Number(input.payment_days)));
    if (!Number.isFinite(paymentDays)) {
      throw new Error("Informe o prazo de pagamento (dias após confirmação)");
    }

    const brand = await queryOne<any>(
      `SELECT id, name, slug, slogan, domain, logo_url, cover_image, primary_color
       FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId],
    );
    if (!brand) throw new Error("Marca não encontrada");

    const products = await query<any[]>(
      `SELECT name FROM products WHERE brand_id = ? AND COALESCE(active, TRUE) = TRUE ORDER BY name ASC LIMIT 20`,
      [brandId],
    ).catch(() => [] as any[]);

    const commissionMode = normalizeCommissionMode(input.commission_mode || "percentage");
    const commissionValue = Number(input.commission_value ?? (commissionMode === "percentage" ? 10 : 1));
    const payoutMethod = normalizePayoutMethod(input.payout_method || "pix_direct") || "pix_direct";
    const payoutFrequency = normalizePayoutFrequency(input.payout_frequency || "daily") || "daily";
    const minAmount = Math.max(0, Number(input.payout_min_amount ?? 20));
    const cookieDays = Math.max(1, Math.min(90, Number(input.cookie_days || 30)));

    // activate: true/false força; undefined preserva status atual da marca
    const existingCfg = await this.affiliates.getOrCreateProgramConfig(ownerUserId, brandId);
    const activate =
      input.activate === undefined
        ? existingCfg.is_enabled !== false && existingCfg.is_enabled !== 0 as any
        : !!input.activate;

    const fallback = buildFallback(
      String(brand.name || "Marca"),
      { ...input, payment_days: paymentDays, cookie_days: cookieDays },
      commissionMode,
      commissionValue,
      payoutMethod,
      payoutFrequency,
      minAmount,
    );

    let generated = fallback;
    try {
      const prompt = buildPrompt({
        brandName: String(brand.name || "Marca"),
        slogan: brand.slogan,
        domain: brand.domain,
        products: (products || []).map((p) => String(p.name || "")).filter(Boolean),
        input: { ...input, payment_days: paymentDays, cookie_days: cookieDays },
        commissionMode,
        commissionValue,
        payoutMethod,
        payoutFrequency,
        minAmount,
      });
      const raw = await aiRouter.generateJson<any>(prompt, { userId, brandId }, { temperature: 0.4, functionKey: "text.affiliate.program_fill" });
      generated = normalizeGenerated(raw, fallback);
    } catch (err: any) {
      // tenta via generateText + parse
      try {
        const prompt = buildPrompt({
          brandName: String(brand.name || "Marca"),
          slogan: brand.slogan,
          domain: brand.domain,
          products: (products || []).map((p) => String(p.name || "")).filter(Boolean),
          input: { ...input, payment_days: paymentDays, cookie_days: cookieDays },
          commissionMode,
          commissionValue,
          payoutMethod,
          payoutFrequency,
          minAmount,
        });
        const { text } = await aiRouter.generateText(prompt, { userId, brandId }, { temperature: 0.4, functionKey: "text.affiliate.program_fill" });
        generated = normalizeGenerated(parseAiJson(text), fallback);
      } catch (err2: any) {
        console.error("[affiliateProgramAiFill] AI failed, using fallback:", err2?.message || err?.message);
        generated = fallback;
      }
    }

    // ── Aplicar config legada ──────────────────────────────────────────────
    const shareImage =
      String(brand.cover_image || brand.logo_url || "").trim() || null;

    await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
      is_enabled: activate,
      accept_new_affiliates: true,
      auto_approve_affiliates: !!input.auto_approve,
      default_commission_mode: commissionMode,
      default_commission_value: commissionValue,
      default_commission_pct: commissionMode === "percentage" ? commissionValue : 10,
      commission_rules: generated.commission_rules,
      cookie_days: cookieDays,
      min_withdrawal: minAmount,
      payment_days: paymentDays,
      terms_html: generated.terms_html,
      training_html: generated.training_html,
      share_title: generated.share_title,
      share_description: generated.share_description,
      share_image_url: shareImage || undefined,
      promotion_tone: generated.promotion_tone,
      app_subdomain: brand.domain
        ? `parceiros.${String(brand.domain).replace(/^www\./, "")}`
        : undefined,
    } as any);

    // ── Programa principal ────────────────────────────────────────────────
    const program = await affiliateProgramsService.syncLegacyDefaultProgram(ownerUserId, brandId);
    const programId = String(program.id);

    await affiliateProgramsService.updateProgram(ownerUserId, brandId, programId, {
      name: generated.program_name,
      description: generated.description,
      status: activate ? "active" : "draft",
      is_marketplace_visible: activate,
      accept_applications: true,
      auto_approve_applications: !!input.auto_approve,
      commission_mode: commissionMode,
      commission_value: commissionValue,
      commission_rules: generated.commission_rules,
      eligibility_rules: generated.eligibility_rules,
      terms_html: generated.terms_html,
      policies_html: generated.policies_html,
      orientation_html: generated.orientation_html,
      cookie_days: cookieDays,
      min_withdrawal: minAmount,
      payment_days: paymentDays,
      payout_method: payoutMethod,
      payout_frequency: payoutFrequency,
      payout_min_amount: minAmount,
      payout_notes: generated.payout_notes,
      share_title: generated.share_title,
      share_description: generated.share_description,
      share_image_url: shareImage,
      promotion_tone: generated.promotion_tone,
    });

    // ── Steps de onboarding (garante training step) ────────────────────────
    let trainingStep = await queryOne<any>(
      `SELECT id FROM affiliate_program_steps
       WHERE program_id = ? AND (slug = 'treinamento' OR step_type = 'training')
       LIMIT 1`,
      [programId],
    );
    if (!trainingStep) {
      await affiliateProgramsService.upsertStep(ownerUserId, brandId, programId, {
        slug: "treinamento",
        title: "Treinamento obrigatório",
        description: "Conclua os treinos curtos do programa.",
        step_type: "training",
        sort_order: 40,
        is_required: true,
      });
      trainingStep = await queryOne<any>(
        `SELECT id FROM affiliate_program_steps
         WHERE program_id = ? AND slug = 'treinamento' LIMIT 1`,
        [programId],
      );
    }

    // ── Trainings ─────────────────────────────────────────────────────────
    for (const t of generated.trainings) {
      const existing = await queryOne<any>(
        `SELECT id FROM affiliate_program_trainings WHERE program_id = ? AND title = ? LIMIT 1`,
        [programId, t.title],
      );
      await affiliateProgramsService.upsertTraining(ownerUserId, brandId, programId, {
        id: existing?.id,
        title: t.title,
        description: t.description,
        content_html: t.content_html,
        content_type: "text",
        sort_order: t.sort_order,
        is_required: true,
        step_id: trainingStep?.id || null,
      });
    }

    // ── Learning modules ──────────────────────────────────────────────────
    for (const m of generated.learning_modules) {
      const existing = await queryOne<any>(
        `SELECT id FROM affiliate_learning_modules WHERE brand_id = ? AND slug = ? LIMIT 1`,
        [brandId, m.slug],
      );
      if (existing?.id) {
        await this.affiliates.upsertLearningModule(ownerUserId, brandId, {
          id: existing.id,
          title: m.title,
          module_type: m.module_type,
          content_html: m.content_html,
          sort_order: m.sort_order,
          is_published: true,
          is_required: m.is_required,
        });
        await query(
          `UPDATE affiliate_learning_modules SET program_id = ?, updated_at = NOW() WHERE id = ?`,
          [programId, existing.id],
        ).catch(() => undefined);
      } else {
        await this.affiliates.upsertLearningModule(ownerUserId, brandId, {
          slug: m.slug,
          title: m.title,
          module_type: m.module_type,
          content_html: m.content_html,
          sort_order: m.sort_order,
          is_published: true,
          is_required: m.is_required,
        });
        await query(
          `UPDATE affiliate_learning_modules SET program_id = ? WHERE brand_id = ? AND slug = ?`,
          [programId, brandId, m.slug],
        ).catch(() => undefined);
      }
    }

    // ── Materials (copies) ────────────────────────────────────────────────
    for (const mat of generated.materials) {
      const existing = await queryOne<any>(
        `SELECT id FROM affiliate_materials WHERE brand_id = ? AND title = ? LIMIT 1`,
        [brandId, mat.title],
      );
      if (existing?.id) {
        await this.affiliates.updateMaterial(ownerUserId, existing.id, {
          copy_text: mat.copy_text,
          channel: mat.channel,
          category: mat.category,
          type: "text",
          is_published: true,
          program_id: programId,
          sort_order: mat.sort_order,
        });
      } else {
        await this.affiliates.createMaterial(ownerUserId, brandId, {
          title: mat.title,
          type: "text",
          copy_text: mat.copy_text,
          channel: mat.channel,
          category: mat.category,
          program_id: programId,
          sort_order: mat.sort_order,
          is_published: true,
        });
      }
    }

    // ── Distribution ──────────────────────────────────────────────────────
    try {
      await affiliateDistributionService.ensureSchema();
      const rules = await affiliateDistributionService.getOrCreateRules(ownerUserId, brandId);
      await affiliateDistributionService.updateRules(ownerUserId, brandId, {
        is_enabled: true,
        auto_enqueue_capture: true,
        require_whatsapp_connected: true,
        require_training_complete: true,
        require_terms_accepted: true,
        require_pix_key: payoutMethod === "pix_direct",
        initial_message_template: generated.dist_initial_message,
        followup_message_template: generated.dist_followup_message,
        followup_enabled: true,
        followup_delays_hours_json: "[24,48,72]",
        max_daily_per_affiliate: Number(rules?.max_daily_per_affiliate || 20),
      } as any);
    } catch (e: any) {
      console.error("[affiliateProgramAiFill] distribution:", e?.message || e);
    }

    const config = await this.affiliates.getOrCreateProgramConfig(ownerUserId, brandId);
    const slug = String(brand.slug || "").trim();
    const origin =
      process.env.PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://app.leadcapture.online";

    return {
      program_id: programId,
      program_name: generated.program_name,
      activated: activate,
      share: {
        partners_marketplace_url: `${String(origin).replace(/\/$/, "")}/parceiros`,
        affiliate_app_path: slug ? `/central-afiliado/${encodeURIComponent(slug)}` : "/parceiros",
        subdomain: config.app_subdomain ? String(config.app_subdomain) : null,
      },
      summary: {
        learning_modules: generated.learning_modules.length,
        trainings: generated.trainings.length,
        materials: generated.materials.length,
        payment_days: paymentDays,
        commission_label: commissionLabel(commissionMode, commissionValue),
        payout_label: payoutLabel(payoutMethod, payoutFrequency, minAmount, paymentDays),
      },
      generated,
    };
  }

  async setActivation(
    ownerUserId: string,
    brandId: string,
    programId: string,
    activate: boolean,
  ) {
    await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
      is_enabled: activate,
      accept_new_affiliates: activate ? true : undefined,
    });
    await affiliateProgramsService.updateProgram(ownerUserId, brandId, programId, {
      status: activate ? "active" : "inactive",
      is_marketplace_visible: activate,
      accept_applications: activate ? true : undefined,
    });
    return { activated: activate };
  }
}

export const affiliateProgramAiFillService = new AffiliateProgramAiFillService();
