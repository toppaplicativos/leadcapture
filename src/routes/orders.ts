import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";
import { CommerceService, CommerceOrderStatus } from "../services/commerce";
import { FlowExecutorService } from "../services/flowExecutor";
import { query, queryOne, update } from "../config/database";

type BusinessOrderStatus =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "em_preparacao"
  | "em_entrega"
  | "entregue"
  | "cancelado";

type OrderOrigin = "site" | "manual" | "whatsapp" | "api";

const router = Router();
const commerceService = new CommerceService();
const brandUnitsService = new BrandUnitsService();

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

async function ensureOrdersSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) {
    await schemaPromise;
    return;
  }

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS order_management_meta (
        order_id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        store_id VARCHAR(36) NULL,
        origin ENUM('site','manual','whatsapp','api') NOT NULL DEFAULT 'site',
        channel VARCHAR(40) NULL,
        created_by VARCHAR(36) NULL,
        business_status ENUM('novo','aguardando_pagamento','pago','em_preparacao','em_entrega','entregue','cancelado') NOT NULL DEFAULT 'novo',
        payment_status VARCHAR(24) NOT NULL DEFAULT 'pending',
        delivery_status VARCHAR(32) NOT NULL DEFAULT 'nao_iniciado',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_order_meta_user_brand (user_id, brand_id, business_status),
        KEY idx_order_meta_channel (channel)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS order_management_timeline (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        status VARCHAR(50) NOT NULL,
        event_key VARCHAR(80) NULL,
        actor_type ENUM('system','admin','customer','automation') NOT NULL DEFAULT 'system',
        updated_by VARCHAR(36) NULL,
        payload_json JSON NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_order_timeline_order (order_id),
        KEY idx_order_timeline_user_brand (user_id, brand_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    schemaReady = true;
  })().finally(() => {
    schemaPromise = null;
  });

  await schemaPromise;
}

function normalizePaymentStatus(value: unknown): "pending" | "paid" | "failed" | "refunded" {
  const v = String(value || "").trim().toLowerCase();
  if (["paid", "pago"].includes(v)) return "paid";
  if (["failed", "erro", "falhou"].includes(v)) return "failed";
  if (["refunded", "estornado"].includes(v)) return "refunded";
  return "pending";
}

function normalizeBusinessStatus(value: unknown): BusinessOrderStatus {
  const v = String(value || "").trim().toLowerCase();
  if (["novo", "new"].includes(v)) return "novo";
  if (["aguardando_pagamento", "aguardando pagamento", "pending_payment"].includes(v)) return "aguardando_pagamento";
  if (["pago", "paid", "aprovado", "approved"].includes(v)) return "pago";
  if (["em_preparacao", "em preparação", "preparacao", "preparing"].includes(v)) return "em_preparacao";
  if (["em_entrega", "saiu_para_entrega", "saiu para entrega", "delivery"].includes(v)) return "em_entrega";
  if (["entregue", "delivered", "concluido", "concluído"].includes(v)) return "entregue";
  if (["cancelado", "canceled", "cancelled"].includes(v)) return "cancelado";
  return "novo";
}

function businessToCommerceStatus(status: BusinessOrderStatus): CommerceOrderStatus {
  if (status === "cancelado") return "cancelado";
  if (["pago", "em_preparacao", "em_entrega", "entregue"].includes(status)) return "pago";
  return "aguardando_pagamento";
}

function commerceToBusinessStatus(status: string): BusinessOrderStatus {
  const v = String(status || "").trim().toLowerCase();
  if (v === "pago") return "pago";
  if (v === "cancelado" || v === "estornado") return "cancelado";
  if (v === "aguardando_pagamento" || v === "abandonado") return "aguardando_pagamento";
  return "novo";
}

function commerceOriginToOrderOrigin(origem: unknown): OrderOrigin {
  const v = String(origem || "").trim().toLowerCase();
  if (v === "whatsapp") return "whatsapp";
  if (v === "checkout_web") return "site";
  return "site";
}

