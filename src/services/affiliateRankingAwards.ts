/**
 * Ranking real de afiliados + premiações (desafios/metas).
 * - Ranking: métricas agregadas (GMV, vendas, comissão, cliques, conversões, claims)
 * - Premiações: campanhas com meta, regras, aceite, elegibilidade, capa e vencedores
 */

import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export type RankPeriod = "all" | "month" | "week" | "30d";
export type ChallengeMetric =
  | "sales_gmv"
  | "sales_kg"
  | "sales_count"
  | "commission"
  | "clicks"
  | "conversions"
  | "claims";
export type ChallengeType = "first_to" | "threshold" | "top_n";
export type ChallengeStatus = "draft" | "active" | "paused" | "ended";

export type LeaderboardEntry = {
  affiliate_id: string;
  display_name: string;
  code: string;
  avatar_url: string | null;
  status: string;
  rank: number;
  score: number;
  sales_gmv: number;
  sales_count: number;
  commission: number;
  clicks: number;
  conversions: number;
  claims: number;
  is_you?: boolean;
};

function periodStart(period: RankPeriod): Date | null {
  const now = new Date();
  if (period === "all") return null;
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  // month: first day of current month
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function periodKey(period: RankPeriod): string {
  if (period === "all") return "all";
  if (period === "week") return "week";
  if (period === "30d") return "30d";
  const now = new Date();
  return `month:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function ensureSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_rank_entries (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        affiliate_id VARCHAR(36) NOT NULL,
        period_key VARCHAR(40) NOT NULL,
        rank_position INT NOT NULL DEFAULT 0,
        score DECIMAL(14,2) NOT NULL DEFAULT 0,
        sales_gmv DECIMAL(14,2) NOT NULL DEFAULT 0,
        sales_count INT NOT NULL DEFAULT 0,
        commission DECIMAL(14,2) NOT NULL DEFAULT 0,
        clicks INT NOT NULL DEFAULT 0,
        conversions INT NOT NULL DEFAULT 0,
        claims INT NOT NULL DEFAULT 0,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (brand_id, affiliate_id, period_key)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_challenges (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        program_id VARCHAR(36) NULL,
        title VARCHAR(180) NOT NULL,
        description TEXT NULL,
        rules_text TEXT NULL,
        cover_url VARCHAR(600) NULL,
        challenge_type VARCHAR(30) NOT NULL DEFAULT 'first_to',
        metric VARCHAR(40) NOT NULL DEFAULT 'sales_gmv',
        target_value DECIMAL(14,2) NOT NULL DEFAULT 1,
        prize_label VARCHAR(200) NULL,
        prize_description TEXT NULL,
        max_winners INT NOT NULL DEFAULT 1,
        requires_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
        eligibility_json TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        starts_at TIMESTAMP NULL,
        ends_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_challenge_enrollments (
        id VARCHAR(36) PRIMARY KEY,
        challenge_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        affiliate_id VARCHAR(36) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'invited',
        accepted_at TIMESTAMP NULL,
        declined_at TIMESTAMP NULL,
        progress_value DECIMAL(14,2) NOT NULL DEFAULT 0,
        progress_updated_at TIMESTAMP NULL,
        is_winner BOOLEAN NOT NULL DEFAULT FALSE,
        won_at TIMESTAMP NULL,
        rank_at_win INT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (challenge_id, affiliate_id)
      )
    `);

    schemaReady = true;
  })().catch((e) => {
    schemaPromise = null;
    throw e;
  });
  return schemaPromise;
}

function parseEligibility(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw || "{}")) || {};
  } catch {
    return {};
  }
}

function scoreFromMetrics(m: {
  sales_gmv: number;
  sales_kg?: number;
  sales_count: number;
  commission: number;
  clicks: number;
  conversions: number;
  claims: number;
}): number {
  // Score composto para desempate e “disputa saudável”:
  // GMV (R$) + kg*8 + comissão*2 + vendas*50 + conversões*40 + claims*15 + cliques*0.1
  return (
    Number(m.sales_gmv || 0) +
    Number(m.sales_kg || 0) * 8 +
    Number(m.commission || 0) * 2 +
    Number(m.sales_count || 0) * 50 +
    Number(m.conversions || 0) * 40 +
    Number(m.claims || 0) * 15 +
    Number(m.clicks || 0) * 0.1
  );
}

/** Extrai kg gravados em commission_basis (modo R$/kg) — JSON text ou jsonb. */
const SALES_KG_SQL = `
  COALESCE(SUM(
    CASE
      WHEN commission_basis IS NULL OR TRIM(COALESCE(commission_basis::text, '')) = '' THEN 0
      ELSE COALESCE(
        NULLIF(regexp_replace(
          COALESCE(
            (commission_basis::jsonb->>'total_kg'),
            (commission_basis::jsonb->'basis'->>'total_kg'),
            '0'
          ),
          '[^0-9.\\-]', '', 'g'
        ), '')::numeric,
        0
      )
    END
  ), 0)
`;

async function loadAffiliateMetrics(
  brandId: string,
  period: RankPeriod,
): Promise<
  Array<{
    affiliate_id: string;
    display_name: string;
    code: string;
    avatar_url: string | null;
    status: string;
    sales_gmv: number;
    sales_kg: number;
    sales_count: number;
    commission: number;
    clicks: number;
    conversions: number;
    claims: number;
  }>
