/**
 * Pacote de compartilhamento estruturado (preview visual + mensagem curta).
 * O card OG do WhatsApp carrega título/descrição/imagem; a mensagem fica limpa.
 */

export type AffiliateSharePack = {
  kind: 'catalog' | 'product' | 'short'
  title: string
  description: string
  image_url: string | null
  image_width?: number
  image_height?: number
  url: string
  site_name: string
  message: string
  message_full: string
  coupon_code?: string | null
  affiliate_code?: string | null
  product?: {
    id: string
    name: string
    slug?: string | null
    price?: number | null
    promo_price?: number | null
  } | null
  brand?: {
    name: string
    logo_url?: string | null
    primary_domain?: string | null
  }
}

/** Texto para WhatsApp: curto para o preview ser o herói visual. */
export function sharePackWhatsAppText(pack: AffiliateSharePack, full = false): string {
  return String(full ? pack.message_full || pack.message : pack.message || '').trim()
}

/** navigator.share payload */
export function sharePackNativePayload(pack: AffiliateSharePack): ShareData {
  return {
    title: pack.title,
    text: pack.message,
    url: pack.url,
  }
}

export async function sharePackViaSystem(pack: AffiliateSharePack): Promise<'shared' | 'aborted' | 'unavailable'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unavailable'
  }
  try {
    await navigator.share(sharePackNativePayload(pack))
    return 'shared'
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return 'aborted'
    return 'unavailable'
  }
}

export function sharePackOpenWhatsApp(pack: AffiliateSharePack, full = false) {
  const text = sharePackWhatsAppText(pack, full)
  if (!text) return
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}

export async function sharePackCopyUrl(pack: AffiliateSharePack): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(pack.url)
    return true
  } catch {
    return false
  }
}

export async function sharePackCopyMessage(pack: AffiliateSharePack, full = false): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(sharePackWhatsAppText(pack, full))
    return true
  } catch {
    return false
  }
}
