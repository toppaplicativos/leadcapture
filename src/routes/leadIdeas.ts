/**
 * /api/lead-ideas/generate
 *
 * INTELIGÊNCIA COMERCIAL PARA PROSPECÇÃO — não "ideias de negócio".
 *
 * O usuario descreve o produto/serviço dele. A IA pensa como um SDR/growth B2B:
 *   "Quem COMPRA isso E pode ser encontrado publicamente no Google Maps?"
 *
 * Devolve segmentos COMERCIAIS específicos (clínica odonto, pizzaria self-service,
 * concessionária), com FOOTPRINTS pesquisáveis e cidades+raio recomendados — pra
 * alimentar o sistema de scraping Google Places do panfleteiro.
 */
import { Router, Response } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { AIRouter } from "../services/aiRouter";
import { AIAgentProfileService } from "../services/aiAgentProfile";
import { logger } from "../utils/logger";
import { getPool } from "../config/database";

const router = Router();
router.use(attachBrandContext);

const aiRouter = new AIRouter();
const aiAgentProfileService = new AIAgentProfileService();

/* Reune o contexto declarado pelo brand na area de treinamento (agent profile).
   Fonte da verdade pra QUEM o brand eh e O QUE oferece — sem isso a IA cai em
   sugestoes genericas tipo "Software / SaaS pra pequenos negocios". */
async function loadBrandContext(userId: string, brandId?: string): Promise<{
  brandName: string;
  businessContext: string;
  objective: string;
  trainingNotes: string;
  preferredTerms: string[];
  forbiddenTerms: string[];
  productLines: string[];
}> {
  const pool = getPool();
  let brandName = "";
  if (brandId) {
    try {
      const r = (await pool.query(
        "SELECT name FROM brand_units WHERE id = ? AND user_id = ? LIMIT 1",
        [brandId, userId],
      )) as any;
      const row = Array.isArray(r) ? r[0] : r?.rows?.[0] ?? r?.[0];
      brandName = String(row?.name || "").trim();
    } catch { /* tabela pode nao existir */ }
  }

  let profile: any = null;
  try {
    profile = await aiAgentProfileService.getByUserId(userId, brandId);
  } catch (e: any) {
    logger.warn(`leadIdeas: aiAgentProfile fetch failed (${e?.message}) - using empty`);
  }

  /* Produtos cadastrados — bonus pra IA quando o brand tem catalogo */
  const productLines: string[] = [];
  for (const table of ["products", "commerce_products"]) {
    if (productLines.length >= 6) break;
    try {
      const sql = table === "commerce_products"
        ? `SELECT nome AS name, categoria AS category FROM commerce_products
           WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
           ORDER BY created_at DESC NULLS LAST LIMIT 6`
        : `SELECT name, category FROM products
           WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
           ORDER BY created_at DESC NULLS LAST LIMIT 6`;
      const r = (await pool.query(sql, [userId, brandId || null])) as any;
      const rows = Array.isArray(r) ? r : r?.rows ?? [];
      for (const row of rows) {
        const name = String(row?.name || "").trim();
        const cat = String(row?.category || "").trim();
        if (name) productLines.push(cat ? `${name} (${cat})` : name);
      }
    } catch { /* idem */ }
  }

  return {
    brandName,
    businessContext: String(profile?.business_context || "").trim(),
    objective: String(profile?.objective || "").trim(),
    trainingNotes: String(profile?.training_notes || "").trim(),
    preferredTerms: Array.isArray(profile?.preferred_terms) ? profile.preferred_terms : [],
    forbiddenTerms: Array.isArray(profile?.forbidden_terms) ? profile.forbidden_terms : [],
    productLines,
  };
}

