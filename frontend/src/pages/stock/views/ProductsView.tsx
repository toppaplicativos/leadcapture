import { useState, useEffect, useCallback, useRef } from 'react'
import { Package, Search, Plus, ArrowDown, X } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Badge } from '@/components/ui'
import type { InventoryProduct, Category, ShowToast } from '../types'
import {
  money, unitShort, fmtQty, stockBadgeVariant, stockBadgeLabel, typeLabel, num,
} from '../helpers'
import { Pagination, EmptyState, Skeleton } from '../ui'
import { loadStockCache, saveStockCache } from '../offlineCache'
import { getSessionAuth } from '../auth'
import { ProductActionsModal } from '../modals/ProductActionsModal'
import { AddStockModal } from '../modals/AddStockModal'
import { RemoveStockModal } from '../modals/RemoveStockModal'
import { AdjustStockModal } from '../modals/AdjustStockModal'
import { SettingsModal } from '../modals/SettingsModal'
import { HistoryModal } from '../modals/HistoryModal'
import { EditProductModal } from '../modals/EditProductModal'
import { StockProductEditModal } from '../modals/StockProductEditModal'

export function ProductsView({
  showToast,
  categories,
  refreshKey,
  onRefresh,
  stockRoute,
  focusProductId,
  onFocusConsumed,
}: {
  showToast: (t: string, tp?: 'success' | 'error') => void
  categories: Category[]
  refreshKey: number
  onRefresh: () => void
  stockRoute: boolean
  focusProductId?: string
  onFocusConsumed?: () => void
}) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: string; product?: InventoryProduct } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const limit = 50
  const brandId = getSessionAuth().brandId

  const load = useCallback((pg: number, q?: string, f?: string) => {
    setLoading(true)
    inventoryApi.products(pg, limit, q ?? search, f ?? filter)
      .then(d => {
        const items = Array.isArray(d.items) ? d.items : []
        setProducts(items)
        setTotal(d.total || 0)
        saveStockCache('products', { items, total: d.total || 0 }, brandId)
      })
      .catch(e => {
        const cached = loadStockCache<{ items: InventoryProduct[]; total: number }>('products', brandId)
        if (cached?.data?.items?.length) {
          setProducts(cached.data.items)
          setTotal(cached.data.total || cached.data.items.length)
          showToast('Mostrando produtos em cache (offline)', 'error')
          return
        }
        showToast(e.message, 'error')
      })
      .finally(() => setLoading(false))
  }, [search, filter, showToast, brandId])

  useEffect(() => { load(1) }, [refreshKey])

  // Deep-link: open product actions when product_id is provided
  useEffect(() => {
    if (!focusProductId || loading) return
    const found = products.find(
      (p) => String(p.product_id || p.id) === String(focusProductId),
    )
    if (found) {
      setModal({ type: 'actions', product: found })
      onFocusConsumed?.()
      return
    }
    // Try fetch single product if not on current page
    inventoryApi.productDetail(focusProductId)
      .then((d) => {
        const p = d.product || d
        if (p && (p.product_id || p.id)) {
          setModal({ type: 'actions', product: p })
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => onFocusConsumed?.())
  }, [focusProductId, loading, products])

  function onSearch(val: string) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load(1, val, filter) }, 350)
  }
  function onFilter(f: string) {
    setFilter(f); setPage(1); load(1, search, f)
  }
  function changePage(p: number) { setPage(p); load(p) }

  const filters = [
    { key: '', label: 'Todos' },
    { key: 'normal', label: 'Normal' },
    { key: 'baixo', label: 'Baixo' },
    { key: 'zerado', label: 'Zerado' },
  ]
  const totalPages = Math.ceil(total / limit)

  function afterAction() { load(page); onRefresh() }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Produtos</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{total} produto{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModal({ type: 'add' })}
            iconLeft={<ArrowDown size={14} strokeWidth={2} />}
          >
            Entrada
          </Button>
          {!stockRoute && (
            <Button size="sm" onClick={() => setModal({ type: 'edit' })} iconLeft={<Plus size={15} strokeWidth={2} />}>
              Novo
            </Button>
          )}
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar produto"
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-9 rounded-full border-0 bg-gray-100 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition ${
              filter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton rows={4} /> : products.length === 0 ? (
        <EmptyState
          text="Nenhum produto no estoque"
          hint={stockRoute ? 'Sincronize com o catálogo ou peça ao admin para cadastrar produtos.' : 'Crie um produto ou sincronize o catálogo.'}
          action={!stockRoute ? { label: 'Novo produto', onClick: () => setModal({ type: 'edit' }) } : { label: 'Registrar entrada', onClick: () => setModal({ type: 'add' }) }}
        />
      ) : (
        <>
          <div className="space-y-2">
            {products.map((p) => {
              const pid = p.product_id || p.id || ''
              const name = p.product_name || p.name || 'Produto'
              const img = p.product_image || p.image_url || ''
              return (
                <button
                  key={pid}
                  onClick={() => setModal({ type: 'actions', product: p })}
                  className="w-full text-left bg-white border border-border-light rounded-2xl p-3.5 hover:border-gray-300 active:scale-[0.99] transition"
                >
                  <div className="flex items-start gap-3">
                    {img ? (
                      <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 grid place-items-center text-gray-400 shrink-0">
                        <Package size={18} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {p.product_sku || p.sku ? `SKU: ${p.product_sku || p.sku} · ` : ''}
                        {unitShort(p.product_unit || p.unit)} · {typeLabel(p.product_type)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant={stockBadgeVariant(p.status)}>
                          {stockBadgeLabel(p.status)} · {fmtQty(p.stock_available, p.product_unit || p.unit)}
                        </Badge>
                        {Number(p.stock_reserved) > 0 && (
                          <Badge variant="warning">Reserv {num(p.stock_reserved)}</Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                      {money(p.product_price || p.price)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}

      {modal?.type === 'actions' && modal.product && (
        <ProductActionsModal
          product={modal.product}
          onClose={() => setModal(null)}
          onAction={(type, prod) => setModal({ type, product: prod })}
          stockRoute={stockRoute}
        />
      )}
      {modal?.type === 'add' && <AddStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'remove' && modal.product && <RemoveStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'adjust' && modal.product && <AdjustStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'settings' && modal.product && <SettingsModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'history' && modal.product && <HistoryModal product={modal.product} onClose={() => setModal(null)} showToast={showToast} />}
      {modal?.type === 'edit' && !stockRoute && (
        <EditProductModal product={modal.product} categories={categories} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />
      )}
      {modal?.type === 'edit' && stockRoute && modal.product && (
        <StockProductEditModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />
      )}
    </div>
  )
}
