/**
 * Data Provenance (Fase 15)
 *
 * Records WHERE every captured lead came from. Two use cases:
 *
 *   1. LGPD defense — if a person/business claims "I never gave you my data",
 *      we can show exactly which public source (Google Maps query X on date Y,
 *      returning URL Z) the record came from. Required to invoke art. 7º IX
 *      (legitimate interest in publicly-available data) as legal basis.
 *
 *   2. Source quality analytics — which scrape source produced leads that
 *      actually converted vs which is mostly noise.
 *
 * Append-only. Never deleted (audit). When a lead is removed via opt-out,
 * the audit rows stay so we have proof of the original capture + the removal.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type CaptureSource =
  | "google_maps"
  | "google_search"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "csv_import"
  | "manual_entry"
  | "api_external"
  | "whatsapp_inbox"
  | "unknown";

export interface CaptureRecord {
  id: string;
  lead_ref_table: string;          // "clients" | "customers" | "companies"
  lead_ref_id: string;
  source: CaptureSource;
  source_query: string | null;     // e.g. "padaria zona sul são paulo"
  source_url: string | null;       // e.g. https://maps.google.com/place/...
  captured_at: string;
  captured_by: string | null;      // user_id
  brand_id: string | null;
  raw_response: Record<string, any> | null;
}

class DataProvenanceService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) { await this.schemaPromise; return; }

    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS lead_source_audit (
          id VARCHAR(36) PRIMARY KEY,
          lead_ref_table VARCHAR(40) NOT NULL,
          lead_ref_id VARCHAR(64) NOT NULL,
          source VARCHAR(40) NOT NULL,
          source_query TEXT NULL,
          source_url TEXT NULL,
          captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          captured_by VARCHAR(36) NULL,
          brand_id VARCHAR(36) NULL,
          raw_response_json JSONB NULL DEFAULT '{}'
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_audit_lead ON lead_source_audit (lead_ref_table, lead_ref_id)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_audit_brand_date ON lead_source_audit (brand_id, captured_at DESC)`).catch(() => {});
      await query(`CREATE INDEX IF NOT EXISTS idx_audit_source ON lead_source_audit (source, captured_at DESC)`).catch(() => {});
      this.schemaReady = true;
    })().finally(() => { this.schemaPromise = null; });

    await this.schemaPromise;
  }

  /**
   * Record a capture. Best-effort: failures are logged, never thrown — we
   * don't want a provenance write to break the lead creation flow.
   */
  async recordCapture(input: {
    leadRefTable: "clients" | "customers" | "companies";
    leadRefId: string;
    source: CaptureSource;
    sourceQuery?: string | null;
    sourceUrl?: string | null;
    capturedBy?: string | null;
    brandId?: string | null;
    rawResponse?: Record<string, any> | null;
  }): Promise<void> {
    try {
      await this.ensureSchema();
      await query(
        `INSERT INTO lead_source_audit
          (id, lead_ref_table, lead_ref_id, source, source_query, source_url,
           captured_by, brand_id, raw_response_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
        [
          randomUUID(),
          input.leadRefTable,
          input.leadRefId,
          input.source,
          input.sourceQuery || null,
          input.sourceUrl || null,
          input.capturedBy || null,
          input.brandId || null,
          JSON.stringify(input.rawResponse || {}),
        ]
      );
    } catch (e: any) {
      logger.warn(`[provenance] recordCapture failed: ${e?.message || e}`);
    }
  }

  async listForLead(leadRefTable: string, leadRefId: string): Promise<CaptureRecord[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT id, lead_ref_table, lead_ref_id, source, source_query, source_url,
              captured_at, captured_by, brand_id, raw_response_json
         FROM lead_source_audit
        WHERE lead_ref_table = ? AND lead_ref_id = ?
        ORDER BY captured_at DESC`,
      [leadRefTable, leadRefId]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      lead_ref_table: r.lead_ref_table,
      lead_ref_id: r.lead_ref_id,
      source: r.source,
      source_query: r.source_query,
      source_url: r.source_url,
      captured_at: r.captured_at ? new Date(r.captured_at).toISOString() : "",
      captured_by: r.captured_by,
      brand_id: r.brand_id,
      raw_response: r.raw_response_json || null,
    }));
  }

  /**
   * Aggregate stats per source for the admin dashboard / brand owner.
   */
  async getSourceStats(brandId?: string | null): Promise<Array<{ source: string; count: number; last_at: string }>> {
    await this.ensureSchema();
    const params: any[] = [];
    let where = "";
    if (brandId) { where = "WHERE COALESCE(brand_id,'') = COALESCE(?,'')"; params.push(brandId); }
    const rows = await query<any[]>(
      `SELECT source, COUNT(*)::int AS n, MAX(captured_at) AS last_at
         FROM lead_source_audit ${where}
        GROUP BY source ORDER BY n DESC`,
      params
    );
    return (rows || []).map((r) => ({
      source: r.source,
      count: Number(r.n),
      last_at: r.last_at ? new Date(r.last_at).toISOString() : "",
    }));
  }
}

export const dataProvenanceService = new DataProvenanceService();
