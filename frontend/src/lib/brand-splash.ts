const BRAND_NAME_KEY = 'lead-system:active-brand-name'
const BRAND_LOGO_KEY = 'lead-system:active-brand-logo'

export type CachedActiveBrand = {
  name: string
  logoUrl: string | null
}

export function cacheActiveBrand(name?: string, logoUrl?: string | null): void {
  try {
    if (name?.trim()) {
      localStorage.setItem(BRAND_NAME_KEY, name.trim())
    } else {
      localStorage.removeItem(BRAND_NAME_KEY)
    }
    if (logoUrl?.trim()) {
      localStorage.setItem(BRAND_LOGO_KEY, logoUrl.trim())
    } else {
      localStorage.removeItem(BRAND_LOGO_KEY)
    }
  } catch { /* ignore */ }
}

export function getCachedActiveBrand(): CachedActiveBrand {
  try {
    const name = localStorage.getItem(BRAND_NAME_KEY)?.trim()
    const logoUrl = localStorage.getItem(BRAND_LOGO_KEY)?.trim() || null
    return { name: name || 'LeadCapture', logoUrl }
  } catch {
    return { name: 'LeadCapture', logoUrl: null }
  }
}

export function clearCachedActiveBrand(): void {
  try {
    localStorage.removeItem(BRAND_NAME_KEY)
    localStorage.removeItem(BRAND_LOGO_KEY)
  } catch { /* ignore */ }
}