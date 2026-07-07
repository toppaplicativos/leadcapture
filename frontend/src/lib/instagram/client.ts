export type InstagramTab =
  | 'overview'
  | 'create'
  | 'posts'
  | 'performance'
  | 'automations'
  | 'ai'
  | 'calendar'
  | 'messages'

export type InstagramMedia = {
  id: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  caption?: string
  media_type?: string
}

export function getInstagramHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export async function instagramApi<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/instagram${path}`, {
    ...opts,
    headers: { ...getInstagramHeaders(), ...(opts?.headers || {}) },
  })
  return res.json()
}

export async function fetchInstagramSnapshot() {
  const [connRes, profRes] = await Promise.all([
    instagramApi('/connection').catch(() => ({ success: false, connection: null })),
    instagramApi('/profile').catch(() => ({ success: false, profile: null })),
  ])
  const connection = connRes?.success ? connRes.connection : null
  const profile = profRes?.success ? profRes.profile : null
  const connected = !!connection && !!profile?.is_connected
  let media: InstagramMedia[] = []
  if (connected) {
    const mediaRes = await instagramApi('/media?limit=6').catch(() => ({ success: false, media: [] }))
    if (mediaRes?.success) media = mediaRes.media || []
  }
  return { connection, profile, connected, media }
}