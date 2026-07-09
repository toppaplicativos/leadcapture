import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Package, Plus, Search, ChevronRight,
  LayoutGrid, List, Rows3, ExternalLink,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { getHeaders, money } from '@/lib/admin/helpers'
import { useProductsBridgeOptional, type ProductDraft } from '@/lib/agent/ProductsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { ProductEditorModal } from '@/pages/admin/products/ProductsView'
import { CatalogManagerSheet } from './CatalogManagerSheet'

const ProductsManager = lazy(() =>
  import('@/pages/admin/products/ProductsView').then((m) => ({ default: m.ProductsView })),
)

type ChatViewMode = 'compact' | 'list' | 'cards'

const PREVIEW_LIMIT: Record<ChatViewMode, number> = {
  compact: 8,
  list: 5,
  cards: 3,
}

function productStatus(product: any) {
  if (product?.metadata?.is_draft) return { label: 'Rascunho', tone: 'is-draft' as const }
  if (product?.active === false || product?.is_active === false) return { label: 'Inativo', tone: 'is-inactive' as const }
  return { label: 'Ativo', tone: 'is-active' as const }
}

function productStock(product: any) {
  const n = product?.stock ?? product?.stock_current ?? product?.stock_available
  if (n == null || n === '') return '—'
  return String(n)
}

