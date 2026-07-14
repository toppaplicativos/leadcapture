/**
 * Lead Capture Mob — courier app API (credential_type: entregador).
 */
import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import {
  DeliveryStatus,
  mobLogisticsService,
} from "../services/mobLogistics";
import { logger } from "../utils/logger";

const router = Router();

router.use(authMiddleware);

const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "mob-proofs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg") || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Envie uma imagem (JPEG, PNG ou WebP)"));
  },
});

function requireCourier(req: AuthRequest, res: Response): { userId: string; courierId: string } | null {
  const credentialType = String(req.user?.credential_type || "").trim().toLowerCase();
  const userId = String(req.user?.userId || req.userId || "").trim();
  let courierId = String(req.user?.courier_id || "").trim();

  if (credentialType !== "entregador" && String(req.user?.role || "") !== "courier") {
    res.status(403).json({ error: "Credencial inválida para Lead Capture Mob" });
    return null;
  }
  if (!userId) {
    res.status(403).json({ error: "Token incompleto" });
    return null;
  }
  return { userId, courierId };
}

async function resolveCourierId(
  ctx: { userId: string; courierId: string },
  res: Response
): Promise<string | null> {
  if (ctx.courierId) return ctx.courierId;
  const courier = await mobLogisticsService.getCourierByUserId(ctx.userId);
  if (!courier) {
    res.status(403).json({ error: "Perfil de entregador não encontrado" });
    return null;
  }
  return courier.id;
}

router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const dashboard = await mobLogisticsService.getCourierDashboard(courierId);
    res.json({
      success: true,
      ...dashboard,
      user: {
        id: ctx.userId,
        email: req.user?.email,
        role: "courier",
        credential_type: "entregador",
      },
    });
  } catch (e: any) {
    logger.error(e, "mob me");
    res.status(500).json({ error: e.message || "Falha ao carregar perfil" });
  }
});

router.patch("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const courier = await mobLogisticsService.updateCourierProfile(courierId, req.body || {});
    res.json({ success: true, courier });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar perfil" });
  }
});

router.post("/ops-status", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const status = String(req.body?.status || "").trim() as "offline" | "available" | "busy";
    if (!["offline", "available", "busy"].includes(status)) {
      return res.status(400).json({ error: "Status inválido (offline|available|busy)" });
    }
    const courier = await mobLogisticsService.setOpsStatus(courierId, status);
    res.json({ success: true, courier });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao alterar status" });
  }
});

router.get("/memberships", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const memberships = await mobLogisticsService.listMembershipsForCourier(courierId);
    res.json({ success: true, memberships });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Vehicles linked to this courier across approved orgs (fleet domain). */
router.get("/vehicles", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobFleetService } = await import("../services/mobFleet");
    await mobFleetService.ensureSchema();
    const memberships = await mobLogisticsService.listMembershipsForCourier(courierId);
    const approved = (memberships || []).filter((m: any) => m.status === "approved");
    const all: any[] = [];
    for (const m of approved) {
      const list = await mobFleetService.listVehicles(m.owner_user_id, m.brand_id, {
        courier_id: courierId,
      });
      for (const v of list) {
        all.push({
          ...v,
          org_name: m.brand_name || m.operation_name || null,
          brand_id: m.brand_id,
        });
      }
    }
    res.json({ success: true, vehicles: all });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/invites/accept", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const code = String(req.body?.code || req.body?.invite_code || "").trim();
    if (!code) return res.status(400).json({ error: "Código do convite obrigatório" });
    const membership = await mobLogisticsService.acceptInvite(courierId, code);
    res.json({ success: true, membership });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao aceitar convite" });
  }
});

