import { ChevronDown, ChevronUp, Zap, X } from 'lucide-react'
import { useAutomationsBridge } from '@/lib/agent/AutomationsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { AutomationsInlinePanel } from './AutomationsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function AutomationsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useAutomationsBridge()
  const { closeAutomationsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.total > 0
    ? `Automações · ${snap.total} fluxo${snap.total === 1 ? '' : 's'}`
    : 'Automações · criar fluxo'

  return (
    <div className={`catalog-module catalog-module--automations ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button type="button" className="catalog-module__toggle" onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}>
          <Zap size={13} className="shrink-0 text-violet-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.reactive > 0 && (
            <span className="catalog-module__badge catalog-module__badge--automations">
              {snap.reactive} reativa{snap.reactive === 1 ? '' : 's'}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeAutomationsModule} aria-label="Fechar automações">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <AutomationsInlinePanel />
          {isDesktop ? (
            <p className="catalog-module__hint">
              Hub e editor no canvas.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/automacoes')}>
                Hub
              </button>
              {' · '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/fluxos')}>
                Editor
              </button>
            </p>
          ) : (
            <p className="catalog-module__hint">
              Use os botões acima para abrir o hub ou o editor em tela cheia.
            </p>
          )}
        </div>
      )}
    </div>
  )
}