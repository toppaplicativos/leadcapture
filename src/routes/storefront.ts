import { Router } from "express";
import { randomUUID } from "crypto";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { CommerceService } from "../services/commerce";
import { ClientsService } from "../services/clients";
import { ClientTypesService } from "../services/clientTypes";
import { GeminiService } from "../services/gemini";
import { aiRouter } from "../services/aiRouter";
import { InventoryService } from "../services/inventory";
import { productStockService } from "../services/productStock";
import { OrderManagementService } from "../services/orderManagement";
import { StorefrontService, sanitizePublicMarketingSettings, sanitizePublicDesignSettings } from "../services/storefront";
import { couponsService } from "../services/coupons";
import { reviewsService } from "../services/reviews";
import {
  getCatalogCacheEntry,
  setCatalogCacheEntry,
  invalidateCatalogCacheBySlug,
} from "../services/storefrontCache";
import { CustomersService } from "../services/customers";
import { offerCatalogService, attributeDefinitionService, productRelationsService } from "../services/offerCatalog";
import { generateSlotsForDay, loadBookedSlotsCount } from "../services/serviceBooking";
import { resolveConfigurator, ConfiguratorValidationError } from "../services/configuratorEngine";
import { ProductsService } from "../services/products";
import { PaymentConfigService } from "../services/paymentConfig";
import { ProspectionMatchService } from "../services/prospectionMatch";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { exec } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import { domainRegistrar } from "../services/domainRegistrar";

const router = Router();
const publicRouter = Router();

const commerceService = new CommerceService();
const clientsService = new ClientsService();
const clientTypesService = new ClientTypesService();
const storefront = new StorefrontService();
const gemini = new GeminiService();
const inventoryService = new InventoryService();
const omsService = new OrderManagementService();
const prospectionMatch = new ProspectionMatchService();
const paymentConfig = new PaymentConfigService();
const customersService = new CustomersService();
const productsService = new ProductsService();
router.use(attachBrandContext);

type ManagedBusinessStatus =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "em_preparacao"
  | "em_entrega"
  | "entregue"
  | "cancelado";

