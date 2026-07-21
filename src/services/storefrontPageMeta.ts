/**
 * Meta OG/Twitter para páginas públicas da loja e links de afiliado.
 * Domínio customizado (verificado) é a origem canônica; fallback só se não houver.
 */
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

export function normalizePublicDomain(value?: string | null): string {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

/** Origem pública: domínio próprio se existir; senão requestOrigin. */
export function resolvePublicOrigin(
  primaryDomain: string | null | undefined,
  requestOrigin: string,
): string {
  const domain = normalizePublicDomain(primaryDomain);
  if (domain && domain !== "localhost" && domain !== "127.0.0.1") {
    return `https://${domain}`;
  }
  return String(requestOrigin || "").replace(/\/+$/, "");
}

function absoluteUrl(origin: string, path: string | null | undefined): string | null {
  const src = String(path || "").trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const base = origin.replace(/\/+$/, "");
  if (src.startsWith("/")) return `${base}${src}`;
  return `${base}/${src}`;
}

function optimizedImage(
  imageOrigin: string,
  url: string | null,
  width = 1200,
): string | null {
  const abs = absoluteUrl(imageOrigin, url);
  if (!abs) return null;
  if (!abs.includes("/uploads/")) return abs;
  try {
    const u = new URL(abs);
    return `${imageOrigin.replace(/\/+$/, "")}/api/img?src=${encodeURIComponent(u.pathname)}&w=${width}&q=85`;
  } catch {
    return abs;
  }
}

export type StorePublicMeta = {
  storeSlug: string;
  brandId: string;
  brandName: string;
  slogan: string | null;
  logoUrl: string | null;
  coverImage: string | null;
  primaryDomain: string | null;
  /**
   * Preview quando AFILIADO compartilha catálogo (cliente final).
   * NÃO confundir com imagem do programa (atrair afiliados).
   */
  catalogShareImageUrl: string | null;
  catalogShareTitle: string | null;
  catalogShareDescription: string | null;
  /** Legado / recrutamento de afiliados — NÃO usar no pack de catálogo */
  programShareImageUrl: string | null;
  programShareTitle: string | null;
  programShareDescription: string | null;
  /** @deprecated use catalogShare* — mantido p/ compat */
  shareTitle: string | null;
  shareDescription: string | null;
  shareImageUrl: string | null;
};

export async function resolveStorePublicMetaBySlug(storeSlug: string): Promise<StorePublicMeta | null> {
  const slug = String(storeSlug || "").trim();
  if (!slug) return null;

  const row = await queryOne<any>(
    `SELECT s.slug AS store_slug, s.brand_id, s.name AS store_name,
            s.brand_json, s.theme_json, s.settings_json,
            b.name AS brand_name, b.logo_url, b.cover_image, b.slogan,
            d.domain AS primary_domain
     FROM storefront_stores s
     LEFT JOIN brand_units b ON b.id = s.brand_id
     LEFT JOIN storefront_domains d
       ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
     WHERE LOWER(s.slug) = LOWER(?) AND s.status = 'active'
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [slug],
  );
  if (!row) {
    const brand = await queryOne<any>(
      `SELECT b.id AS brand_id, b.slug AS store_slug, b.name AS brand_name,
              b.logo_url, b.cover_image, b.slogan,
              d.domain AS primary_domain
       FROM brand_units b
       LEFT JOIN storefront_stores s ON s.brand_id = b.id AND s.status = 'active'
       LEFT JOIN storefront_domains d
         ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
       WHERE LOWER(b.slug) = LOWER(?)
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [slug],
    );
    if (!brand) return null;
    return {
      storeSlug: String(brand.store_slug || slug).trim(),
      brandId: String(brand.brand_id || "").trim(),
      brandName: String(brand.brand_name || slug).trim(),
      slogan: String(brand.slogan || "").trim() || null,
      logoUrl: String(brand.logo_url || "").trim() || null,
      coverImage: String(brand.cover_image || "").trim() || null,
      primaryDomain: normalizePublicDomain(brand.primary_domain) || null,
      catalogShareImageUrl: null,
      catalogShareTitle: null,
      catalogShareDescription: null,
      programShareImageUrl: null,
      programShareTitle: null,
      programShareDescription: null,
      shareTitle: null,
      shareDescription: null,
      shareImageUrl: null,
    };
  }

  let brandJson: Record<string, any> = {};
  let themeJson: Record<string, any> = {};
  try {
    brandJson = typeof row.brand_json === "string" ? JSON.parse(row.brand_json || "{}") : (row.brand_json || {});
  } catch {
    brandJson = {};
  }
  try {
    themeJson = typeof row.theme_json === "string" ? JSON.parse(row.theme_json || "{}") : (row.theme_json || {});
  } catch {
    themeJson = {};
  }

  const brandName =
    String(row.brand_name || brandJson.name || row.store_name || slug).trim() || slug;
  const logoUrl =
    String(row.logo_url || brandJson.logo_url || themeJson.logo_url || themeJson.logo || "").trim() || null;
  const coverImage =
    String(
      row.cover_image ||
        brandJson.cover_image ||
        brandJson.cover_image_url ||
        themeJson.cover_image ||
        themeJson.cover_image_url ||
        themeJson.hero_image ||
        "",
    ).trim() || null;
  const slogan =
    String(row.slogan || brandJson.slogan || brandJson.description || themeJson.description || "").trim() || null;

  /* Imagem de compartilhamento do CATÁLOGO (cliente final / afiliado vende) */
  let settingsJson: Record<string, any> = {};
  try {
    settingsJson =
      typeof row.settings_json === "string"
        ? JSON.parse(row.settings_json || "{}")
        : (row.settings_json || {});
  } catch {
    settingsJson = {};
  }
  const catalogShare = settingsJson?.marketing?.catalog_share || settingsJson?.catalog_share || {};
  const catalogShareImageUrl =
    String(catalogShare.image_url || catalogShare.image || "").trim() || null;
  const catalogShareTitle = String(catalogShare.title || "").trim() || null;
  const catalogShareDescription = String(catalogShare.description || "").trim() || null;

  /* Programa de afiliados — só recrutamento (central-afiliado), NÃO catálogo */
  let programShareTitle: string | null = null;
  let programShareDescription: string | null = null;
  let programShareImageUrl: string | null = null;
  try {
    const brandId = String(row.brand_id || "").trim();
    if (brandId) {
      const owner = await queryOne<{ user_id: string }>(
        `SELECT user_id FROM brand_units WHERE id = ? LIMIT 1`,
        [brandId],
      );
      if (owner?.user_id) {
        const affiliatesService = new AffiliatesService();
        const program = await affiliatesService.getOrCreateProgramConfig(
          String(owner.user_id),
          brandId,
        );
        programShareTitle = String(program?.share_title || "").trim() || null;
        programShareDescription = String(program?.share_description || "").trim() || null;
        programShareImageUrl = String(program?.share_image_url || "").trim() || null;
      }
    }
  } catch {
    /* program config optional */
  }

  /* Defaults de preview de CATÁLOGO: nunca usar capa do programa de afiliados */
  const shareTitle = catalogShareTitle || brandName;
  const shareDescription =
    catalogShareDescription || slogan || `Catálogo e ofertas de ${brandName}.`;
  const shareImageUrl = catalogShareImageUrl || coverImage || logoUrl || null;

  return {
    storeSlug: String(row.store_slug || slug).trim(),
    brandId: String(row.brand_id || "").trim(),
    brandName,
    slogan,
    logoUrl,
    coverImage,
    primaryDomain: normalizePublicDomain(row.primary_domain) || null,
    catalogShareImageUrl,
    catalogShareTitle,
    catalogShareDescription,
    programShareImageUrl,
    programShareTitle,
    programShareDescription,
    shareTitle,
    shareDescription,
    shareImageUrl,
  };
}

