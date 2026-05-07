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

/* All values the user can tweak in the configuration modal. Every field is
 * optional — defaults come from `composeStudioParams`. */
export interface ComposeOverrides {
  variations?: number;
  quality?: "fast" | "high";
  formats?: ("1:1" | "9:16" | "4:5" | "16:9")[];
  /** Free-form intent: "vender", "lancar", "gerar interesse", etc. Goes
   *  straight into the prompt as a high-level objective. */
  objective?: string;
  /** Override the visual mood without rewriting the whole prompt. */
  style?: string;
  scene?: string;
  lighting?: string;
  /** User-edited copy — replaces the auto-suggested defaults. */
  headline?: string;
  subheadline?: string;
  cta?: string;
  textPosition?: "top" | "center" | "bottom";
  textStyle?: "bold" | "minimal" | "elegant";
  /** Brand voice overrides. Default reads voice_json. */
  tone?: string;
  targetAudience?: string;
  /** When true, instruct the image model to render the typography directly
   *  in the picture (Grok Imagine excels at this). When false (default),
   *  the studio paints text via SVG overlay after generation — more
   *  consistent legibility but typography looks "stuck on top". */
  embedTextInImage?: boolean;
  /** Pinned palette hint (hex csv). Overrides brand kit. */
  predominantColors?: string;
}

/**
 * Translate (product, section, brand) into ready-to-fire studio parameters.
 * No DB calls here — pure function so it's easy to test and reason about.
 *
 * Every override in `options` wins over the defaults derived from the
 * section + product so the configuration modal can let users tweak anything.
 */
export function composeStudioParams(
  product: ProductRow,
  section: SectionDef,
  brand: BrandRow | null,
  options: ComposeOverrides = {}
): ComposedCreative["studioParams"] {
  const features = asArray(product.features).slice(0, 3);
  const voice = parseJsonish(brand?.voice_json, {});
  const audience = String(options.targetAudience || voice?.audience || "clientes prontos para comprar pelo WhatsApp ou catálogo");

  const price = Number(product.price || 0);
  const promo = Number(product.promo_price || 0);
  const hasPromo = promo > 0 && promo < price;
  const pct = hasPromo ? discountPct(price, promo) : 0;

  /* Default copy per section — used unless the caller passes an override.
   * These are starting points, NOT a literal copy of the product fields:
   * the modal lets the user (or a separate IA call) replace them entirely. */
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

  const ctaDefault = pickFromPool(section.ctaPool, `${product.id}:${section.id}`);

  /* Apply overrides on top of defaults. Empty strings count as "not set". */
  if (options.headline && options.headline.trim()) headline = options.headline;
  if (options.subheadline && options.subheadline.trim()) subheadline = options.subheadline;
  const cta = options.cta && options.cta.trim() ? options.cta : ctaDefault;

  /* Build the predominant-colors hint from the brand kit. The studio passes
   * this verbatim into the Gemini prompt, which biases palette toward those
   * hex values. */
  const palette = options.predominantColors || [brand?.primary_color, brand?.secondary_color].filter(Boolean).join(", ");

  /* Section vibe defaults — overridable. */
  const style = options.style || section.style;
  const scene = options.scene || section.scene;
  const lighting = options.lighting || section.lighting;
  const textPosition = options.textPosition || section.textPosition;
  const textStyle = options.textStyle || section.textStyle;

  /* Final formats (filter to known ratios + cap at 4 to keep budget sane). */
  const allowedFormats: Array<"1:1" | "9:16" | "4:5" | "16:9"> = ["1:1", "9:16", "4:5", "16:9"];
  let formats = (options.formats || section.formats).filter((f) => allowedFormats.includes(f));
  if (!formats.length) formats = section.formats;
  formats = formats.slice(0, 4);

  /* Tag the asset so the gallery can filter by section + product later. */
  const tags = [
    `section:${section.id}`,
    `product:${product.id}`,
    brand?.id ? `brand:${brand.id}` : "",
    options.embedTextInImage ? "text:embedded" : "text:overlay",
    options.objective ? `objective:${options.objective.replace(/\s+/g, "-").toLowerCase().slice(0, 24)}` : "",
  ].filter(Boolean) as string[];

  /* If the user asked the model to draw the text into the image itself,
   * we DON'T pass headline/subheadline/cta to the textOverlay — otherwise
   * the studio also draws an SVG layer on top, doubling the text. Instead
   * we encode them in the scene description so the model paints them. */
  const wantsEmbed = !!options.embedTextInImage;
  const sceneWithText = wantsEmbed
    ? `${scene}. Render the following typography natively in the image, integrated into the design (no flat overlay): primary headline "${headline.replace(/\n/g, " — ")}", supporting line "${subheadline}", call-to-action button labeled "${cta}". Use ${textStyle} typography that matches the section mood.`
    : scene;

  return {
    productId: product.id,
    style,
    scene: sceneWithText,
    lighting,
    targetAudience: audience,
    predominantColors: palette || undefined,
    aspectRatio: formats[0],
    formats,
    textOverlay: wantsEmbed
      ? {
          headline: "",
          subheadline: "",
          cta: "",
          position: textPosition,
          style: textStyle,
        }
      : {
          headline,
          subheadline,
          cta,
          position: textPosition,
          style: textStyle,
        },
    variations: Math.min(4, Math.max(1, options.variations || 2)),
    quality: options.quality || "high",
    withAndWithoutText: false,
    tags,
  };
}