function channelFromOrigin(origin: OrderOrigin): string {
  if (origin === "manual") return "Manual";
  if (origin === "api") return "API";
  if (origin === "whatsapp") return "WhatsApp";
  return "Site";
}

function getRequestedBrandId(req: any): string | null {
  const fromHeader = String(req.headers["x-brand-id"] || "").trim();
  if (fromHeader) return fromHeader;
  const fromQuery = String((req.query || {}).brand_id || "").trim();
  if (fromQuery) return fromQuery;
  const body = (req.body || {}) as Record<string, any>;
  const fromBody = String(body.brand_id || body.brandId || "").trim();
  if (fromBody) return fromBody;
  return null;
}

async function resolveBrandId(req: AuthRequest): Promise<string | null> {
  const userId = req.user?.userId as string | undefined;
  if (!userId) return null;
  return brandUnitsService.resolveActiveBrandId(userId, getRequestedBrandId(req));
}

async function ensureOrderMeta(input: {
  orderId: string;
  userId: string;
  brandId: string | null;
  storeId?: string | null;
  origin: OrderOrigin;
  createdBy?: string | null;
  businessStatus?: BusinessOrderStatus;
  paymentStatus?: "pending" | "paid" | "failed" | "refunded";
  deliveryStatus?: string;
  notes?: string | null;
}): Promise<void> {
  await ensureOrdersSchema();

  await query(
    `INSERT INTO order_management_meta (
      order_id, user_id, brand_id, store_id, origin, channel, created_by,
      business_status, payment_status, delivery_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      brand_id = VALUES(brand_id),
      store_id = COALESCE(VALUES(store_id), store_id),
      origin = COALESCE(VALUES(origin), origin),
      channel = COALESCE(VALUES(channel), channel),
      created_by = COALESCE(VALUES(created_by), created_by),
      business_status = COALESCE(VALUES(business_status), business_status),
      payment_status = COALESCE(VALUES(payment_status), payment_status),
      delivery_status = COALESCE(VALUES(delivery_status), delivery_status),
      notes = COALESCE(VALUES(notes), notes),
      updated_at = CURRENT_TIMESTAMP`,
    [
      input.orderId,
      input.userId,
      input.brandId || null,
      input.storeId || input.brandId || null,
      input.origin,
      channelFromOrigin(input.origin),
      input.createdBy || null,
      input.businessStatus || "novo",
      input.paymentStatus || "pending",
      input.deliveryStatus || "nao_iniciado",
      input.notes || null,
    ]
  );
}

