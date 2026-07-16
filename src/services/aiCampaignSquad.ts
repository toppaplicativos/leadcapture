/**
 * ═══════════════════════════════════════════════════════════════════
 * AI Campaign Squad — wizard inteligente que monta campanha do zero
 * ═══════════════════════════════════════════════════════════════════
 *
 * Recebe um PROMPT em linguagem natural do usuario ("quero vender X pra Y
 * em Z") e executa 7 SKILLS sequenciais que produzem uma CAMPANHA COMPLETA
 * em status='draft' pra revisao.
 *
 * Skills (executadas em ordem):
 *   1. interpretBrief        — parsing semantic do prompt
 *   2. defineAudience        — perfil ideal do comprador
 *   3. discoverNewProspects  — chama leadIdeas.generate (sem HTTP)
 *   4. selectExistingLeads   — query customers do brand com filtros
 *   5. composeMessage        — gera messageTemplate + aiPrompt
 *   6. calibrateSpeed        — heuristica determinista anti-ban WhatsApp
 *   7. assembleCampaign      — chama campaignEngine.createCampaign(...)
 *
 * Cada skill emite eventos SSE via callback `emit()` pra frontend
 * mostrar o pipeline visual ao vivo.
 *
 * Mutex por brand: nao executa 2 squads concorrentes no mesmo brand.
 */

import { AIRouter } from "./aiRouter";
import { generateLeadIdeas } from "../routes/leadIdeas";
import { campaignEngine } from "../index";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

const aiRouter = new AIRouter();

/* ───────────────────────── Tipos ───────────────────────── */

export type SkillStatus = "pending" | "running" | "done" | "error";
export type SkillName =
  | "interpretBrief"
  | "defineAudience"
  | "discoverNewProspects"
  | "selectExistingLeads"
  | "composeMessage"
  | "calibrateSpeed"
  | "assembleCampaign";

export interface SquadEvent {
  step: number;            // 1..7 ou "final"
  name: SkillName | "final" | "error";
  status: SkillStatus | "info";
  output?: any;
  message?: string;
  durationMs?: number;
}

export type EmitFn = (event: SquadEvent) => void;

export interface SquadContext {
  prompt: string;
  userId: string;
  brandId: string;
  options: { use_existing?: boolean; use_prospect_ai?: boolean; auto_start?: boolean };
}

interface SkillBrief {
  intent: string;                       // 'sell' | 'engage' | 'nurture' | 'reactivate'
  offering: string;                     // o que o brand esta oferecendo
  audience_hint: string;                // dica de publico
  geo_hint: string;                     // dica geografica
  urgency: 'baixa' | 'media' | 'alta';
  tone: string;                         // tom desejado
  channel_hint?: string;
}

interface SkillAudience {
  segments: string[];                   // segmentos comerciais (ex: ['pizzaria', 'restaurante'])
  must_have: string[];                  // criterios obrigatorios
  nice_to_have: string[];               // criterios desejaveis
  avoid: string[];                      // perfis a evitar
  cities: string[];                     // cidades alvo
  description: string;                  // 1 frase humanizada
}

interface DiscoveredProspect {
  segments_to_search: string[];         // resumo das suggestions
  cities_recommended: Array<{ name: string; state: string; radius_km: number }>;
  market_reading: string;
  target_customers: string;
  full_payload: any;                    // copia do output completo do leadIdeas
}

interface SelectedLeads {
  count: number;
  sample: Array<{ id: string; name: string; phone: string; city?: string; category?: string }>;
  filter_applied: any;
}

interface ComposedMessage {
  messageTemplate: string;              // texto com {{name}}, {{category}}, etc
  aiPrompt?: string;                    // prompt pra IA personalizar por lead
  useAI: boolean;
  variables: string[];                  // ['name', 'category', 'city']
  preview: string;                      // exemplo renderizado com sample lead
}

interface CalibratedSpeed {
  maxPerMinute: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  dailyLimit: number;
  autoPauseOnBlockRate: number;
  campaignMode: "aggressive" | "educational" | "relationship";
  useInstanceRotation: boolean;
  rotationMode: "balanced" | "round_robin" | "weighted";
  reasoning: string;
}

interface FinalCampaign {
  campaign_id: string;
  name: string;
  status: string;
  target_count: number;
}

/* ─────────────── Mutex global por brand ─────────────── */

const inFlightBrands = new Set<string>();

