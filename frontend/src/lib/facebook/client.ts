export type FacebookTab =
  | 'overview'
  | 'create'
  | 'posts'
  | 'performance'
  | 'automations'
  | 'calendar'
  | 'messages'

export type FacebookFeedItem = {
  id: string
  message?: string
  full_picture?: string
  permalink_url?: string
  created_time?: string
}

export function getFacebookHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export async function facebookApi<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/facebook${path}`, {
    ...opts,
    headers: { ...getFacebookHeaders(), ...(opts?.headers || {}) },
  })
  return res.json()
}

export async function fetchFacebookSnapshot() {
  const [connRes, profRes] = await Promise.all([
    facebookApi('/connection').catch(() => ({ success: false, connection: null })),
    facebookApi('/profile').catch(() => ({ success: false, profile: null })),
  ])
  const connection = connRes?.success ? connRes.connection : null
  const profile = profRes?.success ? profRes.profile : null
  const connected = !!connection && !!profile?.is_connected
  let feed: FacebookFeedItem[] = []
  if (connected) {
    const feedRes = await facebookApi('/feed?limit=6').catch(() => ({ success: false, feed: [] }))
    if (feedRes?.success) feed = feedRes.feed || []
  }
  return { connection, profile, connected, feed }
}