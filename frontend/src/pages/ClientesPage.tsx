import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, Filter, Star, Phone, MapPin, Tag, X,
  ChevronLeft, ChevronRight, Users, Loader2,
  MessageSquare, Mail, Globe, ExternalLink, Trash2, Send,
  CheckCircle2, Edit3, CheckSquare, Square, Sparkles, AlertTriangle,
  SlidersHorizontal, ChevronDown, Check, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { SmartImportModal } from '@/components/SmartImportModal'
import { useClientsBridgeOptional } from '@/lib/agent/ClientsBridgeContext'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

/* ── Auth helpers ── */
function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

/* ── Label maps ── */
const CAT_LABEL: Record<string, string> = {
  restaurant: 'Restaurante', buffet_restaurant: 'Buffet', pizza_restaurant: 'Pizzaria',
  brazilian_restaurant: 'Brasileiro', barbecue_restaurant: 'Churrascaria', bar: 'Bar',
  manufacturer: 'Fabricante', italian_restaurant: 'Italiano', seafood_restaurant: 'Frutos do Mar',
  family_restaurant: 'Familiar', food: 'Alimentacao', snack_bar: 'Lanchonete',
  cocktail_bar: 'Coquetelaria', health_food_store: 'Emporio', meal_delivery: 'Delivery',
  hamburger_restaurant: 'Hamburgueria', japanese_restaurant: 'Japones', pizza_delivery: 'Delivery Pizza',
  school: 'Escola', wholesaler: 'Atacadista',
}
const catLabel = (v: string) => CAT_LABEL[v] || v.replace(/_/g, ' ')

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: 'Novo', color: 'bg-gray-900 text-white' },
  contacted: { label: 'Contatado', color: 'bg-amber-100 text-amber-700' },
  replied: { label: 'Respondeu', color: 'bg-emerald-100 text-emerald-700' },
  negotiating: { label: 'Negociando', color: 'bg-gray-200 text-gray-800' },
  converted: { label: 'Convertido', color: 'bg-green-100 text-green-800' },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-600' },
  inactive: { label: 'Inativo', color: 'bg-gray-100 text-gray-500' },
}

/* ── Tags helper — normaliza tags de qualquer formato pra array de strings limpas.
   Backend pode retornar:
   - array nativo: ["a", "b"]
   - JSON string: '["a","b"]'
   - JSON duplo-encoded: '"[\"a\",\"b\"]"'
   - PostgreSQL array literal: '{a,b}' ou '{"a","b"}' ou '{"{\"a\"}","b"}' aninhado
   - null/undefined */
function normalizeTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean)
  if (typeof raw !== 'string') return []
  let s = raw.trim()

  /* JSON parse repetido (até 3x pra cobrir duplo/triplo-encoded) */
  for (let i = 0; i < 3; i++) {
    if (s.startsWith('[') || s.startsWith('"')) {
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed.flatMap(p => normalizeTags(p))
        if (typeof parsed === 'string') { s = parsed.trim(); continue }
      } catch { break }
    } else break
  }

  /* PostgreSQL array literal: {a,b} ou {"a","b"} — pode estar aninhado.
     Estratégia: extrai todos os tokens entre aspas; se não tiver aspas, split por vírgula. */
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1)
    /* Match strings entre aspas (lida com escape) OU tokens sem aspas */
    const matches = inner.match(/"((?:\\.|[^"\\])*)"|[^,{}]+/g) || []
    return matches
      .map(m => m.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim())
      .flatMap(token => {
        /* Se o token ainda parecer um array PG aninhado, recurse */
        if (token.startsWith('{')) return normalizeTags(token)
        return token ? [token] : []
      })
      .filter(Boolean)
  }

  /* Fallback: split por vírgula */
  return s.split(',').map(t => t.trim()).filter(Boolean)
}

