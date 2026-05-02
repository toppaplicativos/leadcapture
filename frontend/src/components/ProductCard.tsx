import { useState } from 'react'
import { Plus, ImageOff } from 'lucide-react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'

interface ProductCardProps {
  product: Product
  onOpen: (product: Product) => void
  onQuickAdd: (productId: string) => void
  /** True for the first cards in the grid — eagerly load their images. */
  priority?: boolean
}

export function ProductCard({ product, onOpen, onQuickAdd, priority = false }: ProductCardProps) {
  const imgSrc = product.image || product.images?.[0] || ''
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    imgSrc ? 'loading' : 'error',
  )
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const discount = hasCompare
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0

  return (
    <article
      onClick={() => onOpen(product)}
      className="group relative cursor-pointer flex flex-col"
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
        {imgSrc && imgState !== 'error' && (
          <img
            src={imgSrc}
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

        {discount > 0 && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-gray-900 text-white text-[10px] font-bold tracking-tight">
            −{discount}%
          </span>
        )}

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
      </div>
    </article>
  )
}
