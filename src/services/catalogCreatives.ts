/**
 * Catalog-aware creative composer.
 *
 * The existing CreativeStudioService is a low-level engine: it accepts
 * style/scene/lighting/headline/CTA/aspectRatio/etc and produces images.
 * That's powerful but it's not what a salon owner or restaurateur wants
 * to fill in. They want: "promote this product → done."
 *
 * This module bridges that gap. Given a product and a "section" (Promo,
 * Launch, Social proof, Educational, Date, Win-back, Featured), it:
 *   1. Reads the brand kit (logo, colors, slogan, voice)
 *   2. Reads the product (name, description, price, promoPrice, features, image)
 *   3. Computes the right tone, headline, subheadline, CTA, scene, lighting
 *   4. Calls CreativeStudioService.generateProductStudioImages with everything
 *      pre-filled — the user never touches a prompt field.
 */

import { CreativeStudioService } from "./creativeStudio";
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type SectionId =
  | "promo"
  | "launch"
  | "social-proof"
  | "educational"
  | "date"
  | "winback"
  | "featured";

export interface SectionDef {
  id: SectionId;
  label: string;
  emoji: string;
  description: string;
  /** Aspect ratios this section feels best in. */
  formats: ("1:1" | "9:16" | "4:5" | "16:9")[];
  /** Default style for the section's vibe. */
  style: string;
  /** Default scene context. */
  scene: string;
  lighting: string;
  textPosition: "top" | "center" | "bottom";
  textStyle: "bold" | "minimal" | "elegant";
  /** Heuristic that picks the strongest CTA verb for the section. */
  ctaPool: string[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "promo",
    label: "Promoção",
    emoji: "🎯",
    description: "Oferta com desconto, urgência, condição especial.",
    formats: ["1:1", "9:16"],
    style: "bold promotional retail product ad, energetic composition, conversion focused",
    scene: "vibrant studio backdrop with bold accent color from the brand palette",
    lighting: "high contrast bright lighting with crisp shadows",
    textPosition: "bottom",
    textStyle: "bold",
    ctaPool: ["Aproveitar agora", "Pedir já", "Comprar com desconto", "Garantir oferta"],
  },
  {
    id: "launch",
    label: "Lançamento",
    emoji: "🚀",
    description: "Novidade que acabou de entrar no catálogo.",
    formats: ["1:1", "9:16", "4:5"],
    style: "premium commercial product ad, editorial lighting, sophisticated reveal feel",
    scene: "minimal hero stage with soft gradient backdrop, product as centerpiece",
    lighting: "soft directional studio light with subtle rim highlight",
    textPosition: "top",
    textStyle: "elegant",
    ctaPool: ["Conhecer agora", "Ver detalhes", "Ser dos primeiros", "Quero conhecer"],
  },
  {
    id: "social-proof",
    label: "Prova social",
    emoji: "💬",
    description: "Depoimento, avaliação ou conquista para gerar confiança.",
    formats: ["1:1", "9:16"],
    style: "warm authentic lifestyle product ad, real moment feel, trustworthy",
    scene: "natural everyday environment matching product use, with depth blur",
    lighting: "warm golden hour natural light",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Ver mais avaliações", "Quero também", "Provar agora", "Junte-se aos clientes"],
  },
  {
    id: "educational",
    label: "Educacional",
    emoji: "📚",
    description: "Explica como usar, benefícios, comparativo.",
    formats: ["1:1", "4:5"],
    style: "clean informative product ad, infographic-friendly composition, educational",
    scene: "clean studio surface with negative space for callouts and bullet points",
    lighting: "even soft diffused light, balanced exposure",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Saiba mais", "Como funciona", "Veja os detalhes", "Tirar dúvidas"],
  },
  {
    id: "date",
    label: "Datas comemorativas",
    emoji: "🎉",
    description: "Mães, Pais, Natal, Black Friday, aniversário da marca.",
    formats: ["1:1", "9:16"],
    style: "celebratory festive product ad, themed seasonal decor, joyful",
    scene: "themed seasonal scene matching the date, warm color palette",
    lighting: "warm party lighting with bokeh highlights",
    textPosition: "bottom",
    textStyle: "bold",
    ctaPool: ["Comprar para presentear", "Aproveitar a data", "Garantir o seu", "Pedir agora"],
  },
  {
    id: "winback",
    label: "Recuperação",
    emoji: "🔁",
    description: "Trazer cliente inativo de volta, lembrar de carrinho.",
    formats: ["1:1", "9:16"],
    style: "inviting reminder product ad, warm welcoming feel, gentle urgency",
    scene: "cozy familiar environment, soft inviting backdrop",
    lighting: "warm amber soft light",
    textPosition: "center",
    textStyle: "minimal",
    ctaPool: ["Voltar a comprar", "Retomar pedido", "Sentimos sua falta", "Recuperar carrinho"],
  },
  {
    id: "featured",
    label: "Destaque",
    emoji: "⭐",
    description: "Showcase premium do produto, vitrine elegante.",
    formats: ["1:1", "4:5", "9:16"],
    style: "premium luxury product showcase, magazine quality, aspirational",
    scene: "elegant minimal stage, premium materials, deliberate composition",
    lighting: "studio key light with controlled shadows, high-end product photography",
    textPosition: "bottom",
    textStyle: "elegant",
    ctaPool: ["Conhecer o produto", "Ver no catálogo", "Quero esse", "Comprar agora"],
  },
];

