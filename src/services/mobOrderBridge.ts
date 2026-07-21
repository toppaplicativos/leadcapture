/**
 * Bridge: commerce/orders ↔ Lead Capture Mob deliveries.
 * Creates and syncs logistic records when the org has Mob enabled.
 */
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import {
  DeliveryStatus,
  mobLogisticsService,
  MobDelivery,
} from "./mobLogistics";

const MOB_TRACK_BASE =
  String(process.env.MOB_PUBLIC_URL || "https://mob.leadcapture.online").replace(/\/+$/, "");

export type OrderBusinessStatus =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "em_preparacao"
  | "em_entrega"
  | "entregue"
  | "cancelado";

/** Map business order status → delivery machine status (when no courier activity yet). */
const BUSINESS_TO_DELIVERY: Partial<Record<OrderBusinessStatus, DeliveryStatus>> = {
  aguardando_pagamento: "payment_pending",
  pago: "payment_approved",
  em_preparacao: "preparing",
  /** Fila de despacho — não força en_route sem entregador */
  em_entrega: "awaiting_courier",
  entregue: "delivered",
  cancelado: "cancelled",
};

/** When delivery advances, mirror a coarser business status back to orders (optional). */
export function deliveryStatusToBusiness(status: string): OrderBusinessStatus | null {
  switch (status) {
    case "payment_pending":
      return "aguardando_pagamento";
    case "payment_approved":
    case "order_received":
      return "pago";
    case "preparing":
    case "ready_for_dispatch":
    case "awaiting_courier":
    case "offered_to_courier":
    case "accepted_by_courier":
    case "courier_to_pickup":
    case "courier_at_pickup":
    case "picked_up":
      return "em_preparacao";
    case "en_route":
    case "near_destination":
    case "at_destination":
    case "delivery_failed":
    case "redelivery_needed":
    case "returning_to_store":
      return "em_entrega";
    case "delivered":
      return "entregue";
    case "cancelled":
      return "cancelado";
    default:
      return null;
  }
}

export function trackingUrlFor(token: string): string {
  return `${MOB_TRACK_BASE}/rastreio/${encodeURIComponent(token)}`;
}

async function loadOrderNotes(orderId: string): Promise<string | null> {
  const meta = await queryOne<any>(
    `SELECT notes FROM order_management_meta WHERE order_id = ? LIMIT 1`,
    [orderId]
  ).catch(() => null);
  return meta?.notes ? String(meta.notes).trim() : null;
}

