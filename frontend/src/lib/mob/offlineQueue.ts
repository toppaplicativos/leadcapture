/**
 * Lead Capture Mob — offline outbox for courier app.
 * Persists actions locally and replays when connectivity returns.
 */

export type OfflineEventType =
  | 'location'
  | 'status'
  | 'package_scan'
  | 'package_status'
  | 'ops_status'
  | 'shift_end'

export type OfflineEvent = {
  id: string
  type: OfflineEventType
  /** API path without origin, e.g. /api/mob/app/location */
  path: string
  method: 'POST' | 'PUT' | 'PATCH'
  body: Record<string, any>
  created_at: string
  attempts: number
  last_error?: string | null
}

const STORAGE_KEY = 'mob-offline-outbox-v1'
const MAX_EVENTS = 200
const MAX_ATTEMPTS = 12

type Listener = (events: OfflineEvent[]) => void
const listeners = new Set<Listener>()

function uid(): string {
  return `mob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function readAll(): OfflineEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(events: OfflineEvent[]) {
  const trimmed = events.slice(-MAX_EVENTS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  listeners.forEach((fn) => {
    try {
      fn(trimmed)
    } catch {
      /* ignore */
    }
  })
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export function listOfflineEvents(): OfflineEvent[] {
  return readAll()
}

export function offlinePendingCount(): number {
  return readAll().length
}

export function subscribeOfflineQueue(fn: Listener): () => void {
  listeners.add(fn)
  fn(readAll())
  return () => listeners.delete(fn)
}

export function enqueueOfflineEvent(
  type: OfflineEventType,
  path: string,
  body: Record<string, any>,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
): OfflineEvent {
  const event: OfflineEvent = {
    id: body.client_event_id || uid(),
    type,
    path,
    method,
    body: {
      ...body,
      client_event_id: body.client_event_id || undefined,
      offline_queued_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  // Ensure client_event_id is stable for idempotency
  event.body.client_event_id = event.id
  const all = readAll()
  // Dedupe location bursts: keep only latest location for same delivery within 15s
  if (type === 'location') {
    const deliveryId = String(body.delivery_id || '')
    const cutoff = Date.now() - 15_000
    const filtered = all.filter((e) => {
      if (e.type !== 'location') return true
      if (String(e.body.delivery_id || '') !== deliveryId) return true
      return new Date(e.created_at).getTime() < cutoff
    })
    filtered.push(event)
    writeAll(filtered)
  } else {
    all.push(event)
    writeAll(all)
  }
  return event
}

export function removeOfflineEvent(id: string) {
  writeAll(readAll().filter((e) => e.id !== id))
}

export function bumpOfflineAttempt(id: string, error: string) {
  const all = readAll().map((e) => {
    if (e.id !== id) return e
    return {
      ...e,
      attempts: e.attempts + 1,
      last_error: error,
    }
  })
  // Drop permanently failed
  writeAll(all.filter((e) => e.attempts < MAX_ATTEMPTS))
}

export function clearOfflineQueue() {
  writeAll([])
}

/** True for network-ish failures that should be queued */
export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true
  const msg = String((err as any)?.message || err || '')
  if (/Failed to fetch|NetworkError|network|ERR_INTERNET|Load failed|timeout|ECONN/i.test(msg)) {
    return true
  }
  return false
}