/* Renderiza o contexto do brand como bloco texto pra injetar no prompt da IA. */
function renderBrandContextBlock(ctx: Awaited<ReturnType<typeof loadBrandContext>>): string {
  const lines: string[] = [];
  if (ctx.brandName) lines.push(`- Brand: ${ctx.brandName}`);
  if (ctx.businessContext) lines.push(`- O que o brand vende/oferece: ${ctx.businessContext}`);
  if (ctx.objective) lines.push(`- Objetivo comercial: ${ctx.objective}`);
  if (ctx.productLines.length > 0) lines.push(`- Catalogo (top recentes): ${ctx.productLines.join("; ")}`);
  if (ctx.trainingNotes) lines.push(`- Notas internas de treinamento: ${ctx.trainingNotes}`);
  if (ctx.preferredTerms.length > 0) lines.push(`- Termos preferidos: ${ctx.preferredTerms.join(", ")}`);
  if (ctx.forbiddenTerms.length > 0) lines.push(`- Evitar termos: ${ctx.forbiddenTerms.join(", ")}`);
  return lines.length > 0 ? lines.join("\n") : "(brand sem treinamento cadastrado)";
}

/* Score de completude — usado pra avisar a UI quando o brand nao treinou nada. */
function scoreBrandContext(ctx: Awaited<ReturnType<typeof loadBrandContext>>): {
  hasBusinessContext: boolean;
  filledFields: number;
} {
  let filled = 0;
  if (ctx.businessContext) filled++;
  if (ctx.objective) filled++;
  if (ctx.productLines.length > 0) filled++;
  if (ctx.trainingNotes) filled++;
  if (ctx.preferredTerms.length > 0) filled++;
  return {
    hasBusinessContext: !!ctx.businessContext,
    filledFields: filled,
  };
}

type IdeaTargetCity = {
  name: string;
  state: string;
  reason: string;
  recommendedRadiusKm: number;
};

type IdeaSuggestion = {
  /** Termo curto pesquisável no Google Places (ex: "pizzaria", "clínica odontológica") */
  segment: string;
  /** Por que esse segmento COMPRA do produto/serviço do usuário */
  whyTheyBuy: string;
  /** Variações de busca pesquisáveis no Google ("pizzaria self service", "buffet de casamento") */
  searchFootprints: string[];
  /** Cidades onde rastrear, com raio calibrado pela densidade do segmento */
  cities: IdeaTargetCity[];
  /** Nível de competição percebida (baixa = oceano azul, alta = saturado) */
  competitorTier: 'baixa' | 'media' | 'alta';
  /** Prioridade 1-10 — alvos mais valiosos primeiro */
  priorityScore: number;
  /** Janela horária ideal pra contato (opcional) */
  bestTimeWindow?: string;
};

type IdeasResponse = {
  /** Resumo: o que o usuário vende, em 1 linha */
  marketReading: string;
  /** Quem compra: perfil real do comprador, não persona abstrata */
  targetCustomers: string;
  /** Segmentos prospectáveis ordenados por priorityScore */
  suggestions: IdeaSuggestion[];
  /** Dicas táticas de outbound: ângulo de abordagem, timing, evitar X */
  strategy: { tip: string; rationale: string }[];
};

