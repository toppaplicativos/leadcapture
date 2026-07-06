import { useState, useEffect } from 'react'

export interface InstanceHealth {
  id: string
  name: string
  phone: string | null
  status_db: string
  status_runtime: string
  drift: boolean
  last_connected_at: string | null
  seconds_since_connected: number | null
  criticality: 'ok' | 'warning' | 'critical'
  human_reason: string
  has_pending_qr?: boolean
}

export interface HealthResponse {
  success?: boolean
  instances?: InstanceHealth[]
  summary?: {
    total: number
    connected: number
    disconnected: number
    critical: number
    warning: number
    has_critical: boolean
  }
}

const POLL_INTERVAL_MS = 60_000

function healthHeaders(): Record<string, string> {
  const token = localStorage.getItem('lead-system-token')
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  const h: Record<string, string> = {}
  if (token) h.Authorization = `Bearer ${token}`
  if (brandId) h['x-brand-id'] = brandId
  return h
}

export function useWhatsAppHealth(enabled = true) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let alive = true

    const fetchHealth = async () => {
      try {
        const token = localStorage.getItem('lead-system-token')
        if (!token) return
        const r = await fetch('/api/instances/health', { headers: healthHeaders() })
        if (!r.ok) return
        const d = await r.json()
        if (alive) {
          setHealth(d)
          setLoading(false)
        }
      } catch {
        if (alive) setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [enabled])

  const criticalInstances = (health?.instances || []).filter((i) => i.criticality === 'critical')
  const hasCritical = criticalInstances.length > 0
  const primaryCritical = criticalInstances[0] ?? null

  return {
    health,
    loading,
    criticalInstances,
    hasCritical,
    primaryCritical,
    summary: health?.summary,
    refresh: async () => {
      const r = await fetch('/api/instances/health', { headers: healthHeaders() })
      if (r.ok) setHealth(await r.json())
    },
  }
}