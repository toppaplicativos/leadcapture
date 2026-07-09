const AFFILIATE_TOKEN_KEY = 'lead-system-token-afiliado'
const AFFILIATE_BRAND_KEY = 'lead-system:active-brand-id-afiliado'
const AFFILIATE_BRAND_REF_KEY = 'lead-system:active-brand-ref-afiliado'

export function isAffiliateAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/central-afiliado')
}

export function getAffiliateToken(): string | null {
  return localStorage.getItem(AFFILIATE_TOKEN_KEY)
}

export function getAffiliateBrandRef(): string | null {
  return localStorage.getItem(AFFILIATE_BRAND_REF_KEY)
}

export function setAffiliateAuth(token: string, brandId: string, brandRef: string) {
  localStorage.setItem(AFFILIATE_TOKEN_KEY, token)
  localStorage.setItem(AFFILIATE_BRAND_KEY, brandId)
  localStorage.setItem(AFFILIATE_BRAND_REF_KEY, brandRef)
}

export function clearAffiliateAuth() {
  localStorage.removeItem(AFFILIATE_TOKEN_KEY)
  localStorage.removeItem(AFFILIATE_BRAND_KEY)
  localStorage.removeItem(AFFILIATE_BRAND_REF_KEY)
  import('@/lib/affiliate-app-cache').then((m) => m.affiliateAppCache.clear()).catch(() => {})
  import('@/lib/affiliate-brand-meta').then((m) => m.clearAffiliateBrandMeta()).catch(() => {})
}

export function getAffiliateHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAffiliateToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const brandId = localStorage.getItem(AFFILIATE_BRAND_KEY)
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

async function affiliateFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getAffiliateHeaders(),
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data as T
}

