type ProductRow = {
  slug?: string | null
  name?: string | null
  description?: string | null
  price?: number | string | null
  compare_at_price?: number | string | null
  currency?: string | null
  images_json?: string | null
  metadata_json?: string | Record<string, unknown> | null
  category?: string | null
}

export type ProductPageMetaInput = {
  origin: string
  canonicalPath: string
  storeName: string
  product: ProductRow
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function parseImages(product: ProductRow): string[] {
  const parsed = parseJson<unknown>(product.images_json, []);
  const imgs: string[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const url = typeof item === "string" ? item : String((item as any)?.url || "").trim();
      if (url) imgs.push(url);
    }
  }
  return imgs.slice(0, 8);
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

function resolveAvailability(product: ProductRow): string {
  const md = parseJson<Record<string, unknown>>(product.metadata_json, {});
  const stockStatus = String(md.stock_status || "unlimited");
  const stockQty = md.stock_quantity === null || md.stock_quantity === undefined ? null : Number(md.stock_quantity);
  const isOut = stockStatus === "out_of_stock" || (stockQty !== null && stockQty <= 0);
  return isOut ? "out of stock" : "in stock";
}

/** Injeta meta tags no <head> para crawlers (Instagram, Facebook, Google). */
export function buildProductPageHeadMarkup(input: ProductPageMetaInput): string {
  const { origin, canonicalPath, storeName, product } = input;
  const md = parseJson<Record<string, unknown>>(product.metadata_json, {});
  const seo = parseJson<Record<string, string>>(md.seo, {});

  const productName = String(product.name || "Produto").trim();
  const title = String(seo.meta_title || productName).slice(0, 70);
  const pageTitle = storeName ? `${title} · ${storeName}` : title;
  const description = truncate(seo.meta_description || product.description || productName, 160);
  const canonicalUrl = absoluteUrl(origin, canonicalPath) || origin;
  const images = parseImages(product);
  const shareImage = optimizedImage(origin, images[0] || null, 1200);
  const price = Number(product.price || 0).toFixed(2);
  const currency = String(product.currency || "BRL").trim() || "BRL";
  const availability = resolveAvailability(product);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: description || undefined,
    image: images.length ? images.map((img) => absoluteUrl(origin, img)).filter(Boolean) : undefined,
    url: canonicalUrl,
    brand: { "@type": "Brand", name: storeName },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: currency,
      price,
      availability: `https://schema.org/${availability === "in stock" ? "InStock" : "OutOfStock"}`,
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  const tags = [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="${escapeHtml(storeName)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    shareImage ? `<meta property="og:image" content="${escapeHtml(shareImage)}" />` : "",
    shareImage ? `<meta property="og:image:secure_url" content="${escapeHtml(shareImage)}" />` : "",
    `<meta property="product:price:amount" content="${escapeHtml(price)}" />`,
    `<meta property="product:price:currency" content="${escapeHtml(currency)}" />`,
    `<meta property="product:availability" content="${escapeHtml(availability)}" />`,
    `<meta name="twitter:card" content="${shareImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    shareImage ? `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />` : "",
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].filter(Boolean);

  return tags.join("\n    ");
}

export function injectProductMetaIntoHtml(html: string, headMarkup: string): string {
  let result = html;
  result = result.replace(/<title>[^<]*<\/title>/i, "");
  result = result.replace(/<meta\s+name="description"[^>]*>/i, "");
  result = result.replace(/<link\s+rel="canonical"[^>]*>/i, "");
  return result.replace("</head>", `    ${headMarkup}\n  </head>`);
}