> {
  const start = periodStart(period);
  const affiliates = await query<any[]>(
    `SELECT id, display_name, code, avatar_url, status, total_clicks, total_sales, total_commission
     FROM affiliates
     WHERE brand_id = ? AND COALESCE(status, 'active') NOT IN ('rejected', 'blocked', 'deleted')
     ORDER BY display_name ASC`,
    [brandId],
  ).catch(() => []);

  if (!affiliates?.length) return [];

  const ids = affiliates.map((a) => String(a.id));
  const placeholders = ids.map(() => "?").join(",");

  // Sales metrics in period (inclui kg via commission_basis)
  let salesRows: any[] = [];
  try {
    if (start) {
      salesRows = await query<any[]>(
        `SELECT affiliate_id,
                COALESCE(SUM(order_total), 0) AS gmv,
                COUNT(*)::int AS sales_count,
                COALESCE(SUM(commission_amount), 0) AS commission,
                ${SALES_KG_SQL} AS sales_kg
         FROM affiliate_sales
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
           AND created_at >= ?
         GROUP BY affiliate_id`,
        [brandId, ...ids, start.toISOString()],
      );
    } else {
      salesRows = await query<any[]>(
        `SELECT affiliate_id,
                COALESCE(SUM(order_total), 0) AS gmv,
                COUNT(*)::int AS sales_count,
                COALESCE(SUM(commission_amount), 0) AS commission,
                ${SALES_KG_SQL} AS sales_kg
         FROM affiliate_sales
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
         GROUP BY affiliate_id`,
        [brandId, ...ids],
      );
    }
  } catch {
    // Fallback sem kg (coluna/json antigo)
    try {
      if (start) {
        salesRows = await query<any[]>(
          `SELECT affiliate_id,
                  COALESCE(SUM(order_total), 0) AS gmv,
                  COUNT(*)::int AS sales_count,
                  COALESCE(SUM(commission_amount), 0) AS commission,
                  0 AS sales_kg
           FROM affiliate_sales
           WHERE brand_id = ? AND affiliate_id IN (${placeholders})
             AND created_at >= ?
           GROUP BY affiliate_id`,
          [brandId, ...ids, start.toISOString()],
        );
      } else {
        salesRows = await query<any[]>(
          `SELECT affiliate_id,
                  COALESCE(SUM(order_total), 0) AS gmv,
                  COUNT(*)::int AS sales_count,
                  COALESCE(SUM(commission_amount), 0) AS commission,
                  0 AS sales_kg
           FROM affiliate_sales
           WHERE brand_id = ? AND affiliate_id IN (${placeholders})
           GROUP BY affiliate_id`,
          [brandId, ...ids],
        );
      }
    } catch {
      salesRows = [];
    }
  }

  // Clicks in period (table may not exist / empty)
  let clickRows: any[] = [];
  try {
    if (start) {
      clickRows = await query<any[]>(
        `SELECT affiliate_id, COUNT(*)::int AS clicks
         FROM affiliate_clicks
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
           AND created_at >= ?
         GROUP BY affiliate_id`,
        [brandId, ...ids, start.toISOString()],
      );
    } else {
      clickRows = await query<any[]>(
        `SELECT affiliate_id, COUNT(*)::int AS clicks
         FROM affiliate_clicks
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
         GROUP BY affiliate_id`,
        [brandId, ...ids],
      );
    }
  } catch {
    clickRows = [];
  }

  // Opportunity claims / conversions from prospect_assignments
  let claimRows: any[] = [];
  try {
    if (start) {
      claimRows = await query<any[]>(
        `SELECT affiliate_id,
                COUNT(*)::int AS claims,
                COUNT(*) FILTER (WHERE conversion_status = 'converted' OR assignment_status = 'converted')::int AS conversions
         FROM prospect_assignments
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
           AND created_at >= ?
         GROUP BY affiliate_id`,
        [brandId, ...ids, start.toISOString()],
      );
    } else {
      claimRows = await query<any[]>(
        `SELECT affiliate_id,
                COUNT(*)::int AS claims,
                COUNT(*) FILTER (WHERE conversion_status = 'converted' OR assignment_status = 'converted')::int AS conversions
         FROM prospect_assignments
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
         GROUP BY affiliate_id`,
        [brandId, ...ids],
      );
    }
  } catch {
    // FILTER may fail on older SQL — fallback without FILTER
    try {
      claimRows = await query<any[]>(
        `SELECT affiliate_id, COUNT(*)::int AS claims, 0 AS conversions
         FROM prospect_assignments
         WHERE brand_id = ? AND affiliate_id IN (${placeholders})
         GROUP BY affiliate_id`,
        [brandId, ...ids],
      );
    } catch {
      claimRows = [];
    }
  }

  const salesMap = new Map(salesRows.map((r) => [String(r.affiliate_id), r]));
  const clickMap = new Map(clickRows.map((r) => [String(r.affiliate_id), r]));
  const claimMap = new Map(claimRows.map((r) => [String(r.affiliate_id), r]));

  return affiliates.map((a) => {
    const id = String(a.id);
    const s = salesMap.get(id);
    const c = clickMap.get(id);
    const cl = claimMap.get(id);
    const sales_gmv = Number(s?.gmv || 0);
    const sales_kg = Number(s?.sales_kg || 0);
    const sales_count = Number(s?.sales_count || 0);
    const commission = Number(s?.commission || a.total_commission || 0);
    const clicks =
      period === "all"
        ? Math.max(Number(c?.clicks || 0), Number(a.total_clicks || 0))
        : Number(c?.clicks || 0);
    const claims = Number(cl?.claims || 0);
    const conversions = Math.max(Number(cl?.conversions || 0), sales_count);
    return {
      affiliate_id: id,
      display_name: String(a.display_name || a.code || "Afiliado"),
      code: String(a.code || ""),
      avatar_url: a.avatar_url ? String(a.avatar_url) : null,
      status: String(a.status || "active"),
      sales_gmv,
      sales_kg,
      sales_count,
      commission,
      clicks,
      conversions,
      claims,
    };
  });
}

