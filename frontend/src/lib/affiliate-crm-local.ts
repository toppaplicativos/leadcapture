/**
 * Cache local + fila offline do CRM do afiliado (Meus contatos / progresso).
 * Mantém a lista utilizável em rede ruim e sincroniza progresso quando voltar.
 */

import { affiliateApi, AffiliateApiError } from '@/lib/api-affiliate'

const CACHE_KEY = 'lc-affiliate-crm-opps-v1'
const QUEUE_KEY = 'lc-affiliate-crm-progress-queue-v1'
const MAX_QUEUE = 80
const MAX_ATTEMPTS = 8

export type LocalProgressAction =
  | 'sent'
  | 'replied'
  | 'negotiating'
  | 'auto_reply'
  | 'lost'
  | 'dismiss'
  | 'channel_unavailable'
  | 'not_matching'
  | 'no_answer'
  | 'waiting'
  | 'followup'
  | 'note'
  | 'convert'
  | 'called'
  | 'voicemail'
  | 'busy'
  | 'callback_requested'

export type ProgressPatch = {
  ref_id: string
  ref_type: 'affiliate_lead' | 'assignment' | string
  action: LocalProgressAction | string
  /** Sai da lista aberta (arquivo / oculto / convertido) */
  removed: boolean
  operational_phase?: string
  status_code?: string
  note?: string
  next_followup_at?: string | null
  followup_due?: boolean
  optimistic?: boolean
  queued_offline?: boolean
}

export type OpportunitiesCacheBundle = {
  all_open: any[]
  all_closed: any[]
  stats?: Record<string, any> | null
  facets?: Record<string, any> | null
  saved_at: number
  brand_id?: string | null
}

type QueuedProgress = {
  id: string
  ref_type: string
  ref_id: string
  payload: {
    action: string
    channel?: string
    duration_sec?: number
    message?: string
    note?: string
    reason?: string
    followup_days?: number
    task_id?: string
  }
  created_at: string
  attempts: number
  last_error?: string | null
}

