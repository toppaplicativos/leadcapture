import { Loader2 } from 'lucide-react'
import { MOBILE_NAV, NAV_ITEMS } from '@/lib/admin/nav'
import { useAgentShell } from '@/lib/agent/AgentShellContext'

export function WorkspaceNav() {
  const { triggerNav, loading } = useAgentShell()

  const items = MOBILE_NAV
    .map((key) => NAV_ITEMS.find((n) => n.key === key))
    .filter((n): n is NonNullable<typeof n> => !!n)

  return (
    <nav className="workspace-nav shrink-0" aria-label="Ferramentas">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            className="workspace-nav__item"
            disabled={loading}
            onClick={() => triggerNav(item.key)}
            title={item.label}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin text-gray-400" />
            ) : (
              <Icon size={14} strokeWidth={1.75} />
            )}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}