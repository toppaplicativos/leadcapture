import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";
import { GeminiService } from "../services/gemini";
import {
  CommerceOrderStatus,
  CommerceService,
} from "../services/commerce";
import { queryOne, update } from "../config/database";
import { PaymentConfigService, PaymentMethodType } from "../services/paymentConfig";
import { getGatewayAdapter } from "../services/paymentGatewayAdapters";
import { getNotificationService } from "../services/notifications";

const router = Router();
const publicRouter = Router();
const commerceService = new CommerceService();
const brandUnitsService = new BrandUnitsService();
const paymentConfigService = new PaymentConfigService();
const notificationService = getNotificationService();
const geminiService = new GeminiService();
const aiDescriptionCache = new Map<string, { text: string; generatedAt: number }>();

function parseImageList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const text = String(raw || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 12);
    }
  } catch {
    // fallback below
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function isGenericDescription(raw: unknown): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return true;
  if (value.length < 40) return true;

  const genericSnippets = [
    "confira este produto exclusivo",
    "qualidade premium",
    "entrega garantida",
    "melhores condições",
    "suporte pós-venda",
  ];

  return genericSnippets.some((snippet) => value.includes(snippet));
}

async function generateAiProductDescription(input: {
  productId: string;
  productName: string;
  category?: string | null;
  baseDescription?: string | null;
  price?: number;
  promoPrice?: number | null;
  storeName?: string | null;
}): Promise<string | null> {
  const productId = String(input.productId || "").trim();
  if (!productId) return null;

  const cached = aiDescriptionCache.get(productId);
  const now = Date.now();
  if (cached && now - cached.generatedAt < 6 * 60 * 60 * 1000) {
    return cached.text;
  }

  const prompt = [
    "Você é um copywriter de e-commerce de alta conversão.",
    "Escreva uma descrição objetiva e persuasiva em português do Brasil.",
    "Regras:",
    "- Máximo de 520 caracteres",
    "- 2 parágrafos curtos",
    "- Foco em benefícios reais e clareza",
    "- Não invente promessas legais ou técnicas não fornecidas",
    "- Sem markdown, sem emojis em excesso",
    `Loja: ${String(input.storeName || "Loja")}`,
    `Produto: ${String(input.productName || "Produto")}`,
    `Categoria/Tipo: ${String(input.category || "geral")}`,
    `Preço: R$ ${Number(input.price || 0).toFixed(2)}`,
    input.promoPrice ? `Preço promocional: R$ ${Number(input.promoPrice || 0).toFixed(2)}` : "",
    input.baseDescription ? `Contexto base: ${String(input.baseDescription || "")}` : "",
    "Retorne apenas o texto final da descrição.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const generated = await geminiService.generatePlainText(prompt);
    const clean = String(generated || "").trim();
    if (!clean) return null;
    aiDescriptionCache.set(productId, { text: clean, generatedAt: now });
    return clean;
  } catch {
    return null;
  }
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

function checkoutBaseUrl(req: any): string {
  const fromEnv = String(process.env.CHECKOUT_BASE_URL || process.env.FRONTEND_PUBLIC_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const protocol = req.headers["x-forwarded-proto"]
    ? String(req.headers["x-forwarded-proto"]).split(",")[0]
    : req.protocol;
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").trim();
  if (host) {
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  return "http://localhost:5173";
}

function normalizeCheckoutMethod(value: unknown): PaymentMethodType {
  const v = String(value || "").trim().toLowerCase();
  if (v === "pix") return "pix";
  if (["card", "cartao", "cartão", "credit_card"].includes(v)) return "card";
  if (v === "boleto") return "boleto";
  return "wallet";
}

function methodToOrderPayment(method: PaymentMethodType): "pix" | "cartao" | "boleto" | "desconhecido" {
  if (method === "pix") return "pix";
  if (method === "card") return "cartao";
  if (method === "boleto") return "boleto";
  return "desconhecido";
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

async function resolvePaymentAccountIdForOrder(
  order: { user_id: string; brand_id?: string | null; valor_total?: number; cupom_codigo?: string | null },
  primaryProductId?: string | null
): Promise<string> {
  const userId = String(order.user_id || "").trim();
  const brandId = String(order.brand_id || "").trim();
  const candidates: string[] = [];
  if (userId && brandId) candidates.push(`${userId}::${brandId}`);
  if (userId) candidates.push(userId);

  for (const accountId of candidates) {
    try {
      const gateways = await paymentConfigService.listActiveGateways(accountId);
      if (gateways.length > 0) return accountId;
    } catch {
      // ignore and try next candidate
    }
  }

  for (const accountId of candidates) {
    try {
      const options = await paymentConfigService.getCheckoutOptions(accountId, {
        amount: Number(order.valor_total || 0),
        product_id: primaryProductId || undefined,
        coupon_code: order.cupom_codigo || undefined,
      });
      if ((options.previews || []).length > 0) return accountId;
    } catch {
      // ignore and try next candidate
    }
  }

  return candidates[0] || userId;
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

async function instanceBelongsToUser(instanceId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM whatsapp_instances WHERE id = ? AND created_by = ? LIMIT 1",
    [instanceId, userId]
  );
  return !!row;
}

router.get("/products", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const products = await commerceService.listProducts(userId, brandId);
    res.json({ success: true, products, brand_id: brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list products" });
  }
});

router.post("/products", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const product = await commerceService.createProduct(userId, brandId, req.body || {});
    res.status(201).json({ success: true, product, brand_id: brandId });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("obrigatório") || message.includes("inválido")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to create product" });
  }
});

router.put("/products/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const product = await commerceService.updateProduct(userId, brandId, String(req.params.id), req.body || {});
    if (!product) return res.status(404).json({ error: "Produto não encontrado" });

    res.json({ success: true, product, brand_id: brandId });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("obrigatório") || message.includes("inválido")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to update product" });
  }
});

