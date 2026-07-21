/**
 * Feedback de captação → filtro → resultado.
 * Cada recusa/acerto grava contexto (busca, tipo, vertical) para aprendizado futuro.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";

let schemaReady = false;

export type CaptureFeedbackEvent =
  | "pool_skip"
  | "not_matching"
  | "channel_unavailable"
  | "lost"
  | "replied"
  | "negotiating"
  | "sent"
  | "convert"
  | "claim";

export type CaptureFeedbackPolarity = "positive" | "negative" | "neutral";

function polarityOf(event: CaptureFeedbackEvent): CaptureFeedbackPolarity {
  if (event === "replied" || event === "negotiating" || event === "convert" || event === "claim") {
    return "positive";
  }
  if (
    event === "not_matching"
    || event === "pool_skip"
    || event === "channel_unavailable"
    || event === "lost"
  ) {
    return "negative";
  }
  return "neutral";
}

export async function ensureCaptureFeedbackSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS capture_feedback_events (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NULL,
      event VARCHAR(40) NOT NULL,
      polarity VARCHAR(16) NOT NULL,
      search_query VARCHAR(80) NULL,
      place_type VARCHAR(80) NULL,
      vertical VARCHAR(80) NULL,
      niche VARCHAR(80) NULL,
      prospect_name VARCHAR(200) NULL,
      ref_type VARCHAR(30) NULL,
      ref_id VARCHAR(36) NULL,
      reason VARCHAR(120) NULL,
      note TEXT NULL,
      metadata_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => undefined);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_capture_fb_brand_event
     ON capture_feedback_events (brand_id, event, created_at)`,
  ).catch(() => undefined);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_capture_fb_brand_vertical
     ON capture_feedback_events (brand_id, vertical, polarity)`,
  ).catch(() => undefined);
  schemaReady = true;
}

export async function recordCaptureFeedback(input: {
  ownerUserId: string;
  brandId: string;
  affiliateId?: string | null;
  event: CaptureFeedbackEvent;
  search_query?: string | null;
  place_type?: string | null;
  vertical?: string | null;
  niche?: string | null;
  prospect_name?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
  reason?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureCaptureFeedbackSchema();
  const polarity = polarityOf(input.event);
  await query(
    `INSERT INTO capture_feedback_events
     (id, owner_user_id, brand_id, affiliate_id, event, polarity,
      search_query, place_type, vertical, niche, prospect_name,
      ref_type, ref_id, reason, note, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.ownerUserId,
      input.brandId,
      input.affiliateId || null,
      input.event,
      polarity,
      input.search_query || null,
      input.place_type || null,
      input.vertical || null,
      input.niche || null,
      input.prospect_name ? String(input.prospect_name).slice(0, 200) : null,
      input.ref_type || null,
      input.ref_id || null,
      input.reason ? String(input.reason).slice(0, 120) : null,
      input.note ? String(input.note).slice(0, 1000) : null,
      input.metadata ? JSON.stringify(input.metadata).slice(0, 4000) : null,
    ],
  ).catch((e) => {
    console.warn("[captureFeedback] insert failed:", (e as Error)?.message || e);
  });
}

/** Resumo simples: top verticais positivas vs negativas (para UI futura). */
export async function summarizeCaptureFeedback(
  brandId: string,
  days = 30,
): Promise<{
  positive_verticals: Array<{ vertical: string; count: number }>;
  negative_verticals: Array<{ vertical: string; count: number }>;
  negative_place_types: Array<{ place_type: string; count: number }>;
}> {
  await ensureCaptureFeedbackSchema();
  const pos = await query<any[]>(
    `SELECT vertical, COUNT(*) AS c FROM capture_feedback_events
     WHERE brand_id = ? AND polarity = 'positive' AND vertical IS NOT NULL
       AND created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
     GROUP BY vertical ORDER BY c DESC LIMIT 10`,
    [brandId, days],
  ).catch(() => []);
  const neg = await query<any[]>(
    `SELECT vertical, COUNT(*) AS c FROM capture_feedback_events
     WHERE brand_id = ? AND polarity = 'negative' AND vertical IS NOT NULL
       AND created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
     GROUP BY vertical ORDER BY c DESC LIMIT 10`,
    [brandId, days],
  ).catch(() => []);
  const negTypes = await query<any[]>(
    `SELECT place_type, COUNT(*) AS c FROM capture_feedback_events
     WHERE brand_id = ? AND polarity = 'negative' AND place_type IS NOT NULL
       AND created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
     GROUP BY place_type ORDER BY c DESC LIMIT 15`,
    [brandId, days],
  ).catch(() => []);

  return {
    positive_verticals: (pos || []).map((r) => ({ vertical: String(r.vertical), count: Number(r.c || 0) })),
    negative_verticals: (neg || []).map((r) => ({ vertical: String(r.vertical), count: Number(r.c || 0) })),
    negative_place_types: (negTypes || []).map((r) => ({
      place_type: String(r.place_type),
      count: Number(r.c || 0),
    })),
  };
}

export async function getFeedbackHintsForBrand(brandId: string): Promise<{
  prefer_searches: string[];
  avoid_place_types: string[];
}> {
  const s = await summarizeCaptureFeedback(brandId, 45);
  return {
    prefer_searches: s.positive_verticals.map((v) => v.vertical).slice(0, 5),
    avoid_place_types: s.negative_place_types
      .filter((t) => t.count >= 2)
      .map((t) => t.place_type)
      .slice(0, 8),
  };
}

// silence unused if tree-shaken
void queryOne;
