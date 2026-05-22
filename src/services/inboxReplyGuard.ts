/**
 * inboxReplyGuard — validações anti-duplicação e anti-alucinação para
 * respostas automáticas da IA no inbox.
 *
 * Centraliza as checagens que decidem se uma resposta gerada pelo
 * `whatsappAgentService.generateReply()` pode ou NÃO ser enviada.
 *
 * Princípio: melhor não enviar do que enviar errado. Em caso de dúvida,
 * abortamos a resposta — a conversa permanece "viva" e o atendente humano
 * pode responder manualmente. Nunca enviamos eco, lixo, ou mesma resposta
 * que já foi enviada antes.
 */

/* ─── Configuráveis ─────────────────────────────────────────── */

/** Mínimo aceitável de caracteres na resposta (texto significativo). */
const MIN_LENGTH = 4;
/** Máximo razoável de caracteres (WhatsApp aceita até ~4096, mas resposta longa demais é red flag). */
const MAX_LENGTH = 2000;
/** Similaridade Jaccard >= esse valor contra QUALQUER das últimas respostas = duplicado. */
const DUPLICATE_THRESHOLD = 0.85;
/** Quantas mensagens anteriores da IA olhar para detectar loop. */
const LOOKBACK_OUTGOING = 5;
/** Segundos mínimos entre 2 respostas para o mesmo JID (anti-spam). */
const MIN_SECONDS_BETWEEN_REPLIES = 8;
/** Confiança mínima do reasoner cognitivo (0..1). Abaixo disso, NÃO enviamos —
 *  é melhor passar pro humano do que arriscar mensagem errada. */
const MIN_CONFIDENCE = 0.55;
/** Quantas mensagens TOTAIS na conversa marcam ela como "avançada".
 *  Em conversa avançada, saudações genéricas viram red flag (provavelmente
 *  a IA perdeu o contexto e está começando do zero). */
const ADVANCED_CONVERSATION_THRESHOLD = 4;
/** Padrões de placeholders não resolvidos (alucinação por template incompleto). */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[nome\]/i,
  /\[cliente\]/i,
  /\[empresa\]/i,
  /\[produto\]/i,
  /\[lead\]/i,
  /\{\{\s*\w+\s*\}\}/,
  /\$\{[^}]+\}/,
  /<<\s*\w+\s*>>/,
];

/** Aberturas de "primeira mensagem" que NÃO podem aparecer em conversa avançada
 *  (sinal forte de que a IA perdeu o histórico ou está repetindo a abertura). */
const GREETING_OPENERS: RegExp[] = [
  /^(oi|ola|olá)[\s,!.\u{1F44B}]/iu,
  /^bom\s+dia/i,
  /^boa\s+tarde/i,
  /^boa\s+noite/i,
  /^(tudo\s+bem)/i,
  /^(em\s+que\s+posso\s+(te\s+)?ajudar)/i,
  /^(como\s+posso\s+(te\s+)?ajudar)/i,
  /^(meu\s+nome\s+é|me\s+chamo)/i,
  /^(sou\s+(a|o)\s+\w+(\s+\w+)?\s+da)/i,
];

/* ─── Tipos ─────────────────────────────────────────────────── */

export interface ReplyGuardContext {
  /** Texto gerado pela IA, antes de ser enviado. */
  candidate: string;
  /** Texto da mensagem que o lead acabou de mandar (para detectar eco). */
  incomingMessage: string;
  /** Últimas respostas enviadas pela IA nessa conversa (mais recente primeiro). */
  lastOutgoingMessages: string[];
  /** Timestamp (Unix em segundos) da última msg enviada pela IA, se houver. */
  lastOutgoingAtUnix?: number | null;
  /** Agora (Unix em segundos) — injetado para testabilidade. */
  nowUnix?: number;
  /** Total de mensagens já trocadas na conversa (lead + IA). Permite detectar
   *  saudações genéricas que NÃO podem aparecer em conversa avançada. */
  conversationDepth?: number;
  /** Confiança do reasoner cognitivo (0..1), quando disponível.
   *  Abaixo de MIN_CONFIDENCE bloqueamos e passamos pro humano. */
  cognitiveConfidence?: number | null;
  /** Resumo das últimas mensagens do LEAD para detectar contradição (ex: IA
   *  pergunta algo que o lead já respondeu). Cada item: texto do lead. */
  recentIncomingFromLead?: string[];
}

