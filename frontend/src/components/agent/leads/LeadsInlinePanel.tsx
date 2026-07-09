import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Users, Search, ChevronRight, LayoutGrid, List, Rows3,
  ExternalLink, Phone, MapPin, Star,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { WhatsAppIcon } from '@/components/icons'
import { useLeadsBridgeOptional } from '@/lib/agent/LeadsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const LeadsManager = lazy(() =>
  import('@/pages/LeadsPage').then((m) => ({ default: m.LeadsPage })),
)

type ChatViewMode = 'compact' | 'list' | 'cards'

const PREVIEW_LIMIT: Record<ChatViewMode, number> = {
  compact: 8,
  list: 5,
  cards: 3,
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  new: { label: 'Novo', tone: 'is-new' },
  contacted: { label: 'Contatado', tone: 'is-contacted' },
  replied: { label: 'Respondeu', tone: 'is-replied' },
  negotiating: { label: 'Negociando', tone: 'is-negotiating' },
  converted: { label: 'Convertido', tone: 'is-converted' },
  lost: { label: 'Perdido', tone: 'is-lost' },
  inactive: { label: 'Inativo', tone: 'is-inactive' },
}

function leadStatus(lead: any) {
  const s = STATUS_LABEL[lead?.status] || { label: lead?.status || 'Lead', tone: 'is-new' }
  return s
}

