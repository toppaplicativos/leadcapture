import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { ProductsService } from "../services/products";
import { offerCatalogService, productRelationsService } from "../services/offerCatalog";
import { invalidateCatalogCacheByBrand } from "../services/storefrontCache";
import { logger } from "../utils/logger";
import { GeminiService } from "../services/gemini";
import { query, queryOne, update } from "../config/database";

const router = Router();
const productsService = new ProductsService();
const geminiService = new GeminiService();
const PRODUCT_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
let metadataColumnReady = false;
let metadataColumnReadyPromise: Promise<void> | null = null;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function hasMeaningfulDescription(value: unknown): boolean {
  const text = String(value || "").trim();
  return text.length >= 60;
}

type StorePolicyContext = {
  source: "store_settings" | "fallback";
  store_id?: string;
  store_name?: string;
  delivery_eta_label: string;
  shipping_policy_label: string;
};

type ProductTestimonial = {
  name: string;
  role: string;
  city: string;
  quote: string;
  rating: number;
  verified_purchase: boolean;
};

type ProductRefineMode = "full" | "description_only";

function toMoneyBr(value: number): string {
  const amount = Number(value || 0);
  return `R$ ${amount.toFixed(2).replace(".", ",")}`;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeBrandId(value?: string | null): string {
  return String(value || "").trim();
}

function toEtaLabel(minutesRaw: unknown): string {
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Prazo de entrega informado no checkout.";
  }
  if (minutes <= 180) {
    return `Entrega média em ${Math.round(minutes)} minutos.`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `Entrega média em até ${hours} horas.`;
  }
  const days = Math.max(1, Math.round(hours / 24));
  return `Entrega média em até ${days} dia(s).`;
}

function sanitizeTestimonials(input: unknown): ProductTestimonial[] {
  if (!Array.isArray(input)) return [];
  const list = input
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const quote = normalizeText(row.quote);
      if (!quote || quote.length < 24) return null;
      const ratingRaw = Number(row.rating);
      const rating = Number.isFinite(ratingRaw) ? Math.max(4, Math.min(5, Math.round(ratingRaw))) : 5;
      return {
        name: normalizeText(row.name) || "Cliente verificado",
        role: normalizeText(row.role) || "Comprador(a)",
        city: normalizeText(row.city) || "Brasil",
        quote,
        rating,
        verified_purchase: row.verified_purchase !== false,
      } as ProductTestimonial;
    })
    .filter(Boolean) as ProductTestimonial[];

  return list.slice(0, 5);
}

function buildFallbackTestimonials(input: {
  productName: string;
  category?: string | null;
  deliveryLabel: string;
  shippingLabel: string;
}): ProductTestimonial[] {
  const names = ["Mariana", "Rafael", "Patrícia", "João", "Camila", "Bruno"];
  const roles = ["Cliente recorrente", "Primeira compra", "Comprador(a) online", "Consumidor(a) exigente"];
  const cities = ["São Paulo", "Belo Horizonte", "Curitiba", "Recife", "Porto Alegre", "Goiânia"];
  const product = normalizeText(input.productName) || "produto";
  const category = normalizeText(input.category) || "categoria";

  return [
    {
      name: names[0],
      role: roles[0],
      city: cities[0],
      quote: `Comprei o ${product} e a qualidade realmente surpreendeu. Chegou conforme combinado e veio muito bem embalado.` ,
      rating: 5,
      verified_purchase: true,
    },
    {
      name: names[1],
      role: roles[1],
      city: cities[1],
      quote: `Eu estava em dúvida na ${category}, mas esse modelo entregou exatamente o que eu precisava no dia a dia. ${input.deliveryLabel}`,
      rating: 5,
      verified_purchase: true,
    },
    {
      name: names[2],
      role: roles[2],
      city: cities[2],
      quote: `Atendimento rápido e compra sem dor de cabeça. Sobre frete: ${input.shippingLabel.toLowerCase()}`,
      rating: 4,
      verified_purchase: true,
    },
  ];
}