async function findDeliveryByOrder(
  ownerUserId: string,
  brandId: string,
  orderId: string
): Promise<MobDelivery | null> {
  await mobLogisticsService.ensureSchema();
  const row = await queryOne<any>(
    `SELECT * FROM mob_deliveries
     WHERE owner_user_id = ? AND brand_id = ? AND order_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [ownerUserId, brandId, orderId]
  );
  if (!row) return null;
  return mobLogisticsService.getDeliveryById(String(row.id));
}

/**
 * Ensure a Mob delivery exists for this order when the module is enabled.
 * Idempotent: returns existing delivery if already linked.
 */
export async function ensureMobDeliveryForOrder(input: {
  ownerUserId: string;
  brandId: string | null | undefined;
  orderId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  productsTotal?: number;
  paymentMethod?: string | null;
  deliveryAddress?: string | null;
  businessStatus?: OrderBusinessStatus | string;
  notes?: string | null;
  forceCreate?: boolean;
}): Promise<{
  delivery: MobDelivery | null;
  tracking_url: string | null;
  created: boolean;
  skipped_reason?: string;
}> {
  const brandId = String(input.brandId || "").trim();
  if (!brandId) {
    return { delivery: null, tracking_url: null, created: false, skipped_reason: "no_brand" };
  }

  try {
    const settings = await mobLogisticsService.getOrCreateSettings(input.ownerUserId, brandId);
    if (!settings.enabled && !input.forceCreate) {
      return { delivery: null, tracking_url: null, created: false, skipped_reason: "mob_disabled" };
    }

    const existing = await findDeliveryByOrder(input.ownerUserId, brandId, input.orderId);
    if (existing) {
      return {
        delivery: existing,
        tracking_url: trackingUrlFor(existing.tracking_token),
        created: false,
      };
    }

    const address =
      input.deliveryAddress ||
      (await loadOrderNotes(input.orderId)) ||
      null;

    const biz = String(input.businessStatus || "pago") as OrderBusinessStatus;
    let status: DeliveryStatus =
      BUSINESS_TO_DELIVERY[biz] || "payment_approved";

    // Pickup-only mode from settings
    const modes = settings.modes_json || {};
    let modality: "own" | "pickup" | "third_party" = "own";
    if (modes.own === false && modes.pickup === true) {
      modality = "pickup";
    }

    // If only pickup and no delivery address, still create for tracking prep
    if (modality === "own" && !address && !settings.default_origin_address) {
      // Still create — operator can fill address later
    }

    const delivery = await mobLogisticsService.createDelivery({
      ownerUserId: input.ownerUserId,
      brandId,
      orderId: input.orderId,
      modality,
      customerName: input.customerName || undefined,
      customerPhone: input.customerPhone || undefined,
      customerEmail: input.customerEmail || undefined,
      dropoffAddress: address || undefined,
      productsTotal: input.productsTotal,
      paymentMethod: input.paymentMethod || undefined,
      notes: input.notes || undefined,
      status,
    });

    // Move to ready queue when payment approved / preparing
    let finalDelivery = delivery;
    if (["payment_approved", "preparing"].includes(status)) {
      try {
        finalDelivery = await mobLogisticsService.transitionStatus({
          deliveryId: delivery.id,
          toStatus: status === "preparing" ? "preparing" : "ready_for_dispatch",
          actorType: "system",
          source: "order_bridge",
          note: "Sincronizado a partir do pedido",
        });
      } catch {
        /* keep initial status */
      }
    }

    try {
      const { notifyCourierOffer, notifyOrgDeliveryEvent } = await import("./mobPush");
      if (
        ["ready_for_dispatch", "awaiting_courier", "payment_approved", "preparing"].includes(
          finalDelivery.status
        )
      ) {
        notifyCourierOffer({
          ownerUserId: input.ownerUserId,
          brandId,
          deliveryId: finalDelivery.id,
        });
      }
      notifyOrgDeliveryEvent({
        ownerUserId: input.ownerUserId,
        brandId,
        eventKey: "mob_delivery_created",
        title: "Corrida Mob do pedido",
        body: input.customerName
          ? `Pedido gerou corrida para ${input.customerName}`
          : `Pedido ${input.orderId.slice(0, 8)} virou corrida Mob`,
        deliveryId: finalDelivery.id,
      });
    } catch {
      /* non-blocking */
    }

    return {
      delivery: finalDelivery,
      tracking_url: trackingUrlFor(finalDelivery.tracking_token),
      created: true,
    };
  } catch (e: any) {
    logger.warn({ err: e?.message, orderId: input.orderId }, "mobOrderBridge ensure failed");
    return {
      delivery: null,
      tracking_url: null,
      created: false,
      skipped_reason: e?.message || "error",
    };
  }
}

/**
 * Sync delivery status from order business status (only if no courier has advanced past).
 */
export async function syncMobDeliveryFromOrderStatus(input: {
  ownerUserId: string;
  brandId: string | null | undefined;
  orderId: string;
  businessStatus: OrderBusinessStatus | string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  productsTotal?: number;
  paymentMethod?: string | null;
  deliveryAddress?: string | null;
}): Promise<{
  delivery: MobDelivery | null;
  tracking_url: string | null;
}> {
  const brandId = String(input.brandId || "").trim();
  if (!brandId) return { delivery: null, tracking_url: null };

  const biz = String(input.businessStatus || "") as OrderBusinessStatus;

  // Create on paid / preparing / shipping if missing
  if (["pago", "em_preparacao", "em_entrega", "entregue"].includes(biz)) {
    const ensured = await ensureMobDeliveryForOrder({
      ...input,
      businessStatus: biz,
    });
    if (!ensured.delivery) {
      return { delivery: null, tracking_url: null };
    }

    const target = BUSINESS_TO_DELIVERY[biz];
    if (!target) {
      return {
        delivery: ensured.delivery,
        tracking_url: ensured.tracking_url,
      };
    }

    // Don't pull back a delivery that's further along (courier already en_route etc.)
    const current = ensured.delivery.status;
    const rank: Record<string, number> = {
      order_received: 1,
      payment_pending: 2,
      payment_approved: 3,
      preparing: 4,
      ready_for_dispatch: 5,
      awaiting_courier: 6,
      offered_to_courier: 7,
      accepted_by_courier: 8,
      courier_to_pickup: 9,
      courier_at_pickup: 10,
      picked_up: 11,
      en_route: 12,
      near_destination: 13,
      at_destination: 14,
      delivered: 20,
      cancelled: 20,
    };

    // Force cancel / delivered
    if (target === "cancelled" || target === "delivered") {
      if (current !== target && current !== "delivered" && current !== "cancelled") {
        try {
          const updated = await mobLogisticsService.transitionStatus({
            deliveryId: ensured.delivery.id,
            toStatus: target,
            actorType: "system",
            source: "order_status_sync",
            note: `Pedido → ${biz}`,
          });
          return {
            delivery: updated,
            tracking_url: trackingUrlFor(updated.tracking_token),
          };
        } catch (e: any) {
          logger.warn({ err: e?.message }, "mob sync terminal status failed");
        }
      }
      return {
        delivery: ensured.delivery,
        tracking_url: trackingUrlFor(ensured.delivery.tracking_token),
      };
    }

    // Only advance if target is ahead and courier hasn't taken over (rank < accepted)
    const curRank = rank[current] || 0;
    const tgtRank = rank[target] || 0;
    if (tgtRank > curRank && curRank < (rank.accepted_by_courier || 8)) {
      try {
        // Step through intermediate if needed
        let d = ensured.delivery;
        const path: DeliveryStatus[] =
          target === "awaiting_courier"
            ? (["preparing", "ready_for_dispatch", "awaiting_courier"] as DeliveryStatus[])
            : target === "preparing"
              ? (["payment_approved", "preparing"] as DeliveryStatus[])
              : target === "payment_approved"
                ? (["payment_approved", "ready_for_dispatch"] as DeliveryStatus[])
                : ([target] as DeliveryStatus[]);

        for (const step of path) {
          if ((rank[step] || 0) <= (rank[d.status] || 0)) continue;
          try {
            d = await mobLogisticsService.transitionStatus({
              deliveryId: d.id,
              toStatus: step,
              actorType: "system",
              source: "order_status_sync",
              note: `Pedido → ${biz}`,
            });
          } catch {
            break;
          }
        }
        return { delivery: d, tracking_url: trackingUrlFor(d.tracking_token) };
      } catch (e: any) {
        logger.warn({ err: e?.message }, "mob sync advance failed");
      }
    }

    return {
      delivery: ensured.delivery,
      tracking_url: trackingUrlFor(ensured.delivery.tracking_token),
    };
  }

  if (biz === "cancelado") {
    const existing = await findDeliveryByOrder(input.ownerUserId, brandId, input.orderId);
    if (existing && existing.status !== "cancelled" && existing.status !== "delivered") {
      try {
        // Drop open offers so courier app stops ringing
        await query(
          `UPDATE mob_delivery_offers SET status = 'cancelled', responded_at = NOW()
           WHERE delivery_id = ? AND status = 'pending'`,
          [existing.id]
        ).catch(() => undefined);

        const updated = await mobLogisticsService.transitionStatus({
          deliveryId: existing.id,
          toStatus: "cancelled",
          actorType: "system",
          source: "order_cancelled",
          note: "Pedido cancelado/estornado",
        });

        if (existing.courier_id) {
          try {
            const { notifyCourierDeliveryCancelled } = await import("./mobPush");
            notifyCourierDeliveryCancelled({
              courierId: existing.courier_id,
              deliveryId: existing.id,
            });
          } catch {
            /* push optional */
          }
        }

        return {
          delivery: updated,
          tracking_url: trackingUrlFor(updated.tracking_token),
        };
      } catch {
        /* ignore invalid transition */
      }
    }
    return {
      delivery: existing,
      tracking_url: existing ? trackingUrlFor(existing.tracking_token) : null,
    };
  }

  return { delivery: null, tracking_url: null };
}

/** Fire-and-forget wrapper for hot paths. */
export function syncMobDeliveryFromOrderStatusAsync(
  input: Parameters<typeof syncMobDeliveryFromOrderStatus>[0]
): void {
  void syncMobDeliveryFromOrderStatus(input).catch((e) =>
    logger.warn({ err: e?.message }, "mob async sync failed")
  );
}

/** Attach tracking URL onto order meta payload when available. */
export async function getMobTrackingForOrder(
  ownerUserId: string,
  brandId: string | null | undefined,
  orderId: string
): Promise<{ tracking_url: string | null; delivery_id: string | null; status: string | null }> {
  const brand = String(brandId || "").trim();
  if (!brand) return { tracking_url: null, delivery_id: null, status: null };
  const d = await findDeliveryByOrder(ownerUserId, brand, orderId);
  if (!d) return { tracking_url: null, delivery_id: null, status: null };
  return {
    tracking_url: trackingUrlFor(d.tracking_token),
    delivery_id: d.id,
    status: d.status,
  };
}

/** List open deliveries linked to orders for a brand (ops). */
export async function listOrderLinkedDeliveries(
  ownerUserId: string,
  brandId: string,
  limit = 50
): Promise<any[]> {
  await mobLogisticsService.ensureSchema();
  const rows = await query<any[]>(
    `SELECT d.id, d.order_id, d.status, d.tracking_token, d.courier_id, d.customer_name,
            d.dropoff_address, d.delivery_fee, d.created_at, d.updated_at
     FROM mob_deliveries d
     WHERE d.owner_user_id = ? AND d.brand_id = ? AND d.order_id IS NOT NULL
     ORDER BY d.created_at DESC
     LIMIT ${Math.min(limit, 200)}`,
    [ownerUserId, brandId]
  );
  return (rows || []).map((r) => ({
    ...r,
    tracking_url: trackingUrlFor(r.tracking_token),
  }));
}
