import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";

export type ExpeditionDispatcher = {
  id: string;
  user_id: string;
  company_id?: string;
  name: string;
  phone: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ExpeditionOrderItem = {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string;
};

export type ExpeditionOrder = {
  id: string;
  user_id: string;
  company_id?: string;
  dispatcher_id: string;
  whatsapp_instance_id: string;
  customer_name: string;
  customer_phone?: string;
  delivery_address?: string;
  items_json: string;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  notes?: string;
  status: "created" | "sent" | "confirmed" | "shipped" | "delivered" | "cancelled";
  whatsapp_status: "pending" | "sent" | "failed";
  sent_at?: string;
  created_at: string;
  updated_at: string;
};

export type ExpeditionEventType = "order_created" | "order_paid" | "order_updated" | "order_cancelled";

export type LogisticStatus =
  | "aguardando_separacao"
  | "em_separacao"
  | "pronto_para_envio"
  | "em_rota"
  | "entregue"
  | "falha_entrega";

export type DispatchStatusRow = {
  order_id: string;
  user_id: string;
  brand_id?: string | null;
  logistic_status: LogisticStatus;
  assigned_to?: string | null;
  estimated_delivery?: string | null;
  route_id?: string | null;
  route_link?: string | null;
  updated_at: string;
};

export type DispatchMessageLogRow = {
  id: string;
  order_id: string;
  user_id: string;
  brand_id?: string | null;
  message_type: "customer" | "internal" | "courier";
  event_type?: string | null;
  sent_to?: string | null;
  instance_id?: string | null;
  status: "queued" | "sent" | "skipped" | "failed";
  payload_json?: string | null;
  created_at: string;
};

export class ExpeditionService {
  private schemaChecked = false;

  private async ensureBrandColumns(): Promise<void> {
    if (this.schemaChecked) return;

    const dispatcherBrand = await query<any[]>("SHOW COLUMNS FROM expedition_dispatchers LIKE 'brand_id'");
    if (!dispatcherBrand.length) {
      await query("ALTER TABLE expedition_dispatchers ADD COLUMN brand_id VARCHAR(36) NULL");
    }

    const orderBrand = await query<any[]>("SHOW COLUMNS FROM expedition_orders LIKE 'brand_id'");
    if (!orderBrand.length) {
      await query("ALTER TABLE expedition_orders ADD COLUMN brand_id VARCHAR(36) NULL");
    }

    await query(`
      CREATE TABLE IF NOT EXISTS order_dispatch_status (
        order_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        logistic_status ENUM('aguardando_separacao','em_separacao','pronto_para_envio','em_rota','entregue','falha_entrega') NOT NULL DEFAULT 'aguardando_separacao',
        assigned_to VARCHAR(36) NULL,
        estimated_delivery DATETIME NULL,
        route_id VARCHAR(64) NULL,
        route_link TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (order_id),
        KEY idx_dispatch_status_user_brand (user_id, brand_id, logistic_status),
        KEY idx_dispatch_status_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS order_dispatch_message_log (
        id VARCHAR(36) PRIMARY KEY,
        order_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NULL,
        message_type ENUM('customer','internal','courier') NOT NULL,
        event_type VARCHAR(60) NULL,
        sent_to VARCHAR(80) NULL,
        instance_id VARCHAR(64) NULL,
        status ENUM('queued','sent','skipped','failed') NOT NULL DEFAULT 'queued',
        payload_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_dispatch_log_order (order_id),
        KEY idx_dispatch_log_user_brand (user_id, brand_id, message_type),
        KEY idx_dispatch_log_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS expedition_settings (
        user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL DEFAULT '',
        notify_customer_paid TINYINT(1) NOT NULL DEFAULT 1,
        notify_customer_separation TINYINT(1) NOT NULL DEFAULT 1,
        notify_customer_route TINYINT(1) NOT NULL DEFAULT 1,
        notify_customer_delivered TINYINT(1) NOT NULL DEFAULT 1,
        notify_internal_paid TINYINT(1) NOT NULL DEFAULT 1,
        notify_courier_route TINYINT(1) NOT NULL DEFAULT 1,
        internal_phone VARCHAR(80) NULL,
        logistics_instance_id VARCHAR(64) NULL,
        template_customer_paid TEXT NULL,
        template_internal_paid TEXT NULL,
        template_courier_route TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, brand_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await query("UPDATE expedition_settings SET brand_id = '' WHERE brand_id IS NULL").catch(() => undefined);
    await query("ALTER TABLE expedition_settings MODIFY COLUMN brand_id VARCHAR(36) NOT NULL DEFAULT ''").catch(() => undefined);

    this.schemaChecked = true;
  }

  private sanitizePhone(phone?: string | null): string {
    return String(phone || "").replace(/\D/g, "");
  }

  private mapsLinkByAddress(address?: string | null): string | null {
    const normalized = String(address || "").trim();
    if (!normalized) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(normalized)}`;
  }

  private defaultTemplates() {
    return {
      customer_paid:
        "Olá {{nome}} 👋\nRecebemos seu pedido #{{numero}} com sucesso!\n\n🛍 Produto(s): {{produtos}}\n💰 Valor: R$ {{valor_total}}\n💳 Forma de pagamento: {{metodo_pagamento}}\n📍 Endereço de entrega: {{endereco}}\n\nEstamos preparando seu pedido. Avisaremos quando sair para entrega 🚚",
      internal_paid:
        "📦 NOVO PEDIDO\nCliente: {{nome}}\nProduto(s): {{produtos}}\nPagamento: {{metodo_pagamento}}\nValor: R$ {{valor_total}}\nEntrega: {{endereco}}\nObservações: {{observacoes}}",
      courier_route:
        "🚚 Nova Entrega\nCliente: {{nome}}\nEndereço: {{endereco}}\nPedido: {{produtos}}\nContato: {{telefone}}\nPagamento: {{metodo_pagamento}}\nValor: R$ {{valor_total}}\n\nLink da rota: {{google_maps_link}}",
    };
  }

  private applyTemplate(template: string, vars: Record<string, string>): string {
    let output = String(template || "");
    for (const [key, value] of Object.entries(vars)) {
      output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, "gi"), String(value || ""));
    }
    return output;
  }

  private parseItems(itemsJson: string): ExpeditionOrderItem[] {
    try {
      const parsed = JSON.parse(String(itemsJson || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private formatMoney(value: number): string {
    return Number(value || 0).toFixed(2).replace(".", ",");
  }

  private async upsertDispatchStatus(
    userId: string,
    brandId: string | null | undefined,
    orderId: string,
    status: LogisticStatus,
    patch?: Partial<Pick<DispatchStatusRow, "assigned_to" | "estimated_delivery" | "route_id" | "route_link">>
  ): Promise<void> {
    await this.ensureBrandColumns();
    const normalizedBrandId = String(brandId || "").trim() || null;

    await query(
      `INSERT INTO order_dispatch_status (
        order_id, user_id, brand_id, logistic_status, assigned_to, estimated_delivery, route_id, route_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        logistic_status = VALUES(logistic_status),
        assigned_to = COALESCE(VALUES(assigned_to), assigned_to),
        estimated_delivery = COALESCE(VALUES(estimated_delivery), estimated_delivery),
        route_id = COALESCE(VALUES(route_id), route_id),
        route_link = COALESCE(VALUES(route_link), route_link),
        updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        userId,
        normalizedBrandId,
        status,
        patch?.assigned_to || null,
        patch?.estimated_delivery || null,
        patch?.route_id || null,
        patch?.route_link || null,
      ]
    );
  }

  private async logDispatchMessage(input: {
    orderId: string;
    userId: string;
    brandId?: string | null;
    messageType: "customer" | "internal" | "courier";
    eventType?: string | null;
    sentTo?: string | null;
    instanceId?: string | null;
    status: "queued" | "sent" | "skipped" | "failed";
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureBrandColumns();
    await query(
      `INSERT INTO order_dispatch_message_log (
        id, order_id, user_id, brand_id, message_type, event_type, sent_to, instance_id, status, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.orderId,
        input.userId,
        String(input.brandId || "").trim() || null,
        input.messageType,
        input.eventType || null,
        input.sentTo || null,
        input.instanceId || null,
        input.status,
        input.payload ? JSON.stringify(input.payload) : null,
      ]
    );
  }

  async getOrderById(userId: string, orderId: string, brandId?: string | null): Promise<ExpeditionOrder | null> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    return queryOne<ExpeditionOrder>(
      `SELECT * FROM expedition_orders WHERE id = ? AND user_id = ? AND ${brand.sql} LIMIT 1`,
      [orderId, userId, ...brand.params]
    );
  }

  private buildBrandWhere(brandId?: string | null): { sql: string; params: any[] } {
    const normalized = String(brandId || "").trim();
    if (!normalized) {
      return { sql: "(brand_id = '' OR brand_id IS NULL)", params: [] };
    }
    return { sql: "brand_id = ?", params: [normalized] };
  }

  async listDispatchers(userId: string, brandId?: string | null): Promise<ExpeditionDispatcher[]> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    return query<ExpeditionDispatcher[]>(
      `SELECT *
       FROM expedition_dispatchers
       WHERE user_id = ? AND ${brand.sql} AND is_active = TRUE
       ORDER BY created_at DESC`,
      [userId, ...brand.params]
    );
  }

  async createDispatcher(
    userId: string,
    data: { company_id?: string; name: string; phone: string; notes?: string },
    brandId?: string | null
  ): Promise<ExpeditionDispatcher> {
    await this.ensureBrandColumns();
    const id = randomUUID();
    const normalizedBrandId = String(brandId || "").trim() || null;
    await insert(
      `INSERT INTO expedition_dispatchers (id, user_id, brand_id, company_id, name, phone, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [id, userId, normalizedBrandId, data.company_id || null, data.name, data.phone, data.notes || null]
    );

    return (await this.getDispatcherById(userId, id, brandId))!;
  }

  async updateDispatcher(
    userId: string,
    dispatcherId: string,
    data: Partial<{ company_id: string; name: string; phone: string; notes: string; is_active: boolean }>,
    brandId?: string | null
  ): Promise<ExpeditionDispatcher | null> {
    await this.ensureBrandColumns();
    const fields: string[] = [];
    const values: any[] = [];

    if (data.company_id !== undefined) {
      fields.push("company_id = ?");
      values.push(data.company_id || null);
    }
    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push("phone = ?");
      values.push(data.phone);
    }
    if (data.notes !== undefined) {
      fields.push("notes = ?");
      values.push(data.notes || null);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active);
    }

    if (fields.length === 0) {
      return this.getDispatcherById(userId, dispatcherId, brandId);
    }

    const brand = this.buildBrandWhere(brandId);
    values.push(dispatcherId, userId, ...brand.params);
    await update(
      `UPDATE expedition_dispatchers SET ${fields.join(", ")} WHERE id = ? AND user_id = ? AND ${brand.sql}`,
      values
    );

    return this.getDispatcherById(userId, dispatcherId, brandId);
  }

  async deleteDispatcher(userId: string, dispatcherId: string, brandId?: string | null): Promise<boolean> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    const affected = await update(
      `UPDATE expedition_dispatchers
       SET is_active = FALSE
       WHERE id = ? AND user_id = ? AND ${brand.sql}`,
      [dispatcherId, userId, ...brand.params]
    );

    return affected > 0;
  }

  async getDispatcherById(userId: string, dispatcherId: string, brandId?: string | null): Promise<ExpeditionDispatcher | null> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    return queryOne<ExpeditionDispatcher>(
      `SELECT *
       FROM expedition_dispatchers
       WHERE id = ? AND user_id = ? AND ${brand.sql}
       LIMIT 1`,
      [dispatcherId, userId, ...brand.params]
    );
  }

  async listOrders(userId: string, brandId?: string | null): Promise<(ExpeditionOrder & { dispatcher_name: string; dispatcher_phone: string })[]> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    return query<(ExpeditionOrder & { dispatcher_name: string; dispatcher_phone: string })[]>(
      `SELECT o.*, d.name as dispatcher_name, d.phone as dispatcher_phone
       FROM expedition_orders o
       JOIN expedition_dispatchers d ON d.id = o.dispatcher_id
       WHERE o.user_id = ? AND o.${brand.sql}
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [userId, ...brand.params]
    );
  }

  async getDispatchStatus(userId: string, orderId: string, brandId?: string | null): Promise<DispatchStatusRow | null> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);
    return queryOne<DispatchStatusRow>(
      `SELECT * FROM order_dispatch_status WHERE order_id = ? AND user_id = ? AND ${brand.sql} LIMIT 1`,
      [orderId, userId, ...brand.params]
    );
  }

  async getDispatchDashboard(userId: string, brandId?: string | null): Promise<{
    pending: number;
    separacao: number;
    em_rota: number;
    entregues_hoje: number;
    sla_medio_horas: number | null;
    tempo_medio_entrega_horas: number | null;
  }> {
    await this.ensureBrandColumns();
    const brand = this.buildBrandWhere(brandId);

    const counts = await query<any[]>(
      `SELECT
        SUM(CASE WHEN logistic_status = 'aguardando_separacao' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN logistic_status = 'em_separacao' THEN 1 ELSE 0 END) AS separacao,
        SUM(CASE WHEN logistic_status = 'em_rota' THEN 1 ELSE 0 END) AS em_rota,
        SUM(CASE WHEN logistic_status = 'entregue' AND DATE(updated_at) = CURDATE() THEN 1 ELSE 0 END) AS entregues_hoje,
        AVG(TIMESTAMPDIFF(HOUR, o.created_at, s.updated_at)) AS tempo_medio_entrega_horas
       FROM order_dispatch_status s
       JOIN expedition_orders o ON o.id = s.order_id
       WHERE s.user_id = ? AND ${brand.sql}`,
      [userId, ...brand.params]
    );

    const row = counts[0] || {};
    const tempoEntrega = Number(row.tempo_medio_entrega_horas);

    return {
      pending: Number(row.pending || 0),
      separacao: Number(row.separacao || 0),
      em_rota: Number(row.em_rota || 0),
      entregues_hoje: Number(row.entregues_hoje || 0),
      sla_medio_horas: Number.isFinite(tempoEntrega) ? Number(tempoEntrega.toFixed(2)) : null,
      tempo_medio_entrega_horas: Number.isFinite(tempoEntrega) ? Number(tempoEntrega.toFixed(2)) : null,
    };
  }

  async processOrderEvent(userId: string, brandId: string | null | undefined, orderId: string, event: ExpeditionEventType): Promise<{
    order: ExpeditionOrder;
    dispatch_status: DispatchStatusRow | null;
    message_preview: {
      customer: string;
      internal: string;
      courier: string;
    };
  }> {
    await this.ensureBrandColumns();
    const order = await this.getOrderById(userId, orderId, brandId);
    if (!order) {
      throw new Error("Pedido de expedição não encontrado");
    }

    if (event === "order_cancelled") {
      await this.logDispatchMessage({
        orderId,
        userId,
        brandId,
        messageType: "customer",
        eventType: event,
        status: "skipped",
        payload: { reason: "order_cancelled" },
      });
      await this.upsertDispatchStatus(userId, brandId, orderId, "falha_entrega");
    } else if (event === "order_paid") {
      await this.upsertDispatchStatus(userId, brandId, orderId, "aguardando_separacao");
    } else if (event === "order_updated") {
      const current = await this.getDispatchStatus(userId, orderId, brandId);
      await this.upsertDispatchStatus(userId, brandId, orderId, current?.logistic_status || "aguardando_separacao");
    } else {
      await this.upsertDispatchStatus(userId, brandId, orderId, "aguardando_separacao");
    }

    const preview = await this.renderOrderMessages(userId, orderId, brandId);
    const dispatchStatus = await this.getDispatchStatus(userId, orderId, brandId);

    return {
      order,
      dispatch_status: dispatchStatus,
      message_preview: preview,
    };
  }

  async updateLogisticStatus(
    userId: string,
    brandId: string | null | undefined,
    orderId: string,
    payload: Partial<{
      logistic_status: LogisticStatus;
      assigned_to: string;
      estimated_delivery: string;
      route_id: string;
      route_link: string;
      lat: number;
      lng: number;
    }>
  ): Promise<DispatchStatusRow> {
    await this.ensureBrandColumns();
    const order = await this.getOrderById(userId, orderId, brandId);
    if (!order) throw new Error("Pedido de expedição não encontrado");

    const current = await this.getDispatchStatus(userId, orderId, brandId);
    const status = (payload.logistic_status || current?.logistic_status || "aguardando_separacao") as LogisticStatus;

    let routeLink = String(payload.route_link || "").trim() || current?.route_link || null;
    if (!routeLink && Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lng))) {
      routeLink = `https://www.google.com/maps/dir/?api=1&destination=${Number(payload.lat)},${Number(payload.lng)}`;
    }
    if (!routeLink && status === "em_rota") {
      routeLink = this.mapsLinkByAddress(order.delivery_address);
    }

    await this.upsertDispatchStatus(userId, brandId, orderId, status, {
      assigned_to: payload.assigned_to,
      estimated_delivery: payload.estimated_delivery,
      route_id: payload.route_id,
      route_link: routeLink,
    });

    if (status === "em_rota") {
      await this.logDispatchMessage({
        orderId,
        userId,
        brandId,
        messageType: "courier",
        eventType: "status_em_rota",
        status: "queued",
        payload: { route_link: routeLink },
      });
    }

    const updated = await this.getDispatchStatus(userId, orderId, brandId);
    if (!updated) throw new Error("Falha ao atualizar status logístico");
    return updated;
  }

  async renderOrderMessages(userId: string, orderId: string, brandId?: string | null): Promise<{
    customer: string;
    internal: string;
    courier: string;
  }> {
    await this.ensureBrandColumns();
    const order = await this.getOrderById(userId, orderId, brandId);
    if (!order) throw new Error("Pedido de expedição não encontrado");

    const settings = await queryOne<any>(
      `SELECT * FROM expedition_settings WHERE user_id = ? AND ${this.buildBrandWhere(brandId).sql} LIMIT 1`,
      [userId, ...this.buildBrandWhere(brandId).params]
    );

    const templates = this.defaultTemplates();
    const items = this.parseItems(order.items_json || "[]");
    const productNames = items.map((item) => String(item.name || "").trim()).filter(Boolean).join(", ") || "Itens do pedido";
    const routeLink = this.mapsLinkByAddress(order.delivery_address);

    const vars = {
      nome: String(order.customer_name || "Cliente"),
      numero: String(order.id).slice(0, 8).toUpperCase(),
      produtos: productNames,
      valor_total: this.formatMoney(Number(order.total || 0)),
      metodo_pagamento: "A confirmar",
      endereco: String(order.delivery_address || "Não informado"),
      observacoes: String(order.notes || "-"),
      telefone: this.sanitizePhone(order.customer_phone),
      google_maps_link: routeLink || "-",
    };

    return {
      customer: this.applyTemplate(
        String(settings?.template_customer_paid || templates.customer_paid),
        vars
      ),
      internal: this.applyTemplate(
        String(settings?.template_internal_paid || templates.internal_paid),
        vars
      ),
      courier: this.applyTemplate(
        String(settings?.template_courier_route || templates.courier_route),
        vars
      ),
    };
  }

  async createOrder(
    userId: string,
    input: {
      brand_id?: string;
      company_id?: string;
      dispatcher_id: string;
      whatsapp_instance_id: string;
      customer_name: string;
      customer_phone?: string;
      delivery_address?: string;
      items: ExpeditionOrderItem[];
      discount?: number;
      shipping_fee?: number;
      notes?: string;
      status?: ExpeditionOrder["status"];
      whatsapp_status?: ExpeditionOrder["whatsapp_status"];
      sent_at?: string | null;
    }
  ): Promise<ExpeditionOrder> {
    await this.ensureBrandColumns();
    const id = randomUUID();
    const normalizedItems = input.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || Number(item.quantity || 0) * Number(item.unitPrice || 0)),
      notes: item.notes,
    }));

    const subtotal = normalizedItems.reduce((acc, item) => acc + item.total, 0);
    const discount = Number(input.discount || 0);
    const shippingFee = Number(input.shipping_fee || 0);
    const total = subtotal - discount + shippingFee;

    await insert(
      `INSERT INTO expedition_orders (
        id, user_id, brand_id, company_id, dispatcher_id, whatsapp_instance_id,
        customer_name, customer_phone, delivery_address, items_json,
        subtotal, discount, shipping_fee, total, notes,
        status, whatsapp_status, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        id,
        userId,
        String(input.brand_id || "").trim() || null,
        input.company_id || null,
        input.dispatcher_id,
        input.whatsapp_instance_id,
        input.customer_name,
        input.customer_phone || null,
        input.delivery_address || null,
        JSON.stringify(normalizedItems),
        subtotal,
        discount,
        shippingFee,
        total,
        input.notes || null,
        input.status || "created",
        input.whatsapp_status || "pending",
        input.sent_at || null,
      ]
    );

    const brand = this.buildBrandWhere(input.brand_id);
    const created = (await queryOne<ExpeditionOrder>(
      `SELECT * FROM expedition_orders WHERE id = ? AND user_id = ? AND ${brand.sql} LIMIT 1`,
      [id, userId, ...brand.params]
    )) as ExpeditionOrder;

    await this.upsertDispatchStatus(userId, input.brand_id || null, id, "aguardando_separacao");

    return created;
  }
}
