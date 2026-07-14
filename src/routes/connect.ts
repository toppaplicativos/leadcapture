/**
 * /api/connect/* — LeadCapture Connect (Android companion)
 *
 * Devices, bindings to WhatsApp instances, command queue, sync snapshot.
 */
import { Router, type Response } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import {
  connectDeviceService,
  ensureConnectSchema,
  type ConnectCommandType,
} from "../services/connectDevice";
import {
  resolveInstanceAuthScope,
  ensureWhatsAppInstanceOwnerSchema,
} from "../services/instanceOwnership";
import { logger } from "../utils/logger";

const router = Router();

const COMMAND_TYPES = new Set<ConnectCommandType>([
  "OPEN_PAIRING",
  "SHOW_QR",
  "OPEN_WHATSAPP_NATIVE",
  "REFRESH_STATUS",
  "CREATE_LOCAL_SLOT",
  "PAUSE_SLOT",
  "DELETE_BINDING",
  "SYNC_NOW",
]);

function resolveBrandId(req: AuthRequest): string | null {
  const raw =
    req.headers["x-brand-id"] ||
    (req.body as any)?.brand_id ||
    (req.query as any)?.brand_id ||
    "";
  const brandId = String(raw || "").trim();
  return brandId || null;
}

router.use(authMiddleware);

router.use(async (_req, _res, next) => {
  try {
    await ensureConnectSchema();
    await ensureWhatsAppInstanceOwnerSchema();
  } catch (e) {
    /* schema best-effort */
  }
  next();
});

/** GET /api/connect/me — profile + devices for current auth scope */
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });

    const devices = await connectDeviceService.listDevices(scope);
    res.json({
      success: true,
      user: {
        id: scope.actorUserId,
        owner_user_id: scope.ownerUserId,
        is_affiliate: scope.isAffiliate,
        brand_id: scope.brandId || resolveBrandId(req),
        email: (req.user as any)?.email || null,
        role: (req.user as any)?.role || null,
        credential_type: (req.user as any)?.credential_type || null,
      },
      devices,
      app_context: "connect",
    });
  } catch (err: any) {
    logger.error(`[connect/me] ${err?.message}`);
    res.status(500).json({ error: err?.message || "connect_me_failed" });
  }
});

/** POST /api/connect/devices/register */
router.post("/devices/register", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const device = await connectDeviceService.registerDevice({
      scope,
      deviceId: String(body.device_id || body.deviceId || "").trim(),
      displayName: body.display_name || body.displayName || body.name || undefined,
      model: body.model || undefined,
      manufacturer: body.manufacturer || undefined,
      osVersion: body.os_version || body.osVersion || undefined,
      appVersion: body.app_version || body.appVersion || undefined,
      fcmToken: body.fcm_token || body.fcmToken || null,
      brandId: resolveBrandId(req),
    });
    res.json({ success: true, device });
  } catch (err: any) {
    const status = err?.status || 500;
    logger.error(`[connect/register] ${err?.message}`);
    res.status(status).json({ error: err?.code || err?.message || "register_failed" });
  }
});

/** POST /api/connect/devices/heartbeat */
router.post("/devices/heartbeat", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const device = await connectDeviceService.heartbeat({
      scope,
      deviceId: String(body.device_id || body.deviceId || "").trim(),
      battery: body.battery != null ? Number(body.battery) : null,
      network: body.network || null,
      clonesSummary: body.clones_summary || body.clonesSummary || null,
      meta: body.meta || {},
    });
    if (!device) return res.status(404).json({ error: "device_not_found" });
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "heartbeat_failed" });
  }
});

/** GET /api/connect/devices */
router.get("/devices", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const devices = await connectDeviceService.listDevices(scope);
    res.json({ success: true, devices });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "list_devices_failed" });
  }
});

