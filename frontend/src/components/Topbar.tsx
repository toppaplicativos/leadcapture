import { ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCartStore } from '@/lib/store'
import { storeUrl } from '@/lib/store-context'

interface TopbarProps {
  storeName: string
  logoUrl?: string
}

export function Topbar({ storeName, logoUrl }: TopbarProps) {
  const totalItems = useCartStore((s) => s.totalItems())

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-border-light safe-area-top">
      <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={storeName}
              className="w-7 h-7 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-brand text-white grid place-items-center text-xs font-semibold">
              {(storeName || 'L').charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight truncate">
            {storeName}
          </h1>
        </div>

        <Link
          to={storeUrl('checkout')}
          aria-label={`Carrinho${totalItems > 0 ? ` (${totalItems} itens)` : ''}`}
          className="relative grid place-items-center w-10 h-10 rounded-full text-gray-700 hover:bg-gray-100 active:scale-90 transition"
        >
          <ShoppingBag size={18} strokeWidth={1.75} />
          {totalItems > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-brand text-white text-[10px] font-semibold grid place-items-center px-1 ring-2 ring-white tabular-nums">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
