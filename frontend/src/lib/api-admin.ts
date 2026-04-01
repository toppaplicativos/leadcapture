/* ── Authenticated API helpers for admin/stock pages ── */

const ADMIN_TOKEN_KEY = 'lead-system-token'
const ADMIN_BRAND_KEY = 'lead-system:active-brand-id'
const STOCK_TOKEN_KEY = 'lead-system-token-estoque'
const STOCK_BRAND_KEY = 'lead-system:active-brand-id-estoque'
const STOCK_BRAND_REF_KEY = 'lead-system:active-brand-ref-estoque'

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

/* ── Generic authenticated fetch ── */
async function authFetch<T>(url: string, headers: Record<string, string>, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || `Erro ${res.status}`)
  return data
}

/* ══════════════════════════════════════════════
   INVENTORY API (admin - /api/inventory/*)
   ══════════════════════════════════════════════ */

export const inventoryApi = {
  overview: () => authFetch<any>('/api/inventory/overview', getAdminHeaders()),

  products: (page = 1, limit = 50, search = '', status = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (status) q.set('status', status)
    return authFetch<any>(`/api/inventory/products?${q}`, getAdminHeaders())
  },

  productDetail: (pid: string) =>
    authFetch<any>(`/api/inventory/products/${pid}`, getAdminHeaders()),

  productHistory: (pid: string, limit = 50) =>
    authFetch<any>(`/api/inventory/products/${pid}/history?limit=${limit}`, getAdminHeaders()),

  addStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    authFetch<any>(`/api/inventory/products/${pid}/add`, getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeStock: (pid: string, body: { quantity: number; source?: string; reason?: string }) =>
    authFetch<any>(`/api/inventory/products/${pid}/remove`, getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adjustStock: (pid: string, body: { new_quantity: number; reason: string }) =>
    authFetch<any>(`/api/inventory/products/${pid}/adjust`, getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateSettings: (pid: string, body: { stock_min?: number; cost_price?: number }) =>
    authFetch<any>(`/api/inventory/products/${pid}/settings`, getAdminHeaders(), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  movements: (page = 1, limit = 50, type = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (type) q.set('type', type)
    return authFetch<any>(`/api/inventory/movements?${q}`, getAdminHeaders())
  },

  expedition: (page = 1, limit = 50) =>
    authFetch<any>(`/api/inventory/expedition?page=${page}&limit=${limit}`, getAdminHeaders()),

  createExpedition: (orderId: string) =>
    authFetch<any>('/api/inventory/expedition', getAdminHeaders(), {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId }),
    }),

  alerts: () => authFetch<any>('/api/inventory/alerts', getAdminHeaders()),

  reports: (dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('date_from', dateFrom)
    if (dateTo) q.set('date_to', dateTo)
    return authFetch<any>(`/api/inventory/reports?${q}`, getAdminHeaders())
  },

  analytics: () => authFetch<any>('/api/inventory/analytics', getAdminHeaders()),

  sync: () => authFetch<any>('/api/inventory/sync', getAdminHeaders(), { method: 'POST' }),

  categories: () => authFetch<any>('/api/categories', getAdminHeaders()),
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

/* ══════════════════════════════════════════════
   ADMIN PANEL APIs (clients, inbox, campaigns, orders)
   ══════════════════════════════════════════════ */

export const adminApi = {
  // Clients/Leads
  clients: (page = 1, limit = 50, search = '') => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    return authFetch<any>(`/api/clients?${q}`, getAdminHeaders())
  },
  clientDetail: (id: string) => authFetch<any>(`/api/clients/${id}`, getAdminHeaders()),

  // Inbox
  inbox: (page = 1, limit = 50) =>
    authFetch<any>(`/api/inbox?page=${page}&limit=${limit}`, getAdminHeaders()),

  // Campaigns
  campaigns: () => authFetch<any>('/api/campaigns', getAdminHeaders()),
  campaignDetail: (id: string) => authFetch<any>(`/api/campaigns/${id}`, getAdminHeaders()),

  // Orders
  orders: (page = 1, limit = 50) =>
    authFetch<any>(`/api/orders?page=${page}&limit=${limit}`, getAdminHeaders()),

  // Products (commerce)
  products: () => authFetch<any>('/api/products', getAdminHeaders()),
}

/* ── Onboarding API (public) ── */
export function submitOnboarding(data: Record<string, unknown>) {
  return authFetch<any>('/api/public/brand-onboarding', { 'Content-Type': 'application/json' }, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