type OwnedStoreContext = {
  id: string;
  owner_user_id: string;
  brand_id: string | null;
  slug: string;
  name: string;
  status: string;
  primary_domain?: string | null;
  settings_json?: string | null;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function requireUserId(req: BrandRequest): string {
  const userId = String(req.user?.userId || req.userId || "").trim();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requestPublicHost(req: { headers?: Record<string, any>; get?: (name: string) => string | undefined }): string {
  const forwarded = String(req.headers?.["x-forwarded-host"] || "").trim();
  const host = forwarded || String(req.get?.("host") || "").trim();
  return host.split(",")[0].trim();
}

function parseImageList(value: unknown): string[] {
  const parsed = parseJson<any>(value, []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === "string") return String(item || "").trim();
        if (item && typeof item === "object") {
          return String((item as any).url || (item as any).src || "").trim();
        }
        return "";
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function mapStorefrontProductRow(item: any, categoryName?: string) {
  const images = parseImageList(item?.images_json);
  const md = parseJson<Record<string, any>>(item?.metadata_json, {});
  const galleryFromMeta = Array.isArray(md.gallery_images)
    ? md.gallery_images.map((u: unknown) => String(u || "").trim()).filter(Boolean)
    : Array.isArray(md.galleryImages)
      ? md.galleryImages.map((u: unknown) => String(u || "").trim()).filter(Boolean)
      : [];
  const mediaGallery = Array.isArray(md.media?.gallery)
    ? md.media.gallery.map((u: unknown) => String(u || "").trim()).filter(Boolean)
    : [];
  const mergedImages = [...images, ...galleryFromMeta, ...mediaGallery].filter(
    (url, idx, arr) => url && arr.indexOf(url) === idx
  );
  const variants = parseJson<any[]>(item?.variants_json, []);
  const catId = String(item?.category || "").trim();
  const catName = categoryName || catId || "Outros";

  return {
    id: String(item?.id || ""),
    slug: String(item?.slug || ""),
    name: String(item?.name || "Produto"),
    subtitle: md.subtitle || null,
    description: String(item?.description || "").trim() || null,
    category: catName,
    category_id: catId,
    category_name: catName,
    price: Number(item?.price || 0),
    compare_at_price:
      item?.compare_at_price !== undefined && item?.compare_at_price !== null
        ? Number(item.compare_at_price)
        : null,
    image: mergedImages[0] || null,
    images: mergedImages,
    images_json: JSON.stringify(mergedImages),
    sku: md.sku || null,
    weight: md.weight || null,
    weight_unit: md.weight_unit || null,
    unit: md.unit || null,
    type: md.offer_type || "physical_product",
    cta_type: md.cta_type || "buy",
    attributes: md.attributes || {},
    seo: md.seo || {},
    media: md.media || {},
    pipeline_id: md.pipeline_id || null,
    service_config: md.service_config || {},
    configurator: md.configurator || {},
    variants: Array.isArray(variants) ? variants : [],
    related_product_ids: Array.isArray(md.related_product_ids) ? md.related_product_ids : [],
    bundle_items: Array.isArray(md.bundle_items) ? md.bundle_items : [],
    stock_quantity: md.stock_quantity === null || md.stock_quantity === undefined ? null : Number(md.stock_quantity),
    stock_status:
      md.stock_status ||
      (md.stock_quantity === null || md.stock_quantity === undefined ? "unlimited" : "in_stock"),
    stock_threshold_low: Number(md.stock_threshold_low ?? 5),
    reviews_avg: Number(md.reviews_avg ?? 0),
    reviews_count: Number(md.reviews_count ?? 0),
  };
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBrandId(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function deliveryAddressFromText(value: unknown): string | null {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function buildManagedRouteUrl(addressText: unknown): string | null {
  const destination = deliveryAddressFromText(addressText);
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function resolveManagedConfirmBaseUrl(store: OwnedStoreContext | Record<string, any>): string {
  const settings = parseJson<Record<string, any>>((store as any)?.settings_json, {});
  const candidate = String(
    settings?.logistics?.confirm_base_url ||
      process.env.STOREFRONT_CONFIRM_BASE_URL ||
      process.env.APP_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      ""
  ).trim();
  if (candidate) {
    return (/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`).replace(/\/+$/, "");
  }

  const primaryDomain = String((store as any)?.primary_domain || "").trim();
  if (primaryDomain) {
    return `https://${primaryDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  }

  return "https://app.seusistema.com";
}

function buildManagedConfirmUrl(store: OwnedStoreContext | Record<string, any>, token: string): string {
  return `${resolveManagedConfirmBaseUrl(store)}/api/storefront/public/delivery/confirm?token=${encodeURIComponent(token)}`;
}

async function ensureManagedDeliverySchema(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS storefront_delivery_tokens (
      id VARCHAR(36) PRIMARY KEY,
      order_id VARCHAR(36) NOT NULL,
      store_id VARCHAR(36) NOT NULL,
      token VARCHAR(80) NOT NULL,
      expires_at TIMESTAMP NULL,
      used_at TIMESTAMP NULL,
      used_via ENUM('qr','token','admin') NULL,
      used_by VARCHAR(140) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_storefront_delivery_token (token),
      KEY idx_storefront_delivery_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS order_dispatch_status (
      order_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NULL,
      logistic_status ENUM('aguardando_separacao','em_separacao','pronto_para_envio','em_rota','entregue','falha_entrega') NOT NULL DEFAULT 'aguardando_separacao',
      assigned_to VARCHAR(36) NULL,
      estimated_delivery TIMESTAMP NULL,
      route_id VARCHAR(64) NULL,
      route_link TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (order_id),
      KEY idx_dispatch_status_user_brand (user_id, brand_id, logistic_status),
      KEY idx_dispatch_status_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ).catch(() => undefined);
}

async function generateManagedDeliveryToken(orderNumber: string, tokenPrefixInput = "DEL"): Promise<string> {
  await ensureManagedDeliverySchema();
  const prefix = String(tokenPrefixInput || "DEL").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "DEL";
  const orderRef = String(orderNumber || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-6) || "ORDER";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const token = `${prefix}-${orderRef}-${suffix}`;
    const exists = await queryOne<{ id: string }>(`SELECT id FROM storefront_delivery_tokens WHERE token = ? LIMIT 1`, [token]);
    if (!exists) return token;
  }

  throw new Error("Failed to generate unique delivery token");
}

function deriveManagedLifecycle(status: ManagedBusinessStatus) {
  return {
    paymentStatus:
      status === "cancelado" ? "failed" : ["pago", "em_preparacao", "em_entrega", "entregue"].includes(status) ? "paid" : "pending",
    deliveryStatus:
      status === "em_entrega"
        ? "saiu_para_entrega"
        : status === "entregue"
        ? "entregue"
        : status === "em_preparacao"
        ? "em_preparacao"
        : status === "cancelado"
        ? "cancelado"
        : "nao_iniciado",
  } as const;
}

async function createManagedDeliveryArtifacts(input: {
  store: OwnedStoreContext;
  userId: string;
  brandId: string | null;
  orderId: string;
  orderNumber: string;
  etaMinutes?: number;
  courierName?: string | null;
  courierPhone?: string | null;
  deliveryAddress?: string | null;
}): Promise<{ token: string; confirmUrl: string; routeUrl: string | null; etaMinutes: number; courierName: string | null; courierPhone: string | null }> {
  await ensureManagedDeliverySchema();
  const settings = parseJson<Record<string, any>>(input.store.settings_json, {});
  const etaMinutes = Math.max(5, Math.min(Number(input.etaMinutes || settings?.logistics?.default_eta_minutes || 40), 240));
  const token = await generateManagedDeliveryToken(input.orderNumber, String(settings?.logistics?.token_prefix || "DEL"));
  const confirmUrl = buildManagedConfirmUrl(input.store, token);
  const routeUrl = buildManagedRouteUrl(input.deliveryAddress);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

  await query(
    `UPDATE storefront_delivery_tokens
     SET used_at = NOW(), used_via = 'admin', used_by = 'system:rotated', updated_at = NOW()
     WHERE order_id = ? AND used_at IS NULL`,
    [input.orderId]
  ).catch(() => undefined);

  await query(
    `INSERT INTO storefront_delivery_tokens (id, order_id, store_id, token, expires_at, used_at, used_via, used_by)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`,
    [randomUUID(), input.orderId, input.store.id, token, expiresAt]
  );

  await query(
    `INSERT INTO order_dispatch_status (order_id, user_id, brand_id, logistic_status, assigned_to, estimated_delivery, route_id, route_link)
     VALUES (?, ?, ?, 'em_rota', NULL, ?, NULL, ?)
     ON DUPLICATE KEY UPDATE
       logistic_status = 'em_rota',
       estimated_delivery = VALUES(estimated_delivery),
       route_link = COALESCE(VALUES(route_link), route_link),
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.orderId,
      input.userId,
      input.brandId || null,
      new Date(Date.now() + etaMinutes * 60 * 1000).toISOString().slice(0, 19).replace("T", " "),
      routeUrl,
    ]
  ).catch(() => undefined);

  return {
    token,
    confirmUrl,
    routeUrl,
    etaMinutes,
    courierName: input.courierName || null,
    courierPhone: input.courierPhone || null,
  };
}

function toOrderStatus(
  value: unknown
): "novo" | "confirmando_pagamento" | "aprovado" | "em_preparacao" | "saiu_para_entrega" | "entregue" | "cancelado" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "confirmado") return "confirmando_pagamento";
  if (normalized === "pago") return "aprovado";
  if (normalized === "enviado") return "saiu_para_entrega";
  if (normalized === "confirmando_pagamento") return "confirmando_pagamento";
  if (normalized === "aprovado") return "aprovado";
  if (normalized === "em_preparacao") return "em_preparacao";
  if (normalized === "saiu_para_entrega") return "saiu_para_entrega";
  if (normalized === "entregue") return "entregue";
  if (normalized === "cancelado") return "cancelado";
  return "novo";
}

function storefrontStatusToBusinessStatus(value: unknown): ManagedBusinessStatus {
  const status = toOrderStatus(value);
  if (status === "confirmando_pagamento") return "aguardando_pagamento";
  if (status === "aprovado") return "pago";
  if (status === "saiu_para_entrega") return "em_entrega";
  return status;
}

function commerceStatusToBusinessStatus(value: unknown): ManagedBusinessStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pago") return "pago";
  if (normalized === "cancelado" || normalized === "estornado") return "cancelado";
  if (normalized === "aguardando_pagamento" || normalized === "abandonado") return "aguardando_pagamento";
  return "novo";
}

function businessStatusToStorefrontStatus(value: unknown): ReturnType<typeof toOrderStatus> {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "aguardando_pagamento") return "confirmando_pagamento";
  if (normalized === "pago") return "aprovado";
  if (normalized === "em_entrega") return "saiu_para_entrega";
  if (normalized === "em_preparacao") return "em_preparacao";
  if (normalized === "entregue") return "entregue";
  if (normalized === "cancelado") return "cancelado";
  return "novo";
}

function businessStatusToCommerceStatus(status: ManagedBusinessStatus): "criado" | "aguardando_pagamento" | "pago" | "cancelado" {
  if (status === "cancelado") return "cancelado";
  if (["pago", "em_preparacao", "em_entrega", "entregue"].includes(status)) return "pago";
  if (status === "aguardando_pagamento") return "aguardando_pagamento";
  return "criado";
}

function buildPublicOrderNumber(value: unknown): string {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase();
}

function checkoutBaseUrl(req: any): string {
  const fromEnv = String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const protocol = req.headers["x-forwarded-proto"]
    ? String(req.headers["x-forwarded-proto"]).split(",")[0]
    : req.protocol;
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").trim();
  if (host) return `${protocol}://${host}`.replace(/\/+$/, "");
  return "http://localhost:5173";
}

function mapCommerceItemForPublic(item: Record<string, any>) {
  const metadata = parseJson<Record<string, any>>(item.metadata_json, {});
  const snapshot = metadata?.snapshot && typeof metadata.snapshot === "object" ? metadata.snapshot : {};
  const images = parseImageList(snapshot?.imagens || snapshot?.imagem || null);
  const image = String(snapshot?.imagem || "").trim() || images[0] || null;

  return {
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id || null,
    nome: item.nome,
    quantidade: Number(item.quantidade || 0),
    valor_unitario: Number(item.valor_unitario || 0),
    valor_total: Number(item.valor_total || 0),
    metadata: metadata || {},
    imagem: image,
    imagens: images,
    descricao: String(snapshot?.descricao || "").trim() || null,
    categoria: String(snapshot?.categoria || "").trim() || null,
  };
}

function mapManagedOrderForPublic(order: Record<string, any>, items: Array<Record<string, any>>, meta?: Record<string, any> | null) {
  const businessStatus = String(meta?.business_status || commerceStatusToBusinessStatus(order.status_pedido)).trim().toLowerCase();
  return {
    id: String(order.id || ""),
    order_number: buildPublicOrderNumber(order.id),
    status: businessStatusToStorefrontStatus(businessStatus),
    business_status: businessStatus || commerceStatusToBusinessStatus(order.status_pedido),
    total: Number(order.valor_total || 0),
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.desconto || 0),
    payment_method: order.forma_pagamento || null,
    payment_status: meta?.payment_status || null,
    delivery_status: meta?.delivery_status || null,
    delivery_token: order.delivery_token || null,
    delivery_token_expires_at: order.delivery_token_expires_at || null,
    tracking_url: order.route_link || order.tracking_url || null,
    estimated_delivery: order.estimated_delivery || null,
    delivery_address: meta?.notes || order.notes || null,
    courier_name: order.courier_name || null,
    courier_phone: order.courier_phone || null,
    customer_name: order.customer_name || null,
    customer_phone: order.customer_phone || null,
    customer_email: order.customer_email || null,
    created_at: order.created_at || order.data_criacao || null,
    updated_at: order.updated_at || order.data_pagamento || null,
    checkout_token: order.checkout_token || null,
    checkout_url: order.payment_link || null,
    items: items.map((item) => mapCommerceItemForPublic(item)),
  };
}

async function getOwnedStoreContext(userId: string, storeId: string, brandId?: string | null): Promise<OwnedStoreContext | null> {
  const normalizedBrandId = normalizeBrandId(brandId);
  return (
    (await queryOne<OwnedStoreContext>(
      `SELECT id, owner_user_id, brand_id, slug, name, status, primary_domain, settings_json
       FROM storefront_stores
       WHERE id = ?
         AND owner_user_id = ?
         ${normalizedBrandId ? "AND brand_id = ?" : "AND (brand_id = '' OR brand_id IS NULL)"}
       LIMIT 1`,
      normalizedBrandId ? [storeId, userId, normalizedBrandId] : [storeId, userId]
    )) || null
  );
}

async function upsertManagedOrderMeta(input: {
  orderId: string;
  userId: string;
  brandId: string | null;
  storeId: string;
  origin: "site" | "manual" | "whatsapp" | "api";
  businessStatus: ManagedBusinessStatus;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  deliveryStatus: string;
  notes?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO order_management_meta (
      order_id, user_id, brand_id, store_id, origin, channel, created_by,
      business_status, payment_status, delivery_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      brand_id = VALUES(brand_id),
      store_id = VALUES(store_id),
      origin = VALUES(origin),
      channel = VALUES(channel),
      business_status = VALUES(business_status),
      payment_status = VALUES(payment_status),
      delivery_status = VALUES(delivery_status),
      notes = COALESCE(VALUES(notes), notes),
      updated_at = CURRENT_TIMESTAMP`,
    [
      input.orderId,
      input.userId,
      input.brandId || null,
      input.storeId,
      input.origin,
      input.origin === "whatsapp" ? "WhatsApp" : input.origin === "manual" ? "Manual" : input.origin === "api" ? "API" : "Site",
      input.businessStatus,
      input.paymentStatus,
      input.deliveryStatus,
      input.notes || null,
    ]
  );
}

async function appendManagedTimeline(input: {
  orderId: string;
  userId: string;
  brandId: string | null;
  status: string;
  eventKey: string;
  actorType?: "system" | "admin" | "customer" | "automation";
  updatedBy?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO order_management_timeline (
      order_id, user_id, brand_id, status, event_key, actor_type, updated_by, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.orderId,
      input.userId,
      input.brandId || null,
      input.status,
      input.eventKey,
      input.actorType || "system",
      input.updatedBy || null,
      input.payload ? JSON.stringify(input.payload) : null,
    ]
  );
}

async function getManagedOrderBundleForStore(
  userId: string,
  storeId: string,
  orderId: string,
  brandId?: string | null
): Promise<{ order: Record<string, any>; meta: Record<string, any>; items: Array<Record<string, any>> } | null> {
  await ensureManagedDeliverySchema();
  const normalizedBrandId = normalizeBrandId(brandId);
  const row = await queryOne<Record<string, any>>(
    `SELECT o.*, m.store_id, m.business_status, m.payment_status, m.delivery_status, m.origin, m.channel, m.notes,
            ds.route_link, ds.estimated_delivery,
            (SELECT token FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token,
            (SELECT expires_at FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token_expires_at
     FROM commerce_orders o
     INNER JOIN order_management_meta m ON m.order_id = o.id
     LEFT JOIN order_dispatch_status ds ON ds.order_id = o.id
     WHERE o.id = ?
       AND o.user_id = ?
       AND m.store_id = ?
       ${normalizedBrandId ? "AND m.brand_id = ?" : "AND (m.brand_id IS NULL OR m.brand_id = '')"}
     LIMIT 1`,
    normalizedBrandId ? [orderId, userId, storeId, normalizedBrandId] : [orderId, userId, storeId]
  );
  if (!row) return null;

  const items = await query<Array<Record<string, any>>>(
    `SELECT * FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );

  return {
    order: row,
    meta: row,
    items: items || [],
  };
}

async function listManagedOrdersForStore(
  userId: string,
  storeId: string,
  filters: { status?: string; limit?: number; offset?: number },
  brandId?: string | null
): Promise<any[]> {
  await ensureManagedDeliverySchema();
  const normalizedBrandId = normalizeBrandId(brandId);
  const where: string[] = ["o.user_id = ?", "m.store_id = ?"];
  const params: any[] = [userId, storeId];

  if (normalizedBrandId) {
    where.push("m.brand_id = ?");
    params.push(normalizedBrandId);
  } else {
    where.push("(m.brand_id IS NULL OR m.brand_id = '')");
  }

  if (filters.status) {
    where.push("m.business_status = ?");
    params.push(storefrontStatusToBusinessStatus(filters.status));
  }

  const limit = Math.max(1, Math.min(Number(filters.limit || 50), 200));
  const offset = Math.max(0, Number(filters.offset || 0));
  const rows = await query<Array<Record<string, any>>>(
    `SELECT o.*, m.store_id, m.business_status, m.payment_status, m.delivery_status, m.origin, m.channel, m.notes,
            ds.route_link, ds.estimated_delivery,
            (SELECT token FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token,
            (SELECT expires_at FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token_expires_at
     FROM commerce_orders o
     INNER JOIN order_management_meta m ON m.order_id = o.id
     LEFT JOIN order_dispatch_status ds ON ds.order_id = o.id
     WHERE ${where.join(" AND ")}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const orderIds = (rows || []).map((row) => String(row.id || "")).filter(Boolean);
  const itemsByOrderId = new Map<string, Array<Record<string, any>>>();
  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => "?").join(",");
    const itemRows = await query<Array<Record<string, any>>>(
      `SELECT * FROM commerce_order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
      orderIds
    );
    for (const item of itemRows || []) {
      const key = String(item.order_id || "");
      const list = itemsByOrderId.get(key) || [];
      list.push(item);
      itemsByOrderId.set(key, list);
    }
  }

  return (rows || []).map((row) => mapManagedOrderForPublic(row, itemsByOrderId.get(String(row.id || "")) || [], row));
}

async function listManagedTimelineForStore(
  userId: string,
  storeId: string,
  orderId: string,
  brandId?: string | null
): Promise<any[] | null> {
  const bundle = await getManagedOrderBundleForStore(userId, storeId, orderId, brandId);
  if (!bundle) return null;

  const rows = await query<Array<Record<string, any>>>(
    `SELECT status, event_key, actor_type, updated_by, payload_json, timestamp
     FROM order_management_timeline
     WHERE order_id = ?
     ORDER BY timestamp ASC`,
    [orderId]
  );

  return (rows || []).map((row) => ({
    event_type: row.event_key || row.status,
    status_before: null,
    status_after: ["novo", "aguardando_pagamento", "pago", "em_preparacao", "em_entrega", "entregue", "cancelado"].includes(String(row.status || ""))
      ? businessStatusToStorefrontStatus(row.status)
      : null,
    actor_type: row.actor_type,
    actor_name: row.updated_by || null,
    payload: parseJson(row.payload_json, {}),
    created_at: row.timestamp,
  }));
}

async function transitionManagedStoreOrder(input: {
  userId: string;
  store: OwnedStoreContext;
  orderId: string;
  brandId: string | null;
  nextBusinessStatus: ManagedBusinessStatus;
  actorName?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  reason?: string | null;
  delivery?: {
    courierName?: string | null;
    courierPhone?: string | null;
    etaMinutes?: number;
    deliveryAddress?: string | null;
  };
}) {
  const managed = await getManagedOrderBundleForStore(input.userId, input.store.id, input.orderId, input.brandId);
  if (!managed) return null;

  const previousBusinessStatus = String(managed.meta?.business_status || commerceStatusToBusinessStatus(managed.order?.status_pedido));
  const updated = await commerceService.updateOrderStatus(input.userId, input.brandId, input.orderId, {
    status_pedido: businessStatusToCommerceStatus(input.nextBusinessStatus),
    forma_pagamento: input.paymentMethod || undefined,
    data_pagamento: input.paidAt,
  });
  if (!updated) return null;

  const lifecycle = deriveManagedLifecycle(input.nextBusinessStatus);
  const preservedNotes = String(managed.meta?.notes || "").trim() || null;
  let deliveryArtifacts: Awaited<ReturnType<typeof createManagedDeliveryArtifacts>> | null = null;
  if (input.nextBusinessStatus === "em_entrega") {
    deliveryArtifacts = await createManagedDeliveryArtifacts({
      store: input.store,
      userId: input.userId,
      brandId: input.brandId,
      orderId: input.orderId,
      orderNumber: buildPublicOrderNumber(updated.order.id),
      etaMinutes: input.delivery?.etaMinutes,
      courierName: input.delivery?.courierName,
      courierPhone: input.delivery?.courierPhone,
      deliveryAddress: input.delivery?.deliveryAddress || preservedNotes,
    });
  }

  /* Lead Capture Mob — prefer public tracking URL when module is enabled */
  let mobTrackingUrl: string | null = null;
  try {
    const { syncMobDeliveryFromOrderStatus } = await import("../services/mobOrderBridge");
    const mob = await syncMobDeliveryFromOrderStatus({
      ownerUserId: input.userId,
      brandId: input.brandId,
      orderId: input.orderId,
      businessStatus: input.nextBusinessStatus,
      customerName: updated.order.customer_name,
      customerPhone: updated.order.customer_phone,
      customerEmail: updated.order.customer_email,
      productsTotal: Number(updated.order.valor_total || 0),
      paymentMethod: input.paymentMethod || updated.order.forma_pagamento,
      deliveryAddress: input.delivery?.deliveryAddress || preservedNotes,
    });
    mobTrackingUrl = mob.tracking_url;
    if (mobTrackingUrl && deliveryArtifacts) {
      deliveryArtifacts = {
        ...deliveryArtifacts,
        routeUrl: mobTrackingUrl,
      };
    } else if (mobTrackingUrl && !deliveryArtifacts) {
      deliveryArtifacts = {
        token: mob.delivery?.tracking_token || "",
        confirmUrl: mobTrackingUrl,
        routeUrl: mobTrackingUrl,
        etaMinutes: mob.delivery?.eta_minutes || 40,
        courierName: input.delivery?.courierName || null,
        courierPhone: input.delivery?.courierPhone || null,
      };
    }
  } catch {
    /* non-blocking */
  }

  await upsertManagedOrderMeta({
    orderId: input.orderId,
    userId: input.userId,
    brandId: input.brandId,
    storeId: input.store.id,
    origin: "site",
    businessStatus: input.nextBusinessStatus,
    paymentStatus: lifecycle.paymentStatus,
    deliveryStatus: lifecycle.deliveryStatus,
    notes: preservedNotes,
  });

  const timelinePayload: Record<string, unknown> = {
    payment_method: input.paymentMethod || updated.order.forma_pagamento || null,
  };
  if (input.reason) timelinePayload.reason = input.reason;
  if (deliveryArtifacts) {
    timelinePayload.delivery_token = deliveryArtifacts.token;
    timelinePayload.confirm_url = deliveryArtifacts.confirmUrl;
    timelinePayload.route_url = deliveryArtifacts.routeUrl;
    timelinePayload.eta_minutes = deliveryArtifacts.etaMinutes;
    timelinePayload.courier_name = deliveryArtifacts.courierName;
    timelinePayload.courier_phone = deliveryArtifacts.courierPhone;
  }
  if (mobTrackingUrl) {
    timelinePayload.mob_tracking_url = mobTrackingUrl;
  }

  await appendManagedTimeline({
    orderId: input.orderId,
    userId: input.userId,
    brandId: input.brandId,
    status: input.nextBusinessStatus,
    eventKey: input.nextBusinessStatus === "entregue" ? "delivery.confirmed" : "order.status_changed",
    actorType: input.actorName ? "admin" : "system",
    updatedBy: input.actorName || input.userId,
    payload: timelinePayload,
  });

  const omsEventMap: Record<string, "order.paid" | "order.preparing" | "order.shipped" | "order.delivered" | "order.cancelled"> = {
    pago: "order.paid",
    em_preparacao: "order.preparing",
    em_entrega: "order.shipped",
    entregue: "order.delivered",
    cancelado: "order.cancelled",
  };
  const omsEvent = omsEventMap[input.nextBusinessStatus];
  if (omsEvent) {
    const vars = omsService.buildOrderVariables(
      { ...updated.order, items: updated.items, order_number: buildPublicOrderNumber(updated.order.id) },
      {
        cancel_reason: input.reason,
        delivery_token: deliveryArtifacts?.token || (managed.order as any)?.delivery_token || "",
        tracking_url: deliveryArtifacts?.routeUrl || (managed.order as any)?.route_link || "",
        estimated_delivery: deliveryArtifacts ? `${deliveryArtifacts.etaMinutes} minutos` : (managed.order as any)?.estimated_delivery || "40 minutos",
        courier_name: deliveryArtifacts?.courierName || input.delivery?.courierName || "",
        courier_phone: deliveryArtifacts?.courierPhone || input.delivery?.courierPhone || "",
        delivery_address: input.delivery?.deliveryAddress || preservedNotes || "",
        confirmed_by: input.actorName || "",
        confirmed_via: input.nextBusinessStatus === "entregue" ? "admin" : "",
      }
    );
    await omsService.processOrderEvent({ userId: input.userId, brandId: input.brandId, orderId: input.orderId, event: omsEvent, variables: vars }).catch(() => undefined);
  }

  const statusItems = (updated.items || [])
    .map((item: any) => ({ product_id: String(item.product_id || ""), quantity: Number(item.quantidade || item.quantity || 1) }))
    .filter((item: any) => item.product_id);
  const previousWasPaidLike = ["pago", "em_preparacao", "em_entrega", "entregue"].includes(previousBusinessStatus);
  if (input.nextBusinessStatus === "pago" && !previousWasPaidLike) {
    await inventoryService.handleOrderPaid(input.userId, input.brandId, input.orderId, statusItems).catch(() => undefined);
  } else if (input.nextBusinessStatus === "cancelado" && previousBusinessStatus !== "cancelado") {
    await inventoryService.handleOrderCancelled(input.userId, input.brandId, input.orderId, statusItems).catch(() => undefined);
  }

  try {
    const { AffiliatesService } = await import("../services/affiliates");
    await new AffiliatesService().syncOrderCommissionStatus(input.orderId, input.nextBusinessStatus);
  } catch { /* ignore affiliate sync errors */ }

  const refreshed = await getManagedOrderBundleForStore(input.userId, input.store.id, input.orderId, input.brandId);
  return {
    order: mapManagedOrderForPublic(
      refreshed?.order || updated.order,
      refreshed?.items || updated.items,
      refreshed?.meta || {
        business_status: input.nextBusinessStatus,
        payment_status: lifecycle.paymentStatus,
        delivery_status: lifecycle.deliveryStatus,
        notes: preservedNotes,
      }
    ),
    delivery: deliveryArtifacts,
  };
}

async function confirmManagedDeliveryByToken(tokenInput: string, actorName?: string) {
  await ensureManagedDeliverySchema();
  const token = String(tokenInput || "").trim().toUpperCase();
  if (!token) throw new Error("delivery token is required");

  const tokenRow = await queryOne<any>(
    `SELECT id, order_id, store_id, token, expires_at, used_at
     FROM storefront_delivery_tokens
     WHERE token = ?
     LIMIT 1`,
    [token]
  );
  if (!tokenRow) return null;

  const orderRow = await queryOne<any>(
    `SELECT o.*, m.store_id, m.business_status, m.payment_status, m.delivery_status, m.notes,
            ds.route_link, ds.estimated_delivery
     FROM commerce_orders o
     INNER JOIN order_management_meta m ON m.order_id = o.id
     LEFT JOIN order_dispatch_status ds ON ds.order_id = o.id
     WHERE o.id = ? AND m.store_id = ?
     LIMIT 1`,
    [String(tokenRow.order_id), String(tokenRow.store_id)]
  );
  if (!orderRow) return null;

  const items = await query<any[]>(`SELECT * FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`, [String(orderRow.id)]);
  if (tokenRow.expires_at && !tokenRow.used_at) {
    const expires = new Date(tokenRow.expires_at);
    if (Number.isFinite(expires.getTime()) && expires.getTime() < Date.now()) {
      throw new Error("Delivery token expired");
    }
  }

  if (tokenRow.used_at || String(orderRow.business_status || "") === "entregue") {
    return { order: mapManagedOrderForPublic(orderRow, items, orderRow), already_confirmed: true };
  }

  await query(
    `UPDATE storefront_delivery_tokens
     SET used_at = NOW(), used_via = 'token', used_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [actorName || "token_validation", String(tokenRow.id)]
  );

  const store = await queryOne<OwnedStoreContext>(
    `SELECT id, owner_user_id, brand_id, slug, name, status, primary_domain, settings_json
     FROM storefront_stores
     WHERE id = ?
     LIMIT 1`,
    [String(tokenRow.store_id)]
  );
  if (!store) throw new Error("Store not found");

  const transitioned = await transitionManagedStoreOrder({
    userId: String(orderRow.user_id),
    store,
    orderId: String(orderRow.id),
    brandId: normalizeBrandId(orderRow.brand_id),
    nextBusinessStatus: "entregue",
    actorName: actorName || "cliente",
    delivery: {
      deliveryAddress: String(orderRow.notes || "").trim() || null,
    },
  });
  if (!transitioned) throw new Error("Order not found");

  await query(
    `UPDATE order_dispatch_status
     SET logistic_status = 'entregue', updated_at = CURRENT_TIMESTAMP
     WHERE order_id = ?`,
    [String(orderRow.id)]
  ).catch(() => undefined);

  return { order: transitioned.order, already_confirmed: false };
}

async function generatePageWithAi(input: {
  prompt?: string;
  store: Record<string, any>;
  template?: Record<string, any> | null;
  brandProfile?: Record<string, any> | null;
  products: Array<Record<string, any>>;
  pages: Array<Record<string, any>>;
  selectedProduct?: Record<string, any> | null;
  composer: Record<string, any>;
}): Promise<{ title: string; slug: string; page_type: string; sections: any[]; seo: Record<string, any> }> {
  const pageKind = String(input.composer?.page_kind || "custom_landing").trim();
  const language = String(input.composer?.language || "pt-BR").trim() || "pt-BR";
  const sectionCount = Math.max(4, Math.min(Number(input.composer?.section_count || 8), 14));
  const fallbackTitle = pageKind === "home" ? "Pagina Inicial" : pageKind === "product_landing" ? "Landing de Produto" : "Pagina IA";
  const productImages = parseJson<string[]>(
    input.selectedProduct?.images || input.selectedProduct?.images_json,
    []
  ).slice(0, 6);
  const productVariants = parseJson<any[]>(input.selectedProduct?.variants_json, []);
  const productMetadata = parseJson<Record<string, any>>(input.selectedProduct?.metadata_json, {});
  const keywords = Array.isArray(input.composer?.keywords)
    ? input.composer.keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean)
    : [];

  const contextBlock = {
    store: {
      id: input.store.id,
      slug: input.store.slug,
      name: input.store.name,
      template_id: input.store.template_id,
      brand: input.store.brand || {},
      theme: input.store.theme || {},
    },
    template_base: {
      template_id: String(input.template?.template_id || input.store.template_id || "modern_minimal"),
      name: String(input.template?.name || ""),
      description: String(input.template?.description || ""),
      sections: Array.isArray(input.template?.sections) ? input.template?.sections : [],
      style: input.template?.style || {},
    },
    brand_profile: input.brandProfile || {},
    composer: {
      page_kind: pageKind,
      goal: input.composer?.goal || "",
      audience: input.composer?.audience || "",
      tone: input.composer?.tone || "conversacional",
      section_count: sectionCount,
      include_faq: input.composer?.include_faq !== false,
      include_testimonials: input.composer?.include_testimonials !== false,
      include_cta: input.composer?.include_cta !== false,
      language,
      keywords,
    },
    selected_product: input.selectedProduct
      ? {
          id: input.selectedProduct.id,
          slug: input.selectedProduct.slug,
          name: input.selectedProduct.name,
          description: input.selectedProduct.description,
          price: input.selectedProduct.price,
          category: input.selectedProduct.category,
          images: productImages,
          variants: productVariants,
          metadata: productMetadata,
        }
      : null,
    catalog_snapshot: input.products.slice(0, 24).map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      category: item.category || "",
      price: item.price,
      image: parseJson<string[]>(item.images_json, [])[0] || null,
    })),
    existing_pages: input.pages.map((item) => ({
      slug: item.slug,
      title: item.title,
      page_type: item.page_type,
    })),
    user_prompt: String(input.prompt || "").trim(),
  };

  const prompt = [
    "You are a senior ecommerce page composer for a multi-tenant storefront SaaS.",
    "Return ONLY valid JSON, no markdown, no explanation.",
    "Output schema:",
    '{"title":"string","slug":"string","page_type":"home|about|products|custom|ai_generated","seo":{"title":"string","description":"string","keywords":["..."]},"sections":[{"id":"sec-1","type":"hero|benefits|features|comparison|proof|gallery|products_grid|faq|cta|footer","content":{},"media":{"image_url":"optional","gallery":["optional"]}}]}',
    "Rules:",
    "- Maintain visual and content coherence with template_base (sections + style)",
    "- Language must follow composer.language",
    "- Sections must be highly specific and conversion-focused",
    "- If selected_product exists and page_kind is product_landing, entire narrative must be centered on this product",
    "- Reuse selected_product.images and catalog images when media is needed",
    "- If page_kind is home, include MINIMUM sections in this order: hero, categories, products_grid, newsletter, cta, footer",
    "- For categories, infer from catalog categories and include counts",
    "- For newsletter, include title, subtitle, cta_label and placeholder",
    "- Keep CTA explicit and practical",
    "- Keep JSON parseable",
    `Context JSON: ${JSON.stringify(contextBlock)}`,
  ].join("\n");

  try {
    const parsed = await aiRouter.generateJson<any>(
      prompt,
      {
        userId: String(input.store?.owner_user_id || input.store?.user_id || "").trim() || undefined,
        brandId: String(input.store?.brand_id || "").trim() || undefined,
      },
      { functionKey: "text.storefront.compose" },
    );

    const title = String(parsed?.title || fallbackTitle).trim() || fallbackTitle;
    const slug = String(parsed?.slug || "pagina-ia").trim() || "pagina-ia";
    const pageType = String(parsed?.page_type || "ai_generated").trim() || "ai_generated";
    const seo = parsed?.seo && typeof parsed.seo === "object" ? parsed.seo : {};
    const sections = Array.isArray(parsed?.sections) && parsed.sections.length > 0 ? parsed.sections : [];

    if (sections.length === 0) {
      sections.push({
        id: "sec-hero",
        type: "hero",
        content: {
          headline: input.selectedProduct?.name
            ? `Conheca ${input.selectedProduct.name}`
            : String(input.prompt || "Pagina IA"),
          subheadline: "Conteudo inicial para sua pagina.",
          cta: "Comprar agora",
        },
        media: {
          image_url: productImages[0] || null,
          gallery: productImages,
        },
      });
    }

    if (pageKind === "home") {
      const existingTypes = new Set(sections.map((section: any) => String(section?.type || "").trim().toLowerCase()));
      const categoryCountMap = new Map<string, number>();
      for (const product of input.products || []) {
        const category = String(product?.category || "").trim();
        if (!category) continue;
        categoryCountMap.set(category, (categoryCountMap.get(category) || 0) + 1);
      }

      if (!existingTypes.has("categories")) {
        sections.push({
          id: "sec-categories",
          type: "categories",
          content: {
            title: "Compre por categorias",
            items: Array.from(categoryCountMap.entries()).slice(0, 8).map(([name, count]) => ({ name, count })),
          },
        });
      }

      if (!existingTypes.has("newsletter")) {
        sections.push({
          id: "sec-newsletter",
          type: "newsletter",
          content: {
            title: "Entre para o nosso círculo VIP",
            subtitle: "Receba novidades, ofertas e lançamentos em primeira mão.",
            cta_label: "Quero receber",
            placeholder: "Seu melhor e-mail",
          },
        });
      }

      if (!existingTypes.has("footer")) {
        sections.push({
          id: "sec-footer",
          type: "footer",
          content: {
            brand_name: String((input.store?.brand || {}).name || input.store?.name || "Sua Marca"),
            links: ["Produtos", "Contato", "Suporte", "Política de Privacidade"],
          },
        });
      }
    }

    return { title, slug, page_type: pageType, sections, seo };
  } catch {
    return {
      title: fallbackTitle,
      slug: "pagina-ia",
      page_type: "ai_generated",
      seo: {
        title: fallbackTitle,
        description: "Pagina gerada com fallback quando a resposta da IA nao veio em JSON valido.",
        keywords,
      },
      sections: [
        {
          id: "sec-hero",
          type: "hero",
          content: {
            headline: input.selectedProduct?.name
              ? `Conheca ${input.selectedProduct.name}`
              : String(input.prompt || "Pagina IA"),
            subheadline: "Nao foi possivel processar JSON da IA, mas a estrutura base foi criada.",
            cta: "Comprar agora",
          },
          media: {
            image_url: productImages[0] || null,
            gallery: productImages,
          },
        },
      ],
    };
  }
}

router.get("/templates", async (_req, res) => {
  try {
    const templates = await storefront.listTemplates();
    res.json({ success: true, templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list templates" });
  }
});

router.get("/stores", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const stores = await storefront.listStores(userId, req.brandId);
    res.json({ success: true, stores });
  } catch (error: any) {
    const status = error.message === "Unauthorized" ? 401 : 500;
    res.status(status).json({ error: error.message || "Failed to list stores" });
  }
});

router.post("/stores", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const store = await storefront.createStore(userId, req.body || {}, req.brandId);
    res.status(201).json({ success: true, store });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    res.status(badRequest ? 400 : 500).json({ error: error.message || "Failed to create store" });
  }
});

router.get("/stores/:storeId", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const bundle = await storefront.exportStoreAdminBundle(userId, String(req.params.storeId), req.brandId);
    if (!bundle) return res.status(404).json({ error: "Store not found" });
    res.json({ success: true, ...bundle });
  } catch (error: any) {
    const status = error.message === "Unauthorized" ? 401 : 500;
    res.status(status).json({ error: error.message || "Failed to load store" });
  }
});

router.patch("/stores/:storeId", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const store = await storefront.updateStore(userId, String(req.params.storeId), req.body || {}, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    if (store?.slug) invalidateCatalogCacheBySlug(String(store.slug));
    res.json({ success: true, store });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    res.status(badRequest ? 400 : 500).json({ error: error.message || "Failed to update store" });
  }
});

router.get("/stores/:storeId/domains", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const domains = await storefront.listDomains(userId, String(req.params.storeId), req.brandId);
    res.json({ success: true, domains });
  } catch (error: any) {
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to list domains" });
  }
});

router.get("/domain-commerce/status", (_req: BrandRequest, res) => {
  res.json({ success: true, ...domainRegistrar.status() });
});

router.post("/domain-commerce/search", async (req: BrandRequest, res) => {
  try {
    const queryText = String(req.body?.query || "").trim().toLowerCase();
    if (!queryText) return res.status(400).json({ error: "Digite um nome para pesquisar" });
    const hasExtension = queryText.includes(".");
    const domains = hasExtension
      ? [queryText]
      : [".com", ".online", ".shop", ".store", ".site"].map((extension) => `${queryText}${extension}`);
    const results = await domainRegistrar.check(domains);
    res.json({ success: true, results });
  } catch (e: any) {
    const status = domainRegistrar.status();
    res.status(status.search_enabled ? 502 : 503).json({
      error: e?.message || "Não foi possível pesquisar agora",
      code: status.search_enabled ? "REGISTRAR_ERROR" : "REGISTRAR_SETUP_REQUIRED",
      registrar: status,
    });
  }
});

router.post("/stores/:storeId/domains/register", async (req: BrandRequest, res) => {
  try {
    const userId = String(req.userId || "");
    const domain = String(req.body?.domain || "").trim().toLowerCase();
    const confirmation = String(req.body?.confirmation || "").trim().toLowerCase();
    if (!domain || confirmation !== domain) {
      return res.status(400).json({ error: "Confirme digitando exatamente o domínio escolhido" });
    }
    const registered = await domainRegistrar.register(domain);
    const saved = await storefront.upsertDomain(
      userId,
      String(req.params.storeId),
      registered.domain,
      true,
      req.brandId,
    );
    res.status(202).json({
      success: true,
      domain: saved,
      registration: registered.registration,
      message: "Registro iniciado. A instalação será acompanhada automaticamente.",
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Não foi possível registrar o domínio" });
  }
});

router.post("/stores/:storeId/domains", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const domain = await storefront.upsertDomain(
      userId,
      String(req.params.storeId),
      String(req.body?.domain || ""),
      req.body?.is_primary !== false,
      req.brandId
    );
    res.status(201).json({ success: true, domain });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("linked");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to save domain" });
  }
});

router.patch("/stores/:storeId/domains/:domain/primary", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const domain = await storefront.setPrimaryDomain(
      userId,
      String(req.params.storeId),
      String(req.params.domain || ""),
      req.brandId
    );
    res.json({ success: true, domain });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to update primary domain" });
  }
});

router.delete("/stores/:storeId/domains/:domain", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const removed = await storefront.deleteDomain(
      userId,
      String(req.params.storeId),
      String(req.params.domain || ""),
      req.brandId
    );
    res.json({ success: true, removed });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to remove domain" });
  }
});

router.get("/stores/:storeId/domains/:domain/instructions", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const instructions = await storefront.getDomainInstructions(
      userId,
      String(req.params.storeId),
      String(req.params.domain || ""),
      requestPublicHost(req),
      req.brandId
    );
    res.json({ success: true, instructions });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to load domain instructions" });
  }
});

router.post("/stores/:storeId/domains/:domain/verify", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const rawDomain = String(req.params.domain || "");
    const result = await storefront.verifyDomainOwnership(
      userId,
      String(req.params.storeId),
      rawDomain,
      requestPublicHost(req),
      req.brandId
    );

    /* Auto-provision: if TXT verified AND DNS already points to this server,
     * provision the Caddy block + reload + flip status to "active" all in
     * one go. The user clicks Verify once and it's done. If the A record
     * isn't pointing yet, we leave the row at "verified" — the next Verify
     * click (or the boot reconcile) will provision it. */
    let provisioned = false;
    let provisionSteps: string[] | undefined;
    if (result.verified && (result as any).checks?.a_points_to_server) {
      try {
        provisionSteps = await provisionDomainNginx(rawDomain);
        provisioned = true;
        (result as any).verification_status = "active";
        logger.info(`Domain auto-provisioned via /verify: ${rawDomain} (${provisionSteps.join(", ")})`);
      } catch (err: any) {
        logger.error(`Auto-provision failed for ${rawDomain}: ${err?.message || err}`);
      }
    }

    res.json({ success: true, ...result, provisioned, provision_steps: provisionSteps });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to verify domain" });
  }
});

/* Domain auto-provisioning (nginx + certbot)
 *
 * Why nginx instead of Caddy? The host already runs an nginx serving 4 other
 * sites (aktien-news, tattooai, kronosdigitalmkt, topp-api), and there's a
 * working certbot install with auto-renewal via systemd timer. Trying to
 * front Caddy on top of that fights for ports 80/443 and is fragile —
 * nginx + certbot is what the rest of the box already does.
 *
 * The flow:
 *   1. User adds domain → row inserted with status="pending"
 *   2. User points DNS at our IP, clicks Verify → if TXT matches and DNS
 *      points to our IP, we run provisionDomainNginx() automatically.
 *   3. provisionDomainNginx writes /etc/nginx/sites-available/lc-tenant-X.conf
 *      (HTTP-only block), symlinks into sites-enabled, nginx reloads, then
 *      certbot --nginx adds the SSL block + emits the Let's Encrypt cert.
 *   4. On boot, reconcileNginxForVerifiedDomains() picks up any verified
 *      rows that don't have a matching nginx config and provisions them.
 *
 * The certbot systemd timer (`certbot.timer`, already active) handles
 * renewals every 12 hours — certs are 90 days, get auto-renewed at 30 days
 * remaining. No code change needed for renewal.
 */

const NGINX_AVAILABLE_DIR = "/etc/nginx/sites-available";
const NGINX_ENABLED_DIR = "/etc/nginx/sites-enabled";
const CERTBOT_EMAIL = process.env.CERTBOT_EMAIL || "admin@leadcapture.online";
/* Prefix that uniquely tags configs we manage. Anything in sites-available
 * that doesn't start with this prefix is left alone. */
const TENANT_CONFIG_PREFIX = "lc-tenant-";

function isValidDomainName(d: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 253;
}

function execPromise(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 180_000 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** File-safe slug from a domain — used to build the config filename. */
function configBaseName(domain: string): string {
  const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
  return `${TENANT_CONFIG_PREFIX}${apex.replace(/[^a-z0-9.-]/g, "-")}`;
}

function buildHttpOnlyNginxConfig(domain: string): string {
  const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
  /* Single server block listening on 80 for both apex and www. certbot will
   * later add the SSL counterparts inline. The proxy_pass target matches the
   * other LeadCapture nginx blocks (Express on 127.0.0.1:3001). */
  return `# AUTO-GENERATED by LeadCapture — do not edit by hand
# Domain: ${apex}
server {
    listen 80;
    listen [::]:80;
    server_name ${apex} www.${apex};
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
`;
}

/**
 * Write the HTTP-only nginx config and symlink it into sites-enabled.
 * Idempotent: re-running just overwrites the file.
 */
async function writeNginxConfig(domain: string): Promise<"created" | "updated"> {
  const base = configBaseName(domain);
  const availPath = `${NGINX_AVAILABLE_DIR}/${base}.conf`;
  const enabledPath = `${NGINX_ENABLED_DIR}/${base}.conf`;
  const content = buildHttpOnlyNginxConfig(domain);

  /* Detect whether the symlink already exists so we report create vs update. */
  let existed = false;
  try {
    await execPromise(`sudo test -L ${shellQuote(enabledPath)}`);
    existed = true;
  } catch {}

  /* Use a temp file we own (the node user) and sudo cp it into place. Avoids
   * needing tee or shell redirection inside sudo. */
  const tmp = path.join("/tmp", `${base}.tmp`);
  writeFileSync(tmp, content, "utf-8");
  try {
    await execPromise(`sudo cp ${shellQuote(tmp)} ${shellQuote(availPath)}`);
    await execPromise(`sudo ln -sf ${shellQuote(availPath)} ${shellQuote(enabledPath)}`);
  } finally {
    await execPromise(`rm -f ${shellQuote(tmp)}`).catch(() => undefined);
  }
  return existed ? "updated" : "created";
}

async function nginxValidateAndReload(): Promise<void> {
  await execPromise(`sudo nginx -t`);
  await execPromise(`sudo systemctl reload nginx`);
}

/**
 * Issue (or load) a Let's Encrypt cert for {domain, www.domain} and inject
 * the SSL server block into our config. certbot --nginx is idempotent — if
 * the cert already exists and is valid, it just deploys it.
 */
async function runCertbot(domain: string): Promise<void> {
  const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
  /* `--reinstall` is critical: when our HTTP-only config gets re-written by
   * the reconciler, the cert may still be valid from a previous run. Without
   * --reinstall, certbot sees a valid cert and skips the nginx mutation step
   * — leaving the config without a `listen 443 ssl` block, so the domain
   * silently falls back to the wrong default cert on port 443. */
  const cmd = [
    "sudo certbot --nginx",
    "--non-interactive",
    "--agree-tos",
    "--redirect",
    "--reinstall",
    `-m ${shellQuote(CERTBOT_EMAIL)}`,
    `-d ${shellQuote(apex)}`,
    `-d ${shellQuote("www." + apex)}`,
  ].join(" ");
  await execPromise(cmd);
}

/**
 * Full end-to-end provision for one domain. Returns a step log so callers
 * can surface progress in the UI / logs.
 */
export async function provisionDomainNginx(domain: string): Promise<string[]> {
  const steps: string[] = [];
  const action = await writeNginxConfig(domain);
  steps.push(`nginx config ${action}`);
  await nginxValidateAndReload();
  steps.push("nginx reloaded");
  try {
    await runCertbot(domain);
    steps.push("certbot ok");
  } catch (err: any) {
    /* Certbot failures shouldn't roll back the http config — the user can
     * retry once DNS settles. We do still mark the domain as "verified" but
     * not "active" so the UI shows a clear "TLS pending" state. */
    steps.push(`certbot FAILED: ${err?.message || err}`);
    throw err;
  }
  await query(
    `UPDATE storefront_domains SET verification_status = 'active', updated_at = NOW() WHERE domain = ?`,
    [domain]
  );
  steps.push("status=active");
  return steps;
}

/**
 * Boot-time reconciler: every domain marked verified/active in the DB needs
 * a matching nginx config in sites-enabled. Anything missing gets re-
 * provisioned. Covers manual DB edits, restored backups, fresh boxes, etc.
 */
export async function reconcileNginxForVerifiedDomains(): Promise<void> {
  try {
    const rows = (await query<any>(
      `SELECT domain, verification_status FROM storefront_domains
       WHERE verification_status IN ('verified', 'active')
       ORDER BY created_at ASC`
    )) as Array<{ domain: string; verification_status: string }>;
    if (!rows?.length) return;

    /* List enabled tenant configs in one ls. */
    let enabledList = "";
    try {
      const { stdout } = await execPromise(`sudo ls ${shellQuote(NGINX_ENABLED_DIR)}`);
      enabledList = stdout;
    } catch (err: any) {
      logger.warn(`nginx reconcile skipped — could not list enabled dir: ${err?.message || err}`);
      return;
    }

    const missing: string[] = [];
    for (const row of rows) {
      const base = configBaseName(row.domain);
      if (!enabledList.includes(`${base}.conf`)) missing.push(row.domain);
    }
    if (!missing.length) {
      logger.info(`nginx reconcile: all ${rows.length} verified domain(s) already provisioned`);
      return;
    }

    logger.info(`nginx reconcile: provisioning ${missing.length} missing domain(s): ${missing.join(", ")}`);
    for (const d of missing) {
      try {
        const steps = await provisionDomainNginx(d);
        logger.info(`nginx reconcile: ${d} OK (${steps.join(", ")})`);
      } catch (err: any) {
        logger.error(`nginx reconcile: ${d} FAILED — ${err?.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error(`nginx reconcile error: ${err?.message || err}`);
  }
}

/* Backward-compat aliases — older code (and the index.ts boot hook) still
 * imports the Caddy-named functions. These keep that import path working. */
export const provisionDomainInCaddy = provisionDomainNginx;
export const reconcileCaddyForVerifiedDomains = reconcileNginxForVerifiedDomains;

router.post("/stores/:storeId/domains/:domain/provision", async (req: BrandRequest, res) => {
  const storeId = String(req.params.storeId || "").trim();
  const rawDomain = String(req.params.domain || "").toLowerCase().trim();
  try {
    requireUserId(req);
    if (!isValidDomainName(rawDomain)) {
      return res.status(400).json({ error: "Invalid domain name" });
    }
    const domainRow = await queryOne<{ id: string }>(
      `SELECT d.id FROM storefront_domains d WHERE d.domain = ? AND d.store_id = ?`,
      [rawDomain, storeId]
    );
    if (!domainRow) {
      return res.status(404).json({ error: "Domain not registered for this store" });
    }
    const steps = await provisionDomainNginx(rawDomain);
    logger.info(`Domain provisioned via /provision: ${rawDomain} (${steps.join(", ")})`);
    res.json({ success: true, domain: rawDomain, steps });
  } catch (error: any) {
    logger.error(`Domain provision failed for ${rawDomain}: ${error.message || error}`);
    res.status(500).json({ error: error.message || "Failed to provision domain" });
  }
});

router.get("/stores/:storeId/products", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const products = await storefront.listProducts(userId, String(req.params.storeId), req.brandId);
    res.json({ success: true, products });
  } catch (error: any) {
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to list products" });
  }
});

router.post("/stores/:storeId/products", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const product = await storefront.upsertProduct(userId, String(req.params.storeId), req.body || {}, req.brandId);
    res.status(201).json({ success: true, product });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to save product" });
  }
});

router.patch("/stores/:storeId/products/:productId", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const product = await storefront.upsertProduct(userId, String(req.params.storeId), {
      ...(req.body || {}),
      product_id: req.params.productId,
    }, req.brandId);
    res.json({ success: true, product });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to update product" });
  }
});

router.get("/stores/:storeId/pages", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const pages = await storefront.listPages(userId, String(req.params.storeId), req.brandId);
    res.json({ success: true, pages });
  } catch (error: any) {
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to list pages" });
  }
});

router.post("/stores/:storeId/pages", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const page = await storefront.upsertPage(userId, String(req.params.storeId), req.body || {}, req.brandId);
    res.status(201).json({ success: true, page });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to save page" });
  }
});

router.patch("/stores/:storeId/pages/:pageId", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const page = await storefront.upsertPage(userId, String(req.params.storeId), {
      ...(req.body || {}),
      page_id: req.params.pageId,
    }, req.brandId);
    res.json({ success: true, page });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("required") || String(error.message || "").includes("invalid") || String(error.message || "").includes("in use") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to update page" });
  }
});

router.post("/stores/:storeId/ai/pages", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const bundle = await storefront.exportStoreAdminBundle(userId, storeId, req.brandId);
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const prompt = String(req.body?.prompt || "").trim();
    const pageKind = String(req.body?.page_kind || "custom_landing").trim().toLowerCase();
    const selectedProductId = String(req.body?.product_id || "").trim();
    const selectedProduct =
      pageKind === "product_landing"
        ? (bundle.products || []).find((item: any) => String(item.id) === selectedProductId) || null
        : null;

    if (pageKind === "product_landing" && !selectedProduct) {
      return res.status(400).json({ error: "product_id is required for product_landing" });
    }

    const brandProfile = req.brandId
      ? await queryOne<any>(
          `SELECT id, name, slug, logo_url, slogan, primary_color, secondary_color, site_url, sales_page_url,
                  instagram_url, facebook_url, tiktok_url, theme_json, voice_json
           FROM brand_units
           WHERE id = ?
           LIMIT 1`,
          [String(req.brandId)]
        )
      : null;

    const generated = await generatePageWithAi({
      prompt,
      store: bundle.store as Record<string, any>,
      template: (bundle.template || null) as Record<string, any> | null,
      brandProfile: brandProfile || null,
      products: (bundle.products || []) as Array<Record<string, any>>,
      pages: (bundle.pages || []) as Array<Record<string, any>>,
      selectedProduct: selectedProduct as Record<string, any> | null,
      composer: {
        page_kind: pageKind,
        goal: req.body?.goal,
        audience: req.body?.audience,
        tone: req.body?.tone,
        section_count: req.body?.section_count,
        include_faq: req.body?.include_faq,
        include_testimonials: req.body?.include_testimonials,
        include_cta: req.body?.include_cta,
        keywords: req.body?.keywords,
        language: req.body?.language || "pt-BR",
      },
    });
    const page = req.body?.save
      ? await storefront.upsertPage(userId, storeId, {
          title: generated.title,
          slug: generated.slug,
          page_type: generated.page_type || "ai_generated",
          sections: generated.sections,
          seo: generated.seo || {},
          created_by_ai: true,
          is_published: true,
        }, req.brandId)
      : null;

    res.json({
      success: true,
      generated,
      page,
      context: {
        page_kind: pageKind,
        selected_product_id: selectedProduct ? selectedProduct.id : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate page with AI" });
  }
});

router.get("/stores/:storeId/orders", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const managedOrders = await listManagedOrdersForStore(
      userId,
      storeId,
      {
        status: req.query.status ? String(req.query.status) : undefined,
        limit: parseOptionalInt(req.query.limit),
        offset: parseOptionalInt(req.query.offset),
      },
      req.brandId
    );

    const legacyOrders = await storefront.listOrders(
      userId,
      storeId,
      {
        status: req.query.status ? String(req.query.status) : undefined,
        limit: parseOptionalInt(req.query.limit),
        offset: parseOptionalInt(req.query.offset),
      },
      req.brandId
    );

    const orders = [...managedOrders, ...(legacyOrders || [])].sort((a: any, b: any) => {
      const aTime = new Date(String(a?.created_at || 0)).getTime();
      const bTime = new Date(String(b?.created_at || 0)).getTime();
      return bTime - aTime;
    });
    res.json({ success: true, orders });
  } catch (error: any) {
    logger.error(
      {
        err: error,
        route: "storefront.listOrders",
        storeId: String(req.params.storeId || ""),
        query: req.query,
      },
      "Failed to list storefront orders"
    );
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to list orders" });
  }
});