async function resolveStorePolicyContext(userId: string, brandId?: string | null): Promise<StorePolicyContext> {
  const normalizedBrand = normalizeBrandId(brandId);
  const whereBrand = normalizedBrand ? "AND s.brand_id = ?" : "AND (s.brand_id = '' OR s.brand_id IS NULL)";
  const params = normalizedBrand ? [userId, normalizedBrand] : [userId];

  const row = await queryOne<any>(
    `SELECT s.id, s.name, s.settings_json
     FROM storefront_stores s
     WHERE s.owner_user_id = ?
       ${whereBrand}
     ORDER BY (s.status = 'active') DESC, s.updated_at DESC
     LIMIT 1`,
    params
  );

  if (!row) {
    return {
      source: "fallback",
      delivery_eta_label: "Prazo de entrega informado no checkout.",
      shipping_policy_label: "Frete calculado automaticamente no checkout.",
    };
  }

  const settings = parseJson<Record<string, any>>(row.settings_json, {});
  const logistics = parseJson<Record<string, any>>(settings.logistics, {});
  const shipping = parseJson<Record<string, any>>(settings.shipping, {});

  const deliveryText =
    normalizeText(logistics.delivery_time_text) ||
    normalizeText(logistics.eta_text) ||
    normalizeText(shipping.delivery_time_text) ||
    toEtaLabel(logistics.default_eta_minutes ?? shipping.eta_minutes);

  const shippingTextRaw =
    normalizeText(logistics.shipping_policy) ||
    normalizeText(shipping.policy) ||
    normalizeText(logistics.frete_texto) ||
    normalizeText(shipping.frete_texto);

  let shippingText = shippingTextRaw;
  if (!shippingText) {
    const freeAbove = Number(logistics.free_shipping_above ?? shipping.free_shipping_above);
    const fixedFee = Number(logistics.shipping_fee ?? shipping.fee ?? shipping.fixed_fee);
    if (Number.isFinite(freeAbove) && freeAbove > 0) {
      shippingText = `Frete grátis acima de ${toMoneyBr(freeAbove)}.`;
    } else if (Number.isFinite(fixedFee) && fixedFee > 0) {
      shippingText = `Frete a partir de ${toMoneyBr(fixedFee)}.`;
    }
  }

  return {
    source: "store_settings",
    store_id: normalizeText(row.id) || undefined,
    store_name: normalizeText(row.name) || undefined,
    delivery_eta_label: deliveryText || "Prazo de entrega informado no checkout.",
    shipping_policy_label: shippingText || "Frete calculado automaticamente no checkout.",
  };
}