router.get("/orders", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const orders = await commerceService.listOrders(userId, brandId, {
      status: req.query.status ? String(req.query.status) : undefined,
      lead_id: req.query.lead_id ? String(req.query.lead_id) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ success: true, orders, brand_id: brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list orders" });
  }
});

router.get("/orders/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const order = await commerceService.getOrderById(userId, brandId, String(req.params.id));
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" });

    res.json({ success: true, ...order, brand_id: brandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch order" });
  }
});

router.post("/orders", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const payload = req.body || {};

    const created = await commerceService.createOrder(userId, brandId, {
      lead_id: payload.lead_id ? String(payload.lead_id) : undefined,
      instance_id: payload.instance_id ? String(payload.instance_id) : undefined,
      origem: payload.origem === "checkout_web" ? "checkout_web" : "whatsapp",
      forma_pagamento: payload.forma_pagamento,
      customer_name: payload.customer_name,
      customer_email: payload.customer_email,
      customer_phone: payload.customer_phone,
      cupom_codigo: payload.cupom_codigo,
      desconto: payload.desconto,
      checkout_base_url: checkoutBaseUrl(req),
      itens: Array.isArray(payload.itens) ? payload.itens : [],
    });

    await notificationService
      .createNotification({
        user_id: userId,
        type: "system",
        event: "order_created",
        title: "Novo pedido criado",
        message: `Pedido #${String(created.order.id).slice(0, 8)} no valor de R$ ${Number(created.order.valor_total || 0).toFixed(2)}.`,
        priority: "high",
        channels: ["in_app", "email"],
        store_id: brandId || null,
        metadata: {
          order_id: created.order.id,
          order_status: created.order.status_pedido,
          origin: created.order.origem,
        },
      })
      .catch(() => undefined);

    res.status(201).json({
      success: true,
      ...created,
      brand_id: brandId,
      post_sale: {
        status_aplicado: created.order.lead_id ? "negotiating" : null,
        tags_aplicadas: created.order.lead_id ? ["pedido_criado"] : [],
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("inválido") || message.includes("obrigatório") || message.includes("carrinho")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to create order" });
  }
});

router.patch("/orders/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const statusPedido = String(req.body?.status_pedido || "").trim();
    if (!statusPedido) return res.status(400).json({ error: "status_pedido é obrigatório" });

    const updated = await commerceService.updateOrderStatus(userId, brandId, String(req.params.id), {
      status_pedido: statusPedido as CommerceOrderStatus,
      forma_pagamento: req.body?.forma_pagamento,
      data_pagamento: req.body?.data_pagamento,
    });
    if (!updated) return res.status(404).json({ error: "Pedido não encontrado" });

    const statusPedidoNormalized = statusPedido.toLowerCase();
    await notificationService
      .createNotification({
        user_id: userId,
        type: "system",
        event: statusPedidoNormalized === "pago" ? "payment_approved" : "order_status_changed",
        title: statusPedidoNormalized === "pago" ? "Pagamento aprovado" : "Status do pedido atualizado",
        message:
          statusPedidoNormalized === "pago"
            ? `Pedido #${String(updated.order.id).slice(0, 8)} foi pago.`
            : `Pedido #${String(updated.order.id).slice(0, 8)} alterado para ${statusPedido}.`,
        priority: statusPedidoNormalized === "pago" ? "high" : "medium",
        channels: statusPedidoNormalized === "pago" ? ["in_app", "email", "whatsapp"] : ["in_app"],
        store_id: brandId || null,
        metadata: {
          order_id: updated.order.id,
          status: statusPedido,
        },
      })
      .catch(() => undefined);

    res.json({
      success: true,
      ...updated,
      brand_id: brandId,
      post_sale: {
        status_aplicado: statusPedido === "pago" ? "converted" : statusPedido === "abandonado" ? null : undefined,
        tags_aplicadas:
          statusPedido === "pago"
            ? ["cliente_ativo"]
            : statusPedido === "abandonado"
            ? ["checkout_abandonado"]
            : [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update order" });
  }
});

router.post("/orders/:id/send-checkout", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = await resolveBrandId(req);
    const orderBundle = await commerceService.getOrderById(userId, brandId, String(req.params.id));
    if (!orderBundle) return res.status(404).json({ error: "Pedido não encontrado" });

    const instanceId = String(req.body?.instance_id || orderBundle.order.instance_id || "").trim();
    const phone = String(req.body?.phone || orderBundle.order.customer_phone || "").trim();

    if (!instanceId) return res.status(400).json({ error: "instance_id é obrigatório" });
    if (!phone) return res.status(400).json({ error: "telefone de destino é obrigatório" });

    const allowedInstance = await instanceBelongsToUser(instanceId, userId);
    if (!allowedInstance) return res.status(404).json({ error: "Instância não encontrada" });

    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    const paymentLink =
      String(orderBundle.order.payment_link || "").trim() ||
      `${checkoutBaseUrl(req)}/pedido/${orderBundle.order.checkout_token}`;

    const suggestedMessage =
      req.body?.message ||
      [
        `Perfeito 👌`,
        `Seu pedido #${orderBundle.order.id.slice(0, 8)} foi gerado com sucesso.`,
        `Valor total: R$ ${Number(orderBundle.order.valor_total || 0).toFixed(2)}`,
        "Finalize com segurança no link:",
        paymentLink,
      ].join("\n");

    const sent = await instanceManager.sendMessage(instanceId, phone, String(suggestedMessage));
    if (!sent) {
      return res.status(400).json({
        error: "Falha ao enviar checkout pelo WhatsApp",
        order_id: orderBundle.order.id,
        payment_link: paymentLink,
      });
    }

    res.json({
      success: true,
      order_id: orderBundle.order.id,
      payment_link: paymentLink,
      sent_to: phone,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to send checkout" });
  }
});

router.post("/maintenance/abandoned-sweep", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const minutes = req.body?.minutes ? Number(req.body.minutes) : 30;
    const result = await commerceService.markAbandonedPendingOrders(minutes);
    res.json({ success: true, ...result, message: "Sweep executado" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to run abandonment sweep" });
  }
});

publicRouter.get("/checkout/:token", async (req, res) => {
  try {
    const checkout = await commerceService.getCheckoutByToken(String(req.params.token));
    if (!checkout) return res.status(404).json({ error: "Checkout não encontrado" });

    const primaryItem = checkout.items[0];
    const accountId = await resolvePaymentAccountIdForOrder(checkout.order, primaryItem?.product_id || undefined);
    const paymentOptions = await paymentConfigService.getCheckoutOptions(accountId, {
      amount: Number(checkout.order.valor_total || 0),
      product_id: primaryItem?.product_id || undefined,
      coupon_code: checkout.order.cupom_codigo || undefined,
    });

    const currentProductIds = new Set(
      (checkout.items || []).map((item) => String(item.product_id || "").trim()).filter(Boolean)
    );
    const relatedProducts = (await commerceService.listProducts(checkout.order.user_id, checkout.order.brand_id || null))
      .filter((product) => Boolean(product.ativo))
      .filter((product) => !currentProductIds.has(String(product.id || "")))
      .slice(0, 12);

    const normalizedRelatedProducts = relatedProducts.map((product) => {
      const images = parseImageList(product.imagem);
      return {
        ...product,
        imagem: images[0] || product.imagem || null,
        imagens: images,
      };
    });

    const storefront = await queryOne<{ slug: string; name: string }>(
      `SELECT slug, name
       FROM storefront_stores
       WHERE owner_user_id = ?
         AND ${checkout.order.brand_id ? "brand_id = ?" : "brand_id IS NULL"}
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
      checkout.order.brand_id
        ? [checkout.order.user_id, String(checkout.order.brand_id)]
        : [checkout.order.user_id]
    ).catch(() => null);

    // Enrich items with product image and description for the product page
    const enrichedItems = await Promise.all(
      checkout.items.map(async (item) => {
        const itemAny = item as any;
        const itemMetadata = parseJson<any>(itemAny?.metadata_json, {});
        const snapshot = itemMetadata?.snapshot && typeof itemMetadata.snapshot === "object" ? itemMetadata.snapshot : {};

        if (!item.product_id) {
          const snapshotImages = parseImageList(snapshot?.imagens || snapshot?.imagem || null);
          const snapshotImage = String(snapshot?.imagem || "").trim() || snapshotImages[0] || null;
          const snapshotDescription = String(snapshot?.descricao || "").trim() || null;
          const snapshotCategory = String(snapshot?.categoria || "").trim() || null;
          return {
            ...item,
            imagem: snapshotImage,
            imagens: snapshotImages,
            descricao: snapshotDescription,
            descricao_ia: null,
            categoria: snapshotCategory,
          };
        }
        try {
          const product = await commerceService.getProductById(
            checkout.order.user_id,
            checkout.order.brand_id || null,
            item.product_id
          );

          const images = parseImageList(product?.imagem || null);
          const baseDescription = String(product?.descricao || "").trim();
          const aiDescription = await generateAiProductDescription({
            productId: String(product?.id || item.product_id || ""),
            productName: String(product?.nome || item.nome || "Produto"),
            category: product?.tipo || null,
            baseDescription,
            price: Number(product?.preco || item.valor_unitario || 0),
            promoPrice: product?.preco_promocional ?? null,
            storeName: storefront?.name || null,
          });

          const shouldUseAi = isGenericDescription(baseDescription);
          const finalDescription =
            (shouldUseAi ? aiDescription : null) ||
            baseDescription ||
            aiDescription ||
            null;

          return {
            ...item,
            imagem: images[0] || product?.imagem || String(snapshot?.imagem || "").trim() || null,
            imagens: images.length > 0 ? images : parseImageList(snapshot?.imagens || snapshot?.imagem || null),
            descricao: finalDescription || String(snapshot?.descricao || "").trim() || null,
            descricao_ia: aiDescription,
            categoria: product?.tipo || String(snapshot?.categoria || "").trim() || null,
          };
        } catch {
          const snapshotImages = parseImageList(snapshot?.imagens || snapshot?.imagem || null);
          const snapshotImage = String(snapshot?.imagem || "").trim() || snapshotImages[0] || null;
          const snapshotDescription = String(snapshot?.descricao || "").trim() || null;
          const snapshotCategory = String(snapshot?.categoria || "").trim() || null;
          return {
            ...item,
            imagem: snapshotImage,
            imagens: snapshotImages,
            descricao: snapshotDescription,
            descricao_ia: null,
            categoria: snapshotCategory,
          };
        }
      })
    );

    const categories = Array.from(
      new Set(
        [
          ...enrichedItems.map((item: any) => String(item?.categoria || "").trim()),
          ...normalizedRelatedProducts.map((product) => String(product?.tipo || "").trim()),
        ].filter(Boolean)
      )
    );

    res.json({
      success: true,
      order: checkout.order,
      items: enrichedItems,
      expired: checkout.expired,
      payment_options: paymentOptions,
      related_products: normalizedRelatedProducts,
      categories,
      storefront: storefront
        ? {
            slug: String(storefront.slug || "").trim() || null,
            name: String(storefront.name || "").trim() || null,
            url: String(storefront.slug || "").trim()
              ? `/store/${encodeURIComponent(String(storefront.slug || "").trim())}`
              : null,
          }
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load checkout" });
  }
});

publicRouter.post("/checkout/:token/rebuild", async (req, res) => {
  try {
    const rebuilt = await commerceService.rebuildCheckoutFromToken(String(req.params.token), {
      checkout_base_url: checkoutBaseUrl(req),
      forma_pagamento: req.body?.forma_pagamento,
      customer_name: req.body?.customer_name,
      customer_email: req.body?.customer_email,
      customer_phone: req.body?.customer_phone,
      itens: Array.isArray(req.body?.itens) ? req.body.itens : undefined,
    });

    res.json({
      success: true,
      ...rebuilt,
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("checkout") || message.includes("pedido") || message.includes("inválido") || message.includes("expirado")) {
      return res.status(400).json({ error: message || "Falha ao reconstruir checkout" });
    }
    res.status(500).json({ error: message || "Failed to rebuild checkout" });
  }
});

publicRouter.post("/checkout/:token/pay", async (req, res) => {
  try {
    const checkout = await commerceService.getCheckoutByToken(String(req.params.token));
    if (!checkout) return res.status(404).json({ error: "Checkout não encontrado" });
    if (checkout.expired || checkout.order.status_pedido === "abandonado") {
      return res.status(400).json({ error: "checkout expirado" });
    }
    if (checkout.order.status_pedido === "pago") {
      return res.status(400).json({ error: "Pedido já está pago" });
    }

    const primaryItem = checkout.items[0];
    const method = normalizeCheckoutMethod(req.body?.method_type || req.body?.forma_pagamento);
    const installments = Number(req.body?.installments || 1);
    const couponCode = req.body?.coupon_code ? String(req.body.coupon_code) : checkout.order.cupom_codigo || undefined;
    const accountId = await resolvePaymentAccountIdForOrder(checkout.order, primaryItem?.product_id || undefined);

    const estimate = await paymentConfigService.calculateFinalAmount({
      account_id: accountId,
      method_type: method,
      amount: Number(checkout.order.valor_total || 0),
      installments,
      coupon_code: couponCode,
      product_id: primaryItem?.product_id || undefined,
    });

    const gateway = await paymentConfigService.resolveGatewayForPayment(accountId, {
      gatewayName: req.body?.gateway_name,
      productId: primaryItem?.product_id || undefined,
    });

    if (!gateway) {
      return res.status(400).json({
        error: "Nenhum gateway ativo configurado para esta conta. Verifique configurações de pagamento da Brand ativa.",
      });
    }

    const adapter = getGatewayAdapter(gateway.gateway_name, gateway.environment, {
      publicKey: gateway.public_key || null,
      secretKey: gateway.secret_key || null,
      webhookSecret: gateway.webhook_secret || null,
    });
    const payment = await adapter.createPayment({
      amount: estimate.final_amount,
      currency: estimate.currency,
      method,
      installments: estimate.installments,
      description: `Pedido #${checkout.order.id.slice(0, 8)}`,
      customer: {
        name: checkout.order.customer_name || null,
        email: checkout.order.customer_email || null,
        phone: checkout.order.customer_phone || null,
      },
      metadata: {
        account_id: checkout.order.user_id,
        order_id: checkout.order.id,
        checkout_token: checkout.order.checkout_token,
      },
    });

    await paymentConfigService.savePaymentTransaction({
      account_id: accountId,
      order_id: checkout.order.id,
      gateway_name: gateway.gateway_name,
      provider_payment_id: payment.provider_payment_id,
      method_type: method,
      amount: estimate.final_amount,
      currency: estimate.currency,
      status: payment.status === "paid" ? "paid" : payment.status === "failed" ? "failed" : "pending",
      payment_url: payment.payment_url,
      raw_response: payment.raw_response,
    });

    await paymentConfigService.writePaymentLog({
      account_id: accountId,
      order_id: checkout.order.id,
      gateway: gateway.gateway_name,
      request_payload: {
        method,
        installments: estimate.installments,
        amount: estimate.final_amount,
      },
      response_payload: payment.raw_response,
      status: "payment_created",
    });

    await update(
      `UPDATE commerce_orders
       SET payment_link = ?, forma_pagamento = ?, cupom_codigo = COALESCE(?, cupom_codigo)
       WHERE id = ?`,
      [payment.payment_url || null, methodToOrderPayment(method), couponCode || null, checkout.order.id]
    );

    if (couponCode && estimate.applied_coupon?.id) {
      await paymentConfigService.consumeCoupon(accountId, estimate.applied_coupon.id);
    }

    res.json({
      success: true,
      order_id: checkout.order.id,
      gateway: gateway.gateway_name,
      provider_payment_id: payment.provider_payment_id,
      payment_url: payment.payment_url,
      status: payment.status,
      calculation: estimate,
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("bloqueado") || message.includes("inválido") || message.includes("desabilitado")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Falha ao iniciar pagamento" });
  }
});

publicRouter.post("/checkout/:token/complete", async (req, res) => {
  try {
    const completed = await commerceService.completeCheckout(String(req.params.token), {
      forma_pagamento: req.body?.forma_pagamento,
      customer_name: req.body?.customer_name,
      customer_email: req.body?.customer_email,
      customer_phone: req.body?.customer_phone,
    });

    await sendPostSaleNotifications(req, {
      order: completed.order,
      items: completed.items,
    });

    await notificationService
      .createNotification({
        user_id: String(completed.order.user_id || ""),
        type: "system",
        event: "checkout_completed",
        title: "Checkout concluído",
        message: `Pedido #${String(completed.order.id).slice(0, 8)} concluído com sucesso.`,
        priority: "high",
        channels: ["in_app", "email", "whatsapp"],
        store_id: completed.order.brand_id ? String(completed.order.brand_id) : null,
        metadata: {
          order_id: completed.order.id,
          status: completed.order.status_pedido,
        },
      })
      .catch(() => undefined);

    res.json({
      success: true,
      ...completed,
      post_sale: {
        tags_aplicadas: ["cliente_ativo"],
        status_aplicado: "converted",
        fluxos_disparados: [
          "confirmacao_pagamento",
          "envio_recibo",
          "boas_vindas_pos_venda",
          "oferta_upsell",
        ],
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("expirado") || message.includes("não encontrado")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to complete checkout" });
  }
});

export default router;
export { publicRouter as commercePublicRoutes };
