import { getPool } from "../config/database";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeadMemoryProfile {
  nome?: string;
  cidade?: string;
  segmento?: string;
  empresa?: string;
}

export type IntentStage = "descoberta" | "interesse" | "consideracao" | "decisao" | "pos_venda" | "inativo";
export type Sentiment = "positivo" | "neutro" | "negativo" | "desconhecido";

export interface LeadContextMemory {
  profile: LeadMemoryProfile;
  conversation_summary: string;
  intent_stage: IntentStage;
  pain_points: string[];
  objections: string[];
  preferences: Record<string, string>;
  topics_discussed: string[];
  sentiment: Sentiment;
  last_topic: string;
  last_interaction_at: string;
  memory_version: number;
}

const DEFAULT_MEMORY: LeadContextMemory = {
  profile: {},
  conversation_summary: "",
  intent_stage: "descoberta",
  pain_points: [],
  objections: [],
  preferences: {},
  topics_discussed: [],
  sentiment: "desconhecido",
  last_topic: "",
  last_interaction_at: new Date().toISOString(),
  memory_version: 0,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class MemoryEngineService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const modelName = process.env.GEMINI_MEMORY_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  // ─── Ensure columns exist ─────────────────────────────────────────────────

  private _columnsChecked = false;

  private async ensureColumns(): Promise<void> {
    if (this._columnsChecked) return;
    const pool = getPool();
    const [rows] = await pool.query<any[]>("SHOW COLUMNS FROM clients LIKE 'context_memory'");
    const exists = Array.isArray(rows) && rows.length > 0;
    if (!exists) {
      await pool.execute(
        "ALTER TABLE clients ADD COLUMN context_memory JSON NULL, ADD COLUMN memory_updated_at TIMESTAMP NULL, ADD COLUMN memory_version INT NOT NULL DEFAULT 0"
      );
      logger.info("[MemoryEngine] Added context_memory, memory_updated_at, memory_version columns to clients");
    }
    this._columnsChecked = true;
  }

  // ─── Get memory ───────────────────────────────────────────────────────────

  async getMemory(clientId: string): Promise<LeadContextMemory | null> {
    await this.ensureColumns();
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT context_memory, memory_version FROM clients WHERE id = ? AND is_active = TRUE LIMIT 1",
      [clientId]
    );
    if (!rows[0]) return null;
    const raw = rows[0].context_memory;
    if (!raw) return { ...DEFAULT_MEMORY };
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return { ...DEFAULT_MEMORY, ...parsed };
    } catch {
      return { ...DEFAULT_MEMORY };
    }
  }

  async getMemoryByPhone(userId: string, phone: string): Promise<{ clientId: string; memory: LeadContextMemory } | null> {
    await this.ensureColumns();
    const pool = getPool();
    const normalized = phone.replace(/\D/g, "");
    const [rows] = await pool.query<any[]>(
      `SELECT id, context_memory, memory_version FROM clients
       WHERE user_id = ? AND is_active = TRUE
         AND (REPLACE(REPLACE(REPLACE(phone, ' ',''), '-',''), '+','') LIKE ? OR REPLACE(REPLACE(REPLACE(phone, ' ',''), '-',''), '+','') LIKE ?)
       LIMIT 1`,
      [userId, `%${normalized}`, `%${normalized.slice(-10)}`]
    );
    if (!rows[0]) return null;
    const raw = rows[0].context_memory;
    let memory: LeadContextMemory;
    try {
      memory = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { ...DEFAULT_MEMORY };
    } catch {
      memory = { ...DEFAULT_MEMORY };
    }
    return { clientId: rows[0].id, memory };
  }

  // ─── Update memory via AI ─────────────────────────────────────────────────

  async updateMemoryFromMessage(
    userId: string,
    phone: string,
    newMessage: string,
    direction: "inbound" | "outbound"
  ): Promise<void> {
    try {
      await this.ensureColumns();

      const result = await this.getMemoryByPhone(userId, phone);
      if (!result) return; // Client not found — skip silently

      const { clientId, memory } = result;
      const currentVersion = memory.memory_version || 0;

      const prompt = this.buildUpdatePrompt(memory, newMessage, direction);

      let updatedMemory: LeadContextMemory;
      try {
        const aiResult = await this.model.generateContent(prompt);
        const text: string = aiResult.response.text().trim();

        // Extract JSON from response (Gemini may wrap it in markdown)
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        const parsed = JSON.parse(jsonStr);
        updatedMemory = { ...DEFAULT_MEMORY, ...memory, ...parsed };
      } catch (aiErr: any) {
        // If AI fails, at minimum update last_interaction_at
        logger.warn(`[MemoryEngine] AI update failed for ${phone}: ${aiErr.message}`);
        updatedMemory = {
          ...memory,
          last_topic: direction === "inbound" ? newMessage.slice(0, 120) : memory.last_topic,
          last_interaction_at: new Date().toISOString(),
        };
      }

      updatedMemory.memory_version = currentVersion + 1;
      updatedMemory.last_interaction_at = new Date().toISOString();

      const pool = getPool();
      await pool.execute(
        "UPDATE clients SET context_memory = ?, memory_updated_at = NOW(), memory_version = ? WHERE id = ?",
        [JSON.stringify(updatedMemory), updatedMemory.memory_version, clientId]
      );
    } catch (err: any) {
      logger.error(`[MemoryEngine] updateMemoryFromMessage error for ${phone}: ${err.message}`);
    }
  }

  // ─── Direct update (from route/manual) ───────────────────────────────────

  async saveMemory(clientId: string, memory: Partial<LeadContextMemory>): Promise<void> {
    await this.ensureColumns();
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT context_memory, memory_version FROM clients WHERE id = ? LIMIT 1",
      [clientId]
    );
    if (!rows[0]) throw new Error("Client not found");
    const current: LeadContextMemory = (() => {
      try {
        const raw = rows[0].context_memory;
        return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { ...DEFAULT_MEMORY };
      } catch { return { ...DEFAULT_MEMORY }; }
    })();
    const merged: LeadContextMemory = {
      ...DEFAULT_MEMORY,
      ...current,
      ...memory,
      memory_version: (current.memory_version || 0) + 1,
      last_interaction_at: new Date().toISOString(),
    };
    await pool.execute(
      "UPDATE clients SET context_memory = ?, memory_updated_at = NOW(), memory_version = ? WHERE id = ?",
      [JSON.stringify(merged), merged.memory_version, clientId]
    );
  }

  async resetMemory(clientId: string): Promise<void> {
    await this.ensureColumns();
    const pool = getPool();
    const fresh: LeadContextMemory = { ...DEFAULT_MEMORY, last_interaction_at: new Date().toISOString() };
    await pool.execute(
      "UPDATE clients SET context_memory = ?, memory_updated_at = NOW(), memory_version = 0 WHERE id = ?",
      [JSON.stringify(fresh), clientId]
    );
  }

  // ─── Build prompt context string (for injection into AI prompts) ──────────

  buildPromptContext(memory: LeadContextMemory): string {
    if (!memory || !memory.conversation_summary) return "";

    const lines: string[] = ["=== CONTEXTO DO LEAD (Memória Persistente) ==="];

    if (memory.profile?.nome) lines.push(`Nome: ${memory.profile.nome}`);
    if (memory.profile?.empresa) lines.push(`Empresa: ${memory.profile.empresa}`);
    if (memory.profile?.segmento) lines.push(`Segmento: ${memory.profile.segmento}`);
    if (memory.profile?.cidade) lines.push(`Cidade: ${memory.profile.cidade}`);

    if (memory.conversation_summary) {
      lines.push(`\nResumo da conversa: ${memory.conversation_summary}`);
    }

    if (memory.intent_stage) {
      const stageLabels: Record<string, string> = {
        descoberta: "Descoberta",
        interesse: "Interesse",
        consideracao: "Consideração",
        decisao: "Decisão",
        pos_venda: "Pós-venda",
        inativo: "Inativo",
      };
      lines.push(`Estágio: ${stageLabels[memory.intent_stage] || memory.intent_stage}`);
    }

    if (memory.pain_points?.length) {
      lines.push(`Dores identificadas: ${memory.pain_points.join(", ")}`);
    }

    if (memory.objections?.length) {
      lines.push(`Objeções: ${memory.objections.join(", ")}`);
    }

    if (memory.last_topic) {
      lines.push(`Último assunto: ${memory.last_topic}`);
    }

    if (memory.sentiment && memory.sentiment !== "desconhecido") {
      lines.push(`Sentimento atual: ${memory.sentiment}`);
    }

    if (memory.preferences && Object.keys(memory.preferences).length > 0) {
      const prefs = Object.entries(memory.preferences).map(([k, v]) => `${k}: ${v}`).join(", ");
      lines.push(`Preferências: ${prefs}`);
    }

    lines.push("=============================================");
    return lines.join("\n");
  }

  // ─── Internal: build AI prompt for memory update ──────────────────────────

  private buildUpdatePrompt(current: LeadContextMemory, newMessage: string, direction: "inbound" | "outbound"): string {
    const currentJson = JSON.stringify(current, null, 2);
    const dirLabel = direction === "inbound" ? "Lead disse" : "Sistema/vendedor disse";

    return `Você é um motor de memória contextual de CRM inteligente.

Sua tarefa: atualizar o contexto do lead com base na nova mensagem recebida.

REGRAS:
- Preserve todas as informações já presentes no contexto atual
- Apenas refine ou adicione informações com base na nova mensagem
- Não apague dados anteriores a menos que sejam contraditos
- Mantenha os campos existentes mesmo que não sejam mencionados na nova mensagem
- Retorne APENAS um JSON válido, sem markdown, sem explicações
- O JSON deve ter exatamente esta estrutura:
{
  "profile": { "nome": "", "cidade": "", "segmento": "", "empresa": "" },
  "conversation_summary": "resumo cumulativo em 2-3 frases",
  "intent_stage": "descoberta|interesse|consideracao|decisao|pos_venda|inativo",
  "pain_points": ["..."],
  "objections": ["..."],
  "preferences": { "chave": "valor" },
  "topics_discussed": ["..."],
  "sentiment": "positivo|neutro|negativo|desconhecido",
  "last_topic": "último assunto discutido"
}

CONTEXTO ATUAL DO LEAD:
${currentJson}

NOVA MENSAGEM (${dirLabel}):
"${newMessage}"

Retorne o JSON atualizado:`;
  }
}

// Singleton
export const memoryEngine = new MemoryEngineService();
