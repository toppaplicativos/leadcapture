import { useEffect, useState } from 'react'
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
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`store-topbar sticky top-0 z-50 safe-area-top transition-shadow duration-200 ${
        scrolled ? 'is-scrolled' : ''
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 max-w-[var(--store-max)] mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="w-8 h-8 rounded-xl object-cover ring-1 ring-black/5"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-brand text-white grid place-items-center text-xs font-bold">
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
          className="relative grid place-items-center w-10 h-10 rounded-full text-gray-800 hover:bg-gray-100 active:scale-95 transition"
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
  )
}