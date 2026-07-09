import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  ListOrdered,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'

export type InstagramPublishPhase =
  | 'publishing'
  | 'saving'
  | 'success'
  | 'scheduled'
  | 'draft'
  | 'error'

type Props = {
  open: boolean
  phase: InstagramPublishPhase
  postTypeLabel?: string
  username?: string
  previewUrl?: string
  permalink?: string
  scheduledAtLabel?: string
  message?: string
  savedPostId?: string
  onClose: () => void
  onCreateAnother?: () => void
  onViewQueue?: () => void
}

const PUBLISH_STEPS = [
  'Preparando sua midia…',
  'Enviando para o Instagram…',
  'Publicando no feed…',
]

const SAVE_STEPS = ['Salvando midia…', 'Registrando legenda…', 'Finalizando…']

export function InstagramPublishModal({
  open,
  phase,
  postTypeLabel,
  username,
  previewUrl,
  permalink,
  scheduledAtLabel,
  message,
  onClose,
  onCreateAnother,
  onViewQueue,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  const isBusy = phase === 'publishing' || phase === 'saving'
  const steps = phase === 'saving' ? SAVE_STEPS : PUBLISH_STEPS

  useEffect(() => {
    if (!open || !isBusy) {
      setStepIndex(0)
      return
    }
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % steps.length)
    }, 2200)
    return () => clearInterval(timer)
  }, [open, isBusy, steps.length])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, isBusy, onClose])

  if (!open) return null

  const isPublishing = phase === 'publishing'
  const isSaving = phase === 'saving'
  const isSuccess = phase === 'success'
  const isError = phase === 'error'
  const isScheduled = phase === 'scheduled'
  const isDraft = phase === 'draft'

  const title = isPublishing
    ? 'Publicando no Instagram'
    : isSaving
      ? 'Salvando post'
      : isSuccess
        ? 'Post publicado!'
        : isError
          ? 'Nao foi possivel concluir'
          : isScheduled
            ? 'Post agendado!'
            : 'Rascunho salvo!'

  const subtitle = isPublishing
    ? PUBLISH_STEPS[stepIndex]
    : isSaving
      ? SAVE_STEPS[stepIndex]
      : isSuccess
        ? `Seu ${postTypeLabel || 'post'} ja esta no @${username || 'instagram'}.`
        : isError
          ? message || 'Tente novamente em instantes.'
          : isScheduled
            ? scheduledAtLabel
              ? `Publicacao prevista para ${scheduledAtLabel}.`
              : 'O post foi salvo na fila de agendamento.'
            : 'Voce pode editar e publicar quando quiser na aba Posts.'

  const badgeClass = [
    'ig-publish-modal__badge',
    isPublishing && 'is-publishing',
    isSaving && 'is-saving',
    isSuccess && 'is-success',
    isError && 'is-error',
    isScheduled && 'is-scheduled',
    isDraft && 'is-draft',
  ]
    .filter(Boolean)
    .join(' ')

  return createPortal(
    <div
      className="ig-publish-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ig-publish-title"
    >
      <button
        type="button"
        className="ig-publish-modal__backdrop"
        aria-label="Fechar"
        onClick={isBusy ? undefined : onClose}
        disabled={isBusy}
      />

      <div className="ig-publish-modal__panel">
        <button
          type="button"
          className="ig-publish-modal__close"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="ig-publish-modal__hero">
          {previewUrl ? (
            <div className="ig-publish-modal__thumb" aria-hidden>
              <img src={previewUrl} alt="" />
              {isBusy && <div className="ig-publish-modal__thumb-shimmer" />}
            </div>
          ) : null}

          <div className={badgeClass} aria-hidden>
            {isBusy ? (
              <div className="ig-publish-modal__ring">
                <Loader2 size={28} className="ig-publish-modal__spin" />
              </div>
            ) : isSuccess ? (
              <CheckCircle2 size={34} className="ig-publish-modal__icon-pop" />
            ) : isError ? (
              <AlertCircle size={34} className="ig-publish-modal__icon-pop" />
            ) : isScheduled ? (
              <CalendarClock size={32} className="ig-publish-modal__icon-pop" />
            ) : (
              <FileText size={32} className="ig-publish-modal__icon-pop" />
            )}
          </div>
        </div>

        <div className="ig-publish-modal__copy">
          <p className="ig-publish-modal__eyebrow">
            <InstagramIcon size={13} />
            Instagram
            {postTypeLabel ? ` · ${postTypeLabel}` : ''}
          </p>
          <h2 id="ig-publish-title" className="ig-publish-modal__title">
            {title}
          </h2>
          <p className="ig-publish-modal__subtitle">{subtitle}</p>

          {isScheduled && scheduledAtLabel && (
            <div className="ig-publish-modal__schedule-chip">
              <CalendarClock size={14} />
              {scheduledAtLabel}
            </div>
          )}

          {isBusy && (
            <div className="ig-publish-modal__progress" aria-hidden>
              <span className="ig-publish-modal__progress-bar" />
            </div>
          )}

          {isSuccess && permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="ig-publish-modal__permalink"
            >
              <ExternalLink size={14} />
              Abrir post no Instagram
            </a>
          )}
        </div>

        <footer className="ig-publish-modal__footer">
          {isBusy ? (
            <p className="ig-publish-modal__hint">
              <Sparkles size={12} />
              {isPublishing
                ? 'Nao feche esta janela enquanto publicamos'
                : 'Salvando seu post na fila local…'}
            </p>
          ) : (
            <div className="ig-publish-modal__actions">
              {isSuccess && permalink && (
                <Button
                  variant="brand"
                  fullWidth
                  iconLeft={<ExternalLink size={16} />}
                  onClick={() => window.open(permalink, '_blank', 'noopener,noreferrer')}
                >
                  Ver no Instagram
                </Button>
              )}
              {isSuccess && onCreateAnother && (
                <Button variant="secondary" fullWidth onClick={onCreateAnother}>
                  Criar outro post
                </Button>
              )}
              {(isScheduled || isDraft) && onViewQueue && (
                <Button
                  variant="brand"
                  fullWidth
                  iconLeft={<ListOrdered size={16} />}
                  onClick={onViewQueue}
                >
                  {isScheduled ? 'Ver agendados' : 'Ver rascunhos'}
                </Button>
              )}
              {(isScheduled || isDraft) && onCreateAnother && (
                <Button variant="secondary" fullWidth onClick={onCreateAnother}>
                  Criar outro post
                </Button>
              )}
              {isError && (
                <Button variant="primary" fullWidth onClick={onClose}>
                  Tentar novamente
                </Button>
              )}
              {(isSuccess || isError || isScheduled || isDraft) && (
                <Button variant="ghost" fullWidth onClick={onClose}>
                  Fechar
                </Button>
              )}
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}