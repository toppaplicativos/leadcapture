import { useEffect, useState } from 'react'
import { Truck, Clock, Search, X, Package } from 'lucide-react'
import { fetchCatalog, type Product, type StoreData } from '@/lib/api'
import { money } from '@/lib/store-context'
import { useCartStore } from '@/lib/store'
import { ProductCard } from '@/components/ProductCard'
import { ProductModal } from '@/components/ProductModal'
import { ProductSkeleton, HeroSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'

interface CatalogHomeProps {
  onStoreLoaded: (store: StoreData['store']) => void
}

export function CatalogHome({ onStoreLoaded }: CatalogHomeProps) {
  const [products, setProducts] = useState<Product[]>([])
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
        onStoreLoaded(data.store)

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

  function handleModalAdd(productId: string, qty: number) {
    addItem(productId, qty)
    const p = products.find((x) => x.id === productId)
    showToast(`${p?.name || 'Produto'} adicionado ao carrinho`)
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
  const filtered = products.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(p.name || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false
    }
    if (selectedCategory && (p.category || p.category_name) !== selectedCategory) return false
    return true
  })

  const profileAny = (profile as any) || {}
  const freeAbove = Number(profileAny.free_shipping_above) || 0
  const deliveryFee = Number(profileAny.delivery_fee) || 0
  const deliveryTime = profileAny.delivery_time_text || ''
  const hasShippingInfo = freeAbove > 0 || deliveryFee > 0 || deliveryTime

  const coverImage = (brand as any)?.cover_image || (store as any)?.theme?.cover_image || ''

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
                src={coverImage}
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
                  src={logoUrl}
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
      </div>

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
        )}
      </div>

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleModalAdd}
      />
    </div>
  )
}
