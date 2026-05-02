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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-t border-border-light safe-area-bottom">
      <div className="flex max-w-2xl mx-auto px-2">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 active:scale-[0.96] transition-transform"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? 'text-brand' : 'text-gray-400'}
              />
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
