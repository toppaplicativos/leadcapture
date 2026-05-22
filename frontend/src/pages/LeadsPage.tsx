import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, Filter, Star, Phone, MapPin, Tag, X,
  ChevronLeft, ChevronRight, Users, Loader2,
  MessageSquare, Mail, Globe, ExternalLink, Trash2, Send,
  CheckCircle2, Edit3, CheckSquare, Square, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { SmartImportModal } from '@/components/SmartImportModal'

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
  new: { label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contatado', color: 'bg-amber-100 text-amber-700' },
  replied: { label: 'Respondeu', color: 'bg-emerald-100 text-emerald-700' },
  negotiating: { label: 'Negociando', color: 'bg-purple-100 text-purple-700' },
  converted: { label: 'Convertido', color: 'bg-green-100 text-green-800' },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-600' },
  inactive: { label: 'Inativo', color: 'bg-gray-100 text-gray-500' },
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
  tags: Array<{ value: string; count: number }>
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
   LEADS PAGE — Server-side pagination + filters
   ══════════════════════════════════════════════ */
export function LeadsPage() {
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

  /* ── Load filter options once on mount ── */
  useEffect(() => {
    fetch('/api/customers/filter-options', { headers: getHeaders() })
      .then(r => r.json())
      .then(setFilterOptions)
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
    fetch(`/api/customers?${buildQuery(overridePage)}`, { headers: getHeaders() })
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
      const r = await fetch('/api/customers/bulk-delete', {
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
      const r = await fetch('/api/customers/bulk-update', {
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

  /* ── Render ── */
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Leads</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">
            {filterOptions ? `${filterOptions.total.toLocaleString('pt-BR')} registros` : 'Carregando…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone, cidade"
              className="h-10 pl-10 pr-9 rounded-full border-0 bg-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition w-56 sm:w-72"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
              >
                <X size={12} strokeWidth={2.25} />
              </button>
            )}
          </div>
          <button
            onClick={() => setSmartImportOpen(true)}
            title="Importar leads via IA — texto, CSV/XLS, imagem ou foto"
            className="h-10 flex items-center gap-1.5 px-4 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-[12px] font-bold hover:from-violet-600 hover:to-purple-700 transition shadow-sm"
          >
            <Sparkles size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Importar leads</span>
            <span className="sm:hidden">Importar</span>
          </button>
          <Button
            variant={showFilters ? 'primary' : 'secondary'}
            size="md"
            onClick={() => setShowFilters(v => !v)}
            iconLeft={<Filter size={14} strokeWidth={1.75} />}
          >
            Filtros
            {hasActiveFilters && (
              <span className={`ml-1.5 min-w-[18px] h-[18px] grid place-items-center rounded-full text-[10px] font-semibold tabular-nums ${
                showFilters ? 'bg-white/20 text-white' : 'bg-gray-900 text-white'
              }`}>
                {[selStatus.length, selCategory.length, selCity.length, selTags.length, minRating ? 1 : 0, hasWhatsapp !== null ? 1 : 0].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { key: 'total', label: 'Total', value: total.toLocaleString('pt-BR'), active: !hasActiveFilters },
          { key: 'new', label: 'Novos', value: statusCount('new').toLocaleString('pt-BR'), active: selStatus.includes('new') },
          { key: 'contacted', label: 'Contatados', value: statusCount('contacted').toLocaleString('pt-BR'), active: selStatus.includes('contacted') },
          { key: 'replied', label: 'Responderam', value: statusCount('replied').toLocaleString('pt-BR'), active: selStatus.includes('replied') },
          { key: 'converted', label: 'Convertidos', value: statusCount('converted').toLocaleString('pt-BR'), active: selStatus.includes('converted') },
        ].map(card => (
          <button
            key={card.key}
            onClick={() => {
              if (card.key === 'total') { clearFilters(); return }
              toggle(selStatus, card.key, setSelStatus)
            }}
            aria-pressed={card.active}
            className={`text-left p-4 rounded-2xl transition-colors active:scale-[0.99] ${
              card.active
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-border-light hover:border-gray-300'
            }`}
          >
            <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${card.active ? 'text-white/60' : 'text-gray-400'}`}>{card.label}</p>
            <p className={`text-[26px] font-bold tracking-tight tabular-nums ${card.active ? 'text-white' : 'text-gray-900'}`}>{card.value}</p>
          </button>
        ))}
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 space-y-3">

          {/* Row 1: Status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_LABEL).map(([key, cfg]) => {
                const cnt = filterOptions?.statuses?.find(x => x.value === key)?.count
                return (
                  <Chip
                    key={key}
                    label={cfg.label}
                    count={cnt}
                    active={selStatus.includes(key)}
                    onClick={() => toggle(selStatus, key, setSelStatus)}
                  />
                )
              })}
            </div>
          </div>

          {/* Row 2: Categoria (top 10) */}
          {filterOptions && filterOptions.categories.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Categoria</p>
              <div className="flex flex-wrap gap-1.5">
                {filterOptions.categories.slice(0, 10).map(cat => (
                  <Chip
                    key={cat.value}
                    label={catLabel(cat.value)}
                    count={cat.count}
                    active={selCategory.includes(cat.value)}
                    onClick={() => toggle(selCategory, cat.value, setSelCategory)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Row 3: Cidade (top 8) */}
          {filterOptions && filterOptions.cities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Cidade</p>
              <div className="flex flex-wrap gap-1.5">
                {filterOptions.cities.slice(0, 8).map(city => (
                  <Chip
                    key={city.value}
                    label={city.value}
                    count={city.count}
                    active={selCity.includes(city.value)}
                    onClick={() => toggle(selCity, city.value, setSelCity)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Rating + WhatsApp + Tags */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Avaliação &amp; outros</p>
            <div className="flex flex-wrap gap-1.5">
              {/* Rating chips */}
              {([3, 4, 4.5] as number[]).map(r => (
                <Chip
                  key={r}
                  label={`${r}+`}
                  icon={<Star size={10} strokeWidth={2} className="fill-current" />}
                  active={minRating === r}
                  onClick={() => { setMinRating(minRating === r ? null : r); setPage(1) }}
                />
              ))}

              {/* WhatsApp toggle */}
              <Chip
                label="WhatsApp"
                active={hasWhatsapp === true}
                onClick={() => { setHasWhatsapp(hasWhatsapp === true ? null : true); setPage(1) }}
              />

              {/* Tag chips */}
              {filterOptions?.tags?.slice(0, 8).map(tag => (
                <Chip
                  key={tag.value}
                  label={tag.value}
                  count={tag.count}
                  active={selTags.includes(tag.value)}
                  onClick={() => toggle(selTags, tag.value, setSelTags)}
                />
              ))}
            </div>
          </div>

          {/* Active filters summary + clear */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-border-light">
              <div className="flex flex-wrap gap-1">
                {selStatus.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    {STATUS_LABEL[s]?.label || s}
                    <button onClick={() => toggle(selStatus, s, setSelStatus)} aria-label={`Remover ${s}`}><X size={10} strokeWidth={2.25} /></button>
                  </span>
                ))}
                {selCategory.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    {catLabel(c)}
                    <button onClick={() => toggle(selCategory, c, setSelCategory)} aria-label={`Remover ${c}`}><X size={10} strokeWidth={2.25} /></button>
                  </span>
                ))}
                {selCity.map(c => (
                  <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    <MapPin size={10} strokeWidth={1.75} />{c}
                    <button onClick={() => toggle(selCity, c, setSelCity)} aria-label={`Remover ${c}`}><X size={10} strokeWidth={2.25} /></button>
                  </span>
                ))}
                {minRating && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    <Star size={10} strokeWidth={2} className="fill-current" />
                    {minRating}+
                    <button onClick={() => { setMinRating(null); setPage(1) }} aria-label="Remover rating"><X size={10} strokeWidth={2.25} /></button>
                  </span>
                )}
                {hasWhatsapp === true && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    WhatsApp
                    <button onClick={() => { setHasWhatsapp(null); setPage(1) }} aria-label="Remover WhatsApp"><X size={10} strokeWidth={2.25} /></button>
                  </span>
                )}
                {selTags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                    <Tag size={10} strokeWidth={1.75} />{t}
                    <button onClick={() => toggle(selTags, t, setSelTags)} aria-label={`Remover ${t}`}><X size={10} strokeWidth={2.25} /></button>
                  </span>
                ))}
              </div>
              <button
                onClick={clearFilters}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-900 transition whitespace-nowrap shrink-0"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-border-light overflow-hidden">

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
            <p className="text-[14px] font-medium text-gray-900">Nenhum lead encontrado</p>
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
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Nome</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Telefone</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cidade</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Categoria</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Rating</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50 transition-opacity' : ''}>
                  {leads.map(lead => {
                    const rating = Number(lead.google_rating) || 0
                    const st = STATUS_LABEL[lead.status] || { label: lead.status, color: 'bg-gray-100 text-gray-600' }
                    const checked = selectedIds.has(lead.id)
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`border-b border-border-light last:border-0 cursor-pointer transition-colors ${
                          checked ? 'bg-gray-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td
                          className="pl-4 pr-2 py-3 w-8"
                          onClick={e => { e.stopPropagation(); toggleSelect(lead.id) }}
                        >
                          <span
                            role="checkbox"
                            aria-checked={checked}
                            className="w-4 h-4 grid place-items-center text-gray-500 hover:text-gray-900 transition"
                          >
                            {checked ? (
                              <CheckSquare size={16} strokeWidth={2} className="text-gray-900" />
                            ) : (
                              <Square size={16} strokeWidth={1.5} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[220px] text-[13px]">
                            {lead.name || '—'}
                          </p>
                          {lead.trade_name && lead.trade_name !== lead.name && (
                            <p className="text-[10px] text-gray-400 truncate max-w-[220px] mt-0.5">{lead.trade_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.phone ? (
                            <span className="text-[12px] font-mono text-gray-600">{lead.phone}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[12px] text-gray-600">{lead.city || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] text-gray-500">{lead.category ? catLabel(lead.category) : '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {rating > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-700 tabular-nums">
                              <Star size={10} className="fill-amber-500 text-amber-500" />
                              {rating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[10px] text-gray-400 tabular-nums">{fmtDate(lead.created_at)}</span>
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
        onImported={(count) => {
          toast(`${count} ${count === 1 ? 'lead importado' : 'leads importados'}.`, 'ok')
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
  const [tab, setTab] = useState<'info' | 'actions'>('info')
  const [status, setStatus] = useState(lead.status || 'new')
  const [notes, setNotes] = useState(lead.notes || '')
  const [clientType, setClientType] = useState(lead.client_type || '')
  const [clientTypes, setClientTypes] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/client-types', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setClientTypes(d.types || []))
      .catch(() => {})
  }, [])

  async function saveStatus(s: string) {
    setStatus(s)
    await fetch(`/api/customers/${lead.id}`, {
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
    await fetch(`/api/customers/${lead.id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
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
          {([['info', 'Detalhes'], ['actions', 'Ações']] as const).map(([k, l]) => (
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
