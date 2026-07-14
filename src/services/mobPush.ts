/**
 * Web Push helpers for Lead Capture Mob (couriers + org admins).
 */
import { query } from "../config/database";
import { logger } from "../utils/logger";
import { getPushNotificationService } from "./pushNotifications";

const MOB_BASE = String(process.env.MOB_PUBLIC_URL || "https://mob.leadcapture.online").replace(
  /\/+$/,
  ""
);
const APP_BASE = String(
  process.env.FRONTEND_PUBLIC_URL || process.env.APP_PUBLIC_URL || "https://app.leadcapture.online"
).replace(/\/+$/, "");

async function courierUserId(courierId: string): Promise<string | null> {
  const rows = await query<any[]>(
    `SELECT user_id FROM mob_couriers WHERE id = ? LIMIT 1`,
    [courierId]
  ).catch(() => []);
  const id = rows?.[0]?.user_id;
  return id ? String(id) : null;
}

async function approvedCourierUserIds(ownerUserId: string, brandId: string): Promise<string[]> {
  const rows = await query<any[]>(
    `SELECT c.user_id
     FROM mob_courier_memberships m
     INNER JOIN mob_couriers c ON c.id = m.courier_id
     WHERE m.owner_user_id = ? AND m.brand_id = ? AND m.status = 'approved'
       AND c.ops_status IN ('available', 'busy')`,
    [ownerUserId, brandId]
  ).catch(() => []);
  return (rows || []).map((r) => String(r.user_id)).filter(Boolean);
}

function pushSafe(
  fn: () => Promise<unknown>,
  label: string
): void {
  void fn().catch((e: any) => logger.warn({ err: e?.message }, `mobPush ${label}`));
}

export function notifyCourierAssigned(input: {
  courierId: string;
  deliveryId: string;
  brandName?: string;
  customerHint?: string;
}): void {
  pushSafe(async () => {
    const userId = await courierUserId(input.courierId);
    if (!userId) return;
    const push = getPushNotificationService();
    await push.sendToUser({
      userId,
      appContext: "mob",
      eventKey: "delivery_assigned",
      title: "Entrega atribuída",
      body: input.customerHint
        ? `${input.brandName || "Loja"} · ${input.customerHint}`
        : `${input.brandName || "Loja"} · nova entrega para você`,
      priority: "high",
      url: `${MOB_BASE}/mob/app`,
      metadata: { delivery_id: input.deliveryId },
    });
  }, "assigned");
}

export function notifyCourierOffer(input: {
  ownerUserId: string;
  brandId: string;
  deliveryId: string;
  brandName?: string;
  excludeCourierId?: string;
  /** If set, only these courier ids receive the push (sequential) */
  onlyCourierIds?: string[];
  expiresInSeconds?: number;
}): void {
  pushSafe(async () => {
    let userIds: string[] = [];
    if (input.onlyCourierIds?.length) {
      for (const cid of input.onlyCourierIds) {
        const uid = await courierUserId(cid);
        if (uid) userIds.push(uid);
      }
    } else {
      userIds = await approvedCourierUserIds(input.ownerUserId, input.brandId);
      if (input.excludeCourierId) {
        const excludeUser = await courierUserId(input.excludeCourierId);
        userIds = userIds.filter((id) => id !== excludeUser);
      }
    }
    if (!userIds.length) return;
    const push = getPushNotificationService();
    const ttl = input.expiresInSeconds
      ? ` · ${input.expiresInSeconds}s para aceitar`
      : "";
    await Promise.all(
      userIds.map((userId) =>
        push.sendToUser({
          userId,
          appContext: "mob",
          eventKey: "delivery_offered",
          title: "Nova entrega disponível",
          body: input.brandName
            ? `${input.brandName} liberou uma entrega${ttl}`
            : `Há uma nova entrega na fila do Mob${ttl}`,
          priority: "high",
          url: `${MOB_BASE}/mob/app`,
          metadata: {
            delivery_id: input.deliveryId,
            urgency: "offer",
            vibrate: [280, 120, 280, 120, 400],
            requireInteraction: true,
            sound_url: "/sounds/mob-offer.wav",
            play_sound: true,
          },
        })
      )
    );
  }, "offer");
}

