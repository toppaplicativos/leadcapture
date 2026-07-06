import { ChevronDown, ChevronUp, Package, X } from 'lucide-react'
import { useProductsBridge } from '@/lib/agent/ProductsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { ProductsInlinePanel } from './ProductsInlinePanel'

type Props = { messageId: string; isActive: boolean }

export function ProductsModuleBlock({ messageId, isActive }: Props) {
  const bridge = useProductsBridge()
  const { closeProductsModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedName
    ? snap.selectedName
    : `${snap.total} produto${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <Package size={13} className="shrink-0 text-gray-500" />
          <span className="catalog-module__title">{summary}</span>
          {snap.drafts > 0 && (
            <span className="catalog-module__badge">{snap.drafts} rascunho{snap.drafts === 1 ? '' : 's'}</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeProductsModule} aria-label="Fechar produtos">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <ProductsInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Catálogo completo no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/produtos')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.active}</strong> ativos</span>
          </div>
        </div>
      )}
    </div>
  )
}