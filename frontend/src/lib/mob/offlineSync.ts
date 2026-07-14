/**
 * Flush offline outbox → API (individual or batch /sync).
 */
import { getMobHeaders } from '@/lib/api-mob'
import {
  bumpOfflineAttempt,
  isOnline,
  listOfflineEvents,
  removeOfflineEvent,
  type OfflineEvent,
} from './offlineQueue'

let flushing = false
let lastFlushAt = 0

async function postEvent(ev: OfflineEvent): Promise<void> {
  const res = await fetch(ev.path, {
    method: ev.method,
    headers: getMobHeaders(),
    body: JSON.stringify(ev.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Permanent client errors — drop event except 401/429
    if (res.status === 401) throw new Error(data.error || 'Sessão expirada')
    if (res.status === 400 || res.status === 404 || res.status === 422) {
      // Validation — don't infinite retry; drop
      removeOfflineEvent(ev.id)
      throw new Error(data.error || `Erro ${res.status}`)
    }
    throw new Error(data.error || `Erro ${res.status}`)
  }
  removeOfflineEvent(ev.id)
}

/**
 * Prefer batch sync when multiple events; falls back to single POSTs.
 */
export async function flushOfflineQueue(): Promise<{
  sent: number
  failed: number
  remaining: number
}> {
  if (flushing) {
    return { sent: 0, failed: 0, remaining: listOfflineEvents().length }
  }
  if (!isOnline()) {
    return { sent: 0, failed: 0, remaining: listOfflineEvents().length }
  }

  // Throttle background flushes
  if (Date.now() - lastFlushAt < 800) {
    return { sent: 0, failed: 0, remaining: listOfflineEvents().length }
  }

  flushing = true
  let sent = 0
  let failed = 0

  try {
    const events = listOfflineEvents()
    if (!events.length) {
      return { sent: 0, failed: 0, remaining: 0 }
    }

    // Try batch first
    if (events.length >= 1) {
      try {
        const res = await fetch('/api/mob/app/sync', {
          method: 'POST',
          headers: getMobHeaders(),
          body: JSON.stringify({
            events: events.map((e) => ({
              client_event_id: e.id,
              type: e.type,
              path: e.path,
              method: e.method,
              body: e.body,
              created_at: e.created_at,
            })),
          }),
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          const results: Array<{ client_event_id: string; ok: boolean; error?: string }> =
            data.results || []
          for (const r of results) {
            if (r.ok) {
              removeOfflineEvent(r.client_event_id)
              sent += 1
            } else if (r.error && /não encontrado|inválid|obrigatór/i.test(r.error)) {
              removeOfflineEvent(r.client_event_id)
              failed += 1
            } else {
              bumpOfflineAttempt(r.client_event_id, r.error || 'sync failed')
              failed += 1
            }
          }
          // If server returned partial without listing all, fall through remaining
          const remaining = listOfflineEvents()
          if (!remaining.length) {
            lastFlushAt = Date.now()
            return { sent, failed, remaining: 0 }
          }
        }
      } catch {
        /* fall through to sequential */
      }
    }

    // Sequential fallback
    for (const ev of listOfflineEvents()) {
      try {
        await postEvent(ev)
        sent += 1
      } catch (e: any) {
        const msg = String(e?.message || 'fail')
        if (/Sessão expirada|401/i.test(msg)) break
        if (/não encontrado|inválid|obrigatór|PIN|Conferência/i.test(msg)) {
          removeOfflineEvent(ev.id)
        } else {
          bumpOfflineAttempt(ev.id, msg)
        }
        failed += 1
      }
    }
  } finally {
    flushing = false
    lastFlushAt = Date.now()
  }

  return { sent, failed, remaining: listOfflineEvents().length }
}

let started = false

/** Start online/offline listeners once (app shell). */
export function startOfflineSyncLoop() {
  if (started || typeof window === 'undefined') return
  started = true

  const tick = () => {
    void flushOfflineQueue()
  }

  window.addEventListener('online', tick)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })
  window.setInterval(tick, 12_000)
  // Initial
  if (isOnline()) tick()
}
