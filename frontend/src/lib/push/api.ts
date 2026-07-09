import type { PushAppContext } from './context'
import { resolvePushAppContext } from './context'

/**
 * Resolve JWT + brand do contexto atual (admin / afiliado brand / parceiro global / estoque).
 * Sem isso o app em parceiros.leadcapture.online chama /api/push sem Authorization → 401.
 */
function authHeaders(): Record<string, string> {
  const ctx = resolvePushAppContext()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }

  // Ordem por contexto: token do app atual primeiro; fallbacks para hosts compartilhados
  let token: string | null = null
  if (ctx === 'affiliate') {
    token =
      localStorage.getItem('lead-system-token-parceiro') ||
      localStorage.getItem('lead-system-token-afiliado') ||
      localStorage.getItem('lead-system-token')
  } else if (ctx === 'stock') {
    token =
      localStorage.getItem('lead-system-token-estoque') ||
      localStorage.getItem('lead-system-token')
  } else {
    token =
      localStorage.getItem('lead-system-token') ||
      localStorage.getItem('lead-system-token-afiliado') ||
      localStorage.getItem('lead-system-token-parceiro') ||
      localStorage.getItem('lead-system-token-estoque')
  }

  if (token) h.Authorization = `Bearer ${token}`

  const brand =
    localStorage.getItem('lead-system:active-brand-id-afiliado') ||
    localStorage.getItem('lead-system:active-brand-id') ||
    localStorage.getItem('lead-system:active-brand-id-estoque')
  if (brand) h['x-brand-id'] = brand

  return h
}

async function req<T>(method: string, path: string, body?: unknown, opts?: { authRequired?: boolean }): Promise<T> {
  const headers = authHeaders()
  if (opts?.authRequired !== false && !headers.Authorization) {
    throw new Error('Faça login novamente para gerenciar notificações push.')
  }
  const r = await fetch(`/api/push${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || data.message || `HTTP ${r.status}`)
  return data as T
}

export const pushApi = {
  // endpoint público no backend
  getVapidKey: () =>
    req<{ success: boolean; publicKey: string }>('GET', '/vapid-public-key', undefined, { authRequired: false }),

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
