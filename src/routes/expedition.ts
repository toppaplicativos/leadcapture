import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { ExpeditionEventType, ExpeditionOrderItem, ExpeditionService, LogisticStatus } from "../services/expedition";
import { queryOne } from "../config/database";
import { logger } from "../utils/logger";

const router = Router();
const expeditionService = new ExpeditionService();

router.use(authMiddleware, requireBrandContext);

function toMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatOrderForDispatcher(input: {
  orderId: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  items: ExpeditionOrderItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  notes?: string;
}): string {
  const lines = [
    `📦 *NOVO PEDIDO DE EXPEDICAO*`,
    `Pedido: ${input.orderId}`,
    `Cliente: ${input.customerName}`,
    input.customerPhone ? `Contato: ${input.customerPhone}` : "",
    input.deliveryAddress ? `Entrega: ${input.deliveryAddress}` : "",
    "",
    "Itens:",
    ...input.items.map(
      (item, idx) =>
        `${idx + 1}. ${item.name} | Qtd: ${item.quantity} | Unit: ${toMoney(item.unitPrice)} | Total: ${toMoney(item.total)}`
    ),
    "",
    `Subtotal: ${toMoney(input.subtotal)}`,
    `Desconto: ${toMoney(input.discount)}`,
    `Frete: ${toMoney(input.shippingFee)}`,
    `*Total: ${toMoney(input.total)}*`,
    input.notes ? `Obs: ${input.notes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

async function instanceBelongsToUser(instanceId: string, userId: string, brandId?: string | null): Promise<boolean> {
  const normalizedBrandId = String(brandId || "").trim();
  const brandClause = normalizedBrandId ? " AND brand_id = ?" : " AND brand_id IS NULL";
  const params = normalizedBrandId ? [instanceId, userId, normalizedBrandId] : [instanceId, userId];
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_instances WHERE id = ? AND created_by = ?${brandClause} LIMIT 1`,
    params
  );
  return !!row;
}

router.get("/dispatchers", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const dispatchers = await expeditionService.listDispatchers(userId, req.brandId);
    res.json({ success: true, dispatchers });
  } catch (error: any) {
    logger.error(error, "Error listing dispatchers");
    res.status(500).json({ error: error.message });
  }
});

router.post("/dispatchers", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { company_id, name, phone, notes } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Nome do expedidor obrigatorio" });
    if (!phone || !String(phone).trim()) return res.status(400).json({ error: "Telefone do expedidor obrigatorio" });

    const dispatcher = await expeditionService.createDispatcher(userId, {
      company_id: company_id ? String(company_id) : undefined,
      name: String(name).trim(),
      phone: String(phone).trim(),
      notes: notes ? String(notes).trim() : undefined,
    }, req.brandId);

    res.status(201).json({ success: true, dispatcher });
  } catch (error: any) {
    logger.error(error, "Error creating dispatcher");
    res.status(500).json({ error: error.message });
  }
});

router.put("/dispatchers/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const dispatcher = await expeditionService.updateDispatcher(userId, String(req.params.id), req.body || {}, req.brandId);
    if (!dispatcher) return res.status(404).json({ error: "Expedidor nao encontrado" });

    res.json({ success: true, dispatcher });
  } catch (error: any) {
    logger.error(error, "Error updating dispatcher");
    res.status(500).json({ error: error.message });
  }
});

router.delete("/dispatchers/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const ok = await expeditionService.deleteDispatcher(userId, String(req.params.id), req.brandId);
    if (!ok) return res.status(404).json({ error: "Expedidor nao encontrado" });

    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting dispatcher");
    res.status(500).json({ error: error.message });
  }
});

router.get("/orders", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const orders = await expeditionService.listOrders(userId, req.brandId);
    res.json({ success: true, orders });
  } catch (error: any) {
    logger.error(error, "Error listing expedition orders");
    res.status(500).json({ error: error.message });
  }
});

router.get("/dashboard", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const metrics = await expeditionService.getDispatchDashboard(userId, req.brandId);
    res.json({ success: true, metrics });
  } catch (error: any) {
    logger.error(error, "Error fetching expedition dashboard");
    res.status(500).json({ error: error.message });
  }
});

router.get("/orders/:id/logistic", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatorio" });

    const status = await expeditionService.getDispatchStatus(userId, orderId, req.brandId);
    if (!status) return res.status(404).json({ error: "Status logistico nao encontrado" });

    res.json({ success: true, status });
  } catch (error: any) {
    logger.error(error, "Error fetching logistic status");
    res.status(500).json({ error: error.message });
  }
});