async function generateRefinedProductTestimonials(input: {
  productName: string;
  category?: string | null;
  price?: number;
  promoPrice?: number | null;
  policy: StorePolicyContext;
  userId?: string | null;
  brandId?: string | null;
}): Promise<ProductTestimonial[]> {
  const prompt = [
    "Você gera prova social humanizada para páginas de produto de e-commerce.",
    "Retorne APENAS JSON válido.",
    "Formato obrigatório:",
    '{"testimonials":[{"name":"string","role":"string","city":"string","quote":"string","rating":5,"verified_purchase":true}]}',
    "Regras:",
    "- Gerar de 3 a 5 depoimentos variados e realistas",
    "- Linguagem natural, sem parecer robô",
    "- Evitar promessas absolutas",
    "- Incluir variação de contexto de uso",
    "- Considerar política de prazo e frete abaixo de forma orgânica",
    "- quote com 1 a 2 frases curtas",
    `Produto: ${normalizeText(input.productName) || "Produto"}`,
    `Categoria: ${normalizeText(input.category) || "geral"}`,
    `Preço: ${toMoneyBr(Number(input.price || 0))}`,
    input.promoPrice ? `Preço promocional: ${toMoneyBr(Number(input.promoPrice || 0))}` : "",
    `Prazo de entrega: ${input.policy.delivery_eta_label}`,
    `Política de frete: ${input.policy.shipping_policy_label}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await geminiService.generatePlainText(prompt, {
      userId: input.userId || undefined,
      brandId: input.brandId || undefined,
    });
    const clean = String(raw || "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(clean);
    const testimonials = sanitizeTestimonials(parsed?.testimonials);
    if (testimonials.length > 0) return testimonials;
  } catch {
    // fallback below
  }

  return buildFallbackTestimonials({
    productName: input.productName,
    category: input.category,
    deliveryLabel: input.policy.delivery_eta_label,
    shippingLabel: input.policy.shipping_policy_label,
  });
}

async function ensureProductsMetadataColumn(): Promise<void> {
  if (metadataColumnReady) return;
  if (metadataColumnReadyPromise) {
    await metadataColumnReadyPromise;
    return;
  }

  metadataColumnReadyPromise = (async () => {
    const col = await queryOne<any>("SHOW COLUMNS FROM products LIKE 'metadata_json'");
    if (!col) {
      await query("ALTER TABLE products ADD COLUMN metadata_json JSON NULL");
    }
    metadataColumnReady = true;
  })().finally(() => {
    metadataColumnReadyPromise = null;
  });

  await metadataColumnReadyPromise;
}

async function generateRefinedProductDescription(input: {
  name: string;
  category?: string | null;
  baseDescription?: string | null;
  price?: number;
  promoPrice?: number | null;
  hasImage?: boolean;
  policy?: StorePolicyContext;
  testimonials?: ProductTestimonial[];
  mode?: ProductRefineMode;
  userId?: string | null;
  brandId?: string | null;
}): Promise<string | null> {
  const mode: ProductRefineMode = input.mode === "description_only" ? "description_only" : "full";
  const testimonials = Array.isArray(input.testimonials) ? input.testimonials : [];
  const socialProofPreview = testimonials
    .slice(0, 3)
    .map((item) => `- ${item.name} (${item.city}): ${item.quote}`)
    .join("\n");

  const prompt = (
    mode === "description_only"
      ? [
          "Você é especialista em descrição de produto para e-commerce.",
          "Tarefa: reescrever e expandir somente a descrição do produto.",
          "Objetivo: melhorar clareza, contexto de uso, benefícios e valor percebido sem misturar temas comerciais externos.",
          "Regras:",
          "- Português-BR natural, claro e convincente",
          "- 3 a 4 parágrafos curtos",
          "- Trabalhe apenas a descrição do produto",
          "- Não mencionar frete, entrega, prazo, checkout, pagamento, política da loja, atendimento ou promoções",
          "- Não inventar depoimentos, garantias, bônus ou especificações técnicas não informadas",
          "- Não usar markdown",
          "- Máximo ~1100 caracteres",
          `Produto: ${String(input.name || "Produto")}`,
          `Categoria: ${String(input.category || "geral")}`,
          input.baseDescription
            ? `Descrição base: ${String(input.baseDescription || "")}`
            : "Se a descrição base for curta, complemente com linguagem segura a partir do nome e categoria, sem inventar detalhes técnicos.",
          "Retorne APENAS a descrição final.",
        ]
      : [
          "Você é especialista em copy de produto para e-commerce com foco em conversão.",
          "Tarefa: gerar uma descrição refinada para página de produto.",
          "Regras:",
          "- Português-BR natural e persuasivo",
          "- 3 a 5 parágrafos curtos",
          "- Traga contexto de uso + benefícios + diferenciais",
          "- Incluir prova social (tom humano) sem exageros",
          "- Mencionar prazo e frete de forma transparente e natural",
          "- Evite promessas que não possam ser comprovadas",
          "- Sem markdown",
          "- Máximo ~1300 caracteres",
          `Produto: ${String(input.name || "Produto")}`,
          `Categoria: ${String(input.category || "geral")}`,
          `Preço: R$ ${Number(input.price || 0).toFixed(2)}`,
          input.promoPrice ? `Preço promocional: R$ ${Number(input.promoPrice || 0).toFixed(2)}` : "",
          `Imagem disponível: ${input.hasImage ? "sim" : "não"}`,
          input.policy ? `Prazo de entrega: ${input.policy.delivery_eta_label}` : "",
          input.policy ? `Política de frete: ${input.policy.shipping_policy_label}` : "",
          socialProofPreview ? `Exemplos de depoimentos para inspirar a prova social:\n${socialProofPreview}` : "",
          input.baseDescription ? `Descrição atual: ${String(input.baseDescription || "")}` : "",
          "Retorne APENAS a descrição final.",
        ]
  )
    .filter(Boolean)
    .join("\n");

  try {
    const text = await geminiService.generatePlainText(prompt, {
      userId: input.userId || undefined,
      brandId: input.brandId || undefined,
    });
    const normalized = String(text || "").trim();
    return normalized || null;
  } catch {
    return null;
  }
}

const productImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/product-images");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const uploadProductImage = multer({
  storage: productImageStorage,
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES }
});

const uploadProductGalleryImages = multer({
  storage: productImageStorage,
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES }
});

const uploadProductDynamicCoverImage = multer({
  storage: productImageStorage,
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES }
});

function withMulterErrorHandling(middleware: (req: any, res: any, cb: (err?: any) => void) => void) {
  return (req: BrandRequest, res: Response, next: NextFunction) => {
    middleware(req, res, (err?: any) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `Image too large. Max size is ${Math.floor(PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))}MB`,
          code: "LIMIT_FILE_SIZE",
        });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: err.message || "Invalid upload payload",
          code: err.code,
        });
      }
      logger.error(err, "Multer upload failed");
      return res.status(400).json({ error: "Invalid upload payload" });
    });
  };
}

router.use(authMiddleware, requireBrandContext);

router.post("/refine-description-preview", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const name = normalizeText(req.body?.name) || "Produto";
    const baseDescription = normalizeText(req.body?.description);
    if (!baseDescription) {
      return res.status(400).json({ error: "Description is required" });
    }

    const refinedDescription = await generateRefinedProductDescription({
      name,
      category: normalizeText(req.body?.category) || null,
      baseDescription,
      price: Number(req.body?.price || 0),
      promoPrice:
        req.body?.promoPrice !== undefined && req.body?.promoPrice !== null && req.body?.promoPrice !== ""
          ? Number(req.body.promoPrice)
          : null,
      hasImage: Boolean(req.body?.hasImage),
      mode: "description_only",
      userId,
      brandId: req.brandId || null,
    });

    if (!refinedDescription) {
      return res.status(500).json({ error: "Failed to refine description" });
    }

    res.json({
      success: true,
      description: refinedDescription,
      mode: "description_only",
    });
  } catch (error: any) {
    logger.error(error, "Error previewing refined product description");
    res.status(500).json({ error: error.message || "Failed to preview refined description" });
  }
});

// GET all products
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const products = await productsService.getProducts(userId, req.brandId);
    res.json({ success: true, products });
  } catch (error: any) {
    logger.error(error, "Error listing products");
    res.status(500).json({ error: error.message });
  }
});

type ProductFieldErrors = Partial<Record<"name" | "category" | "price", string>>;

function collectProductPublishErrors(input: {
  name?: unknown;
  category?: unknown;
  price?: unknown;
}): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  const name = normalizeText(input.name);
  const category = normalizeText(input.category);
  const priceRaw = input.price;

  if (!name) errors.name = "Nome é obrigatório";
  if (!category) errors.category = "Categoria é obrigatória";
  if (priceRaw == null || priceRaw === "" || !Number.isFinite(parseFloat(String(priceRaw)))) {
    errors.price = "Preço válido é obrigatório";
  } else if (parseFloat(String(priceRaw)) < 0) {
    errors.price = "Preço não pode ser negativo";
  }

  return errors;
}

function buildDraftProductName(rawName?: unknown): string {
  const name = normalizeText(rawName);
  if (name) return name;
  const stamp = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Rascunho ${stamp}`;
}

