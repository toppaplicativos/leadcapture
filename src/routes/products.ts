import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { ProductsService } from "../services/products";
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
    const raw = await geminiService.generatePlainText(prompt);
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
  policy: StorePolicyContext;
  testimonials: ProductTestimonial[];
}): Promise<string | null> {
  const socialProofPreview = input.testimonials
    .slice(0, 3)
    .map((item) => `- ${item.name} (${item.city}): ${item.quote}`)
    .join("\n");

  const prompt = [
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
    `Prazo de entrega: ${input.policy.delivery_eta_label}`,
    `Política de frete: ${input.policy.shipping_policy_label}`,
    socialProofPreview ? `Exemplos de depoimentos para inspirar a prova social:\n${socialProofPreview}` : "",
    input.baseDescription ? `Descrição atual: ${String(input.baseDescription || "")}` : "",
    "Retorne APENAS a descrição final.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await geminiService.generatePlainText(prompt);
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

// POST create product
router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, description, category, price, promoPrice, unit, features, active } = req.body || {};
    
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!category || String(category).trim().length === 0) {
      return res.status(400).json({ error: "Category is required" });
    }

    if (!price || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: "Valid price is required" });
    }

    const product = await productsService.createProduct({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      category: String(category).trim(),
      price: parseFloat(price),
      promoPrice: promoPrice ? parseFloat(promoPrice) : undefined,
      unit: unit ? String(unit).trim() : "unidade",
      features: Array.isArray(features) ? features : [],
      is_active: active !== false,
      active: active !== false,
    }, userId, req.brandId);

    res.json({ success: true, product });
  } catch (error: any) {
    logger.error(error, "Error creating product");
    res.status(500).json({ error: error.message });
  }
});

// PUT update product
router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = String(req.params.id);
    const { name, description, category, price, promoPrice, unit, features, active, imageUrl } = req.body || {};

    const updated = await productsService.updateProduct(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      category: category !== undefined ? String(category).trim() : undefined,
      price: price !== undefined ? parseFloat(price) : undefined,
      promoPrice: promoPrice !== undefined ? parseFloat(promoPrice) : undefined,
      unit: unit !== undefined ? String(unit).trim() : undefined,
      features: features !== undefined ? (Array.isArray(features) ? features : []) : undefined,
      is_active: active !== undefined ? active : undefined,
      active: active !== undefined ? active : undefined,
      imageUrl: imageUrl !== undefined ? String(imageUrl) : undefined,
    }, userId, req.brandId);

    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json({ success: true, product: updated });
  } catch (error: any) {
    logger.error(error, "Error updating product");
    res.status(500).json({ error: error.message });
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
    const absoluteImageUrl = `${req.protocol}://${req.get("host")}${relativeImageUrl}`;
    const updated = await productsService.updateProduct(id, { imageUrl: absoluteImageUrl }, userId, req.brandId);

    if (!updated) return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      product: updated,
      imageUrl: absoluteImageUrl,
      absoluteImageUrl
    });
  } catch (error: any) {
    logger.error(error, "Error uploading product image");
    res.status(500).json({ error: error.message });
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