export const SECTION_INDEX: Record<SectionId, SectionDef> = SECTIONS.reduce((acc, s) => {
  acc[s.id] = s;
  return acc;
}, {} as Record<SectionId, SectionDef>);

/* ────────────────────────────────────────────────────────── */
/*  Composition logic                                         */
/* ────────────────────────────────────────────────────────── */

interface ComposedCreative {
  productId: string;
  sectionId: SectionId;
  /** Pre-built params ready to call generateProductStudioImages. */
  studioParams: {
    productId: string;
    productAssetId?: string;
    style: string;
    scene: string;
    lighting: string;
    targetAudience?: string;
    predominantColors?: string;
    aspectRatio: "1:1" | "9:16" | "4:5" | "16:9";
    formats: ("1:1" | "9:16" | "4:5" | "16:9")[];
    textOverlay: {
      headline: string;
      subheadline?: string;
      cta: string;
      position: "top" | "center" | "bottom";
      style: "bold" | "minimal" | "elegant";
    };
    variations: number;
    quality: "fast" | "high";
    withAndWithoutText: boolean;
    tags: string[];
  };
  /** Hint info shown in the UI before generating ("you'll get N images, ~Xs"). */
  estimate: {
    jobs: number;
    seconds: number;
    creditsCost: number;
  };
}

