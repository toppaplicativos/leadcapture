import { useState, useEffect, useCallback } from 'react'
import {
  Search, Users, Phone, Mail, MapPin, Tag, Star,
  ChevronLeft, ChevronRight, Loader2, Trash2,
  MessageSquare, Clock, X, Globe, Send, ExternalLink,
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

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  contacted: { label: 'Contatado', cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  replied: { label: 'Respondeu', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  negotiating: { label: 'Negociando', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  converted: { label: 'Convertido', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  lost: { label: 'Perdido', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  inactive: { label: 'Inativo', cls: 'bg-gray-100 text-gray-600' },
}
const SOURCE_MAP: Record<string, string> = {
  google_places: 'Google Places', manual: 'Manual', import: 'Importado', referral: 'Indicacao', website: 'Website',
}

interface Client {
  id: string; name: string; phone?: string; email?: string
  status: string; source: string; tags?: string[] | string; notes?: string
  city?: string; state?: string; address?: string; trade_name?: string
  lead_score?: number; created_at?: string; updated_at?: string
  google_rating?: number; google_reviews_count?: number
  website?: string; google_maps_uri?: string; category?: string; subcategory?: string
  phone_secondary?: string; business_status?: string
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
  const [selectedLead, setSelectedLead] = useState<Client | null>(null)

  const limit = 30

  const fetchClients = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) q.set('search', search)
    if (statusFilter) q.set('status', statusFilter)
    if (sourceFilter) q.set('source', sourceFilter)
    Promise.all([
      fetch(`/api/customers?${q}`, { headers: getHeaders() }).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch(`/api/clients?${q}`, { headers: getHeaders() }).then(r => r.json()).catch(() => ({ clients: [] })),
    ]).then(([cust, cli]) => {
      const customers = (cust.customers || []).map((c: any) => ({ ...c, source: c.source || 'google_places' }))
      const manualClients = (cli.clients || []).map((c: any) => ({ ...c, source: c.source || 'manual' }))
      const all = [...customers, ...manualClients]
      const seen = new Set<string>()
      const deduped = all.filter(c => {
        const key = (c.phone || c.id || '').replace(/\D/g, '')
        if (seen.has(key) && key) return false
        if (key) seen.add(key)
        return true
      })
      setClients(deduped)
      const custTotal = Number(cust.total || cust.customers?.length || 0)
      const cliTotal = Number(cli.total || cli.clients?.length || 0)
      setTotal(custTotal + cliTotal)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [page, search, statusFilter, sourceFilter])

  useEffect(() => { fetchClients() }, [fetchClients])

  const hasFilters = statusFilter || sourceFilter
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Leads</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{total} registros</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por nome, telefone ou email..."
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-600">
              <option value="">Status</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 text-gray-600">
              <option value="">Origem</option>
              {Object.entries(SOURCE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {hasFilters && (
              <button onClick={() => { setStatusFilter(''); setSourceFilter(''); setPage(1) }}
                className="px-2.5 py-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition"><X size={14} /></button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl skeleton" />
        ))}</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3"><Users size={24} className="text-gray-300" /></div>
          <p className="text-sm font-medium text-gray-600">Nenhum lead encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lead</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Contato</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Origem</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const st = STATUS_MAP[c.status] || { label: c.status || '?', cls: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={c.id} onClick={() => setSelectedLead(c)}
                    className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/30 transition">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 truncate max-w-[200px]">{c.name || '—'}</p>
                      {c.city && <p className="text-[10px] text-gray-400 mt-0.5">{c.city}{c.state ? `, ${c.state}` : ''}</p>}
                      <p className="text-[10px] text-gray-400 sm:hidden mt-0.5">{c.phone || c.email || ''}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {c.phone && <p className="text-xs text-gray-600 font-mono">{c.phone}</p>}
                      {c.email && <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{c.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[10px] text-gray-400">{SOURCE_MAP[c.source] || c.source || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
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
          <span className="text-xs text-gray-400 px-3">{page} de {totalPages}</span>
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
            setClients(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
            setSelectedLead({ ...selectedLead, ...updated })
          }}
          onDeleted={() => { setSelectedLead(null); fetchClients() }}
        />
      )}
    </div>
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
  const [status, setStatus] = useState(lead.status)
  const [notes, setNotes] = useState(lead.notes || '')
  const [saving, setSaving] = useState(false)

  async function saveStatus(newStatus: string) {
    setStatus(newStatus)
    try {
      await fetch(`/api/customers/${lead.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: newStatus }) }).catch(() => {})
      await fetch(`/api/clients/${lead.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: newStatus }) }).catch(() => {})
      onUpdated({ id: lead.id, status: newStatus })
    } catch {}
  }

  async function saveNotes() {
    setSaving(true)
    try {
      await fetch(`/api/clients/${lead.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ notes }) }).catch(() => {})
      onUpdated({ id: lead.id, notes })
    } catch {}
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Remover "${lead.name}"?`)) return
    try {
      await fetch(`/api/clients/${lead.id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
      await fetch(`/api/customers/${lead.id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
      onDeleted()
    } catch {}
  }

  const st = STATUS_MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  const tags = Array.isArray(lead.tags) ? lead.tags : typeof lead.tags === 'string' ? lead.tags.split(',').filter(Boolean) : []
  const phone = (lead.phone || '').replace(/\D/g, '')

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-base text-gray-900 truncate">{lead.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                <span className="text-[10px] text-gray-400">{SOURCE_MAP[lead.source] || lead.source}</span>
                {Number(lead.google_rating) > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700">
                    <Star size={10} className="fill-amber-500 text-amber-500" /> {Number(lead.google_rating).toFixed(1)}
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
              className={`px-3.5 py-2 text-xs font-semibold transition ${
                tab === k ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-400'
              }`}>{l}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'info' && (<>
            {/* Contact */}
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
              {lead.phone_secondary && (
                <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
                  <Phone size={14} className="text-gray-400" />
                  <span className="text-sm font-mono text-gray-600">{lead.phone_secondary}</span>
                  <span className="text-[9px] text-gray-400">secundario</span>
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
                  <span className="text-sm text-gray-600">{lead.address}{lead.city ? `, ${lead.city}` : ''}{lead.state ? ` - ${lead.state}` : ''}</span>
                </div>
              )}
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2">
              {lead.category && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Categoria</p>
                  <p className="text-xs font-semibold text-gray-700 capitalize mt-0.5">{lead.category.replace(/_/g, ' ')}</p>
                </div>
              )}
              {lead.trade_name && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Nome Fantasia</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{lead.trade_name}</p>
                </div>
              )}
              {lead.lead_score != null && lead.lead_score > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-indigo-400 uppercase">Score</p>
                  <p className="text-lg font-extrabold text-indigo-600 mt-0.5">{lead.lead_score}</p>
                </div>
              )}
              {lead.google_reviews_count != null && lead.google_reviews_count > 0 && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-amber-500 uppercase">Avaliacoes Google</p>
                  <p className="text-xs font-semibold text-amber-700 mt-0.5">{lead.google_reviews_count} reviews</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[9px] font-bold text-gray-400 uppercase">Cadastrado em</p>
                <p className="text-xs font-semibold text-gray-700 mt-0.5">{dtFull(lead.created_at)}</p>
              </div>
              {lead.business_status && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Status Negocio</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{lead.business_status}</p>
                </div>
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t: string, i: number) => (
                    <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{t.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
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
            {/* Status change */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Alterar Status</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <button key={k} onClick={() => saveStatus(k)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      status === k ? v.cls + ' shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>{v.label}</button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Observacoes</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Adicione observacoes sobre este lead..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              <button onClick={saveNotes} disabled={saving}
                className="mt-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
                {saving ? 'Salvando...' : 'Salvar Observacoes'}
              </button>
            </div>

            {/* Quick communication */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Comunicacao rapida</p>
              <div className="grid grid-cols-2 gap-2">
                {phone && (
                  <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition shadow-sm">
                    <MessageSquare size={16} /> WhatsApp
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition shadow-sm">
                    <Mail size={16} /> Email
                  </a>
                )}
                {phone && (
                  <a href={`tel:+${phone}`}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition">
                    <Phone size={16} /> Ligar
                  </a>
                )}
                {phone && (
                  <a href={`sms:+${phone}`}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition">
                    <Send size={16} /> SMS
                  </a>
                )}
              </div>
            </div>

            {/* Delete */}
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
