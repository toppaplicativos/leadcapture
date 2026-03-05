import { Router } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { GeminiService } from "../services/gemini";
import { StorefrontService } from "../services/storefront";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

const router = Router();
const publicRouter = Router();

const storefront = new StorefrontService();
const gemini = new GeminiService();
router.use(attachBrandContext);

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
    const orders = await storefront.listOrders(
      userId,
      String(req.params.storeId),
      {
        status: req.query.status ? String(req.query.status) : undefined,
        limit: parseOptionalInt(req.query.limit),
        offset: parseOptionalInt(req.query.offset),
      },
      req.brandId
    );
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
    const order = await storefront.updateOrderStatus(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
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
    const order = await storefront.confirmOrderPayment(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
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
    const order = await storefront.startOrderPreparation(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
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
    const result = await storefront.sendOrderOutForDelivery(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
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
    const order = await storefront.confirmOrderDeliveryByAdmin(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
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
    const timeline = await storefront.listOrderTimeline(
      userId,
      String(req.params.storeId),
      String(req.params.orderId),
      req.brandId
    );
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

publicRouter.get("/stores/:slug/catalog", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
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
        compare_at_price: item?.compare_at_price !== undefined && item?.compare_at_price !== null
          ? Number(item.compare_at_price)
          : null,
        image: images[0] || null,
        images,
        position: Number(item?.position || 0),
      };
    });

    const salesRows = (await query<any[]>(
      `SELECT items_json
       FROM storefront_orders
       WHERE store_id = ?
         AND status <> 'cancelado'
       ORDER BY created_at DESC
       LIMIT 600`,
      [String(bundle.store.id)]
    )) as any[];

    const soldByProductId = new Map<string, number>();
    for (const row of salesRows) {
      const items = parseJson<any[]>(row?.items_json, []);
      if (!Array.isArray(items)) continue;

      for (const rawItem of items) {
        const productId = String(rawItem?.product_id || "").trim();
        if (!productId) continue;
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

    res.json({
      success: true,
      store: {
        id: bundle.store.id,
        slug: bundle.store.slug,
        name: bundle.store.name,
        brand: bundle.store.brand || {},
        theme: bundle.store.theme || {},
      },
      categories: Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count })),
      best_sellers: fallbackBest,
      other_products: others,
      all_products: ranked,
      stats: {
        total_products: ranked.length,
        total_orders: salesRows.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to load catalog" });
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
    const created = await storefront.createPublicOrder(String(req.params.slug), req.body || {});
    res.status(201).json({ success: true, ...created });
  } catch (error: any) {
    const message = String(error.message || "");
    const badRequest = message.includes("required") || message.includes("invalid") || message.includes("not available") || message.includes("at least");
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

publicRouter.get("/delivery/confirm", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
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
