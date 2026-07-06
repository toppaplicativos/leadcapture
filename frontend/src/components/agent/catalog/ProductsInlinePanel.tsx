import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Package, Plus, Search, ChevronRight } from 'lucide-react'
import { getHeaders, money } from '@/lib/admin/helpers'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { ProductEditorModal } from '@/pages/admin/products/ProductsView'

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
              {product.unit && (
                <span className="catalog-product-card__unit">{product.unit}</span>
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

export function ProductsInlinePanel() {
  const bridge = useProductsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const dispatch = bridge?.dispatch
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardsOpen, setCardsOpen] = useState(true)
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
      if (list.length > 0) setCardsOpen(true)
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

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      search: (q) => {
        setSearch(q)
        setCardsOpen(true)
        publishSnapshot?.({ search: q })
      },
      selectProduct: (id) => {
        const found = productsRef.current.find((p) => String(p.id) === String(id))
        if (found) openProduct(found)
      },
      createNew: () => {
        setCardsOpen(true)
        openProduct(null)
      },
      openFull: () => {
        setModuleExpanded(true)
        setCardsOpen(true)
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, publishSnapshot, openProduct, load])

  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (p.name || '').toLowerCase().includes(q)
      || (p.category || '').toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
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
              if (e.target.value.trim()) setCardsOpen(true)
              publishSnapshot?.({ search: e.target.value })
            }}
            placeholder="Buscar produto…"
          />
        </div>
        <button type="button" className="catalog-panel__action" onClick={() => dispatch?.({ type: 'create_new' })}>
          <Plus size={14} /> Novo
        </button>
        <button
          type="button"
          className="catalog-panel__action catalog-panel__action--ghost"
          onClick={() => {
            setModuleExpanded?.(true)
            setCardsOpen(true)
          }}
        >
          Ver todos
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="catalog-panel__empty">Nenhum produto encontrado. Crie um novo pelo botão acima.</p>
      ) : (
        <div className="catalog-product-grid">
          {filtered.map((p) => (
            <ProductChatCard key={p.id} product={p} onOpen={() => openProduct(p)} />
          ))}
        </div>
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
    </div>
  )
}