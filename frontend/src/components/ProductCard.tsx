import { useState } from 'react'
import { Plus, ImageOff, Star } from 'lucide-react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'
import { optimizedImage, optimizedSrcset } from '@/lib/image'

interface ProductCardProps {
  product: Product
  onOpen: (product: Product) => void
  onQuickAdd: (productId: string) => void
  /** True for the first cards in the grid — eagerly load their images. */
  priority?: boolean
}

export function ProductCard({ product, onOpen, onQuickAdd, priority = false }: ProductCardProps) {
  const rawSrc = product.image || product.images?.[0] || ''
  const imgSrc = optimizedImage(rawSrc, 320)
  const imgSrcset = optimizedSrcset(rawSrc, [240, 320, 480, 640])
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    imgSrc ? 'loading' : 'error',
  )
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const discount = hasCompare
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0
  /* Inventory (Fase 12) — only show badge / gate CTA when product actively tracks stock */
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const isOutOfStock = stockStatus === 'out_of_stock' || (stockQty !== null && stockQty <= 0)
  const isLowStock = stockStatus === 'low_stock' && stockQty !== null && stockQty > 0

  return (
    <article
      onClick={() => onOpen(product)}
      className="group relative cursor-pointer flex flex-col"
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
        {imgSrc && imgState !== 'error' && (
          <img
            src={imgSrc}
            srcSet={imgSrcset || undefined}
            sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 group-active:scale-[0.98] ${
              imgState === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgState('loaded')}
            onError={() => setImgState('error')}
          />
        )}

        {/* Loading shimmer */}
        {imgState === 'loading' && (
          <div className="absolute inset-0 skeleton" />
        )}

        {/* Error fallback */}
        {imgState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <ImageOff className="w-7 h-7 text-gray-300" strokeWidth={1.5} />
          </div>
        )}

        {discount > 0 && !isOutOfStock && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-gray-900 text-white text-[10px] font-bold tracking-tight">
            −{discount}%
          </span>
        )}

        {/* Stock badges (Fase 12) — esgotado wins over qualquer outra etiqueta */}
        {isOutOfStock && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold tracking-tight uppercase">
            Esgotado
          </span>
        )}
        {!isOutOfStock && isLowStock && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold tracking-tight">
            Últimas {stockQty}
          </span>
        )}

        {/* Out-of-stock greys the image so the gating is unmistakable */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/40 pointer-events-none" />
        )}

        {/* Quick-add only makes sense for "buy" CTA; gated when out of stock */}
        {(!product.cta_type || product.cta_type === 'buy') && !isOutOfStock && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuickAdd(product.id)
            }}
            aria-label={`Adicionar ${product.name}`}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-white text-gray-900 grid place-items-center shadow-[0_2px_8px_rgba(15,23,42,0.12)] active:scale-90 transition-transform"
          >
            <Plus size={16} strokeWidth={2.25} />
          </button>
        )}
      </div>

      <div className="pt-2.5 px-0.5 space-y-1">
        <h3 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 tracking-tight">
          {product.name || 'Produto'}
        </h3>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-gray-900 tabular-nums tracking-tight">
            {money(product.price)}
          </span>
          {hasCompare && (
            <span className="text-[11px] font-medium text-gray-400 line-through tabular-nums">
              {money(product.compare_at_price)}
            </span>
          )}
        </div>

        {/* Reviews badge (Fase 14) — só mostra se houver pelo menos 1 review aprovada */}
        {Number(product.reviews_count || 0) > 0 && Number(product.reviews_avg || 0) > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Star size={11} className="text-amber-400 fill-amber-400" strokeWidth={2} />
            <span className="font-semibold text-gray-700 tabular-nums">{Number(product.reviews_avg).toFixed(1)}</span>
            <span className="text-gray-400">({Number(product.reviews_count)})</span>
          </div>
        )}
      </div>
    </article>
  )
}
