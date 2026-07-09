export const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const num = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR')

export const dt = (v?: string) => {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}

export const dtFull = (v?: string) => {
  try {
    return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function clearAdminAuth() {
  localStorage.removeItem('lead-system-token')
  localStorage.removeItem('lead-system:active-brand-id')
  try {
    localStorage.removeItem('lead-system:active-brand-name')
    localStorage.removeItem('lead-system:active-brand-logo')
  } catch { /* ignore */ }
}

export function toBrandSlug(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function pickStockBrandSlug(
  brand?: { slug?: string; name?: string } | null,
  storeSlug?: string,
  credentialSlug?: string,
): string {
  const fromBrand = String(brand?.slug || '').trim()
  if (fromBrand) return fromBrand
  const fromStore = String(storeSlug || '').trim()
  if (fromStore) return fromStore
  const fromCred = String(credentialSlug || '').trim()
  if (fromCred) return fromCred
  return toBrandSlug(brand?.name || '')
}

export function buildStockAppUrl(slug: string): string {
  const normalized = String(slug || '').trim()
  return normalized ? `/app-estoque/${encodeURIComponent(normalized)}` : '/app-estoque'
}

export function buildAffiliateAppUrl(slug: string): string {
  const normalized = String(slug || '').trim()
  return normalized ? `/central-afiliado/${encodeURIComponent(normalized)}` : '/central-afiliado'
}

export type CatalogProductUrlOptions = {
  origin?: string
  /** Domínio próprio verificado — priorizado no link compartilhável */
  primaryDomain?: string | null
}

/** URL pública da página do produto (Instagram Shop, compartilhamento). */
export function buildCatalogProductUrl(
  storeSlug: string,
  productSlug: string,
  originOrOptions?: string | CatalogProductUrlOptions,
): string {
  const store = String(storeSlug || '').trim()
  const product = String(productSlug || '').trim()
  if (!store || !product) return ''

  const options: CatalogProductUrlOptions =
    typeof originOrOptions === 'string'
      ? { origin: originOrOptions }
      : originOrOptions || {}

  const fallbackOrigin =
    options.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  const domain = String(options.primaryDomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0]
    .split(':')[0]

  if (domain && domain !== 'localhost' && domain !== '127.0.0.1') {
    return `https://${domain}/produto/${encodeURIComponent(product)}`
  }

  const path = `/catalogo/${encodeURIComponent(store)}/produto/${encodeURIComponent(product)}`
  const base = String(fallbackOrigin).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

export function slugifyCatalogProduct(value: string): string {
  return toBrandSlug(value)
}