import { createHmac } from "crypto";
import axios from "axios";

export type GatewayEnvironment = "sandbox" | "production";

export type GatewayCreatePaymentInput = {
  amount: number;
  currency: string;
  method: string;
  installments: number;
  description: string;
  customer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  metadata?: Record<string, any>;
};

export type GatewayCreatePaymentOutput = {
  provider_payment_id: string;
  payment_url: string;
  status: "pending" | "paid" | "failed";
  raw_response: Record<string, any>;
};

export type GatewayWebhookEvent = {
  provider_payment_id?: string;
  status?: "pending" | "paid" | "failed" | "canceled";
  raw?: Record<string, any>;
};

export type GatewayCredentials = {
  publicKey?: string | null;
  secretKey?: string | null;
  webhookSecret?: string | null;
};

export interface PaymentGatewayAdapter {
  createPayment(input: GatewayCreatePaymentInput): Promise<GatewayCreatePaymentOutput>;
  createSubscription?(input: Record<string, any>): Promise<Record<string, any>>;
  refund?(input: { providerPaymentId: string; amount?: number }): Promise<Record<string, any>>;
  testConnection?(): Promise<{ ok: boolean; reason?: string; details?: Record<string, any> }>;
  resolveWebhookEvent?(args: {
    payload: string;
    body?: Record<string, any>;
    headers?: Record<string, any>;
  }): Promise<GatewayWebhookEvent | null>;
  validateWebhook(args: {
    payload: string;
    signature?: string;
    headers?: Record<string, any>;
    webhookSecret?: string;
  }): boolean;
}

class MockGatewayAdapter implements PaymentGatewayAdapter {
  private readonly gatewayName: string;
  private readonly environment: GatewayEnvironment;
  private readonly credentials: GatewayCredentials;

  constructor(gatewayName: string, environment: GatewayEnvironment, credentials: GatewayCredentials) {
    this.gatewayName = gatewayName;
    this.environment = environment;
    this.credentials = credentials;
  }

  async createPayment(input: GatewayCreatePaymentInput): Promise<GatewayCreatePaymentOutput> {
    const providerPaymentId = `${this.gatewayName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const token = Math.random().toString(36).slice(2, 12);
    const payment_url = `https://pay.${this.gatewayName}.mock/${this.environment}/checkout/${token}`;

    return {
      provider_payment_id: providerPaymentId,
      payment_url,
      status: "pending",
      raw_response: {
        provider_payment_id: providerPaymentId,
        gateway: this.gatewayName,
        environment: this.environment,
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        installments: input.installments,
        customer: input.customer,
        metadata: input.metadata || {},
      },
    };
  }

  async testConnection(): Promise<{ ok: boolean; reason?: string; details?: Record<string, any> }> {
    const hasCreds =
      String(this.credentials.publicKey || "").trim().length > 0 ||
      String(this.credentials.secretKey || "").trim().length > 0;
    if (!hasCreds) {
      return { ok: false, reason: "Credenciais ausentes" };
    }
    return { ok: true, details: { adapter: "mock", gateway: this.gatewayName } };
  }

  validateWebhook(args: { payload: string; signature?: string; webhookSecret?: string }): boolean {
    const signature = String(args.signature || "").trim();
    const secret = String(args.webhookSecret || "").trim();

    if (!secret) return true;
    if (!signature) return false;

    const expected = createHmac("sha256", secret).update(args.payload || "").digest("hex");
    return signature === expected;
  }
}

class StripeGatewayAdapter implements PaymentGatewayAdapter {
  private readonly environment: GatewayEnvironment;
  private readonly credentials: GatewayCredentials;

  constructor(environment: GatewayEnvironment, credentials: GatewayCredentials) {
    this.environment = environment;
    this.credentials = credentials;
  }

  private get secretKey(): string {
    return String(this.credentials.secretKey || "").trim();
  }

  private get webhookSecret(): string {
    return String(this.credentials.webhookSecret || "").trim();
  }

  async testConnection(): Promise<{ ok: boolean; reason?: string; details?: Record<string, any> }> {
    if (!this.secretKey) return { ok: false, reason: "Stripe Secret Key ausente" };

    try {
      const resp = await axios.get("https://api.stripe.com/v1/account", {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
        timeout: 15000,
      });

      return {
        ok: true,
        details: {
          id: resp.data?.id,
          country: resp.data?.country,
          email: resp.data?.email,
          livemode: Boolean(resp.data?.livemode),
          environment: this.environment,
        },
      };
    } catch (error: any) {
      const reason =
        String(error?.response?.data?.error?.message || "").trim() ||
        String(error?.message || "Falha ao validar Stripe");
      return { ok: false, reason };
    }
  }

