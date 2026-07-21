/**
 * Pacote de compartilhamento do afiliado — título, descrição, imagem e URL
 * estruturados para preview WhatsApp/IG/FB (Open Graph) + mensagem curta.
 *
 * Princípio: o preview visual carrega a conversão; a mensagem não precisa
 * repetir cupom/URL em bloco feio — o card OG camufla o ?ref= e o cupom.
 */
import { queryOne } from "../config/database";
import { affiliateProductLearningService } from "./affiliateProductLearning";
import {
  buildAffiliatePublicLinks,
  normalizePublicDomain,
  resolvePublicOrigin,
  resolveStorePublicMetaBySlug,
  type StorePublicMeta,
} from "./storefrontPageMeta";

export type SharePackKind = "catalog" | "product" | "short";

export type AffiliateSharePack = {
  kind: SharePackKind;
  /** Título do preview (og:title) */
  title: string;
  /** Descrição do preview (og:description) */
  description: string;
  /** Imagem absoluta para og:image (capa/produto) */
  image_url: string | null;
  image_width: number;
  image_height: number;
  /** URL rastreada com ref + cupom */
  url: string;
  site_name: string;
  /** Mensagem curta — o preview faz o visual */
  message: string;
  /** Variante um pouco mais completa se o canal não gera preview */
  message_full: string;
  coupon_code: string | null;
  affiliate_code: string | null;
  product?: {
    id: string;
    name: string;
    slug: string | null;
    price: number | null;
    promo_price: number | null;
  } | null;
  brand: {
    name: string;
    logo_url: string | null;
    primary_domain: string | null;
  };
};

function truncate(text: string, max = 160): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function moneyBR(v: number | null | undefined): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function absoluteUrl(origin: string, path: string | null | undefined): string | null {
  const src = String(path || "").trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const base = origin.replace(/\/+$/, "");
  if (src.startsWith("/")) return `${base}${src}`;
  return `${base}/${src}`;
}

/**
 * Imagem OG em tamanho “cartão grande” (1200).
 * Preferência: host da request (proxy) para /uploads; fallback no origin público.
 */
export function resolveShareImageUrl(
  imagePath: string | null | undefined,
  opts: { publicOrigin: string; assetOrigin?: string },
): string | null {
  const raw = String(imagePath || "").trim();
  if (!raw) return null;
  const assetOrigin = String(opts.assetOrigin || opts.publicOrigin).replace(/\/+$/, "");
  const publicOrigin = opts.publicOrigin.replace(/\/+$/, "");

  const make = (origin: string): string | null => {
    const abs = absoluteUrl(origin, raw);
    if (!abs) return null;
    if (!abs.includes("/uploads/")) return abs;
    try {
      const u = new URL(abs);
      return `${origin}/api/img?src=${encodeURIComponent(u.pathname)}&w=1200&q=85&fm=jpg`;
    } catch {
      return abs;
    }
  };

  return make(assetOrigin) || make(publicOrigin);
}

