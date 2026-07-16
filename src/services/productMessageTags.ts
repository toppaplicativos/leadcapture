/**
 * Product tags + public links for campaigns & automations.
 * Tags: {{produto_nome}}, {{produto_preco}}, {{produto_link}}, {{produto_descricao}},
 *       {{produtos_lista}}, {{produto_N_nome}}, {{produto_N_link}}, ...
 */

import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type ProductTagContext = {
  id: string;
  name: string;
  price: number;
  promoPrice?: number | null;
  description?: string;
  unit?: string;
  imageUrl?: string;
  slug?: string;
  link: string;
};

function publicBaseUrl(): string {
  return String(
    process.env.FRONTEND_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.CHECKOUT_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://app.leadcapture.online",
  )
    .trim()
    .replace(/\/+$/, "");
}

export function toProductSlug(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "produto";
}

function formatBRL(value: number): string {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
}

export async function resolveStoreSlugForBrand(brandId?: string | null): Promise<string | null> {
  const id = String(brandId || "").trim();
  if (!id) return null;
  try {
    const store = await queryOne<{ slug?: string }>(
      `SELECT slug FROM storefront_stores WHERE brand_id = ? ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [id],
    ).catch(() =>
      queryOne<{ slug?: string }>(
        `SELECT slug FROM storefront_stores WHERE brand_id = ? LIMIT 1`,
        [id],
      ),
    );
    if (store?.slug) return String(store.slug).trim();
    const brand = await queryOne<{ slug?: string; name?: string }>(
      `SELECT slug, name FROM brand_units WHERE id = ? LIMIT 1`,
      [id],
    );
    if (brand?.slug) return String(brand.slug).trim();
    if (brand?.name) return toProductSlug(brand.name);
  } catch (err: any) {
    logger.warn(`[productMessageTags] store slug: ${err?.message || err}`);
  }
  return null;
}

export async function loadProductsForMessaging(
  productIds: string[],
  opts?: { brandId?: string | null; userId?: string | null },
): Promise<ProductTagContext[]> {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const brandId = String(opts?.brandId || "").trim() || null;
  const storeSlug = await resolveStoreSlugForBrand(brandId);
  const base = publicBaseUrl();

  try {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await query<any[]>(
      `SELECT id, name, description, price, promo_price, unit, image_url
       FROM products
       WHERE id IN (${placeholders})`,
      ids,
    );
    const list = Array.isArray(rows) ? rows : [];
    const byId = new Map(list.map((r) => [String(r.id), r]));

    const out: ProductTagContext[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      const name = String(row.name || "Produto").trim();
      const slug = toProductSlug(name);
      let link = "";
      if (storeSlug) {
        link = `${base}/catalogo/${encodeURIComponent(storeSlug)}/produto/${encodeURIComponent(slug)}`;
      } else {
        link = `${base}/produto/${encodeURIComponent(slug)}?id=${encodeURIComponent(id)}`;
      }
      const price = Number(row.price || 0);
      const promo =
        row.promo_price != null && Number(row.promo_price) > 0 ? Number(row.promo_price) : null;
      out.push({
        id,
        name,
        price,
        promoPrice: promo,
        description: String(row.description || "").trim(),
        unit: String(row.unit || "").trim() || undefined,
        imageUrl: String(row.image_url || "").trim() || undefined,
        slug,
        link,
      });
    }
    return out;
  } catch (err: any) {
    logger.warn(`[productMessageTags] loadProducts: ${err?.message || err}`);
    return [];
  }
}

export function formatProductPriceLine(p: ProductTagContext): string {
  const unit = p.unit ? ` / ${p.unit}` : "";
  if (p.promoPrice != null && p.promoPrice > 0 && p.promoPrice < p.price) {
    return `${formatBRL(p.promoPrice)}${unit} (de ${formatBRL(p.price)})`;
  }
  return `${formatBRL(p.price)}${unit}`;
}

/** Build {{tag}} map from one or more products (first = primary). */
export function buildProductTemplateValues(products: ProductTagContext[]): Record<string, string> {
  const values: Record<string, string> = {};
  if (!products.length) {
    values.produto_nome = "";
    values.produto_preco = "";
    values.produto_link = "";
    values.produto_descricao = "";
    values.produtos_lista = "";
    return values;
  }
  const primary = products[0];
  values.produto_nome = primary.name;
  values.produto_preco = formatProductPriceLine(primary);
  values.produto_link = primary.link;
  values.produto_descricao = (primary.description || "").slice(0, 400);
  values.produto_id = primary.id;

  values.produtos_lista = products
    .map((p, i) => `${i + 1}. ${p.name} — ${formatProductPriceLine(p)}\n${p.link}`)
    .join("\n\n");

  products.forEach((p, idx) => {
    const n = idx + 1;
    values[`produto_${n}_nome`] = p.name;
    values[`produto_${n}_preco`] = formatProductPriceLine(p);
    values[`produto_${n}_link`] = p.link;
    values[`produto_${n}_descricao`] = (p.description || "").slice(0, 280);
    values[`produto_${n}_id`] = p.id;
  });

  return values;
}

export function applyTemplateTags(template: string, values: Record<string, string>): string {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const v = values[String(key).toLowerCase()];
    return v != null ? v : "";
  });
}

/** Collect productIds from campaign media + optionItems + block configs */
export function collectProductIdsFromCampaignSettings(settings: any): string[] {
  const ids: string[] = [];
  const media = settings?.media || {};
  if (media?.product?.id) ids.push(String(media.product.id));
  if (Array.isArray(media?.products)) {
    for (const p of media.products) {
      if (p?.id) ids.push(String(p.id));
    }
  }
  const composer = settings?.composer || {};
  const blocks = Array.isArray(composer.actionBlocks) ? composer.actionBlocks : [];
  for (const b of blocks) {
    const cfg = b?.config || {};
    if (cfg.productId) ids.push(String(cfg.productId));
    if (Array.isArray(cfg.productIds)) {
      for (const id of cfg.productIds) ids.push(String(id));
    }
    if (Array.isArray(cfg.optionItems)) {
      for (const it of cfg.optionItems) {
        if (it?.productId) ids.push(String(it.productId));
      }
    }
  }
  return ids;
}

/** Collect productIds from automation mensagemSteps */
export function collectProductIdsFromMensagemSteps(steps: any[]): string[] {
  const ids: string[] = [];
  for (const step of steps || []) {
    if (step?.productId) ids.push(String(step.productId));
    if (Array.isArray(step?.productIds)) {
      for (const id of step.productIds) ids.push(String(id));
    }
    for (const btn of step?.buttons || []) {
      if (btn?.productId) ids.push(String(btn.productId));
    }
    for (const sec of step?.listSections || []) {
      for (const row of sec?.rows || []) {
        if (row?.productId) ids.push(String(row.productId));
      }
    }
  }
  return ids;
}

/**
 * Expand buttons/list rows that reference products:
 * - label/title defaults to product name
 * - description gets price line
 * - url gets product link
 */
export function hydrateInteractiveWithProducts<
  T extends { productId?: string; label?: string; title?: string; description?: string; url?: string; id?: string },
>(items: T[], productsById: Map<string, ProductTagContext>): T[] {
  return (items || []).map((item, index) => {
    const pid = String(item.productId || "").trim();
    if (!pid) return item;
    const p = productsById.get(pid);
    if (!p) return item;
    return {
      ...item,
      label: String(item.label || item.title || "").trim() || p.name.slice(0, 20),
      title: String(item.title || item.label || "").trim() || p.name.slice(0, 24),
      description:
        String(item.description || "").trim() ||
        formatProductPriceLine(p).slice(0, 72),
      url: String(item.url || "").trim() || p.link,
      id: item.id || `product_${pid}_${index}`,
      productId: pid,
    };
  });
}
