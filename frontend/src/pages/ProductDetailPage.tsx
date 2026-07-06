import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ShoppingBag,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Package,
  Star,
  ImageOff,
} from 'lucide-react'
import { fetchProduct, fetchCatalog, type Product } from '@/lib/api'
import { storeSlug, storeUrl, money, isCustomDomain } from '@/lib/store-context'
import { useCartStore } from '@/lib/store'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { applySeo, truncate } from '@/lib/seo'

function resolveProductSlug(): string {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if ((parts[0] === 'catalogo' || parts[0] === 'loja') && parts[2] === 'produto') {
    return parts[3] || ''
  }
  if (isCustomDomain && parts[0] === 'produto') {
    return parts[1] || ''
  }
  return ''
}

function parseImages(product: Product): string[] {
  const imgs: string[] = []
  if (product.images_json) {
    try {
      const parsed = JSON.parse(product.images_json)
      if (Array.isArray(parsed)) {
        parsed.forEach((item: string | { url?: string }) => {
          const url = typeof item === 'string' ? item : item?.url
          if (url) imgs.push(url)
        })
      }
    } catch { /* ignore */ }
  }
  if (product.images?.length) {
    product.images.forEach((u) => { if (u && !imgs.includes(u)) imgs.push(u) })
  }
  if (product.image && !imgs.includes(product.image)) {
    imgs.unshift(product.image)
  }
  return imgs
}

function applyStoreBrand(store: {
  brand?: { primary_color?: string; secondary_color?: string }
  theme?: { primary_color?: string; secondary_color?: string }
}) {
  const brand = store.brand || {}
  const theme = store.theme || {}
  const primary = brand.primary_color || theme.primary_color || '#111827'
  const secondary = brand.secondary_color || theme.secondary_color || '#3b82f6'
  const root = document.documentElement
  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-secondary', secondary)
  root.style.setProperty('--brand-primary-light', primary + '0d')
  root.style.setProperty('--brand-secondary-light', secondary + '14')
  root.style.setProperty('--brand-secondary-soft', secondary + '1a')
}

function resolveStock(product: Product) {
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const legacyStock = product.stock !== undefined && product.stock !== null ? Number(product.stock) : null
  const isOutOfStock =
    stockStatus === 'out_of_stock' ||
    (stockQty !== null && stockQty <= 0) ||
    (legacyStock !== null && legacyStock <= 0)
  const isLowStock =
    !isOutOfStock &&
    ((stockStatus === 'low_stock' && stockQty !== null && stockQty > 0) ||
      (legacyStock !== null && legacyStock > 0 && legacyStock <= 5))
  const displayQty = stockQty ?? legacyStock
  return { isOutOfStock, isLowStock, displayQty, stockStatus }
}

function DetailSkeleton() {
  return (
    <div className="store-page page-enter min-h-screen">
      <div className="store-topbar safe-area-top">
        <div className="h-14 max-w-[var(--store-max)] mx-auto px-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl skeleton shrink-0" />
          <div className="skeleton h-4 flex-1 max-w-[12rem] rounded" />
        </div>
      </div>
      <div className="max-w-[var(--store-max)] mx-auto px-4 py-5 lg:grid lg:grid-cols-2 lg:gap-10">
        <div className="aspect-[4/5] rounded-2xl skeleton ring-1 ring-black/[0.04]" />
        <div className="mt-6 lg:mt-0 space-y-4">
          <div className="skeleton h-6 w-24 rounded-full" />
          <div className="skeleton h-8 w-4/5 rounded" />
          <div className="skeleton h-10 w-1/3 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
        </div>
      </div>
    </div>
  )
}

