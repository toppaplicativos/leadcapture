import { query } from "../../config/database";
import { logger } from "../../utils/logger";
import {
  adminAgentSessionStore,
  type AdminAgentSessionRow,
} from "./sessionStore";

export type SessionSearchHit = {
  session: AdminAgentSessionRow;
  score: number;
  snippet: string | null;
  matchSource: "title" | "summary" | "message";
};

const PT_STOPWORDS = new Set([
  "a", "o", "e", "de", "da", "do", "em", "um", "uma", "os", "as", "para", "com",
  "no", "na", "que", "se", "por", "ao", "aos", "das", "dos", "me", "minha", "meu",
  "eu", "ele", "ela", "isso", "essa", "esse", "como", "qual", "quais", "sobre",
]);

function normalizeQuery(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function tokenize(raw: string): string[] {
  return normalizeQuery(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !PT_STOPWORDS.has(t));
}

function buildSnippet(text: string, tokens: string[], max = 140): string | null {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const at = lower.indexOf(t);
    if (at >= 0 && (idx < 0 || at < idx)) idx = at;
  }
  if (idx < 0) return clean.slice(0, max) + (clean.length > max ? "…" : "");
  const start = Math.max(0, idx - 40);
  const slice = clean.slice(start, start + max);
  return (start > 0 ? "…" : "") + slice + (start + max < clean.length ? "…" : "");
}

function scoreText(text: string, tokens: string[]): number {
  if (!text || !tokens.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (lower.includes(t)) score += 1;
  }
  return score;
}

async function searchWithFullText(
  userId: string,
  brandId: string,
  queryText: string,
  limit: number,
  excludeSessionId?: string,
): Promise<SessionSearchHit[]> {
  const params: unknown[] = [queryText, queryText, userId, brandId];
  let excludeSql = "";
  if (excludeSessionId) {
    excludeSql = " AND s.id <> ?";
    params.push(excludeSessionId);
  }
  params.push(queryText, queryText, limit);

  const rows = await query<any[]>(
    `SELECT s.*,
            COALESCE(
              ts_rank(
                setweight(to_tsvector('portuguese', COALESCE(s.title, '')), 'A') ||
                setweight(to_tsvector('portuguese', COALESCE(s.summary, '')), 'B'),
                plainto_tsquery('portuguese', ?)
              ), 0
            ) AS fts_rank,
            (
              SELECT m.content
              FROM admin_agent_messages m
              WHERE m.session_id = s.id
                AND to_tsvector('portuguese', m.content) @@ plainto_tsquery('portuguese', ?)
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS message_snippet
     FROM admin_agent_sessions s
     WHERE s.user_id = ? AND s.brand_id = ?
       AND s.last_message_at IS NOT NULL
       ${excludeSql}
       AND (
         to_tsvector('portuguese', COALESCE(s.title, '') || ' ' || COALESCE(s.summary, ''))
           @@ plainto_tsquery('portuguese', ?)
         OR EXISTS (
           SELECT 1 FROM admin_agent_messages m
           WHERE m.session_id = s.id
             AND to_tsvector('portuguese', m.content) @@ plainto_tsquery('portuguese', ?)
         )
       )
     ORDER BY s.is_pinned DESC, fts_rank DESC, COALESCE(s.last_message_at, s.updated_at) DESC
     LIMIT ?`,
    params,
  );

  return (rows || []).map((row) => {
    const session = adminAgentSessionStore.mapSessionFromRow(row);
    const rank = Number(row.fts_rank || 0);
    const msgSnippet = row.message_snippet ? String(row.message_snippet) : null;
    const tokens = tokenize(queryText);
    let matchSource: SessionSearchHit["matchSource"] = "title";
    let snippet: string | null = null;

    if (msgSnippet) {
      matchSource = "message";
      snippet = buildSnippet(msgSnippet, tokens);
    } else if (session.summary) {
      matchSource = "summary";
      snippet = buildSnippet(session.summary, tokens);
    } else if (session.title) {
      snippet = buildSnippet(session.title, tokens);
    }

    return { session, score: rank, snippet, matchSource };
  });
}

