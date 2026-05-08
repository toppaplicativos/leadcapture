import express from "express";
import { createServer } from "http";
import { readFileSync } from "fs";
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
import messagesRoutes from "./routes/messages";
import companiesRoutes from "./routes/companies";
import clientsRoutes from "./routes/clients";
import clientTypesRoutes from "./routes/clientTypes";
import sessionsRoutes from "./routes/sessions";
import automationsRoutes from "./routes/automations";
import brandsRoutes from "./routes/brands";
import { AutomationsService } from "./services/automations";
import { CustomersService } from "./services/customers";
import { BrandUnitsService } from "./services/brandUnits";
import { KnowledgeBaseService } from "./services/knowledgeBase";
import { authMiddleware, AuthRequest, requireRole } from "./middleware/auth";

import inboxRoutes from "./routes/inbox";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import priceTablesRoutes from "./routes/pricetables";
import expeditionRoutes from "./routes/expedition";
import ordersRoutes from "./routes/orders";
import commerceRoutes, { commercePublicRoutes } from "./routes/commerce";
import paymentsRoutes, { paymentPublicRoutes } from "./routes/payments";
import storefrontRoutes, { storefrontPublicRoutes, reconcileNginxForVerifiedDomains } from "./routes/storefront";
import stockAppRoutes from "./routes/stockApp";
import inventoryRoutes from "./routes/inventory";
import publicOnboardingRoutes from "./routes/publicOnboarding";
import publicPwaRoutes from "./routes/publicPwa";
import landingChatRoutes from "./routes/landingChat";
import masterRoutes from "./routes/master";
import stripeWebhookRoutes from "./routes/stripeWebhook";
import publicSignupRoutes from "./routes/publicSignup";
import adminEmailsRoutes from "./routes/adminEmails";
import { masterService } from "./services/master";
import { emailService } from "./services/email";
import { InboxService } from "./services/inbox";
import { AutomationRuntimeService } from "./services/automationRuntime";
import { InstanceRotationService } from "./services/instanceRotation";
import { query, queryOne, getPool } from "./config/database";
import { extractIncomingMessageData } from "./utils/whatsappMessage";
import { createCampaignRoutes } from "./routes/campaigns";
import { CampaignEngineService } from "./services/campaignEngine";
import { memoryEngine } from "./services/memoryEngine";
import leadsRoutes from "./routes/leads";
import leadCategoriesRoutes from "./routes/leadCategories";
import flowBuilderRoutes from "./routes/flowBuilder";
import { FlowExecutorService } from "./services/flowExecutor";
import notificationsRoutes from "./routes/notifications";
import supportRoutes from "./routes/support";
import integrationsRoutes from "./routes/integrations";
import instagramRoutes from "./routes/instagram";
import metaPrivacyRoutes from "./routes/metaPrivacy";
import metaWebhookRoutes from "./routes/metaWebhook";
import { getNotificationService } from "./services/notifications";
import { socketManager } from "./core/socketManager";

const app = express();
const httpServer = createServer(app);
app.use(cors());

// ⚠ IMPORTANT: Stripe webhook must be mounted BEFORE express.json() so the
// signature verification can use the raw body bytes.
app.use("/api/stripe/webhook", stripeWebhookRoutes);

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
// ==================== CUSTOM DOMAIN MIDDLEWARE ====================
const PRIMARY_DOMAINS = new Set(["app.leadcapture.online", "www.app.leadcapture.online"]);
const _domainSlugCache = new Map<string, { slug: string; expires: number }>();
const DOMAIN_SLUG_CACHE_TTL = 120_000;

function extractHostname(req: express.Request): string {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .toLowerCase().split(":")[0].trim();
}

function isCustomDomainHost(host: string): boolean {
  if (!host || host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.")) return false;
  if (PRIMARY_DOMAINS.has(host)) return false;
  return host.includes(".");
}

async function resolveSlugByDomain(host: string): Promise<string | null> {
  if (!host) return null;
  const cached = _domainSlugCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.slug;
  try {
    const candidates = [host];
    if (host.startsWith("www.")) candidates.push(host.slice(4));
    else candidates.push(`www.${host}`);
    const placeholders = candidates.map(() => "?").join(",");
    const result = await queryOne<{ slug: string }>(
      `SELECT s.slug FROM storefront_domains d INNER JOIN storefront_stores s ON s.id = d.store_id WHERE d.domain IN (${placeholders}) ORDER BY d.is_primary DESC LIMIT 1`,
      candidates
    );
    if (result?.slug) {
      _domainSlugCache.set(host, { slug: result.slug, expires: Date.now() + DOMAIN_SLUG_CACHE_TTL });
      return result.slug;
    }
  } catch (err: any) {
    logger.error(`resolveSlugByDomain error: ${err.message || err}`);
  }
  return null;
}

const _htmlFileCache = new Map<string, string>();
function readCatalogHtml(filename: string): string {
  if (_htmlFileCache.has(filename)) return _htmlFileCache.get(filename)!;
  const content = readFileSync(path.join(__dirname, "../public", filename), "utf-8");
  _htmlFileCache.set(filename, content);
  setTimeout(() => _htmlFileCache.delete(filename), 300_000);
  return content;
}

function serveCatalogWithSlug(res: express.Response, filename: string, slug: string) {
  try {
    // If React build exists, serve it with slug injection
    if (hasReactBuild) {
      const reactHtml = require("fs").readFileSync(reactIndexPath, "utf-8");
      const injection = `<script>window.__STORE_SLUG__=${JSON.stringify(slug)};window.__CUSTOM_DOMAIN__=true;</script>`;
      return res.type("html").send(reactHtml.replace("</head>", `${injection}\n</head>`));
    }
    const html = readCatalogHtml(filename);
    const injection = `<script>window.__STORE_SLUG__=${JSON.stringify(slug)};window.__CUSTOM_DOMAIN__=true;</script>`;
    res.type("html").send(html.replace("</head>", `${injection}\n</head>`));
  } catch (err: any) {
    logger.error(`serveCatalogWithSlug error: ${err.message || err}`);
    res.status(500).send("Internal Server Error");
  }
}

const CUSTOM_DOMAIN_PAGES: Record<string, string> = {
  "/": "catalogo-publico.html",
  "/checkout": "catalogo-checkout.html",
  "/pedido": "catalogo-pedido.html",
  "/historico": "catalogo-historico.html",
};

app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const host = extractHostname(req);
  if (!isCustomDomainHost(host)) return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") return next();
  if (req.path.startsWith("/catalogo/") || req.path.startsWith("/loja/")) return next();
  const slug = await resolveSlugByDomain(host);
  if (!slug) return next();
  const normalized = req.path.toLowerCase().replace(/\/+$/, "") || "/";
  if (CUSTOM_DOMAIN_PAGES[normalized]) {
    return serveCatalogWithSlug(res, CUSTOM_DOMAIN_PAGES[normalized], slug);
  }
  if (/^\/produto\/[^/]+$/.test(normalized)) {
    return serveCatalogWithSlug(res, "catalogo-produto.html", slug);
  }
  next();
});

