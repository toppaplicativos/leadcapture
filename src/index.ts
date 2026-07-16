import express from "express";
import { createServer } from "http";
import { readFileSync } from "fs";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { InstanceManager } from "./core/instanceManager";
import { GooglePlacesService } from "./services/googlePlaces";
import {
  radarResponseCache,
  radiusBucket,
  geoCell,
  normalizeSearchKey,
  placesCacheStats,
} from "./services/placesPerfCache";
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
import galleryRoutes from "./routes/gallery";
import imageProxyRoutes from "./routes/imageProxy";
import messagesRoutes from "./routes/messages";
import companiesRoutes from "./routes/companies";
import clientsRoutes from "./routes/clients";
import { rateLimit } from "./middleware/rateLimit";
import { lgpdPublicRoutes, lgpdAdminRoutes } from "./routes/lgpd";
import agentSilencesRoutes from "./routes/agentSilences";
import leadImportRoutes from "./routes/leadImport";
import leadIdeasRoutes from "./routes/leadIdeas";
import brandAutomationsRoutes from "./routes/brandAutomations";
import automationDefinitionsRoutes from "./routes/automationDefinitions";
import aiCampaignRoutes from "./routes/aiCampaign";
import brandSkillsRoutes from "./routes/brandSkills";
import { startAutomationScheduler } from "./services/automationScheduler";
import { startActionEscalationMonitor } from "./services/actionEscalation";
import { startWhatsAppHealthMonitor, getHealthSnapshot, setInstanceManagerRef } from "./services/whatsappHealth";
import {
  isWhatsAppOptOutText,
  whatsappSendEligibility,
} from "./services/whatsappSendEligibility";
import whatsappEligibilityRoutes from "./routes/whatsappEligibility";
import {
  affiliateDistributionService,
  setDistributionInstanceManagerRef,
  startDistributionFollowupMonitor,
  startDistributionQueueMonitor,
} from "./services/affiliateDistribution";
import clientTypesRoutes from "./routes/clientTypes";
import sessionsRoutes from "./routes/sessions";
import automationsRoutes from "./routes/automations";
import brandsRoutes from "./routes/brands";
import { AutomationsService } from "./services/automations";
import { CustomersService } from "./services/customers";
import { BrandUnitsService } from "./services/brandUnits";
import {
  buildInstanceAccessFilter,
  buildOwnerMetaForCreate,
  ensureWhatsAppInstanceOwnerSchema,
  instanceBelongsToScope,
  resolveInstanceAuthScope,
} from "./services/instanceOwnership";
import { KnowledgeBaseService } from "./services/knowledgeBase";
import { authMiddleware, AuthRequest, requireRole } from "./middleware/auth";

import inboxRoutes from "./routes/inbox";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import collectionsRoutes from "./routes/collections";
import attributeDefinitionsRoutes from "./routes/attributeDefinitions";
import bookingsRoutes from "./routes/bookings";
import couponsRoutes from "./routes/coupons";
import reviewsRoutes from "./routes/reviews";
import priceTablesRoutes from "./routes/pricetables";
import expeditionRoutes from "./routes/expedition";
import ordersRoutes from "./routes/orders";
import commerceRoutes, { commercePublicRoutes } from "./routes/commerce";
import paymentsRoutes, { paymentPublicRoutes } from "./routes/payments";
import mercadoPagoRoutes, { mercadoPagoPublicRoutes } from "./routes/mercadoPago";
import storefrontRoutes, { storefrontPublicRoutes, reconcileNginxForVerifiedDomains } from "./routes/storefront";
import stockAppRoutes from "./routes/stockApp";
import affiliateAppRoutes from "./routes/affiliateApp";
import partnersAppRoutes from "./routes/partnersApp";
import mobPublicRoutes from "./routes/mobPublic";
import mobAppRoutes from "./routes/mobApp";
import mobAdminRoutes from "./routes/mobAdmin";
import connectRoutes from "./routes/connect";
import affiliatesRoutes from "./routes/affiliates";
import affiliateProgramsRoutes from "./routes/affiliatePrograms";
import inventoryRoutes from "./routes/inventory";
import publicOnboardingRoutes from "./routes/publicOnboarding";
import publicPwaRoutes from "./routes/publicPwa";
import publicAffiliateRoutes from "./routes/publicAffiliate";
import landingChatRoutes from "./routes/landingChat";
import adminAgentRoutes from "./routes/adminAgent";
import masterRoutes from "./routes/master";
import pushRoutes from "./routes/push";
import stripeWebhookRoutes from "./routes/stripeWebhook";
import publicSignupRoutes from "./routes/publicSignup";
import adminEmailsRoutes from "./routes/adminEmails";
import entitlementsRoutes from "./routes/entitlements";
import rolesRoutes from "./routes/roles";
import contentHubRoutes from "./routes/contentHub";
import { enforceMaintenanceMode, enforceRouteModule } from "./middleware/platformGuard";
import { requireModuleAndPlan, guardLeadCapture } from "./middleware/planGuard";
import { requestContextMiddleware } from "./middleware/requestContext";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getPlatformVersion } from "./config/platformVersion";
import { masterService } from "./services/master";
import { getPushNotificationService } from "./services/pushNotifications";
import { getNotificationPlatformService } from "./services/notificationPlatform";
import { emailService } from "./services/email";
import { InboxService } from "./services/inbox";
import { AutomationRuntimeService } from "./services/automationRuntime";
import { InstanceRotationService } from "./services/instanceRotation";
import { query, queryOne, getPool } from "./config/database";
import { extractIncomingMessageData } from "./utils/whatsappMessage";
import { createCampaignRoutes } from "./routes/campaigns";
import { CampaignEngineService } from "./services/campaignEngine";
import { setCampaignEngineRef } from "./services/campaignEngineRef";
import {
  configureWhatsAppValidationQueue,
  enqueueWhatsAppValidation,
  isLeadAlreadyWhatsAppValidated,
  startWhatsAppValidationQueue,
} from "./services/whatsappValidationQueue";
import { processScheduledSocialPosts } from "./services/socialPostScheduler";
import { memoryEngine } from "./services/memoryEngine";
import leadsRoutes from "./routes/leads";
import leadCategoriesRoutes from "./routes/leadCategories";
import flowBuilderRoutes from "./routes/flowBuilder";
import { FlowExecutorService } from "./services/flowExecutor";
import notificationsRoutes from "./routes/notifications";
import actionsRoutes from "./routes/actions";
import videoStudioRoutes from "./routes/videoStudio";
import supportRoutes from "./routes/support";
import integrationsRoutes from "./routes/integrations";
import instagramRoutes from "./routes/instagram";
import { instagramService } from "./services/instagram";
import facebookRoutes from "./routes/facebook";
import metaPrivacyRoutes from "./routes/metaPrivacy";
import metaWebhookRoutes from "./routes/metaWebhook";
import metaOAuthRoutes from "./routes/metaOAuth";
import attendanceRoutes from "./routes/attendance";
import { getNotificationService } from "./services/notifications";
import { socketManager } from "./core/socketManager";
import { StorefrontService } from "./services/storefront";
import { buildAffiliatePageHeadForSlug, injectAffiliateMetaIntoHtml } from "./services/affiliatePageMeta";
import { buildProductPageHeadMarkup, injectProductMetaIntoHtml } from "./services/productPageMeta";

const app = express();
const httpServer = createServer(app);
app.use(cors());
/* Correlation ID on every request (API + SPA) */
app.use(requestContextMiddleware);

// ⚠ IMPORTANT: Stripe + Meta webhooks must be mounted BEFORE express.json()
// so HMAC/signature verification uses the exact raw body bytes (same pattern
// as Tattoo AI `req.text()` and Stripe constructEvent).
app.use("/api/stripe/webhook", stripeWebhookRoutes);

// Instagram/Meta webhooks — public, raw body, BEFORE json/auth/platformGuard.
// Aliases: /api/meta/webhook (leadcapture), /api/instagram/webhook (Tattoo AI),
// /api/webhooks/meta/instagram (compat). Any inbound DM from any user hits these.
const metaWebhookRawParser = express.raw({
  type: (req) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    // Meta always sends JSON; accept charset variants and empty CT on some proxies
    return !ct || ct.includes("json") || ct.includes("text/plain") || ct.includes("octet-stream");
  },
  limit: "2mb",
});
app.use("/api/meta/webhook", metaWebhookRawParser, metaWebhookRoutes);
app.use("/api/instagram/webhook", metaWebhookRawParser, metaWebhookRoutes);
app.use("/api/webhooks/meta/instagram", metaWebhookRawParser, metaWebhookRoutes);

