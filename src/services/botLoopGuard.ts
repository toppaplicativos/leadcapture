/**
 * BotLoopGuard — camada nativa anti-loop bot↔bot.
 *
 * Determinística (sem LLM), <1ms. Avalia risco de o peer ser automação
 * e BLOQUEIA a ação (não compor / não enviar) quando risco alto.
 *
 * Princípio: melhor silêncio + escalonamento do que ping-pong com outro bot.
 */

import { logger } from "../utils/logger";
import { textSimilarity } from "./inboxReplyGuard";
import { conversationMemoryService } from "./cognitive/conversationMemory";
import { igConversationId } from "./salesChannelHelpers";

/* ─── thresholds ─────────────────────────────────────────────────────────── */

const RISK_BLOCK = 0.65;
const RISK_HARD = 0.85;
const LOCK_MS_DEFAULT = 30 * 60 * 1000; // 30 min
const LOCK_MS_HARD = 2 * 60 * 60 * 1000; // 2 h
const SCORE_SOFT = 2;
const SCORE_HARD = 3;
const PING_PONG_WINDOW_MS = 90_000;
const RAPID_REPLY_MS = 20_000;
const SELF_ECHO_SIM = 0.75;
const BILATERAL_SIM = 0.72;

/* ─── bot / IVR signal lexicon ───────────────────────────────────────────── */

const BOT_PHRASES = [
  "digite",
  "tecle",
  "pressione",
  "opcao",
  "opção",
  "menu principal",
  "voltar ao menu",
  "atendimento eletronico",
  "atendimento eletrônico",
  "para falar com",
  "escolha uma das opcoes",
  "escolha uma das opções",
  "não entendi, pode repetir",
  "nao entendi, pode repetir",
  "obrigado por entrar em contato",
  "obrigada por entrar em contato",
  "seu protocolo",
  "numero de protocolo",
  "número de protocolo",
  "aguarde um momento",
  "transferindo para",
  "horario de atendimento",
  "horário de atendimento",
  "fora do horario",
  "fora do horário",
  "esta mensagem e automatica",
  "esta mensagem é automática",
  "mensagem automatica",
  "mensagem automática",
  "sou um assistente virtual",
  "sou uma assistente virtual",
  "atendimento automatizado",
  "chatbot",
  "bot de atendimento",
  "selecione a opcao",
  "selecione a opção",
  "responda com o numero",
  "responda com o número",
];

const BOT_REGEX: RegExp[] = [
  /selecione.*\d/i,
  /^\s*\d[\.\)\-:]\s+\S+/m, // "1. Vendas" / "2) Suporte"
  /^\s*[a-d][\.\)\-]\s+\S+/im,
  /\bprotocolo\s*[#nº°]?\s*\d{3,}/i,
  /\b(op[cç][aã]o|opcoes|opções)\s*\d/i,
  /\bdigite\s+\d\b/i,
  /\btecle\s+\d\b/i,
];

/* ─── types ──────────────────────────────────────────────────────────────── */

export type BotLoopChannel = "instagram" | "whatsapp";

export type BotLoopDecision =
  | {
      block: false;
      risk: number;
      signals: string[];
      reason?: string;
    }
  | {
      block: true;
      risk: number;
      signals: string[];
      reason: string;
      lockUntilMs: number;
      escalate: true;
    };

export type BotLoopEvaluateInput = {
  channel: BotLoopChannel;
  inboundText: string;
  /** Linhas recentes (Lead:/Atendente: ou raw) — últimos ~12–20 */
  historyLines?: string[];
  /** Últimas saídas nossas (texto puro) */
  lastOutgoing?: string[];
  lastInboundAtMs?: number | null;
  lastOutboundAtMs?: number | null;
  turnCount?: number;
  botInteractionScore?: number;
  lockedUntilMs?: number | null;
  nowMs?: number;
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRolePrefix(line: string): string {
  return String(line || "")
    .replace(/^(Lead|Atendente|Cliente|Bot|User|AI)\s*:\s*/i, "")
    .trim();
}

function isLeadLine(line: string): boolean {
  return /^(Lead|Cliente|User)\s*:/i.test(String(line || "").trim());
}

function isAgentLine(line: string): boolean {
  return /^(Atendente|Bot|AI|Assistente)\s*:/i.test(String(line || "").trim());
}

/** Contagem de frases de bot no texto (peso por ocorrência distinta). */
export function detectBotPhrases(text: string): string[] {
  const lower = normalize(text);
  if (!lower) return [];
  const hits: string[] = [];
  for (const phrase of BOT_PHRASES) {
    if (lower.includes(normalize(phrase))) hits.push(`phrase:${phrase}`);
  }
  for (const re of BOT_REGEX) {
    if (re.test(text)) hits.push(`regex:${re.source.slice(0, 40)}`);
  }
  return hits;
}

function menuDensity(text: string): number {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return 0;
  const menuLines = lines.filter((l) => /^\s*\d[\.\)\-:]\s+\S+/.test(l)).length;
  return menuLines / lines.length;
}

