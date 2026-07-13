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
    req<{
      plans: Array<any>
      feature_catalog?: Array<{
        key: string
        label: string
        group: string
        description: string
      }>
      feature_keys?: string[]
    }>('GET', '/plans'),
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

  /* organizations (brand_units — tenant settings, not user accounts) */
  listOrganizations: (params: {
    search?: string
    page?: number
    limit?: number
    status?: string
  } = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    if (params.status) q.set('status', params.status)
    return req<{
      organizations: Array<{
        id: string
        name: string
        slug: string | null
        status: string
        is_default: boolean
        logo_url?: string | null
        domain?: string | null
        primary_color?: string | null
        whatsapp_phone?: string | null
        created_at: string
        owner_id: string
        owner_email: string
        owner_name: string
        owner_active: boolean
        owner_account_kind?: string | null
        subscription_status: string | null
        plan_name: string | null
        plan_slug: string | null
        plan_id?: string | null
        team_count?: number
        instances_count?: number
      }>
      total: number
      page: number
      limit: number
    }>('GET', `/organizations?${q}`)
  },
  getOrganization: (id: string) =>
    req<{
      organization: any
      subscription: any
      entitlements: any
      usage: any
      team: any[]
    }>('GET', `/organizations/${id}`),
  updateOrganization: (id: string, patch: Record<string, any>) =>
    req<{ organization: any }>('PATCH', `/organizations/${id}`, patch),
  assignOrganizationPlan: (
    id: string,
    body: { plan_id: string; status?: string; trial_days?: number },
  ) =>
    req<{ subscription: any; organization: any }>(
      'POST',
      `/organizations/${id}/assign-plan`,
      body,
    ),
  organizationUsage: (id: string) =>
    req<{ organization: any; entitlements: any; usage: any }>(
      'GET',
      `/organizations/${id}/usage`,
    ),

  impersonate: (user_id: string) =>
    req<{
      token: string
      user: { id: string; email: string; name: string; role: string }
      expires_in: number
      app_url: string
    }>('POST', '/impersonate', { user_id }),

  health: () =>
    req<{
      health: {
        users_active: number
        brands_active: number
        brands_suspended: number
        subscriptions_past_due: number
        email_errors_24h: number
        whatsapp_not_connected: number
        maintenance_mode: boolean
        signup_enabled: boolean
        database?: 'up' | 'down'
      }
      platform?: PlatformVersionInfo
      checked_at: string
    }>('GET', '/health'),

  platformVersion: () =>
    req<{ platform: PlatformVersionInfo; checked_at: string }>('GET', '/version'),

  contentPacks: () =>
    req<{
      packs: {
        skill_templates: any[]
        plans: any[]
        modules: Record<string, boolean>
      }
    }>('GET', '/content-packs'),

  /* users */
  updateUser: (id: string, patch: Record<string, any>) =>
    req<{ user: any }>('PATCH', `/users/${id}`, patch),

  /* global providers */
  providersCatalog: () =>
    req<{ models: Record<string, any>; defaults: Record<string, any> }>('GET', '/providers/catalog'),
  listProviders: () =>
    req<{ providers: Array<any> }>('GET', '/providers'),
  updateProvider: (provider: string, patch: Record<string, any>) =>
    req<{ provider: any }>('PUT', `/providers/${provider}`, patch),
  testProvider: (provider: string, patch?: Record<string, any>) =>
    req<{ ok: boolean; message: string }>('POST', `/providers/${provider}/test`, patch || {}),

  /* AI algorithms (global function → model routing) */
  listAlgorithms: (params: { modality?: string; group?: string; search?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.modality) q.set('modality', params.modality)
    if (params.group) q.set('group', params.group)
    if (params.search) q.set('search', params.search)
    const qs = q.toString()
    return req<{ algorithms: Array<any>; total: number }>(
      'GET',
      `/algorithms${qs ? `?${qs}` : ''}`,
    )
  },
  getAlgorithm: (functionKey: string) =>
    req<{ algorithm: any }>('GET', `/algorithms/${encodeURIComponent(functionKey)}`),
  updateAlgorithm: (functionKey: string, patch: Record<string, any>) =>
    req<{ algorithm: any }>('PUT', `/algorithms/${encodeURIComponent(functionKey)}`, patch),
  seedAlgorithms: () => req<{ ok: boolean; inserted: number }>('POST', '/algorithms/seed', {}),
  algorithmsAudit: (limit = 50) =>
    req<{ entries: Array<any> }>('GET', `/algorithms/audit?limit=${limit}`),

  /* platform tools */
  getTools: () => req<{ tools: PlatformTools }>('GET', '/tools'),
  updateTools: (tools: Partial<PlatformTools>) =>
    req<{ tools: PlatformTools }>('PUT', '/tools', { tools }),

  pushEvents: (appContext?: string) =>
    req<{ events: Array<any>; contexts: Record<string, string>; sounds: Array<any> }>(
      'GET',
      `/push/events${appContext ? `?app_context=${encodeURIComponent(appContext)}` : ''}`,
    ),
  updatePushEvent: (id: string, patch: Record<string, unknown>) =>
    req<{ ok: true }>('PATCH', `/push/events/${id}`, patch),
  pushDeliveries: (limit = 100) =>
    req<{ entries: Array<any> }>('GET', `/push/deliveries?limit=${limit}`),

  notificationEvents: (appContext?: string) =>
    req<{ events: Array<any> }>(
      'GET',
      `/notifications/events${appContext ? `?app_context=${encodeURIComponent(appContext)}` : ''}`,
    ),
  updateNotificationEvent: (id: string, patch: Record<string, unknown>) =>
    req<{ ok: true }>('PATCH', `/notifications/events/${id}`, patch),
  updateNotificationTemplate: (eventTypeId: string, patch: Record<string, unknown>) =>
    req<{ ok: true }>('PATCH', `/notifications/templates/${eventTypeId}`, patch),
  notificationEscalation: () =>
    req<{ rules: Array<any> }>('GET', '/notifications/escalation'),
  updateNotificationEscalation: (id: string, patch: Record<string, unknown>) =>
    req<{ ok: true }>('PATCH', `/notifications/escalation/${id}`, patch),
  notificationLogs: (limit = 100) =>
    req<{ logs: Array<any> }>('GET', `/notifications/logs?limit=${limit}`),
  notificationDevices: (userId?: string) =>
    req<{ devices: Array<any> }>(
      'GET',
      `/notifications/devices${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`,
    ),
}

export type PlatformTools = {
  maintenance_mode: boolean
  maintenance_message: string
  signup_enabled: boolean
  public_signup: boolean
  modules: Record<string, boolean>
  default_ai_preferences?: Record<string, { provider: string; model: string }>
}

export type PlatformVersionInfo = {
  name: string
  version: string
  git_sha: string | null
  git_branch?: string | null
  build_time: string | null
  node: string
  env: string
  started_at: string
  uptime_s: number
}
