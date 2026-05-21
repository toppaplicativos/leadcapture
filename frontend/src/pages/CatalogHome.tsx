import { useEffect, useState } from 'react'
import { Truck, Clock, Search, X, Package } from 'lucide-react'
import { fetchCatalog, type Product, type StoreData } from '@/lib/api'
import { money } from '@/lib/store-context'
import { useCartStore } from '@/lib/store'
import { ProductCard } from '@/components/ProductCard'
import { ProductModal } from '@/components/ProductModal'
import { ProductSkeleton, HeroSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { applySeo, truncate } from '@/lib/seo'

interface CatalogHomeProps {
  onStoreLoaded: (store: StoreData['store']) => void
}

interface CatalogCollection {
  id: string
  slug: string
  name: string
  description?: string | null
  image_url?: string | null
  position?: number
  product_ids: string[]
}

interface AttributeFilterDef {
  id: string
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi_select' | 'color' | 'date'
  options: string[]
  is_filter: boolean
}

export function CatalogHome({ onStoreLoaded }: CatalogHomeProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [collections, setCollections] = useState<CatalogCollection[]>([])
  const [attrDefs, setAttrDefs] = useState<AttributeFilterDef[]>([])
  const [attrFilters, setAttrFilters] = useState<Record<string, string>>({})
  const [store, setStore] = useState<StoreData['store'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const addItem = useCartStore((s) => s.addItem)
  const { showToast } = useToast()

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        setStore(data.store)
        setProducts(data.all_products || [])
        setCollections(Array.isArray((data as any).collections) ? (data as any).collections : [])
        setAttrDefs(Array.isArray((data as any).attribute_definitions) ? (data as any).attribute_definitions : [])
        onStoreLoaded(data.store)

        /* SEO (Fase 6) — catalog landing */
        const b = data.store.brand || {}
        const t = data.store.theme || {}
        const p = (data.store as any).profile || {}
        const brandName = b.name || (data.store as any).name || 'Catálogo'
        const slogan = b.slogan || b.description || ''
        applySeo({
          title: slogan ? `${brandName} — ${slogan}` : brandName,
          description: truncate(b.description || slogan, 160),
          image: (b as any).cover_image || (t as any).cover_image || p.cover_image || b.logo_url,
          url: typeof window !== 'undefined' ? window.location.href : null,
        })

        const brand = data.store.brand
        const theme = data.store.theme
        const primary = brand?.primary_color || theme?.primary_color || '#111827'
        const secondary = brand?.secondary_color || theme?.secondary_color || '#3b82f6'
        const root = document.documentElement
        root.style.setProperty('--brand-primary', primary)
        root.style.setProperty('--brand-secondary', secondary)
        root.style.setProperty('--brand-primary-light', primary + '0d')
        root.style.setProperty('--brand-secondary-light', secondary + '14')
      })
      .catch((err) => setError(err.message || 'Erro ao carregar catálogo'))
      .finally(() => setLoading(false))
  }, [onStoreLoaded])

  function handleQuickAdd(productId: string) {
    addItem(productId)
    const p = products.find((x) => x.id === productId)
    showToast((p?.name || 'Produto') + ' adicionado')
  }

  function handleModalAdd(payload: {
    productId: string
    qty: number
    variantId?: string | null
    variantName?: string | null
    variantAttributes?: Record<string, any> | null
    configuratorSelections?: Array<{ group_id: string; option_ids: string[] }> | null
    configuratorSummary?: string | null
    unitPrice?: number | null
  }) {
    addItem({
      productId: payload.productId,
      variantId: payload.variantId,
      variantName: payload.variantName,
      variantAttributes: payload.variantAttributes,
      configuratorSelections: payload.configuratorSelections,
      configuratorSummary: payload.configuratorSummary,
      unitPrice: payload.unitPrice,
      quantity: payload.qty,
    })
    const p = products.find((x) => x.id === payload.productId)
    const parts = [p?.name || 'Produto']
    if (payload.variantName) parts.push(`(${payload.variantName})`)
    if (payload.configuratorSummary) parts.push(`— ${payload.configuratorSummary}`)
    showToast(`${parts.join(' ')} adicionado ao carrinho`)
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  const brand = store?.brand
  const profile = store?.profile
  const displayName = brand?.name || store?.name || 'Loja'
  const displaySlogan = brand?.slogan || brand?.description || ''
  const logoUrl = brand?.logo_url || store?.theme?.logo_url || ''
  const isOpen = (profile?.status || 'aberto').toLowerCase() === 'aberto'

  const categories = [...new Set(products.map(p => p.category || p.category_name).filter(Boolean))]
  const activeAttrFilters = Object.entries(attrFilters).filter(([_, v]) => v && v !== '')
  const filtered = products.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(p.name || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false
    }
    if (selectedCategory && (p.category || p.category_name) !== selectedCategory) return false
    /* Apply attribute filters (Fase 2) */
    for (const [key, val] of activeAttrFilters) {
      const attrs = (p as any).attributes || {}
      const productVal = attrs[key]
      if (productVal == null) return false
      if (Array.isArray(productVal)) {
        if (!productVal.map((x: any) => String(x).toLowerCase()).includes(String(val).toLowerCase())) return false
      } else {
        if (String(productVal).toLowerCase() !== String(val).toLowerCase()) return false
      }
    }
    return true
  })

  /** Collect available values per attribute key by scanning products — drives the chip filter UI */
  const valuesByAttrKey: Record<string, string[]> = {}
  for (const def of attrDefs) {
    if (!def.is_filter) continue
    const set = new Set<string>()
    for (const p of products) {
      const v = (p as any).attributes?.[def.key]
      if (v == null) continue
      if (Array.isArray(v)) {
        v.forEach((x: any) => { const s = String(x).trim(); if (s) set.add(s) })
      } else {
        const s = String(v).trim()
        if (s) set.add(s)
      }
    }
    if (set.size > 0) valuesByAttrKey[def.key] = Array.from(set).sort()
  }

  const profileAny = (profile as any) || {}
  const freeAbove = Number(profileAny.free_shipping_above) || 0
  const deliveryFee = Number(profileAny.delivery_fee) || 0
  const deliveryTime = profileAny.delivery_time_text || ''
  const hasShippingInfo = freeAbove > 0 || deliveryFee > 0 || deliveryTime

  const coverImage =
    (profile as any)?.cover_image ||
    (brand as any)?.cover_image ||
    (brand as any)?.cover_image_url ||
    (store as any)?.theme?.cover_image ||
    (store as any)?.theme?.cover_image_url ||
    (store as any)?.theme?.hero_image ||
    ''

  return (
    <div className="page-enter">
      {/* ── Hero with cover banner ── */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <section className="relative isolate">
          {/* Cover banner */}
          {coverImage ? (
            <div className="relative w-full aspect-[16/7] sm:aspect-[16/5] bg-gray-100 overflow-hidden z-0">
              <img
                src={optimizedImage(coverImage, 1024, 80)}
                srcSet={optimizedSrcset(coverImage, [640, 800, 1024, 1280, 1600], 80) || undefined}
                sizes="100vw"
                alt=""
                className="w-full h-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={(e) => {
                  ;(e.currentTarget.parentElement as HTMLElement).style.display = 'none'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
            </div>
          ) : (
            <div className="w-full aspect-[16/7] sm:aspect-[16/5] bg-gradient-to-br from-gray-100 to-gray-200 z-0" />
          )}

          {/* Brand identity — overlaps the banner, ALWAYS on top */}
          <div className="relative z-10 px-4">
            {/* Logo overlapping bottom of banner */}
            <div className="-mt-10 sm:-mt-12 mb-3">
              {logoUrl ? (
                <img
                  src={optimizedImage(logoUrl, 240, 85)}
                  srcSet={optimizedSrcset(logoUrl, [160, 240, 320], 85) || undefined}
                  sizes="96px"
                  alt={displayName}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover ring-4 ring-white shadow-[0_4px_16px_rgba(15,23,42,0.12)] bg-white"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gray-900 text-white grid place-items-center text-2xl font-bold ring-4 ring-white shadow-[0_4px_16px_rgba(15,23,42,0.12)]">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[24px] font-bold text-gray-900 tracking-[-0.025em] leading-tight truncate">
                {displayName}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  isOpen
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOpen ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                {isOpen ? 'Aberto' : 'Fechado'}
              </span>
            </div>
            {displaySlogan && (
              <p className="text-[13px] text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">{displaySlogan}</p>
            )}

            {/* Shipping pills */}
            {hasShippingInfo && (
              <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                {freeAbove > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0">
                    <Truck size={12} strokeWidth={2} /> Frete grátis acima de {money(freeAbove)}
                  </span>
                )}
                {deliveryFee > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0">
                    Entrega {money(deliveryFee)}
                  </span>
                )}
                {deliveryTime && (
                  <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0">
                    <Clock size={12} strokeWidth={2} /> {deliveryTime}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Sticky search + categories */}
      <div className="sticky top-14 z-30 bg-white/90 backdrop-blur-xl border-b border-border-light px-4 pt-4 pb-2.5 mt-4">
        <div className="relative">
          <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar produto"
            className="w-full h-10 pl-10 pr-9 rounded-full border-0 bg-gray-100 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 mt-3 pb-1">
            <button
              onClick={() => setSelectedCategory('')}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition ${
                !selectedCategory
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : (cat || ''))}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Attribute filters (Fase 2) — only render when there are products carrying these values */}
        {attrDefs.length > 0 && Object.keys(valuesByAttrKey).length > 0 && (
          <div className="mt-2 space-y-1.5">
            {attrDefs.filter(d => d.is_filter && valuesByAttrKey[d.key]?.length > 0).map(def => {
              const vals = valuesByAttrKey[def.key]
              const active = attrFilters[def.key] || ''
              return (
                <div key={def.id} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">{def.label}:</span>
                  {vals.map(v => {
                    const isOn = active === v
                    return (
                      <button key={v}
                        onClick={() => setAttrFilters(prev => {
                          const next = { ...prev }
                          if (isOn) delete next[def.key]
                          else next[def.key] = v
                          return next
                        })}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                          isOn ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {activeAttrFilters.length > 0 && (
              <button onClick={() => setAttrFilters({})}
                className="text-[10px] text-gray-500 hover:text-gray-700 font-medium underline">
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Collections carousels — only shown when no search/category filter is active */}
      {!loading && !searchQuery && !selectedCategory && collections.length > 0 && (
        <div className="space-y-6 pt-4">
          {collections.map((col) => {
            const colProducts = col.product_ids
              .map((id) => products.find((p) => p.id === id))
              .filter((p): p is Product => Boolean(p))
            if (colProducts.length === 0) return null
            return (
              <section key={col.id} className="space-y-2.5">
                <div className="px-4 flex items-baseline justify-between">
                  <div>
                    <h3 className="text-[16px] font-bold tracking-tight text-gray-900">{col.name}</h3>
                    {col.description && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{col.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 tabular-nums">{colProducts.length} produto{colProducts.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-1 snap-x snap-mandatory">
                  {colProducts.map((product, i) => (
                    <div key={product.id} className="w-[140px] sm:w-[170px] shrink-0 snap-start">
                      <ProductCard
                        product={product}
                        onOpen={setSelectedProduct}
                        onQuickAdd={handleQuickAdd}
                        priority={i < 3}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Products */}
      <div className="px-4 pt-4 pb-24">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
              <Package className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-medium text-gray-900">Nenhum produto encontrado</p>
            <p className="text-[12px] text-gray-500 mt-0.5">Tente outra busca ou categoria</p>
          </div>
        ) : (
          <>
            {(!searchQuery && !selectedCategory && collections.length > 0) && (
              <h3 className="text-[16px] font-bold tracking-tight text-gray-900 mb-3">Todos os produtos</h3>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5">
              {filtered.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={setSelectedProduct}
                  onQuickAdd={handleQuickAdd}
                  priority={i < 6}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleModalAdd}
        whatsappPhone={(brand as any)?.whatsapp_phone || undefined}
        allProducts={products}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />
    </div>
  )
}