/* Brazilian currency formatting that matches what the catalog UI uses. */
function formatBRL(cents: number | string | null | undefined): string {
  const n = Number(cents || 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function discountPct(price: number, promo: number): number {
  if (!price || !promo || promo >= price) return 0;
  return Math.round(((price - promo) / price) * 100);
}

function pickFromPool<T>(pool: T[], seed: string): T {
  /* Deterministic-ish pick from the section's CTA pool, so the same product +
   * section always defaults to the same CTA. The user can edit it after, but
   * a stable default is friendlier than random. */
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  promo_price: number | null;
  unit: string | null;
  features: any;
  image_url: string | null;
  created_at: string | null;
}

interface BrandRow {
  id: string;
  name: string | null;
  slogan: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  voice_json: any;
  logo_url: string | null;
}

function parseJsonish(value: any, fallback: any = null): any {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function asArray(value: any): string[] {
  const v = parseJsonish(value, value);
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Translate (product, section, brand) into ready-to-fire studio parameters.
 * No DB calls here — pure function so it's easy to test and reason about.
 */
export function composeStudioParams(
  product: ProductRow,
  section: SectionDef,
  brand: BrandRow | null,
  options: { variations?: number; quality?: "fast" | "high" } = {}
): ComposedCreative["studioParams"] {
  const features = asArray(product.features).slice(0, 3);
  const voice = parseJsonish(brand?.voice_json, {});
  const tone = String(voice?.tone || voice?.style || "premium e direto");
  const audience = String(voice?.audience || "clientes prontos para comprar pelo WhatsApp ou catálogo");

  const price = Number(product.price || 0);
  const promo = Number(product.promo_price || 0);
  const hasPromo = promo > 0 && promo < price;
  const pct = hasPromo ? discountPct(price, promo) : 0;

  /* Headline / subheadline / CTA composition is the heart of the
   * "auto-compose": each section pulls different fields from the product. */
  let headline = "";
  let subheadline = "";

  switch (section.id) {
    case "promo":
      if (hasPromo) {
        headline = `${product.name}\n${formatBRL(promo)}`;
        subheadline = `De ${formatBRL(price)} por ${formatBRL(promo)} · ${pct}% off`;
      } else {
        headline = product.name;
        subheadline = `Por apenas ${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}`;
      }
      break;
    case "launch":
      headline = `Chegou: ${product.name}`;
      subheadline = features[0] || product.description?.slice(0, 70) || `Disponível no catálogo da ${brand?.name || "loja"}`;
      break;
    case "social-proof":
      headline = `Por que escolhem ${product.name}`;
      subheadline = features[0] || `${brand?.slogan || "Cliente satisfeito, marca de confiança"}`;
      break;
    case "educational":
      headline = `Conheça ${product.name}`;
      subheadline = features.length ? features.join(" · ") : product.description?.slice(0, 90) || product.name;
      break;
    case "date":
      headline = product.name;
      subheadline = `Edição especial · ${brand?.name || "Loja"}`;
      break;
    case "winback":
      headline = `Sentimos sua falta`;
      subheadline = `${product.name} ainda te espera${hasPromo ? ` por ${formatBRL(promo)}` : ""}`;
      break;
    case "featured":
    default:
      headline = product.name;
      subheadline = features[0] || product.description?.slice(0, 70) || `${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}`;
      break;
  }

  const cta = pickFromPool(section.ctaPool, `${product.id}:${section.id}`);

  /* Build the predominant-colors hint from the brand kit. The studio passes
   * this verbatim into the Gemini prompt, which biases palette toward those
   * hex values. */
  const palette = [brand?.primary_color, brand?.secondary_color].filter(Boolean).join(", ");

  /* Tag the asset so the gallery can filter by section + product later. */
  const tags = [`section:${section.id}`, `product:${product.id}`, brand?.id ? `brand:${brand.id}` : ""]
    .filter(Boolean) as string[];

  return {
    productId: product.id,
    style: section.style,
    scene: section.scene,
    lighting: section.lighting,
    targetAudience: audience,
    predominantColors: palette || undefined,
    aspectRatio: section.formats[0],
    formats: section.formats,
    textOverlay: {
      headline,
      subheadline,
      cta,
      position: section.textPosition,
      style: section.textStyle,
    },
    variations: Math.min(3, Math.max(1, options.variations || 2)),
    quality: options.quality || "high",
    withAndWithoutText: false,
    tags,
  };
}

/* ────────────────────────────────────────────────────────── */
/*  DB lookups + orchestration                                */
/* ────────────────────────────────────────────────────────── */

/** Resolve column names defensively — some installs use legacy names. */
async function loadProduct(productId: string, brandId?: string | null): Promise<ProductRow | null> {
  const candidates = [
    `SELECT id, name, description, category, price, promo_price, unit, features, image_url, created_at
       FROM products WHERE id = ? LIMIT 1`,
    `SELECT id, name, description, category, price, promotional_price AS promo_price, unit, features, image_url, created_at
       FROM products WHERE id = ? LIMIT 1`,
  ];
  for (const sql of candidates) {
    try {
      const row = await queryOne<ProductRow>(sql, [productId]);
      if (row) return row;
    } catch {}
  }
  return null;
}

async function loadBrand(brandId: string): Promise<BrandRow | null> {
  try {
    const row = await queryOne<BrandRow>(
      `SELECT id, name, slogan, primary_color, secondary_color, voice_json, logo_url
         FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId]
    );
    if (row) return row;
  } catch {}
  return null;
}

/** Reuse the existing studio asset for this product image if we already
 *  registered one — avoids re-uploading the same product image every time. */
async function findExistingProductAssetId(
  userId: string,
  productId: string,
  brandId?: string | null
): Promise<string | null> {
  try {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM creative_assets
        WHERE user_id = ?
          AND COALESCE(brand_id::text, '') = COALESCE(?::text, '')
          AND asset_type = 'image'
          AND model = 'upload-manual'
          AND metadata->'studio'->>'productId' = ?
          AND metadata->'studio'->>'imageType' = 'product'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, brandId || null, productId]
    );
    return row?.id || null;
  } catch (err: any) {
    /* The query uses Postgres JSONB syntax — if we're on MySQL or the column
     * shape differs, just fall back to "no existing asset" and let the caller
     * register a new one. Not a blocking error. */
    return null;
  }
}

/* Convert any URL form ("https://app.../uploads/x.png", "/uploads/x.png",
 * "uploads/x.png") into the relative form CreativeStudioService expects. */
function normalizeProductImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  /* Absolute URL with /uploads/ inside: strip everything before /uploads/. */
  const match = trimmed.match(/\/uploads\/.+$/);
  if (match) return match[0];
  /* Bare relative path: ensure leading slash. */
  if (trimmed.startsWith("uploads/")) return "/" + trimmed;
  /* External URL or unrecognized: return as-is — register will likely fail
   * downstream, surfaced as a clear error to the user. */
  return trimmed;
}

interface AutoComposeResult {
  composed: ComposedCreative;
  assets: any[];
  product: { id: string; name: string };
  section: { id: SectionId; label: string };
}

/**
 * One-shot auto-compose: fetch product + brand, pick params from section,
 * register the product image as a studio asset (if not already), and call
 * the studio generator. Returns generated assets ready to render in UI.
 */
export async function autoComposeAndGenerate(
  studio: CreativeStudioService,
  userId: string,
  input: {
    productId: string;
    sectionId: SectionId;
    brandId?: string | null;
    variations?: number;
    quality?: "fast" | "high";
    formats?: ("1:1" | "9:16" | "4:5" | "16:9")[];
  }
): Promise<AutoComposeResult> {
  const section = SECTION_INDEX[input.sectionId];
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const product = await loadProduct(input.productId, input.brandId);
  if (!product) throw new Error("Produto não encontrado");

  const brand = input.brandId ? await loadBrand(input.brandId) : null;

  const studioParams = composeStudioParams(product, section, brand, {
    variations: input.variations,
    quality: input.quality,
  });

  /* Override formats if caller specified. */
  if (input.formats && input.formats.length) {
    studioParams.formats = input.formats;
    studioParams.aspectRatio = input.formats[0];
  }

  /* Asset hookup: register the product image (or reuse) so Gemini receives
   * the actual product photo as visual reference. */
  let productAssetId = await findExistingProductAssetId(userId, product.id, input.brandId);
  if (!productAssetId) {
    const normalized = normalizeProductImageUrl(product.image_url);
    if (normalized) {
      try {
        const asset = await studio.registerStudioImage(
          userId,
          {
            fileUrl: normalized,
            imageType: "product",
            productId: product.id,
            originalName: `${product.name}.jpg`,
            caption: product.name,
            tags: [`product:${product.id}`],
          },
          input.brandId
        );
        productAssetId = asset.id;
        logger.info(`auto-compose: registered product asset ${asset.id} for product=${product.id} brand=${input.brandId || 'none'}`);
      } catch (err: any) {
        logger.warn(`auto-compose: failed to register product image — ${err?.message || err}`);
        /* Not fatal: we still send the prompt with no image reference. The
         * model will draw something thematic from the description alone. */
      }
    }
  } else {
    logger.info(`auto-compose: reusing existing product asset ${productAssetId} for product=${product.id}`);
  }
  if (productAssetId) studioParams.productAssetId = productAssetId;
  logger.info(`auto-compose: invoking generateProductStudioImages userId=${userId} brandId=${input.brandId || 'none'} productAssetId=${productAssetId || 'none'}`);

  const result = await studio.generateProductStudioImages(
    userId,
    studioParams as any,
    input.brandId
  );

  return {
    composed: {
      productId: product.id,
      sectionId: section.id,
      studioParams,
      estimate: {
        jobs: studioParams.formats.length * studioParams.variations,
        seconds: studioParams.formats.length * studioParams.variations * 6,
        creditsCost: studioParams.formats.length * studioParams.variations,
      },
    },
    assets: (result as any).assets || [],
    product: { id: product.id, name: product.name },
    section: { id: section.id, label: section.label },
  };
}

/* ────────────────────────────────────────────────────────── */
/*  Proactive suggestions                                     */
/* ────────────────────────────────────────────────────────── */

export interface CreativeSuggestion {
  productId: string;
  productName: string;
  productImage: string | null;
  sectionId: SectionId;
  sectionLabel: string;
  reason: string;
  badge?: string;
}

/**
 * Heuristic-based "what should I post today?" suggestions. Three rules,
 * ordered by likely impact:
 *   1. Has an active promoPrice → pitch a Promo creative.
 *   2. Recently created (< 7d) → pitch a Launch creative.
 *   3. Active and has full info but no recent creative → pitch Featured.
 *
 * No ML, no scoring black-box: rules the user can predict. We dedupe to
 * surface different products in different cards.
 */
export async function getProactiveSuggestions(
  userId: string,
  brandId: string | null | undefined,
  max = 3
): Promise<CreativeSuggestion[]> {
  const out: CreativeSuggestion[] = [];
  const seen = new Set<string>();

  const params: any[] = [userId];
  let scope = "user_id = ?";
  if (brandId) {
    scope += " AND brand_id = ?";
    params.push(brandId);
  }

  /* Try the modern column set first; fall back if not present. */
  const fetchers: Array<{ sql: string; sectionId: SectionId; reason: (r: any) => string; badge?: string }> = [
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND promo_price IS NOT NULL
               AND price IS NOT NULL
               AND promo_price < price
             ORDER BY (price - promo_price) DESC
             LIMIT 5`,
      sectionId: "promo",
      reason: (r) => {
        const pct = discountPct(Number(r.price), Number(r.promo_price));
        return `Promoção ativa: ${pct}% de desconto`;
      },
      badge: "Promo",
    },
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND created_at > NOW() - INTERVAL '14 days'
             ORDER BY created_at DESC
             LIMIT 5`,
      sectionId: "launch",
      reason: () => "Adicionado recentemente",
      badge: "Novo",
    },
    {
      sql: `SELECT id, name, image_url, price, promo_price, created_at
              FROM products
             WHERE ${scope}
               AND COALESCE(active, is_active, true) = true
               AND image_url IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 5`,
      sectionId: "featured",
      reason: () => "Vitrine premium do catálogo",
      badge: "Destaque",
    },
  ];

  for (const f of fetchers) {
    try {
      const rows = (await query<any>(f.sql, params)) as any[];
      for (const r of rows || []) {
        if (out.length >= max) break;
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const section = SECTION_INDEX[f.sectionId];
        out.push({
          productId: id,
          productName: String(r.name || ""),
          productImage: r.image_url || null,
          sectionId: f.sectionId,
          sectionLabel: section.label,
          reason: f.reason(r),
          badge: f.badge,
        });
      }
    } catch (err: any) {
      logger.debug(`suggestion query skipped: ${err?.message || err}`);
    }
    if (out.length >= max) break;
  }

  return out.slice(0, max);
}
