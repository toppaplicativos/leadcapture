import { ChevronDown, ChevronUp, Building2, X } from 'lucide-react'
import { useClientsBridge } from '@/lib/agent/ClientsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { ClientsInlinePanel } from './ClientsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function ClientsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useClientsBridge()
  const { closeClientsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedName
    ? snap.selectedName
    : `${snap.total} cliente${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module catalog-module--clients ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Building2 size={13} className="shrink-0 text-emerald-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.activeCount > 0 && (
            <span className="catalog-module__badge catalog-module__badge--clients">{snap.activeCount} ativo{snap.activeCount === 1 ? '' : 's'}</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeClientsModule} aria-label="Fechar clientes">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <ClientsInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Gestão completa no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/clientes')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.activeCount}</strong> ativos</span>
          </div>
        </div>
      )}
    </div>
  )
}