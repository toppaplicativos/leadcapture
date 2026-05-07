import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import {
  Search, MapPin, Loader2, Star, Phone, Globe,
  Sparkles, ChevronDown, ChevronUp,
  Building2, Navigation, Users, Filter, Map as MapIcon, List,
  Crosshair, Zap, Pause, Play,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

/* ── Persistence ── */
const PERSIST_KEY = 'leadcapture:search-state'
const MAP_POS_KEY = 'leadcapture:map-position'
function loadPersisted() { try { return JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}') } catch { return {} } }
function savePersisted(d: Record<string, any>) { try { localStorage.setItem(PERSIST_KEY, JSON.stringify(d)) } catch {} }
function loadMapPos() { try { return JSON.parse(localStorage.getItem(MAP_POS_KEY) || 'null') } catch { return null } }
function saveMapPos(lat: number, lng: number, zoom: number) { try { localStorage.setItem(MAP_POS_KEY, JSON.stringify({ lat, lng, zoom, ts: Date.now() })) } catch {} }

/* ══════════════════════════════════════════════
   LEAD SEARCH PAGE — with Panfleteiro Mode
   ══════════════════════════════════════════════ */
export function LeadSearchPage() {
  const persisted = loadPersisted()
  const savedPos = loadMapPos()

  // Form
  const [query, setQuery] = useState(persisted.query || '')
  const [location, setLocation] = useState(persisted.location || '')
  const [maxResults, setMaxResults] = useState(persisted.maxResults || 20)
  const [automate, setAutomate] = useState(persisted.automate || false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [radius, setRadius] = useState(persisted.radius || '')

  // Results
  const [leads, setLeads] = useState<Lead[]>(persisted.leads || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{ total: number; created: number; skipped: number; automationQueued: number } | null>(persisted.stats || null)
  const [searched, setSearched] = useState(!!(persisted.leads?.length))

  // Filter + View
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'captured'>('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map')
  const [capturedPoints, setCapturedPoints] = useState<any[]>([])

  // Panfleteiro mode
  const [panfleteiro, setPanfleteiro] = useState(false)
  const [autoCapture, setAutoCapture] = useState(false)
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarCount, setRadarCount] = useState(0)
  const [capturedLive, setCapturedLive] = useState(0)
  const [prospecting, setProspecting] = useState(false)

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const moveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const leadsRef = useRef<Lead[]>(persisted.leads || [])

  useEffect(() => {
    leadsRef.current = leads
  }, [leads])

  // ── Standard search ──
  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!query.trim() || !location.trim()) return
    setLoading(true); setError(''); setSearched(true)
    setRadarCount(0); setCapturedLive(0); setStatusFilter('all')
    try {
      const body: Record<string, any> = { query: query.trim(), location: location.trim(), maxResults, executeAutomation: automate }
      if (radius && Number(radius) > 0) body.radius = Number(radius) * 1000
      const r = await fetch('/api/leads/search', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const resultLeads = d.leads || []
      const resultStats = { total: d.total || 0, created: d.persisted?.created || 0, skipped: d.persisted?.skipped || 0, automationQueued: d.automation?.queued_jobs || 0 }
      leadsRef.current = resultLeads
      setLeads(resultLeads)
      setCapturedPoints(d.capturedPoints || [])
      setStats(resultStats)
      savePersisted({ query: query.trim(), location: location.trim(), maxResults, automate, radius, leads: resultLeads, stats: resultStats })
      setViewMode('map')
    } catch (err: any) { setError(err.message || 'Erro na busca') }
    finally { setLoading(false) }
  }

  // ── Radar search (panfleteiro — by coordinates) ──
  const radarSearch = useCallback(async (lat: number, lng: number) => {
    if (!query.trim()) return
    setRadarLoading(true)
    setProspecting(true)
    try {
      const searchRadius = Number(radius || 3) * 1000
      const body = { query: query.trim(), latitude: lat, longitude: lng, radius: searchRadius, maxResults: Math.min(maxResults, 40) }
      const r = await fetch('/api/leads/radar-search', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      const radarLeads: Lead[] = d.leads || []

      // Merge with existing (deduplicate by id)
      const existingIds = new Set(leadsRef.current.map(l => l.id))
      const newOnes = radarLeads.filter(l => !existingIds.has(l.id))
      setLeads(prev => {
        const ids = new Set(prev.map(l => l.id))
        const nextNewOnes = newOnes.filter(l => !ids.has(l.id))
        const next = [...prev, ...nextNewOnes]
        leadsRef.current = next
        return next
      })
      setRadarCount(c => c + newOnes.length)

      // Update stats in real-time
      setStats(prev => prev ? {
        ...prev,
        total: prev.total + newOnes.length,
      } : { total: radarLeads.length, created: 0, skipped: 0, automationQueued: 0 })

      // Auto-capture: persist each new lead individually via capture-manual
      const captureCandidates = newOnes.filter(lead => lead.captureStatus !== 'captured')
      if (autoCapture && captureCandidates.length > 0) {
        let capturedThisRound = 0
        for (const lead of captureCandidates) {
          try {
            const captureBody = {
              lead: {
                placeId: lead.id, name: lead.name, phone: lead.phone,
                address: lead.address, rating: lead.rating, reviews: lead.reviews,
                category: lead.category, website: lead.website,
                googleMapsUri: lead.googleMapsUri, businessStatus: lead.businessStatus,
                location: lead.location,
              },
              query: query.trim(),
              location: `${lat.toFixed(4)},${lng.toFixed(4)}`,
              executeAutomation: automate,
            }
            const cr = await fetch('/api/leads/capture-manual', { method: 'POST', headers: getHeaders(), body: JSON.stringify(captureBody) })
            const cd = await cr.json()
            const created = cd.success && (cd.capture?.status === 'created' || Number(cd.capture?.persisted?.created || 0) > 0)
            const captured = cd.success && ['created', 'existing', 'captured'].includes(String(cd.capture?.status || ''))
            if (captured) {
              setLeads(prev => {
                const next = prev.map(l => l.id === lead.id ? { ...l, captureStatus: 'captured' as const } : l)
                leadsRef.current = next
                return next
              })
            }
            if (created) {
              capturedThisRound++
              setCapturedLive(c => c + 1)
              // Update pin status immediately — new → captured
            }
            if (Array.isArray(cd.capturedPoints)) setCapturedPoints(cd.capturedPoints)
          } catch {}
        }
        if (capturedThisRound > 0) {
          setStats(prev => prev ? { ...prev, created: prev.created + capturedThisRound } : prev)
        }
      }

      // Save map position
      const map = mapInstance.current
      if (map) saveMapPos(lat, lng, map.getZoom())
    } catch {}
    setRadarLoading(false)
    setTimeout(() => setProspecting(false), 500)
  }, [query, radius, maxResults, autoCapture, automate])

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
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[28px] font-bold text-gray-900 tracking-[-0.025em] leading-tight">Busca de leads</h2>
          <p className="text-[13px] font-medium text-gray-500 mt-1 tabular-nums">
            {leads.length > 0
              ? <>{leads.length} encontrados <span className="text-gray-300">·</span> <span className="text-emerald-700">{newCount} novos</span></>
              : 'Encontre clientes com Google Maps'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {prospecting && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-gray-900 text-white px-2.5 py-1.5 rounded-full">
              <Loader2 size={11} className="animate-spin" /> Prospectando
            </span>
          )}
          {autoCapture && capturedLive > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-600 text-white px-2.5 py-1.5 rounded-full tabular-nums">
              <Zap size={11} strokeWidth={2.25} /> {capturedLive} captados
            </span>
          )}
          {radarCount > 0 && !prospecting && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 px-2.5 py-1.5 rounded-full tabular-nums">
              +{radarCount} radar
            </span>
          )}
        </div>
      </header>

      {/* ── Search Form ── */}
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-border-light overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Segmento</label>
              <div className="relative">
                <Building2 size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="pizzaria, hortifruti…"
                  required
                  autoFocus
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Cidade</label>
              <div className="relative">
                <MapPin size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="São Paulo, BH…"
                  required
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white font-semibold text-[14px] tracking-tight hover:bg-gray-800 disabled:opacity-40 active:scale-[0.99] transition"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} strokeWidth={2.25} />}
            {loading ? 'Buscando…' : 'Buscar leads'}
          </button>
        </div>

        {/* Options bar */}
        <div className="border-t border-border-light px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setPanfleteiro(!panfleteiro)}
              aria-pressed={panfleteiro}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                panfleteiro
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Crosshair size={11} strokeWidth={2.25} /> Panfleteiro
            </button>
            {panfleteiro && (
              <button
                type="button"
                onClick={() => setAutoCapture(!autoCapture)}
                aria-pressed={autoCapture}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                  autoCapture
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {autoCapture ? <Zap size={11} strokeWidth={2.25} /> : <Pause size={11} strokeWidth={2.25} />}
                Auto-captura
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold text-gray-700 hover:bg-gray-100 transition"
            >
              <Filter size={11} strokeWidth={2.25} /> Avançado
              {showAdvanced ? <ChevronUp size={11} strokeWidth={2.25} /> : <ChevronDown size={11} strokeWidth={2.25} />}
            </button>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className="text-[11px] font-semibold text-gray-700">Automação</span>
            <button
              type="button"
              onClick={() => setAutomate(!automate)}
              role="switch"
              aria-checked={automate}
              className={`relative w-9 h-5 rounded-full transition shrink-0 ${automate ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${automate ? 'translate-x-4' : ''}`} />
            </button>
          </label>
        </div>

        {showAdvanced && (
          <div className="border-t border-border-light px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50/60">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Máx. resultados</label>
              <select
                value={maxResults}
                onChange={e => setMaxResults(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
              >
                {[10, 20, 30, 50, 80, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Raio (km)</label>
              <input
                type="number"
                value={radius}
                onChange={e => setRadius(e.target.value)}
                placeholder="auto"
                min={1}
                max={50}
                className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
              />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-gray-500 leading-relaxed">Vazio = Google decide automaticamente.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[13px] font-medium">
            {error}
          </div>
        )}
      </form>

      {/* ── Stats ── */}
      {(leads.length > 0 || stats) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { v: leads.length, l: 'Encontrados', accent: 'text-gray-900' },
            { v: newCount, l: 'Novos', accent: 'text-emerald-700' },
            { v: capturedCount, l: 'Existentes', accent: 'text-amber-700' },
            { v: capturedLive + (stats?.automationQueued || 0), l: 'Captados', accent: 'text-gray-900' },
          ] as const).map(s => (
            <div key={s.l} className="bg-white border border-border-light rounded-2xl p-3.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{s.l}</p>
              <p className={`text-[24px] font-bold tracking-tight tabular-nums leading-none mt-1.5 ${s.accent}`}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {searched && !loading && leads.length > 0 && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="inline-flex bg-gray-100 p-0.5 rounded-full">
                <button
                  onClick={() => setViewMode('map')}
                  aria-pressed={viewMode === 'map'}
                  aria-label="Mapa"
                  className={`w-8 h-8 grid place-items-center rounded-full transition ${
                    viewMode === 'map' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <MapIcon size={14} strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  aria-label="Lista"
                  className={`w-8 h-8 grid place-items-center rounded-full transition ${
                    viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <List size={14} strokeWidth={1.75} />
                </button>
              </div>

              {/* Status filter */}
              <div className="inline-flex bg-gray-100 p-0.5 rounded-full">
                {([
                  ['all', 'Todos', leads.length],
                  ['new', 'Novos', newCount],
                  ['captured', 'Existentes', capturedCount],
                ] as const).map(([k, l, c]) => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    aria-pressed={statusFilter === k}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                      statusFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {l}
                    <span className={`tabular-nums ${statusFilter === k ? 'text-gray-400' : 'text-gray-400'}`}>{c}</span>
                  </button>
                ))}
              </div>
              {radarLoading && <Loader2 size={14} className="text-gray-400 animate-spin" />}
            </div>

            <div className="relative">
              <Search size={13} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Filtrar resultados"
                className="h-9 pl-8 pr-3 rounded-full border-0 bg-gray-100 text-[12px] font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition w-48"
              />
            </div>
          </div>

          {/* Map */}
          {viewMode === 'map' && (
            <PanfleteiroMap
              leads={filtered}
              capturedPoints={capturedPoints}
              mapRef={mapRef}
              mapInstance={mapInstance}
              panfleteiro={panfleteiro}
              radarSearch={radarSearch}
              moveTimer={moveTimer}
              savedPos={savedPos}
            />
          )}

          {/* List */}
          {viewMode === 'list' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filtered.map(lead => <LeadCard key={lead.id} lead={lead} />)}
            </div>
          )}
        </div>
      )}

      {searched && !loading && leads.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
            <Users size={22} className="text-gray-400" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-semibold text-gray-900">Nenhum resultado</p>
          <p className="text-[12px] text-gray-500 mt-0.5">Tente outro segmento ou cidade</p>
        </div>
      )}

      {!searched && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 grid place-items-center mb-4">
            <Sparkles size={22} className="text-white" strokeWidth={1.75} />
          </div>
          <h2 className="text-[18px] font-bold text-gray-900 tracking-tight mb-1.5">Encontre novos clientes</h2>
          <p className="text-[13px] text-gray-500 max-w-sm leading-relaxed">
            Busque por segmento e cidade. Ative o modo <span className="font-semibold text-gray-700">Panfleteiro</span> para buscar automaticamente ao mover o mapa.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Panfleteiro Map ── */
function PanfleteiroMap({ leads, capturedPoints, mapRef, mapInstance, panfleteiro, radarSearch, moveTimer, savedPos }: {
  leads: Lead[]; capturedPoints: any[]
  mapRef: React.RefObject<HTMLDivElement | null>; mapInstance: React.MutableRefObject<L.Map | null>
  panfleteiro: boolean; radarSearch: (lat: number, lng: number) => void
  moveTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>
  savedPos: { lat: number; lng: number; zoom: number } | null
}) {
  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }

    // Determine initial center
    const allPts: [number, number][] = []
    leads.forEach(l => { if (l.location?.latitude) allPts.push([l.location.latitude, l.location.longitude]) })
    capturedPoints.forEach(p => { if (p.latitude) allPts.push([p.latitude, p.longitude]) })

    let center: [number, number] = savedPos ? [savedPos.lat, savedPos.lng] : allPts.length > 0
      ? allPts.reduce((acc, pt) => [acc[0] + pt[0] / allPts.length, acc[1] + pt[1] / allPts.length], [0, 0]) as [number, number]
      : [-19.92, -43.94] // BH default
    let zoom = savedPos?.zoom || 13

    const map = L.map(mapRef.current, { zoomControl: false }).setView(center, zoom)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 18 }).addTo(map)

    // Captured history (gray)
    capturedPoints.forEach(p => {
      if (!p.latitude) return
      if (leads.some(l => l.location?.latitude === p.latitude && l.location?.longitude === p.longitude)) return
      L.circleMarker([p.latitude, p.longitude], { radius: 3, color: '#9ca3af', fillColor: '#d1d5db', fillOpacity: 0.5, weight: 1 })
        .addTo(map).bindPopup(`<b style="font-size:11px">${p.name}</b>`)
    })

    // Current results
    const bounds: [number, number][] = []
    leads.forEach(l => {
      if (!l.location?.latitude) return
      const pos: [number, number] = [l.location.latitude, l.location.longitude]
      bounds.push(pos)
      const isNew = l.captureStatus === 'new'
      // Get brand color: CSS var (set by AdminShell) or fallback
      const brandSecondary = getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim() || '#933bce'
      L.circleMarker(pos, {
        radius: isNew ? 8 : 6,
        color: isNew ? '#10b981' : brandSecondary,
        fillColor: isNew ? '#34d399' : brandSecondary,
        fillOpacity: isNew ? 0.9 : 0.7,
        weight: isNew ? 3 : 2,
      })
        .addTo(map).bindPopup(
          /* Leaflet popups are HTML strings, not JSX. Inline an SVG star
           * instead of the unicode star char, to keep parity with the rest
           * of the lucide-based UI. Same path used by lucide Star. */
          `<div style="min-width:140px"><b style="font-size:12px">${l.name}</b>` +
          (l.rating > 0 ? `<br><span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#d97706"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>${l.rating.toFixed(1)}</span>` : '') +
          (l.phone ? `<br><span style="font-size:10px">${l.phone}</span>` : '') +
          `<br><span style="display:inline-block;font-size:9px;font-weight:600;color:${isNew ? '#10b981' : '#6b7280'}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:4px;vertical-align:middle"></span>${isNew ? 'NOVO' : 'EXISTENTE'}</span></div>`
        )
    })

    if (!savedPos && bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })

    // Panfleteiro: pulsing radar crosshair + radius circle + moveend search
    let radiusCircle: L.Circle | null = null
    if (panfleteiro) {
      // Animated radar pulse (uses .radar-pulse from index.css — same look
      // as the live PanfleteiroPreview on the landing page).
      const radar = L.DomUtil.create('div', 'panf-radar-overlay', map.getContainer())
      radar.innerHTML = `<div class="radar-pulse"><span></span></div>`
      // Position absolutely at center of map container
      radar.style.position = 'absolute'
      radar.style.top = '50%'
      radar.style.left = '50%'
      radar.style.transform = 'translate(-50%, -50%)'
      radar.style.pointerEvents = 'none'
      radar.style.zIndex = '999'

      // Radius heatmap circle (updates on move)
      const searchRadiusM = (Number(localStorage.getItem('leadcapture:search-state') ? JSON.parse(localStorage.getItem('leadcapture:search-state')!).radius : 3) || 3) * 1000
      radiusCircle = L.circle(map.getCenter(), {
        radius: searchRadiusM,
        color: '#6366f1',
        fillColor: '#6366f1',
        fillOpacity: 0.06,
        weight: 1.5,
        dashArray: '6,4',
        interactive: false,
      }).addTo(map)

      // Move: update circle + trigger search
      map.on('moveend', () => {
        const c = map.getCenter()
        if (radiusCircle) radiusCircle.setLatLng(c)
        clearTimeout(moveTimer.current)
        moveTimer.current = setTimeout(() => {
          saveMapPos(c.lat, c.lng, map.getZoom())
          radarSearch(c.lat, c.lng)
        }, 1200)
      })
    }

    // Save position on any move (even without panfleteiro)
    map.on('moveend', () => {
      const c = map.getCenter()
      saveMapPos(c.lat, c.lng, map.getZoom())
    })

    mapInstance.current = map
    return () => { clearTimeout(moveTimer.current); if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null } }
  }, [leads, capturedPoints, panfleteiro])

  return (
    <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
      <div ref={mapRef} className="w-full" style={{ height: '420px' }} />
      <div className="px-4 py-2.5 border-t border-border-light flex items-center gap-4 text-[11px] text-gray-500 flex-wrap font-medium">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Novos</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand" /> Existentes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Histórico</span>
        {panfleteiro && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-gray-900 font-semibold">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-indigo-500 animate-ping opacity-75" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-indigo-500" />
            </span>
            Panfleteiro ativo · mova o mapa
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Lead Card ── */
function LeadCard({ lead }: { lead: Lead }) {
  const isNew = lead.captureStatus === 'new'
  return (
    <div className={`bg-white border rounded-xl p-3.5 hover:shadow-md transition-shadow ${isNew ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm text-gray-900 truncate">{lead.name}</h4>
            {isNew ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">NOVO</span>
              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">EXISTENTE</span>}
          </div>
          {lead.category && <p className="text-[10px] text-gray-400 capitalize mt-0.5">{lead.category.replace(/_/g, ' ')}</p>}
        </div>
        {lead.rating > 0 && (
          <div className="flex items-center gap-0.5 shrink-0 bg-amber-50 px-2 py-1 rounded-lg">
            <Star size={11} className="text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-amber-700">{lead.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        {lead.phone && <div className="flex items-center gap-2 text-xs text-gray-600"><Phone size={11} className="text-gray-400 shrink-0" /><span className="font-mono">{lead.phone}</span></div>}
        {lead.address && <div className="flex items-start gap-2 text-xs text-gray-600"><MapPin size={11} className="text-gray-400 shrink-0 mt-0.5" /><span className="line-clamp-2">{lead.address}</span></div>}
      </div>
      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
        {lead.phone && <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition"><Phone size={11} /> WhatsApp</a>}
        {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition"><Globe size={11} /> Site</a>}
        {lead.googleMapsUri && <a href={lead.googleMapsUri} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition"><Navigation size={11} /> Maps</a>}
      </div>
    </div>
  )
}