const buildPrompt = (description: string, brandBlock: string) => `
CONTEXTO DECLARADO DO BRAND (fonte da verdade — respeite isso acima de tudo):
${brandBlock}

----

Voce eh uma IA especializada em INTELIGENCIA COMERCIAL para PROSPECCAO B2B/B2C.
Voce pensa como um SDR senior + operador de growth + hacker de outbound.

Sua funcao NAO eh sugerir onde vender, ideias de negocio ou personas abstratas.
Sua funcao eh, dado um produto/servico, identificar QUEM PROVAVELMENTE COMPRA isso
E PODE SER ENCONTRADO PUBLICAMENTE NO GOOGLE MAPS / GOOGLE SEARCH para alimentar
um sistema de scraping/leads.

Pense:
- "Que empresas, estabelecimentos, clinicas, profissionais ou operacoes COMPRAM isso?"
- "Como eu escreveria a busca no Google Maps pra achar contatos REAIS desse perfil?"
- "Qual segmento eh mais facil de prospectar (alto volume publico, baixa competicao)?"

EXEMPLOS DE COMO RACIOCINAR:

Produto: "alho descascado a vacuo"
- ERRADO: "mercados, feiras" (generico, gera pouco footprint)
- CERTO: pizzarias, restaurantes self-service, hamburguerias, cozinhas industriais,
  buffets, dark kitchens, hoteis com cozinha, distribuidoras alimenticias.
  Footprints: "pizzaria delivery em fortaleza", "restaurante self service centro",
  "cozinha industrial atacado", "buffet eventos corporativos"

Produto: "uniformes profissionais"
- ERRADO: "lojas de uniformes" (vendedor, nao comprador)
- CERTO: clinicas odontologicas, restaurantes, construtoras, mercados, farmacias,
  escolas, hospitais, industrias. Footprints: "clinica odontologica zona sul",
  "construtora civil sao paulo", "escola particular fundamental"

Produto: "consorcio de carros"
- ERRADO: "publico jovem" (persona abstrata)
- CERTO: concessionarias, garagens de seminovos, despachantes, financeiras locais,
  consultores automotivos, locadoras. Footprints: "loja de carros curitiba",
  "despachante automotivo", "garagem de seminovos centro"

Produto: "colchoes premium"
- ERRADO: "lojas de moveis" (revendedor)
- CERTO: hoteis, pousadas, gestao airbnb, construtoras, arquitetos de interiores,
  imobiliarias de alto padrao. Footprints: "hotel boutique sao paulo",
  "pousada premium gramado", "construtora alto padrao"

O usuario descreveu seu produto/servico:

"""
${description.replace(/"""/g, '"')}
"""

Retorne JSON EXATAMENTE neste schema:

{
  "marketReading": "1 frase direta: o que o usuario vende e em que mercado",
  "targetCustomers": "1 frase: quem REALMENTE compra isso (perfil de comprador real, nao persona)",
  "suggestions": [
    {
      "segment": "termo curto e PESQUISAVEL no Google Maps (ex: 'pizzaria', 'clinica odontologica', 'concessionaria fiat')",
      "whyTheyBuy": "por que esse segmento compra do produto/servico do usuario",
      "searchFootprints": [
        "variacao pesquisavel 1 (ex: 'pizzaria delivery em fortaleza')",
        "variacao pesquisavel 2 (mais especifica ainda)",
        "variacao 3"
      ],
      "cities": [
        {
          "name": "Cidade",
          "state": "UF",
          "reason": "por que essa cidade/regiao tem densidade desse segmento (mencione bairros se possivel)",
          "recommendedRadiusKm": 3
        }
      ],
      "competitorTier": "baixa|media|alta",
      "priorityScore": 8,
      "bestTimeWindow": "Manha|Tarde|Comercial (opcional)"
    }
  ],
  "strategy": [
    { "tip": "dica tatica de outbound (angulo de pitch, sequencia, timing)", "rationale": "por que" }
  ]
}

REGRAS CRITICAS:
1. Gere 4 a 7 segmentos COMERCIAIS especificos — variando de mais obvios (alto volume) ate
   mais nichados (baixa competicao mas alto ticket). Ordene por priorityScore DESC.
2. "segment" deve ser termo curto que funciona literal numa busca do Google Maps.
   Evite genericos demais ("empresas", "clientes"). Prefira "pizzaria", "petshop premium",
   "consultorio odontologico", "restaurante self service".
3. "searchFootprints" — sempre 3 a 5 variacoes pesquisaveis. Misture amplas e nichadas.
4. "recommendedRadiusKm": calibre pela densidade do segmento na cidade.
   - Capitais com nicho denso (ex: clinicas odonto em SP): 1-3km
   - Capitais com nicho medio: 3-6km
   - Cidades medias: 5-10km
   - Interior amplo / nicho raro: 10-20km
5. "competitorTier" e "priorityScore" trabalham juntos:
   - tier baixa + valor alto = priorityScore 9-10
   - tier alta + commodity = priorityScore 4-6
6. "strategy": 3 a 5 dicas TATICAS de outbound:
   - angulo de pitch ("aborde mencionando X")
   - sequencia ("comece pelos mais faceis depois suba pra Z")
   - timing/horario
   - o que EVITAR (ex: "nao foque em commodity, eles compram preco")
7. NUNCA sugira marketplaces, redes sociais genericas, "empresas" amplas, marketing digital.
8. PT-BR, tom direto e pratico. Sem floreios, disclaimers ou genericos.
`.trim();

/**
 * Funcao pura exportada — usada pela rota /generate E pelo aiCampaignSquad
 * (skill discoverNewProspects). Evita HTTP self-call.
 */
