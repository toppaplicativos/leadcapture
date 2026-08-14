import type { Product } from './api'

export type ProductLocale = 'pt-BR' | 'pt-PT' | 'es' | 'en'

const SPANISH_COUNTRIES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GQ', 'GT', 'HN',
  'MX', 'NI', 'PA', 'PY', 'PE', 'PR', 'ES', 'UY', 'VE',
])

export function detectProductLocale(country?: string | null): ProductLocale {
  const normalizedCountry = String(country || '').trim().toUpperCase()
  if (normalizedCountry === 'PT') return 'pt-PT'
  if (SPANISH_COUNTRIES.has(normalizedCountry)) return 'es'
  if (normalizedCountry === 'BR') return 'pt-BR'

  const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem('storefront_locale') : null
  if (saved === 'pt-BR' || saved === 'pt-PT' || saved === 'es' || saved === 'en') return saved

  const browserLanguage = typeof navigator !== 'undefined' ? String(navigator.language || '').toLowerCase() : ''
  if (browserLanguage.startsWith('pt-pt')) return 'pt-PT'
  if (browserLanguage.startsWith('es')) return 'es'
  if (browserLanguage.startsWith('en')) return 'en'
  return 'pt-BR'
}

export function localizeProduct(product: Product, locale: ProductLocale): Product {
  if (locale === 'pt-BR') return product
  const localized = product.metadata?.localized_content
  if (!localized || typeof localized !== 'object') return product
  const translation = (localized as Record<string, unknown>)[locale]
  if (!translation || typeof translation !== 'object') return product
  const description = String((translation as Record<string, unknown>).description || '').trim()
  return description ? { ...product, description } : product
}

export function localizeProducts(products: Product[], country?: string | null): Product[] {
  const locale = detectProductLocale(country)
  if (typeof window !== 'undefined') window.sessionStorage.setItem('storefront_locale', locale)
  return products.map(product => localizeProduct(product, locale))
}
