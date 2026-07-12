/**
 * profileBuilder — monta o FollowupProfile a partir do contexto do brand.
 *
 * Estratégia:
 *  1) Carrega dados diretos do banco (brand_units, ai_agent_profiles, products, customers, whatsapp_instances).
 *  2) Pede à IA (1 única chamada generateJson) que infira os campos narrativos
 *     (dores, ganhos, custos, casos, prova social) a partir do contexto.
 *  3) Merge tudo em um FollowupProfile pronto para alimentar buildSequence().
 */

import { query, queryOne } from "../../config/database";
import { aiRouter } from "../aiRouter";
import { GeminiService } from "../gemini";
import { BrandUnitsService } from "../brandUnits";
import { AIAgentProfileService } from "../aiAgentProfile";
import { ProductsService } from "../products";
import { logger } from "../../utils/logger";
import type { FollowupProfile } from "./templates";

const brandUnitsService = new BrandUnitsService();
const aiAgentProfileService = new AIAgentProfileService();
const productsService = new ProductsService();
const geminiService = new GeminiService();

interface NarrativeFields {
  product: {
    coreIngredient?: string;
    shortPitch: string;
    painLine: string;
    costFigure: string;
    mainBenefits: string[];
    targetPains: string[];
    costsOfInaction: string[];
    futureGains: string[];
  };
  target: {
    region: string;
    commonSegment: string;
  };
  socialProof: {
    headlineMetric: string;
    metrics: string[];
    miniCases: string[];
    stories: string[];
  };
  techEducation: string[];
  expertise: string[];
  freeContentOffers: string[];
  exitSurveyOptions: string[];
}

function splitLines(value?: string | null, max = 5): string[] {
  if (!value) return [];
  return String(value)
    .split(/\r?\n|;|•|·/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, max);
}

function safeJsonParse<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return null;
  }
}

async function resolveDefaultInstanceId(userId: string, brandId: string): Promise<string | null> {
  // Prefer a connected instance scoped to brand; fallback to any from the brand; finally any from the user.
  const scopedConnected = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND brand_id = ? AND status = 'connected'
     ORDER BY created_at ASC LIMIT 1`,
    [userId, brandId]
  ).catch(() => null);
  if (scopedConnected?.id) return scopedConnected.id;

  const scopedAny = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND brand_id = ?
     ORDER BY created_at ASC LIMIT 1`,
    [userId, brandId]
  ).catch(() => null);
  if (scopedAny?.id) return scopedAny.id;

  const userAny = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND status = 'connected'
     ORDER BY created_at ASC LIMIT 1`,
    [userId]
  ).catch(() => null);
  return userAny?.id || null;
}

async function resolveCustomerSnapshot(
  userId: string,
  brandId: string
): Promise<{ totalConverted: number; total: number; topSegments: string[]; topRegion: string | null }> {
  // Tries scoped by brand_id when column exists; falls back to user-only.
  const tries: Array<{ sql: string; params: any[] }> = [
    {
      sql: `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
            FROM customers WHERE user_id = ? AND brand_id = ?`,
      params: [userId, brandId],
    },
    {
      sql: `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
            FROM customers WHERE user_id = ?`,
      params: [userId],
    },
  ];

  let snapshot = { totalConverted: 0, total: 0 };
  for (const t of tries) {
    try {
      const row = await queryOne<{ total: number | string; converted: number | string }>(t.sql, t.params);
      if (row) {
        snapshot = {
          total: Number(row.total) || 0,
          totalConverted: Number(row.converted) || 0,
        };
        break;
      }
    } catch {
      // try next
    }
  }

  const segmentTries: Array<{ sql: string; params: any[] }> = [
    {
      sql: `SELECT category, COUNT(*) AS c FROM customers
            WHERE user_id = ? AND brand_id = ? AND category IS NOT NULL AND category <> ''
            GROUP BY category ORDER BY c DESC LIMIT 6`,
      params: [userId, brandId],
    },
    {
      sql: `SELECT category, COUNT(*) AS c FROM customers
            WHERE user_id = ? AND category IS NOT NULL AND category <> ''
            GROUP BY category ORDER BY c DESC LIMIT 6`,
      params: [userId],
    },
  ];

  let topSegments: string[] = [];
  for (const t of segmentTries) {
    try {
      const rows = await query<Array<{ category: string }>>(t.sql, t.params);
      if (rows && rows.length) {
        topSegments = rows.map((r) => r.category).filter(Boolean);
        break;
      }
    } catch {
      // try next
    }
  }

  const regionTries: Array<{ sql: string; params: any[] }> = [
    {
      sql: `SELECT city, COUNT(*) AS c FROM customers
            WHERE user_id = ? AND brand_id = ? AND city IS NOT NULL AND city <> ''
            GROUP BY city ORDER BY c DESC LIMIT 1`,
      params: [userId, brandId],
    },
    {
      sql: `SELECT city, COUNT(*) AS c FROM customers
            WHERE user_id = ? AND city IS NOT NULL AND city <> ''
            GROUP BY city ORDER BY c DESC LIMIT 1`,
      params: [userId],
    },
  ];

  let topRegion: string | null = null;
  for (const t of regionTries) {
    try {
      const row = await queryOne<{ city: string }>(t.sql, t.params);
      if (row?.city) {
        topRegion = row.city;
        break;
      }
    } catch {
      // try next
    }
  }

  return { ...snapshot, topSegments, topRegion };
}

function buildNarrativePrompt(input: {
  brandName: string;
  brandDescription: string;
  agentName: string;
  agentRole: string;
  tone: string;
  productName: string;
  productCategory: string;
  productDescription: string;
  topProducts: Array<{ name: string; description: string; category: string }>;
  segments: string[];
  region: string;
  clientCountLabel: string;
  trainingNotes: string;
}): string {
  return `Voce e um especialista em copywriting B2B / outbound. Vou te dar o contexto de uma empresa e voce vai produzir um JSON estruturado com campos narrativos que alimentarao uma regua de 8 follow-ups (FU0..FU7) de relacionamento via WhatsApp.

