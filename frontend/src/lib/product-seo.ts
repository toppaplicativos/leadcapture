import type { Product } from '@/lib/api'
import { applySeo, truncate } from '@/lib/seo'
import { absoluteProductUrl } from '@/lib/product-url'
import { optimizedImage } from '@/lib/image'

export type ProductSeoInput = {
  product: Product
  storeName?: string | null
  canonicalUrl?: string | null
}

function parseImages(product: Product): string[] {
  const imgs: string[] = []
  if (product.images_json) {
    try {
      const parsed = JSON.parse(product.images_json)
      if (Array.isArray(parsed)) {
        parsed.forEach((item: string | { url?: string }) => {
          const url = typeof item === 'string' ? item : item?.url
          if (url) imgs.push(url)
        })
      }
    } catch { /* ignore */ }
  }
  if (product.images?.length) {
    product.images.forEach((u) => { if (u && !imgs.includes(u)) imgs.push(u) })
  }
  if (product.image && !imgs.includes(product.image)) {
    imgs.unshift(product.image)
  }
  return imgs
}

function absoluteImage(url: string | null | undefined, origin: string): string | null {
  const src = String(url || '').trim()
  if (!src) return null
  if (/^https?:\/\//i.test(src)) return src
  const base = origin.replace(/\/+$/, '')
  if (src.startsWith('/')) return `${base}${src}`
  return `${base}/${src}`
}

function resolveAvailability(product: Product): 'in stock' | 'out of stock' {
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const legacyStock = product.stock != null && product.stock !== '' ? Number(product.stock) : null
  const isOut =
    stockStatus === 'out_of_stock' ||
    (stockQty !== null && stockQty <= 0) ||
    (legacyStock !== null && legacyStock <= 0)
  return isOut ? 'out of stock' : 'in stock'
}

function upsertMeta(attr: 'name' | 'property', key: string, value: string | null | undefined) {
  if (typeof document === 'undefined') return
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!value) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', String(value))
}

function upsertJsonLd(id: string, data: Record<string, unknown>) {
  if (typeof document === 'undefined') return
  let tag = document.getElementById(id) as HTMLScriptElement | null
  if (!tag) {
    tag = document.createElement('script')
    tag.id = id
    tag.type = 'application/ld+json'
    document.head.appendChild(tag)
  }
  tag.textContent = JSON.stringify(data)
}

/** SEO completo para página de produto (Open Graph product + JSON-LD). */
export function applyProductSeo({ product, storeName, canonicalUrl }: ProductSeoInput): void {
  if (typeof document === 'undefined') return

  const origin = window.location.origin
  const url = canonicalUrl || absoluteProductUrl(product, origin)
  const seoOrigin = (() => {
    const canonical = String(canonicalUrl || '').trim()
    if (!canonical) return origin
    try {
      return new URL(canonical).origin
    } catch {
      return origin
    }
  })()
  const seo = (product.seo || {}) as Record<string, string>
  const brand = storeName?.trim() || 'Loja'
  const title = String(seo.meta_title || product.name || 'Produto').slice(0, 70)
  const pageTitle = brand && title ? `${title} · ${brand}` : title
  const description = truncate(
    seo.meta_description || product.description || product.subtitle || product.name,
    160,
  )

  const images = parseImages(product)
  const rawImage = images[0] || null
  const shareImage = absoluteImage(
    rawImage ? optimizedImage(rawImage, 1200, 85) : null,
    seoOrigin,
  )

  applySeo({
    title: pageTitle,
    description,
    image: shareImage,
    url,
  })

  upsertMeta('property', 'og:type', 'product')
  upsertMeta('property', 'og:site_name', brand)
  upsertMeta('property', 'og:locale', 'pt_BR')
  upsertMeta('property', 'product:price:amount', String(Number(product.price || 0).toFixed(2)))
  upsertMeta('property', 'product:price:currency', 'BRL')
  upsertMeta('property', 'product:availability', resolveAvailability(product))
  if (product.sku) upsertMeta('property', 'product:retailer_item_id', product.sku)

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: description || undefined,
    sku: product.sku || undefined,
    image: images.length ? images.map((img) => absoluteImage(img, seoOrigin)).filter(Boolean) : undefined,
    url,
    brand: { '@type': 'Brand', name: brand },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BRL',
      price: Number(product.price || 0).toFixed(2),
      availability: `https://schema.org/${resolveAvailability(product) === 'in stock' ? 'InStock' : 'OutOfStock'}`,
      itemCondition: 'https://schema.org/NewCondition',
    },
  }

  if (product.compare_at_price && Number(product.compare_at_price) > Number(product.price)) {
    ;(jsonLd.offers as Record<string, unknown>).priceValidUntil = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10)
  }

  upsertJsonLd('product-jsonld', jsonLd)
}