// POST create product
router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const saveAsDraft = body.save_as_draft === true || body.status === "draft";
    const fieldErrors = saveAsDraft ? {} : collectProductPublishErrors(body);

    if (!saveAsDraft && Object.keys(fieldErrors).length > 0) {
      const messages = Object.values(fieldErrors);
      return res.status(400).json({
        error: messages.join(" · "),
        fields: fieldErrors,
      });
    }

    const rawName = normalizeText(body.name);
    const rawDescription = normalizeText(body.description);
    if (saveAsDraft && !rawName && !rawDescription) {
      return res.status(400).json({
        error: "Informe ao menos o nome ou a descrição para salvar o rascunho",
        fields: { name: "Nome ou descrição é obrigatório" },
      });
    }

    const missingFields: string[] = [];
    if (!rawName) missingFields.push("name");
    if (!normalizeText(body.category)) missingFields.push("category");
    if (body.price == null || body.price === "" || !Number.isFinite(parseFloat(String(body.price)))) {
      missingFields.push("price");
    }

    const parsedPrice = body.price == null || body.price === ""
      ? 0
      : parseFloat(String(body.price));
    const finalPrice = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;
    const publishReady = missingFields.length === 0;
    const shouldStayDraft = saveAsDraft || !publishReady;

    const metadata = {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      is_draft: shouldStayDraft,
      missing_fields: shouldStayDraft ? missingFields : [],
      draft_saved_at: shouldStayDraft ? new Date().toISOString() : null,
    };

    /* Pass through all OfferEntity fields (Fase 0+) — service guards by column existence. */
    const product = await productsService.createProduct({
      name: buildDraftProductName(body.name),
      description: rawDescription,
      category: normalizeText(body.category) || undefined,
      price: finalPrice,
      promoPrice: body.promoPrice ? parseFloat(body.promoPrice) : undefined,
      unit: body.unit ? String(body.unit).trim() : "unidade",
      features: Array.isArray(body.features) ? body.features : [],
      is_active: shouldStayDraft ? false : body.active !== false,
      active: shouldStayDraft ? false : body.active !== false,
      metadata,
      /* OfferEntity */
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
      ...(body.cta_type !== undefined ? { cta_type: body.cta_type } : {}),
      ...(body.pipeline_id !== undefined ? { pipeline_id: body.pipeline_id } : {}),
      ...(body.attributes !== undefined ? { attributes: body.attributes } : {}),
      ...(body.seo !== undefined ? { seo: body.seo } : {}),
      ...(body.media !== undefined ? { media: body.media } : {}),
      ...(body.service_config !== undefined ? { service_config: body.service_config } : {}),
      ...(body.configurator !== undefined ? { configurator: body.configurator } : {}),
      ...(body.bundle_items !== undefined ? { bundle_items: body.bundle_items } : {}),
      ...(body.stock_quantity !== undefined ? { stock_quantity: body.stock_quantity } : {}),
      ...(body.stock_threshold_low !== undefined ? { stock_threshold_low: body.stock_threshold_low } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
    } as any, userId, req.brandId);

    res.json({
      success: true,
      product,
      draft: shouldStayDraft,
      missing_fields: shouldStayDraft ? missingFields : [],
    });
  } catch (error: any) {
    logger.error(error, "Error creating product");
    res.status(500).json({ error: error.message || "Erro ao criar produto" });
  }
});