/**
 * Build sample copy variations the modal can show as one-click pick options.
 * No model call here — these are template-based variations using product
 * data + section vibe. Cheap, instant, deterministic. The caller can also
 * fire `generateAiHeadlineSuggestions` for fancier IA-generated variants.
 */
export function templateHeadlineVariations(
  product: ProductRow,
  section: SectionDef,
  brand: BrandRow | null
): Array<{ headline: string; subheadline: string }> {
  const price = Number(product.price || 0);
  const promo = Number(product.promo_price || 0);
  const hasPromo = promo > 0 && promo < price;
  const pct = hasPromo ? discountPct(price, promo) : 0;
  const features = asArray(product.features).slice(0, 3);
  const brandName = brand?.name || "nossa loja";

  const variants: Array<{ headline: string; subheadline: string }> = [];

  switch (section.id) {
    case "promo":
      if (hasPromo) {
        variants.push({ headline: `${product.name}\n${formatBRL(promo)}`, subheadline: `De ${formatBRL(price)} por ${formatBRL(promo)} · ${pct}% off` });
        variants.push({ headline: `−${pct}% no ${product.name}`, subheadline: `Aproveite enquanto dura · só ${formatBRL(promo)}` });
        variants.push({ headline: `Economize ${formatBRL(price - promo)}`, subheadline: `${product.name} sai por ${formatBRL(promo)}` });
      } else {
        variants.push({ headline: product.name, subheadline: `Por ${formatBRL(price)}${product.unit ? ` / ${product.unit}` : ""}` });
        variants.push({ headline: `${product.name}\nem oferta`, subheadline: features[0] || `Direto do produtor · ${brandName}` });
      }
      break;
    case "launch":
      variants.push({ headline: `Chegou: ${product.name}`, subheadline: features[0] || `Novidade na ${brandName}` });
      variants.push({ headline: `Você vai amar`, subheadline: `${product.name} agora no catálogo` });
      variants.push({ headline: product.name, subheadline: `Disponível agora · ${brandName}` });
      break;
    case "social-proof":
      variants.push({ headline: `Por que escolhem ${product.name}`, subheadline: features[0] || brand?.slogan || "" });
      variants.push({ headline: `O preferido dos nossos clientes`, subheadline: `${product.name} é sucesso na ${brandName}` });
      variants.push({ headline: `Feito do jeito certo`, subheadline: features.join(" · ") || product.name });
      break;
    case "educational":
      variants.push({ headline: `Conheça ${product.name}`, subheadline: features.length ? features.join(" · ") : product.description?.slice(0, 90) || product.name });
      variants.push({ headline: `Como usar ${product.name}`, subheadline: features[0] || `Praticidade no dia a dia` });
      variants.push({ headline: product.name, subheadline: `Tudo que você precisa saber` });
      break;
    case "date":
      variants.push({ headline: product.name, subheadline: `Edição especial · ${brandName}` });
      variants.push({ headline: `Para uma data especial`, subheadline: `${product.name} foi feito pra esse momento` });
      variants.push({ headline: `${brandName}\nessa data tem ${product.name}`, subheadline: `Garante o seu` });
      break;
    case "winback":
      variants.push({ headline: `Sentimos sua falta`, subheadline: `${product.name} ainda te espera${hasPromo ? ` por ${formatBRL(promo)}` : ""}` });
      variants.push({ headline: `Já faz um tempo…`, subheadline: `${product.name} ainda está aqui pra você` });
      variants.push({ headline: `Volte pra ${brandName}`, subheadline: hasPromo ? `${product.name} a ${formatBRL(promo)}` : `Catálogo cheio de novidades` });
      break;
    case "featured":
    default:
      variants.push({ headline: product.name, subheadline: features[0] || product.description?.slice(0, 70) || `Disponível na ${brandName}` });
      variants.push({ headline: `Em destaque`, subheadline: product.name });
      variants.push({ headline: `Vitrine`, subheadline: `${product.name} · ${brandName}` });
      break;
  }
  /* Dedupe + cap at 3 distinct entries. */
  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = `${v.headline}|${v.subheadline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
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

export interface PreviewResult {
  product: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    price: number | null;
    promo_price: number | null;
    unit: string | null;
    image_url: string | null;
  };
  section: SectionDef;
  brand: {
    id: string | null;
    name: string | null;
    slogan: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    logo_url: string | null;
  } | null;
  /** Pre-filled studio params using only section+product defaults. */
  defaults: ComposedCreative["studioParams"];
  /** Three template-based copy variants the user can one-click pick. */
  copySuggestions: Array<{ headline: string; subheadline: string }>;
  /** All available CTA options pulled from the section pool, plus the
   *  default-picked one as the first item. */
  ctaSuggestions: string[];
  /** Style options the modal exposes — UI shows them as chips. */
  styleOptions: Array<{ id: string; label: string; description: string }>;
  /** Format catalog so the modal can render checkboxes with friendly labels. */
  formatOptions: Array<{ id: "1:1" | "9:16" | "4:5" | "16:9"; label: string; description: string }>;
}

const STYLE_OPTIONS = [
  { id: "bold promotional retail product ad, energetic composition, conversion focused", label: "Bold", description: "Cores fortes, energia, foco em conversão" },
  { id: "premium commercial product ad, editorial lighting, sophisticated reveal feel", label: "Premium", description: "Editorial sofisticado, qualidade revista" },
  { id: "minimal clean ecommerce product ad, refined whitespace, premium simplicity", label: "Minimal", description: "Espaço em branco refinado, simplicidade" },
  { id: "realistic 3d studio product render, cinematic lighting, polished surfaces", label: "3D realista", description: "Iluminação cinematográfica, superfícies polidas" },
  { id: "warm authentic lifestyle product ad, real moment feel, trustworthy", label: "Lifestyle", description: "Cena natural, momento real" },
];

const FORMAT_OPTIONS: Array<{ id: "1:1" | "9:16" | "4:5" | "16:9"; label: string; description: string }> = [
  { id: "1:1", label: "Feed", description: "Quadrado 1:1 — Instagram" },
  { id: "9:16", label: "Story", description: "Vertical 9:16 — Stories e Reels" },
  { id: "4:5", label: "Vertical", description: "Retrato 4:5 — Feed alto" },
  { id: "16:9", label: "Banner", description: "Horizontal 16:9 — capa, anúncio" },
];

/**
 * Like autoComposeAndGenerate but DOES NOT call the image model. Used by
 * the configuration modal to populate fields before the user generates.
 */
export async function previewComposition(
  userId: string,
  input: {
    productId: string;
    sectionId: SectionId;
    brandId?: string | null;
  }
): Promise<PreviewResult> {
  const section = SECTION_INDEX[input.sectionId];
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const product = await loadProduct(input.productId, input.brandId);
  if (!product) throw new Error("Produto não encontrado");

  const brand = input.brandId ? await loadBrand(input.brandId) : null;
  const defaults = composeStudioParams(product, section, brand);
  const copySuggestions = templateHeadlineVariations(product, section, brand);

  /* Make the default CTA the first option so the modal pre-selects it. */
  const defaultCta = defaults.textOverlay.cta;
  const ctaSuggestions = [defaultCta, ...section.ctaPool.filter((c) => c !== defaultCta)];

  return {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      promo_price: product.promo_price,
      unit: product.unit,
      image_url: product.image_url,
    },
    section,
    brand: brand ? {
      id: brand.id,
      name: brand.name,
      slogan: brand.slogan,
      primary_color: brand.primary_color,
      secondary_color: brand.secondary_color,
      logo_url: brand.logo_url,
    } : null,
    defaults,
    copySuggestions,
    ctaSuggestions,
    styleOptions: STYLE_OPTIONS,
    formatOptions: FORMAT_OPTIONS,
  };
}

/**
 * One-shot auto-compose: fetch product + brand, pick params from section,
 * register the product image as a studio asset (if not already), and call
 * the studio generator. Returns generated assets ready to render in UI.
 *
 * Now accepts the full ComposeOverrides set so the user can fine-tune
 * everything via the configuration modal before clicking Generate.
 */
export async function autoComposeAndGenerate(
  studio: CreativeStudioService,
  userId: string,
  input: {
    productId: string;
    sectionId: SectionId;
    brandId?: string | null;
    overrides?: ComposeOverrides;
  }
): Promise<AutoComposeResult> {
  const section = SECTION_INDEX[input.sectionId];
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const product = await loadProduct(input.productId, input.brandId);
  if (!product) throw new Error("Produto não encontrado");

  const brand = input.brandId ? await loadBrand(input.brandId) : null;

  const studioParams = composeStudioParams(product, section, brand, input.overrides || {});

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
