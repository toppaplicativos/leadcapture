import { getStockBrandRef } from '@/lib/api-admin'

export function isStockAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/app-estoque')
}

export function getSessionAuth() {
  if (isStockAppRoute()) {
    return {
      scope: 'stock' as const,
      token: localStorage.getItem('lead-system-token-estoque'),
      brandId: localStorage.getItem('lead-system:active-brand-id-estoque') || '',
      brandRef:
        localStorage.getItem('lead-system:active-brand-ref-estoque') ||
        getStockBrandRef() ||
        '',
    }
  }
  return {
    scope: 'admin' as const,
    token: localStorage.getItem('lead-system-token'),
    brandId: localStorage.getItem('lead-system:active-brand-id') || '',
    brandRef: '',
  }
}

export function getSessionHeaders(): Record<string, string> {
  const auth = getSessionAuth()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  if (auth.brandId) headers['x-brand-id'] = auth.brandId
  return headers
}
