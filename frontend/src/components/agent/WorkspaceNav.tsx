import { Loader2 } from 'lucide-react'
import { NAV_ITEMS } from '@/lib/admin/nav'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useEntitlements } from '@/lib/EntitlementsContext'
import { isNavAllowed } from '@/lib/entitlements'

/**
 * Atalhos fixos no rail do chat — caminhos diretos (canvas), sem skill no chat.
 * Inclui Atendente (antes sumia no menu “Mais”).
 */
const WORKSPACE_NAV = [
  'dashboard', 'leads', 'mensagens', 'atendente', 'produtos', 'pedidos', 'configuracoes',
] as const

const BRAND_ICON_CLASS: Record<string, string> = {
  whatsapp: 'brand-icon--wa',
  instagram: 'brand-icon--ig',
  facebook: 'brand-icon--fb',
  mensagens: 'brand-icon--wa',
}

export function WorkspaceNav() {
  const { triggerNav, loading } = useAgentShell()
  const { entitlements } = useEntitlements()
  const modules = entitlements?.modules

  const items = WORKSPACE_NAV
    .map((key) => NAV_ITEMS.find((n) => n.key === key))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .filter((n) => isNavAllowed(n.key, modules))

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
              <Icon size={14} strokeWidth={1.75} className={BRAND_ICON_CLASS[item.key]} />
            )}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}