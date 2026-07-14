/**
 * Lightweight offline snapshot for stock app.
 * Stores last successful inventory payloads so the PWA can show data without network.
 */

const PREFIX = 'lead-system:stock-cache:'

type CacheKey = 'overview' | 'alerts' | 'products' | 'pending_orders'

function storageKey(key: CacheKey, brandId?: string) {
  return `${PREFIX}${brandId || 'default'}:${key}`
}

export function saveStockCache(key: CacheKey, data: unknown, brandId?: string) {
  try {
    const payload = {
      saved_at: new Date().toISOString(),
      data,
    }
    localStorage.setItem(storageKey(key, brandId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function loadStockCache<T = unknown>(
  key: CacheKey,
  brandId?: string,
): { saved_at: string; data: T } | null {
  try {
    const raw = localStorage.getItem(storageKey(key, brandId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as { saved_at: string; data: T }
  } catch {
    return null
  }
}

export function cacheAgeLabel(savedAt?: string): string | null {
  if (!savedAt) return null
  try {
    const ms = Date.now() - new Date(savedAt).getTime()
    if (ms < 60_000) return 'agora'
    const min = Math.floor(ms / 60_000)
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `há ${h}h`
    return `há ${Math.floor(h / 24)}d`
  } catch {
    return null
  }
}
