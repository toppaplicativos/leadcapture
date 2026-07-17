const AFFILIATE_TOKEN_KEY = 'lead-system-token-afiliado'
const AFFILIATE_BRAND_KEY = 'lead-system:active-brand-id-afiliado'
const AFFILIATE_BRAND_REF_KEY = 'lead-system:active-brand-ref-afiliado'

/** Rota da Central do Afiliado por marca (ex.: /central-afiliado/alhopronto/...). */
export function isAffiliateAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/central-afiliado')
}

/**
 * Contexto de sessão WhatsApp do afiliado — SOMENTE em rotas do afiliado/parceiros.
 *
 * NÃO usar só a presença de `lead-system-token-afiliado` no localStorage:
 * se o admin testou o app de afiliado no mesmo browser, o painel /whatsapp
 * da org passaria a listar só a sessão daquele afiliado (ex.: 1× "Atendimento").
 */
export function isAffiliateWhatsAppContext(): boolean {
  if (typeof window === 'undefined') return false
  if (isAffiliateAppRoute()) return true
  const path = window.location.pathname || ''
  // Painel do programa embutido em Parceiros
  if (path.startsWith('/parceiros/') && path.includes('/painel')) return true
  return false
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

/** Erro de API com status — callers podem decidir se limpam sessão. */
export class AffiliateApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'AffiliateApiError'
    this.status = status
    this.code = code
  }
}

export function isHardAffiliateAuthFailure(err: unknown): boolean {
  if (!(err instanceof AffiliateApiError)) return false
  if (err.status >= 500 || err.status === 0 || err.status === 408 || err.status === 429) return false
  if (err.status === 401) return true
  const code = String(err.code || '').toUpperCase()
  return code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || code === 'UNAUTHORIZED'
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
  if (!res.ok) {
    throw new AffiliateApiError(
      data.error || data.message || `Erro ${res.status}`,
      res.status,
      data.code,
    )
  }
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
  /** Galeria unificada por pastas: posts, produtos, marca, programa, campanhas… */
  materialsLibrary: (opts?: {
    region?: string
    programId?: string
    folder?: string
    type?: string
    q?: string
  }) => {
    const qs = new URLSearchParams()
    if (opts?.region) qs.set('region', opts.region)
    if (opts?.programId) qs.set('program_id', opts.programId)
    if (opts?.folder) qs.set('folder', opts.folder)
    if (opts?.type) qs.set('type', opts.type)
    if (opts?.q) qs.set('q', opts.q)
    const q = qs.toString() ? `?${qs}` : ''
    return affiliateFetch<{
      success: boolean
      folders: Array<{ slug: string; label: string; icon: string; count: number }>
      items: any[]
      total: number
      total_all: number
    }>(`/api/affiliate-app/materials/library${q}`)
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
  orders: () => affiliateFetch<any>('/api/affiliate-app/orders'),
  createOrder: (payload: {
    customer_name: string
    customer_phone: string
    customer_email?: string
    payment_method: string
    lead_id?: string
    items: Array<{ product_id: string; quantity: number }>
  }) => affiliateFetch<any>('/api/affiliate-app/orders', { method: 'POST', body: JSON.stringify(payload) }),
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
  assistOpportunity: (refType: string, refId: string, payload?: { intent?: string; instruction?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/assist`, {
      method: 'POST', body: JSON.stringify(payload || {}),
    }),
  progressOpportunity: (refType: string, refId: string, payload: { action: 'sent' | 'replied' | 'negotiating' | 'lost'; message?: string; note?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/progress`, {
      method: 'PATCH', body: JSON.stringify(payload),
    }),
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
  /** Registra aceite de termos do programa (elegibilidade Ao Vivo) */
  acceptDistributionTerms: (accepted = true) =>
    affiliateFetch<any>('/api/affiliate-app/distribution/accept-terms', {
      method: 'POST',
      body: JSON.stringify({ accepted, terms_accepted: accepted }),
    }),
  assistantControl: () => affiliateFetch<any>('/api/affiliate-app/assistant-control'),
  updateAssistantControl: (enabled: boolean) =>
    affiliateFetch<any>('/api/affiliate-app/assistant-control', {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
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