export type ReplyGuardVerdict =
  | { ok: true }
  | { ok: false; reason: string; detail?: string };

/* ─── Helpers ───────────────────────────────────────────────── */

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similaridade Jaccard sobre conjuntos de palavras únicas.
 * Pondera por união — duas mensagens IDÊNTICAS dão 1.0,
 * duas SEM palavras em comum dão 0.0.
 */
export function textSimilarity(a: string, b: string): number {
  const aN = normalize(a);
  const bN = normalize(b);
  if (!aN || !bN) return 0;
  if (aN === bN) return 1;

  const aWords = new Set(aN.split(" ").filter((w) => w.length >= 2));
  const bWords = new Set(bN.split(" ").filter((w) => w.length >= 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  for (const w of aWords) if (bWords.has(w)) intersection++;
  const union = new Set([...aWords, ...bWords]).size;
  return union > 0 ? intersection / union : 0;
}

/* ─── Validador principal ───────────────────────────────────── */

export function validateReplyCandidate(ctx: ReplyGuardContext): ReplyGuardVerdict {
  const candidate = String(ctx.candidate || "").trim();

  /* 1) Tamanho */
  if (candidate.length < MIN_LENGTH) {
    return { ok: false, reason: "too_short", detail: `apenas ${candidate.length} chars` };
  }
  if (candidate.length > MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      detail: `${candidate.length} chars (max ${MAX_LENGTH}) — provavelmente IA viajou`,
    };
  }

  /* 2) Placeholders não-resolvidos (template não preenchido) */
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(candidate)) {
      return {
        ok: false,
        reason: "unresolved_placeholder",
        detail: `padrao ${pattern.source} detectado — template nao foi preenchido pela IA`,
      };
    }
  }

  /* 3) Vazamento de histórico — IA copiando rótulos "Atendente:" / "Lead:" */
  const labelLeakRegex = /^\s*(Atendente|Lead|Cliente|Assistente|Bot|User|AI)\s*:\s/im;
  if (labelLeakRegex.test(candidate)) {
    return {
      ok: false,
      reason: "history_label_leak",
      detail: 'IA copiou rotulos tipo "Atendente:" ou "Lead:" do contexto',
    };
  }

  /* 4) Eco — resposta = mensagem do lead (com tolerância) */
  if (ctx.incomingMessage) {
    const echoSim = textSimilarity(candidate, ctx.incomingMessage);
    if (echoSim >= 0.9) {
      return {
        ok: false,
        reason: "echo_user_message",
        detail: `similaridade ${(echoSim * 100).toFixed(0)}% com a mensagem recebida`,
      };
    }
  }

  /* 5) Duplicação contra últimas respostas da IA */
  const recentOutgoing = (ctx.lastOutgoingMessages || []).slice(0, LOOKBACK_OUTGOING);
  for (let i = 0; i < recentOutgoing.length; i++) {
    const sim = textSimilarity(candidate, recentOutgoing[i]);
    if (sim >= DUPLICATE_THRESHOLD) {
      return {
        ok: false,
        reason: i === 0 ? "duplicate_last_reply" : "loop_pattern",
        detail: `similaridade ${(sim * 100).toFixed(0)}% com resposta anterior (posicao ${i + 1})`,
      };
    }
  }

  /* 6) Throttle — não responder em rajada */
  if (ctx.lastOutgoingAtUnix && ctx.nowUnix !== undefined) {
    const deltaSeconds = ctx.nowUnix - ctx.lastOutgoingAtUnix;
    if (deltaSeconds < MIN_SECONDS_BETWEEN_REPLIES) {
      return {
        ok: false,
        reason: "throttled",
        detail: `apenas ${deltaSeconds}s desde a ultima resposta (min ${MIN_SECONDS_BETWEEN_REPLIES}s)`,
      };
    }
  }

  /* 7) Confiança do reasoner cognitivo — passou pelo modelo mas com baixa certeza */
  if (
    ctx.cognitiveConfidence !== undefined &&
    ctx.cognitiveConfidence !== null &&
    ctx.cognitiveConfidence < MIN_CONFIDENCE
  ) {
    return {
      ok: false,
      reason: "low_confidence",
      detail: `confianca ${(ctx.cognitiveConfidence * 100).toFixed(0)}% < ${(MIN_CONFIDENCE * 100).toFixed(0)}% — passar pro humano e mais seguro`,
    };
  }

  /* 8) Saudação genérica em conversa avançada — sinal de que a IA perdeu o contexto */
  const depth = ctx.conversationDepth || 0;
  if (depth >= ADVANCED_CONVERSATION_THRESHOLD) {
    for (const pattern of GREETING_OPENERS) {
      if (pattern.test(candidate)) {
        /* Ainda permite se o lead acabou de cumprimentar (resposta espelho) */
        const incomingIsGreeting = ctx.incomingMessage
          ? GREETING_OPENERS.some((p) => p.test(ctx.incomingMessage.trim()))
          : false;
        if (!incomingIsGreeting) {
          return {
            ok: false,
            reason: "generic_greeting_in_advanced_conversation",
            detail: `conversa tem ${depth} msgs trocadas mas IA respondeu com abertura tipo "${candidate.slice(0, 40)}". Provavel perda de contexto.`,
          };
        }
      }
    }
  }

  /* 9) Contradição: IA pergunta algo que o lead já informou claramente
   *    Heurística leve — bloqueia se a resposta contém "?" pedindo informação
   *    que aparece em mensagem anterior do lead. */
  const recentFromLead = ctx.recentIncomingFromLead || [];
  if (recentFromLead.length > 0 && /\?/.test(candidate)) {
    const candidateNorm = normalize(candidate);
    /* Procura padrões "qual o seu X" / "me passa seu X" / "qual seu X" */
    const questionMatches = candidateNorm.match(/(qual o seu|qual seu|me passa o seu|me passa seu|me informa o seu|me informa seu)\s+(\w+)/g) || [];
    for (const q of questionMatches) {
      const askedWord = q.split(/\s+/).pop() || "";
      if (askedWord.length < 3) continue;
      /* Palavras que provavelmente o lead já informou se aparecem nas msgs anteriores */
      const askedSensitive = ["nome", "telefone", "celular", "email", "cidade", "empresa", "endereco"].includes(askedWord);
      if (!askedSensitive) continue;
      for (const leadMsg of recentFromLead) {
        const leadNorm = normalize(leadMsg);
        /* Pista grossa: lead mandou email/telefone/nome em texto livre nas msgs recentes */
        if (
          (askedWord === "email" && /@/.test(leadMsg)) ||
          ((askedWord === "telefone" || askedWord === "celular") && /\d{8,}/.test(leadMsg)) ||
          (askedWord === "nome" && leadNorm.split(" ").length <= 4 && leadNorm.length >= 4 && /^[a-z\s]+$/.test(leadNorm)) ||
          (leadNorm.includes(`meu ${askedWord}`) || leadNorm.includes(`sou da`) || leadNorm.includes(`moro em`))
        ) {
          return {
            ok: false,
            reason: "contradicts_history",
            detail: `IA esta perguntando "${askedWord}" mas o lead ja informou em mensagem anterior. Provavel perda de contexto.`,
          };
        }
      }
    }
  }

  return { ok: true };
}