export async function generateLeadIdeas(
  description: string,
  scope: { userId: string; brandId?: string },
): Promise<IdeasResponse> {
  const desc = String(description || "").trim();
  if (!desc) throw new Error("Descricao do produto/servico eh obrigatoria");
  if (desc.length > 2000) throw new Error("Descricao muito longa (max 2000 caracteres)");

  /* Injeta o contexto declarado pelo brand (area de treinamento) — sem isso a IA
     chuta verticais que nao tem nada a ver com o que o brand realmente vende. */
  const brandCtx = await loadBrandContext(scope.userId, scope.brandId);
  const brandBlock = renderBrandContextBlock(brandCtx);

  const result = await aiRouter.generateJson<IdeasResponse>(
    buildPrompt(desc, brandBlock),
    { userId: scope.userId, brandId: scope.brandId },
    { temperature: 0.7, functionKey: "text.lead.ideas" },
  );

  /* Validacao defensiva — IA pode retornar campos faltando ou fora do schema */
  return {
    marketReading: String(result?.marketReading || "").trim(),
    targetCustomers: String(result?.targetCustomers || "").trim(),
    suggestions: Array.isArray(result?.suggestions)
      ? result.suggestions.slice(0, 8).map((s: any) => ({
          segment: String(s?.segment || "").trim(),
          whyTheyBuy: String(s?.whyTheyBuy || "").trim(),
          searchFootprints: Array.isArray(s?.searchFootprints)
            ? s.searchFootprints.slice(0, 6).map((f: any) => String(f || "").trim()).filter(Boolean)
            : [],
          cities: Array.isArray(s?.cities)
            ? s.cities.slice(0, 4).map((c: any) => ({
                name: String(c?.name || "").trim(),
                state: String(c?.state || "").trim().toUpperCase().slice(0, 2),
                reason: String(c?.reason || "").trim(),
                recommendedRadiusKm: Math.max(0.5, Math.min(30, Number(c?.recommendedRadiusKm) || 3)),
              })).filter((c: any) => c.name)
            : [],
          competitorTier: (['baixa', 'media', 'alta'].includes(String(s?.competitorTier).toLowerCase())
            ? String(s.competitorTier).toLowerCase()
            : 'media') as IdeaSuggestion['competitorTier'],
          priorityScore: Math.max(1, Math.min(10, Math.round(Number(s?.priorityScore) || 5))),
          bestTimeWindow: s?.bestTimeWindow ? String(s.bestTimeWindow).trim() : undefined,
        })).filter((s: any) => s.segment)
        .sort((a: any, b: any) => b.priorityScore - a.priorityScore)
      : [],
    strategy: Array.isArray(result?.strategy)
      ? result.strategy.slice(0, 6).map((t: any) => ({
          tip: String(t?.tip || "").trim(),
          rationale: String(t?.rationale || "").trim(),
        })).filter((t: any) => t.tip)
      : [],
  };
}

