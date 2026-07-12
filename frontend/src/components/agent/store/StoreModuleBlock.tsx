import { ChevronDown, ChevronUp, Store, X } from 'lucide-react'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { StoreInlinePanel } from './StoreInlinePanel'
import { getCachedActiveBrand } from '@/lib/brand-splash'

type Props = { messageId: string; isActive: boolean }

export function StoreModuleBlock({ messageId, isActive }: Props) {
  const {
    closeStoreModule,
    storeModuleExpanded,
    setStoreModuleExpanded,
    openCanvas,
  } = useAgentShell()
  const isDesktop = useIsDesktop()
  const brand = getCachedActiveBrand()
  const expanded = isActive && storeModuleExpanded

  if (!isActive) return null

  return (
    <div
      className={`catalog-module catalog-module--store ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      data-msg={messageId}
    >
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => setStoreModuleExpanded(!storeModuleExpanded)}
        >
          <Store size={13} className="shrink-0 text-gray-700" />
          <span className="catalog-module__title">
            Loja · {brand.name}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeStoreModule} aria-label="Fechar">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <StoreInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Studio completo no canvas.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/loja')}>
                Expandir
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
