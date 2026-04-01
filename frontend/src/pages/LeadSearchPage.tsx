import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, MapPin, Loader2, Star, Phone, Globe, ExternalLink,
  CheckCircle2, Sparkles, Zap, ChevronDown, ChevronUp, ArrowLeft,
  Building2, Navigation, Users, Filter,
} from 'lucide-react'

/* ── Helpers ── */
function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

interface Lead {
  id: string; name: string; phone: string; address: string
  rating: number; reviews: number; category: string
  website: string; googleMapsUri: string; businessStatus: string
  captureStatus: 'new' | 'captured'; captureQuery: string
  location?: { latitude: number; longitude: number } | null
}

/* ══════════════════════════════════════════════
   LEAD SEARCH PAGE
   ══════════════════════════════════════════════ */
export function LeadSearchPage() {
  const navigate = useNavigate()
  const token = localStorage.getItem('lead-system-token')
  useEffect(() => { if (!token) navigate('/login', { replace: true }) }, [token])

  // Form
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [automate, setAutomate] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [radius, setRadius] = useState('')

  // Results
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{ total: number; created: number; skipped: number; automationQueued: number } | null>(null)
  const [searched, setSearched] = useState(false)

  // Filter
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'captured'>('all')
  const [searchFilter, setSearchFilter] = useState('')

  // Brand
  const [brandName, setBrandName] = useState('')
  useEffect(() => {
    fetch('/api/brands', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        const list = d.brands || []
        const active = d.active_brand_id
        const b = list.find((x: any) => String(x.id) === String(active)) || list[0] || {}
        setBrandName(b.name || '')
        if (b.name) document.title = b.name + ' — Busca de Leads'
      }).catch(() => {})
  }, [])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!query.trim() || !location.trim()) return
    setLoading(true); setError(''); setLeads([]); setStats(null); setSearched(true)
    try {
      const body: Record<string, any> = {
        query: query.trim(),
        location: location.trim(),
        maxResults,
        executeAutomation: automate,
      }
      if (radius && Number(radius) > 0) body.radius = Number(radius) * 1000 // km → m
      const r = await fetch('/api/leads/search', {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setLeads(d.leads || [])
      setStats({
        total: d.total || 0,
        created: d.persisted?.created || 0,
        skipped: d.persisted?.skipped || 0,
        automationQueued: d.automation?.queued_jobs || 0,
      })
    } catch (err: any) {
      setError(err.message || 'Erro na busca')
    } finally {
      setLoading(false)
    }
  }

  const filtered = leads.filter(l => {
    if (statusFilter === 'new' && l.captureStatus !== 'new') return false
    if (statusFilter === 'captured' && l.captureStatus !== 'captured') return false
    if (searchFilter) {
      const q = searchFilter.toLowerCase()
      return l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.address.toLowerCase().includes(q)
    }
    return true
  })

  const newCount = leads.filter(l => l.captureStatus === 'new').length
  const capturedCount = leads.filter(l => l.captureStatus === 'captured').length

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Topbar ── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-1.5 rounded-lg hover:bg-white/10 transition">
            <ArrowLeft size={18} />
          </button>
          <Search size={18} className="text-blue-400" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight">Busca de Leads</h1>
            {brandName && <p className="text-[10px] text-white/50">{brandName}</p>}
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-3">
              <span className="bg-white/10 px-2.5 py-1 rounded-lg text-[11px] font-semibold">{stats.total} encontrados</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-[11px] font-bold">{stats.created} novos</span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Search Form ── */}
        <form onSubmit={handleSearch} className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Query */}
              <div className="flex-1">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Segmento</label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="pizzaria, hortifruti, farmacia..."
                    required autoFocus
                    className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-gray-300" />
                </div>
              </div>

              {/* Location */}
              <div className="flex-1">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Cidade</label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="Sao Paulo, Salvador BA..."
                    required
                    className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-gray-300" />
                </div>
              </div>

              {/* Submit inline */}
              <div className="flex items-end">
                <button type="submit" disabled={loading || !query.trim() || !location.trim()}
                  className="w-full sm:w-auto whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  {loading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>
          </div>

          {/* Advanced strip */}
          <div className="border-t border-border bg-gray-50/80 px-5 py-2.5 flex items-center justify-between gap-4 flex-wrap">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition">
              <Filter size={11} /> Avancado
              {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-gray-400">{maxResults} resultados</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <button type="button" onClick={() => setAutomate(!automate)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${automate ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${automate ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-[11px] font-medium text-gray-500">Automacao</span>
              </label>
            </div>
          </div>

          {showAdvanced && (
            <div className="border-t border-border bg-gray-50/60 px-5 py-3 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase mb-1 block">Max. resultados</label>
                <select value={maxResults} onChange={e => setMaxResults(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {[10, 20, 30, 50, 80, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase mb-1 block">Raio (km)</label>
                <input type="number" value={radius} onChange={e => setRadius(e.target.value)}
                  placeholder="auto" min={1} max={50}
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
              </div>
              <div className="flex items-end">
                <p className="text-[10px] text-gray-400 leading-relaxed">Raio vazio = Google decide o raio ideal automaticamente.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}
        </form>

        {/* ── Stats bar ── */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { v: stats.total, l: 'Encontrados', c: 'text-gray-900', bg: 'bg-white border-border' },
              { v: stats.created, l: 'Novos', c: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
              { v: stats.skipped, l: 'Existentes', c: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              { v: stats.automationQueued, l: 'Automacoes', c: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
            ].map(s => (
              <div key={s.l} className={`border rounded-xl p-2.5 text-center ${s.bg}`}>
                <p className={`text-xl font-extrabold ${s.c}`}>{s.v}</p>
                <p className="text-[9px] font-bold text-muted uppercase tracking-widest">{s.l}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Results ── */}
        {searched && !loading && leads.length > 0 && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                {([['all', `Todos (${leads.length})`], ['new', `Novos (${newCount})`], ['captured', `Existentes (${capturedCount})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${
                      statusFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>{l}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Filtrar..."
                  className="pl-7 pr-3 py-1.5 border border-border rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-44" />
              </div>
            </div>

            {/* Lead cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filtered.map(lead => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted py-8">Nenhum resultado para o filtro selecionado</p>
            )}
          </div>
        )}

        {searched && !loading && leads.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
              <Users size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">Nenhum resultado</p>
            <p className="text-xs text-muted mt-1">Tente termos mais amplos ou outra localidade</p>
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl grid place-items-center mb-4 shadow-sm">
              <Sparkles size={28} className="text-blue-500" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1">Encontre novos clientes</h2>
            <p className="text-xs text-muted max-w-sm leading-relaxed">
              Busque estabelecimentos no Google Maps por segmento e cidade. Leads salvos automaticamente no CRM.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Lead Card ── */
function LeadCard({ lead }: { lead: Lead }) {
  const isNew = lead.captureStatus === 'new'

  return (
    <div className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${isNew ? 'border-emerald-200' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm text-gray-900 truncate">{lead.name}</h4>
            {isNew
              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">NOVO</span>
              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">EXISTENTE</span>}
          </div>
          {lead.category && (
            <p className="text-[10px] text-muted capitalize mt-0.5">{lead.category.replace(/_/g, ' ')}</p>
          )}
        </div>
        {lead.rating > 0 && (
          <div className="flex items-center gap-1 shrink-0 bg-amber-50 px-2 py-1 rounded-lg">
            <Star size={11} className="text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-amber-700">{lead.rating.toFixed(1)}</span>
            {lead.reviews > 0 && <span className="text-[10px] text-amber-600/70">({lead.reviews})</span>}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-1.5 mt-3">
        {lead.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Phone size={12} className="text-muted shrink-0" />
            <span className="font-mono">{lead.phone}</span>
          </div>
        )}
        {lead.address && (
          <div className="flex items-start gap-2 text-xs text-gray-600">
            <MapPin size={12} className="text-muted shrink-0 mt-0.5" />
            <span className="line-clamp-2">{lead.address}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        {lead.phone && (
          <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition">
            <Phone size={11} /> WhatsApp
          </a>
        )}
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition">
            <Globe size={11} /> Site
          </a>
        )}
        {lead.googleMapsUri && (
          <a href={lead.googleMapsUri} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition">
            <Navigation size={11} /> Maps
          </a>
        )}
      </div>
    </div>
  )
}