router.patch("/orders/:id/logistic-status", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatorio" });

    const status = req.body?.logistic_status as LogisticStatus | undefined;
    const allowedStatus: LogisticStatus[] = [
      "aguardando_separacao",
      "em_separacao",
      "pronto_para_envio",
      "em_rota",
      "entregue",
      "falha_entrega",
    ];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ error: "logistic_status invalido" });
    }

    const updated = await expeditionService.updateLogisticStatus(userId, req.brandId, orderId, req.body || {});
    res.json({ success: true, status: updated });
  } catch (error: any) {
    logger.error(error, "Error updating logistic status");
    res.status(500).json({ error: error.message });
  }
});

router.post("/orders/:id/events", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const orderId = String(req.params.id || "").trim();
    const event = String(req.body?.event || "").trim() as ExpeditionEventType;
    const allowedEvents: ExpeditionEventType[] = ["order_created", "order_paid", "order_updated", "order_cancelled"];

    if (!orderId) return res.status(400).json({ error: "order_id obrigatorio" });
    if (!allowedEvents.includes(event)) return res.status(400).json({ error: "event invalido" });

    const result = await expeditionService.processOrderEvent(userId, req.brandId, orderId, event);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error(error, "Error processing expedition event");
    res.status(500).json({ error: error.message });
  }
});

router.get("/orders/:id/messages-preview", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const orderId = String(req.params.id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id obrigatorio" });

    const messages = await expeditionService.renderOrderMessages(userId, orderId, req.brandId);
    res.json({ success: true, messages });
  } catch (error: any) {
    logger.error(error, "Error rendering order messages preview");
    res.status(500).json({ error: error.message });
  }
});

router.post("/orders", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      company_id,
      dispatcher_id,
      whatsapp_instance_id,
      customer_name,
      customer_phone,
      delivery_address,
      items,
      discount,
      shipping_fee,
      notes,
    } = req.body || {};

    if (!dispatcher_id) return res.status(400).json({ error: "Expedidor obrigatorio" });
    if (!whatsapp_instance_id) return res.status(400).json({ error: "Instancia WhatsApp obrigatoria" });
    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ error: "Nome do cliente obrigatorio" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Pedido precisa de pelo menos 1 item" });
    }

    const dispatcher = await expeditionService.getDispatcherById(userId, String(dispatcher_id), req.brandId);
    if (!dispatcher) return res.status(404).json({ error: "Expedidor nao encontrado" });

    const allowedInstance = await instanceBelongsToUser(String(whatsapp_instance_id), userId, req.brandId);
    if (!allowedInstance) return res.status(404).json({ error: "Instancia WhatsApp nao encontrada" });

    const parsedItems: ExpeditionOrderItem[] = items
      .map((item: any) => ({
        productId: item.productId ? String(item.productId) : undefined,
        name: String(item.name || "").trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        total: Number(item.total || Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        notes: item.notes ? String(item.notes) : undefined,
      }))
      .filter((item: ExpeditionOrderItem) => item.name && item.quantity > 0);

    if (parsedItems.length === 0) {
      return res.status(400).json({ error: "Itens invalidos para o pedido" });
    }

    const subtotal = parsedItems.reduce((acc, item) => acc + item.total, 0);
    const discountValue = Number(discount || 0);
    const shippingValue = Number(shipping_fee || 0);
    const total = subtotal - discountValue + shippingValue;

    const orderPreviewId = `PED-${Date.now().toString().slice(-8)}`;
    const dispatcherMessage = formatOrderForDispatcher({
      orderId: orderPreviewId,
      customerName: String(customer_name).trim(),
      customerPhone: customer_phone ? String(customer_phone) : undefined,
      deliveryAddress: delivery_address ? String(delivery_address) : undefined,
      items: parsedItems,
      subtotal,
      discount: discountValue,
      shippingFee: shippingValue,
      total,
      notes: notes ? String(notes) : undefined,
    });

    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    const sent = await instanceManager.sendMessage(
      String(whatsapp_instance_id),
      dispatcher.phone,
      dispatcherMessage
    );

    const order = await expeditionService.createOrder(userId, {
      brand_id: req.brandId || undefined,
      company_id: company_id ? String(company_id) : undefined,
      dispatcher_id: String(dispatcher_id),
      whatsapp_instance_id: String(whatsapp_instance_id),
      customer_name: String(customer_name).trim(),
      customer_phone: customer_phone ? String(customer_phone).trim() : undefined,
      delivery_address: delivery_address ? String(delivery_address).trim() : undefined,
      items: parsedItems,
      discount: discountValue,
      shipping_fee: shippingValue,
      notes: notes ? String(notes).trim() : undefined,
      status: sent ? "sent" : "created",
      whatsapp_status: sent ? "sent" : "failed",
      sent_at: sent ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
    });

    if (!sent) {
      return res.status(207).json({
        success: true,
        warning: "Pedido criado, mas envio ao expedidor falhou. Verifique se o numero esta no WhatsApp.",
        order,
      });
    }

    res.status(201).json({ success: true, order });
  } catch (error: any) {
    logger.error(error, "Error creating expedition order");
    res.status(500).json({ error: error.message });
  }
});

export default router;