async function searchWithTokens(
  userId: string,
  brandId: string,
  queryText: string,
  limit: number,
  excludeSessionId?: string,
): Promise<SessionSearchHit[]> {
  const tokens = tokenize(queryText);
  if (!tokens.length) return [];

  const sessions = await adminAgentSessionStore.listSessions(userId, brandId, 40);
  const filtered = excludeSessionId
    ? sessions.filter((s) => s.id !== excludeSessionId)
    : sessions;

  const hits: SessionSearchHit[] = [];
  for (const session of filtered) {
    const titleScore = scoreText(session.title || "", tokens) * 3;
    const summaryScore = scoreText(session.summary || "", tokens) * 2;
    let messageScore = 0;
    let messageSnippet: string | null = null;

    if (titleScore + summaryScore < tokens.length) {
      const msgRows = await query<any[]>(
        `SELECT content FROM admin_agent_messages
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 12`,
        [session.id],
      );
      for (const row of msgRows || []) {
        const content = String(row.content || "");
        const s = scoreText(content, tokens);
        if (s > messageScore) {
          messageScore = s;
          messageSnippet = buildSnippet(content, tokens);
        }
      }
    }

    const total = titleScore + summaryScore + messageScore;
    if (total <= 0) continue;

    let matchSource: SessionSearchHit["matchSource"] = "title";
    let snippet: string | null = buildSnippet(session.title || "", tokens);
    if (summaryScore >= titleScore && summaryScore > 0) {
      matchSource = "summary";
      snippet = buildSnippet(session.summary || "", tokens);
    }
    if (messageScore > summaryScore && messageScore > titleScore) {
      matchSource = "message";
      snippet = messageSnippet;
    }

    hits.push({ session, score: total, snippet, matchSource });
  }

  return hits
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPin = a.session.is_pinned ? 1 : 0;
      const bPin = b.session.is_pinned ? 1 : 0;
      if (bPin !== aPin) return bPin - aPin;
      const aTime = new Date(a.session.last_message_at || a.session.updated_at).getTime();
      const bTime = new Date(b.session.last_message_at || b.session.updated_at).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

export async function searchSessions(
  userId: string,
  brandId: string,
  rawQuery: string,
  opts?: { limit?: number; excludeSessionId?: string },
): Promise<SessionSearchHit[]> {
  const queryText = normalizeQuery(rawQuery);
  if (queryText.length < 2) return [];

  const limit = Math.min(Math.max(opts?.limit || 12, 1), 30);

  try {
    const ftsHits = await searchWithFullText(
      userId,
      brandId,
      queryText,
      limit,
      opts?.excludeSessionId,
    );
    if (ftsHits.length) return ftsHits;
  } catch (error: any) {
    logger.warn({ err: error?.message }, "admin agent FTS search fallback");
  }

  return searchWithTokens(userId, brandId, queryText, limit, opts?.excludeSessionId);
}

export async function buildPastSessionContext(
  userId: string,
  brandId: string,
  query: string,
  excludeSessionId?: string,
  limit = 3,
): Promise<string | null> {
  const hits = await searchSessions(userId, brandId, query, {
    limit,
    excludeSessionId,
  });
  if (!hits.length) return null;

  const lines = hits.map((h, i) => {
    const title = h.session.title?.trim() || "Conversa";
    const when = h.session.last_message_at || h.session.updated_at;
    const body = h.session.summary?.trim() || h.snippet?.trim() || "(trecho sem resumo)";
    return `${i + 1}. "${title}" (${when}): ${body.slice(0, 320)}`;
  });

  return `CONVERSAS ANTERIORES RELEVANTES (contexto histórico — não repita, apenas use se ajudar):\n${lines.join("\n")}`;
}