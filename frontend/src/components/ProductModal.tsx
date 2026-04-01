import { X, Minus, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'

interface ProductModalProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (productId: string, qty: number) => void
}

export function ProductModal({ product, onClose, onAddToCart }: ProductModalProps) {
  const [qty, setQty] = useState(1)

  if (!product) return null

  const subtotal = Number(product.price || 0) * qty
  const imgSrc = product.image || product.images?.[0] || ''
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)

  const details: [string, string][] = []
  if (product.sku) details.push(['Código / SKU', product.sku])
  if (product.weight) details.push(['Peso', product.weight + (product.weight_unit ? ' ' + product.weight_unit : '')])
  if (product.unit) details.push(['Unidade', product.unit])
  if (product.stock != null && product.stock !== '')
    details.push(['Estoque', Number(product.stock) > 0 ? 'Disponível' : 'Indisponível'])

  function handleAdd() {
    onAddToCart(product!.id, qty)
    setQty(1)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl page-enter">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/20 text-white flex items-center justify-center hover:bg-black/40 transition"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Image */}
        {imgSrc && (
          <img
            src={imgSrc}
            alt={product.name}
            className="w-full h-64 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}

        <div className="p-5 space-y-4">
          {/* Name & category */}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
            {product.category && (
              <span className="inline-block mt-1 text-xs font-medium text-[var(--brand-secondary)] bg-[var(--brand-secondary-light)] px-2 py-0.5 rounded-full">
                {product.category}
              </span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-sm text-muted leading-relaxed">{product.description}</p>
          )}

          {/* Detail rows */}
          {details.length > 0 && (
            <div className="space-y-2">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--brand-secondary)]">
              {money(product.price)}
            </span>
            {hasCompare && (
              <span className="text-sm text-muted line-through">
                {money(product.compare_at_price)}
              </span>
            )}
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Quantidade</span>
            <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(999, q + 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Subtotal + Add button */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-xs text-muted">Total</p>
              <p className="text-lg font-bold">{money(subtotal)}</p>
            </div>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 bg-[var(--brand-secondary)] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar • {money(subtotal)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