app.use(
  express.json({
    /* Limite global elevado para 15MB — necessario para Smart Lead Import
       (CSV/XLS/imagem/PDF em base64 ate ~10MB → ~13.3MB JSON). Stripe/Meta webhooks
       usam rawBody propio (mounted antes desse middleware). */
    limit: "15mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
// ==================== CUSTOM DOMAIN MIDDLEWARE ====================
const PRIMARY_DOMAINS = new Set([
  "app.leadcapture.online",
  "www.app.leadcapture.online",
  "adm.leadcapture.online",
  "www.adm.leadcapture.online",
  "parceiros.leadcapture.online",
  "afiliados.leadcapture.online",
  "mob.leadcapture.online",
]);
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

const storefrontService = new StorefrontService();
const reactDistPath = path.join(__dirname, "../frontend/dist");
const reactIndexPath = path.join(reactDistPath, "index.html");
const hasReactBuild = require("fs").existsSync(reactIndexPath);

const _htmlFileCache = new Map<string, string>();
function readCatalogHtml(filename: string): string {
  if (_htmlFileCache.has(filename)) return _htmlFileCache.get(filename)!;
  const content = readFileSync(path.join(__dirname, "../public", filename), "utf-8");
  _htmlFileCache.set(filename, content);
  setTimeout(() => _htmlFileCache.delete(filename), 300_000);
  return content;
}

function requestOrigin(req: express.Request): string {
  const host = extractHostname(req);
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  return `${proto}://${host}`;
}

async function serveProductPage(
  req: express.Request,
  res: express.Response,
  opts: { storeSlug: string; productSlug: string; canonicalPath: string; customDomain?: boolean }
) {
  if (!hasReactBuild) {
    return res.sendFile(path.join(__dirname, "../public", "catalogo-produto.html"));
  }

  try {
    let html = readFileSync(reactIndexPath, "utf-8");
    const origin = requestOrigin(req);
    const bundle = await storefrontService.resolvePublicStore({
      slug: opts.storeSlug,
      host: opts.customDomain ? extractHostname(req) : null,
    });
    const product = await storefrontService.getPublicProduct(opts.storeSlug, opts.productSlug);

    if (bundle && product) {
      const brand = (bundle.store as any)?.brand || {};
      const storeName = String(brand.name || bundle.store.name || opts.storeSlug).trim();
      const primaryDomain = String((bundle.store as any)?.primary_domain || "").trim();
      const canonicalOrigin = primaryDomain
        ? `https://${primaryDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`
        : origin;
      const headMarkup = buildProductPageHeadMarkup({
        origin: canonicalOrigin,
        canonicalPath: opts.canonicalPath,
        storeName,
        product,
      });
      html = injectProductMetaIntoHtml(html, headMarkup);
    }

    if (opts.customDomain) {
      const injection = `<script>window.__STORE_SLUG__=${JSON.stringify(opts.storeSlug)};window.__CUSTOM_DOMAIN__=true;</script>`;
      html = html.replace("</head>", `${injection}\n</head>`);
    }

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.type("html").send(html);
  } catch (err: any) {
    logger.error(`serveProductPage error: ${err.message || err}`);
    return res.sendFile(reactIndexPath);
  }
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
    const productSlug = decodeURIComponent(normalized.split("/")[2] || "");
    return serveProductPage(req, res, {
      storeSlug: slug,
      productSlug,
      canonicalPath: normalized,
      customDomain: true,
    });
  }
  next();
});

// Legacy redirects
app.get("/site-workspace", (_req, res) => res.redirect(301, "/admin"));
app.get("/site-workspace/*", (_req, res) => res.redirect(301, "/admin"));

// ── Serve React frontend build (catalog SPA) ──
if (hasReactBuild) {
  // Serve React static assets (JS, CSS, etc.)
  app.use("/assets", express.static(path.join(reactDistPath, "assets"), { maxAge: "30d", immutable: true }));
  // Missing chunks must 404 — SPA HTML breaks ES module loading (white screen)
  app.use("/assets", (_req, res) => {
    res.status(404).type("text/plain").send("Asset not found");
  });
}

// Service worker must never be cached — always serve fresh so version bumps take effect immediately
app.get("/service-worker.js", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/service-worker.js"));
});
app.use(express.static(path.join(__dirname, "../public")));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    maxAge: "60d",
    immutable: true,
    etag: true,
    lastModified: true,
    fallthrough: true,
  })
);
/* Placeholder quando o arquivo sumiu do disco (deploy limpo, UUID órfão no BD).
   Evita cascata de 404 no front e quebra de layout em campanhas/produtos. */
app.get(/^\/uploads\/.+\.(jpe?g|png|gif|webp|avif|svg)$/i, (_req, res) => {
  // SVG neutro 1×1 cinza — leve, cacheável
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">` +
    `<rect fill="#e5e7eb" width="320" height="200"/>` +
    `<text x="160" y="105" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="14">imagem indisponível</text>` +
    `</svg>`;
  res.status(200);
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Upload-Fallback", "1");
  res.send(svg);
});
/* Public on-the-fly image resizer (/api/img?src=/uploads/...&w=...&fm=webp) */
app.use("/api/img", imageProxyRoutes);

// ==================== PUBLIC ROUTES ====================
app.use("/api/auth", authRoutes);
app.use("/api/commerce/public", commercePublicRoutes);
app.use("/api/payments/public", paymentPublicRoutes);
app.use("/api/integrations/mercado-pago", mercadoPagoPublicRoutes);
app.use("/api/storefront/public", storefrontPublicRoutes);
app.use("/api/public", publicOnboardingRoutes);
app.use("/api/public", publicSignupRoutes);
app.use("/api/landing", landingChatRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/entitlements", entitlementsRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/content-hub", contentHubRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/admin/emails", adminEmailsRoutes);
app.use("/pwa", publicPwaRoutes);
app.use("/api/public/affiliate", publicAffiliateRoutes);

/* Global platform enforcement for tenant APIs (maintenance + module kill-switch by path) */
app.use("/api", enforceMaintenanceMode as any);
app.use("/api", enforceRouteModule as any);

// Health / readiness (public) — used by load balancers and deploy smoke
app.get("/api/health", async (req, res) => {
  const version = getPlatformVersion();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await queryOne<{ ok: number }>(`SELECT 1 AS ok`);
    dbOk = true;
  } catch (err: any) {
    dbError = String(err?.message || err).slice(0, 160);
  }

  const ready = dbOk;
  const body = {
    status: ready ? "ok" : "degraded",
    ready,
    checks: {
      database: dbOk ? "up" : "down",
      database_error: dbError,
      whatsapp_instances: instanceManager.getAllInstances().length,
    },
    version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    request_id: req.requestId || null,
  };
  res.status(ready ? 200 : 503).json(body);
});

/** Client sync handshake — FE compares build/version and SW stamp */
app.get("/api/public/version", (_req, res) => {
  res.json({
    platform: getPlatformVersion(),
    api: "leadcapture",
  });
});

// ── Helper: serve React SPA or legacy HTML ──
function serveCatalogSPA(res: express.Response, legacyFile: string) {
  if (hasReactBuild) {
    return res.sendFile(reactIndexPath);
  }
  return res.sendFile(path.join(__dirname, "../public", legacyFile));
}

