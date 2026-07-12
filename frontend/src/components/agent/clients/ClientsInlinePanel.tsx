import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Building2, Search, ChevronRight, LayoutGrid, List, Rows3,
  ExternalLink, Phone, MapPin, Star, Mail,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { WhatsAppIcon } from '@/components/icons'
import { useClientsBridgeOptional } from '@/lib/agent/ClientsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const ClientsManager = lazy(() =>
  import('@/pages/ClientesPage').then((m) => ({ default: m.ClientesPage })),
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
  converted: { label: 'Cliente', tone: 'is-active' },
  active: { label: 'Ativo', tone: 'is-active' },
  negotiating: { label: 'Negociando', tone: 'is-negotiating' },
  replied: { label: 'Respondeu', tone: 'is-replied' },
  contacted: { label: 'Contatado', tone: 'is-contacted' },
  new: { label: 'Novo', tone: 'is-new' },
  inactive: { label: 'Inativo', tone: 'is-inactive' },
}

function clientStatus(client: any) {
  const s = STATUS_LABEL[client?.status] || { label: client?.status || 'Cliente', tone: 'is-active' }
  return s
}

function ClientChatCard({ client, onOpen }: { client: any; onOpen: () => void }) {
  const st = clientStatus(client)
  return (
    <button type="button" className={`catalog-client-card ${st.tone}`} onClick={onOpen}>
      <div className="catalog-client-card__body">
        <div className="catalog-client-card__header">
          <div className="catalog-client-card__avatar">
            <Building2 size={15} strokeWidth={1.75} />
          </div>
          <div className="catalog-client-card__headline">
            <span className="catalog-client-card__title">{client.name || client.trade_name || 'Cliente'}</span>
            <div className="catalog-client-card__meta">
              <span className={`catalog-client-card__status ${st.tone}`}>{st.label}</span>
              {client.city && <span className="catalog-client-card__city">{client.city}</span>}
            </div>
          </div>
        </div>
        <div className="catalog-client-card__kpis">
          <div className="catalog-client-card__kpi">
            <Phone size={11} />
            <span>{client.phone || '—'}</span>
          </div>
          {client.email && (
            <div className="catalog-client-card__kpi">
              <Mail size={11} />
              <span className="truncate max-w-[8rem]">{client.email}</span>
            </div>
          )}
          {client.google_rating != null && (
            <div className="catalog-client-card__kpi">
              <Star size={11} />
              <span>{Number(client.google_rating).toFixed(1)}</span>
            </div>
          )}
          {client.has_whatsapp && (
            <div className="catalog-client-card__kpi is-wa">
              <WhatsAppIcon size={11} className="brand-icon--wa" />
              <span>WA</span>
            </div>
          )}
        </div>
        <span className="catalog-client-card__cta">
          Abrir cliente
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

function ClientCompactTile({ client, onOpen }: { client: any; onOpen: () => void }) {
  const st = clientStatus(client)
  return (
    <button type="button" className="catalog-client-compact-tile" onClick={onOpen}>
      <div className={`catalog-client-compact-tile__dot ${st.tone}`} />
      <span className="catalog-client-compact-tile__name">{client.name || 'Cliente'}</span>
      <span className="catalog-client-compact-tile__meta">{st.label}</span>
    </button>
  )
}

function ClientListRow({ client, onOpen }: { client: any; onOpen: () => void }) {
  const st = clientStatus(client)
  return (
    <button type="button" className="catalog-client-list-row" onClick={onOpen}>
      <div className={`catalog-client-list-row__avatar ${st.tone}`}>
        <Building2 size={14} strokeWidth={1.75} />
      </div>
      <div className="catalog-client-list-row__main">
        <span className="catalog-client-list-row__name">{client.name || client.trade_name || 'Cliente'}</span>
        <span className="catalog-client-list-row__meta">
          {st.label}{client.city ? ` · ${client.city}` : ''}{client.phone ? ` · ${client.phone}` : ''}
        </span>
      </div>
      {client.has_whatsapp && (
        <span className="catalog-client-list-row__wa" title="WhatsApp">
          <WhatsAppIcon size={12} className="brand-icon--wa" />
        </span>
      )}
    </button>
  )
}

export function ClientsInlinePanel() {
  const bridge = useClientsBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { showToast } = useToast()
  const [clients, setClients] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
  const [managerOpen, setManagerOpen] = useState(false)
  const [detailClient, setDetailClient] = useState<any>(null)
  const clientsRef = useRef<any[]>([])
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!detailClient) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailClient(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailClient])

  const load = useCallback(async (opts?: { q?: string; status?: string }) => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: '1', limit: '40' })
      const query = opts?.q ?? search
      const status = opts?.status ?? statusFilter
      if (query.trim()) q.set('search', query.trim())
      if (status) q.set('status', status)
      const r = await fetch(`/api/clients?${q}`, { headers: getHeaders() })
      const d = await r.json()
      const list = d.clients || d.customers || []
      clientsRef.current = list
      setClients(list)
      setTotal(d.total || list.length)
      const activeCount = list.filter((c: any) =>
        ['converted', 'active', 'negotiating', 'replied'].includes(c.status),
      ).length
      publishSnapshot?.({
        total: d.total || list.length,
        activeCount,
        search: query,
        statusFilter: status,
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
      showToast('Erro ao carregar clientes')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, publishSnapshot, showToast])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openClient = useCallback((client: any) => {
    setDetailClient(client)
    publishSnapshot?.({
      selectedId: String(client.id),
      selectedName: client.name || client.trade_name || '',
    })
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) {
      openCanvas('/clientes')
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
      selectClient: (id) => {
        const found = clientsRef.current.find((c) => String(c.id) === String(id))
        if (found) openClient(found)
      },
      openFull: () => openManager(),
      openImport: () => {
        setManagerOpen(true)
        bridge?.queueCommand({ type: 'open_import' })
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, load, openManager, openClient, bridge])

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (c.name || '').toLowerCase().includes(q)
      || (c.phone || '').includes(q)
      || (c.email || '').toLowerCase().includes(q)
      || (c.city || '').toLowerCase().includes(q)
  })

  const preview = filtered.slice(0, PREVIEW_LIMIT[chatView])
  const overflow = Math.max(0, (total || filtered.length) - preview.length)

  if (loading && clients.length === 0) {
    return (
      <PageSplash variant="panel" label="Clientes" />
    )
  }

  return (
    <div className="catalog-panel catalog-panel--clients">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
          />
        </div>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openManager}>
          <ExternalLink size={14} /> Gerenciar
        </button>
      </div>

      <div className="catalog-panel__filters">
        {(['', 'converted', 'active', 'negotiating'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={`catalog-panel__filter-chip ${statusFilter === s ? 'is-active' : ''} ${s ? 'catalog-panel__filter-chip--clients' : ''}`}
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
          {search.trim() || statusFilter ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Converta leads ou importe.'}
        </p>
      ) : chatView === 'cards' ? (
        <div className="catalog-client-grid">
          {preview.map((c) => (
            <ClientChatCard key={c.id} client={c} onOpen={() => openClient(c)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-client-list">
          {preview.map((c) => (
            <ClientListRow key={c.id} client={c} onOpen={() => openClient(c)} />
          ))}
        </div>
      ) : (
        <div className="catalog-client-compact-grid">
          {preview.map((c) => (
            <ClientCompactTile key={c.id} client={c} onOpen={() => openClient(c)} />
          ))}
        </div>
      )}

      {overflow > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{overflow} · Ver completo
        </button>
      )}

      {detailClient && (
        <div
          className="catalog-client-detail"
          role="dialog"
          aria-modal="true"
          aria-label={detailClient.name || 'Detalhe do cliente'}
        >
          <div className="catalog-client-detail__head">
            <h3 className="catalog-client-detail__title">{detailClient.name || 'Cliente'}</h3>
            <button type="button" className="catalog-client-detail__close" onClick={() => setDetailClient(null)} aria-label="Fechar">×</button>
          </div>
          <div className="catalog-client-detail__body">
            <p className="catalog-client-detail__row"><Phone size={12} /> {detailClient.phone || 'Sem telefone'}</p>
            {detailClient.email && <p className="catalog-client-detail__row"><Mail size={12} /> {detailClient.email}</p>}
            {detailClient.city && <p className="catalog-client-detail__row"><MapPin size={12} /> {detailClient.city}{detailClient.state ? `, ${detailClient.state}` : ''}</p>}
            <p className="catalog-client-detail__status">{clientStatus(detailClient).label}</p>
          </div>
          <button type="button" className="catalog-panel__action catalog-panel__action--clients" onClick={() => { setDetailClient(null); openManager() }}>
            Editar completo
          </button>
        </div>
      )}

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Clientes"
        subtitle="Relacionamento, histórico e importação"
      >
        <Suspense fallback={<PageSplash variant="panel" label="Clientes" />}>
          <ClientsManager embedded />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}