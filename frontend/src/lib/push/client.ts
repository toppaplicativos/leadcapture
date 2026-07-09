import { pushApi } from './api'
import { detectBrowser, detectOS, resolvePushAppContext, type PushAppContext } from './context'

const DEVICE_ID_KEY = 'lead-system:push-device-id'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const arr = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export async function subscribeToPush(opts?: {
  appContext?: PushAppContext
  organizationId?: string | null
}): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported()) return { ok: false, message: 'Push não suportado neste navegador' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, message: permission === 'denied' ? 'Permissão negada' : 'Permissão não concedida' }
  }

  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await pushApi.getVapidKey()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const json = sub.toJSON()
  await pushApi.subscribe({
    app_context: opts?.appContext || resolvePushAppContext(),
    organization_id: opts?.organizationId
      || localStorage.getItem('lead-system:active-brand-id-afiliado')
      || localStorage.getItem('lead-system:active-brand-id')
      || null,
    device_id: getOrCreateDeviceId(),
    browser: detectBrowser(),
    operating_system: detectOS(),
    subscription: {
      endpoint: json.endpoint,
      keys: json.keys,
    },
  })

  return { ok: true }
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await pushApi.unsubscribe(endpoint).catch(() => undefined)
}