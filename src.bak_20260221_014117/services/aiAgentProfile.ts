import { insert, queryOne, update } from "../config/database";

type AIAgentTone = "formal" | "casual" | "friendly" | "professional";

type AIAgentProfile = {
  user_id: string;
  company_id?: string;
  agent_name: string;
  tone: AIAgentTone;
  language: string;
  include_emojis: boolean;
  max_length: number;
  objective?: string;
  business_context?: string;
  communication_rules?: string;
  training_notes?: string;
  forbidden_terms: string[];
  preferred_terms: string[];
  created_at?: Date | string;
  updated_at?: Date | string;
};

type AIAgentProfileUpdateDTO = Partial<
  Pick<
    AIAgentProfile,
    | "company_id"
    | "agent_name"
    | "tone"
    | "language"
    | "include_emojis"
    | "max_length"
    | "objective"
    | "business_context"
    | "communication_rules"
    | "training_notes"
    | "forbidden_terms"
    | "preferred_terms"
  >
>;

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export class AIAgentProfileService {
  private defaultProfile(userId: string): AIAgentProfile {
    return {
      user_id: userId,
      agent_name: "Assistente Comercial",
      tone: "professional",
      language: "pt-BR",
      include_emojis: true,
      max_length: 500,
      objective: "Converter leads em oportunidades com atendimento consultivo.",
      business_context: "",
      communication_rules: "",
      training_notes: "",
      forbidden_terms: [],
      preferred_terms: [],
    };
  }

  async getByUserId(userId: string): Promise<AIAgentProfile> {
    const row = await queryOne<any>(
      `SELECT * FROM ai_agent_profiles WHERE user_id = ? LIMIT 1`,
      [userId]
    );

    if (!row) return this.defaultProfile(userId);

    return {
      user_id: String(row.user_id),
      company_id: row.company_id ? String(row.company_id) : undefined,
      agent_name: String(row.agent_name || "Assistente Comercial"),
      tone: (row.tone || "professional") as AIAgentProfile["tone"],
      language: String(row.language || "pt-BR"),
      include_emojis: Boolean(row.include_emojis),
      max_length: Number(row.max_length || 500),
      objective: row.objective || "",
      business_context: row.business_context || "",
      communication_rules: row.communication_rules || "",
      training_notes: row.training_notes || "",
      forbidden_terms: parseJsonArray(row.forbidden_terms),
      preferred_terms: parseJsonArray(row.preferred_terms),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async upsertByUserId(userId: string, payload: AIAgentProfileUpdateDTO): Promise<AIAgentProfile> {
    const current = await this.getByUserId(userId);

    const merged: AIAgentProfile = {
      ...current,
      ...payload,
      user_id: userId,
      forbidden_terms: payload.forbidden_terms ?? current.forbidden_terms,
      preferred_terms: payload.preferred_terms ?? current.preferred_terms,
    };

    const affected = await update("UPDATE ai_agent_profiles SET user_id = user_id WHERE user_id = ?", [userId]);

    if (affected === 0) {
      await insert(
        `INSERT INTO ai_agent_profiles
          (user_id, company_id, agent_name, tone, language, include_emojis, max_length, objective, business_context, communication_rules, training_notes, forbidden_terms, preferred_terms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          merged.company_id || null,
          merged.agent_name,
          merged.tone,
          merged.language,
          merged.include_emojis,
          merged.max_length,
          merged.objective || null,
          merged.business_context || null,
          merged.communication_rules || null,
          merged.training_notes || null,
          JSON.stringify(merged.forbidden_terms || []),
          JSON.stringify(merged.preferred_terms || []),
        ]
      );
    } else {
      await update(
        `UPDATE ai_agent_profiles
         SET company_id = ?,
             agent_name = ?,
             tone = ?,
             language = ?,
             include_emojis = ?,
             max_length = ?,
             objective = ?,
             business_context = ?,
             communication_rules = ?,
             training_notes = ?,
             forbidden_terms = ?,
             preferred_terms = ?
         WHERE user_id = ?`,
        [
          merged.company_id || null,
          merged.agent_name,
          merged.tone,
          merged.language,
          merged.include_emojis,
          merged.max_length,
          merged.objective || null,
          merged.business_context || null,
          merged.communication_rules || null,
          merged.training_notes || null,
          JSON.stringify(merged.forbidden_terms || []),
          JSON.stringify(merged.preferred_terms || []),
          userId,
        ]
      );
    }

    return this.getByUserId(userId);
  }

  buildBehaviorBlock(profile: AIAgentProfile): string {
    const rules: string[] = [];

    if (profile.objective?.trim()) {
      rules.push(`Objetivo principal do agente: ${profile.objective.trim()}`);
    }
    if (profile.business_context?.trim()) {
      rules.push(`Contexto do negocio: ${profile.business_context.trim()}`);
    }
    if (profile.communication_rules?.trim()) {
      rules.push(`Regras de comunicacao: ${profile.communication_rules.trim()}`);
    }
    if (profile.training_notes?.trim()) {
      rules.push(`Treinamento interno: ${profile.training_notes.trim()}`);
    }
    if (profile.preferred_terms.length) {
      rules.push(`Termos preferidos: ${profile.preferred_terms.join(", ")}`);
    }
    if (profile.forbidden_terms.length) {
      rules.push(`Evite os termos: ${profile.forbidden_terms.join(", ")}`);
    }

    return rules.join("\n");
  }
}