function ProductChatCard({ product, onOpen }: { product: any; onOpen: () => void }) {
  const status = productStatus(product)
  const hasPromo = Number(product.promoPrice) > 0
  const img = product.imageUrl || product.image
  const [imgError, setImgError] = useState(false)

  return (
    <button type="button" className={`catalog-product-card ${status.tone}`} onClick={onOpen}>
      <div className="catalog-product-card__bar" />
      <div className="catalog-product-card__body">
        <div className="catalog-product-card__header">
          <div className="catalog-product-card__thumb">
            {img && !imgError ? (
              <img src={img} alt="" onError={() => setImgError(true)} />
            ) : (
              <Package size={20} className="text-gray-300" strokeWidth={1.5} />
            )}
          </div>
          <div className="catalog-product-card__headline">
            <span className="catalog-product-card__title">{product.name || 'Produto'}</span>
            <div className="catalog-product-card__meta">
              <span className={`catalog-product-card__status ${status.tone}`}>{status.label}</span>
              {product.category && (
                <span className="catalog-product-card__category">{product.category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="catalog-product-card__kpis">
          <div className="catalog-product-card__kpi">
            <strong>{money(product.price)}</strong>
            <span>Preço</span>
          </div>
          <div className={`catalog-product-card__kpi ${hasPromo ? 'is-promo' : ''}`}>
            <strong>{hasPromo ? money(product.promoPrice) : '—'}</strong>
            <span>Promo</span>
          </div>
          <div className="catalog-product-card__kpi">
            <strong>{productStock(product)}</strong>
            <span>Estoque</span>
          </div>
        </div>
        <span className="catalog-product-card__cta">
          Abrir produto
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

function ProductCompactTile({ product, onOpen }: { product: any; onOpen: () => void }) {
  const img = product.imageUrl || product.image
  const [imgError, setImgError] = useState(false)
  const status = productStatus(product)

  return (
    <button type="button" className="catalog-product-compact-tile" onClick={onOpen}>
      <div className="catalog-product-compact-tile__thumb">
        {img && !imgError ? (
          <img src={img} alt="" onError={() => setImgError(true)} />
        ) : (
          <Package size={16} className="text-gray-300" strokeWidth={1.5} />
        )}
        <span className={`catalog-product-compact-tile__dot ${status.tone}`} />
      </div>
      <span className="catalog-product-compact-tile__name">{product.name || 'Produto'}</span>
      <span className="catalog-product-compact-tile__price">{money(product.price)}</span>
    </button>
  )
}

function ProductListRow({ product, onOpen }: { product: any; onOpen: () => void }) {
  const status = productStatus(product)
  const img = product.imageUrl || product.image
  const [imgError, setImgError] = useState(false)

  return (
    <button type="button" className="catalog-product-list-row" onClick={onOpen}>
      <div className="catalog-product-list-row__thumb">
        {img && !imgError ? (
          <img src={img} alt="" onError={() => setImgError(true)} />
        ) : (
          <Package size={14} className="text-gray-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="catalog-product-list-row__main">
        <span className="catalog-product-list-row__name">{product.name || 'Produto'}</span>
        <span className="catalog-product-list-row__meta">
          {product.category || '—'} · {status.label}
        </span>
      </div>
      <div className="catalog-product-list-row__price">
        <strong>{money(product.price)}</strong>
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </button>
  )
}

export function ProductsInlinePanel() {
  const bridge = useProductsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const dispatch = bridge?.dispatch
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
  const [managerOpen, setManagerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<any>(null)
  const productsRef = useRef<any[]>([])
  const searchRef = useRef(search)
  const loadedRef = useRef(false)
  searchRef.current = search

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        fetch('/api/products', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({ products: [] })),
        fetch('/api/categories', { headers: getHeaders() }).then((r) => r.json()).catch(() => ({ categories: [] })),
      ])
      const list = p.products || []
      productsRef.current = list
      setProducts(list)
      setCategories(c.categories || [])
      const active = list.filter((item: any) => item.active !== false && item.is_active !== false).length
      const drafts = list.filter((item: any) => item?.metadata?.is_draft).length
      publishSnapshot?.({
        total: list.length,
        active,
        drafts,
        search: searchRef.current,
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openProduct = useCallback((p: any | null) => {
    setEditProduct(p)
    setModalOpen(true)
    if (p) {
      publishSnapshot?.({ selectedId: String(p.id), selectedName: p.name || '' })
    }
  }, [publishSnapshot])

  const openDraft = useCallback((draft: ProductDraft) => {
    setEditProduct({
      name: draft.name,
      description: draft.description || '',
      category: draft.category || '',
      price: draft.price ?? 0,
      features: draft.features || [],
      metadata: { is_draft: true },
    })
    setModalOpen(true)
    publishSnapshot?.({ selectedId: null, selectedName: draft.name })
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) {
      openCanvas('/produtos')
    } else {
      setManagerOpen(true)
    }
    setModuleExpanded?.(true)
  }, [isDesktop, openCanvas, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      search: (q) => {
        setSearch(q)
        publishSnapshot?.({ search: q })
      },
      selectProduct: (id) => {
        const found = productsRef.current.find((p) => String(p.id) === String(id))
        if (found) openProduct(found)
      },
      createNew: () => openProduct(null),
      createWithDraft: (draft) => openDraft(draft),
      openFull: () => openManager(),
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, publishSnapshot, openProduct, openDraft, load, openManager])

  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (p.name || '').toLowerCase().includes(q)
      || (p.category || '').toLowerCase().includes(q)
  })

  const limit = PREVIEW_LIMIT[chatView]
  const preview = filtered.slice(0, limit)
  const remaining = Math.max(0, filtered.length - preview.length)

  if (loading) {
    return (
      <PageSplash variant="panel" label="Produtos" />
    )
  }

  return (
    <div className="catalog-panel catalog-panel--products">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              publishSnapshot?.({ search: e.target.value })
            }}
            placeholder="Buscar produto…"
          />
        </div>
        <button type="button" className="catalog-panel__action" onClick={() => dispatch?.({ type: 'create_new' })}>
          <Plus size={14} /> Novo
        </button>
      </div>

      <div className="catalog-panel__viewbar">
        <div className="catalog-panel__view-toggle" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={chatView === 'compact' ? 'is-active' : ''}
            onClick={() => setChatView('compact')}
            aria-pressed={chatView === 'compact'}
            title="Miniatura"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            className={chatView === 'list' ? 'is-active' : ''}
            onClick={() => setChatView('list')}
            aria-pressed={chatView === 'list'}
            title="Lista"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className={chatView === 'cards' ? 'is-active' : ''}
            onClick={() => setChatView('cards')}
            aria-pressed={chatView === 'cards'}
            title="Cards"
          >
            <Rows3 size={13} />
          </button>
        </div>
        <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
          <ExternalLink size={12} />
          Gerenciar
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="catalog-panel__empty">Nenhum produto encontrado. Crie um novo pelo botão acima.</p>
      ) : chatView === 'compact' ? (
        <div className="catalog-product-compact-grid">
          {preview.map((p) => (
            <ProductCompactTile key={p.id} product={p} onOpen={() => openProduct(p)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-product-list">
          {preview.map((p) => (
            <ProductListRow key={p.id} product={p} onOpen={() => openProduct(p)} />
          ))}
        </div>
      ) : (
        <div className="catalog-product-grid catalog-product-grid--chat">
          {preview.map((p) => (
            <ProductChatCard key={p.id} product={p} onOpen={() => openProduct(p)} />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{remaining} produto{remaining === 1 ? '' : 's'} · Ver catálogo completo
        </button>
      )}

      {modalOpen && (
        <ProductEditorModal
          product={editProduct}
          categories={categories}
          onClose={() => {
            setModalOpen(false)
            setEditProduct(null)
            publishSnapshot?.({ selectedId: null, selectedName: '' })
          }}
          onSaved={() => {
            setModalOpen(false)
            setEditProduct(null)
            publishSnapshot?.({ selectedId: null, selectedName: '' })
            void load()
          }}
          showToast={(msg, tp) => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
        />
      )}

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Catálogo"
        subtitle="Grade, lista, categorias e edição completa"
      >
        <Suspense fallback={<PageSplash variant="panel" label="Produtos" />}>
          <ProductsManager
            embedded
            showToast={(msg, tp) => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
          />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}