function uid() {
  return `affp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function isNetworkLikeError(err: unknown): boolean {
  if (err instanceof AffiliateApiError) {
    return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500
  }
  const msg = String((err as any)?.message || err || '')
  return /failed to fetch|network|tempo esgotado|sem conexão|load failed|offline/i.test(msg)
}

/** Mapeia ação de progresso → fase / se remove da aberta. */
export function patchFromAction(
  refType: string,
  refId: string,
  action: string,
  opts?: { note?: string },
): ProgressPatch {
  const exit = new Set(['lost', 'dismiss', 'channel_unavailable', 'not_matching', 'convert'])
  const removed = exit.has(action)
  let operational_phase = 'to_contact'
  let status_code = action
  let followup_due = false
  let next_followup_at: string | null = null

  if (
    action === 'sent'
    || action === 'followup'
    || action === 'auto_reply'
    || action === 'called'
    || action === 'voicemail'
  ) {
    operational_phase = 'contacted'
    status_code = 'awaiting_response'
    next_followup_at = new Date(Date.now() + 2 * 86400000).toISOString()
  } else if (action === 'no_answer') {
    operational_phase = 'contacted'
    status_code = 'awaiting_response'
    next_followup_at = new Date(Date.now() + 3 * 86400000).toISOString()
    followup_due = false
  } else if (action === 'busy' || action === 'waiting' || action === 'callback_requested') {
    operational_phase = 'contacted'
    status_code = 'awaiting_response'
    next_followup_at = new Date(Date.now() + 1 * 86400000).toISOString()
  } else if (action === 'replied') {
    operational_phase = 'engaged'
    status_code = 'engaged'
  } else if (action === 'negotiating') {
    operational_phase = 'engaged'
    status_code = 'proposal_sent'
  } else if (removed) {
    operational_phase = 'closed'
    status_code = action === 'convert' ? 'converted' : 'lost'
  } else if (action === 'note') {
    operational_phase = '' // keep
  }

  return {
    ref_id: refId,
    ref_type: refType,
    action,
    removed,
    operational_phase: operational_phase || undefined,
    status_code,
    note: opts?.note,
    next_followup_at,
    followup_due,
    optimistic: true,
  }
}

export function applyProgressPatchToLists(
  openItems: any[],
  closedItems: any[],
  patch: ProgressPatch,
): { open: any[]; closed: any[] } {
  const match = (i: any) => String(i.ref_id) === String(patch.ref_id)
  let open = [...openItems]
  let closed = [...closedItems]
  const fromOpen = open.find(match)
  const fromClosed = closed.find(match)
  const base = fromOpen || fromClosed
  if (!base) return { open, closed }

  if (patch.action === 'note' && !patch.operational_phase) {
    const update = (list: any[]) =>
      list.map((i) =>
        match(i)
          ? {
              ...i,
              notes: patch.note
                ? [i.notes, patch.note].filter(Boolean).join('\n').slice(0, 2000)
                : i.notes,
            }
          : i,
      )
    return { open: update(open), closed: update(closed) }
  }

  const nextPhase = patch.operational_phase || base.operational_phase
  const next = {
    ...base,
    operational_phase: nextPhase,
    status_code: patch.status_code || base.status_code,
    followup_due: patch.followup_due ?? base.followup_due,
    next_followup_at:
      patch.next_followup_at !== undefined ? patch.next_followup_at : base.next_followup_at,
    next_action:
      nextPhase === 'contacted'
        ? (patch.action === 'sent' || patch.action === 'called'
          ? 'Registrar resultado do contato'
          : 'Follow-up — mensagem, ligação ou avançar')
        : nextPhase === 'engaged'
          ? 'Qualificar interesse e avançar'
          : base.next_action,
    notes: patch.note
      ? [base.notes, patch.note].filter(Boolean).join('\n').slice(0, 2000)
      : base.notes,
    last_interaction_at: new Date().toISOString(),
  }

  open = open.filter((i) => !match(i))
  closed = closed.filter((i) => !match(i))

  if (patch.removed || next.operational_phase === 'closed') {
    if (patch.action !== 'dismiss' && patch.action !== 'convert') {
      closed = [{ ...next, operational_phase: 'closed', status_code: next.status_code || 'lost' }, ...closed]
    }
    /* dismiss/convert: some das duas listas */
  } else {
    open = [next, ...open]
  }
  return { open, closed }
}

/* ── Cache ─────────────────────────────────────────────── */

export function readOpportunitiesCache(brandId?: string | null): OpportunitiesCacheBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OpportunitiesCacheBundle
    if (!parsed || !Array.isArray(parsed.all_open)) return null
    if (brandId && parsed.brand_id && parsed.brand_id !== brandId) return null
    /* 7 dias de validade máxima */
    if (parsed.saved_at && Date.now() - parsed.saved_at > 7 * 86400000) return null
    return parsed
  } catch {
    return null
  }
}

export function writeOpportunitiesCache(bundle: {
  all_open: any[]
  all_closed?: any[]
  stats?: any
  facets?: any
  brand_id?: string | null
}) {
  try {
    const prev = readOpportunitiesCache()
    const payload: OpportunitiesCacheBundle = {
      all_open: bundle.all_open || [],
      all_closed: bundle.all_closed ?? prev?.all_closed ?? [],
      stats: bundle.stats ?? prev?.stats ?? null,
      facets: bundle.facets ?? prev?.facets ?? null,
      saved_at: Date.now(),
      brand_id: bundle.brand_id ?? prev?.brand_id ?? null,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function patchOpportunitiesCache(patch: ProgressPatch, brandId?: string | null) {
  const cur = readOpportunitiesCache(brandId)
  if (!cur) return
  const { open, closed } = applyProgressPatchToLists(cur.all_open, cur.all_closed || [], patch)
  writeOpportunitiesCache({
    all_open: open,
    all_closed: closed,
    stats: cur.stats,
    facets: cur.facets,
    brand_id: brandId ?? cur.brand_id,
  })
}

/* ── Offline progress queue ───────────────────────────── */

function readQueue(): QueuedProgress[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

function writeQueue(events: QueuedProgress[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)))
  } catch {
    /* ignore */
  }
}

export function enqueueProgress(
  refType: string,
  refId: string,
  payload: QueuedProgress['payload'],
): QueuedProgress {
  const event: QueuedProgress = {
    id: uid(),
    ref_type: refType,
    ref_id: refId,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  const all = readQueue().filter(
    (e) => !(e.ref_type === refType && e.ref_id === refId && e.payload.action === payload.action),
  )
  all.push(event)
  writeQueue(all)
  return event
}

export function pendingProgressCount(): number {
  return readQueue().length
}

export function listPendingProgress(): QueuedProgress[] {
  return readQueue()
}

let flushPromise: Promise<{ flushed: number; failed: number }> | null = null

export async function flushProgressQueue(): Promise<{ flushed: number; failed: number }> {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { flushed: 0, failed: 0 }
  }

  flushPromise = (async () => {
    let events = readQueue()
    if (!events.length) return { flushed: 0, failed: 0 }
    let flushed = 0
    let failed = 0
    const remaining: QueuedProgress[] = []

    for (const ev of events) {
      try {
        await affiliateApi.progressOpportunity(ev.ref_type, ev.ref_id, ev.payload as any)
        flushed += 1
      } catch (e) {
        const attempts = ev.attempts + 1
        if (attempts >= MAX_ATTEMPTS || !isNetworkLikeError(e)) {
          failed += 1
          continue
        }
        remaining.push({
          ...ev,
          attempts,
          last_error: e instanceof Error ? e.message : 'erro',
        })
      }
    }
    writeQueue(remaining)
    return { flushed, failed }
  })().finally(() => {
    flushPromise = null
  })

  return flushPromise
}

export function startAffiliateCrmSyncLoop() {
  if (typeof window === 'undefined') return () => {}
  const tick = () => {
    void flushProgressQueue()
  }
  window.addEventListener('online', tick)
  window.addEventListener('focus', tick)
  const id = window.setInterval(tick, 45_000)
  tick()
  return () => {
    window.removeEventListener('online', tick)
    window.removeEventListener('focus', tick)
    window.clearInterval(id)
  }
}
