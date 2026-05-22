/**
 * RESPONSE GATE (Fase 16.1)
 *
 * Decisor binário "responder ou ficar quieto" rodado ANTES do Reasoner.
 * Sem LLM — heurísticas determinísticas + regex. Roda em <1ms.
 *
 * Por que existe: hoje o agente responde a TUDO que chega — incluindo:
 *   - reações ("👍" em uma mensagem nossa)
 *   - ack curtos sem conteúdo ("ok", "tá", "blz")
 *   - emojis isolados
 *   - mensagens duplicadas que já estamos processando
 *
 * Isso deixa o agente parecendo "bobo": agradece curtidas, responde "👍" com texto, etc.
 *
 * Saída: `{ shouldRespond, reasonCode, reasonHuman, suggestedTone? }`.
 * O caller (CognitiveAgent) usa `shouldRespond=false` pra sair cedo sem chamar LLM,
 * gravar no silence_log e retornar texto vazio para o whatsappAgent não enviar nada.
 */

export type MessageType =
  | "text"
  | "reaction"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "other";

export type SuggestedTone =
  | "normal"
  | "conciso"      // cliente seco / curto → ser direto
  | "amigavel"    // cliente caloroso → manter calor
  | "respeitoso"; // cliente frustrado → cuidado, sem prolixidade

export interface ResponseGateInput {
  incomingMessage: string;
  messageType?: MessageType;
  /** Mensagens anteriores (mais recente = primeira) — usadas pra detectar padrões emocionais. */
  conversationHistory?: string[];
  /** Últimas mensagens que NÓS enviamos (mais recente = primeira). */
  lastOutgoingMessages?: string[];
  /** Quando a última mensagem nossa saiu (epoch ms). Usado pra detectar "cliente em silêncio depois de cobrança". */
  lastOutgoingAtMs?: number | null;
}

export type GateReasonCode =
  | "ok"
  | "reaction"              // emoji-reaction em mensagem nossa
  | "ack_only"              // só "ok", "tá", "blz", sem conteúdo
  | "single_emoji"          // mensagem só com 1 emoji (sem texto)
  | "duplicate_recent"      // cliente reenviou a mesma coisa que já mandou recentemente
  | "echo_of_ours"          // cliente copiou/citou nossa última mensagem
  | "system_event";         // location/contact/sticker sem texto

export interface ResponseGateOutput {
  shouldRespond: boolean;
  reasonCode: GateReasonCode;
  reasonHuman: string;
  suggestedTone: SuggestedTone;
  /** Confidence in the silence decision (0-1). >= 0.7 = safe to skip. */
  confidence: number;
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

/** Acks isolados — palavras curtas que sozinhas não pedem resposta. */
const ACK_WORDS = new Set([
  "ok", "okay", "okk", "okok",
  "ta", "tá", "blz", "beleza", "bele",
  "ss", "sim", "uhum", "uhmm", "humm",
  "vlw", "vlww", "valeu", "obg", "obgd", "obrigado", "obrigada",
  "show", "top", "massa", "bacana", "legal",
  "kk", "kkk", "kkkk", "kkkkk", "kkkkkk", "rs", "rsrs", "haha", "hahaha", "hehe",
  "👍", "👌", "🙏", "❤️", "❤", "🙌", "💪", "🔥", "👏", "😅", "😂", "🤣",
]);

/** Detect when a string is only emoji + whitespace (no actual words). */
function isSingleEmoji(text: string): boolean {
  if (!text) return false;
  /* Strip whitespace + variation selectors + zero-width joiners */
  const stripped = text.replace(/[\s‍️]/g, "");
  if (!stripped) return false;
  /* If there's any ASCII letter/digit, it's not pure emoji */
  if (/[A-Za-z0-9À-ÿ]/.test(stripped)) return false;
  return true;
}

/** Normalize for ack matching: lowercase, strip punctuation, collapse spaces. */
function normalizeAckCheck(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:'"()]/g, "")
    .replace(/\s+/g, " ");
}

/** Direct question heuristic — short messages with "?" or imperatives that DO need a reply. */
function isDirectQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  /* Common question/request starters even without "?" */
  if (/^(tem|quanto|qto|qnt|qual|onde|quando|como|posso|pode|consegue|envia|manda|mande)\b/i.test(t)) return true;
  return false;
}

/** Heuristic for emotional tone of the lead based on recent history. */
function detectIncomingTone(history: string[]): SuggestedTone {
  /* Look at last 3 incoming messages: if they're all <= 8 chars, lead is being SECO */
  const recent = history.slice(0, 3).filter(Boolean);
  if (recent.length === 0) return "normal";
  const avgLen = recent.reduce((a, m) => a + m.length, 0) / recent.length;
  if (avgLen <= 8) return "conciso";
  /* If lead used "obg", "vlw", "valeu", they're being amigavel */
  const lower = recent.join(" ").toLowerCase();
  if (/\b(obrigad|vlw|valeu|amei|incr[íi]vel|maravilh)/.test(lower)) return "amigavel";
  /* If lead complained ("nao gostei", "feio", "ruim", "demorou", "caro") → respeitoso */
  if (/\b(n[aã]o gostei|feio|ruim|p[ée]ssimo|demorou|caro demais|absurdo|nunca mais)/.test(lower)) return "respeitoso";
  return "normal";
}

