import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { useInstagramBridge } from '@/lib/agent/InstagramBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { InstagramInlinePanel } from './InstagramInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function InstagramModuleBlock({ messageId, isActive }: Props) {
  const bridge = useInstagramBridge()
  const { closeInstagramModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.connected && snap.username
    ? `Instagram · @${snap.username}`
    : snap.connected
      ? 'Instagram · conectado'
      : 'Instagram · conectar conta'

  return (
    <div className={`catalog-module catalog-module--instagram ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <InstagramIcon size={13} className="shrink-0 text-rose-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.connected && snap.mediaCount > 0 && (
            <span className="catalog-module__badge catalog-module__badge--instagram">
              {snap.mediaCount} posts
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeInstagramModule} aria-label="Fechar Instagram">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <InstagramInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Studio completo no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/instagram')}>
                Expandir
              </button>
            </p>
          )}
          {!isDesktop && snap.connected && (
            <div className="catalog-module__stats">
              <span><strong className="tabular-nums">{snap.followers.toLocaleString('pt-BR')}</strong> seguidores</span>
              <span><strong className="tabular-nums">{snap.mediaCount}</strong> posts</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}