async function appendTimeline(input: {
  orderId: string;
  userId: string;
  brandId: string | null;
  status: string;
  eventKey?: string;
  actorType?: "system" | "admin" | "customer" | "automation";
  updatedBy?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await ensureOrdersSchema();
  await query(
    `INSERT INTO order_management_timeline (
      order_id, user_id, brand_id, status, event_key, actor_type, updated_by, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      input.orderId,
      input.userId,
      input.brandId || null,
      input.status,
      input.eventKey || null,
      input.actorType || "system",
      input.updatedBy || null,
      input.payload ? JSON.stringify(input.payload) : null,
    ]
  );
}

async function fireOrderEvents(
  userId: string,
  eventName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const executor = FlowExecutorService.get();
  const underscored = eventName.split(".").join("_");
  await Promise.allSettled([
    executor.fire(eventName, userId, payload),
    executor.fire(underscored, userId, payload),
  ]);
}

router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await ensureOrdersSchema();
    const brandId = await resolveBrandId(req);
    const brandClause = brandId ? "o.brand_id = ?" : "o.brand_id IS NULL";
    const params = brandId ? [userId, brandId] : [userId];

    const totals = await queryOne<any>(
      `SELECT
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN o.valor_total ELSE 0 END) AS faturamento_dia,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END) AS pedidos_novos,
        AVG(NULLIF(o.valor_total, 0)) AS ticket_medio,
        SUM(CASE WHEN COALESCE(m.business_status, 'novo') = 'cancelado' THEN 1 ELSE 0 END) AS pedidos_cancelados,
        AVG(CASE
          WHEN COALESCE(m.business_status, '') = 'entregue' THEN TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at)
          ELSE NULL
        END) AS tempo_medio_entrega_horas
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE o.user_id = ? AND ${brandClause}`,
      params
    );

    res.json({
      success: true,
      indicators: {
        faturamento_dia: Number(totals?.faturamento_dia || 0),
        pedidos_novos: Number(totals?.pedidos_novos || 0),
        conversao: null,
        ticket_medio: Number(totals?.ticket_medio || 0),
        pedidos_cancelados: Number(totals?.pedidos_cancelados || 0),
        tempo_medio_ate_entrega_horas: totals?.tempo_medio_entrega_horas ? Number(totals.tempo_medio_entrega_horas) : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load orders dashboard" });
  }
});

router.get("/curation", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await ensureOrdersSchema();
    const brandId = await resolveBrandId(req);
    const brandClause = brandId ? "o.brand_id = ?" : "o.brand_id IS NULL";
    const params = brandId ? [userId, brandId] : [userId];

    const duplicateCandidates = await query<any[]>(
      `SELECT customer_phone, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as minute_key, COUNT(*) AS total
       FROM commerce_orders o
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(customer_phone, '') <> ''
         AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
       GROUP BY customer_phone, minute_key
       HAVING COUNT(*) > 1
       ORDER BY total DESC
       LIMIT 20`,
      params
    );

    const stalePayments = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, '${commerceToBusinessStatus("aguardando_pagamento")}') = 'aguardando_pagamento'
         AND o.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      params
    );

    const stalledPreparation = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, 'novo') = 'em_preparacao'
         AND o.updated_at < DATE_SUB(NOW(), INTERVAL 8 HOUR)`,
      params
    );

    const invalidAddress = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       WHERE o.user_id = ? AND ${brandClause}
         AND (o.customer_name IS NULL OR o.customer_name = '' OR o.customer_phone IS NULL OR o.customer_phone = '')`,
      params
    );

    const webhookFailures = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM payment_transactions t
       JOIN commerce_orders o ON o.id = t.order_id
       WHERE o.user_id = ? AND ${brandClause}
         AND t.status = 'failed'
         AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      params
    ).catch(() => ({ total: 0 }));

    res.json({
      success: true,
      summary: {
        duplicate_orders: Number(duplicateCandidates.length || 0),
        waiting_payment_24h: Number(stalePayments?.total || 0),
        stalled_orders: Number(stalledPreparation?.total || 0),
        invalid_address_or_contact: Number(invalidAddress?.total || 0),
        payment_failures: Number(webhookFailures?.total || 0),
      },
      highlights: [
        `⚠ ${Number(stalePayments?.total || 0)} pedidos aguardando pagamento há +24h`,
        `⚠ ${Number(webhookFailures?.total || 0)} pedidos com falha de pagamento/webhook`,
        `⚠ ${Number(stalledPreparation?.total || 0)} pedidos parados em preparação`,
      ],
      duplicate_candidates: duplicateCandidates,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load curation summary" });
  }
});

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await ensureOrdersSchema();
    const brandId = await resolveBrandId(req);

    const status = String(req.query.status || "").trim();
    const customer = String(req.query.client || req.query.customer || "").trim();
    const payment = String(req.query.payment || "").trim();
    const channel = String(req.query.channel || "").trim();
    const periodStart = String(req.query.period_start || "").trim();
    const periodEnd = String(req.query.period_end || "").trim();
    const limit = Math.max(1, Math.min(300, Number(req.query.limit || 80)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where: string[] = ["o.user_id = ?", brandId ? "o.brand_id = ?" : "o.brand_id IS NULL"];
    const params: any[] = brandId ? [userId, brandId] : [userId];

    if (status) {
      where.push("COALESCE(m.business_status, CASE o.status_pedido WHEN 'pago' THEN 'pago' WHEN 'aguardando_pagamento' THEN 'aguardando_pagamento' WHEN 'cancelado' THEN 'cancelado' WHEN 'estornado' THEN 'cancelado' ELSE 'novo' END) = ?");
      params.push(normalizeBusinessStatus(status));
    }
    if (customer) {
      where.push("(o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.customer_email LIKE ?)");
      params.push(`%${customer}%`, `%${customer}%`, `%${customer}%`);
    }
    if (payment) {
      where.push("o.forma_pagamento = ?");
      params.push(String(payment).toLowerCase());
    }
    if (channel) {
      where.push("COALESCE(m.channel, CASE o.origem WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'checkout_web' THEN 'Site' ELSE 'Site' END) = ?");
      params.push(channel);
    }
    if (periodStart) {
      where.push("o.created_at >= ?");
      params.push(periodStart);
    }
    if (periodEnd) {
      where.push("o.created_at <= ?");
      params.push(periodEnd);
    }

    const rows = await query<any[]>(
      `SELECT
        o.id,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.valor_total,
        o.forma_pagamento,
        o.created_at,
        o.updated_at,
        o.status_pedido,
        o.origem,
        o.payment_link,
        COALESCE(m.store_id, o.brand_id) AS store_id,
        COALESCE(m.origin, CASE o.origem WHEN 'whatsapp' THEN 'whatsapp' WHEN 'checkout_web' THEN 'site' ELSE 'site' END) AS origin,
        COALESCE(m.channel, CASE o.origem WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'checkout_web' THEN 'Site' ELSE 'Site' END) AS channel,
        COALESCE(m.business_status, CASE o.status_pedido WHEN 'pago' THEN 'pago' WHEN 'aguardando_pagamento' THEN 'aguardando_pagamento' WHEN 'cancelado' THEN 'cancelado' WHEN 'estornado' THEN 'cancelado' ELSE 'novo' END) AS business_status,
        COALESCE(m.payment_status, CASE WHEN o.status_pedido = 'pago' THEN 'paid' ELSE 'pending' END) AS payment_status,
        COALESCE(m.delivery_status, 'nao_iniciado') AS delivery_status
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE ${where.join(" AND ")}
      ORDER BY o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    for (const row of rows) {
      await ensureOrderMeta({
        orderId: String(row.id),
        userId,
        brandId,
        storeId: row.store_id ? String(row.store_id) : null,
        origin: String(row.origin || "site") as OrderOrigin,
        businessStatus: normalizeBusinessStatus(row.business_status),
        paymentStatus: normalizePaymentStatus(row.payment_status),
        deliveryStatus: String(row.delivery_status || "nao_iniciado"),
      });
    }

    res.json({ success: true, orders: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list managed orders" });
  }
});

