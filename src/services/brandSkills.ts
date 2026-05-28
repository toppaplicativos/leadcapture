/**
 * ═══════════════════════════════════════════════════════════════════
 * Brand Skills — habilidades treinaveis por brand
 * ═══════════════════════════════════════════════════════════════════
 *
 * Diferente do `knowledge_base` antigo (texto cru anexado no prompt),
 * skills sao estruturadas:
 *   - trigger_intents/keywords/examples (matching de quando disparar)
 *   - skill_type (info | calculator | lookup | flow | policy)
 *   - instructions (prompt-engineered pro agente)
 *   - data_payload (dados estruturados extraidos: tabelas, listas, regras)
 *   - examples (Q&A de calibracao)
 *
 * Pipeline:
 *   1. User sobe materiais (texto, prints, tabelas, PDFs) via wizard
 *   2. Squad-IA processa e produz brand_skill estruturado
 *   3. Skill ativada vira parte do prompt do agente WhatsApp via composer
 *
 * NAO compete com knowledge_base — coexistem (skills sao camada superior).
 */

import { query, queryOne, insert, update } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

/* ───────────────────────── Tipos ───────────────────────── */

export type SkillType =
  | "info"        // resposta puramente informativa (texto + tom)
  | "calculator"  // executa formula/calculo (ex: simular consorcio)
  | "lookup"      // consulta dados estruturados (ex: tabela de produtos)
  | "flow"        // controla multi-turn (ex: coleta cadastro passo-a-passo)
  | "policy";     // regra estrita (ex: politica de cancelamento)

export type SkillMaterialKind = "text" | "image" | "table" | "pdf" | "url" | "audio";

export interface BrandSkill {
  id: string;
  brand_id: string;
  user_id: string;
  slug: string;
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_intents: string[];     // ["buy", "ask_price"]
  trigger_keywords: string[];    // ["preco", "quanto fica"]
  trigger_examples: string[];    // ["quanto custa um carro de 60k"]
  instructions: string;           // prompt-engineered pro agente
  data_payload: Record<string, any> | any[] | null;  // tabelas, listas, regras
  examples: Array<{ q: string; a: string }>;        // Q&A de calibracao
  confidence_score: number;       // 0-100 (validador IA do squad atribui)
  is_active: boolean;
  sort_order: number;
  source_summary: string;         // 1 frase resumindo origem
  created_at: Date;
  updated_at: Date;
}

export interface BrandSkillMaterial {
  id: string;
  brand_skill_id: string;
  kind: SkillMaterialKind;
  content_text: string | null;     // texto cru (se kind=text)
  file_path: string | null;        // path no disco (se kind=image/pdf/table)
  mime_type: string | null;
  original_filename: string | null;
  extracted_data: Record<string, any> | null;  // texto extraido, tabela parseada, etc
  size_bytes: number | null;
  uploaded_at: Date;
}

export interface BrandSkillRun {
  id: string;
  brand_skill_id: string;
  conversation_id: string | null;
  message_id: string | null;
  matched_score: number;            // 0-100
  input: string | null;
  output: string | null;
  executed_at: Date;
}

/* ───────────────────────── Service ───────────────────────── */