router.get("/offers", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const offers = await mobLogisticsService.listAvailableOffers(courierId);
    res.json({ success: true, offers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/deliveries", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const activeOnly = String(req.query.active || "") === "1";
    const deliveries = await mobLogisticsService.listDeliveriesForCourier(courierId, {
      activeOnly,
      status: req.query.status ? String(req.query.status) : undefined,
    });
    res.json({ success: true, deliveries });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/deliveries/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      // allow viewing available offer details (masked)
      if (delivery && !delivery.courier_id) {
        const offers = await mobLogisticsService.listAvailableOffers(courierId);
        const hit = offers.find((o) => o.id === delivery.id);
        if (hit) return res.json({ success: true, delivery: hit, masked: true });
      }
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const events = await mobLogisticsService.listEvents(delivery.id);
    res.json({ success: true, delivery, events });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/deliveries/:id/accept", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.courierAccept(courierId, String(req.params.id));

    try {
      const { notifyOrgDeliveryEvent } = await import("../services/mobPush");
      notifyOrgDeliveryEvent({
        ownerUserId: delivery.owner_user_id,
        brandId: delivery.brand_id,
        eventKey: "delivery_status_changed",
        title: "Entregador aceitou",
        body: delivery.customer_name
          ? `Entrega de ${delivery.customer_name} aceita`
          : "Uma entrega foi aceita no Mob",
        deliveryId: delivery.id,
      });
    } catch {
      /* non-blocking */
    }

    res.json({ success: true, delivery });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao aceitar" });
  }
});

router.post("/deliveries/:id/reject", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const result = await mobLogisticsService.courierReject(
      courierId,
      String(req.params.id),
      req.body?.note ? String(req.body.note) : undefined
    );

    if (result?.redispatched && result.offered_to?.length) {
      try {
        const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
        if (delivery) {
          const { notifyDispatchResult } = await import("../services/mobPush");
          notifyDispatchResult({
            ownerUserId: delivery.owner_user_id,
            brandId: delivery.brand_id,
            deliveryId: delivery.id,
            offeredTo: result.offered_to,
            mode: result.mode || "sequential",
            expiresAt: result.expires_at,
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    res.json({ success: true, redispatched: !!result?.redispatched });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao recusar" });
  }
});

/** Short-lived signed upload grant (HMAC local; ready for S3 when env set). */
router.post("/upload-token", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { createSignedUpload } = await import("../services/mobSignedUpload");
    const purpose = String(req.body?.purpose || "proof") as "proof" | "signature" | "document";
    const contentType = String(req.body?.content_type || "image/jpeg");
    const grant = createSignedUpload({
      courierId,
      deliveryId: req.body?.delivery_id ? String(req.body.delivery_id) : undefined,
      purpose,
      contentType,
      publicBaseUrl: `${req.protocol}://${req.get("host") || ""}`,
    });
    res.json({ success: true, grant });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao criar token de upload" });
  }
});

/** Receive signed body (PUT) and persist under /uploads/... */
router.put("/upload-signed", async (req: AuthRequest, res: Response) => {
  try {
    // Auth optional if token binds courier — still require courier session for safety
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const token = String(req.query.token || req.headers["x-upload-token"] || "").trim();
    const { verifySignedUploadToken, persistSignedBody } = await import("../services/mobSignedUpload");
    const grant = verifySignedUploadToken(token);
    if (grant.courierId !== courierId) {
      return res.status(403).json({ error: "Token não pertence a este entregador" });
    }

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on("end", () => resolve());
      req.on("error", reject);
    });
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) return res.status(400).json({ error: "Corpo vazio" });
    if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: "Arquivo > 8MB" });

    const publicUrl = await persistSignedBody({ key: grant.key, buffer });
    res.json({ success: true, url: publicUrl, key: grant.key, purpose: grant.purpose });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Upload assinado falhou" });
  }
});

router.post(
  "/deliveries/:id/proof",
  (req: AuthRequest, res: Response, next) => {
    // JSON attach path (after signed upload) skips multer
    const ct = String(req.headers["content-type"] || "");
    if (ct.includes("application/json")) return next();
    proofUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Falha no upload" });
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = requireCourier(req, res);
      if (!ctx) return;
      const courierId = await resolveCourierId(ctx, res);
      if (!courierId) return;
      const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
      if (!delivery || delivery.courier_id !== courierId) {
        return res.status(404).json({ error: "Entrega não encontrada" });
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      let url = "";
      if (file) {
        url = `/uploads/mob-proofs/${file.filename}`;
      } else {
        // Attach URL from HMAC signed upload
        const raw = String(req.body?.proof_photo_url || req.body?.url || "").trim();
        if (!raw) return res.status(400).json({ error: "Arquivo ou proof_photo_url obrigatório" });
        // Only allow local uploads paths (signed upload public_url)
        if (!raw.startsWith("/uploads/mob-") && !raw.includes("/uploads/mob-")) {
          return res.status(400).json({ error: "URL de comprovante inválida" });
        }
        try {
          url = raw.startsWith("http") ? new URL(raw).pathname : raw;
        } catch {
          url = raw;
        }
      }

      const { update } = await import("../config/database");
      await update(
        `UPDATE mob_deliveries SET proof_photo_url = ?, updated_at = NOW() WHERE id = ?`,
        [url, delivery.id]
      );
      await mobLogisticsService.appendEvent({
        deliveryId: delivery.id,
        fromStatus: delivery.status,
        toStatus: delivery.status,
        actorType: "courier",
        actorId: courierId,
        courierId,
        source: "proof_upload",
        note: file ? "Foto de comprovante enviada" : "Foto de comprovante (upload assinado)",
      });

      const refreshed = await mobLogisticsService.getDeliveryById(delivery.id);
      res.json({ success: true, proof_photo_url: url, delivery: refreshed });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Falha ao enviar comprovante" });
    }
  }
);