router.get("/export/csv", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);

    const orders = await query<any[]>(
      `SELECT
        o.id,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.valor_total,
        o.forma_pagamento,
        o.created_at,
        o.updated_at,
        COALESCE(m.business_status, CASE o.status_pedido WHEN 'pago' THEN 'pago' WHEN 'aguardando_pagamento' THEN 'aguardando_pagamento' WHEN 'cancelado' THEN 'cancelado' WHEN 'estornado' THEN 'cancelado' ELSE 'novo' END) AS business_status,
        COALESCE(m.origin, CASE o.origem WHEN 'whatsapp' THEN 'whatsapp' WHEN 'checkout_web' THEN 'site' ELSE 'site' END) AS origin,
        COALESCE(m.channel, CASE o.origem WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'checkout_web' THEN 'Site' ELSE 'Site' END) AS channel
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE o.user_id = ? AND ${brandId ? "o.brand_id = ?" : "o.brand_id IS NULL"}
      ORDER BY o.created_at DESC
      LIMIT 2000`,
      brandId ? [userId, brandId] : [userId]
    );

    const header = [
      "order_id",
      "customer_name",
      "customer_phone",
      "customer_email",
      "total",
      "business_status",
      "payment_method",
      "origin",
      "channel",
      "created_at",
      "updated_at",
    ];

    const lines = [
      header.join(","),
      ...orders.map((row) =>
        [
          row.id,
          row.customer_name || "",
          row.customer_phone || "",
          row.customer_email || "",
          Number(row.valor_total || 0).toFixed(2),
          row.business_status || "",
          row.forma_pagamento || "",
          row.origin || "",
          row.channel || "",
          row.created_at || "",
          row.updated_at || "",
        ]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join("\n"));
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export orders CSV" });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await ensureOrdersSchema();
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const orderBundle = await commerceService.getOrderById(userId, brandId, orderId);
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    await ensureOrderMeta({
      orderId,
      userId,
      brandId,
      storeId: orderBundle.order.brand_id || null,
      origin: commerceOriginToOrderOrigin(orderBundle.order.origem),
      businessStatus: commerceToBusinessStatus(orderBundle.order.status_pedido),
      paymentStatus: orderBundle.order.status_pedido === "pago" ? "paid" : "pending",
      deliveryStatus: "nao_iniciado",
    });

    const meta = await queryOne<any>(`SELECT * FROM order_management_meta WHERE order_id = ? LIMIT 1`, [orderId]);
    const timeline = await query<any[]>(
      `SELECT status, event_key, actor_type, updated_by, payload_json, timestamp
       FROM order_management_timeline
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );

    const legacyEvents = await query<any[]>(
      `SELECT event_type, payload_json, created_at
       FROM commerce_order_events
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );

    const combinedTimeline = [
      ...legacyEvents.map((event) => ({
        status: String(event.event_type || "evento"),
        event_key: String(event.event_type || "evento"),
        actor_type: "system",
        updated_by: null,
        payload_json: event.payload_json,
        timestamp: event.created_at,
      })),
      ...timeline,
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const customerSummary = {
      name: orderBundle.order.customer_name || null,
      phone: orderBundle.order.customer_phone || null,
      email: orderBundle.order.customer_email || null,
      address: null,
    };

    const profile = await queryOne<any>(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(valor_total) AS total_spent,
        AVG(valor_total) AS average_ticket,
        SUM(CASE WHEN status_pedido = 'pago' THEN 1 ELSE 0 END) AS paid_orders
      FROM commerce_orders
      WHERE user_id = ?
        AND ${brandId ? "brand_id = ?" : "brand_id IS NULL"}
        AND customer_phone = ?`,
      brandId
        ? [userId, brandId, String(orderBundle.order.customer_phone || "")]
        : [userId, String(orderBundle.order.customer_phone || "")]
    );

    res.json({
      success: true,
      order: {
        ...orderBundle.order,
        business_status: normalizeBusinessStatus(meta?.business_status || commerceToBusinessStatus(orderBundle.order.status_pedido)),
        origin: (meta?.origin || commerceOriginToOrderOrigin(orderBundle.order.origem)) as OrderOrigin,
        channel: String(meta?.channel || channelFromOrigin(commerceOriginToOrderOrigin(orderBundle.order.origem))),
        payment_status: normalizePaymentStatus(meta?.payment_status || (orderBundle.order.status_pedido === "pago" ? "paid" : "pending")),
        delivery_status: String(meta?.delivery_status || "nao_iniciado"),
      },
      items: orderBundle.items,
      customer: customerSummary,
      timeline: combinedTimeline,
      customer_profile: {
        total_orders: Number(profile?.total_orders || 0),
        total_spent: Number(profile?.total_spent || 0),
        average_ticket: Number(profile?.average_ticket || 0),
        vip: Number(profile?.total_spent || 0) >= 2000,
        score: Math.min(100, Number(profile?.paid_orders || 0) * 10),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch order detail" });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const body = req.body || {};
    const origin = (String(body.origin || "manual").trim().toLowerCase() || "manual") as OrderOrigin;

    const created = await commerceService.createOrder(userId, brandId, {
      lead_id: body.lead_id ? String(body.lead_id) : undefined,
      instance_id: body.instance_id ? String(body.instance_id) : undefined,
      origem: body.origem === "checkout_web" ? "checkout_web" : "whatsapp",
      forma_pagamento: body.forma_pagamento,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      cupom_codigo: body.cupom_codigo,
      desconto: body.desconto,
      checkout_base_url: String(body.checkout_base_url || process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "").replace(/\/+$/, "") || "http://localhost:5173",
      itens: Array.isArray(body.itens) ? body.itens : [],
    });

    await ensureOrderMeta({
      orderId: created.order.id,
      userId,
      brandId,
      storeId: body.store_id ? String(body.store_id) : brandId,
      origin,
      createdBy: String(body.created_by || userId),
      businessStatus: created.order.status_pedido === "pago" ? "pago" : "aguardando_pagamento",
      paymentStatus: created.order.status_pedido === "pago" ? "paid" : "pending",
      deliveryStatus: "nao_iniciado",
    });

    await appendTimeline({
      orderId: created.order.id,
      userId,
      brandId,
      status: "pedido_criado",
      eventKey: "order.created",
      actorType: "admin",
      updatedBy: userId,
      payload: {
        origin,
        created_by: String(body.created_by || userId),
      },
    });

    await fireOrderEvents(userId, "order.created", {
      order_id: created.order.id,
      origin,
      created_by: String(body.created_by || userId),
      total: created.order.valor_total,
    });

    res.status(201).json({
      success: true,
      ...created,
      metadata: {
        order_id: created.order.id,
        origin,
        created_by: String(body.created_by || userId),
      },
    });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg.includes("obrigatório") || msg.includes("inválido") || msg.includes("carrinho")) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: error.message || "Failed to create manual order" });
  }
});

router.patch("/bulk-status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderIds = Array.isArray(req.body?.order_ids)
      ? req.body.order_ids.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!orderIds.length) return res.status(400).json({ error: "order_ids obrigatórios" });

    const status = normalizeBusinessStatus(req.body?.status);
    let updatedCount = 0;

    for (const orderId of orderIds.slice(0, 500)) {
      const updated = await commerceService.updateOrderStatus(userId, brandId, orderId, {
        status_pedido: businessToCommerceStatus(status),
      });
      if (!updated) continue;
      updatedCount += 1;

      await ensureOrderMeta({
        orderId,
        userId,
        brandId,
        origin: commerceOriginToOrderOrigin(updated.order.origem),
        businessStatus: status,
        paymentStatus: status === "pago" || status === "em_preparacao" || status === "em_entrega" || status === "entregue" ? "paid" : "pending",
        deliveryStatus:
          status === "em_entrega"
            ? "saiu_para_entrega"
            : status === "entregue"
            ? "entregue"
            : status === "em_preparacao"
            ? "em_preparacao"
            : "nao_iniciado",
      });

      await appendTimeline({
        orderId,
        userId,
        brandId,
        status,
        eventKey: "order.status_changed",
        actorType: "admin",
        updatedBy: userId,
      });
    }

    await fireOrderEvents(userId, "order.status_changed", {
      order_ids: orderIds,
      status,
      count: updatedCount,
    });

    res.json({ success: true, updated: updatedCount, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to bulk update orders" });
  }
});

router.patch("/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const status = normalizeBusinessStatus(req.body?.status || req.body?.business_status);

    const updated = await commerceService.updateOrderStatus(userId, brandId, orderId, {
      status_pedido: businessToCommerceStatus(status),
      forma_pagamento: req.body?.forma_pagamento,
      data_pagamento: req.body?.data_pagamento,
    });
    if (!updated) return res.status(404).json({ error: "Pedido não encontrado" });

    await ensureOrderMeta({
      orderId,
      userId,
      brandId,
      origin: commerceOriginToOrderOrigin(updated.order.origem),
      businessStatus: status,
      paymentStatus: status === "pago" || status === "em_preparacao" || status === "em_entrega" || status === "entregue" ? "paid" : "pending",
      deliveryStatus:
        status === "em_entrega"
          ? "saiu_para_entrega"
          : status === "entregue"
          ? "entregue"
          : status === "em_preparacao"
          ? "em_preparacao"
          : "nao_iniciado",
    });

    await appendTimeline({
      orderId,
      userId,
      brandId,
      status,
      eventKey: "order.status_changed",
      actorType: "admin",
      updatedBy: userId,
      payload: {
        payment_method: req.body?.forma_pagamento || updated.order.forma_pagamento,
      },
    });

    await fireOrderEvents(userId, "order.status_changed", {
      order_id: orderId,
      status,
      payment_status: status === "pago" || status === "em_preparacao" || status === "em_entrega" || status === "entregue" ? "paid" : "pending",
    });

    res.json({ success: true, order: updated.order, items: updated.items, business_status: status });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update managed order status" });
  }
});

router.post("/:id/payment-link", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const orderBundle = await commerceService.getOrderById(userId, brandId, orderId);
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    const paymentLink =
      String(orderBundle.order.payment_link || "").trim() ||
      `${String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, "")}/pedido/${orderBundle.order.checkout_token}`;

    await update("UPDATE commerce_orders SET payment_link = ? WHERE id = ?", [paymentLink, orderId]);

    await appendTimeline({
      orderId,
      userId,
      brandId,
      status: "link_pagamento_gerado",
      eventKey: "order.payment_link_sent",
      actorType: "admin",
      updatedBy: userId,
      payload: { payment_link: paymentLink },
    });

    await fireOrderEvents(userId, "order.payment_link_sent", {
      order_id: orderId,
      payment_link: paymentLink,
    });

    res.json({ success: true, order_id: orderId, payment_link: paymentLink });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate payment link" });
  }
});

router.post("/:id/cancel", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const updated = await commerceService.updateOrderStatus(userId, brandId, orderId, {
      status_pedido: "cancelado",
    });
    if (!updated) return res.status(404).json({ error: "Pedido não encontrado" });

    await ensureOrderMeta({
      orderId,
      userId,
      brandId,
      origin: commerceOriginToOrderOrigin(updated.order.origem),
      businessStatus: "cancelado",
      paymentStatus: "failed",
      deliveryStatus: "cancelado",
    });

    await appendTimeline({
      orderId,
      userId,
      brandId,
      status: "cancelado",
      eventKey: "order.cancelled",
      actorType: "admin",
      updatedBy: userId,
      payload: { reason: String(req.body?.reason || "cancelled_by_operator") },
    });

    await fireOrderEvents(userId, "order.cancelled", {
      order_id: orderId,
      reason: String(req.body?.reason || "cancelled_by_operator"),
    });

    res.json({ success: true, order: updated.order, items: updated.items });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to cancel order" });
  }
});

router.post("/:id/duplicate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const original = await commerceService.getOrderById(userId, brandId, orderId);
    if (!original) return res.status(404).json({ error: "Pedido não encontrado" });

    const duplicated = await commerceService.createOrder(userId, brandId, {
      lead_id: original.order.lead_id || undefined,
      instance_id: original.order.instance_id || undefined,
      origem: "whatsapp",
      forma_pagamento: original.order.forma_pagamento,
      customer_name: original.order.customer_name || undefined,
      customer_email: original.order.customer_email || undefined,
      customer_phone: original.order.customer_phone || undefined,
      cupom_codigo: original.order.cupom_codigo || undefined,
      desconto: Number(original.order.desconto || 0),
      checkout_base_url: String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, ""),
      itens: original.items.map((item) => ({
        product_id: item.product_id || undefined,
        nome: item.nome,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      })),
    });

    await ensureOrderMeta({
      orderId: duplicated.order.id,
      userId,
      brandId,
      storeId: brandId,
      origin: "manual",
      createdBy: userId,
      businessStatus: "novo",
      paymentStatus: "pending",
      deliveryStatus: "nao_iniciado",
    });

    await appendTimeline({
      orderId: duplicated.order.id,
      userId,
      brandId,
      status: "duplicado",
      eventKey: "order.created",
      actorType: "admin",
      updatedBy: userId,
      payload: { duplicated_from: orderId },
    });

    await fireOrderEvents(userId, "order.created", {
      order_id: duplicated.order.id,
      duplicated_from: orderId,
      origin: "manual",
    });

    res.status(201).json({ success: true, ...duplicated, duplicated_from: orderId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to duplicate order" });
  }
});

router.post("/:id/reprocess", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const orderBundle = await commerceService.getOrderById(userId, brandId, orderId);
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    await appendTimeline({
      orderId,
      userId,
      brandId,
      status: "reprocessado",
      eventKey: "order.updated",
      actorType: "admin",
      updatedBy: userId,
      payload: {
        reason: String(req.body?.reason || "manual_reprocess"),
        order_status: orderBundle.order.status_pedido,
      },
    });

    await fireOrderEvents(userId, "order.updated", {
      order_id: orderId,
      action: "reprocess",
      reason: String(req.body?.reason || "manual_reprocess"),
    });

    res.json({ success: true, order_id: orderId, reprocessed: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to reprocess order" });
  }
});

router.post("/:id/send-to-expedition", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const orderBundle = await commerceService.getOrderById(userId, brandId, orderId);
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    await ensureOrderMeta({
      orderId,
      userId,
      brandId,
      origin: commerceOriginToOrderOrigin(orderBundle.order.origem),
      businessStatus: "em_entrega",
      paymentStatus: orderBundle.order.status_pedido === "pago" ? "paid" : "pending",
      deliveryStatus: "saiu_para_entrega",
    });

    await query(
      `INSERT INTO order_dispatch_status (
        order_id, user_id, brand_id, logistic_status, assigned_to, estimated_delivery, route_id, route_link
      ) VALUES (?, ?, ?, 'em_rota', NULL, NULL, NULL, NULL)
      ON DUPLICATE KEY UPDATE
        logistic_status = 'em_rota',
        updated_at = CURRENT_TIMESTAMP`,
      [orderId, userId, brandId || null]
    ).catch(() => undefined);

    await appendTimeline({
      orderId,
      userId,
      brandId,
      status: "enviado_para_expedicao",
      eventKey: "order.status_changed",
      actorType: "admin",
      updatedBy: userId,
      payload: { target_module: "expedition" },
    });

    await fireOrderEvents(userId, "order.status_changed", {
      order_id: orderId,
      status: "em_entrega",
      delivery_status: "saiu_para_entrega",
    });

    res.json({ success: true, order_id: orderId, sent_to_expedition: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to send order to expedition" });
  }
});

router.get("/:id/emissions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = await resolveBrandId(req);
    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatório" });

    const orderBundle = await commerceService.getOrderById(userId, brandId, orderId);
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    const qrPayload = JSON.stringify({
      order_id: orderId,
      customer: orderBundle.order.customer_name,
      total: orderBundle.order.valor_total,
      generated_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      emissions: {
        comprovante_pdf: {
          type: "pdf_stub",
          title: `Comprovante Pedido #${orderId.slice(0, 8)}`,
          content: {
            order: orderBundle.order,
            items: orderBundle.items,
          },
        },
        nota_simples: {
          type: "json",
          title: `Nota simples #${orderId.slice(0, 8)}`,
          content: {
            customer: {
              name: orderBundle.order.customer_name,
              phone: orderBundle.order.customer_phone,
              email: orderBundle.order.customer_email,
            },
            total: orderBundle.order.valor_total,
          },
        },
        ordem_expedicao: {
          type: "json",
          content: {
            order_id: orderId,
            items: orderBundle.items,
            delivery_status: "saiu_para_entrega",
          },
        },
        etiqueta_envio: {
          type: "label_stub",
          content: {
            order_short: orderId.slice(0, 8).toUpperCase(),
            customer_name: orderBundle.order.customer_name,
            customer_phone: orderBundle.order.customer_phone,
          },
        },
        qr_code_entrega: {
          type: "qr_payload",
          payload: qrPayload,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate emissions" });
  }
});

export default router;
