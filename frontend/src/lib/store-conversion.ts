import type { Product } from '@/lib/api'

export type StoreAnnouncementBar = {
  enabled: boolean
  text: string
  link_url: string | null
  dismissible: boolean
}

export type StoreTrustStrip = {
  enabled: boolean
  /** Quando vazio, montamos a partir do profile da loja. */
  items: Array<{ id: string; label: string }>
}

export type StoreConversionSettings = {
  announcement_bar: StoreAnnouncementBar
  trust_strip: StoreTrustStrip
  show_best_sellers: boolean
  best_sellers_title: string
  best_sellers_limit: number
  show_product_badges: boolean
  sticky_atc: boolean
  show_pdp_trust: boolean
  cart_drawer: boolean
  cart_upsell: boolean
  urgency_low_stock: boolean
  /** Opcional: timestamp ISO do fim da promo (countdown). */
  promo_ends_at: string | null
  promo_label: string
}

export type PublicStoreMarketingConversion = {
  announcement_bar?: Partial<StoreAnnouncementBar> | null
  trust_strip?: Partial<StoreTrustStrip> | null
  conversion?: Partial<StoreConversionSettings> | null
}

export const DEFAULT_CONVERSION: StoreConversionSettings = {
  announcement_bar: {
    enabled: true,
    text: '',
    link_url: null,
    dismissible: true,
  },
  trust_strip: {
    enabled: true,
    items: [],
  },
  show_best_sellers: true,
  best_sellers_title: 'Mais vendidos',
  best_sellers_limit: 8,
  show_product_badges: true,
  sticky_atc: true,
  show_pdp_trust: true,
  cart_drawer: true,
  cart_upsell: true,
  urgency_low_stock: true,
  promo_ends_at: null,
  promo_label: 'Oferta por tempo limitado',
}

export function normalizeConversionSettings(
  marketing?: {
    announcement_bar?: Partial<StoreAnnouncementBar> | null
    trust_strip?: Partial<StoreTrustStrip> | null
    conversion?: Partial<StoreConversionSettings> | null
  } | null,
): StoreConversionSettings {
  const bar = marketing?.announcement_bar || {}
  const strip = marketing?.trust_strip || {}
  const c = marketing?.conversion || {}
  return {
    announcement_bar: {
      enabled: bar.enabled !== false,
      text: String(bar.text || '').trim().slice(0, 160),
      link_url: bar.link_url != null ? String(bar.link_url).trim() || null : null,
      dismissible: bar.dismissible !== false,
    },
    trust_strip: {
      enabled: strip.enabled !== false,
      items: Array.isArray(strip.items)
        ? strip.items
            .map((it, i) => ({
              id: String((it as any)?.id || `t${i}`),
              label: String((it as any)?.label || '').trim().slice(0, 48),
            }))
            .filter((it) => it.label)
        : [],
    },
    show_best_sellers: c.show_best_sellers !== false,
    best_sellers_title: String(c.best_sellers_title || DEFAULT_CONVERSION.best_sellers_title).trim().slice(0, 60),
    best_sellers_limit: Math.min(12, Math.max(4, Number(c.best_sellers_limit) || 8)),
    show_product_badges: c.show_product_badges !== false,
    sticky_atc: c.sticky_atc !== false,
    show_pdp_trust: c.show_pdp_trust !== false,
    cart_drawer: c.cart_drawer !== false,
    cart_upsell: c.cart_upsell !== false,
    urgency_low_stock: c.urgency_low_stock !== false,
    promo_ends_at: c.promo_ends_at ? String(c.promo_ends_at) : null,
    promo_label: String(c.promo_label || DEFAULT_CONVERSION.promo_label).trim().slice(0, 80),
  }
}

/** Score para “mais vendidos” — reviews + desconto como proxy de popularidade. */
export function productPopularityScore(p: Product): number {
  const reviews = Number(p.reviews_count || 0)
  const avg = Number(p.reviews_avg || 0)
  const hasDiscount =
    p.compare_at_price && Number(p.compare_at_price) > Number(p.price) ? 1 : 0
  const stockBoost =
    p.stock_status === 'low_stock' ? 0.5 : p.stock_status === 'out_of_stock' ? -10 : 0
  return reviews * Math.max(avg, 3.5) + hasDiscount * 2 + stockBoost
}

export function pickBestSellers(products: Product[], limit = 8): Product[] {
  return [...products]
    .filter((p) => {
      const status = p.stock_status || 'unlimited'
      const qty = p.stock_quantity == null ? null : Number(p.stock_quantity)
      if (status === 'out_of_stock') return false
      if (qty !== null && qty <= 0) return false
      return true
    })
    .sort((a, b) => productPopularityScore(b) - productPopularityScore(a))
    .slice(0, limit)
}

