import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Megaphone, Plus, Sparkles, ChevronRight, Search,
  LayoutGrid, List, Rows3, ExternalLink,
} from 'lucide-react'
import { adminApi } from '@/lib/api-admin'
import { useCampaignsBridgeOptional } from '@/lib/agent/CampaignsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { CampaignEditorModal } from '@/pages/admin/campaigns/CampaignsView'
import { dt, num } from '@/lib/admin/helpers'
import { CatalogManagerSheet } from './CatalogManagerSheet'

const CampaignsManager = lazy(() =>
  import('@/pages/admin/campaigns/CampaignsView').then((m) => ({ default: m.CampaignsView })),
)

type ChatViewMode = 'compact' | 'list' | 'cards'

const PREVIEW_LIMIT: Record<ChatViewMode, number> = {
  compact: 8,
  list: 5,
  cards: 3,
}

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

function campaignAccent(campaign: any) {
  const isRunning = ['active', 'running', 'sending'].includes(campaign.status)
  if (isRunning) return 'is-running'
  if (['draft', 'paused', 'scheduled'].includes(campaign.status)) return 'is-draft'
  return 'is-done'
}

function CampaignChatCard({ campaign, onOpen }: { campaign: any; onOpen: () => void }) {
  const isRunning = ['active', 'running', 'sending'].includes(campaign.status)
  const pct = campaign.target_count > 0
    ? Math.round(((campaign.sent_count || 0) / campaign.target_count) * 100)
    : 0
  const accent = campaignAccent(campaign)

  return (
    <button type="button" className={`catalog-campaign-card ${accent}`} onClick={onOpen}>
      <div className="catalog-campaign-card__bar" />
      <div className="catalog-campaign-card__body">
        <div className="catalog-campaign-card__header">
          <div className="catalog-campaign-card__icon">
            <Megaphone size={15} strokeWidth={1.75} />
          </div>
          <div className="catalog-campaign-card__headline">
            <span className="catalog-campaign-card__title">{campaign.name || 'Campanha'}</span>
            <div className="catalog-campaign-card__meta">
              <span className={`catalog-campaign-card__status is-${campaign.status || 'draft'}`}>
                {statusLabel(campaign.status)}
              </span>
              {campaign.use_ai && <span className="catalog-campaign-card__ai">IA</span>}
              <span className="catalog-campaign-card__date">{dt(campaign.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="catalog-campaign-card__kpis">
          <div className="catalog-campaign-card__kpi">
            <strong>{num(campaign.target_count || 0)}</strong>
            <span>Leads</span>
          </div>
          <div className={`catalog-campaign-card__kpi ${isRunning ? 'is-live' : ''}`}>
            <strong>{num(campaign.sent_count || 0)}</strong>
            <span>Enviados</span>
          </div>
          <div className={`catalog-campaign-card__kpi ${(campaign.replied_count || 0) > 0 ? 'is-ok' : ''}`}>
            <strong>{num(campaign.replied_count || 0)}</strong>
            <span>Respostas</span>
          </div>
        </div>
        {campaign.target_count > 0 && (
          <div className="catalog-campaign-card__progress-wrap">
            <div className="catalog-campaign-card__progress-head">
              <span>Progresso</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="catalog-campaign-card__progress">
              <div className="catalog-campaign-card__progress-bar" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        )}
        <span className="catalog-campaign-card__cta">
          Abrir campanha
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

function CampaignCompactTile({ campaign, onOpen }: { campaign: any; onOpen: () => void }) {
  const accent = campaignAccent(campaign)
  return (
    <button type="button" className="catalog-campaign-compact-tile" onClick={onOpen}>
      <div className={`catalog-campaign-compact-tile__icon ${accent}`}>
        <Megaphone size={15} strokeWidth={1.75} />
      </div>
      <span className="catalog-campaign-compact-tile__name">{campaign.name || 'Campanha'}</span>
      <span className="catalog-campaign-compact-tile__meta">{statusLabel(campaign.status)}</span>
    </button>
  )
}

function CampaignListRow({ campaign, onOpen }: { campaign: any; onOpen: () => void }) {
  const isRunning = ['active', 'running', 'sending'].includes(campaign.status)
  return (
    <button type="button" className="catalog-campaign-list-row" onClick={onOpen}>
      <div className={`catalog-campaign-list-row__icon ${campaignAccent(campaign)}`}>
        <Megaphone size={14} strokeWidth={1.75} />
      </div>
      <div className="catalog-campaign-list-row__main">
        <span className="catalog-campaign-list-row__name">{campaign.name || 'Campanha'}</span>
        <span className="catalog-campaign-list-row__meta">
          {statusLabel(campaign.status)} · {num(campaign.sent_count || 0)} enviados
        </span>
      </div>
      <div className={`catalog-campaign-list-row__stat ${isRunning ? 'is-live' : ''}`}>
        {num(campaign.replied_count || 0)}
        <span>resp.</span>
      </div>
    </button>
  )
}

export function CampaignsInlinePanel() {
  const bridge = useCampaignsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const dispatch = bridge?.dispatch
  const { onOpenModal, openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
  const [managerOpen, setManagerOpen] = useState(false)
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
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openCampaign = useCallback((c: any | null) => {
    setEditCampaign(c)
    setModalOpen(true)
    if (c) {
      publishSnapshot?.({ selectedId: String(c.id), selectedName: c.name || '' })
    }
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) {
      openCanvas('/campanhas')
    } else {
      setManagerOpen(true)
    }
    setModuleExpanded?.(true)
  }, [isDesktop, openCanvas, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      selectCampaign: (id) => {
        const found = campaignsRef.current.find((c) => String(c.id) === String(id))
        if (found) openCampaign(found)
      },
      createNew: () => openCampaign(null),
      openAiWizard: () => onOpenModal('ai-campaign'),
      openFull: () => openManager(),
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, onOpenModal, openCampaign, load, openManager])

  const filtered = campaigns.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (c.name || '').toLowerCase().includes(q)
      || statusLabel(c.status).toLowerCase().includes(q)
  })

  const limit = PREVIEW_LIMIT[chatView]
  const previewItems = filtered.slice(0, limit)
  const remaining = Math.max(0, filtered.length - previewItems.length)

  if (loading && campaigns.length === 0) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--campaigns">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha…"
          />
        </div>
        <button
          type="button"
          className="catalog-panel__action catalog-panel__action--ai ai-shimmer"
          onClick={() => dispatch?.({ type: 'open_ai_wizard' })}
        >
          <Sparkles size={14} className="relative z-10" /> <span className="relative z-10">Gerar com IA</span>
        </button>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => dispatch?.({ type: 'create_new' })}>
          <Plus size={14} /> Nova
        </button>
      </div>

      <div className="catalog-panel__viewbar">
        <div className="catalog-panel__view-toggle" role="group" aria-label="Modo de visualização">
          <button type="button" className={chatView === 'compact' ? 'is-active' : ''} onClick={() => setChatView('compact')} aria-pressed={chatView === 'compact'} title="Miniatura">
            <LayoutGrid size={13} />
          </button>
          <button type="button" className={chatView === 'list' ? 'is-active' : ''} onClick={() => setChatView('list')} aria-pressed={chatView === 'list'} title="Lista">
            <List size={13} />
          </button>
          <button type="button" className={chatView === 'cards' ? 'is-active' : ''} onClick={() => setChatView('cards')} aria-pressed={chatView === 'cards'} title="Cards">
            <Rows3 size={13} />
          </button>
        </div>
        <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
          <ExternalLink size={12} />
          Gerenciar
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="catalog-panel__empty">
          {search.trim() ? 'Nenhuma campanha encontrada.' : 'Nenhuma campanha ainda. Crie com IA ou Nova.'}
        </p>
      ) : chatView === 'compact' ? (
        <div className="catalog-campaign-compact-grid">
          {previewItems.map((c) => (
            <CampaignCompactTile key={c.id} campaign={c} onOpen={() => openCampaign(c)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-campaign-list">
          {previewItems.map((c) => (
            <CampaignListRow key={c.id} campaign={c} onOpen={() => openCampaign(c)} />
          ))}
        </div>
      ) : (
        <div className="catalog-campaign-grid catalog-campaign-grid--chat">
          {previewItems.map((c) => (
            <CampaignChatCard key={c.id} campaign={c} onOpen={() => openCampaign(c)} />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{remaining} campanha{remaining === 1 ? '' : 's'} · Ver todas
        </button>
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

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Campanhas"
        subtitle="Lista, filtros, IA e edição completa"
      >
        <Suspense fallback={<div className="catalog-panel__loading"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}>
          <CampaignsManager
            embedded
            showToast={(msg, tp) => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
          />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}