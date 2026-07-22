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

type AffiliateFetchOptions = RequestInit & {
  /** Timeout em ms (default 28s). Abort → AffiliateApiError 408. */
  timeoutMs?: number
  /** Tentativas extras em falha de rede/timeout (default 0). */
  retries?: number
}

async function affiliateFetch<T>(url: string, options?: AffiliateFetchOptions): Promise<T> {
  const timeoutMs = Math.max(3000, Number(options?.timeoutMs) || 28_000)
  const retries = Math.max(0, Math.min(2, Number(options?.retries) || 0))
  const { timeoutMs: _t, retries: _r, signal: userSignal, ...rest } = options || {}

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const onUserAbort = () => controller.abort()
    if (userSignal) {
      if (userSignal.aborted) controller.abort()
      else userSignal.addEventListener('abort', onUserAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          ...getAffiliateHeaders(),
          ...(rest.headers as Record<string, string> || {}),
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
    } catch (e: any) {
      lastErr = e
      if (e instanceof AffiliateApiError) {
        /* 5xx retriable; 4xx not */
        if (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e
      }
      const aborted = e?.name === 'AbortError' || controller.signal.aborted
      if (aborted && userSignal?.aborted) {
        throw new AffiliateApiError('Requisição cancelada', 0)
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 + attempt * 400))
        continue
      }
      if (aborted) {
        throw new AffiliateApiError('Tempo esgotado — tente de novo', 408)
      }
      const msg = String(e?.message || '')
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        throw new AffiliateApiError('Sem conexão com o servidor. Verifique a rede e tente de novo.', 0)
      }
      throw e instanceof Error ? e : new AffiliateApiError(msg || 'Falha de rede', 0)
    } finally {
      clearTimeout(timer)
      userSignal?.removeEventListener('abort', onUserAbort)
    }
  }
  throw lastErr instanceof Error ? lastErr : new AffiliateApiError('Falha de rede', 0)
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
  }) =>
    affiliateFetch<any>('/api/auth/affiliate-register', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        brand: payload.brand,
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
  updatePassword: (payload: { current_password: string; new_password: string }) =>
    affiliateFetch<{ success: boolean }>('/api/affiliate-app/profile/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData()
    fd.append('avatar', file)
    const headers: Record<string, string> = {}
    const token = getAffiliateToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const brandId = localStorage.getItem(AFFILIATE_BRAND_KEY)
    if (brandId) headers['x-brand-id'] = brandId
    // Não setar Content-Type — o browser define boundary do multipart
    const res = await fetch('/api/affiliate-app/profile/avatar', {
      method: 'POST',
      headers,
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new AffiliateApiError(
        data.error || data.message || `Erro ${res.status}`,
        res.status,
        data.code,
      )
    }
    return data as { success: boolean; avatar_url?: string; affiliate?: any }
  },
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

  opportunities: (
    segment = 'all',
    page = 1,
    limit = 300,
    opts?: { includeClosed?: boolean; timeoutMs?: number },
  ) => {
    const qs = new URLSearchParams({
      segment,
      page: String(page),
      limit: String(Math.min(Math.max(limit, 1), 500)),
    })
    if (opts?.includeClosed === false) qs.set('include_closed', '0')
    if (opts?.includeClosed === true) qs.set('include_closed', '1')
    return affiliateFetch<any>(`/api/affiliate-app/opportunities?${qs}`, {
      timeoutMs: opts?.timeoutMs ?? 28_000,
      retries: 1,
    })
  },
  attendanceDigest: () =>
    affiliateFetch<{
      success: boolean
      inbox: number
      followup_due: number
      contacted: number
      engaged: number
      total_open: number
      claimed_today: number
      claimed_week: number
      sent_today: number
      closed_today: number
      replied_today: number
      response_rate_today: number | null
      needs_attention: number
    }>('/api/affiliate-app/opportunities/digest', { timeoutMs: 18_000, retries: 1 }),
  opportunityActivity: (limit = 60) =>
    affiliateFetch<{
      success: boolean
      activities: Array<{
        id: string
        ref_type: string
        ref_id: string
        contact_name: string
        phone?: string | null
        contact_status?: string | null
        contact_exists?: boolean
        contact_removed?: boolean
        contact_archived?: boolean
        action: string
        label: string
        message?: string | null
        note?: string | null
        at: string | null
      }>
    }>(`/api/affiliate-app/opportunities/activity?limit=${Math.min(Math.max(limit, 1), 100)}`, {
      timeoutMs: 15_000,
      retries: 1,
    }),
  opportunitiesPool: (limit = 80) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/pool?limit=${Math.min(Math.max(limit, 1), 150)}`),
  claimOpportunity: (queueId: string) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/pool/${encodeURIComponent(queueId)}/claim`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  assistOpportunity: (refType: string, refId: string, payload?: { intent?: string; instruction?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/assist`, {
      method: 'POST', body: JSON.stringify(payload || {}),
    }),

  /** Pacote OG + mensagem (catálogo / produto / short) */
  sharePack: (opts?: { kind?: 'catalog' | 'product' | 'short'; product_id?: string; program_id?: string }) => {
    const qs = new URLSearchParams()
    if (opts?.kind) qs.set('kind', opts.kind)
    if (opts?.product_id) qs.set('product_id', opts.product_id)
    if (opts?.program_id) qs.set('program_id', opts.program_id)
    const q = qs.toString() ? `?${qs}` : ''
    return affiliateFetch<{ success: boolean; pack: import('@/lib/affiliates/share-pack').AffiliateSharePack }>(
      `/api/affiliate-app/share-pack${q}`,
      { timeoutMs: 20_000, retries: 1 },
    )
  },

  /**
   * Copiloto de Atendimento — texto e/ou print → resposta treinada da marca + produtos.
   */
  attendanceAssist: (payload: {
    conversation?: string
    instruction?: string
    product_id?: string
    image?: { base64: string; mimeType: string }
  }) =>
    affiliateFetch<{
      success: boolean
      reply: string
      customer_question_summary?: string
      notes_for_affiliate?: string
      extracted_text?: string | null
      products: Array<{
        id: string
        name: string
        slug?: string | null
        price: number
        promo_price?: number | null
        image_url?: string | null
        category?: string | null
        unit?: string | null
        has_guide?: boolean
        reason?: string | null
      }>
      training_used?: boolean
      knowledge_used?: boolean
      catalog_used?: boolean
      provider?: string
      affiliate?: { code?: string; coupon_code?: string }
    }>('/api/affiliate-app/attendance/assist', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
      timeoutMs: 90_000,
      retries: 0,
    }),
  progressOpportunity: (
    refType: string,
    refId: string,
    payload: {
      action:
        | 'sent'
        | 'replied'
        | 'negotiating'
        | 'auto_reply'
        | 'lost'
        | 'dismiss'
        | 'channel_unavailable'
        | 'not_matching'
        | 'no_answer'
        | 'waiting'
        | 'followup'
        | 'note'
        | 'called'
        | 'voicemail'
        | 'busy'
        | 'callback_requested'
      /** Canal da tentativa: whatsapp | phone | note */
      channel?: 'whatsapp' | 'phone' | 'note' | 'system'
      /** Duração da ligação em segundos (opcional) */
      duration_sec?: number
      message?: string
      note?: string
      reason?: string
      /** Override de dias para "Lembrar depois" */
      followup_days?: number
      /** ID da tarefa de cadência sendo executada (conclui como done) */
      task_id?: string
    },
  ) =>
    affiliateFetch<{
      success: boolean
      action: string
      channel?: string
      removed_from_queue?: boolean
      phase?: string
      instruction?: string
      toast?: string
      template_id?: string | null
      duplicate_skipped?: boolean
      next_task?: {
        id: string
        task_type: string
        due_at: string
        instruction?: string | null
        template_id?: string | null
        is_due?: boolean
      } | null
    }>(`/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/progress`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      timeoutMs: 20_000,
      retries: 1,
    }),

  updateOpportunityContact: (
    refType: string,
    refId: string,
    payload: { responsible_name?: string; contact_phone?: string },
  ) => affiliateFetch<{
    success: boolean
    source_phone?: string | null
    contact_phone?: string | null
    responsible_name?: string | null
  }>(`/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/contact`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    timeoutMs: 20_000,
    retries: 1,
  }),

  /**
   * Tarefas de cadência.
   * mode=due | upcoming | done | all | bundle (due+upcoming+done numa chamada)
   */
  attendanceTasks: (
    opts?: number | { mode?: 'due' | 'upcoming' | 'all' | 'done' | 'bundle'; horizonDays?: number },
  ) => {
    const mode =
      typeof opts === 'object' && opts?.mode
        ? opts.mode
        : 'due'
    const horizon =
      typeof opts === 'number'
        ? opts
        : typeof opts === 'object' && opts?.horizonDays != null
          ? opts.horizonDays
          : 14
    const qs = new URLSearchParams({
      mode,
      horizon_days: String(Math.min(Math.max(horizon, 0), 30)),
    })
    type TaskRow = {
      id: string
      ref_type: string
      ref_id: string
      task_type: string
      instruction?: string | null
      template_id?: string | null
      due_at: string
      status: string
      contact_name?: string | null
      completed_at?: string | null
    }
    return affiliateFetch<{
      success: boolean
      mode?: string
      tasks: TaskRow[]
      due?: TaskRow[]
      upcoming?: TaskRow[]
      done?: TaskRow[]
      summary: {
        total: number
        overdue: number
        due_today: number
        due_now?: number
        upcoming_count?: number
        done_count?: number
        done_today?: number
      }
    }>(`/api/affiliate-app/attendance/tasks?${qs}`, {
      timeoutMs: 18_000,
      retries: 1,
    })
  },
  opportunityHistory: (refType: string, refId: string) =>
    affiliateFetch<{
      success: boolean
      events: Array<{
        action: string
        label: string
        message?: string | null
        note?: string | null
        at: string | null
        source?: string
        channel?: 'whatsapp' | 'phone' | 'note' | 'system'
        duration_sec?: number | null
      }>
      channel_summary?: Array<{
        channel: 'whatsapp' | 'phone' | 'note' | 'system'
        label: string
        attempts: number
        last_action: string | null
        last_action_label: string | null
        last_at: string | null
      }>
      notes?: string | null
      status?: string | null
    }>(
      `/api/affiliate-app/opportunities/${encodeURIComponent(refType)}/${encodeURIComponent(refId)}/history`,
      { timeoutMs: 12_000, retries: 1 },
    ),
  skipPoolOpportunity: (queueId: string, payload?: { reason?: string; note?: string }) =>
    affiliateFetch<any>(`/api/affiliate-app/opportunities/pool/${encodeURIComponent(queueId)}/skip`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
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
  /** Simulador de frete (Atendimento) — CEP real + faixas da loja */
  freightQuote: (payload: {
    cep?: string
    address?: string
    city?: string
    state?: string
    cart_total?: number
  }) =>
    affiliateFetch<{
      success: boolean
      quote: any
      configured?: boolean
      store_id?: string | null
    }>('/api/affiliate-app/freight/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 25_000,
      retries: 0,
    }),
  freightLookupCep: (cep: string) =>
    affiliateFetch<{ success: boolean; place: any }>(
      `/api/affiliate-app/freight/cep/${encodeURIComponent(cep.replace(/\D/g, ''))}`,
      { timeoutMs: 12_000, retries: 0 },
    ),
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