function extractLeadMessages(history: string[]): string[] {
  const out: string[] = [];
  for (const line of history) {
    if (isLeadLine(line) || (!isAgentLine(line) && !isLeadLine(line))) {
      // bare lines without role: treat as lead when mixed history uses labels only on agent
      const body = stripRolePrefix(line);
      if (body) out.push(body);
    }
  }
  // Prefer only Lead: when labels exist
  const labeled = history.filter(isLeadLine).map(stripRolePrefix).filter(Boolean);
  return labeled.length ? labeled : out;
}

function extractAgentMessages(history: string[], lastOutgoing: string[]): string[] {
  const fromHist = history.filter(isAgentLine).map(stripRolePrefix).filter(Boolean);
  if (fromHist.length) return fromHist;
  return (lastOutgoing || []).map((t) => String(t || "").trim()).filter(Boolean);
}

/* ─── main evaluate ──────────────────────────────────────────────────────── */

export function evaluateBotLoopRisk(input: BotLoopEvaluateInput): BotLoopDecision {
  const now = Number(input.nowMs || Date.now());
  const inbound = String(input.inboundText || "").trim();
  const history = Array.isArray(input.historyLines) ? input.historyLines.filter(Boolean).slice(-20) : [];
  const lastOutgoing = Array.isArray(input.lastOutgoing)
    ? input.lastOutgoing.map((t) => String(t || "").trim()).filter(Boolean).slice(-5)
    : [];
  const score = Math.max(0, Number(input.botInteractionScore || 0));
  const signals: string[] = [];
  let risk = 0;

  /* 0) Active lock — immediate block */
  const lockedUntil = Number(input.lockedUntilMs || 0);
  if (lockedUntil > now) {
    return {
      block: true,
      risk: 1,
      signals: ["active_lock"],
      reason: "bot_lock_active",
      lockUntilMs: lockedUntil,
      escalate: true,
    };
  }

  if (!inbound) {
    return { block: false, risk: 0, signals: [] };
  }

  /* 1) Phrase / regex bot lexicon on INBOUND (peer message) */
  const phraseHits = detectBotPhrases(inbound);
  if (phraseHits.length) {
    signals.push(...phraseHits.slice(0, 6));
    // Single weak phrase like "digite" alone is medium; multi-hit = strong bot IVR
    if (phraseHits.length >= 3) risk += 0.7;
    else if (phraseHits.length >= 2) risk += 0.55;
    else risk += 0.3;
  }

  // "Digite N ..." repeated (common IVR without "1. " menu format)
  const digiteCount = (inbound.match(/\bdigite\s+\d\b/gi) || []).length;
  if (digiteCount >= 2) {
    signals.push(`digite_options:${digiteCount}`);
    risk += 0.35;
  }

  const density = menuDensity(inbound);
  if (density >= 0.4) {
    signals.push(`menu_density:${density.toFixed(2)}`);
    risk += 0.4;
  } else if (density >= 0.25) {
    signals.push(`menu_density:${density.toFixed(2)}`);
    risk += 0.2;
  }

  /* 2) Self-echo — peer pasted / mirrored our last reply (classic bot↔bot) */
  for (let i = 0; i < Math.min(3, lastOutgoing.length); i++) {
    const sim = textSimilarity(inbound, lastOutgoing[i]);
    if (sim >= SELF_ECHO_SIM) {
      signals.push(`self_echo:${(sim * 100).toFixed(0)}%`);
      risk += 0.7; // alone is enough to block
      break;
    }
  }

  /* 3) Bilateral repetition — both sides stuck on similar templates */
  const leadMsgs = extractLeadMessages(history).slice(-4);
  const agentMsgs = extractAgentMessages(history, lastOutgoing).slice(-4);
  if (leadMsgs.length >= 2 && agentMsgs.length >= 2) {
    const leadSim = textSimilarity(leadMsgs[leadMsgs.length - 1], leadMsgs[leadMsgs.length - 2]);
    const agentSim = textSimilarity(agentMsgs[agentMsgs.length - 1], agentMsgs[agentMsgs.length - 2]);
    if (leadSim >= BILATERAL_SIM && agentSim >= BILATERAL_SIM) {
      signals.push(`bilateral_loop:lead=${(leadSim * 100).toFixed(0)}% agent=${(agentSim * 100).toFixed(0)}%`);
      risk += 0.5;
    }
  }

  /* 4) Accumulated bot score from memory */
  if (score >= SCORE_HARD) {
    signals.push(`bot_score:${score}`);
    risk += 0.45;
  } else if (score >= SCORE_SOFT) {
    signals.push(`bot_score:${score}`);
    risk += 0.3;
  }

  /* 5) Rapid ping-pong velocity */
  const lastOut = Number(input.lastOutboundAtMs || 0);
  const lastIn = Number(input.lastInboundAtMs || 0);
  if (lastOut > 0 && now - lastOut < RAPID_REPLY_MS && phraseHits.length > 0) {
    signals.push(`rapid_after_our_reply:${Math.round((now - lastOut) / 1000)}s`);
    risk += 0.25;
  }
  if (lastOut > 0 && lastIn > 0 && Math.abs(lastIn - lastOut) < PING_PONG_WINDOW_MS && score >= 1) {
    signals.push("ping_pong_window");
    risk += 0.2;
  }

  /* 6) Multiple numbered options + long formal blob */
  if (inbound.length > 180 && phraseHits.length >= 1 && /\d[\.\)\-]/.test(inbound)) {
    signals.push("long_menu_blob");
    risk += 0.15;
  }

  risk = Math.min(1, risk);

  /* Soft allow: single weak "digite" without menu / score / echo → human maybe */
  if (
    risk < RISK_BLOCK &&
    phraseHits.length === 1 &&
    phraseHits[0].includes("digite") &&
    density < 0.25 &&
    score < SCORE_SOFT
  ) {
    return { block: false, risk, signals, reason: "weak_digite_allow" };
  }

  if (risk < RISK_BLOCK) {
    return { block: false, risk, signals };
  }

  const hard = risk >= RISK_HARD || score >= SCORE_HARD;
  const lockMs = hard ? LOCK_MS_HARD : LOCK_MS_DEFAULT;
  const reason =
    signals.find((s) => s.startsWith("self_echo"))
      ? "peer_bot_echo"
      : signals.find((s) => s.startsWith("bilateral"))
        ? "bilateral_loop"
        : signals.find((s) => s.startsWith("menu") || s.startsWith("phrase") || s.startsWith("regex"))
          ? "peer_bot_menu"
          : signals.includes("active_lock")
            ? "bot_lock_active"
            : score >= SCORE_SOFT
              ? "bot_score_threshold"
              : "bot_loop_risk";

  return {
    block: true,
    risk,
    signals,
    reason,
    lockUntilMs: now + lockMs,
    escalate: true,
  };
}