  async createPayment(input: GatewayCreatePaymentInput): Promise<GatewayCreatePaymentOutput> {
    if (!this.secretKey) throw new Error("Stripe Secret Key não configurada");

    const paymentMethodTypes: string[] = [];
    if (input.method === "pix") paymentMethodTypes.push("pix");
    else if (input.method === "boleto") paymentMethodTypes.push("boleto");
    else paymentMethodTypes.push("card");

    const amountInCents = Math.max(1, Math.round(Number(input.amount || 0) * 100));
    const currency = String(input.currency || "BRL").trim().toLowerCase();
    const baseUrl = String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, "");

    const form = new URLSearchParams();
    form.append("mode", "payment");
    form.append("success_url", `${baseUrl}/pedido/sucesso?session_id={CHECKOUT_SESSION_ID}`);
    form.append("cancel_url", `${baseUrl}/pedido/cancelado`);
    form.append("line_items[0][price_data][currency]", currency);
    form.append("line_items[0][price_data][unit_amount]", String(amountInCents));
    form.append("line_items[0][price_data][product_data][name]", input.description || "Pedido LeadCapture");
    form.append("line_items[0][quantity]", "1");
    form.append("payment_intent_data[description]", input.description || "Pedido LeadCapture");

    if (input.customer.email) form.append("customer_email", String(input.customer.email));

    for (let i = 0; i < paymentMethodTypes.length; i += 1) {
      form.append(`payment_method_types[${i}]`, paymentMethodTypes[i]);
    }

    const metadata = input.metadata || {};
    for (const [key, value] of Object.entries(metadata)) {
      form.append(`metadata[${key}]`, String(value ?? ""));
    }

    const response = await axios.post("https://api.stripe.com/v1/checkout/sessions", form, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    });

    const data = response.data || {};
    return {
      provider_payment_id: String(data.id || ""),
      payment_url: String(data.url || ""),
      status: "pending",
      raw_response: data,
    };
  }

  validateWebhook(args: { payload: string; signature?: string; headers?: Record<string, any>; webhookSecret?: string }): boolean {
    const secret = String(args.webhookSecret || this.webhookSecret || "").trim();
    const signatureHeader = String(args.signature || args.headers?.["stripe-signature"] || "").trim();

    if (!secret) return true;
    if (!signatureHeader) return false;

    const parts = signatureHeader.split(",").map((p) => p.trim());
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const v1Part = parts.find((p) => p.startsWith("v1="));
    if (!timestampPart || !v1Part) return false;

    const timestamp = timestampPart.slice(2);
    const signature = v1Part.slice(3);
    const signedPayload = `${timestamp}.${args.payload || ""}`;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

    return expected === signature;
  }

  async resolveWebhookEvent(args: {
    payload: string;
    body?: Record<string, any>;
    headers?: Record<string, any>;
  }): Promise<GatewayWebhookEvent | null> {
    const body = args.body || {};
    const eventType = String(body.type || "").toLowerCase();
    const object = (body.data || {}).object || {};
    const paymentId = String(object.payment_intent || object.id || "").trim();

    if (!paymentId) return null;

    let status: GatewayWebhookEvent["status"] = "pending";
    if (["checkout.session.completed", "payment_intent.succeeded", "charge.succeeded"].includes(eventType)) {
      status = "paid";
    } else if (["payment_intent.payment_failed", "charge.failed"].includes(eventType)) {
      status = "failed";
    } else if (["charge.refunded", "payment_intent.canceled"].includes(eventType)) {
      status = "canceled";
    }

    return {
      provider_payment_id: paymentId,
      status,
      raw: body,
    };
  }
}

class MercadoPagoGatewayAdapter implements PaymentGatewayAdapter {
  private readonly environment: GatewayEnvironment;
  private readonly credentials: GatewayCredentials;

  constructor(environment: GatewayEnvironment, credentials: GatewayCredentials) {
    this.environment = environment;
    this.credentials = credentials;
  }

  private get accessToken(): string {
    return String(this.credentials.secretKey || "").trim();
  }

  private get webhookSecret(): string {
    return String(this.credentials.webhookSecret || "").trim();
  }

  async testConnection(): Promise<{ ok: boolean; reason?: string; details?: Record<string, any> }> {
    if (!this.accessToken) return { ok: false, reason: "Mercado Pago Access Token ausente" };

    try {
      const resp = await axios.get("https://api.mercadopago.com/v1/account/settings", {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 15000,
      });

      return {
        ok: true,
        details: {
          site_id: resp.data?.site_id,
          account_id: resp.data?.account_id,
          country_id: resp.data?.country_id,
          environment: this.environment,
        },
      };
    } catch (error: any) {
      const reason =
        String(error?.response?.data?.message || "").trim() ||
        String(error?.message || "Falha ao validar Mercado Pago");
      return { ok: false, reason };
    }
  }

