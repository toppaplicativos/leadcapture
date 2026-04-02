import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Users, Phone, Mail, MapPin, Tag, Star,
  ChevronLeft, ChevronRight, Loader2, Trash2,
  MessageSquare, Clock, X, Globe, Send, ExternalLink,
  TrendingUp, Filter, Building2, Zap, UserCheck, UserX, Eye,
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

const dt = (v?: string) => { try { return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) } catch { return '' } }
const dtFull = (v?: string) => { try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const STATUS_MAP: Record<string, { label: string; cls: string; bg: string }> = {
  new: { label: 'Novo', cls: 'text-blue-700', bg: 'bg-blue-50 ring-1 ring-blue-200' },
  contacted: { label: 'Contatado', cls: 'text-indigo-700', bg: 'bg-indigo-50 ring-1 ring-indigo-200' },
  replied: { label: 'Respondeu', cls: 'text-emerald-700', bg: 'bg-emerald-50 ring-1 ring-emerald-200' },
  negotiating: { label: 'Negociando', cls: 'text-amber-800', bg: 'bg-amber-50 ring-1 ring-amber-200' },
  converted: { label: 'Convertido', cls: 'text-emerald-700', bg: 'bg-emerald-50 ring-1 ring-emerald-200' },
  lost: { label: 'Perdido', cls: 'text-red-700', bg: 'bg-red-50 ring-1 ring-red-200' },
  inactive: { label: 'Inativo', cls: 'text-gray-600', bg: 'bg-gray-100' },
}

interface Client {
  id: string; name: string; phone?: string; email?: string
  status: string; source: string; tags?: string[] | string; notes?: string
  city?: string; state?: string; address?: string; trade_name?: string
  lead_score?: number; created_at?: string; updated_at?: string
  google_rating?: number; google_reviews_count?: number
  website?: string; google_maps_uri?: string; category?: string; subcategory?: string
  phone_secondary?: string; business_status?: string; has_whatsapp?: boolean
}

/* ══════════════════════════════════════════════
   LEADS PAGE — Dashboard + Table + Modal
   ══════════════════════════════════════════════ */
export function LeadsPage() {
  const [allClients, setAllClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [selectedLead, setSelectedLead] = useState<Client | null>(null)
  const limit = 25

  const fetchClients = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/customers?limit=999', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch('/api/clients?limit=999', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ clients: [] })),
    ]).then(([cust, cli]) => {
      const customers = (cust.customers || []).map((c: any) => ({ ...c, source: c.source || 'google_places' }))
      const manual = (cli.clients || []).map((c: any) => ({ ...c, source: c.source || 'manual' }))
      const all = [...customers, ...manual]
      const seen = new Set<string>()
      const deduped = all.filter(c => {
        const key = (c.phone || c.id || '').replace(/\D/g, '')
        if (seen.has(key) && key) return false
        if (key) seen.add(key)
        return true
      })
      setAllClients(deduped)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  // ── Computed metrics ──
  const metrics = useMemo(() => {
    const total = allClients.length
    const withPhone = allClients.filter(c => c.phone).length
    const withEmail = allClients.filter(c => c.email).length
    const withRating = allClients.filter(c => Number(c.google_rating) > 0).length
    const avgRating = withRating > 0 ? allClients.reduce((s, c) => s + (Number(c.google_rating) || 0), 0) / withRating : 0
    const statusCounts: Record<string, number> = {}
    allClients.forEach(c => { statusCounts[c.status || 'new'] = (statusCounts[c.status || 'new'] || 0) + 1 })
    const categoryCounts: Record<string, number> = {}
    allClients.forEach(c => { if (c.category) categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1 })
    const cityCounts: Record<string, number> = {}
    allClients.forEach(c => { if (c.city) cityCounts[c.city] = (cityCounts[c.city] || 0) + 1 })
    const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const thisWeek = allClients.filter(c => {
      const d = new Date(c.created_at || '')
      return d.getTime() > Date.now() - 7 * 86400000
    }).length
    return { total, withPhone, withEmail, withRating, avgRating, statusCounts, topCategories, topCities, thisWeek }
  }, [allClients])

  // ── Filtered + searched ──
  const filtered = useMemo(() => {
    let list = allClients
    if (activeFilter) {
      if (activeFilter.startsWith('status:')) list = list.filter(c => (c.status || 'new') === activeFilter.slice(7))
      else if (activeFilter.startsWith('category:')) list = list.filter(c => c.category === activeFilter.slice(9))
      else if (activeFilter.startsWith('city:')) list = list.filter(c => c.city === activeFilter.slice(5))
      else if (activeFilter === 'has_phone') list = list.filter(c => c.phone)
      else if (activeFilter === 'has_email') list = list.filter(c => c.email)
      else if (activeFilter === 'has_rating') list = list.filter(c => Number(c.google_rating) > 0)
      else if (activeFilter === 'this_week') list = list.filter(c => new Date(c.created_at || '').getTime() > Date.now() - 7 * 86400000)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q))
    }
    return list
  }, [allClients, activeFilter, search])

  const totalPages = Math.ceil(filtered.length / limit)
  const paged = filtered.slice((page - 1) * limit, page * limit)

  function toggleFilter(f: string) {
    setActiveFilter(prev => prev === f ? '' : f)
    setPage(1)
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-40 bg-gray-200 rounded-lg skeleton" />
      <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl skeleton" />)}</div>
      <div className="h-64 bg-gray-100 rounded-2xl skeleton" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Leads</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} registros &middot; {metrics.thisWeek} esta semana</p>
      </div>

      {/* ── KPI Cards (clickable filters) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MetricCard label="Total Leads" value={metrics.total} icon={Users} gradient="from-blue-500 to-indigo-600"
          active={!activeFilter} onClick={() => setActiveFilter('')} />
        <MetricCard label="Com Telefone" value={metrics.withPhone} icon={Phone} gradient="from-emerald-500 to-teal-600"
          active={activeFilter === 'has_phone'} onClick={() => toggleFilter('has_phone')}
          sub={`${Math.round(metrics.withPhone / Math.max(metrics.total, 1) * 100)}%`} />
        <MetricCard label="Esta Semana" value={metrics.thisWeek} icon={TrendingUp} gradient="from-violet-500 to-purple-600"
          active={activeFilter === 'this_week'} onClick={() => toggleFilter('this_week')} />
        <MetricCard label="Rating Medio" value={metrics.avgRating > 0 ? metrics.avgRating.toFixed(1) : '—'} icon={Star} gradient="from-amber-500 to-orange-600"
          active={activeFilter === 'has_rating'} onClick={() => toggleFilter('has_rating')}
          sub={`${metrics.withRating} avaliados`} />
      </div>

      {/* ── Status funnel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Funil de Status</p>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(STATUS_MAP).map(([key, cfg]) => {
            const count = metrics.statusCounts[key] || 0
            const isActive = activeFilter === `status:${key}`
            return (
              <button key={key} onClick={() => toggleFilter(`status:${key}`)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive ? cfg.bg + ' ' + cfg.cls + ' shadow-sm scale-105' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}>
                <span>{cfg.label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/60' : 'bg-gray-200/60'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Categories + Cities chips ── */}
      {(metrics.topCategories.length > 0 || metrics.topCities.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metrics.topCategories.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Categorias</p>
              <div className="flex flex-wrap gap-1">
                {metrics.topCategories.map(([cat, count]) => (
                  <button key={cat} onClick={() => toggleFilter(`category:${cat}`)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition capitalize ${
                      activeFilter === `category:${cat}` ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}>{cat.replace(/_/g, ' ')} <span className="text-[9px] opacity-60">{count}</span></button>
                ))}
              </div>
            </div>
          )}
          {metrics.topCities.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Cidades</p>
              <div className="flex flex-wrap gap-1">
                {metrics.topCities.map(([city, count]) => (
                  <button key={city} onClick={() => toggleFilter(`city:${city}`)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                      activeFilter === `city:${city}` ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}>{city} <span className="text-[9px] opacity-60">{count}</span></button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Search + Active filter indicator ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nome, telefone, email, cidade..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
        </div>
        {activeFilter && (
          <button onClick={() => { setActiveFilter(''); setPage(1) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition">
            <Filter size={12} /> {activeFilter.replace(':', ': ').replace('_', ' ')}
            <X size={12} />
          </button>
        )}
        <span className="text-xs text-gray-400 shrink-0">{filtered.length} resultados</span>
      </div>

      {/* ── Table ── */}
      {paged.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Users size={28} className="text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-600">Nenhum lead encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lead</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Contato</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Rating</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Categoria</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(c => {
                const rating = Number(c.google_rating) || 0
                return (
                  <tr key={c.id} onClick={() => setSelectedLead(c)}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/30 transition group">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 truncate max-w-[200px] group-hover:text-blue-600 transition">{c.name || '—'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{c.city || ''}{c.state ? `, ${c.state}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-3">
                        {c.phone && <span className="text-xs text-gray-600 font-mono">{c.phone}</span>}
                        {c.phone && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="WhatsApp" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {rating > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-700">
                          <Star size={10} className="fill-amber-500 text-amber-500" /> {rating.toFixed(1)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-[10px] text-gray-400 capitalize">{(c.category || '').replace(/_/g, ' ') || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[10px] text-gray-400">{dt(c.created_at)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"><ChevronLeft size={16} /></button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                    page === p ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>{p}</button>
              )
            })}
          </div>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* ── Lead Detail Modal ── */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdated={(updated) => {
            setAllClients(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
            setSelectedLead(prev => prev ? { ...prev, ...updated } : null)
          }}
          onDeleted={() => { setSelectedLead(null); fetchClients() }}
        />
      )}
    </div>
  )
}

/* ── Metric Card ── */
function MetricCard({ label, value, icon: Icon, gradient, active, onClick, sub }: {
  label: string; value: string | number; icon: any; gradient: string; active: boolean; onClick: () => void; sub?: string
}) {
  return (
    <button onClick={onClick}
      className={`text-left p-4 rounded-2xl transition-all ${
        active ? `bg-gradient-to-br ${gradient} text-white shadow-lg scale-[1.02]` : 'bg-white border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-md'
      }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-white/60' : 'text-gray-400'}`}>{label}</span>
        <Icon size={16} className={active ? 'text-white/50' : 'text-gray-300'} />
      </div>
      <p className={`text-2xl font-extrabold ${active ? '' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${active ? 'text-white/50' : 'text-gray-400'}`}>{sub}</p>}
    </button>
  )
}

/* ══════════════════════════════════════════════
   LEAD DETAIL MODAL
   ══════════════════════════════════════════════ */
function LeadDetailModal({ lead, onClose, onUpdated, onDeleted }: {
  lead: Client; onClose: () => void
  onUpdated: (c: Partial<Client>) => void; onDeleted: () => void
}) {
  const [tab, setTab] = useState<'info' | 'actions'>('info')
  const [status, setStatus] = useState(lead.status || 'new')
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)

  async function saveStatus(s: string) {
    setStatus(s)
    await fetch(`/api/customers/${lead.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: s }) }).catch(() => {})
    onUpdated({ id: lead.id, status: s })
  }

  async function saveNotes() {
    setSaving(true)
    await fetch(`/api/clients/${lead.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ notes }) }).catch(() => {})
    onUpdated({ id: lead.id, notes })
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Remover "${lead.name}"?`)) return
    await fetch(`/api/customers/${lead.id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    onDeleted()
  }

  const st = STATUS_MAP[status] || { label: status, cls: 'text-gray-600', bg: 'bg-gray-100' }
  const tags = Array.isArray(lead.tags) ? lead.tags : typeof lead.tags === 'string' ? lead.tags.split(',').map((t: string) => t.replace(/[{}"]/g, '').trim()).filter(Boolean) : []
  const phone = (lead.phone || '').replace(/\D/g, '')
  const rating = Number(lead.google_rating) || 0

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-base text-gray-900 truncate">{lead.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.cls}`}>{st.label}</span>
                {lead.category && <span className="text-[10px] text-gray-400 capitalize">{lead.category.replace(/_/g, ' ')}</span>}
                {rating > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700">
                    <Star size={10} className="fill-amber-500 text-amber-500" /> {rating.toFixed(1)}
                    {lead.google_reviews_count ? <span className="text-amber-500/50">({lead.google_reviews_count})</span> : null}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition shrink-0"><X size={18} className="text-gray-400" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-2 border-b border-gray-100 flex gap-1 shrink-0">
          {[['info', 'Informacoes'], ['actions', 'Acoes']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`px-3.5 py-2 text-xs font-semibold transition ${tab === k ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-400'}`}>{l}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'info' && (<>
            <div className="space-y-2">
              {lead.phone && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2.5">
                    <Phone size={14} className="text-gray-400" />
                    <span className="text-sm font-mono text-gray-700">{lead.phone}</span>
                  </div>
                  <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition shadow-sm">
                    <MessageSquare size={12} /> WhatsApp
                  </a>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2.5">
                    <Mail size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{lead.email}</span>
                  </div>
                  <a href={`mailto:${lead.email}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-600 transition shadow-sm">
                    <Send size={12} /> Email
                  </a>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-600 flex-1">{lead.address}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {lead.city && <MiniInfo label="Cidade" value={`${lead.city}${lead.state ? ` - ${lead.state}` : ''}`} />}
              {lead.trade_name && <MiniInfo label="Nome Fantasia" value={lead.trade_name} />}
              {Number(lead.lead_score) > 0 && <MiniInfo label="Score" value={String(lead.lead_score)} accent />}
              {lead.business_status && <MiniInfo label="Status Negocio" value={lead.business_status} />}
              <MiniInfo label="Cadastrado" value={dtFull(lead.created_at)} />
              <MiniInfo label="Fonte" value={lead.source || '—'} />
            </div>

            {tags.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t: string, i: number) => (
                    <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{t}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 text-gray-600 text-xs font-semibold hover:bg-gray-100 transition">
                  <Globe size={13} /> Website <ExternalLink size={10} />
                </a>
              )}
              {lead.google_maps_uri && (
                <a href={lead.google_maps_uri} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 text-gray-600 text-xs font-semibold hover:bg-gray-100 transition">
                  <MapPin size={13} /> Google Maps <ExternalLink size={10} />
                </a>
              )}
            </div>
          </>)}

          {tab === 'actions' && (<>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Alterar Status</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <button key={k} onClick={() => saveStatus(k)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${status === k ? v.bg + ' ' + v.cls + ' shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{v.label}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Observacoes</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Notas sobre este lead..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              <button onClick={saveNotes} disabled={saving}
                className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Comunicacao</p>
              <div className="grid grid-cols-2 gap-2">
                {phone && <ActionBtn href={`https://wa.me/${phone}`} icon={MessageSquare} label="WhatsApp" cls="bg-emerald-500 hover:bg-emerald-600 text-white" />}
                {lead.email && <ActionBtn href={`mailto:${lead.email}`} icon={Mail} label="Email" cls="bg-blue-500 hover:bg-blue-600 text-white" />}
                {phone && <ActionBtn href={`tel:+${phone}`} icon={Phone} label="Ligar" cls="bg-gray-100 hover:bg-gray-200 text-gray-700" />}
                {phone && <ActionBtn href={`sms:+${phone}`} icon={Send} label="SMS" cls="bg-gray-100 hover:bg-gray-200 text-gray-700" />}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <button onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 text-xs font-semibold hover:bg-red-50 transition">
                <Trash2 size={13} /> Remover este lead
              </button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

function MiniInfo({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-indigo-50' : 'bg-gray-50'}`}>
      <p className={`text-[9px] font-bold uppercase ${accent ? 'text-indigo-400' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xs font-semibold mt-0.5 ${accent ? 'text-indigo-600 text-lg font-extrabold' : 'text-gray-700'}`}>{value}</p>
    </div>
  )
}

function ActionBtn({ href, icon: Icon, label, cls }: { href: string; icon: any; label: string; cls: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className={`flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-sm transition shadow-sm ${cls}`}>
      <Icon size={16} /> {label}
    </a>
  )
}
