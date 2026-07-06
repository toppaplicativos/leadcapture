import { ChevronDown, ChevronUp, Megaphone, X } from 'lucide-react'
import { useCampaignsBridge } from '@/lib/agent/CampaignsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CampaignsInlinePanel } from './CampaignsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function CampaignsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useCampaignsBridge()
  const { closeCampaignsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedName || `${snap.total} campanha${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Megaphone size={13} className="shrink-0 text-gray-500" />
          <span className="catalog-module__title">{summary}</span>
          {snap.active > 0 && (
            <span className="catalog-module__badge">{snap.active} ativa{snap.active === 1 ? '' : 's'}</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeCampaignsModule} aria-label="Fechar campanhas">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          {!isDesktop ? <CampaignsInlinePanel /> : (
            <p className="catalog-module__hint">
              Campanhas no canvas.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/campanhas')}>
                Abrir editor
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.active}</strong> ativas</span>
          </div>
        </div>
      )}
    </div>
  )
}