// Legacy redirects
app.get("/site-workspace", (_req, res) => res.redirect(301, "/admin"));
app.get("/site-workspace/*", (_req, res) => res.redirect(301, "/admin"));

// ── Serve React frontend build (catalog SPA) ──
const reactDistPath = path.join(__dirname, "../frontend/dist");
const reactIndexPath = path.join(reactDistPath, "index.html");
const hasReactBuild = require("fs").existsSync(reactIndexPath);

if (hasReactBuild) {
  // Serve React static assets (JS, CSS, etc.)
  app.use("/assets", express.static(path.join(reactDistPath, "assets"), { maxAge: "30d", immutable: true }));
}

// Service worker must never be cached — always serve fresh so version bumps take effect immediately
app.get("/service-worker.js", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/service-worker.js"));
});
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ==================== PUBLIC ROUTES ====================
app.use("/api/auth", authRoutes);
app.use("/api/commerce/public", commercePublicRoutes);
app.use("/api/payments/public", paymentPublicRoutes);
app.use("/api/storefront/public", storefrontPublicRoutes);
app.use("/api/public", publicOnboardingRoutes);
app.use("/api/public", publicSignupRoutes);
app.use("/api/landing", landingChatRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/admin/emails", adminEmailsRoutes);
app.use("/pwa", publicPwaRoutes);

// Health check (public)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    instances: instanceManager.getAllInstances().length,
  });
});

// ── Helper: serve React SPA or legacy HTML ──
function serveCatalogSPA(res: express.Response, legacyFile: string) {
  if (hasReactBuild) {
    return res.sendFile(reactIndexPath);
  }
  return res.sendFile(path.join(__dirname, "../public", legacyFile));
}

app.get("/catalogo/:slug", (_req, res) => {
  serveCatalogSPA(res, "catalogo-publico.html");
});

app.get("/loja/:slug", (_req, res) => {
  serveCatalogSPA(res, "catalogo-publico.html");
});

app.get("/loja/:slug/checkout", (_req, res) => {
  serveCatalogSPA(res, "catalogo-checkout.html");
});

app.get("/loja/:slug/pedido", (_req, res) => {
  serveCatalogSPA(res, "catalogo-pedido.html");
});

app.get("/loja/:slug/historico", (_req, res) => {
  serveCatalogSPA(res, "catalogo-historico.html");
});

app.get("/loja/:slug/produto/:productSlug", (_req, res) => {
  serveCatalogSPA(res, "catalogo-produto.html");
});

app.get("/catalogo/:slug/produto/:productSlug", (_req, res) => {
  serveCatalogSPA(res, "catalogo-produto.html");
});

app.get("/catalogo/:slug/checkout", (_req, res) => {
  serveCatalogSPA(res, "catalogo-checkout.html");
});

app.get("/catalogo/:slug/pedido", (_req, res) => {
  serveCatalogSPA(res, "catalogo-pedido.html");
});

app.get("/catalogo/:slug/historico", (_req, res) => {
  serveCatalogSPA(res, "catalogo-historico.html");
});

app.get("/catalogo", (_req, res) => {
  serveCatalogSPA(res, "catalogo-publico.html");
});

// App Estoque — all sub-routes serve the React SPA
app.get("/app-estoque", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/app-estoque/:brand", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/app-estoque/:brand/painel", (_req, res) => { serveCatalogSPA(res, "index.html"); });

// Admin panel routes (all serve React SPA)
const adminPages = [
  "/login", "/admin", "/dashboard", "/busca", "/leads", "/clientes",
  "/mensagens", "/notificacoes", "/campanhas", "/campanha", "/automacoes",
  "/criativos", "/creative", "/agente", "/produtos", "/pedidos",
  "/whatsapp", "/design", "/pagamentos", "/frete", "/dominio", "/configuracoes",
  "/estoque", "/estoque/app", "/inventario",
];
for (const page of adminPages) {
  app.get(page, (_req, res) => { serveCatalogSPA(res, "index.html"); });
}

app.get("/brand-onboarding", (_req, res) => {
  serveCatalogSPA(res, "brand-onboarding.html");
});

