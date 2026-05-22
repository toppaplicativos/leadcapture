/**
 * LGPD Opt-Out (Fase 15)
 *
 * Permanent block list. When a person/business asks not to be in our database,
 * we (a) delete their existing records and (b) prevent any future scrape from
 * re-creating them. This is "direito de oposição" (LGPD art. 18, IV).
 *
 * Key design:
 *   - Phone + email are normalized BEFORE compare (strip non-digits / lowercase).
 *   - One row per (phone) or (email) — partial unique indexes.
 *   - Every capture flow MUST call `isOptedOut(phone, email)` before INSERT.
 *
 * The opt-out is GLOBAL (not per-brand). Reason: a person asked once, we honor
 * everywhere. Bigger UX risk than legal — but the spirit of LGPD is "the data
 * subject controls", not "the data subject has to opt out 100 times".
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export interface OptOutRecord {
  id: string;
  phone_normalized: string | null;
  email_normalized: string | null;
  reason: string | null;
  requested_at: string;
  confirmed_at: string | null;
  ip: string | null;
  user_agent: string | null;
  source: "public_form" | "admin" | "email_unsubscribe" | "whatsapp_command";
  removed_records_count: number;
}

export interface RemovalSummary {
  clients: number;
  customers: number;
  companies: number;
  total: number;
}

/* ─── helpers ─── */

export function normalizePhone(input: unknown): string {
  return String(input || "").replace(/\D/g, "");
}

export function normalizeEmail(input: unknown): string {
  return String(input || "").trim().toLowerCase();
}

