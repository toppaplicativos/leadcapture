import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import {
  formatScheduleLabel,
  POST_STATUS_LABELS,
  POST_TYPE_LABELS,
  scheduleIsoFromLocal,
  scheduleLocalFromOffset,
  toDatetimeLocalValue,
  validateSchedule,
  type PostType,
} from '@/lib/instagram/createForm'
import { instagramApi } from '@/lib/instagram/pageApi'
import { PostMediaCarousel } from '@/components/instagram/PostMediaCarousel'

const api = instagramApi

type LocalPost = {
  id: string
  media_type?: PostType
  media_url?: string
  thumbnail_url?: string
  media_items?: Array<{ url: string; type: string }>
  caption?: string
  status: string
  scheduled_at?: string
  published_at?: string
  created_at?: string
  permalink?: string
  error_message?: string
}

type Props = {
  post: LocalPost | null
  open: boolean
  onClose: () => void
  onEdit: (postId: string) => void
  onRefresh: () => void
}

export function InstagramPostQueueSheet({ post, open, onClose, onEdit, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; permalink?: string } | null>(null)
  const [rescheduleAt, setRescheduleAt] = useState('')
  const [rescheduleError, setRescheduleError] = useState('')

  useEffect(() => {
    if (!open) {
      setBusy(null)
      setFeedback(null)
      setRescheduleError('')
    }
  }, [open, post?.id])

  useEffect(() => {
    if (!post?.scheduled_at) {
      setRescheduleAt(scheduleLocalFromOffset(60))
      return
    }
    setRescheduleAt(toDatetimeLocalValue(new Date(post.scheduled_at)))
  }, [post?.id, post?.scheduled_at])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onClose])

  if (!open || !post) return null

  const typeLabel = POST_TYPE_LABELS[(post.media_type || 'IMAGE') as PostType] || post.media_type
  const statusLabel = POST_STATUS_LABELS[post.status] || post.status
  const canEdit = ['draft', 'scheduled', 'failed'].includes(post.status)
  const canPublish = ['draft', 'scheduled', 'failed'].includes(post.status)
  const canRetry = post.status === 'failed'
  const canDraft = post.status === 'scheduled' || post.status === 'failed'
  const canReschedule = ['scheduled', 'failed', 'draft'].includes(post.status)

  const run = async (action: string, fn: () => Promise<void>) => {
    setBusy(action)
    setFeedback(null)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const handlePublish = () =>
    run('publish', async () => {
      const pub = await api(`/posts/${post.id}/publish`, { method: 'POST' })
      if (!pub.success || pub.ok === false) {
        setFeedback({ ok: false, message: pub.message || pub.error || 'Falha ao publicar.' })
        onRefresh()
        return
      }
      setFeedback({
        ok: true,
        message: pub.message || 'Publicado com sucesso!',
        permalink: pub.permalink,
      })
      onRefresh()
    })

  const handleScheduleSoon = (minutes: number) =>
    run(`soon-${minutes}`, async () => {
      const local = scheduleLocalFromOffset(minutes)
      const err = validateSchedule(local)
      if (err) {
        setFeedback({ ok: false, message: err })
        return
      }
      const res = await api(`/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_at: scheduleIsoFromLocal(local),
          error_message: null,
        }),
      })
      if (!res.success) {
        setFeedback({ ok: false, message: res.error || 'Falha ao agendar.' })
        return
      }
      setRescheduleAt(local)
      setFeedback({ ok: true, message: `Agendado para ${formatScheduleLabel(local)}.` })
      onRefresh()
    })

  const handleReschedule = () =>
    run('reschedule', async () => {
      const err = validateSchedule(rescheduleAt)
      if (err) {
        setRescheduleError(err)
        return
      }
      setRescheduleError('')
      const res = await api(`/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_at: scheduleIsoFromLocal(rescheduleAt),
          error_message: null,
        }),
      })
      if (!res.success) {
        setFeedback({ ok: false, message: res.error || 'Falha ao reagendar.' })
        return
      }
      setFeedback({ ok: true, message: `Reagendado: ${formatScheduleLabel(rescheduleAt)}` })
      onRefresh()
    })

  const handleDuplicate = () =>
    run('duplicate', async () => {
      const res = await api(`/posts/${post.id}/duplicate`, { method: 'POST' })
      if (!res.success) {
        setFeedback({ ok: false, message: res.error || 'Falha ao duplicar.' })
        return
      }
      setFeedback({ ok: true, message: 'Copia salva como rascunho na fila.' })
      onRefresh()
    })

  const handleToDraft = () =>
    run('draft', async () => {
      const res = await api(`/posts/${post.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'draft', scheduled_at: null, error_message: null }),
      })
      if (!res.success) {
        setFeedback({ ok: false, message: res.error || 'Falha ao converter.' })
        return
      }
      setFeedback({ ok: true, message: 'Convertido para rascunho.' })
      onRefresh()
    })

  const handleDelete = () =>
    run('delete', async () => {
      if (!confirm('Excluir este post da fila?')) return
      const res = await api(`/posts/${post.id}`, { method: 'DELETE' })
      if (!res.success) {
        setFeedback({ ok: false, message: res.error || 'Falha ao excluir.' })
        return
      }
      onRefresh()
      onClose()
    })

  return createPortal(
    <div className="ig-queue-sheet" role="dialog" aria-modal="true" aria-labelledby="ig-queue-title">
      <button type="button" className="ig-queue-sheet__backdrop" aria-label="Fechar" onClick={onClose} disabled={!!busy} />

      <aside className="ig-queue-sheet__panel">
        <header className="ig-queue-sheet__head">
          <div>
            <p className="ig-queue-sheet__eyebrow">
              <InstagramIcon size={12} />
              Fila local · {typeLabel}
            </p>
            <h2 id="ig-queue-title" className="ig-queue-sheet__title">
              {statusLabel}
            </h2>
          </div>
          <button type="button" className="ig-queue-sheet__close" onClick={onClose} disabled={!!busy} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="ig-queue-sheet__body">
          <PostMediaCarousel post={post} className="ig-queue-sheet__thumb" />

          <p className="ig-queue-sheet__caption">{post.caption || '(sem legenda)'}</p>

          <dl className="ig-queue-sheet__meta">
            {post.scheduled_at && (
              <div>
                <dt><CalendarClock size={12} /> Agendado</dt>
                <dd>{formatScheduleLabel(toDatetimeLocalValue(new Date(post.scheduled_at)))}</dd>
              </div>
            )}
            {post.created_at && (
              <div>
                <dt><FileText size={12} /> Criado</dt>
                <dd>{new Date(post.created_at).toLocaleString('pt-BR')}</dd>
              </div>
            )}
          </dl>

          {canReschedule && (
            <div className="ig-queue-sheet__reschedule">
              <p className="ig-queue-sheet__reschedule-title">
                <Clock size={12} /> Reagendar
              </p>
              <div className="ig-queue-sheet__quick">
                {[
                  { label: '15 min', min: 15 },
                  { label: '30 min', min: 30 },
                  { label: '1 hora', min: 60 },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="ig-queue-sheet__chip"
                    disabled={!!busy}
                    onClick={() => handleScheduleSoon(chip.min)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                step={900}
                value={rescheduleAt}
                onChange={(e) => {
                  setRescheduleAt(e.target.value)
                  setRescheduleError('')
                }}
                className="ig-queue-sheet__datetime"
              />
              {rescheduleError && <p className="ig-queue-sheet__reschedule-error">{rescheduleError}</p>}
              <button type="button" className="ig-queue-sheet__reschedule-btn" onClick={handleReschedule} disabled={!!busy}>
                Salvar novo horario
              </button>
            </div>
          )}

          {post.status === 'failed' && post.error_message && (
            <div className="ig-queue-sheet__error" role="alert">
              <AlertCircle size={16} />
              <p>{post.error_message}</p>
            </div>
          )}

          {feedback && (
            <div className={`ig-queue-sheet__feedback${feedback.ok ? ' is-ok' : ' is-error'}`}>
              {feedback.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p>{feedback.message}</p>
              {feedback.permalink && (
                <a href={feedback.permalink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} /> Ver no Instagram
                </a>
              )}
            </div>
          )}
        </div>

        <footer className="ig-queue-sheet__footer">
          {canEdit && (
            <Button variant="brand" fullWidth iconLeft={<Pencil size={16} />} onClick={() => onEdit(post.id)} disabled={!!busy}>
              Editar
            </Button>
          )}
          {canPublish && (
            <Button
              variant="primary"
              fullWidth
              iconLeft={busy === 'publish' ? <Loader2 size={16} className="animate-spin" /> : canRetry ? <RefreshCw size={16} /> : <Send size={16} />}
              onClick={handlePublish}
              disabled={!!busy}
            >
              {canRetry ? 'Tentar novamente' : 'Publicar agora'}
            </Button>
          )}
          <Button variant="secondary" fullWidth iconLeft={<Copy size={16} />} onClick={handleDuplicate} disabled={!!busy}>
            Duplicar rascunho
          </Button>
          {canDraft && (
            <Button variant="secondary" fullWidth onClick={handleToDraft} disabled={!!busy}>
              Converter em rascunho
            </Button>
          )}
          <Button
            variant="ghost"
            fullWidth
            iconLeft={busy === 'delete' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            onClick={handleDelete}
            disabled={!!busy}
          >
            Excluir
          </Button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}