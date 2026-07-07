import { ChevronDown, ChevronUp, Users, X } from 'lucide-react'
import { useLeadsBridge } from '@/lib/agent/LeadsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { LeadsInlinePanel } from './LeadsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function LeadsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useLeadsBridge()
  const { closeLeadsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedName
    ? snap.selectedName
    : `${snap.total} lead${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Users size={13} className="shrink-0 text-gray-500" />
          <span className="catalog-module__title">{summary}</span>
          {snap.newCount > 0 && (
            <span className="catalog-module__badge">{snap.newCount} novo{snap.newCount === 1 ? '' : 's'}</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeLeadsModule} aria-label="Fechar leads">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <LeadsInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Gestão completa no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/leads')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.newCount}</strong> novos</span>
          </div>
        </div>
      )}
    </div>
  )
}