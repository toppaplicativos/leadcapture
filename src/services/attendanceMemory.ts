/**
 * Shared attendance memory for multi-channel support (Instagram, WhatsApp, etc.).
 *
 * Goals:
 * 1. Register communication users (PSID / phone / channel id) per brand
 * 2. Extract structured slots from free-text so the agent never re-asks known facts
 * 3. Produce an objective "next step" prompt block for any channel composer
 * 4. Format conversation history lines consistently (Lead: / Atendente:)
 */

import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import type { ConversationMemory, FunnelStage } from "./cognitive/types";

export type AttendanceChannel = "instagram" | "whatsapp" | "web" | "other";

export type UseCaseSlot = "casa" | "restaurante" | "negocio" | "revenda" | "outro";

/** Structured slots for objective attendance flows */
export interface AttendanceSlots {
  use_case?: UseCaseSlot | null;
  purchase_intent?: boolean;
  delivery_interest?: boolean;
  quantity?: string | null;
  product_hint?: string | null;
  city_or_region?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Free-form facts already confirmed this conversation */
  confirmed_facts: string[];
  /** Ordered checklist of missing info for next objective step */
  missing_slots: string[];
  next_action: string;
}

export interface CommunicationContact {
  id: string;
  brand_id: string;
  channel: AttendanceChannel;
  external_id: string;
  username?: string | null;
  display_name?: string | null;
  phone?: string | null;
  client_id?: string | null;
  conversation_id?: string | null;
  slots_json: AttendanceSlots;
  last_message_at?: string | null;
  message_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface HistoryMessage {
  direction: "incoming" | "outgoing";
  text: string;
  created_at?: string;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS communication_contacts (
          id TEXT PRIMARY KEY,
          brand_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          external_id TEXT NOT NULL,
          username TEXT NULL,
          display_name TEXT NULL,
          phone TEXT NULL,
          client_id TEXT NULL,
          conversation_id TEXT NULL,
          slots_json TEXT NOT NULL DEFAULT '{}',
          last_message_at TIMESTAMP NULL,
          message_count INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (brand_id, channel, external_id)
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_comm_contacts_brand_channel
        ON communication_contacts (brand_id, channel)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_comm_contacts_conversation
        ON communication_contacts (conversation_id)
      `);
      schemaReady = true;
    } catch (e: any) {
      logger.warn(`[attendanceMemory] schema ensure failed: ${e?.message || e}`);
    }
  })();
  return schemaPromise;
}

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeAttendanceText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Slot extraction (deterministic — no extra LLM cost) ─────────────────────

export function extractSlotsFromText(text: string): Partial<AttendanceSlots> {
  const t = normalizeAttendanceText(text);
  if (!t) return {};

  const out: Partial<AttendanceSlots> = {};

  // Use case — order matters (more specific first)
  if (/(restaurante|lanchonete|pizzaria|padaria|bar\b|food ?service|cozinha comercial|food truck)/.test(t)) {
    out.use_case = "restaurante";
  } else if (/(revenda|revender|distribu|atacado|para revenda)/.test(t)) {
    out.use_case = "revenda";
  } else if (/(para (minha |meu )?casa|consumo (proprio|pessoal)|uso (residencial|domestico)|pra casa)/.test(t)) {
    out.use_case = "casa";
  } else if (/(meu negocio|minha empresa|meu comercio|minha loja|estabelecimento|para (o )?negocio)/.test(t)) {
    out.use_case = "negocio";
  }

  // Purchase intent
  if (
    /(quero comprar|quero fechar|como compro|fazer pedido|fechar pedido|pode me vender|link de compra|vou comprar|comprar agora|quero o produto|me manda o (link|pix)|fechar agora)/.test(
      t,
    )
  ) {
    out.purchase_intent = true;
  }

  // Delivery
  if (/(entregam?|faz(em)? entrega|delivery|frete|entregam? ai|entregam? ai|faz(em)? e entrega)/.test(t)) {
    out.delivery_interest = true;
  }

  // Quantity
  const qty =
    t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|quilo|quilos|caixa|caixas|unid(?:ade)?s?|pct|pacote|saco|sc)/i) ||
    t.match(/(?:quero|preciso|cerca de|umas?|uns)\s+(\d+(?:[.,]\d+)?)\s*(kg|quilo|caixa|unid)?/i);
  if (qty) {
    out.quantity = `${qty[1]}${qty[2] ? ` ${qty[2]}` : ""}`.trim();
  }

  // Product hints (generic commercial terms + common alho/produto cues)
  if (/(alho|descascado|tipo a|tipo b|embalagem|produto)/.test(t)) {
    const hint = t.match(/(alho\s*(descascado)?(\s*tipo\s*[ab])?|tipo\s*[ab])/i);
    if (hint) out.product_hint = hint[0].trim();
  }

  // Phone
  const phone = t.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  if (phone) out.phone = phone[0].replace(/\s+/g, " ").trim();

  // Name patterns: "meu nome é X" / "sou o X"
  const nameMatch = t.match(/(?:meu nome e|me chamo|sou (?:o|a))\s+([a-z]{2,}(?:\s+[a-z]{2,}){0,2})/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  // City (very light): "sou de X" / "em X"
  const cityMatch = t.match(/(?:sou de|moro em|estou em|fico em|cidade de)\s+([a-z]{3,}(?:\s+[a-z]{2,}){0,2})/i);
  if (cityMatch) out.city_or_region = cityMatch[1].trim();

  return out;
}

export function mergeSlots(
  base: Partial<AttendanceSlots> | null | undefined,
  incoming: Partial<AttendanceSlots> | null | undefined,
): AttendanceSlots {
  const a = base || {};
  const b = incoming || {};
  const confirmed = new Set<string>([
    ...(Array.isArray(a.confirmed_facts) ? a.confirmed_facts : []),
    ...(Array.isArray(b.confirmed_facts) ? b.confirmed_facts : []),
  ]);

  const use_case = b.use_case || a.use_case || null;
  const purchase_intent = Boolean(b.purchase_intent || a.purchase_intent);
  const delivery_interest = Boolean(b.delivery_interest || a.delivery_interest);
  const quantity = b.quantity || a.quantity || null;
  const product_hint = b.product_hint || a.product_hint || null;
  const city_or_region = b.city_or_region || a.city_or_region || null;
  const phone = b.phone || a.phone || null;
  const name = b.name || a.name || null;

  if (use_case) confirmed.add(`uso=${use_case}`);
  if (purchase_intent) confirmed.add("intencao=comprar");
  if (delivery_interest) confirmed.add("interesse=entrega");
  if (quantity) confirmed.add(`quantidade=${quantity}`);
  if (product_hint) confirmed.add(`produto=${product_hint}`);
  if (city_or_region) confirmed.add(`regiao=${city_or_region}`);
  if (phone) confirmed.add(`telefone=${phone}`);
  if (name) confirmed.add(`nome=${name}`);

  const missing_slots: string[] = [];
  if (!use_case) missing_slots.push("uso (casa / restaurante-negócio / revenda)");
  if (!product_hint && !purchase_intent) missing_slots.push("produto de interesse");
  if (purchase_intent && !quantity) missing_slots.push("quantidade aproximada");
  if (purchase_intent && !city_or_region && delivery_interest) missing_slots.push("cidade/região para frete");
  if (purchase_intent && !phone) missing_slots.push("telefone/WhatsApp para fechar");

  const next_action = computeNextAction({
    use_case,
    purchase_intent,
    delivery_interest,
    quantity,
    product_hint,
    city_or_region,
    phone,
    name,
    confirmed_facts: [...confirmed],
    missing_slots,
    next_action: "",
  });

  return {
    use_case,
    purchase_intent,
    delivery_interest,
    quantity,
    product_hint,
    city_or_region,
    phone,
    name,
    confirmed_facts: [...confirmed].slice(-30),
    missing_slots,
    next_action,
  };
}

function computeNextAction(slots: AttendanceSlots): string {
  // Objective ladder — never go backwards
  if (slots.purchase_intent && slots.use_case && slots.quantity) {
    if (!slots.phone) {
      return "Fechar: confirme produto + preço do catálogo e peça WhatsApp/telefone OU link de pedido. NÃO repergunte o uso.";
    }
    return "Fechar pedido: confirme resumo (uso, produto, qtd) e oriente pagamento/envio. Sem perguntas de segmentação.";
  }
  if (slots.purchase_intent && slots.use_case) {
    return "Cliente JÁ disse o uso e quer comprar. Apresente o produto ideal + preço do catálogo e peça só a quantidade. NÃO pergunte de novo se é casa/restaurante/revenda.";
  }
  if (slots.purchase_intent && !slots.use_case) {
    return "Cliente quer comprar. Peça UMA informação: uso (casa, restaurante ou revenda) OU quantidade se o produto já estiver claro.";
  }
  if (slots.use_case && slots.delivery_interest) {
    return `Uso já conhecido (${slots.use_case}). Responda entrega com fatos e avance para produto/preço ou quantidade. Não reabra menu genérico.`;
  }
  if (slots.use_case) {
    return `Uso já conhecido (${slots.use_case}). Ofereça produto + preço adequado a esse uso e pergunte quantidade ou se quer fechar. NÃO repergunte o uso.`;
  }
  if (slots.delivery_interest) {
    return "Cliente perguntou sobre entrega. Responda se entrega e peça o uso (casa/negócio/revenda) em no máximo 1 pergunta.";
  }
  return "Identifique a necessidade com no máximo 1 pergunta objetiva. Se já houver preço/produto no catálogo e a dúvida couber, responda primeiro.";
}

/** Build slots from history + current message (replay extract). */
export function extractSlotsFromHistory(
  messages: HistoryMessage[],
  currentInbound?: string,
): AttendanceSlots {
  let slots: AttendanceSlots = {
    confirmed_facts: [],
    missing_slots: [],
    next_action: "",
  };
  for (const m of messages) {
    if (m.direction !== "incoming") continue;
    slots = mergeSlots(slots, extractSlotsFromText(m.text));
  }
  if (currentInbound) {
    slots = mergeSlots(slots, extractSlotsFromText(currentInbound));
  }
  // recompute next_action with full picture
  return mergeSlots(slots, {});
}

export function slotsToFacts(slots: AttendanceSlots): string[] {
  return [...(slots.confirmed_facts || [])];
}

export function slotsToPreferences(slots: AttendanceSlots): Record<string, string> {
  const prefs: Record<string, string> = {};
  if (slots.use_case) prefs.uso = slots.use_case;
  if (slots.purchase_intent) prefs.intencao = "comprar";
  if (slots.delivery_interest) prefs.entrega = "sim";
  if (slots.quantity) prefs.quantidade = slots.quantity;
  if (slots.product_hint) prefs.produto = slots.product_hint;
  if (slots.city_or_region) prefs.regiao = slots.city_or_region;
  if (slots.phone) prefs.telefone = slots.phone;
  return prefs;
}

/**
 * Objective attendance policy for LLM prompts (IG + WA + any channel).
 * Prevents circular Q&A like re-asking casa/negócio/revenda after "restaurante".
 */
export function formatObjectiveAttendanceBlock(
  slots: AttendanceSlots,
  opts?: { turnCount?: number; historyDepth?: number },
): string {
  const depth = opts?.historyDepth ?? 0;
  const turns = opts?.turnCount ?? 0;
  const midConversation = depth >= 2 || turns >= 1;

  const lines: string[] = [
    "=== FLUXO OBJETIVO DE ATENDIMENTO (OBRIGATÓRIO) ===",
    "Princípio: nunca pergunte de novo o que o cliente JÁ disse. Avance um passo por vez.",
    "Máximo de 1 pergunta por resposta. Responda fatos (preço, entrega, produto) ANTES de perguntar.",
  ];

  if (midConversation) {
    lines.push(
      "CONVERSA EM ANDAMENTO: proibido reabrir com 'Olá/Oi/Como posso ajudar?' ou menu genérico de segmentação se o uso já foi informado.",
    );
  }

  if (slots.confirmed_facts.length) {
    lines.push(`FATOS JÁ CONFIRMADOS (NÃO reperguntar): ${slots.confirmed_facts.join(" | ")}`);
  }
  if (slots.use_case) {
    lines.push(
      `USO DO CLIENTE = ${slots.use_case}. Trate como estabelecido. Nunca pergunte de novo se é casa, restaurante, negócio ou revenda.`,
    );
  }
  if (slots.purchase_intent) {
    lines.push(
      "INTENÇÃO DE COMPRA confirmada. Foque em fechar: produto ideal + preço do catálogo + quantidade + próximo passo (pedido/WhatsApp/link).",
    );
  }
  if (slots.missing_slots.length) {
    lines.push(`Ainda falta (pergunte só o PRÓXIMO item se necessário): ${slots.missing_slots[0]}`);
  } else if (slots.purchase_intent) {
    lines.push("Checklist quase completo — confirme resumo e feche.");
  }
  lines.push(`PRÓXIMA AÇÃO OBRIGATÓRIA: ${slots.next_action}`);
  lines.push("=== FIM DO FLUXO OBJETIVO ===");
  return lines.join("\n");
}

/** Format messages as Lead:/Atendente: lines (oldest → newest). */
export function formatHistoryLines(messages: HistoryMessage[], limit = 20): string[] {
  const slice = messages.filter((m) => String(m.text || "").trim()).slice(-limit);
  return slice.map((m) => {
    const role = m.direction === "outgoing" ? "Atendente" : "Lead";
    return `${role}: ${String(m.text).trim().slice(0, 500)}`;
  });
}

export function lastOutgoingFromHistory(messages: HistoryMessage[], limit = 3): string[] {
  return messages
    .filter((m) => m.direction === "outgoing" && String(m.text || "").trim())
    .slice(-limit)
    .map((m) => String(m.text).trim())
    .reverse();
}

/** Strip leading greeting when mid-conversation (soft post-process). */
export function stripMidConversationGreeting(text: string, historyDepth: number): string {
  if (historyDepth < 3) return text;
  let t = String(text || "").trim();
  // Remove leading "Olá! " / "Oi! " / wave emoji greetings
  t = t.replace(/^(ol[aá]|oi|hey|e a[ií])[\s,!.👋🙏🏻💚]*\s*/i, "");
  // If we wiped everything, keep original
  if (!t.trim()) return String(text || "").trim();
  // Capitalize first letter
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function advanceFunnelFromSlots(slots: AttendanceSlots, current: FunnelStage): FunnelStage {
  if (slots.purchase_intent) return "decision";
  if (slots.use_case || slots.product_hint || slots.quantity) {
    if (current === "awareness" || current === "noise") return "consideration";
  }
  if (slots.delivery_interest && (current === "awareness" || current === "noise")) {
    return "support";
  }
  return current;
}

// ─── Contact registry ────────────────────────────────────────────────────────

function contactId(brandId: string, channel: AttendanceChannel, externalId: string): string {
  return `cc:${channel}:${brandId}:${externalId}`;
}

export async function upsertCommunicationContact(input: {
  brandId: string;
  channel: AttendanceChannel;
  externalId: string;
  username?: string | null;
  displayName?: string | null;
  phone?: string | null;
  clientId?: string | null;
  conversationId?: string | null;
  slots?: AttendanceSlots | null;
  bumpMessage?: boolean;
}): Promise<CommunicationContact | null> {
  const brandId = String(input.brandId || "").trim();
  const externalId = String(input.externalId || "").trim();
  const channel = input.channel || "other";
  if (!brandId || !externalId) return null;

  await ensureSchema();
  const id = contactId(brandId, channel, externalId);
  const now = new Date().toISOString();

  try {
    const existing = await queryOne<any>(
      `SELECT * FROM communication_contacts
       WHERE brand_id = ? AND channel = ? AND external_id = ? LIMIT 1`,
      [brandId, channel, externalId],
    );

    const prevSlots = parseSlots(existing?.slots_json);
    const slots = input.slots ? mergeSlots(prevSlots, input.slots) : prevSlots;
    const messageCount = Number(existing?.message_count || 0) + (input.bumpMessage !== false ? 1 : 0);
    const username = input.username ?? existing?.username ?? null;
    const displayName = input.displayName ?? existing?.display_name ?? slots.name ?? null;
    const phone = input.phone ?? existing?.phone ?? slots.phone ?? null;
    const clientId = input.clientId ?? existing?.client_id ?? null;
    const conversationId = input.conversationId ?? existing?.conversation_id ?? null;
    const slotsJson = JSON.stringify(slots);

    if (existing) {
      await update(
        `UPDATE communication_contacts SET
           username = COALESCE(?, username),
           display_name = COALESCE(?, display_name),
           phone = COALESCE(?, phone),
           client_id = COALESCE(?, client_id),
           conversation_id = COALESCE(?, conversation_id),
           slots_json = ?,
           last_message_at = ?,
           message_count = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          username,
          displayName,
          phone,
          clientId,
          conversationId,
          slotsJson,
          now,
          messageCount,
          now,
          existing.id || id,
        ],
      );
    } else {
      await query(
        `INSERT INTO communication_contacts
         (id, brand_id, channel, external_id, username, display_name, phone, client_id, conversation_id, slots_json, last_message_at, message_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          brandId,
          channel,
          externalId,
          username,
          displayName,
          phone,
          clientId,
          conversationId,
          slotsJson,
          now,
          messageCount,
          now,
          now,
        ],
      );
    }

    return {
      id: existing?.id || id,
      brand_id: brandId,
      channel,
      external_id: externalId,
      username,
      display_name: displayName,
      phone,
      client_id: clientId,
      conversation_id: conversationId,
      slots_json: slots,
      last_message_at: now,
      message_count: messageCount,
      updated_at: now,
    };
  } catch (e: any) {
    logger.warn(`[attendanceMemory] upsert contact failed: ${e?.message || e}`);
    return null;
  }
}

export async function getCommunicationContact(
  brandId: string,
  channel: AttendanceChannel,
  externalId: string,
): Promise<CommunicationContact | null> {
  if (!brandId || !externalId) return null;
  await ensureSchema();
  try {
    const row = await queryOne<any>(
      `SELECT * FROM communication_contacts
       WHERE brand_id = ? AND channel = ? AND external_id = ? LIMIT 1`,
      [brandId, channel, externalId],
    );
    if (!row) return null;
    return {
      id: row.id,
      brand_id: row.brand_id,
      channel: row.channel,
      external_id: row.external_id,
      username: row.username,
      display_name: row.display_name,
      phone: row.phone,
      client_id: row.client_id,
      conversation_id: row.conversation_id,
      slots_json: parseSlots(row.slots_json),
      last_message_at: row.last_message_at,
      message_count: Number(row.message_count || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (e: any) {
    logger.warn(`[attendanceMemory] get contact failed: ${e?.message || e}`);
    return null;
  }
}

function parseSlots(raw: unknown): AttendanceSlots {
  let obj: any = {};
  if (!raw) {
    /* empty */
  } else if (typeof raw === "object") {
    obj = raw;
  } else {
    try {
      obj = JSON.parse(String(raw));
    } catch {
      obj = {};
    }
  }
  return mergeSlots(
    {
      confirmed_facts: Array.isArray(obj.confirmed_facts) ? obj.confirmed_facts : [],
      missing_slots: [],
      next_action: "",
      use_case: obj.use_case || null,
      purchase_intent: Boolean(obj.purchase_intent),
      delivery_interest: Boolean(obj.delivery_interest),
      quantity: obj.quantity || null,
      product_hint: obj.product_hint || null,
      city_or_region: obj.city_or_region || null,
      phone: obj.phone || null,
      name: obj.name || null,
    },
    {},
  );
}

/**
 * Apply slots into conversation_memory-shaped preferences + facts.
 * Used by IG light path and can enrich WA cognitive merge.
 */
export function applySlotsToMemoryFields(
  memory: ConversationMemory,
  slots: AttendanceSlots,
): Pick<ConversationMemory, "preferences" | "facts_learned" | "customer_name" | "funnel_stage"> {
  const prefs = { ...memory.preferences, ...slotsToPreferences(slots) };
  const facts = Array.from(
    new Set([...(memory.facts_learned || []), ...slotsToFacts(slots)]),
  ).slice(-40);
  const stage = advanceFunnelFromSlots(slots, memory.funnel_stage);
  return {
    preferences: prefs,
    facts_learned: facts,
    customer_name: slots.name || memory.customer_name || null,
    funnel_stage: stage,
  };
}