router.patch("/stores/:storeId/orders/:orderId/status", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const managed = await getManagedOrderBundleForStore(userId, storeId, orderId, req.brandId);
    if (managed) {
      const nextBusinessStatus = storefrontStatusToBusinessStatus(req.body?.status);
      const transitioned = await transitionManagedStoreOrder({
        userId,
        store,
        orderId,
        brandId: normalizeBrandId(req.brandId),
        nextBusinessStatus,
        actorName: String(req.user?.name || req.body?.actor_name || "").trim() || userId,
        paymentMethod: req.body?.forma_pagamento,
        paidAt: req.body?.data_pagamento,
        reason: req.body?.reason,
        delivery: {
          courierName: req.body?.courier_name ? String(req.body.courier_name) : undefined,
          courierPhone: req.body?.courier_phone ? String(req.body.courier_phone) : undefined,
          etaMinutes: req.body?.eta_minutes ? Number(req.body.eta_minutes) : undefined,
          deliveryAddress: deliveryAddressFromText(req.body?.delivery_address),
        },
      });
      if (!transitioned) return res.status(404).json({ error: "Order not found" });
      return res.json({ success: true, order: transitioned.order, delivery: transitioned.delivery || null });
    }

    const order = await storefront.updateOrderStatus(
      userId,
      storeId,
      orderId,
      toOrderStatus(req.body?.status),
      req.brandId
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, order });
  } catch (error: any) {
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to update order" });
  }
});

