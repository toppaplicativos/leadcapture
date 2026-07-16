import { storeSlug } from './store-context'

const REF_KEY = 'lc_affiliate_ref'
const COUPON_KEY = 'lc_affiliate_coupon'
const ID_KEY = 'lc_affiliate_id'
const NAME_KEY = 'lc_affiliate_name'
const WA_PHONE_KEY = 'lc_affiliate_whatsapp_phone'
const WA_SOURCE_KEY = 'lc_affiliate_whatsapp_source'

export type AffiliateCaptureResult = {
  ok: boolean
  ref?: string
  coupon?: string
  affiliateId?: string
  displayName?: string
  /** Número resolvido do afiliado (ou fallback loja no backend). */
  whatsappPhone?: string
  whatsappSource?: string
  error?: string
}

export function getAffiliateRef(): string | null {
  try { return sessionStorage.getItem(REF_KEY) } catch { return null }
}

export function getAffiliateCoupon(): string | null {
  try { return sessionStorage.getItem(COUPON_KEY) } catch { return null }
}

export function getAffiliateId(): string | null {
  try { return sessionStorage.getItem(ID_KEY) } catch { return null }
}

export function getAffiliateDisplayName(): string | null {
  try { return sessionStorage.getItem(NAME_KEY) } catch { return null }
}

/** WhatsApp dinâmico do afiliado capturado via link (?ref=). */
export function getAffiliateWhatsAppPhone(): string | null {
  try {
    const digits = String(sessionStorage.getItem(WA_PHONE_KEY) || '').replace(/\D/g, '')
    return digits.length >= 10 ? digits : null
  } catch {
    return null
  }
}

export function getAffiliateWhatsAppSource(): string | null {
  try {
    return sessionStorage.getItem(WA_SOURCE_KEY) || null
  } catch {
    return null
  }
}

function persistAffiliateWhatsApp(phone?: string | null, source?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '')
  try {
    if (digits.length >= 10) {
      sessionStorage.setItem(WA_PHONE_KEY, digits)
    } else {
      sessionStorage.removeItem(WA_PHONE_KEY)
    }
    if (source) {
      sessionStorage.setItem(WA_SOURCE_KEY, String(source))
    } else {
      sessionStorage.removeItem(WA_SOURCE_KEY)
    }
  } catch { /* ignore */ }
}

function affiliateQueryParams(code: string, couponCode?: string | null): URLSearchParams {
  const params = new URLSearchParams()
  const ref = String(code || '').trim()
  const coupon = String(couponCode || '').trim().toUpperCase()
  if (ref) params.set('ref', ref)
  if (coupon) params.set('cupom', coupon)
  return params
}

export function buildAffiliateCatalogUrl(input: {
  storeSlug: string
  code: string
  couponCode?: string | null
  origin?: string
  primaryDomain?: string | null
}): string {
  const origin = resolveAffiliatePublicOrigin(input)
  const slug = String(input.storeSlug || '').trim()
  const qs = affiliateQueryParams(input.code, input.couponCode).toString()
  const path = normalizeDomain(input.primaryDomain)
    ? '/'
    : `/catalogo/${encodeURIComponent(slug)}`
  return `${origin}${path}${qs ? `?${qs}` : ''}`
}

export function buildAffiliateShortUrl(input: {
  code: string
  origin?: string
  primaryDomain?: string | null
}): string {
  const origin = resolveAffiliatePublicOrigin(input)
  const code = String(input.code || '').trim()
  return `${origin}/afiliado/${encodeURIComponent(code)}`
}

export function buildAffiliateProductUrl(input: {
  storeSlug: string
  code: string
  productSlug: string
  couponCode?: string | null
  origin?: string
  primaryDomain?: string | null
}): string {
  const origin = resolveAffiliatePublicOrigin(input)
  const slug = String(input.storeSlug || '').trim()
  const productSlug = String(input.productSlug || '').trim()
  const qs = affiliateQueryParams(input.code, input.couponCode).toString()
  const path = normalizeDomain(input.primaryDomain)
    ? `/produto/${encodeURIComponent(productSlug)}`
    : `/catalogo/${encodeURIComponent(slug)}/produto/${encodeURIComponent(productSlug)}`
  return `${origin}${path}${qs ? `?${qs}` : ''}`
}

function normalizeDomain(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase()
}