router.post("/deliveries/:id/request-otp", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    if (!delivery.customer_phone) {
      return res.status(400).json({ error: "Cliente sem telefone para OTP" });
    }
    const { issueDeliveryOtp } = await import("../services/mobOtp");
    const result = await issueDeliveryOtp({
      deliveryId: delivery.id,
      ownerUserId: delivery.owner_user_id,
      brandId: delivery.brand_id,
      customerPhone: delivery.customer_phone,
      customerName: delivery.customer_name,
    });
    await mobLogisticsService.appendEvent({
      deliveryId: delivery.id,
      fromStatus: delivery.status,
      toStatus: delivery.status,
      actorType: "courier",
      actorId: courierId,
      courierId,
      source: "otp_request",
      note: `OTP solicitado (${result.sent_via}) → ${result.masked_phone}`,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao enviar OTP" });
  }
});

router.post("/deliveries/:id/signature", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const dataUrl = String(req.body?.signature_data_url || "").trim();
    if (!dataUrl) return res.status(400).json({ error: "signature_data_url obrigatório" });
    const { saveSignatureDataUrl } = await import("../services/mobSignature");
    const url = saveSignatureDataUrl(dataUrl);
    const { update } = await import("../config/database");
    await update(
      `UPDATE mob_deliveries SET signature_url = ?, updated_at = NOW() WHERE id = ?`,
      [url, delivery.id]
    );
    await mobLogisticsService.appendEvent({
      deliveryId: delivery.id,
      fromStatus: delivery.status,
      toStatus: delivery.status,
      actorType: "courier",
      actorId: courierId,
      courierId,
      source: "signature",
      note: "Assinatura do cliente capturada",
    });
    const refreshed = await mobLogisticsService.getDeliveryById(delivery.id);
    res.json({ success: true, signature_url: url, delivery: refreshed });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar assinatura" });
  }
});

router.post("/deliveries/:id/collect-cod", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.collectCod({
      deliveryId: String(req.params.id),
      courierId,
      amount: req.body?.amount != null ? Number(req.body.amount) : undefined,
      note: req.body?.note ? String(req.body.note) : undefined,
    });
    res.json({ success: true, delivery });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar cobrança" });
  }
});

router.post("/deliveries/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }

    const toStatus = String(req.body?.status || "").trim() as DeliveryStatus;
    if (!toStatus) return res.status(400).json({ error: "status obrigatório" });

    const updated = await mobLogisticsService.transitionStatus({
      deliveryId: delivery.id,
      toStatus,
      actorType: "courier",
      actorId: courierId,
      courierId,
      lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
      lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
      note: req.body?.note ? String(req.body.note) : undefined,
      source: "mob_app",
      deviceInfo: req.body?.device_info ? String(req.body.device_info) : undefined,
      proofPhotoUrl: req.body?.proof_photo_url ? String(req.body.proof_photo_url) : undefined,
      deliveryPin: req.body?.delivery_pin ? String(req.body.delivery_pin) : undefined,
      signatureUrl: req.body?.signature_url ? String(req.body.signature_url) : undefined,
      otpCode: req.body?.otp_code ? String(req.body.otp_code) : undefined,
    });

    try {
      const { notifyOrgDeliveryEvent } = await import("../services/mobPush");
      if (toStatus === "delivered") {
        notifyOrgDeliveryEvent({
          ownerUserId: updated.owner_user_id,
          brandId: updated.brand_id,
          eventKey: "mob_delivery_completed",
          title: "Entrega concluída",
          body: updated.customer_name
            ? `${updated.customer_name} recebeu o pedido`
            : "Entrega marcada como concluída no Mob",
          deliveryId: updated.id,
        });
      } else if (["picked_up", "en_route", "at_destination"].includes(toStatus)) {
        notifyOrgDeliveryEvent({
          ownerUserId: updated.owner_user_id,
          brandId: updated.brand_id,
          eventKey: "delivery_status_changed",
          title: "Entrega em andamento",
          body: `Status: ${toStatus.replace(/_/g, " ")}`,
          deliveryId: updated.id,
        });
      }
    } catch {
      /* non-blocking */
    }

    res.json({ success: true, delivery: updated });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar status" });
  }
});

