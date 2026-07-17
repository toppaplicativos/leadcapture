/* ── Authenticated API helpers for admin/stock pages ── */

const ADMIN_TOKEN_KEY = 'lead-system-token'
const ADMIN_BRAND_KEY = 'lead-system:active-brand-id'
const STOCK_TOKEN_KEY = 'lead-system-token-estoque'
const STOCK_BRAND_KEY = 'lead-system:active-brand-id-estoque'
const STOCK_BRAND_REF_KEY = 'lead-system:active-brand-ref-estoque'

let authRedirecting = false

/**
 * Detects whether the current page is the stock-manager app.
 * When true, the inventoryApi calls are rewritten to /api/stock-app/* and
 * use the stock manager token instead of the admin token.
 */
function isStockAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/app-estoque')
}

function getAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (token) headers['Authorization'] = `Bearer ${token}`
  const brandId = localStorage.getItem(ADMIN_BRAND_KEY)
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

function getStockHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(STOCK_TOKEN_KEY)
  if (token) headers['Authorization'] = `Bearer ${token}`
  const brandId = localStorage.getItem(STOCK_BRAND_KEY)
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

/**
 * Returns admin or stock headers depending on the current route.
 * Used by inventoryApi so the same code path works for both admin and stock-manager users.
 */
function getInventoryHeaders(): Record<string, string> {
  return isStockAppRoute() ? getStockHeaders() : getAdminHeaders()
}

function isTokenAuthFailure(status: number, data: any, sentAuthHeader: boolean): boolean {
  // Nunca trate 5xx como logout — API reiniciando não pode apagar a sessão do PWA
  if (status >= 500 || status === 0 || status === 408 || status === 429) return false
  if (!sentAuthHeader) return false
  const code = String(data?.code || '').toUpperCase()
  const message = String(data?.error || data?.message || '').toLowerCase()
  return (
    status === 401 ||
    code === 'TOKEN_EXPIRED' ||
    code === 'TOKEN_INVALID' ||
    code === 'UNAUTHORIZED' ||
    message.includes('token inválido') ||
    message.includes('token invalido') ||
    message.includes('token expirado') ||
    message.includes('token expired') ||
    message.includes('invalid token')
  )
}

function clearAuthAndRedirect(url: string) {
  if (typeof window === 'undefined' || authRedirecting) return
  authRedirecting = true

  const stockScope = isStockAppRoute() || url.startsWith('/api/stock-app/')
  if (stockScope) {
    clearStockAuth()
    window.location.assign('/app-estoque')
    return
  }

  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_BRAND_KEY)
  window.location.assign('/login')
}

/**
 * Rewrites a /api/inventory/... or /api/clients/... or /api/categories URL into the
 * /api/stock-app/... equivalent when the user is in the stock-manager app context.
 * Returns the URL unchanged for admin users.
 */
function rewriteInventoryUrl(url: string): string {
  if (!isStockAppRoute()) return url
  if (url.startsWith('/api/inventory/')) return url.replace('/api/inventory/', '/api/stock-app/inventory/')
  if (url.startsWith('/api/clients/')) return url.replace('/api/clients/', '/api/stock-app/clients/')
  if (url === '/api/clients') return '/api/stock-app/clients'
  if (url.startsWith('/api/clients?')) return url.replace('/api/clients?', '/api/stock-app/clients?')
  if (url === '/api/categories') return '/api/stock-app/categories'
  return url
}

