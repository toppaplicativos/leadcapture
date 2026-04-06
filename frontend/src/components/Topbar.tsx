import { ShoppingCart } from 'lucide-react'
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
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border safe-area-top">
      <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={storeName}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-border"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--brand-secondary)] text-white flex items-center justify-center text-sm font-semibold">
              {(storeName || 'L').charAt(0)}
            </div>
          )}
          <h1 className="text-base font-semibold truncate">{storeName}</h1>
        </div>
        <Link
          to={storeUrl('checkout')}
          className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Carrinho"
        >
          <ShoppingCart className="w-5 h-5 text-gray-700" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[var(--brand-secondary)] text-white text-[10px] font-bold flex items-center justify-center px-1">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