router.get("/routes/active", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const route = await mobLogisticsService.getActiveRouteForCourier(courierId);
    res.json({ success: true, route });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/routes/optimize", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const route = await mobLogisticsService.optimizeCourierActiveRoute(courierId);
    if (!route) return res.status(400).json({ error: "Nenhuma entrega ativa para montar rota" });
    res.json({ success: true, route });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao otimizar rota" });
  }
});

router.post("/routes/:routeId/stops/:stopId/complete", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const route = await mobLogisticsService.completeRouteStop({
      routeId: String(req.params.routeId),
      stopId: String(req.params.stopId),
      courierId,
    });
    res.json({ success: true, route });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao concluir parada" });
  }
});

router.post("/location", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat/lng obrigatórios" });
    }

    // Only while online or on active delivery (privacy)
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier || courier.ops_status === "offline") {
      return res.status(403).json({
        error: "Localização só é registrada com turno online",
        code: "GEO_OFFLINE",
      });
    }

    const result = await mobLogisticsService.recordLocation({
      courierId,
      deliveryId: req.body?.delivery_id ? String(req.body.delivery_id) : undefined,
      brandId: req.body?.brand_id ? String(req.body.brand_id) : undefined,
      lat,
      lng,
      accuracy: req.body?.accuracy != null ? Number(req.body.accuracy) : undefined,
      speed: req.body?.speed != null ? Number(req.body.speed) : undefined,
      heading: req.body?.heading != null ? Number(req.body.heading) : undefined,
      batteryLevel: req.body?.battery_level != null ? Number(req.body.battery_level) : undefined,
      source: req.body?.source ? String(req.body.source) : "mob_app",
      deviceId: req.body?.device_id ? String(req.body.device_id) : undefined,
      recordedAt: req.body?.recorded_at ? String(req.body.recorded_at) : undefined,
    });

    if (!result.accepted) {
      return res.status(422).json({
        error: result.fraud?.message || "Localização rejeitada por anti-fraude",
        code: "GEO_FRAUD",
        fraud: result.fraud,
      });
    }

    // Geofencing (never auto-completes delivery)
    let geofence: any = null;
    try {
      const { mobOpsService } = await import("../services/mobOps");
      geofence = await mobOpsService.evaluateGeofences({
        courierId,
        lat,
        lng,
        deliveryId: req.body?.delivery_id ? String(req.body.delivery_id) : undefined,
        brandId: req.body?.brand_id ? String(req.body.brand_id) : undefined,
        accuracy: req.body?.accuracy != null ? Number(req.body.accuracy) : undefined,
      });
    } catch {
      /* non-blocking */
    }

    res.json({
      success: true,
      fraud: result.fraud || null,
      geofence,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar localização" });
  }
});

/** Offline batch sync — idempotent via client_event_id */
router.post("/sync", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!events.length) return res.json({ success: true, results: [] });
    const { mobSyncService } = await import("../services/mobSync");
    const results = await mobSyncService.processEvents(courierId, events);
    res.json({ success: true, results });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha na sincronização" });
  }
});

/* ── Packages / volumes (QR conference) ── */