/* ─── persist helpers ────────────────────────────────────────────────────── */

export async function applyBotLoopBlock(opts: {
  conversationId: string;
  decision: Extract<BotLoopDecision, { block: true }>;
  channel: BotLoopChannel;
}): Promise<void> {
  const id = String(opts.conversationId || "").trim();
  if (!id) return;
  try {
    await conversationMemoryService.applyBotLock(id, {
      untilMs: opts.decision.lockUntilMs,
      reason: opts.decision.reason,
      signals: opts.decision.signals,
      bumpScore: true,
    });
    logger.info(
      `[BotLoopGuard] BLOCK channel=${opts.channel} conv=${id.slice(0, 48)} reason=${opts.decision.reason} risk=${opts.decision.risk.toFixed(2)} signals=${opts.decision.signals.slice(0, 5).join(",")}`,
    );
  } catch (e: any) {
    logger.warn(`[BotLoopGuard] applyBotLock failed: ${e?.message || e}`);
  }
}

/**
 * Convenience for Instagram: load memory + evaluate + optionally lock.
 * Does NOT load full message history — pass history when available.
 */
/** Load recent IG turns as history lines for the guard (best-effort). */
export async function loadIgContextForGuard(
  brandId: string,
  senderId: string,
): Promise<{
  historyLines: string[];
  lastOutgoing: string[];
  lastInboundAtMs: number | null;
  lastOutboundAtMs: number | null;
}> {
  try {
    const { instagramService } = await import("./instagram");
    const rows = await instagramService.listMessagesForSender(brandId, senderId, 25);
    const historyLines = rows.map((r) =>
      r.direction === "outgoing" ? `Atendente: ${r.text}` : `Lead: ${r.text}`,
    );
    const lastOutgoing = rows
      .filter((r) => r.direction === "outgoing")
      .map((r) => r.text)
      .slice(-5);
    let lastInboundAtMs: number | null = null;
    let lastOutboundAtMs: number | null = null;
    for (const r of rows) {
      const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      if (r.direction === "incoming") lastInboundAtMs = t;
      else lastOutboundAtMs = t;
    }
    return { historyLines, lastOutgoing, lastInboundAtMs, lastOutboundAtMs };
  } catch {
    return {
      historyLines: [],
      lastOutgoing: [],
      lastInboundAtMs: null,
      lastOutboundAtMs: null,
    };
  }
}