// PUT update product
router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id);
    const body = req.body || {};
    const saveAsDraft = body.save_as_draft === true || body.status === "draft";
    const existing = await productsService.getProduct(id, userId, req.brandId);
    if (!existing) return res.status(404).json({ error: "Produto não encontrado" });

    const mergedForValidation = {
      name: body.name !== undefined ? body.name : existing.name,
      category: body.category !== undefined ? body.category : existing.category,
      price: body.price !== undefined ? body.price : existing.price,
    };
    const fieldErrors = saveAsDraft ? {} : collectProductPublishErrors(mergedForValidation);

    if (!saveAsDraft && Object.keys(fieldErrors).length > 0) {
      const messages = Object.values(fieldErrors);
      return res.status(400).json({
        error: messages.join(" · "),
        fields: fieldErrors,
      });
    }

    const missingFields: string[] = [];
    if (!normalizeText(mergedForValidation.name)) missingFields.push("name");
    if (!normalizeText(mergedForValidation.category)) missingFields.push("category");
    if (
      mergedForValidation.price == null
      || mergedForValidation.price === ""
      || !Number.isFinite(parseFloat(String(mergedForValidation.price)))
    ) {
      missingFields.push("price");
    }
    const publishReady = missingFields.length === 0;
    const shouldStayDraft = saveAsDraft || !publishReady;

    const baseMetadata = (existing as any).metadata && typeof (existing as any).metadata === "object"
      ? (existing as any).metadata
      : {};
    const metadata = {
      ...baseMetadata,
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      is_draft: shouldStayDraft,
      missing_fields: shouldStayDraft ? missingFields : [],
      draft_saved_at: shouldStayDraft ? new Date().toISOString() : null,
    };

    /* Build a clean payload: legacy fields with type coercion + ALL OfferEntity fields
     * (Fase 0+) forwarded verbatim. The service itself guards each field by checking
     * column existence, so passing extras is safe. The OLD whitelist destructuring
     * silently dropped type/cta_type/configurator/seo/attributes/subtitle/service_config/bundle_items
     * → save via API never persisted these. */
    const payload: any = {
      /* Legacy / typed */
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      description: body.description !== undefined ? String(body.description).trim() : undefined,
      category: body.category !== undefined ? String(body.category).trim() : undefined,
      price: body.price !== undefined ? parseFloat(body.price) : undefined,
      promoPrice: body.promoPrice !== undefined ? (body.promoPrice === null ? null : parseFloat(body.promoPrice)) : undefined,
      unit: body.unit !== undefined ? String(body.unit).trim() : undefined,
      features: body.features !== undefined ? (Array.isArray(body.features) ? body.features : []) : undefined,
      is_active: shouldStayDraft ? false : (body.active !== undefined ? body.active : undefined),
      active: shouldStayDraft ? false : (body.active !== undefined ? body.active : undefined),
      imageUrl: body.imageUrl !== undefined ? String(body.imageUrl) : undefined,
      metadata,
      /* OfferEntity (Fase 0+) */
      type: body.type !== undefined ? body.type : undefined,
      subtitle: body.subtitle !== undefined ? body.subtitle : undefined,
      cta_type: body.cta_type !== undefined ? body.cta_type : undefined,
      pipeline_id: body.pipeline_id !== undefined ? body.pipeline_id : undefined,
      attributes: body.attributes !== undefined ? body.attributes : undefined,
      seo: body.seo !== undefined ? body.seo : undefined,
      media: body.media !== undefined ? body.media : undefined,
      service_config: body.service_config !== undefined ? body.service_config : undefined,
      configurator: body.configurator !== undefined ? body.configurator : undefined,
      bundle_items: body.bundle_items !== undefined ? body.bundle_items : undefined,
      ...(body.stock_quantity !== undefined ? { stock_quantity: body.stock_quantity } : {}),
      ...(body.stock_threshold_low !== undefined ? { stock_threshold_low: body.stock_threshold_low } : {}),
    };

    const updated = await productsService.updateProduct(id, payload, userId, req.brandId);

    if (!updated) return res.status(404).json({ error: "Produto não encontrado" });
    res.json({
      success: true,
      product: updated,
      draft: shouldStayDraft,
      missing_fields: shouldStayDraft ? missingFields : [],
    });
  } catch (error: any) {
    logger.error(error, "Error updating product");
    res.status(500).json({ error: error.message || "Erro ao atualizar produto" });
  }
});