/* ── Generic authenticated fetch ── */
async function authFetch<T>(url: string, headers: Record<string, string>, options?: RequestInit): Promise<T> {
  const extra: Record<string, string> = {}
  try {
    const rid = sessionStorage.getItem('lead-system:last-request-id')
    if (rid) extra['X-Request-Id'] = rid
  } catch {
    /* ignore */
  }
  const mergedHeaders = {
    ...headers,
    ...extra,
    ...(options?.headers as Record<string, string> || {}),
  }
  const res = await fetch(url, {
    ...options,
    headers: mergedHeaders,
  })
  const data = await res.json().catch(() => ({}))
  const responseRequestId =
    res.headers.get('x-request-id') || (data as any)?.request_id || null
  if (responseRequestId) {
    try {
      sessionStorage.setItem('lead-system:last-request-id', String(responseRequestId))
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    if (isTokenAuthFailure(res.status, data, Boolean(mergedHeaders.Authorization))) {
      clearAuthAndRedirect(url)
    }
    const { ApiError, notifyEntitlementError } = await import('@/lib/api-errors')
    const err = new ApiError({
      status: res.status,
      code: (data as any)?.code || (data as any)?.error,
      message: (data as any)?.message || (data as any)?.error || `Erro ${res.status}`,
      requestId: responseRequestId,
      details: (data as any)?.details,
      raw: data,
    })
    notifyEntitlementError(err)
    throw err
  }
  return data
}

/**
 * Inventory-aware fetch: rewrites the URL and headers automatically based on whether
 * the user is on the admin or stock-manager route. All inventoryApi methods route through here.
 */
async function inventoryFetch<T>(url: string, options?: RequestInit): Promise<T> {
  return authFetch<T>(rewriteInventoryUrl(url), getInventoryHeaders(), options)
}

/* ══════════════════════════════════════════════
   INVENTORY API (admin - /api/inventory/*)
   ══════════════════════════════════════════════ */

export const inventoryApi = {
  overview: () => inventoryFetch<any>('/api/inventory/overview'),

  products: (page = 1, limit = 50, search = '', status = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (status) q.set('status', status)
    return inventoryFetch<any>(`/api/inventory/products?${q}`)
  },

  productDetail: (pid: string) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}`),

  productHistory: (pid: string, limit = 50) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}/history?limit=${limit}`),

  addStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}/add`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}/remove`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adjustStock: (pid: string, body: { new_quantity: number; reason: string }) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}/adjust`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateSettings: (pid: string, body: { stock_min?: number; cost_price?: number }) =>
    inventoryFetch<any>(`/api/inventory/products/${pid}/settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  movements: (page = 1, limit = 50, type = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (type) q.set('type', type)
    return inventoryFetch<any>(`/api/inventory/movements?${q}`)
  },

  expedition: (page = 1, limit = 50) =>
    inventoryFetch<any>(`/api/inventory/expedition?page=${page}&limit=${limit}`),

  expeditionPending: (limit = 50) =>
    inventoryFetch<any>(`/api/inventory/expedition/pending?limit=${limit}`),

  createExpedition: (orderId: string) =>
    inventoryFetch<any>('/api/inventory/expedition', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId }),
    }),

  alerts: () => inventoryFetch<any>('/api/inventory/alerts'),

  reports: (dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('date_from', dateFrom)
    if (dateTo) q.set('date_to', dateTo)
    return inventoryFetch<any>(`/api/inventory/reports?${q}`)
  },

  analytics: () => inventoryFetch<any>('/api/inventory/analytics'),

  sync: () => inventoryFetch<any>('/api/inventory/sync', { method: 'POST' }),

  /** Download stock CSV (admin or stock-app rewrite). Returns blob via raw fetch. */
  exportCsv: async () => {
    const url = rewriteInventoryUrl('/api/inventory/export')
    const headers = getInventoryHeaders()
    // CSV response is not JSON
    const res = await fetch(url, { headers: { Authorization: headers.Authorization || '', 'x-brand-id': headers['x-brand-id'] || '' } })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as any)?.error || `Erro ${res.status} ao exportar`)
    }
    return res.blob()
  },

  categories: () => inventoryFetch<any>('/api/categories'),

  /* ── Clients ── */
  clients: (page = 1, limit = 50, search = '', status = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (status) q.set('status', status)
    return inventoryFetch<any>(`/api/clients?${q}`)
  },

  getClient: (id: string) =>
    inventoryFetch<any>(`/api/clients/${id}`),

  createClient: (data: Record<string, any>) =>
    inventoryFetch<any>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateClient: (id: string, data: Record<string, any>) =>
    inventoryFetch<any>(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateClientStatus: (id: string, status: string) =>
    inventoryFetch<any>(`/api/clients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteClient: (id: string) =>
    inventoryFetch<any>(`/api/clients/${id}`, {
      method: 'DELETE',
    }),

  realClients: async (page = 1, limit = 50, search = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search.trim()) q.set('search', search.trim())
    const data = await inventoryFetch<any>(`/api/clients/real?${q.toString()}`)
    return {
      ...data,
      clients: data.clients || data.customers || [],
      total: data.total || data.clients?.length || 0,
    }
  },
}

/* ══════════════════════════════════════════════
   STOCK APP API (/api/stock-app/*)
   ══════════════════════════════════════════════ */

export const stockApi = {
  login: (email: string, password: string, brand: string) =>
    authFetch<any>('/api/auth/stock-login', { 'Content-Type': 'application/json' }, {
      method: 'POST',
      body: JSON.stringify({ email, password, brand }),
    }),

  validateBrand: (brandRef: string) =>
    authFetch<any>(`/api/auth/stock-brand?brand=${encodeURIComponent(brandRef)}`, {
      'Content-Type': 'application/json',
    }),

  me: () => authFetch<any>('/api/stock-app/me', getStockHeaders()),

  overview: () => authFetch<any>('/api/stock-app/inventory/overview', getStockHeaders()),

  alerts: () => authFetch<any>('/api/stock-app/inventory/alerts', getStockHeaders()),

  movements: (page = 1, limit = 10, type = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (type) q.set('type', type)
    return authFetch<any>(`/api/stock-app/inventory/movements?${q}`, getStockHeaders())
  },

  productMovements: (pid: string) =>
    authFetch<any>(`/api/stock-app/inventory/movements/${pid}`, getStockHeaders()),

  products: (limit = 200) =>
    authFetch<any>(`/api/stock-app/inventory/stock?limit=${limit}`, getStockHeaders()),

  analytics: () => authFetch<any>('/api/stock-app/inventory/analytics', getStockHeaders()),

  addStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    authFetch<any>(`/api/stock-app/inventory/stock/${pid}/add`, getStockHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    authFetch<any>(`/api/stock-app/inventory/stock/${pid}/remove`, getStockHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adjustStock: (pid: string, body: { new_quantity: number; reason: string }) =>
    authFetch<any>(`/api/stock-app/inventory/stock/${pid}/adjust`, getStockHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sync: () => authFetch<any>('/api/stock-app/inventory/sync', getStockHeaders(), { method: 'POST' }),

  /* ── Clients ── */
  clients: (page = 1, limit = 50, search = '', status = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (status) q.set('status', status)
    return authFetch<any>(`/api/stock-app/clients?${q}`, getStockHeaders())
  },

  getClient: (id: string) =>
    authFetch<any>(`/api/stock-app/clients/${id}`, getStockHeaders()),

  createClient: (data: Record<string, any>) =>
    authFetch<any>('/api/stock-app/clients', getStockHeaders(), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateClient: (id: string, data: Record<string, any>) =>
    authFetch<any>(`/api/stock-app/clients/${id}`, getStockHeaders(), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateClientStatus: (id: string, status: string) =>
    authFetch<any>(`/api/stock-app/clients/${id}/status`, getStockHeaders(), {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteClient: (id: string) =>
    authFetch<any>(`/api/stock-app/clients/${id}`, getStockHeaders(), {
      method: 'DELETE',
    }),
}

/* ── Stock auth helpers ── */
export function getStockToken(): string | null {
  return localStorage.getItem(STOCK_TOKEN_KEY)
}

export function setStockAuth(token: string, brandId: string, brandRef: string) {
  localStorage.setItem(STOCK_TOKEN_KEY, token)
  localStorage.setItem(STOCK_BRAND_KEY, brandId)
  localStorage.setItem(STOCK_BRAND_REF_KEY, brandRef)
}

export function clearStockAuth() {
  localStorage.removeItem(STOCK_TOKEN_KEY)
  localStorage.removeItem(STOCK_BRAND_KEY)
  localStorage.removeItem(STOCK_BRAND_REF_KEY)
}

export function getStockBrandRef(): string | null {
  return localStorage.getItem(STOCK_BRAND_REF_KEY)
}

/* ── Onboarding API (public) ── */
export function submitOnboarding(data: Record<string, unknown>) {
  return authFetch<any>('/api/public/brand-onboarding', { 'Content-Type': 'application/json' }, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export type AdminIntegrationProvider = 'openai' | 'gemini' | 'grok' | 'rapidapi' | 'google_places' | 'runway'

export interface AdminIntegrationSnapshot {
  provider: AdminIntegrationProvider
  source: 'database' | 'env' | 'empty'
  account_id: string
  has_key: boolean
  masked_key: string | null
  is_active: boolean
  priority: number
  config: Record<string, unknown>
  updated_at?: string
  env_fallback_available: boolean
}

export interface AdminIntegrationLogEntry {
  id: string
  account_id: string
  provider: AdminIntegrationProvider
  status: 'success' | 'error'
  message: string
  metadata_json?: Record<string, unknown> | null
  created_at?: string
}

/* ══════════════════════════════════════════════
   SMART LEAD IMPORT — shared DTOs
   ══════════════════════════════════════════════ */

export interface ParsedLeadDTO {
  index: number
  name: string
  phone: string | null
  email: string | null
  company?: string | null
  city?: string | null
  state?: string | null
  interest?: string | null
  notes?: string | null
  temperature?: 'frio' | 'morno' | 'quente' | null
  tags: string[]
  warnings: string[]
  duplicateOf?: { id: string; name: string; phone?: string | null } | null
  raw?: Record<string, any>
}

export interface ImportPreviewDTO {
  mode: string
  leads: ParsedLeadDTO[]
  stats: {
    total: number
    newLeads: number
    duplicates: number
    withoutPhone: number
    withInterest: number
  }
  pipelineWarnings: string[]
  sourceTag: string
}

/* ══════════════════════════════════════════════
   ADMIN API (dashboard/admin shell)
   ══════════════════════════════════════════════ */

export const adminApi = {
  campaigns: () => authFetch<any>('/api/campaigns-v2', getAdminHeaders()),

  createCampaign: (body: Record<string, unknown>) =>
    authFetch<any>('/api/campaigns-v2', getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateCampaign: (campaignId: string, body: Record<string, unknown>) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}`, getAdminHeaders(), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  startCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}/start`, getAdminHeaders(), {
      method: 'POST',
    }),

  pauseCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}/pause`, getAdminHeaders(), {
      method: 'POST',
    }),

  cancelCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}/cancel`, getAdminHeaders(), {
      method: 'POST',
    }),

  deleteCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}`, getAdminHeaders(), {
      method: 'DELETE',
    }),

  duplicateCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}/duplicate`, getAdminHeaders(), {
      method: 'POST',
    }),

  reexecuteCampaign: (campaignId: string) =>
    authFetch<any>(`/api/campaigns-v2/${campaignId}/re-execute`, getAdminHeaders(), {
      method: 'POST',
    }),

  createFollowupRuler: () =>
    authFetch<{
      success: boolean
      created: Array<{ id: string; name: string; framework: string; delayDays: number }>
      skipped: Array<{ id: string; name: string; framework: string; delayDays: number }>
      errors: Array<{ name: string; error: string }>
      message: string
    }>('/api/campaigns-v2/followup-ruler', getAdminHeaders(), {
      method: 'POST',
    }),

  /* ── Smart Lead Import ── */
  smartImportParse: (body: {
    mode: 'text' | 'file' | 'image'
    payload: string
    mimeType?: string
    fileName?: string
  }) =>
    authFetch<{ success: boolean; preview: ImportPreviewDTO }>('/api/lead-import/parse', getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  smartImportConfirm: (leads: ParsedLeadDTO[], skipDuplicates = true) =>
    authFetch<{
      success: boolean
      imported: number
      total: number
      skipped: number
      errors: Array<{ name: string; error: string }>
    }>('/api/lead-import/confirm', getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify({ leads, skipDuplicates }),
    }),

  /* ── AI auto-reply diagnostics ── */
  aiDiagnostics: (conversationId?: string) => {
    const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
    return authFetch<{
      success: boolean
      brand_id: string
      verdict: { ok: boolean; summary: string }
      gates: Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string }>
      conversation: any
      global_state: any
    }>(`/api/inbox/ai-diagnostics${qs}`, getAdminHeaders())
  },

  realClients: async (page = 1, limit = 50, search = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search.trim()) q.set('search', search.trim())
    const data = await authFetch<any>(`/api/clients/real?${q.toString()}`, getAdminHeaders())
    return {
      ...data,
      clients: data.clients || data.customers || [],
      total: data.total || data.clients?.length || 0,
    }
  },

  customerStats: async () => {
    const data = await authFetch<any>('/api/customers/stats', getAdminHeaders())
    return data.stats || data
  },

  clients: async (page = 1, limit = 30, search = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search.trim()) q.set('search', search.trim())
    const data = await authFetch<any>(`/api/customers?${q.toString()}`, getAdminHeaders())
    return {
      ...data,
      clients: data.clients || data.customers || [],
      total: data.total || data.customers?.length || data.clients?.length || 0,
    }
  },

  orders: async (page = 1, limit = 50, search = '') => {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(Math.max(0, (page - 1) * limit)),
    })
    if (search.trim()) q.set('customer', search.trim())
    const data = await authFetch<any>(`/api/orders?${q.toString()}`, getAdminHeaders())
    return {
      ...data,
      total: data.total || data.orders?.length || 0,
    }
  },

  orderAnalytics: () =>
    authFetch<any>('/api/orders/oms/analytics', getAdminHeaders()),

  affiliateStats: () =>
    authFetch<any>('/api/affiliates/stats', getAdminHeaders()),

  updateAutomationRule: (ruleCode: string, body: Record<string, unknown>) =>
    authFetch<any>(`/api/automations/${ruleCode}`, getAdminHeaders(), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}

/* ══════════════════════════════════════════════
   INTEGRATIONS API (/api/integrations/*)
   ══════════════════════════════════════════════ */

export const integrationApi = {
  listProviders: () => authFetch<{ success: boolean; providers: AdminIntegrationSnapshot[] }>('/api/integrations/providers', getAdminHeaders()),

  getProvider: (provider: AdminIntegrationProvider) =>
    authFetch<{ success: boolean; provider: AdminIntegrationSnapshot }>(`/api/integrations/${provider}`, getAdminHeaders()),

  saveProvider: (
    provider: AdminIntegrationProvider,
    body: { key?: string; config?: Record<string, unknown>; is_active?: boolean; priority?: number },
  ) => authFetch<{ success: boolean; provider: AdminIntegrationSnapshot }>(`/api/integrations/${provider}`, getAdminHeaders(), {
    method: 'PUT',
    body: JSON.stringify(body),
  }),

  testProvider: (
    provider: AdminIntegrationProvider,
    body?: { key?: string; config?: Record<string, unknown> },
  ) => fetch(`/api/integrations/${provider}/test`, {
    method: 'POST',
    headers: getAdminHeaders(),
    body: JSON.stringify(body || {}),
  }).then(async (res) => {
    const data = await res.json()
    if (data?.result) return data.result
    if (!res.ok) throw new Error(data.error || data.message || `Erro ${res.status}`)
    return data
  }),

  logs: (provider?: AdminIntegrationProvider, limit = 40) => {
    const q = new URLSearchParams({ limit: String(limit) })
    if (provider) q.set('provider', provider)
    return authFetch<{ success: boolean; logs: AdminIntegrationLogEntry[] }>(`/api/integrations/logs?${q.toString()}`, getAdminHeaders())
  },
}
