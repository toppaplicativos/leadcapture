import { ChevronDown, ChevronUp, ShoppingCart, X } from 'lucide-react'
import { useOrdersBridge } from '@/lib/agent/OrdersBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { OrdersInlinePanel } from './OrdersInlinePanel'

type Props = { messageId: string; isActive: boolean }

function money(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function OrdersModuleBlock({ messageId, isActive }: Props) {
  const bridge = useOrdersBridge()
  const { closeOrdersModule, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge.snapshot
  const expanded = isActive && bridge.moduleExpanded

  if (!isActive || !bridge.moduleOpen) return null

  const summary = snap.selectedLabel
    ? snap.selectedLabel
    : `${snap.total} pedido${snap.total === 1 ? '' : 's'}`

  return (
    <div className={`catalog-module catalog-module--orders ${expanded ? 'is-expanded' : 'is-collapsed'}`} data-msg={messageId}>
      <div className="catalog-module__head">
        <button
          type="button"
          className="catalog-module__toggle"
          onClick={() => bridge.setModuleExpanded(!bridge.moduleExpanded)}
        >
          <ShoppingCart size={13} className="shrink-0 text-violet-600" />
          <span className="catalog-module__title">{summary}</span>
          {snap.pendingCount > 0 && (
            <span className="catalog-module__badge catalog-module__badge--orders">
              {snap.pendingCount} pendente{snap.pendingCount === 1 ? '' : 's'}
            </span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="catalog-module__close" onClick={closeOrdersModule} aria-label="Fechar pedidos">
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="catalog-module__body">
          <OrdersInlinePanel />
          {isDesktop && (
            <p className="catalog-module__hint">
              Gestão completa no canvas à direita.{' '}
              <button type="button" className="catalog-module__link" onClick={() => openCanvas('/pedidos')}>
                Expandir
              </button>
            </p>
          )}
          <div className="catalog-module__stats">
            <span><strong className="tabular-nums">{snap.total}</strong> total</span>
            <span><strong className="tabular-nums">{snap.paidCount}</strong> pagos</span>
            {snap.revenueTotal > 0 && (
              <span><strong className="tabular-nums">{money(snap.revenueTotal)}</strong> faturado</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}