/** GET /api/connect/sync?device_id= */
router.get("/sync", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const deviceId = String(req.query.device_id || "").trim();
    if (!deviceId) return res.status(400).json({ error: "device_id_required" });

    const instanceManager = req.app.get("instanceManager");
    const snapshot = await connectDeviceService.getSyncSnapshot({
      scope: { ...scope, brandId: resolveBrandId(req) || scope.brandId },
      deviceId,
      brandId: resolveBrandId(req),
      instanceManager,
    });
    res.json({ success: true, ...snapshot });
  } catch (err: any) {
    logger.error(`[connect/sync] ${err?.message}`);
    res.status(500).json({ error: err?.message || "sync_failed" });
  }
});

/** POST /api/connect/bindings */
router.post("/bindings", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const binding = await connectDeviceService.upsertBinding({
      scope,
      deviceId: String(body.device_id || body.deviceId || "").trim(),
      instanceId: String(body.instance_id || body.instanceId || "").trim(),
      localCloneId:
        body.local_clone_id != null
          ? Number(body.local_clone_id)
          : body.localCloneId != null
            ? Number(body.localCloneId)
            : null,
      label: body.label || body.name || null,
      colorHex: body.color_hex || body.colorHex || null,
      groupName: body.group_name || body.groupName || null,
      appType: body.app_type || body.appType || "WHATSAPP",
      brandId: resolveBrandId(req),
    });
    res.json({ success: true, binding });
  } catch (err: any) {
    const status = err?.status || 500;
    res.status(status).json({ error: err?.code || err?.message || "binding_failed" });
  }
});

/** GET /api/connect/bindings?device_id= */
router.get("/bindings", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const deviceId = req.query.device_id ? String(req.query.device_id) : null;
    const bindings = await connectDeviceService.listBindings({ scope, deviceId });
    res.json({ success: true, bindings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "list_bindings_failed" });
  }
});

/** DELETE /api/connect/bindings/:id */
router.delete("/bindings/:id", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const ok = await connectDeviceService.deleteBinding({
      scope,
      bindingId: String(req.params.id),
    });
    if (!ok) return res.status(404).json({ error: "binding_not_found" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "delete_binding_failed" });
  }
});

/** POST /api/connect/commands — enqueue (panel → device) */
router.post("/commands", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const commandType = String(body.command_type || body.type || "").trim().toUpperCase() as ConnectCommandType;
    if (!COMMAND_TYPES.has(commandType)) {
      return res.status(400).json({
        error: "invalid_command_type",
        allowed: Array.from(COMMAND_TYPES),
      });
    }
    const payload =
      body.payload && typeof body.payload === "object"
        ? { ...body.payload }
        : {
            instance_id: body.instance_id || body.instanceId,
            phone: body.phone || body.phoneNumber,
            note: body.note,
          };
    if (body.instance_id && !payload.instance_id) payload.instance_id = body.instance_id;
    if (body.phone && !payload.phone) payload.phone = body.phone;

    const command = await connectDeviceService.enqueueCommand({
      scope,
      deviceId: String(body.device_id || body.deviceId || "").trim(),
      commandType,
      payload,
      brandId: resolveBrandId(req),
      ttlMinutes: body.ttl_minutes != null ? Number(body.ttl_minutes) : undefined,
    });
    res.json({ success: true, command });
  } catch (err: any) {
    const status = err?.status || 500;
    res.status(status).json({ error: err?.code || err?.message || "enqueue_failed" });
  }
});

/**
 * POST /api/connect/dispatch
 * Atalho painel: escolhe device (ou o mais recente) e enfileira comando nativo
 * para uma instance_id (OPEN_PAIRING, SHOW_QR, OPEN_WHATSAPP_NATIVE, …).
 */