async function serveAffiliateSPA(
  req: express.Request,
  res: express.Response,
  brandSlug?: string
) {
  if (!hasReactBuild) {
    return res.sendFile(path.join(__dirname, "../public", "index.html"));
  }

  try {
    let html = readFileSync(reactIndexPath, "utf-8");
    const slug = String(brandSlug || "").trim();
    if (slug) {
      const origin = requestOrigin(req);
      const headMarkup = await buildAffiliatePageHeadForSlug(slug, origin);
      if (headMarkup) {
        html = injectAffiliateMetaIntoHtml(html, headMarkup);
      }
    }
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.type("html").send(html);
  } catch (err: any) {
    logger.error(`serveAffiliateSPA error: ${err.message || err}`);
    return res.sendFile(reactIndexPath);
  }
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

app.get("/loja/:slug/produto/:productSlug", async (req, res) => {
  await serveProductPage(req, res, {
    storeSlug: String(req.params.slug || ""),
    productSlug: String(req.params.productSlug || ""),
    canonicalPath: `/loja/${req.params.slug}/produto/${req.params.productSlug}`,
  });
});

app.get("/catalogo/:slug/produto/:productSlug", async (req, res) => {
  await serveProductPage(req, res, {
    storeSlug: String(req.params.slug || ""),
    productSlug: String(req.params.productSlug || ""),
    canonicalPath: `/catalogo/${req.params.slug}/produto/${req.params.productSlug}`,
  });
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

// LeadCapture Parceiros — app global do afiliado
app.get("/parceiros", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/parceiros/entrar", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/parceiros/painel", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/parceiros/painel/*", (_req, res) => { serveCatalogSPA(res, "index.html"); });

// Lead Capture Mob — entregadores + rastreio público
app.get("/mob", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/mob/entrar", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/mob/app", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/mob/app/*", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/entrar", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/rastreio", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/rastreio/:token", (_req, res) => { serveCatalogSPA(res, "index.html"); });

// Central do Afiliado — PWA standalone (OG meta injetado no servidor para preview WhatsApp)
app.get("/central-afiliado", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/central-afiliado/:brand", async (req, res) => { await serveAffiliateSPA(req, res, String(req.params.brand || "")); });
app.get("/central-afiliado/:brand/painel", async (req, res) => { await serveAffiliateSPA(req, res, String(req.params.brand || "")); });
app.get("/central-afiliado/:brand/painel/*", async (req, res) => { await serveAffiliateSPA(req, res, String(req.params.brand || "")); });
app.get("/afiliado/:code", (_req, res) => { serveCatalogSPA(res, "index.html"); });

// Admin panel routes (all serve React SPA)
const adminPages = [
  "/login", "/admin", "/dashboard", "/assistente", "/busca", "/leads", "/clientes",
  "/mensagens", "/notificacoes", "/campanhas", "/campanha", "/automacoes",
  "/criativos", "/creative", "/agente", "/produtos", "/pedidos",
  "/whatsapp", "/design", "/pagamentos", "/frete", "/entregas", "/mob", "/dominio", "/configuracoes",
  "/estoque", "/estoque/app", "/inventario", "/afiliados",
];
for (const page of adminPages) {
  app.get(page, (_req, res) => { serveCatalogSPA(res, "index.html"); });
}

// Master admin (adm.leadcapture.online) — sub-rotas em /admin/*
const masterAdminPages = [
  "/admin/integracoes", "/admin/planos", "/admin/emails", "/admin/usuarios",
  "/admin/organizacoes", "/admin/providers", "/admin/ferramentas",
  "/admin/push-notificacoes", "/admin/configuracoes", "/admin/audit-log",
];
for (const page of masterAdminPages) {
  app.get(page, (_req, res) => { serveCatalogSPA(res, "index.html"); });
}
app.get("/admin/*", (_req, res) => { serveCatalogSPA(res, "index.html"); });

// Legacy master paths (redirect handled client-side)
app.get("/master", (_req, res) => { serveCatalogSPA(res, "index.html"); });
app.get("/master/*", (_req, res) => { serveCatalogSPA(res, "index.html"); });

app.get("/brand-onboarding", (_req, res) => {
  serveCatalogSPA(res, "brand-onboarding.html");
});

// ==================== PROTECTED ROUTES ====================
app.use("/api/customers", authMiddleware, customersRoutes);
app.use("/api/knowledge-base", authMiddleware, knowledgeBaseRoutes);
app.use(
  "/api/ai",
  authMiddleware,
  rateLimit({ name: "ai", max: 60, windowMs: 60_000 }),
  aiRoutes,
);
app.use("/api/admin-agent", authMiddleware, requireModuleAndPlan("agent_workspace"), adminAgentRoutes);
app.use("/api/media", authMiddleware, mediaRoutes);
app.use("/api/gallery", authMiddleware, galleryRoutes);
app.use("/api/companies", authMiddleware, companiesRoutes);
app.use("/api/clients", authMiddleware, rateLimit({ name: "clients", max: 200, windowMs: 60_000 }), clientsRoutes);
app.use(
  "/api/lead-import",
  authMiddleware,
  rateLimit({ name: "lead-import", max: 30, windowMs: 60_000 }),
  requireModuleAndPlan("lead_import"),
  (req, res, next) => {
    /* Cap daily/monthly lead ingestion for import path */
    if (String(req.method || "").toUpperCase() === "POST") {
      return guardLeadCapture(req as any, res, next);
    }
    next();
  },
  leadImportRoutes,
);
app.use("/api/lead-ideas", authMiddleware, leadIdeasRoutes);
app.use("/api/automations", authMiddleware, requireModuleAndPlan("automations"), brandAutomationsRoutes);
app.use("/api/automation-defs", authMiddleware, requireModuleAndPlan("automations"), automationDefinitionsRoutes);
// Multi-channel attendance (IG + WA) — global training stays on /api/ai/agent-profile
app.use("/api/attendance", authMiddleware, attendanceRoutes);
app.use(
  "/api/ai-campaign",
  authMiddleware,
  rateLimit({ name: "ai-campaign", max: 40, windowMs: 60_000 }),
  requireModuleAndPlan("campaigns"),
  aiCampaignRoutes,
);
app.use(
  "/api/video-studio",
  rateLimit({ name: "video-studio", max: 20, windowMs: 60_000 }),
  requireModuleAndPlan("video_studio"),
  videoStudioRoutes,
);
app.use("/api/brand-skills", authMiddleware, brandSkillsRoutes);
app.use("/api/client-types", authMiddleware, clientTypesRoutes);
app.use("/api/sessions", authMiddleware, sessionsRoutes);
app.use("/api/automations", authMiddleware, requireModuleAndPlan("automations"), automationsRoutes);
app.use("/api/brands", authMiddleware, brandsRoutes);
app.use("/api/inbox", authMiddleware, inboxRoutes);
app.use("/api/messages", authMiddleware, messagesRoutes);
app.use("/api/categories", authMiddleware, categoriesRoutes);
app.use("/api/products", authMiddleware, productsRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/attribute-definitions", attributeDefinitionsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/coupons", couponsRoutes);
app.use("/api/reviews", reviewsRoutes);
/* LGPD (Fase 15) — public opt-out is NO-AUTH on purpose. Admin views require auth. */
app.use("/api/lgpd", lgpdPublicRoutes);
app.use("/api/lgpd", lgpdAdminRoutes);
/* Fase 16 — agent silence log (visibility into ResponseGate decisions) */
app.use("/api/agent", agentSilencesRoutes);
app.use("/api/pricetables", authMiddleware, priceTablesRoutes);
app.use("/api/expedition", authMiddleware, expeditionRoutes);
app.use("/api/orders", authMiddleware, ordersRoutes);
app.use("/api/commerce", authMiddleware, commerceRoutes);
app.use("/api/payments", authMiddleware, paymentsRoutes);
app.use("/api/payments", authMiddleware, mercadoPagoRoutes);
app.use("/api/storefront", authMiddleware, storefrontRoutes);
app.use("/api/stock-app", authMiddleware, stockAppRoutes);
app.use("/api/affiliate-app", authMiddleware, affiliateAppRoutes);
app.use("/api/partners-app", authMiddleware, partnersAppRoutes);
/* Lead Capture Mob — deliveries (public + courier + org admin) */
app.use("/api/mob", mobPublicRoutes);
app.use("/api/mob/app", mobAppRoutes);
app.use("/api/mob/admin", mobAdminRoutes);
app.use("/api/connect", connectRoutes);
app.use("/api/affiliates", authMiddleware, requireModuleAndPlan("affiliates"), affiliatesRoutes);
app.use("/api/affiliate-programs", authMiddleware, requireModuleAndPlan("affiliates"), affiliateProgramsRoutes);
app.use("/api/inventory", authMiddleware, inventoryRoutes);
app.use("/api/leads", authMiddleware, rateLimit({ name: "leads", max: 200, windowMs: 60_000 }), leadsRoutes);
app.use("/api/lead-categories", leadCategoriesRoutes);
// O editor de Fluxos é a camada visual de Automações. Autentique antes do
// guard e preserve acesso para contratos Pro anteriores ao flag flow_builder.
app.use("/api/flows", authMiddleware, requireModuleAndPlan("automations"), flowBuilderRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/actions", actionsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/integrations", authMiddleware, integrationsRoutes);
/** GETs de conexão Meta: só auth (sem plano). Path via originalUrl — Express stripa baseUrl. */
function allowMetaStatusGet(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (req.method !== "GET") return next()
  const original = String(req.originalUrl || req.url || "").split("?")[0]
  const path = String(req.path || "").split("?")[0]
  const open = ["connection-status", "connection", "profile"]
  const hit = open.some(
    (s) =>
      path === `/${s}` ||
      path.endsWith(`/${s}`) ||
      original.endsWith(`/${s}`) ||
      original.includes(`/instagram/${s}`) ||
      original.includes(`/facebook/${s}`),
  )
  if (hit) {
    ;(req as any).__metaStatusOpen = true
  }
  next()
}
function requireModuleUnlessMetaStatus(module: "instagram" | "facebook") {
  const gate = requireModuleAndPlan(module)
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req as any).__metaStatusOpen) return next()
    return gate(req as any, res, next)
  }
}

// Meta webhooks already mounted BEFORE express.json (raw body + public).
// Only privacy/oauth here (JSON body OK). Instagram REST stays behind auth.
app.use("/api/meta/privacy", metaPrivacyRoutes);
app.use("/api/meta/oauth", metaOAuthRoutes);

app.use(
  "/api/instagram",
  authMiddleware,
  allowMetaStatusGet,
  requireModuleUnlessMetaStatus("instagram"),
  instagramRoutes,
);
app.use(
  "/api/facebook",
  authMiddleware,
  allowMetaStatusGet,
  requireModuleUnlessMetaStatus("facebook"),
  facebookRoutes,
);

// Services
const instanceManager = new InstanceManager();
app.set("instanceManager", instanceManager);
FlowExecutorService.init(instanceManager);
const instanceRotation = new InstanceRotationService(instanceManager);
app.set("instanceRotation", instanceRotation);
const automationRuntime = new AutomationRuntimeService(instanceManager, instanceRotation);
app.set("automationRuntime", automationRuntime);
export const campaignEngine = new CampaignEngineService(instanceManager, instanceRotation);
app.set("campaignEngine", campaignEngine);
setCampaignEngineRef(campaignEngine);
app.post("/api/whatsapp/composer-test", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ error: "Explicit confirmation is required" });
    }
    const result = await campaignEngine.sendWhatsappCompositionTest(userId, {
      instanceId: String(req.body?.instanceId || ""),
      testPhone: String(req.body?.testPhone || ""),
      brandId: String(req.headers["x-brand-id"] || "").trim() || null,
      blocks: Array.isArray(req.body?.blocks) ? req.body.blocks : [],
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "Failed to send composition test");
    const status =
      message.includes("not found") ? 404 :
      message.includes("required") || message.includes("connected") || message.includes("WhatsApp") ? 400 :
      500;
    res.status(status).json({ error: message });
  }
});
app.use("/api/campaigns-v2", authMiddleware, requireModuleAndPlan("campaigns"), createCampaignRoutes(instanceManager, instanceRotation, campaignEngine));
app.use("/api/whatsapp/eligibility", authMiddleware, whatsappEligibilityRoutes);
const inboxService = new InboxService();
inboxService.setMediaDownloader((instanceId, msg) => instanceManager.downloadIncomingMedia(instanceId, msg));
inboxService.setMessageSender((instanceId, jid, message) => instanceManager.sendMessageByJid(instanceId, jid, message));
instagramService.setWhatsappNotifier(async (userId, phone, message) => {
  const result = await instanceRotation.sendTextWithFailover({
    userId,
    phone,
    message,
    automationCode: "ig_publish_failed",
    maxAttempts: 2,
  });
  return result.ok;
});
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
    /* Baileys 7 / WhatsApp LID: a identidade principal pode vir como @lid.
       Quando o protocolo fornece o PN alternativo, ele aparece em
       remoteJidAlt (conversa direta) ou participantAlt (grupo). Campos antigos
       continuam como fallback para mensagens persistidas pela linha 6.x. */
    const rawRemoteJid = String(msg?.key?.remoteJid || "");
    const keyAny = (msg?.key as any) || {};
    const remoteJidAlt = String(keyAny.remoteJidAlt || "").trim();
    const participantAlt = String(keyAny.participantAlt || "").trim();
    const senderPn = String(keyAny.senderPn || "").trim();
    const participantPn = String(keyAny.participantPn || "").trim();
    /* Em multidevice, Baileys também pode popular esses campos que tentamos: */
    const senderLid = String(keyAny.senderLid || "").trim();
    const participantLid = String(keyAny.participantLid || "").trim();
    const participantField = String(msg?.key?.participant || "").trim();
    /* Quando a mensagem vem de @lid, o número real pode estar em:
       - key.senderPn (preferido em Baileys 6.7+)
       - key.participantPn (mensagens em grupo)
       - key.participant (alguns casos legados)
       Pegamos a primeira que parecer @s.whatsapp.net ou puramente numérica. */
    const candidates = [
      remoteJidAlt,
      participantAlt,
      senderPn,
      participantPn,
      participantField,
    ].filter(Boolean);
    const resolvedPn = candidates.find((c) => /^\d+@s\.whatsapp\.net$/.test(c) || /^\d{10,15}$/.test(c)) || "";
    const isLid = rawRemoteJid.endsWith("@lid");
    const phone = resolvedPn
      ? resolvedPn.replace(/@.*$/, "")
      : isLid
      ? "" /* sem PN resolvido e veio @lid → não temos número real, melhor abortar */
      : rawRemoteJid.replace(/@.*$/, "");

    if (isLid && !resolvedPn) {
      /* Log diagnóstico — mostra a estrutura inteira do key uma vez só por instância pra debug */
      logger.warn(
        `[CampaignReply] @lid sem PN alternativo. instance=${instanceId} jid=${rawRemoteJid} key.remoteJidAlt=${remoteJidAlt || "(empty)"} key.participantAlt=${participantAlt || "(empty)"} key.senderPn=${senderPn || "(empty)"} key.participantPn=${participantPn || "(empty)"} key.senderLid=${senderLid || "(empty)"} key.participantLid=${participantLid || "(empty)"} key.participant=${participantField || "(empty)"} keys=${Object.keys(keyAny).join(",")}`
      );
    }

    if (phone && parsed.body && isWhatsAppOptOutText(parsed.body) && !msg?.key?.fromMe) {
      try {
        const ownerForOpt = await queryOne<{ created_by?: string; brand_id?: string | null }>(
          "SELECT created_by, brand_id FROM whatsapp_instances WHERE id = ? LIMIT 1",
          [instanceId]
        );
        // Confirma antes do bloqueio (senão o gate bloqueia o próprio ACK).
        await instanceManager.sendMessageByJid(
          instanceId,
          rawRemoteJid,
          "Pronto. Você não receberá mais mensagens automáticas deste número. Se foi engano, fale com nosso atendimento."
        ).catch(() => {});
        await whatsappSendEligibility.registerOptOutAndPurge({
          phone,
          reason: `WhatsApp command: ${String(parsed.body).slice(0, 80)}`,
          source: "whatsapp_command",
          userId: ownerForOpt?.created_by || null,
          brandId: ownerForOpt?.brand_id || null,
          instanceId,
        });
        logger.info(`[wa_eligibility] opt-out processado phone=***${phone.slice(-4)} instance=${instanceId}`);
      } catch (optErr: any) {
        logger.warn(`[wa_eligibility] opt-out falhou: ${optErr?.message || optErr}`);
      }
    }

    if (phone && parsed.body) {
      const ownerRow = await queryOne<{ created_by?: string; brand_id?: string | null }>(
        "SELECT created_by, brand_id FROM whatsapp_instances WHERE id = ? LIMIT 1",
        [instanceId]
      );
      const ownerUserId = String(ownerRow?.created_by || "");
      const ownerBrandId = String(ownerRow?.brand_id || "").trim() || null;
      if (!ownerUserId) {
        logger.warn(`[CampaignReply] whatsapp_instance ${instanceId} sem created_by — impossivel rastrear resposta para campanhas. Reconecte/recadastre a instancia.`);
      }
      if (ownerUserId && !ownerBrandId) {
        logger.warn(`[CampaignReply] whatsapp_instance ${instanceId} sem brand_id — tracking de respostas vai precisar de fallback cross-brand. Associe a instancia a um Brand Unit.`);
      }
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

        // Fluxos: prioridade no inbound é aplicada dentro do InboxService.tryAutonomousReply
        // (resume/fire + skip da IA cognitiva se claimed). Evita double-reply.

        affiliateDistributionService
          .processInboundReply({
            ownerUserId,
            brandId: ownerBrandId,
            instanceId,
            phone,
            message: String(parsed.body),
          })
          .catch((err: any) => {
            logger.warn(`[affiliateDistribution] inbound reply skipped: ${err?.message || err}`);
          });
      }
    }
  } catch (error: any) {
    logger.error(`Automation inbound trigger failed: ${error.message}`);
  }
});
const googlePlaces = new GooglePlacesService();
const gemini = new GeminiService();
const rateLimiter = new RateLimiter(3, 200);
/* Rate limits do panfleteiro — antes era 8/min (compartilhado) e o radar morria
   depois de ~8 arrastes. Agora: limites altos por tipo; cache absorve o pico real. */