REGRAS:
- Use PORTUGUES brasileiro, tom ${input.tone || "consultivo, humano, de relacionamento"}.
- NAO invente numeros especificos (precos, percentuais "comprovados"), nomes de clientes ou cases fake.
- Quando precisar citar prova social, use formulacoes GENERICAS que possam ser verdadeiras ("muitos clientes", "estabelecimentos da regiao") ou metricas plausíveis derivadas do contexto.
- Curto, direto, sem chavoes corporativos.
- TODO output em JSON estritamente valido, no schema indicado.

CONTEXTO DA EMPRESA:
- Nome: ${input.brandName}
- Descricao: ${input.brandDescription}
- Agente comercial: ${input.agentName} (papel: ${input.agentRole})
- Tom: ${input.tone}
- Produto principal: ${input.productName}
- Categoria: ${input.productCategory}
- Descricao do produto: ${input.productDescription}
- Outros produtos do catalogo: ${input.topProducts.map((p) => `${p.name} (${p.category})`).join("; ") || "nenhum"}
- Segmentos atendidos (de customers): ${input.segments.join(", ") || "nao informado"}
- Regiao: ${input.region || "nao informada"}
- Volume de clientes: ${input.clientCountLabel}
- Notas de treinamento do agente: ${input.trainingNotes || "nenhuma"}

PRODUZA O SEGUINTE JSON (sem comentarios, sem markdown fences):