router.get("/deliveries/:id/packages", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const { mobPackagesService } = await import("../services/mobPackages");
    await mobPackagesService.ensureForDelivery({
      id: delivery.id,
      owner_user_id: delivery.owner_user_id,
      brand_id: delivery.brand_id,
      package_count: (delivery as any).package_count,
      require_package_scan: !!(delivery as any).require_package_scan,
    });
    const conference = await mobPackagesService.getConference(delivery.id);
    res.json({ success: true, conference });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/deliveries/:id/packages/scan", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const code = String(req.body?.code || req.body?.qr || "").trim();
    if (!code) return res.status(400).json({ error: "code ou qr obrigatório" });
    const phase = String(req.body?.phase || "pickup") === "dropoff" ? "dropoff" : "pickup";
    const { mobPackagesService } = await import("../services/mobPackages");
    const result = await mobPackagesService.scan({
      deliveryId: delivery.id,
      codeOrQr: code,
      phase,
      courierId,
      note: req.body?.note ? String(req.body.note) : undefined,
    });
    await mobLogisticsService.appendEvent({
      deliveryId: delivery.id,
      fromStatus: delivery.status,
      toStatus: delivery.status,
      actorType: "courier",
      actorId: courierId,
      courierId,
      source: "package_scan",
      note: `Scan ${phase}: ${result.package.code}`,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/deliveries/:id/packages/:pkgId/status", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const status = String(req.body?.status || "").trim() as any;
    if (!["missing", "damaged", "loaded", "returned", "pending"].includes(status)) {
      return res.status(400).json({ error: "status inválido" });
    }
    const { mobPackagesService } = await import("../services/mobPackages");
    const pkg = await mobPackagesService.markStatus({
      packageId: String(req.params.pkgId),
      deliveryId: delivery.id,
      status,
      courierId,
      note: req.body?.note ? String(req.body.note) : undefined,
    });
    const conference = await mobPackagesService.getConference(delivery.id);
    res.json({ success: true, package: pkg, conference });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/deliveries/:id/packages/confirm-load", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const delivery = await mobLogisticsService.getDeliveryById(String(req.params.id));
    if (!delivery || delivery.courier_id !== courierId) {
      return res.status(404).json({ error: "Entrega não encontrada" });
    }
    const { mobPackagesService } = await import("../services/mobPackages");
    const conference = await mobPackagesService.confirmLoad(delivery.id, courierId);
    res.json({ success: true, conference });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

/* ── Shifts / check-in ── */

router.get("/shift", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobOpsService } = await import("../services/mobOps");
    const shift = await mobOpsService.getActiveShift(courierId);
    const history = await mobOpsService.listShifts(courierId, 10);
    res.json({ success: true, shift, history });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/shift/start", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobOpsService } = await import("../services/mobOps");
    const result = await mobOpsService.startShift(courierId, {
      vehicle_id: req.body?.vehicle_id ? String(req.body.vehicle_id) : null,
      confirm_identity: req.body?.confirm_identity !== false,
      confirm_vehicle: !!req.body?.confirm_vehicle || !!req.body?.vehicle_id,
      confirm_gps: req.body?.confirm_gps !== false,
      confirm_internet: req.body?.confirm_internet !== false,
      confirm_notifications: req.body?.confirm_notifications !== false,
      confirm_kit: req.body?.confirm_kit !== false,
      fuel_or_battery_pct:
        req.body?.fuel_or_battery_pct != null ? Number(req.body.fuel_or_battery_pct) : null,
      vehicle_ok: req.body?.vehicle_ok !== false,
      selfie_url: req.body?.selfie_url ? String(req.body.selfie_url) : null,
      notes: req.body?.notes ? String(req.body.notes) : null,
      lat: req.body?.lat != null ? Number(req.body.lat) : null,
      lng: req.body?.lng != null ? Number(req.body.lng) : null,
      brand_id: req.body?.brand_id ? String(req.body.brand_id) : null,
      owner_user_id: req.body?.owner_user_id ? String(req.body.owner_user_id) : null,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha no check-in" });
  }
});

router.post("/shift/pause", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobOpsService } = await import("../services/mobOps");
    const shift = await mobOpsService.pauseShift(courierId);
    res.json({ success: true, shift });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/shift/resume", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobOpsService } = await import("../services/mobOps");
    const shift = await mobOpsService.resumeShift(courierId);
    res.json({ success: true, shift });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/shift/end", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = requireCourier(req, res);
    if (!ctx) return;
    const courierId = await resolveCourierId(ctx, res);
    if (!courierId) return;
    const { mobOpsService } = await import("../services/mobOps");
    const shift = await mobOpsService.endShift(courierId, {
      lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
      lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
      notes: req.body?.notes ? String(req.body.notes) : undefined,
    });
    res.json({ success: true, shift });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
