import { aiRouter } from "../aiRouter";
import { logger } from "../../utils/logger";
import type { AdminAgentMemory } from "./sessionStore";
import type { AgentTurn } from "./types";

const TOPIC_PATTERNS: Array<{ re: RegExp; topic: string }> = [
  { re: /afiliado|parceiro|comissão/i, topic: "afiliados" },
  { re: /instagram|facebook|meta/i, topic: "redes sociais" },
  { re: /whatsapp|mensagem|inbox/i, topic: "mensagens" },
  { re: /campanha|disparo/i, topic: "campanhas" },
  { re: /produto|catálogo|estoque/i, topic: "produtos" },
  { re: /lead|cliente|crm/i, topic: "crm" },
  { re: /pedido|checkout/i, topic: "pedidos" },
  { re: /automação|fluxo/i, topic: "automações" },
];

const PREF_PATTERNS: Array<{ re: RegExp; key: string; extract: (m: RegExpMatchArray) => string }> = [
  {
    re: /(?:prefiro|sempre use|padrão)\s+(whatsapp|instagram|email)/i,
    key: "canal_preferido",
    extract: (m) => m[1].toLowerCase(),
  },
  {
    re: /(?:cidade|região)\s+(?:padrão|fixa)?\s*:?\s*([A-Za-zÀ-ú\s]{3,40})/i,
    key: "cidade_padrao",
    extract: (m) => m[1].trim(),
  },
];

type MemoryExtraction = {
  facts_to_add?: string[];
  facts_to_remove?: string[];
  preferences?: Record<string, string>;
  topics?: string[];
};

export function mergeMemoryFromTurn(
  memory: AdminAgentMemory,
  userMessage: string,
  turn?: AgentTurn,
): AdminAgentMemory {
  const next: AdminAgentMemory = {
    facts: [...memory.facts],
    preferences: { ...memory.preferences },
    last_topics: [...memory.last_topics],
    turn_count: memory.turn_count + 1,
  };

  const text = `${userMessage} ${turn?.message || ""}`.trim();
  if (!text) return next;

  for (const { re, topic } of TOPIC_PATTERNS) {
    if (re.test(text)) {
      next.last_topics = dedupe([topic, ...next.last_topics]).slice(0, 8);
    }
  }

  if (turn?.skill) {
    const squad = turn.squad || turn.skill.split(".")[0];
    next.last_topics = dedupe([squad, ...next.last_topics]).slice(0, 8);
  }

  for (const { re, key, extract } of PREF_PATTERNS) {
    const m = text.match(re);
    if (m) next.preferences[key] = extract(m);
  }

  const factCandidates = extractFactCandidates(userMessage);
  if (factCandidates.length) {
    next.facts = dedupe([...factCandidates, ...next.facts]).slice(0, 24);
  }

  return next;
}

export async function extractBrandMemoryWithLLM(
  userId: string,
  brandId: string,
  current: AdminAgentMemory,
  userMessage: string,
  assistantMessage: string,
  turn?: AgentTurn,
): Promise<AdminAgentMemory> {
  const base = mergeMemoryFromTurn(current, userMessage, turn);
  const trimmed = String(userMessage || "").trim();
  if (trimmed.length < 10 || /^(abrir|ver|listar|mostrar|criar|novo)\b/i.test(trimmed)) {
    return base;
  }

  try {
    const prompt = `Você mantém memória de longo prazo de um assistente admin de vendas/CRM.

MEMÓRIA ATUAL:
${JSON.stringify({ facts: current.facts, preferences: current.preferences, last_topics: current.last_topics })}

TROCA:
Usuário: ${trimmed.slice(0, 600)}
Assistente: ${String(assistantMessage || "").slice(0, 600)}

Extraia APENAS informação útil para conversas FUTURAS:
- fatos estáveis (negócio, produto, público, metas, rotina)
- preferências explícitas (canal, cidade, tom, formato)
- tópicos recorrentes
NÃO salve: comandos de navegação, saudações, mensagens genéricas do assistente.

Responda JSON estrito:
{
  "facts_to_add": ["fato curto"],
  "facts_to_remove": ["fato obsoleto"],
  "preferences": { "chave": "valor" },
  "topics": ["tópico"]
}`;

    const result = await aiRouter.generateJson<MemoryExtraction>(
      prompt,
      { userId, brandId },
      { temperature: 0.15, functionKey: "text.admin.memory" },
    );

    let facts = [...base.facts];
    for (const rm of result.facts_to_remove || []) {
      const key = String(rm || "").toLowerCase().trim();
      if (!key) continue;
      facts = facts.filter((f) => !f.toLowerCase().includes(key));
    }
    for (const add of result.facts_to_add || []) {
      const f = String(add || "").trim().slice(0, 180);
      if (f && f.length >= 8) facts.unshift(f);
    }
    facts = dedupe(facts).slice(0, 24);

    const preferences = { ...base.preferences };
    for (const [k, v] of Object.entries(result.preferences || {})) {
      const key = String(k || "").trim().slice(0, 40);
      const val = String(v || "").trim().slice(0, 120);
      if (key && val) preferences[key] = val;
    }

    const last_topics = dedupe([
      ...(result.topics || []).map((t) => String(t || "").trim()).filter(Boolean),
      ...base.last_topics,
    ]).slice(0, 8);

    return {
      facts,
      preferences,
      last_topics,
      turn_count: base.turn_count,
    };
  } catch (error: any) {
    logger.warn({ err: error?.message }, "admin agent brand memory LLM fallback");
    return base;
  }
}

function extractFactCandidates(message: string): string[] {
  const trimmed = String(message || "").trim();
  if (trimmed.length < 12 || trimmed.length > 220) return [];
  if (/^(abrir|ver|listar|mostrar|criar|novo)\b/i.test(trimmed)) return [];
  return [trimmed.slice(0, 180)];
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function memoryToPromptBlock(memory: AdminAgentMemory | null | undefined, label = "Memória"): string {
  if (!memory || memory.turn_count < 1) return "";
  const lines: string[] = [];
  if (memory.last_topics.length) {
    lines.push(`Tópicos recentes: ${memory.last_topics.slice(0, 5).join(", ")}`);
  }
  const prefs = Object.entries(memory.preferences || {});
  if (prefs.length) {
    lines.push(`Preferências: ${prefs.map(([k, v]) => `${k}=${v}`).join("; ")}`);
  }
  if (memory.facts.length) {
    lines.push(`Fatos lembrados:\n- ${memory.facts.slice(0, 8).join("\n- ")}`);
  }
  if (!lines.length) return "";
  return `${label}:\n${lines.join("\n")}`;
}

export function combineMemoryBlocks(
  sessionMemory?: AdminAgentMemory | null,
  brandMemory?: AdminAgentMemory | null,
): string {
  const session = memoryToPromptBlock(sessionMemory, "Memória da sessão");
  const brand = memoryToPromptBlock(brandMemory, "Memória da marca (persiste entre conversas)");
  return [brand, session].filter(Boolean).join("\n\n");
}