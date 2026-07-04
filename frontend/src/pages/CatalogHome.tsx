import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { fetchCatalog, type Product, type StoreData } from '@/lib/api'
import { useCartStore } from '@/lib/store'
import { ProductCard } from '@/components/ProductCard'
import { ProductModal } from '@/components/ProductModal'
import { ProductSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { applySeo, truncate } from '@/lib/seo'
import { StoreHero } from '@/components/store/StoreHero'
import { StoreFilters } from '@/components/store/StoreFilters'
import { StoreSection } from '@/components/store/StoreSection'

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

function HeroSkeletonBlock() {
  return (
    <div className="store-hero">
      <div className="store-hero__placeholder skeleton" />
      <div className="relative z-10 max-w-[var(--store-max)] mx-auto px-4 -mt-10 pb-5">
        <div className="store-identity">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-2xl skeleton shrink-0" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="skeleton h-5 w-2/3 rounded" />
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-4/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
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
        root.style.setProperty('--brand-secondary-soft', secondary + '1a')
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

  function handleAttrFilterToggle(key: string, value: string) {
    setAttrFilters((prev) => {
      const next = { ...prev }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  const brand = store?.brand
  const profile = store?.profile
  const displayName = brand?.name || store?.name || 'Loja'
  const displaySlogan = brand?.slogan || brand?.description || ''
  const logoUrl = brand?.logo_url || store?.theme?.logo_url || ''
  const isOpen = (profile?.status || 'aberto').toLowerCase() === 'aberto'

  const categories = [...new Set(products.map((p) => p.category || p.category_name).filter(Boolean))]
  const activeAttrFilters = Object.entries(attrFilters).filter(([_, v]) => v && v !== '')
  const filtered = products.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(p.name || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false
    }
    if (selectedCategory && (p.category || p.category_name) !== selectedCategory) return false
    for (const [key, val] of activeAttrFilters) {
      const attrs = (p as any).attributes || {}
      const productVal = attrs[key]
      if (productVal == null) return false
      if (Array.isArray(productVal)) {
        if (!productVal.map((x: any) => String(x).toLowerCase()).includes(String(val).toLowerCase())) return false
      } else if (String(productVal).toLowerCase() !== String(val).toLowerCase()) {
        return false
      }
    }
    return true
  })

  const valuesByAttrKey: Record<string, string[]> = {}
  for (const def of attrDefs) {
    if (!def.is_filter) continue
    const set = new Set<string>()
    for (const p of products) {
      const v = (p as any).attributes?.[def.key]
      if (v == null) continue
      if (Array.isArray(v)) {
        v.forEach((x: any) => {
          const s = String(x).trim()
          if (s) set.add(s)
        })
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

  const coverImage =
    (profile as any)?.cover_image ||
    (brand as any)?.cover_image ||
    (brand as any)?.cover_image_url ||
    (store as any)?.theme?.cover_image ||
    (store as any)?.theme?.cover_image_url ||
    (store as any)?.theme?.hero_image ||
    ''

  const showCollections = !loading && !searchQuery && !selectedCategory && collections.length > 0

  return (
    <div className="store-page page-enter">
      {loading ? (
        <HeroSkeletonBlock />
      ) : (
        <StoreHero
          displayName={displayName}
          displaySlogan={displaySlogan}
          logoUrl={logoUrl}
          coverImage={coverImage}
          isOpen={isOpen}
          freeAbove={freeAbove}
          deliveryFee={deliveryFee}
          deliveryTime={deliveryTime}
          whatsappPhone={(brand as any)?.whatsapp_phone}
        />
      )}

      <StoreFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categories as string[]}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        attrDefs={attrDefs}
        valuesByAttrKey={valuesByAttrKey}
        attrFilters={attrFilters}
        onAttrFilterToggle={handleAttrFilterToggle}
        onClearAttrFilters={() => setAttrFilters({})}
        activeAttrFilterCount={activeAttrFilters.length}
      />

      <div className="max-w-[var(--store-max)] mx-auto px-4 pt-5 pb-28 space-y-8">
        {showCollections && (
          <div className="space-y-8">
            {collections.map((col) => {
              const colProducts = col.product_ids
                .map((id) => products.find((p) => p.id === id))
                .filter((p): p is Product => Boolean(p))
              if (colProducts.length === 0) return null
              return (
                <StoreSection
                  key={col.id}
                  title={col.name}
                  description={col.description}
                  count={colProducts.length}
                >
                  <div className="store-collection-track -mx-4 px-4">
                    {colProducts.map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onOpen={setSelectedProduct}
                        onQuickAdd={handleQuickAdd}
                        priority={i < 3}
                      />
                    ))}
                  </div>
                </StoreSection>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="store-product-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-gray-200 bg-white">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
              <Package className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-semibold text-gray-900">Nenhum produto encontrado</p>
            <p className="text-[13px] text-gray-600 mt-1">Tente outra busca ou categoria</p>
          </div>
        ) : (
          <StoreSection
            title={showCollections ? 'Todos os produtos' : 'Produtos'}
            count={filtered.length}
          >
            <div className="store-product-grid">
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
          </StoreSection>
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