// DELETE product
router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ok = await productsService.deleteProduct(String(req.params.id), userId, req.brandId);
    if (!ok) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting product");
    res.status(500).json({ error: error.message });
  }
});

/* ── Variants (Fase 1) ── */
router.get("/:id/variants", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = await productsService.getProduct(String(req.params.id), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const variants = await offerCatalogService.getVariantsByProduct(String(req.params.id));
    res.json({ success: true, variants });
  } catch (error: any) {
    logger.error(error, "Error listing variants");
    res.status(500).json({ error: error.message });
  }
});

/* ── Product Relations (Fase 6) ── */
router.get("/:id/relations", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = await productsService.getProduct(String(req.params.id), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const relations = await productRelationsService.listForProduct(String(req.params.id));
    res.json({ success: true, relations });
  } catch (error: any) {
    logger.error(error, "Error listing product relations");
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id/relations", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = await productsService.getProduct(String(req.params.id), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const relations = Array.isArray(req.body?.relations) ? req.body.relations : [];
    const saved = await productRelationsService.replaceRelations(String(req.params.id), relations);
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true, relations: saved });
  } catch (error: any) {
    logger.error(error, "Error replacing relations");
    res.status(500).json({ error: error.message });
  }
});

/** Replace the full variant set for a product (idempotent). */
router.put("/:id/variants", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const product = await productsService.getProduct(String(req.params.id), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const variants = Array.isArray(req.body?.variants) ? req.body.variants : [];
    const saved = await offerCatalogService.replaceVariants(String(req.params.id), variants);
    if (req.brandId) await invalidateCatalogCacheByBrand(String(req.brandId));
    res.json({ success: true, variants: saved });
  } catch (error: any) {
    logger.error(error, "Error replacing variants");
    res.status(500).json({ error: error.message });
  }
});

// POST upload product image
router.post("/:id/image", withMulterErrorHandling(uploadProductImage.single("image")), async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image file is required" });
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    const id = String(req.params.id);
    const relativeImageUrl = `/uploads/product-images/${file.filename}`;
    const updated = await productsService.updateProduct(id, { imageUrl: relativeImageUrl }, userId, req.brandId);

    if (!updated) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      product: updated,
      imageUrl: relativeImageUrl
    });
  } catch (error: any) {
    logger.error(error, "Error uploading product image");
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/gallery-images", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const product = await productsService.getProduct(String(req.params.id), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      coverImage: product.imageUrl || null,
      images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
      product,
    });
  } catch (error: any) {
    logger.error(error, "Error loading product gallery images");
    res.status(500).json({ error: error.message || "Failed to load product gallery" });
  }
});

router.put("/:id/gallery-images", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const images = Array.isArray(req.body?.images)
      ? req.body.images.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];

    const product = await productsService.replaceProductGalleryImages(
      String(req.params.id),
      images,
      userId,
      req.brandId,
    );

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      coverImage: product.imageUrl || null,
      images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
      product,
    });
  } catch (error: any) {
    logger.error(error, "Error replacing product gallery images");
    res.status(500).json({ error: error.message || "Failed to save product gallery" });
  }
});

