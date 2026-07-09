import { queryOne } from "../config/database";
import { AffiliatesService } from "./affiliates";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text: string, max = 160): string {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function absoluteUrl(origin: string, path: string | null | undefined): string | null {
  const src = String(path || "").trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const base = origin.replace(/\/+$/, "");
  if (src.startsWith("/")) return `${base}${src}`;
  return `${base}/${src}`;
}

function optimizedImage(origin: string, url: string | null, width = 1200): string | null {
  const abs = absoluteUrl(origin, url);
  if (!abs) return null;
  if (!abs.includes("/uploads/")) return abs;
  try {
    const u = new URL(abs);
    return `${origin.replace(/\/+$/, "")}/api/img?src=${encodeURIComponent(u.pathname)}&w=${width}&q=85`;
  } catch {
    return abs;
  }
}

export type AffiliatePageMetaInput = {
  origin: string;
  brandSlug: string;
  brand: {
    name?: string | null;
    logo_url?: string | null;
    slogan?: string | null;
  };
  program?: {
    share_title?: string | null;
    share_description?: string | null;
    share_image_url?: string | null;
  } | null;
};

/** Meta tags para preview WhatsApp / redes ao compartilhar o link do programa. */
export function buildAffiliatePageHeadMarkup(input: AffiliatePageMetaInput): string {
  const brandName = String(input.brand.name || input.brandSlug).trim();
  const shareTitle = String(input.program?.share_title || "").trim();
  const headline = shareTitle || `Programa de Afiliados — ${brandName}`;
  const pageTitle = `${headline} · ${brandName}`;
  const description = truncate(
    input.program?.share_description ||
      input.brand.slogan ||
      `Seja parceiro de ${brandName}. Cadastre-se, divulgue com seu link e ganhe comissão em cada venda.`,
    160
  );
  const canonicalPath = `/central-afiliado/${encodeURIComponent(input.brandSlug)}`;
  const canonicalUrl = absoluteUrl(input.origin, canonicalPath) || input.origin;
  const shareImage = optimizedImage(
    input.origin,
    String(input.program?.share_image_url || "").trim() || String(input.brand.logo_url || "").trim() || null,
    1200
  );

  const tags = [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(brandName)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${escapeHtml(headline)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    shareImage ? `<meta property="og:image" content="${escapeHtml(shareImage)}" />` : "",
    shareImage ? `<meta property="og:image:secure_url" content="${escapeHtml(shareImage)}" />` : "",
    shareImage ? `<meta property="og:image:width" content="1200" />` : "",
    shareImage ? `<meta property="og:image:height" content="630" />` : "",
    `<meta name="twitter:card" content="${shareImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(headline)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    shareImage ? `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />` : "",
  ].filter(Boolean);

  return tags.join("\n    ");
}

export function injectAffiliateMetaIntoHtml(html: string, headMarkup: string): string {
  let result = html;
  result = result.replace(/<title>[^<]*<\/title>/i, "");
  result = result.replace(/<meta\s+name="description"[^>]*>/i, "");
  result = result.replace(/<link\s+rel="canonical"[^>]*>/i, "");
  return result.replace("</head>", `    ${headMarkup}\n  </head>`);
}

export async function buildAffiliatePageHeadForSlug(brandSlug: string, origin: string): Promise<string | null> {
  const ref = String(brandSlug || "").trim();
  if (!ref) return null;

  const brand = await queryOne<any>(
    `SELECT id, slug, name, logo_url, slogan, primary_color, user_id
     FROM brand_units
     WHERE LOWER(slug) = LOWER(?) OR LOWER(id) = LOWER(?)
     LIMIT 1`,
    [ref, ref]
  );
  if (!brand) return null;

  const affiliatesService = new AffiliatesService();
  const program = await affiliatesService.getOrCreateProgramConfig(
    String(brand.user_id),
    String(brand.id)
  );

  return buildAffiliatePageHeadMarkup({
    origin,
    brandSlug: String(brand.slug || ref).trim(),
    brand,
    program,
  });
}