  async createPayment(input: GatewayCreatePaymentInput): Promise<GatewayCreatePaymentOutput> {
    if (!this.accessToken) throw new Error("Mercado Pago Access Token não configurado");

    const currency = String(input.currency || "BRL").trim().toUpperCase();
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor de pagamento inválido");

    const baseUrl = String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, "");
    const metadata = input.metadata || {};

    const payload: Record<string, any> = {
      items: [
        {
          title: input.description || "Pedido LeadCapture",
          quantity: 1,
          unit_price: Number(amount.toFixed(2)),
          currency_id: currency,
        },
      ],
      payer: {
        name: input.customer.name || undefined,
        email: input.customer.email || undefined,
      },
      back_urls: {
        success: `${baseUrl}/pedido/sucesso`,
        failure: `${baseUrl}/pedido/falha`,
        pending: `${baseUrl}/pedido/pendente`,
      },
      auto_return: "approved",
      external_reference: String(metadata.order_id || ""),
      metadata,
    };

    const response = await axios.post("https://api.mercadopago.com/checkout/preferences", payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    const data = response.data || {};
    return {
      provider_payment_id: String(data.id || ""),
      payment_url: String(data.init_point || data.sandbox_init_point || ""),
      status: "pending",
      raw_response: data,
    };
  }

  validateWebhook(args: { payload: string; signature?: string; headers?: Record<string, any>; webhookSecret?: string }): boolean {
    const secret = String(args.webhookSecret || this.webhookSecret || "").trim();
    const headerSignature = String(
      args.signature || args.headers?.["x-signature"] || args.headers?.["x-webhook-signature"] || ""
    ).trim();

    if (!secret) return true;
    if (!headerSignature) return false;

    const v1Match = headerSignature.match(/(?:^|,)\s*v1=([a-fA-F0-9]+)/);
    const signature = v1Match ? String(v1Match[1]) : headerSignature;
    const expected = createHmac("sha256", secret).update(args.payload || "").digest("hex");
    return signature.toLowerCase() === expected.toLowerCase();
  }

  private normalizeMercadoPagoStatus(status: string): GatewayWebhookEvent["status"] {
    const normalized = String(status || "").trim().toLowerCase();
    if (["approved", "accredited", "paid", "succeeded"].includes(normalized)) return "paid";
    if (["cancelled", "canceled"].includes(normalized)) return "canceled";
    if (["rejected", "failed", "error"].includes(normalized)) return "failed";
    return "pending";
  }

  async resolveWebhookEvent(args: {
    payload: string;
    body?: Record<string, any>;
    headers?: Record<string, any>;
  }): Promise<GatewayWebhookEvent | null> {
    const body = args.body || {};
    const directPaymentId = String(body?.data?.id || body?.id || body?.resource?.id || "").trim();
    const directStatus = String(body?.status || body?.data?.status || "").trim();

    if (directPaymentId && directStatus) {
      return {
        provider_payment_id: directPaymentId,
        status: this.normalizeMercadoPagoStatus(directStatus),
        raw: body,
      };
    }

    if (!directPaymentId || !this.accessToken) {
      return directPaymentId
        ? {
            provider_payment_id: directPaymentId,
            status: "pending",
            raw: body,
          }
        : null;
    }

    try {
      const paymentResp = await axios.get(`https://api.mercadopago.com/v1/payments/${directPaymentId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 15000,
      });

      return {
        provider_payment_id: String(paymentResp.data?.id || directPaymentId),
        status: this.normalizeMercadoPagoStatus(String(paymentResp.data?.status || "pending")),
        raw: paymentResp.data || body,
      };
    } catch {
      return {
        provider_payment_id: directPaymentId,
        status: "pending",
        raw: body,
      };
    }
  }
}

export function getGatewayAdapter(
  gatewayName: string,
  environment: GatewayEnvironment,
  credentials: GatewayCredentials = {}
): PaymentGatewayAdapter {
  const normalized = String(gatewayName || "").trim().toLowerCase();

  if (normalized === "stripe") {
    return new StripeGatewayAdapter(environment, credentials);
  }

  if (normalized === "mercado_pago" || normalized === "mercadopago") {
    return new MercadoPagoGatewayAdapter(environment, credentials);
  }

  return new MockGatewayAdapter(normalized || "custom", environment, credentials);
}