function resolveAffiliatePublicOrigin(input: {
  origin?: string
  primaryDomain?: string | null
}): string {
  const domain = normalizeDomain(input.primaryDomain)
  if (domain && domain !== 'localhost' && domain !== '127.0.0.1') {
    return `https://${domain}`
  }
  return (input.origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')
}

function detectAffiliateLandingMeta(): {
  link_type: 'catalog' | 'product' | 'short'
  product_slug?: string
  landing_path: string
} {
  if (typeof window === 'undefined') {
    return { link_type: 'catalog', landing_path: '/' }
  }
  const path = window.location.pathname || '/'
  if (path.startsWith('/afiliado/')) {
    return { link_type: 'short', landing_path: path }
  }
  const productMatch = path.match(/\/produto\/([^/?#]+)/)
  if (productMatch?.[1]) {
    return {
      link_type: 'product',
      product_slug: decodeURIComponent(productMatch[1]),
      landing_path: path,
    }
  }
  return { link_type: 'catalog', landing_path: path }
}

/**
 * Lê ?ref= e ?cupom= da URL do catálogo, registra clique e persiste para o checkout.
 */
export async function captureAffiliateFromUrl(): Promise<AffiliateCaptureResult> {
  if (typeof window === 'undefined') return { ok: false }

  const params = new URLSearchParams(window.location.search)
  const ref = String(params.get('ref') || '').trim()
  const cupom = String(params.get('cupom') || '').trim()

  if (cupom) {
    try { sessionStorage.setItem(COUPON_KEY, cupom.toUpperCase()) } catch { /* ignore */ }
  }

  if (!ref) {
    return {
      ok: !!cupom,
      coupon: cupom ? cupom.toUpperCase() : undefined,
    }
  }

  try { sessionStorage.setItem(REF_KEY, ref) } catch { /* ignore */ }

  try {
    const landing = detectAffiliateLandingMeta()
    const r = await fetch(`/api/public/affiliate/${encodeURIComponent(ref)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        link_type: landing.link_type,
        product_slug: landing.product_slug,
        landing_path: landing.landing_path,
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Afiliado não encontrado')

    const currentSlug = String(storeSlug || '').trim().toLowerCase()
    const affiliateStore = String(data.store_slug || '').trim().toLowerCase()
    if (currentSlug && affiliateStore && currentSlug !== affiliateStore) {
      throw new Error('Este link de afiliado não é válido para esta loja.')
    }

    if (data.affiliate_id) {
      try { sessionStorage.setItem(ID_KEY, String(data.affiliate_id)) } catch { /* ignore */ }
      const days = Number(data.cookie_days) || 30
      document.cookie = `lc_affiliate=${encodeURIComponent(data.affiliate_id)}; path=/; max-age=${days * 86400}; SameSite=Lax`
    }
    const couponCode = String(data.coupon_code || cupom || '').trim().toUpperCase()
    if (couponCode) {
      try { sessionStorage.setItem(COUPON_KEY, couponCode) } catch { /* ignore */ }
    }
    const displayName = String(data.display_name || data.code || ref).trim()
    if (displayName) {
      try { sessionStorage.setItem(NAME_KEY, displayName) } catch { /* ignore */ }
    }

    const whatsappPhone = String(data.whatsapp_phone || '').replace(/\D/g, '')
    const whatsappSource = data.whatsapp_source ? String(data.whatsapp_source) : undefined
    persistAffiliateWhatsApp(whatsappPhone || null, whatsappSource || null)

    return {
      ok: true,
      ref,
      coupon: couponCode || undefined,
      affiliateId: data.affiliate_id ? String(data.affiliate_id) : undefined,
      displayName,
      whatsappPhone: whatsappPhone.length >= 10 ? whatsappPhone : undefined,
      whatsappSource,
    }
  } catch (error) {
    try {
      sessionStorage.removeItem(REF_KEY)
      sessionStorage.removeItem(ID_KEY)
      sessionStorage.removeItem(NAME_KEY)
      sessionStorage.removeItem(WA_PHONE_KEY)
      sessionStorage.removeItem(WA_SOURCE_KEY)
    } catch { /* ignore */ }
    return {
      ok: false,
      ref,
      coupon: cupom ? cupom.toUpperCase() : getAffiliateCoupon() || undefined,
      error: error instanceof Error ? error.message : 'Afiliado não encontrado',
    }
  }
}

/**
 * Se já há ?ref= / session de afiliado mas o número não foi persistido
 * (ex.: navegação interna), reconsulta o endpoint leve de WhatsApp.
 */
export async function ensureAffiliateWhatsAppPhone(): Promise<string | null> {
  const cached = getAffiliateWhatsAppPhone()
  if (cached) return cached

  const ref = getAffiliateRef()
  if (!ref) return null

  try {
    const r = await fetch(`/api/public/affiliate/${encodeURIComponent(ref)}/whatsapp`)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return null
    const phone = String(data.whatsapp_phone || '').replace(/\D/g, '')
    const source = data.whatsapp_source ? String(data.whatsapp_source) : null
    persistAffiliateWhatsApp(phone || null, source)
    return phone.length >= 10 ? phone : null
  } catch {
    return null
  }
}

/**
 * Número efetivo para botões da loja:
 * - link afiliado ativo → WhatsApp do afiliado (dinâmico)
 * - link raiz / sem afiliado → WhatsApp da loja (studio)
 */
export function resolveStoreContactPhone(storePhone?: string | null): string {
  const affiliatePhone = getAffiliateWhatsAppPhone()
  if (affiliatePhone) return affiliatePhone
  return String(storePhone || '').replace(/\D/g, '')
}

function readCookieAffiliateId(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)lc_affiliate=([^;]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1]).trim() || null
  } catch {
    return match[1].trim() || null
  }
}

export function getAffiliateOrderMeta(): { affiliate_ref?: string; affiliate_id?: string } {
  const ref = getAffiliateRef()
  const id = getAffiliateId() || readCookieAffiliateId()
  const meta: { affiliate_ref?: string; affiliate_id?: string } = {}
  if (ref) meta.affiliate_ref = ref
  if (id) meta.affiliate_id = id
  return meta
}