router.post("/dispatch", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const commandType = String(body.command_type || body.type || "OPEN_PAIRING")
      .trim()
      .toUpperCase() as ConnectCommandType;
    if (!COMMAND_TYPES.has(commandType)) {
      return res.status(400).json({
        error: "invalid_command_type",
        allowed: Array.from(COMMAND_TYPES),
      });
    }

    const instanceId = String(body.instance_id || body.instanceId || "").trim();
    if (!instanceId && commandType !== "SYNC_NOW") {
      return res.status(400).json({ error: "instance_id_required" });
    }

    let deviceId = String(body.device_id || body.deviceId || "").trim();
    if (!deviceId) {
      const devices = await connectDeviceService.listDevices(scope);
      const active = devices.find((d) => d.is_active) || devices[0];
      if (!active?.device_id) {
        return res.status(404).json({
          error: "no_device",
          message: "Nenhum device Connect registrado. Abra o app Android e faça login.",
        });
      }
      deviceId = active.device_id;
    }

    const payload: Record<string, any> = {
      instance_id: instanceId || undefined,
      phone: body.phone || body.phoneNumber || undefined,
      note: body.note || "dispatch_from_panel",
    };

    const command = await connectDeviceService.enqueueCommand({
      scope,
      deviceId,
      commandType,
      payload,
      brandId: resolveBrandId(req),
      ttlMinutes: body.ttl_minutes != null ? Number(body.ttl_minutes) : 30,
    });

    res.json({
      success: true,
      command,
      device_id: deviceId,
      hint: "O app Android processa em até ~8s (poll) ou no próximo Sync.",
    });
  } catch (err: any) {
    const status = err?.status || 500;
    logger.error(`[connect/dispatch] ${err?.message}`);
    res.status(status).json({ error: err?.code || err?.message || "dispatch_failed" });
  }
});

/**
 * POST /api/connect/bootstrap
 * Cria instância Baileys + binding do slot nativo (+ opcional comando OPEN_PAIRING).
 */
router.post("/bootstrap", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const deviceId = String(body.device_id || body.deviceId || "").trim();
    if (!deviceId) return res.status(400).json({ error: "device_id_required" });

    const brandId = resolveBrandId(req) || scope.brandId;
    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager?.createInstance) {
      return res.status(503).json({ error: "instance_manager_unavailable" });
    }

    // Garante device registrado
    await connectDeviceService.registerDevice({
      scope,
      deviceId,
      displayName: body.display_name || body.device_name || undefined,
      brandId,
    }).catch(() => undefined);

    let instanceId = String(body.instance_id || body.instanceId || "").trim();
    let instance: any = null;

    if (!instanceId) {
      const { buildOwnerMetaForCreate } = await import("../services/instanceOwnership");
      const ownerMeta = buildOwnerMetaForCreate(scope);
      let name = String(body.instance_name || body.name || body.label || "").trim();
      if (!name) {
        name = `connect-${Date.now().toString(36).slice(-6).toUpperCase()}`;
      }
      if (!scope.isAffiliate) {
        try {
          const { assertInstanceLimit } = await import("../services/planEntitlements");
          await assertInstanceLimit(scope.ownerUserId);
        } catch (limitErr: any) {
          if (limitErr?.code || limitErr?.status) {
            return res.status(limitErr.status || 403).json({
              error: limitErr.code || "plan_instance_limit",
              message: limitErr.message,
            });
          }
          throw limitErr;
        }
      } else if (!brandId) {
        return res.status(400).json({ error: "brand_id_required_for_affiliate" });
      }

      instance = await instanceManager.createInstance(
        name,
        scope.ownerUserId,
        brandId || null,
        ownerMeta
      );
      instanceId = String(instance?.id || "");
      if (!instanceId) {
        return res.status(500).json({ error: "create_instance_failed" });
      }
    } else {
      const { instanceBelongsToScope } = await import("../services/instanceOwnership");
      const allowed = await instanceBelongsToScope(instanceId, scope, brandId);
      if (!allowed) return res.status(404).json({ error: "instance_not_found" });
    }

    const binding = await connectDeviceService.upsertBinding({
      scope,
      deviceId,
      instanceId,
      localCloneId:
        body.local_clone_id != null
          ? Number(body.local_clone_id)
          : body.localCloneId != null
            ? Number(body.localCloneId)
            : null,
      label: body.label || body.name || null,
      colorHex: body.color_hex || body.colorHex || null,
      groupName: body.group_name || body.groupName || "Connect",
      appType: body.app_type || body.appType || "WHATSAPP",
      brandId,
    });

    let command = null;
    const enqueuePairing = body.enqueue_pairing === true || body.enqueuePairing === true;
    const phone = String(body.phone || body.phoneNumber || "").trim();
    if (enqueuePairing && phone) {
      command = await connectDeviceService.enqueueCommand({
        scope,
        deviceId,
        commandType: "OPEN_PAIRING",
        payload: {
          instance_id: instanceId,
          phone,
          package_name: body.package_name || body.packageName,
          isolation_mode: body.isolation_mode || body.isolationMode,
          note: "bootstrap_pairing",
        },
        brandId,
      });
    }

    res.json({
      success: true,
      instance_id: instanceId,
      instance: instance || { id: instanceId },
      binding,
      command,
    });
  } catch (err: any) {
    logger.error(`[connect/bootstrap] ${err?.message}`);
    res.status(err?.status || 500).json({ error: err?.code || err?.message || "bootstrap_failed" });
  }
});