function buildMessages(input: {
  kind: SharePackKind;
  brandName: string;
  productName?: string | null;
  coupon?: string | null;
  affiliateName?: string | null;
  url: string;
  priceLabel?: string | null;
}): { message: string; message_full: string } {
  const brand = input.brandName;
  const url = input.url;
  const coupon = String(input.coupon || "").trim().toUpperCase();
  const product = String(input.productName || "").trim();
  const aff = String(input.affiliateName || "").trim();
  const price = String(input.priceLabel || "").trim();

  if (input.kind === "product" && product) {
    const message = [
      `Olha isso da ${brand}: *${product}*`,
      price ? price : null,
      "",
      url,
    ]
      .filter((l) => l !== null)
      .join("\n")
      .trim();
    const message_full = [
      `Oi! Separei *${product}* da ${brand} pra você.`,
      price ? `Valor: ${price}` : null,
      coupon ? `No checkout use o cupom *${coupon}*.` : null,
      "",
      url,
      aff ? `\n— ${aff}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n")
      .trim();
    return { message, message_full };
  }

  if (input.kind === "short") {
    const message = [`Catálogo da ${brand} 👇`, "", url].join("\n");
    const message_full = [
      `Confira as ofertas da ${brand}.`,
      coupon ? `Cupom: *${coupon}*` : null,
      "",
      url,
      aff ? `\n— ${aff}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n")
      .trim();
    return { message, message_full };
  }

  /* catalog */
  const message = [`Separei o catálogo da ${brand} pra você 👇`, "", url].join("\n");
  const message_full = [
    `Oi! Catálogo da *${brand}* com indicação especial.`,
    coupon ? `Use o cupom *${coupon}* no checkout.` : null,
    "",
    url,
    aff ? `\n— ${aff}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .trim();
  return { message, message_full };
}

export type BuildSharePackInput = {
  ownerUserId: string;
  brandId: string;
  affiliateUserId?: string;
  kind: SharePackKind;
  productId?: string | null;
  /** origin da request (assets / fallback) */
  requestOrigin: string;
  code: string;
  couponCode?: string | null;
  affiliateDisplayName?: string | null;
};

export async function buildAffiliateSharePack(
  input: BuildSharePackInput,
): Promise<AffiliateSharePack> {
  const kind = input.kind;
  const code = String(input.code || "").trim();
  const coupon = String(input.couponCode || "").trim().toUpperCase() || null;
  const requestOrigin = String(input.requestOrigin || "").replace(/\/+$/, "");

  const brandRow = await queryOne<any>(
    `SELECT b.id, b.slug, b.name, b.logo_url, b.cover_image, b.slogan,
            d.domain AS primary_domain, s.slug AS store_slug
     FROM brand_units b
     LEFT JOIN storefront_stores s ON s.brand_id = b.id AND s.status = 'active'
     LEFT JOIN storefront_domains d
       ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
     WHERE b.id = ?
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [input.brandId],
  );

  const storeSlug = String(brandRow?.store_slug || brandRow?.slug || "").trim();
  let meta: StorePublicMeta | null = storeSlug
    ? await resolveStorePublicMetaBySlug(storeSlug)
    : null;

  if (!meta) {
    meta = {
      storeSlug: storeSlug || "loja",
      brandId: input.brandId,
      brandName: String(brandRow?.name || "Loja").trim(),
      slogan: String(brandRow?.slogan || "").trim() || null,
      logoUrl: String(brandRow?.logo_url || "").trim() || null,
      coverImage: String(brandRow?.cover_image || "").trim() || null,
      primaryDomain: normalizePublicDomain(brandRow?.primary_domain) || null,
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

  const primaryDomain = meta.primaryDomain;
  const publicOrigin = resolvePublicOrigin(primaryDomain, requestOrigin);
  const links = buildAffiliatePublicLinks({
    code,
    couponCode: coupon,
    storeSlug: meta.storeSlug,
    primaryDomain,
    fallbackOrigin: requestOrigin,
  });

  const brandName = meta.brandName;
  const affName = String(input.affiliateDisplayName || "").trim() || null;

  /* ─── PRODUCT ─── */
  if (kind === "product" && input.productId) {
    const catalog = await affiliateProductLearningService
      .listCatalog(input.ownerUserId, input.brandId)
      .catch(() => []);
    const product = (catalog || []).find(
      (p: any) => String(p.id) === String(input.productId),
    );

    if (product) {
      const productSlug =
        String(product.slug || "").trim() || String(product.id).trim();
      const url = links.product_url(productSlug);
      const price =
        product.promo_price != null && product.promo_price < product.price
          ? Number(product.promo_price)
          : Number(product.price || 0);
      const priceLabel = moneyBR(price);
      const title = truncate(`${product.name} · ${brandName}`, 70);
      const description = truncate(
        [
          priceLabel || null,
          coupon ? `Cupom ${coupon} no checkout` : null,
          String(product.subtitle || product.description || "").trim() || null,
          `Oferta da ${brandName}`,
        ]
          .filter(Boolean)
          .join(" · "),
        160,
      );
      const image_url = resolveShareImageUrl(product.image_url, {
        publicOrigin,
        assetOrigin: requestOrigin,
      });
      const { message, message_full } = buildMessages({
        kind: "product",
        brandName,
        productName: product.name,
        coupon,
        affiliateName: affName,
        url,
        priceLabel,
      });

      return {
        kind: "product",
        title,
        description,
        image_url,
        image_width: 1200,
        image_height: 630,
        url,
        site_name: brandName,
        message,
        message_full,
        coupon_code: coupon,
        affiliate_code: code || null,
        product: {
          id: String(product.id),
          name: String(product.name),
          slug: product.slug || null,
          price: Number(product.price || 0),
          promo_price: product.promo_price ?? null,
        },
        brand: {
          name: brandName,
          logo_url: resolveShareImageUrl(meta.logoUrl, {
            publicOrigin,
            assetOrigin: requestOrigin,
          }),
          primary_domain: primaryDomain,
        },
      };
    }
  }

  /* ─── SHORT / CATALOG (cliente final) ───
   * Imagem = catalog_share da loja (NÃO share_image do programa de afiliados).
   * Programa serve para atrair afiliados; catálogo serve para vender. */
  const isShort = kind === "short";
  const url = isShort ? links.short_url : links.catalog_url;

  const title = truncate(
    isShort
      ? (affName
          ? `${brandName} · indicação de ${affName}`
          : meta.catalogShareTitle || brandName)
      : (meta.catalogShareTitle
          || `Catálogo ${brandName}${coupon ? ` · cupom ${coupon}` : ""}`),
    70,
  );

  const description = truncate(
    meta.catalogShareDescription ||
      meta.slogan ||
      (coupon
        ? `Ofertas da ${brandName}. Use o cupom ${coupon} no checkout.`
        : `Ofertas e produtos da ${brandName}. Compre com link exclusivo.`),
    160,
  );

  const imageCandidate =
    meta.catalogShareImageUrl || meta.coverImage || meta.logoUrl || null;
  const image_url = resolveShareImageUrl(imageCandidate, {
    publicOrigin,
    assetOrigin: requestOrigin,
  });

  const { message, message_full } = buildMessages({
    kind: isShort ? "short" : "catalog",
    brandName,
    coupon,
    affiliateName: affName,
    url,
  });

  return {
    kind: isShort ? "short" : "catalog",
    title,
    description,
    image_url,
    image_width: 1200,
    image_height: 630,
    url,
    site_name: brandName,
    message,
    message_full,
    coupon_code: coupon,
    affiliate_code: code || null,
    product: null,
    brand: {
      name: brandName,
      logo_url: resolveShareImageUrl(meta.logoUrl, {
        publicOrigin,
        assetOrigin: requestOrigin,
      }),
      primary_domain: primaryDomain,
    },
  };
}
