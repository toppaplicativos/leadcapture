import type { PushAppContext } from '@/lib/push/context'

export type NotificationItem = {
  notification_id: string
  title: string
  message: string
  event: string
  priority: string
  read: boolean
  created_at: string
  deep_link?: string | null
  action_required?: boolean
  cta_label?: string | null
  related_action_id?: string | null
  category?: string | null
  event_type?: string | null
  is_archived?: boolean
  metadata?: Record<string, unknown>
}

export type PlatformActionItem = {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  due_at?: string | null
  action_type: string
  deep_link?: string | null
}

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'critical'
  | 'action'
  | 'archived'
  | 'leads'
  | 'clients'
  | 'commissions'
  | 'system'
  | 'inventory'
  | 'orders'
  | 'support'

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function createNotificationsApi(getHeaders: () => Record<string, string>) {
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(`/api${path}`, {
      method,
      headers: getHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`)
    return data as T
  }

  return {
    list: (opts?: { filter?: NotificationFilter; category?: string; app_target?: PushAppContext; limit?: number }) =>
      req<{ success: boolean; notifications: NotificationItem[]; total: number }>(
        'GET',
        `/notifications${buildQuery({
          filter: opts?.filter && opts.filter !== 'all' && !['leads', 'clients', 'commissions', 'system', 'inventory', 'orders', 'support'].includes(opts.filter)
            ? opts.filter
            : undefined,
          category: opts?.category || (opts?.filter && ['leads', 'clients', 'commissions', 'system', 'inventory', 'orders', 'support'].includes(opts.filter)
            ? opts.filter
            : undefined),
          app_target: opts?.app_target,
          limit: opts?.limit ?? 50,
        })}`,
      ),

    unreadCount: () =>
      req<{ success: boolean; unread_count: number }>('GET', '/notifications/unread-count'),

    markRead: (id: string) =>
      req<{ success: boolean }>('POST', `/notifications/${id}/read`),

    markAllRead: () =>
      req<{ success: boolean; affected: number }>('POST', '/notifications/read-all'),

    archive: (id: string) =>
      req<{ success: boolean; unread_count: number }>('POST', `/notifications/${id}/archive`),

    listActions: (opts?: { status?: string; overdue?: boolean }) =>
      req<{ success: boolean; actions: PlatformActionItem[]; total: number }>(
        'GET',
        `/actions${buildQuery({
          status: opts?.status || 'open,in_progress,waiting,escalated',
          overdue: opts?.overdue ? 'true' : undefined,
        })}`,
      ),

    openActionCount: () =>
      req<{ success: boolean; open_count: number }>('GET', '/actions/open-count'),

    updateActionStatus: (id: string, status: string, notes?: string) =>
      req<{ success: boolean; action: PlatformActionItem }>('PATCH', `/actions/${id}/status`, {
        status,
        notes,
      }),

    listEventPreferences: (appContext?: string) =>
      req<{ success: boolean; preferences: Array<Record<string, unknown>> }>(
        'GET',
        `/notifications/preferences/events${appContext ? `?app_context=${encodeURIComponent(appContext)}` : ''}`,
      ),

    updateEventPreference: (eventKey: string, patch: Record<string, unknown>) =>
      req<{ success: boolean; preference: Record<string, unknown> }>(
        'PUT',
        `/notifications/preferences/events/${encodeURIComponent(eventKey)}`,
        patch,
      ),
  }
}