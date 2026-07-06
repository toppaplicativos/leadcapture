import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Megaphone, Plus, Sparkles, Settings } from 'lucide-react'
import { adminApi } from '@/lib/api-admin'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { CampaignEditorModal } from '@/pages/admin/campaigns/CampaignsView'
import { dt, num } from '@/lib/admin/helpers'

function statusLabel(status?: string) {
  const m: Record<string, string> = {
    active: 'Ativa',
    running: 'Enviando',
    sending: 'Enviando',
    draft: 'Rascunho',
    paused: 'Pausada',
    completed: 'Concluída',
    finished: 'Finalizada',
    cancelled: 'Cancelada',
  }
  return m[(status || '').toLowerCase()] || status || 'Rascunho'
}

function CampaignChatCard({ campaign, onOpen }: { campaign: any; onOpen: () => void }) {
  const isRunning = ['active', 'running', 'sending'].includes(campaign.status)
  const pct = campaign.target_count > 0
    ? Math.round(((campaign.sent_count || 0) / campaign.target_count) * 100)
    : 0
  const accent = isRunning ? 'is-running' : ['draft', 'paused', 'scheduled'].includes(campaign.status) ? 'is-draft' : 'is-done'

  return (
    <button type="button" className={`catalog-campaign-card ${accent}`} onClick={onOpen}>
      <div className="catalog-campaign-card__bar" />
      <div className="catalog-campaign-card__body">
        <div className="catalog-campaign-card__head">
          <Megaphone size={13} className="shrink-0 text-gray-400" />
          <span className="catalog-campaign-card__title">{campaign.name || 'Campanha'}</span>
        </div>
        <div className="catalog-campaign-card__meta">
          <span className={`catalog-campaign-card__status is-${campaign.status || 'draft'}`}>
            {statusLabel(campaign.status)}
          </span>
          {campaign.use_ai && <span className="catalog-campaign-card__ai">IA</span>}
          <span className="catalog-campaign-card__date">{dt(campaign.created_at)}</span>
        </div>
        <div className="catalog-campaign-card__kpis">
          <span><strong>{num(campaign.target_count || 0)}</strong> leads</span>
          <span><strong>{num(campaign.sent_count || 0)}</strong> enviados</span>
          <span><strong>{num(campaign.replied_count || 0)}</strong> resp.</span>
        </div>
        {campaign.target_count > 0 && (
          <div className="catalog-campaign-card__progress">
            <div className="catalog-campaign-card__progress-bar" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
        <span className="catalog-campaign-card__cta">
          <Settings size={11} /> Abrir campanha
        </span>
      </div>
    </button>
  )
}

export function CampaignsInlinePanel() {
  const bridge = useCampaignsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { onOpenModal } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<any>(null)
  const campaignsRef = useRef<any[]>([])
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminApi.campaigns()
      const list = d.campaigns || d.items || (Array.isArray(d) ? d : [])
      campaignsRef.current = list
      setCampaigns(list)
      const active = list.filter((c: any) => ['active', 'running', 'sending'].includes(c.status)).length
      publishSnapshot?.({ total: list.length, active, loading: false })
    } catch {
      publishSnapshot?.({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  useEffect(() => {
    if (isDesktop || loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [isDesktop, load])

  const openCampaign = useCallback((c: any) => {
    setEditCampaign(c)
    setModalOpen(true)
    publishSnapshot?.({
      selectedId: String(c.id),
      selectedName: c.name || '',
    })
  }, [publishSnapshot])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      selectCampaign: (id) => {
        const found = campaignsRef.current.find((c) => String(c.id) === String(id))
        if (found) openCampaign(found)
      },
      createNew: () => {
        setEditCampaign(null)
        setModalOpen(true)
        setCardsOpen(true)
      },
      openAiWizard: () => onOpenModal('ai-campaign'),
      openFull: () => {
        setModuleExpanded(true)
        setCardsOpen(true)
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, onOpenModal, openCampaign, load])

  if (isDesktop) return null

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
          onClick={() => {
            setModuleExpanded?.(true)
            setCardsOpen(true)
          }}
        >
          <Plus size={14} /> Ver todas
        </button>
      </div>

      {!cardsOpen ? (
        <p className="catalog-panel__empty">
          Toque em <strong>Ver todas</strong> para listar suas campanhas em cards.
        </p>
      ) : campaigns.length === 0 ? (
        <p className="catalog-panel__empty">Nenhuma campanha ainda. Crie uma com IA ou no gerenciador.</p>
      ) : (
        <div className="catalog-campaign-grid">
          {campaigns.map((c) => (
            <CampaignChatCard
              key={c.id}
              campaign={c}
              onOpen={() => openCampaign(c)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <CampaignEditorModal
          campaign={editCampaign}
          onClose={() => {
            setModalOpen(false)
            setEditCampaign(null)
            publishSnapshot?.({ selectedId: null, selectedName: '' })
          }}
          onSaved={() => {
            setModalOpen(false)
            setEditCampaign(null)
            publishSnapshot?.({ selectedId: null, selectedName: '' })
            void load()
          }}
          showToast={(msg, tp) => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
        />
      )}
    </div>
  )
}