import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, GripVertical, Plus, Sparkles } from 'lucide-react'
import {
  POST_STATUS_LABELS,
  POST_TYPE_LABELS,
  scheduleIsoFromLocal,
  toDatetimeLocalValue,
  type PostType,
} from '@/lib/instagram/createForm'
import { instagramApi } from '@/lib/instagram/pageApi'

const api = instagramApi

type CalendarPost = {
  id: string
  media_type?: string
  caption?: string
  status: string
  _source: 'local' | 'instagram'
  _date?: string
  scheduled_at?: string
}

type Props = {
  onOpenPost?: (post: CalendarPost) => void
  onCreateForDay?: (scheduledAtLocal: string) => void
  onPostsChanged?: () => void
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_DOT: Record<string, string> = {
  published: 'ig-cal__dot--published',
  scheduled: 'ig-cal__dot--scheduled',
  draft: 'ig-cal__dot--draft',
  failed: 'ig-cal__dot--failed',
  publishing: 'ig-cal__dot--publishing',
}

function dayKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

type PostingSuggestions = {
  best_hour: number
  best_minute: number
  best_label: string
  source: 'media_history' | 'default'
  heatmap: Array<{ hour: number; score: number; samples: number }>
}

export function InstagramCalendarTab({ onOpenPost, onCreateForDay, onPostsChanged }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [igPublished, setIgPublished] = useState(0)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<PostingSuggestions | null>(null)

  const load = useCallback(() => {
    Promise.all([api('/posts?limit=200'), api('/media?limit=200')]).then(([localRes, mediaRes]) => {
      const local = (localRes.success ? localRes.posts || [] : []).map((p: any) => ({
        ...p,
        _source: 'local' as const,
        _date: p.scheduled_at || p.published_at || p.created_at,
      }))
      const ig = (mediaRes.success ? mediaRes.media || [] : []).map((m: any) => ({
        ...m,
        _source: 'instagram' as const,
        status: 'published',
        _date: m.timestamp,
      }))
      setIgPublished(ig.length)
      setPosts([...local, ...ig])
    })
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api('/scheduling/suggestions').then((res) => {
      if (res.success && res.suggestions) setSuggestions(res.suggestions)
    }).catch(() => {})
  }, [])

  const suggestedSlot = (base?: Date) => {
    const d = base ? new Date(base) : new Date()
    const hour = suggestions?.best_hour ?? 18
    const minute = suggestions?.best_minute ?? 0
    d.setHours(hour, minute, 0, 0)
    if (d < new Date(Date.now() + 15 * 60_000)) {
      d.setDate(d.getDate() + 1)
    }
    return d
  }

  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const weekStart = startOfWeek(anchor)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()])

  const prev = () => {
    if (view === 'week') setAnchor(addDays(anchor, -7))
    else setAnchor(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }
  const next = () => {
    if (view === 'week') setAnchor(addDays(anchor, 7))
    else setAnchor(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  const getPostsForDayKey = (key: string) =>
    posts.filter((p) => String(p._date || '').startsWith(key))

  const getPostsForDay = (day: number) => {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return getPostsForDayKey(d)
  }

  const cells: Array<number | null> = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthPosts = posts.filter((p) =>
    String(p._date || '').startsWith(`${year}-${String(month + 1).padStart(2, '0')}`),
  )

  const selectedPosts = selectedDay ? getPostsForDay(selectedDay) : []

  const handleCreateForSelected = () => {
    if (!selectedDay || !onCreateForDay) return
    const d = suggestedSlot(new Date(year, month, selectedDay))
    onCreateForDay(toDatetimeLocalValue(d))
  }

  const dropOnDay = async (target: Date, postId: string) => {
    const post = posts.find((p) => p.id === postId && p._source === 'local')
    if (!post || !['scheduled', 'draft', 'failed'].includes(post.status)) return

    const prevDate = post.scheduled_at ? new Date(post.scheduled_at) : new Date()
    const next = new Date(target)
    next.setHours(prevDate.getHours(), prevDate.getMinutes(), 0, 0)
    if (next < new Date(Date.now() + 15 * 60_000)) {
      next.setHours(new Date().getHours(), new Date().getMinutes() + 30, 0, 0)
    }

    setSaving(true)
    try {
      const res = await api(`/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_at: scheduleIsoFromLocal(toDatetimeLocalValue(next)),
          error_message: null,
        }),
      })
      if (res.success) {
        load()
        onPostsChanged?.()
      }
    } finally {
      setSaving(false)
      setDragId(null)
    }
  }

  return (
    <div className="ig-cal">
      <div className="ig-cal__header">
        <button type="button" onClick={prev} className="ig-cal__nav" aria-label="Anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="ig-cal__title-wrap">
          <h2 className="ig-cal__title">
            {view === 'week'
              ? `Semana ${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
              : `${MONTH_NAMES[month]} ${year}`}
          </h2>
          <p className="ig-cal__subtitle">
            {monthPosts.length} posts neste mês · {igPublished} no Instagram
            {saving ? ' · salvando…' : ''}
          </p>
        </div>
        <button type="button" onClick={next} className="ig-cal__nav" aria-label="Próximo">
          <ChevronRight size={16} />
        </button>
      </div>

      {suggestions && (
        <div className="ig-cal__suggest">
          <Sparkles size={14} className="text-purple-500 shrink-0" />
          <div className="min-w-0">
            <p className="ig-cal__suggest-title">
              Melhor horário sugerido: <strong>{suggestions.best_label}</strong>
              {suggestions.source === 'media_history' ? ' · baseado nos seus posts' : ' · padrão'}
            </p>
            {suggestions.heatmap.some((h) => h.samples > 0) && (
              <div className="ig-cal__heatmap" aria-hidden>
                {suggestions.heatmap.map((h) => {
                  const max = Math.max(...suggestions.heatmap.map((x) => x.score), 1)
                  const height = Math.max(8, Math.round((h.score / max) * 100))
                  return (
                    <span
                      key={h.hour}
                      className={`ig-cal__heatmap-bar${h.hour === suggestions.best_hour ? ' is-best' : ''}`}
                      style={{ height: `${height}%` }}
                      title={`${String(h.hour).padStart(2, '0')}h · score ${h.score}`}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ig-cal__view-toggle" role="tablist">
        <button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}>
          Mes
        </button>
        <button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}>
          Semana
        </button>
      </div>

      {view === 'month' ? (
        <div className="ig-cal__grid">
          {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map((d) => (
            <div key={d} className="ig-cal__weekday">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="ig-cal__cell ig-cal__cell--empty" />
            const dayPosts = getPostsForDay(day)
            const isToday =
              today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
            const isSelected = selectedDay === day
            return (
              <button
                key={day}
                type="button"
                className={`ig-cal__cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${dayPosts.length ? ' has-posts' : ''}`}
                onClick={() => setSelectedDay(day)}
              >
                <span className="ig-cal__day-num">{day}</span>
                <div className="ig-cal__dots">
                  {dayPosts.slice(0, 4).map((p, j) => (
                    <span
                      key={j}
                      className={`ig-cal__dot ${p._source === 'instagram' ? 'ig-cal__dot--published' : STATUS_DOT[p.status] || ''}`}
                    />
                  ))}
                </div>
                {dayPosts.length > 0 && <span className="ig-cal__count">{dayPosts.length}</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="ig-cal__week">
          {weekDays.map((d) => {
            const key = dayKeyFromDate(d)
            const dayPosts = getPostsForDayKey(key)
            const isToday = dayKeyFromDate(today) === key
            return (
              <div
                key={key}
                className={`ig-cal__week-col${isToday ? ' is-today' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/post-id') || dragId
                  if (id) void dropOnDay(d, id)
                }}
              >
                <p className="ig-cal__week-col-head">
                  {d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
                </p>
                <ul className="ig-cal__week-list">
                  {dayPosts.map((p) => {
                    const draggable = p._source === 'local' && ['scheduled', 'draft', 'failed'].includes(p.status)
                    return (
                      <li key={`${p._source}-${p.id}`}>
                        <button
                          type="button"
                          className={`ig-cal__week-item${draggable ? ' is-draggable' : ''}`}
                          draggable={draggable}
                          onDragStart={(e) => {
                            if (!draggable) return
                            setDragId(p.id)
                            e.dataTransfer.setData('text/post-id', p.id)
                          }}
                          onClick={() => p._source === 'local' && onOpenPost?.(p)}
                        >
                          {draggable && <GripVertical size={10} className="ig-cal__drag" />}
                          <span className={`ig-cal__dot ${STATUS_DOT[p.status] || ''}`} />
                          <span className="ig-cal__week-time">
                            {p._date ? new Date(p._date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </span>
                          <span className="ig-cal__week-caption">{p.caption || '(sem legenda)'}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {onCreateForDay && (
                  <button
                    type="button"
                    className="ig-cal__week-add"
                    onClick={() => onCreateForDay(toDatetimeLocalValue(suggestedSlot(d)))}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="ig-cal__legend">
        {[
          { label: 'Publicado', cls: 'ig-cal__dot--published' },
          { label: 'Agendado', cls: 'ig-cal__dot--scheduled' },
          { label: 'Rascunho', cls: 'ig-cal__dot--draft' },
          { label: 'Falhou', cls: 'ig-cal__dot--failed' },
        ].map((l) => (
          <span key={l.label} className="ig-cal__legend-item">
            <span className={`ig-cal__dot ${l.cls}`} />
            {l.label}
          </span>
        ))}
        {view === 'week' && <span className="ig-cal__legend-hint">Arraste posts locais entre dias para reagendar</span>}
      </div>

      {view === 'month' && selectedDay && (
        <div className="ig-cal__panel">
          <div className="ig-cal__panel-head">
            <h3>
              <CalendarClock size={14} />
              {selectedDay} de {MONTH_NAMES[month]}
            </h3>
            {onCreateForDay && (
              <button type="button" className="ig-cal__create-btn" onClick={handleCreateForSelected}>
                <Plus size={14} /> Criar post
              </button>
            )}
          </div>

          {selectedPosts.length === 0 ? (
            <p className="ig-cal__empty">
              <Sparkles size={14} />
              Nenhum post neste dia. Clique em criar para agendar.
            </p>
          ) : (
            <ul className="ig-cal__list">
              {selectedPosts.map((p) => {
                const typeLabel = POST_TYPE_LABELS[(p.media_type || 'IMAGE') as PostType] || p.media_type
                const statusLabel =
                  p._source === 'instagram' ? 'No Instagram' : POST_STATUS_LABELS[p.status] || p.status
                return (
                  <li key={`${p._source}-${p.id}`}>
                    <button
                      type="button"
                      className="ig-cal__list-item"
                      onClick={() => p._source === 'local' && onOpenPost?.(p)}
                      disabled={p._source !== 'local'}
                    >
                      <span className={`ig-cal__dot ${p._source === 'instagram' ? 'ig-cal__dot--published' : STATUS_DOT[p.status] || ''}`} />
                      <span className="ig-cal__list-type">{typeLabel}</span>
                      <span className="ig-cal__list-status">{statusLabel}</span>
                      <span className="ig-cal__list-caption">{p.caption || '(sem legenda)'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