export type ProductBadgeKind = 'sale' | 'new' | 'bestseller' | 'low_stock' | 'sold_out' | 'volume'

export function resolveProductBadges(
  product: Product,
  opts?: { bestSellerIds?: Set<string>; showBadges?: boolean },
): Array<{ kind: ProductBadgeKind; label: string }> {
  if (opts?.showBadges === false) return []
  const badges: Array<{ kind: ProductBadgeKind; label: string }> = []
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const isOut = stockStatus === 'out_of_stock' || (stockQty !== null && stockQty <= 0)
  const isLow = stockStatus === 'low_stock' && stockQty !== null && stockQty > 0
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const discount = hasCompare
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0

  if (isOut) {
    badges.push({ kind: 'sold_out', label: 'Esgotado' })
    return badges
  }
  if (discount > 0) badges.push({ kind: 'sale', label: `−${discount}%` })
  {
    const volume = (product.metadata as { volume_pricing?: { enabled?: boolean; tiers?: unknown[] } } | undefined)?.volume_pricing
    if (volume?.enabled && Array.isArray(volume.tiers) && volume.tiers.length > 0) {
      badges.push({ kind: 'volume', label: 'Mais compra, mais barato' })
    }
  }
  if (opts?.bestSellerIds?.has(product.id)) {
    badges.push({ kind: 'bestseller', label: 'Mais vendido' })
  }
  if (isLow) badges.push({ kind: 'low_stock', label: `Últimas ${stockQty}` })
  return badges.slice(0, 2)
}

/**
 * Trust strip = único lugar de frete/pagamento/prazo na home.
 * Não inclui WhatsApp (só FAB). Máx 3 cards no mobile.
 */
export function buildTrustItems(input: {
  freeAbove?: number
  deliveryFee?: number
  deliveryTime?: string
  customItems?: Array<{ id: string; label: string }>
  paymentLabel?: string
}): Array<{ id: string; label: string }> {
  if (input.customItems && input.customItems.length > 0) {
    return input.customItems
      .filter((it) => !/whatsapp|whats\s*app|atendimento/i.test(it.label))
      .slice(0, 3)
  }
  const items: Array<{ id: string; label: string }> = []
  if (input.freeAbove && input.freeAbove > 0) {
    items.push({
      id: 'free',
      label: `Frete grátis acima de R$ ${Math.round(input.freeAbove)}`,
    })
  } else if (input.deliveryFee != null && input.deliveryFee > 0) {
    items.push({
      id: 'fee',
      label: `Entrega a partir de R$ ${Math.round(input.deliveryFee)}`,
    })
  } else if (input.deliveryFee === 0) {
    items.push({ id: 'free', label: 'Frete grátis' })
  }
  if (input.deliveryTime) {
    items.push({ id: 'eta', label: String(input.deliveryTime).slice(0, 40) })
  } else if (input.freeAbove && input.freeAbove > 0 && input.deliveryFee != null && input.deliveryFee > 0) {
    // Complemento útil sem repetir o chip do hero: frete pago abaixo do mínimo
    items.push({
      id: 'fee',
      label: `Entrega a partir de R$ ${Math.round(input.deliveryFee)}`,
    })
  }
  items.push({
    id: 'pay',
    label: (input.paymentLabel || 'PIX e cartão').slice(0, 40),
  })
  return items.slice(0, 3)
}

/** Barra do topo: genérica, sem repetir frete do trust strip. */
export function buildAnnouncementText(input: {
  configured?: string
  freeAbove?: number
  deliveryTime?: string
}): string {
  if (input.configured) return input.configured
  // Não repete frete (já está no trust strip)
  if (input.deliveryTime) return String(input.deliveryTime)
  return 'Compra segura · Qualidade garantida'
}

/** Agregado de avaliações da loja a partir dos produtos. */
export function aggregateStoreReviews(products: Product[]): {
  count: number
  avg: number
  topProducts: Product[]
} {
  let weighted = 0
  let count = 0
  const withReviews = products.filter(
    (p) => Number(p.reviews_count || 0) > 0 && Number(p.reviews_avg || 0) > 0,
  )
  for (const p of withReviews) {
    const c = Number(p.reviews_count || 0)
    const a = Number(p.reviews_avg || 0)
    weighted += a * c
    count += c
  }
  const avg = count > 0 ? weighted / count : 0
  const topProducts = [...withReviews]
    .sort((a, b) => {
      const sa = Number(a.reviews_avg || 0) * Math.log10(Number(a.reviews_count || 1) + 1)
      const sb = Number(b.reviews_avg || 0) * Math.log10(Number(b.reviews_count || 1) + 1)
      return sb - sa
    })
    .slice(0, 6)
  return { count, avg, topProducts }
}

export function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return t - Date.now()
}
