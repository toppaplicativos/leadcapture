/**
 * Silence Log (Fase 16.3)
 *
 * Records EVERY decision by ResponseGate to NOT respond. Gives the operator
 * visibility into what the agent is ignoring — critical for tuning. Without
 * this, "the agent didn't reply" looks like a bug rather than a deliberate
 * choice.
 *
 * Append-only. GC keeps only the last 30 days (no operator needs older).
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../../config/database";
import { logger } from "../../utils/logger";

export interface SilenceRecord {
  id: string;
  conversation_id: string | null;
  brand_id: string | null;
  message_type: string;
  message_preview: string;
  reason_code: string;
  reason_human: string;
  confidence: number;
  decided_at: string;
}

class SilenceLogService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) { await this.schemaPromise; return; }
    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS agent_silence_log (
          id VARCHAR(36) PRIMARY KEY,
          conversation_id VARCHAR(64) NULL,
          brand_id VARCHAR(36) NULL,
          message_type VARCHAR(40) NOT NULL DEFAULT 'text',
          message_preview VARCHAR(200) NOT NULL DEFAULT '',
          reason_code VARCHAR(40) NOT NULL,
          reason_human TEXT NULL,
          confidence REAL NOT NULL DEFAULT 0,
          decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_silence_brand_decided ON agent_silence_log (brand_id, decided_at DESC)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_silence_conv ON agent_silence_log (conversation_id, decided_at DESC)`).catch(() => {});
      this.schemaReady = true;
    })().finally(() => { this.schemaPromise = null; });
    await this.schemaPromise;
  }

  /** Best-effort write — never throw to the caller; gate's decision is the source of truth. */
  async record(input: {
    conversationId?: string | null;
    brandId?: string | null;
    messageType: string;
    incomingMessage: string;
    reasonCode: string;
    reasonHuman: string;
    confidence: number;
  }): Promise<void> {
    try {
      await this.ensureSchema();
      await query(
        `INSERT INTO agent_silence_log
          (id, conversation_id, brand_id, message_type, message_preview,
           reason_code, reason_human, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.conversationId || null,
          input.brandId || null,
          input.messageType,
          String(input.incomingMessage || "").slice(0, 200),
          input.reasonCode,
          input.reasonHuman,
          Number(input.confidence) || 0,
        ]
      );
    } catch (e: any) {
      logger.warn(`[silenceLog] record failed: ${e?.message || e}`);
    }
  }

  async listForBrand(brandId: string | null, limit = 100): Promise<SilenceRecord[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT id, conversation_id, brand_id, message_type, message_preview,
              reason_code, reason_human, confidence, decided_at
         FROM agent_silence_log
        WHERE COALESCE(brand_id,'') = COALESCE(?,'')
        ORDER BY decided_at DESC
        LIMIT ?`,
      [brandId || null, limit]
    );
    return (rows || []).map((r) => ({
      id: String(r.id),
      conversation_id: r.conversation_id || null,
      brand_id: r.brand_id || null,
      message_type: r.message_type,
      message_preview: r.message_preview || "",
      reason_code: r.reason_code,
      reason_human: r.reason_human || "",
      confidence: Number(r.confidence || 0),
      decided_at: r.decided_at ? new Date(r.decided_at).toISOString() : "",
    }));
  }

  async statsByReason(brandId: string | null, daysBack = 7): Promise<Array<{ reason_code: string; count: number }>> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT reason_code, COUNT(*)::int AS n
         FROM agent_silence_log
        WHERE COALESCE(brand_id,'') = COALESCE(?,'')
          AND decided_at > NOW() - INTERVAL '${Math.max(1, Math.min(90, daysBack))} days'
        GROUP BY reason_code
        ORDER BY n DESC`,
      [brandId || null]
    );
    return (rows || []).map((r) => ({ reason_code: r.reason_code, count: Number(r.n) }));
  }

  /** GC — drops rows older than 30 days. Call from a cron or on startup. */
  async pruneOld(daysToKeep = 30): Promise<number> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `DELETE FROM agent_silence_log WHERE decided_at < NOW() - INTERVAL '${Math.max(1, daysToKeep)} days' RETURNING id`,
      []
    );
    return (rows || []).length;
  }
}

export const silenceLogService = new SilenceLogService();