/**
 * POST /api/connect/devices/capabilities
 * Device reporta packages instalados + work profile + engine virtual.
 */
router.post("/devices/capabilities", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};
    const deviceId = String(body.device_id || body.deviceId || "").trim();
    if (!deviceId) return res.status(400).json({ error: "device_id_required" });

    const device = await connectDeviceService.heartbeat({
      scope,
      deviceId,
      network: "android-capabilities",
      clonesSummary: {
        packages: body.packages || [],
        slot_count: body.slot_count ?? body.slotCount ?? null,
        work_profile: body.work_profile ?? body.workProfile ?? null,
        max_practical_slots: body.max_practical_slots ?? body.maxPracticalSlots ?? null,
        virtual_engine: body.virtual_engine || body.virtualEngine || null,
        isolation_modes: body.isolation_modes || body.isolationModes || null,
      },
      meta: {
        capabilities: true,
        reported_at: new Date().toISOString(),
      },
    });
    if (!device) {
      // auto-register then retry once
      await connectDeviceService.registerDevice({
        scope,
        deviceId,
        brandId: resolveBrandId(req),
      });
      const again = await connectDeviceService.heartbeat({
        scope,
        deviceId,
        network: "android-capabilities",
        clonesSummary: body,
        meta: { capabilities: true },
      });
      return res.json({ success: true, device: again });
    }
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "capabilities_failed" });
  }
});

/** GET /api/connect/commands?device_id=&status=open */
router.get("/commands", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const deviceId = String(req.query.device_id || "").trim();
    if (!deviceId) return res.status(400).json({ error: "device_id_required" });
    const status = (req.query.status as any) || "open";
    const commands = await connectDeviceService.listCommands({
      scope,
      deviceId,
      status,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json({ success: true, commands });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "list_commands_failed" });
  }
});

/** POST /api/connect/commands/:id/ack */
router.post("/commands/:id/ack", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!["accepted", "done", "failed"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    const command = await connectDeviceService.ackCommand({
      scope,
      commandId: String(req.params.id),
      status: status as "accepted" | "done" | "failed",
      detail: req.body?.detail || req.body?.result || {},
    });
    if (!command) return res.status(404).json({ error: "command_not_found" });
    res.json({ success: true, command });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "ack_failed" });
  }
});

/** GET /api/connect/activity?device_id= */
router.get("/activity", async (req: AuthRequest, res: Response) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const activity = await connectDeviceService.listActivity({
      scope,
      deviceId: req.query.device_id ? String(req.query.device_id) : null,
      limit: req.query.limit ? Number(req.query.limit) : 40,
    });
    res.json({ success: true, activity });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "activity_failed" });
  }
});

export default router;
