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

export class ExpeditionService {
  async listDispatchers(userId: string): Promise<ExpeditionDispatcher[]> {
    return query<ExpeditionDispatcher[]>(
      `SELECT *
       FROM expedition_dispatchers
       WHERE user_id = ? AND is_active = TRUE
       ORDER BY created_at DESC`,
      [userId]
    );
  }

  async createDispatcher(
    userId: string,
    data: { company_id?: string; name: string; phone: string; notes?: string }
  ): Promise<ExpeditionDispatcher> {
    const id = randomUUID();
    await insert(
      `INSERT INTO expedition_dispatchers (id, user_id, company_id, name, phone, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [id, userId, data.company_id || null, data.name, data.phone, data.notes || null]
    );

    return (await this.getDispatcherById(userId, id))!;
  }

  async updateDispatcher(
    userId: string,
    dispatcherId: string,
    data: Partial<{ company_id: string; name: string; phone: string; notes: string; is_active: boolean }>
  ): Promise<ExpeditionDispatcher | null> {
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
      return this.getDispatcherById(userId, dispatcherId);
    }

    values.push(dispatcherId, userId);
    await update(
      `UPDATE expedition_dispatchers SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
      values
    );

    return this.getDispatcherById(userId, dispatcherId);
  }

  async deleteDispatcher(userId: string, dispatcherId: string): Promise<boolean> {
    const affected = await update(
      `UPDATE expedition_dispatchers
       SET is_active = FALSE
       WHERE id = ? AND user_id = ?`,
      [dispatcherId, userId]
    );

    return affected > 0;
  }

  async getDispatcherById(userId: string, dispatcherId: string): Promise<ExpeditionDispatcher | null> {
    return queryOne<ExpeditionDispatcher>(
      `SELECT *
       FROM expedition_dispatchers
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [dispatcherId, userId]
    );
  }

  async listOrders(userId: string): Promise<(ExpeditionOrder & { dispatcher_name: string; dispatcher_phone: string })[]> {
    return query<(ExpeditionOrder & { dispatcher_name: string; dispatcher_phone: string })[]>(
      `SELECT o.*, d.name as dispatcher_name, d.phone as dispatcher_phone
       FROM expedition_orders o
       JOIN expedition_dispatchers d ON d.id = o.dispatcher_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [userId]
    );
  }

  async createOrder(
    userId: string,
    input: {
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
        id, user_id, company_id, dispatcher_id, whatsapp_instance_id,
        customer_name, customer_phone, delivery_address, items_json,
        subtotal, discount, shipping_fee, total, notes,
        status, whatsapp_status, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
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

    return (await queryOne<ExpeditionOrder>(
      `SELECT * FROM expedition_orders WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    )) as ExpeditionOrder;
  }
}