router.post("/stores/:storeId/orders/:orderId/payment-confirmed", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    const managed = await transitionManagedStoreOrder({
      userId,
      store,
      orderId,
      brandId: normalizeBrandId(req.brandId),
      nextBusinessStatus: "pago",
      actorName: String(req.user?.name || req.body?.actor_name || "").trim() || userId,
      paymentMethod: req.body?.forma_pagamento,
      paidAt: req.body?.data_pagamento,
    });
    if (managed) return res.json({ success: true, order: managed.order });

    const order = await storefront.confirmOrderPayment(
      userId,
      storeId,
      orderId,
      String(req.user?.name || req.body?.actor_name || "").trim() || undefined,
      req.brandId
    );
    res.json({ success: true, order });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Store not found" || message === "Order not found" ? 404 : 500;
    res.status(status).json({ error: message || "Failed to confirm payment" });
  }
});

router.post("/stores/:storeId/orders/:orderId/start-preparation", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    const managed = await transitionManagedStoreOrder({
      userId,
      store,
      orderId,
      brandId: normalizeBrandId(req.brandId),
      nextBusinessStatus: "em_preparacao",
      actorName: String(req.user?.name || req.body?.actor_name || "").trim() || userId,
    });
    if (managed) return res.json({ success: true, order: managed.order });

    const order = await storefront.startOrderPreparation(
      userId,
      storeId,
      orderId,
      String(req.user?.name || req.body?.actor_name || "").trim() || undefined,
      req.brandId
    );
    res.json({ success: true, order });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Store not found" || message === "Order not found" ? 404 : 500;
    res.status(status).json({ error: message || "Failed to start preparation" });
  }
});

router.post("/stores/:storeId/orders/:orderId/out-for-delivery", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    const managed = await transitionManagedStoreOrder({
      userId,
      store,
      orderId,
      brandId: normalizeBrandId(req.brandId),
      nextBusinessStatus: "em_entrega",
      actorName: String(req.user?.name || req.body?.actor_name || "").trim() || userId,
      delivery: {
        courierName: req.body?.courier_name ? String(req.body.courier_name) : undefined,
        courierPhone: req.body?.courier_phone ? String(req.body.courier_phone) : undefined,
        etaMinutes: req.body?.eta_minutes ? Number(req.body.eta_minutes) : undefined,
        deliveryAddress: deliveryAddressFromText(req.body?.delivery_address),
      },
    });
    if (managed) return res.json({ success: true, order: managed.order, delivery: managed.delivery || null });

    const result = await storefront.sendOrderOutForDelivery(
      userId,
      storeId,
      orderId,
      {
        courier_name: req.body?.courier_name ? String(req.body.courier_name) : undefined,
        courier_phone: req.body?.courier_phone ? String(req.body.courier_phone) : undefined,
        eta_minutes: req.body?.eta_minutes ? Number(req.body.eta_minutes) : undefined,
      },
      req.brandId
    );
    res.json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "");
    const badRequest = message.includes("Failed to generate unique delivery token");
    const status = message === "Store not found" || message === "Order not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: message || "Failed to send order out for delivery" });
  }
});

router.post("/stores/:storeId/orders/:orderId/confirm-delivery", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    const managed = await transitionManagedStoreOrder({
      userId,
      store,
      orderId,
      brandId: normalizeBrandId(req.brandId),
      nextBusinessStatus: "entregue",
      actorName: String(req.user?.name || req.body?.actor_name || "").trim() || userId,
      delivery: {
        deliveryAddress: deliveryAddressFromText(req.body?.delivery_address),
      },
    });
    if (managed) return res.json({ success: true, order: managed.order });

    const order = await storefront.confirmOrderDeliveryByAdmin(
      userId,
      storeId,
      orderId,
      String(req.user?.name || req.body?.actor_name || "").trim() || undefined,
      req.brandId
    );
    res.json({ success: true, order });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Store not found" || message === "Order not found" ? 404 : 500;
    res.status(status).json({ error: message || "Failed to confirm delivery" });
  }
});

router.get("/stores/:storeId/orders/:orderId/timeline", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const storeId = String(req.params.storeId);
    const orderId = String(req.params.orderId);
    const store = await getOwnedStoreContext(userId, storeId, req.brandId);
    if (!store) return res.status(404).json({ error: "Store not found" });

    const managedTimeline = await listManagedTimelineForStore(userId, storeId, orderId, req.brandId);
    if (managedTimeline) {
      return res.json({ success: true, timeline: managedTimeline });
    }

    const timeline = await storefront.listOrderTimeline(userId, storeId, orderId, req.brandId);
    res.json({ success: true, timeline });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Store not found" || message === "Order not found" ? 404 : 500;
    res.status(status).json({ error: message || "Failed to list order timeline" });
  }
});

