import { Router } from "express";
import { randomUUID } from "crypto";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { CommerceService } from "../services/commerce";
import { GeminiService } from "../services/gemini";
import { InventoryService } from "../services/inventory";
import { OrderManagementService } from "../services/orderManagement";
import { StorefrontService } from "../services/storefront";
import { PaymentConfigService } from "../services/paymentConfig";
import { ProspectionMatchService } from "../services/prospectionMatch";
import { CustomersService } from "../services/customers";
import { getNotificationService } from "../services/notifications";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { exec } from "child_process";
import { writeFileSync, existsSync, symlinkSync, unlinkSync } from "fs";
import path from "path";

const router = Router();
const publicRouter = Router();

const commerceService = new CommerceService();
const storefront = new StorefrontService();
const gemini = new GeminiService();
const inventoryService = new InventoryService();
const omsService = new OrderManagementService();
const prospectionMatch = new ProspectionMatchService();
const paymentConfig = new PaymentConfigService();
const customersService = new CustomersService();
const notificationService = getNotificationService();
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
    return parsed.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
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

  const model = (gemini as any).model;
  if (!model || typeof model.generateContent !== "function") {
    return {
      title: fallbackTitle,
      slug: "pagina-ia",
      page_type: "ai_generated",
      seo: {
        title: fallbackTitle,
        description: "Pagina gerada automaticamente com contexto de loja e produtos.",
        keywords,
      },
      sections: [
        {
          id: "sec-hero",
          type: "hero",
          content: {
            headline: input.selectedProduct?.name
              ? `Conheca ${input.selectedProduct.name}`
              : String(input.prompt || "Sua nova pagina inteligente"),
            subheadline: "Pagina gerada com estrutura inicial para edicao no builder.",
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

  try {
    const result = await model.generateContent(prompt);
    const raw = String(result?.response?.text?.() || "").trim();
    const clean = raw.replace(/^```json\s*/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(clean);

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
    const result = await storefront.verifyDomainOwnership(
      userId,
      String(req.params.storeId),
      String(req.params.domain || ""),
      requestPublicHost(req),
      req.brandId
    );
    res.json({ success: true, ...result });
  } catch (error: any) {
    const badRequest = String(error.message || "").includes("invalid") || String(error.message || "").includes("not found");
    const status = error.message === "Store not found" ? 404 : badRequest ? 400 : 500;
    res.status(status).json({ error: error.message || "Failed to verify domain" });
  }
});

/* ── Domain auto-provisioning (nginx + SSL) ── */
const NGINX_AVAILABLE = "/etc/nginx/sites-available";
const NGINX_ENABLED = "/etc/nginx/sites-enabled";

function isValidDomainName(d: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 253;
}

function execPromise(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

function buildNginxConfig(domain: string): string {
  return `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
}

router.post("/stores/:storeId/domains/:domain/provision", async (req: BrandRequest, res) => {
  const storeId = String(req.params.storeId || "").trim();
  const rawDomain = String(req.params.domain || "").toLowerCase().trim();
  try {
    const userId = requireUserId(req);
    if (!isValidDomainName(rawDomain)) {
      return res.status(400).json({ error: "Invalid domain name" });
    }

    // Verify domain belongs to this store
    const domainRow = await queryOne<{ id: string; store_id: string; verification_status: string }>(
      `SELECT d.id, d.store_id, d.verification_status FROM storefront_domains d
       INNER JOIN storefront_stores s ON s.id = d.store_id
       WHERE d.domain = ? AND d.store_id = ?`,
      [rawDomain, storeId]
    );
    if (!domainRow) {
      return res.status(404).json({ error: "Domain not registered for this store" });
    }

    const steps: string[] = [];

    // Step 1: Create nginx config if not exists
    const availPath = path.join(NGINX_AVAILABLE, rawDomain);
    if (!existsSync(availPath)) {
      writeFileSync(availPath, buildNginxConfig(rawDomain), "utf-8");
      steps.push("nginx config created");
    } else {
      steps.push("nginx config already exists");
    }

    // Step 2: Symlink to sites-enabled
    const enabledPath = path.join(NGINX_ENABLED, rawDomain);
    if (!existsSync(enabledPath)) {
      symlinkSync(availPath, enabledPath);
      steps.push("site enabled");
    } else {
      steps.push("site already enabled");
    }

    // Step 3: Test and reload nginx
    await execPromise("nginx -t");
    await execPromise("systemctl reload nginx");
    steps.push("nginx reloaded");

    // Step 4: Obtain SSL certificate via certbot
    try {
      const certResult = await execPromise(
        `certbot --nginx -d ${rawDomain} --non-interactive --agree-tos --email admin@leadcapture.online --redirect`
      );
      steps.push("SSL certificate obtained");
      logger.info(`certbot success for ${rawDomain}: ${certResult.stdout.slice(0, 200)}`);
    } catch (certErr: any) {
      logger.error(`certbot failed for ${rawDomain}: ${certErr.stderr || certErr.message}`);
      steps.push(`SSL pending: ${String(certErr.stderr || certErr.message).slice(0, 150)}`);
    }

    // Step 5: Update domain status
    await query(
      `UPDATE storefront_domains SET verification_status = 'active' WHERE id = ?`,
      [domainRow.id]
    );
    steps.push("domain status set to active");

    logger.info(`Domain provisioned: ${rawDomain} for store ${storeId} — ${steps.join(", ")}`);
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

/* ── In-memory catalog cache (avoids heavy sync + ranking queries on every page view) ── */
const _catalogCache = new Map<string, { data: any; expires: number }>();
const CATALOG_CACHE_TTL = 300_000; // 5 minutes

publicRouter.get("/stores/:slug/catalog", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();

    /* Return cached response if still fresh */
    const cached = _catalogCache.get(slug);
    if (cached && cached.expires > Date.now()) {
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json(cached.data);
    }

    const bundle = await storefront.resolvePublicStore({ slug });
    if (!bundle) return res.status(404).json({ error: "Store not found" });

    // Resolve category names from categories table
    const categoryNameMap = new Map<string, string>();
    const categoryIds = new Set<string>();
    const productsRaw = Array.isArray(bundle.products) ? bundle.products : [];
    for (const item of productsRaw) {
      const catId = String(item?.category || "").trim();
      if (catId) categoryIds.add(catId);
    }
    if (categoryIds.size > 0) {
      const placeholders = Array.from(categoryIds).map(() => "?").join(",");
      const catRows = (await query<any[]>(
        `SELECT id, name FROM categories WHERE id IN (${placeholders})`,
        Array.from(categoryIds)
      )) as any[];
      for (const row of catRows) {
        categoryNameMap.set(String(row.id), String(row.name || row.id));
      }
    }

    const products = productsRaw.map((item: any) => {
      const images = parseImageList(item?.images_json);
      const catId = String(item?.category || "").trim();
      const catName = categoryNameMap.get(catId) || catId || "Outros";
      return {
        id: String(item?.id || ""),
        slug: String(item?.slug || ""),
        name: String(item?.name || "Produto"),
        description: String(item?.description || "").trim() || null,
        category: catName,
        category_id: catId,
        price: Number(item?.price || 0),
        compare_at_price: item?.compare_at_price !== undefined && item?.compare_at_price !== null
          ? Number(item.compare_at_price)
          : null,
        image: images[0] || null,
        images,
        position: Number(item?.position || 0),
      };
    });

    const soldByProductId = new Map<string, number>();
    const managedSales = await query<any[]>(
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
      [String(bundle.store.id)]
    );

    for (const row of managedSales || []) {
      const productId = String(row?.product_id || "").trim();
      if (!productId) continue;
      soldByProductId.set(productId, (soldByProductId.get(productId) || 0) + Number(row?.sold_quantity || 0));
    }

    const legacySalesRows = (await query<any[]>(
      `SELECT items_json
       FROM storefront_orders
       WHERE store_id = ?
         AND status <> 'cancelado'
       ORDER BY created_at DESC
       LIMIT 300`,
      [String(bundle.store.id)]
    )) as any[];

    for (const row of legacySalesRows) {
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

    const storeBrand = (bundle.store.brand || {}) as Record<string, any>;
    const storeTheme = (bundle.store.theme || {}) as Record<string, any>;
    const storeSettings = (bundle.store.settings || {}) as Record<string, any>;
    const logistics = (storeSettings.logistics || {}) as Record<string, any>;
    const checkoutSettings = (storeSettings.checkout || {}) as Record<string, any>;
    const profileStatusRaw = String(storeBrand?.status || "aberto")
      .trim()
      .toLowerCase();
    const profileStatus = profileStatusRaw === "fechado" ? "fechado" : "aberto";

    /* Resolve enabled payment methods for this store */
    const ownerId = String(bundle.store.owner_user_id || "").trim();
    let paymentMethods: Array<{ type: string; label: string }> = [];
    if (ownerId) {
      try {
        const methodConfigs = await paymentConfig.listMethodConfigs(ownerId);
        const settings = await paymentConfig.getSettings(ownerId);
        const methodLabels: Record<string, string> = { pix: "PIX", card: "Cartão", boleto: "Boleto", wallet: "Carteira" };
        const allowMap: Record<string, boolean> = {
          pix: settings.allow_pix,
          card: settings.allow_card,
          boleto: settings.allow_boleto,
          wallet: settings.allow_wallet,
        };
        for (const mc of methodConfigs) {
          if (mc.enabled && allowMap[mc.method_type]) {
            paymentMethods.push({ type: mc.method_type, label: methodLabels[mc.method_type] || mc.method_type });
          }
        }
      } catch (_) { /* ignore — use empty array as fallback */ }
    }

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
        payment_methods: paymentMethods,
      },
      categories: Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count })),
      best_sellers: fallbackBest,
      other_products: others,
      all_products: ranked,
      stats: {
        total_products: ranked.length,
        total_orders: Number((managedSales || []).length) + Number((legacySalesRows || []).length),
      },
    };

    /* Persist in cache */
    _catalogCache.set(slug, { data: catalogResponse, expires: Date.now() + CATALOG_CACHE_TTL });

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(catalogResponse);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load catalog" });
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
          }))
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
    const product = await storefront.getPublicProduct(String(req.params.slug), String(req.params.productSlug));
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product });
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
      const unitPrice = Number(product.price || 0);

      return {
        product_id: sourceProductId || undefined,
        nome: String(product.name || "Produto").trim() || "Produto",
        quantidade: quantity,
        valor_unitario: unitPrice,
        imagem: images[0] || null,
        imagens: images,
        descricao: String(product.description || "").trim() || null,
        categoria: String(product.category || "").trim() || null,
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
    });

    const reservableItems = normalizedItems
      .map((item: any) => ({ product_id: String(item.product_id || ""), quantity: Number(item.quantidade || 0) }))
      .filter((item: any) => item.product_id);
    const reservedItems: Array<{ product_id: string; quantity: number }> = [];
    try {
      for (const item of reservableItems) {
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

    // ── Register customer in CRM (upsert by phone/email) ──
    try {
      const existingByPhone = customerPhone ? await customersService.findByPhone(customerPhone, inventoryUserId, inventoryBrandId) : null;
      if (!existingByPhone) {
        await customersService.create({
          name: customerName,
          phone: customerPhone,
          email: req.body?.customer?.email || null,
          source: "website",
          status: "new",
          address: req.body?.customer?.address?.text || null,
          trade_name: req.body?.customer?.address?.establishment_name || null,
          notes: `Primeiro pedido via checkout - ${slug}`,
        }, inventoryUserId, inventoryBrandId);
        logger.info(`New customer registered from checkout: ${customerName} (${customerPhone})`);
      }
    } catch (err: any) {
      logger.warn(`Customer registration from checkout failed: ${err.message}`);
    }

    // ── Send in-app notification ──
    try {
      const orderTotal = normalizedItems.reduce((s: number, i: any) => s + (Number(i.valor_unitario) || 0) * (Number(i.quantidade) || 0), 0);
      await notificationService.createNotification({
        user_id: inventoryUserId,
        type: "system",
        event: "order_created",
        title: `Novo pedido de ${customerName}`,
        message: `Pedido #${buildPublicOrderNumber(created.order.id)} no valor de R$ ${orderTotal.toFixed(2)}. ${normalizedItems.length} item(ns).`,
        priority: "high",
        channels: ["in_app"],
        metadata: { order_id: created.order.id, customer_phone: customerPhone, store_slug: slug },
      });
      // High-value order alert (R$ 500+)
      if (orderTotal >= 500) {
        try {
          const storeSettings = await queryOne<any>(
            `SELECT settings_json FROM storefront_stores WHERE id = ? LIMIT 1`,
            [bundle.store.id]
          );
          const settings = storeSettings?.settings_json ? (typeof storeSettings.settings_json === 'string' ? JSON.parse(storeSettings.settings_json) : storeSettings.settings_json) : {};
          if (settings?.squad_rules?.notify_high_value) {
            await notificationService.createNotification({
              user_id: inventoryUserId,
              type: "system",
              event: "high_value_order",
              title: `⚠️ Pedido de alto valor: R$ ${orderTotal.toFixed(2)}`,
              message: `${customerName} fez um pedido de R$ ${orderTotal.toFixed(2)}. Este pedido requer atenção humana.`,
              priority: "high",
              channels: ["in_app"],
              metadata: { order_id: created.order.id, customer_phone: customerPhone, order_total: orderTotal },
            });
            logger.info(`High-value order notification sent: R$ ${orderTotal.toFixed(2)} from ${customerName}`);
          }
        } catch {}
      }
    } catch (err: any) {
      logger.warn(`Order notification failed: ${err.message}`);
    }

    res.status(201).json({ success: true, ...created });
  } catch (error: any) {
    const message = String(error.message || "");
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

      return res.json({
        success: true,
        order: mapManagedOrderForPublic(managedOrder, items || [], managedOrder),
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
