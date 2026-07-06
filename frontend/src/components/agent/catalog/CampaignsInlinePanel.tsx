import { useEffect, useState, useCallback } from 'react'
import { Loader2, Megaphone, Plus, Sparkles } from 'lucide-react'
import { adminApi } from '@/lib/api-admin'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'

export function CampaignsInlinePanel() {
  const bridge = useCampaignsBridgeOptional()
  const { openCanvas, onOpenModal } = useAgentShell()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminApi.campaigns()
      const list = d.campaigns || d.items || (Array.isArray(d) ? d : [])
      setCampaigns(list)
      const active = list.filter((c: any) => ['active', 'running', 'sending'].includes(c.status)).length
      bridge?.publishSnapshot({ total: list.length, active, loading: false })
    } catch {
      bridge?.publishSnapshot({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [bridge])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bridge) return
    return bridge.registerHandlers({
      selectCampaign: (id, name) => {
        bridge.publishSnapshot({ selectedId: id, selectedName: name || '' })
        openCanvas('/campanhas')
      },
      createNew: () => openCanvas('/campanhas'),
      openAiWizard: () => onOpenModal('ai-campaign'),
      openFull: () => openCanvas('/campanhas'),
      refresh: () => load(),
    })
  }, [bridge, load, openCanvas, onOpenModal])

  if (loading) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--campaigns">
      <div className="catalog-panel__toolbar">
        <button
          type="button"
          className="catalog-panel__action"
          onClick={() => bridge?.dispatch({ type: 'open_ai_wizard' })}
        >
          <Sparkles size={14} /> Campanha IA
        </button>
        <button
          type="button"
          className="catalog-panel__action catalog-panel__action--ghost"
          onClick={() => bridge?.dispatch({ type: 'create_new' })}
        >
          <Plus size={14} /> Nova
        </button>
      </div>
      {campaigns.length === 0 ? (
        <p className="catalog-panel__empty">Nenhuma campanha ainda.</p>
      ) : (
        <ul className="catalog-panel__list">
          {campaigns.slice(0, 6).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="catalog-panel__row"
                onClick={() => bridge?.dispatch({ type: 'select_campaign', id: c.id, name: c.name })}
              >
                <Megaphone size={14} className="text-gray-400 shrink-0" />
                <span className="catalog-panel__row-title">{c.name || 'Campanha'}</span>
                <span className={`catalog-panel__status is-${c.status || 'draft'}`}>
                  {c.status || 'draft'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}