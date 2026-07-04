import { LayoutGrid, Receipt, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const tabs: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'catalogo', label: 'Catálogo', Icon: LayoutGrid },
  { id: 'pedidos', label: 'Pedidos', Icon: Receipt },
  { id: 'perfil', label: 'Perfil', Icon: User },
]

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="store-nav fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="flex max-w-[var(--store-max)] mx-auto px-3 pt-1 pb-1.5">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`store-nav__item flex-1 flex flex-col items-center gap-0.5 py-2 active:scale-[0.97] transition-transform ${
                isActive ? 'is-active' : ''
              }`}
            >
              <span className="store-nav__icon-wrap">
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
              </span>
              <span
                className={`text-[10px] tracking-wide ${
                  isActive ? 'font-semibold text-brand' : 'font-medium text-gray-500'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}