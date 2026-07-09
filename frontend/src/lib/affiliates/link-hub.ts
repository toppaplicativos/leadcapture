export type AffiliateLinkType = 'catalog' | 'product' | 'short' | 'coupon'

export const LINK_TYPE_LABELS: Record<AffiliateLinkType, string> = {
  catalog: 'Catálogo',
  product: 'Produto',
  short: 'Link curto',
  coupon: 'Cupom',
}

export function formatConversionRate(rate: number): string {
  const pct = Math.max(0, Number(rate || 0)) * 100
  if (pct >= 10) return `${pct.toFixed(0)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  return pct > 0 ? `${pct.toFixed(2)}%` : '0%'
}

export function slugifyProductName(name: string, id?: string): string {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return slug || String(id || '').trim()
}

export function resolveProductSlug(product: { slug?: string | null; name: string; id: string }): string {
  const explicit = String(product.slug || '').trim()
  if (explicit) return explicit
  return slugifyProductName(product.name, product.id)
}