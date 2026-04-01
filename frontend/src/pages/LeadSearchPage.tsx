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
      <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ArrowLeft size={18} className="text-gray-500" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Busca de Leads</h1>
              {brandName && <p className="text-[10px] text-muted">{brandName}</p>}
            </div>
          </div>
          {stats && (
            <div className="hidden sm:flex items-center gap-4 text-xs">
              <span className="text-muted">{stats.total} encontrados</span>
              <span className="text-emerald-600 font-semibold">{stats.created} novos</span>
              {stats.skipped > 0 && <span className="text-amber-600">{stats.skipped} existentes</span>}
              {stats.automationQueued > 0 && <span className="text-blue-600"><Zap size={11} className="inline mr-0.5" />{stats.automationQueued} automacoes</span>}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">

        {/* ── Search Form ── */}
        <form onSubmit={handleSearch} className="bg-white border border-border rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Query */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Tipo de negocio</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Ex: pizzaria, hortifruti, farmacia..."
                  required autoFocus
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-xl text-sm bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-gray-400" />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Cidade / Regiao</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Ex: Sao Paulo, Salvador BA..."
                  required
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-xl text-sm bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-gray-400" />
              </div>
            </div>
          </div>

          {/* Advanced toggle */}
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition">
            <Filter size={12} /> Opcoes avancadas
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Maximo de resultados</label>
                <select value={maxResults} onChange={e => setMaxResults(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                  {[10, 20, 30, 50, 80, 100].map(n => <option key={n} value={n}>{n} resultados</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Raio (km)</label>
                <input type="number" value={radius} onChange={e => setRadius(e.target.value)}
                  placeholder="Padrao: automatico"
                  min={1} max={50}
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-400" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2.5 cursor-pointer py-2.5">
                  <button type="button" onClick={() => setAutomate(!automate)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${automate ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${automate ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs font-medium text-gray-600">Automacao ativa</span>
                </label>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading || !query.trim() || !location.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-sm">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Buscando...</> : <><Search size={16} /> Buscar Leads</>}
            </button>
            {loading && (
              <span className="text-xs text-muted animate-pulse">Consultando Google Places...</span>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}
        </form>

        {/* ── Stats bar ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{stats.total}</p>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Encontrados</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-emerald-600">{stats.created}</p>
              <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest">Novos Leads</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-amber-600">{stats.skipped}</p>
              <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">Ja Existentes</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-blue-600">{stats.automationQueued}</p>
              <p className="text-[10px] font-bold text-blue-600/70 uppercase tracking-widest">Automacoes</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {searched && !loading && leads.length > 0 && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
                {([['all', `Todos (${leads.length})`], ['new', `Novos (${newCount})`], ['captured', `Existentes (${capturedCount})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      statusFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>{l}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Filtrar resultados..."
                  className="pl-8 pr-3 py-2 border border-border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-56" />
              </div>
            </div>

            {/* Lead cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl grid place-items-center mb-4">
              <Users size={28} className="text-muted-light" />
            </div>
            <p className="text-sm text-muted">Nenhum lead encontrado para essa busca</p>
            <p className="text-xs text-muted mt-1">Tente termos mais amplos ou outra localidade</p>
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl grid place-items-center mb-5">
              <Sparkles size={36} className="text-blue-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Encontre novos clientes</h2>
            <p className="text-sm text-muted max-w-md">
              Busque estabelecimentos no Google Maps por tipo de negocio e cidade.
              Leads sao salvos automaticamente no seu CRM.
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
