/**
 * Pure match / surface / limit logic for automation definitions.
 * No DB or HTTP — unit-testable entry points for hybrid dispatch.
 */

export type ReplySurface = "dm" | "public_comment" | "other";

export type IgActionTipo = "enviar_dm_ig" | "comentar_ig" | string;

export interface MatchableDefinition {
  id: string;
  ativa?: boolean;
  priority?: number;
  created_at?: string;
  trigger?: {
    tipo?: string;
    plataforma?: string;
    evento?: string;
    palavrasChave?: string[];
  };
  pipeline?: Array<{
    ordem?: number;
    tipo?: IgActionTipo;
    config?: Record<string, any>;
  }>;
  limites?: {
    maxPorUsuario?: number;
    cooldownSegundos?: number;
    maxPorHora?: number;
    maxPorDia?: number;
    janelaMaxUsuarioSegundos?: number;
    janelaFuncionamento?: {
      ativo?: boolean;
      inicioHora?: number;
      fimHora?: number;
    };
  };
}

export function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function keywordMatches(text: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const hay = normalizeText(text);
  return keywords.some((kw) => hay.includes(normalizeText(kw)));
}

/** First IG reply action in pipeline order defines the conflict surface. */
export function primarySurface(def: MatchableDefinition): ReplySurface {
  const steps = [...(def.pipeline || [])].sort(
    (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0),
  );
  for (const step of steps) {
    if (step.tipo === "enviar_dm_ig") return "dm";
    if (step.tipo === "comentar_ig") return "public_comment";
  }
  return "other";
}

export function keywordSpecificity(def: MatchableDefinition): number {
  const kws = def.trigger?.palavrasChave;
  if (!Array.isArray(kws)) return 0;
  return kws.filter((k) => String(k || "").trim()).length;
}

/**
 * Sort: priority ASC (lower wins), specificity DESC, created_at ASC.
 */
export function sortDefinitionsForMatch<T extends MatchableDefinition>(defs: T[]): T[] {
  return [...defs].sort((a, b) => {
    const pa = Number(a.priority ?? 100);
    const pb = Number(b.priority ?? 100);
    if (pa !== pb) return pa - pb;
    const sa = keywordSpecificity(a);
    const sb = keywordSpecificity(b);
    if (sa !== sb) return sb - sa;
    const ca = a.created_at ? Date.parse(a.created_at) : 0;
    const cb = b.created_at ? Date.parse(b.created_at) : 0;
    return ca - cb;
  });
}

export function filterKeywordMatches<T extends MatchableDefinition>(
  defs: T[],
  matchKeyword?: string | null,
): T[] {
  return defs.filter((def) => {
    const keywords = Array.isArray(def.trigger?.palavrasChave)
      ? def.trigger!.palavrasChave!.map(String)
      : [];
    if (!matchKeyword || keywords.length === 0) return true;
    return keywordMatches(matchKeyword, keywords);
  });
}

/**
 * First-match per reply surface. Multiple winners only when surfaces differ
 * (e.g. comment→DM and comment→public).
 */
export function selectWinnersBySurface<T extends MatchableDefinition>(
  defs: T[],
  matchKeyword?: string | null,
): T[] {
  const sorted = sortDefinitionsForMatch(filterKeywordMatches(defs, matchKeyword));
  const winners: T[] = [];
  const taken = new Set<ReplySurface>();
  for (const def of sorted) {
    if (def.ativa === false) continue;
    const surface = primarySurface(def);
    if (taken.has(surface)) continue;
    taken.add(surface);
    winners.push(def);
  }
  return winners;
}

export type LimitDecision =
  | { allow: true }
  | { allow: false; reason: "cooldown" | "max_por_usuario" | "max_por_hora" | "max_por_dia" | "janela" | "inactive" };

export interface ActorRunStats {
  lastSuccessAt?: Date | string | null;
  successCountInMaxWindow?: number;
  successCountLastHour?: number;
  successCountLastDay?: number;
}

export function evaluateLimits(
  def: MatchableDefinition,
  stats: ActorRunStats,
  now: Date = new Date(),
): LimitDecision {
  if (def.ativa === false) {
    return { allow: false, reason: "inactive" };
  }

  const lim = def.limites || {};
  const cooldown = Math.max(0, Number(lim.cooldownSegundos) || 0);
  const maxPorUsuario = Math.max(0, Number(lim.maxPorUsuario) || 0);
  const maxPorHora = Math.max(0, Number(lim.maxPorHora) || 0);
  const maxPorDia = Math.max(0, Number(lim.maxPorDia) || 0);
  const windowSec = Math.max(
    0,
    Number(lim.janelaMaxUsuarioSegundos) || 24 * 3600,
  );

  if (lim.janelaFuncionamento?.ativo) {
    const hour = now.getHours();
    const start = Number(lim.janelaFuncionamento.inicioHora ?? 0);
    const end = Number(lim.janelaFuncionamento.fimHora ?? 24);
    if (start <= end) {
      if (hour < start || hour >= end) return { allow: false, reason: "janela" };
    } else if (hour < start && hour >= end) {
      return { allow: false, reason: "janela" };
    }
  }

  if (cooldown > 0 && stats.lastSuccessAt) {
    const last = new Date(stats.lastSuccessAt).getTime();
    if (Number.isFinite(last) && now.getTime() - last < cooldown * 1000) {
      return { allow: false, reason: "cooldown" };
    }
  }

  if (maxPorUsuario > 0 && windowSec > 0) {
    const count = Number(stats.successCountInMaxWindow || 0);
    if (count >= maxPorUsuario) {
      return { allow: false, reason: "max_por_usuario" };
    }
  }

  if (maxPorHora > 0 && Number(stats.successCountLastHour || 0) >= maxPorHora) {
    return { allow: false, reason: "max_por_hora" };
  }
  if (maxPorDia > 0 && Number(stats.successCountLastDay || 0) >= maxPorDia) {
    return { allow: false, reason: "max_por_dia" };
  }

  return { allow: true };
}

export type DispatchMode = "catalog" | "hybrid" | "definitions";

export function resolveSendReal(mode: DispatchMode, igSendEnv?: string | boolean | null): boolean {
  if (mode === "catalog") return false; // definitions path not used for real send in pure catalog mode
  if (igSendEnv === false || igSendEnv === "false" || igSendEnv === "0") return false;
  return true;
}

/**
 * When mode is hybrid/definitions and any definition matched the event
 * (after keyword filter, regardless of limit skip), skip catalog webhook reply tasks.
 */
export function shouldSkipCatalogWebhookReplies(
  mode: DispatchMode,
  definitionMatchCount: number,
): boolean {
  if (mode === "catalog") return false;
  return definitionMatchCount > 0;
}

export function extractActorId(
  evento: string,
  payload: Record<string, any>,
  triggeredBy?: string,
): string | null {
  if (evento === "comentario_keyword") {
    return (
      String(payload.from_id || payload.sender_id || payload.from || triggeredBy || "").trim() ||
      null
    );
  }
  return (
    String(payload.sender_id || payload.from_id || payload.from || triggeredBy || "").trim() || null
  );
}

export function isInstagramPlatformFilter(def: MatchableDefinition): boolean {
  if (def.trigger?.tipo === "evento" && def.trigger.plataforma === "instagram") return true;
  if (def.trigger?.tipo === "agendamento") {
    return (def.pipeline || []).some(
      (s) => s.tipo === "enviar_dm_ig" || s.tipo === "comentar_ig" || s.tipo === "publicar_conteudo",
    );
  }
  return false;
}