function rankEntries(
  rows: Awaited<ReturnType<typeof loadAffiliateMetrics>>,
): LeaderboardEntry[] {
  const scored = rows.map((r) => ({
    ...r,
    score: scoreFromMetrics(r),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sales_gmv !== a.sales_gmv) return b.sales_gmv - a.sales_gmv;
    if (b.commission !== a.commission) return b.commission - a.commission;
    if (b.sales_count !== a.sales_count) return b.sales_count - a.sales_count;
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return String(a.display_name).localeCompare(String(b.display_name), "pt-BR");
  });

  // Dense ranking with ties on score+gmv+commission
  let lastKey = "";
  let rank = 0;
  let index = 0;
  return scored.map((r) => {
    index += 1;
    const key = `${r.score}|${r.sales_gmv}|${r.commission}|${r.sales_count}`;
    if (key !== lastKey) {
      rank = index;
      lastKey = key;
    }
    return {
      affiliate_id: r.affiliate_id,
      display_name: r.display_name,
      code: r.code,
      avatar_url: r.avatar_url,
      status: r.status,
      rank,
      score: Math.round(r.score * 100) / 100,
      sales_gmv: r.sales_gmv,
      sales_count: r.sales_count,
      commission: r.commission,
      clicks: r.clicks,
      conversions: r.conversions,
      claims: r.claims,
    };
  });
}

class AffiliateRankingAwardsService {
  async ensureSchema() {
    await ensureSchema();
  }

  async getLeaderboard(input: {
    ownerUserId: string;
    brandId: string;
    period?: RankPeriod;
    limit?: number;
    highlightAffiliateId?: string | null;
  }) {
    await ensureSchema();
    const period = (input.period || "month") as RankPeriod;
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const metrics = await loadAffiliateMetrics(input.brandId, period);
    const ranked = rankEntries(metrics);

    // Persist snapshot (best-effort)
    const pKey = periodKey(period);
    void this.persistSnapshot(input.ownerUserId, input.brandId, pKey, ranked).catch(() => null);

    // Sync rank_position for "month" on affiliates table
    if (period === "month" || period === "all") {
      void this.syncAffiliateRankPositions(input.brandId, ranked).catch(() => null);
    }

    const highlight = input.highlightAffiliateId
      ? ranked.find((r) => r.affiliate_id === String(input.highlightAffiliateId))
      : null;

    const items = ranked.slice(0, limit).map((r) => ({
      ...r,
      is_you: input.highlightAffiliateId
        ? r.affiliate_id === String(input.highlightAffiliateId)
        : false,
    }));

    return {
      period,
      period_key: pKey,
      total_affiliates: ranked.length,
      items,
      me: highlight
        ? {
            ...highlight,
            is_you: true,
            of: ranked.length,
          }
        : null,
      metrics_legend: {
        score: "Pontuação composta (GMV + kg×8 + comissão×2 + vendas×50 + conversões×40 + claims×15 + cliques×0.1)",
        sales_gmv: "Total vendido (R$)",
        sales_kg: "Total vendido (kg)",
        sales_count: "Pedidos",
        commission: "Comissão gerada",
        clicks: "Cliques no link",
        conversions: "Conversões",
        claims: "Oportunidades assumidas",
      },
    };
  }