router.post("/:id/gallery-images/upload", withMulterErrorHandling(uploadProductGalleryImages.array("images", 12)), async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: "Image files are required" });

    for (const file of files) {
      if (!String(file.mimetype || "").startsWith("image/")) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }
    }

    const imageUrls = files.map((file) => `${req.protocol}://${req.get("host")}/uploads/product-images/${file.filename}`);
    const product = await productsService.appendProductGalleryImages(
      String(req.params.id),
      imageUrls,
      userId,
      req.brandId,
    );

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      uploaded: imageUrls,
      coverImage: product.imageUrl || null,
      images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
      product,
    });
  } catch (error: any) {
    logger.error(error, "Error uploading product gallery images");
    res.status(500).json({ error: error.message || "Failed to upload gallery images" });
  }
});

router.delete("/:id/gallery-images/:index", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: "Invalid gallery image index" });
    }

    const product = await productsService.removeProductGalleryImage(
      String(req.params.id),
      index,
      userId,
      req.brandId,
    );

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      coverImage: product.imageUrl || null,
      images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
      product,
    });
  } catch (error: any) {
    logger.error(error, "Error removing product gallery image");
    res.status(500).json({ error: error.message || "Failed to remove gallery image" });
  }
});

// POST upload image to use in dynamic covers
router.post("/:id/dynamic-covers/image", withMulterErrorHandling(uploadProductDynamicCoverImage.single("image")), async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image file is required" });
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    const productId = String(req.params.id);
    const product = await productsService.getProduct(productId, userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const relativeImageUrl = `/uploads/product-images/${file.filename}`;
    const absoluteImageUrl = `${req.protocol}://${req.get("host")}${relativeImageUrl}`;

    res.json({
      success: true,
      productId,
      imageUrl: absoluteImageUrl,
      absoluteImageUrl,
    });
  } catch (error: any) {
    logger.error(error, "Error uploading dynamic cover image");
    res.status(500).json({ error: error.message });
  }
});

// GET dynamic covers for a product
router.get("/:id/dynamic-covers", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const covers = await productsService.listDynamicCovers(String(req.params.id), userId, req.brandId);
    res.json({ success: true, covers });
  } catch (error: any) {
    logger.error(error, "Error listing dynamic covers");
    res.status(500).json({ error: error.message });
  }
});

// POST create dynamic cover for a product
router.post("/:id/dynamic-covers", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, imageUrl, tags, priority, active } = req.body || {};
    if (!imageUrl || !String(imageUrl).trim()) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const created = await productsService.createDynamicCover(
      String(req.params.id),
      {
        title: title !== undefined ? String(title) : undefined,
        imageUrl: String(imageUrl).trim(),
        tags: Array.isArray(tags) ? tags.map((item) => String(item)) : undefined,
        priority: priority !== undefined ? Number(priority) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
      userId,
      req.brandId,
    );

    if (!created) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, cover: created });
  } catch (error: any) {
    logger.error(error, "Error creating dynamic cover");
    res.status(500).json({ error: error.message });
  }
});

// PUT update dynamic cover
router.put("/:id/dynamic-covers/:coverId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, imageUrl, tags, priority, active } = req.body || {};
    const updated = await productsService.updateDynamicCover(
      String(req.params.id),
      String(req.params.coverId),
      {
        title: title !== undefined ? String(title) : undefined,
        imageUrl: imageUrl !== undefined ? String(imageUrl).trim() : undefined,
        tags: tags !== undefined ? (Array.isArray(tags) ? tags.map((item) => String(item)) : []) : undefined,
        priority: priority !== undefined ? Number(priority) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
      userId,
      req.brandId,
    );

    if (!updated) return res.status(404).json({ error: "Dynamic cover not found" });
    res.json({ success: true, cover: updated });
  } catch (error: any) {
    logger.error(error, "Error updating dynamic cover");
    res.status(500).json({ error: error.message });
  }
});

// DELETE dynamic cover
router.delete("/:id/dynamic-covers/:coverId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const ok = await productsService.deleteDynamicCover(
      String(req.params.id),
      String(req.params.coverId),
      userId,
      req.brandId,
    );

    if (!ok) return res.status(404).json({ error: "Dynamic cover not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error deleting dynamic cover");
    res.status(500).json({ error: error.message });
  }
});

// POST resolve best dynamic cover by tags
router.post("/:id/dynamic-covers/resolve", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((item: unknown) => String(item)) : [];
    const cover = await productsService.resolveDynamicCover(String(req.params.id), { tags }, userId, req.brandId);
    res.json({ success: true, cover });
  } catch (error: any) {
    logger.error(error, "Error resolving dynamic cover");
    res.status(500).json({ error: error.message });
  }
});

