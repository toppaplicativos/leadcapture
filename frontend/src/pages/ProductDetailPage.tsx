import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { fetchProduct, type Product } from '@/lib/api'
import { storeSlug, storeUrl, money, isCustomDomain } from '@/lib/store-context'
import { useCartStore } from '@/lib/store'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { applySeo, truncate } from '@/lib/seo'

function resolveProductSlug(): string {
  const parts = window.location.pathname.split('/').filter(Boolean)
  // /catalogo/:store/produto/:productSlug  or  /loja/:store/produto/:productSlug
  if ((parts[0] === 'catalogo' || parts[0] === 'loja') && parts[2] === 'produto') {
    return parts[3] || ''
  }
  // custom domain: /produto/:productSlug
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

export function ProductDetailPage() {
  const navigate = useNavigate()
  const addItem = useCartStore((s) => s.addItem)
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const [imgIdx, setImgIdx] = useState(0)

  const productSlug = resolveProductSlug()

  useEffect(() => {
    if (!productSlug) { setError('Produto não encontrado'); setLoading(false); return }
    setLoading(true)
    fetchProduct(productSlug)
      .then((d) => {
        setProduct(d.product)
        /* SEO (Fase 6) */
        const seo = (d.product as any)?.seo || {}
        const title = String(seo.meta_title || d.product?.name || 'Produto').slice(0, 70)
        const description = String(
          seo.meta_description || d.product?.description || ''
        )
        applySeo({
          title,
          description: truncate(description, 160),
          image: d.product?.image || d.product?.images?.[0] || null,
          url: typeof window !== 'undefined' ? window.location.href : null,
        })
      })
      .catch(() => setError('Não foi possível carregar o produto.'))
      .finally(() => setLoading(false))
  }, [productSlug])

  const images = product ? parseImages(product) : []
  const hasDiscount = product?.compare_at_price && product.compare_at_price > product.price
  const outOfStock = product?.stock !== undefined && product.stock !== null && Number(product.stock) <= 0

  function handleAddToCart() {
    if (!product) return
    addItem(product.id, qty)
    navigate(storeUrl('checkout'))
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-72 bg-surface rounded-xl" />
          <div className="h-6 bg-surface rounded w-3/4" />
          <div className="h-4 bg-surface rounded w-1/2" />
          <div className="h-10 bg-surface rounded" />
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error || !product) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4 px-4">
        <Package className="h-16 w-16 text-muted" />
        <p className="text-muted text-center">{error || 'Produto não encontrado'}</p>
        <button
          onClick={() => navigate(storeUrl())}
          className="text-primary font-medium"
        >
          Voltar ao catálogo
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => navigate(storeUrl())}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-bg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold truncate">{product.name}</h1>
      </header>

      {/* Image gallery */}
      {images.length > 0 ? (
        <div className="relative bg-white">
          <img
            src={optimizedImage(images[imgIdx], 1024, 85)}
            srcSet={optimizedSrcset(images[imgIdx], [640, 800, 1024, 1280], 85) || undefined}
            sizes="(min-width:640px) 640px, 100vw"
            alt={product.name}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="w-full aspect-square object-contain"
          />

          {images.length > 1 && (
            <>
              <button
                onClick={() => setImgIdx((p) => (p - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setImgIdx((p) => (p + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {/* dots */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === imgIdx ? 'w-5 bg-primary' : 'w-2 bg-white/60'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="w-full aspect-square bg-surface flex items-center justify-center">
          <Package className="h-20 w-20 text-muted/40" />
        </div>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setImgIdx(i)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                i === imgIdx ? 'border-primary' : 'border-transparent'
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

      {/* Product info */}
      <div className="px-4 pt-4 pb-32 space-y-4">
        {/* Category badge */}
        {product.category_name && (
          <span className="inline-block text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            {product.category_name}
          </span>
        )}

        <h2 className="text-xl font-bold text-heading">{product.name}</h2>

        {/* Price block */}
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-primary">{money(product.price)}</span>
          {hasDiscount && (
            <span className="text-sm text-muted line-through">
              {money(product.compare_at_price)}
            </span>
          )}
        </div>

        {/* Meta (SKU, peso, unit) */}
        {(product.sku || product.weight || product.unit) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
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

        {/* Stock indicator */}
        {product.stock !== undefined && product.stock !== null && (
          <div className={`text-sm font-medium ${outOfStock ? 'text-red-500' : 'text-green-600'}`}>
            {outOfStock
              ? 'Produto indisponível'
              : `${product.stock} em estoque`}
          </div>
        )}

        {/* Description */}
        {product.description && (
          <div className="prose prose-sm max-w-none text-body">
            <p className="whitespace-pre-line">{product.description}</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border px-4 py-3 safe-bottom">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {/* Quantity selector */}
          <div className="flex items-center border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-3 py-2.5 hover:bg-bg transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-semibold text-sm">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="px-3 py-2.5 hover:bg-bg transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Add to cart */}
          <button
            onClick={handleAddToCart}
            disabled={outOfStock}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition"
          >
            <ShoppingCart className="h-5 w-5" />
            <span>{outOfStock ? 'Indisponível' : `Adicionar ${money(product.price * qty)}`}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