/* ── Date helpers ── */
const fmtDate = (v?: string) => {
  try { return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return '' }
}
const fmtDateFull = (v?: string) => {
  try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

/* ── Types ── */
interface FilterOptions {
  categories: Array<{ value: string; count: number }>
  cities: Array<{ value: string; count: number }>
  statuses: Array<{ value: string; count: number }>
  sources: Array<{ value: string; count: number }>
  states: Array<{ value: string; count: number }>
  /* Backend retorna tags como array de strings simples (sem count) */
  tags: string[]
  total: number
}

interface Lead {
  id: string; name: string; phone?: string; email?: string
  status: string; source?: string; tags?: string[] | string; notes?: string
  city?: string; state?: string; address?: string; trade_name?: string
  client_type?: string; lead_score?: number; created_at?: string; updated_at?: string
  google_rating?: number; google_reviews_count?: number
  website?: string; google_maps_uri?: string; category?: string
  phone_secondary?: string; business_status?: string; has_whatsapp?: boolean
}

/* ── Filter chip component ── */
function Chip({
  label, count, active, onClick, icon,
}: {
  label: string; count?: number; active: boolean; onClick: () => void; icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium select-none transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={`text-[10px] tabular-nums ${active ? 'text-white/60' : 'text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

/* ══════════════════════════════════════════════
   CLIENTES PAGE — Mesma estrutura do LeadsPage, aponta pra /api/clients.
   ══════════════════════════════════════════════ */
export function ClientesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  /* ── Multi-select state ──
   * `selectedIds` is keyed by row id. We don't keep the full Lead object in
   * the set because the list rerenders frequently and we'd just be holding
   * stale snapshots. Selection persists across pagination so the user can
   * accumulate selections and act on them in bulk. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [smartImportOpen, setSmartImportOpen] = useState(false)
  const [flash, setFlash] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)
  function toast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setFlash({ msg, tone })
    setTimeout(() => setFlash(null), 3500)
  }

  /* Filters */
  const [search, setSearch] = useState('')
  const [selStatus, setSelStatus] = useState<string[]>([])
  const [selCategory, setSelCategory] = useState<string[]>([])
  const [selCity, setSelCity] = useState<string[]>([])
  const [selTags, setSelTags] = useState<string[]>([])
  const [minRating, setMinRating] = useState<number | null>(null)
  const [hasWhatsapp, setHasWhatsapp] = useState<boolean | null>(null)
  const [showFilters, setShowFilters] = useState(true)

  const LIMIT = 50
  const clientsBridge = useClientsBridgeOptional()
  const agentShell = useAgentShellOptional()
  const isDesktop = useIsDesktop()
  const pendingSelectId = useRef<string | null>(null)

  /* ── Load filter options once on mount ── */
  useEffect(() => {
    fetch('/api/clients/filter-options', { headers: getHeaders() })
      .then(r => r.json())
      .then(setFilterOptions)
      .catch(() => {})
  }, [])

  /* ── Stats extras (today_count, week, whatsapp_count, etc) ──
     Backend retorna em /api/leads/stats — usado nos KPI cards. */
  const [extraStats, setExtraStats] = useState<{
    today_count?: number
    week_count?: number
    month_count?: number
    with_whatsapp?: number
    whatsapp_validated_count?: number
  } | null>(null)
  useEffect(() => {
    fetch('/api/clients/stats', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const s = d?.stats ?? d
        setExtraStats({
          today_count: Number(s?.today_count || 0),
          week_count: Number(s?.week_count || 0),
          month_count: Number(s?.month_count || 0),
          with_whatsapp: Number(s?.with_whatsapp || 0),
          whatsapp_validated_count: Number(s?.whatsapp_validated_count || 0),
        })
      })
      .catch(() => {})
  }, [])

  /* ── Load leads whenever filters or page change ── */
  useEffect(() => {
    loadLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selStatus, selCategory, selCity, selTags, minRating, hasWhatsapp])

  /* ── Debounced search ── */
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      loadLeads(1)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function buildQuery(overridePage?: number): URLSearchParams {
    const q = new URLSearchParams({
      page: String(overridePage ?? page),
      limit: String(LIMIT),
    })
    if (search.trim()) q.set('search', search.trim())
    if (selStatus.length) q.set('status', selStatus.join(','))
    if (selCategory.length) q.set('category', selCategory.join(','))
    if (selCity.length) q.set('city', selCity.join(','))
    if (selTags.length) q.set('tags', selTags.join(','))
    if (minRating) q.set('minRating', String(minRating))
    if (hasWhatsapp !== null) q.set('hasWhatsapp', String(hasWhatsapp))
    return q
  }

  function loadLeads(overridePage?: number) {
    setLoading(true)
    fetch(`/api/clients?${buildQuery(overridePage)}`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        setLeads(d.customers || d.clients || [])
        setTotal(d.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  /* ── Toggle helpers ── */
  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
    setPage(1)
  }

  const clearFilters = () => {
    setSelStatus([]); setSelCategory([]); setSelCity([]); setSelTags([])
    setMinRating(null); setHasWhatsapp(null); setSearch(''); setPage(1)
  }

  const hasActiveFilters = !!(
    selStatus.length || selCategory.length || selCity.length ||
    selTags.length || minRating || hasWhatsapp !== null || search
  )

  /* ── Selection helpers ── */
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allOnPageSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id))
  const someOnPageSelected = leads.some(l => selectedIds.has(l.id)) && !allOnPageSelected
  function toggleSelectAllOnPage() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) leads.forEach(l => next.delete(l.id))
      else leads.forEach(l => next.add(l.id))
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())
  const selectedCount = selectedIds.size
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])

  /* ── Bulk actions ── */
  async function runBulkDelete() {
    if (!selectedCount) return
    if (!confirm(`Apagar ${selectedCount} lead${selectedCount > 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/clients/bulk-delete', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids: selectedIdsArray }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao apagar')
      toast(`${d.affected || selectedCount} lead${(d.affected || selectedCount) > 1 ? 's apagados' : ' apagado'}.`)
      clearSelection()
      loadLeads()
    } catch (e: any) {
      toast(e.message || 'Erro ao apagar', 'err')
    } finally {
      setBulkBusy(false)
    }
  }

  async function runBulkUpdate(patch: Record<string, any>) {
    if (!selectedCount) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/clients/bulk-update', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ ids: selectedIdsArray, patch }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao atualizar')
      toast(`${d.affected || selectedCount} lead${(d.affected || selectedCount) > 1 ? 's atualizados' : ' atualizado'}.`)
      setBulkEditOpen(false)
      clearSelection()
      loadLeads()
    } catch (e: any) {
      toast(e.message || 'Erro ao atualizar', 'err')
    } finally {
      setBulkBusy(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const startItem = (page - 1) * LIMIT + 1
  const endItem = Math.min(page * LIMIT, total)

  /* ── KPI counts from filterOptions ── */
  const statusCount = (s: string) =>
    filterOptions?.statuses?.find(x => x.value === s)?.count ?? 0

  /* Activeфilters count — usado em varios lugares */
  const activeFiltersCount =
    selStatus.length + selCategory.length + selCity.length +
    selTags.length + (minRating ? 1 : 0) + (hasWhatsapp !== null ? 1 : 0)

  useEffect(() => {
    if (!clientsBridge?.registerHandlers || (!embedded && !isDesktop)) return
    return clientsBridge.registerHandlers({
      search: (q) => {
        setSearch(q)
        setPage(1)
        loadLeads(1)
      },
      filterStatus: (s) => {
        setSelStatus(s ? [s] : [])
        setPage(1)
      },
      selectClient: (id) => {
        const found = leads.find((l) => String(l.id) === String(id))
        if (found) setSelectedLead(found)
        else pendingSelectId.current = id
      },
      openFull: () => { if (isDesktop) agentShell?.openCanvas('/clientes') },
      openImport: () => setSmartImportOpen(true),
      refresh: () => loadLeads(),
    })
  }, [clientsBridge, embedded, isDesktop, leads, agentShell])

  useEffect(() => {
    if (!isDesktop || !pendingSelectId.current) return
    const found = leads.find((l) => String(l.id) === String(pendingSelectId.current))
    if (found) {
      setSelectedLead(found)
      pendingSelectId.current = null
    }
  }, [leads, isDesktop])

  useEffect(() => {
    if (!clientsBridge?.publishSnapshot || (!embedded && !isDesktop)) return
    const activeCount = filterOptions?.statuses
      ?.filter((x) => ['converted', 'active', 'negotiating', 'replied'].includes(x.value))
      .reduce((s, x) => s + x.count, 0)
      ?? leads.filter((l) => ['converted', 'active', 'negotiating', 'replied'].includes(l.status)).length
    clientsBridge.publishSnapshot({
      total: total || filterOptions?.total || 0,
      activeCount,
      search,
      statusFilter: selStatus[0] || '',
      loading,
      selectedId: selectedLead?.id ? String(selectedLead.id) : null,
      selectedName: selectedLead?.name || '',
    })
  }, [clientsBridge, embedded, isDesktop, total, filterOptions, leads, search, selStatus, loading, selectedLead])

  /* ── Render ── */
  return (
    <div className="space-y-3">

      {/* ── Header slim — título + ações principais ── */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        {embedded ? (
          <p className="text-[12px] text-gray-500 tabular-nums">
            {filterOptions ? `${filterOptions.total.toLocaleString('pt-BR')} clientes` : '—'}
            {selStatus.length ? ` · ${selStatus.join(', ')}` : ''}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <h2 className="text-[24px] font-bold text-gray-900 tracking-[-0.02em]">Clientes</h2>
              <p className="text-[12px] text-gray-400 tabular-nums">
                {filterOptions ? `${Number(filterOptions.total ?? 0).toLocaleString('pt-BR')} registros` : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSmartImportOpen(true)}
                title="Importar clientes via IA — texto, CSV/XLS, imagem ou foto"
                className="ai-shimmer h-9 flex items-center gap-1.5 px-3.5 rounded-lg bg-gray-900 text-white text-[12px] font-semibold hover:bg-black hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all"
              >
                <Sparkles size={13} strokeWidth={2.25} />
                <span className="hidden sm:inline">Importar</span>
              </button>
            </div>
          </>
        )}
      </header>

      {/* ── KPI CARDS — métricas densas com info adicional ── */}
      {(() => {
        const totalNum = filterOptions?.total ?? total ?? 0
        const newCount = statusCount('new')
        const contactedCount = statusCount('contacted')
        const repliedCount = statusCount('replied')
        const negotiatingCount = statusCount('negotiating')
        const convertedCount = statusCount('converted')
        const inFunnel = repliedCount + negotiatingCount
        const pct = (n: number) => totalNum > 0 ? (n / totalNum * 100) : 0
        const whatsappCount = extraStats?.with_whatsapp ?? 0
        const today = extraStats?.today_count ?? 0
        const week = extraStats?.week_count ?? 0
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <KpiCard
              label="Total"
              value={totalNum.toLocaleString('pt-BR')}
              subtitle={today > 0 ? `+${today} hoje · +${week} 7d` : (week > 0 ? `+${week} esta semana` : 'No banco')}
              tone="default"
            />
            <KpiCard
              label="Novos"
              value={newCount.toLocaleString('pt-BR')}
              subtitle={`${pct(newCount).toFixed(0)}% aguardando contato`}
              tone="blue"
              progress={pct(newCount)}
              onClick={() => setSelStatus(selStatus.includes('new') ? [] : ['new'])}
              active={selStatus.length === 1 && selStatus[0] === 'new'}
            />
            <KpiCard
              label="WhatsApp"
              value={whatsappCount.toLocaleString('pt-BR')}
              subtitle={`${pct(whatsappCount).toFixed(0)}% têm número WA`}
              tone="emerald"
              progress={pct(whatsappCount)}
              onClick={() => { setHasWhatsapp(hasWhatsapp === true ? null : true); setPage(1) }}
              active={hasWhatsapp === true}
            />
            <KpiCard
              label="Em conversão"
              value={inFunnel.toLocaleString('pt-BR')}
              subtitle={`${contactedCount.toLocaleString('pt-BR')} contatados, ${negotiatingCount} negociando`}
              tone="amber"
              progress={pct(inFunnel)}
            />
            <KpiCard
              label="Convertidos"
              value={convertedCount.toLocaleString('pt-BR')}
              subtitle={totalNum > 0 ? `Taxa ${pct(convertedCount).toFixed(1)}%` : '—'}
              tone="green"
              progress={pct(convertedCount)}
              onClick={() => setSelStatus(selStatus.includes('converted') ? [] : ['converted'])}
              active={selStatus.length === 1 && selStatus[0] === 'converted'}
            />
          </div>
        )
      })()}

      {/* ── Status TABS (mesma linha) — substitui os 5 cards huge ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 -mb-px overflow-x-auto scrollbar-none">
        {([
          { key: 'all',       label: 'Todos',       value: total },
          { key: 'new',       label: 'Novos',       value: statusCount('new'),       dot: 'bg-gray-900' },
          { key: 'contacted', label: 'Contatados',  value: statusCount('contacted'), dot: 'bg-amber-500' },
          { key: 'replied',   label: 'Responderam', value: statusCount('replied'),   dot: 'bg-emerald-500' },
          { key: 'negotiating', label: 'Negociando', value: statusCount('negotiating'), dot: 'bg-gray-700' },
          { key: 'converted', label: 'Convertidos', value: statusCount('converted'), dot: 'bg-green-600' },
          { key: 'lost',      label: 'Perdidos',    value: statusCount('lost'),      dot: 'bg-red-500' },
        ] as const).map(tab => {
          const active = tab.key === 'all'
            ? selStatus.length === 0
            : selStatus.length === 1 && selStatus[0] === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key === 'all') setSelStatus([])
                else setSelStatus(active ? [] : [tab.key])
                setPage(1)
              }}
              className={`relative inline-flex items-center gap-1.5 px-3.5 h-9 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {'dot' in tab && tab.dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />
              )}
              {tab.label}
              <span className={`tabular-nums text-[11px] ${active ? 'text-gray-400' : 'text-gray-300'}`}>
                {(tab.value ?? 0).toLocaleString('pt-BR')}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-gray-900 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Toolbar de filtros: search + filter popovers ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-2 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, cidade…"
            className="w-full h-8 pl-9 pr-8 rounded-lg bg-gray-50 border-0 text-[12.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900/10 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Filter popovers — Categoria, Cidade, Tags, Rating, WhatsApp */}
        <FilterPopover
          label="Categoria"
          icon={<Building2 size={12} strokeWidth={2} />}
          selectedCount={selCategory.length}
          options={(filterOptions?.categories || []).map(c => ({ value: c.value, label: catLabel(c.value), count: c.count }))}
          selected={selCategory}
          onToggle={(v) => toggle(selCategory, v, setSelCategory)}
          onClear={() => { setSelCategory([]); setPage(1) }}
          searchable
        />
        <FilterPopover
          label="Cidade"
          icon={<MapPin size={12} strokeWidth={2} />}
          selectedCount={selCity.length}
          options={(filterOptions?.cities || []).map(c => ({ value: c.value, label: c.value, count: c.count }))}
          selected={selCity}
          onToggle={(v) => toggle(selCity, v, setSelCity)}
          onClear={() => { setSelCity([]); setPage(1) }}
          searchable
        />
        <FilterPopover
          label="Tags"
          icon={<Tag size={12} strokeWidth={2} />}
          selectedCount={selTags.length}
          /* Backend retorna tags como string[] simples. Cada entrada pode ainda
             ser PostgreSQL array literal — normaliza pra extrair tags atomicas. */
          options={(() => {
            const set = new Set<string>()
            for (const t of (filterOptions?.tags || [])) {
              for (const clean of normalizeTags(t)) {
                if (clean) set.add(clean)
              }
            }
            return Array.from(set)
              .sort((a, b) => a.localeCompare(b))
              .map((value) => ({
                value,
                label: value.replace(/^busca:/, ''),
              }))
          })()}
          selected={selTags}
          onToggle={(v) => toggle(selTags, v, setSelTags)}
          onClear={() => { setSelTags([]); setPage(1) }}
          searchable
          emptyMessage="Nenhuma tag ainda. Adicione tags aos leads pelo painel de detalhe."
        />
        <FilterPopover
          label="Rating"
          icon={<Star size={12} strokeWidth={2} />}
          selectedCount={minRating ? 1 : 0}
          options={[
            { value: '3', label: '3+ estrelas' },
            { value: '4', label: '4+ estrelas' },
            { value: '4.5', label: '4.5+ estrelas' },
          ]}
          selected={minRating ? [String(minRating)] : []}
          onToggle={(v) => { const n = Number(v); setMinRating(minRating === n ? null : n); setPage(1) }}
          onClear={() => { setMinRating(null); setPage(1) }}
          single
        />
        <button
          onClick={() => { setHasWhatsapp(hasWhatsapp === true ? null : true); setPage(1) }}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition ${
            hasWhatsapp === true
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          <MessageSquare size={12} strokeWidth={2.25} /> WhatsApp
        </button>
      </div>

      {/* ── Active filter chips — slot RESERVADO (sempre presente, fica vazio se sem
           filtros). Evita layout shift quando o usuario adiciona/remove filtro. */}
      <div className="min-h-[28px] flex flex-wrap items-center gap-1.5">
        {activeFiltersCount > 0 ? (
          <>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-1">Filtros:</span>
            {selStatus.map(s => (
              <ActiveChip key={`s-${s}`} label={STATUS_LABEL[s]?.label || s} onRemove={() => toggle(selStatus, s, setSelStatus)} />
            ))}
            {selCategory.map(c => (
              <ActiveChip key={`c-${c}`} label={catLabel(c)} onRemove={() => toggle(selCategory, c, setSelCategory)} />
            ))}
            {selCity.map(c => (
              <ActiveChip key={`ct-${c}`} label={c} icon={<MapPin size={10} strokeWidth={2} />} onRemove={() => toggle(selCity, c, setSelCity)} />
            ))}
            {selTags.map(t => (
              <ActiveChip key={`t-${t}`} label={t.replace(/^busca:/, '')} icon={<Tag size={10} strokeWidth={2} />} onRemove={() => toggle(selTags, t, setSelTags)} />
            ))}
            {minRating && (
              <ActiveChip label={`${minRating}+`} icon={<Star size={10} strokeWidth={2} className="fill-current" />} onRemove={() => { setMinRating(null); setPage(1) }} />
            )}
            {hasWhatsapp === true && (
              <ActiveChip label="WhatsApp" icon={<MessageSquare size={10} strokeWidth={2} />} onRemove={() => { setHasWhatsapp(null); setPage(1) }} />
            )}
            <button
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
            >
              <X size={10} strokeWidth={2.5} /> Limpar ({activeFiltersCount})
            </button>
          </>
        ) : (
          <span className="text-[10.5px] text-gray-300 italic">Nenhum filtro ativo · use os botões acima ou as tabs de status para filtrar</span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Table header row */}
        <div className="px-4 py-2.5 border-b border-border-light flex items-center justify-between">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Users size={12} strokeWidth={1.75} />
            {loading ? 'Carregando…' : <span className="tabular-nums">{total.toLocaleString('pt-BR')} resultado{total === 1 ? '' : 's'}</span>}
          </p>
          {loading && <Loader2 size={14} className="text-gray-400 animate-spin" />}
        </div>

        {loading && leads.length === 0 ? (
          /* Full loading skeleton */
          <div className="divide-y divide-border-light">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 skeleton w-1/3 rounded" />
                  <div className="h-2.5 skeleton w-1/4 rounded" />
                </div>
                <div className="h-3 skeleton w-24 rounded hidden sm:block" />
                <div className="h-5 skeleton w-16 rounded-full hidden lg:block" />
                <div className="h-2.5 skeleton w-10 rounded" />
              </div>
            ))}
          </div>
        ) : leads.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
              <Users size={22} className="text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-medium text-gray-900">Nenhum cliente encontrado</p>
            <p className="text-[12px] text-gray-500 mt-0.5">Tente ajustar os filtros</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-[12px] text-gray-700 font-medium hover:text-gray-900 underline underline-offset-2">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left pl-4 pr-2 py-2.5 w-8">
                      <button
                        onClick={toggleSelectAllOnPage}
                        aria-label={allOnPageSelected ? 'Desmarcar todos' : 'Marcar todos da página'}
                        className="w-4 h-4 grid place-items-center text-gray-500 hover:text-gray-900 transition"
                      >
                        {allOnPageSelected ? (
                          <CheckSquare size={16} strokeWidth={2} className="text-gray-900" />
                        ) : someOnPageSelected ? (
                          <span className="w-4 h-4 rounded-[3px] bg-gray-900 grid place-items-center">
                            <span className="block w-2 h-0.5 bg-white" />
                          </span>
                        ) : (
                          <Square size={16} strokeWidth={1.5} />
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Lead</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Local / Categoria</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50 transition-opacity' : ''}>
                  {leads.map(lead => {
                    const rating = Number(lead.google_rating) || 0
                    const st = STATUS_LABEL[lead.status] || { label: lead.status, color: 'bg-gray-100 text-gray-600' }
                    const checked = selectedIds.has(lead.id)
                    /* Normaliza tags pra array de strings limpas.
                       Backend pode retornar: array, string JSON, string JSON duplo-escapado,
                       ou null. Tenta parse recursivamente, fallback pra split por virgula. */
                    const tagsArr = normalizeTags(lead.tags)
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`group border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                          checked ? 'bg-gray-100/60' : 'hover:bg-gray-50/80'
                        }`}
                      >
                        <td
                          className="pl-4 pr-2 py-2.5 w-8 align-middle"
                          onClick={e => { e.stopPropagation(); toggleSelect(lead.id) }}
                        >
                          <span
                            role="checkbox"
                            aria-checked={checked}
                            className={`w-4 h-4 grid place-items-center transition ${checked ? 'text-gray-900' : 'text-gray-300 group-hover:text-gray-500'}`}
                          >
                            {checked ? (
                              <CheckSquare size={16} strokeWidth={2.25} />
                            ) : (
                              <Square size={16} strokeWidth={1.5} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-middle">
                          <div className="flex items-center gap-2.5">
                            {/* Avatar com inicial */}
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 grid place-items-center text-[11px] font-bold text-gray-600 shrink-0">
                              {(lead.name || '?').trim().charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate max-w-[200px] text-[13px] leading-tight">
                                {lead.name || '—'}
                              </p>
                              {lead.trade_name && lead.trade_name !== lead.name && (
                                <p className="text-[10.5px] text-gray-400 truncate max-w-[200px] mt-0.5">{lead.trade_name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex flex-col gap-0.5">
                            {lead.phone ? (
                              <span className="text-[12px] font-mono text-gray-700 flex items-center gap-1.5">
                                {lead.has_whatsapp && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="WhatsApp" />}
                                {lead.phone}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-[12px]">—</span>
                            )}
                            {lead.email && (
                              <span className="text-[10.5px] text-gray-400 truncate max-w-[180px]">{lead.email}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[12px] text-gray-700">{lead.city || '—'}{lead.state ? `, ${lead.state}` : ''}</span>
                            <div className="flex items-center gap-1.5 text-[10.5px] text-gray-400">
                              {lead.category && <span className="capitalize">{catLabel(lead.category)}</span>}
                              {rating > 0 && (
                                <span className="inline-flex items-center gap-0.5 font-medium text-amber-700">
                                  <Star size={9} className="fill-amber-500 text-amber-500" />
                                  {rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          {tagsArr.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {tagsArr.slice(0, 2).map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-800 text-[10px] font-medium border border-gray-200"
                                  title={String(tag)}
                                >
                                  <span className="w-1 h-1 rounded-full bg-gray-700" />
                                  <span className="truncate max-w-[100px]">{String(tag).replace(/^busca:/, '')}</span>
                                </span>
                              ))}
                              {tagsArr.length > 2 && (
                                <span className="text-[10px] text-gray-400 font-medium">+{tagsArr.length - 2}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[12px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}>
                            <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right align-middle">
                          <span className="text-[10.5px] text-gray-400 tabular-nums">{fmtDate(lead.created_at)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className={`md:hidden divide-y divide-border-light ${loading ? 'opacity-50' : ''}`}>
              {leads.map(lead => {
                const rating = Number(lead.google_rating) || 0
                const st = STATUS_LABEL[lead.status] || { label: lead.status, color: 'bg-gray-100 text-gray-600' }
                const checked = selectedIds.has(lead.id)
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-2 px-3 py-3 transition-colors ${
                      checked ? 'bg-gray-50' : 'hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <button
                      onClick={() => toggleSelect(lead.id)}
                      aria-label={checked ? 'Desmarcar' : 'Marcar'}
                      className="w-9 h-9 grid place-items-center rounded-full text-gray-500 active:bg-gray-100 shrink-0"
                    >
                      {checked ? (
                        <CheckSquare size={18} strokeWidth={2} className="text-gray-900" />
                      ) : (
                        <Square size={18} strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="flex-1 min-w-0 text-left flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-900 truncate">{lead.name || '—'}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {lead.phone && <span className="text-[10px] font-mono text-gray-500">{lead.phone}</span>}
                          {lead.city && <span className="text-[10px] text-gray-400">{lead.city}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.color}`}>{st.label}</span>
                        {rating > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 tabular-nums">
                            <Star size={9} className="fill-amber-500 text-amber-500" />
                            {rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Pagination footer ── */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-border-light flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-gray-500 font-medium tabular-nums">
              {startItem.toLocaleString('pt-BR')}–{endItem.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Página anterior"
                  className="w-8 h-8 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                </button>

                {/* Page buttons — show up to 7 */}
                {(() => {
                  const pages: number[] = []
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i)
                  } else if (page <= 4) {
                    for (let i = 1; i <= 7; i++) pages.push(i)
                  } else if (page >= totalPages - 3) {
                    for (let i = totalPages - 6; i <= totalPages; i++) pages.push(i)
                  } else {
                    for (let i = page - 3; i <= page + 3; i++) pages.push(i)
                  }
                  return pages.map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      aria-current={page === p ? 'page' : undefined}
                      className={`w-8 h-8 rounded-full text-[11px] font-medium tabular-nums transition ${
                        page === p
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))
                })()}

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Próxima página"
                  className="w-8 h-8 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition"
                >
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Lead Detail Modal ── */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdated={updated => {
            setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
            setSelectedLead(prev => prev ? { ...prev, ...updated } : null)
          }}
          onDeleted={() => {
            setSelectedLead(null)
            loadLeads()
          }}
        />
      )}

      {/* ── Bulk action bar (sticky bottom) ──
       * Floats above the BottomNav on mobile and at the bottom of viewport on
       * desktop. Only shows when something's selected. */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Ações em massa"
          className="fixed left-1/2 -translate-x-1/2 bottom-[80px] md:bottom-6 z-40 w-[calc(100%-1rem)] md:w-auto"
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-900 text-white shadow-2xl ring-1 ring-black/20 mx-auto max-w-2xl">
            <button
              onClick={clearSelection}
              aria-label="Limpar seleção"
              className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 transition shrink-0"
            >
              <X size={14} strokeWidth={2} />
            </button>
            <span className="text-[12px] font-semibold tabular-nums whitespace-nowrap pr-1">
              {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </span>
            <span className="flex-1" />
            <button
              onClick={() => setBulkEditOpen(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-white/10 text-white text-[12px] font-semibold hover:bg-white/15 disabled:opacity-40 active:scale-[0.97] transition"
            >
              <Edit3 size={13} strokeWidth={2} />
              <span className="hidden sm:inline">Editar em massa</span>
              <span className="sm:hidden">Editar</span>
            </button>
            <button
              onClick={runBulkDelete}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-red-500 text-white text-[12px] font-semibold hover:bg-red-600 disabled:opacity-40 active:scale-[0.97] transition"
            >
              {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2} />}
              <span className="hidden sm:inline">Apagar</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {flash && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 top-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg ${
            flash.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {flash.msg}
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <BulkEditModal
          count={selectedCount}
          onClose={() => setBulkEditOpen(false)}
          onApply={runBulkUpdate}
          busy={bulkBusy}
          categories={filterOptions?.categories || []}
        />
      )}

      <SmartImportModal
        open={smartImportOpen}
        onClose={() => setSmartImportOpen(false)}
        entity="clients"
        onImported={(count) => {
          toast(`${count} ${count === 1 ? 'cliente importado' : 'clientes importados'}.`, 'ok')
          loadLeads()
        }}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════
   BULK EDIT MODAL
   Whitelisted fields only — matches the backend
   `BULK_UPDATABLE` set. Empty fields are NOT sent
   (so the user picks what to overwrite, leaves the
   rest alone).
   ══════════════════════════════════════════════ */
function BulkEditModal({
  count, onClose, onApply, busy, categories,
}: {
  count: number
  onClose: () => void
  onApply: (patch: Record<string, any>) => Promise<void>
  busy: boolean
  categories: Array<{ value: string; count: number }>
}) {
  const [status, setStatus] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [tagsAction, setTagsAction] = useState<'replace' | 'skip'>('skip')
  const [tags, setTags] = useState<string>('')
  const [notesAction, setNotesAction] = useState<'replace' | 'skip'>('skip')
  const [notes, setNotes] = useState<string>('')

  function apply() {
    const patch: Record<string, any> = {}
    if (status) patch.status = status
    if (category) patch.category = category
    if (tagsAction === 'replace') {
      patch.tags = tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
    }
    if (notesAction === 'replace') patch.notes = notes
    if (Object.keys(patch).length === 0) {
      alert('Selecione pelo menos um campo para alterar.')
      return
    }
    onApply(patch)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">Edição em massa</p>
            <h2 className="text-[18px] font-bold text-gray-900 mt-0.5">
              {count} lead{count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 transition"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-[12px] text-gray-500 leading-relaxed -mt-2">
            Só os campos preenchidos abaixo serão alterados. Os demais ficam como estão.
          </p>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30"
            >
              <option value="">— manter como está —</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Categoria
            </label>
            <input
              list="bulk-cat-list"
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="— manter como está —"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30"
            />
            <datalist id="bulk-cat-list">
              {categories.slice(0, 30).map(c => (
                <option key={c.value} value={c.value}>{catLabel(c.value)} ({c.count})</option>
              ))}
            </datalist>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Tags
              </label>
              <select
                value={tagsAction}
                onChange={e => setTagsAction(e.target.value as any)}
                className="text-[10px] font-semibold text-gray-700 bg-gray-100 rounded-md px-2 py-0.5 focus:outline-none"
              >
                <option value="skip">Não alterar</option>
                <option value="replace">Substituir</option>
              </select>
            </div>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              disabled={tagsAction === 'skip'}
              placeholder="vip, regional, churn-risk"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30"
            />
            {tagsAction === 'replace' && (
              <p className="text-[10px] text-gray-400 mt-1">Separe por vírgulas. Substitui as tags existentes.</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Anotações
              </label>
              <select
                value={notesAction}
                onChange={e => setNotesAction(e.target.value as any)}
                className="text-[10px] font-semibold text-gray-700 bg-gray-100 rounded-md px-2 py-0.5 focus:outline-none"
              >
                <option value="skip">Não alterar</option>
                <option value="replace">Substituir</option>
              </select>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={notesAction === 'skip'}
              placeholder="Anotação aplicada a todos…"
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-[13px] text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900/30 resize-y"
            />
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-40 active:scale-[0.98] transition"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} strokeWidth={2} />}
            Aplicar a {count}
          </button>
        </footer>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LEAD DETAIL MODAL
   ══════════════════════════════════════════════ */
function LeadDetailModal({
  lead, onClose, onUpdated, onDeleted,
}: {
  lead: Lead
  onClose: () => void
  onUpdated: (c: Partial<Lead> & { id: string }) => void
  onDeleted: () => void
}) {
  const [tab, setTab] = useState<'info' | 'edit' | 'actions'>('info')
  const [status, setStatus] = useState(lead.status || 'new')
  const [notes, setNotes] = useState(lead.notes || '')
  const [clientType, setClientType] = useState(lead.client_type || '')
  const [clientTypes, setClientTypes] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)

  /* Editable fields — initialized from the lead, mutate locally until "Salvar". */
  const [editName, setEditName] = useState(lead.name || '')
  const [editTradeName, setEditTradeName] = useState((lead as any).trade_name || '')
  const [editPhone, setEditPhone] = useState(lead.phone || '')
  const [editPhone2, setEditPhone2] = useState((lead as any).phone_secondary || '')
  const [editEmail, setEditEmail] = useState(lead.email || '')
  const [editWebsite, setEditWebsite] = useState((lead as any).website || '')
  const [editAddress, setEditAddress] = useState(lead.address || '')
  const [editCity, setEditCity] = useState(lead.city || '')
  const [editState, setEditState] = useState(lead.state || '')
  const [editZip, setEditZip] = useState((lead as any).zip_code || '')
  const [editCategory, setEditCategory] = useState(lead.category || '')
  const [editSubcategory, setEditSubcategory] = useState((lead as any).subcategory || '')
  /* Tags as a chip-array (UX upgrade — was a CSV string before). */
  const [editTags, setEditTags] = useState<string[]>(
    Array.isArray(lead.tags)
      ? lead.tags.map((t) => String(t || '').trim()).filter(Boolean)
      : typeof lead.tags === 'string'
        ? String(lead.tags).replace(/[{}"]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
        : []
  )
  const [editTagInput, setEditTagInput] = useState('')
  const [editNotes, setEditNotes] = useState(lead.notes || '')
  const [editFormError, setEditFormError] = useState<string | null>(null)

  function addTagFromInput() {
    const raw = editTagInput.trim().replace(/,$/, '').trim()
    if (!raw) return
    /* Accept multiple at once if pasted with commas */
    const incoming = raw.split(',').map(t => t.trim()).filter(Boolean)
    setEditTags(prev => Array.from(new Set([...prev, ...incoming])))
    setEditTagInput('')
  }
  function removeTag(t: string) {
    setEditTags(prev => prev.filter(x => x !== t))
  }

  async function saveAllFields() {
    /* Validation */
    const name = editName.trim()
    if (!name) { setEditFormError('Nome é obrigatório'); return }
    setEditFormError(null)
    setSaving(true)
    try {
      /* Commit any tag still in the input field (user might've typed without pressing Enter). */
      const pendingTag = editTagInput.trim().replace(/,$/, '').trim()
      const finalTags = pendingTag
        ? Array.from(new Set([...editTags, ...pendingTag.split(',').map(t => t.trim()).filter(Boolean)]))
        : editTags
      const body = {
        name,
        trade_name: editTradeName.trim() || null,
        phone: editPhone.trim() || null,
        phone_secondary: editPhone2.trim() || null,
        email: editEmail.trim() || null,
        website: editWebsite.trim() || null,
        address: editAddress.trim() || null,
        city: editCity.trim() || null,
        state: editState.trim().toUpperCase().slice(0, 2) || null,
        zip_code: editZip.trim() || null,
        category: editCategory.trim() || null,
        subcategory: editSubcategory.trim() || null,
        tags: finalTags.length > 0 ? finalTags : null,
        notes: editNotes.trim() || null,
      }
      const r = await fetch(`/api/clients/${lead.id}`, {
        method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      /* Clear input now that values are committed */
      setEditTagInput('')
      onUpdated({ id: lead.id, ...body } as any)
    } catch (e: any) {
      setEditFormError(e?.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetch('/api/client-types', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setClientTypes(d.types || []))
      .catch(() => {})
  }, [])

  async function saveStatus(s: string) {
    setStatus(s)
    await fetch(`/api/clients/${lead.id}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: s }),
    }).catch(() => {})
    onUpdated({ id: lead.id, status: s })
  }

  async function saveNotes() {
    setSaving(true)
    await fetch(`/api/clients/${lead.id}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify({ notes }),
    }).catch(() => {})
    onUpdated({ id: lead.id, notes })
    setSaving(false)
  }

  async function saveClientType(ct: string) {
    setClientType(ct)
    await fetch(`/api/clients/${lead.id}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify({ client_type: ct }),
    }).catch(() => {})
    onUpdated({ id: lead.id, client_type: ct })
  }

  async function handleDelete() {
    if (!confirm(`Remover "${lead.name}"?`)) return
    await fetch(`/api/clients/${lead.id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    onDeleted()
  }

  const tags: string[] = Array.isArray(lead.tags)
    ? lead.tags
    : typeof lead.tags === 'string'
      ? lead.tags.split(',').map(t => t.replace(/[{}"]/g, '').trim()).filter(Boolean)
      : []
  const phone = (lead.phone || '').replace(/\D/g, '')
  const rating = Number(lead.google_rating) || 0
  const stCfg = STATUS_LABEL[status] || { label: status, color: 'bg-gray-100 text-gray-500' }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white shadow-2xl w-full max-w-md max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 border-b border-border-light shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-[20px] font-bold tracking-tight text-gray-900 leading-tight truncate">
                {lead.name}
              </h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stCfg.color}`}>
                  {stCfg.label}
                </span>
                {lead.category && (
                  <span className="text-[11px] text-gray-500">{catLabel(lead.category)}</span>
                )}
                {rating > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-700 tabular-nums">
                    <Star size={10} className="fill-amber-500 text-amber-500" />
                    {rating.toFixed(1)}
                    {lead.google_reviews_count ? (
                      <span className="text-gray-400 font-normal">({lead.google_reviews_count})</span>
                    ) : null}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="w-9 h-9 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition shrink-0"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>

          {/* Quick contact */}
          {(phone || lead.email) && (
            <div className="flex gap-2 mt-3">
              {phone && (
                <a
                  href={`https://wa.me/${phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 h-10 flex-1 px-3 rounded-xl bg-emerald-600 text-white text-[13px] font-medium hover:bg-emerald-700 active:scale-[0.98] transition"
                >
                  <MessageSquare size={14} strokeWidth={1.75} /> WhatsApp
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center justify-center gap-1.5 h-10 flex-1 px-3 rounded-xl bg-gray-100 text-gray-800 text-[13px] font-medium hover:bg-gray-200 active:scale-[0.98] transition"
                >
                  <Mail size={14} strokeWidth={1.75} /> Email
                </a>
              )}
              {phone && (
                <a
                  href={`tel:+${phone}`}
                  aria-label="Ligar"
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200 active:scale-90 transition"
                >
                  <Phone size={14} strokeWidth={1.75} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-5 pt-1 border-b border-border-light flex gap-1 shrink-0">
          {([['info', 'Detalhes'], ['edit', 'Editar'], ['actions', 'Ações']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? 'page' : undefined}
              className={`px-3.5 h-9 text-[12px] font-medium transition border-b-2 -mb-px ${
                tab === k
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-500 border-transparent hover:text-gray-900'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          {tab === 'info' && (
            <>
              {lead.phone && (
                <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5">
                  <Phone size={14} strokeWidth={1.75} className="text-gray-400 shrink-0" />
                  <span className="text-[13px] font-mono text-gray-800 flex-1">{lead.phone}</span>
                </div>
              )}
              {lead.address && (
                <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5">
                  <MapPin size={14} strokeWidth={1.75} className="text-gray-400 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-gray-700 flex-1 leading-relaxed">{lead.address}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {lead.city && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cidade</p>
                    <p className="text-[13px] font-medium text-gray-900 mt-0.5">{lead.city}</p>
                  </div>
                )}
                {lead.state && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Estado</p>
                    <p className="text-[13px] font-medium text-gray-900 mt-0.5">{lead.state}</p>
                  </div>
                )}
                {lead.trade_name && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Nome fantasia</p>
                    <p className="text-[13px] font-medium text-gray-900 mt-0.5 truncate">{lead.trade_name}</p>
                  </div>
                )}
                {lead.category && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Categoria</p>
                    <p className="text-[13px] font-medium text-gray-900 mt-0.5">{catLabel(lead.category)}</p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cadastrado</p>
                  <p className="text-[13px] font-medium text-gray-900 mt-0.5 tabular-nums">{fmtDateFull(lead.created_at)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Fonte</p>
                  <p className="text-[13px] font-medium text-gray-900 mt-0.5">
                    {lead.source === 'google_places' ? 'Google Places' : lead.source || '—'}
                  </p>
                </div>
                {Number(lead.lead_score) > 0 && (
                  <div className="bg-gray-900 text-white rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide">Score</p>
                    <p className="text-[20px] font-bold mt-0.5 tabular-nums">{lead.lead_score}</p>
                  </div>
                )}
                {lead.business_status && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
                    <p className="text-[13px] font-medium text-gray-900 mt-0.5">{lead.business_status}</p>
                  </div>
                )}
              </div>

              {tags.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Tag size={10} strokeWidth={1.75} /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t, i) => (
                      <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {(lead.website || lead.google_maps_uri) && (
                <div className="flex gap-2 flex-wrap">
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-gray-100 text-gray-700 text-[12px] font-medium hover:bg-gray-200 transition">
                      <Globe size={12} strokeWidth={1.75} /> Website <ExternalLink size={10} strokeWidth={1.75} />
                    </a>
                  )}
                  {lead.google_maps_uri && (
                    <a href={lead.google_maps_uri} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-gray-100 text-gray-700 text-[12px] font-medium hover:bg-gray-200 transition">
                      <MapPin size={12} strokeWidth={1.75} /> Maps <ExternalLink size={10} strokeWidth={1.75} />
                    </a>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'edit' && (
            <div className="space-y-3">
              {/* Header explanatory */}
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Edite os dados do lead. Para alterar status ou tipo de cliente, use a aba <b>Ações</b>.
              </p>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Nome *</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do contato ou empresa"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Nome fantasia</label>
                <input type="text" value={editTradeName} onChange={(e) => setEditTradeName(e.target.value)}
                  placeholder="Razão social ou apelido comercial"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Telefone</label>
                  <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Telefone 2</label>
                  <input type="tel" value={editPhone2} onChange={(e) => setEditPhone2(e.target.value)}
                    placeholder="Opcional"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Email</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="contato@empresa.com"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Website</label>
                <input type="url" value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Endereço</label>
                <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Rua, número, complemento"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
              </div>

              <div className="grid grid-cols-[1fr_80px_120px] gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Cidade</label>
                  <input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">UF</label>
                  <input type="text" value={editState} onChange={(e) => setEditState(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP" maxLength={2}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition uppercase text-center" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">CEP</label>
                  <input type="text" value={editZip} onChange={(e) => setEditZip(e.target.value)}
                    placeholder="00000-000"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Categoria</label>
                  <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="ex: padaria, restaurante"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Subcategoria</label>
                  <input type="text" value={editSubcategory} onChange={(e) => setEditSubcategory(e.target.value)}
                    placeholder="opcional"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition" />
                </div>
              </div>

              {/* ── Tag chips — visual, removable, accepts paste with commas ── */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 min-h-[44px] rounded-xl border border-border bg-white focus-within:ring-4 focus-within:ring-gray-900/5 focus-within:border-gray-900 transition">
                  {editTags.map((t) => (
                    <span key={t}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-800">
                      <Tag size={9} strokeWidth={2.25} />
                      {t}
                      <button type="button" onClick={() => removeTag(t)}
                        aria-label={`Remover tag ${t}`}
                        className="ml-0.5 -mr-0.5 w-4 h-4 rounded-full grid place-items-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition">
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={editTagInput}
                    onChange={(e) => {
                      const v = e.target.value
                      /* Auto-commit on comma */
                      if (v.endsWith(',')) {
                        setEditTagInput(v.slice(0, -1))
                        setTimeout(() => addTagFromInput(), 0)
                      } else {
                        setEditTagInput(v)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTagFromInput()
                      }
                      if (e.key === 'Backspace' && !editTagInput && editTags.length > 0) {
                        /* Backspace on empty input removes last tag */
                        setEditTags(prev => prev.slice(0, -1))
                      }
                    }}
                    onBlur={addTagFromInput}
                    placeholder={editTags.length === 0 ? 'ex: quente, prioridade, follow-up' : 'adicionar...'}
                    className="flex-1 min-w-[120px] bg-transparent text-sm border-0 outline-none placeholder:text-gray-400 px-1"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Enter ou vírgula adiciona. Backspace remove a última.</p>
              </div>

              {/* ── Observações / anotações ── */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
                  Observações / anotações
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Histórico de contato, preferências, próximos passos, observações importantes sobre este lead…"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-[13px] text-gray-900 placeholder:text-gray-400 resize-y leading-relaxed focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Aparecem em toda visualização do lead. Útil para passar o bastão entre vendedores.
                </p>
              </div>

              {editFormError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" strokeWidth={2} />
                  <p className="text-[12px] text-red-700 font-medium leading-snug">{editFormError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border-light">
                <button onClick={() => setTab('info')} disabled={saving}
                  className="px-4 h-10 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">
                  Cancelar
                </button>
                <Button onClick={saveAllFields} loading={saving} size="md">
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </div>
            </div>
          )}

          {tab === 'actions' && (
            <>
              {/* Status */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Alterar status</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => saveStatus(k)}
                      aria-pressed={status === k}
                      className={`px-3 h-9 rounded-full text-[12px] font-medium transition ${
                        status === k
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Client Type */}
              {clientTypes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tipo de cliente</p>
                  <select
                    value={clientType}
                    onChange={e => saveClientType(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-border bg-white text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                  >
                    <option value="">Selecionar tipo…</option>
                    {clientTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Observações</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre este lead…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
                <Button onClick={saveNotes} loading={saving} size="sm" className="mt-2">
                  {saving ? 'Salvando' : 'Salvar'}
                </Button>
              </div>

              {/* Communication grid */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Comunicação</p>
                <div className="grid grid-cols-2 gap-2">
                  {phone && (
                    <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[13px] active:scale-[0.98] transition">
                      <MessageSquare size={15} strokeWidth={1.75} /> WhatsApp
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`}
                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-medium text-[13px] active:scale-[0.98] transition">
                      <Mail size={15} strokeWidth={1.75} /> Email
                    </a>
                  )}
                  {phone && (
                    <a href={`tel:+${phone}`}
                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium text-[13px] active:scale-[0.98] transition">
                      <Phone size={15} strokeWidth={1.75} /> Ligar
                    </a>
                  )}
                  {phone && (
                    <a href={`sms:+${phone}`}
                      className="flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium text-[13px] active:scale-[0.98] transition">
                      <Send size={15} strokeWidth={1.75} /> SMS
                    </a>
                  )}
                </div>
              </div>

              {/* Delete */}
              <div className="pt-2 border-t border-border-light">
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-red-600 text-[12px] font-medium hover:bg-red-50 transition"
                >
                  <Trash2 size={13} strokeWidth={1.75} /> Remover este lead
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   KpiCard — metrica densa: numero grande + label + subtitulo + barra de progresso
   ══════════════════════════════════════════════ */
function KpiCard({
  label,
  value,
  subtitle,
  tone = 'default',
  progress,
  onClick,
  active,
}: {
  label: string
  value: string
  subtitle?: string
  tone?: 'default' | 'blue' | 'emerald' | 'amber' | 'green'
  progress?: number
  onClick?: () => void
  active?: boolean
}) {
  const tones: Record<string, { bar: string; valueColor: string; dot: string }> = {
    default: { bar: 'bg-gray-300', valueColor: 'text-gray-900', dot: 'bg-gray-400' },
    blue:    { bar: 'bg-gray-900',    valueColor: 'text-gray-900',    dot: 'bg-gray-900' },
    emerald: { bar: 'bg-emerald-500', valueColor: 'text-emerald-700', dot: 'bg-emerald-500' },
    amber:   { bar: 'bg-amber-500',   valueColor: 'text-amber-700',   dot: 'bg-amber-500' },
    green:   { bar: 'bg-green-600',   valueColor: 'text-green-700',   dot: 'bg-green-600' },
  }
  const t = tones[tone]
  const isClickable = !!onClick
  const Wrapper = isClickable ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`group relative text-left p-3.5 rounded-xl bg-white border transition-all overflow-hidden ${
        active
          ? 'border-gray-900 shadow-[0_0_0_3px_rgba(17,24,39,0.06)]'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
      } ${isClickable ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      {/* Header: dot + label */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      {/* Value */}
      <p className={`text-[24px] font-bold tabular-nums leading-none ${t.valueColor}`}>{value}</p>
      {/* Subtitle */}
      {subtitle && (
        <p className="text-[10.5px] text-gray-500 mt-1.5 truncate" title={subtitle}>{subtitle}</p>
      )}
      {/* Progress bar — sutil no rodape do card */}
      {progress !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gray-100 overflow-hidden">
          <div
            className={`h-full ${t.bar} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Wrapper>
  )
}

/* ══════════════════════════════════════════════
   FilterPopover — dropdown reutilizavel pros filtros
   ══════════════════════════════════════════════ */
function FilterPopover({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
  selectedCount,
  searchable,
  single,
  emptyMessage,
}: {
  label: string
  icon?: React.ReactNode
  options: Array<{ value: string; label: string; count?: number }>
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  selectedCount: number
  searchable?: boolean
  single?: boolean
  emptyMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options
  const hasSelected = selectedCount > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition border ${
          hasSelected
            ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
            : 'bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100'
        }`}
      >
        {icon}
        {label}
        {hasSelected && (
          <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums ${
            hasSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
          }`}>{selectedCount}</span>
        )}
        <ChevronDown size={11} strokeWidth={2.25} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-30 w-64 rounded-xl overflow-hidden"
          style={{
            animation: 'popover-enter 140ms cubic-bezier(0.16, 1, 0.3, 1)',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 30px -8px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)',
          }}
        >
          {searchable && options.length > 5 && (
            <div className="p-2 border-b border-gray-100 bg-white">
              <input
                type="text"
                placeholder="Filtrar…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                style={{ color: '#111827' }}
                className="w-full h-7 px-2 rounded-md bg-gray-50 border-0 text-[12px] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1 bg-white">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-gray-500 text-center">
                {emptyMessage || (query ? 'Nada encontrado' : 'Sem opções')}
              </p>
            ) : (
              filtered.map(opt => {
                const isSel = selected.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onToggle(opt.value)
                      if (single) setOpen(false)
                    }}
                    style={{ color: isSel ? '#111827' : '#374151' }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] font-medium transition ${
                      isSel ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-3.5 h-3.5 rounded grid place-items-center shrink-0 ${
                        isSel ? 'bg-gray-900' : 'border border-gray-300 bg-white'
                      }`}>
                        {isSel && <Check size={9} strokeWidth={3} className="text-white" />}
                      </span>
                      <span className="truncate" style={{ color: 'inherit' }}>{opt.label}</span>
                    </span>
                    {opt.count !== undefined && (
                      <span className="text-[10.5px] text-gray-400 tabular-nums shrink-0">{opt.count.toLocaleString('pt-BR')}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
          {hasSelected && (
            <div className="border-t border-gray-100 p-1.5 flex justify-between items-center bg-white">
              <span className="text-[10.5px] text-gray-500 px-2 tabular-nums">
                {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => { onClear(); setOpen(false) }}
                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   ActiveChip — chip removivel pra filtros ativos
   ══════════════════════════════════════════════ */
function ActiveChip({
  label,
  icon,
  onRemove,
}: {
  label: string
  icon?: React.ReactNode
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-md bg-white border border-gray-200 text-[11px] font-medium text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {icon}
      <span className="truncate max-w-[140px]">{label}</span>
      <button
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="w-4 h-4 grid place-items-center rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </span>
  )
}
