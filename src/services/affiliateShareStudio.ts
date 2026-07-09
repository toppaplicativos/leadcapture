import { queryOne } from "../config/database";
import { CreativeStudioService } from "./creativeStudio";
import { AffiliatesService } from "./affiliates";

const creativeStudio = new CreativeStudioService();
const affiliatesService = new AffiliatesService();

const DESTINATION_GUIDES: Record<string, string> = {
  whatsapp_dm:
    "Mensagem WhatsApp 1:1. Tom conversacional, cupom em destaque, link do catálogo. Máx. 520 caracteres no texto final.",
  whatsapp_status:
    "Status WhatsApp. Ultra curto, direto, ideal para arte 9:16. Máx. 280 caracteres.",
  whatsapp_broadcast:
    "Lista/transmissão WhatsApp. Convite amigável, benefício claro, cupom e link. Máx. 480 caracteres.",
  instagram_feed:
    "Legenda de post no feed. Gancho, valor, CTA, 5-8 hashtags em português. Máx. 900 caracteres.",
  instagram_story:
    "Texto para story. Máx. 220 caracteres, 1-2 emojis no máximo.",
  instagram_reels:
    "Legenda de Reels. Gancho na primeira linha, CTA para comentar. Máx. 420 caracteres.",
  instagram_bio:
    "Texto curto para bio/link. Máx. 150 caracteres.",
  seo_link:
    "Título SEO (máx. 70 chars) e descrição para preview de link (máx. 160 chars).",
};

const KIT_GUIDES: Record<string, string> = {
  catalog: "Divulgar o catálogo completo da marca com cupom do afiliado.",
  product: "Destacar um produto específico com preço e link rastreado.",
  coupon: "Foco no cupom de desconto e urgência leve.",
  program: "Convidar novas pessoas a se cadastrarem como afiliados da marca.",
  material: "Promover um material visual oficial da marca.",
};

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseVoiceJson(raw: unknown): { tone: string; keywords: string[]; avoid: string[] } {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") parsed = safeJsonParse(raw, {});
  else if (raw && typeof raw === "object") parsed = raw as Record<string, unknown>;

  const tone = String(parsed.tone || parsed.tone_of_voice || "").trim();
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const avoid = Array.isArray(parsed.avoid)
    ? parsed.avoid.map((k) => String(k).trim()).filter(Boolean)
    : Array.isArray(parsed.forbidden)
      ? parsed.forbidden.map((k) => String(k).trim()).filter(Boolean)
      : [];

  return { tone, keywords, avoid };
}

export type GenerateSharePackInput = {
  ownerUserId: string;
  brandId: string;
  kit: string;
  destination: string;
  affiliateName: string;
  coupon: string;
  code: string;
  catalogPath: string;
  programPath?: string;
  productName?: string;
  productPrice?: string;
  materialTitle?: string;
  commissionLabel?: string;
};

export type SharePackResult = {
  seo_title: string;
  headline: string;
  subtitle: string;
  body: string;
  hashtags: string[];
  cta: string;
  full_text: string;
};

function buildFullText(parts: SharePackResult, includeHashtags: boolean): string {
  const lines = [parts.headline, parts.subtitle, parts.body, parts.cta].filter(Boolean);
  if (includeHashtags && parts.hashtags.length) {
    lines.push(parts.hashtags.join(" "));
  }
  return lines.join("\n\n").trim();
}

export async function generateAffiliateSharePack(input: GenerateSharePackInput): Promise<SharePackResult> {
  const brand = await queryOne<any>(
    `SELECT name, slug, slogan, voice_json FROM brand_units WHERE id = ? LIMIT 1`,
    [input.brandId]
  );
  const config = await affiliatesService.getOrCreateProgramConfig(input.ownerUserId, input.brandId);

  const brandName = String(brand?.name || "").trim() || "a marca";
  const voice = parseVoiceJson(brand?.voice_json);
  const promotionTone = String((config as any).promotion_tone || "").trim();
  const tone = promotionTone || voice.tone || "amigável, consultivo e autêntico";

  const destGuide = DESTINATION_GUIDES[input.destination] || DESTINATION_GUIDES.instagram_feed;
  const kitGuide = KIT_GUIDES[input.kit] || KIT_GUIDES.catalog;

  const catalogUrl = input.catalogPath ? `Link: ${input.catalogPath}` : "";
  const programUrl = input.programPath ? `Link programa: ${input.programPath}` : "";

  const prompt = [
    "Você cria kits de divulgação para afiliados de e-commerce no Brasil.",
    "Responda APENAS com JSON válido, sem markdown, neste formato:",
    '{"seo_title":"","headline":"","subtitle":"","body":"","hashtags":[],"cta":""}',
    "",
    `Destino: ${input.destination}`,
    destGuide,
    `Objetivo do kit: ${kitGuide}`,
    `Tom de voz da marca: ${tone}`,
    voice.keywords.length ? `Palavras preferidas: ${voice.keywords.join(", ")}` : "",
    voice.avoid.length ? `Evitar: ${voice.avoid.join(", ")}` : "",
    `Marca: ${brandName}`,
    String(brand?.slogan || "").trim() ? `Slogan: ${String(brand.slogan).trim()}` : "",
    `Afiliado: ${input.affiliateName}`,
    input.coupon ? `Cupom: ${input.coupon}` : "",
    input.code ? `Código ref: ${input.code}` : "",
    catalogUrl,
    programUrl,
    input.productName ? `Produto: ${input.productName}` : "",
    input.productPrice ? `Preço: ${input.productPrice}` : "",
    input.materialTitle ? `Material: ${input.materialTitle}` : "",
    input.commissionLabel ? `Comissão: ${input.commissionLabel}` : "",
    "Não invente preços, prazos ou promoções não informadas.",
    "hashtags: array de strings com #, em português, relevantes ao destino.",
  ]
    .filter(Boolean)
    .join("\n");

  const maxChars =
    input.destination === "instagram_story" ? 240
      : input.destination === "whatsapp_status" ? 320
        : input.destination === "instagram_bio" ? 160
          : 900;

  const result = await creativeStudio.generateText(input.ownerUserId, {
    prompt,
    maxCharacters: maxChars + 200,
    objective: "affiliate_share_pack",
  }, input.brandId);

  const raw = String(result?.text || "").trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = safeJsonParse<SharePackResult>(
    jsonMatch ? jsonMatch[0] : raw,
    { seo_title: "", headline: "", subtitle: "", body: "", hashtags: [], cta: "", full_text: "" }
  );

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((h) => (String(h).startsWith("#") ? String(h) : `#${h}`)).slice(0, 8)
    : [];

  const pack: SharePackResult = {
    seo_title: String(parsed.seo_title || "").trim().slice(0, 70),
    headline: String(parsed.headline || "").trim(),
    subtitle: String(parsed.subtitle || "").trim(),
    body: String(parsed.body || "").trim(),
    hashtags,
    cta: String(parsed.cta || "").trim(),
    full_text: "",
  };

  const includeTags = ["instagram_feed", "instagram_reels"].includes(input.destination);
  pack.full_text = buildFullText(pack, includeTags);

  if (!pack.full_text) {
    throw new Error("Não foi possível gerar o kit de divulgação");
  }

  return pack;
}