const leadSearchRateLimiter = new RateLimiter(40, 10_000); // text search
const leadRadarRateLimiter = new RateLimiter(120, 30_000); // radar uncached
const locationSearchRateLimiter = new RateLimiter(90, 15_000);
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

function resolveAuthUserId(req: any): string | undefined {
  const raw = req?.userId || req?.user?.userId || req?.user?.sub;
  const userId = String(raw || "").trim();
  return userId || undefined;
}

async function resolveInstanceBrandId(
  scope: import("./services/instanceOwnership").InstanceAuthScope,
  req: any,
): Promise<string | null> {
  if (scope.brandId) return scope.brandId;
  return brandUnitsService
    .resolveActiveBrandId(scope.ownerUserId, getRequestedBrandId(req))
    .catch(() => null);
}

/** Rotas legadas admin (campanhas, envio manual) — escopo admin, não afiliado. */
async function instanceBelongsToUser(instanceId: string, userId: string, brandId?: string | null): Promise<boolean> {
  return instanceBelongsToScope(
    instanceId,
    { actorUserId: userId, ownerUserId: userId, brandId: brandId || null, isAffiliate: false },
    brandId,
  );
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
  if (!phone || phone.length < 8) return false;
  if (isLeadAlreadyWhatsAppValidated(raw)) return false;
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

/* Cache do schema customers — SHOW COLUMNS a cada radar era um dos gargalos. */
let _customersColCache: { names: Set<string>; expires: number } | null = null;

async function getCustomersColumnNames(): Promise<Set<string>> {
  if (_customersColCache && _customersColCache.expires > Date.now()) {
    return _customersColCache.names;
  }
  const columns = await query<any[]>("SHOW COLUMNS FROM customers");
  const names = new Set(columns.map((row) => String(row?.Field || "")));
  _customersColCache = { names, expires: Date.now() + 10 * 60_000 };
  return names;
}

async function findCapturedPlaceIds(
  placeIds: string[],
  userId: string,
  brandId?: string | null
): Promise<string[]> {
  if (placeIds.length === 0) return [];

  const names = await getCustomersColumnNames();
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

  const found: string[] = [];
  // Chunk IN — evita query monstro e timeouts
  for (let i = 0; i < placeIds.length; i += 100) {
    const chunk = placeIds.slice(i, i + 100);
    const placeholders = chunk.map(() => "?").join(",");

    if (names.has("google_place_id")) {
      const rows = await query<any[]>(
        `SELECT google_place_id AS place_id
         FROM customers
         WHERE google_place_id IN (${placeholders})${ownerWhere}${brandWhere}`,
        [...chunk, ...ownerParams, ...brandParams]
      );
      for (const row of rows) {
        const id = String(row?.place_id || "");
        if (id) found.push(id);
      }
      continue;
    }

    if (names.has("source_details")) {
      const rows = await query<any[]>(
        `SELECT source_details::jsonb->>'google_place_id' AS place_id
         FROM customers
         WHERE source_details::jsonb->>'google_place_id' IN (${placeholders})${ownerWhere}${brandWhere}`,
        [...chunk, ...ownerParams, ...brandParams]
      );
      for (const row of rows) {
        const id = String(row?.place_id || "");
        if (id) found.push(id);
      }
    }
  }

  return found;
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

/* /api/instances/health — snapshot pra banner UI + dashboard. Cobre fantasma
   conectado (drift), tempo desconectado, criticidade (ok/warning/critical). */
app.get("/api/instances/health", authMiddleware, async (req: any, res) => {
  try {
    const authScope = resolveInstanceAuthScope(req);
    if (!authScope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = authScope.brandId
      || await brandUnitsService.resolveActiveBrandId(authScope.ownerUserId, getRequestedBrandId(req)).catch(() => null);
    const snapshot = await getHealthSnapshot({
      userId: authScope.ownerUserId,
      brandId,
      isAffiliate: authScope.isAffiliate,
      ownerActorId: authScope.isAffiliate ? authScope.actorUserId : null,
    });
    res.json({ success: true, ...snapshot });
  } catch (e: any) {
    logger.error(`/api/instances/health error: ${e?.message}`);
    res.status(500).json({ error: e?.message || "Erro ao carregar health" });
  }
});

app.post("/api/instances", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(scope, req);
    await ensureWhatsAppInstanceOwnerSchema();

    // Afiliado: sessão SEMPRE amarrada à organização (brand) atual — sem nome manual.
    // Admin: pode informar nome; se vazio, gera genérico.
    let name = String(req.body?.name || "").trim();
    let trackingCode: string | null = null;
    let brandName: string | null = null;

    if (scope.isAffiliate) {
      if (!brandId) {
        return res.status(400).json({
          error: "Organização não identificada. Abra o painel do programa para criar a sessão.",
        });
      }
      const { allocateAffiliateSessionCode } = await import("./services/instanceOwnership");
      const allocated = await allocateAffiliateSessionCode({
        ownerUserId: scope.ownerUserId,
        brandId,
        actorUserId: scope.actorUserId,
      });
      name = allocated.name;
      trackingCode = allocated.trackingCode;
      brandName = allocated.brandName;
    } else {
      // Limite do plano só para sessões do sistema (não afiliados)
      try {
        const { assertInstanceLimit } = await import("./services/planEntitlements");
        await assertInstanceLimit(scope.ownerUserId);
      } catch (limitErr: any) {
        if (limitErr?.code || limitErr?.status) {
          return res.status(limitErr.status || 403).json({
            error: limitErr.code || "plan_instance_limit",
            message: limitErr.message,
            details: limitErr.details,
          });
        }
        throw limitErr;
      }
      if (!name) {
        const brand = brandId
          ? await queryOne<any>(`SELECT slug, name FROM brand_units WHERE id = ? LIMIT 1`, [brandId])
          : null;
        const slug = String(brand?.slug || brand?.name || "sistema")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")
          .slice(0, 12) || "sistema";
        name = `${slug}-SYS-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      }
    }

    const ownerMeta = buildOwnerMetaForCreate(scope);
    const instance = await instanceManager.createInstance(name, scope.ownerUserId, brandId, ownerMeta);
    res.json({
      success: true,
      instance,
      id: instance.id,
      name: instance.name || name,
      tracking_code: trackingCode || name,
      brand_id: brandId,
      brand_name: brandName,
      owner_type: ownerMeta.ownerType,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/connect", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(scope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), scope, brandId);
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
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(scope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    const qr = instanceManager.getInstanceQR(req.params.id, scope.ownerUserId);
    if (qr) {
      res.json({ success: true, qrCode: qr });
    } else {
      res.json({ success: false, message: "QR not available" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/pairing-code", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });

    const { phoneNumber } = req.body || {};
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res.status(400).json({ error: "Numero de telefone obrigatorio" });
    }

    const cleanPhone = instanceManager.normalizePairingPhoneNumber(String(phoneNumber));
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).json({ error: "Numero de telefone invalido" });
    }

    const brandId = await resolveInstanceBrandId(scope, req);
    const id = String(req.params.id);
    const allowed = await instanceBelongsToScope(id, scope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const pairing = await instanceManager.connectWithPairingCode(id, cleanPhone);

    res.json({
      success: true,
      code: pairing.code,
      phone: pairing.phone,
      message: "Digite este codigo no WhatsApp para conectar.",
    });
  } catch (error: any) {
    logger.error(`pairing-code error (${req.params.id}): ${error?.message}`);
    res.status(500).json({ error: error?.message || "Erro ao gerar codigo de pareamento" });
  }
});

app.post("/api/instances/:id/reset-pairing", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveInstanceBrandId(scope, req);
    const id = String(req.params.id);
    const allowed = await instanceBelongsToScope(id, scope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    await instanceManager.resetSessionForPairing(id);
    res.json({ success: true, message: "Sessao encerrada. Pode gerar um novo codigo." });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Erro ao resetar sessao" });
  }
});

app.post("/api/instances/:id/reconnect", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(scope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const id = req.params.id;
    const runtimeStatus = instanceManager.getRuntimeStatus(id);
    if (runtimeStatus === "connected") {
      return res.json({
        success: true,
        qr: null,
        status: "connected",
        preserved: true,
        message: "Sessão já está online e foi preservada.",
      });
    }
    if (runtimeStatus === "connecting" || runtimeStatus === "pairing") {
      return res.json({
        success: true,
        qr: null,
        status: runtimeStatus,
        preserved: true,
        message: runtimeStatus === "pairing"
          ? "Pareamento já está em andamento."
          : "Reconexão já está em andamento.",
      });
    }

    /* Reconexão de manutenção nunca faz logout. connectInstance reutiliza as
       credenciais salvas e só abre QR se realmente não houver sessão válida. */
    const qrPromise = instanceManager.ensureStableConnection(id);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 18000));
    await Promise.race([qrPromise, timeoutPromise]);

    const liveInst = instanceManager.getAllInstances(scope.ownerUserId).find((i: any) => i.id === id);
    const status = instanceManager.getRuntimeStatus(id) || liveInst?.status || "connecting";
    res.json({
      success: true,
      qr: null,
      status,
      preserved: true,
      message: status === "connected" ? "Reconectado com sessão salva!" : "Conectando com a sessão salva...",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/instances/:id/disconnect", authMiddleware, async (req: any, res) => {
  try {
    const scope = resolveInstanceAuthScope(req);
    if (!scope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(scope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), scope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    await instanceManager.disconnectInstance(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/instances/:id", authMiddleware, async (req: any, res) => {
  try {
    const authScope = resolveInstanceAuthScope(req);
    if (!authScope) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveInstanceBrandId(authScope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), authScope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });
    await instanceManager.deleteInstance(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances", authMiddleware, async (req: any, res) => {
  try {
    const authScope = resolveInstanceAuthScope(req);
    if (!authScope) return res.status(401).json({ error: "Unauthorized" });
    await ensureWhatsAppInstanceOwnerSchema();

    const scope = String(req.query?.scope || "all").trim().toLowerCase();
    const brandScoped = scope === "brand" || scope === "active-brand" || authScope.isAffiliate;
    const requestedBrand = getRequestedBrandId(req);
    let activeBrandId: string | null = authScope.brandId || null;
    if (brandScoped) {
      if (!activeBrandId) {
        activeBrandId = await brandUnitsService
          .resolveActiveBrandId(authScope.ownerUserId, requestedBrand)
          .catch(() => null);
      }
    } else if (!authScope.isAffiliate) {
      activeBrandId = await brandUnitsService
        .resolveActiveBrandId(authScope.ownerUserId, requestedBrand)
        .catch(() => brandUnitsService.getActiveBrandId(authScope.ownerUserId).catch(() => null));
    }

    // Dono da marca (brand_units.user_id) — usado no filtro legado sem brand_id
    let brandOwnerUserId: string | null = authScope.ownerUserId;
    if (activeBrandId) {
      const brandRow = await queryOne<{ user_id?: string }>(
        `SELECT user_id FROM brand_units WHERE id = ? LIMIT 1`,
        [activeBrandId],
      ).catch(() => null);
      if (brandRow?.user_id) brandOwnerUserId = String(brandRow.user_id);
    }

    if (brandScoped && !activeBrandId) {
      // Não devolver lista vazia silenciosa: tenta escopo do dono (todas as marcas)
      // para admin; afiliado continua vazio sem brand.
      if (authScope.isAffiliate) {
        return res.json({
          success: true,
          instances: [],
          scope: "brand",
          brand_id: null,
          actor_scope: "affiliate_own",
          warning: "brand_id ausente ou sem permissão",
        });
      }
    }
    const listBrandId = brandScoped && activeBrandId ? activeBrandId : null;
    const ownerFilter = String(req.query?.owner_type || "").trim().toLowerCase();
    const listScope = { ...authScope } as import("./services/instanceOwnership").InstanceAuthScope;
    if (!authScope.isAffiliate && (ownerFilter === "admin" || ownerFilter === "affiliate")) {
      listScope.ownerTypeFilter = ownerFilter;
    }
    // Admin sem marca resolvida: lista por created_by (todas as marcas do usuário)
    const accessFilter = buildInstanceAccessFilter(listScope, listBrandId, "wi", {
      brandOwnerUserId,
    });

    const runtimeMap = new Map(
      instanceManager.getAllInstances(authScope.ownerUserId).map((instance) => [instance.id, instance])
    );

    let dbInstances: any[] = [];
    try {
      dbInstances = await query<any[]>(
        `SELECT wi.id, wi.name, wi.phone, wi.status, wi.created_at, wi.messages_sent, wi.messages_received,
                wi.brand_id, wi.owner_type, wi.owner_actor_id,
                bu.name AS brand_name, bu.slug AS brand_slug,
                af.display_name AS affiliate_display_name,
                u.name AS actor_name, u.email AS actor_email
         FROM whatsapp_instances wi
         LEFT JOIN brand_units bu ON bu.id = wi.brand_id
         LEFT JOIN affiliates af
           ON af.affiliate_user_id = wi.owner_actor_id
          AND af.brand_id = wi.brand_id
         LEFT JOIN users u ON u.id = wi.owner_actor_id
         WHERE ${accessFilter.whereSql}
         ORDER BY wi.created_at DESC`,
        accessFilter.params
      );
    } catch (listErr: any) {
      logger.warn(`GET /api/instances fallback query: ${listErr?.message || listErr}`);
      dbInstances = await query<any[]>(
        `SELECT wi.id, wi.name, wi.phone, wi.status, wi.created_at, wi.messages_sent, wi.messages_received,
                wi.brand_id, wi.owner_type, wi.owner_actor_id,
                NULL AS brand_name, NULL AS brand_slug,
                NULL AS affiliate_display_name, NULL AS actor_name, NULL AS actor_email
         FROM whatsapp_instances wi
         WHERE ${accessFilter.whereSql}
         ORDER BY wi.created_at DESC`,
        accessFilter.params
      );
    }

    const instances = dbInstances.map((row) => {
      const runtime = runtimeMap.get(row.id);
      const isAffiliateOwner = row.owner_type === "affiliate";
      const affiliateName = String(
        row.affiliate_display_name || row.actor_name || row.actor_email || "parceiro",
      ).trim();
      const brandName = row.brand_name ? String(row.brand_name) : null;
      const brandSlug = row.brand_slug ? String(row.brand_slug) : null;
      const trackingCode = String(row.name || "").trim() || null;
      const ownerMeta = {
        owner_type: isAffiliateOwner ? "affiliate" : "admin",
        owner_actor_id: row.owner_actor_id ? String(row.owner_actor_id) : null,
        owner_label: isAffiliateOwner ? affiliateName : "Sistema",
        owner_actor_name: isAffiliateOwner ? affiliateName : null,
        tracking_code: trackingCode,
        /** Rótulo legível: de quem é + de qual org */
        ownership_label: isAffiliateOwner
          ? `Afiliado · ${affiliateName}${brandName ? ` · ${brandName}` : ""}`
          : `Sistema${brandName ? ` · ${brandName}` : " · campanhas e disparos"}`,
      };
      if (runtime) {
        return {
          ...runtime,
          brand_id: row.brand_id ? String(row.brand_id) : null,
          brand_name: brandName,
          brand_slug: brandSlug,
          ...ownerMeta,
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
        brand_name: brandName,
        brand_slug: brandSlug,
        ...ownerMeta,
      };
    });
    res.json({
      success: true,
      instances,
      scope: brandScoped ? "brand" : "all",
      brand_id: activeBrandId || null,
      actor_scope: authScope.isAffiliate ? "affiliate_own" : "admin_all",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/instances/:id", authMiddleware, async (req: any, res) => {
  try {
    const authScope = resolveInstanceAuthScope(req);
    if (!authScope) return res.status(401).json({ error: "Unauthorized" });
    const userId = authScope.ownerUserId;
    const brandId = await resolveInstanceBrandId(authScope, req);
    const allowed = await instanceBelongsToScope(String(req.params.id), authScope, brandId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const instance =
      instanceManager.getInstance(req.params.id, userId) ||
      (await queryOne<any>(
        `SELECT id, name, phone, status, created_at, messages_sent, messages_received,
                owner_type, owner_actor_id
         FROM whatsapp_instances
         WHERE id = ? AND created_by = ?`,
        [req.params.id, userId]
      ));

    if (!instance) return res.status(404).json({ error: "Instance not found" });

    const live = instanceManager.getInstance(req.params.id, userId);
    const liveStatus = live?.status;

    const normalizedInstance = instance.created_at
      ? {
          id: instance.id,
          name: instance.name,
          phone: live?.phone || instance.phone || undefined,
          status: liveStatus || instance.status,
          createdAt: instance.created_at,
          messagessSent: Number(instance.messages_sent || 0),
          messagesReceived: Number(instance.messages_received || 0),
        }
      : { ...instance, status: liveStatus || instance.status, phone: live?.phone || instance.phone };

    const pairingActive = instanceManager.isPairingActive(req.params.id);
    const pairingError = instanceManager.getPairingError(req.params.id);
    res.json({
      success: true,
      status: normalizedInstance.status,
      pairing_active: pairingActive,
      pairing_error: pairingError,
      instance: {
        ...normalizedInstance,
        pairing_active: pairingActive,
        pairing_error: pairingError,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEADS ROUTES (protected) ====================

// Place/location autocomplete for panfleteiro city field (real coords)
app.get("/api/leads/location-search", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
    const q = sanitizeLeadSearchText(String(req.query.q || ""), 160);
    if (!q || q.length < 2) {
      return res.json({ locations: [] });
    }
    const rateKey = `${userId}:location-search`;
    if (!locationSearchRateLimiter.canSend(rateKey)) {
      return res.status(429).json({ error: "Location search rate limit. Aguarde um instante.", locations: [] });
    }
    locationSearchRateLimiter.recordSend(rateKey);
    const limit = Math.max(1, Math.min(10, Math.floor(Number(req.query.limit) || 6)));
    const locations = await googlePlaces.searchLocations(q, {
      limit,
      userId,
      brandId: brandId || undefined,
    });
    return res.json({ locations });
  } catch (err: any) {
    logger.error(`location-search error: ${err?.message || err}`);
    return res.status(500).json({ error: err?.message || "Location search failed", locations: [] });
  }
});

// Search leads via Google Places V2 and persist to MySQL
app.post("/api/leads/search", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { query: rawQuery, location: rawLocation, radius, maxResults, executeAutomation, latitude: bodyLat, longitude: bodyLng } = req.body;
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

    // Prefer coords from place picker; otherwise geocode the text
    let geocoded: { latitude: number; longitude: number; label?: string; source?: string } | null = null;
    const clientLat = Number(bodyLat);
    const clientLng = Number(bodyLng);
    if (
      Number.isFinite(clientLat) &&
      Number.isFinite(clientLng) &&
      Math.abs(clientLat) <= 90 &&
      Math.abs(clientLng) <= 180
    ) {
      geocoded = {
        latitude: clientLat,
        longitude: clientLng,
        label: searchLocation,
        source: "client-place",
      };
      logger.info(
        `Lead search coords from client place: "${searchLocation}" → ${clientLat.toFixed(5)},${clientLng.toFixed(5)}`
      );
    } else {
      try {
        geocoded = await googlePlaces.geocodeLocation(searchLocation, { userId, brandId: brandId || undefined });
        if (geocoded) {
          logger.info(
            `Lead search geocode: "${searchLocation}" → ${geocoded.latitude.toFixed(5)},${geocoded.longitude.toFixed(5)} [${geocoded.source}]`
          );
        } else {
          logger.warn(`Lead search geocode FAILED for "${searchLocation}" — buscando só por texto`);
        }
      } catch (geoErr: any) {
        logger.warn(`Lead search geocode error: ${geoErr?.message || geoErr}`);
      }
    }

    const searchParams: any = {
      query: searchQuery,
      location: searchLocation,
      radius: searchRadius || (geocoded ? 15000 : undefined),
      maxResults: requested,
      providerPreference: "rapid_first" as const,
      includeDetails: true,
      fieldProfile: "full" as const,
      userId,
      brandId: brandId || undefined,
      // Se geocodificou, já passa coords e força restriction
      ...(geocoded
        ? {
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            strictLocation: true,
            _geocoded: geocoded,
          }
        : {}),
    };
    const places = await googlePlaces.searchText(searchParams);

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

    // Validação WA em background (não atrasa a busca)
    if ((persisted.createdLeadIds || []).length > 0) {
      enqueueWhatsAppValidation(userId, brandId, persisted.createdLeadIds || []);
    }

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

    /* Centro: prioriza geocode do endereço digitado (correto); fallback média dos leads. */
    let center: { latitude: number; longitude: number; label?: string; source?: string } | null = null;
    const geoFromSearch = (searchParams._geocoded || geocoded) as
      | { latitude: number; longitude: number; label?: string; source?: string }
      | null
      | undefined;
    if (
      geoFromSearch &&
      Number.isFinite(geoFromSearch.latitude) &&
      Number.isFinite(geoFromSearch.longitude)
    ) {
      center = {
        latitude: geoFromSearch.latitude,
        longitude: geoFromSearch.longitude,
        label: geoFromSearch.label,
        source: geoFromSearch.source,
      };
    } else {
      let latSum = 0, lngSum = 0, validCount = 0;
      for (const l of leads) {
        const la = Number(l?.location?.latitude);
        const ln = Number(l?.location?.longitude);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
        if (la === 0 && ln === 0) continue;
        latSum += la; lngSum += ln; validCount++;
      }
      if (validCount > 0) {
        center = { latitude: latSum / validCount, longitude: lngSum / validCount, source: "leads_avg" };
      }
    }

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
      center,
      geocoded: geoFromSearch || geocoded || null,
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
    /* Fast path padrão: panfleteiro NÃO valida WA nem recarrega 600 pontos a cada pin.
       Validação WA era o gargalo de 5–17s por captura nos logs. Opt-in via body. */
    const doValidateWhatsApp = req.body?.validateWhatsApp === true;
    const includeCapturedPoints = req.body?.includeCapturedPoints === true;
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

    // Fila assíncrona de validação WA (não atrasa captura)
    if (createdLeadId) {
      enqueueWhatsAppValidation(userId, brandId, [createdLeadId]);
    }

    let dbLead: any | null = null;
    if (createdLeadId) {
      dbLead = await customersService.getById(createdLeadId, userId, brandId);
    }
    if (!dbLead) {
      dbLead = await findLeadByGooglePlaceId(placeId, userId, brandId);
    }

    let distributionQueued: Record<string, unknown> | null = null;
    // Enfileira lead novo OU re-captura (customer já existente) para a distribuição
    const prospectIdForQueue = createdLeadId || (dbLead?.id ? String(dbLead.id) : null);
    if (prospectIdForQueue && brandId) {
      try {
        const { affiliateDistributionService } = await import("./services/affiliateDistribution");
        const rules = await affiliateDistributionService.getOrCreateRules(userId, brandId);
        if (rules?.auto_enqueue_capture) {
          distributionQueued = await affiliateDistributionService.enqueueProspect({
            ownerUserId: userId,
            brandId,
            prospectId: prospectIdForQueue,
            source: createdLeadId ? "panfleteiro_capture" : "panfleteiro_recapture",
            priorityScore: createdLeadId ? 55 : 50,
            metadata: {
              query: captureQuery,
              location: captureLocation,
              recapture: !createdLeadId,
              place_id: placeId,
            },
          });
        }
      } catch (distErr: any) {
        logger.warn(`Panfleteiro distribution enqueue skipped: ${distErr?.message || distErr}`);
      }
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

    if (doValidateWhatsApp) {
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
    }

    const capturedPoints = includeCapturedPoints
      ? await customersService.getCapturedGeoPoints(userId, 600, brandId)
      : [];

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
      distribution: distributionQueued,
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

/**
 * Captura em lote (panfleteiro) — 1 request para N pins.
 * Substitui N× capture-manual (cada um 5–17s com WA validation).
 * Sem validação WA síncrona; automação enfileirada só para leads novos.
 */
app.post("/api/leads/capture-batch", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const rawLeads = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (rawLeads.length === 0) {
      return res.status(400).json({ error: "leads array is required" });
    }
    if (rawLeads.length > 80) {
      return res.status(400).json({ error: "Máximo 80 leads por batch" });
    }

    const captureQuery = String(req.body?.query || "captacao_manual").trim() || "captacao_manual";
    const captureLocation = String(req.body?.location || "mapa").trim() || "mapa";
    const captureRadiusRaw = Number(req.body?.radius);
    const automationState = await resolvePrimaryOutboundAutomationState(userId, req.body?.executeAutomation);
    const shouldExecuteAutomation = automationState.enabled;

    const mappedPlaces = rawLeads
      .map((leadInput: any) => {
        const placeId = String(leadInput?.placeId || leadInput?.id || "").trim();
        const name = String(leadInput?.name || "").trim();
        if (!placeId || !name) return null;
        const category = String(leadInput?.category || "").trim();
        return {
          id: placeId,
          displayName: { text: name },
          formattedAddress: String(leadInput?.address || "").trim() || undefined,
          internationalPhoneNumber: String(leadInput?.phone || "").trim() || undefined,
          nationalPhoneNumber: String(leadInput?.phone || "").trim() || undefined,
          rating: typeof leadInput?.rating === "number" ? leadInput.rating : undefined,
          userRatingCount: typeof leadInput?.reviews === "number" ? leadInput.reviews : undefined,
          types: category ? [category] : [],
          websiteUri: String(leadInput?.website || "").trim() || undefined,
          googleMapsUri: String(leadInput?.googleMapsUri || "").trim() || undefined,
          businessStatus: String(leadInput?.businessStatus || "").trim() || undefined,
          location: leadInput?.location || null,
        };
      })
      .filter(Boolean);

    if (mappedPlaces.length === 0) {
      return res.status(400).json({ error: "Nenhum lead válido no batch" });
    }

    const captureContext = {
      query: captureQuery,
      location: captureLocation,
      radius:
        Number.isFinite(captureRadiusRaw) && captureRadiusRaw > 0
          ? Math.floor(captureRadiusRaw)
          : undefined,
    };

    const t0 = Date.now();
    const persisted = await customersService.bulkCreateFromPlaces(
      mappedPlaces,
      userId,
      captureContext,
      brandId,
      { skipMetadataUpdate: true }
    );

    // Distribuição em lote (fire-and-forget por prospect novo)
    if (brandId && (persisted.createdLeadIds || []).length > 0) {
      void (async () => {
        try {
          const { affiliateDistributionService } = await import("./services/affiliateDistribution");
          const rules = await affiliateDistributionService.getOrCreateRules(userId, brandId);
          if (!rules?.auto_enqueue_capture) return;
          for (const prospectId of persisted.createdLeadIds) {
            try {
              await affiliateDistributionService.enqueueProspect({
                ownerUserId: userId,
                brandId,
                prospectId: String(prospectId),
                source: "panfleteiro_capture_batch",
                priorityScore: 55,
                metadata: { query: captureQuery, location: captureLocation },
              });
            } catch { /* ignore single */ }
          }
        } catch (e: any) {
          logger.warn(`capture-batch distribution: ${e?.message || e}`);
        }
      })();
    }

    // Automação só em leads novos — async pra não bloquear resposta
    let automationQueuedJobs = 0;
    if (shouldExecuteAutomation && (persisted.createdLeadIds || []).length > 0) {
      void (async () => {
        for (const leadId of persisted.createdLeadIds) {
          try {
            await automationRuntime.triggerLeadCreatedForRule(
              userId,
              String(leadId),
              PANFLETEIRO_AUTOMATION_CODE,
              {
                segmento: captureQuery || undefined,
                cidade: captureLocation || undefined,
                oferta: captureQuery || undefined,
              },
              "panfleteiro_capture_batch"
            );
          } catch { /* ignore single */ }
        }
      })();
      automationQueuedJobs = persisted.createdLeadIds.length;
    }

    const createdSet = new Set(persisted.createdPlaceIds || []);
    const existingSet = new Set(persisted.existingPlaceIds || []);
    const results = mappedPlaces.map((p: any) => ({
      place_id: p.id,
      status: createdSet.has(p.id) ? "created" : existingSet.has(p.id) ? "existing" : "captured",
    }));

    // Enfileira validação WA só dos NOVOS (não bloqueia resposta)
    const validationQueued = enqueueWhatsAppValidation(
      userId,
      brandId,
      persisted.createdLeadIds || []
    );

    logger.info(
      `capture-batch: ${mappedPlaces.length} leads in ${Date.now() - t0}ms (created=${persisted.created}, skipped=${persisted.skipped}, waQueue+${validationQueued})`
    );

    return res.json({
      success: true,
      total: mappedPlaces.length,
      created: persisted.created,
      skipped: persisted.skipped,
      createdPlaceIds: persisted.createdPlaceIds,
      existingPlaceIds: persisted.existingPlaceIds,
      results,
      automation: {
        enabled: shouldExecuteAutomation,
        queued_jobs: automationQueuedJobs,
      },
      validation_queued: validationQueued,
      ms: Date.now() - t0,
      toast: `Captados ${persisted.created} novos (${persisted.skipped} já existiam)`,
    });
  } catch (error: any) {
    logger.error(`Batch lead capture error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Radar mode search — coordinate-based, NO auto-persistence (exploration only)
/* Panfleteiro V3 — cache em 2 camadas:
   1) placesApiCache (global, query+geo cell) dentro do googlePlaces.searchText
   2) radarResponseCache (por user+brand, inclui captureStatus) TTL 45s
   + dedup in-flight + rate limit alto só em miss. */
const radarInFlight = new Map<string, Promise<any>>();

function radarCacheKey(opts: {
  userId: string; brandId: string | null; lat: number; lng: number;
  radius: number; query: string; filters: string;
}): string {
  return `${opts.userId}:${opts.brandId || "default"}:${geoCell(opts.lat, opts.lng)}:r${radiusBucket(opts.radius)}:${normalizeSearchKey(opts.query)}:${opts.filters}`;
}

app.post("/api/leads/radar-search", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const { query: rawQuery, latitude, longitude, radius, maxResults,
            minRating, minReviews, onlyUncaptured, hasPhone, hasWebsite } = req.body;
    const searchQuery = sanitizeLeadSearchText(rawQuery, 120);
    const lat = Number(latitude);
    const lng = Number(longitude);
    const requested = Math.max(1, Math.min(40, Math.floor(Number(maxResults) || 20)));
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

    /* Normaliza filtros server-side (Panfleteiro V2) */
    const filterMinRating = Math.max(0, Math.min(5, Number(minRating) || 0));
    const filterMinReviews = Math.max(0, Math.min(10000, Number(minReviews) || 0));
    const filterOnlyUncaptured = onlyUncaptured === true || onlyUncaptured === "true";
    const filterHasPhone = hasPhone === true || hasPhone === "true";
    const filterHasWebsite = hasWebsite === true || hasWebsite === "true";
    const filterSig = `${filterMinRating}|${filterMinReviews}|${filterOnlyUncaptured ? 1 : 0}|${filterHasPhone ? 1 : 0}|${filterHasWebsite ? 1 : 0}`;

    /* Cache + dedup em flight (por usuário — captureStatus) */
    const cacheKey = radarCacheKey({ userId, brandId, lat, lng, radius: searchRadius, query: searchQuery, filters: filterSig });
    const cached = radarResponseCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    // Stale: se RapidAPI está no limite, devolve resultado antigo em vez de 502
    const staleCached = radarResponseCache.getStale(cacheKey);
    if (staleCached) {
      return res.json({ ...staleCached, cached: true, stale: true });
    }
    const flying = radarInFlight.get(cacheKey);
    if (flying) {
      const value = await flying;
      return res.json({ ...value, cached: false, deduped: true });
    }

    const rateKey = `${userId}:${brandId || "default"}:radar-search`;
    if (!leadRadarRateLimiter.canSend(rateKey)) {
      // Tenta devolver qualquer cache da área antes de 429
      if (staleCached) {
        return res.json({ ...staleCached, cached: true, stale: true, throttled: true });
      }
      return res.status(429).json({
        error: "Radar em ritmo alto — aguarde alguns segundos (cache ainda serve a mesma área).",
        retry_after_ms: 3000,
        success: false,
        leads: [],
      });
    }
    leadRadarRateLimiter.recordSend(rateKey);

    logger.info(`Radar search: "${searchQuery}" at [${lat.toFixed(4)}, ${lng.toFixed(4)}] r=${searchRadius}m (max: ${requested}) filters=${filterSig}`);

    const workPromise = (async () => {
      const places = await googlePlaces.searchText({
        query: searchQuery,
        latitude: lat,
        longitude: lng,
        radius: searchRadius,
        maxResults: requested,
        providerPreference: "rapid_first",
        includeDetails: false,
        fieldProfile: "radar",
        /* HARD restrict ao circulo do radar — sem isso o Google retorna os top N da
           cidade INTEIRA via locationBias e o radar parece "preso" aos mesmos resultados. */
        strictLocation: true,
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

      let leads = places.map((place: any) => ({
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

      /* Filtros server-side (Panfleteiro V2) — aplicados APOS detectar capturedStatus */
      const beforeFilter = leads.length;
      if (filterOnlyUncaptured) leads = leads.filter((l: any) => l.captureStatus !== "captured");
      if (filterHasPhone) leads = leads.filter((l: any) => String(l.phone || "").trim().length >= 8);
      if (filterHasWebsite) leads = leads.filter((l: any) => String(l.website || "").trim().length > 0);
      if (filterMinRating > 0) leads = leads.filter((l: any) => Number(l.rating || 0) >= filterMinRating);
      if (filterMinReviews > 0) leads = leads.filter((l: any) => Number(l.reviews || 0) >= filterMinReviews);

      const capturedCount = leads.filter((l: any) => l.captureStatus === "captured").length;
      const newCount = leads.length - capturedCount;

      return {
        success: true,
        leads,
        total: leads.length,
        capturedCount,
        newCount,
        filteredOut: beforeFilter - leads.length,
        center: { latitude: lat, longitude: lng },
        radius: searchRadius,
        brand_id: brandId,
        cached: false,
      };
    })();

    radarInFlight.set(cacheKey, workPromise);
    try {
      const responseBody = await workPromise;
      radarResponseCache.set(cacheKey, responseBody);
      res.json(responseBody);
    } finally {
      radarInFlight.delete(cacheKey);
    }
  } catch (error: any) {
    logger.error(`Radar search error: ${error.message}`);
    const isRate =
      error?.code === "PLACES_RATE_LIMIT" ||
      error?.code === "RAPID_COOLDOWN" ||
      /429|rate.?limit|limite do provedor|cooldown/i.test(String(error?.message || ""));

    // Última chance: cache stale da mesma key (pode ter sido populado por outro request)
    try {
      const bodyLat = Number(req.body?.latitude);
      const bodyLng = Number(req.body?.longitude);
      const bodyQ = sanitizeLeadSearchText(String(req.body?.query || ""), 120);
      const bodyR = Number(req.body?.radius) || 3000;
      if (Number.isFinite(bodyLat) && Number.isFinite(bodyLng) && bodyQ) {
        const userId = req.user?.userId as string | undefined;
        const brandId = userId
          ? await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req)).catch(() => null)
          : null;
        const filterSig = "0|0|0|0|0";
        const ck = radarCacheKey({
          userId: userId || "anon",
          brandId,
          lat: bodyLat,
          lng: bodyLng,
          radius: bodyR,
          query: bodyQ,
          filters: filterSig,
        });
        const stale = radarResponseCache.getStale(ck) || radarResponseCache.get(ck);
        if (stale) {
          return res.json({ ...stale, cached: true, stale: true, degraded: true });
        }
      }
    } catch { /* ignore fallback errors */ }

    if (isRate) {
      return res.status(429).json({
        error: error.message || "Limite do provedor de mapas. Aguarde e tente de novo.",
        retry_after_ms: error.retry_after_ms || 45_000,
        success: false,
        leads: [],
        rate_limited: true,
      });
    }
    const statusCode = String(error.message || "").includes("Google Places search failed") ? 502 : 500;
    res.status(statusCode).json({
      error: error.message,
      success: false,
      leads: [],
    });
  }
});

/* Diagnóstico leve de cache (auth) — útil pra validar hit-rate em produção */
app.get("/api/leads/perf-stats", authMiddleware, async (req: any, res) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ ok: true, caches: placesCacheStats() });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "stats failed" });
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

app.post("/api/leads/validate-whatsapp-all", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));

    const preferredInstanceId = String(req.body?.instanceId || "").trim() || undefined;
    const validationInstanceId = await resolveValidationInstanceId(userId, preferredInstanceId);
    if (!validationInstanceId) {
      return res.status(400).json({ error: "Nenhuma instancia WhatsApp conectada para validacao." });
    }
    const allowed = await instanceBelongsToUser(validationInstanceId, userId);
    if (!allowed) return res.status(404).json({ error: "Instance not found" });

    const runtimeInstance = instanceManager.getInstance(validationInstanceId, userId);
    if (!runtimeInstance || runtimeInstance.status !== "connected") {
      return res.status(409).json({ error: "Instancia nao conectada. Reconecte e tente novamente." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === "function") (res as any).flush();
    };

    let offset = 0;
    const batchSize = 40;
    let totalProcessed = 0;
    let totalValid = 0;
    let totalInvalid = 0;
    let totalErrors = 0;
    let cancelled = false;

    req.on("close", () => {
      cancelled = true;
    });

    // Contagem SQL: só quem NUNCA foi revisado (não carrega os 2k já ok)
    const firstPage = await customersService.listPendingWhatsAppValidation({
      ownerUserId: userId,
      brandId,
      limit: 1,
      offset: 0,
    });
    const pendingTotal = Number(firstPage.total || 0);

    sendEvent({
      type: "start",
      totalLeads: pendingTotal,
      pendingOnly: true,
      message:
        pendingTotal === 0
          ? "Nenhum lead pendente — todos já foram revisados"
          : `Validando ${pendingTotal} lead(s) ainda não revisados`,
    });

    if (pendingTotal === 0) {
      sendEvent({
        type: "done",
        processed: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
        skipped: 0,
        tagged: 0,
        total: 0,
        pendingOnly: true,
        message: "Nada a fazer: zero pendentes",
      });
      res.end();
      return;
    }

    // Só itera a lista SQL de pendentes — nunca passa de novo nos já revisados
    while (!cancelled) {
      const batch = await customersService.listPendingWhatsAppValidation({
        ownerUserId: userId,
        brandId,
        limit: batchSize,
        offset: 0, // sempre offset 0: após validar, o lead SAI da query e o próximo sobe
      });
      const candidates = batch.customers || [];
      if (candidates.length === 0) break;

      for (const lead of candidates) {
        if (cancelled) break;

        // Defesa em profundidade (não deveria acontecer com o filtro SQL)
        if (!isLeadPendingWhatsAppValidation(lead)) {
          continue;
        }

        const phone = normalizePhone((lead as any)?.phone);
        if (!phone) {
          // Sem telefone válido: marca como revisado para não voltar na fila
          try {
            await customersService.updateWhatsAppValidation(
              (lead as any).id,
              {
                hasWhatsApp: false,
                checkedAt: new Date().toISOString(),
                instanceId: validationInstanceId,
                status: "invalid",
              },
              userId,
              brandId
            );
          } catch { /* ignore */ }
          totalProcessed++;
          totalInvalid++;
          sendEvent({
            type: "progress",
            processed: totalProcessed,
            valid: totalValid,
            invalid: totalInvalid,
            errors: totalErrors,
            skipped: 0,
            total: pendingTotal,
            pendingOnly: true,
          });
          continue;
        }

        try {
          const check = await instanceManager.checkWhatsAppNumber(validationInstanceId, phone);
          const checkedAt = new Date().toISOString();
          await customersService.updateWhatsAppValidation(
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
          totalProcessed++;
          if (check.exists) totalValid++;
          else totalInvalid++;
        } catch (e: any) {
          totalErrors++;
          logger.error(`validate-pending error: ${e.message}`);
        }

        sendEvent({
          type: "progress",
          processed: totalProcessed,
          valid: totalValid,
          invalid: totalInvalid,
          errors: totalErrors,
          skipped: 0,
          total: pendingTotal,
          pendingOnly: true,
        });

        await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
      }

      // Segurança: se a query não encolher (edge case), avança offset
      if (candidates.length < batchSize) break;
      offset += candidates.length;
      if (offset > pendingTotal + batchSize) break;
    }

    sendEvent({
      type: "done",
      processed: totalProcessed,
      valid: totalValid,
      invalid: totalInvalid,
      errors: totalErrors,
      skipped: 0,
      tagged: 0,
      total: pendingTotal,
      pendingOnly: true,
      message: `Concluído: ${totalProcessed} revisados (${totalValid} com WA, ${totalInvalid} sem)`,
    });
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
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
  if (req.path.startsWith("/uploads") || req.path.startsWith("/assets")) {
    return res.status(404).end();
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

/* API 404 + global error envelope (must be after all routes) */
app.use("/api", (req, res, next) => {
  if (res.headersSent) return next();
  notFoundHandler(req, res);
});
app.use(globalErrorHandler);

httpServer.listen(config.port, "0.0.0.0", () => {
  if (!usingPostgresMode) {
    ensureWhatsAppInstanceOwnerSchema().catch((err: any) => {
      logger.error(`WhatsApp instance owner schema failed: ${formatError(err)}`);
    });
    brandUnitsService.ensureSchema().catch((err: any) => {
      logger.error(`Brand schema bootstrap failed: ${formatError(err)}`);
    });
    notificationService.ensureSchema().catch((err: any) => {
      logger.error(`Notification schema bootstrap failed: ${formatError(err)}`);
    });
  }
  // Identity normalization, master schema, AI algorithms seed, Mercado Pago OAuth
  import("./services/identity")
    .then(({ identityService }) => identityService.ensureSchema())
    .then(() => masterService.ensureSchema())
    .then(() => import("./services/algorithms").then(({ algorithmsService }) => algorithmsService.ensureSchema()))
    .then(() =>
      import("./services/mercadoPagoOAuth").then(({ mercadoPagoOAuthService }) =>
        mercadoPagoOAuthService.ensureSchema(),
      ),
    )
    .then(() => getPushNotificationService().ensureSchema())
    .then(() => getNotificationPlatformService().ensureSchema())
    .then(() => emailService.seedSystemTemplates())
    .then(() => emailService.seedTenantTemplates())
    .catch((err: any) => {
      logger.error(`Master/identity schema bootstrap failed: ${formatError(err)}`);
    });

  // Mercado Pago token refresh + OAuth cleanup (hourly)
  setInterval(() => {
    import("./services/mercadoPagoOAuth")
      .then(async ({ mercadoPagoOAuthService }) => {
        await mercadoPagoOAuthService.cleanupExpiredOAuthAttempts()
        await mercadoPagoOAuthService.refreshExpiringTokens()
      })
      .catch(() => undefined)
  }, 60 * 60 * 1000)

  // Lead Capture Mob — expire sequential offers & re-dispatch + push (every 5s)
  setInterval(() => {
    import("./services/mobOfferMonitor")
      .then(({ runMobOfferCycle }) => runMobOfferCycle())
      .catch(() => undefined);
  }, 5_000)

  // Lead Capture Mob — LGPD GPS trail + tracking token expiry (hourly)
  setInterval(() => {
    import("./services/mobLogistics")
      .then(({ mobLogisticsService }) => mobLogisticsService.purgeExpiredLocationData())
      .catch(() => undefined);
  }, 60 * 60 * 1000)
  setTimeout(() => {
    import("./services/mobLogistics")
      .then(({ mobLogisticsService }) => mobLogisticsService.purgeExpiredLocationData())
      .catch(() => undefined);
  }, 45_000)

  // Lead Capture Mob — fleet document expiry + overdue maintenance (hourly)
  setInterval(() => {
    import("./services/mobFleet")
      .then(async ({ mobFleetService }) => {
        await mobFleetService.refreshDocumentExpiries();
        await mobFleetService.refreshOverdueMaintenances();
      })
      .catch(() => undefined);
  }, 60 * 60 * 1000)

  /* Nginx reconcile: any domain that's already verified in the DB but
   * missing from the live nginx sites-enabled gets provisioned on boot.
   * Runs after a 5s grace period so the HTTP server is fully up. */
  setTimeout(() => {
    reconcileNginxForVerifiedDomains().catch((err: any) => {
      logger.error(`Nginx reconcile failed: ${formatError(err)}`);
    });
  }, 5000);

  logger.info(`Lead Captation System running on port ${config.port}`);
  /* Brand Automations scheduler — tick a cada 60s, dispara brand_automations
     ativadas cujo next_run_at chegou. Inicia in-process com 30s de grace. */
  try {
    startAutomationScheduler();
  } catch (err: any) {
    logger.error(`AutomationScheduler start failed: ${formatError(err)}`);
  }
  try {
    const { startCartRecoveryMonitor } = require("./services/emailCartRecovery");
    startCartRecoveryMonitor();
  } catch (err: any) {
    logger.error(`Cart recovery monitor start failed: ${formatError(err)}`);
  }
  try {
    startActionEscalationMonitor();
  } catch (err: any) {
    logger.error(`ActionEscalation start failed: ${formatError(err)}`);
  }
  /* Fila assíncrona de validação WhatsApp pós-captura */
  try {
    configureWhatsAppValidationQueue({
      getLead: (leadId, userId, brandId) => customersService.getById(leadId, userId, brandId),
      updateValidation: (leadId, payload, userId, brandId) =>
        customersService.updateWhatsAppValidation(
          leadId,
          {
            hasWhatsApp: payload.hasWhatsApp,
            checkedAt: payload.checkedAt,
            instanceId: payload.instanceId,
            normalizedPhone: payload.normalizedPhone,
            jid: payload.jid || undefined,
            status: payload.status,
          },
          userId,
          brandId
        ),
      ensureValidatedTag: (leadId, userId, brandId) =>
        customersService.ensureValidatedTag(leadId, userId, brandId),
      checkNumber: (instanceId, phone) => instanceManager.checkWhatsAppNumber(instanceId, phone),
      resolveInstance: (userId) => resolveValidationInstanceId(userId),
    });
    startWhatsAppValidationQueue();
  } catch (err: any) {
    logger.error(`WhatsApp validation queue start failed: ${formatError(err)}`);
  }
  /* WhatsApp Health Monitor — tick a cada 2min, detecta drift (DB diz connected
     mas socket morreu) e corrige. Tambem alimenta /api/instances/health pra banner UI. */
  try {
    setInstanceManagerRef(instanceManager);
    setDistributionInstanceManagerRef(instanceManager);
    startDistributionFollowupMonitor();
    startDistributionQueueMonitor();
    startWhatsAppHealthMonitor();
  } catch (err: any) {
    logger.error(`WhatsAppHealth start failed: ${formatError(err)}`);
  }
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
      processScheduledSocialPosts(),
    ]).catch((err: any) => {
      logger.error(`Scheduler tick failed: ${formatError(err)}`);
    });
  }, 60_000);

  // Kick once on boot so running campaigns recover right away after restart
  Promise.all([
    campaignEngine.resumeRunningCampaigns(),
    processScheduledSocialPosts(),
  ]).catch((err: any) => {
    logger.error(`Scheduler bootstrap failed: ${formatError(err)}`);
  });
});

process.on("SIGTERM", () => {
  automationRuntime.stop();
});

process.on("SIGINT", () => {
  automationRuntime.stop();
});
