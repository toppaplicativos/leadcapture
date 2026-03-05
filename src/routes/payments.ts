import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { PaymentConfigService, PaymentMethodType } from "../services/paymentConfig";
import { getGatewayAdapter } from "../services/paymentGatewayAdapters";
import { CommerceService } from "../services/commerce";
import { queryOne } from "../config/database";

const router = Router();
const publicRouter = Router();
const paymentConfig = new PaymentConfigService();
const commerceService = new CommerceService();

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

async function sendPostSaleNotifications(
  req: any,
  payload: {
    order: {
      id: string;
      user_id: string;
      brand_id?: string | null;
      instance_id?: string | null;
      customer_name?: string | null;
      customer_phone?: string | null;
      valor_total?: number;
    };
    items: Array<{ nome: string; quantidade: number; valor_total: number }>;
  }
): Promise<void> {
  const instanceManager = req.app.get("instanceManager");
  if (!instanceManager) return;

  const instanceId = String(payload.order.instance_id || "").trim();
  if (!instanceId) return;

  const customerPhone = normalizePhone(payload.order.customer_phone);
  if (customerPhone) {
    const customerMessage = [
      `✅ *Pagamento confirmado!*`,
      `Pedido #${String(payload.order.id || "").slice(0, 8)}`,
      `Valor: R$ ${Number(payload.order.valor_total || 0).toFixed(2)}`,
      "Recebemos seu pedido e já iniciamos a separação.",
      "Obrigado pela compra!",
    ].join("\n");
    await instanceManager.sendMessage(instanceId, customerPhone, customerMessage).catch(() => undefined);
  }

  const dispatcher = await queryOne<{ name: string; phone: string }>(
    `SELECT name, phone
     FROM expedition_dispatchers
     WHERE user_id = ?
       AND ${(payload.order.brand_id ? "brand_id = ?" : "(brand_id IS NULL OR brand_id = '')")}
       AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    payload.order.brand_id
      ? [payload.order.user_id, String(payload.order.brand_id)]
      : [payload.order.user_id]
  );

  const dispatcherPhone = normalizePhone(dispatcher?.phone);
  if (!dispatcherPhone) return;

  const compactItems = (payload.items || [])
    .slice(0, 5)
    .map((item) => `• ${item.quantidade}x ${item.nome} (R$ ${Number(item.valor_total || 0).toFixed(2)})`)
    .join("\n");

  const dispatcherMessage = [
    `📦 *NOVO PEDIDO PAGO*`,
    `Pedido #${String(payload.order.id || "").slice(0, 8)}`,
    `Cliente: ${String(payload.order.customer_name || "Não informado")}`,
    `Telefone: ${String(payload.order.customer_phone || "Não informado")}`,
    `Valor: R$ ${Number(payload.order.valor_total || 0).toFixed(2)}`,
    compactItems || "Itens: consultar painel",
    "Status: pronto para expedição.",
  ].join("\n");

  await instanceManager.sendMessage(instanceId, dispatcherPhone, dispatcherMessage).catch(() => undefined);
}

router.use(requireBrandContext);

function getAccountId(req: BrandRequest): string | null {
  const userId = req.user?.userId as string | undefined;
  if (!userId) return null;
  const brandId = String(req.brandId || "").trim();
  if (!brandId) return null;
  return `${String(userId)}::${brandId}`;
}

function ensureAccountId(req: BrandRequest, res: Response): string | null {
  const accountId = getAccountId(req);
  if (!accountId) {
    res.status(400).json({ error: "brand_id is required. Selecione uma Brand ativa para configurar pagamentos." });
    return null;
  }
  return accountId;
}

function normalizeMethod(value: unknown): PaymentMethodType {
  const v = String(value || "").trim().toLowerCase();
  if (v === "pix") return "pix";
  if (["card", "cartao", "cartão", "credit_card"].includes(v)) return "card";
  if (v === "boleto") return "boleto";
  return "wallet";
}

router.get("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const settings = await paymentConfig.getSettings(accountId);
    const gateways = await paymentConfig.listGateways(accountId, false);
    const methods = await paymentConfig.listMethodConfigs(accountId);

    res.json({ success: true, settings, gateways, methods });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load payment settings" });
  }
});

router.put("/settings", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const settings = await paymentConfig.updateSettings(accountId, req.body || {});
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update payment settings" });
  }
});