router.get("/stores/:storeId/automation/order-flow", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const automation = await storefront.getOrderFlowAutomation(userId, String(req.params.storeId), req.brandId);
    res.json({ success: true, automation });
  } catch (error: any) {
    const message = String(error?.message || "");
    res.status(message === "Store not found" ? 404 : 500).json({ error: message || "Failed to load order flow automation" });
  }
});

router.patch("/stores/:storeId/automation/order-flow", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const automation = await storefront.updateOrderFlowAutomation(
      userId,
      String(req.params.storeId),
      {
        active: req.body?.active,
        logistics: req.body?.logistics,
        notifications: req.body?.notifications,
      },
      req.brandId
    );
    res.json({ success: true, automation });
  } catch (error: any) {
    const message = String(error?.message || "");
    res.status(message === "Store not found" ? 404 : 500).json({ error: message || "Failed to update order flow automation" });
  }
});

router.post("/stores/:storeId/automation/order-flow/dispatch-post-sale", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const result = await storefront.dispatchPostSaleQueue(
      userId,
      String(req.params.storeId),
      req.body?.limit ? Number(req.body.limit) : undefined,
      req.brandId
    );
    res.json({ success: true, result });
  } catch (error: any) {
    const message = String(error?.message || "");
    res.status(message === "Store not found" ? 404 : 500).json({ error: message || "Failed to dispatch post-sale queue" });
  }
});

router.get("/stores/:storeId/orders/:orderId/notifications", async (req: BrandRequest, res) => {
  try {
    const userId = requireUserId(req);
    const notifications = await storefront.listOrderNotifications(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
      req.brandId
    );
    res.json({ success: true, notifications });
  } catch (error: any) {
    res.status(error.message === "Store not found" ? 404 : 500).json({ error: error.message || "Failed to list notifications" });
  }
});

publicRouter.get("/health", async (_req, res) => {
  try {
    const ok = await storefront.transactionalHealthCheck();
    res.json({ success: ok, status: ok ? "ok" : "degraded" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Health check failed" });
  }
});

publicRouter.get("/current", async (req, res) => {
  try {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
    const slug = req.query.slug ? String(req.query.slug) : undefined;
    const store = await storefront.resolvePublicStore({ host, slug });
    if (!store) return res.status(404).json({ error: "Store not found" });
    res.json({ success: true, ...store });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load store" });
  }
});

publicRouter.get("/stores/:slug", async (req, res) => {
  try {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
    const store = await storefront.resolvePublicStore({ slug: String(req.params.slug), host });
    if (!store) return res.status(404).json({ error: "Store not found" });
    res.json({ success: true, ...store });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load store" });
  }
});

/* Catalog cache moved to ./services/storefrontCache so other routes/services can invalidate it. */

/** Tipos de cliente públicos da marca (para cadastro na loja / checkout). */
publicRouter.get("/stores/:slug/client-types", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const ownerUserId = String(bundle.store.owner_user_id || "").trim();
    const brandId = normalizeBrandId(bundle.store.brand_id) || undefined;
    if (!ownerUserId) {
      return res.json({ success: true, types: [] });
    }

    const types = await clientTypesService.list(ownerUserId, brandId);
    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    res.json({
      success: true,
      types: (types || []).map((t) => ({
        id: String(t.id),
        name: String(t.name || "").trim(),
        description: t.description ? String(t.description) : null,
        color: t.color ? String(t.color) : null,
        icon: t.icon ? String(t.icon) : null,
      })).filter((t) => t.name),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load client types" });
  }
});

/** In-flight catalog rebuild locks (stale-while-revalidate). */
const catalogRebuildLocks = new Set<string>();

publicRouter.get("/stores/:slug/catalog", async (req, res) => {
  let rebuildLockHeld = false;
  try {
    const slug = String(req.params.slug || "").trim();

    /* Fresh cache → instant response */
    const cached = getCatalogCacheEntry(slug, { allowStale: true });
    if (cached && !cached.stale) {
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.set("X-Catalog-Cache", "hit");
      return res.json(cached.data);
    }

    /*
     * Stale-while-revalidate: serve last good payload immediately, then rebuild
     * in this same request (client already has data). Dedup concurrent rebuilds.
     */
    if (cached?.stale) {
      res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=300");
      res.set("X-Catalog-Cache", "stale");
      res.json(cached.data);
      if (catalogRebuildLocks.has(slug)) return;
      catalogRebuildLocks.add(slug);
      rebuildLockHeld = true;
    }

    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) {
      if (!res.headersSent) return res.status(404).json({ error: "Store not found" });
      return;
    }

    // Resolve category names from categories table
    const categoryNameMap = new Map<string, string>();
    const categoryIds = new Set<string>();
    const productsRaw = Array.isArray(bundle.products) ? bundle.products : [];
    for (const item of productsRaw) {
      const catId = String(item?.category || "").trim();
      if (catId) categoryIds.add(catId);
    }

    /* Build source_id → storefront_id map (and reverse) to translate relations across the two ID schemes */
    const sourceToStorefrontId = new Map<string, string>();
    const sourceProductIds: string[] = [];
    for (const item of productsRaw) {
      const md = (() => {
        try { return typeof item?.metadata_json === "string" ? JSON.parse(item.metadata_json) : (item?.metadata_json || {}); }
        catch { return {}; }
      })();
      [md?.source_product_id, md?.source_product_id_legacy, md?.commerce_product_id].forEach((c) => {
        const norm = String(c || "").trim();
        if (norm) sourceToStorefrontId.set(norm, String(item.id));
      });
      const ownSource = String(md?.source_product_id || md?.source_product_id_legacy || "").trim();
      if (ownSource) sourceProductIds.push(ownSource);
    }

    const catalogBrandIdEarly = normalizeBrandId(bundle.store.brand_id);
    const storeIdEarly = String(bundle.store.id);
    const ownerIdEarly = String(bundle.store.owner_user_id || "").trim();

    /* Parallel fan-out: categories, relations, sales, payment methods (independent) */
    const [
      catRowsResult,
      relationsBySourceId,
      managedSales,
      legacySalesRows,
      brandCatRows,
      paymentMethodsResolved,
    ] = await Promise.all([
      categoryIds.size > 0
        ? query<any[]>(
            `SELECT id, name FROM categories WHERE id IN (${Array.from(categoryIds).map(() => "?").join(",")})`,
            Array.from(categoryIds)
          ).catch(() => [])
        : Promise.resolve([] as any[]),
      productRelationsService.listForProducts(sourceProductIds).catch(() => new Map()),
      query<any[]>(
        `SELECT i.product_id, SUM(i.quantidade) AS sold_quantity
         FROM commerce_order_items i
         INNER JOIN commerce_orders o ON o.id = i.order_id
         INNER JOIN order_management_meta m ON m.order_id = o.id
         WHERE m.store_id = ?
           AND COALESCE(m.business_status, 'novo') <> 'cancelado'
           AND i.product_id IS NOT NULL
         GROUP BY i.product_id
         ORDER BY sold_quantity DESC
         LIMIT 600`,
        [storeIdEarly]
      ).catch(() => []),
      query<any[]>(
        `SELECT items_json
         FROM storefront_orders
         WHERE store_id = ?
           AND status <> 'cancelado'
         ORDER BY created_at DESC
         LIMIT 300`,
        [storeIdEarly]
      ).catch(() => []),
      catalogBrandIdEarly
        ? query<any[]>(
            `SELECT id, name, color, cover_image FROM categories WHERE brand_id = ? ORDER BY name ASC`,
            [catalogBrandIdEarly]
          ).catch(() => [])
        : Promise.resolve([] as any[]),
      ownerIdEarly
        ? (async () => {
            try {
              const methodConfigs = await paymentConfig.listMethodConfigs(ownerIdEarly);
              const settings = await paymentConfig.getSettings(ownerIdEarly);
              const methodLabels: Record<string, string> = {
                pix: "PIX",
                card: "Cartão",
                boleto: "Boleto",
                wallet: "Carteira",
              };
              const allowMap: Record<string, boolean> = {
                pix: settings.allow_pix,
                card: settings.allow_card,
                boleto: settings.allow_boleto,
                wallet: settings.allow_wallet,
              };
              const out: Array<{ type: string; label: string }> = [];
              for (const mc of methodConfigs) {
                if (mc.enabled && allowMap[mc.method_type]) {
                  out.push({
                    type: mc.method_type,
                    label: methodLabels[mc.method_type] || mc.method_type,
                  });
                }
              }
              return out;
            } catch {
              return [] as Array<{ type: string; label: string }>;
            }
          })()
        : Promise.resolve([] as Array<{ type: string; label: string }>),
    ]);

    for (const row of (catRowsResult as any[]) || []) {
      categoryNameMap.set(String(row.id), String(row.name || row.id));
    }

    const products = productsRaw.map((item: any) => {
      const catId = String(item?.category || "").trim();
      const catName = categoryNameMap.get(catId) || catId || "Outros";
      const md = parseJson<Record<string, any>>(item?.metadata_json, {});
      const ownSourceId = String(md?.source_product_id || md?.source_product_id_legacy || "").trim();
      const rawRelations = ownSourceId ? (relationsBySourceId.get(ownSourceId) || []) : [];
      const relatedStorefrontIds = rawRelations
        .map((r: any) => sourceToStorefrontId.get(String(r.related_product_id)))
        .filter((x: string | undefined): x is string => !!x);

      /* Bundle items (Fase 11) — translate source IDs to storefront IDs the frontend can resolve */
      const rawBundleItems = Array.isArray(md?.bundle_items) ? md.bundle_items : [];
      const bundleItems = rawBundleItems
        .map((bi: any) => {
          const storefrontId = sourceToStorefrontId.get(String(bi?.product_id || "").trim());
          if (!storefrontId) return null;
          return {
            product_id: storefrontId,
            quantity: Math.max(1, Number(bi?.quantity || 1)),
            optional: Boolean(bi?.optional),
            note: String(bi?.note || "").trim() || undefined,
          };
        })
        .filter((x: any) => x !== null);

      const mapped = mapStorefrontProductRow(item, catName);
      return {
        ...mapped,
        position: Number(item?.position || 0),
        related_product_ids: relatedStorefrontIds,
        bundle_items: bundleItems,
        /* interno — removido antes da resposta; usado para enriquecer reviews */
        _source_product_id: ownSourceId || null,
      };
    });

    /* Reviews + snippets + attribute defs — parallel (sales already loaded above) */
    const reviewAggBySource = new Map<string, { avg: number; count: number }>();
    const uniqueSourceIds = Array.from(
      new Set(
        products
          .map((p: any) => String(p._source_product_id || "").trim())
          .filter(Boolean)
      )
    );
    const catalogBrandId = catalogBrandIdEarly;

    const [reviewEnrichOk, recentReviews, attributeDefinitions] = await Promise.all([
      (async () => {
        if (uniqueSourceIds.length === 0) return true;
        try {
          const ph = uniqueSourceIds.map(() => "?").join(",");
          const revRows = (await query<any[]>(
            `SELECT id,
                    COALESCE(reviews_avg, 0) AS reviews_avg,
                    COALESCE(reviews_count, 0) AS reviews_count
               FROM products
              WHERE id IN (${ph})`,
            uniqueSourceIds
          )) as any[];
          for (const row of revRows || []) {
            const id = String(row?.id || "").trim();
            if (!id) continue;
            reviewAggBySource.set(id, {
              avg: Number(row?.reviews_avg || 0),
              count: Number(row?.reviews_count || 0),
            });
          }
          const zeroIds = uniqueSourceIds.filter((id) => {
            const a = reviewAggBySource.get(id);
            return !a || a.count <= 0;
          });
          if (zeroIds.length > 0) {
            const ph2 = zeroIds.map(() => "?").join(",");
            const live = (await query<any[]>(
              `SELECT product_id,
                      COUNT(*)::int AS n,
                      COALESCE(AVG(rating), 0)::float AS avg
                 FROM product_reviews
                WHERE product_id IN (${ph2}) AND status = 'approved'
                GROUP BY product_id`,
              zeroIds
            ).catch(() => [])) as any[];
            for (const row of live || []) {
              const id = String(row?.product_id || "").trim();
              const n = Number(row?.n || 0);
              if (!id || n <= 0) continue;
              reviewAggBySource.set(id, {
                avg: Math.round(Number(row?.avg || 0) * 100) / 100,
                count: n,
              });
            }
          }
          return true;
        } catch (e: any) {
          logger.warn(`[catalog] reviews enrich failed: ${e?.message || e}`);
          return false;
        }
      })(),
      (async () => {
        if (!catalogBrandId) return [] as Array<{
          id: string;
          customer_name: string;
          rating: number;
          comment: string | null;
          product_name: string | null;
          product_id: string | null;
          verified_purchase: boolean;
          created_at: string;
        }>;
        try {
          const snippetRows = (await query<any[]>(
            `SELECT r.id, r.customer_name, r.rating, r.comment, r.verified_purchase,
                    r.created_at, r.product_id, p.name AS product_name
               FROM product_reviews r
               LEFT JOIN products p ON p.id = r.product_id
              WHERE r.brand_id = ? AND r.status = 'approved'
                AND r.comment IS NOT NULL AND LENGTH(TRIM(r.comment)) > 0
              ORDER BY r.verified_purchase DESC, r.created_at DESC
              LIMIT 8`,
            [catalogBrandId]
          )) as any[];
          return (snippetRows || []).map((row) => {
            const sourcePid = String(row?.product_id || "").trim();
            const sfId = sourcePid ? sourceToStorefrontId.get(sourcePid) || null : null;
            return {
              id: String(row.id),
              customer_name: String(row.customer_name || "Cliente"),
              rating: Number(row.rating) || 5,
              comment: row.comment ? String(row.comment).trim().slice(0, 280) : null,
              product_name: row.product_name ? String(row.product_name) : null,
              product_id: sfId,
              verified_purchase: Boolean(row.verified_purchase),
              created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
            };
          });
        } catch (e: any) {
          logger.warn(`[catalog] recent reviews failed: ${e?.message || e}`);
          return [];
        }
      })(),
      attributeDefinitionService
        .listForPublic(catalogBrandId)
        .catch(() => []),
    ]);
    void reviewEnrichOk;

    for (const p of products as any[]) {
      const sid = String(p._source_product_id || "").trim();
      const agg = sid ? reviewAggBySource.get(sid) : null;
      if (agg && agg.count > 0) {
        p.reviews_avg = agg.avg;
        p.reviews_count = agg.count;
      }
      delete p._source_product_id;
    }

    const soldByProductId = new Map<string, number>();
    for (const row of (managedSales as any[]) || []) {
      const productId = String(row?.product_id || "").trim();
      if (!productId) continue;
      soldByProductId.set(productId, (soldByProductId.get(productId) || 0) + Number(row?.sold_quantity || 0));
    }

    for (const row of (legacySalesRows as any[]) || []) {
      const items = parseJson<any[]>(row?.items_json, []);
      if (!Array.isArray(items)) continue;
      for (const rawItem of items) {
        const productId = String(rawItem?.product_id || "").trim();
        if (!productId || soldByProductId.has(productId)) continue;
        const quantity = Math.max(1, Number(rawItem?.quantity || 1));
        soldByProductId.set(productId, (soldByProductId.get(productId) || 0) + quantity);
      }
    }

    const ranked = products
      .map((product) => ({
        ...product,
        sold_quantity: soldByProductId.get(product.id) || 0,
      }))
      .sort((a, b) => {
        if (b.sold_quantity !== a.sold_quantity) return b.sold_quantity - a.sold_quantity;
        if (a.position !== b.position) return a.position - b.position;
        return a.name.localeCompare(b.name, "pt-BR");
      });

    const bestSellers = ranked.filter((item) => item.sold_quantity > 0).slice(0, 8);
    const fallbackBest = bestSellers.length > 0 ? bestSellers : ranked.slice(0, Math.min(6, ranked.length));
    const bestIds = new Set(fallbackBest.map((item) => item.id));
    const others = ranked.filter((item) => !bestIds.has(item.id));

    const categoryMap = new Map<string, number>();
    for (const product of ranked) {
      const category = String(product.category || "Outros").trim() || "Outros";
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    }

    /* Categorias definidas no admin — com capa, cor e contagem de produtos */
    let storeCategories: Array<{
      id: string;
      name: string;
      cover_image: string | null;
      color: string | null;
      count: number;
    }> = [];
    {
      const countByKey = new Map<string, number>();
      for (const product of ranked) {
        const key = String(product.category || product.category_name || "").trim();
        if (!key) continue;
        countByKey.set(key, (countByKey.get(key) || 0) + 1);
      }
      storeCategories = (Array.isArray(brandCatRows) ? brandCatRows : [])
        .map((row: any) => {
          const id = String(row?.id || "").trim();
          const name = String(row?.name || "").trim();
          const count = countByKey.get(name) || countByKey.get(id) || 0;
          return {
            id,
            name,
            cover_image: String(row?.cover_image || "").trim() || null,
            color: String(row?.color || "").trim() || null,
            count,
          };
        })
        .filter((c: any) => c.id && c.name && c.count > 0);
    }

    const storeBrand = (bundle.store.brand || {}) as Record<string, any>;
    const storeTheme = (bundle.store.theme || {}) as Record<string, any>;
    const storeSettings = (bundle.store.settings || {}) as Record<string, any>;
    const logistics = (storeSettings.logistics || {}) as Record<string, any>;
    const checkoutSettings = (storeSettings.checkout || {}) as Record<string, any>;
    const profileStatusRaw = String(storeBrand?.status || "aberto")
      .trim()
      .toLowerCase();
    const profileStatus = profileStatusRaw === "fechado" ? "fechado" : "aberto";

    const paymentMethods: Array<{ type: string; label: string }> = paymentMethodsResolved || [];

    const catalogResponse = {
      success: true,
      store: {
        id: bundle.store.id,
        slug: bundle.store.slug,
        name: bundle.store.name,
        brand: bundle.store.brand || {},
        theme: bundle.store.theme || {},
        profile: {
          logo_url:
            String(
              storeBrand?.logo_url ||
                storeTheme?.logo_url ||
                storeTheme?.logo ||
                ""
            ).trim() || null,
          description:
            String(
              storeBrand?.description ||
                storeBrand?.about ||
                storeBrand?.slogan ||
                ""
            ).trim() || null,
          cover_image:
            String(
              storeBrand?.cover_image ||
                storeBrand?.cover_image_url ||
                storeTheme?.cover_image ||
                storeTheme?.hero_image ||
                ""
            ).trim() || null,
          address:
            String(
              storeBrand?.address ||
                logistics?.pickup_address ||
                ""
            ).trim() || null,
          status: profileStatus,
          delivery_fee:
            logistics?.delivery_fee !== undefined && logistics?.delivery_fee !== null
              ? Number(logistics.delivery_fee)
              : logistics?.shipping_fee !== undefined && logistics?.shipping_fee !== null
                ? Number(logistics.shipping_fee)
                : null,
          delivery_radius_km:
            logistics?.delivery_radius_km !== undefined && logistics?.delivery_radius_km !== null
              ? Number(logistics.delivery_radius_km)
              : null,
          shipping_mode: String(logistics?.shipping_mode || "delivery").trim(),
          default_eta_minutes: logistics?.default_eta_minutes != null ? Number(logistics.default_eta_minutes) : null,
          free_shipping_above: logistics?.free_shipping_above != null ? Number(logistics.free_shipping_above) : null,
          frete_texto: String(logistics?.frete_texto || "").trim() || null,
          delivery_time_text: String(logistics?.delivery_time_text || "").trim() || null,
        },
        checkout: {
          collect_email: checkoutSettings.collect_email !== false,
          collect_address: checkoutSettings.collect_address !== false,
        },
        marketing: sanitizePublicMarketingSettings(storeSettings),
        design: sanitizePublicDesignSettings(storeSettings),
        primary_domain: String((bundle.store as any)?.primary_domain || "").trim() || null,
        payment_methods: paymentMethods,
      },
      categories: storeCategories.length
        ? storeCategories
        : Array.from(categoryMap.entries()).map(([name, count]) => ({ id: name, name, count })),
      store_categories: storeCategories,
      best_sellers: fallbackBest,
      other_products: others,
      all_products: ranked,
      recent_reviews: recentReviews,
      /* Attribute definitions for client-side filters (Fase 2). Only is_filter=TRUE. */
      attribute_definitions: attributeDefinitions || [],
      /* Collections (Fase 1) — resolved against current catalog.
       * IMPORTANT: collection.product_ids stores source-catalog product IDs (products.id),
       * but `ranked` items use storefront_products.id. We map via metadata.source_product_id. */
      collections: await (async () => {
        try {
          const cols = await offerCatalogService.listActiveCollectionsByBrand(catalogBrandId);
          const productsForRules = ranked.map((p: any) => ({
            id: p.id,
            price: Number(p.price || 0),
            promoPrice: p.compare_at_price ? Number(p.price) : 0,
            category: p.category_id || p.category,
            type: p.type,
            cta_type: p.cta_type,
          }));
          const rankedIds = new Set(ranked.map((p: any) => p.id));
          return cols.map((c) => {
            /* For manual: translate source IDs to storefront IDs. For auto: rules already work on storefront items. */
            const isManual = c.type !== "auto";
            const resolvedIds = isManual
              ? c.product_ids.map((id) => sourceToStorefrontId.get(String(id))).filter((x): x is string => !!x)
              : offerCatalogService.resolveProductIds(c, productsForRules);
            const validIds = resolvedIds.filter((id) => rankedIds.has(id));
            return {
              id: c.id,
              slug: c.slug,
              name: c.name,
              description: c.description,
              image_url: c.image_url,
              position: c.position,
              product_ids: validIds,
            };
          }).filter((c) => c.product_ids.length > 0);
        } catch (e: any) {
          logger.warn(`Failed to resolve collections: ${e?.message || e}`);
          return [];
        }
      })(),
      stats: {
        total_products: ranked.length,
        total_orders: Number(((managedSales as any[]) || []).length) + Number(((legacySalesRows as any[]) || []).length),
      },
    };

    /* Persist in cache */
    setCatalogCacheEntry(slug, catalogResponse);

    if (!res.headersSent) {
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.set("X-Catalog-Cache", "miss");
      res.json(catalogResponse);
    }
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to load catalog" });
    } else {
      logger.warn(`[catalog] rebuild after stale failed: ${error?.message || error}`);
    }
  } finally {
    if (rebuildLockHeld) {
      const slug = String(req.params.slug || "").trim();
      catalogRebuildLocks.delete(slug);
    }
  }
});