/** After sequential/simultaneous dispatch, notify only targeted couriers. */
export function notifyDispatchResult(input: {
  ownerUserId: string;
  brandId: string;
  deliveryId: string;
  offeredTo: string[];
  mode: string;
  brandName?: string;
  expiresAt?: string | null;
}): void {
  if (!input.offeredTo.length) return;
  const expiresInSeconds = input.expiresAt
    ? Math.max(0, Math.floor((new Date(input.expiresAt).getTime() - Date.now()) / 1000))
    : undefined;
  notifyCourierOffer({
    ownerUserId: input.ownerUserId,
    brandId: input.brandId,
    deliveryId: input.deliveryId,
    brandName: input.brandName,
    onlyCourierIds: input.offeredTo,
    expiresInSeconds,
  });
}

export function notifyCourierMembership(input: {
  courierId: string;
  status: "approved" | "rejected" | "suspended";
  brandName?: string;
}): void {
  pushSafe(async () => {
    const userId = await courierUserId(input.courierId);
    if (!userId) return;
    const push = getPushNotificationService();
    const map = {
      approved: {
        eventKey: "membership_approved",
        title: "Vínculo aprovado",
        body: input.brandName
          ? `Você foi aprovado em ${input.brandName}`
          : "Sua solicitação de vínculo foi aprovada",
        priority: "high" as const,
      },
      rejected: {
        eventKey: "membership_suspended",
        title: "Vínculo recusado",
        body: input.brandName
          ? `${input.brandName} recusou seu vínculo`
          : "Sua solicitação de vínculo foi recusada",
        priority: "high" as const,
      },
      suspended: {
        eventKey: "membership_suspended",
        title: "Vínculo suspenso",
        body: input.brandName
          ? `Seu vínculo com ${input.brandName} foi suspenso`
          : "Seu vínculo com a organização foi suspenso",
        priority: "critical" as const,
      },
    };
    const cfg = map[input.status];
    await push.sendToUser({
      userId,
      appContext: "mob",
      eventKey: cfg.eventKey,
      title: cfg.title,
      body: cfg.body,
      priority: cfg.priority,
      url: `${MOB_BASE}/mob/app`,
    });
  }, "membership");
}

export function notifyCourierDeliveryCancelled(input: {
  courierId: string;
  deliveryId: string;
}): void {
  pushSafe(async () => {
    const userId = await courierUserId(input.courierId);
    if (!userId) return;
    const push = getPushNotificationService();
    await push.sendToUser({
      userId,
      appContext: "mob",
      eventKey: "delivery_cancelled",
      title: "Entrega cancelada",
      body: "Uma entrega em andamento foi cancelada pela loja",
      priority: "high",
      url: `${MOB_BASE}/mob/app`,
      metadata: { delivery_id: input.deliveryId },
    });
  }, "cancelled");
}

export function notifyOrgDeliveryEvent(input: {
  ownerUserId: string;
  brandId?: string;
  eventKey: "mob_delivery_created" | "mob_delivery_completed" | "delivery_status_changed";
  title: string;
  body: string;
  deliveryId?: string;
}): void {
  pushSafe(async () => {
    const push = getPushNotificationService();
    await push.sendToUser({
      userId: input.ownerUserId,
      appContext: "admin",
      eventKey: input.eventKey,
      title: input.title,
      body: input.body,
      priority: "normal",
      url: `${APP_BASE}/entregas`,
      metadata: {
        delivery_id: input.deliveryId,
        brand_id: input.brandId,
      },
    });
  }, "org");
}

export function notifyCourierStatusFeedback(input: {
  courierId: string;
  deliveryId: string;
  statusLabel: string;
}): void {
  pushSafe(async () => {
    const userId = await courierUserId(input.courierId);
    if (!userId) return;
    const push = getPushNotificationService();
    await push.sendToUser({
      userId,
      appContext: "mob",
      eventKey: "delivery_status_changed",
      title: "Status atualizado",
      body: input.statusLabel,
      priority: "normal",
      url: `${MOB_BASE}/mob/app`,
      metadata: { delivery_id: input.deliveryId },
    });
  }, "status");
}