router.get("/gateways", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const gateways = await paymentConfig.listGateways(accountId, false);
    res.json({ success: true, gateways });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list gateways" });
  }
});

router.post("/gateways", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const gateway = await paymentConfig.saveGateway(accountId, req.body || {});
    res.json({ success: true, gateway });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("obrigatório")) return res.status(400).json({ error: message });
    res.status(500).json({ error: message || "Failed to save gateway" });
  }
});

router.post("/gateways/:id/test", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const gatewayId = String(req.params.id);
    const gateways = await paymentConfig.listGateways(accountId, true);
    const gateway = gateways.find((item) => String(item.id) === gatewayId);
    if (!gateway) return res.status(404).json({ error: "Gateway não encontrado" });

    const adapter = getGatewayAdapter(gateway.gateway_name, gateway.environment, {
      publicKey: gateway.public_key || null,
      secretKey: gateway.secret_key || null,
      webhookSecret: gateway.webhook_secret || null,
    });

    const result = adapter.testConnection
      ? await adapter.testConnection()
      : await paymentConfig.testGateway(accountId, gatewayId);

    res.json({ success: result.ok, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to test gateway" });
  }
});

router.get("/methods", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const methods = await paymentConfig.listMethodConfigs(accountId);
    res.json({ success: true, methods });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list methods" });
  }
});

router.put("/methods/:type", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const type = normalizeMethod(req.params.type);
    const method = await paymentConfig.upsertMethodConfig(accountId, type, req.body || {});
    res.json({ success: true, method });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update method config" });
  }
});

router.get("/pix/settings", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const pix = await paymentConfig.getPixSettings(accountId);
    res.json({ success: true, pix });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load PIX settings" });
  }
});

router.put("/pix/settings", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const pix = await paymentConfig.updatePixSettings(accountId, req.body || {});
    res.json({ success: true, pix });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("obrigat") || message.includes("inválid") || message.includes("inval")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to update PIX settings" });
  }
});

router.post("/pix/generate", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const amount = Number(req.body?.amount || 0);
    const pix = await paymentConfig.generatePixCharge(accountId, {
      amount,
      description: req.body?.description ? String(req.body.description) : undefined,
      txid: req.body?.txid ? String(req.body.txid) : undefined,
    });

    res.json({ success: true, pix });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (
      message.includes("PIX") ||
      message.includes("Valor") ||
      message.includes("Chave") ||
      message.includes("desabilitado")
    ) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to generate PIX charge" });
  }
});

router.get("/coupons", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const coupons = await paymentConfig.listCoupons(accountId);
    res.json({ success: true, coupons });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list coupons" });
  }
});

router.post("/coupons", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const coupon = await paymentConfig.saveCoupon(accountId, req.body || {});
    res.json({ success: true, coupon });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("obrigatório")) return res.status(400).json({ error: message });
    res.status(500).json({ error: message || "Failed to save coupon" });
  }
});

router.delete("/coupons/:id", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const ok = await paymentConfig.disableCoupon(accountId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Cupom não encontrado" });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to disable coupon" });
  }
});

router.post("/calculate", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const method = normalizeMethod(req.body?.method_type);
    const calc = await paymentConfig.calculateFinalAmount({
      account_id: accountId,
      method_type: method,
      amount: Number(req.body?.amount || 0),
      installments: Number(req.body?.installments || 1),
      coupon_code: req.body?.coupon_code ? String(req.body.coupon_code) : undefined,
      product_id: req.body?.product_id ? String(req.body.product_id) : undefined,
    });

    res.json({ success: true, calculation: calc });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("inválido") || message.includes("desabilitado") || message.includes("bloqueado")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to calculate payment" });
  }
});

router.get("/checkout-options", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const amount = Number(req.query.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount deve ser maior que zero" });
    }

    const options = await paymentConfig.getCheckoutOptions(accountId, {
      amount,
      product_id: req.query.product_id ? String(req.query.product_id) : undefined,
      coupon_code: req.query.coupon_code ? String(req.query.coupon_code) : undefined,
    });

    res.json({ success: true, ...options });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load checkout options" });
  }
});

router.put("/overrides/:productId", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const override = await paymentConfig.upsertProductOverride(accountId, String(req.params.productId), req.body || {});
    res.json({ success: true, override });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to save override" });
  }
});

router.get("/logs", async (req: BrandRequest, res: Response) => {
  try {
    const accountId = ensureAccountId(req, res);
    if (!accountId) return;

    const logs = await paymentConfig.listPaymentLogs(accountId, req.query.order_id ? String(req.query.order_id) : undefined);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list payment logs" });
  }
});

