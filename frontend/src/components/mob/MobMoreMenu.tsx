import {
  User,
  Truck,
  Wallet,
  Bell,
  Volume2,
  Building2,
  LogOut,
  X,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

const ICON = 2.25

export type MobMorePage =
  | 'profile'
  | 'vehicles'
  | 'wallet'
  | 'notifications'
  | 'alerts'
  | 'orgs'

type MenuItem = {
  id: MobMorePage
  label: string
  hint: string
  icon: LucideIcon
  badge?: string | null
}

type MenuSection = {
  title: string
  items: MenuItem[]
}

const SECTIONS: MenuSection[] = [
  {
    title: 'Conta',
    items: [
      {
        id: 'profile',
        label: 'Perfil',
        hint: 'Dados pessoais e documentos',
        icon: User,
      },
      {
        id: 'vehicles',
        label: 'Veículos',
        hint: 'Cadastro, docs e aprovação',
        icon: Truck,
      },
      {
        id: 'wallet',
        label: 'Carteira',
        hint: 'PIX e resumo de ganhos',
        icon: Wallet,
      },
    ],
  },
  {
    title: 'Avisos',
    items: [
      {
        id: 'notifications',
        label: 'Notificações',
        hint: 'Histórico de avisos do app',
        icon: Bell,
      },
      {
        id: 'alerts',
        label: 'Push e alertas',
        hint: 'Push, som e vibração',
        icon: Volume2,
      },
    ],
  },
  {
    title: 'Operação',
    items: [
      {
        id: 'orgs',
        label: 'Lojas vinculadas',
        hint: 'Vínculos e convites',
        icon: Building2,
      },
    ],
  },
]

export function MobMoreMenu({
  open,
  onClose,
  onNavigate,
  onLogout,
  profileStatus,
  vehicleCount,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (page: MobMorePage) => void
  onLogout: () => void
  profileStatus?: string | null
  vehicleCount?: number
}) {
  if (!open) return null

  const badges: Partial<Record<MobMorePage, string | null>> = {
    profile: profileStatus && profileStatus !== 'approved' ? profileStatus : null,
    vehicles: vehicleCount != null && vehicleCount > 0 ? String(vehicleCount) : null,
  }

  return (
    <div className="mob-more-overlay" role="dialog" aria-modal="true" aria-label="Menu Mais">
      <button type="button" className="mob-more-overlay__backdrop" onClick={onClose} aria-label="Fechar" />
      <div className="mob-more-sheet">
        <div className="mob-more-sheet__handle" aria-hidden />
        <div className="mob-more-sheet__top">
          <div>
            <p className="mob-more-sheet__title">Mais</p>
            <p className="mob-more-sheet__sub">Conta, avisos e operação</p>
          </div>
          <button type="button" className="mob-more-sheet__close" onClick={onClose} aria-label="Fechar">
            <X size={18} strokeWidth={ICON} />
          </button>
        </div>

        <div className="mob-more-sheet__body">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mob-more-section">
              <p className="mob-more-section__label">{section.title}</p>
              <div className="mob-more-section__list">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const badge = badges[item.id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="mob-more-item"
                      onClick={() => onNavigate(item.id)}
                    >
                      <span className="mob-more-item__icon">
                        <Icon size={18} strokeWidth={ICON} />
                      </span>
                      <span className="mob-more-item__text">
                        <span className="mob-more-item__label">{item.label}</span>
                        <span className="mob-more-item__hint">{item.hint}</span>
                      </span>
                      {badge ? <span className="mob-more-item__badge">{badge}</span> : null}
                      <ChevronRight size={16} className="mob-more-item__chev" strokeWidth={ICON} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <button type="button" className="mob-more-logout" onClick={onLogout}>
            <LogOut size={16} strokeWidth={ICON} />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
