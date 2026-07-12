import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ImageOff, Star } from 'lucide-react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'
import { productUrl } from '@/lib/product-url'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { resolveProductBadges } from '@/lib/store-conversion'

interface ProductCardProps {
  product: Product
  catalogSlug: string
  onQuickAdd: (productId: string) => void
  priority?: boolean
  bestSellerIds?: Set<string>
  showBadges?: boolean
}

export function ProductCard({
  product,
  catalogSlug,
  onQuickAdd,
  priority = false,
  bestSellerIds,
  showBadges = true,
}: ProductCardProps) {
  const href = productUrl(product, catalogSlug)
  const rawSrc = product.image || product.images?.[0] || ''
  const imgSrc = optimizedImage(rawSrc, 320)
  const imgSrcset = optimizedSrcset(rawSrc, [240, 320, 480, 640])
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    imgSrc ? 'loading' : 'error',
  )
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const isOutOfStock = stockStatus === 'out_of_stock' || (stockQty !== null && stockQty <= 0)
  const badges = resolveProductBadges(product, { bestSellerIds, showBadges })

  return (
    <Link
      to={href}
      state={{ fromCatalog: true }}
      className="group relative cursor-pointer flex flex-col no-underline text-inherit"
      aria-label={`Ver ${product.name || 'produto'}`}
    >
      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 ring-1 ring-black/[0.04] transition-[box-shadow,transform] duration-200 md:group-hover:shadow-[var(--shadow-elevated)] md:group-hover:-translate-y-0.5">
        {imgSrc && imgState !== 'error' && (
          <img
            src={imgSrc}
            srcSet={imgSrcset || undefined}
            sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imgState === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgState('loaded')}
            onError={() => setImgState('error')}
          />
        )}

        {imgState === 'loading' && <div className="absolute inset-0 skeleton" />}

        {imgState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <ImageOff className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
          </div>
        )}

        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-[1]">
            {badges.map((b) => (
              <span
                key={b.kind}
                className={`store-product-badge store-product-badge--${b.kind}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        {isOutOfStock && <div className="absolute inset-0 bg-white/45 pointer-events-none" />}

        {(!product.cta_type || product.cta_type === 'buy') && !isOutOfStock && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuickAdd(product.id)
            }}
            aria-label={`Adicionar ${product.name}`}
            className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-brand text-white grid place-items-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:translate-y-1 md:group-hover:translate-y-0 transition-all active:scale-90"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="pt-2.5 space-y-1">
        <h3 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 tracking-tight">
          {product.name || 'Produto'}
        </h3>

        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15px] font-bold text-gray-900 tabular-nums tracking-tight">
            {money(product.price)}
          </span>
          {hasCompare && (
            <span className="text-[11px] font-medium text-gray-500 line-through tabular-nums">
              {money(product.compare_at_price)}
            </span>
          )}
        </div>

        {Number(product.reviews_count || 0) > 0 && Number(product.reviews_avg || 0) > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Star size={11} className="text-amber-400 fill-amber-400" strokeWidth={2} />
            <span className="font-semibold text-gray-800 tabular-nums">
              {Number(product.reviews_avg).toFixed(1)}
            </span>
            <span className="text-gray-500">({Number(product.reviews_count)})</span>
          </div>
        )}
      </div>
    </Link>
  )
}
