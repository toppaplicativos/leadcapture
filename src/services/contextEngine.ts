import { insert, query, queryOne, update } from "../config/database";
import { AIAgentProfileService } from "./aiAgentProfile";
import { CompaniesService, Company } from "./companies";
import { ProductsService } from "./products";

type CampaignMode = "aggressive" | "educational" | "relationship";
type SuggestionModule = "text" | "image" | "video" | "campaign" | "outbound";
type FieldSource = "manual" | "derived" | "empty";

export type ContextEngineManualProfile = {
  companyId?: string;
  companyName: string;
  responsibleName: string;
  city: string;
  state: string;
  segment: string;
  targetAudience: string;
  toneOfVoice: string;
  productsServices: string[];
  averageTicket: string;
  valueProposition: string;
  offerPrimary: string;
  competitiveDifferential: string;
  guarantees: string;
  painPoints: string[];
  objections: string[];
  goals: string[];
  campaignMode: CampaignMode;
  primaryChannel: string;
  desiredOutcome: string;
};

export type ContextEngineGlobalContext = {
  companyName: string;
  responsibleName: string;
  city: string;
  state: string;
  segment: string;
  targetAudience: string;
  toneOfVoice: string;
  productsServices: string[];
  averageTicket: string;
  valueProposition: string;
  offerPrimary: string;
  competitiveDifferential: string;
  guarantees: string;
  painPoints: string[];
  objections: string[];
  goals: string[];
  campaignMode: CampaignMode;
  primaryChannel: string;
  desiredOutcome: string;
};

export type ContextEngineFieldStatus = {
  key: string;
  label: string;
  value: string | string[];
  required: boolean;
  filled: boolean;
  source: FieldSource;
  hint?: string;
};

export type ContextEngineSuggestion = {
  key: string;
  title: string;
  description: string;
  prompt: string;
  tone?: string;
  objective?: string;
};

export type ContextEngineSuggestions = Record<SuggestionModule, ContextEngineSuggestion[]>;

export type ContextEnginePayload = {
  manual: ContextEngineManualProfile;
  global: ContextEngineGlobalContext;
  company: Company | null;
  contextBlock: string;
  score: number;
  profileComplete: boolean;
  fields: ContextEngineFieldStatus[];
  missingFields: ContextEngineFieldStatus[];
  suggestions: ContextEngineSuggestions;
  updatedAt: string;
};

type ContextProfileRow = {
  user_id: string;
  company_id: string | null;
  profile_json: string | null;
  updated_at: Date | string;
};

type ContextCompanyLite = Pick<Company, "id" | "name" | "city" | "state" | "industry" | "description">;

export class ContextEngineService {
  private tableReady = false;
  private readonly aiAgentProfileService = new AIAgentProfileService();
  private readonly companiesService = new CompaniesService();
  private readonly productsService = new ProductsService();
  private productsUserScopeReady: boolean | null = null;

  private defaultManualProfile(): ContextEngineManualProfile {
    return {
      companyName: "",
      responsibleName: "",
      city: "",
      state: "",
      segment: "",
      targetAudience: "",
      toneOfVoice: "",
      productsServices: [],
      averageTicket: "",
      valueProposition: "",
      offerPrimary: "",
      competitiveDifferential: "",
      guarantees: "",
      painPoints: [],
      objections: [],
      goals: [],
      campaignMode: "educational",
      primaryChannel: "WhatsApp",
      desiredOutcome: ""
    };
  }

  private normalizeText(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    return normalized.length ? normalized : "";
  }

  private normalizeStringArray(value: unknown): string[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }

