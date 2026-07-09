export type StorePageScope = 'all' | 'home_only' | 'product_only'

export type StoreMarketingWhatsApp = {
  enabled: boolean
  show_in_hero: boolean
  show_fab: boolean
  fab_position: 'bottom-right' | 'bottom-left'
  prefilled_message: string
  show_on_pages: StorePageScope
}

export type PublicStoreMarketing = {
  whatsapp?: Partial<StoreMarketingWhatsApp> | null
}

export const DEFAULT_WHATSAPP_MARKETING: StoreMarketingWhatsApp = {
  enabled: false,
  show_in_hero: true,
  show_fab: false,
  fab_position: 'bottom-right',
  prefilled_message: 'Olá! Vim pelo catálogo e gostaria de mais informações.',
  show_on_pages: 'all',
}

export function normalizeWhatsAppMarketing(
  input?: Partial<StoreMarketingWhatsApp> | null,
): StoreMarketingWhatsApp {
  const src = input || {}
  return {
    enabled: src.enabled === true,
    show_in_hero: src.show_in_hero !== false,
    show_fab: src.show_fab === true,
    fab_position: src.fab_position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    prefilled_message: String(src.prefilled_message || DEFAULT_WHATSAPP_MARKETING.prefilled_message).trim(),
    show_on_pages: (['all', 'home_only', 'product_only'] as const).includes(src.show_on_pages as StorePageScope)
      ? (src.show_on_pages as StorePageScope)
      : 'all',
  }
}

/** Lojas legadas (sem bloco marketing) mantêm chip no hero quando há telefone. */
export function resolvePublicWhatsApp(
  marketing: PublicStoreMarketing | undefined | null,
  phone: string | undefined | null,
  page: 'home' | 'product' | 'checkout' | 'other' = 'home',
): {
  phone: string
  showInHero: boolean
  showFab: boolean
  fabPosition: 'bottom-right' | 'bottom-left'
  prefilledMessage: string
} | null {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null

  const hasMarketingBlock = Boolean(marketing?.whatsapp)
  const wa = normalizeWhatsAppMarketing(marketing?.whatsapp)

  const enabled = hasMarketingBlock ? wa.enabled : true
  if (!enabled) return null

  const scope = wa.show_on_pages
  const pageAllowed =
    scope === 'all' ||
    (scope === 'home_only' && page === 'home') ||
    (scope === 'product_only' && page === 'product')
  if (!pageAllowed) return null

  const showInHero = hasMarketingBlock ? wa.show_in_hero : true
  const showFab = hasMarketingBlock ? wa.show_fab : false
  if (!showInHero && !showFab) return null

  return {
    phone: digits,
    showInHero,
    showFab,
    fabPosition: wa.fab_position,
    prefilledMessage: wa.prefilled_message,
  }
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const digits = String(phone || '').replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  const text = String(message || '').trim()
  if (!text) return base
  return `${base}?text=${encodeURIComponent(text)}`
}

export type StoreMarketingPage = 'home' | 'product' | 'checkout' | 'other'