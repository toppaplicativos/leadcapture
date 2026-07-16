import { useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { NAV_ITEMS } from '@/lib/admin/nav'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useEntitlements } from '@/lib/EntitlementsContext'
import { isNavAllowed, NAV_MODULE_MAP } from '@/lib/entitlements'
import { pathOnly } from '@/lib/agent/operationalRoutes'
import { prefetchCanvasRoute } from '@/lib/agent/canvasPages'
import { cn } from '@/lib/cn'
import { openPlanUpgradeForModule } from '@/lib/plan-upgrade'

/**
 * Atalhos fixos no rail do chat — caminhos diretos (canvas), sem skill no chat.
 * Prefetch no hover; clique nunca depende do loading do chat.
 * Itens fora do plano aparecem bloqueados e abrem modal de upgrade.
 */
const WORKSPACE_NAV = [
  'dashboard', 'leads', 'mensagens', 'atendente', 'fluxos', 'produtos', 'pedidos', 'estoque', 'configuracoes',
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
  fluxos: '/fluxos',
  produtos: '/produtos',
  pedidos: '/pedidos',
  estoque: '/estoque',
  configuracoes: '/configuracoes',
}

function isNavActive(key: string, itemPath: string, pathname: string): boolean {
  const p = pathOnly(pathname)
  if (key === 'dashboard') return p === '/admin' || p === '/dashboard'
  if (key === 'configuracoes') return p === '/configuracoes' || p.startsWith('/configuracoes/')
  return p === itemPath || p === `/${key}`
}

export function WorkspaceNav() {
  const { triggerNav, optimisticRoute } = useAgentShell()
  const { entitlements } = useEntitlements()
  const location = useLocation()
  const modules = entitlements?.modules
  const planSlug = entitlements?.subscription?.plan_slug
  const pathname = optimisticRoute || location.pathname

  const items = WORKSPACE_NAV.map(key => NAV_ITEMS.find(n => n.key === key)).filter(
    (n): n is NonNullable<typeof n> => !!n,
  )

  return (
    <nav className="workspace-nav shrink-0" aria-label="Ferramentas">
      {items.map(item => {
        const Icon = item.icon
        const allowed = isNavAllowed(item.key, modules)
        const active = allowed && isNavActive(item.key, item.path, pathname)
        const prefetchPath = KEY_TO_PATH[item.key] || item.path
        const mod = NAV_MODULE_MAP[item.key]

        return (
          <button
            key={item.key}
            type="button"
            className={cn(
              'workspace-nav__item',
              active && 'is-active',
              !allowed && 'opacity-55',
            )}
            onMouseEnter={() => {
              if (allowed) prefetchCanvasRoute(prefetchPath)
            }}
            onFocus={() => {
              if (allowed) prefetchCanvasRoute(prefetchPath)
            }}
            onPointerDown={() => {
              if (allowed) prefetchCanvasRoute(prefetchPath)
            }}
            onClick={() => {
              if (!allowed) {
                openPlanUpgradeForModule(
                  mod || item.key,
                  `${item.label} não está incluído no seu plano atual.`,
                  planSlug,
                )
                return
              }
              triggerNav(item.key)
            }}
            title={allowed ? item.label : `${item.label} · fora do plano`}
            aria-label={allowed ? item.label : `${item.label} (bloqueado pelo plano)`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative inline-flex">
              <Icon size={14} strokeWidth={1.75} className={BRAND_ICON_CLASS[item.key]} />
              {!allowed && (
                <Lock
                  size={9}
                  strokeWidth={2.5}
                  className="absolute -right-1.5 -bottom-1 text-amber-600"
                  aria-hidden
                />
              )}
            </span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
