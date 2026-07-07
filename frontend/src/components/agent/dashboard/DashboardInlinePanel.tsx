import { useEffect, useCallback } from 'react'
import {
  Loader2, Users, Megaphone, ShoppingCart, Package, ChevronRight, ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDashboardBridgeOptional } from '@/lib/agent/DashboardBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

const KPI_ICONS: Record<string, LucideIcon> = {
  users: Users,
  megaphone: Megaphone,
  cart: ShoppingCart,
  package: Package,
}

const NAV_KEYS: Record<string, string> = {
  Leads: 'leads',
  Campanhas: 'campanhas',
  Pedidos: 'pedidos',
  Produtos: 'produtos',
}

export function DashboardInlinePanel() {
  const bridge = useDashboardBridgeOptional()
  const { triggerNav, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const publishSnapshot = bridge?.publishSnapshot

  const openManager = useCallback(() => {
    if (isDesktop) openCanvas('/dashboard')
    else bridge?.dispatch({ type: 'open_full' })
  }, [isDesktop, openCanvas, bridge])

  const registerHandlers = bridge?.registerHandlers
  useEffect(() => {
    if (!registerHandlers) return
    return registerHandlers({
      openFull: () => openCanvas('/dashboard'),
      refresh: () => triggerNav('dashboard'),
      navigate: (key) => triggerNav(key),
    })
  }, [registerHandlers, openCanvas, triggerNav])

  if (!snap || (snap.loading && !snap.items.length)) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const items = snap.items.length
    ? snap.items
    : [
      { label: 'Leads', value: snap.leads, icon: 'users' },
      { label: 'Campanhas', value: snap.campaigns, icon: 'megaphone' },
      { label: 'Pedidos', value: snap.orders, icon: 'cart' },
      { label: 'Produtos', value: snap.products, icon: 'package' },
    ]

  return (
    <div className="catalog-panel catalog-panel--dashboard">
      <div className="catalog-panel__toolbar">
        <p className="catalog-dashboard__subtitle">
          {snap.subtitle || 'Resumo operacional do seu negócio'}
        </p>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openManager}>
          <ExternalLink size={14} /> Painel completo
        </button>
      </div>

      <div className="catalog-dashboard-kpi-grid">
        {items.map((item) => {
          const Icon = KPI_ICONS[item.icon || ''] || Package
          const navKey = NAV_KEYS[item.label]
          return (
            <button
              key={item.label}
              type="button"
              className="catalog-dashboard-kpi"
              onClick={() => {
                if (navKey) triggerNav(navKey)
                publishSnapshot?.({})
              }}
            >
              <div className="catalog-dashboard-kpi__head">
                <span className="catalog-dashboard-kpi__label">{item.label}</span>
                <Icon size={13} className="text-gray-400" strokeWidth={1.75} />
              </div>
              <p className="catalog-dashboard-kpi__value tabular-nums">
                {Number(item.value || 0).toLocaleString('pt-BR')}
              </p>
            </button>
          )
        })}
      </div>

      <div className="catalog-panel__filters">
        {(['leads', 'campanhas', 'pedidos', 'produtos'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="catalog-panel__filter-chip catalog-panel__filter-chip--dashboard"
            onClick={() => triggerNav(key)}
          >
            {key === 'leads' ? 'Leads' : key === 'campanhas' ? 'Campanhas' : key === 'pedidos' ? 'Pedidos' : 'Produtos'}
          </button>
        ))}
      </div>

      <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
        Ver painel completo
        <ChevronRight size={13} />
      </button>
    </div>
  )
}