export async function resolveStorePublicMetaByAffiliateCode(
  code: string,
): Promise<(StorePublicMeta & { affiliateCode: string; affiliateName: string }) | null> {
  const ref = String(code || "").trim();
  if (!ref) return null;

  const affiliate = await queryOne<any>(
    `SELECT a.code, a.display_name, a.brand_id, a.owner_user_id,
            b.slug AS brand_slug, b.name AS brand_name, b.logo_url, b.cover_image, b.slogan,
            s.slug AS store_slug, d.domain AS primary_domain
     FROM affiliates a
     INNER JOIN brand_units b ON b.id = a.brand_id
     LEFT JOIN storefront_stores s ON s.brand_id = a.brand_id AND s.status = 'active'
     LEFT JOIN storefront_domains d
       ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
     WHERE LOWER(a.code) = LOWER(?) AND a.status = 'active'
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [ref],
  );
  if (!affiliate) return null;

  const storeSlug = String(affiliate.store_slug || affiliate.brand_slug || "").trim();
  const base = storeSlug ? await resolveStorePublicMetaBySlug(storeSlug) : null;

  const meta: StorePublicMeta = base || {
    storeSlug: storeSlug || String(affiliate.brand_slug || "loja").trim(),
    brandId: String(affiliate.brand_id || "").trim(),
    brandName: String(affiliate.brand_name || "Loja").trim(),
    slogan: String(affiliate.slogan || "").trim() || null,
    logoUrl: String(affiliate.logo_url || "").trim() || null,
    coverImage: String(affiliate.cover_image || "").trim() || null,
    primaryDomain: normalizePublicDomain(affiliate.primary_domain) || null,
    catalogShareImageUrl: null,
    catalogShareTitle: null,
    catalogShareDescription: null,
    programShareImageUrl: null,
    programShareTitle: null,
    programShareDescription: null,
    shareTitle: null,
    shareDescription: null,
    shareImageUrl: null,
  };

  if (!meta.primaryDomain && affiliate.primary_domain) {
    meta.primaryDomain = normalizePublicDomain(affiliate.primary_domain) || null;
  }

  return {
    ...meta,
    affiliateCode: String(affiliate.code || ref).trim(),
    affiliateName: String(affiliate.display_name || affiliate.code || ref).trim(),
  };
}

export type StorePageHeadInput = {
  requestOrigin: string;
  assetOrigin?: string;
  canonicalPath: string;
  meta: StorePublicMeta;
  kind: "catalog" | "affiliate_short";
  affiliateName?: string | null;
};

export function buildStorefrontPageHeadMarkup(input: StorePageHeadInput): string {
  const { meta, kind } = input;
  const publicOrigin = resolvePublicOrigin(meta.primaryDomain, input.requestOrigin);
  const assetOrigin = String(input.assetOrigin || input.requestOrigin).replace(/\/+$/, "");
  const brandName = meta.brandName;

  let headline: string;
  let description: string;
  /* Preview de catálogo / link de afiliado: NUNCA imagem do programa (recrutamento) */
  if (kind === "affiliate_short") {
    const aff = String(input.affiliateName || "").trim();
    headline = aff
      ? `${brandName} · indicação de ${aff}`
      : (meta.catalogShareTitle || meta.shareTitle || brandName);
    description = truncate(
      meta.catalogShareDescription ||
        meta.shareDescription ||
        meta.slogan ||
        `Confira as ofertas de ${brandName}. Compre com link exclusivo.`,
      160,
    );
  } else {
    headline = meta.catalogShareTitle || meta.shareTitle || brandName;
    description = truncate(
      meta.catalogShareDescription ||
        meta.shareDescription ||
        meta.slogan ||
        `Catálogo e ofertas de ${brandName}.`,
      160,
    );
  }

  const pageTitle = headline;
  const canonicalPath = input.canonicalPath.startsWith("/")
    ? input.canonicalPath
    : `/${input.canonicalPath}`;
  const canonicalUrl = absoluteUrl(publicOrigin, canonicalPath) || publicOrigin;

  const imageCandidate =
    meta.catalogShareImageUrl || meta.shareImageUrl || meta.coverImage || meta.logoUrl || null;
  const shareImage =
    optimizedImage(assetOrigin, imageCandidate, 1200) ||
    optimizedImage(publicOrigin, imageCandidate, 1200);

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

export function injectStorefrontMetaIntoHtml(html: string, headMarkup: string): string {
  let result = html;
  result = result.replace(/<title>[^<]*<\/title>/i, "");
  result = result.replace(/<meta\s+name="description"[^>]*>/i, "");
  result = result.replace(/<link\s+rel="canonical"[^>]*>/i, "");
  result = result.replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, "");
  result = result.replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, "");
  return result.replace("</head>", `    ${headMarkup}\n  </head>`);
}

/** Paths absolutos de links de afiliado (domínio customizado se houver). */
export function buildAffiliatePublicLinks(input: {
  code: string;
  couponCode?: string | null;
  storeSlug: string;
  primaryDomain?: string | null;
  fallbackOrigin?: string | null;
}): {
  origin: string;
  short_url: string;
  catalog_url: string;
  short_path: string;
  catalog_path: string;
  product_path: (productSlug: string) => string;
  product_url: (productSlug: string) => string;
} {
  const code = String(input.code || "").trim();
  const coupon = String(input.couponCode || "").trim().toUpperCase();
  const storeSlug = String(input.storeSlug || "").trim();
  const domain = normalizePublicDomain(input.primaryDomain);
  const hasDomain = Boolean(domain && domain !== "localhost" && domain !== "127.0.0.1");
  const origin = hasDomain
    ? `https://${domain}`
    : String(input.fallbackOrigin || "").replace(/\/+$/, "");

  const qs = new URLSearchParams();
  if (code) qs.set("ref", code);
  if (coupon) qs.set("cupom", coupon);
  const q = qs.toString() ? `?${qs.toString()}` : "";

  const shortPath = code ? `/afiliado/${encodeURIComponent(code)}` : "";
  /* Domínio próprio: /?ref=… · fallback plataforma: /catalogo/{slug}?ref=… */
  const catalogPath = hasDomain
    ? `/${q}`
    : storeSlug
      ? `/catalogo/${encodeURIComponent(storeSlug)}${q}`
      : "";

  const productPath = (productSlug: string) => {
    const slug = String(productSlug || "").trim();
    if (!slug) return catalogPath;
    if (hasDomain) return `/produto/${encodeURIComponent(slug)}${q}`;
    if (!storeSlug) return "";
    return `/catalogo/${encodeURIComponent(storeSlug)}/produto/${encodeURIComponent(slug)}${q}`;
  };

  const withOrigin = (path: string) => {
    if (!path) return "";
    if (!origin) return path;
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  };

  return {
    origin,
    short_path: shortPath,
    catalog_path: catalogPath,
    short_url: withOrigin(shortPath),
    catalog_url: withOrigin(catalogPath),
    product_path: productPath,
    product_url: (productSlug: string) => withOrigin(productPath(productSlug)),
  };
}