{
  "product": {
    "coreIngredient": "<insumo/elemento principal do produto, 1-3 palavras>",
    "shortPitch": "<pitch de 1 linha, ate 140 chars>",
    "painLine": "<frase casual de mencao de dor, ate 120 chars>",
    "costFigure": "<frase curta sobre o custo de NAO usar o produto, ate 120 chars>",
    "mainBenefits": ["<beneficio 1 pratico e direto>", "<beneficio 2>", "<beneficio 3>", "<beneficio 4>"],
    "targetPains": ["<dor 1 concreta do cliente>", "<dor 2>", "<dor 3>", "<dor 4>"],
    "costsOfInaction": ["<custo 1 de nao agir>", "<custo 2>", "<custo 3>"],
    "futureGains": ["<ganho futuro 1>", "<ganho 2>", "<ganho 3>"]
  },
  "target": {
    "region": "<regiao de atendimento>",
    "commonSegment": "<descritor generico do segmento, ex: 'cozinha comercial'>"
  },
  "socialProof": {
    "headlineMetric": "<metrica-manchete plausivel, ate 80 chars>",
    "metrics": ["<metrica plausivel 1>", "<metrica 2>", "<metrica 3>"],
    "miniCases": ["<mini-case generico 1, sem nome real>", "<mini-case 2>", "<mini-case 3>"],
    "stories": ["<historia curta de transformacao, generica>", "<historia 2>"]
  },
  "techEducation": ["<info tecnica util 1>", "<info 2>", "<info 3>"],
  "expertise": ["<linha de expertise do agente 1>", "<linha 2>"],
  "freeContentOffers": ["<material gratuito util 1>", "<material 2>", "<material 3>", "<material 4>"],
  "exitSurveyOptions": ["<razao 1 pra nao ter interesse>", "<razao 2>", "<razao 3>", "<razao 4>"]
}`;
}

export interface BrandContextSnapshot {
  brand: { id: string; name: string; description: string; tone: string };
  agent: { name: string; role: string; tone: string; trainingNotes: string };
  product: { name: string; category: string; description: string; topProducts: Array<{ name: string; description: string; category: string }> };
  customers: { total: number; converted: number; segments: string[]; topRegion: string | null };
  instanceId: string | null;
}

export async function loadBrandContext(userId: string, brandId: string): Promise<BrandContextSnapshot> {
  const brand = await brandUnitsService.getById(userId, brandId);
  if (!brand) {
    throw new Error("Brand nao encontrada para esse user.");
  }

  const agentProfile = await aiAgentProfileService.getByUserId(userId, brandId);
  const products = await productsService.getProducts(userId, brandId).catch(() => []);
  const customers = await resolveCustomerSnapshot(userId, brandId);
  const instanceId = await resolveDefaultInstanceId(userId, brandId);

  const voice = safeJsonParse<Record<string, any>>(brand.voice_json) || {};
  const brandTone = String(voice.tone || agentProfile.tone || "consultivo").trim();
  const brandDescription = String(brand.slogan || voice.pitch || voice.description || `${brand.name} — atendimento via WhatsApp`).trim();

  const topProduct = products[0];
  const productName = topProduct?.name || `produtos da ${brand.name}`;
  const productCategory = topProduct?.category || "negocio";
  const productDescription = (topProduct?.description || topProduct?.subtitle || brandDescription).slice(0, 400);
  const topProducts = products.slice(0, 5).map((p) => ({
    name: p.name,
    description: String(p.description || "").slice(0, 150),
    category: p.category || "geral",
  }));

  return {
    brand: { id: brand.id, name: brand.name, description: brandDescription, tone: brandTone },
    agent: {
      name: agentProfile.agent_name || "Atendente",
      role: deriveAgentRole(agentProfile.tone),
      tone: agentProfile.tone || brandTone,
      trainingNotes: agentProfile.training_notes || "",
    },
    product: { name: productName, category: productCategory, description: productDescription, topProducts },
    customers: {
      total: customers.total,
      converted: customers.totalConverted,
      segments: customers.topSegments,
      topRegion: customers.topRegion,
    },
    instanceId,
  };
}

function deriveAgentRole(tone: string): string {
  switch ((tone || "").toLowerCase()) {
    case "formal":
      return "consultor(a) comercial";
    case "professional":
      return "representante comercial";
    case "casual":
      return "atendente";
    case "friendly":
    default:
      return "representante de relacionamento";
  }
}

function clientCountLabel(c: { total: number; converted: number }): string {
  if (c.converted >= 10) return `${c.converted}+ clientes convertidos`;
  if (c.total >= 50) return `${c.total}+ leads na base`;
  if (c.total > 0) return `${c.total} leads na base`;
  return "base em construcao";
}

/**
 * Cascata de geração da narrativa:
 *   1) aiRouter.generateJson — respeita o provider preferido do user (OpenAI/Grok/Gemini)
 *   2) Gemini direto — se o preferido falhar por falta de chave, tenta Gemini direto
 *   3) Heurístico — se nada funcionar, monta narrativa genérica a partir do contexto do banco
 *      (para que o user NUNCA fique sem régua, mesmo sem nenhuma chave de IA configurada).
 */
async function generateNarrativeWithFallback(
  prompt: string,
  userId: string,
  brandId: string,
  ctx: BrandContextSnapshot
): Promise<NarrativeFields> {
  // Tentativa 1: provider preferido (via AIRouter).
  try {
    return await aiRouter.generateJson<NarrativeFields>(prompt, { userId, brandId }, {
      temperature: 0.7,
      functionKey: "text.followup.narrative",
    });
  } catch (err: any) {
    logger.warn(`[followupRuler] AI preferido falhou: ${err?.message || err}. Tentando Gemini direto.`);
  }

  // Tentativa 2: Gemini direto (caso o user tenha cadastrado a chave do Gemini mesmo que a preferência seja outra).
  try {
    return await geminiService.generateJson<NarrativeFields>(prompt, { userId, brandId, temperature: 0.7 });
  } catch (err: any) {
    logger.warn(`[followupRuler] Gemini direto falhou: ${err?.message || err}. Caindo no heuristico.`);
  }

  // Tentativa 3: heurístico — sem IA, monta narrativa básica a partir do contexto.
  logger.error(
    `[followupRuler] Nenhuma IA disponivel para userId=${userId} brandId=${brandId} — usando narrativa heuristica generica. Configure uma chave em Provedores IA para regua sob medida.`
  );
  return buildHeuristicNarrative(ctx);
}

function buildHeuristicNarrative(ctx: BrandContextSnapshot): NarrativeFields {
  const segment = ctx.customers.segments[0] || "estabelecimentos do segmento";
  const productName = ctx.product.name;
  return {
    product: {
      coreIngredient: productName,
      shortPitch: `${ctx.brand.name} — ${ctx.product.description || productName}`.slice(0, 140),
      painLine: `Sei que organizar isso no dia a dia ${segment} consome tempo`,
      costFigure: "horas da equipe gastas em tarefa que poderia ser otimizada",
      mainBenefits: [
        `solucao pratica em ${ctx.product.category || "rotina"}`,
        "economia de tempo na operacao",
        "padronizacao de processo",
        "menos retrabalho",
      ],
      targetPains: [
        "tempo da equipe gasto em tarefas operacionais",
        "falta de padronizacao",
        "dificuldade de previsibilidade",
        "retrabalho que poderia ser evitado",
      ],
      costsOfInaction: [
        "horas/mes da folha em tarefas que poderiam ser automatizadas",
        "perda de oportunidades por demora operacional",
        "estresse da equipe acumulando atraso",
      ],
      futureGains: [
        "equipe focada no que importa",
        "processo rodando previsivel",
        "mais tempo livre pra crescer o negocio",
      ],
    },
    target: {
      region: ctx.customers.topRegion || "sua regiao",
      commonSegment: segment,
    },
    socialProof: {
      headlineMetric: ctx.customers.converted > 0 ? `${ctx.customers.converted}+ clientes ativos` : "operacoes parceiras pela regiao",
      metrics: [
        ctx.customers.total > 0 ? `${ctx.customers.total}+ leads na base` : "operacoes parceiras crescendo",
        "atendimento dedicado ao seu segmento",
        "experiencia direta com sua realidade",
      ],
      miniCases: [
        `${segment} parceiro reduziu retrabalho e ganhou tempo da equipe`,
        "operacao da regiao trocou processo e padronizou a rotina",
        "cliente fixo virou recomendacao boca a boca",
      ],
      stories: [
        `Conheci recentemente um(a) ${segment} que tinha exatamente a mesma duvida. Comecamos com um teste curto, e em algumas semanas a equipe ja tinha mudado a rotina. Hoje e parceiro fixo.`,
      ],
    },
    techEducation: [
      `Detalhe que faz diferenca em ${ctx.product.category || "operacoes assim"}: cada hora ganha na rotina vira capacidade extra de atender clientes`,
      `Padronizar essa etapa reduz erro e libera a equipe pra o que so gente faz bem`,
    ],
    expertise: [
      `Acompanho de perto operacoes de ${segment} ha algum tempo, entao entendo bem a rotina`,
    ],
    freeContentOffers: [
      "Checklist rapido pra mapear gargalos da operacao",
      "Planilha simples de acompanhamento mensal",
      "Guia de boas praticas pra equipe",
      "Lista de erros comuns que travam a rotina",
    ],
    exitSurveyOptions: [
      "nao e prioridade agora",
      "ja tem um fornecedor/processo",
      "nao e o perfil do meu negocio",
      "quero pensar mais antes de decidir",
    ],
  };
}

export async function buildProfileForBrand(userId: string, brandId: string): Promise<FollowupProfile> {
  const ctx = await loadBrandContext(userId, brandId);

  const prompt = buildNarrativePrompt({
    brandName: ctx.brand.name,
    brandDescription: ctx.brand.description,
    agentName: ctx.agent.name,
    agentRole: ctx.agent.role,
    tone: ctx.brand.tone || ctx.agent.tone,
    productName: ctx.product.name,
    productCategory: ctx.product.category,
    productDescription: ctx.product.description,
    topProducts: ctx.product.topProducts,
    segments: ctx.customers.segments,
    region: ctx.customers.topRegion || "",
    clientCountLabel: clientCountLabel(ctx.customers),
    trainingNotes: ctx.agent.trainingNotes,
  });

  const narrative = await generateNarrativeWithFallback(prompt, userId, brandId, ctx);

  // Merge: campos do banco predominam quando existem; IA preenche o restante.
  const expertiseFromNotes = splitLines(ctx.agent.trainingNotes, 3);
  const expertise = expertiseFromNotes.length ? expertiseFromNotes : (narrative.expertise || []);

  const segments = ctx.customers.segments.length ? ctx.customers.segments.slice(0, 6) : [narrative.target?.commonSegment || "estabelecimentos do segmento"];
  const region = ctx.customers.topRegion || narrative.target?.region || "regiao de atendimento";

  const skuCount = ctx.product.topProducts.length > 0 ? `${ctx.product.topProducts.length} SKUs` : undefined;

  const profile: FollowupProfile = {
    brandId: ctx.brand.id,
    userId,
    instanceId: ctx.instanceId,
    agent: { name: ctx.agent.name, role: ctx.agent.role },
    company: { name: ctx.brand.name, description: ctx.brand.description },
    product: {
      category: ctx.product.category,
      name: ctx.product.name,
      coreIngredient: narrative.product?.coreIngredient,
      shortPitch: narrative.product?.shortPitch,
      painLine: narrative.product?.painLine,
      costFigure: narrative.product?.costFigure,
      mainBenefits: narrative.product?.mainBenefits || [],
      targetPains: narrative.product?.targetPains || [],
      costsOfInaction: narrative.product?.costsOfInaction || [],
      futureGains: narrative.product?.futureGains || [],
    },
    target: {
      segments,
      region,
      commonSegment: narrative.target?.commonSegment,
    },
    tone: ctx.brand.tone || ctx.agent.tone,
    requireWhatsApp: false,
    initialStatuses: ["new"],
    socialProof: {
      clientCount: clientCountLabel(ctx.customers),
      clientType: segments[0] || "clientes",
      skuCount,
      headlineMetric: narrative.socialProof?.headlineMetric,
      metrics: narrative.socialProof?.metrics || [],
      miniCases: narrative.socialProof?.miniCases || [],
      stories: narrative.socialProof?.stories || [],
    },
    techEducation: narrative.techEducation || [],
    expertise,
    freeContentOffers: narrative.freeContentOffers || [],
    exitSurveyOptions: narrative.exitSurveyOptions || [
      "nao usa muito esse produto/servico no negocio",
      "ja tem um fornecedor",
      "nao e prioridade agora",
      "preco fora do orcamento atual",
    ],
  };

  return profile;
}
