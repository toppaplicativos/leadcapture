const AFFILIATE_BRAND_NAME_KEY = 'lead-system:affiliate-brand-name'
const AFFILIATE_BRAND_LOGO_KEY = 'lead-system:affiliate-brand-logo'

export function cacheAffiliateBrandMeta(name?: string, logoUrl?: string | null): void {
  try {
    if (name?.trim()) {
      localStorage.setItem(AFFILIATE_BRAND_NAME_KEY, name.trim())
    } else {
      localStorage.removeItem(AFFILIATE_BRAND_NAME_KEY)
    }
    if (logoUrl?.trim()) {
      localStorage.setItem(AFFILIATE_BRAND_LOGO_KEY, logoUrl.trim())
    } else {
      localStorage.removeItem(AFFILIATE_BRAND_LOGO_KEY)
    }
  } catch { /* ignore */ }
}

export function getAffiliateBrandMeta(): { name: string | null; logoUrl: string | null } {
  try {
    return {
      name: localStorage.getItem(AFFILIATE_BRAND_NAME_KEY)?.trim() || null,
      logoUrl: localStorage.getItem(AFFILIATE_BRAND_LOGO_KEY)?.trim() || null,
    }
  } catch {
    return { name: null, logoUrl: null }
  }
}

export function clearAffiliateBrandMeta(): void {
  try {
    localStorage.removeItem(AFFILIATE_BRAND_NAME_KEY)
    localStorage.removeItem(AFFILIATE_BRAND_LOGO_KEY)
  } catch { /* ignore */ }
}

export function applyAffiliatePwaTitle(brandName: string): void {
  if (typeof document === 'undefined') return
  const name = brandName.trim()
  if (!name) return
  const pwaTitle = document.getElementById('pwa-app-title')
  if (pwaTitle) pwaTitle.setAttribute('content', name.slice(0, 12))
}