/* ═══════════════════════════════════════════════════════
   Coupons (Fase 13) — validate a code against the cart BEFORE the user submits.
   POST /stores/:slug/coupons/validate
   Body: { code, subtotal, productIds?, categoryIds?, customerId? }
   Returns: { valid, discount_amount, final_total, reason?, coupon? }
   No-auth — public lookup; rate-limit at gateway if abuse becomes a concern.
   ═══════════════════════════════════════════════════════ */
publicRouter.post("/stores/:slug/coupons/validate", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });
    const brandId = (bundle.store as any).brand_id || null;

    const body = req.body || {};
    const result = await couponsService.validate({
      code: String(body.code || "").trim(),
      brandId,
      subtotal: Number(body.subtotal || 0),
      customerId: body.customerId ? String(body.customerId) : null,
      productIds: Array.isArray(body.productIds) ? body.productIds.map(String) : [],
      categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [],
    });

    /* Don't 4xx on invalid — the frontend always wants the structured result so
     * it can show "cupom expirado" inline without throwing. */
    res.json({
      valid: result.valid,
      reason: result.reason || null,
      reason_code: result.reason_code || null,
      discount_amount: result.discount_amount,
      final_total: result.final_total,
      coupon: result.coupon ? {
        id: result.coupon.id,
        code: result.coupon.code,
        description: result.coupon.description,
        discount_type: result.coupon.discount_type,
        discount_value: result.coupon.discount_value,
        expires_at: result.coupon.expires_at,
      } : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to validate coupon" });
  }
});

/* ═══════════════════════════════════════════════════════
   Reviews (Fase 14) — public submission + listing per product.
   Reviews submetidas via this endpoint sempre nascem `pending`;
   admin precisa aprovar antes de aparecerem no catálogo.
   ═══════════════════════════════════════════════════════ */
publicRouter.get("/stores/:slug/products/:productId/reviews", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    /* Resolve storefront product → source catalog product id (reviews are stored
     * against the source product so they survive storefront re-syncs). */
    const storefrontProduct = (bundle.products as any[]).find((p) => String(p.id) === String(req.params.productId));
    if (!storefrontProduct) return res.status(404).json({ error: "Product not found" });
    const metadata = parseJson<Record<string, any>>(storefrontProduct.metadata_json, {});
    const sourceProductId = String(metadata?.source_product_id || storefrontProduct.id);

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [list, aggregates] = await Promise.all([
      reviewsService.listForProductPublic(sourceProductId, limit),
      reviewsService.getAggregates(sourceProductId),
    ]);

    res.json({
      success: true,
      reviews: list.map((r) => ({
        id: r.id,
        customer_name: r.customer_name,
        rating: r.rating,
        comment: r.comment,
        verified_purchase: r.verified_purchase,
        created_at: r.created_at,
      })),
      aggregates,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load reviews" });
  }
});

publicRouter.post("/stores/:slug/products/:productId/reviews", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });
    const brandId = (bundle.store as any).brand_id || null;

    const storefrontProduct = (bundle.products as any[]).find((p) => String(p.id) === String(req.params.productId));
    if (!storefrontProduct) return res.status(404).json({ error: "Product not found" });
    const metadata = parseJson<Record<string, any>>(storefrontProduct.metadata_json, {});
    const sourceProductId = String(metadata?.source_product_id || storefrontProduct.id);

    const body = req.body || {};
    const review = await reviewsService.createPublic({
      productId: sourceProductId,
      brandId,
      customerName: String(body.name || body.customer_name || "").trim(),
      customerPhone: body.phone || body.customer_phone || null,
      rating: Number(body.rating),
      comment: body.comment || null,
      orderId: body.order_id || null,
    });

    res.status(201).json({
      success: true,
      review: { id: review.id, status: review.status, verified_purchase: review.verified_purchase },
      message: "Obrigado pela avaliação! Ela aparecerá no catálogo após análise.",
    });
  } catch (error: any) {
    const msg = String(error.message || "");
    const status = msg.includes("obrigatório") || msg.includes("entre 1 e 5") ? 400 : 500;
    res.status(status).json({ error: msg || "Failed to submit review" });
  }
});

/* ═══════════════════════════════════════════════════════
   Smart Search — AI-scored product relevance
   GET /stores/:slug/catalog/search?q=<query>
   Returns products ranked by demand-supply match score
   ═══════════════════════════════════════════════════════ */
publicRouter.get("/stores/:slug/catalog/search", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const searchQuery = String(req.query.q || "").trim();
    const useAI = String(req.query.ai || "true") !== "false";

    if (!searchQuery) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const productsRaw = Array.isArray(bundle.products) ? bundle.products : [];
    const products = productsRaw.map((item: any) => {
      const images = parseImageList(item?.images_json);
      return {
        id: String(item?.id || ""),
        slug: String(item?.slug || ""),
        name: String(item?.name || "Produto"),
        description: String(item?.description || "").trim() || null,
        category: String(item?.category || "").trim() || "Outros",
        price: Number(item?.price || 0),
        compare_at_price: item?.compare_at_price != null ? Number(item.compare_at_price) : null,
        image: images[0] || null,
        images,
      };
    });

    if (!products.length) {
      return res.json({
        success: true,
        query: searchQuery,
        results: [],
        total: 0,
        relevant_count: 0,
        scoring_mode: "none",
      });
    }

    /* Step 1: Quick text pre-filter (avoid sending 100+ products to AI) */
    const preScored = products.map((p) => ({
      ...p,
      textScore: prospectionMatch.quickTextScore(searchQuery, p),
    }));

    /* Keep products with any text relevance OR all if nothing matches */
    const textMatches = preScored.filter((p) => p.textScore > 0);
    const candidates = textMatches.length > 0 ? textMatches : preScored.slice(0, 20);

    /* Sort by text score first */
    candidates.sort((a, b) => b.textScore - a.textScore);

    /* Step 2: AI scoring for top candidates (max 15 to limit cost/latency) */
    const toScore = candidates.slice(0, 15);

    if (useAI && toScore.length > 0) {
      try {
        const aiResult = await prospectionMatch.scoreBulk(
          searchQuery,
          toScore.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            category: p.category,
            price: p.price,
          })),
          {
            userId: requireUserId(req),
            brandId: String((req as any).brandId || "").trim() || undefined,
          }
        );

        /* Merge AI scores back onto product objects */
        const scoreMap = new Map(aiResult.results.map((r) => [r.product_id, r]));

        const enriched = toScore.map((p) => {
          const aiScore = scoreMap.get(p.id);
          return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            description: p.description,
            category: p.category,
            price: p.price,
            compare_at_price: p.compare_at_price,
            image: p.image,
            images: p.images,
            match: aiScore
              ? {
                  score: aiScore.score,
                  grade: aiScore.grade,
                  demand_intent: aiScore.demand_intent,
                  supply_profile: aiScore.supply_profile,
                  reasoning: aiScore.reasoning,
                  is_relevant: aiScore.is_relevant,
                }
              : {
                  score: p.textScore,
                  grade: p.textScore >= 75 ? "A" : p.textScore >= 50 ? "B" : p.textScore >= 25 ? "C" : "D" as const,
                  demand_intent: searchQuery,
                  supply_profile: p.name,
                  reasoning: "Score por correspondencia textual",
                  is_relevant: p.textScore >= 50,
                },
          };
        });

        enriched.sort((a, b) => b.match.score - a.match.score);
        const relevant = enriched.filter((p) => p.match.is_relevant);

        return res.json({
          success: true,
          query: searchQuery,
          results: enriched,
          total: enriched.length,
          relevant_count: relevant.length,
          scoring_mode: "ai",
        });
      } catch (aiErr: any) {
        logger.warn(aiErr, "Smart search AI scoring failed, falling back to text");
      }
    }

    /* Fallback: text-only scoring */
    const textResults = candidates.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      price: p.price,
      compare_at_price: p.compare_at_price,
      image: p.image,
      images: p.images,
      match: {
        score: p.textScore,
        grade: (p.textScore >= 75 ? "A" : p.textScore >= 50 ? "B" : p.textScore >= 25 ? "C" : "D") as "A" | "B" | "C" | "D",
        demand_intent: searchQuery,
        supply_profile: p.name,
        reasoning: "Score por correspondencia textual",
        is_relevant: p.textScore >= 50,
      },
    }));

    res.json({
      success: true,
      query: searchQuery,
      results: textResults,
      total: textResults.length,
      relevant_count: textResults.filter((p) => p.match.is_relevant).length,
      scoring_mode: "text",
    });
  } catch (error: any) {
    logger.error(error, "Smart search error");
    res.status(500).json({ error: error.message || "Search failed" });
  }
});

