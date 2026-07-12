const PARTNERS_TOKEN_KEY = 'lead-system-token-parceiro'
const PENDING_INVITE_KEY = 'partners-pending-invite'

export function setPendingInvite(code: string) {
  sessionStorage.setItem(PENDING_INVITE_KEY, code)
}

export function getPendingInvite(): string | null {
  return sessionStorage.getItem(PENDING_INVITE_KEY)
}

export function clearPendingInvite() {
  sessionStorage.removeItem(PENDING_INVITE_KEY)
}

export function isPartnersAppRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/parceiros')
}

export function getPartnersToken(): string | null {
  return localStorage.getItem(PARTNERS_TOKEN_KEY)
}

export function setPartnersAuth(token: string) {
  localStorage.setItem(PARTNERS_TOKEN_KEY, token)
}

export function clearPartnersAuth() {
  localStorage.removeItem(PARTNERS_TOKEN_KEY)
}

export function getPartnersHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getPartnersToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function partnersFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getPartnersHeaders(),
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data as T
}

export const partnersApi = {
  login: (email: string, password: string) =>
    partnersFetch<any>('/api/auth/partners-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: { name: string; email: string; password: string; brand_id?: string }) =>
    partnersFetch<any>('/api/auth/partners-register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchBrands: (q: string) =>
    fetch(`/api/auth/partners-brands?q=${encodeURIComponent(q)}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Erro ${r.status}`)
      return data as { success: boolean; brands: Array<{ id: string; name: string; slug: string; logo_url?: string | null }> }
    }),

  me: () => partnersFetch<any>('/api/partners-app/me'),
  updateProfile: (payload: {
    display_name?: string
    phone?: string | null
    document?: string | null
    pix_key?: string | null
    force_pix_sync?: boolean
  }) =>
    partnersFetch<any>('/api/partners-app/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  dashboard: () => partnersFetch<any>('/api/partners-app/dashboard'),
  memberships: () => partnersFetch<any>('/api/partners-app/memberships'),
  alerts: () => partnersFetch<any>('/api/partners-app/alerts'),
  markAlertRead: (alertId: string) =>
    partnersFetch<any>(`/api/partners-app/alerts/${encodeURIComponent(alertId)}/read`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  markAllAlertsRead: () =>
    partnersFetch<any>('/api/partners-app/alerts/read-all', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  marketplace: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ''
    return partnersFetch<any>(`/api/partners-app/marketplace${qs}`)
  },

  programDetail: (programRef: string) =>
    partnersFetch<any>(`/api/partners-app/programs/${encodeURIComponent(programRef)}`),

  applyProgram: (programId: string, payload?: { note?: string; accepted_terms?: boolean }) =>
    partnersFetch<any>(`/api/partners-app/programs/${encodeURIComponent(programId)}/apply`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  enterBrand: (brandId: string) =>
    partnersFetch<any>(`/api/partners-app/brands/${encodeURIComponent(brandId)}/enter`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  onboarding: (enrollmentId: string) =>
    partnersFetch<any>(`/api/partners-app/onboarding/${encodeURIComponent(enrollmentId)}`),

  completeOnboarding: (enrollmentId: string, payload: { item_type: string; item_id: string; payload?: unknown }) =>
    partnersFetch<any>(`/api/partners-app/onboarding/${encodeURIComponent(enrollmentId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  invitePreview: (code: string) =>
    fetch(`/api/auth/partners-invite?code=${encodeURIComponent(code)}`, {
      headers: { 'Content-Type': 'application/json' },
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Erro ${r.status}`)
      return data
    }),

  acceptInvite: (code: string) =>
    partnersFetch<any>(`/api/partners-app/invites/${encodeURIComponent(code)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}

export function buildPartnersInviteUrl(invitePath: string): string {
  const path = invitePath.startsWith('/') ? invitePath : `/${invitePath}`
  if (typeof window === 'undefined') return `https://parceiros.leadcapture.online${path}`
  const host = window.location.hostname
  if (host === 'app.leadcapture.online' || host === 'localhost' || host === '127.0.0.1') {
    return `https://parceiros.leadcapture.online${path}`
  }
  return `${window.location.origin}${path}`
}
