import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Package, Plus, Search } from 'lucide-react'
import { getHeaders, money } from '@/lib/admin/helpers'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { ProductEditorModal } from '@/pages/admin/products/ProductsView'

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
  const [cardsOpen, setCardsOpen] = useState(false)
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
    if (isDesktop || loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [isDesktop, load])

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
  })

  if (isDesktop) return null

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

      {!cardsOpen ? (
        <p className="catalog-panel__empty">
          Toque em <strong>Ver todos</strong> para listar produtos em cards.
        </p>
      ) : filtered.length === 0 ? (
        <p className="catalog-panel__empty">Nenhum produto. Crie um novo pelo botão acima.</p>
      ) : (
        <div className="catalog-panel__grid">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="catalog-panel__card"
              onClick={() => openProduct(p)}
            >
              <div className="catalog-panel__thumb">
                {(p.imageUrl || p.image) ? (
                  <img src={p.imageUrl || p.image} alt="" />
                ) : (
                  <Package size={18} className="text-gray-300" />
                )}
              </div>
              <span className="catalog-panel__label">{p.name}</span>
              <span className="catalog-panel__meta">{money(p.price)}</span>
            </button>
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