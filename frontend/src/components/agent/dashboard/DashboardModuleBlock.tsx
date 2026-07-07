import { ChevronDown, ChevronUp, LayoutDashboard, X } from 'lucide-react'
import { useDashboardBridge } from '@/lib/agent/DashboardBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { DashboardInlinePanel } from './DashboardInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function DashboardModuleBlock({ messageId, isActive }: Props) {
  const bridge = useDashboardBridge()
  const { closeDashboardModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.leads > 0 || snap.products > 0
    ? `Painel · ${snap.leads} leads`
    : snap.subtitle || 'Resumo do negócio'

  return (
    <div className={`catalog-module catalog-module--dashboard ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <LayoutDashboard size={13} className="shrink-0 text-gray-700" />
          <span className="catalog-module__title">{summary}</span>
          {snap.campaignsActive > 0 && (
            <span className="catalog-module__badge catalog-module__badge--dashboard">
              {snap.campaignsActive} ativa{snap.campaignsActive === 1 ? '' : 's'}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeDashboardModule} aria-label="Fechar painel">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <DashboardInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Painel completo no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/dashboard')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.leads}</strong> leads</span>
            <span><strong className="tabular-nums">{snap.products}</strong> produtos</span>
          </div>
        </div>
      )}
    </div>
  )
}