router.post("/generate", async (req: BrandRequest, res: Response) => {
  try {
    const ideas = await generateLeadIdeas(
      String(req.body?.description || ""),
      { userId: req.user!.userId, brandId: req.brandId || undefined },
    );
    res.json({ success: true, ideas });
  } catch (error: any) {
    logger.error(error, "Erro ao gerar ideias de prospeccao");
    /* Erros de validacao retornam 400, demais 500 */
    const msg = String(error?.message || "Falha ao gerar ideias");
    const status = /obrigatoria|muito longa/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

/**
 * GET /api/lead-ideas/seed-prompts
 *
 * Retorna 4 exemplos de descricoes de negocio CONTEXTUAIS pro brand atual.
 * IA olha:
 *   - nome do brand
 *   - top produtos cadastrados (nome + categoria)
 *   - cidade base (se houver)
 * E sugere prompts realistas pra ALIMENTAR o IdeaGeneratorModal.
 *
 * Cacheado em memoria por brand (5min) — evita custo de IA toda vez que abre o modal.
 */
const seedPromptCache = new Map<string, { value: string[]; expires: number }>();

router.get("/seed-prompts", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const brandId = req.brandId || "default";
    const cacheKey = `${userId}:${brandId}`;
    const now = Date.now();
    const cached = seedPromptCache.get(cacheKey);
    if (cached && cached.expires > now) {
      return res.json({ success: true, prompts: cached.value, cached: true, fromCache: true });
    }

    const ctx = await loadBrandContext(userId, req.brandId || undefined);
    const meta = scoreBrandContext(ctx);

    /* Sem treinamento: NAO chama IA — devolve fallback marcado pra UI saber que precisa treinar */
    if (!ctx.businessContext && !ctx.productLines.length && !ctx.brandName) {
      const generic = [
        "Distribuição B2B do meu produto principal",
        "Serviço local com ticket médio alto",
        "Software / SaaS pra pequenos negócios",
        "Produto físico vendido pra revendedores",
      ];
      return res.json({
        success: true,
        prompts: generic,
        meta: { ...meta, generic: true, needsTraining: true },
      });
    }

    const brandBlock = renderBrandContextBlock(ctx);
    const prompt = `
Voce eh especialista em prospeccao B2B/B2C. Sua tarefa: gerar 4 exemplos de
DESCRICOES de negocio para ESSE brand especifico (nao generico), pra alimentar
uma busca de inteligencia comercial (rastreio Google Maps).

CONTEXTO DECLARADO DO BRAND (fonte da verdade):
${brandBlock}

INSTRUCOES:
- Cada prompt deve ser uma DESCRICAO realista de algo que ESSE brand venderia/ofereceria
- NUNCA invente vertical fora do contexto (ex: nao sugira "Software/SaaS" se o brand
  vende consorcio). Se nao souber o vertical exato, prefira variacoes do que o
  business_context disser.
- Mencione publico-alvo, cidade ou angulo de venda quando fizer sentido
- 4 frases curtas (max 100 caracteres cada) em PT-BR
- Variar entre B2B / B2C, distribuicao / atendimento local, ticket alto / volume

Retorne JSON: { "prompts": ["frase 1", "frase 2", "frase 3", "frase 4"] }
`.trim();

    const result = await aiRouter.generateJson<{ prompts: string[] }>(
      prompt,
      { userId, brandId: req.brandId || undefined },
      { functionKey: "text.lead.ideas", temperature: 0.85 },
    );

    const prompts = Array.isArray(result?.prompts)
      ? result.prompts.slice(0, 4).map((p: any) => String(p || "").trim()).filter(Boolean)
      : [];
    if (prompts.length === 0) {
      const fallback = [
        "Distribuição B2B do meu produto principal",
        "Serviço local com ticket médio alto",
        "Produto vendido pra revendedores",
        "Atendimento corporativo na minha região",
      ];
      return res.json({
        success: true,
        prompts: fallback,
        meta: { ...meta, generic: true, needsTraining: !meta.hasBusinessContext },
      });
    }

    seedPromptCache.set(cacheKey, { value: prompts, expires: now + 5 * 60_000 });
    res.json({
      success: true,
      prompts,
      meta: { ...meta, generic: false, needsTraining: false },
    });
  } catch (error: any) {
    logger.error(error, "Erro ao gerar seed-prompts");
    /* Nunca quebra a UI por falha de IA — devolve generico */
    res.json({
      success: true,
      prompts: [
        "Distribuição B2B do meu produto principal",
        "Serviço local com ticket médio alto",
        "Produto vendido pra revendedores",
        "Atendimento corporativo na minha região",
      ],
      meta: { hasBusinessContext: false, filledFields: 0, generic: true, needsTraining: true, error: true },
    });
  }
});

/**
 * GET /api/lead-ideas/brand-context
 *
 * Retorna se o brand atual tem treinamento cadastrado (business_context + objetivo + etc).
 * UI usa pra mostrar um aviso "treine seu agente" quando o user abre o modal sem ter
 * configurado nada em /ai-agent.
 */
router.get("/brand-context", async (req: BrandRequest, res: Response) => {
  try {
    const ctx = await loadBrandContext(req.user!.userId, req.brandId || undefined);
    res.json({
      success: true,
      brandName: ctx.brandName,
      businessContext: ctx.businessContext,
      objective: ctx.objective,
      productCount: ctx.productLines.length,
      meta: scoreBrandContext(ctx),
    });
  } catch (error: any) {
    logger.error(error, "Erro ao buscar brand-context");
    res.json({ success: true, brandName: "", businessContext: "", objective: "", productCount: 0, meta: { hasBusinessContext: false, filledFields: 0 } });
  }
});

export default router;
