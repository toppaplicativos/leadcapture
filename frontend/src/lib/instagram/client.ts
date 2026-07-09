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
  const data = await res.json().catch(() => ({} as any))
  // Always attach HTTP status so callers can detect 403 plan vs "sem token"
  if (data && typeof data === 'object') {
    ;(data as any).status = res.status
  }
  if (!res.ok && data && (data as any).success === undefined) {
    return { success: false, ...data, status: res.status } as T
  }
  return data as T
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

/**
 * Conta vinculada = há registro de connection com token/conta,
 * independentemente de is_active stale ou falha transitória no Graph.
 */
export function isInstagramConnectionLinked(connection: any, profile?: any): boolean {
  if (!connection && !profile) return false
  if (connection) {
    const token = connection.access_token
    // Token real ou mascarado (••••) no /connection
    if (token && String(token).trim().length > 0) return true
    if (connection.account_id || connection.ig_user_id || connection.username) return true
    if (connection.id && connection.brand_id) return true
  }
  if (profile?.is_connected) return true
  if (profile?.username) return true
  return false
}

function pickConnection(connRes: any): any | null {
  if (!connRes) return null
  // Aceita { success, connection } ou { connection } ou o próprio objeto
  if (connRes.connection !== undefined) {
    return connRes.connection || null
  }
  if (connRes.success === false) return null
  if (connRes.access_token || connRes.username || connRes.account_id) return connRes
  return null
}

function profileFromConnection(connection: any, base?: any) {
  if (!connection) return base || null
  return {
    id: connection.ig_user_id || connection.account_id || base?.id,
    username: connection.username || base?.username || '',
    name: connection.name || base?.name || '',
    profile_picture_url: connection.profile_picture_url || base?.profile_picture_url || '',
    followers_count: Number(connection.followers_count ?? base?.followers_count ?? 0),
    follows_count: Number(connection.follows_count ?? base?.follows_count ?? 0),
    media_count: Number(connection.media_count ?? base?.media_count ?? 0),
    biography: connection.biography || base?.biography || '',
    website: connection.website || base?.website || '',
    is_connected: true,
    token_valid: base?.token_valid !== false,
    ...(base?.error ? { token_warning: base.error } : {}),
  }
}

export type InstagramSnapshotResult = {
  connection: any | null
  profile: any | null
  connected: boolean
  media: InstagramMedia[]
  analytics: InstagramAnalytics | null
  dashboard: InstagramDashboard | null
  blockedByPlan: boolean
  brandId: string
}

const SNAPSHOT_TTL_MS = 8_000
let snapshotInflight: Promise<InstagramSnapshotResult> | null = null
let snapshotCache: { at: number; brandId: string; data: InstagramSnapshotResult } | null = null

function activeBrandId(): string {
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem('lead-system:active-brand-id') || ''
    : ''
}

/** Invalida cache do snapshot (após connect/disconnect/publish). */
export function invalidateInstagramSnapshotCache() {
  snapshotCache = null
  snapshotInflight = null
}

async function loadInstagramSnapshot(): Promise<InstagramSnapshotResult> {
  // connection + status = só DB. /profile sem refresh=1 também DB.
  // Um único /dashboard traz media + analytics (Graph em paralelo no backend).
  const [connRes, statusRes] = await Promise.all([
    instagramApi('/connection').catch(() => ({ success: false, connection: null, status: 0 })),
    instagramApi('/connection-status').catch(() => ({ success: false, connected: false, status: 0 })),
  ])

  const blockedByPlan = [connRes, statusRes].some(
    (r: any) => r?.status === 403 || r?.error === 'plan_feature_required' || r?.error === 'module_disabled',
  )

  const connection = pickConnection(connRes)
  let profile = connection ? profileFromConnection(connection) : null

  const statusConnected = !!(statusRes as any)?.connected
  const statusUsername = (statusRes as any)?.username || null

  if (!profile?.username && statusUsername) {
    profile = {
      ...(profile || {}),
      username: statusUsername,
      profile_picture_url: (statusRes as any)?.profilePicture || profile?.profile_picture_url || '',
      is_connected: true,
    }
  }

  const connected = statusConnected
    || isInstagramConnectionLinked(connection, profile)
    || !!statusUsername

  let media: InstagramMedia[] = []
  let analytics: InstagramAnalytics | null = null
  let dashboard: InstagramDashboard | null = null

  if (connected) {
    const dashRes = await instagramApi('/dashboard').catch(() => ({ success: false }))
    if (dashRes?.success && dashRes.dashboard) {
      dashboard = dashRes.dashboard
      media = dashRes.dashboard.recent_media || []
      analytics = dashRes.dashboard.analytics || null
      const dashProfile = dashRes.dashboard.profile
      if (dashProfile) {
        profile = {
          ...profile,
          ...dashProfile,
          is_connected: true,
          token_valid: dashRes.dashboard.token_valid !== false,
        }
      }
    } else {
      // Fallback leve se /dashboard falhar (token Graph)
      const mediaRes = await instagramApi('/media?limit=6').catch(() => ({ success: false, media: [] }))
      if (mediaRes?.success) media = mediaRes.media || []
    }
  }

  return {
    connection,
    profile,
    connected,
    media,
    analytics,
    dashboard,
    blockedByPlan: blockedByPlan && !connected,
    brandId: activeBrandId(),
  }
}

/**
 * Snapshot único com dedupe in-flight + cache curto.
 * Chat + canvas + double-mount React compartilham a mesma request.
 */
export async function fetchInstagramSnapshot(opts?: { force?: boolean }): Promise<InstagramSnapshotResult> {
  const brandId = activeBrandId()
  const now = Date.now()

  if (
    !opts?.force
    && snapshotCache
    && snapshotCache.brandId === brandId
    && now - snapshotCache.at < SNAPSHOT_TTL_MS
  ) {
    return snapshotCache.data
  }

  if (!opts?.force && snapshotInflight) {
    return snapshotInflight
  }

  const promise = loadInstagramSnapshot()
    .then((data) => {
      snapshotCache = { at: Date.now(), brandId: data.brandId || brandId, data }
      return data
    })
    .finally(() => {
      if (snapshotInflight === promise) snapshotInflight = null
    })

  snapshotInflight = promise
  return promise
}
