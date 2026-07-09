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
  like_count?: number
  comments_count?: number
}

export type InstagramAccountInsights = {
  reach: number
  views: number
  profile_views: number
  accounts_engaged: number
  total_interactions: number
  likes: number
  comments: number
  saves: number
  shares: number
}

export type InstagramAnalytics = {
  period_days: number
  profile: {
    username: string
    name: string
    followers_count: number
    follows_count: number
    media_count: number
    profile_picture_url?: string
    biography?: string
    website?: string
  }
  account: InstagramAccountInsights
  media_summary: {
    total_likes: number
    total_comments: number
    posts_analyzed: number
    engagement_rate: number
  }
  fetched_at: string
  source: 'instagram_api'
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

export type InstagramPostCounts = {
  published_ig: number
  scheduled: number
  drafts: number
  failed: number
  publishing: number
  total_local: number
}

export type InstagramDashboard = {
  profile: InstagramAnalytics['profile']
  analytics: InstagramAnalytics
  post_counts: InstagramPostCounts
  conversations_count: number
  recent_media: InstagramMedia[]
  token_valid: boolean
}

export async function fetchInstagramAnalytics(days = 7): Promise<InstagramAnalytics | null> {
  const res = await instagramApi(`/analytics?days=${days}`).catch(() => ({ success: false }))
  return res?.success ? res.analytics : null
}

export async function fetchInstagramDashboard(): Promise<InstagramDashboard | null> {
  const res = await instagramApi('/dashboard').catch(() => ({ success: false }))
  return res?.success ? res.dashboard : null
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
  let analytics: InstagramAnalytics | null = null
  if (connected) {
    const dashRes = await instagramApi('/dashboard').catch(() => ({ success: false }))
    if (dashRes?.success && dashRes.dashboard) {
      media = dashRes.dashboard.recent_media || []
      analytics = dashRes.dashboard.analytics || null
    } else {
      const [mediaRes, analyticsRes] = await Promise.all([
        instagramApi('/media?limit=6').catch(() => ({ success: false, media: [] })),
        instagramApi('/analytics?days=7').catch(() => ({ success: false, analytics: null })),
      ])
      if (mediaRes?.success) media = mediaRes.media || []
      if (analyticsRes?.success) analytics = analyticsRes.analytics || null
    }
  }
  return { connection, profile, connected, media, analytics }
}