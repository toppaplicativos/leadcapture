import { useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '@/lib/admin/nav'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useEntitlements } from '@/lib/EntitlementsContext'
import { isNavAllowed } from '@/lib/entitlements'
import { pathOnly } from '@/lib/agent/operationalRoutes'
import { prefetchCanvasRoute } from '@/lib/agent/canvasPages'
import { cn } from '@/lib/cn'

/**
 * Atalhos fixos no rail do chat — caminhos diretos (canvas), sem skill no chat.
 * Prefetch no hover; clique nunca depende do loading do chat.
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

const KEY_TO_PATH: Record<string, string> = {
  dashboard: '/admin',
  leads: '/leads',
  mensagens: '/mensagens',
  atendente: '/atendente',
  produtos: '/produtos',
  pedidos: '/pedidos',
  configuracoes: '/configuracoes',
}

function isNavActive(key: string, itemPath: string, pathname: string): boolean {
  const p = pathOnly(pathname)
  if (key === 'dashboard') return p === '/admin' || p === '/dashboard' || p === '/assistente'
  if (key === 'configuracoes') return p === '/configuracoes' || p.startsWith('/configuracoes/')
  return p === itemPath || p === `/${key}`
}

export function WorkspaceNav() {
  const { triggerNav, optimisticRoute } = useAgentShell()
  const { entitlements } = useEntitlements()
  const location = useLocation()
  const modules = entitlements?.modules
  // Ativo visual usa rota otimista se houver (clique imediato)
  const pathname = optimisticRoute || location.pathname

  const items = WORKSPACE_NAV
    .map((key) => NAV_ITEMS.find((n) => n.key === key))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .filter((n) => isNavAllowed(n.key, modules))

  return (
    <nav className="workspace-nav shrink-0" aria-label="Ferramentas">
      {items.map((item) => {
        const Icon = item.icon
        const active = isNavActive(item.key, item.path, pathname)
        const prefetchPath = KEY_TO_PATH[item.key] || item.path
        return (
          <button
            key={item.key}
            type="button"
            className={cn('workspace-nav__item', active && 'is-active')}
            onMouseEnter={() => prefetchCanvasRoute(prefetchPath)}
            onFocus={() => prefetchCanvasRoute(prefetchPath)}
            onPointerDown={() => prefetchCanvasRoute(prefetchPath)}
            onClick={() => triggerNav(item.key)}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={14} strokeWidth={1.75} className={BRAND_ICON_CLASS[item.key]} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
