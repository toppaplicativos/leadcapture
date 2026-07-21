/**
 * WhatsApp interactive delivery policy:
 * - cold outreach: prefer numbered text + AI intent on reply
 * - warm / in-flow: prefer native buttons
 */

import type { ResponseClassification } from "./responseIntelligence";

export type InteractiveStrategy = "prefer_native" | "cold_text_then_ai" | "native_only" | "auto";

export type IntentAction = {
  intent: string;
  flowId?: string;
  optionId?: string;
  action?: "opt_out" | "tag_only" | "start_flow" | string;
};

export type OptionItem = {
  id?: string;
  label?: string;
  title?: string;
  productId?: string;
  flowId?: string;
  url?: string;
};

export function normalizeInteractiveStrategy(raw: unknown): InteractiveStrategy {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "cold_text_then_ai" || v === "cold" || v === "text_ai") return "cold_text_then_ai";
  if (v === "native_only" || v === "native") return "native_only";
  if (v === "prefer_native") return "prefer_native";
  if (v === "auto") return "auto";
  return "auto";
}

/** Build numbered text options for cold / fallback delivery. */
export function formatButtonsAsNumberedText(
  body: string,
  options: Array<{ label?: string; title?: string }>,
): string {
  const head = String(body || "").trim() || "Escolha uma opção:";
  const lines = options
    .map((o, i) => {
      const label = String(o.label || o.title || "").trim();
      return label ? `${i + 1}) ${label}` : "";
    })
    .filter(Boolean);
  if (!lines.length) return head;
  return [
    head,
    "",
    ...lines,
    "",
    "Responda com o *número* da opção ou diga o que precisa — entendo o contexto.",
  ].join("\n");
}

/**
 * Match free-text / number reply to an option list (same rules as flow match).
 */
export function resolveOptionFromFreeReply(
  rawText: string,
  options: OptionItem[],
): OptionItem | null {
  const text = String(rawText || "").trim();
  if (!text || !options.length) return null;

  // strip [button_reply] wrappers if present
  const cleaned = text
    .replace(/^\[(button_reply|list_reply|interactive_reply|option_reply)\]\s*/i, "")
    .replace(/\s*\(id:[^)]+\)\s*$/i, "")
    .trim();

  // number choice: "1", "2)", "opcao 3"
  const numMatch = cleaned.match(/^(?:op(?:c|ç)?[aã]o\s*)?(\d{1,2})[).:-]?\s*$/i);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
  }

  const lower = cleaned.toLowerCase();
  for (const opt of options) {
    const id = String(opt.id || "").trim().toLowerCase();
    const label = String(opt.label || opt.title || "").trim().toLowerCase();
    if (id && (lower === id || lower.includes(id))) return opt;
    if (label && (lower === label || lower.includes(label) || label.includes(lower))) return opt;
  }
  return null;
}

/** Map RI classification intent to configured intentActions. */
export function matchIntentAction(
  classification: Pick<ResponseClassification, "intent" | "confidence"> & { freeIntent?: string },
  actions: IntentAction[],
  minConfidence = 0.55,
): IntentAction | null {
  if (!actions?.length) return null;
  if (Number(classification.confidence || 0) < minConfidence) return null;

  const intent = String(classification.freeIntent || classification.intent || "")
    .trim()
    .toLowerCase();
  if (!intent) return null;

  const exact = actions.find((a) => String(a.intent || "").trim().toLowerCase() === intent);
  if (exact) return exact;

  // aliases
  const aliases: Record<string, string[]> = {
    interested: ["interesse", "quero", "sim", "catalogo", "catálogo", "comprar"],
    price: ["preco", "preço", "valor", "orcamento", "orçamento"],
    negative: ["nao", "não", "sem_interesse"],
    opt_out: ["parar", "sair", "remover", "bloqueio"],
    neutral: ["talvez", "depois", "ok"],
  };
  for (const a of actions) {
    const key = String(a.intent || "").trim().toLowerCase();
    if (key === intent) return a;
    const list = aliases[key] || [];
    if (list.some((x) => intent.includes(x) || x.includes(intent))) return a;
    // free-form intent labels
    if (key && (intent.includes(key) || key.includes(intent))) return a;
  }
  return null;
}

/**
 * Default intentActions when campaign only has replyStartFlowId.
 */
export function defaultIntentActionsFromFlow(flowId: string): IntentAction[] {
  const id = String(flowId || "").trim();
  if (!id) return [];
  return [
    { intent: "interested", flowId: id, action: "start_flow" },
    { intent: "price", flowId: id, action: "start_flow" },
  ];
}
