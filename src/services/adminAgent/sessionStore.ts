import { randomUUID } from "crypto";
import { query, queryOne, update } from "../../config/database";
import { logger } from "../../utils/logger";
import type { AgentTurn, SkillContext } from "./types";

export type AdminAgentSessionRow = {
  id: string;
  user_id: string;
  brand_id: string;
  title: string | null;
  current_path: string | null;
  pending_context: SkillContext | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  summary: string | null;
  summary_message_count: number;
  is_pinned: boolean;
};

export type AdminAgentMessageRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  turn_json: AgentTurn | null;
  skill: string | null;
  created_at: string;
};

export type AdminAgentMemory = {
  facts: string[];
  preferences: Record<string, string>;
  last_topics: string[];
  turn_count: number;
};

export const EMPTY_MEMORY: AdminAgentMemory = {
  facts: [],
  preferences: {},
  last_topics: [],
  turn_count: 0,
};

export class AdminAgentSessionStore {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;
    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_agent_sessions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          title VARCHAR(200),
          current_path VARCHAR(200),
          pending_context TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_message_at TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS admin_agent_messages (
          id VARCHAR(36) PRIMARY KEY,
          session_id VARCHAR(36) NOT NULL,
          role VARCHAR(16) NOT NULL,
          content TEXT NOT NULL,
          turn_json TEXT,
          skill VARCHAR(80),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS admin_agent_memory (
          session_id VARCHAR(36) PRIMARY KEY,
          memory_json TEXT NOT NULL DEFAULT '{}',
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS admin_agent_brand_memory (
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          memory_json TEXT NOT NULL DEFAULT '{}',
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, brand_id)
        )
      `);
      try {
        await query(`ALTER TABLE admin_agent_sessions ADD COLUMN summary TEXT`);
      } catch { /* column exists */ }
      try {
        await query(`ALTER TABLE admin_agent_sessions ADD COLUMN summary_message_count INTEGER DEFAULT 0`);
      } catch { /* column exists */ }
      try {
        await query(`ALTER TABLE admin_agent_sessions ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE`);
      } catch { /* column exists */ }
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_admin_agent_sessions_user_brand ON admin_agent_sessions (user_id, brand_id, updated_at DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_admin_agent_messages_session ON admin_agent_messages (session_id, created_at ASC)`);
      } catch {
        /* index may already exist */
      }
      this.schemaReady = true;
    })().catch((e) => {
      this.schemaPromise = null;
      logger.warn(`admin_agent schema ensure failed: ${e?.message || e}`);
      throw e;
    });
    return this.schemaPromise;
  }

  private parseJson<T>(raw: unknown, fallback: T): T {
    if (!raw) return fallback;
    if (typeof raw === "object") return raw as T;
    try {
      return JSON.parse(String(raw)) as T;
    } catch {
      return fallback;
    }
  }

  async purgeEmptySessions(userId: string, brandId: string): Promise<number> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT s.id FROM admin_agent_sessions s
       WHERE s.user_id = ? AND s.brand_id = ?
         AND s.last_message_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM admin_agent_messages m WHERE m.session_id = s.id
         )`,
      [userId, brandId],
    );
    const ids = (rows || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) return 0;
    for (const id of ids) {
      await query(`DELETE FROM admin_agent_memory WHERE session_id = ?`, [id]);
      await query(`DELETE FROM admin_agent_sessions WHERE id = ?`, [id]);
    }
    return ids.length;
  }

  async normalizeSingleActive(userId: string, brandId: string): Promise<void> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT id FROM admin_agent_sessions
       WHERE user_id = ? AND brand_id = ? AND is_active = TRUE
       ORDER BY COALESCE(last_message_at, updated_at) DESC, updated_at DESC`,
      [userId, brandId],
    );
    if (!rows || rows.length <= 1) return;
    const keepId = rows[0].id;
    await update(
      `UPDATE admin_agent_sessions
       SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = ? AND brand_id = ? AND id != ?`,
      [userId, brandId, keepId],
    );
  }

  async getActiveSession(userId: string, brandId: string): Promise<AdminAgentSessionRow | null> {
    await this.ensureSchema();
    await this.purgeEmptySessions(userId, brandId);
    await this.normalizeSingleActive(userId, brandId);
    const existing = await queryOne<any>(
      `SELECT * FROM admin_agent_sessions
       WHERE user_id = ? AND brand_id = ? AND is_active = TRUE
       ORDER BY COALESCE(last_message_at, updated_at) DESC, updated_at DESC
       LIMIT 1`,
      [userId, brandId],
    );
    return existing ? this.mapSession(existing) : null;
  }

  async getOrCreateActiveSession(
    userId: string,
    brandId: string,
    currentPath?: string,
  ): Promise<AdminAgentSessionRow> {
    await this.ensureSchema();
    const active = await this.getActiveSession(userId, brandId);
    if (active) {
      if (currentPath) {
        await update(
          `UPDATE admin_agent_sessions SET current_path = COALESCE(?, current_path), updated_at = NOW() WHERE id = ?`,
          [currentPath.slice(0, 200), active.id],
        );
      }
      return (await this.getSession(active.id, userId, brandId)) || active;
    }

    const reusable = await queryOne<any>(
      `SELECT * FROM admin_agent_sessions
       WHERE user_id = ? AND brand_id = ? AND last_message_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, brandId],
    );
    if (reusable) {
      await this.activateSession(reusable.id, userId, brandId);
      const row = await this.getSession(reusable.id, userId, brandId);
      if (row) return row;
    }

    return this.createSession(userId, brandId, { currentPath, activate: true });
  }

  async createSession(
    userId: string,
    brandId: string,
    opts?: { title?: string; currentPath?: string; activate?: boolean },
  ): Promise<AdminAgentSessionRow> {
    await this.ensureSchema();
    await this.purgeEmptySessions(userId, brandId);
    const id = randomUUID();
    const activate = opts?.activate !== false;
    if (activate) {
      await update(
        `UPDATE admin_agent_sessions SET is_active = FALSE, updated_at = NOW() WHERE user_id = ? AND brand_id = ?`,
        [userId, brandId],
      );
    }
    await query(
      `INSERT INTO admin_agent_sessions
       (id, user_id, brand_id, title, current_path, is_active, last_message_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        userId,
        brandId,
        opts?.title?.slice(0, 200) || null,
        opts?.currentPath?.slice(0, 200) || null,
        activate,
      ],
    );
    await query(
      `INSERT INTO admin_agent_memory (session_id, memory_json) VALUES (?, ?)`,
      [id, JSON.stringify(EMPTY_MEMORY)],
    );
    const row = await queryOne<any>(`SELECT * FROM admin_agent_sessions WHERE id = ? LIMIT 1`, [id]);
    return this.mapSession(row);
  }

  async listSessions(userId: string, brandId: string, limit = 20): Promise<AdminAgentSessionRow[]> {
    await this.ensureSchema();
    await this.purgeEmptySessions(userId, brandId);
    await this.normalizeSingleActive(userId, brandId);
    const rows = await query<any[]>(
      `SELECT * FROM admin_agent_sessions
       WHERE user_id = ? AND brand_id = ?
         AND last_message_at IS NOT NULL
       ORDER BY is_pinned DESC, COALESCE(last_message_at, updated_at) DESC
       LIMIT ?`,
      [userId, brandId, limit],
    );
    return (rows || []).map((r) => this.mapSession(r));
  }

  async togglePinSession(
    sessionId: string,
    userId: string,
    brandId: string,
  ): Promise<AdminAgentSessionRow | null> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return null;
    await update(
      `UPDATE admin_agent_sessions SET is_pinned = ?, updated_at = NOW() WHERE id = ?`,
      [!session.is_pinned, sessionId],
    );
    return this.getSession(sessionId, userId, brandId);
  }

  async getSession(sessionId: string, userId: string, brandId: string): Promise<AdminAgentSessionRow | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM admin_agent_sessions WHERE id = ? AND user_id = ? AND brand_id = ? LIMIT 1`,
      [sessionId, userId, brandId],
    );
    return row ? this.mapSession(row) : null;
  }

  async activateSession(sessionId: string, userId: string, brandId: string): Promise<AdminAgentSessionRow | null> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return null;
    await update(
      `UPDATE admin_agent_sessions SET is_active = FALSE, updated_at = NOW() WHERE user_id = ? AND brand_id = ?`,
      [userId, brandId],
    );
    await update(
      `UPDATE admin_agent_sessions SET is_active = TRUE, updated_at = NOW() WHERE id = ?`,
      [sessionId],
    );
    return this.getSession(sessionId, userId, brandId);
  }

  async saveSessionSummary(
    sessionId: string,
    userId: string,
    brandId: string,
    summary: string,
    messageCount: number,
  ): Promise<void> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return;
    await update(
      `UPDATE admin_agent_sessions
       SET summary = ?, summary_message_count = ?, updated_at = NOW()
       WHERE id = ?`,
      [summary.slice(0, 4000), Math.max(0, messageCount), sessionId],
    );
  }

  async getMessages(sessionId: string, userId: string, brandId: string, limit = 80): Promise<AdminAgentMessageRow[]> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return [];
    const rows = await query<any[]>(
      `SELECT * FROM admin_agent_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?`,
      [sessionId, limit],
    );
    return (rows || []).map((r) => ({
      id: r.id,
      session_id: r.session_id,
      role: r.role,
      content: r.content,
      turn_json: this.parseJson<AgentTurn | null>(r.turn_json, null),
      skill: r.skill || null,
      created_at: r.created_at,
    }));
  }

  async appendExchange(
    sessionId: string,
    userId: string,
    brandId: string,
    input: {
      userContent?: string;
      turn?: AgentTurn;
      pendingContext?: SkillContext;
      currentPath?: string;
      titleHint?: string;
    },
  ): Promise<void> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) throw new Error("Session not found");

    const userContent = String(input.userContent || "").trim();
    if (userContent) {
      await query(
        `INSERT INTO admin_agent_messages (id, session_id, role, content, turn_json, skill)
         VALUES (?, ?, 'user', ?, NULL, NULL)`,
        [randomUUID(), sessionId, userContent.slice(0, 4000)],
      );
    }

    if (input.turn) {
      const assistantContent = String(input.turn.message || "").slice(0, 4000);
      await query(
        `INSERT INTO admin_agent_messages (id, session_id, role, content, turn_json, skill)
         VALUES (?, ?, 'assistant', ?, ?, ?)`,
        [
          randomUUID(),
          sessionId,
          assistantContent,
          JSON.stringify(input.turn),
          input.turn.skill || null,
        ],
      );
    }

    const title = session.title
      || (userContent ? userContent.slice(0, 80) : input.turn?.message?.slice(0, 80))
      || null;

    await update(
      `UPDATE admin_agent_sessions
       SET title = COALESCE(title, ?),
           current_path = COALESCE(?, current_path),
           pending_context = ?,
           last_message_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [
        title,
        input.currentPath?.slice(0, 200) || null,
        input.pendingContext ? JSON.stringify(input.pendingContext) : null,
        sessionId,
      ],
    );
  }

  async loadMemory(sessionId: string, userId: string, brandId: string): Promise<AdminAgentMemory> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return { ...EMPTY_MEMORY };
    const row = await queryOne<any>(
      `SELECT memory_json FROM admin_agent_memory WHERE session_id = ? LIMIT 1`,
      [sessionId],
    );
    if (!row) return { ...EMPTY_MEMORY };
    const parsed = this.parseJson<AdminAgentMemory>(row.memory_json, { ...EMPTY_MEMORY });
    return { ...EMPTY_MEMORY, ...parsed };
  }

  async deleteSession(sessionId: string, userId: string, brandId: string): Promise<boolean> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return false;
    const wasActive = session.is_active;
    await query(`DELETE FROM admin_agent_messages WHERE session_id = ?`, [sessionId]);
    await query(`DELETE FROM admin_agent_memory WHERE session_id = ?`, [sessionId]);
    await query(`DELETE FROM admin_agent_sessions WHERE id = ?`, [sessionId]);
    if (wasActive) {
      const next = await queryOne<any>(
        `SELECT id FROM admin_agent_sessions
         WHERE user_id = ? AND brand_id = ? AND last_message_at IS NOT NULL
         ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT 1`,
        [userId, brandId],
      );
      if (next?.id) {
        await this.activateSession(String(next.id), userId, brandId);
      }
    }
    await this.purgeEmptySessions(userId, brandId);
    return true;
  }

  async renameSession(
    sessionId: string,
    userId: string,
    brandId: string,
    title: string,
  ): Promise<AdminAgentSessionRow | null> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return null;
    const nextTitle = String(title || "").trim().slice(0, 200);
    if (!nextTitle) return session;
    await update(
      `UPDATE admin_agent_sessions SET title = ?, updated_at = NOW() WHERE id = ?`,
      [nextTitle, sessionId],
    );
    return this.getSession(sessionId, userId, brandId);
  }

  async loadBrandMemory(userId: string, brandId: string): Promise<AdminAgentMemory> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT memory_json FROM admin_agent_brand_memory WHERE user_id = ? AND brand_id = ? LIMIT 1`,
      [userId, brandId],
    );
    if (!row) return { ...EMPTY_MEMORY };
    const parsed = this.parseJson<AdminAgentMemory>(row.memory_json, { ...EMPTY_MEMORY });
    return { ...EMPTY_MEMORY, ...parsed };
  }

  async saveBrandMemory(userId: string, brandId: string, memory: AdminAgentMemory): Promise<void> {
    await this.ensureSchema();
    const affected = await update(
      `UPDATE admin_agent_brand_memory SET memory_json = ?, updated_at = NOW()
       WHERE user_id = ? AND brand_id = ?`,
      [JSON.stringify(memory), userId, brandId],
    );
    if (!affected) {
      await query(
        `INSERT INTO admin_agent_brand_memory (user_id, brand_id, memory_json) VALUES (?, ?, ?)`,
        [userId, brandId, JSON.stringify(memory)],
      );
    }
  }

  async clearBrandMemory(userId: string, brandId: string): Promise<void> {
    await this.saveBrandMemory(userId, brandId, { ...EMPTY_MEMORY });
  }

  async saveMemory(sessionId: string, userId: string, brandId: string, memory: AdminAgentMemory): Promise<void> {
    const session = await this.getSession(sessionId, userId, brandId);
    if (!session) return;
    const affected = await update(
      `UPDATE admin_agent_memory SET memory_json = ?, updated_at = NOW() WHERE session_id = ?`,
      [JSON.stringify(memory), sessionId],
    );
    if (!affected) {
      await query(
        `INSERT INTO admin_agent_memory (session_id, memory_json) VALUES (?, ?)`,
        [sessionId, JSON.stringify(memory)],
      );
    }
  }

  mapSessionFromRow(row: any): AdminAgentSessionRow {
    return this.mapSession(row);
  }

  private mapSession(row: any): AdminAgentSessionRow {
    return {
      id: row.id,
      user_id: row.user_id,
      brand_id: row.brand_id,
      title: row.title || null,
      current_path: row.current_path || null,
      pending_context: this.parseJson<SkillContext | null>(row.pending_context, null),
      is_active: !!row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_message_at: row.last_message_at || null,
      summary: row.summary || null,
      summary_message_count: Number(row.summary_message_count || 0),
      is_pinned: !!row.is_pinned,
    };
  }
}

export const adminAgentSessionStore = new AdminAgentSessionStore();