function LeadChatCard({ lead, onOpen }: { lead: any; onOpen: () => void }) {
  const st = leadStatus(lead)
  return (
    <button type="button" className={`catalog-lead-card ${st.tone}`} onClick={onOpen}>
      <div className="catalog-lead-card__bar" />
      <div className="catalog-lead-card__body">
        <div className="catalog-lead-card__header">
          <div className="catalog-lead-card__avatar">
            <Users size={15} strokeWidth={1.75} />
          </div>
          <div className="catalog-lead-card__headline">
            <span className="catalog-lead-card__title">{lead.name || lead.trade_name || 'Lead'}</span>
            <div className="catalog-lead-card__meta">
              <span className={`catalog-lead-card__status ${st.tone}`}>{st.label}</span>
              {lead.city && <span className="catalog-lead-card__city">{lead.city}</span>}
            </div>
          </div>
        </div>
        <div className="catalog-lead-card__kpis">
          <div className="catalog-lead-card__kpi">
            <Phone size={11} />
            <span>{lead.phone || '—'}</span>
          </div>
          {lead.google_rating != null && (
            <div className="catalog-lead-card__kpi">
              <Star size={11} />
              <span>{Number(lead.google_rating).toFixed(1)}</span>
            </div>
          )}
          {lead.has_whatsapp && (
            <div className="catalog-lead-card__kpi is-wa">
              <WhatsAppIcon size={11} className="brand-icon--wa" />
              <span>WA</span>
            </div>
          )}
        </div>
        <span className="catalog-lead-card__cta">
          Abrir lead
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

function LeadCompactTile({ lead, onOpen }: { lead: any; onOpen: () => void }) {
  const st = leadStatus(lead)
  return (
    <button type="button" className="catalog-lead-compact-tile" onClick={onOpen}>
      <div className={`catalog-lead-compact-tile__dot ${st.tone}`} />
      <span className="catalog-lead-compact-tile__name">{lead.name || 'Lead'}</span>
      <span className="catalog-lead-compact-tile__meta">{st.label}</span>
    </button>
  )
}

function LeadListRow({ lead, onOpen }: { lead: any; onOpen: () => void }) {
  const st = leadStatus(lead)
  return (
    <button type="button" className="catalog-lead-list-row" onClick={onOpen}>
      <div className={`catalog-lead-list-row__avatar ${st.tone}`}>
        <Users size={14} strokeWidth={1.75} />
      </div>
      <div className="catalog-lead-list-row__main">
        <span className="catalog-lead-list-row__name">{lead.name || lead.trade_name || 'Lead'}</span>
        <span className="catalog-lead-list-row__meta">
          {st.label}{lead.city ? ` · ${lead.city}` : ''}{lead.phone ? ` · ${lead.phone}` : ''}
        </span>
      </div>
      {lead.has_whatsapp && (
        <span className="catalog-lead-list-row__wa" title="WhatsApp">
          <WhatsAppIcon size={12} className="brand-icon--wa" />
        </span>
      )}
    </button>
  )
}

export function LeadsInlinePanel() {
  const bridge = useLeadsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
  const [managerOpen, setManagerOpen] = useState(false)
  const [detailLead, setDetailLead] = useState<any>(null)
  const leadsRef = useRef<any[]>([])
  const loadedRef = useRef(false)

  const load = useCallback(async (opts?: { q?: string; status?: string }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: '1', limit: '40' })
      const query = opts?.q ?? search
      const status = opts?.status ?? statusFilter
      if (query.trim()) q.set('search', query.trim())
      if (status) q.set('status', status)
      const r = await fetch(`/api/customers?${q}`, { headers: getHeaders() })
      const d = await r.json()
      const list = d.customers || d.clients || []
      leadsRef.current = list
      setLeads(list)
      setTotal(d.total || list.length)
      const newCount = list.filter((l: any) => l.status === 'new').length
      publishSnapshot?.({
        total: d.total || list.length,
        newCount,
        search: query,
        statusFilter: status,
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
      showToast('Erro ao carregar leads')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, publishSnapshot, showToast])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openLead = useCallback((lead: any) => {
    setDetailLead(lead)
    publishSnapshot?.({
      selectedId: String(lead.id),
      selectedName: lead.name || lead.trade_name || '',
    })
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) {
      openCanvas('/leads')
    } else {
      setManagerOpen(true)
    }
    setModuleExpanded?.(true)
  }, [isDesktop, openCanvas, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      search: (q) => { setSearch(q); void load({ q }) },
      filterStatus: (s) => { setStatusFilter(s); void load({ status: s }) },
      selectLead: (id) => {
        const found = leadsRef.current.find((l) => String(l.id) === String(id))
        if (found) openLead(found)
      },
      openFull: () => openManager(),
      openImport: () => {
        setManagerOpen(true)
        bridge?.queueCommand({ type: 'open_import' })
      },
      validateWhatsapp: () => {
        setManagerOpen(true)
        bridge?.queueCommand({ type: 'validate_whatsapp' })
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, load, openManager, openLead, bridge])

  const filtered = leads.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (l.name || '').toLowerCase().includes(q)
      || (l.phone || '').includes(q)
      || (l.city || '').toLowerCase().includes(q)
  })

  const preview = filtered.slice(0, PREVIEW_LIMIT[chatView])
  const overflow = Math.max(0, (total || filtered.length) - preview.length)

  if (loading && leads.length === 0) {
    return (
      <PageSplash variant="panel" label="Leads" />
    )
  }

  return (
    <div className="catalog-panel catalog-panel--leads">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead…"
          />
        </div>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openManager}>
          <ExternalLink size={14} /> Gerenciar
        </button>
      </div>

      <div className="catalog-panel__filters">
        {(['', 'new', 'contacted', 'replied'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`catalog-panel__filter-chip catalog-panel__filter-chip--leads ${statusFilter === s ? 'is-active' : ''}`}
            onClick={() => {
              setStatusFilter(s)
              void load({ status: s })
            }}
          >
            {s === '' ? 'Todos' : STATUS_LABEL[s]?.label || s}
          </button>
        ))}
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
          Gerenciar
          <ChevronRight size={13} />
        </button>
      </div>

      {preview.length === 0 ? (
        <p className="catalog-panel__empty">
          {search.trim() || statusFilter ? 'Nenhum lead encontrado.' : 'Nenhum lead ainda. Prospecte no mapa ou importe.'}
        </p>
      ) : chatView === 'cards' ? (
        <div className="catalog-lead-grid">
          {preview.map((l) => (
            <LeadChatCard key={l.id} lead={l} onOpen={() => openLead(l)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-lead-list">
          {preview.map((l) => (
            <LeadListRow key={l.id} lead={l} onOpen={() => openLead(l)} />
          ))}
        </div>
      ) : (
        <div className="catalog-lead-compact-grid">
          {preview.map((l) => (
            <LeadCompactTile key={l.id} lead={l} onOpen={() => openLead(l)} />
          ))}
        </div>
      )}

      {overflow > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{overflow} · Ver completo
        </button>
      )}

      {detailLead && (
        <div className="catalog-lead-detail" role="dialog">
          <div className="catalog-lead-detail__head">
            <h3 className="catalog-lead-detail__title">{detailLead.name || 'Lead'}</h3>
            <button type="button" className="catalog-lead-detail__close" onClick={() => setDetailLead(null)} aria-label="Fechar">×</button>
          </div>
          <div className="catalog-lead-detail__body">
            <p className="catalog-lead-detail__row"><Phone size={12} /> {detailLead.phone || 'Sem telefone'}</p>
            {detailLead.city && <p className="catalog-lead-detail__row"><MapPin size={12} /> {detailLead.city}{detailLead.state ? `, ${detailLead.state}` : ''}</p>}
            <p className="catalog-lead-detail__status">{leadStatus(detailLead).label}</p>
          </div>
          <button type="button" className="catalog-panel__action" onClick={() => { setDetailLead(null); openManager() }}>
            Editar completo
          </button>
        </div>
      )}

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Leads"
        subtitle="Filtros, importação, validação WhatsApp e edição"
      >
        <Suspense fallback={<PageSplash variant="panel" label="Leads" />}>
          <LeadsManager embedded />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}