export function ProductDetailPage() {
  const navigate = useNavigate()
  const addItem = useCartStore((s) => s.addItem)
  const totalItems = useCartStore((s) => s.totalItems())
  const [product, setProduct] = useState<Product | null>(null)
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const [imgIdx, setImgIdx] = useState(0)

  const productSlug = resolveProductSlug()

  useEffect(() => {
    if (!productSlug) {
      setError('Produto não encontrado')
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      fetchProduct(productSlug),
      fetchCatalog().catch(() => null),
    ])
      .then(([productRes, catalogRes]) => {
        setProduct(productRes.product)
        if (catalogRes?.store) {
          applyStoreBrand(catalogRes.store)
          const brand = catalogRes.store.brand
          setStoreName(brand?.name || catalogRes.store.name || storeSlug)
        }
        const seo = (productRes.product as any)?.seo || {}
        const title = String(seo.meta_title || productRes.product?.name || 'Produto').slice(0, 70)
        const description = String(seo.meta_description || productRes.product?.description || '')
        applySeo({
          title,
          description: truncate(description, 160),
          image: productRes.product?.image || productRes.product?.images?.[0] || null,
          url: typeof window !== 'undefined' ? window.location.href : null,
        })
      })
      .catch(() => setError('Não foi possível carregar o produto.'))
      .finally(() => setLoading(false))
  }, [productSlug])

  const images = product ? parseImages(product) : []
  const hasDiscount =
    product?.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const discount = hasDiscount
    ? Math.round((1 - Number(product!.price) / Number(product!.compare_at_price)) * 100)
    : 0
  const stock = product ? resolveStock(product) : null

  function handleAddToCart() {
    if (!product || stock?.isOutOfStock) return
    addItem(product.id, qty)
    navigate(storeUrl('checkout'))
  }

  if (loading) return <DetailSkeleton />

  if (error || !product) {
    return (
      <div className="store-page min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
          <Package className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
        </div>
        <p className="text-[15px] font-semibold text-gray-900">
          {error || 'Produto não encontrado'}
        </p>
        <button
          type="button"
          onClick={() => navigate(storeUrl())}
          className="mt-4 text-[13px] font-semibold text-brand hover:opacity-80 transition"
        >
          Voltar ao catálogo
        </button>
      </div>
    )
  }

  const categoryLabel = product.category_name || product.category

  return (
    <div className="store-page page-enter min-h-screen pb-28">
      <header className="store-topbar sticky top-0 z-50 safe-area-top">
        <div className="flex items-center justify-between px-4 h-14 max-w-[var(--store-max)] mx-auto gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate(storeUrl())}
              aria-label="Voltar ao catálogo"
              className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-gray-800 hover:bg-gray-100 active:scale-95 transition"
            >
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
            <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight truncate">
              {product.name}
            </h1>
          </div>

          <Link
            to={storeUrl('checkout')}
            aria-label={`Carrinho${totalItems > 0 ? ` (${totalItems} itens)` : ''}`}
            className="relative grid place-items-center w-10 h-10 rounded-full text-gray-800 hover:bg-gray-100 active:scale-95 transition shrink-0"
          >
            <ShoppingBag size={19} strokeWidth={1.75} />
            {totalItems > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center px-1 ring-2 ring-white tabular-nums">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="max-w-[var(--store-max)] mx-auto px-4 py-5 lg:py-8 lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start">
        {/* Gallery */}
        <div className="store-detail-gallery lg:sticky lg:top-[4.5rem]">
          {images.length > 0 ? (
            <div className="relative rounded-2xl overflow-hidden bg-white ring-1 ring-black/[0.04]">
              <div className="relative aspect-[4/5] bg-gray-50">
                <img
                  src={optimizedImage(images[imgIdx], 1024, 85)}
                  srcSet={optimizedSrcset(images[imgIdx], [640, 800, 1024, 1280], 85) || undefined}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  alt={product.name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover"
                />

                {discount > 0 && !stock?.isOutOfStock && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-bold tracking-tight">
                    −{discount}%
                  </span>
                )}

                {stock?.isOutOfStock && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold tracking-tight uppercase">
                    Esgotado
                  </span>
                )}

                {!stock?.isOutOfStock && stock?.isLowStock && stock.displayQty != null && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-bold tracking-tight">
                    Últimas {stock.displayQty}
                  </span>
                )}

                {stock?.isOutOfStock && (
                  <div className="absolute inset-0 bg-white/45 pointer-events-none" aria-hidden />
                )}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setImgIdx((p) => (p - 1 + images.length) % images.length)}
                      aria-label="Imagem anterior"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full bg-gray-900/35 text-white hover:bg-gray-900/55 transition backdrop-blur-sm"
                    >
                      <ChevronLeft size={18} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setImgIdx((p) => (p + 1) % images.length)}
                      aria-label="Próxima imagem"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full bg-gray-900/35 text-white hover:bg-gray-900/55 transition backdrop-blur-sm"
                    >
                      <ChevronRight size={18} strokeWidth={2} />
                    </button>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {images.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setImgIdx(i)}
                          aria-label={`Imagem ${i + 1}`}
                          aria-current={i === imgIdx ? 'true' : undefined}
                          className={`h-1.5 rounded-full transition-all ${
                            i === imgIdx ? 'w-5 bg-brand' : 'w-1.5 bg-white/70'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-[4/5] rounded-2xl bg-gray-100 ring-1 ring-black/[0.04] grid place-items-center">
              <ImageOff className="w-10 h-10 text-gray-400" strokeWidth={1.5} />
            </div>
          )}

          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setImgIdx(i)}
                  aria-label={`Ver imagem ${i + 1}`}
                  className={`flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden ring-2 transition ${
                    i === imgIdx ? 'ring-brand' : 'ring-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={optimizedImage(src, 160, 75)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="mt-6 lg:mt-0 space-y-4">
          {storeName && (
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {storeName}
            </p>
          )}

          {categoryLabel && (
            <span className="store-chip bg-brand-soft text-brand">
              {categoryLabel}
            </span>
          )}

          <h2 className="text-[1.5rem] sm:text-[1.75rem] font-bold text-gray-900 tracking-[-0.03em] leading-[1.15] text-wrap-balance">
            {product.name}
          </h2>

          {Number(product.reviews_count || 0) > 0 && Number(product.reviews_avg || 0) > 0 && (
            <div className="flex items-center gap-1.5 text-[13px] text-gray-600">
              <Star size={14} className="text-amber-400 fill-amber-400" strokeWidth={2} />
              <span className="font-semibold text-gray-800 tabular-nums">
                {Number(product.reviews_avg).toFixed(1)}
              </span>
              <span className="text-gray-500">
                ({Number(product.reviews_count)} {Number(product.reviews_count) === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </div>
          )}

          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-[1.75rem] font-bold text-gray-900 tabular-nums tracking-tight">
              {money(product.price)}
            </span>
            {hasDiscount && (
              <span className="text-[14px] font-medium text-gray-500 line-through tabular-nums">
                {money(product.compare_at_price)}
              </span>
            )}
          </div>

          {(product.sku || product.weight || product.unit) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-500">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.weight && (
                <span>
                  Peso: {product.weight}
                  {product.weight_unit ? ` ${product.weight_unit}` : ''}
                </span>
              )}
              {product.unit && <span>Unidade: {product.unit}</span>}
            </div>
          )}

          {stock && stock.stockStatus !== 'unlimited' && stock.displayQty != null && (
            <div
              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-2.5 py-1 rounded-full ${
                stock.isOutOfStock
                  ? 'bg-red-50 text-red-800'
                  : stock.isLowStock
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  stock.isOutOfStock
                    ? 'bg-red-500'
                    : stock.isLowStock
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                aria-hidden
              />
              {stock.isOutOfStock
                ? 'Produto indisponível'
                : stock.isLowStock
                  ? `Últimas ${stock.displayQty} unidades`
                  : `${stock.displayQty} em estoque`}
            </div>
          )}

          {product.description && (
            <div className="pt-2 border-t border-gray-100">
              <h3 className="store-section-title mb-2">Descrição</h3>
              <p className="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line max-w-prose">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="store-detail-bar fixed bottom-0 inset-x-0 z-50 safe-area-bottom">
        <div className="max-w-[var(--store-max)] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="store-qty-stepper shrink-0">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Diminuir quantidade"
              className="store-qty-stepper__btn"
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            <span className="store-qty-stepper__value tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label="Aumentar quantidade"
              className="store-qty-stepper__btn"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={stock?.isOutOfStock}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-brand text-white text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] transition"
          >
            <ShoppingBag size={18} strokeWidth={2} />
            <span>
              {stock?.isOutOfStock ? 'Indisponível' : `Adicionar · ${money(Number(product.price) * qty)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}