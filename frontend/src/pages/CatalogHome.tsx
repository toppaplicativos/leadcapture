import { useEffect, useState } from 'react'
import { MapPin, Truck, Clock, Package } from 'lucide-react'
import { fetchCatalog, type Product, type StoreData } from '@/lib/api'
import { money } from '@/lib/store-context'
import { useCartStore } from '@/lib/store'
import { ProductCard } from '@/components/ProductCard'
import { ProductModal } from '@/components/ProductModal'
import { ProductSkeleton, HeroSkeleton, InfoStripSkeleton } from '@/components/Skeleton'
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
  const addItem = useCartStore((s) => s.addItem)
  const { showToast } = useToast()

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        setStore(data.store)
        setProducts(data.all_products || [])
        onStoreLoaded(data.store)

        // Apply brand colors
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
    showToast((p?.name || 'Produto') + ' adicionado!')
  }

  function handleModalAdd(productId: string, qty: number) {
    addItem(productId, qty)
    const p = products.find((x) => x.id === productId)
    showToast(`${p?.name || 'Produto'} adicionado ao carrinho!`)
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <p className="text-muted text-center">{error}</p>
      </div>
    )
  }

  const brand = store?.brand
  const profile = store?.profile
  const displayName = brand?.name || store?.name || 'Loja'
  const displaySlogan = brand?.slogan || brand?.description || 'Catálogo de produtos'
  const logoUrl = brand?.logo_url || store?.theme?.logo_url || ''
  const isOpen = (profile?.status || 'aberto').toLowerCase() === 'aberto'

  return (
    <div className="page-enter">
      {/* Hero Banner */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <div className="relative h-48 bg-gradient-to-br from-gray-900 to-gray-700 overflow-hidden">
          {profile?.cover_image && (
            <img
              src={profile.cover_image}
              alt="Capa"
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <div className="relative h-full flex items-end p-4 pb-5">
            <div className="flex items-center gap-3 w-full">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={displayName}
                  className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/30 shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-lg font-bold truncate">{displayName}</h2>
                <p className="text-white/70 text-sm truncate">{displaySlogan}</p>
              </div>
              <span
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
                  isOpen
                    ? 'bg-success/20 text-green-200 ring-1 ring-success/30'
                    : 'bg-red-500/20 text-red-200 ring-1 ring-red-500/30'
                }`}
              >
                {isOpen ? 'Aberto' : 'Fechado'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Info strip */}
      {loading ? (
        <InfoStripSkeleton />
      ) : (
        <div className="grid grid-cols-4 gap-0 divide-x divide-border bg-surface border-b border-border">
          {[
            { icon: MapPin, label: 'Endereço', value: profile?.address || brand?.address || '—' },
            {
              icon: Truck,
              label: 'Taxa entrega',
              value: profile?.delivery_fee != null ? money(profile.delivery_fee) : '—',
            },
            {
              icon: Clock,
              label: 'Raio entrega',
              value: profile?.delivery_radius_km != null ? `${profile.delivery_radius_km} km` : '—',
            },
            { icon: Package, label: 'Produtos', value: String(products.length) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex flex-col items-center py-3 px-1 text-center">
              <Icon className="w-4 h-4 text-muted-light mb-1" />
              <span className="text-[10px] text-muted">{label}</span>
              <span className="text-xs font-semibold truncate max-w-full">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Products section */}
      <div className="px-4 pt-5 pb-24">
        <h2 className="text-base font-bold mb-4">Produtos</h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted text-center py-12">Nenhum produto disponível.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onOpen={setSelectedProduct}
                onQuickAdd={handleQuickAdd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleModalAdd}
      />
    </div>
  )
}