export class BrandSkillsService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;

    this.schemaPromise = (async () => {
      /* brand_skills */
      await query(`
        CREATE TABLE IF NOT EXISTS brand_skills (
          id VARCHAR(36) PRIMARY KEY,
          brand_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          slug VARCHAR(120) NOT NULL,
          name VARCHAR(180) NOT NULL,
          description TEXT NOT NULL,
          skill_type VARCHAR(24) NOT NULL DEFAULT 'info',
          trigger_intents JSONB NOT NULL DEFAULT '[]',
          trigger_keywords JSONB NOT NULL DEFAULT '[]',
          trigger_examples JSONB NOT NULL DEFAULT '[]',
          instructions TEXT NOT NULL DEFAULT '',
          data_payload JSONB NULL,
          examples JSONB NOT NULL DEFAULT '[]',
          confidence_score INTEGER NOT NULL DEFAULT 50,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 100,
          source_summary TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT brand_skills_brand_slug_unique UNIQUE (brand_id, slug)
        )
      `);
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_skills_brand ON brand_skills (brand_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_skills_active ON brand_skills (brand_id, is_active)`);
      } catch { /* idem */ }

      /* brand_skill_materials */
      await query(`
        CREATE TABLE IF NOT EXISTS brand_skill_materials (
          id VARCHAR(36) PRIMARY KEY,
          brand_skill_id VARCHAR(36) NOT NULL REFERENCES brand_skills(id) ON DELETE CASCADE,
          kind VARCHAR(24) NOT NULL,
          content_text TEXT NULL,
          file_path TEXT NULL,
          mime_type VARCHAR(80) NULL,
          original_filename TEXT NULL,
          extracted_data JSONB NULL,
          size_bytes BIGINT NULL,
          uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_skill_materials_skill ON brand_skill_materials (brand_skill_id)`);
      } catch { /* idem */ }

      /* brand_skill_runs (analytics + refinamento futuro) */
      await query(`
        CREATE TABLE IF NOT EXISTS brand_skill_runs (
          id VARCHAR(36) PRIMARY KEY,
          brand_skill_id VARCHAR(36) NOT NULL REFERENCES brand_skills(id) ON DELETE CASCADE,
          conversation_id VARCHAR(80) NULL,
          message_id VARCHAR(80) NULL,
          matched_score INTEGER NOT NULL DEFAULT 0,
          input TEXT NULL,
          output TEXT NULL,
          executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_skill_runs_skill ON brand_skill_runs (brand_skill_id, executed_at DESC)`);
      } catch { /* idem */ }

      this.schemaReady = true;
      logger.info("Brand Skills schema OK");
    })().finally(() => { this.schemaPromise = null; });

    return this.schemaPromise;
  }

  /* ───────────────── CRUD básico ───────────────── */

  async listForBrand(userId: string, brandId: string, opts?: { onlyActive?: boolean }): Promise<BrandSkill[]> {
    await this.ensureSchema();
    const conds = ["brand_id = ?", "user_id = ?"];
    const params: any[] = [brandId, userId];
    if (opts?.onlyActive) {
      conds.push("is_active = TRUE");
    }
    const rows = (await query<any[]>(
      `SELECT * FROM brand_skills WHERE ${conds.join(" AND ")} ORDER BY sort_order ASC, created_at DESC`,
      params,
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => this.toBrandSkill(r));
  }

  async findById(userId: string, brandId: string, id: string): Promise<BrandSkill | null> {
    await this.ensureSchema();
    const r = await queryOne<any>(
      `SELECT * FROM brand_skills WHERE id = ? AND brand_id = ? AND user_id = ? LIMIT 1`,
      [id, brandId, userId],
    );
    return r ? this.toBrandSkill(r) : null;
  }

  async create(userId: string, brandId: string, input: Partial<BrandSkill> & { name: string; skill_type: SkillType }): Promise<BrandSkill> {
    await this.ensureSchema();
    const id = uuidv4();
    /* Slug unico por brand: nome normalizado + 6 chars random */
    const baseSlug = String(input.name)
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const slug = `${baseSlug}-${id.slice(0, 6)}`;

    await insert(
      `INSERT INTO brand_skills
         (id, brand_id, user_id, slug, name, description, skill_type,
          trigger_intents, trigger_keywords, trigger_examples,
          instructions, data_payload, examples,
          confidence_score, is_active, sort_order, source_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, brandId, userId, slug,
        input.name, input.description || "", input.skill_type,
        JSON.stringify(input.trigger_intents || []),
        JSON.stringify(input.trigger_keywords || []),
        JSON.stringify(input.trigger_examples || []),
        input.instructions || "",
        input.data_payload ? JSON.stringify(input.data_payload) : null,
        JSON.stringify(input.examples || []),
        Math.max(0, Math.min(100, Number(input.confidence_score) || 50)),
        input.is_active !== false,
        Number(input.sort_order) || 100,
        input.source_summary || "",
      ],
    );

    const created = await queryOne<any>(`SELECT * FROM brand_skills WHERE id = ? LIMIT 1`, [id]);
    return this.toBrandSkill(created);
  }

  async patch(userId: string, brandId: string, id: string, patch: Partial<BrandSkill>): Promise<BrandSkill | null> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: any[] = [];
    const allowed: Array<[keyof BrandSkill, string, (v: any) => any]> = [
      ["name", "name", (v) => String(v).slice(0, 180)],
      ["description", "description", (v) => String(v)],
      ["skill_type", "skill_type", (v) => String(v)],
      ["trigger_intents", "trigger_intents", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      ["trigger_keywords", "trigger_keywords", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      ["trigger_examples", "trigger_examples", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      ["instructions", "instructions", (v) => String(v)],
      ["data_payload", "data_payload", (v) => v === null ? null : JSON.stringify(v)],
      ["examples", "examples", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      ["confidence_score", "confidence_score", (v) => Math.max(0, Math.min(100, Number(v) || 0))],
      ["is_active", "is_active", (v) => !!v],
      ["sort_order", "sort_order", (v) => Number(v) || 100],
    ];
    for (const [k, col, fn] of allowed) {
      if (k in patch) {
        fields.push(`${col} = ?`);
        values.push(fn((patch as any)[k]));
      }
    }
    if (fields.length === 0) return this.findById(userId, brandId, id);
    fields.push("updated_at = NOW()");
    await update(
      `UPDATE brand_skills SET ${fields.join(", ")} WHERE id = ? AND brand_id = ? AND user_id = ?`,
      [...values, id, brandId, userId],
    );
    return this.findById(userId, brandId, id);
  }

  async toggle(userId: string, brandId: string, id: string): Promise<BrandSkill | null> {
    await this.ensureSchema();
    const existing = await this.findById(userId, brandId, id);
    if (!existing) return null;
    return this.patch(userId, brandId, id, { is_active: !existing.is_active });
  }

  async remove(userId: string, brandId: string, id: string): Promise<boolean> {
    await this.ensureSchema();
    const affected = await update(
      `DELETE FROM brand_skills WHERE id = ? AND brand_id = ? AND user_id = ?`,
      [id, brandId, userId],
    );
    return affected > 0;
  }

  /* ───────────────── Materials (filhos) ───────────────── */

  async attachMaterial(brandSkillId: string, material: Omit<BrandSkillMaterial, "id" | "uploaded_at">): Promise<BrandSkillMaterial> {
    await this.ensureSchema();
    const id = uuidv4();
    await insert(
      `INSERT INTO brand_skill_materials
         (id, brand_skill_id, kind, content_text, file_path, mime_type, original_filename, extracted_data, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, brandSkillId, material.kind,
        material.content_text, material.file_path,
        material.mime_type, material.original_filename,
        material.extracted_data ? JSON.stringify(material.extracted_data) : null,
        material.size_bytes,
      ],
    );
    const r = await queryOne<any>(`SELECT * FROM brand_skill_materials WHERE id = ? LIMIT 1`, [id]);
    return this.toMaterial(r);
  }

  async listMaterials(brandSkillId: string): Promise<BrandSkillMaterial[]> {
    await this.ensureSchema();
    const rows = (await query<any[]>(
      `SELECT * FROM brand_skill_materials WHERE brand_skill_id = ? ORDER BY uploaded_at ASC`,
      [brandSkillId],
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => this.toMaterial(r));
  }

  /* ───────────────── Runs (analytics + matching futuro) ───────────────── */

  async recordRun(input: Omit<BrandSkillRun, "id" | "executed_at">): Promise<void> {
    await this.ensureSchema();
    const id = uuidv4();
    try {
      await insert(
        `INSERT INTO brand_skill_runs (id, brand_skill_id, conversation_id, message_id, matched_score, input, output)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.brand_skill_id, input.conversation_id, input.message_id,
         Math.max(0, Math.min(100, Number(input.matched_score) || 0)),
         input.input, input.output],
      );
    } catch (e: any) {
      logger.warn(`brandSkills.recordRun failed (${e.message})`);
    }
  }

  async listRuns(userId: string, brandId: string, id: string, limit = 20): Promise<BrandSkillRun[]> {
    await this.ensureSchema();
    const skill = await this.findById(userId, brandId, id);
    if (!skill) return [];
    const rows = (await query<any[]>(
      `SELECT * FROM brand_skill_runs WHERE brand_skill_id = ?
       ORDER BY executed_at DESC LIMIT ?`,
      [id, Math.max(1, Math.min(100, limit))],
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => this.toRun(r));
  }

  /* ───────────────── Helpers ───────────────── */

  private toBrandSkill(row: any): BrandSkill {
    return {
      id: String(row.id),
      brand_id: String(row.brand_id),
      user_id: String(row.user_id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description || ""),
      skill_type: (row.skill_type || "info") as SkillType,
      trigger_intents: this.parseJsonArray(row.trigger_intents),
      trigger_keywords: this.parseJsonArray(row.trigger_keywords),
      trigger_examples: this.parseJsonArray(row.trigger_examples),
      instructions: String(row.instructions || ""),
      data_payload: this.parseJson(row.data_payload),
      examples: this.parseJsonArray(row.examples).filter((e: any) => e && typeof e === "object"),
      confidence_score: Number(row.confidence_score || 50),
      is_active: !!row.is_active,
      sort_order: Number(row.sort_order || 100),
      source_summary: String(row.source_summary || ""),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private toMaterial(row: any): BrandSkillMaterial {
    return {
      id: String(row.id),
      brand_skill_id: String(row.brand_skill_id),
      kind: row.kind as SkillMaterialKind,
      content_text: row.content_text || null,
      file_path: row.file_path || null,
      mime_type: row.mime_type || null,
      original_filename: row.original_filename || null,
      extracted_data: this.parseJson(row.extracted_data),
      size_bytes: row.size_bytes ? Number(row.size_bytes) : null,
      uploaded_at: row.uploaded_at,
    };
  }

  private toRun(row: any): BrandSkillRun {
    return {
      id: String(row.id),
      brand_skill_id: String(row.brand_skill_id),
      conversation_id: row.conversation_id || null,
      message_id: row.message_id || null,
      matched_score: Number(row.matched_score || 0),
      input: row.input || null,
      output: row.output || null,
      executed_at: row.executed_at,
    };
  }

  private parseJson(v: any): any {
    if (!v) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(String(v)); } catch { return null; }
  }
  private parseJsonArray(v: any): any[] {
    const parsed = this.parseJson(v);
    return Array.isArray(parsed) ? parsed : [];
  }
}

export const brandSkillsService = new BrandSkillsService();
