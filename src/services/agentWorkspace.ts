import { queryOne } from "../config/database";
import { AIAgentProfileService } from "./aiAgentProfile";

type AgentWorkspaceOverview = {
  brand_id: string | null;
  readiness_score: number;
  profile: {
    agent_name: string;
    tone: string;
    language: string;
    objective: string;
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

  async getOverview(userId: string, brandId?: string | null): Promise<AgentWorkspaceOverview> {
    const normalizedBrandId = this.normalizeBrandId(brandId);
    const profile = await this.profileService.getByUserId(userId, normalizedBrandId || undefined);
    const activeColumn = await this.resolveKnowledgeActiveColumn();

    const trainingStats = await queryOne<any>(
      `SELECT
          COUNT(*) AS total_entries,
          SUM(CASE WHEN ${activeColumn ? `${activeColumn} = 1` : "1 = 1"} THEN 1 ELSE 0 END) AS active_entries,
          COUNT(DISTINCT COALESCE(category, 'geral')) AS categories_count,
          MAX(updated_at) AS last_update_at
       FROM knowledge_base
       WHERE user_id = ?
         AND (? IS NULL OR company_id = ?)` ,
      [userId, normalizedBrandId, normalizedBrandId]
    ).catch(() => null);

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
              SUM(CASE WHEN m.from_me = 0 THEN 1 ELSE 0 END) AS inbound_messages,
              SUM(CASE WHEN m.from_me = 1 THEN 1 ELSE 0 END) AS outbound_messages
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

    const readinessScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          filledFields / totalFields * 45 +
          Math.min(trainingTotal, 12) / 12 * 25 +
          (autoReplyEnabled ? 15 : 0) +
          autonomyCoverage * 15
        )
      )
    );

    return {
      brand_id: normalizedBrandId,
      readiness_score: readinessScore,
      profile: {
        agent_name: profile.agent_name,
        tone: profile.tone,
        language: profile.language,
        objective: String(profile.objective || "").trim(),
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