export async function evaluateAndMaybeLockIg(input: {
  brandId: string;
  senderId: string;
  inboundText: string;
  historyLines?: string[];
  lastOutgoing?: string[];
  lastInboundAtMs?: number | null;
  lastOutboundAtMs?: number | null;
  /** When true (default), load history from DB if not provided */
  autoLoadHistory?: boolean;
}): Promise<BotLoopDecision> {
  const convId = igConversationId(input.brandId, input.senderId);
  const mem = await conversationMemoryService.load(convId);

  let historyLines = input.historyLines;
  let lastOutgoing = input.lastOutgoing;
  let lastInboundAtMs = input.lastInboundAtMs;
  let lastOutboundAtMs = input.lastOutboundAtMs;

  if (input.autoLoadHistory !== false && (!historyLines || !historyLines.length)) {
    const ctx = await loadIgContextForGuard(input.brandId, input.senderId);
    historyLines = ctx.historyLines;
    lastOutgoing = lastOutgoing?.length ? lastOutgoing : ctx.lastOutgoing;
    lastInboundAtMs = lastInboundAtMs ?? ctx.lastInboundAtMs;
    lastOutboundAtMs = lastOutboundAtMs ?? ctx.lastOutboundAtMs;
  }

  const decision = evaluateBotLoopRisk({
    channel: "instagram",
    inboundText: input.inboundText,
    historyLines,
    lastOutgoing,
    lastInboundAtMs,
    lastOutboundAtMs,
    turnCount: mem?.turn_count,
    botInteractionScore: mem?.bot_interaction_score,
    lockedUntilMs: mem?.bot_lock_until_ms || null,
  });
  if (decision.block) {
    await applyBotLoopBlock({ conversationId: convId, decision, channel: "instagram" });
  } else if (decision.signals.length && (decision.risk >= 0.35 || detectBotPhrases(input.inboundText).length)) {
    // Soft signal: bump score without locking so next turn is stricter
    try {
      await conversationMemoryService.bumpBotScore(convId, 1);
    } catch {
      /* ignore */
    }
  }
  return decision;
}

export async function evaluateAndMaybeLockWa(input: {
  conversationId: string;
  inboundText: string;
  historyLines?: string[];
  lastOutgoing?: string[];
  lastInboundAtMs?: number | null;
  lastOutboundAtMs?: number | null;
}): Promise<BotLoopDecision> {
  const convId = String(input.conversationId || "").trim();
  const mem = convId ? await conversationMemoryService.load(convId) : null;
  const decision = evaluateBotLoopRisk({
    channel: "whatsapp",
    inboundText: input.inboundText,
    historyLines: input.historyLines,
    lastOutgoing: input.lastOutgoing,
    lastInboundAtMs: input.lastInboundAtMs,
    lastOutboundAtMs: input.lastOutboundAtMs,
    turnCount: mem?.turn_count,
    botInteractionScore: mem?.bot_interaction_score,
    lockedUntilMs: mem?.bot_lock_until_ms || null,
  });
  if (decision.block && convId) {
    await applyBotLoopBlock({ conversationId: convId, decision, channel: "whatsapp" });
  } else if (convId && decision.signals.length && decision.risk >= 0.35) {
    try {
      await conversationMemoryService.bumpBotScore(convId, 1);
    } catch {
      /* ignore */
    }
  }
  return decision;
}
