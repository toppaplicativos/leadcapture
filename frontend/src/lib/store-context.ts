/* ── Store slug resolution (same logic as the vanilla JS) ── */

export const isCustomDomain = !!window.__CUSTOM_DOMAIN__

/** Resolve o slug da loja a partir da URL atual (sempre dinâmico). */
export function getStoreSlug(): string {
  if (typeof window === 'undefined') return ''
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const query = new URLSearchParams(window.location.search)
  const slugFromPath =
    (pathParts[0] === 'catalogo' || pathParts[0] === 'loja') && pathParts[1]
      ? pathParts[1]
      : ''
  return String(query.get('slug') || slugFromPath || window.__STORE_SLUG__ || '').trim()
}

/** @deprecated Prefer getStoreSlug() — mantido para imports legados. */
export const storeSlug = getStoreSlug()

export function getStoreChannel(): 'catalogo' | 'loja' {
  if (typeof window === 'undefined') return 'catalogo'
  const first = window.location.pathname.split('/').filter(Boolean)[0] || ''
  return first === 'loja' ? 'loja' : 'catalogo'
}

export function storeUrl(subpath?: string, catalogSlug?: string): string {
  if (isCustomDomain) return subpath ? '/' + subpath : '/'
  const channel = getStoreChannel()
  const slug = catalogSlug || getStoreSlug()
  return (
    '/' +
    channel +
    '/' +
    encodeURIComponent(slug) +
    (subpath ? '/' + subpath : '')
  )
}

export type StoreCurrency = 'BRL' | 'EUR' | 'USD'

export function getStoreCurrency(): StoreCurrency {
  if (typeof window === 'undefined') return 'BRL'
  const raw = String(window.sessionStorage.getItem('storefront_currency') || '').toUpperCase()
  return raw === 'EUR' || raw === 'USD' || raw === 'BRL' ? raw : 'BRL'
}

export function resolveProductPrice(product: { price?: number | string; currency_prices?: Record<string, any> }, currency = getStoreCurrency()) {
  const entry = product.currency_prices?.[currency]
  if (entry == null) return Number(product.price || 0)
  if (typeof entry === 'object') return Number(entry.price ?? product.price ?? 0)
  return Number(entry)
}

export function resolveProductPromoPrice(product: { price?: number | string; currency_prices?: Record<string, any> }, currency = getStoreCurrency()) {
  const entry = product.currency_prices?.[currency]
  if (entry && typeof entry === 'object' && entry.promo_price != null) return Number(entry.promo_price)
  return undefined
}

export function money(value: number | string | null | undefined, currency = getStoreCurrency()): string {
  const locale = currency === 'BRL' ? 'pt-BR' : currency === 'EUR' ? 'pt-PT' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(Number(value || 0))
}

export function normalizePhone(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

const STATUS_MAP: Record<string, string> = {
  novo: 'Novo',
  confirmando_pagamento: 'Confirmando pagamento',
  aprovado: 'Aprovado',
  em_preparacao: 'Em preparação',
  saiu_para_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export function labelStatus(status: string): string {
  const key = String(status || '').trim().toLowerCase()
  return STATUS_MAP[key] || key || '-'
}