// ==================== PROTECTED ROUTES ====================
app.use("/api/customers", authMiddleware, customersRoutes);
app.use("/api/knowledge-base", authMiddleware, knowledgeBaseRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/media", authMiddleware, mediaRoutes);
app.use("/api/companies", authMiddleware, companiesRoutes);
app.use("/api/clients", authMiddleware, clientsRoutes);
app.use("/api/client-types", authMiddleware, clientTypesRoutes);
app.use("/api/sessions", authMiddleware, sessionsRoutes);
app.use("/api/automations", authMiddleware, automationsRoutes);
app.use("/api/brands", authMiddleware, brandsRoutes);
app.use("/api/inbox", authMiddleware, inboxRoutes);
app.use("/api/messages", authMiddleware, messagesRoutes);
app.use("/api/categories", authMiddleware, categoriesRoutes);
app.use("/api/products", authMiddleware, productsRoutes);
app.use("/api/pricetables", authMiddleware, priceTablesRoutes);
app.use("/api/expedition", authMiddleware, expeditionRoutes);
app.use("/api/orders", authMiddleware, ordersRoutes);
app.use("/api/commerce", authMiddleware, commerceRoutes);
app.use("/api/payments", authMiddleware, paymentsRoutes);
app.use("/api/storefront", authMiddleware, storefrontRoutes);
app.use("/api/stock-app", authMiddleware, stockAppRoutes);
app.use("/api/inventory", authMiddleware, inventoryRoutes);
app.use("/api/leads", authMiddleware, leadsRoutes);
app.use("/api/lead-categories", leadCategoriesRoutes);
app.use("/api/flows", flowBuilderRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/integrations", authMiddleware, integrationsRoutes);
app.use("/api/instagram", authMiddleware, instagramRoutes);
app.use("/api/meta/privacy", metaPrivacyRoutes);
app.use("/api/meta/webhook", metaWebhookRoutes);

// Services
const instanceManager = new InstanceManager();
app.set("instanceManager", instanceManager);
FlowExecutorService.init(instanceManager);
const instanceRotation = new InstanceRotationService(instanceManager);
app.set("instanceRotation", instanceRotation);
const automationRuntime = new AutomationRuntimeService(instanceManager, instanceRotation);
app.set("automationRuntime", automationRuntime);
const campaignEngine = new CampaignEngineService(instanceManager, instanceRotation);
app.set("campaignEngine", campaignEngine);
app.use("/api/campaigns-v2", authMiddleware, createCampaignRoutes(instanceManager, instanceRotation, campaignEngine));
const inboxService = new InboxService();
inboxService.setMediaDownloader((instanceId, msg) => instanceManager.downloadIncomingMedia(instanceId, msg));
inboxService.setMessageSender((instanceId, jid, message) => instanceManager.sendMessageByJid(instanceId, jid, message));
instanceManager.onGlobalMessage(async (instanceId, msg) => {
  await inboxService.handleIncomingMessage(instanceId, msg);
  try {
    const parsed = extractIncomingMessageData(msg?.message || {});

    await automationRuntime.triggerInboundMessage({
      instanceId,
      remoteJid: String(msg?.key?.remoteJid || ""),
      body: String(parsed.body || ""),
      timestamp: Number(msg?.messageTimestamp || Date.now()),
    });

    // Campaign Engine — process incoming reply for active campaigns
    const phone = String(msg?.key?.remoteJid || "").replace(/@.*$/, "");
    if (phone && parsed.body) {
      const ownerRow = await queryOne<{ created_by?: string; brand_id?: string | null }>(
        "SELECT created_by, brand_id FROM whatsapp_instances WHERE id = ? LIMIT 1",
        [instanceId]
      );
      const ownerUserId = String(ownerRow?.created_by || "");
      const ownerBrandId = String(ownerRow?.brand_id || "").trim() || null;
      if (ownerUserId) {
        campaignEngine
          .processIncomingReply(
            ownerUserId,
            phone,
            String(parsed.body),
            Number(msg?.messageTimestamp || Date.now()),
            ownerBrandId
          )
          .catch((err: any) => {
            logger.error(`Campaign reply processing failed: ${err.message}`);
          });

        // Memory Engine — async update (never blocks message flow)
        if (parsed.body) {
          memoryEngine
            .updateMemoryFromMessage(ownerUserId, phone, String(parsed.body), "inbound", ownerBrandId)
            .catch((err: any) => {
              logger.warn(`[MemoryEngine] Inbound update skipped: ${err.message}`);
            });
        }

        // Flow Executor — fire message_received trigger
        FlowExecutorService.get()
          .fire("message_received", ownerUserId, { phone, message: String(parsed.body) })
          .catch(() => {});
      }
    }
  } catch (error: any) {
    logger.error(`Automation inbound trigger failed: ${error.message}`);
  }
});
const googlePlaces = new GooglePlacesService();
const gemini = new GeminiService();
const rateLimiter = new RateLimiter(3, 200);
const leadSearchRateLimiter = new RateLimiter(8, 500);
const productsService = new ProductsService();
const customersService = new CustomersService();
const brandUnitsService = new BrandUnitsService();
const knowledgeBaseService = new KnowledgeBaseService();
const automationsService = new AutomationsService();
const notificationService = getNotificationService();
const usingPostgresMode = Boolean(config.postgres.connectionString || config.postgres.host);

socketManager.initialize(httpServer);

// In-memory campaign tracking
const campaignsActive: Map<string, boolean> = new Map();
const PANFLETEIRO_AUTOMATION_CODE = "prospeccao_ativa_lead_frio";

async function resolvePrimaryOutboundAutomationState(
  userId: string,
  executeAutomationInput: unknown
): Promise<{
  enabled: boolean;
  source: "request" | "hub" | "fallback";
  hubSynced: boolean;
}> {
  const hasExplicitToggle = executeAutomationInput !== undefined && executeAutomationInput !== null;

  if (hasExplicitToggle) {
    const enabled = parseBooleanRequestFlag(executeAutomationInput, true);
    try {
      const updatedRule = await automationsService.updateRule(userId, null, PANFLETEIRO_AUTOMATION_CODE, {
        is_active: enabled,
      });
      return {
        enabled,
        source: "request",
        hubSynced: !!updatedRule,
      };
    } catch (error: any) {
      logger.error(`Failed to sync search automation toggle with hub: ${error.message}`);
      return {
        enabled,
        source: "fallback",
        hubSynced: false,
      };
    }
  }

  try {
    const rulesResponse = await automationsService.listRules(userId);
    const primaryRule = rulesResponse.rules.find((rule) => rule.code === PANFLETEIRO_AUTOMATION_CODE);
    return {
      enabled: primaryRule ? Boolean(primaryRule.is_active) : true,
      source: "hub",
      hubSynced: false,
    };
  } catch (error: any) {
    logger.error(`Failed to read primary automation state from hub: ${error.message}`);
    return {
      enabled: true,
      source: "fallback",
      hubSynced: false,
    };
  }
}

async function instanceBelongsToUser(instanceId: string, userId: string, brandId?: string | null): Promise<boolean> {
  const normalizedBrandId = String(brandId || "").trim();
  if (normalizedBrandId) {
    try {
      const scoped = await queryOne<{ id: string }>(
        `SELECT id FROM whatsapp_instances
         WHERE id = ? AND created_by = ? AND brand_id = ?
         LIMIT 1`,
        [instanceId, userId, normalizedBrandId]
      );
      if (scoped) return true;
    } catch {
      // Fall back to user ownership check below.
    }
  }

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

function parseBooleanRequestFlag(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return defaultValue;
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

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
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
  userId: string,
  brandId?: string | null
): Promise<any | null> {
  const columns = await query<any[]>("SHOW COLUMNS FROM customers");
  const names = new Set(columns.map((row) => String(row?.Field || "")));
  const ownerColumn = names.has("owner_user_id")
    ? "owner_user_id"
    : names.has("user_id")
    ? "user_id"
    : null;
  if (!ownerColumn) {
    logger.error("Customers isolation column missing (owner_user_id/user_id)");
    return null;
  }
  const ownerWhere = ` AND ${ownerColumn} = ?`;
  const ownerParams = [userId];
  const brandWhere = names.has("brand_id") && brandId ? " AND brand_id = ?" : "";
  const brandParams = names.has("brand_id") && brandId ? [String(brandId)] : [];

  if (names.has("google_place_id")) {
    const byLegacy = await queryOne<any>(
      `SELECT * FROM customers WHERE google_place_id = ?${ownerWhere}${brandWhere} LIMIT 1`,
      [placeId, ...ownerParams, ...brandParams]
    );
    if (byLegacy) return byLegacy;
  }

  if (names.has("source_details")) {
    const bySourceDetails = await queryOne<any>(
      `SELECT *
       FROM customers
       WHERE source_details::jsonb->>'google_place_id' = ?${ownerWhere}${brandWhere}
       LIMIT 1`,
      [placeId, ...ownerParams, ...brandParams]
    );
    if (bySourceDetails) return bySourceDetails;
  }

  return null;
}

async function findCapturedPlaceIds(
  placeIds: string[],
  userId: string,
  brandId?: string | null
): Promise<string[]> {
  if (placeIds.length === 0) return [];

  const columns = await query<any[]>("SHOW COLUMNS FROM customers");
  const names = new Set(columns.map((row) => String(row?.Field || "")));
  const ownerColumn = names.has("owner_user_id")
    ? "owner_user_id"
    : names.has("user_id")
    ? "user_id"
    : null;
  if (!ownerColumn) {
    logger.error("Customers isolation column missing (owner_user_id/user_id)");
    return [];
  }
  const ownerWhere = ` AND ${ownerColumn} = ?`;
  const ownerParams = [userId];
  const brandWhere = names.has("brand_id") && brandId ? " AND brand_id = ?" : "";
  const brandParams = names.has("brand_id") && brandId ? [String(brandId)] : [];
  const placeholders = placeIds.map(() => "?").join(",");

  if (names.has("google_place_id")) {
    const rows = await query<any[]>(
      `SELECT google_place_id AS place_id
       FROM customers
       WHERE google_place_id IN (${placeholders})${ownerWhere}${brandWhere}`,
      [...placeIds, ...ownerParams, ...brandParams]
    );
    return rows.map((row) => String(row?.place_id || "")).filter(Boolean);
  }

  if (names.has("source_details")) {
    const rows = await query<any[]>(
      `SELECT source_details::jsonb->>'google_place_id' AS place_id
       FROM customers
       WHERE source_details::jsonb->>'google_place_id' IN (${placeholders})${ownerWhere}${brandWhere}`,
      [...placeIds, ...ownerParams, ...brandParams]
    );
    return rows.map((row) => String(row?.place_id || "")).filter(Boolean);
  }

  return [];
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

function getRequestedBrandId(req: any): string | undefined {
  const fromHeader = String(req.headers?.["x-brand-id"] || "").trim();
  if (fromHeader) return fromHeader;
  const fromQuery = String(req.query?.brand_id || "").trim();
  if (fromQuery) return fromQuery;
  const fromBody = String(req.body?.brand_id || req.body?.brandId || "").trim();
  if (fromBody) return fromBody;
  return undefined;
}

function sanitizeLeadSearchText(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// ==================== INSTANCE ROUTES (protected) ====================

app.post("/api/instances", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const instance = await instanceManager.createInstance(name, userId);
    if (brandId) {
      await query("UPDATE whatsapp_instances SET brand_id = ? WHERE id = ?", [brandId, instance.id]);
    }
    res.json({ success: true, instance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/connect", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    // Start connection asynchronously — return immediately so the frontend can poll /qr
    instanceManager.connectInstance(req.params.id).catch((err: any) => {
      logger.error(`connectInstance error (${req.params.id}): ${err.message}`);
    });
    res.json({ success: true, connecting: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances/:id/qr", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
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

app.post("/api/instances/:id/reconnect", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const id = req.params.id;

    // Desconecta o socket atual para forçar novo QR
    await instanceManager.disconnectInstance(id).catch(() => {});

    // Inicia reconexão — aguarda QR por até 18s
    const qrPromise = instanceManager.connectInstance(id);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 18000));
    const qrCode = await Promise.race([qrPromise, timeoutPromise]);

    if (qrCode) {
      return res.json({ success: true, qr: qrCode, qrCode, status: "qr_ready" });
    }

    // Sem QR → provavelmente reconectou com sessão salva
    const liveInst = instanceManager.getAllInstances(userId).find((i: any) => i.id === id);
    const status = liveInst?.status || "connecting";
    res.json({ success: true, qr: null, status, message: status === "connected" ? "Reconectado com sessao salva!" : "Conectando..." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/disconnect", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
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
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
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

    const scope = String(req.query?.scope || "all").trim().toLowerCase();
    const requestedBrandId = getRequestedBrandId(req);
    const activeBrandId = await brandUnitsService.resolveActiveBrandId(userId, requestedBrandId);
    const brandScoped = scope === "brand" || scope === "active-brand";

    const runtimeMap = new Map(
      instanceManager.getAllInstances(userId).map((instance) => [instance.id, instance])
    );

    let dbInstances: any[] = [];
    try {
      const brandWhere = brandScoped
        ? activeBrandId
          ? " AND wi.brand_id = ?"
          : " AND wi.brand_id IS NULL"
        : "";
      const brandParams = brandScoped && activeBrandId ? [activeBrandId] : [];
      dbInstances = await query<any[]>(
        `SELECT wi.id, wi.name, wi.phone, wi.status, wi.created_at, wi.messages_sent, wi.messages_received,
                wi.brand_id, bu.name AS brand_name
         FROM whatsapp_instances wi
         LEFT JOIN brand_units bu ON bu.id = wi.brand_id AND bu.user_id = wi.created_by
         WHERE wi.created_by = ?
         ${brandWhere}
         ORDER BY created_at DESC`,
        [userId, ...brandParams]
      );
    } catch {
      const brandWhere = brandScoped
        ? activeBrandId
          ? " AND brand_id = ?"
          : " AND brand_id IS NULL"
        : "";
      const brandParams = brandScoped && activeBrandId ? [activeBrandId] : [];
      dbInstances = await query<any[]>(
        `SELECT id, name, phone, status, created_at, messages_sent, messages_received,
                brand_id, NULL AS brand_name
         FROM whatsapp_instances
         WHERE created_by = ?
         ${brandWhere}
         ORDER BY created_at DESC`,
        [userId, ...brandParams]
      );
    }

    const instances = dbInstances.map((row) => {
      const runtime = runtimeMap.get(row.id);
      if (runtime) {
        return {
          ...runtime,
          brand_id: row.brand_id ? String(row.brand_id) : null,
          brand_name: row.brand_name ? String(row.brand_name) : null,
        };
      }
      return {
        id: row.id,
        name: row.name,
        phone: row.phone || undefined,
        status: row.status,
        createdAt: row.created_at,
        messagessSent: Number(row.messages_sent || 0),
        messagesReceived: Number(row.messages_received || 0),
        brand_id: row.brand_id ? String(row.brand_id) : null,
        brand_name: row.brand_name ? String(row.brand_name) : null,
      };
    });
    res.json({ success: true, instances, scope: brandScoped ? "brand" : "all", brand_id: activeBrandId || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const allowed = await instanceBelongsToUser(req.params.id, userId, brandId);
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
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { query: rawQuery, location: rawLocation, radius, maxResults, executeAutomation } = req.body;
    const searchQuery = sanitizeLeadSearchText(rawQuery, 120);
    const searchLocation = sanitizeLeadSearchText(rawLocation, 160);
    const requested = Math.max(1, Math.min(100, Math.floor(Number(maxResults) || 20)));
    const automationState = await resolvePrimaryOutboundAutomationState(userId, executeAutomation);
    const shouldExecuteAutomation = automationState.enabled;
    const numericRadius = Number(radius);
    const searchRadius = Number.isFinite(numericRadius)
      ? Math.max(100, Math.min(50000, Math.floor(numericRadius)))
      : undefined;

    if (!searchQuery || !searchLocation) {
      return res.status(400).json({ error: "Query and location are required" });
    }
    if (searchQuery.length < 2 || searchLocation.length < 2) {
      return res.status(400).json({ error: "Query and location must have at least 2 characters" });
    }

    const rateKey = `${userId}:${brandId || "default"}:lead-search`;
    if (!leadSearchRateLimiter.canSend(rateKey)) {
      return res.status(429).json({ error: "Lead search rate limit exceeded. Try again in a minute." });
    }
    leadSearchRateLimiter.recordSend(rateKey);

    logger.info(
      `Searching leads: "${searchQuery}" in "${searchLocation}" (target: ${requested}; automation=${shouldExecuteAutomation ? "on" : "off"})`
    );

    // Use new Google Places V2 (RapidAPI) - returns raw place objects
    const places = await googlePlaces.searchText({
      query: searchQuery,
      location: searchLocation,
      radius: searchRadius,
      maxResults: requested,
      providerPreference: "rapid_first",
      includeDetails: true,
      fieldProfile: "full",
      userId,
      brandId: brandId || undefined,
    });

    // Persist to MySQL customers table (deduplicates by google_place_id + phone)
    const persisted = await customersService.bulkCreateFromPlaces(
      places,
      userId,
      {
        query: searchQuery,
        location: searchLocation,
        radius: searchRadius,
      },
      brandId
    );
    const createdSet = new Set(persisted.createdPlaceIds || []);
    const existingSet = new Set(persisted.existingPlaceIds || []);

    logger.info(
      `Lead search complete: ${places.length} found, ${persisted.created} created, ${persisted.skipped} skipped`
    );

    let automationQueuedJobs = 0;
    if (shouldExecuteAutomation && (persisted.createdLeadIds || []).length > 0) {
      const queuedByLead = await Promise.all(
        (persisted.createdLeadIds || []).map((leadId) =>
          automationRuntime.triggerLeadCreatedForRule(userId, leadId, PANFLETEIRO_AUTOMATION_CODE, {
            segmento: searchQuery,
            cidade: searchLocation,
          }, "search_capture")
        )
      );
      automationQueuedJobs = queuedByLead.reduce((sum, value) => sum + Number(value || 0), 0);
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

    const capturedPoints = await customersService.getCapturedGeoPoints(userId, 600, brandId);

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
      automation: {
        enabled: shouldExecuteAutomation,
        source: automationState.source,
        hub_synced: automationState.hubSynced,
        code: PANFLETEIRO_AUTOMATION_CODE,
        queued_jobs: automationQueuedJobs,
        triggered: automationQueuedJobs > 0,
      },
      brand_id: brandId,
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
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const leadInput = req.body?.lead || {};
    const captureQuery = String(req.body?.query || leadInput.captureQuery || "captacao_manual").trim();
    const captureLocation = String(req.body?.location || "mapa").trim();
    const captureRadiusRaw = Number(req.body?.radius);
    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;
    const automationState = await resolvePrimaryOutboundAutomationState(userId, req.body?.executeAutomation);
    const shouldExecuteAutomation = automationState.enabled;

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

    const persisted = await customersService.bulkCreateFromPlaces(
      [mappedPlace],
      userId,
      captureContext,
      brandId
    );
    const createdSet = new Set(persisted.createdPlaceIds || []);
    const existingSet = new Set(persisted.existingPlaceIds || []);

    const createdLeadId =
      (persisted.createdLeadIds || []).length > 0 ? String(persisted.createdLeadIds[0]) : null;

    let dbLead: any | null = null;
    if (createdLeadId) {
      dbLead = await customersService.getById(createdLeadId, userId, brandId);
    }
    if (!dbLead) {
      dbLead = await findLeadByGooglePlaceId(placeId, userId, brandId);
    }

    let automationQueuedJobs = 0;
    let automationWarning: string | null = null;
    if (createdLeadId && shouldExecuteAutomation) {
      try {
        automationQueuedJobs = await automationRuntime.triggerLeadCreatedForRule(
          userId,
          createdLeadId,
          PANFLETEIRO_AUTOMATION_CODE,
          {
            segmento: category || captureQuery || undefined,
            cidade: captureLocation || undefined,
            produto: category || undefined,
            oferta: captureQuery || undefined,
          },
          "panfleteiro_capture"
        );
      } catch (automationError: any) {
        automationWarning = "Lead captado, mas houve falha ao enfileirar automacao.";
        logger.error(`Manual capture automation trigger failed: ${automationError.message}`);
      }
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
            userId,
            brandId
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

    const capturedPoints = await customersService.getCapturedGeoPoints(userId, 600, brandId);

    return res.json({
      success: true,
      lead: dbLead ? normalizeLeadRecord(dbLead) : null,
      capture: {
        place_id: placeId,
        status: createdSet.has(placeId) ? "created" : existingSet.has(placeId) ? "existing" : "captured",
        persisted,
      },
      automation: {
        code: PANFLETEIRO_AUTOMATION_CODE,
        enabled: shouldExecuteAutomation,
        source: automationState.source,
        hub_synced: automationState.hubSynced,
        queued_jobs: automationQueuedJobs,
        triggered: automationQueuedJobs > 0,
      },
      automation_warning: automationWarning,
      brand_id: brandId,
      validation,
      validation_warning: validationWarning,
      capturedPoints,
      toast: shouldExecuteAutomation ? "Lead captado" : "Lead captado (automacao pausada)",
    });
  } catch (error: any) {
    logger.error(`Manual lead capture error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Radar mode search — coordinate-based, NO auto-persistence (exploration only)
app.post("/api/leads/radar-search", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { query: rawQuery, latitude, longitude, radius, maxResults } = req.body;
    const searchQuery = sanitizeLeadSearchText(rawQuery, 120);
    const lat = Number(latitude);
    const lng = Number(longitude);
    const requested = Math.max(1, Math.min(60, Math.floor(Number(maxResults) || 20)));
    const numericRadius = Number(radius);
    const searchRadius = Number.isFinite(numericRadius)
      ? Math.max(100, Math.min(50000, Math.floor(numericRadius)))
      : 3000;

    if (!searchQuery) {
      return res.status(400).json({ error: "Query is required" });
    }
    if (searchQuery.length < 2) {
      return res.status(400).json({ error: "Query must have at least 2 characters" });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Valid latitude and longitude are required" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Latitude/longitude out of range" });
    }

    const rateKey = `${userId}:${brandId || "default"}:radar-search`;
    if (!leadSearchRateLimiter.canSend(rateKey)) {
      return res.status(429).json({ error: "Radar search rate limit exceeded. Try again in a minute." });
    }
    leadSearchRateLimiter.recordSend(rateKey);

    logger.info(`Radar search: "${searchQuery}" at [${lat.toFixed(4)}, ${lng.toFixed(4)}] r=${searchRadius}m (max: ${requested})`);

    const places = await googlePlaces.searchText({
      query: searchQuery,
      latitude: lat,
      longitude: lng,
      radius: searchRadius,
      maxResults: requested,
      providerPreference: "official_first",
      includeDetails: false,
      fieldProfile: "radar",
      userId,
      brandId: brandId || undefined,
    });

    // Check which places are already captured across schema variants.
    const placeIds = places.map((p: any) => String(p.id || "")).filter(Boolean);
    const existingPlaceIds = await findCapturedPlaceIds(placeIds, userId, brandId);
    const existingSet = new Set(existingPlaceIds);

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
      captureStatus: existingSet.has(String(place.id)) ? "captured" : "new",
      captureQuery: searchQuery,
    }));

    const capturedCount = leads.filter((l: any) => l.captureStatus === "captured").length;
    const newCount = leads.length - capturedCount;

    res.json({
      success: true,
      leads,
      total: leads.length,
      capturedCount,
      newCount,
      center: { latitude: lat, longitude: lng },
      radius: searchRadius,
      brand_id: brandId,
    });
  } catch (error: any) {
    logger.error(`Radar search error: ${error.message}`);
    const statusCode = String(error.message || "").includes("Google Places search failed") ? 502 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// Get all leads/customers from MySQL
app.get("/api/leads", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { status, source, category, city, search, limit, offset, page, whatsappFilter } = req.query;
    const limitNum = Math.max(1, Math.min(200, parseInt(String(limit || "50"), 10) || 50));
    const pageNum = Math.max(1, parseInt(String(page || "1"), 10) || 1);
    const offsetFromPage = (pageNum - 1) * limitNum;
    const offsetNum =
      offset !== undefined && offset !== null
        ? Math.max(0, parseInt(String(offset), 10) || 0)
        : offsetFromPage;

    const validWhatsappFilters = ["pending", "confirmed", "unconfirmed"] as const;
    const resolvedWhatsappFilter = validWhatsappFilters.find((f) => f === whatsappFilter) ?? undefined;

    const result = await customersService.getAll({
      status: status as string,
      source: source as string,
      category: category as string,
      city: city as string,
      search: search as string,
      limit: limitNum,
      offset: offsetNum,
      ownerUserId: userId,
      brandId,
      whatsappFilter: resolvedWhatsappFilter,
    });
    const leads = result.customers.map((lead: any) => normalizeLeadRecord(lead));
    res.json({ success: true, leads, total: result.total, brand_id: brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leads/stats", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const stats = await customersService.getLeadStats(userId, brandId);
    res.json({ success: true, stats, brand_id: brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/:id/validate-whatsapp", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const id = req.params.id;
    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;
    const lead = await customersService.getById(id, userId, brandId);
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
      userId,
      brandId
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
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

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
      const fetched = await Promise.all(
        limitedIds.map((id) => customersService.getById(id, userId, brandId))
      );
      candidates = fetched.filter((item): item is any => !!item);
    } else {
      const result = await customersService.getAll({
        search,
        limit: requestedLimit,
        offset: 0,
        ownerUserId: userId,
        brandId,
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
          userId,
          brandId
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

    const stats = await customersService.getLeadStats(userId, brandId);
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
      brand_id: brandId,
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

    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const id = req.params.id;
    const nextStatus = String(req.body?.status || "").trim();
    if (!nextStatus) return res.status(400).json({ error: "Status is required" });

    const leadBefore = await customersService.getById(id, userId, brandId);
    if (!leadBefore) return res.status(404).json({ error: "Lead not found" });

    const previousStatus = String((leadBefore as any).status || "new");
    const updated = await customersService.updateStatus(id, nextStatus, userId, brandId);
    if (!updated) return res.status(404).json({ error: "Lead not found" });

    await automationRuntime.triggerLeadStatusChanged(userId, id, previousStatus, nextStatus);
    const leadAfter = await customersService.getById(id, userId, brandId);

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

// ─── Bulk action on selected leads ───────────────────────────────────────────
app.post("/api/leads/bulk-action", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { action, leadIds, value } = req.body || {};
    if (!action || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: "action and leadIds[] are required" });
    }

    const ids: string[] = leadIds.map((id: any) => String(id)).filter(Boolean).slice(0, 500);
    const pool = getPool();

    const ownerCol = await (async () => {
      const [cols] = await pool.query<any[]>("SHOW COLUMNS FROM customers LIKE 'owner_user_id'");
      return Array.isArray(cols) && cols.length > 0 ? "owner_user_id" : "user_id";
    })();

    const brandCols = await (async () => {
      const [cols] = await pool.query<any[]>("SHOW COLUMNS FROM customers LIKE 'brand_id'");
      return Array.isArray(cols) && cols.length > 0;
    })();

    const hasCategoryColumn = await (async () => {
      const [cols] = await pool.query<any[]>("SHOW COLUMNS FROM customers LIKE 'category'");
      return Array.isArray(cols) && cols.length > 0;
    })();

    const hasSourceDetailsColumn = await (async () => {
      const [cols] = await pool.query<any[]>("SHOW COLUMNS FROM customers LIKE 'source_details'");
      return Array.isArray(cols) && cols.length > 0;
    })();

    const placeholders = ids.map(() => "?").join(",");
    const brandClause = brandCols
      ? (brandId ? " AND brand_id = ?" : " AND brand_id IS NULL")
      : "";
    const baseParams: any[] = brandId && brandCols ? [userId, brandId, ...ids] : [userId, ...ids];

    if (action === "delete") {
      const [result] = await pool.execute<any>(
        `DELETE FROM customers WHERE ${ownerCol} = ?${brandCols ? (brandId ? " AND brand_id = ?" : " AND brand_id IS NULL") : ""} AND id IN (${placeholders})`,
        baseParams
      );
      return res.json({ success: true, affected: result.affectedRows });
    }

    if (action === "set_status") {
      if (!value) return res.status(400).json({ error: "value is required for set_status" });
      const [result] = await pool.execute<any>(
        `UPDATE customers SET status = ?, updated_at = NOW() WHERE ${ownerCol} = ?${brandClause} AND id IN (${placeholders})`,
        [String(value), ...baseParams]
      );
      return res.json({ success: true, affected: result.affectedRows });
    }

    if (action === "set_category") {
      const categoryValue = value ? String(value) : null;

      if (hasCategoryColumn) {
        const [result] = await pool.execute<any>(
          `UPDATE customers SET category = ?, updated_at = NOW() WHERE ${ownerCol} = ?${brandClause} AND id IN (${placeholders})`,
          [categoryValue, ...baseParams]
        );
        return res.json({ success: true, affected: result.affectedRows });
      }

      if (hasSourceDetailsColumn) {
        const [result] = await pool.execute<any>(
          `UPDATE customers
           SET source_details = jsonb_set(
             jsonb_set(COALESCE(source_details::jsonb, '{}'::jsonb), '{category}', to_jsonb(?::text)),
             '{segment}', to_jsonb(?::text)
           )::text,
               updated_at = NOW()
           WHERE ${ownerCol} = ?${brandClause} AND id IN (${placeholders})`,
          [categoryValue, categoryValue, ...baseParams]
        );
        return res.json({ success: true, affected: result.affectedRows });
      }

      return res.status(400).json({ error: "Category update is not supported by this database schema" });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific customer/lead
app.delete("/api/leads/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const id = req.params.id;
    const deleted = await customersService.delete(id, userId, brandId);
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
    const { instanceId, phone, message, useRotation, leadId } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "phone and message are required" });
    }

    const shouldRotate = Boolean(useRotation) || !instanceId;
    if (shouldRotate) {
      const result = await instanceRotation.sendTextWithFailover({
        userId,
        phone,
        message,
        leadId: leadId ? String(leadId) : undefined,
        preferredInstanceId: instanceId ? String(instanceId) : undefined,
        automationCode: "manual_send",
        maxAttempts: 3,
      });

      return res.json({
        success: result.ok,
        instanceId: result.instanceId,
        message: result.ok
          ? "Message sent"
          : `Failed to send (${result.error || "no_instance_available"})`,
      });
    }

    const selectedInstanceId = String(instanceId);
    const allowed = await instanceBelongsToUser(selectedInstanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    if (!rateLimiter.canSend(selectedInstanceId)) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
    }
    const sent = await instanceManager.sendMessage(selectedInstanceId, phone, message);
    if (sent) {
      rateLimiter.recordSend(selectedInstanceId);
      await instanceRotation.recordSendMetric({
        userId,
        instanceId: selectedInstanceId,
        leadId: leadId ? String(leadId) : undefined,
        automationCode: "manual_send",
        status: "sent",
      });
    } else {
      await instanceRotation.recordSendMetric({
        userId,
        instanceId: selectedInstanceId,
        leadId: leadId ? String(leadId) : undefined,
        automationCode: "manual_send",
        status: "failed",
        errorCode: "send_failed",
      });
    }
    res.json({ success: sent, instanceId: selectedInstanceId, message: sent ? "Message sent" : "Failed to send (number not on WhatsApp)" });
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

app.get("/api/campaigns", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = String(req.headers["x-brand-id"] || "").trim() || null;
    const campaigns = await campaignEngine.listCampaigns(userId, brandId);
    res.json({ success: true, campaigns });
  } catch (error: any) {
    logger.error(`Legacy list campaigns error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/campaigns/:id", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = String(req.headers["x-brand-id"] || "").trim() || null;
    const result = await campaignEngine.deleteCampaign(userId, String(req.params.id), brandId);
    const status = result.ok ? 200 : 404;
    res.status(status).json({ success: result.ok, message: result.message });
  } catch (error: any) {
    logger.error(`Legacy delete campaign error: ${error.message}`);
    res.status(500).json({ error: error.message });
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

app.get("*", async (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  const host = extractHostname(req);
  if (isCustomDomainHost(host)) {
    const slug = await resolveSlugByDomain(host);
    if (slug) return serveCatalogWithSlug(res, "catalogo-publico.html", slug);
  }
  // Serve React SPA for all unmatched routes
  serveCatalogSPA(res, "index.html");
});

// ==================== START SERVER ====================

httpServer.listen(config.port, "0.0.0.0", () => {
  if (!usingPostgresMode) {
    brandUnitsService.ensureSchema().catch((err: any) => {
      logger.error(`Brand schema bootstrap failed: ${formatError(err)}`);
    });
    notificationService.ensureSchema().catch((err: any) => {
      logger.error(`Notification schema bootstrap failed: ${formatError(err)}`);
    });
  }
  // Master/super-admin schema (postgres-only — uses JSONB / partial indexes)
  masterService.ensureSchema()
    .then(() => emailService.seedSystemTemplates())
    .then(() => emailService.seedTenantTemplates())
    .catch((err: any) => {
      logger.error(`Master schema bootstrap failed: ${formatError(err)}`);
    });

  /* Nginx reconcile: any domain that's already verified in the DB but
   * missing from the live nginx sites-enabled gets provisioned on boot.
   * Runs after a 5s grace period so the HTTP server is fully up. */
  setTimeout(() => {
    reconcileNginxForVerifiedDomains().catch((err: any) => {
      logger.error(`Nginx reconcile failed: ${formatError(err)}`);
    });
  }, 5000);

  logger.info(`Lead Captation System running on port ${config.port}`);
  // Auto-restore WhatsApp sessions
  instanceManager
    .restoreAllSessions()
    .then(() => {
      logger.info("Session restore complete");
    })
    .catch((err) => {
      logger.error(`Session restore failed: ${formatError(err)}`);
    });
  if (!usingPostgresMode) {
    automationRuntime
      .start()
      .then(() => {
        logger.info("Automation runtime ready");
      })
      .catch((err) => {
        logger.error(`Automation runtime start failed: ${formatError(err)}`);
      });
  }
  logger.info(`Dashboard: http://0.0.0.0:${config.port}`);
  logger.info(`API: http://0.0.0.0:${config.port}/api`);

  // Campaign Engine — check for scheduled campaigns every 60s (runs in all modes)
  setInterval(() => {
    Promise.all([
      campaignEngine.processScheduledCampaigns(),
      campaignEngine.resumeRunningCampaigns(),
    ]).catch((err: any) => {
      logger.error(`Campaign scheduler tick failed: ${formatError(err)}`);
    });
  }, 60_000);

  // Kick once on boot so running campaigns recover right away after restart
  campaignEngine.resumeRunningCampaigns().catch((err: any) => {
    logger.error(`Campaign auto-resume bootstrap failed: ${formatError(err)}`);
  });
});

process.on("SIGTERM", () => {
  automationRuntime.stop();
});

process.on("SIGINT", () => {
  automationRuntime.stop();
});