publicRouter.post("/webhooks/:accountId/:gateway", async (req, res) => {
  try {
    const accountId = String(req.params.accountId || "").trim();
    const gatewayName = String(req.params.gateway || "").trim().toLowerCase();
    if (!accountId || !gatewayName) return res.status(400).json({ error: "Parâmetros inválidos" });

    const gateway = await paymentConfig.getGatewayByName(accountId, gatewayName);
    if (!gateway) return res.status(404).json({ error: "Gateway não configurado" });

    const rawBody = (req as any).rawBody;
    const payloadText = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : typeof rawBody === "string"
      ? rawBody
      : JSON.stringify(req.body || {});

    const stripeSignature = String(req.headers["stripe-signature"] || "");
    const genericSignature = String(req.headers["x-signature"] || req.headers["x-webhook-signature"] || "");
    const signature = stripeSignature || genericSignature;
    const adapter = getGatewayAdapter(gatewayName, gateway.environment, {
      publicKey: gateway.public_key || null,
      secretKey: gateway.secret_key || null,
      webhookSecret: gateway.webhook_secret || null,
    });

    const valid = adapter.validateWebhook({
      payload: payloadText,
      signature,
      headers: req.headers as any,
      webhookSecret: gateway.webhook_secret || gateway.secret_key || undefined,
    });

    if (!valid) {
      await paymentConfig.writePaymentLog({
        account_id: accountId,
        gateway: gatewayName,
        request_payload: req.body || {},
        status: "invalid_signature",
      });
      return res.status(401).json({ error: "Invalid signature" });
    }

    const resolvedEvent = adapter.resolveWebhookEvent
      ? await adapter.resolveWebhookEvent({
          payload: payloadText,
          body: req.body || {},
          headers: req.headers as any,
        })
      : null;

    const providerPaymentId = String(
      resolvedEvent?.provider_payment_id || req.body?.provider_payment_id || req.body?.payment_id || req.body?.data?.id || ""
    ).trim();
    const externalStatus = String(resolvedEvent?.status || req.body?.status || req.body?.data?.status || "pending").toLowerCase();
    const normalizedStatus = ["paid", "approved", "succeeded"].includes(externalStatus)
      ? "paid"
      : ["failed", "refused", "denied", "error"].includes(externalStatus)
      ? "failed"
      : ["canceled", "cancelled"].includes(externalStatus)
      ? "canceled"
      : "pending";

    if (!providerPaymentId) {
      await paymentConfig.writePaymentLog({
        account_id: accountId,
        gateway: gatewayName,
        request_payload: req.body || {},
        status: "missing_provider_payment_id",
      });
      return res.status(400).json({ error: "provider_payment_id ausente" });
    }

    const tx = await paymentConfig.getTransactionByProviderPaymentId(providerPaymentId);
    if (!tx || tx.account_id !== accountId) {
      await paymentConfig.writePaymentLog({
        account_id: accountId,
        gateway: gatewayName,
        request_payload: req.body || {},
        status: "transaction_not_found",
      });
      return res.status(404).json({ error: "Transação não encontrada" });
    }

    await paymentConfig.updateTransactionStatus(providerPaymentId, normalizedStatus as any, req.body || {});

    if (normalizedStatus === "paid") {
      const order = await queryOne<{ id: string; user_id: string; brand_id: string | null }>(
        `SELECT id, user_id, brand_id FROM commerce_orders WHERE id = ? LIMIT 1`,
        [tx.order_id]
      );

      if (order) {
        const updated = await commerceService.updateOrderStatus(order.user_id, order.brand_id || null, order.id, {
          status_pedido: "pago",
          forma_pagamento: tx.method_type === "card" ? "cartao" : tx.method_type,
        });

        if (updated) {
          await sendPostSaleNotifications(req, {
            order: updated.order,
            items: updated.items,
          });
        }
      }
    }

    await paymentConfig.writePaymentLog({
      account_id: accountId,
      order_id: tx.order_id,
      gateway: gatewayName,
      request_payload: req.body || {},
      response_payload: { provider_payment_id: providerPaymentId, status: normalizedStatus },
      status: `webhook_${normalizedStatus}`,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Webhook processing failed" });
  }
});

export default router;
export { publicRouter as paymentPublicRoutes };
