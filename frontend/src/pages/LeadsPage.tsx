import { useState, useEffect, useCallback } from 'react'
import {
  Search, Users, Phone, Mail, MapPin, Tag, Star,
  ChevronLeft, ChevronRight, ChevronDown, Loader2, Trash2,
  MessageSquare, Clock, X, Globe,
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
const dtFull = (v?: string) => { try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contatado', cls: 'bg-indigo-100 text-indigo-700' },
  replied: { label: 'Respondeu', cls: 'bg-emerald-100 text-emerald-700' },
  negotiating: { label: 'Negociando', cls: 'bg-amber-100 text-amber-800' },
  converted: { label: 'Convertido', cls: 'bg-emerald-100 text-emerald-700' },
  lost: { label: 'Perdido', cls: 'bg-red-100 text-red-700' },
  inactive: { label: 'Inativo', cls: 'bg-gray-100 text-gray-600' },
}

const SOURCE_MAP: Record<string, string> = {
  google_places: 'Google Places',
  manual: 'Manual',
  import: 'Importado',
  referral: 'Indicacao',
  website: 'Website',
}

interface Client {
  id: string; name: string; phone?: string; email?: string
  status: string; source: string; tags?: string[]; notes?: string
  city?: string; state?: string; address?: string
  lead_score?: number; created_at?: string; updated_at?: string
  google_rating?: number; google_reviews_count?: number
  website?: string; google_maps_uri?: string; category?: string
}

/* ══════════════════════════════════════════════
   LEADS PAGE
   ══════════════════════════════════════════════ */
export function LeadsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const limit = 30

  const fetchClients = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (statusFilter) q.set('status', statusFilter)
    if (sourceFilter) q.set('source', sourceFilter)
    fetch(`/api/clients?${q}`, { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setClients(d.clients || d.items || (Array.isArray(d) ? d : []))
        setTotal(d.total || 0)
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [page, search, statusFilter, sourceFilter])

  useEffect(() => { fetchClients() }, [fetchClients])

  async function updateStatus(clientId: string, newStatus: string) {
    setUpdatingStatus(clientId)
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ status: newStatus }),
      })
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c))
    } catch {}
    setUpdatingStatus(null)
  }

  async function deleteClient(clientId: string) {
    try {
      await fetch(`/api/clients/${clientId}`, { method: 'DELETE', headers: getHeaders() })
      setClients(prev => prev.filter(c => c.id !== clientId))
      setTotal(t => t - 1)
      setExpanded(null)
    } catch {}
  }

  const hasFilters = statusFilter || sourceFilter
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Leads / Clientes</h2>
        <span className="text-xs text-muted bg-gray-100 px-2.5 py-1 rounded-lg font-semibold">{total} registros</span>
      </div>

        {/* ── Search + Filters ── */}
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar por nome, telefone ou email..."
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 placeholder:text-gray-300" />
            </div>
            {/* Filters */}
            <div className="flex gap-2">
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                className="px-3 py-2.5 border border-border rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-600">
                <option value="">Status</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
                className="px-3 py-2.5 border border-border rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-600">
                <option value="">Origem</option>
                {Object.entries(SOURCE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {hasFilters && (
                <button onClick={() => { setStatusFilter(''); setSourceFilter(''); setPage(1) }}
                  className="px-2.5 py-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl skeleton" />
          ))}</div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
              <Users size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">Nenhum lead encontrado</p>
            <p className="text-xs text-muted mt-1">
              {hasFilters ? 'Tente remover os filtros' : 'Use a busca de leads para capturar novos'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Contato</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Origem</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Data</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => {
                  const st = STATUS_MAP[c.status] || { label: c.status || '?', cls: 'bg-gray-100 text-gray-600' }
                  const isExpanded = expanded === c.id
                  return (
                    <tr key={c.id}
                      onClick={() => setExpanded(isExpanded ? null : c.id)}
                      className={`border-b border-border last:border-0 cursor-pointer transition ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 truncate max-w-[200px]">{c.name || '—'}</p>
                        {c.city && <p className="text-[10px] text-muted mt-0.5">{c.city}{c.state ? `, ${c.state}` : ''}</p>}
                        {/* Mobile contact fallback */}
                        <p className="text-[10px] text-muted sm:hidden mt-0.5">{c.phone || c.email || ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {c.phone && <p className="text-xs text-gray-600 font-mono">{c.phone}</p>}
                        {c.email && <p className="text-[10px] text-muted truncate max-w-[160px]">{c.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[10px] text-muted">{SOURCE_MAP[c.source] || c.source || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-[10px] text-muted">{dt(c.created_at)}</span>
                      </td>
                      <td className="px-2 py-3">
                        <ChevronDown size={14} className={`text-gray-400 transition ${isExpanded ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Expanded detail */}
            {expanded && (() => {
              const c = clients.find(x => x.id === expanded)
              if (!c) return null
              return (
                <div className="border-t border-border bg-gray-50/60 px-5 py-4 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="font-bold text-gray-900">{c.name}</h3>
                      {c.category && <p className="text-xs text-muted capitalize">{c.category.replace(/_/g, ' ')}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.google_rating && c.google_rating > 0 && (
                        <span className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg text-xs font-bold text-amber-700">
                          <Star size={11} className="fill-amber-500 text-amber-500" /> {c.google_rating.toFixed(1)}
                          {c.google_reviews_count ? <span className="text-[10px] text-amber-600/60">({c.google_reviews_count})</span> : null}
                        </span>
                      )}
                      {c.lead_score != null && c.lead_score > 0 && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">Score: {c.lead_score}</span>
                      )}
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {c.phone && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Phone size={12} className="text-muted shrink-0" />
                        <span className="font-mono">{c.phone}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Mail size={12} className="text-muted shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <MapPin size={12} className="text-muted shrink-0" />
                        <span className="truncate">{c.address}{c.city ? `, ${c.city}` : ''}</span>
                      </div>
                    )}
                    {c.created_at && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Clock size={12} className="text-muted shrink-0" />
                        <span>{dtFull(c.created_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {c.tags && c.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Tag size={11} className="text-muted" />
                      {c.tags.map((t, i) => (
                        <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {c.notes && (
                    <p className="text-xs text-gray-500 bg-white border border-border rounded-lg px-3 py-2">{c.notes}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {/* Status change */}
                    <select value={c.status}
                      onChange={e => updateStatus(c.id, e.target.value)}
                      disabled={updatingStatus === c.id}
                      className="px-2.5 py-1.5 border border-border rounded-lg text-[11px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>

                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition">
                        <MessageSquare size={11} /> WhatsApp
                      </a>
                    )}
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition">
                        <Globe size={11} /> Site
                      </a>
                    )}
                    {c.google_maps_uri && (
                      <a href={c.google_maps_uri} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition">
                        <MapPin size={11} /> Maps
                      </a>
                    )}
                    <div className="flex-1" />
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${c.name}"?`)) deleteClient(c.id) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-500 text-[11px] font-semibold hover:bg-red-50 transition">
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-muted px-3">
              {page} de {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
    </div>
  )
}
