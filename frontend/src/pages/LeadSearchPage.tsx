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

  // ── Standard search ──
  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!query.trim() || !location.trim()) return
    setLoading(true); setError(''); setSearched(true)
    try {
      const body: Record<string, any> = { query: query.trim(), location: location.trim(), maxResults, executeAutomation: automate }
      if (radius && Number(radius) > 0) body.radius = Number(radius) * 1000
      const r = await fetch('/api/leads/search', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const resultLeads = d.leads || []
      const resultStats = { total: d.total || 0, created: d.persisted?.created || 0, skipped: d.persisted?.skipped || 0, automationQueued: d.automation?.queued_jobs || 0 }
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
      let newFoundCount = 0
      setLeads(prev => {
        const ids = new Set(prev.map(l => l.id))
        const newOnes = radarLeads.filter(l => !ids.has(l.id))
        newFoundCount = newOnes.length
        setRadarCount(c => c + newOnes.length)
        return [...prev, ...newOnes]
      })

      // Update stats in real-time
      setStats(prev => prev ? {
        ...prev,
        total: prev.total + newFoundCount,
      } : { total: radarLeads.length, created: 0, skipped: 0, automationQueued: 0 })

      // Auto-capture: persist each new lead individually via capture-manual
      if (autoCapture && radarLeads.length > 0) {
        let capturedThisRound = 0
        for (const lead of radarLeads) {
          if (lead.captureStatus === 'captured') continue
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
            if (cd.success && cd.persisted?.created > 0) {
              capturedThisRound++
              setCapturedLive(c => c + 1)
            }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Busca de Leads</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {leads.length > 0 ? `${leads.length} encontrados · ${newCount} novos` : 'Google Maps + captacao automatica'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prospecting && (
            <span className="flex items-center gap-1.5 text-xs bg-violet-500 text-white font-bold px-3 py-1.5 rounded-xl animate-pulse shadow-lg shadow-violet-200">
              <Loader2 size={12} className="animate-spin" /> Prospectando...
            </span>
          )}
          {autoCapture && capturedLive > 0 && (
            <span className="flex items-center gap-1.5 text-xs bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-200 animate-pulse">
              <Zap size={12} /> {capturedLive} captados
            </span>
          )}
          {radarCount > 0 && !prospecting && (
            <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-lg">+{radarCount} radar</span>
          )}
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Segmento</label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="pizzaria, hortifruti..." required autoFocus
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Cidade</label>
              <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Sao Paulo, BH..." required
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
              </div>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="w-full sm:w-auto whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
              </button>
            </div>
          </div>
        </div>

        {/* Panfleteiro bar */}
        <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition">
              <Filter size={11} /> Avancado {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <span className="text-gray-300">|</span>
            {/* Panfleteiro toggle */}
            <button type="button" onClick={() => setPanfleteiro(!panfleteiro)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${panfleteiro ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              <Crosshair size={11} /> Panfleteiro
            </button>
            {panfleteiro && (
              <button type="button" onClick={() => setAutoCapture(!autoCapture)}
                className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg transition ${autoCapture ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {autoCapture ? <><Zap size={10} /> Auto-captura ON</> : <><Pause size={10} /> Auto-captura OFF</>}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400">{maxResults} res.</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <button type="button" onClick={() => setAutomate(!automate)}
                className={`relative w-9 h-5 rounded-full transition shrink-0 ${automate ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${automate ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-[11px] font-medium text-gray-500">Automacao</span>
            </label>
          </div>
        </div>

        {showAdvanced && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase mb-1 block">Max. resultados</label>
              <select value={maxResults} onChange={e => setMaxResults(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                {[10, 20, 30, 50, 80, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase mb-1 block">Raio (km)</label>
              <input type="number" value={radius} onChange={e => setRadius(e.target.value)} placeholder="auto" min={1} max={50}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
            </div>
            <div className="flex items-end">
              <p className="text-[10px] text-gray-400 leading-relaxed">Vazio = Google decide automaticamente</p>
            </div>
          </div>
        )}

        {error && <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium">{error}</div>}
      </form>

      {/* Stats */}
      {(leads.length > 0 || stats) && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { v: leads.length, l: 'Encontrados', c: 'text-gray-900', bg: 'bg-white border-gray-100' },
            { v: newCount, l: 'Novos', c: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
            { v: capturedCount, l: 'Existentes', c: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
            { v: capturedLive + (stats?.automationQueued || 0), l: 'Captados', c: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          ].map(s => (
            <div key={s.l} className={`border rounded-xl p-2.5 text-center ${s.bg}`}>
              <p className={`text-xl font-extrabold ${s.c}`}>{s.v}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && !loading && leads.length > 0 && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
                <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}><MapIcon size={14} /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}><List size={14} /></button>
              </div>
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                {([['all', `Todos (${leads.length})`], ['new', `Novos (${newCount})`], ['captured', `Existentes (${capturedCount})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${statusFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{l}</button>
                ))}
              </div>
              {radarLoading && <Loader2 size={14} className="text-violet-500 animate-spin" />}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Filtrar..."
                className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-44" />
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
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Users size={24} className="text-gray-300 mb-2" /><p className="text-sm text-gray-500">Nenhum resultado</p>
        </div>
      )}

      {!searched && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl grid place-items-center mb-4 shadow-sm"><Sparkles size={28} className="text-blue-500" /></div>
          <h2 className="text-base font-bold text-gray-900 mb-1">Encontre novos clientes</h2>
          <p className="text-xs text-gray-400 max-w-sm leading-relaxed">Busque por segmento e cidade. Ative o modo <strong>Panfleteiro</strong> para buscar automaticamente ao mover o mapa.</p>
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
      const brandSecondary = getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim() || '#8b5cf6'
      L.circleMarker(pos, {
        radius: isNew ? 8 : 6,
        color: isNew ? '#10b981' : brandSecondary,
        fillColor: isNew ? '#34d399' : brandSecondary,
        fillOpacity: isNew ? 0.9 : 0.7,
        weight: isNew ? 3 : 2,
      })
        .addTo(map).bindPopup(
          `<div style="min-width:140px"><b style="font-size:12px">${l.name}</b>` +
          (l.rating > 0 ? `<br><span style="font-size:10px;color:#d97706">★ ${l.rating.toFixed(1)}</span>` : '') +
          (l.phone ? `<br><span style="font-size:10px">${l.phone}</span>` : '') +
          `<br><span style="font-size:9px;font-weight:600;color:${isNew ? '#10b981' : '#6b7280'}">${isNew ? '● NOVO' : '● EXISTENTE'}</span></div>`
        )
    })

    if (!savedPos && bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })

    // Panfleteiro: crosshair + radius circle + moveend search
    let radiusCircle: L.Circle | null = null
    if (panfleteiro) {
      // Crosshair
      const crosshair = L.DomUtil.create('div', '', map.getContainer())
      crosshair.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:999"><div style="width:28px;height:28px;border:3px solid #7c3aed;border-radius:50%;opacity:0.6;box-shadow:0 0 12px rgba(124,58,237,0.3)"></div><div style="position:absolute;top:50%;left:50%;width:4px;height:4px;background:#7c3aed;border-radius:50%;transform:translate(-50%,-50%)"></div></div>'

      // Radius heatmap circle (updates on move)
      const searchRadiusM = (Number(localStorage.getItem('leadcapture:search-state') ? JSON.parse(localStorage.getItem('leadcapture:search-state')!).radius : 3) || 3) * 1000
      radiusCircle = L.circle(map.getCenter(), {
        radius: searchRadiusM,
        color: '#7c3aed',
        fillColor: '#7c3aed',
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      <div ref={mapRef} className="w-full" style={{ height: '420px' }} />
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/80 flex items-center gap-4 text-[10px] text-gray-400 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Novos</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Existentes</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Historico</span>
        {panfleteiro && <span className="ml-auto text-violet-600 font-bold">Panfleteiro ativo — mova o mapa para buscar</span>}
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