class LgpdOptoutService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) { await this.schemaPromise; return; }

    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS lgpd_optouts (
          id VARCHAR(36) PRIMARY KEY,
          phone_normalized VARCHAR(40) NULL,
          email_normalized VARCHAR(190) NULL,
          reason TEXT NULL,
          requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TIMESTAMP NULL,
          ip VARCHAR(64) NULL,
          user_agent TEXT NULL,
          source VARCHAR(40) NOT NULL DEFAULT 'public_form',
          removed_records_count INTEGER NOT NULL DEFAULT 0,
          metadata_json JSONB NOT NULL DEFAULT '{}'
        )
      `);
      /* Partial unique indexes: we can have many rows where phone is null,
       * but only one where phone = '11999998888'. Same for email. */
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_optouts_phone
          ON lgpd_optouts (phone_normalized)
          WHERE phone_normalized IS NOT NULL AND phone_normalized <> ''
      `).catch(() => {});
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_optouts_email
          ON lgpd_optouts (email_normalized)
          WHERE email_normalized IS NOT NULL AND email_normalized <> ''
      `).catch(() => {});

      this.schemaReady = true;
    })().finally(() => { this.schemaPromise = null; });

    await this.schemaPromise;
  }

  /**
   * The critical check — call from every capture flow BEFORE INSERT.
   * Returns true if either phone or email is on the block list.
   * Fail-open on DB error (don't block legit captures because of a hiccup),
   * but log loudly.
   */
  async isOptedOut(phone?: unknown, email?: unknown): Promise<boolean> {
    try {
      await this.ensureSchema();
      const p = normalizePhone(phone);
      const e = normalizeEmail(email);
      if (!p && !e) return false;
      const conditions: string[] = [];
      const params: any[] = [];
      if (p) { conditions.push("phone_normalized = ?"); params.push(p); }
      if (e) { conditions.push("email_normalized = ?"); params.push(e); }
      const row = await queryOne<any>(
        `SELECT 1 FROM lgpd_optouts WHERE ${conditions.join(" OR ")} LIMIT 1`,
        params
      );
      return !!row;
    } catch (err: any) {
      logger.warn(`[lgpd_optout] isOptedOut check failed: ${err?.message || err}`);
      return false; // fail-open
    }
  }

  /**
   * Public-facing registration. Always:
   *   1. Insert/upsert the opt-out record
   *   2. Sweep all lead tables and remove matching rows
   *   3. Return how many records were removed
   *
   * Idempotent: calling twice with the same phone is a no-op on the second call.
   */
  async register(input: {
    phone?: string | null;
    email?: string | null;
    reason?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    source?: OptOutRecord["source"];
  }): Promise<{ optoutId: string; alreadyRegistered: boolean; removed: RemovalSummary }> {
    await this.ensureSchema();
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    if (!phone && !email) {
      const err: any = new Error("Informe telefone ou email para registrar opt-out");
      err.code = "OPTOUT_NO_IDENTIFIER";
      throw err;
    }

    /* Check if either identifier already in the block list */
    const existing = await this.findExisting(phone, email);
    let optoutId: string;
    let alreadyRegistered = false;
    if (existing) {
      optoutId = existing.id;
      alreadyRegistered = true;
    } else {
      optoutId = randomUUID();
      await query(
        `INSERT INTO lgpd_optouts
           (id, phone_normalized, email_normalized, reason, ip, user_agent, source, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          optoutId,
          phone || null,
          email || null,
          input.reason ? String(input.reason).trim().slice(0, 500) : null,
          input.ip || null,
          input.userAgent ? String(input.userAgent).slice(0, 500) : null,
          input.source || "public_form",
        ]
      );
    }

    /* Sweep all lead tables — even if already registered, do it again
     * (records may have been re-imported between calls). */
    const removed = await this.removeAllMatching(phone, email);
    if (removed.total > 0) {
      await query(
        `UPDATE lgpd_optouts SET removed_records_count = removed_records_count + ? WHERE id = ?`,
        [removed.total, optoutId]
      );
    }

    logger.info(
      `[lgpd_optout] registered (${alreadyRegistered ? "duplicate" : "new"}) — removed ${removed.total} record(s): clients=${removed.clients} customers=${removed.customers} companies=${removed.companies}`
    );

    return { optoutId, alreadyRegistered, removed };
  }

  private async findExisting(phone: string, email: string): Promise<{ id: string } | null> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (phone) { conditions.push("phone_normalized = ?"); params.push(phone); }
    if (email) { conditions.push("email_normalized = ?"); params.push(email); }
    if (conditions.length === 0) return null;
    return await queryOne<{ id: string }>(
      `SELECT id FROM lgpd_optouts WHERE ${conditions.join(" OR ")} LIMIT 1`,
      params
    );
  }

  /**
   * Delete all rows matching phone OR email across all lead-bearing tables.
   * Each table is tried independently — if one fails (table doesn't exist on
   * this deployment), the rest still run.
   */
  async removeAllMatching(phone: string, email: string): Promise<RemovalSummary> {
    const summary: RemovalSummary = { clients: 0, customers: 0, companies: 0, total: 0 };

    /* Helper that runs a parameterized DELETE and returns the affected row count.
     * Pg uses RETURNING; mysql uses .affectedRows — we standardize via RETURNING id. */
    const sweep = async (table: string): Promise<number> => {
      const conds: string[] = [];
      const params: any[] = [];
      if (phone) {
        /* Match by normalized phone (strip non-digits both sides) */
        conds.push(`REGEXP_REPLACE(COALESCE(phone,''), '\\D', '', 'g') = ?`);
        params.push(phone);
      }
      if (email) {
        conds.push(`LOWER(COALESCE(email,'')) = ?`);
        params.push(email);
      }
      if (conds.length === 0) return 0;
      try {
        const rows = await query<any[]>(
          `DELETE FROM ${table} WHERE ${conds.join(" OR ")} RETURNING id`,
          params
        );
        return (rows || []).length;
      } catch (e: any) {
        logger.warn(`[lgpd_optout] sweep ${table} failed: ${e?.message || e}`);
        return 0;
      }
    };

    summary.clients = await sweep("clients");
    summary.customers = await sweep("customers");
    summary.companies = await sweep("companies");
    summary.total = summary.clients + summary.customers + summary.companies;
    return summary;
  }

  /* ─── admin queries ─── */

  async listAll(limit = 200): Promise<OptOutRecord[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM lgpd_optouts ORDER BY requested_at DESC LIMIT ?`,
      [limit]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  async count(): Promise<number> {
    await this.ensureSchema();
    const r = await queryOne<any>(`SELECT COUNT(*)::int AS n FROM lgpd_optouts`);
    return Number(r?.n || 0);
  }

  private mapRow(row: any): OptOutRecord {
    return {
      id: String(row.id),
      phone_normalized: row.phone_normalized || null,
      email_normalized: row.email_normalized || null,
      reason: row.reason || null,
      requested_at: row.requested_at ? new Date(row.requested_at).toISOString() : "",
      confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      ip: row.ip || null,
      user_agent: row.user_agent || null,
      source: row.source || "public_form",
      removed_records_count: Number(row.removed_records_count || 0),
    };
  }
}

export const lgpdOptoutService = new LgpdOptoutService();
