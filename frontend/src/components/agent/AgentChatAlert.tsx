/**
 * Alerta compacto do agente no rail do chat (não é card de módulo gigante).
 * Protocolo: mensagem curta + 1–2 CTAs. Conteúdo pesado fica no canvas/popup.
 */
import type { ComponentType, SVGProps } from 'react'
import { X } from 'lucide-react'

export type AgentChatAlertTone = 'neutral' | 'info' | 'warn' | 'ok' | 'instagram' | 'whatsapp'

type Action = {
  label: string
  onClick: () => void
  primary?: boolean
}

/** Aceita Lucide e BrandIcon do projeto */
type AlertIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string } & SVGProps<SVGSVGElement>>

type Props = {
  title: string
  description?: string
  icon?: AlertIcon
  tone?: AgentChatAlertTone
  actions?: Action[]
  onDismiss?: () => void
}

const TONE_CLASS: Record<AgentChatAlertTone, string> = {
  neutral: 'agent-chat-alert--neutral',
  info: 'agent-chat-alert--info',
  warn: 'agent-chat-alert--warn',
  ok: 'agent-chat-alert--ok',
  instagram: 'agent-chat-alert--instagram',
  whatsapp: 'agent-chat-alert--whatsapp',
}

export function AgentChatAlert({
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  actions = [],
  onDismiss,
}: Props) {
  return (
    <div
      className={`agent-chat-alert ${TONE_CLASS[tone]}`}
      role="status"
      data-agent-alert={tone}
    >
      <div className="agent-chat-alert__main">
        {Icon && (
          <span className="agent-chat-alert__icon" aria-hidden>
            <Icon size={14} strokeWidth={2} />
          </span>
        )}
        <div className="agent-chat-alert__text min-w-0">
          <p className="agent-chat-alert__title">{title}</p>
          {description ? (
            <p className="agent-chat-alert__desc">{description}</p>
          ) : null}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="agent-chat-alert__dismiss"
            onClick={onDismiss}
            aria-label="Dispensar"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {actions.length > 0 && (
        <div className="agent-chat-alert__actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`agent-chat-alert__btn${a.primary ? ' is-primary' : ''}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
