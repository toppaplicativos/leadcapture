/**
 * Multi-canal do atendimento afiliado (WhatsApp + Telefone).
 * Schema de tentativas + labels + agregação por canal.
 */
import { query } from "../config/database";
import { logger } from "../utils/logger";

export type ContactChannel = "whatsapp" | "phone" | "note" | "system";

const CHANNELS = new Set<ContactChannel>(["whatsapp", "phone", "note", "system"]);

/** Ações que abrem um ciclo de tentativa (paralelo a “enviei”) */
export const INITIATING_ACTIONS = new Set([
  "sent",
  "followup",
  "called",
]);

/** Ações de resultado de ligação (além das compartilhadas) */
export const PHONE_RESULT_ACTIONS = new Set([
  "called",
  "voicemail",
  "busy",
  "callback_requested",
]);

export const ACTION_LABELS: Record<string, string> = {
  sent: "Mensagem enviada",
  followup: "Follow-up (mensagem)",
  replied: "Respondeu",
  negotiating: "Em negociação",
  auto_reply: "Resposta automática (bot)",
  no_answer: "Sem resposta",
  waiting: "Lembrar depois",
  channel_unavailable: "Canal indisponível",
  not_matching: "Não correspondente",
  lost: "Excluído / sem interesse",
  dismiss: "Oculto",
  note: "Anotação",
  ai_draft: "Rascunho IA",
  pool_skip: "Recusado no pool",
  claim: "Assumido",
  convert: "Convertido em cliente",
  called: "Ligação realizada",
  voicemail: "Caixa postal / recado",
  busy: "Linha ocupada",
  callback_requested: "Pediu retorno",
  received: "Recebido / atribuído",
  interaction: "Última interação",
};

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Telefone",
  note: "Anotação",
  system: "Sistema",
};

export function normalizeChannel(raw?: string | null, action?: string | null): ContactChannel {
  const c = String(raw || "").trim().toLowerCase() as ContactChannel;
  if (CHANNELS.has(c)) return c;
  const a = String(action || "").toLowerCase();
  if (PHONE_RESULT_ACTIONS.has(a) || a === "called") return "phone";
  if (a === "note" || a === "ai_draft") return "note";
  if (a === "claim" || a === "received" || a === "interaction" || a === "pool_skip") return "system";
  return "whatsapp";
}

export function actionLabel(action?: string | null, channel?: string | null): string {
  const a = String(action || "").toLowerCase();
  const base = ACTION_LABELS[a] || action || "Ação";
  const ch = normalizeChannel(channel, a);
  if (ch === "phone" && !PHONE_RESULT_ACTIONS.has(a) && a !== "called") {
    /* outcomes compartilhados no canal telefone */
    if (a === "replied") return "Atendeu / conversou na ligação";
    if (a === "no_answer") return "Não atendeu";
    if (a === "waiting") return "Retorno por telefone agendado";
    if (a === "negotiating") return "Negociação (telefone)";
    if (a === "channel_unavailable") return "Telefone indisponível";
    if (a === "not_matching") return "Número errado / não correspondente";
    if (a === "lost") return "Sem interesse (após ligação)";
    return `${base} · telefone`;
  }
  if (ch === "whatsapp" && (a === "replied" || a === "no_answer")) {
    return base;
  }
  return base;
}

export function defaultChannelForAction(action: string): ContactChannel {
  return normalizeChannel(null, action);
}

let schemaReady = false;

/**
 * Garante colunas multi-canal em affiliate_manual_actions.
 * CREATE TABLE base + ALTER best-effort (MySQL/Postgres).
 */
export async function ensureManualActionsChannelSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`CREATE TABLE IF NOT EXISTS affiliate_manual_actions (
    id VARCHAR(36) PRIMARY KEY,
    owner_user_id VARCHAR(36) NOT NULL,
    brand_id VARCHAR(36) NOT NULL,
    affiliate_id VARCHAR(36) NOT NULL,
    ref_type VARCHAR(30) NOT NULL,
    ref_id VARCHAR(36) NOT NULL,
    action VARCHAR(40) NOT NULL,
    message_text TEXT NULL,
    note TEXT NULL,
    channel VARCHAR(20) NULL DEFAULT 'whatsapp',
    duration_sec INT NULL,
    meta_json TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`).catch((e: any) => {
    logger.warn(`[affiliateContactChannel] create table: ${e?.message || e}`);
  });

  const alters = [
    `ALTER TABLE affiliate_manual_actions ADD COLUMN channel VARCHAR(20) NULL DEFAULT 'whatsapp'`,
    `ALTER TABLE affiliate_manual_actions ADD COLUMN duration_sec INT NULL`,
    `ALTER TABLE affiliate_manual_actions ADD COLUMN meta_json TEXT NULL`,
  ];
  for (const sql of alters) {
    await query(sql).catch(() => undefined);
  }
  await query(
    `CREATE INDEX IF NOT EXISTS idx_aff_manual_channel
     ON affiliate_manual_actions (affiliate_id, brand_id, ref_type, ref_id, channel, created_at)`,
  ).catch(() => undefined);
  schemaReady = true;
}

export type ChannelAttemptSummary = {
  channel: ContactChannel;
  label: string;
  attempts: number;
  last_action: string | null;
  last_action_label: string | null;
  last_at: string | null;
};

/** Agrega tentativas por canal a partir de rows de manual_actions. */
export function summarizeAttemptsByChannel(
  rows: Array<{ action?: string; channel?: string | null; created_at?: string | null }>,
): ChannelAttemptSummary[] {
  const map = new Map<
    ContactChannel,
    { attempts: number; last_action: string | null; last_at: string | null }
  >();

  for (const r of rows) {
    const action = String(r.action || "").toLowerCase();
    if (!action || action === "note" || action === "ai_draft" || action === "claim") continue;
    const channel = normalizeChannel(r.channel, action);
    if (channel === "note" || channel === "system") continue;
    const prev = map.get(channel) || { attempts: 0, last_action: null, last_at: null };
    prev.attempts += 1;
    const at = r.created_at ? String(r.created_at) : null;
    if (!prev.last_at || (at && new Date(at).getTime() > new Date(prev.last_at).getTime())) {
      prev.last_action = action;
      prev.last_at = at;
    }
    map.set(channel, prev);
  }

  const order: ContactChannel[] = ["whatsapp", "phone"];
  return order
    .filter((c) => map.has(c))
    .map((c) => {
      const s = map.get(c)!;
      return {
        channel: c,
        label: CHANNEL_LABELS[c],
        attempts: s.attempts,
        last_action: s.last_action,
        last_action_label: s.last_action ? actionLabel(s.last_action, c) : null,
        last_at: s.last_at,
      };
    });
}

export function isInitiatingAction(action: string): boolean {
  return INITIATING_ACTIONS.has(String(action || "").toLowerCase());
}
