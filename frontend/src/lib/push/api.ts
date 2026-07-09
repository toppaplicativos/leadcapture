import type { PushAppContext } from './context'

function authHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('lead-system-token') ||
    localStorage.getItem('lead-system-token-afiliado') ||
    localStorage.getItem('lead-system-token-estoque')
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  const brand = localStorage.getItem('lead-system:active-brand-id')
  if (brand) h['x-brand-id'] = brand
  return h
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/push${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data as T
}

export const pushApi = {
  getVapidKey: () => req<{ success: boolean; publicKey: string }>('GET', '/vapid-public-key'),

  listEvents: (appContext?: PushAppContext) =>
    req<{ success: boolean; events: Array<any> }>(
      'GET',
      `/events${appContext ? `?app_context=${encodeURIComponent(appContext)}` : ''}`,
    ),

  listDevices: (appContext?: PushAppContext) =>
    req<{ success: boolean; devices: Array<any> }>(
      'GET',
      `/devices${appContext ? `?app_context=${encodeURIComponent(appContext)}` : ''}`,
    ),

  subscribe: (payload: Record<string, unknown>) =>
    req<{ success: boolean; device: any }>('POST', '/subscribe', payload),

  unsubscribe: (endpoint: string) =>
    req<{ success: boolean }>('DELETE', '/subscribe', { endpoint }),

  updatePreferences: (deviceId: string, preferences: Record<string, unknown>) =>
    req<{ success: boolean; device: any }>('PUT', `/devices/${deviceId}/preferences`, preferences),

  sendTest: (payload: Record<string, unknown>) =>
    req<{ success: boolean; result: { sent: number; skipped: number; failed: number } }>('POST', '/test', payload),
}