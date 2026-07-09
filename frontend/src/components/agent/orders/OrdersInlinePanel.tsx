import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, ShoppingCart, Search, ChevronRight, LayoutGrid, List, Rows3,
  ExternalLink, Phone, User, CreditCard,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { useOrdersBridgeOptional } from '@/lib/agent/OrdersBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const OrdersManager = lazy(() =>
  import('@/pages/admin/orders/OrdersView').then((m) => ({ default: m.OrdersView })),
)

type ChatViewMode = 'compact' | 'list' | 'cards'

const PREVIEW_LIMIT: Record<ChatViewMode, number> = {
  compact: 8,
  list: 5,
  cards: 3,
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function money(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  novo: { label: 'Novo', tone: 'is-new' },
  aguardando_pagamento: { label: 'Aguardando', tone: 'is-pending' },
  pago: { label: 'Pago', tone: 'is-paid' },
  em_preparacao: { label: 'Preparando', tone: 'is-paid' },
  em_entrega: { label: 'Em entrega', tone: 'is-paid' },
  entregue: { label: 'Entregue', tone: 'is-delivered' },
  cancelado: { label: 'Cancelado', tone: 'is-cancelled' },
}

function orderStatus(order: any) {
  const raw = String(order?.business_status || order?.status_pedido || order?.status || 'novo').toLowerCase()
  return STATUS_LABEL[raw] || { label: order?.status || 'Pedido', tone: 'is-new' }
}

function OrderChatCard({ order, onOpen }: { order: any; onOpen: () => void }) {
  const st = orderStatus(order)
  return (
    <button type="button" className={`catalog-order-card ${st.tone}`} onClick={onOpen}>
      <div className="catalog-order-card__body">
        <div className="catalog-order-card__header">
          <div className="catalog-order-card__avatar">
            <ShoppingCart size={15} strokeWidth={1.75} />
          </div>
          <div className="catalog-order-card__headline">
            <span className="catalog-order-card__title">
              #{order.order_number || order.id?.slice?.(0, 8) || '—'}
            </span>
            <div className="catalog-order-card__meta">
              <span className={`catalog-order-card__status ${st.tone}`}>{st.label}</span>
              <span className="catalog-order-card__customer">{order.customer_name || 'Cliente'}</span>
            </div>
          </div>
          <span className="catalog-order-card__value">{money(order.valor_total)}</span>
        </div>
        <div className="catalog-order-card__kpis">
          {order.forma_pagamento && (
            <div className="catalog-order-card__kpi">
              <CreditCard size={11} />
              <span>{String(order.forma_pagamento).toUpperCase()}</span>
            </div>
          )}
          {order.customer_phone && (
            <div className="catalog-order-card__kpi">
              <Phone size={11} />
              <span>{order.customer_phone}</span>
            </div>
          )}
        </div>
        <span className="catalog-order-card__cta">
          Ver pedido
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

function OrderCompactTile({ order, onOpen }: { order: any; onOpen: () => void }) {
  const st = orderStatus(order)
  return (
    <button type="button" className="catalog-order-compact-tile" onClick={onOpen}>
      <div className={`catalog-order-compact-tile__dot ${st.tone}`} />
      <span className="catalog-order-compact-tile__name">#{order.order_number || '—'}</span>
      <span className="catalog-order-compact-tile__meta">{money(order.valor_total)}</span>
    </button>
  )
}

function OrderListRow({ order, onOpen }: { order: any; onOpen: () => void }) {
  const st = orderStatus(order)
  return (
    <button type="button" className="catalog-order-list-row" onClick={onOpen}>
      <div className={`catalog-order-list-row__avatar ${st.tone}`}>
        <ShoppingCart size={14} strokeWidth={1.75} />
      </div>
      <div className="catalog-order-list-row__main">
        <span className="catalog-order-list-row__name">
          #{order.order_number || '—'} · {order.customer_name || 'Cliente'}
        </span>
        <span className="catalog-order-list-row__meta">
          {st.label} · {money(order.valor_total)}
        </span>
      </div>
    </button>
  )
}

export function OrdersInlinePanel() {
  const bridge = useOrdersBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
  const [managerOpen, setManagerOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<any>(null)
  const ordersRef = useRef<any[]>([])
  const loadedRef = useRef(false)

  const load = useCallback(async (opts?: { q?: string; status?: string }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ limit: '40', offset: '0' })
      const query = opts?.q ?? search
      const status = opts?.status ?? statusFilter
      if (query.trim()) q.set('customer', query.trim())
      const r = await fetch(`/api/orders?${q}`, { headers: getHeaders() })
      const d = await r.json()
      let list = d.orders || []
      if (status) {
        list = list.filter((o: any) =>
          String(o.business_status || o.status_pedido || '').toLowerCase() === status,
        )
      }
      ordersRef.current = list
      setOrders(list)
      setTotal(d.total || list.length)

      const pendingCount = list.filter((o: any) =>
        ['novo', 'aguardando_pagamento'].includes(
          String(o.business_status || o.status_pedido || '').toLowerCase(),
        ),
      ).length
      const paidCount = list.filter((o: any) =>
        ['pago', 'em_preparacao', 'em_entrega', 'entregue'].includes(
          String(o.business_status || o.status_pedido || '').toLowerCase(),
        ),
      ).length
      const revenueTotal = list.reduce((s: number, o: any) => s + (Number(o.valor_total) || 0), 0)

      publishSnapshot?.({
        total: d.total || list.length,
        pendingCount,
        paidCount,
        revenueTotal,
        search: query,
        statusFilter: status,
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
      showToast('Erro ao carregar pedidos')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, publishSnapshot, showToast])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openOrder = useCallback((order: any) => {
    setDetailOrder(order)
    const label = `#${order.order_number || order.id?.slice?.(0, 8) || ''} · ${order.customer_name || ''}`
    publishSnapshot?.({
      selectedId: String(order.id),
      selectedLabel: label.trim(),
    })
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) openCanvas('/pedidos')
    else setManagerOpen(true)
    setModuleExpanded?.(true)
  }, [isDesktop, openCanvas, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      search: (q) => { setSearch(q); void load({ q }) },
      filterStatus: (s) => { setStatusFilter(s); void load({ status: s }) },
      selectOrder: (id) => {
        const found = ordersRef.current.find((o) => String(o.id) === String(id))
        if (found) openOrder(found)
      },
      openFull: () => openManager(),
      openPdv: () => {
        setManagerOpen(true)
        bridge?.queueCommand({ type: 'open_pdv' })
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, load, openManager, openOrder, bridge])

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (o.customer_name || '').toLowerCase().includes(q)
      || String(o.order_number || '').includes(q)
      || (o.customer_phone || '').includes(q)
  })

  const preview = filtered.slice(0, PREVIEW_LIMIT[chatView])
  const overflow = Math.max(0, (total || filtered.length) - preview.length)

  if (loading && orders.length === 0) {
    return (
      <PageSplash variant="panel" label="Pedidos" />
    )
  }

  return (
    <div className="catalog-panel catalog-panel--orders">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pedido ou cliente…"
          />
        </div>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openManager}>
          <ExternalLink size={14} /> Gerenciar
        </button>
      </div>

      <div className="catalog-panel__filters">
        {(['', 'novo', 'aguardando_pagamento', 'pago', 'entregue'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`catalog-panel__filter-chip ${statusFilter === s ? 'is-active' : ''} ${s ? 'catalog-panel__filter-chip--orders' : ''}`}
            onClick={() => {
              setStatusFilter(s)
              void load({ status: s })
            }}
          >
            {s === '' ? 'Todos' : STATUS_LABEL[s]?.label || s}
          </button>
        ))}
      </div>

      <div className="catalog-panel__viewbar">
        <div className="catalog-panel__view-toggle" role="group" aria-label="Modo de visualização">
          <button type="button" className={chatView === 'compact' ? 'is-active' : ''} onClick={() => setChatView('compact')} aria-pressed={chatView === 'compact'} title="Miniatura">
            <LayoutGrid size={13} />
          </button>
          <button type="button" className={chatView === 'list' ? 'is-active' : ''} onClick={() => setChatView('list')} aria-pressed={chatView === 'list'} title="Lista">
            <List size={13} />
          </button>
          <button type="button" className={chatView === 'cards' ? 'is-active' : ''} onClick={() => setChatView('cards')} aria-pressed={chatView === 'cards'} title="Cards">
            <Rows3 size={13} />
          </button>
        </div>
        <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
          Gerenciar
          <ChevronRight size={13} />
        </button>
      </div>

      {preview.length === 0 ? (
        <p className="catalog-panel__empty">
          {search.trim() || statusFilter ? 'Nenhum pedido encontrado.' : 'Nenhum pedido ainda. Use o PDV para criar.'}
        </p>
      ) : chatView === 'cards' ? (
        <div className="catalog-order-grid">
          {preview.map((o) => (
            <OrderChatCard key={o.id} order={o} onOpen={() => openOrder(o)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-order-list">
          {preview.map((o) => (
            <OrderListRow key={o.id} order={o} onOpen={() => openOrder(o)} />
          ))}
        </div>
      ) : (
        <div className="catalog-order-compact-grid">
          {preview.map((o) => (
            <OrderCompactTile key={o.id} order={o} onOpen={() => openOrder(o)} />
          ))}
        </div>
      )}

      {overflow > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{overflow} · Ver completo
        </button>
      )}

      {detailOrder && (
        <div className="catalog-order-detail" role="dialog">
          <div className="catalog-order-detail__head">
            <h3 className="catalog-order-detail__title">
              Pedido #{detailOrder.order_number || detailOrder.id?.slice?.(0, 8)}
            </h3>
            <button type="button" className="catalog-order-detail__close" onClick={() => setDetailOrder(null)} aria-label="Fechar">×</button>
          </div>
          <div className="catalog-order-detail__body">
            <p className="catalog-order-detail__row"><User size={12} /> {detailOrder.customer_name || 'Cliente'}</p>
            {detailOrder.customer_phone && <p className="catalog-order-detail__row"><Phone size={12} /> {detailOrder.customer_phone}</p>}
            <p className="catalog-order-detail__row"><CreditCard size={12} /> {money(detailOrder.valor_total)}</p>
            <p className="catalog-order-detail__status">{orderStatus(detailOrder).label}</p>
          </div>
          <button type="button" className="catalog-panel__action catalog-panel__action--orders" onClick={() => { setDetailOrder(null); openManager() }}>
            Abrir completo
          </button>
        </div>
      )}

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Pedidos"
        subtitle="Vendas, status e expedição"
      >
        <Suspense fallback={<PageSplash variant="panel" label="Pedidos" />}>
          <OrdersManager embedded showToast={(msg) => showToast(msg)} />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}