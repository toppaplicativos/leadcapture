import { LayoutGrid, FileText, User } from 'lucide-react'

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const tabs = [
  { id: 'catalogo', label: 'Catálogo', icon: LayoutGrid },
  { id: 'pedidos', label: 'Pedidos', icon: FileText },
  { id: 'perfil', label: 'Perfil', icon: User },
]

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur border-t border-border safe-area-bottom">
      <div className="flex max-w-2xl mx-auto">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                isActive
                  ? 'text-[var(--brand-secondary)]'
                  : 'text-muted hover:text-gray-600'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
