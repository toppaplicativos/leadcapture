import { queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { AIAgentProfileService } from "./aiAgentProfile";

export type ReadinessChecklistItem = {
  id: string;
  group: "profile" | "training" | "automation" | "performance";
  title: string;
  description: string;
  why: string;
  points_earned: number;
  points_max: number;
  done: boolean;
  /** Frontend hint: which tab on Agente IA page should open. */
  action_tab: "config" | "squad" | "training" | "overview";
  /** Optional field id (eg. for scrolling/focusing the right input). */
  action_field?: string;
  cta_label: string;
};

type AgentWorkspaceOverview = {
  brand_id: string | null;
  readiness_score: number;
  readiness_checklist: ReadinessChecklistItem[];
  profile: {
    agent_name: string;
    tone: string;
    language: string;
    objective: string;
    business_context: string;
    communication_rules: string;
    training_notes: string;
    preferred_terms: string[];
    forbidden_terms: string[];
    include_emojis: boolean;
    max_length: number;
    filled_fields: number;
    total_fields: number;
  };
  training: {
    total_entries: number;
    active_entries: number;
    categories_count: number;
    last_update_at: string | null;
  };
  whatsapp: {
    auto_reply_enabled: boolean;
    total_conversations: number;
    autonomous_conversations: number;
    supervised_conversations: number;
    manual_conversations: number;
    inbound_messages: number;
    outbound_messages: number;
    autonomous_replies: number;
    escalations: number;
    human_takeovers: number;
    autonomy_coverage: number;
  };
};

export class AgentWorkspaceService {
  private readonly profileService = new AIAgentProfileService();

  private async resolveKnowledgeActiveColumn(): Promise<string> {
    const active = await queryOne<any>("SHOW COLUMNS FROM knowledge_base LIKE 'active'").catch(() => null);
    if (active) return "active";
    const isActive = await queryOne<any>("SHOW COLUMNS FROM knowledge_base LIKE 'is_active'").catch(() => null);
    return isActive ? "is_active" : "";
  }

  private normalizeBrandId(value?: string | null): string | null {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  private countFilledFields(profile: Awaited<ReturnType<AIAgentProfileService["getByUserId"]>>) {
    const values = [
      profile.agent_name,
      profile.objective,
      profile.business_context,
      profile.communication_rules,
      profile.training_notes,
      (profile.preferred_terms || []).join(", "),
      (profile.forbidden_terms || []).join(", "),
    ];

    return values.filter((value) => String(value || "").trim()).length;
  }

  private buildChecklist(args: {
    profile: Awaited<ReturnType<AIAgentProfileService["getByUserId"]>>;
    filledFields: number;
    totalFields: number;
    profilePoints: number;
    trainingTotal: number;
    trainingPoints: number;
    autoReplyEnabled: boolean;
    autoReplyPoints: number;
    autonomyCoverage: number;
    autonomyPoints: number;
    inboundMessages: number;
  }): ReadinessChecklistItem[] {
    const { profile } = args;
    const round = (n: number) => Math.round(n * 10) / 10;

    /* Per-field weight inside the 45-point profile bucket */
    const perField = 45 / args.totalFields;

    const profileFields: Array<{ id: string; title: string; description: string; why: string; value: string }> = [
      {
        id: "agent_name",
        title: "Nome do agente",
        description: "Como o agente se apresenta nas conversas (ex: 'Consultor Alho Pronto').",
        why: "Sem nome próprio, o agente soa genérico e enfraquece a percepção da marca.",
        value: String(profile.agent_name || "").trim(),
      },
      {
        id: "objective",
        title: "Objetivo do agente",
        description: "Qual é a missão dele em 1-2 frases (ex: qualificar leads, fechar venda, dar suporte).",
        why: "É o que orienta a estratégia comercial de cada resposta.",
        value: String(profile.objective || "").trim(),
      },
      {
        id: "business_context",
        title: "Contexto do negócio",
        description: "Descrição da empresa, produtos, público e diferenciais — o que o agente precisa saber sobre você.",
        why: "Sem esse contexto, o agente generaliza e perde profundidade nas respostas.",
        value: String(profile.business_context || "").trim(),
      },
      {
        id: "communication_rules",
        title: "Regras de comunicação",
        description: "Como o agente deve (e não deve) escrever: tom, formalidade, limites, padrões de fechamento.",
        why: "Define o estilo de cada resposta e mantém consistência entre conversas.",
        value: String(profile.communication_rules || "").trim(),
      },
      {
        id: "training_notes",
        title: "Notas de treinamento",
        description: "Aprendizados, padrões de objeção, scripts internos que a equipe usa e querem replicar.",
        why: "Conhecimento operacional que melhora respostas em casos específicos.",
        value: String(profile.training_notes || "").trim(),
      },
      {
        id: "preferred_terms",
        title: "Termos preferidos",
        description: "Palavras/expressões que a marca quer ver nas respostas (ex: 'parceiro', 'sob medida').",
        why: "Reforça vocabulário e posicionamento da marca em cada turn.",
        value: (profile.preferred_terms || []).join(", "),
      },
      {
        id: "forbidden_terms",
        title: "Termos proibidos",
        description: "Palavras/expressões que NUNCA podem aparecer nas respostas (ex: nome de concorrente, gírias).",
        why: "Guardrail forte contra mensagens fora do padrão da marca.",
        value: (profile.forbidden_terms || []).join(", "),
      },
    ];

    const profileItems: ReadinessChecklistItem[] = profileFields.map((f) => {
      const done = Boolean(f.value);
      return {
        id: `profile.${f.id}`,
        group: "profile",
        title: f.title,
        description: f.description,
        why: f.why,
        points_earned: done ? round(perField) : 0,
        points_max: round(perField),
        done,
        action_tab: "config",
        action_field: f.id,
        cta_label: done ? "Revisar" : "Preencher agora",
      };
    });

    const trainingDone = args.trainingTotal >= 12;
    const trainingPctOf12 = Math.min(1, args.trainingTotal / 12);
    const trainingItem: ReadinessChecklistItem = {
      id: "training.knowledge_base",
      group: "training",
      title: `Base de conhecimento (${args.trainingTotal}/12 entradas)`,
      description: trainingDone
        ? "Base de conhecimento completa. Continue adicionando entradas para cobrir novos cenários."
        : `Adicione mais ${12 - args.trainingTotal} entradas para destravar todos os 25 pontos. Cada entrada é uma pergunta+resposta ou um trecho de política que o agente pode consultar.`,
      why: "Permite respostas precisas sobre FAQ, políticas, prazos, e detalhes da operação que mudam.",
      points_earned: round(args.trainingPoints),
      points_max: 25,
      done: trainingDone,
      action_tab: "training",
      cta_label: trainingDone ? "Revisar base" : "Adicionar entrada",
    };

    const autoReplyItem: ReadinessChecklistItem = {
      id: "automation.auto_reply",
      group: "automation",
      title: "Auto-resposta global do WhatsApp",
      description: args.autoReplyEnabled
        ? "Auto-resposta ativada — o agente está pronto para responder conversas em modo autônomo."
        : "Ative o auto-atendimento global para que o agente comece a responder mensagens automaticamente.",
      why: "Sem isso, o agente fica em standby e não atua nas conversas mesmo configurado.",
      points_earned: args.autoReplyPoints,
      points_max: 15,
      done: args.autoReplyEnabled,
      action_tab: "squad",
      cta_label: args.autoReplyEnabled ? "Configurações do squad" : "Ativar auto-resposta",
    };

    const autonomyPct = Math.round(args.autonomyCoverage * 100);
    const autonomyDone = args.autonomyCoverage >= 1;
    const autonomyItem: ReadinessChecklistItem = {
      id: "performance.autonomy_coverage",
      group: "performance",
      title: `Cobertura autônoma (${autonomyPct}%)`,
      description: args.inboundMessages === 0
        ? "Cobertura autônoma é calculada conforme o agente vai respondendo as mensagens dos clientes. Aparece quando começarem a chegar conversas reais."
        : autonomyDone
          ? "Agente está respondendo 100% das mensagens recebidas. Excelente cobertura."
          : `Hoje o agente responde ${args.autonomyPoints.toFixed(1)} pontos dos 15 possíveis. Aumente revisando conversas em modo manual e migrando para autônomo.`,
      why: "Mede o quanto da operação o agente realmente cobre — não dá pra forçar, é resultado do uso.",
      points_earned: round(args.autonomyPoints),
      points_max: 15,
      done: autonomyDone,
      action_tab: "squad",
      cta_label: args.inboundMessages === 0 ? "Conectar instância" : "Ver conversas",
    };

    return [...profileItems, trainingItem, autoReplyItem, autonomyItem];
  }

  async getOverview(userId: string, brandId?: string | null): Promise<AgentWorkspaceOverview> {
    const normalizedBrandId = this.normalizeBrandId(brandId);
    const profile = await this.profileService.getByUserId(userId, normalizedBrandId || undefined);
    const activeColumn = await this.resolveKnowledgeActiveColumn();

    /* NOTE 1: filtramos somente por user_id intencionalmente. A coluna knowledge_base.company_id é
     * FK pra companies (schema legado), não pra brand_units — então tentar `company_id = brandId`
     * jamais casa e fazia o contador exibir 0 enquanto o painel do WhatsApp mostrava 13. Até termos
     * uma coluna brand_id real, todas as entradas do user pertencem à conta inteira.
     * NOTE 2: a coluna `active` no Postgres é boolean; comparar com `= 1` lança erro de tipo que
     * o .catch silenciava → toda a query retornava null → total_entries=0. Usamos `IS TRUE`. */
    const trainingStats = await queryOne<any>(
      `SELECT
          COUNT(*) AS total_entries,
          SUM(CASE WHEN ${activeColumn ? `${activeColumn} IS TRUE` : "TRUE"} THEN 1 ELSE 0 END) AS active_entries,
          COUNT(DISTINCT COALESCE(category, 'geral')) AS categories_count,
          MAX(updated_at) AS last_update_at
       FROM knowledge_base
       WHERE user_id = ?`,
      [userId]
    ).catch((e) => { logger.warn(`trainingStats query failed: ${e?.message || e}`); return null; });

    const conversationStats = normalizedBrandId
      ? await queryOne<any>(
          `SELECT
              COUNT(*) AS total_conversations,
              SUM(CASE WHEN c.ai_mode = 'autonomous' THEN 1 ELSE 0 END) AS autonomous_conversations,
              SUM(CASE WHEN c.ai_mode = 'supervised' THEN 1 ELSE 0 END) AS supervised_conversations,
              SUM(CASE WHEN c.ai_mode = 'manual' THEN 1 ELSE 0 END) AS manual_conversations
           FROM whatsapp_conversations c
           JOIN whatsapp_instances i ON i.id = c.instance_id
           WHERE i.created_by = ?
             AND i.brand_id = ?`,
          [userId, normalizedBrandId]
        ).catch(() => null)
      : null;

    const messageStats = normalizedBrandId
      ? await queryOne<any>(
          `SELECT
              SUM(CASE WHEN m.from_me IS FALSE THEN 1 ELSE 0 END) AS inbound_messages,
              SUM(CASE WHEN m.from_me IS TRUE THEN 1 ELSE 0 END) AS outbound_messages
           FROM whatsapp_messages m
           JOIN whatsapp_conversations c ON c.id = m.conversation_id
           JOIN whatsapp_instances i ON i.id = c.instance_id
           WHERE i.created_by = ?
             AND i.brand_id = ?`,
          [userId, normalizedBrandId]
        ).catch(() => null)
      : null;

    const decisionStats = normalizedBrandId
      ? await queryOne<any>(
          `SELECT
              SUM(CASE WHEN decision_type = 'autonomous_reply' THEN 1 ELSE 0 END) AS autonomous_replies,
              SUM(CASE WHEN decision_type = 'auto_escalation' THEN 1 ELSE 0 END) AS escalations,
              SUM(CASE WHEN decision_type = 'human_takeover' THEN 1 ELSE 0 END) AS human_takeovers
           FROM ai_conversation_decisions
           WHERE user_id = ?
             AND brand_id = ?`,
          [userId, normalizedBrandId]
        ).catch(() => null)
      : null;

    const globalState = normalizedBrandId
      ? await queryOne<any>(
          `SELECT auto_reply_enabled
           FROM ai_global_settings
           WHERE brand_id = ?
           LIMIT 1`,
          [normalizedBrandId]
        ).catch(() => null)
      : null;

    const filledFields = this.countFilledFields(profile);
    const totalFields = 7;
    const trainingTotal = Number(trainingStats?.total_entries || 0);
    const activeTraining = Number(trainingStats?.active_entries || 0);
    const autoReplyEnabled = Number(globalState?.auto_reply_enabled || 0) === 1 || globalState?.auto_reply_enabled === true;
    const autonomousReplies = Number(decisionStats?.autonomous_replies || 0);
    const escalations = Number(decisionStats?.escalations || 0);
    const inboundMessages = Number(messageStats?.inbound_messages || 0);
    const autonomyCoverage = inboundMessages > 0 ? Math.min(1, autonomousReplies / inboundMessages) : 0;

    /* Per-component points earned (Math.round at the end keeps it consistent with old behavior) */
    const profilePoints = Math.round((filledFields / totalFields) * 45 * 10) / 10;
    const trainingPoints = Math.round((Math.min(trainingTotal, 12) / 12) * 25 * 10) / 10;
    const autoReplyPoints = autoReplyEnabled ? 15 : 0;
    const autonomyPoints = Math.round(autonomyCoverage * 15 * 10) / 10;

    const readinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(profilePoints + trainingPoints + autoReplyPoints + autonomyPoints)
      )
    );

    const checklist = this.buildChecklist({
      profile,
      filledFields,
      totalFields,
      profilePoints,
      trainingTotal,
      trainingPoints,
      autoReplyEnabled,
      autoReplyPoints,
      autonomyCoverage,
      autonomyPoints,
      inboundMessages,
    });

    return {
      brand_id: normalizedBrandId,
      readiness_score: readinessScore,
      readiness_checklist: checklist,
      profile: {
        agent_name: profile.agent_name,
        tone: profile.tone,
        language: profile.language,
        objective: String(profile.objective || "").trim(),
        business_context: String(profile.business_context || "").trim(),
        communication_rules: String(profile.communication_rules || "").trim(),
        training_notes: String(profile.training_notes || "").trim(),
        preferred_terms: Array.isArray(profile.preferred_terms) ? profile.preferred_terms : [],
        forbidden_terms: Array.isArray(profile.forbidden_terms) ? profile.forbidden_terms : [],
        include_emojis: Boolean(profile.include_emojis),
        max_length: Number(profile.max_length || 500),
        filled_fields: filledFields,
        total_fields: totalFields,
      },
      training: {
        total_entries: trainingTotal,
        active_entries: activeTraining,
        categories_count: Number(trainingStats?.categories_count || 0),
        last_update_at: trainingStats?.last_update_at ? String(trainingStats.last_update_at) : null,
      },
      whatsapp: {
        auto_reply_enabled: autoReplyEnabled,
        total_conversations: Number(conversationStats?.total_conversations || 0),
        autonomous_conversations: Number(conversationStats?.autonomous_conversations || 0),
        supervised_conversations: Number(conversationStats?.supervised_conversations || 0),
        manual_conversations: Number(conversationStats?.manual_conversations || 0),
        inbound_messages: inboundMessages,
        outbound_messages: Number(messageStats?.outbound_messages || 0),
        autonomous_replies: autonomousReplies,
        escalations: escalations,
        human_takeovers: Number(decisionStats?.human_takeovers || 0),
        autonomy_coverage: autonomyCoverage,
      },
    };
  }
}
