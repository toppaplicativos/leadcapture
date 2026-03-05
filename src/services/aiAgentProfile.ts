import { insert, query, queryOne, update } from "../config/database";

type AIAgentTone = "formal" | "casual" | "friendly" | "professional";

type AIAgentProfile = {
  user_id: string;
  company_id?: string;
  brand_id?: string;
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
    | "brand_id"
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
  private schemaReady = false;
  private schemaReadyPromise: Promise<void> | null = null;

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async indexExists(tableName: string, indexName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [tableName, indexName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaReadyPromise) {
      await this.schemaReadyPromise;
      return;
    }

    this.schemaReadyPromise = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS ai_agent_profiles_brand (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          agent_name VARCHAR(120) NOT NULL DEFAULT 'Assistente Comercial',
          tone VARCHAR(32) NOT NULL DEFAULT 'professional',
          language VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
          include_emojis TINYINT(1) NOT NULL DEFAULT 1,
          max_length INT NOT NULL DEFAULT 500,
          objective TEXT NULL,
          business_context TEXT NULL,
          communication_rules TEXT NULL,
          training_notes TEXT NULL,
          forbidden_terms JSON NULL,
          preferred_terms JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_ai_agent_profiles_brand_user_brand (user_id, brand_id),
          KEY idx_ai_agent_profiles_brand_user (user_id),
          KEY idx_ai_agent_profiles_brand_brand (brand_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      await query(
        `CREATE TABLE IF NOT EXISTS ai_agent_profiles (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          company_id VARCHAR(36) NULL,
          agent_name VARCHAR(120) NOT NULL DEFAULT 'Assistente Comercial',
          tone VARCHAR(32) NOT NULL DEFAULT 'professional',
          language VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
          include_emojis TINYINT(1) NOT NULL DEFAULT 1,
          max_length INT NOT NULL DEFAULT 500,
          objective TEXT NULL,
          business_context TEXT NULL,
          communication_rules TEXT NULL,
          training_notes TEXT NULL,
          forbidden_terms JSON NULL,
          preferred_terms JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_ai_agent_profiles_user (user_id),
          KEY idx_ai_agent_profiles_user_company (user_id, company_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      const hasCompanyColumn = await this.columnExists("ai_agent_profiles", "company_id");
      if (!hasCompanyColumn) {
        await query("ALTER TABLE ai_agent_profiles ADD COLUMN company_id VARCHAR(36) NULL");
      }

      const hasBrandColumn = await this.columnExists("ai_agent_profiles", "brand_id");
      if (!hasBrandColumn) {
        await query("ALTER TABLE ai_agent_profiles ADD COLUMN brand_id VARCHAR(36) NULL");
      }

      const hasCompanyIndex = await this.indexExists("ai_agent_profiles", "idx_ai_agent_profiles_company");
      if (!hasCompanyIndex) {
        await query("CREATE INDEX idx_ai_agent_profiles_company ON ai_agent_profiles (company_id)");
      }

      const hasBrandIndex = await this.indexExists("ai_agent_profiles", "idx_ai_agent_profiles_brand");
      if (!hasBrandIndex) {
        await query("CREATE INDEX idx_ai_agent_profiles_brand ON ai_agent_profiles (brand_id)");
      }

      this.schemaReady = true;
    })().finally(() => {
      this.schemaReadyPromise = null;
    });

    await this.schemaReadyPromise;
  }

  private normalizeScopeId(scopeId?: string): string | null {
    const normalized = String(scopeId || "").trim();
    return normalized || null;
  }

  private defaultProfile(userId: string, scopeId?: string): AIAgentProfile {
    const normalizedScopeId = this.normalizeScopeId(scopeId);
    return {
      user_id: userId,
      company_id: undefined,
      brand_id: normalizedScopeId || undefined,
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

  private toProfile(row: any, fallbackBrandId?: string | null): AIAgentProfile {
    return {
      user_id: String(row.user_id),
      company_id: row.company_id ? String(row.company_id) : undefined,
      brand_id: row.brand_id ? String(row.brand_id) : fallbackBrandId || undefined,
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

  async getByUserId(userId: string, companyId?: string): Promise<AIAgentProfile> {
    await this.ensureSchema();
    const normalizedScopeId = this.normalizeScopeId(companyId);

    if (normalizedScopeId) {
      const brandRow = await queryOne<any>(
        `SELECT *
         FROM ai_agent_profiles_brand
         WHERE user_id = ? AND brand_id = ?
         LIMIT 1`,
        [userId, normalizedScopeId]
      );

      if (brandRow) {
        return this.toProfile(brandRow, normalizedScopeId);
      }
    }

    const row = normalizedScopeId
      ? await queryOne<any>(
          `SELECT *
           FROM ai_agent_profiles
           WHERE user_id = ?
             AND (brand_id = ? OR (brand_id IS NULL AND company_id = ?))
           ORDER BY (brand_id = ?) DESC, updated_at DESC
           LIMIT 1`,
          [userId, normalizedScopeId, normalizedScopeId, normalizedScopeId]
        )
      : await queryOne<any>(
          `SELECT *
           FROM ai_agent_profiles
           WHERE user_id = ?
             AND (brand_id IS NULL AND (company_id IS NULL OR company_id = ''))
           ORDER BY updated_at DESC
           LIMIT 1`,
          [userId]
        );

    if (!row) return this.defaultProfile(userId, normalizedScopeId || undefined);

    return this.toProfile(row, normalizedScopeId);
  }

  async upsertByUserId(userId: string, payload: AIAgentProfileUpdateDTO): Promise<AIAgentProfile> {
    await this.ensureSchema();
    const normalizedScopeId = this.normalizeScopeId(payload.brand_id || payload.company_id);
    const current = await this.getByUserId(userId, normalizedScopeId || undefined);

    const existing = normalizedScopeId
      ? await queryOne<{ user_id: string }>(
          `SELECT user_id
           FROM ai_agent_profiles
           WHERE user_id = ? AND (brand_id = ? OR (brand_id IS NULL AND company_id = ?))
           LIMIT 1`,
          [userId, normalizedScopeId, normalizedScopeId]
        )
      : await queryOne<{ user_id: string }>(
          `SELECT user_id
           FROM ai_agent_profiles
           WHERE user_id = ? AND (brand_id IS NULL AND (company_id IS NULL OR company_id = ''))
           LIMIT 1`,
          [userId]
        );

    const merged: AIAgentProfile = {
      ...current,
      ...payload,
      user_id: userId,
      company_id: undefined,
      brand_id: normalizedScopeId || undefined,
      forbidden_terms: payload.forbidden_terms ?? current.forbidden_terms,
      preferred_terms: payload.preferred_terms ?? current.preferred_terms,
    };

    if (normalizedScopeId) {
      await query(
        `INSERT INTO ai_agent_profiles_brand
          (user_id, brand_id, agent_name, tone, language, include_emojis, max_length, objective, business_context, communication_rules, training_notes, forbidden_terms, preferred_terms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           agent_name = VALUES(agent_name),
           tone = VALUES(tone),
           language = VALUES(language),
           include_emojis = VALUES(include_emojis),
           max_length = VALUES(max_length),
           objective = VALUES(objective),
           business_context = VALUES(business_context),
           communication_rules = VALUES(communication_rules),
           training_notes = VALUES(training_notes),
           forbidden_terms = VALUES(forbidden_terms),
           preferred_terms = VALUES(preferred_terms),
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          normalizedScopeId,
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

      return this.getByUserId(userId, normalizedScopeId || undefined);
    }

    if (!existing?.user_id) {
      await insert(
        `INSERT INTO ai_agent_profiles
          (user_id, company_id, brand_id, agent_name, tone, language, include_emojis, max_length, objective, business_context, communication_rules, training_notes, forbidden_terms, preferred_terms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          null,
          normalizedScopeId,
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
         SET brand_id = ?,
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
         WHERE user_id = ? AND ${normalizedScopeId ? "(brand_id = ? OR (brand_id IS NULL AND company_id = ?))" : "(brand_id IS NULL AND (company_id IS NULL OR company_id = ''))"}`,
        [
          normalizedScopeId,
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
          ...(normalizedScopeId ? [normalizedScopeId, normalizedScopeId] : []),
        ]
      );
    }

    return this.getByUserId(userId, normalizedScopeId || undefined);
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
