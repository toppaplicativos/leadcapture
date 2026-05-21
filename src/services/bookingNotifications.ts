/**
 * Booking notifications (Fase 7.5) — dispatches WhatsApp messages to the customer
 * when the merchant changes a booking status (confirm/cancel/complete/reschedule).
 *
 * Designed to fail gracefully: if no instance is connected or the customer phone
 * is missing, we log a warning and return false instead of throwing — booking
 * status update should never break because of notification problems.
 */
import { queryOne } from "../config/database";
import { logger } from "../utils/logger";

type BookingStatus = "pending_confirmation" | "confirmed" | "rescheduled" | "cancelled" | "completed";

interface BookingNotificationContext {
  customerId: string | number;
  customerName: string;
  customerPhone: string;
  brandId: string | null;
  ownerUserId: string;
  productName?: string | null;
  startAt: string;
  endAt: string;
  address?: string | null;
  status: BookingStatus;
  reason?: string | null;
  /** Optional: a brand name to sign the message. */
  brandName?: string | null;
}

function formatDateBR(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  } catch { return iso; }
}

function formatTimeBR(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function digitsOnly(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

/** Build a JID from a Brazilian phone — supports 10/11 digits with or without country prefix. */
function buildJid(phone: string): string | null {
  const d = digitsOnly(phone);
  if (!d) return null;
  /* If the user already provided 12-13 digits, treat as international */
  const full = d.length >= 12 ? d : `55${d}`;
  return `${full}@s.whatsapp.net`;
}

const TEMPLATES: Record<BookingStatus, (ctx: BookingNotificationContext) => string> = {
  pending_confirmation: (ctx) => {
    const dateLabel = formatDateBR(ctx.startAt);
    const timeLabel = formatTimeBR(ctx.startAt);
    return [
      `Olá ${ctx.customerName.split(" ")[0] || ""}!`,
      `Recebemos seu pedido de agendamento${ctx.productName ? ` para *${ctx.productName}*` : ""}.`,
      `📅 ${dateLabel} · ${timeLabel}`,
      "",
      "Vamos confirmar com você em breve. Qualquer ajuste, é só responder por aqui.",
    ].filter(Boolean).join("\n");
  },
  confirmed: (ctx) => {
    const dateLabel = formatDateBR(ctx.startAt);
    const timeLabel = formatTimeBR(ctx.startAt);
    const lines = [
      `Olá ${ctx.customerName.split(" ")[0] || ""}!`,
      `Seu agendamento${ctx.productName ? ` de *${ctx.productName}*` : ""} foi *confirmado* ✅`,
      `📅 ${dateLabel} · ${timeLabel}`,
    ];
    if (ctx.address) lines.push(`📍 ${ctx.address}`);
    lines.push("", "Te esperamos! Se precisar reagendar ou cancelar, é só nos avisar.");
    if (ctx.brandName) lines.push("", `— ${ctx.brandName}`);
    return lines.join("\n");
  },
  rescheduled: (ctx) => {
    const dateLabel = formatDateBR(ctx.startAt);
    const timeLabel = formatTimeBR(ctx.startAt);
    return [
      `Olá ${ctx.customerName.split(" ")[0] || ""}!`,
      `Seu agendamento${ctx.productName ? ` de *${ctx.productName}*` : ""} foi *reagendado*.`,
      `📅 Nova data: ${dateLabel} · ${timeLabel}`,
      "",
      "Confirma se está OK pra você?",
    ].join("\n");
  },
  cancelled: (ctx) => {
    const dateLabel = formatDateBR(ctx.startAt);
    const timeLabel = formatTimeBR(ctx.startAt);
    const lines = [
      `Olá ${ctx.customerName.split(" ")[0] || ""},`,
      `Infelizmente seu agendamento${ctx.productName ? ` de *${ctx.productName}*` : ""} para ${dateLabel} às ${timeLabel} foi *cancelado*.`,
    ];
    if (ctx.reason) lines.push("", `Motivo: ${ctx.reason}`);
    lines.push("", "Se quiser reagendar pra outro horário, é só responder por aqui.");
    if (ctx.brandName) lines.push("", `— ${ctx.brandName}`);
    return lines.join("\n");
  },
  completed: (ctx) => {
    const lines = [
      `Olá ${ctx.customerName.split(" ")[0] || ""}!`,
      `Obrigado por ter agendado${ctx.productName ? ` *${ctx.productName}*` : ""} com a gente 🙏`,
      "",
      "Se puder, conta como foi a experiência. Sua opinião nos ajuda muito.",
    ];
    if (ctx.brandName) lines.push("", `— ${ctx.brandName}`);
    return lines.join("\n");
  },
};

export interface BookingNotificationResult {
  delivered: boolean;
  skipped_reason?: "no_phone" | "no_instance" | "send_failed" | "no_template" | "no_brand";
  jid?: string;
  instance_id?: string;
}

/**
 * Find the most-recently-active connected WhatsApp instance for a brand.
 * Falls back to any instance of the same owner if no brand match.
 */
async function resolveBrandInstanceId(brandId: string | null, ownerUserId: string): Promise<string | null> {
  if (brandId) {
    const r = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_instances
       WHERE brand_id = ? AND status = 'connected'
       ORDER BY last_connected_at DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [brandId]
    ).catch(() => null);
    if (r?.id) return r.id;
  }
  /* Fallback: any connected instance of this owner */
  const fallback = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND status = 'connected'
     ORDER BY last_connected_at DESC NULLS LAST, updated_at DESC
     LIMIT 1`,
    [ownerUserId]
  ).catch(() => null);
  return fallback?.id || null;
}

export class BookingNotificationService {
  /**
   * Render and dispatch a status-change message. Never throws — always returns a result.
   * The instance manager is passed in so we don't introduce a hard dependency on it at module load time.
   */
  async dispatchStatusChange(
    ctx: BookingNotificationContext,
    instanceManager: any
  ): Promise<BookingNotificationResult> {
    try {
      const jid = buildJid(ctx.customerPhone);
      if (!jid) {
        logger.info(`[bookingNotification] skipped: no phone for customer ${ctx.customerId}`);
        return { delivered: false, skipped_reason: "no_phone" };
      }

      const template = TEMPLATES[ctx.status];
      if (!template) return { delivered: false, skipped_reason: "no_template" };

      const instanceId = await resolveBrandInstanceId(ctx.brandId, ctx.ownerUserId);
      if (!instanceId) {
        logger.warn(`[bookingNotification] skipped: no connected WA instance for brand=${ctx.brandId || "-"} owner=${ctx.ownerUserId}`);
        return { delivered: false, skipped_reason: "no_instance", jid };
      }

      if (!instanceManager || typeof instanceManager.sendMessageByJid !== "function") {
        logger.warn("[bookingNotification] instanceManager not provided");
        return { delivered: false, skipped_reason: "send_failed", jid, instance_id: instanceId };
      }

      const message = template(ctx);
      const ok = await instanceManager.sendMessageByJid(instanceId, jid, message).catch((e: any) => {
        logger.warn(`[bookingNotification] send error: ${e?.message || e}`);
        return false;
      });

      if (!ok) {
        return { delivered: false, skipped_reason: "send_failed", jid, instance_id: instanceId };
      }

      logger.info(`[bookingNotification] ${ctx.status} delivered to ${jid} via instance ${instanceId}`);
      return { delivered: true, jid, instance_id: instanceId };
    } catch (e: any) {
      logger.warn(`[bookingNotification] unexpected error: ${e?.message || e}`);
      return { delivered: false, skipped_reason: "send_failed" };
    }
  }
}

export const bookingNotificationService = new BookingNotificationService();
