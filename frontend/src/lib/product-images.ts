import type { Product } from '@/lib/api'

function pushUnique(list: string[], url: string) {
  const trimmed = String(url || '').trim()
  if (!trimmed || list.includes(trimmed)) return
  list.push(trimmed)
}

/** Resolve todas as URLs de mídia do produto (galeria, variantes, legado). */
export function collectProductImages(
  product: Product,
  variantImage?: string | null,
): string[] {
  const imgs: string[] = []

  if (variantImage) pushUnique(imgs, variantImage)

  if (product.image) pushUnique(imgs, product.image)

  if (Array.isArray(product.images)) {
    product.images.forEach((u) => pushUnique(imgs, u))
  }

  if (product.images_json) {
    try {
      const parsed = JSON.parse(product.images_json)
      if (Array.isArray(parsed)) {
        parsed.forEach((item: string | { url?: string; src?: string }) => {
          if (typeof item === 'string') pushUnique(imgs, item)
          else pushUnique(imgs, item?.url || item?.src || '')
        })
      }
    } catch { /* ignore */ }
  }

  const media = product.media || {}
  if (Array.isArray(media.gallery)) {
    media.gallery.forEach((u: unknown) => pushUnique(imgs, String(u || '')))
  }
  if (Array.isArray((product as any).attributes?.gallery_images)) {
    ;(product as any).attributes.gallery_images.forEach((u: unknown) => pushUnique(imgs, String(u || '')))
  }

  const variants = Array.isArray((product as any).variants) ? (product as any).variants : []
  for (const v of variants) {
    if (v?.image_url) pushUnique(imgs, v.image_url)
  }

  return imgs
}