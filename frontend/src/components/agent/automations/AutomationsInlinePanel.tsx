import { useEffect, useCallback, useRef } from 'react'
import { Loader2, Zap, MessageSquare, Plus, ChevronRight, GitBranch } from 'lucide-react'
import { fetchAutomationsSnapshot } from '@/lib/automations/client'
import { useAutomationsBridgeOptional } from '@/lib/agent/AutomationsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'

const MODE_LABEL: Record<string, string> = {
  message_received: 'Reativo',
  new_lead: 'Proativo',
  lead_status_change: 'Proativo',
  order_created: 'Evento',
}

export function AutomationsInlinePanel() {
  const bridge = useAutomationsBridgeOptional()
  const { openCanvas, triggerSkill } = useAgentShell()
  const snap = bridge?.snapshot
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    bridge?.publishSnapshot?.({ loading: true })
    try {
      const data = await fetchAutomationsSnapshot()
      bridge?.publishSnapshot?.({
        total: data.total,
        reactive: data.reactive,
        proactive: data.proactive,
        flows: data.flows.slice(0, 5).map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          trigger: f.triggerSubtype,
        })),
        loading: false,
      })
    } catch {
      bridge?.publishSnapshot?.({ loading: false })
    }
  }, [bridge])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  useEffect(() => {
    if (!bridge?.registerHandlers) return
    return bridge.registerHandlers({
      openFull: () => openCanvas('/fluxos'),
      refresh: () => { void load() },
      openFlows: () => openCanvas('/fluxos'),
      createFlow: () => triggerSkill('automation.create', {
        label: 'Criar automação',
        assistantMessage: 'Descreva o comportamento que você quer automatizar:',
      }),
    })
  }, [bridge, load, openCanvas, triggerSkill])

  if (snap?.loading && !snap.flows.length) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--automations">
      <div className="catalog-automation-kpi-grid">
        <div className="catalog-automation-kpi">
          <MessageSquare size={12} className="text-violet-500" />
          <p className="catalog-automation-kpi__value tabular-nums">{snap?.reactive ?? 0}</p>
          <span className="catalog-automation-kpi__label">Reativas</span>
        </div>
        <div className="catalog-automation-kpi">
          <Zap size={12} className="text-amber-500" />
          <p className="catalog-automation-kpi__value tabular-nums">{snap?.proactive ?? 0}</p>
          <span className="catalog-automation-kpi__label">Proativas</span>
        </div>
        <div className="catalog-automation-kpi">
          <GitBranch size={12} className="text-gray-400" />
          <p className="catalog-automation-kpi__value tabular-nums">{snap?.total ?? 0}</p>
          <span className="catalog-automation-kpi__label">Fluxos</span>
        </div>
      </div>

      {snap?.flows && snap.flows.length > 0 && (
        <ul className="catalog-automation-flow-list">
          {snap.flows.map((f) => (
            <li key={f.id} className="catalog-automation-flow-item">
              <span className="catalog-automation-flow-item__name">{f.name}</span>
              <span className={`catalog-automation-flow-item__badge is-${f.status}`}>{f.status}</span>
              {f.trigger && (
                <span className="catalog-automation-flow-item__mode">{MODE_LABEL[f.trigger] || f.trigger}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="catalog-panel__filters">
        <button type="button" className="catalog-panel__filter-chip catalog-panel__filter-chip--auto is-active" onClick={() => openCanvas('/fluxos')}>
          Editor avançado
        </button>
        <button type="button" className="catalog-panel__filter-chip catalog-panel__filter-chip--auto" onClick={() => triggerSkill('automation.create', { label: 'Pedido WhatsApp', assistantMessage: 'Montando fluxo de pedidos…', context: { brief: 'fluxo de pedidos completo para whatsapp' } })}>
          Pedido WhatsApp
        </button>
      </div>

      <button type="button" className="catalog-panel__open-manager" onClick={() => triggerSkill('automation.create', { label: 'Criar automação', assistantMessage: 'Descreva o comportamento:' })}>
        <Plus size={12} />
        Nova automação no chat
        <ChevronRight size={13} />
      </button>
    </div>
  )
}