/** Has the lead repeated the same content we just got? Cheap fuzzy by normalized prefix. */
function isDuplicateOfPreviousIncoming(text: string, history: string[]): boolean {
  const norm = normalizeAckCheck(text).slice(0, 80);
  if (!norm || norm.length < 6) return false;
  return history.slice(0, 3).some((h) => normalizeAckCheck(h).slice(0, 80) === norm);
}

/** Did the lead just paste back something we said? */
function isEchoOfOurs(text: string, ours: string[]): boolean {
  const norm = normalizeAckCheck(text);
  if (norm.length < 10) return false;
  return ours.slice(0, 3).some((o) => {
    const our = normalizeAckCheck(o);
    /* Substantial overlap = echo */
    return our.length >= 10 && (our.includes(norm) || norm.includes(our));
  });
}

/* ─── main ──────────────────────────────────────────────────────────────── */

export function decideResponse(input: ResponseGateInput): ResponseGateOutput {
  const message = String(input.incomingMessage || "").trim();
  const messageType = input.messageType || "text";
  const history = Array.isArray(input.conversationHistory) ? input.conversationHistory : [];
  const ours = Array.isArray(input.lastOutgoingMessages) ? input.lastOutgoingMessages : [];

  /* 1. REACTION — sempre silenciar. Reaction é feedback passivo, não pedido. */
  if (messageType === "reaction") {
    return {
      shouldRespond: false,
      reasonCode: "reaction",
      reasonHuman: "Cliente apenas reagiu (👍/❤️) a uma mensagem nossa — não pediu nada.",
      suggestedTone: detectIncomingTone(history),
      confidence: 0.95,
    };
  }

  /* 2. EVENTOS DE SISTEMA sem texto: stickers, location, contact, audio sem transcrição.
   *    Imagem/vídeo COM caption usuário cai em "text" via inbox.ts e segue o fluxo;
   *    sem caption também passa, mas o agente deve receber e decidir analisar. */
  if (["sticker"].includes(messageType) && !message) {
    return {
      shouldRespond: false,
      reasonCode: "system_event",
      reasonHuman: "Cliente enviou figurinha sem texto — comportamento social, sem demanda.",
      suggestedTone: "normal",
      confidence: 0.85,
    };
  }

  /* 3. SINGLE EMOJI — "👍" "❤️" "🙏" sozinho, mesmo que venha como texto comum. */
  if (isSingleEmoji(message)) {
    return {
      shouldRespond: false,
      reasonCode: "single_emoji",
      reasonHuman: `Cliente respondeu só com emoji ("${message}") — equivale a uma reação.`,
      suggestedTone: detectIncomingTone(history),
      confidence: 0.9,
    };
  }

  /* 4. ACK-ONLY — "ok", "tá", "blz", "vlw" etc, mas SÓ se a última mensagem nossa
   *    NÃO foi uma pergunta direta (pergunta nossa = resposta curta do cliente é válida). */
  const normalized = normalizeAckCheck(message);
  const tokens = normalized.split(" ").filter(Boolean);
  const allTokensAreAcks = tokens.length > 0 && tokens.length <= 3 && tokens.every((t) => ACK_WORDS.has(t));
  if (allTokensAreAcks && !isDirectQuestion(message)) {
    /* Se a nossa última mensagem terminou em "?" ou pediu confirmação,
     * o "ok" do cliente é uma CONFIRMAÇÃO que pode merecer follow-up.
     * Mas isso já entra na lógica do Reasoner — gate só silencia se não houver pergunta nossa pendente. */
    const lastOurs = ours[0] || "";
    const ourLastWasQuestion = lastOurs.trim().endsWith("?") || /\b(confirma|pode|posso|vamos|fechado|certo)\b\??\s*$/i.test(lastOurs);
    if (!ourLastWasQuestion) {
      return {
        shouldRespond: false,
        reasonCode: "ack_only",
        reasonHuman: `Cliente disse apenas "${message}" sem demanda — equivale a "recebi".`,
        suggestedTone: detectIncomingTone(history),
        confidence: 0.8,
      };
    }
    /* Se foi resposta a pergunta nossa, deixa passar (Reasoner decide o follow-up). */
  }

  /* 5. DUPLICATE — cliente mandou exatamente a mesma coisa que mandou nas últimas 3. */
  if (isDuplicateOfPreviousIncoming(message, history.filter((h) => !h.startsWith("Atendente:")))) {
    return {
      shouldRespond: false,
      reasonCode: "duplicate_recent",
      reasonHuman: "Cliente reenviou a mesma mensagem que já estamos processando.",
      suggestedTone: detectIncomingTone(history),
      confidence: 0.75,
    };
  }

  /* 6. ECHO OF OURS — cliente colou de volta o que falamos. */
  if (isEchoOfOurs(message, ours)) {
    return {
      shouldRespond: false,
      reasonCode: "echo_of_ours",
      reasonHuman: "Cliente apenas citou/repetiu o que dissemos, sem demanda nova.",
      suggestedTone: detectIncomingTone(history),
      confidence: 0.7,
    };
  }

  /* DEFAULT: respond, with tone hint for the Composer. */
  return {
    shouldRespond: true,
    reasonCode: "ok",
    reasonHuman: "Mensagem com conteúdo que pede resposta.",
    suggestedTone: detectIncomingTone(history),
    confidence: 0.0, // not a silence decision
  };
}
