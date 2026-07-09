import { useCallback, useEffect, useState } from 'react'
import {
  MessageCircle, RefreshCw, Loader2, Search, Send, Zap,
  AlertCircle, CheckCircle2, ChevronLeft,
} from 'lucide-react'
import { instagramApi } from '@/lib/instagram/pageApi'

type IgMessage = {
  id: string
  message: string
  from_id?: string
  from_username?: string
  direction: 'incoming' | 'outgoing'
  created_time: string
}

type IgThread = {
  id: string
  sender_id: string
  username?: string
  updated_time?: string
  last_message?: string
  last_message_at?: string
  message_count: number
  source: 'api' | 'local' | 'merged'
  messages: IgMessage[]
}

type WebhookEvent = {
  id: string
  event_type: string
  field?: string
  triggered_by?: string
  processed_at: string
  dispatch_result?: string | Record<string, unknown>
}

type Props = {
  initialCount?: number
}

function fmtTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function parseDispatchResult(raw?: string | Record<string, unknown>) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function InstagramMessagesTab({ initialCount = 0 }: Props) {
  const [threads, setThreads] = useState<IgThread[]>([])
  const [meta, setMeta] = useState<{ api_count?: number; local_count?: number; api_error?: string } | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [mobileShowChat, setMobileShowChat] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [convRes, evRes] = await Promise.all([
        instagramApi('/conversations'),
        instagramApi('/webhook/events?limit=12'),
      ])
      if (convRes.success) {
        setThreads(convRes.conversations || [])
        setMeta(convRes.meta || null)
      }
      if (evRes.success) setEvents(evRes.events || [])
    } catch {
      /* ignore */
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const selected = threads.find((t) => t.id === selectedId) || null

  const filtered = search.trim()
    ? threads.filter((t) => {
        const q = search.toLowerCase()
        return (
          (t.username || '').toLowerCase().includes(q)
          || (t.sender_id || '').includes(q)
          || (t.last_message || '').toLowerCase().includes(q)
        )
      })
    : threads

  const selectThread = (thread: IgThread) => {
    setSelectedId(thread.id)
    setSendError('')
    setMobileShowChat(true)
  }

  const sendReply = async () => {
    if (!selected || !reply.trim()) return
    setSending(true)
    setSendError('')
    try {
      const res = await instagramApi('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ recipient_id: selected.sender_id, text: reply.trim() }),
      })
      if (!res.success) {
        setSendError(res.error || 'Falha ao enviar')
        return
      }
      const optimistic: IgMessage = {
        id: res.message_id || `local-${Date.now()}`,
        message: reply.trim(),
        direction: 'outgoing',
        created_time: new Date().toISOString(),
      }
      setThreads((prev) => prev.map((t) => (
        t.id === selected.id
          ? {
              ...t,
              messages: [...t.messages, optimistic],
              last_message: optimistic.message,
              last_message_at: optimistic.created_time,
              message_count: t.message_count + 1,
            }
          : t
      )))
      setReply('')
    } catch (e: any) {
      setSendError(e?.message || 'Falha ao enviar')
    }
    setSending(false)
  }

  const dmEvents = events.filter((e) => e.field === 'messaging' || e.event_type?.includes('dm') || e.event_type?.includes('mencao'))

  return (
    <div className="ig-messages">
      <div className="ig-messages__toolbar">
        <p className="ig-messages__stats">
          Direct do Instagram · {threads.length || initialCount} conversa{(threads.length || initialCount) === 1 ? '' : 's'}
          {meta && (
            <>
              {' · '}
              {meta.api_count ?? 0} via API
              {(meta.local_count ?? 0) > 0 && ` · ${meta.local_count} via webhook`}
            </>
          )}
        </p>
        <div className="ig-messages__toolbar-actions">
          <div className="ig-messages__search">
            <Search size={14} className="ig-messages__search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas…"
              className="ig-messages__search-input"
            />
          </div>
          <button type="button" className="ig-messages__refresh" onClick={() => void load()} title="Atualizar" aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {meta?.api_error && (
        <div className="ig-messages__notice" role="status">
          <AlertCircle size={14} />
          <span>
            API de conversas: {meta.api_error}. Mensagens recebidas por webhook continuam visíveis abaixo.
          </span>
        </div>
      )}

      <div className={`ig-messages__layout${mobileShowChat && selected ? ' is-chat-open' : ''}`}>
        <aside className="ig-messages__list-panel">
          <div className="ig-messages__list-head">
            <span>Conversas</span>
            <span className="tabular-nums">{filtered.length}</span>
          </div>
          {loading ? (
            <div className="ig-messages__loading"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
          ) : filtered.length === 0 ? (
            <div className="ig-messages__empty">
              <MessageCircle size={28} className="text-gray-200" />
              <p>Nenhuma conversa ainda</p>
              <span>DMs aparecem aqui via API ou webhook (automações)</span>
            </div>
          ) : (
            <ul className="ig-messages__list">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`ig-messages__thread${selectedId === t.id ? ' is-active' : ''}`}
                    onClick={() => selectThread(t)}
                  >
                    <div className="ig-messages__thread-avatar">
                      {(t.username || t.sender_id || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="ig-messages__thread-body">
                      <div className="ig-messages__thread-top">
                        <span className="ig-messages__thread-name">
                          {t.username ? `@${t.username}` : `ID ${t.sender_id.slice(0, 8)}…`}
                        </span>
                        <span className="ig-messages__thread-time">{fmtTime(t.last_message_at || t.updated_time)}</span>
                      </div>
                      <p className="ig-messages__thread-preview">{t.last_message || '—'}</p>
                      <div className="ig-messages__thread-meta">
                        <span className="ig-messages__thread-badge">{t.source}</span>
                        <span className="tabular-nums">{t.message_count} msgs</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="ig-messages__chat-panel">
          {selected ? (
            <>
              <header className="ig-messages__chat-head">
                <button
                  type="button"
                  className="ig-messages__back"
                  onClick={() => setMobileShowChat(false)}
                  aria-label="Voltar para conversas"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="min-w-0">
                  <p className="ig-messages__chat-title">
                    {selected.username ? `@${selected.username}` : `Participante ${selected.sender_id.slice(0, 10)}…`}
                  </p>
                  <p className="ig-messages__chat-sub">{selected.message_count} mensagens · origem {selected.source}</p>
                </div>
              </header>

              <div className="ig-messages__chat-body">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`ig-messages__bubble${m.direction === 'outgoing' ? ' is-out' : ' is-in'}`}
                  >
                    {m.message || '(sem texto)'}
                    <time className="ig-messages__bubble-time">{fmtTime(m.created_time)}</time>
                  </div>
                ))}
              </div>

              <footer className="ig-messages__composer">
                {sendError && <p className="ig-messages__send-error">{sendError}</p>}
                <div className="ig-messages__composer-row">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Responder no Direct…"
                    className="ig-messages__composer-input"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply() } }}
                  />
                  <button
                    type="button"
                    className="ig-messages__composer-send"
                    disabled={sending || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="ig-messages__chat-placeholder">
              <MessageCircle size={36} className="text-gray-200" />
              <p>Selecione uma conversa</p>
              <span>Monitore DMs e valide se os webhooks estão alimentando as automações</span>
            </div>
          )}
        </section>
      </div>

      <section className="ig-messages__events" aria-label="Eventos recentes de webhook">
        <div className="ig-messages__events-head">
          <Zap size={14} />
          <h3>Automações · eventos recentes</h3>
          <span className="tabular-nums">{dmEvents.length}</span>
        </div>
        {dmEvents.length === 0 ? (
          <p className="ig-messages__events-empty">Nenhum evento de DM registrado. Ative as automações e o subscribe de webhook.</p>
        ) : (
          <ul className="ig-messages__events-list">
            {dmEvents.map((ev) => {
              const dispatch = parseDispatchResult(ev.dispatch_result)
              const matched = Number((dispatch as any)?.matched ?? 0)
              const ok = matched > 0
              return (
                <li key={ev.id} className="ig-messages__event-row">
                  {ok ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> : <AlertCircle size={14} className="text-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="ig-messages__event-type">{ev.event_type}</p>
                    <p className="ig-messages__event-meta">
                      {ev.triggered_by ? `de ${ev.triggered_by.slice(0, 12)}… · ` : ''}
                      {fmtTime(ev.processed_at)}
                      {matched > 0 ? ` · ${matched} automação(ões)` : ' · sem match'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}