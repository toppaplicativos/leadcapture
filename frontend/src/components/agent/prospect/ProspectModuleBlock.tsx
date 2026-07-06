import { lazy, Suspense } from 'react'
import { ChevronDown, ChevronUp, Loader2, MapPin, X } from 'lucide-react'
import { useProspectBridge } from '@/lib/agent/ProspectBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

const LeadSearchPage = lazy(() =>
  import('@/pages/LeadSearchPage').then((m) => ({ default: m.LeadSearchPage })),
)

type Props = {
  messageId: string
  isActive: boolean
}

export function ProspectModuleBlock({ messageId, isActive }: Props) {
  const bridge = useProspectBridge()
  const { closeProspectModule } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.query && snap.location
    ? `${snap.query} · ${snap.location}`
    : 'Busca no mapa'

  return (
    <div className={`prospect-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="prospect-module__head">
        <button
          type="button"
          className="prospect-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <MapPin size={13} className="shrink-0 text-gray-500" />
          <span className="prospect-module__title">{summary}</span>
          <span className="prospect-module__badge tabular-nums">{snap.found} leads</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          className="prospect-module__close"
          onClick={closeProspectModule}
          aria-label="Fechar busca"
        >
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div className="prospect-module__body">
          {!isDesktop && (
            <div className="prospect-module__map">
              <Suspense fallback={
                <div className="prospect-module__map-fallback">
                  <Loader2 size={18} className="animate-spin text-gray-400" />
                </div>
              }>
                <LeadSearchPage variant="inline-map" />
              </Suspense>
            </div>
          )}
          {isDesktop && (
            <p className="prospect-module__hint">
              Mapa aberto ao lado. Ajuste segmento e cidade nos controles abaixo do chat.
            </p>
          )}
          <div className="prospect-module__stats">
            <span><strong className="tabular-nums">{snap.newCount}</strong> novos</span>
            <span><strong className="tabular-nums">{snap.capturedLive}</strong> captados agora</span>
            <span><strong className="tabular-nums">{snap.todayCount}</strong> hoje</span>
          </div>
        </div>
      )}
    </div>
  )
}