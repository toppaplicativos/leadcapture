import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { InstanceManager } from "./core/instanceManager";
import { GooglePlacesService } from "./services/googlePlaces";
import { GeminiService } from "./services/gemini";
import { RateLimiter } from "./core/rateLimiter";
import { Lead, CampaignConfig } from "./types";
import { logger } from "./utils/logger";
import { ProductsService } from "./services/products";
import authRoutes from "./routes/auth";
import customersRoutes from "./routes/customers";
import knowledgeBaseRoutes from "./routes/knowledgeBase";
import aiRoutes from "./routes/ai";
import mediaRoutes from "./routes/media";
import companiesRoutes from "./routes/companies";
import clientsRoutes from "./routes/clients";
import sessionsRoutes from "./routes/sessions";
import automationsRoutes from "./routes/automations";
import { CustomersService } from "./services/customers";
import { KnowledgeBaseService } from "./services/knowledgeBase";
import { authMiddleware, AuthRequest, requireRole } from "./middleware/auth";

import inboxRoutes from "./routes/inbox";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import priceTablesRoutes from "./routes/pricetables";
import expeditionRoutes from "./routes/expedition";
import { InboxService } from "./services/inbox";
import { AutomationRuntimeService } from "./services/automationRuntime";
import { query, queryOne } from "./config/database";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ==================== PUBLIC ROUTES ====================
app.use("/api/auth", authRoutes);

// Health check (public)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    instances: instanceManager.getAllInstances().length,
  });
});

// ==================== PROTECTED ROUTES ====================
app.use("/api/customers", authMiddleware, customersRoutes);
app.use("/api/knowledge-base", authMiddleware, knowledgeBaseRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/media", authMiddleware, mediaRoutes);
app.use("/api/companies", authMiddleware, companiesRoutes);
app.use("/api/clients", authMiddleware, clientsRoutes);
app.use("/api/sessions", authMiddleware, sessionsRoutes);
app.use("/api/automations", authMiddleware, automationsRoutes);
app.use("/api/inbox", authMiddleware, inboxRoutes);
app.use("/api/categories", authMiddleware, categoriesRoutes);
app.use("/api/products", authMiddleware, productsRoutes);
app.use("/api/pricetables", authMiddleware, priceTablesRoutes);
app.use("/api/expedition", authMiddleware, expeditionRoutes);

// Services
const instanceManager = new InstanceManager();
app.set("instanceManager", instanceManager);
const automationRuntime = new AutomationRuntimeService(instanceManager);
app.set("automationRuntime", automationRuntime);
const inboxService = new InboxService();
inboxService.setMediaDownloader((instanceId, msg) => instanceManager.downloadIncomingMedia(instanceId, msg));
instanceManager.onGlobalMessage(async (instanceId, msg) => {
  await inboxService.handleIncomingMessage(instanceId, msg);
  try {
    const root = msg?.message || {};
    const parsedBody =
      root?.conversation ||
      root?.extendedTextMessage?.text ||
      root?.imageMessage?.caption ||
      root?.videoMessage?.caption ||
      root?.documentMessage?.caption ||
      root?.documentMessage?.fileName ||
      "";

    await automationRuntime.triggerInboundMessage({
      instanceId,
      remoteJid: String(msg?.key?.remoteJid || ""),
      body: String(parsedBody || ""),
      timestamp: Number(msg?.messageTimestamp || Date.now()),
    });
  } catch (error: any) {
    logger.error(`Automation inbound trigger failed: ${error.message}`);
  }
});
const googlePlaces = new GooglePlacesService();
const gemini = new GeminiService();
const rateLimiter = new RateLimiter(3, 200);
const productsService = new ProductsService();
const customersService = new CustomersService();
const knowledgeBaseService = new KnowledgeBaseService();

// In-memory campaign tracking
const campaignsActive: Map<string, boolean> = new Map();

async function instanceBelongsToUser(instanceId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM whatsapp_instances WHERE id = ? AND created_by = ? LIMIT 1",
    [instanceId, userId]
  );
  return !!row;
}

type OwnedInstanceRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
};

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function parseObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function normalizeLeadTags(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean).join(", ");
    }
  } catch {
    // keep raw string
  }
  return trimmed;
}

