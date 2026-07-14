/**
 * Lead Capture Mob — organization admin API (settings, couriers, map, deliveries).
 */
import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import {
  DeliveryStatus,
  MembershipStatus,
  estimateRoadDistanceKm,
  mobLogisticsService,
} from "../services/mobLogistics";
import { logger } from "../utils/logger";

const router = Router();

router.use(authMiddleware, requireBrandContext);

function ownerId(req: AuthRequest): string | null {
  return (req.user?.userId || req.userId) as string | undefined || null;
}

router.get("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const settings = await mobLogisticsService.getOrCreateSettings(userId, req.brandId);
    res.json({ success: true, settings });
  } catch (e: any) {
    logger.error(e, "mob admin settings get");
    res.status(500).json({ error: e.message });
  }
});

router.patch("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const settings = await mobLogisticsService.updateSettings(userId, req.brandId, req.body || {});
    res.json({ success: true, settings });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/quote", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const settings = await mobLogisticsService.getOrCreateSettings(userId, req.brandId);
    let distanceKm = req.body?.distance_km != null ? Number(req.body.distance_km) : null;

    if (
      distanceKm == null &&
      req.body?.origin_lat != null &&
      req.body?.origin_lng != null &&
      req.body?.dest_lat != null &&
      req.body?.dest_lng != null
    ) {
      distanceKm = estimateRoadDistanceKm(
        Number(req.body.origin_lat),
        Number(req.body.origin_lng),
        Number(req.body.dest_lat),
        Number(req.body.dest_lng)
      );
    } else if (
      distanceKm == null &&
      settings.default_origin_lat != null &&
      settings.default_origin_lng != null &&
      req.body?.dest_lat != null &&
      req.body?.dest_lng != null
    ) {
      distanceKm = estimateRoadDistanceKm(
        settings.default_origin_lat,
        settings.default_origin_lng,
        Number(req.body.dest_lat),
        Number(req.body.dest_lng)
      );
    }

    if (distanceKm == null || !Number.isFinite(distanceKm)) {
      return res.status(400).json({ error: "Informe distance_km ou coordenadas" });
    }

    const quote = mobLogisticsService.calculateQuote({
      settings,
      distanceKm,
      productsTotal: req.body?.products_total != null ? Number(req.body.products_total) : 0,
    });

    res.json({
      success: true,
      quote: {
        ...quote,
        origin: settings.default_origin_address,
        modality: req.body?.modality || "own",
      },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/couriers", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const memberships = await mobLogisticsService.listMembershipsForOrg(userId, req.brandId);
    res.json({ success: true, memberships });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/couriers/:membershipId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const status = String(req.body?.status || "").trim() as MembershipStatus;
    if (!status) return res.status(400).json({ error: "status obrigatório" });

    const membership = await mobLogisticsService.updateMembershipStatus(
      userId,
      req.brandId,
      String(req.params.membershipId),
      status,
      req.body?.notes ? String(req.body.notes) : undefined
    );
    if (!membership) return res.status(404).json({ error: "Vínculo não encontrado" });

    if (status === "approved" || status === "rejected" || status === "suspended") {
      try {
        const { notifyCourierMembership } = await import("../services/mobPush");
        const brand = await import("../config/database").then((db) =>
          db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
        );
        notifyCourierMembership({
          courierId: String(membership.courier_id),
          status: status as "approved" | "rejected" | "suspended",
          brandName: brand?.name,
        });
      } catch {
        /* non-blocking */
      }
    }

    res.json({ success: true, membership });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/invites", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { query } = await import("../config/database");
    const invites =
      (await query<any[]>(
        `SELECT * FROM mob_invites
         WHERE owner_user_id = ? AND brand_id = ?
         ORDER BY created_at DESC LIMIT 50`,
        [userId, req.brandId]
      )) || [];
    res.json({ success: true, invites });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/invites", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const invite = await mobLogisticsService.createInvite({
      ownerUserId: userId,
      brandId: req.brandId,
      label: req.body?.label ? String(req.body.label) : undefined,
      unitId: req.body?.unit_id ? String(req.body.unit_id) : undefined,
      maxUses: req.body?.max_uses != null ? Number(req.body.max_uses) : undefined,
      createdBy: userId,
      expiresAt: req.body?.expires_at || null,
    });

    const host = "https://mob.leadcapture.online";
    res.status(201).json({
      success: true,
      invite,
      invite_url: `${host}/entrar?invite=${encodeURIComponent(invite.invite_code)}`,
      qr_payload: `${host}/entrar?invite=${encodeURIComponent(invite.invite_code)}`,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/deliveries", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const deliveries = await mobLogisticsService.listDeliveriesForOrg(userId, req.brandId, {
      status: req.query.status ? String(req.query.status) : undefined,
      courierId: req.query.courier_id ? String(req.query.courier_id) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    res.json({ success: true, deliveries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/deliveries", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const delivery = await mobLogisticsService.createDelivery({
      ownerUserId: userId,
      brandId: req.brandId,
      orderId: req.body?.order_id ? String(req.body.order_id) : undefined,
      unitId: req.body?.unit_id ? String(req.body.unit_id) : undefined,
      modality: req.body?.modality,
      customerName: req.body?.customer_name,
      customerPhone: req.body?.customer_phone,
      customerEmail: req.body?.customer_email,
      pickupAddress: req.body?.pickup_address,
      pickupLat: req.body?.pickup_lat != null ? Number(req.body.pickup_lat) : undefined,
      pickupLng: req.body?.pickup_lng != null ? Number(req.body.pickup_lng) : undefined,
      dropoffAddress: req.body?.dropoff_address,
      dropoffLat: req.body?.dropoff_lat != null ? Number(req.body.dropoff_lat) : undefined,
      dropoffLng: req.body?.dropoff_lng != null ? Number(req.body.dropoff_lng) : undefined,
      productsTotal: req.body?.products_total != null ? Number(req.body.products_total) : undefined,
      paymentMethod: req.body?.payment_method,
      notes: req.body?.notes,
      priority: req.body?.priority != null ? Number(req.body.priority) : undefined,
      status: (req.body?.status as DeliveryStatus) || "ready_for_dispatch",
    });

    try {
      const { notifyCourierOffer, notifyDispatchResult, notifyOrgDeliveryEvent } = await import(
        "../services/mobPush"
      );
      const brand = await import("../config/database").then((db) =>
        db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
      );
      const settings = await mobLogisticsService.getOrCreateSettings(userId, req.brandId);
      if (["sequential", "simultaneous", "auto"].includes(settings.distribution_mode)) {
        const dispatched = await mobLogisticsService.dispatchOffers(delivery.id);
        notifyDispatchResult({
          ownerUserId: userId,
          brandId: req.brandId,
          deliveryId: delivery.id,
          offeredTo: dispatched.offered_to,
          mode: dispatched.mode,
          brandName: brand?.name,
          expiresAt: dispatched.expires_at,
        });
      } else if (["ready_for_dispatch", "awaiting_courier", "offered_to_courier"].includes(delivery.status)) {
        notifyCourierOffer({
          ownerUserId: userId,
          brandId: req.brandId,
          deliveryId: delivery.id,
          brandName: brand?.name,
        });
      }
      notifyOrgDeliveryEvent({
        ownerUserId: userId,
        brandId: req.brandId,
        eventKey: "mob_delivery_created",
        title: "Entrega Mob criada",
        body: delivery.customer_name
          ? `Entrega para ${delivery.customer_name}`
          : "Nova entrega na operação logística",
        deliveryId: delivery.id,
      });
    } catch {
      /* non-blocking */
    }

    res.status(201).json({
      success: true,
      delivery,
      tracking_url: `https://mob.leadcapture.online/rastreio/${delivery.tracking_token}`,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/deliveries/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.owner_user_id !== userId || delivery.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const events = await mobLogisticsService.listEvents(delivery.id);
    res.json({
      success: true,
      delivery,
      events,
      tracking_url: `https://mob.leadcapture.online/rastreio/${delivery.tracking_token}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/deliveries/:id/assign", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const courierId = String(req.body?.courier_id || "").trim();
    if (!courierId) return res.status(400).json({ error: "courier_id obrigatório" });

    // Gate: don't assign if payment still pending (unless COD / force)
    const existing = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (existing?.order_id && req.body?.force !== true) {
      const { queryOne } = await import("../config/database");
      const order = await queryOne<any>(
        `SELECT o.status_pedido, m.payment_status, m.business_status
         FROM commerce_orders o
         LEFT JOIN order_management_meta m ON m.order_id = o.id
         WHERE o.id = ? LIMIT 1`,
        [existing.order_id]
      );
      const pay = String(order?.payment_status || order?.status_pedido || "").toLowerCase();
      const biz = String(order?.business_status || "").toLowerCase();
      const paid =
        pay === "paid" ||
        pay === "pago" ||
        ["pago", "em_preparacao", "em_entrega", "entregue"].includes(biz);
      const cod = String(existing.payment_method || "").toLowerCase() === "dinheiro";
      if (order && !paid && !cod) {
        return res.status(400).json({
          error: "Pagamento ainda não confirmado. Confirme o pagamento antes de despachar.",
          code: "PAYMENT_PENDING",
        });
      }
    }

    // Optional vehicle: explainable compatibility (spec §5)
    let vehicleCheck: any = null;
    const vehicleId = req.body?.vehicle_id ? String(req.body.vehicle_id).trim() : "";
    if (vehicleId && existing) {
      const { mobFleetService } = await import("../services/mobFleet");
      vehicleCheck = await mobFleetService.checkDeliveryVehicle(userId, req.brandId, vehicleId, {
        weight_kg: (existing as any).weight_kg,
        volume_m3: (existing as any).volume_m3,
        package_count: (existing as any).package_count,
        requires_refrigeration: !!(existing as any).requires_refrigeration,
        is_fragile: !!(existing as any).is_fragile,
        is_food: !!(existing as any).is_food,
        high_value: !!(existing as any).high_value,
        distance_km: existing.distance_km,
        multi_stop: false,
      });
      if (!vehicleCheck.ok && req.body?.force_vehicle !== true) {
        return res.status(400).json({
          error: vehicleCheck.blockers?.[0] || "Veículo incompatível com a carga",
          code: "VEHICLE_INCOMPATIBLE",
          compatibility: vehicleCheck,
        });
      }
    }

    const delivery = await mobLogisticsService.assignCourier({
      deliveryId: String(req.params.id),
      courierId,
      ownerUserId: userId,
      brandId: req.brandId,
      actorId: userId,
      direct: req.body?.direct !== false,
    });

    if (vehicleId) {
      const { update } = await import("../config/database");
      await update(
        `UPDATE mob_deliveries SET vehicle_id = ?, updated_at = NOW() WHERE id = ?`,
        [vehicleId, delivery.id]
      ).catch(() => undefined);
      const { mobFleetService } = await import("../services/mobFleet");
      await mobFleetService
        .updateVehicle(userId, req.brandId, vehicleId, { status: "in_use", courier_id: courierId })
        .catch(() => undefined);
    }

    try {
      const { notifyCourierAssigned } = await import("../services/mobPush");
      const brand = await import("../config/database").then((db) =>
        db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
      );
      notifyCourierAssigned({
        courierId,
        deliveryId: delivery.id,
        brandName: brand?.name,
        customerHint: delivery.customer_name || delivery.dropoff_address || undefined,
      });
    } catch {
      /* non-blocking */
    }

    const refreshed = await mobLogisticsService.getDeliveryById(delivery.id);
    res.json({
      success: true,
      delivery: refreshed || delivery,
      vehicle_compatibility: vehicleCheck,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/deliveries/:id/unlock-pin", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const existing = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!existing || existing.owner_user_id !== userId || existing.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const delivery = await mobLogisticsService.unlockDeliveryPin(existing.id, userId);
    res.json({ success: true, delivery });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/deliveries/:id/status", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const existing = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!existing || existing.owner_user_id !== userId || existing.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }

    const toStatus = String(req.body?.status || "").trim() as DeliveryStatus;
    if (!toStatus) return res.status(400).json({ error: "status obrigatório" });

    const delivery = await mobLogisticsService.transitionStatus({
      deliveryId: existing.id,
      toStatus,
      actorType: "org",
      actorId: userId,
      note: req.body?.note ? String(req.body.note) : undefined,
      source: "org_admin",
      deliveryPin: req.body?.delivery_pin ? String(req.body.delivery_pin) : undefined,
      proofPhotoUrl: req.body?.proof_photo_url ? String(req.body.proof_photo_url) : undefined,
    });

    try {
      const { notifyCourierDeliveryCancelled, notifyCourierOffer, notifyOrgDeliveryEvent } =
        await import("../services/mobPush");
      if (toStatus === "cancelled" && delivery.courier_id) {
        notifyCourierDeliveryCancelled({
          courierId: delivery.courier_id,
          deliveryId: delivery.id,
        });
      }
      if (["ready_for_dispatch", "awaiting_courier", "offered_to_courier"].includes(toStatus)) {
        const brand = await import("../config/database").then((db) =>
          db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
        );
        const settings = await mobLogisticsService.getOrCreateSettings(userId, req.brandId);
        if (["sequential", "simultaneous", "auto"].includes(settings.distribution_mode)) {
          const { notifyDispatchResult } = await import("../services/mobPush");
          const dispatched = await mobLogisticsService.dispatchOffers(delivery.id);
          notifyDispatchResult({
            ownerUserId: userId,
            brandId: req.brandId,
            deliveryId: delivery.id,
            offeredTo: dispatched.offered_to,
            mode: dispatched.mode,
            brandName: brand?.name,
            expiresAt: dispatched.expires_at,
          });
        } else {
          notifyCourierOffer({
            ownerUserId: userId,
            brandId: req.brandId,
            deliveryId: delivery.id,
            brandName: brand?.name,
          });
        }
      }
      if (toStatus === "delivered") {
        notifyOrgDeliveryEvent({
          ownerUserId: userId,
          brandId: req.brandId,
          eventKey: "mob_delivery_completed",
          title: "Entrega concluída",
          body: delivery.customer_name
            ? `${delivery.customer_name} · entrega finalizada`
            : "Uma entrega Mob foi concluída",
          deliveryId: delivery.id,
        });
      }
    } catch {
      /* non-blocking */
    }

    res.json({ success: true, delivery });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/map", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const state = await mobLogisticsService.getOrgMapState(userId, req.brandId);
    res.json({ success: true, ...state });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Dispatch center board — KPIs + queues (spec §11) */
router.get("/dispatch", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobDispatchService } = await import("../services/mobDispatch");
    const board = await mobDispatchService.getBoard(userId, req.brandId);
    res.json({ success: true, board });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Explainable courier recommendations for a delivery (spec §12) */
router.get("/dispatch/recommend/:deliveryId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobDispatchService } = await import("../services/mobDispatch");
    const result = await mobDispatchService.recommendCouriers(
      userId,
      req.brandId,
      String(req.params.deliveryId),
      { limit: req.query.limit ? Number(req.query.limit) : 5 }
    );
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Quick assign from dispatch: courier + optional vehicle + dispatch offers */
router.post("/dispatch/assign", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const deliveryId = String(req.body?.delivery_id || "").trim();
    const courierId = String(req.body?.courier_id || "").trim();
    if (!deliveryId || !courierId) {
      return res.status(400).json({ error: "delivery_id e courier_id obrigatórios" });
    }

    const vehicleId = req.body?.vehicle_id ? String(req.body.vehicle_id).trim() : "";
    const existing = await mobLogisticsService.getDeliveryById(deliveryId);
    if (!existing || existing.owner_user_id !== userId || existing.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }

    let vehicleCheck: any = null;
    if (vehicleId) {
      const { mobFleetService } = await import("../services/mobFleet");
      vehicleCheck = await mobFleetService.checkDeliveryVehicle(userId, req.brandId, vehicleId, {
        weight_kg: (existing as any).weight_kg,
        volume_m3: (existing as any).volume_m3,
        package_count: (existing as any).package_count,
        requires_refrigeration: !!(existing as any).requires_refrigeration,
        is_fragile: !!(existing as any).is_fragile,
        is_food: !!(existing as any).is_food,
        high_value: !!(existing as any).high_value,
        distance_km: existing.distance_km,
      });
      if (!vehicleCheck.ok && req.body?.force_vehicle !== true) {
        return res.status(400).json({
          error: vehicleCheck.blockers?.[0] || "Veículo incompatível",
          code: "VEHICLE_INCOMPATIBLE",
          compatibility: vehicleCheck,
        });
      }
    }

    const delivery = await mobLogisticsService.assignCourier({
      deliveryId,
      courierId,
      ownerUserId: userId,
      brandId: req.brandId,
      actorId: userId,
      direct: req.body?.direct !== false,
    });

    if (vehicleId) {
      const { update } = await import("../config/database");
      await update(
        `UPDATE mob_deliveries SET vehicle_id = ?, updated_at = NOW() WHERE id = ?`,
        [vehicleId, delivery.id]
      ).catch(() => undefined);
      const { mobFleetService } = await import("../services/mobFleet");
      await mobFleetService
        .updateVehicle(userId, req.brandId, vehicleId, { status: "in_use", courier_id: courierId })
        .catch(() => undefined);
    }

    // Optional auto-offer mode: if not direct, open offers
    let offered: any = null;
    if (req.body?.offer_mode === true || req.body?.direct === false) {
      offered = await mobLogisticsService.dispatchOffers(deliveryId).catch(() => null);
    }

    try {
      const { notifyCourierAssigned } = await import("../services/mobPush");
      const brand = await import("../config/database").then((db) =>
        db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
      );
      notifyCourierAssigned({
        courierId,
        deliveryId: delivery.id,
        brandName: brand?.name,
        customerHint: delivery.customer_name || delivery.dropoff_address || undefined,
      });
    } catch {
      /* non-blocking */
    }

    const refreshed = await mobLogisticsService.getDeliveryById(delivery.id);
    res.json({
      success: true,
      delivery: refreshed || delivery,
      vehicle_compatibility: vehicleCheck,
      offers: offered,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Bulk reassign / create multi-stop from dispatch */
router.post("/dispatch/route", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const courierId = String(req.body?.courier_id || "").trim();
    const deliveryIds = Array.isArray(req.body?.delivery_ids)
      ? req.body.delivery_ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!courierId || !deliveryIds.length) {
      return res.status(400).json({ error: "courier_id e delivery_ids obrigatórios" });
    }
    const route = await mobLogisticsService.createOrUpdateRoute({
      ownerUserId: userId,
      brandId: req.brandId,
      courierId,
      deliveryIds,
      activate: req.body?.activate !== false,
      weights: req.body?.weights,
    });
    res.json({ success: true, route });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Build multi-stop route for a courier from selected deliveries */
router.post("/routes", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const courierId = String(req.body?.courier_id || "").trim();
    const deliveryIds = Array.isArray(req.body?.delivery_ids)
      ? req.body.delivery_ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!courierId) return res.status(400).json({ error: "courier_id obrigatório" });
    if (!deliveryIds.length) return res.status(400).json({ error: "delivery_ids obrigatórios" });

    const route = await mobLogisticsService.createOrUpdateRoute({
      ownerUserId: userId,
      brandId: req.brandId,
      courierId,
      deliveryIds,
      activate: req.body?.activate !== false,
      weights: req.body?.weights,
      origin:
        req.body?.origin_lat != null && req.body?.origin_lng != null
          ? { lat: Number(req.body.origin_lat), lng: Number(req.body.origin_lng) }
          : null,
    });

    try {
      const { notifyCourierAssigned } = await import("../services/mobPush");
      notifyCourierAssigned({
        courierId,
        deliveryId: deliveryIds[0],
        customerHint: `Rota com ${route.total_stops || deliveryIds.length} paradas`,
      });
    } catch {
      /* non-blocking */
    }

    res.status(201).json({ success: true, route, optimization: route?.optimized_json || null });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/routes", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const routes = await mobLogisticsService.listRoutesForOrg(userId, req.brandId);
    res.json({ success: true, routes });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/routes/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const route = await mobLogisticsService.getRouteById(String(req.params.id));
    if (!route || route.owner_user_id !== userId) {
      return res.status(404).json({ error: "Rota não encontrada" });
    }
    res.json({ success: true, route });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Reoptimize existing route (preserves completed stops; multi-objective) */
router.post("/routes/:id/reoptimize", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobRoutingService } = await import("../services/mobRouting");
    const result = await mobRoutingService.reoptimizeRoute({
      routeId: String(req.params.id),
      ownerUserId: userId,
      brandId: req.brandId,
      weights: req.body?.weights,
      reason: req.body?.reason ? String(req.body.reason) : "manual_reoptimize",
      dry_run: req.body?.dry_run === true,
      origin:
        req.body?.origin_lat != null && req.body?.origin_lng != null
          ? { lat: Number(req.body.origin_lat), lng: Number(req.body.origin_lng) }
          : null,
    });

    if (result.order_changed && !req.body?.dry_run && result.significant_change) {
      try {
        const route = await mobLogisticsService.getRouteById(String(req.params.id));
        if (route?.courier_id) {
          const { notifyCourierAssigned } = await import("../services/mobPush");
          notifyCourierAssigned({
            courierId: route.courier_id,
            deliveryId: result.ordered[0]?.delivery_id || String(req.params.id),
            customerHint: "Rota atualizada — confira a nova sequência de paradas",
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    const route = await mobLogisticsService.getRouteById(String(req.params.id));
    res.json({ success: true, optimization: result, route });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Preview inserting a delivery into an active route */
router.post("/routes/:id/preview-insert", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const deliveryId = String(req.body?.delivery_id || "").trim();
    if (!deliveryId) return res.status(400).json({ error: "delivery_id obrigatório" });
    const { mobRoutingService } = await import("../services/mobRouting");
    const preview = await mobRoutingService.previewInsertDelivery({
      routeId: String(req.params.id),
      ownerUserId: userId,
      brandId: req.brandId,
      deliveryId,
      weights: req.body?.weights,
    });
    res.json({ success: true, preview });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Plan multi-objective route without persisting (compare options) */
router.post("/routes/plan", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const deliveryIds = Array.isArray(req.body?.delivery_ids)
      ? req.body.delivery_ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!deliveryIds.length) return res.status(400).json({ error: "delivery_ids obrigatórios" });

    const deliveries = [];
    for (const id of deliveryIds) {
      const d = await mobLogisticsService.getDeliveryById(id);
      if (!d || d.owner_user_id !== userId || d.brand_id !== req.brandId) {
        return res.status(400).json({ error: `Entrega inválida: ${id}` });
      }
      deliveries.push(d);
    }

    let origin =
      req.body?.origin_lat != null && req.body?.origin_lng != null
        ? { lat: Number(req.body.origin_lat), lng: Number(req.body.origin_lng) }
        : null;
    if (!origin && req.body?.courier_id) {
      const c = await mobLogisticsService.getCourierById(String(req.body.courier_id));
      if (c?.last_lat != null && c?.last_lng != null) {
        origin = { lat: c.last_lat, lng: c.last_lng };
      }
    }

    const { mobRoutingService } = await import("../services/mobRouting");
    const plan = await mobRoutingService.planForDeliveries({
      deliveries,
      origin,
      weights: req.body?.weights,
    });
    res.json({ success: true, plan });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Trigger sequential/simultaneous dispatch for a delivery */
router.post("/deliveries/:id/dispatch", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const existing = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!existing || existing.owner_user_id !== userId || existing.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const dispatched = await mobLogisticsService.dispatchOffers(existing.id);
    try {
      const { notifyDispatchResult } = await import("../services/mobPush");
      const brand = await import("../config/database").then((db) =>
        db.queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [req.brandId])
      );
      notifyDispatchResult({
        ownerUserId: userId,
        brandId: req.brandId,
        deliveryId: existing.id,
        offeredTo: dispatched.offered_to,
        mode: dispatched.mode,
        brandName: brand?.name,
        expiresAt: dispatched.expires_at,
      });
    } catch {
      /* non-blocking */
    }
    res.json({ success: true, ...dispatched });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/reports", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const reports = await mobLogisticsService.orgReports(userId, req.brandId);
    res.json({ success: true, reports });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/finance", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const finance = await mobLogisticsService.financeDailyReport(userId, req.brandId, {
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      days: req.query.days ? Number(req.query.days) : 14,
    });
    res.json({ success: true, finance });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Fleet: vehicle types, vehicles, documents, compatibility ── */

router.get("/fleet/summary", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const summary = await mobFleetService.fleetSummary(userId, req.brandId);
    res.json({ success: true, summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/fleet/vehicle-types", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const types = await mobFleetService.listTypes(userId, req.brandId);
    res.json({ success: true, types });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/fleet/vehicle-types", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    if (!req.body?.name) return res.status(400).json({ error: "name obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const type = await mobFleetService.createOrgType(userId, req.brandId, req.body);
    res.json({ success: true, type });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch("/fleet/vehicle-types/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const type = await mobFleetService.updateOrgType(
      userId,
      req.brandId,
      String(req.params.id),
      req.body || {}
    );
    res.json({ success: true, type });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/fleet/vehicles", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const vehicles = await mobFleetService.listVehicles(userId, req.brandId, {
      status: req.query.status ? String(req.query.status) : undefined,
      courier_id: req.query.courier_id ? String(req.query.courier_id) : undefined,
    });
    res.json({ success: true, vehicles });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/fleet/vehicles", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    if (!req.body?.vehicle_type_id) {
      return res.status(400).json({ error: "vehicle_type_id obrigatório" });
    }
    const { mobFleetService } = await import("../services/mobFleet");
    const vehicle = await mobFleetService.createVehicle(userId, req.brandId, req.body);
    res.json({ success: true, vehicle });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/fleet/vehicles/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const vehicle = await mobFleetService.getVehicle(userId, req.brandId, String(req.params.id));
    if (!vehicle) return res.status(404).json({ error: "Veículo não encontrado" });
    const documents = await mobFleetService.listDocuments(
      userId,
      req.brandId,
      vehicle.id
    );
    res.json({ success: true, vehicle, documents });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/fleet/vehicles/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const vehicle = await mobFleetService.updateVehicle(
      userId,
      req.brandId,
      String(req.params.id),
      req.body || {}
    );
    res.json({ success: true, vehicle });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/fleet/vehicles/:id/documents", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    if (!req.body?.doc_type) return res.status(400).json({ error: "doc_type obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const document = await mobFleetService.addDocument(
      userId,
      req.brandId,
      String(req.params.id),
      req.body
    );
    res.json({ success: true, document });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/fleet/documents/:id/validate", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const status = String(req.body?.status || "");
    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ error: "status deve ser approved ou rejected" });
    }
    const { mobFleetService } = await import("../services/mobFleet");
    const document = await mobFleetService.validateDocument(
      userId,
      req.brandId,
      String(req.params.id),
      {
        status,
        validated_by: userId,
        rejection_reason: req.body?.rejection_reason,
      }
    );
    res.json({ success: true, document });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/fleet/compatibility", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const cargo = {
      weight_kg: req.body?.weight_kg != null ? Number(req.body.weight_kg) : null,
      volume_m3: req.body?.volume_m3 != null ? Number(req.body.volume_m3) : null,
      package_count: req.body?.package_count != null ? Number(req.body.package_count) : null,
      requires_refrigeration: !!req.body?.requires_refrigeration,
      is_fragile: !!req.body?.is_fragile,
      is_food: !!req.body?.is_food,
      high_value: !!req.body?.high_value,
      distance_km: req.body?.distance_km != null ? Number(req.body.distance_km) : null,
      multi_stop: !!req.body?.multi_stop,
    };
    if (req.body?.vehicle_id) {
      const result = await mobFleetService.checkDeliveryVehicle(
        userId,
        req.brandId,
        String(req.body.vehicle_id),
        cargo
      );
      return res.json({ success: true, ...result });
    }
    const recommendations = await mobFleetService.recommendVehicles(
      userId,
      req.brandId,
      cargo,
      Number(req.body?.limit || 5)
    );
    res.json({
      success: true,
      recommendations: recommendations.map((r) => ({
        vehicle: r.vehicle,
        ...r.compatibility,
      })),
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/* Packages / volumes */
router.get("/deliveries/:id/packages", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.owner_user_id !== userId || delivery.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const { mobPackagesService } = await import("../services/mobPackages");
    const conference = await mobPackagesService.getConference(delivery.id);
    res.json({ success: true, conference });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/deliveries/:id/packages", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.owner_user_id !== userId || delivery.brand_id !== req.brandId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const { mobPackagesService } = await import("../services/mobPackages");
    const packages = await mobPackagesService.createPackages({
      deliveryId: delivery.id,
      ownerUserId: userId,
      brandId: req.brandId,
      count: req.body?.count != null ? Number(req.body.count) : undefined,
      items: Array.isArray(req.body?.items) ? req.body.items : undefined,
    });
    if (req.body?.require_package_scan !== false) {
      const { update } = await import("../config/database");
      await update(
        `UPDATE mob_deliveries SET require_package_scan = TRUE, updated_at = NOW() WHERE id = ?`,
        [delivery.id]
      ).catch(() => undefined);
    }
    const conference = await mobPackagesService.getConference(delivery.id);
    res.json({ success: true, packages, conference });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/* Fleet maintenance */
router.get("/fleet/maintenances", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const maintenances = await mobFleetService.listMaintenances(userId, req.brandId, {
      vehicle_id: req.query.vehicle_id ? String(req.query.vehicle_id) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
    });
    res.json({ success: true, maintenances });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/fleet/maintenances", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    if (!req.body?.vehicle_id || !req.body?.kind) {
      return res.status(400).json({ error: "vehicle_id e kind obrigatórios" });
    }
    const { mobFleetService } = await import("../services/mobFleet");
    const maintenance = await mobFleetService.createMaintenance(userId, req.brandId, {
      ...req.body,
      vehicle_id: String(req.body.vehicle_id),
      kind: req.body.kind,
      cost: req.body.cost != null ? Number(req.body.cost) : undefined,
      odometer_km: req.body.odometer_km != null ? Number(req.body.odometer_km) : undefined,
      downtime_hours: req.body.downtime_hours != null ? Number(req.body.downtime_hours) : undefined,
      next_due_odometer:
        req.body.next_due_odometer != null ? Number(req.body.next_due_odometer) : undefined,
    });
    res.json({ success: true, maintenance });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch("/fleet/maintenances/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { mobFleetService } = await import("../services/mobFleet");
    const maintenance = await mobFleetService.updateMaintenance(
      userId,
      req.brandId,
      String(req.params.id),
      {
        ...req.body,
        cost: req.body?.cost != null ? Number(req.body.cost) : undefined,
        odometer_km: req.body?.odometer_km != null ? Number(req.body.odometer_km) : undefined,
        downtime_hours:
          req.body?.downtime_hours != null ? Number(req.body.downtime_hours) : undefined,
      }
    );
    res.json({ success: true, maintenance });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/** Create or fetch Mob delivery for an existing commerce order */
router.post("/from-order/:orderId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(400).json({ error: "orderId obrigatório" });

    const { queryOne } = await import("../config/database");
    const order = await queryOne<any>(
      `SELECT * FROM commerce_orders WHERE id = ? AND user_id = ? LIMIT 1`,
      [orderId, userId]
    );
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

    const { syncMobDeliveryFromOrderStatus } = await import("../services/mobOrderBridge");
    const biz =
      order.status_pedido === "pago"
        ? "pago"
        : order.status_pedido === "cancelado"
          ? "cancelado"
          : "pago";
    const result = await syncMobDeliveryFromOrderStatus({
      ownerUserId: userId,
      brandId: req.brandId,
      orderId,
      businessStatus: (req.body?.business_status as string) || biz,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      productsTotal: Number(order.valor_total || 0),
      paymentMethod: order.forma_pagamento,
      deliveryAddress: req.body?.delivery_address || undefined,
    });

    res.json({
      success: true,
      delivery: result.delivery,
      tracking_url: result.tracking_url,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/by-order/:orderId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = ownerId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const { getMobTrackingForOrder } = await import("../services/mobOrderBridge");
    const tracking = await getMobTrackingForOrder(
      userId,
      req.brandId,
      String(req.params.orderId || "")
    );
    res.json({ success: true, ...tracking });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