export const affiliateApi = {
  login: (email: string, password: string, brand: string) =>
    affiliateFetch<any>('/api/auth/affiliate-login', {
      method: 'POST',
      body: JSON.stringify({ email, password, brand }),
    }),

  register: (payload: {
    name: string
    email: string
    password: string
    brand: string
    phone?: string
    region?: string
    code?: string
  }) =>
    affiliateFetch<any>('/api/auth/affiliate-register', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        brand: payload.brand,
        phone: payload.phone,
        region: payload.region,
        code: payload.code,
      }),
    }),

  validateBrand: (brandRef: string) =>
    fetch(`/api/auth/affiliate-brand?brand=${encodeURIComponent(brandRef)}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Erro ${r.status}`)
      return data
    }),

  me: () => affiliateFetch<any>('/api/affiliate-app/me'),
  dashboard: () => affiliateFetch<any>('/api/affiliate-app/dashboard'),
  sales: (page = 1, limit = 50, programId?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (programId) qs.set('program_id', programId)
    return affiliateFetch<any>(`/api/affiliate-app/sales?${qs}`)
  },
  commissions: () => affiliateFetch<any>('/api/affiliate-app/commissions'),
  paymentSettings: () => affiliateFetch<any>('/api/affiliate-app/payment-settings'),
  updatePaymentSettings: (payload: { pix_key: string }) =>
    affiliateFetch<any>('/api/affiliate-app/payment-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  requestPayout: (amount: number, pixKey: string) =>
    affiliateFetch<any>('/api/affiliate-app/payouts', {
      method: 'POST',
      body: JSON.stringify({ amount, pix_key: pixKey }),
    }),
  materials: (region?: string, programId?: string) => {
    const qs = new URLSearchParams()
    if (region) qs.set('region', region)
    if (programId) qs.set('program_id', programId)
    const q = qs.toString() ? `?${qs}` : ''
    return affiliateFetch<any>(`/api/affiliate-app/materials${q}`)
  },
  generateMaterialCaption: (materialId: string, payload: { purpose: string }) =>
    affiliateFetch<{ success: boolean; caption: string; purpose: string }>(
      `/api/affiliate-app/materials/${encodeURIComponent(materialId)}/generate-caption`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  programEnrollments: () =>
    affiliateFetch<{ success: boolean; enrollments: any[] }>('/api/affiliate-app/programs/enrollments'),
  marketplace: () => affiliateFetch<{ success: boolean; opportunities: any[] }>('/api/affiliate-app/programs/marketplace'),
  applyProgram: (programId: string, note?: string) =>
    affiliateFetch<any>(`/api/affiliate-app/programs/${encodeURIComponent(programId)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  onboarding: (enrollmentId: string) =>
    affiliateFetch<any>(`/api/affiliate-app/programs/enrollments/${encodeURIComponent(enrollmentId)}/onboarding`),
  completeOnboardingItem: (enrollmentId: string, payload: { item_type: 'step' | 'training'; item_id: string; payload?: Record<string, unknown> }) =>
    affiliateFetch<any>(`/api/affiliate-app/programs/enrollments/${encodeURIComponent(enrollmentId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateSharePack: (payload: {
    kit: string
    destination: string
    product_id?: string
    material_id?: string
  }) =>
    affiliateFetch<{ success: boolean; pack: {
      seo_title: string
      headline: string
      subtitle: string
      body: string
      hashtags: string[]
      cta: string
      full_text: string
    } }>(
      '/api/affiliate-app/share/generate',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateProfile: (payload: Record<string, unknown>) =>
    affiliateFetch<any>('/api/affiliate-app/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  training: () => affiliateFetch<any>('/api/affiliate-app/training'),
  learning: () => affiliateFetch<any>('/api/affiliate-app/learning'),
  products: () => affiliateFetch<any>('/api/affiliate-app/products'),
  links: (days = 30, programId?: string) => {
    const qs = new URLSearchParams({ days: String(days) })
    if (programId) qs.set('program_id', programId)
    return affiliateFetch<any>(`/api/affiliate-app/links?${qs}`)
  },
  linkAnalytics: (days = 30, programId?: string) => {
    const qs = new URLSearchParams({ days: String(days) })
    if (programId) qs.set('program_id', programId)
    return affiliateFetch<any>(`/api/affiliate-app/links/analytics?${qs}`)
  },
  productGuide: (productId: string) =>
    affiliateFetch<any>(`/api/affiliate-app/products/${encodeURIComponent(productId)}/guide`),
  content: (region?: string, channel?: string) => {
    const qs = new URLSearchParams()
    if (region) qs.set('region', region)
    if (channel) qs.set('channel', channel)
    const q = qs.toString() ? `?${qs}` : ''
    return affiliateFetch<any>(`/api/affiliate-app/content${q}`)
  },

  instances: async () => {
    const d = await affiliateFetch<any>('/api/instances')
    return Array.isArray(d) ? d : (d?.instances || [])
  },
  createInstance: async (name: string) => {
    const d = await affiliateFetch<any>('/api/instances', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    return { ...d, id: d.id || d.instance?.id }
  },
  deleteInstance: (id: string) =>
    affiliateFetch<any>(`/api/instances/${id}`, { method: 'DELETE' }),

  opportunities: (segment = 'all', page = 1, limit = 50) => {
    const qs = new URLSearchParams({ segment, page: String(page), limit: String(limit) })
    return affiliateFetch<any>(`/api/affiliate-app/opportunities?${qs}`)
  },
  customers: (page = 1, limit = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (status) qs.set('status', status)
    return affiliateFetch<any>(`/api/affiliate-app/customers?${qs}`)
  },
  leads: (page = 1, limit = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (status) qs.set('status', status)
    return affiliateFetch<any>(`/api/affiliate-app/leads?${qs}`)
  },
  updateLead: (leadId: string, payload: { status?: string; notes?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/leads/${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  distributionStatus: () => affiliateFetch<any>('/api/affiliate-app/distribution/status'),
  distributionAssignments: () => affiliateFetch<any>('/api/affiliate-app/distribution/assignments'),
  distributionAlerts: () => affiliateFetch<any>('/api/affiliate-app/distribution/alerts'),
  convertDistributionAssignment: (assignmentId: string, body?: { order_id?: string; order_total?: number; notes?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/distribution/assignments/${encodeURIComponent(assignmentId)}/convert`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  markDistributionAlertRead: (alertId: string) =>
    affiliateFetch<any>(`/api/affiliate-app/distribution/alerts/${encodeURIComponent(alertId)}/read`, {
      method: 'POST',
    }),
}