function normalizeLeadRecord(raw: any): any {
  const sourceDetails = parseObject(raw?.source_details);
  const whatsappValidation = parseObject(sourceDetails?.whatsapp_validation);
  const hasWhatsappRaw =
    raw?.has_whatsapp ??
    raw?.whatsapp_valid ??
    raw?.whatsapp_is_valid ??
    whatsappValidation?.has_whatsapp;

  let hasWhatsapp: boolean | null = null;
  if (typeof hasWhatsappRaw === "boolean") {
    hasWhatsapp = hasWhatsappRaw;
  } else if (hasWhatsappRaw === 1 || hasWhatsappRaw === "1" || String(hasWhatsappRaw).toLowerCase() === "true") {
    hasWhatsapp = true;
  } else if (
    hasWhatsappRaw === 0 ||
    hasWhatsappRaw === "0" ||
    String(hasWhatsappRaw).toLowerCase() === "false"
  ) {
    hasWhatsapp = false;
  }

  return {
    ...raw,
    address: String(raw?.address || raw?.address_street || sourceDetails?.address || "").trim(),
    city: String(raw?.city || raw?.address_city || sourceDetails?.city || "").trim(),
    state: String(raw?.state || raw?.address_state || sourceDetails?.state || "").trim(),
    tags: normalizeLeadTags(raw?.tags),
    has_whatsapp: hasWhatsapp,
    whatsapp_validation_status:
      String(raw?.whatsapp_validation_status || whatsappValidation?.status || "").trim() || null,
    whatsapp_validated_at:
      String(
        raw?.whatsapp_verified_at ||
          raw?.whatsapp_validated_at ||
          raw?.whatsapp_checked_at ||
          whatsappValidation?.checked_at ||
          ""
      ).trim() || null,
    whatsapp_jid: String(raw?.whatsapp_jid || whatsappValidation?.jid || "").trim() || null,
  };
}

function isLeadPendingWhatsAppValidation(raw: any): boolean {
  const phone = normalizePhone(raw?.phone);
  if (!phone) return false;

  const normalized = normalizeLeadRecord(raw);
  if (normalized.has_whatsapp === true || normalized.has_whatsapp === false) {
    return false;
  }

  if (normalized.whatsapp_validated_at) return false;

  const status = String(normalized.whatsapp_validation_status || "")
    .trim()
    .toLowerCase();
  if (status === "valid" || status === "invalid") return false;

  return true;
}

async function resolveValidationInstanceId(
  userId: string,
  preferredInstanceId?: string
): Promise<string | null> {
  const preferred = String(preferredInstanceId || "").trim();
  if (preferred) return preferred;

  const connectedRuntime = instanceManager
    .getAllInstances(userId)
    .find((instance) => instance.status === "connected");
  if (connectedRuntime) return connectedRuntime.id;

  const dbConnected = await queryOne<{ id: string }>(
    "SELECT id FROM whatsapp_instances WHERE created_by = ? AND status = 'connected' LIMIT 1",
    [userId]
  );
  return dbConnected?.id || null;
}

async function findLeadByGooglePlaceId(
  placeId: string,
  userId: string
): Promise<any | null> {
  const columns = await query<any[]>("SHOW COLUMNS FROM customers");
  const names = new Set(columns.map((row) => String(row?.Field || "")));
  const ownerColumn = names.has("user_id") ? "user_id" : names.has("assigned_to") ? "assigned_to" : null;
  const ownerWhere = ownerColumn ? ` AND ${ownerColumn} = ?` : "";
  const ownerParams = ownerColumn ? [userId] : [];

  if (names.has("google_place_id")) {
    const byLegacy = await queryOne<any>(
      `SELECT * FROM customers WHERE google_place_id = ?${ownerWhere} LIMIT 1`,
      [placeId, ...ownerParams]
    );
    if (byLegacy) return byLegacy;
  }

  if (names.has("source_details")) {
    const bySourceDetails = await queryOne<any>(
      `SELECT *
       FROM customers
       WHERE JSON_UNQUOTE(JSON_EXTRACT(source_details, '$.google_place_id')) = ?${ownerWhere}
       LIMIT 1`,
      [placeId, ...ownerParams]
    );
    if (bySourceDetails) return bySourceDetails;
  }

  return null;
}