  private async persistSnapshot(
    ownerUserId: string,
    brandId: string,
    pKey: string,
    ranked: LeaderboardEntry[],
  ) {
    // Snapshot best-effort em paralelo limitado (não sequencial — ranking respondia lento)
    const slice = ranked.slice(0, 50);
    const CONCURRENCY = 8;
    for (let i = 0; i < slice.length; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (r) => {
          const id = randomUUID();
          try {
            await query(
              `INSERT INTO affiliate_rank_entries
               (id, owner_user_id, brand_id, affiliate_id, period_key, rank_position, score,
                sales_gmv, sales_count, commission, clicks, conversions, claims, computed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
               ON CONFLICT (brand_id, affiliate_id, period_key) DO UPDATE SET
                 rank_position = EXCLUDED.rank_position,
                 score = EXCLUDED.score,
                 sales_gmv = EXCLUDED.sales_gmv,
                 sales_count = EXCLUDED.sales_count,
                 commission = EXCLUDED.commission,
                 clicks = EXCLUDED.clicks,
                 conversions = EXCLUDED.conversions,
                 claims = EXCLUDED.claims,
                 computed_at = NOW()`,
              [
                id,
                ownerUserId,
                brandId,
                r.affiliate_id,
                pKey,
                r.rank,
                r.score,
                r.sales_gmv,
                r.sales_count,
                r.commission,
                r.clicks,
                r.conversions,
                r.claims,
              ],
            );
          } catch {
            /* best-effort */
          }
        }),
      );
    }
  }

  private async syncAffiliateRankPositions(brandId: string, ranked: LeaderboardEntry[]) {
    // Top 30 em paralelo — suficiente para UI e badges
    const top = ranked.slice(0, 30);
    await Promise.all(
      top.map((r) =>
        query(
          `UPDATE affiliates SET rank_position = ?, updated_at = NOW() WHERE id = ? AND brand_id = ?`,
          [r.rank, r.affiliate_id, brandId],
        ).catch(() => null),
      ),
    );
  }

  /** Rank position for a single affiliate (used by dashboard stats). */
  async getAffiliateRank(brandId: string, affiliateId: string, period: RankPeriod = "all") {
    await ensureSchema();
    const metrics = await loadAffiliateMetrics(brandId, period);
    const ranked = rankEntries(metrics);
    const me = ranked.find((r) => r.affiliate_id === String(affiliateId));
    return {
      rank: me?.rank || (ranked.length ? ranked.length : 0),
      of: ranked.length,
      score: me?.score || 0,
      entry: me || null,
    };
  }

  // ─── Challenges / Premiações ───────────────────────────────────────

  async listChallenges(input: {
    ownerUserId: string;
    brandId: string;
    status?: string | null;
  }) {
    await ensureSchema();
    // Filtra por brand_id (fonte de verdade). owner_user_id só como desempate legado.
    const clauses = ["brand_id = ?"];
    const params: any[] = [input.brandId];
    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_challenges
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
         created_at DESC`,
      params,
    ).catch(() => []);

    const ids = (rows || []).map((r) => String(r.id));
    let enrollCounts: any[] = [];
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      enrollCounts = await query<any[]>(
        `SELECT challenge_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
                COUNT(*) FILTER (WHERE is_winner = TRUE)::int AS winners
         FROM affiliate_challenge_enrollments
         WHERE challenge_id IN (${ph})
         GROUP BY challenge_id`,
        ids,
      ).catch(() => []);
    }
    const countMap = new Map(enrollCounts.map((c) => [String(c.challenge_id), c]));

    return (rows || []).map((r) => {
      const c = countMap.get(String(r.id));
      return {
        ...r,
        eligibility: parseEligibility(r.eligibility_json),
        enrollments_total: Number(c?.total || 0),
        enrollments_accepted: Number(c?.accepted || 0),
        winners_count: Number(c?.winners || 0),
      };
    });
  }

  async getChallenge(id: string, brandId: string) {
    await ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM affiliate_challenges WHERE id = ? AND brand_id = ? LIMIT 1`,
      [id, brandId],
    );
    if (!row) return null;
    const enrollments = await query<any[]>(
      `SELECT e.*, a.display_name, a.code, a.avatar_url
       FROM affiliate_challenge_enrollments e
       LEFT JOIN affiliates a ON a.id = e.affiliate_id
       WHERE e.challenge_id = ?
       ORDER BY e.is_winner DESC, e.progress_value DESC, e.accepted_at ASC NULLS LAST`,
      [id],
    ).catch(() => []);
    return {
      ...row,
      eligibility: parseEligibility(row.eligibility_json),
      enrollments: enrollments || [],
    };
  }

  async createChallenge(input: {
    ownerUserId: string;
    brandId: string;
    programId?: string | null;
    title: string;
    description?: string | null;
    rulesText?: string | null;
    coverUrl?: string | null;
    challengeType?: ChallengeType;
    metric?: ChallengeMetric;
    targetValue?: number;
    prizeLabel?: string | null;
    prizeDescription?: string | null;
    maxWinners?: number;
    requiresAcceptance?: boolean;
    eligibility?: Record<string, any>;
    status?: ChallengeStatus;
    startsAt?: string | null;
    endsAt?: string | null;
  }) {
    await ensureSchema();
    const title = String(input.title || "").trim();
    if (!title) throw new Error("Título da premiação é obrigatório");
    const id = randomUUID();
    const type = (input.challengeType || "first_to") as ChallengeType;
    const metric = (input.metric || "sales_gmv") as ChallengeMetric;
    const target = Math.max(0.01, Number(input.targetValue) || 1);
    const status = (input.status || "draft") as ChallengeStatus;

    await query(
      `INSERT INTO affiliate_challenges
       (id, owner_user_id, brand_id, program_id, title, description, rules_text, cover_url,
        challenge_type, metric, target_value, prize_label, prize_description, max_winners,
        requires_acceptance, eligibility_json, status, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.ownerUserId,
        input.brandId,
        input.programId || null,
        title.slice(0, 180),
        input.description || null,
        input.rulesText || null,
        input.coverUrl || null,
        type,
        metric,
        target,
        input.prizeLabel || null,
        input.prizeDescription || null,
        Math.max(1, Math.min(50, Number(input.maxWinners) || 1)),
        input.requiresAcceptance !== false,
        JSON.stringify(input.eligibility || {}),
        status,
        input.startsAt || null,
        input.endsAt || null,
      ],
    );
    if (status === "active") {
      void this.evaluateChallenge(id, input.brandId).catch(() => null);
      void this.notifyChallengeAvailable(id, input.brandId).catch(() => null);
    }
    return this.getChallenge(id, input.brandId);
  }

  async updateChallenge(
    id: string,
    brandId: string,
    ownerUserId: string,
    patch: Partial<{
      title: string;
      description: string | null;
      rulesText: string | null;
      coverUrl: string | null;
      challengeType: ChallengeType;
      metric: ChallengeMetric;
      targetValue: number;
      prizeLabel: string | null;
      prizeDescription: string | null;
      maxWinners: number;
      requiresAcceptance: boolean;
      eligibility: Record<string, any>;
      status: ChallengeStatus;
      startsAt: string | null;
      endsAt: string | null;
      programId: string | null;
    }>,
  ) {
    await ensureSchema();
    const existing = await queryOne<any>(
      `SELECT id FROM affiliate_challenges WHERE id = ? AND brand_id = ? AND owner_user_id = ? LIMIT 1`,
      [id, brandId, ownerUserId],
    );
    if (!existing) throw new Error("Premiação não encontrada");

    const fields: string[] = [];
    const values: any[] = [];
    const map: Array<[string, any]> = [
      ["title", patch.title !== undefined ? String(patch.title).trim().slice(0, 180) : undefined],
      ["description", patch.description],
      ["rules_text", patch.rulesText],
      ["cover_url", patch.coverUrl],
      ["challenge_type", patch.challengeType],
      ["metric", patch.metric],
      ["target_value", patch.targetValue !== undefined ? Math.max(0.01, Number(patch.targetValue) || 1) : undefined],
      ["prize_label", patch.prizeLabel],
      ["prize_description", patch.prizeDescription],
      ["max_winners", patch.maxWinners !== undefined ? Math.max(1, Math.min(50, Number(patch.maxWinners) || 1)) : undefined],
      ["requires_acceptance", patch.requiresAcceptance],
      ["eligibility_json", patch.eligibility !== undefined ? JSON.stringify(patch.eligibility || {}) : undefined],
      ["status", patch.status],
      ["starts_at", patch.startsAt],
      ["ends_at", patch.endsAt],
      ["program_id", patch.programId],
    ];
    for (const [col, val] of map) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!fields.length) return this.getChallenge(id, brandId);
    const prev = await queryOne<any>(
      `SELECT status, title, prize_label FROM affiliate_challenges WHERE id = ? AND brand_id = ? LIMIT 1`,
      [id, brandId],
    );
    fields.push("updated_at = NOW()");
    values.push(id, brandId);
    await query(
      `UPDATE affiliate_challenges SET ${fields.join(", ")} WHERE id = ? AND brand_id = ?`,
      values,
    );
    const becameActive =
      patch.status === "active" && String(prev?.status || "") !== "active";
    if (patch.status === "active") {
      void this.evaluateChallenge(id, brandId).catch(() => null);
    }
    if (becameActive) {
      void this.notifyChallengeAvailable(id, brandId).catch(() => null);
    }
    return this.getChallenge(id, brandId);
  }

  /** Ativa e notifica em um passo (admin “Ativar”). */
  async activateAndNotify(id: string, brandId: string, ownerUserId: string) {
    const challenge = await this.updateChallenge(id, brandId, ownerUserId, { status: "active" });
    return challenge;
  }

  /** Avisa afiliados ativos quando uma premiação é ativada. */
  async notifyChallengeAvailable(challengeId: string, brandId: string) {
    const ch = await queryOne<any>(
      `SELECT * FROM affiliate_challenges WHERE id = ? AND brand_id = ? LIMIT 1`,
      [challengeId, brandId],
    );
    if (!ch || String(ch.status) !== "active") return { notified: 0 };

    const affiliates = await query<any[]>(
      `SELECT id, affiliate_user_id, display_name, status
       FROM affiliates
       WHERE brand_id = ? AND COALESCE(status, 'active') = 'active'
       LIMIT 200`,
      [brandId],
    ).catch(() => []);

    let notified = 0;
    const { emitPlatformEventToUser } = await import("./notificationHub");
    const { resolveAffiliateDeepLink, affiliatePushCenterService } = await import("./affiliatePushCenter");
    const rankingDeep = await resolveAffiliateDeepLink(brandId, "ranking");

    for (const a of affiliates || []) {
      const userId = String(a.affiliate_user_id || "").trim();
      if (!userId) continue;
      const elig = this.checkEligibility(a, parseEligibility(ch.eligibility_json));
      if (!elig.ok) continue;
      try {
        const baseTitle = String(ch.title || "Nova premiação");
        const baseBody = `${baseTitle} — ${ch.prize_label || "Prêmio da rede"}. Entre na disputa e suba no ranking!`;
        const applied = await affiliatePushCenterService.applyEventOverride(
          brandId,
          "affiliate.challenge.available",
          {
            title: "Nova premiação na rede",
            body: baseBody,
            deep_link: rankingDeep,
            image_url: ch.cover_url || null,
          },
        );
        if (applied.suppressed) continue;

        await emitPlatformEventToUser("affiliate.challenge.available", userId, {
          organization_id: brandId,
          role: "affiliate",
          entity_type: "affiliate_challenge",
          entity_id: challengeId,
          deep_link: applied.deep_link || rankingDeep,
          template_vars: {
            challenge_title: baseTitle,
            prize_label: String(ch.prize_label || "Prêmio da rede"),
            brand_id: brandId,
          },
          metadata: {
            challenge_id: challengeId,
            cover_url: applied.image_url || ch.cover_url || null,
            icon: applied.image_url || ch.cover_url || undefined,
            app_context: "affiliate",
            url: applied.deep_link || rankingDeep,
          },
        });
        notified += 1;
      } catch {
        /* ignore single */
      }
    }
    return { notified };
  }

  private async notifyChallengeWon(input: {
    brandId: string;
    challengeId: string;
    affiliateId: string;
    title: string;
    prizeLabel: string | null;
    rankAtWin?: number | null;
  }) {
    try {
      const aff = await queryOne<any>(
        `SELECT affiliate_user_id FROM affiliates WHERE id = ? LIMIT 1`,
        [input.affiliateId],
      );
      const userId = String(aff?.affiliate_user_id || "").trim();
      if (!userId) return;
      const { emitPlatformEventToUser } = await import("./notificationHub");
      const { resolveAffiliateDeepLink, affiliatePushCenterService } = await import("./affiliatePushCenter");
      const rankingDeep = await resolveAffiliateDeepLink(input.brandId, "ranking");
      const applied = await affiliatePushCenterService.applyEventOverride(
        input.brandId,
        "affiliate.challenge.won",
        {
          title: "Você venceu!",
          body: `Parabéns! Você venceu: ${input.title}. Prêmio: ${input.prizeLabel || "Prêmio"}.`,
          deep_link: rankingDeep,
        },
      );
      if (applied.suppressed) return;
      await emitPlatformEventToUser("affiliate.challenge.won", userId, {
        organization_id: input.brandId,
        role: "affiliate",
        entity_type: "affiliate_challenge",
        entity_id: input.challengeId,
        deep_link: applied.deep_link || rankingDeep,
        template_vars: {
          challenge_title: input.title,
          prize_label: input.prizeLabel || "Prêmio",
          brand_id: input.brandId,
          rank: input.rankAtWin || 1,
        },
        metadata: {
          challenge_id: input.challengeId,
          app_context: "affiliate",
          url: applied.deep_link || rankingDeep,
          icon: applied.image_url || undefined,
        },
      });
    } catch {
      /* não bloquear */
    }
  }

  async deleteChallenge(id: string, brandId: string, ownerUserId: string) {
    await ensureSchema();
    await query(
      `DELETE FROM affiliate_challenge_enrollments WHERE challenge_id = ? AND brand_id = ?`,
      [id, brandId],
    ).catch(() => null);
    const r = await query(
      `DELETE FROM affiliate_challenges WHERE id = ? AND brand_id = ? AND owner_user_id = ?`,
      [id, brandId, ownerUserId],
    );
    return { deleted: Number((r as any)?.affectedRows || (r as any)?.rowCount || 0) > 0 };
  }

  private metricValue(
    m: {
      sales_gmv: number;
      sales_kg?: number;
      sales_count: number;
      commission: number;
      clicks: number;
      conversions: number;
      claims: number;
    },
    metric: ChallengeMetric,
  ): number {
    switch (metric) {
      case "sales_gmv":
        return Number(m.sales_gmv || 0);
      case "sales_kg":
        return Number(m.sales_kg || 0);
      case "sales_count":
        return Number(m.sales_count || 0);
      case "commission":
        return Number(m.commission || 0);
      case "clicks":
        return Number(m.clicks || 0);
      case "conversions":
        return Number(m.conversions || 0);
      case "claims":
        return Number(m.claims || 0);
      default:
        return 0;
    }
  }

  private checkEligibility(
    affiliate: any,
    eligibility: Record<string, any>,
  ): { ok: boolean; reason?: string } {
    if (!eligibility || !Object.keys(eligibility).length) return { ok: true };
    if (eligibility.require_active !== false && String(affiliate.status || "") !== "active") {
      return { ok: false, reason: "Afiliado precisa estar ativo" };
    }
    if (eligibility.min_sales != null && Number(affiliate.total_sales || 0) < Number(eligibility.min_sales)) {
      return { ok: false, reason: `Mínimo de ${eligibility.min_sales} vendas no histórico` };
    }
    if (eligibility.regions?.length) {
      const region = String(affiliate.region || "").toLowerCase();
      const allowed = (eligibility.regions as string[]).map((r) => String(r).toLowerCase());
      if (region && !allowed.some((a) => region.includes(a) || a.includes(region))) {
        return { ok: false, reason: "Região não elegível para esta premiação" };
      }
    }
    return { ok: true };
  }

  async acceptChallenge(input: {
    challengeId: string;
    brandId: string;
    affiliateId: string;
  }) {
    await ensureSchema();
    const ch = await queryOne<any>(
      `SELECT * FROM affiliate_challenges WHERE id = ? AND brand_id = ? LIMIT 1`,
      [input.challengeId, input.brandId],
    );
    if (!ch) throw new Error("Premiação não encontrada");
    if (String(ch.status) !== "active") throw new Error("Esta premiação não está ativa");
    if (ch.ends_at && new Date(ch.ends_at).getTime() < Date.now()) {
      throw new Error("Premiação encerrada");
    }
    // Aceite liberado enquanto status = active (mesmo antes de starts_at).
    // starts_at só define quando a contagem da meta começa — não bloqueia inscrição.
    // (Antes: "Premiação ainda não começou" se starts_at > agora, o que confunde quem recebeu o push.)

    const affiliate = await queryOne<any>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateId, input.brandId],
    );
    if (!affiliate) throw new Error("Afiliado não encontrado");

    const elig = this.checkEligibility(affiliate, parseEligibility(ch.eligibility_json));
    if (!elig.ok) throw new Error(elig.reason || "Você não é elegível");

    const existing = await queryOne<any>(
      `SELECT * FROM affiliate_challenge_enrollments
       WHERE challenge_id = ? AND affiliate_id = ? LIMIT 1`,
      [input.challengeId, input.affiliateId],
    );
    if (existing?.status === "accepted") {
      return { enrollment: existing, already: true };
    }
    if (existing?.is_winner) {
      return { enrollment: existing, already: true };
    }

    const id = existing?.id || randomUUID();
    if (existing) {
      await query(
        `UPDATE affiliate_challenge_enrollments
         SET status = 'accepted', accepted_at = NOW(), declined_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [id],
      );
    } else {
      await query(
        `INSERT INTO affiliate_challenge_enrollments
         (id, challenge_id, brand_id, affiliate_id, status, accepted_at)
         VALUES (?, ?, ?, ?, 'accepted', NOW())`,
        [id, input.challengeId, input.brandId, input.affiliateId],
      );
    }

    // Progresso em background — não pode derrubar o aceite se a métrica falhar
    void this.evaluateChallenge(input.challengeId, input.brandId).catch(() => null);
    const enrollment = await queryOne<any>(
      `SELECT * FROM affiliate_challenge_enrollments WHERE id = ? LIMIT 1`,
      [id],
    );
    return { enrollment, already: false, accepted: true };
  }

  async declineChallenge(input: {
    challengeId: string;
    brandId: string;
    affiliateId: string;
  }) {
    await ensureSchema();
    const existing = await queryOne<any>(
      `SELECT * FROM affiliate_challenge_enrollments
       WHERE challenge_id = ? AND affiliate_id = ? LIMIT 1`,
      [input.challengeId, input.affiliateId],
    );
    if (existing?.is_winner) throw new Error("Você já é vencedor desta premiação");
    const id = existing?.id || randomUUID();
    if (existing) {
      await query(
        `UPDATE affiliate_challenge_enrollments
         SET status = 'declined', declined_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [id],
      );
    } else {
      await query(
        `INSERT INTO affiliate_challenge_enrollments
         (id, challenge_id, brand_id, affiliate_id, status, declined_at)
         VALUES (?, ?, ?, ?, 'declined', NOW())`,
        [id, input.challengeId, input.brandId, input.affiliateId],
      );
    }
    return { declined: true };
  }

  async evaluateChallenge(challengeId: string, brandId: string) {
    await ensureSchema();
    const ch = await queryOne<any>(
      `SELECT * FROM affiliate_challenges WHERE id = ? AND brand_id = ? LIMIT 1`,
      [challengeId, brandId],
    );
    if (!ch || String(ch.status) !== "active") return { evaluated: false };

    const metric = String(ch.metric || "sales_gmv") as ChallengeMetric;
    const type = String(ch.challenge_type || "first_to") as ChallengeType;
    const target = Number(ch.target_value || 1);
    const maxWinners = Math.max(1, Number(ch.max_winners) || 1);
    const requiresAcceptance = ch.requires_acceptance !== false && ch.requires_acceptance !== 0;

    // Period for challenge progress: from starts_at or all-time
    let period: RankPeriod = "all";
    if (ch.starts_at) {
      const ageDays = (Date.now() - new Date(ch.starts_at).getTime()) / 86400000;
      if (ageDays <= 8) period = "week";
      else if (ageDays <= 35) period = "30d";
      else period = "month";
    }

    const metrics = await loadAffiliateMetrics(brandId, period);
    const metricMap = new Map(metrics.map((m) => [m.affiliate_id, m]));

    let enrollments = await query<any[]>(
      `SELECT * FROM affiliate_challenge_enrollments WHERE challenge_id = ?`,
      [challengeId],
    ).catch(() => []);

    // Auto-enroll all active if no acceptance required
    if (!requiresAcceptance) {
      for (const m of metrics) {
        if (enrollments.some((e) => String(e.affiliate_id) === m.affiliate_id)) continue;
        const aff = await queryOne<any>(
          `SELECT * FROM affiliates WHERE id = ? LIMIT 1`,
          [m.affiliate_id],
        );
        const elig = this.checkEligibility(aff, parseEligibility(ch.eligibility_json));
        if (!elig.ok) continue;
        const eid = randomUUID();
        await query(
          `INSERT INTO affiliate_challenge_enrollments
           (id, challenge_id, brand_id, affiliate_id, status, accepted_at)
           VALUES (?, ?, ?, ?, 'accepted', NOW())
           ON CONFLICT (challenge_id, affiliate_id) DO NOTHING`,
          [eid, challengeId, brandId, m.affiliate_id],
        ).catch(async () => {
          await query(
            `INSERT INTO affiliate_challenge_enrollments
             (id, challenge_id, brand_id, affiliate_id, status, accepted_at)
             VALUES (?, ?, ?, ?, 'accepted', NOW())`,
            [eid, challengeId, brandId, m.affiliate_id],
          ).catch(() => null);
        });
      }
      enrollments = await query<any[]>(
        `SELECT * FROM affiliate_challenge_enrollments WHERE challenge_id = ?`,
        [challengeId],
      ).catch(() => []);
    }

    const winnersNow = (enrollments || []).filter((e) => e.is_winner).length;
    if (winnersNow >= maxWinners && type === "first_to") {
      return { evaluated: true, winners: winnersNow, complete: true };
    }

    // Update progress
    for (const e of enrollments || []) {
      if (String(e.status) !== "accepted" && !e.is_winner) continue;
      const m = metricMap.get(String(e.affiliate_id));
      if (!m) continue;
      const val = this.metricValue(m, metric);
      await query(
        `UPDATE affiliate_challenge_enrollments
         SET progress_value = ?, progress_updated_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [val, e.id],
      ).catch(() => null);
      e.progress_value = val;
    }

    // Determine new winners
    let remainingSlots = maxWinners - winnersNow;
    if (remainingSlots <= 0) return { evaluated: true, winners: winnersNow, complete: true };

    const candidates = (enrollments || [])
      .filter((e) => !e.is_winner && String(e.status) === "accepted")
      .map((e) => ({
        ...e,
        progress_value: Number(e.progress_value || 0),
      }))
      .filter((e) => e.progress_value >= target)
      .sort((a, b) => {
        if (b.progress_value !== a.progress_value) return b.progress_value - a.progress_value;
        const at = a.accepted_at ? new Date(a.accepted_at).getTime() : 0;
        const bt = b.accepted_at ? new Date(b.accepted_at).getTime() : 0;
        return at - bt;
      });

    if (type === "top_n") {
      // top_n: only at end or when we re-eval — award top by progress if ends_at passed or always refresh top
      const ended = ch.ends_at && new Date(ch.ends_at).getTime() <= Date.now();
      if (!ended) {
        return { evaluated: true, winners: winnersNow, complete: false };
      }
      const top = (enrollments || [])
        .filter((e) => String(e.status) === "accepted")
        .sort((a, b) => Number(b.progress_value || 0) - Number(a.progress_value || 0))
        .slice(0, maxWinners);
      let rank = 0;
      for (const w of top) {
        if (w.is_winner) continue;
        rank += 1;
        await query(
          `UPDATE affiliate_challenge_enrollments
           SET is_winner = TRUE, won_at = NOW(), rank_at_win = ?, updated_at = NOW()
           WHERE id = ?`,
          [rank, w.id],
        ).catch(() => null);
        void this.notifyChallengeWon({
          brandId,
          challengeId,
          affiliateId: String(w.affiliate_id),
          title: String(ch.title || "Premiação"),
          prizeLabel: ch.prize_label || null,
          rankAtWin: rank,
        }).catch(() => null);
      }
      await query(
        `UPDATE affiliate_challenges SET status = 'ended', updated_at = NOW() WHERE id = ?`,
        [challengeId],
      ).catch(() => null);
      return { evaluated: true, winners: top.length, complete: true };
    }

    // first_to / threshold
    for (const c of candidates) {
      if (remainingSlots <= 0) break;
      const winRank = winnersNow + (maxWinners - remainingSlots) + 1;
      await query(
        `UPDATE affiliate_challenge_enrollments
         SET is_winner = TRUE, won_at = NOW(), rank_at_win = ?, updated_at = NOW()
         WHERE id = ? AND is_winner = FALSE`,
        [winRank, c.id],
      ).catch(() => null);
      void this.notifyChallengeWon({
        brandId,
        challengeId,
        affiliateId: String(c.affiliate_id),
        title: String(ch.title || "Premiação"),
        prizeLabel: ch.prize_label || null,
        rankAtWin: winRank,
      }).catch(() => null);
      remainingSlots -= 1;
    }

    const finalWinners = maxWinners - remainingSlots;
    if (type === "first_to" && finalWinners >= maxWinners) {
      await query(
        `UPDATE affiliate_challenges SET status = 'ended', updated_at = NOW() WHERE id = ?`,
        [challengeId],
      ).catch(() => null);
    }

    return { evaluated: true, winners: finalWinners, complete: remainingSlots <= 0 };
  }

  async listChallengesForAffiliate(input: {
    brandId: string;
    affiliateId: string;
  }) {
    await ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_challenges
       WHERE brand_id = ? AND status IN ('active', 'ended', 'paused')
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 40`,
      [input.brandId],
    ).catch(() => []);

    const affiliate = await queryOne<any>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateId, input.brandId],
    );

    const challengeIds = (rows || []).map((r) => String(r.id));
    let enrollments: any[] = [];
    if (challengeIds.length) {
      const ph = challengeIds.map(() => "?").join(",");
      enrollments = await query<any[]>(
        `SELECT * FROM affiliate_challenge_enrollments
         WHERE affiliate_id = ? AND challenge_id IN (${ph})`,
        [input.affiliateId, ...challengeIds],
      ).catch(() => []);
    }
    const enMap = new Map(enrollments.map((e) => [String(e.challenge_id), e]));

    // Progress for active: use month metrics
    const metrics = await loadAffiliateMetrics(input.brandId, "month");
    const mine = metrics.find((m) => m.affiliate_id === String(input.affiliateId));

    return (rows || []).map((ch) => {
      const en = enMap.get(String(ch.id));
      const elig = this.checkEligibility(affiliate, parseEligibility(ch.eligibility_json));
      const metric = String(ch.metric || "sales_gmv") as ChallengeMetric;
      const progress = mine ? this.metricValue(mine, metric) : Number(en?.progress_value || 0);
      const target = Number(ch.target_value || 1);
      return {
        id: String(ch.id),
        title: String(ch.title),
        description: ch.description || null,
        rules_text: ch.rules_text || null,
        cover_url: ch.cover_url || null,
        challenge_type: ch.challenge_type,
        metric: ch.metric,
        target_value: target,
        prize_label: ch.prize_label || null,
        prize_description: ch.prize_description || null,
        max_winners: Number(ch.max_winners || 1),
        requires_acceptance: ch.requires_acceptance !== false && ch.requires_acceptance !== 0,
        status: ch.status,
        starts_at: ch.starts_at || null,
        ends_at: ch.ends_at || null,
        eligibility: parseEligibility(ch.eligibility_json),
        eligible: elig.ok,
        eligibility_reason: elig.reason || null,
        enrollment_status: en?.status || (ch.requires_acceptance === false ? "open" : "none"),
        is_winner: !!en?.is_winner,
        won_at: en?.won_at || null,
        rank_at_win: en?.rank_at_win || null,
        progress_value: progress,
        progress_pct: Math.min(100, Math.round((progress / Math.max(target, 0.01)) * 100)),
        accepted_at: en?.accepted_at || null,
      };
    });
  }

  async evaluateAllActive(brandId: string) {
    await ensureSchema();
    const rows = await query<any[]>(
      `SELECT id FROM affiliate_challenges WHERE brand_id = ? AND status = 'active' LIMIT 30`,
      [brandId],
    ).catch(() => []);
    const results = [];
    for (const r of rows || []) {
      results.push(await this.evaluateChallenge(String(r.id), brandId));
    }
    return results;
  }
}

export const affiliateRankingAwardsService = new AffiliateRankingAwardsService();