    const raw = String(value).trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // fallback to csv style
    }

    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeCampaignMode(value: unknown): CampaignMode | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "aggressive" || normalized === "educational" || normalized === "relationship") {
      return normalized;
    }
    return undefined;
  }

  private parseProfileJson(value: unknown): Partial<ContextEngineManualProfile> {
    if (!value) return {};
    if (typeof value === "object") return value as Partial<ContextEngineManualProfile>;
    if (typeof value !== "string") return {};

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Partial<ContextEngineManualProfile>) : {};
    } catch {
      return {};
    }
  }

  private mapProfilePatch(input: Partial<ContextEngineManualProfile>): Partial<ContextEngineManualProfile> {
    const output: Partial<ContextEngineManualProfile> = {};

    const companyId = this.normalizeText(input.companyId);
    if (companyId !== undefined) output.companyId = companyId || undefined;

    const companyName = this.normalizeText(input.companyName);
    if (companyName !== undefined) output.companyName = companyName;

    const responsibleName = this.normalizeText(input.responsibleName);
    if (responsibleName !== undefined) output.responsibleName = responsibleName;

    const city = this.normalizeText(input.city);
    if (city !== undefined) output.city = city;

    const state = this.normalizeText(input.state);
    if (state !== undefined) output.state = state;

    const segment = this.normalizeText(input.segment);
    if (segment !== undefined) output.segment = segment;

    const targetAudience = this.normalizeText(input.targetAudience);
    if (targetAudience !== undefined) output.targetAudience = targetAudience;

    const toneOfVoice = this.normalizeText(input.toneOfVoice);
    if (toneOfVoice !== undefined) output.toneOfVoice = toneOfVoice;

    const productsServices = this.normalizeStringArray(input.productsServices);
    if (productsServices !== undefined) output.productsServices = productsServices;

    const averageTicket = this.normalizeText(input.averageTicket);
    if (averageTicket !== undefined) output.averageTicket = averageTicket;

    const valueProposition = this.normalizeText(input.valueProposition);
    if (valueProposition !== undefined) output.valueProposition = valueProposition;

    const offerPrimary = this.normalizeText(input.offerPrimary);
    if (offerPrimary !== undefined) output.offerPrimary = offerPrimary;

    const competitiveDifferential = this.normalizeText(input.competitiveDifferential);
    if (competitiveDifferential !== undefined) output.competitiveDifferential = competitiveDifferential;

    const guarantees = this.normalizeText(input.guarantees);
    if (guarantees !== undefined) output.guarantees = guarantees;

    const painPoints = this.normalizeStringArray(input.painPoints);
    if (painPoints !== undefined) output.painPoints = painPoints;

    const objections = this.normalizeStringArray(input.objections);
    if (objections !== undefined) output.objections = objections;

    const goals = this.normalizeStringArray(input.goals);
    if (goals !== undefined) output.goals = goals;

    const campaignMode = this.normalizeCampaignMode(input.campaignMode);
    if (campaignMode !== undefined) output.campaignMode = campaignMode;

    const primaryChannel = this.normalizeText(input.primaryChannel);
    if (primaryChannel !== undefined) output.primaryChannel = primaryChannel;

    const desiredOutcome = this.normalizeText(input.desiredOutcome);
    if (desiredOutcome !== undefined) output.desiredOutcome = desiredOutcome;

    return output;
  }

  private mergeManualProfile(
    current: ContextEngineManualProfile,
    patch: Partial<ContextEngineManualProfile>
  ): ContextEngineManualProfile {
    return {
      ...current,
      ...patch,
      productsServices: patch.productsServices ?? current.productsServices,
      painPoints: patch.painPoints ?? current.painPoints,
      objections: patch.objections ?? current.objections,
      goals: patch.goals ?? current.goals
    };
  }

  private trimArray(values: string[], limit = 8): string[] {
    return values
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private hasValue(value: string | string[]): boolean {
    if (Array.isArray(value)) return value.some((item) => item.trim().length > 0);
    return value.trim().length > 0;
  }

  private mapTone(tone: string): string {
    if (tone === "formal") return "formal e objetivo";
    if (tone === "friendly") return "amigavel e consultivo";
    if (tone === "casual") return "leve e proximo";
    return "profissional e consultivo";
  }

  private getSegmentPreset(segment: string): {
    painPoints: string[];
    objections: string[];
    offers: string[];
    visuals: string[];
  } {
    const normalized = segment.toLowerCase();

    if (normalized.includes("dent")) {
      return {
        painPoints: ["agenda com horarios vagos", "baixa conversao de avaliacao para procedimento"],
        objections: ["paciente acha caro", "medo de procedimento"],
        offers: ["avaliacao inicial", "clareamento", "implantes"],
        visuals: ["sorriso natural", "consultorio premium", "resultado antes e depois"]
      };
    }

    if (normalized.includes("advog")) {
      return {
        painPoints: ["falta de leads qualificados", "contatos sem retorno"],
        objections: ["nao confia em consultoria", "acredita que nao precisa agora"],
        offers: ["consulta estrategica", "analise inicial do caso", "plano juridico mensal"],
        visuals: ["profissional de autoridade", "escritorio moderno", "atendimento humano"]
      };
    }

    if (normalized.includes("imob")) {
      return {
        painPoints: ["lead frio", "baixa taxa de visita"],
        objections: ["condicao financeira", "indecisao sobre regiao"],
        offers: ["avaliacao de imovel", "imoveis com condicao especial", "simulacao de financiamento"],
        visuals: ["familia visitando imovel", "fachada de empreendimento", "corretor em atendimento"]
      };
    }

    if (normalized.includes("estet")) {
      return {
        painPoints: ["agenda ociosa em dias da semana", "muita cotacao sem fechamento"],
        objections: ["receio de resultado", "preco fora do esperado"],
        offers: ["avaliacao personalizada", "protocolo premium", "combo de procedimentos"],
        visuals: ["clinica clean", "resultado natural", "atendimento acolhedor"]
      };
    }

    return {
      painPoints: ["dificuldade de gerar demanda recorrente", "baixa taxa de resposta de leads"],
      objections: ["preco percebido como alto", "falta de prioridade agora"],
      offers: ["consultoria inicial", "condicao especial por tempo limitado", "proposta personalizada"],
      visuals: ["cliente satisfeito", "equipe em atendimento", "resultado mensuravel"]
    };
  }

  private deriveAudienceFromText(input: string): string {
    const normalized = input.toLowerCase();
    if (!normalized) return "";
    if (normalized.includes("b2b") || normalized.includes("empresa")) return "empresas locais";
    if (normalized.includes("consumidor") || normalized.includes("cliente final")) return "consumidor final";
    return "";
  }

  private deriveCampaignMode(goal: string): CampaignMode {
    const normalized = goal.toLowerCase();
    if (normalized.includes("urgenc") || normalized.includes("oferta") || normalized.includes("fechar")) {
      return "aggressive";
    }
    if (normalized.includes("relacion") || normalized.includes("fidel")) {
      return "relationship";
    }
    return "educational";
  }

  private firstNonEmpty(...values: Array<string | undefined>): string {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return "";
  }

  private joinList(values: string[]): string {
    return values.filter(Boolean).join(", ");
  }

  private buildContextBlock(global: ContextEngineGlobalContext): string {
    const lines = [
      "CONTEXTO_MESTRE_CLIENTE:",
      `- Empresa: ${global.companyName || "nao informado"}`,
      `- Responsavel: ${global.responsibleName || "nao informado"}`,
      `- Segmento: ${global.segment || "nao informado"}`,
      `- Localizacao: ${[global.city, global.state].filter(Boolean).join(" / ") || "nao informado"}`,
      `- Publico alvo: ${global.targetAudience || "nao informado"}`,
      `- Oferta principal: ${global.offerPrimary || "nao informado"}`,
      `- Proposta de valor: ${global.valueProposition || "nao informado"}`,
      `- Diferencial competitivo: ${global.competitiveDifferential || "nao informado"}`,
      `- Garantias: ${global.guarantees || "nao informado"}`,
      `- Tom de voz: ${global.toneOfVoice || "nao informado"}`,
      `- Objetivo de negocio: ${this.joinList(global.goals) || "nao informado"}`,
      `- Dores principais: ${this.joinList(global.painPoints) || "nao informado"}`,
      `- Objecoes principais: ${this.joinList(global.objections) || "nao informado"}`,
      `- Produtos/Servicos: ${this.joinList(global.productsServices) || "nao informado"}`,
      `- Canal principal: ${global.primaryChannel || "WhatsApp"}`,
      `- Modo de campanha: ${global.campaignMode}`,
      `- Resultado desejado: ${global.desiredOutcome || "nao informado"}`
    ];

    return lines.join("\n");
  }

  private buildSuggestions(global: ContextEngineGlobalContext): ContextEngineSuggestions {
    const preset = this.getSegmentPreset(global.segment);
    const segment = global.segment || "negocios locais";
    const city = global.city || "sua cidade";
    const audience = global.targetAudience || "clientes com potencial de compra";
    const offer = global.offerPrimary || preset.offers[0];
    const value = global.valueProposition || "mais previsibilidade comercial";
    const tone = global.toneOfVoice || "profissional e consultivo";
    const mainPain = global.painPoints[0] || preset.painPoints[0];
    const mainGoal = global.goals[0] || "gerar mais oportunidades qualificadas";
    const objecao = global.objections[0] || preset.objections[0];
    const channel = global.primaryChannel || "WhatsApp";
    const visual = preset.visuals[0];
    const campaignModeLine =
      global.campaignMode === "aggressive"
        ? "Use escassez real e CTA forte."
        : global.campaignMode === "relationship"
        ? "Use proximidade e construcao de confianca."
        : "Use narrativa educativa e consultiva.";

    const text: ContextEngineSuggestion[] = [
      {
        key: "text_outbound_first_contact",
        title: "Outbound inicial contextual",
        description: "Primeira abordagem para lead frio com contexto local.",
        tone,
        objective: "iniciar conversa",
        prompt:
          `Crie uma mensagem curta de prospeccao outbound para ${segment} em ${city}. ` +
          `Publico: ${audience}. Dor principal: ${mainPain}. Oferta: ${offer}. ` +
          `Objetivo: obter resposta simples. ${campaignModeLine}`
      },
      {
        key: "text_followup_silencioso",
        title: "Follow-up lead silencioso",
        description: "Retomada leve para lead que nao respondeu.",
        tone,
        objective: "reativar resposta",
        prompt:
          `Crie follow-up curto para lead que nao respondeu no ${channel}. ` +
          `Contexto: ${segment}, oferta ${offer}, objetivo ${mainGoal}. ` +
          `Mensagem deve soar humana e sem pressao, mas pedir uma acao clara.`
      },
      {
        key: "text_offer_value",
        title: "Oferta com proposta de valor",
        description: "Mensagem de oferta orientada a conversao.",
        tone,
        objective: "enviar proposta",
        prompt:
          `Crie mensagem de oferta para ${offer}. ` +
          `Destaque proposta de valor: ${value}. Trate objecao comum: ${objecao}. ` +
          `Finalizar com CTA para avancar na conversa.`
      },
      {
        key: "text_content_educativo",
        title: "Mensagem educativa",
        description: "Copy para nutricao e autoridade.",
        tone,
        objective: "nutrir e educar",
        prompt:
          `Crie mensagem educativa de alto valor para ${audience}, no segmento ${segment}. ` +
          `Explique como resolver ${mainPain} com linguagem simples e CTA de continuacao.`
      }
    ];

    const image: ContextEngineSuggestion[] = [
      {
        key: "image_offer_card",
        title: "Card de oferta",
        description: "Imagem para conversao direta da oferta principal.",
        prompt:
          `Criar imagem publicitaria para ${global.companyName || "empresa"}, segmento ${segment}, ` +
          `focada em ${audience}. Destacar oferta ${offer} e beneficio ${value}. ` +
          `Estilo ${visual}, comercial premium, sem marca dagua.`
      },
      {
        key: "image_problem_solution",
        title: "Dor x Solucao",
        description: "Visual de contraste problema/resultado.",
        prompt:
          `Criar criativo visual mostrando antes e depois para resolver ${mainPain}. ` +
          `Negocio de ${segment} em ${city}. Linguagem visual limpa, moderna e voltada a conversao.`
      },
      {
        key: "image_social_proof",
        title: "Prova social",
        description: "Imagem focada em confianca e autoridade.",
        prompt:
          `Criar imagem de prova social para ${segment}. ` +
          `Mostrar cliente satisfeito, atendimento profissional e destaque para ${offer}. ` +
          `Tom visual coerente com ${tone}.`
      }
    ];

    const video: ContextEngineSuggestion[] = [
      {
        key: "video_short_hook_offer",
        title: "Video curto com hook",
        description: "Roteiro de 30s com dor, oferta e CTA.",
        prompt:
          `Criar roteiro de video curto (30s) para ${global.companyName || "empresa"} no segmento ${segment}. ` +
          `Estrutura: Hook sobre ${mainPain}, apresentacao da oferta ${offer}, beneficio ${value}, CTA para ${channel}.`
      },
      {
        key: "video_objection_breaker",
        title: "Video quebra de objecao",
        description: "Focado na principal barreira de compra.",
        prompt:
          `Criar roteiro de video curto para quebrar objecao "${objecao}" em ${segment}. ` +
          `Formato direto, com tom ${tone}, finalizando com convite para conversa no ${channel}.`
      }
    ];

    const campaign: ContextEngineSuggestion[] = [
      {
        key: "campaign_storefront_qr_token_step_by_step",
        title: "Storefront + Logistica QR/Token (passo a passo)",
        description: "Fluxo completo da campanha: oferta, pedido, pagamento e entrega confirmada.",
        prompt:
          `Monte uma campanha passo a passo para WhatsApp no contexto de ${segment} em ${city}, com foco em ${mainGoal}. ` +
          `Use este fluxo obrigatorio em sequencia: ` +
          `(1) abertura consultiva com oferta ${offer}; ` +
          `(2) qualificacao rapida da necessidade; ` +
          `(3) envio do link da pagina do produto/storefront; ` +
          `(4) orientacao clara para fechar o pedido no checkout; ` +
          `(5) confirmacao de pagamento e expectativa de preparo/entrega; ` +
          `(6) mensagem de logistica com status e confirmacao de entrega via QR/Token; ` +
          `(7) fechamento com pos-venda e convite para recompra. ` +
          `Defina para cada etapa: objetivo, gatilho para avancar, mensagem exemplo curta e CTA. ` +
          `Inclua regras de fallback para cliente sem resposta em 12h e 48h, sem inventar condicoes comerciais.`
      },
      {
        key: "campaign_outbound_base",
        title: "Campanha outbound base",
        description: "Estrutura inicial de campanha ativa no WhatsApp.",
        prompt:
          `Monte estrutura de campanha outbound para ${segment} em ${city}: ` +
          `mensagem inicial, follow-up 12h, follow-up final 48h, criterios de status e tags. ` +
          `Objetivo final: ${mainGoal}.`
      },
      {
        key: "campaign_nurturing_3d",
        title: "Nutricao 3 dias",
        description: "Sequencia educativa para engajar leads mornos.",
        prompt:
          `Monte sequencia de nutricao em 3 dias para ${audience}. ` +
          `Dor principal ${mainPain}, oferta ${offer}, CTA progressivo para avancar no funil.`
      }
    ];

    const outbound: ContextEngineSuggestion[] = [
      {
        key: "outbound_first_message",
        title: "Primeira mensagem fria",
        description: "Abordagem inicial sem parecer robo.",
        prompt:
          `Escreva mensagem fria para ${segment} em ${city}. ` +
          `Contexto local + beneficio ${value} + pergunta simples no final.`
      },
      {
        key: "outbound_final_attempt",
        title: "Ultima tentativa",
        description: "Fechamento elegante para nao responsivos.",
        prompt:
          `Escreva ultima tentativa para lead sem resposta em 48h. ` +
          `Tom ${tone}, curto, elegante e com opcao de encerrar conversa.`
      }
    ];

    return { text, image, video, campaign, outbound };
  }

  private mapFieldStatus(
    manual: ContextEngineManualProfile,
    global: ContextEngineGlobalContext
  ): ContextEngineFieldStatus[] {
    const mapField = (
      key: keyof ContextEngineGlobalContext,
      label: string,
      required: boolean,
      hint: string
    ): ContextEngineFieldStatus => {
      const value = global[key] as string | string[];
      const manualValue = manual[key] as string | string[] | undefined;
      const manualFilled =
        manualValue !== undefined ? this.hasValue(Array.isArray(manualValue) ? manualValue : String(manualValue)) : false;
      const filled = this.hasValue(value);
      return {
        key,
        label,
        value,
        required,
        filled,
        source: manualFilled ? "manual" : filled ? "derived" : "empty",
        hint
      };
    };

    return [
      mapField("companyName", "Nome da empresa", true, "Preencha na secao Empresa ou no contexto."),
      mapField("segment", "Segmento", true, "Defina o nicho principal para personalizar os prompts."),
      mapField("targetAudience", "Publico alvo", true, "Informe para quem a mensagem deve ser direcionada."),
      mapField("offerPrimary", "Oferta principal", true, "Defina o produto ou servico principal."),
      mapField("valueProposition", "Proposta de valor", true, "Mostre o resultado que voce entrega."),
      mapField("painPoints", "Dores principais", true, "Liste dores que o cliente ideal quer resolver."),
      mapField("objections", "Objecoes principais", true, "Liste barreiras comuns de compra."),
      mapField("toneOfVoice", "Tom de voz", true, "Defina o estilo de comunicacao."),
      mapField("goals", "Objetivos", true, "Defina objetivo comercial para orientar campanhas."),
      mapField("city", "Cidade", false, "Ajuda a contextualizar outbound local."),
      mapField(
        "competitiveDifferential",
        "Diferencial competitivo",
        false,
        "Destaque por que o cliente deve escolher sua empresa."
      ),
      mapField("desiredOutcome", "Resultado desejado", false, "Defina o resultado final esperado.")
    ];
  }

  private calculateScore(fields: ContextEngineFieldStatus[]): number {
    const required = fields.filter((field) => field.required);
    const optional = fields.filter((field) => !field.required);

    const requiredProgress =
      required.length > 0 ? required.filter((field) => field.filled).length / required.length : 1;
    const optionalProgress =
      optional.length > 0 ? optional.filter((field) => field.filled).length / optional.length : 1;

    return Math.round(requiredProgress * 75 + optionalProgress * 25);
  }

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS context_engine_profiles (
        user_id VARCHAR(36) NOT NULL PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        profile_json JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        INDEX idx_context_engine_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    this.tableReady = true;
  }

  private async ensureProductsUserScope(): Promise<boolean> {
    if (this.productsUserScopeReady !== null) return this.productsUserScopeReady;

    const row = await queryOne<{ Field: string }>("SHOW COLUMNS FROM products LIKE 'user_id'");
    this.productsUserScopeReady = !!row;
    return this.productsUserScopeReady;
  }

  private async getProductLines(userId: string, brandId?: string): Promise<string[]> {
    const hasUserScope = await this.ensureProductsUserScope();
    const normalizedBrandId = String(brandId || "").trim() || null;

    if (hasUserScope) {
      const products = await this.productsService.getActiveProducts(userId, normalizedBrandId);
      return products
        .slice(0, 20)
        .map((product) => [product.name, product.category].filter(Boolean).join(" - ").trim())
        .filter(Boolean);
    }

    const products = await this.productsService.getActiveProducts(undefined, normalizedBrandId);
    return products
      .slice(0, 20)
      .map((product) => [product.name, product.category].filter(Boolean).join(" - ").trim())
      .filter(Boolean);
  }

  private async getManualProfile(userId: string): Promise<{ profile: ContextEngineManualProfile; updatedAt: string }> {
    await this.ensureTable();
    const row = await queryOne<ContextProfileRow>(
      "SELECT user_id, company_id, profile_json, updated_at FROM context_engine_profiles WHERE user_id = ? LIMIT 1",
      [userId]
    );

    const base = this.defaultManualProfile();
    if (!row) {
      return { profile: base, updatedAt: new Date().toISOString() };
    }

    const parsed = this.parseProfileJson(row.profile_json);
    const merged = this.mergeManualProfile(base, this.mapProfilePatch(parsed));
    if (row.company_id) {
      merged.companyId = String(row.company_id);
    }

    return {
      profile: merged,
      updatedAt: new Date(row.updated_at || new Date()).toISOString()
    };
  }

  async updateManualProfile(
    userId: string,
    patch: Partial<ContextEngineManualProfile>
  ): Promise<ContextEnginePayload> {
    await this.ensureTable();
    const current = await this.getManualProfile(userId);
    const normalizedPatch = this.mapProfilePatch(patch);
    const merged = this.mergeManualProfile(current.profile, normalizedPatch);
    const companyId = normalizedPatch.companyId !== undefined ? normalizedPatch.companyId : merged.companyId;
    const affected = await update("UPDATE context_engine_profiles SET user_id = user_id WHERE user_id = ?", [userId]);

    if (affected === 0) {
      await insert(
        `INSERT INTO context_engine_profiles (user_id, company_id, profile_json)
         VALUES (?, ?, ?)`,
        [userId, companyId || null, JSON.stringify(merged)]
      );
    } else {
      await update(
        `UPDATE context_engine_profiles
         SET company_id = ?, profile_json = ?
         WHERE user_id = ?`,
        [companyId || null, JSON.stringify(merged), userId]
      );
    }

    return this.getResolvedContext(userId);
  }

  private async pickCompany(
    userId: string,
    requestedCompanyId: string | undefined
  ): Promise<ContextCompanyLite | null> {
    const companies = await this.companiesService.getAll(userId);
    if (!companies.length) return null;

    const preferred = requestedCompanyId
      ? companies.find((company) => company.id === requestedCompanyId)
      : undefined;
    return (preferred || companies[0]) as ContextCompanyLite;
  }

  getSuggestion(
    payload: ContextEnginePayload,
    key: string,
    module?: SuggestionModule
  ): ContextEngineSuggestion | null {
    const normalized = String(key || "").trim();
    if (!normalized) return null;

    if (module) {
      return payload.suggestions[module].find((suggestion) => suggestion.key === normalized) || null;
    }

    const merged = [
      ...payload.suggestions.text,
      ...payload.suggestions.image,
      ...payload.suggestions.video,
      ...payload.suggestions.campaign,
      ...payload.suggestions.outbound
    ];

    return merged.find((suggestion) => suggestion.key === normalized) || null;
  }

  buildPromptWithContext(payload: ContextEnginePayload, module: SuggestionModule, prompt: string): string {
    const normalizedPrompt = String(prompt || "").trim();
    const moduleLabel =
      module === "text"
        ? "copy/texto"
        : module === "image"
        ? "imagem"
        : module === "video"
        ? "video"
        : module === "campaign"
        ? "campanha"
        : "outbound";

    return [
      "Use estritamente o contexto mestre abaixo para personalizar a resposta.",
      payload.contextBlock,
      `TAREFA_${moduleLabel.toUpperCase()}: ${normalizedPrompt}`
    ].join("\n\n");
  }

  async getResolvedContext(userId: string, scopeId?: string): Promise<ContextEnginePayload> {
    const normalizedScopeId = String(scopeId || "").trim() || undefined;

    const [{ profile: manual, updatedAt }, aiProfile, userRow, productLines] = await Promise.all([
      this.getManualProfile(userId),
      this.aiAgentProfileService.getByUserId(userId, normalizedScopeId),
      queryOne<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ? LIMIT 1", [userId]),
      this.getProductLines(userId, normalizedScopeId)
    ]);

    const company = await this.pickCompany(userId, manual.companyId || aiProfile.company_id);
    const audienceByContext = this.deriveAudienceFromText(aiProfile.business_context || "");
    const preset = this.getSegmentPreset(this.firstNonEmpty(manual.segment, company?.industry));

    const painPoints = this.trimArray(manual.painPoints.length ? manual.painPoints : preset.painPoints);
    const objections = this.trimArray(manual.objections.length ? manual.objections : preset.objections);
    const products = this.trimArray(
      manual.productsServices.length ? manual.productsServices : productLines
    );
    const goals = this.trimArray(
      manual.goals.length
        ? manual.goals
        : this.normalizeStringArray(aiProfile.objective || "") || []
    );
    const inferredCampaignMode = this.deriveCampaignMode(goals[0] || aiProfile.objective || "");

    const global: ContextEngineGlobalContext = {
      companyName: this.firstNonEmpty(manual.companyName, company?.name),
      responsibleName: this.firstNonEmpty(manual.responsibleName),
      city: this.firstNonEmpty(manual.city, company?.city),
      state: this.firstNonEmpty(manual.state, company?.state),
      segment: this.firstNonEmpty(manual.segment, company?.industry),
      targetAudience: this.firstNonEmpty(manual.targetAudience, audienceByContext),
      toneOfVoice: this.firstNonEmpty(manual.toneOfVoice, this.mapTone(aiProfile.tone)),
      productsServices: products,
      averageTicket: this.firstNonEmpty(manual.averageTicket),
      valueProposition: this.firstNonEmpty(
        manual.valueProposition,
        aiProfile.objective,
        company?.description
      ),
      offerPrimary: this.firstNonEmpty(manual.offerPrimary, products[0], preset.offers[0]),
      competitiveDifferential: this.firstNonEmpty(manual.competitiveDifferential, company?.description),
      guarantees: this.firstNonEmpty(manual.guarantees),
      painPoints,
      objections,
      goals,
      campaignMode: manual.campaignMode || inferredCampaignMode,
      primaryChannel: this.firstNonEmpty(manual.primaryChannel, "WhatsApp"),
      desiredOutcome: this.firstNonEmpty(manual.desiredOutcome, goals[0])
    };

    const fields = this.mapFieldStatus(manual, global);
    const missingFields = fields.filter((field) => field.required && !field.filled);
    const score = this.calculateScore(fields);
    const profileComplete = missingFields.length === 0 && score >= 75;
    const suggestions = this.buildSuggestions(global);
    const contextBlock = this.buildContextBlock(global);

    return {
      manual,
      global,
      company: company as Company | null,
      contextBlock,
      score,
      profileComplete,
      fields,
      missingFields,
      suggestions,
      updatedAt
    };
  }
}