publicRouter.get("/stores/:slug/products/:productSlug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const raw = await storefront.getPublicProduct(slug, String(req.params.productSlug));
    if (!raw) return res.status(404).json({ error: "Product not found" });

    const catId = String((raw as any)?.category || "").trim();
    let categoryName = catId || "Outros";
    if (catId) {
      const catRow = await queryOne<{ name: string }>(
        `SELECT name FROM categories WHERE id = ? LIMIT 1`,
        [catId]
      );
      if (catRow?.name) categoryName = String(catRow.name);
    }

    const product = mapStorefrontProductRow(raw, categoryName);
    res.json({
      success: true,
      product,
      store: {
        slug: bundle.store.slug,
        name: bundle.store.name,
        primary_domain: String((bundle.store as any)?.primary_domain || "").trim() || null,
        brand: bundle.store.brand || {},
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load product" });
  }
});

publicRouter.get("/stores/:slug/pages/:pageSlug", async (req, res) => {
  try {
    const page = await storefront.getPublicPage(String(req.params.slug), String(req.params.pageSlug));
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json({ success: true, page });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load page" });
  }
});

publicRouter.post("/stores/:slug/orders", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: "Order requires at least one product" });
    }

    const productsMap = new Map(
      (Array.isArray(bundle.products) ? bundle.products : []).map((product: any) => [String(product.id || ""), product])
    );

    const normalizedItems = items.map((rawItem: any) => {
      const storefrontProductId = String(rawItem?.product_id || "").trim();
      const product = productsMap.get(storefrontProductId);
      if (!product) throw new Error(`Product not available: ${storefrontProductId}`);

      const metadata = parseJson<Record<string, any>>(product.metadata_json, {});
      const sourceProductId = String(metadata?.source_product_id || product.id || "").trim();
      const quantity = Math.max(1, Math.min(99, Number(rawItem?.quantity || 1)));
      const images = parseImageList(product.images_json);

      /* Variant-aware pricing (Fase 3.5): when a variant_id was selected, look it up and apply its price */
      const variantsRaw = parseJson<any[]>(product.variants_json, []);
      const variantId = String(rawItem?.variant_id || "").trim();
      const selectedVariant = variantId ? variantsRaw.find((v) => String(v.id) === variantId) : null;
      const variantName = String(rawItem?.variant_name || selectedVariant?.name || "").trim() || null;
      const variantAttributes = rawItem?.variant_attributes || selectedVariant?.attributes || null;
      const variantPrice = selectedVariant && Number(selectedVariant.price) > 0 ? Number(selectedVariant.price) : null;
      const variantPromo = selectedVariant && Number(selectedVariant.promo_price) > 0 ? Number(selectedVariant.promo_price) : null;
      const effectiveVariantPrice = variantPromo && variantPrice && variantPromo < variantPrice
        ? variantPromo
        : variantPrice;
      const basePrice = effectiveVariantPrice != null ? effectiveVariantPrice : Number(product.price || 0);

      /* Configurator (Fase 4) — resolve selections + apply price delta */
      const productMd = parseJson<Record<string, any>>(product.metadata_json, {});
      const configurator = (productMd?.configurator || {}) as any;
      const configuratorSelections = Array.isArray(rawItem?.configurator_selections)
        ? rawItem.configurator_selections
        : [];
      let configResolution: ReturnType<typeof resolveConfigurator>;
      try {
        configResolution = resolveConfigurator(configurator, configuratorSelections);
      } catch (e) {
        if (e instanceof ConfiguratorValidationError) {
          throw new Error(`${product.name}: ${e.message}`);
        }
        throw e;
      }
      const unitPrice = Math.max(0, basePrice + configResolution.price_delta_total);

      /* Display name includes variant + configurator summary so the merchant sees it in the order details */
      const baseName = String(product.name || "Produto").trim() || "Produto";
      const nameParts = [baseName];
      if (variantName) nameParts.push(`(${variantName})`);
      if (configResolution.summary) nameParts.push(`— ${configResolution.summary}`);
      const displayName = nameParts.join(" ");

      return {
        product_id: sourceProductId || undefined,
        nome: displayName,
        quantidade: quantity,
        valor_unitario: unitPrice,
        imagem: images[0] || null,
        imagens: images,
        descricao: String(product.description || "").trim() || null,
        categoria: String(product.category || "").trim() || null,
        /* Variant context (preserved through to the order item metadata) */
        variant_id: variantId || null,
        variant_name: variantName,
        variant_attributes: variantAttributes,
        /* Configurator context */
        configurator_selections: configResolution.selections,
        configurator_summary: configResolution.summary || null,
        configurator_price_delta: configResolution.price_delta_total,
      };
    });

    const customerName = String(req.body?.customer?.name || "").trim();
    const customerPhone = String(req.body?.customer?.phone || "").trim();
    const deliveryAddress = deliveryAddressFromText(req.body?.customer?.address?.text || req.body?.delivery_address);
    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: "Customer name and phone are required" });
    }

    const inventoryUserId = String(bundle.store.owner_user_id || "").trim();
    const inventoryBrandId = normalizeBrandId(bundle.store.brand_id);
    for (const item of normalizedItems) {
      if (!item.product_id) continue;
      if (await productStockService.isActivePreorder(item.product_id)) continue;
      const stock = await inventoryService.getProductStock(inventoryUserId, inventoryBrandId, item.product_id);
      const available = Number(stock?.stock_available || 0);
      if (available < Number(item.quantidade || 0)) {
        throw new Error(`Estoque insuficiente para ${item.nome}. Disponível: ${available}, Solicitado: ${Number(item.quantidade || 0)}`);
      }
    }

    const created = await commerceService.createOrder(inventoryUserId, inventoryBrandId, {
      origem: "checkout_web",
      forma_pagamento: req.body?.payment_method,
      customer_name: customerName,
      customer_email: req.body?.customer?.email,
      customer_phone: customerPhone,
      checkout_base_url: checkoutBaseUrl(req),
      itens: normalizedItems,
      /* Fase 13 — forward coupon from the public cart. Validation happens inside
       * commerceService.createOrder and throws COUPON_INVALID on failure (caught below). */
      cupom_codigo: req.body?.cupom_codigo ? String(req.body.cupom_codigo).trim() : undefined,
    });

    /* Atribui venda ao afiliado quando ref/cupom de afiliado veio no pedido */
    if (inventoryBrandId) {
      try {
        const { AffiliatesService } = await import("../services/affiliates");
        const affSvc = new AffiliatesService();
        const affiliateRef = String(req.body?.affiliate_ref || req.body?.affiliate_code || "").trim();
        const affiliateId = String(req.body?.affiliate_id || "").trim();
        let resolvedAffiliateId = affiliateId;

        if (!resolvedAffiliateId && affiliateRef) {
          const byCode = await affSvc.resolveAffiliateByCode(inventoryBrandId, affiliateRef);
          if (byCode) resolvedAffiliateId = String(byCode.id);
        }
        if (!resolvedAffiliateId && created.order?.cupom_codigo) {
          const byCoupon = await queryOne<any>(
            `SELECT id FROM affiliates
             WHERE brand_id = ? AND UPPER(coupon_code) = UPPER(?) AND status = 'active'
             LIMIT 1`,
            [inventoryBrandId, String(created.order.cupom_codigo)]
          );
          if (byCoupon) resolvedAffiliateId = String(byCoupon.id);
        }

        if (resolvedAffiliateId) {
          await affSvc.recordSale({
            ownerUserId: inventoryUserId,
            brandId: inventoryBrandId,
            affiliateId: resolvedAffiliateId,
            orderId: created.order.id,
            customerName,
            customerPhone: customerPhone,
            customerEmail: String(req.body?.customer?.email || "").trim() || undefined,
            orderTotal: Number(created.order.valor_total || 0),
            orderItems: normalizedItems.map((item: any) => ({
              product_id: item.product_id,
              quantity: item.quantidade,
            })),
          });
        }
      } catch (affErr: any) {
        logger.warn(`[storefront] affiliate sale attribution skipped: ${affErr?.message || affErr}`);
      }
    }

    const reservableItems = normalizedItems
      .map((item: any) => ({ product_id: String(item.product_id || ""), quantity: Number(item.quantidade || 0) }))
      .filter((item: any) => item.product_id);
    const reservedItems: Array<{ product_id: string; quantity: number }> = [];
    try {
      for (const item of reservableItems) {
        if (await productStockService.isActivePreorder(item.product_id)) continue;
        await inventoryService.reserveStock(inventoryUserId, inventoryBrandId, item.product_id, item.quantity, created.order.id);
        reservedItems.push(item);
      }
    } catch (error) {
      for (const item of reservedItems) {
        await inventoryService.releaseStock(inventoryUserId, inventoryBrandId, item.product_id, item.quantity, created.order.id).catch(() => undefined);
      }
      await commerceService.updateOrderStatus(inventoryUserId, inventoryBrandId, created.order.id, { status_pedido: "cancelado" }).catch(() => undefined);
      throw error;
    }

    await upsertManagedOrderMeta({
      orderId: created.order.id,
      userId: inventoryUserId,
      brandId: inventoryBrandId,
      storeId: String(bundle.store.id),
      origin: "site",
      businessStatus: "aguardando_pagamento",
      paymentStatus: "pending",
      deliveryStatus: "nao_iniciado",
      notes: deliveryAddress,
    });

    // Auto-create/upsert client with tipo escolhido no cadastro da loja (fallback "Site")
    try {
      const requestedType = String(
        req.body?.customer?.client_type ||
          req.body?.client_type ||
          ""
      ).trim();
      const registeredTypes = await clientTypesService.list(
        inventoryUserId,
        inventoryBrandId || undefined
      );
      const matchedType =
        registeredTypes.find(
          (t) =>
            String(t.name).toLowerCase() === requestedType.toLowerCase() ||
            String(t.id) === requestedType
        ) || null;
      const clientTypeName = matchedType?.name || requestedType || "Site";

      if (!matchedType && clientTypeName === "Site") {
        await clientTypesService.ensureByName(
          inventoryUserId,
          "Site",
          { color: "#3b82f6", icon: "globe", description: "Cliente que comprou pelo catálogo público" },
          inventoryBrandId || undefined
        );
      } else if (requestedType && !matchedType) {
        // Tipo livre enviado pela loja — garante cadastro se for nome novo
        await clientTypesService.ensureByName(
          inventoryUserId,
          clientTypeName,
          { color: "#64748b", description: "Informado no cadastro da loja" },
          inventoryBrandId || undefined
        );
      }

      const normalizedPhone = customerPhone.replace(/\D/g, "");
      if (normalizedPhone) {
        const existing = await clientsService.getAll(inventoryUserId, {
          search: normalizedPhone,
          brand_id: inventoryBrandId || undefined,
          limit: 1,
          page: 1,
        });
        if (!existing.clients || existing.clients.length === 0) {
          await clientsService.create(
            inventoryUserId,
            {
              name: customerName,
              phone: normalizedPhone,
              email: req.body?.customer?.email || undefined,
              address: deliveryAddress || undefined,
              source: "checkout_web",
              client_type: clientTypeName,
              status: "new",
              notes: `Cliente criado automaticamente no checkout da loja (${slug}).`,
            } as any,
            inventoryBrandId || undefined
          );
        } else if (matchedType || requestedType) {
          // Atualiza tipo se o cliente já existe e informou tipo no pedido
          const clientId = String(existing.clients[0]?.id || "");
          if (clientId) {
            await clientsService
              .update(clientId, inventoryUserId, { client_type: clientTypeName } as any, inventoryBrandId || undefined)
              .catch(() => undefined);
          }
        }
      }
    } catch (error) {
      logger.warn({ error }, "Failed to auto-create client from site order");
    }

    await appendManagedTimeline({
      orderId: created.order.id,
      userId: inventoryUserId,
      brandId: inventoryBrandId,
      status: "aguardando_pagamento",
      eventKey: "order.created",
      actorType: "customer",
      payload: {
        store_slug: slug,
        origin: "site",
        delivery_address: deliveryAddress,
      },
    });

    const vars = omsService.buildOrderVariables(
      { ...created.order, items: created.items, order_number: buildPublicOrderNumber(created.order.id) },
      { store_name: bundle.store.name, delivery_address: deliveryAddress || "" }
    );
    omsService.processOrderEvent({
      userId: inventoryUserId,
      brandId: inventoryBrandId,
      orderId: created.order.id,
      event: "order.created",
      variables: vars,
    }).catch(() => undefined);

    res.status(201).json({ success: true, ...created });
  } catch (error: any) {
    const message = String(error.message || "");
    /* Fase 13 — bubble up coupon errors with the same shape used by /api/commerce/orders
     * so the public CheckoutPage can render them inline. */
    if (error?.code === "COUPON_INVALID") {
      return res.status(400).json({ error: message, code: "COUPON_INVALID", reason_code: error.reason_code || null });
    }
    if (error?.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({ error: message, code: "INSUFFICIENT_STOCK", shortages: error.shortages || [] });
    }
    const badRequest =
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("not available") ||
      message.includes("at least") ||
      message.includes("Estoque insuficiente");
    const status = message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: message || "Failed to create order" });
  }
});

/* ── Public lead capture (used by catalog CTAs: quote, schedule, visit, simulate, subscribe) ── */
publicRouter.post("/stores/:slug/leads", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const ownerUserId = String(bundle.store.owner_user_id || "").trim();
    const brandId = normalizeBrandId(bundle.store.brand_id);
    if (!ownerUserId) {
      return res.status(500).json({ error: "Store owner not resolved" });
    }

    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim();
    const message = String(req.body?.message || "").trim();
    const productId = String(req.body?.product_id || "").trim();
    const ctaType = String(req.body?.cta_type || "quote").trim().toLowerCase();
    const productName = String(req.body?.product_name || "").trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Nome é obrigatório" });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: "Informe telefone ou e-mail para retorno" });
    }

    const allowedCtas = new Set(["quote", "schedule", "visit", "simulate", "subscribe", "custom", "whatsapp"]);
    const safeCta = allowedCtas.has(ctaType) ? ctaType : "quote";

    /* Compose notes so the team sees the context immediately on the lead detail */
    const notesLines: string[] = [];
    notesLines.push(`Captura: catálogo público (${slug})`);
    notesLines.push(`Ação solicitada: ${safeCta}`);
    if (productName) notesLines.push(`Produto: ${productName}`);
    if (message) notesLines.push(`Mensagem do cliente: ${message}`);

    const customer = await customersService.create(
      {
        name,
        phone: phone || undefined,
        email: email || undefined,
        source: "website",
        status: "new",
        notes: notesLines.join("\n"),
        extra_source_details: {
          catalog: true,
          store_slug: slug,
          cta_type: safeCta,
          product_id: productId || null,
          product_name: productName || null,
          message: message || null,
          captured_at: new Date().toISOString(),
        },
      } as any,
      ownerUserId,
      brandId
    );

    if (brandId) {
      try {
        const { AffiliatesService } = await import("../services/affiliates");
        const affSvc = new AffiliatesService();
        const affiliateRef = String(req.body?.affiliate_ref || req.body?.affiliate_code || "").trim();
        const affiliateId = String(req.body?.affiliate_id || "").trim();
        const affiliate = await affSvc.resolveAffiliateAttribution(brandId, {
          affiliateId,
          affiliateRef,
          couponCode: String(req.body?.cupom || req.body?.coupon || "").trim(),
        });
        if (affiliate) {
          await affSvc.recordAffiliateLead({
            ownerUserId,
            brandId,
            affiliateId: String(affiliate.id),
            customerName: name,
            phone: phone || undefined,
            email: email || undefined,
            sourceType: "capture",
            ctaType: safeCta,
            productName: productName || undefined,
            productId: productId || undefined,
            message: message || undefined,
            internalRefId: String(customer.id),
          });
        }
      } catch (affErr: any) {
        logger.warn(`[storefront] affiliate lead attribution skipped: ${affErr?.message || affErr}`);
      }
    }

    res.status(201).json({
      success: true,
      lead: {
        id: customer.id,
        status: customer.status,
        cta_type: safeCta,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "Failed to capture lead");
    logger.error(`Public lead capture failed: ${message}`);
    const badRequest = message.toLowerCase().includes("required") || message.toLowerCase().includes("obrigat");
    res.status(badRequest ? 400 : 500).json({ error: message });
  }
});

/* ── Service availability (Fase 5) ──
 * GET /stores/:slug/availability?product_id=...&date=YYYY-MM-DD
 * Returns list of bookable slots based on service_config and existing bookings. */
publicRouter.get("/stores/:slug/availability", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const storefrontProductId = String(req.query.product_id || "").trim();
    const dateStr = String(req.query.date || "").trim();
    if (!storefrontProductId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "product_id and date=YYYY-MM-DD are required" });
    }

    /* Map storefront → source product to read service_config from products catalog */
    const sfProduct = (Array.isArray(bundle.products) ? bundle.products : []).find(
      (p: any) => String(p.id) === storefrontProductId
    );
    if (!sfProduct) return res.status(404).json({ error: "Product not found" });
    const md = parseJson<Record<string, any>>(sfProduct.metadata_json, {});
    const sourceProductId = String(md.source_product_id || md.source_product_id_legacy || "").trim();
    if (!sourceProductId) return res.json({ success: true, date: dateStr, slots: [] });

    const ownerUserId = String(bundle.store.owner_user_id || "").trim();
    const brandId = normalizeBrandId(bundle.store.brand_id);
    const product = await productsService.getProduct(sourceProductId, ownerUserId, brandId);
    const config: any = (product as any)?.service_config || {};
    if (!config.weekday_hours || !Array.isArray(config.weekday_hours) || config.weekday_hours.length === 0) {
      return res.json({ success: true, date: dateStr, slots: [], reason: "service_not_configured" });
    }

    /* Reject past dates and dates beyond max_advance_days */
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return res.json({ success: true, date: dateStr, slots: [], reason: "past_date" });
    const maxAdvance = Math.max(1, Number(config.max_advance_days || 30));
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + maxAdvance);
    if (date > maxDate) return res.json({ success: true, date: dateStr, slots: [], reason: "beyond_max_advance" });

    const takenCounts = await loadBookedSlotsCount(sourceProductId, dateStr);
    const slots = generateSlotsForDay(date, config, takenCounts);

    res.json({ success: true, date: dateStr, product_id: sourceProductId, slots });
  } catch (error: any) {
    logger.error(error, "availability error");
    res.status(500).json({ error: error.message || "Failed to load availability" });
  }
});

/* ── Booking creation (Fase 5) ──
 * POST /stores/:slug/bookings — creates a lead/customer with slot metadata so the merchant confirms.
 * For MVP this does NOT charge or persist to a calendar table; the next step is to promote bookings
 * to a dedicated table when needed. */
