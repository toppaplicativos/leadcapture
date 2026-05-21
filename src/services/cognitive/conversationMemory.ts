import { query, queryOne, update } from "../../config/database";
import { logger } from "../../utils/logger";
import { ConversationMemory, EMPTY_MEMORY, EmotionalState, FunnelStage, ReasoningTrace } from "./types";

/**
 * Persistent per-conversation memory.
 * Stores extracted structured facts so the agent doesn't ask the same thing twice
 * and can build context over multiple turns.
 */
export class ConversationMemoryService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;
    this.schemaPromise = (async () => {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS conversation_memory (
            conversation_id TEXT PRIMARY KEY,
            memory_json TEXT NOT NULL DEFAULT '{}',
            turn_count INT NOT NULL DEFAULT 0,
            funnel_stage TEXT NOT NULL DEFAULT 'awareness',
            frustration_score INT NOT NULL DEFAULT 0,
            bot_interaction_score INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.schemaReady = true;
      } catch (e: any) {
        logger.warn(`conversation_memory schema ensure failed: ${e?.message || e}`);
        /* Don't mark as ready so we retry next time */
      }
    })();
    return this.schemaPromise;
  }

  async load(conversationId: string | null | undefined): Promise<ConversationMemory | null> {
    const id = String(conversationId || "").trim();
    if (!id) return null;
    await this.ensureSchema();
    try {
      const row = await queryOne<any>(
        `SELECT memory_json, turn_count, funnel_stage, frustration_score, bot_interaction_score, updated_at
         FROM conversation_memory WHERE conversation_id = ? LIMIT 1`,
        [id]
      );
      if (!row) return EMPTY_MEMORY(id);
      const parsed = this.parseMemoryJson(row.memory_json);
      return {
        ...EMPTY_MEMORY(id),
        ...parsed,
        conversation_id: id,
        turn_count: Number(row.turn_count || 0),
        funnel_stage: (row.funnel_stage || "awareness") as FunnelStage,
        frustration_score: Number(row.frustration_score || 0),
        bot_interaction_score: Number(row.bot_interaction_score || 0),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      };
    } catch (e: any) {
      logger.warn(`conversation_memory load failed: ${e?.message || e}`);
      return EMPTY_MEMORY(id);
    }
  }

  /** Merge a reasoning trace into the persistent memory. */
  async merge(conversationId: string, current: ConversationMemory, trace: ReasoningTrace): Promise<ConversationMemory> {
    const merged: ConversationMemory = {
      ...current,
      conversation_id: conversationId,
      turn_count: current.turn_count + 1,
      mentioned_products: this.dedupe([...current.mentioned_products, ...trace.mentioned_products]),
      preferences: { ...current.preferences },
      objections_history: this.dedupe([...current.objections_history, ...trace.objections_detected]),
      facts_learned: this.dedupe([...current.facts_learned, ...trace.facts_learned_this_turn]).slice(-40),
      funnel_stage: trace.funnel_stage,
      last_emotional_state: trace.emotional_state,
      frustration_score: Math.min(
        10,
        current.frustration_score + (trace.frustration_signals.length > 0 ? 1 : -1)
      ),
      bot_interaction_score: Math.min(
        10,
        current.bot_interaction_score + (trace.bot_interaction_detected ? 1 : 0)
      ),
      updated_at: new Date().toISOString(),
    };
    if (merged.frustration_score < 0) merged.frustration_score = 0;
    return merged;
  }

  async save(memory: ConversationMemory): Promise<void> {
    if (!memory.conversation_id) return;
    await this.ensureSchema();
    try {
      const json = JSON.stringify(memory);
      /* UPSERT via DELETE + INSERT to avoid dialect quirks across MySQL/Postgres */
      const affected = await update(
        `UPDATE conversation_memory
         SET memory_json = ?, turn_count = ?, funnel_stage = ?, frustration_score = ?, bot_interaction_score = ?, updated_at = NOW()
         WHERE conversation_id = ?`,
        [
          json,
          memory.turn_count,
          memory.funnel_stage,
          memory.frustration_score,
          memory.bot_interaction_score,
          memory.conversation_id,
        ]
      );
      if (!affected) {
        await query(
          `INSERT INTO conversation_memory
           (conversation_id, memory_json, turn_count, funnel_stage, frustration_score, bot_interaction_score)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            memory.conversation_id,
            json,
            memory.turn_count,
            memory.funnel_stage,
            memory.frustration_score,
            memory.bot_interaction_score,
          ]
        );
      }
    } catch (e: any) {
      logger.warn(`conversation_memory save failed: ${e?.message || e}`);
    }
  }

  /** Format memory for inclusion in a prompt. Empty string when memory has no useful signal. */
  toPromptBlock(memory: ConversationMemory | null): string {
    if (!memory || memory.turn_count === 0) return "";
    const lines: string[] = ["MEMÓRIA ACUMULADA DESTA CONVERSA (informações já reveladas — NÃO pergunte de novo):"];
    if (memory.customer_name) lines.push(`- nome do cliente: ${memory.customer_name}`);
    if (memory.mentioned_products.length) lines.push(`- produtos já discutidos: ${memory.mentioned_products.slice(-8).join(", ")}`);
    if (memory.objections_history.length) lines.push(`- objeções já levantadas: ${memory.objections_history.slice(-5).join(" | ")}`);
    const prefEntries = Object.entries(memory.preferences);
    if (prefEntries.length) {
      lines.push(`- preferências reveladas: ${prefEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
    if (memory.facts_learned.length) lines.push(`- fatos relevantes: ${memory.facts_learned.slice(-10).join(" | ")}`);
    lines.push(`- estágio do funil: ${memory.funnel_stage} | turn nº ${memory.turn_count} | última emoção: ${memory.last_emotional_state}`);
    if (memory.frustration_score >= 3) {
      lines.push(`- ALERTA: nível de frustração acumulado = ${memory.frustration_score}/10. Demonstre empatia ativa.`);
    }
    if (memory.bot_interaction_score >= 2) {
      lines.push(`- ALERTA: cliente foi exposto a respostas automáticas anteriormente (${memory.bot_interaction_score} sinais). Eleve naturalidade e contextualização.`);
    }
    return lines.join("\n");
  }

  private dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      const k = String(v || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(String(v).trim());
    }
    return out;
  }

  private parseMemoryJson(value: unknown): Partial<ConversationMemory> {
    if (!value) return {};
    if (typeof value === "object") return value as Partial<ConversationMemory>;
    try {
      return JSON.parse(String(value)) as Partial<ConversationMemory>;
    } catch {
      return {};
    }
  }

  /** Bump the emotional state explicitly (used by external signals like manual takeover). */
  emotionalStateFromTrace(trace: ReasoningTrace): EmotionalState {
    return trace.emotional_state;
  }
}

export const conversationMemoryService = new ConversationMemoryService();
