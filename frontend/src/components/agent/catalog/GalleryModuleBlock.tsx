import { ChevronDown, ChevronUp, Images, X } from 'lucide-react'
import { useGalleryBridge } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { GalleryInlinePanel } from './GalleryInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function GalleryModuleBlock({ messageId, isActive }: Props) {
  const bridge = useGalleryBridge()
  const { closeGalleryModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedTitle || `${snap.total} asset${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Images size={13} className="shrink-0 text-gray-500" />
          <span className="catalog-module__title">{summary}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeGalleryModule} aria-label="Fechar galeria">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          {!isDesktop ? <GalleryInlinePanel /> : (
            <p className="catalog-module__hint">
              Galeria no canvas.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/galeria')}>
                Ver tudo
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> na galeria</span>
          </div>
        </div>
      )}
    </div>
  )
}