publicRouter.post("/stores/:slug/bookings", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim();
    const message = String(req.body?.message || "").trim();
    const storefrontProductId = String(req.body?.product_id || "").trim();
    const startAtIso = String(req.body?.start_at || "").trim();
    const endAtIso = String(req.body?.end_at || "").trim();
    const address = String(req.body?.address || "").trim();

    if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
    if (!phone && !email) return res.status(400).json({ error: "Informe telefone ou e-mail" });
    if (!storefrontProductId) return res.status(400).json({ error: "Produto obrigatório" });
    if (!startAtIso || !endAtIso) return res.status(400).json({ error: "Slot inválido" });

    const sfProduct = (Array.isArray(bundle.products) ? bundle.products : []).find(
      (p: any) => String(p.id) === storefrontProductId
    );
    if (!sfProduct) return res.status(404).json({ error: "Produto não encontrado" });
    const md = parseJson<Record<string, any>>(sfProduct.metadata_json, {});
    const sourceProductId = String(md.source_product_id || md.source_product_id_legacy || "").trim();
    const productName = String(sfProduct.name || "Serviço").trim();

    const ownerUserId = String(bundle.store.owner_user_id || "").trim();
    const brandId = normalizeBrandId(bundle.store.brand_id);
    if (!ownerUserId) return res.status(500).json({ error: "Loja sem dono configurado" });

    /* Capacity re-check (avoid race conditions) */
    const dateYYYYMMDD = startAtIso.slice(0, 10);
    const product = sourceProductId ? await productsService.getProduct(sourceProductId, ownerUserId, brandId) : null;
    const config: any = (product as any)?.service_config || {};
    if (config.weekday_hours && Array.isArray(config.weekday_hours)) {
      const taken = await loadBookedSlotsCount(sourceProductId, dateYYYYMMDD);
      const slots = generateSlotsForDay(new Date(dateYYYYMMDD + "T00:00:00"), config, taken);
      const matching = slots.find((s) => s.start === startAtIso);
      if (!matching) return res.status(409).json({ error: "Slot não está mais disponível" });
      if (matching.available <= 0) return res.status(409).json({ error: "Slot lotado" });
    }

    const notesLines = [
      `Captura: agendamento via catálogo (${slug})`,
      `Produto: ${productName}`,
      `Slot solicitado: ${startAtIso} – ${endAtIso}`,
    ];
    if (message) notesLines.push(`Mensagem do cliente: ${message}`);
    if (address) notesLines.push(`Endereço: ${address}`);

    const customer = await customersService.create(
      {
        name,
        phone: phone || undefined,
        email: email || undefined,
        source: "website",
        status: "new",
        notes: notesLines.join("\n"),
        address: address || undefined,
        extra_source_details: {
          catalog: true,
          store_slug: slug,
          cta_type: "schedule",
          product_id: sourceProductId,
          product_name: productName,
          message: message || null,
          captured_at: new Date().toISOString(),
          booking: {
            product_id: sourceProductId,
            product_name: productName,
            start_at: startAtIso,
            end_at: endAtIso,
            address: address || null,
            status: "pending_confirmation",
          },
        },
      } as any,
      ownerUserId,
      brandId
    );

    if (brandId) {
      try {
        const { AffiliatesService } = await import("../services/affiliates");
        const affSvc = new AffiliatesService();
        const affiliate = await affSvc.resolveAffiliateAttribution(brandId, {
          affiliateId: String(req.body?.affiliate_id || "").trim(),
          affiliateRef: String(req.body?.affiliate_ref || req.body?.affiliate_code || "").trim(),
          couponCode: String(req.body?.cupom || req.body?.coupon || "").trim(),
        });
        if (affiliate) {
          await affSvc.recordAffiliateLead({
            ownerUserId,
            brandId,
            affiliateId: String(affiliate.id),
            customerName: name,
            phone: phone || undefined,
            email: email || undefined,
            sourceType: "booking",
            ctaType: "schedule",
            productName,
            productId: sourceProductId || undefined,
            message: [
              message || null,
              `Agendamento: ${startAtIso} – ${endAtIso}`,
            ].filter(Boolean).join("\n") || undefined,
            internalRefId: String(customer.id),
          });
        }
      } catch (affErr: any) {
        logger.warn(`[storefront] affiliate booking lead skipped: ${affErr?.message || affErr}`);
      }
    }

    res.status(201).json({
      success: true,
      booking: {
        customer_id: customer.id,
        product_id: sourceProductId,
        start_at: startAtIso,
        end_at: endAtIso,
        status: "pending_confirmation",
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "Failed to create booking");
    logger.error(`Booking creation failed: ${message}`);
    const bad = message.toLowerCase().includes("obrigat") || message.toLowerCase().includes("inválido");
    res.status(bad ? 400 : 500).json({ error: message });
  }
});

publicRouter.get("/stores/:slug/orders/track", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const orderNumber = String(req.query.order_number || "").trim().toUpperCase();
    const customerPhone = normalizePhone(req.query.phone || req.query.customer_phone || "");

    if (!orderNumber || !customerPhone) {
      return res.status(400).json({ error: "order_number e phone são obrigatórios" });
    }

    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });
    await ensureManagedDeliverySchema();

    const managedOrder = await queryOne<any>(
      `SELECT o.*, m.store_id, m.business_status, m.payment_status, m.delivery_status, m.notes,
              ds.route_link, ds.estimated_delivery,
              (SELECT token FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token,
              (SELECT expires_at FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token_expires_at
       FROM commerce_orders o
       INNER JOIN order_management_meta m ON m.order_id = o.id
       LEFT JOIN order_dispatch_status ds ON ds.order_id = o.id
       WHERE m.store_id = ?
         AND (UPPER(LEFT(REPLACE(o.id, '-', ''), 8)) = ? OR UPPER(o.id) = ?)
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [String(bundle.store.id), orderNumber, orderNumber]
    );

    if (managedOrder) {
      const orderPhone = normalizePhone(managedOrder.customer_phone);
      if (!orderPhone || !orderPhone.endsWith(customerPhone.slice(-8))) {
        return res.status(403).json({ error: "Telefone não confere para este pedido" });
      }

      const items = await query<any[]>(`SELECT * FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`, [String(managedOrder.id)]);
      const timeline = await query<any[]>(
        `SELECT status, event_key, actor_type, updated_by, payload_json, timestamp
         FROM order_management_timeline
         WHERE order_id = ?
         ORDER BY timestamp ASC`,
        [String(managedOrder.id)]
      );

      const publicOrder = mapManagedOrderForPublic(managedOrder, items || [], managedOrder);

      /* Lead Capture Mob — enrich customer tracking with live logistics */
      let logistics: any = null;
      try {
        const ownerUserId = String(bundle.store.owner_user_id || managedOrder.user_id || "").trim();
        const brandId = String(bundle.store.brand_id || managedOrder.brand_id || "").trim() || null;
        if (ownerUserId) {
          const { getMobTrackingForOrder } = await import("../services/mobOrderBridge");
          const { mobLogisticsService } = await import("../services/mobLogistics");
          const track = await getMobTrackingForOrder(ownerUserId, brandId, String(managedOrder.id));
          if (track.delivery_id) {
            const full = await mobLogisticsService.getPublicTracking(
              // resolve token from delivery
              (
                await mobLogisticsService.getDeliveryById(track.delivery_id)
              )?.tracking_token || ""
            );
            const delivery = await mobLogisticsService.getDeliveryById(track.delivery_id);
            logistics = {
              enabled: true,
              delivery_id: track.delivery_id,
              status: track.status || delivery?.status || null,
              tracking_url: track.tracking_url,
              eta_minutes: delivery?.eta_minutes ?? null,
              distance_km: delivery?.distance_km ?? null,
              delivery_fee: delivery?.delivery_fee ?? null,
              delivery_pin: full?.delivery?.delivery_pin || null,
              payment_status: managedOrder.payment_status || publicOrder.payment_status,
              payment_confirmed: ["paid", "pago"].includes(
                String(managedOrder.payment_status || managedOrder.status_pedido || "").toLowerCase()
              ) || ["pago", "em_preparacao", "em_entrega", "entregue"].includes(
                String(managedOrder.business_status || "").toLowerCase()
              ),
              show_map: !!full?.show_map,
              courier: full?.courier || null,
              location: full?.location || null,
              dropoff: delivery
                ? {
                    lat: delivery.dropoff_lat,
                    lng: delivery.dropoff_lng,
                    address: delivery.dropoff_address,
                  }
                : null,
              pickup: delivery
                ? {
                    lat: delivery.pickup_lat,
                    lng: delivery.pickup_lng,
                  }
                : null,
              modality: delivery?.modality || null,
            };
            if (track.tracking_url) {
              publicOrder.tracking_url = track.tracking_url;
            }
          } else {
            const { mobLogisticsService: mobSvc } = await import("../services/mobLogistics");
            const settings = brandId
              ? await mobSvc.getOrCreateSettings(ownerUserId, brandId)
              : null;
            logistics = {
              enabled: !!settings?.enabled,
              delivery_id: null,
              status: null,
              tracking_url: null,
              payment_confirmed: ["paid", "pago"].includes(
                String(managedOrder.payment_status || managedOrder.status_pedido || "").toLowerCase()
              ),
            };
          }
        }
      } catch {
        logistics = null;
      }

      return res.json({
        success: true,
        order: publicOrder,
        logistics,
        timeline: (timeline || []).map((entry: any) => ({
          event_type: entry.event_key || entry.status,
          status_before: null,
          status_after: ["novo", "aguardando_pagamento", "pago", "em_preparacao", "em_entrega", "entregue", "cancelado"].includes(String(entry.status || ""))
            ? businessStatusToStorefrontStatus(entry.status)
            : null,
          actor_type: entry.actor_type,
          actor_name: entry.updated_by || null,
          payload: parseJson(entry?.payload_json, {}),
          created_at: entry.timestamp,
        })),
      });
    }

    const order = await queryOne<any>(
      `SELECT *
       FROM storefront_orders
       WHERE store_id = ?
         AND order_number = ?
       LIMIT 1`,
      [String(bundle.store.id), orderNumber]
    );

    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

    const orderPhone = normalizePhone(order.customer_phone);
    if (!orderPhone || !orderPhone.endsWith(customerPhone.slice(-8))) {
      return res.status(403).json({ error: "Telefone não confere para este pedido" });
    }

    const timeline = await query<any[]>(
      `SELECT event_type, status_before, status_after, actor_type, actor_name, payload_json, created_at
       FROM storefront_order_timeline
       WHERE store_id = ?
         AND order_id = ?
       ORDER BY created_at ASC`,
      [String(bundle.store.id), String(order.id)]
    );

    const items = parseJson<any[]>(order.items_json, []);

    res.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        total: Number(order.total || 0),
        payment_method: order.payment_method || null,
        customer_name: order.customer_name || null,
        customer_phone: order.customer_phone || null,
        created_at: order.created_at,
        updated_at: order.updated_at,
        items,
      },
      timeline: (timeline || []).map((entry: any) => ({
        ...entry,
        payload: parseJson(entry?.payload_json, {}),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to track order" });
  }
});

publicRouter.get("/stores/:slug/orders/history", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();
    const customerName = String(req.query.customer_name || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "email é obrigatório" });
    }

    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });
    await ensureManagedDeliverySchema();

    const managedOrders = await query<any[]>(
      `SELECT o.*, m.store_id, m.business_status, m.payment_status, m.delivery_status, m.notes,
              ds.route_link, ds.estimated_delivery,
              (SELECT token FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token,
              (SELECT expires_at FROM storefront_delivery_tokens WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS delivery_token_expires_at
       FROM commerce_orders o
       INNER JOIN order_management_meta m ON m.order_id = o.id
       LEFT JOIN order_dispatch_status ds ON ds.order_id = o.id
       WHERE m.store_id = ?
         AND LOWER(COALESCE(o.customer_email, '')) = ?
         ${customerName ? "AND LOWER(COALESCE(o.customer_name, '')) = ?" : ""}
       ORDER BY o.created_at DESC
       LIMIT 80`,
      customerName ? [String(bundle.store.id), email, customerName] : [String(bundle.store.id), email]
    );

    const managedOrderIds = (managedOrders || []).map((order) => String(order.id || "")).filter(Boolean);
    const managedItemsByOrderId = new Map<string, any[]>();
    const managedTimelineByOrderId = new Map<string, any[]>();

    if (managedOrderIds.length > 0) {
      const placeholders = managedOrderIds.map(() => "?").join(",");
      const itemRows = await query<any[]>(
        `SELECT * FROM commerce_order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
        managedOrderIds
      );
      for (const item of itemRows || []) {
        const key = String(item.order_id || "");
        const list = managedItemsByOrderId.get(key) || [];
        list.push(item);
        managedItemsByOrderId.set(key, list);
      }

      const timelineRows = await query<any[]>(
        `SELECT order_id, status, event_key, actor_type, updated_by, payload_json, timestamp
         FROM order_management_timeline
         WHERE order_id IN (${placeholders})
         ORDER BY timestamp ASC`,
        managedOrderIds
      );
      for (const row of timelineRows || []) {
        const key = String(row.order_id || "");
        const list = managedTimelineByOrderId.get(key) || [];
        list.push({
          event_type: row.event_key || row.status,
          status_before: null,
          status_after: ["novo", "aguardando_pagamento", "pago", "em_preparacao", "em_entrega", "entregue", "cancelado"].includes(String(row.status || ""))
            ? businessStatusToStorefrontStatus(row.status)
            : null,
          actor_type: row.actor_type,
          actor_name: row.updated_by || null,
          payload: parseJson(row.payload_json, {}),
          created_at: row.timestamp,
        });
        managedTimelineByOrderId.set(key, list);
      }
    }

    const orders = await query<any[]>(
      `SELECT id, order_number, status, total, payment_method, customer_name, customer_phone, customer_email, items_json, created_at, updated_at
       FROM storefront_orders
       WHERE store_id = ?
         AND LOWER(COALESCE(customer_email, '')) = ?
         ${customerName ? "AND LOWER(COALESCE(customer_name, '')) = ?" : ""}
       ORDER BY created_at DESC
       LIMIT 80`,
      customerName ? [String(bundle.store.id), email, customerName] : [String(bundle.store.id), email]
    );

    const orderIds = orders.map((item) => String(item.id || "")).filter(Boolean);
    const timelineByOrderId = new Map<string, any[]>();

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(",");
      const timelineRows = await query<any[]>(
        `SELECT order_id, event_type, status_before, status_after, actor_type, actor_name, payload_json, created_at
         FROM storefront_order_timeline
         WHERE store_id = ?
           AND order_id IN (${placeholders})
         ORDER BY created_at ASC`,
        [String(bundle.store.id), ...orderIds]
      );

      for (const row of timelineRows) {
        const key = String(row.order_id || "");
        if (!key) continue;
        const list = timelineByOrderId.get(key) || [];
        list.push({
          event_type: row.event_type,
          status_before: row.status_before,
          status_after: row.status_after,
          actor_type: row.actor_type,
          actor_name: row.actor_name,
          payload: parseJson(row.payload_json, {}),
          created_at: row.created_at,
        });
        timelineByOrderId.set(key, list);
      }
    }

    res.json({
      success: true,
      customer: {
        email,
        customer_name: customerName || null,
      },
      orders: [
        ...(managedOrders || []).map((order) => ({
          ...mapManagedOrderForPublic(order, managedItemsByOrderId.get(String(order.id || "")) || [], order),
          timeline: managedTimelineByOrderId.get(String(order.id || "")) || [],
        })),
        ...(orders || []).map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          total: Number(order.total || 0),
          payment_method: order.payment_method || null,
          customer_name: order.customer_name || null,
          customer_phone: order.customer_phone || null,
          customer_email: order.customer_email || null,
          created_at: order.created_at,
          updated_at: order.updated_at,
          items: parseJson(order.items_json, []),
          timeline: timelineByOrderId.get(String(order.id || "")) || [],
        })),
      ].sort((a: any, b: any) => new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load order history" });
  }
});

publicRouter.get("/delivery/confirm", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    const managed = await confirmManagedDeliveryByToken(token, "qr_scan");
    if (managed) {
      return res.json({ success: true, ...managed });
    }
    const result = await storefront.confirmOrderDeliveryByToken(token, "qr", "qr_scan");
    res.json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Delivery token not found" ? 404 : message === "Delivery token expired" ? 400 : 500;
    res.status(status).json({ error: message || "Failed to confirm delivery" });
  }
});

publicRouter.post("/delivery/confirm-token", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    const result = await storefront.confirmOrderDeliveryByToken(token, "token", "token_validation");
    res.json({ success: true, ...result });
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = message === "Delivery token not found" ? 404 : message === "Delivery token expired" ? 400 : 500;
    res.status(status).json({ error: message || "Failed to confirm delivery token" });
  }
});

export default router;
export { publicRouter as storefrontPublicRoutes };