export function isBrandSquadRunning(brandId: string): boolean {
  return inFlightBrands.has(brandId);
}

/* ─────────────── Helpers ─────────────── */

function shortJson<T>(value: T, max = 320): string {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(value);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout após ${ms}ms`)), ms),
    ),
  ]);
}

async function pickActiveInstance(userId: string, brandId: string): Promise<string | null> {
  /* Prefere instance do brand ativo + status='connected'. Fallback: qualquer connected do user. */
  const r = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND status = 'connected'
       AND (brand_id = ? OR brand_id IS NULL OR brand_id = '')
     ORDER BY (brand_id = ?) DESC, last_connected_at DESC NULLS LAST
     LIMIT 1`,
    [userId, brandId, brandId],
  ).catch(() => null);
  if (r?.id) return r.id;
  /* fallback amplo */
  const fb = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances WHERE created_by = ? AND status = 'connected' LIMIT 1`,
    [userId],
  ).catch(() => null);
  return fb?.id || null;
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 1 — interpretBrief
   Parsing semantico do prompt do usuario.
   ═══════════════════════════════════════════════════════════════════ */
async function skillInterpretBrief(ctx: SquadContext, brandContext: string): Promise<SkillBrief> {
  const prompt = `Voce eh um analista comercial. Leia o pedido do usuario e extraia
intent, oferta, dicas de publico, geografia, urgencia e tom desejado.

CONTEXTO DO BRAND (treinamento):
${brandContext || "(brand sem treinamento — use o pedido como guia)"}