// POST refine product content with AI and persist refinement status
router.post("/:id/refine", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const productId = String(req.params.id || "").trim();
    const force = req.body?.force === true;
    if (!productId) return res.status(400).json({ error: "Product id is required" });

    const owned = await productsService.getProduct(productId, userId, req.brandId);
    if (!owned) return res.status(404).json({ error: "Product not found" });

    await ensureProductsMetadataColumn();
    const row = await queryOne<any>(
      `SELECT id, name, description, category, price, promo_price, image_url, metadata_json
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [productId]
    );

    if (!row) return res.status(404).json({ error: "Product not found" });

    const metadata = parseJson<Record<string, any>>(row.metadata_json, {});
    const refinement = metadata?.refinement && typeof metadata.refinement === "object" ? metadata.refinement : {};
    const alreadyRefined = refinement?.refined === true;
    const storePolicy = await resolveStorePolicyContext(userId, req.brandId);

    const testimonials = await generateRefinedProductTestimonials({
      productName: String(row.name || owned.name || "Produto"),
      category: String(row.category || owned.category || "").trim() || null,
      price: Number(row.price || owned.price || 0),
      promoPrice:
        row.promo_price !== undefined && row.promo_price !== null
          ? Number(row.promo_price)
          : typeof owned.promoPrice === "number"
          ? Number(owned.promoPrice)
          : null,
      policy: storePolicy,
      userId,
      brandId: req.brandId || null,
    });

    if (alreadyRefined && !force) {
      return res.json({
        success: true,
        refined: false,
        already_refined: true,
        refinement: {
          ...refinement,
          social_proof: refinement?.social_proof || { testimonials },
          store_policies: refinement?.store_policies || {
            delivery: storePolicy.delivery_eta_label,
            shipping: storePolicy.shipping_policy_label,
            store_name: storePolicy.store_name || null,
          },
        },
        product: owned,
      });
    }

    const generated = await generateRefinedProductDescription({
      name: String(row.name || owned.name || "Produto"),
      category: String(row.category || owned.category || "").trim() || null,
      baseDescription: String(row.description || owned.description || "").trim() || null,
      price: Number(row.price || owned.price || 0),
      promoPrice:
        row.promo_price !== undefined && row.promo_price !== null
          ? Number(row.promo_price)
          : typeof owned.promoPrice === "number"
          ? Number(owned.promoPrice)
          : null,
      hasImage: Boolean(String(row.image_url || owned.imageUrl || "").trim()),
      policy: storePolicy,
      testimonials,
      mode: "full",
      userId,
      brandId: req.brandId || null,
    });

    const baseDescription = String(row.description || owned.description || "").trim();
    const nextDescription = generated || baseDescription;
    const nextRefinement = {
      refined: hasMeaningfulDescription(nextDescription),
      refined_at: new Date().toISOString(),
      source: generated ? "ai" : "fallback",
      force_applied: force,
      social_proof: {
        testimonials,
      },
      store_policies: {
        delivery: storePolicy.delivery_eta_label,
        shipping: storePolicy.shipping_policy_label,
        store_name: storePolicy.store_name || null,
      },
    };

    const nextMetadata = {
      ...metadata,
      refinement: nextRefinement,
    };

    await update(
      `UPDATE products
       SET description = ?, metadata_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextDescription || null, JSON.stringify(nextMetadata), productId]
    );

    const updatedProduct = await productsService.getProduct(productId, userId, req.brandId);
    return res.json({
      success: true,
      refined: true,
      already_refined: false,
      refinement: nextRefinement,
      product: updatedProduct || owned,
    });
  } catch (error: any) {
    logger.error(error, "Error refining product");
    res.status(500).json({ error: error.message || "Failed to refine product" });
  }
});

router.get("/:id/refine-status", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const productId = String(req.params.id || "").trim();
    const owned = await productsService.getProduct(productId, userId, req.brandId);
    if (!owned) return res.status(404).json({ error: "Product not found" });

    await ensureProductsMetadataColumn();
    const row = await queryOne<any>(
      `SELECT metadata_json
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [productId]
    );
    const metadata = parseJson<Record<string, any>>(row?.metadata_json, {});
    const refinement = metadata?.refinement && typeof metadata.refinement === "object" ? metadata.refinement : null;
    const refined = refinement?.refined === true;

    res.json({
      success: true,
      refined,
      refinement,
    });
  } catch (error: any) {
    logger.error(error, "Error getting product refine status");
    res.status(500).json({ error: error.message || "Failed to load refine status" });
  }
});

export default router;
