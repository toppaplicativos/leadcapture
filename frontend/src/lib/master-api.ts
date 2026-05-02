/**
 * Thin API client for /api/master/* — uses the same JWT as the regular admin
 * (super_admin flag is checked server-side per request).
 */

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lead-system-token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(method: string, path: string, body?: any): Promise<T> {
  const r = await fetch(`/api/master${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctype = r.headers.get('content-type') || ''
  const data: any = ctype.includes('application/json') ? await r.json() : await r.text()
  if (!r.ok) {
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      `HTTP ${r.status}`
    throw new Error(message)
  }
  return data as T
}

export const masterApi = {
  me: () => req<{ user: { id: string; email: string; name: string } }>('GET', '/auth/me'),

  dashboard: () =>
    req<{
      users: { total: number; new_7d: number; new_30d: number }
      brands: { total: number }
      subscriptions: { active: number; trialing: number; canceled: number }
      mrr_cents: number
    }>('GET', '/dashboard'),

  /* settings */
  getSettings: () =>
    req<{ settings: Record<string, any> }>('GET', '/settings'),
  setSetting: (key: string, value: any) =>
    req<{ ok: true }>('PUT', `/settings/${encodeURIComponent(key)}`, { value }),
  deleteSetting: (key: string) =>
    req<{ ok: true }>('DELETE', `/settings/${encodeURIComponent(key)}`),

  /* integration tests */
  testOpenAI: (key?: string) =>
    req<{ ok: boolean; message: string }>('POST', '/integrations/openai/test', { key }),
  testStripe: (key?: string) =>
    req<{ ok: boolean; message: string; livemode?: boolean }>(
      'POST',
      '/integrations/stripe/test',
      { key },
    ),
  testSmtp: (params: {
    host?: string
    port?: number
    user?: string
    password?: string
    from?: string
    to?: string
  }) =>
    req<{ ok: boolean; message: string }>('POST', '/integrations/smtp/test', params),

  /* plans */
  listPlans: () =>
    req<{ plans: Array<any> }>('GET', '/plans'),
  updatePlan: (id: string, patch: Record<string, any>) =>
    req<{ plan: any }>('PUT', `/plans/${id}`, patch),
  syncPlanStripe: (id: string) =>
    req<{ plan: any }>('POST', `/plans/${id}/sync-stripe`, {}),
  disablePlanLink: (id: string) =>
    req<{ ok: true }>('POST', `/plans/${id}/disable-link`, {}),

  /* clients */
  listClients: (params: { search?: string; page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    return req<{
      clients: Array<{
        id: string
        email: string
        name: string
        role: string
        is_super_admin: boolean
        is_active: boolean
        last_login_at: string | null
        created_at: string
      }>
      total: number
      page: number
      limit: number
    }>('GET', `/clients?${q}`)
  },

  /* email templates */
  listEmails: () =>
    req<{
      templates: Array<{
        id: string
        slug: string
        scope: string
        subject_template: string
        html_template: string
        text_template: string | null
        variables: string[]
        description: string | null
        is_active: boolean
        updated_at: string
      }>
    }>('GET', '/emails'),
  updateEmail: (id: string, patch: Record<string, any>) =>
    req<{ template: any }>('PUT', `/emails/${id}`, patch),
  previewEmail: (params: { subject_template: string; html_template: string; variables: Record<string, any> }) =>
    req<{ subject: string; html: string }>('POST', '/emails/preview', params),
  sendTestEmail: (id: string, to: string, variables?: Record<string, any>) =>
    req<{ ok: boolean; message: string }>('POST', `/emails/${id}/send-test`, { to, variables }),
  emailLogs: () =>
    req<{
      logs: Array<{
        id: string
        template_slug: string | null
        to_email: string
        subject: string
        status: string
        error_message: string | null
        created_at: string
      }>
    }>('GET', '/emails/logs'),

  /* audit */
  auditLog: () =>
    req<{
      entries: Array<{
        id: string
        actor_user_id: string
        actor_email: string
        action: string
        resource: string | null
        payload: any
        ip: string | null
        created_at: string
      }>
    }>('GET', '/audit-log'),
}