async function resolveTestDestination(
  instanceId: string,
  userId: string,
  testPhone?: unknown
): Promise<{
  destinationPhone: string;
  usedDefaultNumber: boolean;
  instance: OwnedInstanceRow;
}> {
  const instance = await queryOne<OwnedInstanceRow>(
    "SELECT id, name, phone, status FROM whatsapp_instances WHERE id = ? AND created_by = ? LIMIT 1",
    [instanceId, userId]
  );

  if (!instance) {
    throw new Error("Instance not found");
  }

  const explicitPhone = normalizePhone(testPhone);
  const defaultPhone = normalizePhone(instance.phone);
  const destinationPhone = explicitPhone || defaultPhone;

  if (!destinationPhone) {
    throw new Error(
      "No test destination number available. Connect this instance first or provide testPhone."
    );
  }

  return {
    destinationPhone,
    usedDefaultNumber: explicitPhone.length === 0,
    instance,
  };
}

// ==================== INSTANCE ROUTES (protected) ====================

app.post("/api/instances", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const instance = await instanceManager.createInstance(name, userId);
    res.json({ success: true, instance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/connect", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.id, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    const qr = await instanceManager.connectInstance(req.params.id);
    res.json({ success: true, qrCode: qr });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances/:id/qr", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.id, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    const qr = instanceManager.getInstanceQR(req.params.id, userId);
    if (qr) {
      res.json({ success: true, qrCode: qr });
    } else {
      res.json({ success: false, message: "QR not available" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/disconnect", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.id, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    await instanceManager.disconnectInstance(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/instances/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.id, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    await instanceManager.deleteInstance(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const runtimeMap = new Map(
      instanceManager.getAllInstances(userId).map((instance) => [instance.id, instance])
    );

    const dbInstances = await query<any[]>(
      `SELECT id, name, phone, status, created_at, messages_sent, messages_received
       FROM whatsapp_instances
       WHERE created_by = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const instances = dbInstances.map((row) => {
      const runtime = runtimeMap.get(row.id);
      if (runtime) return runtime;
      return {
        id: row.id,
        name: row.name,
        phone: row.phone || undefined,
        status: row.status,
        createdAt: row.created_at,
        messagessSent: Number(row.messages_sent || 0),
        messagesReceived: Number(row.messages_received || 0),
      };
    });
    res.json({ success: true, instances });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.id, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const instance =
      instanceManager.getInstance(req.params.id, userId) ||
      (await queryOne<any>(
        `SELECT id, name, phone, status, created_at, messages_sent, messages_received
         FROM whatsapp_instances
         WHERE id = ? AND created_by = ?`,
        [req.params.id, userId]
      ));

    if (!instance) return res.status(404).json({ error: "Instance not found" });
    const normalizedInstance = instance.created_at
      ? {
          id: instance.id,
          name: instance.name,
          phone: instance.phone || undefined,
          status: instance.status,
          createdAt: instance.created_at,
          messagessSent: Number(instance.messages_sent || 0),
          messagesReceived: Number(instance.messages_received || 0),
        }
      : instance;
    res.json({ success: true, instance: normalizedInstance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEADS ROUTES (protected) ====================

// Search leads via Google Places V2 and persist to MySQL
app.post("/api/leads/search", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { query: rawQuery, location: rawLocation, radius, maxResults } = req.body;
    const searchQuery = String(rawQuery || "").trim();
    const searchLocation = String(rawLocation || "").trim();
    const requested = Math.max(1, Math.min(100, Math.floor(Number(maxResults) || 20)));
    const searchRadius =
      typeof radius === "number" && Number.isFinite(radius)
        ? Math.max(100, Math.floor(radius))
        : undefined;

    if (!searchQuery || !searchLocation) {
      return res.status(400).json({ error: "Query and location are required" });
    }

    logger.info(`Searching leads: "${searchQuery}" in "${searchLocation}" (target: ${requested})`);

    // Use new Google Places V2 (RapidAPI) - returns raw place objects
    const places = await googlePlaces.searchText({
      query: searchQuery,
      location: searchLocation,
      radius: searchRadius,
      maxResults: requested,
    });

    // Persist to MySQL customers table (deduplicates by google_place_id + phone)
    const persisted = await customersService.bulkCreateFromPlaces(places, userId, {
      query: searchQuery,
      location: searchLocation,
      radius: searchRadius,
    });
    const createdSet = new Set(persisted.createdPlaceIds || []);
    const existingSet = new Set(persisted.existingPlaceIds || []);

    logger.info(
      `Lead search complete: ${places.length} found, ${persisted.created} created, ${persisted.skipped} skipped`
    );

    if ((persisted.createdLeadIds || []).length > 0) {
      await Promise.all(
        (persisted.createdLeadIds || []).map((leadId) =>
          automationRuntime.triggerLeadCreated(userId, leadId, {
            segmento: searchQuery,
            cidade: searchLocation,
          })
        )
      );
    }

    const resolveAddress = (place: any) => {
      const formatted = String(place?.formattedAddress || place?.shortFormattedAddress || "").trim();
      if (formatted) return formatted;
      const pieces = Array.isArray(place?.addressComponents)
        ? place.addressComponents
            .map((part: any) => String(part?.longText || part?.shortText || "").trim())
            .filter(Boolean)
        : [];
      return pieces.join(", ");
    };

    // Also return the mapped lead format for frontend compatibility
    const leads = places.map((place: any) => ({
      id: place.id,
      name: place.displayName?.text || "Unknown",
      phone: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
      address: resolveAddress(place) || "",
      rating: place.rating || 0,
      reviews: place.userRatingCount || 0,
      category: place.types?.[0] || "",
      placeId: place.id,
      website: place.websiteUri || "",
      googleMapsUri: place.googleMapsUri || "",
      businessStatus: place.businessStatus || "",
      location: place.location || null,
      captureStatus: existingSet.has(String(place.id))
        ? "captured"
        : createdSet.has(String(place.id))
        ? "new"
        : "new",
      captureQuery: searchQuery,
    }));

    const capturedPoints = await customersService.getCapturedGeoPoints(userId, 600);

    res.json({
      success: true,
      leads,
      total: leads.length,
      requested,
      insufficientResults: leads.length < requested,
      persisted: {
        created: persisted.created,
        skipped: persisted.skipped,
      },
      capturedPoints,
    });
  } catch (error: any) {
    logger.error(`Lead search error: ${error.message}`);
    const statusCode = String(error.message || "").includes("Google Places search failed") ? 502 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// Manual capture from map pin (same persistence flow + WhatsApp validation attempt)
app.post("/api/leads/capture-manual", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const leadInput = req.body?.lead || {};
    const captureQuery = String(req.body?.query || leadInput.captureQuery || "captacao_manual").trim();
    const captureLocation = String(req.body?.location || "mapa").trim();
    const captureRadiusRaw = Number(req.body?.radius);
    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;

    const placeId = String(leadInput.placeId || leadInput.id || "").trim();
    const name = String(leadInput.name || "Novo Lead").trim();
    if (!placeId || !name) {
      return res.status(400).json({ error: "Lead payload invalid: placeId/id and name are required" });
    }

    const category = String(leadInput.category || "").trim();
    const mappedPlace = {
      id: placeId,
      displayName: { text: name },
      formattedAddress: String(leadInput.address || "").trim() || undefined,
      internationalPhoneNumber: String(leadInput.phone || "").trim() || undefined,
      nationalPhoneNumber: String(leadInput.phone || "").trim() || undefined,
      rating: typeof leadInput.rating === "number" ? leadInput.rating : undefined,
      userRatingCount: typeof leadInput.reviews === "number" ? leadInput.reviews : undefined,
      types: category ? [category] : [],
      websiteUri: String(leadInput.website || "").trim() || undefined,
      googleMapsUri: String(leadInput.googleMapsUri || "").trim() || undefined,
      businessStatus: String(leadInput.businessStatus || "").trim() || undefined,
      location: leadInput.location || null,
    };

    const captureContext = {
      query: captureQuery || "captacao_manual",
      location: captureLocation || "mapa",
      radius:
        Number.isFinite(captureRadiusRaw) && captureRadiusRaw > 0
          ? Math.floor(captureRadiusRaw)
          : undefined,
    };

    const persisted = await customersService.bulkCreateFromPlaces([mappedPlace], userId, captureContext);
    const createdSet = new Set(persisted.createdPlaceIds || []);
    const existingSet = new Set(persisted.existingPlaceIds || []);

    let dbLead: any | null = null;
    if ((persisted.createdLeadIds || []).length > 0) {
      dbLead = await customersService.getById(String(persisted.createdLeadIds[0]), userId);
    }
    if (!dbLead) {
      dbLead = await findLeadByGooglePlaceId(placeId, userId);
    }

    let validation: any = null;
    let validationWarning: string | null = null;

    const phone = normalizePhone(dbLead?.phone || leadInput.phone);
    if (dbLead && phone) {
      const validationInstanceId = await resolveValidationInstanceId(userId, preferredInstanceId);
      if (validationInstanceId) {
        const allowed = await instanceBelongsToUser(validationInstanceId, userId);
        const runtimeInstance = allowed ? instanceManager.getInstance(validationInstanceId, userId) : null;

        if (allowed && runtimeInstance?.status === "connected") {
          const check = await instanceManager.checkWhatsAppNumber(validationInstanceId, phone);
          const checkedAt = new Date().toISOString();
          const updatedLead = await customersService.updateWhatsAppValidation(
            dbLead.id,
            {
              hasWhatsApp: check.exists,
              checkedAt,
              instanceId: validationInstanceId,
              normalizedPhone: check.normalizedPhone,
              jid: check.jid,
              status: check.exists ? "valid" : "invalid",
            },
            userId
          );
          if (updatedLead) dbLead = updatedLead;

          validation = {
            has_whatsapp: check.exists,
            checked_at: checkedAt,
            instance_id: validationInstanceId,
            normalized_phone: check.normalizedPhone,
            jid: check.jid || null,
          };
        } else {
          validationWarning = "Lead captado, mas sem instancia conectada para validar WhatsApp agora.";
        }
      } else {
        validationWarning = "Lead captado, mas nenhuma instancia conectada encontrada para validacao.";
      }
    }

    const capturedPoints = await customersService.getCapturedGeoPoints(userId, 600);

    return res.json({
      success: true,
      lead: dbLead ? normalizeLeadRecord(dbLead) : null,
      capture: {
        place_id: placeId,
        status: createdSet.has(placeId) ? "created" : existingSet.has(placeId) ? "existing" : "captured",
        persisted,
      },
      validation,
      validation_warning: validationWarning,
      capturedPoints,
      toast: "Lead captado",
    });
  } catch (error: any) {
    logger.error(`Manual lead capture error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Get all leads/customers from MySQL
app.get("/api/leads", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { status, source, category, city, search, limit, offset } = req.query;
    const result = await customersService.getAll({
      status: status as string,
      source: source as string,
      category: category as string,
      city: city as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      ownerUserId: userId,
    });
    const leads = result.customers.map((lead: any) => normalizeLeadRecord(lead));
    res.json({ success: true, leads, total: result.total });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leads/stats", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const stats = await customersService.getLeadStats(userId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/:id/validate-whatsapp", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params.id;
    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;
    const lead = await customersService.getById(id, userId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const phone = normalizePhone((lead as any).phone);
    if (!phone) {
      return res.status(400).json({ error: "Lead does not have a valid phone number" });
    }

    const validationInstanceId = await resolveValidationInstanceId(userId, preferredInstanceId);
    if (!validationInstanceId) {
      return res.status(400).json({
        error:
          "No connected WhatsApp instance available for validation. Connect an instance first.",
      });
    }

    const allowed = await instanceBelongsToUser(validationInstanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const runtimeInstance = instanceManager.getInstance(validationInstanceId, userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      return res.status(409).json({
        error: "Selected instance is not connected. Reconnect the instance and try again.",
      });
    }

    const check = await instanceManager.checkWhatsAppNumber(validationInstanceId, phone);
    const checkedAt = new Date().toISOString();
    const updatedLead = await customersService.updateWhatsAppValidation(
      id,
      {
        hasWhatsApp: check.exists,
        checkedAt,
        instanceId: validationInstanceId,
        normalizedPhone: check.normalizedPhone,
        jid: check.jid,
        status: check.exists ? "valid" : "invalid",
      },
      userId
    );

    if (!updatedLead) return res.status(404).json({ error: "Lead not found" });

    res.json({
      success: true,
      lead: normalizeLeadRecord(updatedLead),
      validation: {
        has_whatsapp: check.exists,
        checked_at: checkedAt,
        instance_id: validationInstanceId,
        normalized_phone: check.normalizedPhone,
        jid: check.jid || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/validate-whatsapp-batch", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;
    const search = String(req.body?.search || "").trim() || undefined;
    const onlyUnvalidated = req.body?.onlyUnvalidated !== false;
    const requestedLimit = Math.max(1, Math.min(300, Math.floor(Number(req.body?.limit) || 50)));
    const leadIds: string[] = Array.isArray(req.body?.leadIds)
      ? Array.from(new Set(req.body.leadIds.map((item: unknown) => String(item).trim()).filter(Boolean)))
      : [];

    const validationInstanceId = await resolveValidationInstanceId(userId, preferredInstanceId);
    if (!validationInstanceId) {
      return res.status(400).json({
        error:
          "No connected WhatsApp instance available for validation. Connect an instance first.",
      });
    }

    const allowed = await instanceBelongsToUser(validationInstanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const runtimeInstance = instanceManager.getInstance(validationInstanceId, userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      return res.status(409).json({
        error: "Selected instance is not connected. Reconnect the instance and try again.",
      });
    }

    let candidates: any[] = [];
    if (leadIds.length > 0) {
      const limitedIds = leadIds.slice(0, requestedLimit);
      const fetched = await Promise.all(limitedIds.map((id) => customersService.getById(id, userId)));
      candidates = fetched.filter((item): item is any => !!item);
    } else {
      const result = await customersService.getAll({
        search,
        limit: requestedLimit,
        offset: 0,
        ownerUserId: userId,
      });
      candidates = result.customers;
    }

    let skippedNoPhone = 0;
    let skippedAlreadyValidated = 0;
    const queue: any[] = [];

    for (const lead of candidates) {
      const phone = normalizePhone((lead as any)?.phone);
      if (!phone) {
        skippedNoPhone++;
        continue;
      }

      if (onlyUnvalidated && !isLeadPendingWhatsAppValidation(lead)) {
        skippedAlreadyValidated++;
        continue;
      }

      queue.push(lead);
    }

    const queueLimited = queue.slice(0, requestedLimit);
    let processed = 0;
    let valid = 0;
    let invalid = 0;
    let errors = 0;
    const updatedLeads: any[] = [];

    for (const lead of queueLimited) {
      try {
        const phone = normalizePhone((lead as any).phone);
        const check = await instanceManager.checkWhatsAppNumber(validationInstanceId, phone);
        const checkedAt = new Date().toISOString();
        const updated = await customersService.updateWhatsAppValidation(
          (lead as any).id,
          {
            hasWhatsApp: check.exists,
            checkedAt,
            instanceId: validationInstanceId,
            normalizedPhone: check.normalizedPhone,
            jid: check.jid,
            status: check.exists ? "valid" : "invalid",
          },
          userId
        );

        processed++;
        if (check.exists) valid++;
        else invalid++;

        if (updated) {
          updatedLeads.push(normalizeLeadRecord(updated));
        }
      } catch (error: any) {
        errors++;
        logger.error(`Lead batch WhatsApp validation error: ${error.message}`);
      }
    }

    const stats = await customersService.getLeadStats(userId);
    res.json({
      success: true,
      summary: {
        selected: candidates.length,
        queued: queueLimited.length,
        processed,
        valid,
        invalid,
        errors,
        skipped_no_phone: skippedNoPhone,
        skipped_already_validated: skippedAlreadyValidated,
      },
      instance_id: validationInstanceId,
      stats,
      leads: updatedLeads,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/leads/:id/status", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = req.params.id;
    const nextStatus = String(req.body?.status || "").trim();
    if (!nextStatus) return res.status(400).json({ error: "Status is required" });

    const leadBefore = await customersService.getById(id, userId);
    if (!leadBefore) return res.status(404).json({ error: "Lead not found" });

    const previousStatus = String((leadBefore as any).status || "new");
    const updated = await customersService.updateStatus(id, nextStatus, userId);
    if (!updated) return res.status(404).json({ error: "Lead not found" });

    await automationRuntime.triggerLeadStatusChanged(userId, id, previousStatus, nextStatus);
    const leadAfter = await customersService.getById(id, userId);

    res.json({
      success: true,
      lead: leadAfter ? normalizeLeadRecord(leadAfter) : null,
      previous_status: previousStatus,
      status: nextStatus,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific customer/lead
app.delete("/api/leads/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id;
    const deleted = await customersService.delete(id, userId);
    if (!deleted) return res.status(404).json({ error: "Lead not found" });
    res.json({ success: true, message: "Lead deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSAGE ROUTES (protected) ====================

app.post("/api/messages/generate", authMiddleware, async (req: any, res) => {
  try {
    const { lead, templatePrompt } = req.body;
    if (!lead || !templatePrompt) {
      return res.status(400).json({ error: "Lead and templatePrompt are required" });
    }
    const message = await gemini.generateMessage(lead, templatePrompt);
    res.json({ success: true, message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/messages/send", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { instanceId, phone, message } = req.body;
    if (!instanceId || !phone || !message) {
      return res.status(400).json({ error: "instanceId, phone, and message are required" });
    }
    const allowed = await instanceBelongsToUser(instanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    if (!rateLimiter.canSend(instanceId)) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
    const sent = await instanceManager.sendMessage(instanceId, phone, message);
    if (sent) {
      rateLimiter.recordSend(instanceId);
    }
    res.json({ success: sent, message: sent ? "Message sent" : "Failed to send (number not on WhatsApp)" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/messages/rate-limit/:instanceId", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await instanceBelongsToUser(req.params.instanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    const status = rateLimiter.getStatus(req.params.instanceId);
    res.json({ success: true, ...status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CAMPAIGN ROUTES (protected) ====================

app.post("/api/campaigns/start", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { instanceId, leads, templatePrompt, delaySeconds = 30, maxPerDay = 200 } = req.body;
    if (!instanceId || !leads || !templatePrompt) {
      return res.status(400).json({ error: "instanceId, leads, and templatePrompt are required" });
    }
    const allowed = await instanceBelongsToUser(instanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    const campaignId = `campaign-${Date.now()}`;
    campaignsActive.set(campaignId, true);

    // Run campaign in background
    (async () => {
      let sent = 0;
      for (const lead of leads) {
        if (!campaignsActive.get(campaignId)) {
          logger.info(`Campaign ${campaignId} stopped`);
          break;
        }
        if (!rateLimiter.canSend(instanceId)) {
          logger.info(`Rate limit reached, waiting...`);
          await new Promise((r) => setTimeout(r, 60000));
          continue;
        }
        try {
          const message = await gemini.generateMessage(lead, templatePrompt);
          const success = await instanceManager.sendMessage(instanceId, lead.phone, message);
          if (success) {
            // Update customer status in MySQL
            if (lead.id) {
              const normalizedId =
                typeof lead.id === "string" && /^\d+$/.test(lead.id)
                  ? parseInt(lead.id)
                  : lead.id;
              const previousLead = await customersService.getById(normalizedId, userId);
              const previousStatus = String((previousLead as any)?.status || "new");
              await customersService.updateStatus(
                normalizedId,
                "contacted",
                userId
              );
              await automationRuntime.triggerLeadStatusChanged(
                userId,
                normalizedId,
                previousStatus,
                "contacted"
              );
            }
            rateLimiter.recordSend(instanceId);
            sent++;
            logger.info(`Campaign ${campaignId}: sent ${sent}/${leads.length} to ${lead.name}`);
          } else {
            if (lead.id) {
              const normalizedId =
                typeof lead.id === "string" && /^\d+$/.test(lead.id)
                  ? parseInt(lead.id)
                  : lead.id;
              await customersService.updateStatus(
                normalizedId,
                "failed",
                userId
              );
            }
          }
        } catch (err: any) {
          logger.error(`Campaign error for ${lead.name}: ${err.message}`);
        }
        const delay = (delaySeconds + Math.random() * 15) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
      campaignsActive.delete(campaignId);
      logger.info(`Campaign ${campaignId} completed. Sent: ${sent}/${leads.length}`);
    })();

    res.json({ success: true, campaignId, message: `Campaign started with ${leads.length} leads` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/campaigns/test-send", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { instanceId, templatePrompt, lead, testPhone } = req.body || {};
    if (!instanceId || !templatePrompt) {
      return res.status(400).json({ error: "instanceId and templatePrompt are required" });
    }

    const trimmedPrompt = String(templatePrompt).trim();
    if (trimmedPrompt.length < 8) {
      return res.status(400).json({ error: "templatePrompt is too short (min 8 chars)" });
    }

    const { destinationPhone, usedDefaultNumber, instance } = await resolveTestDestination(
      String(instanceId),
      userId,
      testPhone
    );

    const runtimeInstance = instanceManager.getInstance(String(instanceId), userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      return res.status(400).json({ error: "Instance not connected" });
    }

    if (!rateLimiter.canSend(String(instanceId))) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }

    const nowIso = new Date().toISOString();
    const incomingLead = lead && typeof lead === "object" ? lead : {};
    const preparedLead: Lead = {
      id: "test-lead",
      name: String((incomingLead as any).name || "Contato de Teste Interno"),
      phone: destinationPhone,
      address: (incomingLead as any).address
        ? String((incomingLead as any).address)
        : "Endereco nao informado",
      city: (incomingLead as any).city ? String((incomingLead as any).city) : undefined,
      state: (incomingLead as any).state ? String((incomingLead as any).state) : undefined,
      category: (incomingLead as any).category
        ? String((incomingLead as any).category)
        : "Teste interno",
      status: "new",
      messagesSent: [],
      messagesReceived: [],
      createdAt: new Date(nowIso),
    };

    let generatedMessage = trimmedPrompt;
    try {
      generatedMessage = await gemini.generateMessage(preparedLead, trimmedPrompt);
    } catch (err: any) {
      logger.warn(`Campaign test AI generation fallback activated: ${err.message}`);
      generatedMessage = `Mensagem de teste de campanha:\n${trimmedPrompt}`;
    }
    const prefixedMessage = `[TESTE DE CAMPANHA]\n${generatedMessage}`;
    const sent = await instanceManager.sendMessage(String(instanceId), destinationPhone, prefixedMessage);

    if (!sent) {
      return res
        .status(400)
        .json({ error: "Failed to send test message (number not on WhatsApp or instance offline)" });
    }

    rateLimiter.recordSend(String(instanceId));

    res.json({
      success: true,
      message: "Test message sent successfully",
      sentTo: destinationPhone,
      usedDefaultNumber,
      instancePhone: instance.phone || null,
      preview: prefixedMessage,
    });
  } catch (error: any) {
    logger.error(`Campaign test send failed: ${error.message}`);
    if (error.message === "Instance not found") {
      return res.status(404).json({ error: "Instance not found" });
    }
    res.status(500).json({ error: error.message || "Failed to send campaign test message" });
  }
});

app.post("/api/campaigns/:id/stop", authMiddleware, async (req: any, res) => {
  try {
    campaignsActive.set(req.params.id, false);
    res.json({ success: true, message: "Campaign stop requested" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATIC / SPA ====================

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  }
});

// ==================== START SERVER ====================

app.listen(config.port, "0.0.0.0", () => {
  logger.info(`Lead Captation System running on port ${config.port}`);
  // Auto-restore WhatsApp sessions
  instanceManager
    .restoreAllSessions()
    .then(() => {
      logger.info("Session restore complete");
    })
    .catch((err) => {
      logger.error(`Session restore failed: ${err.message}`);
    });
  automationRuntime
    .start()
    .then(() => {
      logger.info("Automation runtime ready");
    })
    .catch((err) => {
      logger.error(`Automation runtime start failed: ${err.message}`);
    });
  logger.info(`Dashboard: http://0.0.0.0:${config.port}`);
  logger.info(`API: http://0.0.0.0:${config.port}/api`);
});

process.on("SIGTERM", () => {
  automationRuntime.stop();
});

process.on("SIGINT", () => {
  automationRuntime.stop();
});
