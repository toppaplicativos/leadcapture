import type { Product } from '@/lib/api'
import { isCustomDomain, getStoreSlug, getStoreChannel } from '@/lib/store-context'

function slugify(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** Slug estável para URL pública do produto. */
export function resolveProductSlug(product: Pick<Product, 'slug' | 'name' | 'id'>): string {
  const explicit = String(product.slug || '').trim()
  if (explicit) return explicit
  return slugify(product.name || '') || String(product.id || '').trim()
}

export type ProductUrlOptions = {
  catalogSlug?: string
  /** Domínio primário verificado da loja (ex.: minhaloja.com.br) */
  primaryDomain?: string | null
  /** Origem de fallback quando não há domínio próprio */
  fallbackOrigin?: string
}

function normalizeDomainHost(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0]
    .split(':')[0]
}

/** Origem pública da loja para links compartilháveis. */
export function resolveStorePublicOrigin(options?: ProductUrlOptions): string {
  const domain = normalizeDomainHost(options?.primaryDomain || '')
  if (domain && domain !== 'localhost' && domain !== '127.0.0.1') {
    return `https://${domain}`
  }
  if (isCustomDomain && typeof window !== 'undefined') {
    return window.location.origin.replace(/\/+$/, '')
  }
  const fallback =
    options?.fallbackOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  return String(fallback || '').replace(/\/+$/, '')
}

/** Caminho relativo da página do produto (ex.: /catalogo/marca/produto/slug). */
export function productPath(
  product: Pick<Product, 'slug' | 'name' | 'id'>,
  catalogSlug?: string,
): string {
  const slug = resolveProductSlug(product)
  if (isCustomDomain) {
    return `/produto/${encodeURIComponent(slug)}`
  }
  const channel = getStoreChannel()
  const store = catalogSlug || getStoreSlug()
  return `/${channel}/${encodeURIComponent(store)}/produto/${encodeURIComponent(slug)}`
}

export function productUrl(
  product: Pick<Product, 'slug' | 'name' | 'id'>,
  catalogSlug?: string,
): string {
  return productPath(product, catalogSlug)
}

/** URL absoluta — usa domínio próprio do brand quando configurado. */
export function absoluteProductUrl(
  product: Pick<Product, 'slug' | 'name' | 'id'>,
  originOrOptions?: string | ProductUrlOptions,
  catalogSlug?: string,
): string {
  let options: ProductUrlOptions = {}
  if (typeof originOrOptions === 'string') {
    options = { fallbackOrigin: originOrOptions, catalogSlug }
  } else if (originOrOptions) {
    options = originOrOptions
  }
  const slug = options.catalogSlug ?? catalogSlug
  const base = resolveStorePublicOrigin(options)
  const onOwnDomain =
    isCustomDomain || Boolean(normalizeDomainHost(options?.primaryDomain || ''))
  const path = onOwnDomain
    ? `/produto/${encodeURIComponent(resolveProductSlug(product))}`
    : productPath(product, slug)
  return `${base}${path}`
}