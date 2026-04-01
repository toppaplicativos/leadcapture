import { ShoppingCart } from 'lucide-react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'

interface ProductCardProps {
  product: Product
  onOpen: (product: Product) => void
  onQuickAdd: (productId: string) => void
}

export function ProductCard({ product, onOpen, onQuickAdd }: ProductCardProps) {
  const imgSrc = product.image || product.images?.[0] || ''
  const desc = (product.description || '').slice(0, 90)
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)

  return (
    <article
      className="bg-surface rounded-2xl overflow-hidden shadow-sm border border-border/50 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onOpen(product)}
    >
      {imgSrc ? (
        <div className="relative overflow-hidden aspect-square bg-gray-50">
          <img
            src={imgSrc}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
          <ShoppingCart className="w-8 h-8 text-gray-300" />
        </div>
      )}

      <div className="p-3.5 space-y-2">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2">
          {product.name || 'Produto'}
        </h3>

        {product.category && (
          <span className="inline-block text-[10px] font-medium text-[var(--brand-secondary)] bg-[var(--brand-secondary-light)] px-2 py-0.5 rounded-full">
            {product.category}
          </span>
        )}

        {desc && (
          <p className="text-xs text-muted leading-relaxed line-clamp-2">{desc}</p>
        )}

        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-[var(--brand-secondary)]">
            {money(product.price)}
          </span>
          {hasCompare && (
            <span className="text-xs text-muted line-through">
              {money(product.compare_at_price)}
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickAdd(product.id)
          }}
          className="w-full flex items-center justify-center gap-1.5 bg-[var(--brand-secondary)] text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>
    </article>
  )
}
