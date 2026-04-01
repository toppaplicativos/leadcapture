import { randomUUID } from "crypto";
import { getPool, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";

// ─── Status Flow ────────────────────────────────────────────────────────────
export type BusinessStatus =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "em_preparacao"
  | "em_entrega"
  | "entregue"
  | "cancelado";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type DeliveryStatus = "nao_iniciado" | "em_preparacao" | "saiu_para_entrega" | "entregue" | "cancelado";

const STATUS_FLOW: Record<BusinessStatus, BusinessStatus[]> = {
  novo: ["aguardando_pagamento", "pago", "cancelado"],
  aguardando_pagamento: ["pago", "cancelado"],
  pago: ["em_preparacao", "cancelado"],
  em_preparacao: ["em_entrega", "cancelado"],
  em_entrega: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

const STATUS_LABELS: Record<BusinessStatus, string> = {
  novo: "Novo",
  aguardando_pagamento: "Aguardando Pagamento",
  pago: "Pago",
  em_preparacao: "Em Preparação",
  em_entrega: "Em Entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// ─── Notification Template Types ────────────────────────────────────────────
export type TemplateTarget = "expedition" | "seller" | "client";
export type TemplateEvent =
  | "order.created"
  | "order.paid"
  | "order.preparing"
  | "order.shipped"
  | "order.delivered"
  | "order.cancelled"
  | "payment.confirmed"
  | "payment.failed"
  | "delivery.assigned"
  | "delivery.out_for_delivery"
  | "delivery.completed"
  | "delivery.failed";

export type NotificationTemplate = {
  id: string;
  user_id: string;
  brand_id: string | null;
  event: TemplateEvent;
  target: TemplateTarget;
  channel: "whatsapp" | "email" | "sms" | "in_app";
  subject: string | null;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Responsible Assignment Types ───────────────────────────────────────────
export type ResponsibleRole = "seller" | "expedition" | "support" | "manager";

export type OrderResponsible = {
  id: string;
  order_id: string;
  user_id: string;
  brand_id: string | null;
  responsible_user_id: string;
  responsible_name: string;
  role: ResponsibleRole;
  assigned_at: string;
  unassigned_at: string | null;
  is_active: boolean;
};

// ─── Template Engine ────────────────────────────────────────────────────────
export function renderTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const keys = path.split(".");
    let value: any = variables;
    for (const key of keys) {
      if (value == null || typeof value !== "object") return "";
      value = value[key];
    }
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

export function formatMoney(value: number | string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "R$ 0,00";
  return `R$ ${amount.toFixed(2).replace(".", ",")}`;
}

export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Service Class ──────────────────────────────────────────────────────────
export class OrderManagementService {
  private schemaReady = false;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;

    await query(`
      CREATE TABLE IF NOT EXISTS oms_notification_templates (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        event VARCHAR(80) NOT NULL,
        target VARCHAR(20) NOT NULL,
        channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
        subject VARCHAR(255) NULL,
        body_template TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, brand_id, event, target, channel)
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_oms_templates_user ON oms_notification_templates (user_id, brand_id)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS oms_order_responsibles (
        id VARCHAR(36) PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        responsible_user_id VARCHAR(36) NOT NULL,
        responsible_name VARCHAR(180) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'seller',
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unassigned_at TIMESTAMP NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_oms_responsibles_order ON oms_order_responsibles (order_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_oms_responsibles_user ON oms_order_responsibles (user_id, brand_id)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS oms_automation_log (
        id VARCHAR(36) PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        event VARCHAR(80) NOT NULL,
        target VARCHAR(20) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        rendered_message TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_oms_automation_order ON oms_automation_log (order_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_oms_automation_user ON oms_automation_log (user_id, brand_id, created_at)
    `);

    this.schemaReady = true;
  }

  // ─── Status Flow ──────────────────────────────────────────────────────────

  canTransition(from: BusinessStatus, to: BusinessStatus): boolean {
    return STATUS_FLOW[from]?.includes(to) ?? false;
  }

  getAllowedTransitions(current: BusinessStatus): BusinessStatus[] {
    return STATUS_FLOW[current] || [];
  }

  getStatusLabel(status: BusinessStatus): string {
    return STATUS_LABELS[status] || status;
  }

  getStatusFlow(): Record<BusinessStatus, { label: string; next: BusinessStatus[] }> {
    const result: Record<string, { label: string; next: BusinessStatus[] }> = {};
    for (const [status, nextStatuses] of Object.entries(STATUS_FLOW)) {
      result[status] = {
        label: STATUS_LABELS[status as BusinessStatus] || status,
        next: nextStatuses,
      };
    }
    return result as Record<BusinessStatus, { label: string; next: BusinessStatus[] }>;
  }

  // ─── Template CRUD ────────────────────────────────────────────────────────

  async listTemplates(userId: string, brandId: string | null): Promise<NotificationTemplate[]> {
    await this.ensureSchema();
    const rows = await query<NotificationTemplate[]>(
      `SELECT * FROM oms_notification_templates
       WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
       ORDER BY event, target, channel`,
      [userId, brandId || null]
    );
    return rows || [];
  }

  async getTemplate(userId: string, templateId: string): Promise<NotificationTemplate | null> {
    await this.ensureSchema();
    return queryOne<NotificationTemplate>(
      `SELECT * FROM oms_notification_templates WHERE id = ? AND user_id = ? LIMIT 1`,
      [templateId, userId]
    );
  }

  async upsertTemplate(input: {
    userId: string;
    brandId: string | null;
    event: TemplateEvent;
    target: TemplateTarget;
    channel: string;
    subject?: string | null;
    bodyTemplate: string;
    isActive?: boolean;
  }): Promise<NotificationTemplate> {
    await this.ensureSchema();
    const id = randomUUID();
    const channel = String(input.channel || "whatsapp").trim();
    const isActive = input.isActive !== false;

    await query(
      `INSERT INTO oms_notification_templates
       (id, user_id, brand_id, event, target, channel, subject, body_template, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, brand_id, event, target, channel)
       DO UPDATE SET
         subject = EXCLUDED.subject,
         body_template = EXCLUDED.body_template,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP`,
      [id, input.userId, input.brandId || null, input.event, input.target, channel, input.subject || null, input.bodyTemplate, isActive]
    );

    const row = await queryOne<NotificationTemplate>(
      `SELECT * FROM oms_notification_templates
       WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL) AND event = ? AND target = ? AND channel = ?
       LIMIT 1`,
      [input.userId, input.brandId || null, input.event, input.target, channel]
    );
    return row!;
  }

  async deleteTemplate(userId: string, templateId: string): Promise<boolean> {
    await this.ensureSchema();
    const affected = await update(
      `DELETE FROM oms_notification_templates WHERE id = ? AND user_id = ?`,
      [templateId, userId]
    );
    return affected > 0;
  }

  async seedDefaultTemplates(userId: string, brandId: string | null): Promise<number> {
    await this.ensureSchema();
    const defaults = this.getDefaultTemplates();
    let count = 0;

    for (const tpl of defaults) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM oms_notification_templates
         WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL) AND event = ? AND target = ? AND channel = ?
         LIMIT 1`,
        [userId, brandId || null, tpl.event, tpl.target, tpl.channel]
      );
      if (existing) continue;

      await query(
        `INSERT INTO oms_notification_templates
         (id, user_id, brand_id, event, target, channel, subject, body_template, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [randomUUID(), userId, brandId || null, tpl.event, tpl.target, tpl.channel, tpl.subject || null, tpl.body]
      );
      count += 1;
    }

    return count;
  }

  private getDefaultTemplates(): Array<{
    event: TemplateEvent;
    target: TemplateTarget;
    channel: string;
    subject?: string;
    body: string;
  }> {
    return [
      // ── Client notifications ──
      {
        event: "order.created",
        target: "client",
        channel: "whatsapp",
        body: "Olá {{customer_name}}! 🎉\nSeu pedido *#{{order_number}}* foi recebido com sucesso.\n\n📦 *Total:* {{total_formatted}}\n💳 *Pagamento:* {{payment_method}}\n\nAcompanhe o status do seu pedido. Obrigado pela preferência!",
      },
      {
        event: "order.paid",
        target: "client",
        channel: "whatsapp",
        body: "✅ Pagamento confirmado!\nPedido *#{{order_number}}* - {{total_formatted}}\n\nEstamos preparando seu pedido. Você será notificado quando sair para entrega.",
      },
      {
        event: "order.preparing",
        target: "client",
        channel: "whatsapp",
        body: "👨‍🍳 Seu pedido *#{{order_number}}* está sendo preparado!\nPrevisão de entrega: {{estimated_delivery}}",
      },
      {
        event: "order.shipped",
        target: "client",
        channel: "whatsapp",
        body: "🚚 Seu pedido *#{{order_number}}* saiu para entrega!\n\n📍 Entregador: {{courier_name}}\n📞 Contato: {{courier_phone}}\n🔗 Rastreio: {{tracking_url}}\n\n🔑 Código de confirmação: *{{delivery_token}}*",
      },
      {
        event: "order.delivered",
        target: "client",
        channel: "whatsapp",
        body: "🎉 Pedido *#{{order_number}}* entregue com sucesso!\nObrigado por comprar conosco, {{customer_name}}! ⭐\n\nSua opinião é importante para nós.",
      },
      {
        event: "order.cancelled",
        target: "client",
        channel: "whatsapp",
        body: "❌ Pedido *#{{order_number}}* foi cancelado.\nMotivo: {{cancel_reason}}\n\nCaso tenha dúvidas, entre em contato conosco.",
      },

      // ── Seller notifications ──
      {
        event: "order.created",
        target: "seller",
        channel: "whatsapp",
        body: "🔔 *Novo Pedido #{{order_number}}*\n\n👤 {{customer_name}}\n📱 {{customer_phone}}\n💰 {{total_formatted}}\n📦 {{items_summary}}\n\n⏰ {{created_at}}",
      },
      {
        event: "order.paid",
        target: "seller",
        channel: "whatsapp",
        body: "💰 *Pagamento Confirmado*\nPedido #{{order_number}} - {{customer_name}}\nValor: {{total_formatted}}\n\n✅ Inicie a preparação do pedido.",
      },
      {
        event: "order.cancelled",
        target: "seller",
        channel: "whatsapp",
        body: "❌ *Pedido Cancelado*\n#{{order_number}} - {{customer_name}}\nMotivo: {{cancel_reason}}\nValor: {{total_formatted}}",
      },

      // ── Expedition notifications ──
      {
        event: "order.shipped",
        target: "expedition",
        channel: "whatsapp",
        body: "📦 *Nova Entrega Atribuída*\nPedido #{{order_number}}\n\n👤 Cliente: {{customer_name}}\n📱 Telefone: {{customer_phone}}\n📍 Endereço: {{delivery_address}}\n💰 Total: {{total_formatted}}\n\n📋 Itens:\n{{items_summary}}\n\n🔑 Token: *{{delivery_token}}*",
      },
      {
        event: "delivery.completed",
        target: "expedition",
        channel: "whatsapp",
        body: "✅ Entrega confirmada!\nPedido #{{order_number}} entregue com sucesso.\nConfirmado por: {{confirmed_by}} ({{confirmed_via}})",
      },
    ];
  }

  // ─── Render & Send Notifications ──────────────────────────────────────────

  async processOrderEvent(input: {
    userId: string;
    brandId: string | null;
    orderId: string;
    event: TemplateEvent;
    variables: Record<string, any>;
  }): Promise<Array<{ target: TemplateTarget; channel: string; rendered: string; status: string }>> {
    await this.ensureSchema();

    const templates = await query<NotificationTemplate[]>(
      `SELECT * FROM oms_notification_templates
       WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL) AND event = ? AND is_active = TRUE`,
      [input.userId, input.brandId || null, input.event]
    );

    if (!templates || templates.length === 0) return [];

    const enriched = {
      ...input.variables,
      total_formatted: formatMoney(input.variables.total ?? input.variables.valor_total ?? 0),
      created_at: formatDate(input.variables.created_at || new Date().toISOString()),
    };

    const results: Array<{ target: TemplateTarget; channel: string; rendered: string; status: string }> = [];

    for (const tpl of templates) {
      const rendered = renderTemplate(tpl.body_template, enriched);
      const status = "sent";

      await query(
        `INSERT INTO oms_automation_log (id, order_id, user_id, brand_id, event, target, channel, rendered_message, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), input.orderId, input.userId, input.brandId || null, input.event, tpl.target, tpl.channel, rendered, status]
      );

      results.push({ target: tpl.target as TemplateTarget, channel: tpl.channel, rendered, status });

      logger.info({
        module: "oms",
        event: input.event,
        order_id: input.orderId,
        target: tpl.target,
        channel: tpl.channel,
      }, "OMS notification processed");
    }

    return results;
  }

  async previewTemplate(bodyTemplate: string, sampleVariables?: Record<string, any>): Promise<string> {
    const defaults: Record<string, any> = {
      customer_name: "João Silva",
      customer_phone: "(11) 99999-0000",
      customer_email: "joao@email.com",
      order_number: "SF250616001",
      total: 129.9,
      total_formatted: "R$ 129,90",
      payment_method: "PIX",
      items_summary: "2x Produto A, 1x Produto B",
      delivery_address: "Rua Exemplo, 123 - Centro, São Paulo/SP",
      courier_name: "Carlos Entregador",
      courier_phone: "(11) 98888-0000",
      tracking_url: "https://maps.google.com/...",
      delivery_token: "DEL-SF001-XK9M2",
      estimated_delivery: "40 minutos",
      cancel_reason: "Solicitação do cliente",
      confirmed_by: "Cliente",
      confirmed_via: "token",
      created_at: formatDate(new Date()),
      responsible_name: "Maria Operadora",
    };

    return renderTemplate(bodyTemplate, { ...defaults, ...(sampleVariables || {}) });
  }

  // ─── Responsible Assignment ───────────────────────────────────────────────

  async assignResponsible(input: {
    orderId: string;
    userId: string;
    brandId: string | null;
    responsibleUserId: string;
    responsibleName: string;
    role: ResponsibleRole;
  }): Promise<OrderResponsible> {
    await this.ensureSchema();

    // Deactivate previous same-role assignment
    await update(
      `UPDATE oms_order_responsibles
       SET is_active = FALSE, unassigned_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND user_id = ? AND role = ? AND is_active = TRUE`,
      [input.orderId, input.userId, input.role]
    );

    const id = randomUUID();
    await query(
      `INSERT INTO oms_order_responsibles
       (id, order_id, user_id, brand_id, responsible_user_id, responsible_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [id, input.orderId, input.userId, input.brandId || null, input.responsibleUserId, input.responsibleName, input.role]
    );

    return (await queryOne<OrderResponsible>(
      `SELECT * FROM oms_order_responsibles WHERE id = ? LIMIT 1`,
      [id]
    ))!;
  }

  async getOrderResponsibles(orderId: string): Promise<OrderResponsible[]> {
    await this.ensureSchema();
    return query<OrderResponsible[]>(
      `SELECT * FROM oms_order_responsibles WHERE order_id = ? AND is_active = TRUE ORDER BY assigned_at DESC`,
      [orderId]
    ) as Promise<OrderResponsible[]>;
  }

  async unassignResponsible(orderId: string, userId: string, role: ResponsibleRole): Promise<boolean> {
    await this.ensureSchema();
    const affected = await update(
      `UPDATE oms_order_responsibles
       SET is_active = FALSE, unassigned_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND user_id = ? AND role = ? AND is_active = TRUE`,
      [orderId, userId, role]
    );
    return affected > 0;
  }

  // ─── Problem Detection ────────────────────────────────────────────────────

  async detectProblems(userId: string, brandId: string | null): Promise<{
    stale_payments: number;
    stalled_preparation: number;
    late_deliveries: number;
    unassigned_orders: number;
    total_problems: number;
    details: Array<{ type: string; count: number; description: string }>;
  }> {
    await this.ensureSchema();
    const brandClause = brandId ? "o.brand_id = ?" : "o.brand_id IS NULL";
    const params = brandId ? [userId, brandId] : [userId];

    const stalePayments = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, 'aguardando_pagamento') = 'aguardando_pagamento'
         AND o.created_at < (CURRENT_TIMESTAMP - INTERVAL '24 hours')`,
      params
    ).catch(() => ({ total: 0 }));

    const stalledPreparation = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, 'novo') = 'em_preparacao'
         AND o.updated_at < (CURRENT_TIMESTAMP - INTERVAL '8 hours')`,
      params
    ).catch(() => ({ total: 0 }));

    const lateDeliveries = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, 'novo') = 'em_entrega'
         AND o.updated_at < (CURRENT_TIMESTAMP - INTERVAL '4 hours')`,
      params
    ).catch(() => ({ total: 0 }));

    const unassignedOrders = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       LEFT JOIN oms_order_responsibles r ON r.order_id = o.id AND r.is_active = TRUE
       WHERE o.user_id = ? AND ${brandClause}
         AND COALESCE(m.business_status, 'novo') NOT IN ('entregue', 'cancelado')
         AND r.id IS NULL`,
      params
    ).catch(() => ({ total: 0 }));

    const sp = Number(stalePayments?.total || 0);
    const sr = Number(stalledPreparation?.total || 0);
    const ld = Number(lateDeliveries?.total || 0);
    const ua = Number(unassignedOrders?.total || 0);

    const details: Array<{ type: string; count: number; description: string }> = [];
    if (sp > 0) details.push({ type: "stale_payment", count: sp, description: `${sp} pedidos aguardando pagamento há mais de 24h` });
    if (sr > 0) details.push({ type: "stalled_preparation", count: sr, description: `${sr} pedidos parados em preparação há mais de 8h` });
    if (ld > 0) details.push({ type: "late_delivery", count: ld, description: `${ld} entregas em andamento há mais de 4h` });
    if (ua > 0) details.push({ type: "unassigned", count: ua, description: `${ua} pedidos ativos sem responsável atribuído` });

    return {
      stale_payments: sp,
      stalled_preparation: sr,
      late_deliveries: ld,
      unassigned_orders: ua,
      total_problems: sp + sr + ld + ua,
      details,
    };
  }

  // ─── Advanced Analytics ───────────────────────────────────────────────────

  async getAdvancedAnalytics(userId: string, brandId: string | null, period?: { start?: string; end?: string }): Promise<Record<string, any>> {
    await this.ensureSchema();
    const brandClause = brandId ? "o.brand_id = ?" : "o.brand_id IS NULL";
    const params: any[] = brandId ? [userId, brandId] : [userId];

    const periodWhere: string[] = [];
    if (period?.start) {
      periodWhere.push("o.created_at >= ?");
      params.push(period.start);
    }
    if (period?.end) {
      periodWhere.push("o.created_at <= ?");
      params.push(period.end);
    }
    const periodClause = periodWhere.length > 0 ? ` AND ${periodWhere.join(" AND ")}` : "";

    // Summary totals
    const summary = await queryOne<any>(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS orders_today,
        SUM(o.valor_total) AS total_revenue,
        SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE THEN o.valor_total ELSE 0 END) AS revenue_today,
        AVG(NULLIF(o.valor_total, 0)) AS avg_ticket,
        SUM(CASE WHEN COALESCE(m.business_status, 'novo') = 'cancelado' THEN 1 ELSE 0 END) AS cancelled_count,
        SUM(CASE WHEN COALESCE(m.business_status, 'novo') = 'entregue' THEN 1 ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN COALESCE(m.business_status, 'novo') NOT IN ('entregue', 'cancelado') THEN 1 ELSE 0 END) AS active_count
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE o.user_id = ? AND ${brandClause}${periodClause}`,
      params
    );

    // Status breakdown
    const statusParams = brandId ? [userId, brandId] : [userId];
    const statusBreakdown = await query<any[]>(
      `SELECT
        COALESCE(m.business_status, 'novo') AS status,
        COUNT(*) AS count,
        SUM(o.valor_total) AS revenue
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE o.user_id = ? AND ${brandClause}
      GROUP BY COALESCE(m.business_status, 'novo')
      ORDER BY count DESC`,
      statusParams
    );

    // Channel breakdown
    const channelBreakdown = await query<any[]>(
      `SELECT
        COALESCE(m.channel, 'Site') AS channel,
        COUNT(*) AS count,
        SUM(o.valor_total) AS revenue
      FROM commerce_orders o
      LEFT JOIN order_management_meta m ON m.order_id = o.id
      WHERE o.user_id = ? AND ${brandClause}
      GROUP BY COALESCE(m.channel, 'Site')
      ORDER BY count DESC`,
      statusParams
    );

    // Daily revenue (last 30 days)
    const dailyRevenue = await query<any[]>(
      `SELECT
        DATE(o.created_at) AS date,
        COUNT(*) AS orders,
        SUM(o.valor_total) AS revenue
      FROM commerce_orders o
      WHERE o.user_id = ? AND ${brandClause}
        AND o.created_at >= (CURRENT_DATE - INTERVAL '30 days')
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC`,
      statusParams
    );

    // Top customers
    const topCustomers = await query<any[]>(
      `SELECT
        o.customer_name,
        o.customer_phone,
        COUNT(*) AS total_orders,
        SUM(o.valor_total) AS total_spent,
        AVG(o.valor_total) AS avg_ticket
      FROM commerce_orders o
      WHERE o.user_id = ? AND ${brandClause}
        AND COALESCE(o.customer_phone, '') <> ''
      GROUP BY o.customer_name, o.customer_phone
      ORDER BY total_spent DESC
      LIMIT 10`,
      statusParams
    );

    // Automation log stats
    const automationStats = await query<any[]>(
      `SELECT
        event, target, channel,
        COUNT(*) AS total_sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS total_failed
      FROM oms_automation_log
      WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
      GROUP BY event, target, channel
      ORDER BY total_sent DESC`,
      [userId, brandId || null]
    ).catch(() => []);

    // Responsible workload
    const responsibleWorkload = await query<any[]>(
      `SELECT
        r.responsible_name,
        r.role,
        COUNT(DISTINCT r.order_id) AS active_orders
      FROM oms_order_responsibles r
      WHERE r.user_id = ? AND (r.brand_id = ? OR r.brand_id IS NULL) AND r.is_active = TRUE
      GROUP BY r.responsible_name, r.role
      ORDER BY active_orders DESC`,
      [userId, brandId || null]
    ).catch(() => []);

    const totalOrders = Number(summary?.total_orders || 0);
    const deliveredCount = Number(summary?.delivered_count || 0);
    const cancelledCount = Number(summary?.cancelled_count || 0);

    return {
      summary: {
        total_orders: totalOrders,
        orders_today: Number(summary?.orders_today || 0),
        total_revenue: Number(summary?.total_revenue || 0),
        revenue_today: Number(summary?.revenue_today || 0),
        avg_ticket: Number(summary?.avg_ticket || 0),
        cancelled_count: cancelledCount,
        delivered_count: deliveredCount,
        active_count: Number(summary?.active_count || 0),
        delivery_rate: totalOrders > 0 ? Number(((deliveredCount / totalOrders) * 100).toFixed(1)) : 0,
        cancellation_rate: totalOrders > 0 ? Number(((cancelledCount / totalOrders) * 100).toFixed(1)) : 0,
      },
      status_breakdown: (statusBreakdown || []).map((row: any) => ({
        status: row.status,
        label: STATUS_LABELS[row.status as BusinessStatus] || row.status,
        count: Number(row.count || 0),
        revenue: Number(row.revenue || 0),
      })),
      channel_breakdown: channelBreakdown || [],
      daily_revenue: (dailyRevenue || []).map((row: any) => ({
        date: row.date,
        orders: Number(row.orders || 0),
        revenue: Number(row.revenue || 0),
      })),
      top_customers: (topCustomers || []).map((row: any) => ({
        name: row.customer_name,
        phone: row.customer_phone,
        total_orders: Number(row.total_orders || 0),
        total_spent: Number(row.total_spent || 0),
        avg_ticket: Number(row.avg_ticket || 0),
      })),
      automation_stats: automationStats || [],
      responsible_workload: responsibleWorkload || [],
    };
  }

  // ─── Notification Log ─────────────────────────────────────────────────────

  async getAutomationLog(userId: string, brandId: string | null, filters?: {
    orderId?: string;
    event?: string;
    target?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    await this.ensureSchema();
    const where: string[] = ["user_id = ?", "(brand_id = ? OR brand_id IS NULL)"];
    const params: any[] = [userId, brandId || null];

    if (filters?.orderId) {
      where.push("order_id = ?");
      params.push(filters.orderId);
    }
    if (filters?.event) {
      where.push("event = ?");
      params.push(filters.event);
    }
    if (filters?.target) {
      where.push("target = ?");
      params.push(filters.target);
    }

    const limit = Math.max(1, Math.min(200, Number(filters?.limit || 50)));
    const offset = Math.max(0, Number(filters?.offset || 0));

    const logs = await query<any[]>(
      `SELECT * FROM oms_automation_log
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM oms_automation_log WHERE ${where.join(" AND ")}`,
      params
    );

    return {
      logs: logs || [],
      total: Number(countRow?.total || 0),
    };
  }

  // ─── Build Order Variables for Templates ──────────────────────────────────

  buildOrderVariables(order: Record<string, any>, extras?: Record<string, any>): Record<string, any> {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsSummary = items.map((i: any) => `${i.quantidade || i.quantity || 1}x ${i.nome || i.name || "Produto"}`).join(", ");

    return {
      order_id: order.id || order.order_id || "",
      order_number: order.order_number || order.id?.slice(0, 8) || "",
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      customer_email: order.customer_email || "",
      total: Number(order.valor_total || order.total || 0),
      total_formatted: formatMoney(order.valor_total || order.total || 0),
      payment_method: order.forma_pagamento || order.payment_method || "",
      delivery_address: order.delivery_address || "",
      courier_name: order.courier_name || "",
      courier_phone: order.courier_phone || "",
      tracking_url: order.tracking_url || order.courier_route_url || "",
      delivery_token: order.delivery_token || "",
      estimated_delivery: order.estimated_delivery || "40 minutos",
      cancel_reason: order.cancel_reason || order.reason || "Não informado",
      confirmed_by: order.confirmed_by || order.delivery_confirmed_by || "",
      confirmed_via: order.confirmed_via || order.delivery_confirmed_via || "",
      items_summary: itemsSummary,
      created_at: order.created_at || new Date().toISOString(),
      status: order.business_status || order.status || "novo",
      status_label: STATUS_LABELS[(order.business_status || order.status || "novo") as BusinessStatus] || "",
      ...(extras || {}),
    };
  }
}
