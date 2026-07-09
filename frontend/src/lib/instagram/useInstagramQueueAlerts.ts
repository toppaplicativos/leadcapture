import { useCallback, useEffect, useRef } from 'react'
import { instagramApi } from '@/lib/instagram/pageApi'

const STORAGE_KEY = 'ig-queue-alerts-since'

type AlertPost = {
  id: string
  caption?: string
  status: string
  updated_at?: string
  error_message?: string
  media_type?: string
}

type AlertsResponse = {
  success?: boolean
  failed_count?: number
  alerts?: AlertPost[]
}

export function useInstagramQueueAlerts(
  enabled: boolean,
  onAlert: (post: AlertPost, kind: 'published' | 'failed') => void,
  intervalMs = 90_000,
) {
  const seenRef = useRef<Set<string>>(new Set())

  const poll = useCallback(async () => {
    const since = sessionStorage.getItem(STORAGE_KEY) || new Date(Date.now() - 5 * 60_000).toISOString()
    try {
      const res = (await instagramApi(`/alerts?since=${encodeURIComponent(since)}`)) as AlertsResponse
      if (!res.success) return
      const alerts = res.alerts || []
      for (const post of alerts) {
        const key = `${post.id}:${post.status}:${post.updated_at}`
        if (seenRef.current.has(key)) continue
        seenRef.current.add(key)
        if (post.status === 'published') onAlert(post, 'published')
        if (post.status === 'failed') onAlert(post, 'failed')
      }
      sessionStorage.setItem(STORAGE_KEY, new Date().toISOString())
    } catch {}
  }, [onAlert])

  useEffect(() => {
    if (!enabled) return
    void poll()
    const timer = setInterval(() => void poll(), intervalMs)
    return () => clearInterval(timer)
  }, [enabled, poll, intervalMs])
}