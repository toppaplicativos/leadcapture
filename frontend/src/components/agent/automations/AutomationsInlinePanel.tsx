import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { Zap, MessageSquare, Plus, ChevronRight, GitBranch, ExternalLink } from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { fetchAutomationsSnapshot } from '@/lib/automations/client'
import { useAutomationsBridgeOptional } from '@/lib/agent/AutomationsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const AutomationsManager = lazy(() =>
  import('@/pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })),
)
const FlowBuilderManager = lazy(() =>
  import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage })),
)

const MODE_LABEL: Record<string, string> = {
  message_received: 'Reativo',
  new_lead: 'Proativo',
  lead_status_change: 'Proativo',
  order_created: 'Evento',
}

type ManagerView = 'hub' | 'editor'

export function AutomationsInlinePanel() {
  const bridge = useAutomationsBridgeOptional()
  const { openCanvas, triggerSkill } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const loadedRef = useRef(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerView, setManagerView] = useState<ManagerView>('hub')

  const load = useCallback(async () => {
    bridge?.publishSnapshot?.({ loading: true })
    try {
      const data = await fetchAutomationsSnapshot()
      bridge?.publishSnapshot?.({
        total: data.total,
        reactive: data.reactive,
        proactive: data.proactive,
        flows: data.flows.slice(0, 5).map((f: { id: string; name: string; status: string; triggerSubtype?: string }) => ({
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

  const openManager = useCallback((view: ManagerView = 'hub') => {
    setManagerView(view)
    bridge?.setModuleExpanded?.(true)
    if (isDesktop) {
      openCanvas(view === 'editor' ? '/fluxos' : '/automacoes')
    } else {
      setManagerOpen(true)
    }
  }, [bridge, isDesktop, openCanvas])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  useEffect(() => {
    if (!bridge?.registerHandlers) return
    return bridge.registerHandlers({
      openFull: () => openManager('hub'),
      refresh: () => { void load() },
      openFlows: () => openManager('editor'),
      createFlow: () => triggerSkill('automation.create', {
        label: 'Criar automação',
        assistantMessage: 'Descreva o comportamento que você quer automatizar:',
      }),
    })
  }, [bridge, load, openManager, triggerSkill])

  if (snap?.loading && !snap.flows.length) {
    return <PageSplash variant="panel" label="Automacoes" />
  }

  const sheetTitle = managerView === 'editor' ? 'Editor de fluxos' : 'Automações'
  const sheetSubtitle = managerView === 'editor'
    ? 'Fluxos reativos e proativos WhatsApp'
    : `${(snap as any)?.definitions?.total ?? snap?.total ?? 0} automação${((snap as any)?.definitions?.total ?? snap?.total ?? 0) === 1 ? '' : 'ões'} · gatilhos e pipeline`

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
        <button
          type="button"
          className="catalog-panel__filter-chip catalog-panel__filter-chip--auto is-active"
          onClick={() => openManager('hub')}
        >
          Hub de gestão
        </button>
        <button
          type="button"
          className="catalog-panel__filter-chip catalog-panel__filter-chip--auto"
          onClick={() => openManager('editor')}
        >
          Editor avançado
        </button>
      </div>

      {isDesktop ? (
        <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('hub')}>
          <Plus size={12} />
          Abrir hub de automações
          <ChevronRight size={13} />
        </button>
      ) : (
        <>
          <div className="catalog-panel__toolbar catalog-panel__toolbar--tight">
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => openManager('editor')}>
              <GitBranch size={14} /> Editor
            </button>
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => openManager('hub')}>
              <ExternalLink size={14} /> Hub completo
            </button>
          </div>
          <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('hub')}>
            Gerenciar automações
            <ChevronRight size={13} />
          </button>
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title={sheetTitle}
            subtitle={sheetSubtitle}
          >
            <Suspense fallback={<PageSplash variant="panel" label="Automacoes" />}>
              {managerView === 'editor' ? <FlowBuilderManager /> : <AutomationsManager embedded />}
            </Suspense>
          </CatalogManagerSheet>
        </>
      )}
    </div>
  )
}