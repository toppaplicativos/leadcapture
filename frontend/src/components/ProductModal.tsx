import { X, Minus, Plus, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Product } from '@/lib/api'
import { money } from '@/lib/store-context'
import { Button } from '@/components/ui'

interface ProductModalProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (productId: string, qty: number) => void
}

export function ProductModal({ product, onClose, onAddToCart }: ProductModalProps) {
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (!product) return
    setQty(1)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [product, onClose])

  if (!product) return null

  const subtotal = Number(product.price || 0) * qty
  const imgSrc = product.image || product.images?.[0] || ''
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)

  const details: [string, string][] = []
  if (product.sku) details.push(['SKU', product.sku])
  if (product.weight) details.push(['Peso', product.weight + (product.weight_unit ? ' ' + product.weight_unit : '')])
  if (product.unit) details.push(['Unidade', product.unit])
  if (product.stock != null && product.stock !== '')
    details.push(['Estoque', Number(product.stock) > 0 ? 'Disponível' : 'Indisponível'])

  function handleAdd() {
    onAddToCart(product!.id, qty)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name || 'Produto'}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center animate-in fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Image */}
        <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-gray-100 shrink-0">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 text-gray-700 grid place-items-center shadow-md hover:bg-white active:scale-90 transition"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pt-5 pb-4 space-y-4 flex-1">
          <div>
            {product.category && (
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                {product.category}
              </span>
            )}
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight mt-0.5">
              {product.name}
            </h2>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">
              {money(product.price)}
            </span>
            {hasCompare && (
              <span className="text-sm text-gray-400 line-through tabular-nums">
                {money(product.compare_at_price)}
              </span>
            )}
          </div>

          {product.description && (
            <p className="text-[14px] text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {details.length > 0 && (
            <div className="border-t border-border-light pt-4 space-y-2.5">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between text-[13px]">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer (sticky) */}
        <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 border-t border-border-light bg-white sticky bottom-0 flex items-center gap-3 shrink-0">
          <div className="flex items-center bg-gray-100 rounded-full">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Diminuir quantidade"
              disabled={qty <= 1}
              className="w-10 h-10 grid place-items-center rounded-full text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-600 active:scale-90 transition"
            >
              <Minus size={14} strokeWidth={2.25} />
            </button>
            <span className="w-8 text-center font-semibold tabular-nums text-[14px]">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(999, q + 1))}
              aria-label="Aumentar quantidade"
              className="w-10 h-10 grid place-items-center rounded-full text-gray-600 hover:text-gray-900 active:scale-90 transition"
            >
              <Plus size={14} strokeWidth={2.25} />
            </button>
          </div>

          <Button
            onClick={handleAdd}
            size="lg"
            variant="brand"
            className="flex-1"
          >
            Adicionar · {money(subtotal)}
          </Button>
        </div>
      </div>
    </div>
  )
}
