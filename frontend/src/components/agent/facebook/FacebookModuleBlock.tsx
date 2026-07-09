import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { FacebookIcon } from '@/components/icons'
import { useFacebookBridge } from '@/lib/agent/FacebookBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { FacebookInlinePanel } from './FacebookInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function FacebookModuleBlock({ messageId, isActive }: Props) {
  const bridge = useFacebookBridge()
  const { closeFacebookModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.connected && snap.pageName
    ? `Facebook · ${snap.pageName}`
    : snap.connected
      ? 'Facebook · conectado'
      : 'Facebook · conectar página'

  return (
    <div className={`catalog-module catalog-module--facebook ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <FacebookIcon size={13} className="shrink-0 text-blue-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.connected && snap.fans > 0 && (
            <span className="catalog-module__badge catalog-module__badge--facebook">
              {snap.fans.toLocaleString('pt-BR')} curtidas
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeFacebookModule} aria-label="Fechar Facebook">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <FacebookInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Studio completo no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/facebook')}>
                Expandir
              </button>
            </p>
          )}
          {!isDesktop && snap.connected && (
            <div className="catalog-module__stats">
              <span><strong className="tabular-nums">{snap.fans.toLocaleString('pt-BR')}</strong> curtidas</span>
              <span><strong className="tabular-nums">{snap.followers.toLocaleString('pt-BR')}</strong> seguidores</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}