PEDIDO DO USUARIO:
"""
${ctx.prompt.replace(/"""/g, '"')}
"""

Retorne JSON EXATO:
{
  "intent": "sell|engage|nurture|reactivate (qual eh o objetivo principal)",
  "offering": "1 frase curta: o que o brand vai oferecer/vender nessa campanha",
  "audience_hint": "1 frase: caracteristicas do publico que o user esta tentando atingir (extraia do pedido)",
  "geo_hint": "cidade/regiao/estado mencionado (se nao mencionou, retorne '')",
  "urgency": "baixa|media|alta",
  "tone": "1-3 palavras: tom desejado (consultivo, agressivo, amigavel, etc)",
  "channel_hint": "whatsapp (default) ou outro se mencionado"
}

REGRAS:
- Seja literal ao pedido. NAO invente intencao que o user nao expressou.
- Se o pedido eh vago, marque urgency='media' e tone='profissional'.
- offering deve ser concreto (nao "vender bem" — sim "vender consorcio de carros pra autonomos").`;

  const result = await withTimeout(
    aiRouter.generateJson<SkillBrief>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.5, functionKey: "text.campaign.squad" }),
    15_000, "interpretBrief",
  );

  return {
    intent: String(result?.intent || "engage").trim(),
    offering: String(result?.offering || ctx.prompt.slice(0, 120)).trim(),
    audience_hint: String(result?.audience_hint || "").trim(),
    geo_hint: String(result?.geo_hint || "").trim(),
    urgency: (['baixa', 'media', 'alta'].includes(String(result?.urgency).toLowerCase())
      ? String(result.urgency).toLowerCase()
      : 'media') as SkillBrief['urgency'],
    tone: String(result?.tone || "profissional").trim().slice(0, 60),
    channel_hint: String(result?.channel_hint || "whatsapp").trim().slice(0, 30),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 2 — defineAudience
   Decompoe brief em audiencia operacional (segmentos + filtros).
   ═══════════════════════════════════════════════════════════════════ */
async function skillDefineAudience(brief: SkillBrief, brandContext: string, ctx: SquadContext): Promise<SkillAudience> {
  const prompt = `Voce eh um SDR senior. Dado o brief abaixo, defina a AUDIENCIA OPERACIONAL
para essa campanha (segmentos, criterios e cidades).

BRIEF:
- Intent: ${brief.intent}
- Oferta: ${brief.offering}
- Dica de publico: ${brief.audience_hint}
- Dica geografica: ${brief.geo_hint || '(nao especificado)'}
- Tom: ${brief.tone}

CONTEXTO DO BRAND:
${brandContext || "(sem treinamento)"}

Retorne JSON EXATO:
{
  "segments": ["array de 2-5 segmentos comerciais que esse brand quer atingir, em termos de Google Maps (ex: pizzaria, clinica odontologica, advogado)"],
  "must_have": ["criterios obrigatorios do lead (ex: 'tem telefone', 'esta em fortaleza', 'categoria=restaurante')"],
  "nice_to_have": ["criterios desejaveis mas opcionais"],
  "avoid": ["perfis a EVITAR (ex: 'grandes redes', 'lojas de departamento')"],
  "cities": ["cidades alvo - extrair do geo_hint ou deixar [] se geral"],
  "description": "1 frase humanizada descrevendo o publico ideal"
}

REGRAS:
- segments sao termos PESQUISAVEIS no Google Maps (curtos, especificos).
- Se geo_hint vazio, deixe cities=[] (campanha sem geo filter).
- must_have sao filtros HARD do CRM (status, tags, categoria, cidade).
- avoid eh feedback pro user, nao filtro hard.`;

  const result = await withTimeout(
    aiRouter.generateJson<SkillAudience>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6, functionKey: "text.campaign.squad" }),
    15_000, "defineAudience",
  );

  return {
    segments: Array.isArray(result?.segments) ? result.segments.slice(0, 6).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    must_have: Array.isArray(result?.must_have) ? result.must_have.slice(0, 6).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    nice_to_have: Array.isArray(result?.nice_to_have) ? result.nice_to_have.slice(0, 6).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    avoid: Array.isArray(result?.avoid) ? result.avoid.slice(0, 5).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    cities: Array.isArray(result?.cities) ? result.cities.slice(0, 8).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    description: String(result?.description || "").trim(),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 3 — discoverNewProspects (versao enxuta, especifica pro squad)
   ═══════════════════════════════════════════════════════════════════
   Antes usava generateLeadIdeas() (funcao da pagina IdeaGenerator que
   produz schema rico de 4-7 suggestions × 10 campos cada). Era overkill
   pro squad: timeout frequente, JSON inflado, alta chance de malformar.

   Agora usamos prompt CURTO E ESPECIFICO direto via aiRouter — pedindo SO
   o que o squad precisa: segments_to_search (pra dar opcoes ao user) +
   cities_recommended (sugestoes geo). Bem menos tokens, bem mais rapido. */
async function skillDiscoverNewProspects(brief: SkillBrief, audience: SkillAudience, ctx: SquadContext): Promise<DiscoveredProspect> {
  if (ctx.options.use_prospect_ai === false) {
    return {
      segments_to_search: [],
      cities_recommended: [],
      market_reading: "Descoberta de novos prospects desativada nesta execucao.",
      target_customers: "",
      full_payload: null,
    };
  }

  /* Prompt enxuto - 1/10 do tamanho do generateLeadIdeas, retorno simples */
  const prompt = `Voce eh SDR. O brand quer fazer outreach com a oferta abaixo. Sugira segmentos
COMERCIAIS pesquisaveis no Google Maps + cidades onde rastrear.

OFERTA: ${brief.offering}
PUBLICO JA DEFINIDO: ${audience.description || audience.segments.join(", ") || "(geral)"}
GEO HINT: ${brief.geo_hint || "(geral)"}

Retorne JSON EXATO (curto):
{
  "segments_to_search": ["3-5 termos pesquisaveis no Google Maps, curtos, especificos"],
  "cities_recommended": [{"name":"Cidade","state":"UF","radius_km":3}],
  "market_reading": "1 frase: tamanho/competicao desse mercado",
  "target_customers": "1 frase: quem realmente compra"
}

REGRAS:
- Maximo 5 segments, maximo 4 cidades.
- Se nao houver geo hint, deixe cities_recommended=[].
- segments devem servir COMO BUSCA literal no Google Maps.
- NUNCA repita exatamente os segments que ja estao em PUBLICO JA DEFINIDO — sugira complementares.`;

  let result: any;
  try {
    result = await withTimeout(
      aiRouter.generateJson<any>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.7, functionKey: "text.campaign.squad" }),
      20_000, "discoverNewProspects",
    );
  } catch (err: any) {
    /* Re-throw com mensagem clara - o orchestrator soft-fail decide se continua */
    const msg = String(err?.message || err);
    throw new Error(`Prospect-IA: ${msg}`);
  }

  const segments = Array.isArray(result?.segments_to_search)
    ? result.segments_to_search.slice(0, 5).map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];
  const cities = Array.isArray(result?.cities_recommended)
    ? result.cities_recommended.slice(0, 4).map((c: any) => ({
        name: String(c?.name || "").trim(),
        state: String(c?.state || "").toUpperCase().slice(0, 2),
        radius_km: Math.max(0.5, Math.min(30, Number(c?.radius_km) || 3)),
      })).filter((c: any) => c.name)
    : [];

  return {
    segments_to_search: segments,
    cities_recommended: cities,
    market_reading: String(result?.market_reading || "").trim(),
    target_customers: String(result?.target_customers || "").trim(),
    full_payload: result,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 4 — selectExistingLeads (com cascata de fallback)
   ═══════════════════════════════════════════════════════════════════
   Tenta filtros do MAIS especifico ao MENOS:
     a) brand + phone + city + segment match  (ideal)
     b) brand + phone + city                  (relaxa segment)
     c) brand + phone + segment               (relaxa city)
     d) brand + phone                         (so leads com whatsapp do brand)
   A primeira tentativa que retornar >0 leads vence. UI mostra QUAL nivel
   matchou pra user entender a qualidade da segmentacao. */
async function skillSelectExistingLeads(audience: SkillAudience, ctx: SquadContext): Promise<SelectedLeads> {
  if (ctx.options.use_existing === false) {
    return { count: 0, sample: [], filter_applied: { skipped: true } };
  }

  type FilterTier = { label: string; cities: boolean; segments: boolean };
  const tiers: FilterTier[] = [
    { label: "city+segment", cities: true,  segments: true  },
    { label: "city-only",    cities: true,  segments: false },
    { label: "segment-only", cities: false, segments: true  },
    { label: "brand-all",    cities: false, segments: false },
  ];

  for (const tier of tiers) {
    const conds: string[] = ["brand_id = ?", "phone IS NOT NULL AND phone <> ''"];
    const params: any[] = [ctx.brandId];

    if (tier.cities && audience.cities.length > 0) {
      const ph = audience.cities.map(() => "?").join(",");
      conds.push(`LOWER(COALESCE(city, '')) IN (${ph})`);
      params.push(...audience.cities.map((c) => c.toLowerCase()));
    } else if (tier.cities && audience.cities.length === 0) {
      /* Sem cities pra filtrar - pula esse tier (ja eh igual ao seguinte) */
      continue;
    }

    if (tier.segments && audience.segments.length > 0) {
      const segConds: string[] = [];
      for (const seg of audience.segments) {
        segConds.push(`LOWER(COALESCE(category, '')) LIKE LOWER(?)`);
        params.push(`%${seg}%`);
        segConds.push(`LOWER(COALESCE(tags::text, '')) LIKE LOWER(?)`);
        params.push(`%${seg}%`);
      }
      conds.push(`(${segConds.join(" OR ")})`);
    } else if (tier.segments && audience.segments.length === 0) {
      continue;
    }

    /* Tenta tabela 'customers' (padrao deste app). Se falhar, tenta 'leads' como fallback. */
    let rows: any[] = [];
    for (const table of ["customers", "leads"]) {
      try {
        const sql = `SELECT id, name, phone, city, category
                     FROM ${table}
                     WHERE ${conds.join(" AND ")}
                     ORDER BY created_at DESC NULLS LAST
                     LIMIT 1000`;
        const r = (await query<any[]>(sql, params)) as any;
        rows = Array.isArray(r) ? r : [];
        if (rows.length > 0) break;
      } catch (e: any) {
        logger.warn(`squad selectExistingLeads (${table}, ${tier.label}): ${e?.message}`);
      }
    }

    if (rows.length > 0) {
      return {
        count: rows.length,
        sample: rows.slice(0, 8).map((r: any) => ({
          id: String(r.id),
          name: String(r.name || ""),
          phone: String(r.phone || ""),
          city: r.city ? String(r.city) : undefined,
          category: r.category ? String(r.category) : undefined,
        })),
        filter_applied: {
          tier: tier.label,
          cities: tier.cities ? audience.cities : [],
          segments: tier.segments ? audience.segments : [],
          relaxed: tier.label !== "city+segment",
        },
      };
    }
  }

  /* Nada encontrado nem com tier 'brand-all' — brand realmente vazio ou sem leads com phone */
  return {
    count: 0,
    sample: [],
    filter_applied: {
      tier: "none-matched",
      cities: audience.cities,
      segments: audience.segments,
      reason: "Nenhum lead encontrado no brand mesmo com filtros relaxados. Verifique se ha customers com phone preenchido.",
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 5 — composeMessage
   Gera messageTemplate (texto base) + aiPrompt (pra personalizacao).
   ═══════════════════════════════════════════════════════════════════ */
async function skillComposeMessage(
  brief: SkillBrief,
  audience: SkillAudience,
  sample: SelectedLeads,
  brandContext: string,
  ctx: SquadContext,
): Promise<ComposedMessage> {
  const sampleLead = sample.sample[0];
  const sampleBlock = sampleLead
    ? `Exemplo de lead pra calibrar: nome="${sampleLead.name}", categoria="${sampleLead.category || 'desconhecida'}", cidade="${sampleLead.city || 'desconhecida'}"`
    : "(sem leads selecionados — campanha sera generica)";

  const prompt = `Voce eh copywriter de outreach WhatsApp. Crie a mensagem-base da campanha.

BRIEF:
- Oferta: ${brief.offering}
- Intent: ${brief.intent}
- Tom: ${brief.tone}
- Urgencia: ${brief.urgency}

PUBLICO:
${audience.description}
Segmentos: ${audience.segments.join(", ") || "(geral)"}
Cidades: ${audience.cities.join(", ") || "(qualquer)"}

CONTEXTO DO BRAND:
${brandContext || "(sem treinamento)"}

${sampleBlock}

Retorne JSON EXATO:
{
  "messageTemplate": "TEXTO da mensagem-base — USE {{name}} pra nome do lead e {{category}} pra categoria se relevante. NAO use emojis pesados. NAO comece com 'Ola [Nome]' generico. Maximo 350 caracteres. Termine com pergunta curta que convide resposta.",
  "useAI": true,
  "aiPrompt": "instrucao curta (max 200 chars) pra IA personalizar essa mensagem por lead — ex: 'Adapte mencionando algo especifico da categoria do lead'",
  "variables": ["array das variaveis usadas no template, ex: ['name','category']"],
  "preview": "renderize messageTemplate com os dados do lead exemplo acima — substitua {{name}}, {{category}} pelos valores reais"
}

REGRAS CRITICAS:
- Mensagem HUMANA, sem cara de spam. Sem 'PROMOCAO IMPERDIVEL'.
- Comece direto com algo especifico do contexto/categoria do lead.
- useAI=true se a personalizacao por lead agrega valor.
- Se messageTemplate ja eh universal demais (sem variaveis), useAI pode ser false.`;

  const result = await withTimeout(
    aiRouter.generateJson<ComposedMessage>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.7, functionKey: "text.campaign.squad" }),
    15_000, "composeMessage",
  );

  return {
    messageTemplate: String(result?.messageTemplate || "").trim().slice(0, 600),
    useAI: result?.useAI !== false,
    aiPrompt: result?.aiPrompt ? String(result.aiPrompt).trim().slice(0, 400) : undefined,
    variables: Array.isArray(result?.variables) ? result.variables.slice(0, 8).map((v: any) => String(v || "").trim()).filter(Boolean) : [],
    preview: String(result?.preview || result?.messageTemplate || "").trim().slice(0, 600),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 6 — calibrateSpeed
   Heuristica determinista anti-ban baseada no volume + urgencia.
   ═══════════════════════════════════════════════════════════════════ */
function skillCalibrateSpeed(count: number, urgency: SkillBrief['urgency']): CalibratedSpeed {
  let minInterval = 90, maxInterval = 180, dailyLimit = 100, rotation: CalibratedSpeed['rotationMode'] = 'balanced', useRotation = true;
  let mode: CalibratedSpeed['campaignMode'] = 'educational';

  /* Volume escala o intervalo - menos leads = mais agressivo, mais leads = mais conservador */
  if (count <= 30) {
    minInterval = 45; maxInterval = 90; dailyLimit = 60; useRotation = false;
  } else if (count <= 100) {
    minInterval = 90; maxInterval = 180; dailyLimit = 80; useRotation = true; rotation = 'balanced';
  } else if (count <= 500) {
    minInterval = 180; maxInterval = 360; dailyLimit = 100; useRotation = true; rotation = 'balanced';
  } else {
    minInterval = 300; maxInterval = 600; dailyLimit = 120; useRotation = true; rotation = 'round_robin';
  }

  /* Urgencia: alta só acelera levemente (ainda conservador); nunca "aggressive". */
  if (urgency === 'alta') {
    minInterval = Math.max(45, Math.floor(minInterval * 0.9));
    maxInterval = Math.max(90, Math.floor(maxInterval * 0.9));
    dailyLimit = Math.min(100, Math.floor(dailyLimit * 1.1));
    mode = 'educational';
  } else if (urgency === 'baixa') {
    minInterval = Math.floor(minInterval * 1.3);
    maxInterval = Math.floor(maxInterval * 1.3);
    dailyLimit = Math.floor(dailyLimit * 0.8);
    mode = 'relationship';
  }

  return {
    maxPerMinute: Math.max(1, Math.floor(60 / minInterval)),
    minIntervalSeconds: minInterval,
    maxIntervalSeconds: maxInterval,
    dailyLimit,
    autoPauseOnBlockRate: 5, // pausa automatica se 5% de bloqueios
    campaignMode: mode,
    useInstanceRotation: useRotation,
    rotationMode: rotation,
    reasoning: `${count} leads + urgencia=${urgency} → intervalo ${minInterval}-${maxInterval}s, cap diario ${dailyLimit}${useRotation ? `, rotacao ${rotation}` : ', sem rotacao'}`,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   SKILL 7 — assembleCampaign
   Chama campaignEngine.createCampaign com initialStatus='draft'.
   ═══════════════════════════════════════════════════════════════════ */
async function skillAssembleCampaign(
  brief: SkillBrief,
  audience: SkillAudience,
  message: ComposedMessage,
  speed: CalibratedSpeed,
  instanceId: string,
  ctx: SquadContext,
): Promise<FinalCampaign> {
  /* Monta nome legivel */
  const name = (() => {
    const offer = brief.offering.slice(0, 60);
    if (audience.cities.length > 0) {
      return `${offer} — ${audience.cities[0]}${audience.cities.length > 1 ? '+' + (audience.cities.length - 1) : ''}`;
    }
    return offer;
  })().slice(0, 140);

  /* Filtros pra o engine — espelha o que o squad usou ao consultar leads.
     Engine vai aplicar esse mesmo filter pra montar campaign_leads. */
  const filter: any = {
    statuses: ['new', 'contacted'], /* default razoavel pra outreach */
    hasWhatsapp: true,
  };
  if (audience.cities.length > 0) filter.cities = audience.cities;
  if (audience.segments.length > 0) filter.segments = audience.segments;

  const campaign = await campaignEngine.createCampaign(
    ctx.userId,
    {
      name,
      instanceId,
      messageTemplate: message.messageTemplate || null,
      aiPrompt: message.aiPrompt || null,
      useAI: message.useAI,
      filter,
      speedControl: {
        maxPerMinute: speed.maxPerMinute,
        minIntervalSeconds: speed.minIntervalSeconds,
        maxIntervalSeconds: speed.maxIntervalSeconds,
        dailyLimit: speed.dailyLimit,
        autoPauseOnBlockRate: speed.autoPauseOnBlockRate,
      },
      initialStatus: ctx.options.auto_start ? 'active' : 'draft',
      campaignMode: speed.campaignMode,
      useInstanceRotation: speed.useInstanceRotation,
      rotationMode: speed.rotationMode,
      settings: {
        ai_squad_run: {
          prompt: ctx.prompt.slice(0, 1000),
          generated_at: new Date().toISOString(),
          version: 1,
          brief_summary: brief.offering,
        },
      },
    } as any,
    ctx.brandId,
  );

  return {
    campaign_id: String(campaign.id),
    name: String(campaign.name),
    status: String(campaign.status),
    target_count: Number((campaign as any).target_count || 0),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ORQUESTRADOR — executa os 7 steps em ordem com emit() entre cada
   ═══════════════════════════════════════════════════════════════════ */

export async function executeAICampaignSquad(ctx: SquadContext, emit: EmitFn): Promise<{ campaign_id: string } | null> {
  /* Mutex */
  if (inFlightBrands.has(ctx.brandId)) {
    emit({ step: 0, name: "error", status: "error", message: "Ja existe um squad em execucao para esse brand. Aguarde terminar." });
    return null;
  }
  inFlightBrands.add(ctx.brandId);

  /* Brand context (treinamento) — carregado 1 vez e reusado pelas skills */
  let brandContext = "";
  try {
    const p = await queryOne<any>(
      `SELECT business_context FROM ai_agent_profiles_brand WHERE user_id = ? AND brand_id = ? LIMIT 1`,
      [ctx.userId, ctx.brandId],
    );
    brandContext = String(p?.business_context || "").trim();
  } catch { /* tabela pode nao existir */ }

  try {
    /* ───── STEP 1 ───── */
    emit({ step: 1, name: "interpretBrief", status: "running" });
    let t = Date.now();
    const brief = await skillInterpretBrief(ctx, brandContext);
    emit({ step: 1, name: "interpretBrief", status: "done", output: brief, durationMs: Date.now() - t });

    /* ───── STEP 2 ───── */
    emit({ step: 2, name: "defineAudience", status: "running" });
    t = Date.now();
    const audience = await skillDefineAudience(brief, brandContext, ctx);
    emit({ step: 2, name: "defineAudience", status: "done", output: audience, durationMs: Date.now() - t });

    /* ───── STEP 3 ───── (recebe audience pra nao re-pedir mesmos segments) */
    emit({ step: 3, name: "discoverNewProspects", status: "running" });
    t = Date.now();
    let discovered: DiscoveredProspect;
    try {
      discovered = await skillDiscoverNewProspects(brief, audience, ctx);
      emit({ step: 3, name: "discoverNewProspects", status: "done", output: discovered, durationMs: Date.now() - t });
    } catch (e: any) {
      /* Soft fail — squad continua sem prospect-AI. MAS:
         - status="error" pra UI mostrar warning visual (era "done" antes)
         - logger.warn com detalhe completo (era silencioso antes)
         - output preserva info do erro pra debug */
      const errMsg = String(e?.message || e);
      logger.warn(`aiCampaignSquad step3 soft-fail (brand=${ctx.brandId}): ${errMsg}`);
      discovered = {
        segments_to_search: [],
        cities_recommended: [],
        market_reading: `Soft-fail: ${errMsg}. Squad continuou usando apenas o publico definido no step 2.`,
        target_customers: "",
        full_payload: null,
      };
      emit({
        step: 3,
        name: "discoverNewProspects",
        status: "error",
        output: discovered,
        message: errMsg,
        durationMs: Date.now() - t,
      });
    }

    /* ───── STEP 4 ───── */
    emit({ step: 4, name: "selectExistingLeads", status: "running" });
    t = Date.now();
    const selected = await skillSelectExistingLeads(audience, ctx);
    emit({ step: 4, name: "selectExistingLeads", status: "done", output: selected, durationMs: Date.now() - t });

    /* ───── STEP 5 ───── */
    emit({ step: 5, name: "composeMessage", status: "running" });
    t = Date.now();
    const message = await skillComposeMessage(brief, audience, selected, brandContext, ctx);
    emit({ step: 5, name: "composeMessage", status: "done", output: message, durationMs: Date.now() - t });

    /* ───── STEP 6 ───── */
    emit({ step: 6, name: "calibrateSpeed", status: "running" });
    t = Date.now();
    const speed = skillCalibrateSpeed(selected.count, brief.urgency);
    emit({ step: 6, name: "calibrateSpeed", status: "done", output: speed, durationMs: Date.now() - t });

    /* ───── STEP 7 ───── */
    emit({ step: 7, name: "assembleCampaign", status: "running" });
    t = Date.now();
    const instanceId = await pickActiveInstance(ctx.userId, ctx.brandId);
    if (!instanceId) {
      throw new Error("Nenhuma instancia WhatsApp conectada para esse brand. Conecte uma instancia em /whatsapp antes de gerar a campanha.");
    }
    const final = await skillAssembleCampaign(brief, audience, message, speed, instanceId, ctx);
    emit({ step: 7, name: "assembleCampaign", status: "done", output: final, durationMs: Date.now() - t });

    /* ───── FINAL ───── */
    emit({
      step: 8 as any, name: "final", status: "info",
      output: {
        campaign_id: final.campaign_id,
        name: final.name,
        target_count: final.target_count,
        status: final.status,
        draft: !ctx.options.auto_start,
        message_preview: message.preview,
        speed_summary: speed.reasoning,
      },
    });

    return { campaign_id: final.campaign_id };
  } catch (err: any) {
    const msg = String(err?.message || err);
    logger.error(`aiCampaignSquad error (brand=${ctx.brandId}): ${msg}`);
    emit({ step: 0, name: "error", status: "error", message: msg });
    return null;
  } finally {
    inFlightBrands.delete(ctx.brandId);
  }
}

/* Helper pra debug local */
export const _internal = { shortJson };
