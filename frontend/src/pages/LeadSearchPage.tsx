import { useState, useEffect, useRef, useCallback, useMemo, FormEvent } from 'react'
import { createPortal } from 'react-dom'

/* Haversine distance em km — usado pra saber se um pin esta dentro do raio
   atual do radar (pra esmaecer pins fora). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
import {
  Search, MapPin, Loader2, Star, Phone, Globe,
  Sparkles, ChevronDown, ChevronUp,
  Building2, Navigation, Users, Filter, Map as MapIcon, List,
  Zap, Pause, Maximize2, Minimize2,
  Smile, UtensilsCrossed, Dumbbell, Scissors, Home, Scale,
  PawPrint, Wrench, Shirt, Pill, Camera, Activity, X, Send, SlidersHorizontal,
} from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { WhatsAppSendModal } from '@/components/WhatsAppSendModal'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PanfleteiroMapMapbox, type PanfleteiroPlace } from '@/components/PanfleteiroMapMapbox'
import { IdeaGeneratorModal } from '@/components/IdeaGeneratorModal'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { ProspectSearchControls } from '@/components/agent/prospect/ProspectSearchControls'
import { LocationPlaceSearch, type SelectedPlace } from '@/components/LocationPlaceSearch'

/* Sugestões de segmento (substituem emojis por lucide icons — regra UI no_emojis_in_ui) */
const SUGGESTIONS: Array<{ icon: typeof Smile; label: string; query: string }> = [
  { icon: Smile, label: 'Dentista', query: 'dentista' },
  { icon: UtensilsCrossed, label: 'Restaurante', query: 'restaurante' },
  { icon: Dumbbell, label: 'Academia', query: 'academia' },
  { icon: Scissors, label: 'Salão', query: 'salão de beleza' },
  { icon: Home, label: 'Imobiliária', query: 'imobiliária' },
  { icon: Scale, label: 'Advogado', query: 'advogado' },
  { icon: PawPrint, label: 'Pet Shop', query: 'pet shop' },
  { icon: Wrench, label: 'Mecânica', query: 'mecânica' },
  { icon: Shirt, label: 'Loja Roupa', query: 'loja de roupas' },
  { icon: Pill, label: 'Farmácia', query: 'farmácia' },
  { icon: Camera, label: 'Fotógrafo', query: 'fotógrafo' },
  { icon: Activity, label: 'Crossfit', query: 'crossfit' },
]

/* Pipeline (legenda de cores do mapa) — espelha statusColor do PanfleteiroMapMapbox */
const PIPELINE: Array<{ label: string; color: string; key: string }> = [
  { label: 'Novo', color: '#ef4444', key: 'new' },
  { label: 'Captado', color: '#3b82f6', key: 'captured' },
  { label: 'Contactado', color: '#eab308', key: 'contacted' },
  { label: 'Avançado', color: '#a855f7', key: 'advanced' },
  { label: 'Ganho', color: '#22c55e', key: 'won' },
]

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

/* ── Persistência por BRAND (resolve vazamento entre operacoes) ──
   Estado é gravado em brand_units.last_search_state via /api/brands/:id/search-state.
   Mantemos fallback para localStorage por compatibilidade na migracao. */
function getActiveBrandId(): string | null {
  return localStorage.getItem('lead-system:active-brand-id') || null
}
const SEARCH_STATE_LS_PREFIX = 'lead-system:search-state:'

function readLocalSearchState(brandId: string): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_LS_PREFIX + brandId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

function writeLocalSearchState(brandId: string, state: Record<string, any>): void {
  try {
    localStorage.setItem(SEARCH_STATE_LS_PREFIX + brandId, JSON.stringify(state))
  } catch { /* quota / private mode */ }
}

async function fetchBrandSearchState(brandId: string): Promise<Record<string, any> | null> {
  /* Preferência: local (instantâneo) mergeado com servidor (fonte de verdade). */
  const local = readLocalSearchState(brandId)
  try {
    const r = await fetch(`/api/brands/${encodeURIComponent(brandId)}/search-state`, { headers: getHeaders() })
    if (!r.ok) return local
    const d = await r.json()
    const remote = d?.state && typeof d.state === 'object' ? d.state : null
    if (!remote) return local
    if (!local) return remote
    /* Mais recente ganha (updated_at). */
    const lt = Date.parse(String(local.updated_at || 0)) || 0
    const rt = Date.parse(String(remote.updated_at || 0)) || 0
    return rt >= lt ? { ...local, ...remote } : { ...remote, ...local }
  } catch { return local }
}

async function persistBrandSearchState(brandId: string, state: Record<string, any>): Promise<void> {
  const payload = { ...state, updated_at: new Date().toISOString() }
  writeLocalSearchState(brandId, payload)
  try {
    await fetch(`/api/brands/${encodeURIComponent(brandId)}/search-state`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ state: payload }),
    })
  } catch { /* nao bloqueia UX — local já salvou */ }
}

/** Coord do place bate com o texto do input (label completo ou short). */
function placeMatchesLocation(place: SelectedPlace | null | undefined, loc: string): boolean {
  if (!place || !loc.trim()) return false
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return false
  const t = loc.trim().toLowerCase()
  const label = (place.label || '').trim().toLowerCase()
  const short = (place.shortLabel || '').trim().toLowerCase()
  if (label && label === t) return true
  if (short && short === t) return true
  if (label && (label.startsWith(t) || t.startsWith(short || label.split(',')[0]))) return true
  // partial: "Betim" inside "Betim, Minas Gerais, Brasil"
  if (short && (label.includes(t) || t.includes(short))) return true
  return false
}

/** Usa coords do place se o texto ainda se refere a ele; senão coords válidos recentes do place. */
function resolvePlaceCoords(
  place: SelectedPlace | null | undefined,
  loc: string,
  explicit?: { latitude?: number; longitude?: number } | null
): { latitude?: number; longitude?: number; label?: string } {
  if (Number.isFinite(Number(explicit?.latitude)) && Number.isFinite(Number(explicit?.longitude))) {
    return {
      latitude: Number(explicit!.latitude),
      longitude: Number(explicit!.longitude),
      label: loc,
    }
  }
  if (place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    // Se o input ainda aponta pro place (ou está vazio/igual), usa coords fixas
    if (!loc.trim() || placeMatchesLocation(place, loc) || place.source === 'search' || place.source === 'restored' || place.source === 'bridge') {
      return {
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.label || loc,
      }
    }
  }
  return {}
}

/* ══════════════════════════════════════════════
   LEAD SEARCH PAGE — with Panfleteiro Mode
   ══════════════════════════════════════════════ */
export function LeadSearchPage({ variant = 'page' }: { variant?: 'page' | 'canvas' | 'inline-map' }) {
  const mapOnly = variant === 'canvas' || variant === 'inline-map'
  const isInlineMap = variant === 'inline-map'
  const isCanvas = variant === 'canvas'
  const prospectBridge = useProspectBridgeOptional()
  /* Brand ativo — usado em todo state persistido. Quando muda, recarrega. */
  const [activeBrandId, setActiveBrandId] = useState<string | null>(getActiveBrandId())

  /* Form */
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  /** Local escolhido no place search (coords reais). */
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const selectedPlaceRef = useRef<SelectedPlace | null>(null)
  const [maxResults, setMaxResults] = useState(20)
  const [automate, setAutomate] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  /* Raio padrao: 3km (string vazia = "auto"). Otimizacao do Panfleteiro V2. */
  const [radius, setRadius] = useState<string>('3')

  /* Filtros server-side (Panfleteiro V2) */
  const [minRating, setMinRating] = useState<number>(0)
  const [minReviews, setMinReviews] = useState<number>(0)
  const [onlyUncaptured, setOnlyUncaptured] = useState<boolean>(false)
  const [hasPhoneFilter, setHasPhoneFilter] = useState<boolean>(false)
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState<boolean>(false)

  /* Resultados */
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<{ total: number; created: number; skipped: number; automationQueued: number } | null>(null)
  const [searched, setSearched] = useState(false)

  /* Filter + View — pinVisibility controla pins no mapa (visivel e validável). */
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'captured'>('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map')
  const [capturedPoints, setCapturedPoints] = useState<any[]>([])
  /* Só novos no radar server-side; espelha statusFilter==='new' quando user escolhe. */
  // onlyUncaptured already declared above

  /* Radar (arrastar mapa sempre busca novo centro — sem toggle) */
  const [autoCapture, setAutoCapture] = useState(false)
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarCount, setRadarCount] = useState(0)
  const [capturedLive, setCapturedLive] = useState(0) // captados nessa sessão
  const [prospecting, setProspecting] = useState(false)
  const [batchCapturing, setBatchCapturing] = useState(false)
  /* Lead selecionado para o painel direito (clique no pin) */
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  /* Modal Gerar Ideias IA — aceita texto humanizado e sugere segmento+cidade+raio */
  const [ideasModalOpen, setIdeasModalOpen] = useState(false)
  const [mobileMapSettingsOpen, setMobileMapSettingsOpen] = useState(false)

  /* Mapa Mapbox (substitui Leaflet) */
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number; zoom: number }>({ lat: -19.9167, lng: -43.9345, zoom: 13 })
  /* Centro INICIAL definido pela busca por cidade — usado pra mostrar "voltar"
     e diferenciar do ponto atual onde o usuario arrastou o mapa. */
  const [initialCenter, setInitialCenter] = useState<{ lat: number; lng: number; zoom: number; label: string } | null>(null)
  /* Ultimo resultado do radar — pra mostrar feedback "0 encontrados aqui" quando
     o user move pra area sem leads do segmento atual. */
  const [lastRadarResult, setLastRadarResult] = useState<{ count: number; at: number } | null>(null)
  /* flyToCenter — quando muda, o componente faz map.flyTo(). Distinto de mapCenter
     (que é o center "vivo" do mapa). key força re-fly mesmo com mesmos lat/lng. */
  const [flyToCenter, setFlyToCenter] = useState<{ lat: number; lng: number; zoom?: number; key?: number } | null>(null)
  const [recentlyCaptured, setRecentlyCaptured] = useState<string[]>([])
  const [immersive, setImmersive] = useState(false)
  const [pulseTimer] = useState<{ id: ReturnType<typeof setTimeout> | null }>({ id: null })

  /* Metricas globais do brand */
  const [todayCount, setTodayCount] = useState<number>(0)
  const [totalCount, setTotalCount] = useState<number>(0)

  /* Refs */
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const moveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const leadsRef = useRef<Lead[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /* Refs pra restaurar última ação ao trocar de brand (evita stale closure) */
  const radarSearchRef = useRef<((lat: number, lng: number) => void) | null>(null)
  const restoreLastSearchRef = useRef<(() => void) | null>(null)
  /* Guarda contra race: save só dispara DEPOIS que o restore terminou (ou falhou).
     Sem isso, o debounce 1.2s pode sobrescrever query/location do BD com "". */
  const stateLoadedForBrand = useRef<string | null>(null)
  /* Ref do autoCapture — usado no radarSearch para SEMPRE ler valor atual, mesmo
     quando o closure foi capturado com valor antigo (restore async). */
  const autoCaptureRef = useRef(false)
  /** Cancela radar antigo quando o user arrasta de novo (evita fila de N requests). */
  const radarAbortRef = useRef<AbortController | null>(null)
  const radarSeqRef = useRef(0)
  /** Cap de pins em memória — evita UI/DOM monstro após milhares de arrastes. */
  const MAX_LEADS_ON_MAP = 400
  const [radarMeta, setRadarMeta] = useState<{
    cached?: boolean
    throttled?: boolean
    ms?: number
    message?: string
  } | null>(null)

  useEffect(() => { leadsRef.current = leads }, [leads])

  /* ── Detecta troca de brand (storage event + poll lento) ──
     Poll de 800ms + remount do canvas gerava loop de restore/radar. */
  useEffect(() => {
    const sync = () => {
      const cur = getActiveBrandId()
      if (cur && cur !== activeBrandId) setActiveBrandId(cur)
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lead-system:active-brand-id') sync()
    }
    window.addEventListener('storage', onStorage)
    const i = setInterval(sync, 4000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(i)
    }
  }, [activeBrandId])

  /* ── Ao mudar brand, carrega state desse brand e RESETA sessao ── */
  useEffect(() => {
    if (!activeBrandId) return
    let alive = true
    setLeads([]); setStats(null); setSearched(false)
    setRadarCount(0); setCapturedLive(0); setRecentlyCaptured([])
    /* Reset do gate de save — ele só será liberado QUANDO o fetch terminar.
       Sem isso, o debouncedSave dispara com query="" e sobrescreve o BD. */
    stateLoadedForBrand.current = null
    fetchBrandSearchState(activeBrandId).then((state) => {
      if (!alive) return
      if (state) {
        if (typeof state.query === 'string') setQuery(state.query)
        if (typeof state.location === 'string') setLocation(state.location)

        /* Âncora da busca: searchCenter > placeLat/Lng > mapCenter */
        const sc = state.searchCenter && Number.isFinite(Number(state.searchCenter.lat))
          ? {
              lat: Number(state.searchCenter.lat),
              lng: Number(state.searchCenter.lng),
              zoom: Number(state.searchCenter.zoom) || 13,
              label: String(state.searchCenter.label || state.geocodedLabel || state.location || ''),
            }
          : Number.isFinite(Number(state.placeLat)) && Number.isFinite(Number(state.placeLng))
            ? {
                lat: Number(state.placeLat),
                lng: Number(state.placeLng),
                zoom: 13,
                label: String(state.geocodedLabel || state.location || ''),
              }
            : state.mapCenter && Number.isFinite(Number(state.mapCenter.lat))
              ? {
                  lat: Number(state.mapCenter.lat),
                  lng: Number(state.mapCenter.lng),
                  zoom: Number(state.mapCenter.zoom) || 13,
                  label: String(state.geocodedLabel || state.location || ''),
                }
              : null

        if (sc) {
          const restored: SelectedPlace = {
            label: sc.label || String(state.location || ''),
            shortLabel: state.placeShort ? String(state.placeShort) : undefined,
            latitude: sc.lat,
            longitude: sc.lng,
            source: 'restored',
          }
          selectedPlaceRef.current = restored
          setSelectedPlace(restored)
          setInitialCenter(sc)
          // Âncora da CIDADE: mapa e flyTo usam searchCenter — NÃO o último pan
          setMapCenter({ lat: sc.lat, lng: sc.lng, zoom: sc.zoom })
          setFlyToCenter({ lat: sc.lat, lng: sc.lng, zoom: sc.zoom, key: Date.now() } as any)
        } else {
          selectedPlaceRef.current = null
          setSelectedPlace(null)
        }

        if (typeof state.maxResults === 'number') setMaxResults(state.maxResults)
        if (typeof state.automate === 'boolean') setAutomate(state.automate)
        if (state.radius !== undefined && state.radius !== null) setRadius(String(state.radius))
        if (typeof state.minRating === 'number') setMinRating(state.minRating)
        if (typeof state.minReviews === 'number') setMinReviews(state.minReviews)
        if (typeof state.onlyUncaptured === 'boolean') setOnlyUncaptured(state.onlyUncaptured)
        if (typeof state.hasPhoneFilter === 'boolean') setHasPhoneFilter(state.hasPhoneFilter)
        if (typeof state.hasWebsiteFilter === 'boolean') setHasWebsiteFilter(state.hasWebsiteFilter)
        if (typeof state.autoCapture === 'boolean') setAutoCapture(state.autoCapture)
        if (state.statusFilter === 'all' || state.statusFilter === 'new' || state.statusFilter === 'captured') {
          setStatusFilter(state.statusFilter)
          if (state.statusFilter === 'new') setOnlyUncaptured(true)
        }
        /* mapCenter (pan) só restaura se NÃO houver âncora de cidade — evita voltar pro BH/local antigo */
        if (
          !sc &&
          state.mapCenter &&
          typeof state.mapCenter.lat === 'number' &&
          typeof state.mapCenter.lng === 'number'
        ) {
          const view = { lat: state.mapCenter.lat, lng: state.mapCenter.lng, zoom: state.mapCenter.zoom || 13 }
          setMapCenter(view)
          setFlyToCenter({ ...view, key: Date.now() } as any)
        }
        const q = (state.query || '').toString().trim()
        const loc = (state.location || '').toString().trim()
        const radarAt = sc || (state.mapCenter && Number.isFinite(state.mapCenter.lat)
          ? { lat: state.mapCenter.lat, lng: state.mapCenter.lng }
          : null)
        if (q && loc) {
          setSearched(true)
          if (radarAt && Number.isFinite(radarAt.lat) && Number.isFinite(radarAt.lng)) {
            setTimeout(() => { if (alive) radarSearchRef.current?.(radarAt.lat, radarAt.lng) }, 700)
          } else {
            setTimeout(() => { if (alive) restoreLastSearchRef.current?.() }, 700)
          }
        }
      }
      /* Libera o gate APENAS depois do restore completo (com ou sem state). */
      stateLoadedForBrand.current = activeBrandId
    }).catch(() => {
      /* Mesmo em erro, libera o gate pra usuario poder começar do zero */
      if (alive) stateLoadedForBrand.current = activeBrandId
    })
    /* Metricas do brand: response é { success, stats: { today_count, total, ... } }
       Recurso `today_count` é calculado no BD via DATE(created_at) = CURRENT_DATE.
       Bug anterior: lia d.today_count em vez de d.stats.today_count → sempre 0. */
    fetch('/api/leads/stats', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return
        const s = d?.stats ?? d /* fallback se backend antigo retornar achatado */
        setTodayCount(Number(s?.today_count ?? s?.todayCount ?? 0))
        setTotalCount(Number(s?.total ?? s?.total_count ?? 0))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [activeBrandId])

  /* Helper pra recarregar contadores do BD — chamado após captureBatch e radarSearch
     com captura, e periodicamente. Garante numero correto mesmo apos reload. */
  const refreshBrandStats = useCallback(() => {
    fetch('/api/leads/stats', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const s = d?.stats ?? d
        setTodayCount(Number(s?.today_count ?? s?.todayCount ?? 0))
        setTotalCount(Number(s?.total ?? s?.total_count ?? 0))
      })
      .catch(() => {})
  }, [])

  /* ESC + trava scroll do body no imersivo (iPad Safari precisa de body lock) */
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImmersive(false) }
    const prevOverflow = document.body.style.overflow
    const prevTouch = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    window.addEventListener('keydown', onKey)
    /* resize do visualViewport no iPad — força map.resize via evento */
    const onVv = () => window.dispatchEvent(new Event('resize'))
    window.visualViewport?.addEventListener('resize', onVv)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.visualViewport?.removeEventListener('resize', onVv)
      document.body.style.overflow = prevOverflow
      document.body.style.touchAction = prevTouch
    }
  }, [immersive])

  /** Snapshot completo do panfleteiro — searchCenter é a CIDADE, mapCenter é o pan. */
  const buildPersistPayload = useCallback(() => {
    const place = selectedPlaceRef.current
    const anchor =
      initialCenter && Number.isFinite(initialCenter.lat) && Number.isFinite(initialCenter.lng)
        ? {
            lat: initialCenter.lat,
            lng: initialCenter.lng,
            zoom: initialCenter.zoom || 13,
            label: initialCenter.label || location,
          }
        : place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
          ? {
              lat: place.latitude,
              lng: place.longitude,
              zoom: 13,
              label: place.label || location,
            }
          : null
    return {
      query,
      location: location || anchor?.label || '',
      maxResults,
      automate,
      radius,
      minRating,
      minReviews,
      onlyUncaptured,
      hasPhoneFilter,
      hasWebsiteFilter,
      autoCapture,
      statusFilter,
      mapCenter,
      /* NUNCA preenche searchCenter com mapCenter do pan — isso voltava pro local errado */
      searchCenter: anchor,
      geocodedLabel: anchor?.label || place?.label || location,
      placeLat: place?.latitude ?? anchor?.lat ?? null,
      placeLng: place?.longitude ?? anchor?.lng ?? null,
      placeShort: place?.shortLabel || null,
    }
  }, [
    query, location, maxResults, automate, radius, minRating, minReviews,
    onlyUncaptured, hasPhoneFilter, hasWebsiteFilter, autoCapture, statusFilter,
    mapCenter, initialCenter,
  ])

  const persistNow = useCallback((brandId: string | null, extra?: Record<string, any>, opts?: { force?: boolean }) => {
    if (!brandId) return
    /* force=true: grava local da busca mesmo se restore ainda não liberou o gate
       (evita perder cidade escolhida na lista). */
    if (!opts?.force && stateLoadedForBrand.current !== brandId) return
    const payload = { ...buildPersistPayload(), ...extra }
    void persistBrandSearchState(brandId, payload)
  }, [buildPersistPayload])

  /* ── Debounced save por brand ──
     GATE: só salva DEPOIS que o restore terminou pra esse brand. Sem isso, ao
     trocar de brand ou recarregar a pagina, o save dispara com state vazio
     (query="", etc) ANTES do fetch terminar e sobrescreve o BD. */
  useEffect(() => {
    if (!activeBrandId) return
    if (stateLoadedForBrand.current !== activeBrandId) return // gate
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      persistNow(activeBrandId)
    }, 900)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [
    activeBrandId, query, location, maxResults, automate, radius, minRating, minReviews,
    onlyUncaptured, hasPhoneFilter, hasWebsiteFilter, mapCenter, autoCapture, statusFilter,
    initialCenter, selectedPlace, persistNow,
  ])

  // ── Standard search (também chamado pelo chat via ProspectBridge) ──
  const runTextSearch = useCallback(async (
    q: string,
    loc: string,
    coords?: { latitude?: number; longitude?: number } | null
  ) => {
    const trimmedQ = q.trim()
    const trimmedLoc = loc.trim()
    if (!trimmedQ || !trimmedLoc) return
    setQuery(trimmedQ)
    setLocation(trimmedLoc)
    setLoading(true); setError(''); setSearched(true)
    setRadarCount(0); setCapturedLive(0); setStatusFilter('all')
    setViewMode('map')

    // Prefere coords do place picker (sempre que o local ainda for o selecionado)
    const place = selectedPlaceRef.current
    const resolved = resolvePlaceCoords(place, trimmedLoc, coords)
    const latitude = resolved.latitude
    const longitude = resolved.longitude
    const locLabel = (resolved.label || trimmedLoc).trim()

    try {
      const body: Record<string, any> = {
        query: trimmedQ,
        location: locLabel,
        maxResults,
        executeAutomation: automate,
      }
      if (radius && Number(radius) > 0) body.radius = Number(radius) * 1000
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        body.latitude = latitude
        body.longitude = longitude
      }
      const r = await fetch('/api/leads/search', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      let resultLeads: Lead[] = d.leads || []
      /* Filtro client imediato se "só novos" */
      if (onlyUncaptured || statusFilter === 'new') {
        resultLeads = resultLeads.filter((l) => l.captureStatus !== 'captured')
      } else if (statusFilter === 'captured') {
        resultLeads = resultLeads.filter((l) => l.captureStatus === 'captured')
      }
      const resultStats = { total: d.total || 0, created: d.persisted?.created || 0, skipped: d.persisted?.skipped || 0, automationQueued: d.automation?.queued_jobs || 0 }
      leadsRef.current = resultLeads
      setLeads(resultLeads)
      setCapturedPoints(d.capturedPoints || [])
      setStats(resultStats)
      /* CENTRALIZA O MAPA no geocode real — prioridade: client place > backend geo > first lead */
      const geo = d.geocoded || d.center
      const c = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? {
            lat: Number(latitude),
            lng: Number(longitude),
            zoom: 13,
            label: String(place?.label || geo?.label || locLabel || trimmedLoc),
          }
        : geo && Number.isFinite(Number(geo?.latitude ?? geo?.lat)) && Number.isFinite(Number(geo?.longitude ?? geo?.lng))
          ? {
              lat: Number(geo.latitude ?? geo.lat),
              lng: Number(geo.longitude ?? geo.lng),
              zoom: 13,
              label: String(geo.label || locLabel || trimmedLoc),
            }
          : (() => {
            const first = resultLeads.find((l: any) =>
              Number.isFinite(Number(l?.location?.latitude)) &&
              Number.isFinite(Number(l?.location?.longitude)) &&
              !(Number(l?.location?.latitude) === 0 && Number(l?.location?.longitude) === 0)
            )
            return first?.location
              ? { lat: Number(first.location.latitude), lng: Number(first.location.longitude), zoom: 13, label: locLabel || trimmedLoc }
              : null
          })()
      if (c) {
        const label = c.label || locLabel || trimmedLoc
        setFlyToCenter({ lat: c.lat, lng: c.lng, zoom: c.zoom, key: Date.now() })
        setMapCenter({ lat: c.lat, lng: c.lng, zoom: c.zoom ?? 13 })
        setInitialCenter({ lat: c.lat, lng: c.lng, zoom: c.zoom ?? 13, label })
        const synced: SelectedPlace = {
          label,
          shortLabel: place?.shortLabel || label.split(',')[0],
          latitude: c.lat,
          longitude: c.lng,
          source: 'search',
        }
        selectedPlaceRef.current = synced
        setSelectedPlace(synced)
        setLocation(label)
        /* Persistência IMEDIATA da âncora (force — não espera debounce) */
        if (activeBrandId) {
          void persistBrandSearchState(activeBrandId, {
            query: trimmedQ,
            location: label,
            maxResults,
            automate,
            radius,
            minRating,
            minReviews,
            onlyUncaptured,
            hasPhoneFilter,
            hasWebsiteFilter,
            autoCapture,
            statusFilter,
            mapCenter: { lat: c.lat, lng: c.lng, zoom: c.zoom ?? 13 },
            searchCenter: { lat: c.lat, lng: c.lng, zoom: c.zoom ?? 13, label },
            geocodedLabel: label,
            placeLat: c.lat,
            placeLng: c.lng,
            placeShort: synced.shortLabel || null,
            updated_at: new Date().toISOString(),
          })
        }
      } else {
        setError((prev) => prev || `Não foi possível localizar o endereço "${trimmedLoc}". Escolha um local na lista ou use cidade + UF (ex: Fortaleza, CE).`)
      }
    } catch (err: any) { setError(err.message || 'Erro na busca') }
    finally { setLoading(false) }
  }, [maxResults, automate, radius, activeBrandId, minRating, minReviews, onlyUncaptured, hasPhoneFilter, hasWebsiteFilter, autoCapture, statusFilter])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    await runTextSearch(query, location)
  }

  // ── Radar search (panfleteiro — by coordinates) ──
  // Abort + seq id: só a última busca vale. Cap de pins. Auto-capture via batch.
  const radarSearch = useCallback(async (lat: number, lng: number) => {
    if (!query.trim()) return
    const seq = ++radarSeqRef.current
    radarAbortRef.current?.abort()
    const ac = new AbortController()
    radarAbortRef.current = ac
    const t0 = performance.now()
    setRadarLoading(true)
    setProspecting(true)
    setRadarMeta(null)
    try {
      const searchRadius = Number(radius || 3) * 1000
      const body: Record<string, any> = {
        query: query.trim(),
        latitude: lat,
        longitude: lng,
        radius: searchRadius,
        maxResults: Math.min(maxResults, 30),
        minRating, minReviews,
        onlyUncaptured, hasPhone: hasPhoneFilter, hasWebsite: hasWebsiteFilter,
      }
      const r = await fetch('/api/leads/radar-search', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: ac.signal,
      })
      const d = await r.json().catch(() => ({}))
      if (seq !== radarSeqRef.current) return // stale
      if (r.status === 429 || d?.rate_limited) {
        setRadarMeta({
          throttled: true,
          message: d.error || 'Limite do mapa — aguarde ~45s (áreas já buscadas usam cache)',
        })
        // Não zera o mapa: mantém pins existentes
        return
      }
      if (!r.ok) {
        // 502/500: mantém pins e avisa (não quebra a sessão)
        setRadarMeta({
          throttled: r.status === 502,
          message: d.error || `Radar indisponível (${r.status}) — tente de novo em instantes`,
        })
        return
      }
      const radarLeads: Lead[] = d.leads || []
      setLastRadarResult({ count: radarLeads.length, at: Date.now() })
      setRadarMeta({
        cached: !!d.cached || !!d.deduped || !!d.stale,
        ms: Math.round(performance.now() - t0),
        message: d.stale
          ? 'Cache (provedor no limite)'
          : d.cached
            ? 'Cache'
            : d.deduped
              ? 'Dedup'
              : 'Ao vivo',
      })

      const existingIds = new Set(leadsRef.current.map(l => l.id))
      const newOnes = radarLeads.filter(l => !existingIds.has(l.id))
      setLeads(prev => {
        const ids = new Set(prev.map(l => l.id))
        let incoming = newOnes.filter(l => !ids.has(l.id))
        /* Respeita filtro de pins já no merge — evita acumular captados “invisíveis” */
        if (onlyUncaptured || statusFilter === 'new') {
          incoming = incoming.filter(l => l.captureStatus !== 'captured')
        } else if (statusFilter === 'captured') {
          incoming = incoming.filter(l => l.captureStatus === 'captured')
        }
        let next = [...prev, ...incoming]
        if (onlyUncaptured || statusFilter === 'new') {
          next = next.filter(l => l.captureStatus !== 'captured')
        }
        // Cap: mantém capturados + os mais próximos do centro atual
        if (next.length > MAX_LEADS_ON_MAP) {
          const scored = next.map((l) => {
            const la = Number(l.location?.latitude)
            const ln = Number(l.location?.longitude)
            const dist =
              Number.isFinite(la) && Number.isFinite(ln)
                ? haversineKm(lat, lng, la, ln)
                : 999
            const priority = l.captureStatus === 'captured' ? 0 : 1
            return { l, dist, priority }
          })
          scored.sort((a, b) => a.priority - b.priority || a.dist - b.dist)
          next = scored.slice(0, MAX_LEADS_ON_MAP).map((s) => s.l)
        }
        leadsRef.current = next
        return next
      })
      setRadarCount(c => c + newOnes.length)
      setStats(prev => prev ? {
        ...prev,
        total: prev.total + newOnes.length,
      } : { total: radarLeads.length, created: 0, skipped: 0, automationQueued: 0 })

      // Auto-capture em BATCH (1 request) — não N× capture-manual de 16s
      const captureCandidates = newOnes.filter(lead => lead.captureStatus !== 'captured')
      if (autoCaptureRef.current && captureCandidates.length > 0) {
        try {
          const cr = await fetch('/api/leads/capture-batch', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              leads: captureCandidates.map((lead) => ({
                placeId: lead.id, name: lead.name, phone: lead.phone,
                address: lead.address, rating: lead.rating, reviews: lead.reviews,
                category: lead.category, website: lead.website,
                googleMapsUri: lead.googleMapsUri, businessStatus: lead.businessStatus,
                location: lead.location,
              })),
              query: query.trim(),
              location: `${lat.toFixed(4)},${lng.toFixed(4)}`,
              executeAutomation: automate,
            }),
            signal: ac.signal,
          })
          const cd = await cr.json().catch(() => ({}))
          if (seq !== radarSeqRef.current) return
          if (cd.success) {
            const createdIds = new Set<string>([
              ...(cd.createdPlaceIds || []),
              ...(cd.existingPlaceIds || []),
            ].map(String))
            const createdCount = Number(cd.created || 0)
            setLeads(prev => {
              const next = prev.map(l =>
                createdIds.has(l.id) ? { ...l, captureStatus: 'captured' as const } : l
              )
              leadsRef.current = next
              return next
            })
            if (createdCount > 0) {
              setCapturedLive(c => c + createdCount)
              const pulseIds = (cd.createdPlaceIds || []).map(String)
              setRecentlyCaptured((prev) => [...new Set([...prev, ...pulseIds])])
              setTimeout(() => {
                setRecentlyCaptured((prev) => prev.filter((id) => !pulseIds.includes(id)))
              }, 1600)
              setStats(prev => prev ? { ...prev, created: prev.created + createdCount } : prev)
              refreshBrandStats()
            }
          }
        } catch (e: any) {
          if (e?.name !== 'AbortError') { /* ignore batch fail */ }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setRadarMeta({ message: e?.message || 'Falha no radar' })
    } finally {
      if (seq === radarSeqRef.current) {
        setRadarLoading(false)
        setTimeout(() => setProspecting(false), 400)
      }
    }
  }, [query, radius, maxResults, automate, minRating, minReviews, onlyUncaptured, hasPhoneFilter, hasWebsiteFilter, refreshBrandStats, statusFilter])

  /* Captura em lote via endpoint batch (rápido) */
  const captureBatch = useCallback(async () => {
    if (batchCapturing) return
    const targets = leadsRef.current.filter(l => l.captureStatus === 'new')
    if (!targets.length) return
    setBatchCapturing(true)
    setProspecting(true)
    try {
      // Processa em chunks de 60 pra não estourar body
      let captured = 0
      for (let i = 0; i < targets.length; i += 60) {
        const chunk = targets.slice(i, i + 60)
        const cr = await fetch('/api/leads/capture-batch', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            leads: chunk.map((lead) => ({
              placeId: lead.id, name: lead.name, phone: lead.phone,
              address: lead.address, rating: lead.rating, reviews: lead.reviews,
              category: lead.category, website: lead.website,
              googleMapsUri: lead.googleMapsUri, businessStatus: lead.businessStatus,
              location: lead.location,
            })),
            query: query.trim(),
            location: location.trim() || `${mapCenter.lat.toFixed(4)},${mapCenter.lng.toFixed(4)}`,
            executeAutomation: automate,
          }),
        })
        const cd = await cr.json().catch(() => ({}))
        if (!cd.success) continue
        const doneIds = new Set<string>([
          ...(cd.createdPlaceIds || []),
          ...(cd.existingPlaceIds || []),
        ].map(String))
        captured += Number(cd.created || 0)
        setLeads(prev => {
          const next = prev.map(l =>
            doneIds.has(l.id) ? { ...l, captureStatus: 'captured' as const } : l
          )
          leadsRef.current = next
          return next
        })
        const pulseIds = (cd.createdPlaceIds || []).map(String)
        if (pulseIds.length) {
          setRecentlyCaptured(prev => [...new Set([...prev, ...pulseIds])])
          setTimeout(() => setRecentlyCaptured(prev => prev.filter(id => !pulseIds.includes(id))), 1600)
        }
      }
      if (captured > 0) {
        setCapturedLive(c => c + captured)
        setStats(prev => prev ? { ...prev, created: prev.created + captured } : prev)
        refreshBrandStats()
      }
    } catch { /* ignore */ }
    setBatchCapturing(false)
    setTimeout(() => setProspecting(false), 400)
  }, [batchCapturing, query, location, automate, mapCenter, refreshBrandStats])

  /* Mantém ref atualizada pra restaurar última ação ao trocar de brand */
  useEffect(() => { radarSearchRef.current = radarSearch }, [radarSearch])
  /* Sync autoCaptureRef com o state — usado em closures de radarSearch */
  useEffect(() => { autoCaptureRef.current = autoCapture }, [autoCapture])

  /* ── AUTO-CAPTURA reativa ──
     Sempre que ha leads NEW no state E auto-captura esta ON, dispara captureBatch.
     Cobre 3 cenarios que o auto-capture inline do radarSearch nao cobria:
       1) Usuario LIGA auto-captura DEPOIS de ja ter leads NEW visiveis
       2) Auto-capture do radarSearch falhou parcialmente — sobraram NEW orfaos
       3) State foi restaurado do BD com leads NEW e auto ON
     Guard: nao re-dispara enquanto ja esta capturando (batchCapturing). */
  useEffect(() => {
    if (!autoCapture) return
    if (batchCapturing) return
    const hasNew = leads.some(l => l.captureStatus === 'new')
    if (!hasNew) return
    /* Debounce 400ms — espera assentar caso novos leads cheguem em rajada */
    const t = setTimeout(() => { captureBatch() }, 400)
    return () => clearTimeout(t)
  }, [autoCapture, leads, batchCapturing, captureBatch])
  useEffect(() => {
    restoreLastSearchRef.current = () => {
      if (!query.trim() || !location.trim()) return
      runTextSearch(query, location)
    }
  }, [query, location, runTextSearch])

  const filtered = leads.filter(l => {
    /* onlyUncaptured e statusFilter 'new' = esconder captados no mapa */
    if ((onlyUncaptured || statusFilter === 'new') && l.captureStatus === 'captured') return false
    if (statusFilter === 'captured' && l.captureStatus !== 'captured') return false
    if (searchFilter) {
      const q = searchFilter.toLowerCase()
      return l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.address.toLowerCase().includes(q)
    }
    return true
  })

  /** Troca filtro de pins de forma validável (client + radar). */
  function setPinVisibility(mode: 'all' | 'new' | 'captured') {
    setStatusFilter(mode)
    setOnlyUncaptured(mode === 'new')
    /* Ao filtrar, limpa pins que não batem — mapa fica limpo na hora */
    if (mode === 'new') {
      setLeads(prev => {
        const next = prev.filter(l => l.captureStatus !== 'captured')
        leadsRef.current = next
        return next
      })
    } else if (mode === 'captured') {
      setLeads(prev => {
        const next = prev.filter(l => l.captureStatus === 'captured')
        leadsRef.current = next
        return next
      })
    }
    /* Re-radar no centro atual pra repor pins do modo escolhido */
    if (query.trim() && mapCenter) {
      setTimeout(() => radarSearchRef.current?.(mapCenter.lat, mapCenter.lng), 120)
    }
  }

  const newCount = leads.filter(l => l.captureStatus === 'new').length
  const capturedCount = leads.filter(l => l.captureStatus === 'captured').length

  /* Pins DENTRO do raio atual (haversine simples).
     Usado pra esmaecer pins fora e mostrar contador "no raio" vs "total sessao". */
  const radiusKmCurrent = Math.max(0.1, Number(radius || 3))
  const inRangeIds = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) {
      const la = Number(l.location?.latitude)
      const ln = Number(l.location?.longitude)
      if (!Number.isFinite(la) || !Number.isFinite(ln)) continue
      const dKm = haversineKm(mapCenter.lat, mapCenter.lng, la, ln)
      if (dKm <= radiusKmCurrent) set.add(l.id)
    }
    return set
  }, [leads, mapCenter.lat, mapCenter.lng, radiusKmCurrent])
  const inRangeCount = inRangeIds.size
  const newInRange = leads.filter(l => l.captureStatus === 'new' && inRangeIds.has(l.id)).length

  /* UI compacta quando ja tem mapa ativo — esconde chips e os 6 cards de stats
     (todos duplicados pelo RadarCard no canto do mapa). Form fica condensado. */
  const isCompact = searched || leads.length > 0

  /* ── Ponte chat ↔ mapa (ProspectBridge) ── */
  useEffect(() => {
    if (!prospectBridge) return
    return prospectBridge.registerHandlers({
      search: ({ query: q, location: loc, radius: r, latitude, longitude }) => {
        if (r) setRadius(String(r))
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && loc) {
          const place: SelectedPlace = {
            label: loc,
            latitude: Number(latitude),
            longitude: Number(longitude),
            source: 'bridge',
          }
          selectedPlaceRef.current = place
          setSelectedPlace(place)
        }
        return runTextSearch(q, loc, { latitude, longitude })
      },
      captureBatch: () => { captureBatch() },
      toggleAutoCapture: () => { setAutoCapture((v) => !v) },
      toggleAutomate: () => { setAutomate((v) => !v) },
      setImmersive: (v) => { setImmersive(v) },
      openIdeas: () => { setIdeasModalOpen(true) },
      apply: ({ query: q, location: loc, radius: r, automate: auto, latitude, longitude }) => {
        if (q !== undefined) setQuery(q)
        if (loc !== undefined) setLocation(loc)
        if (r !== undefined) setRadius(String(r))
        if (auto !== undefined) setAutomate(auto)
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && loc) {
          const place: SelectedPlace = {
            label: loc,
            shortLabel: String(loc).split(',')[0],
            latitude: Number(latitude),
            longitude: Number(longitude),
            source: 'bridge',
          }
          selectedPlaceRef.current = place
          setSelectedPlace(place)
          setInitialCenter({
            lat: place.latitude,
            lng: place.longitude,
            zoom: 13,
            label: place.label,
          })
          setMapCenter({ lat: place.latitude, lng: place.longitude, zoom: 13 })
          setFlyToCenter({ lat: place.latitude, lng: place.longitude, zoom: 13, key: Date.now() })
        } else if (loc !== undefined) {
          // texto novo sem coords → limpa seleção antiga se o label mudou
          if (!selectedPlaceRef.current || selectedPlaceRef.current.label.trim() !== loc.trim()) {
            selectedPlaceRef.current = null
            setSelectedPlace(null)
          }
        }
      },
    })
  }, [prospectBridge, runTextSearch, captureBatch])

  useEffect(() => {
    if (!prospectBridge) return
    prospectBridge.publishSnapshot({
      query,
      location,
      radius,
      found: leads.length,
      newCount,
      captured: capturedCount,
      capturedLive,
      todayCount,
      totalCount,
      inRange: inRangeCount,
      newInRange,
      radarLoading,
      prospecting,
      autoCapture,
      automate,
      immersive,
      searched,
      batchCapturing,
      loading,
      error,
    })
  }, [
    prospectBridge, query, location, radius, leads.length, newCount, capturedCount,
    capturedLive, todayCount, totalCount, inRangeCount, newInRange,
    radarLoading, prospecting, autoCapture, automate, immersive, searched, batchCapturing, loading, error,
  ])

  return (
    <div className={
      mapOnly
        ? (isInlineMap ? 'prospect-inline-map h-full min-h-0 flex flex-col' : 'h-full min-h-0 flex flex-col overflow-hidden')
        : 'space-y-4'
    }>
      {/* ── Header ── */}
      {!mapOnly && (
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
          {/* Botao Gerar ideias com IA — abre modal humanizado, IA sugere
              segmento + cidade + raio em 1 clique. */}
          <button
            type="button"
            onClick={() => setIdeasModalOpen(true)}
            title="Descreva seu negócio e a IA sugere segmentos e cidades pra prospectar"
            className="ai-shimmer inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 hover:bg-black text-white text-[12px] font-semibold transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
          >
            <Sparkles size={13} strokeWidth={2.25} />
            <span className="hidden sm:inline">Gerar ideias</span>
          </button>
        </div>
      </header>
      )}

      {/* Form + toolbar — só na página standalone (/busca), nunca no canvas nem inline */}
      {!mapOnly && (
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-border-light overflow-hidden">
        {isCompact ? (
          /* COMPACTO — segmento + cidade em largura total (local completo legível) */
          <div className="p-3 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-end">
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Segmento</label>
                <div className="relative">
                  <Building2 size={13} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="pizzaria…"
                    required
                    className="w-full h-10 pl-8 pr-2 rounded-lg border border-border bg-white text-[13px] font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Local da busca</label>
                <div className="relative rounded-lg border border-border bg-white min-h-10 pl-8 pr-1 flex items-center focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:border-gray-900 transition">
                  <MapPin size={13} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-[1]" />
                  <LocationPlaceSearch
                    variant="inline"
                    value={location}
                    selected={selectedPlace}
                    onChange={setLocation}
                    onSelect={(place) => {
                      selectedPlaceRef.current = place
                      setSelectedPlace(place)
                      setLocation(place.label)
                      setInitialCenter({
                        lat: place.latitude,
                        lng: place.longitude,
                        zoom: 13,
                        label: place.label,
                      })
                      setMapCenter({ lat: place.latitude, lng: place.longitude, zoom: 13 })
                      setFlyToCenter({ lat: place.latitude, lng: place.longitude, zoom: 13, key: Date.now() })
                      if (activeBrandId) persistNow(activeBrandId, {
                        location: place.label,
                        searchCenter: { lat: place.latitude, lng: place.longitude, zoom: 13, label: place.label },
                        geocodedLabel: place.label,
                        placeLat: place.latitude,
                        placeLng: place.longitude,
                        placeShort: place.shortLabel || null,
                        mapCenter: { lat: place.latitude, lng: place.longitude, zoom: 13 },
                      }, { force: true })
                    }}
                    onClearPlace={() => {
                      selectedPlaceRef.current = null
                      setSelectedPlace(null)
                    }}
                    placeholder="Buscar cidade ou bairro…"
                    required
                    inputClassName="w-full min-h-10 py-2 pr-1 text-[12px] sm:text-[13px] font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none bg-transparent"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-[120px]">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Raio</label>
                    <span className="text-[10px] font-semibold text-gray-700 tabular-nums">
                      {(() => { const n = Number(radius || 3); return n < 1 ? `${Math.round(n * 1000)}m` : `${n.toFixed(n < 10 ? 1 : 0)}km` })()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={Number(radius || 3)}
                    onChange={e => setRadius(e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-gray-900 mt-2"
                    style={{
                      background: `linear-gradient(to right, #111827 0%, #111827 ${((Number(radius || 3) - 0.5) / 29.5) * 100}%, #e5e7eb ${((Number(radius || 3) - 0.5) / 29.5) * 100}%, #e5e7eb 100%)`,
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  title="Mudar de rota / cidade — re-centraliza o mapa"
                  className="h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-white font-semibold text-[12px] tracking-tight hover:bg-gray-800 disabled:opacity-40 active:scale-[0.99] transition shrink-0"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} strokeWidth={2.25} />}
                  {loading ? 'Buscando…' : 'Mudar rota'}
                </button>
              </div>
            </div>
            {selectedPlace?.label && (
              <p className="text-[11px] text-gray-500 leading-snug pl-0.5 truncate" title={selectedPlace.label}>
                <span className="font-semibold text-emerald-700">Local fixado:</span>{' '}
                {selectedPlace.label}
              </p>
            )}
          </div>
        ) : (
          /* EXPANSIVO — primeira busca, local em linha própria com espaço total */
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3">
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
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Local da busca</label>
                <div className="relative rounded-xl border border-border bg-white min-h-11 pl-10 pr-2 flex items-center focus-within:ring-4 focus-within:ring-gray-900/5 focus-within:border-gray-900 transition">
                  <MapPin size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-[1]" />
                  <LocationPlaceSearch
                    variant="inline"
                    value={location}
                    selected={selectedPlace}
                    onChange={setLocation}
                    onSelect={(place) => {
                      selectedPlaceRef.current = place
                      setSelectedPlace(place)
                      setLocation(place.label)
                      setInitialCenter({
                        lat: place.latitude,
                        lng: place.longitude,
                        zoom: 13,
                        label: place.label,
                      })
                      setMapCenter({ lat: place.latitude, lng: place.longitude, zoom: 13 })
                      setFlyToCenter({ lat: place.latitude, lng: place.longitude, zoom: 13, key: Date.now() })
                      if (activeBrandId) persistNow(activeBrandId, {
                        location: place.label,
                        searchCenter: { lat: place.latitude, lng: place.longitude, zoom: 13, label: place.label },
                        geocodedLabel: place.label,
                        placeLat: place.latitude,
                        placeLng: place.longitude,
                        placeShort: place.shortLabel || null,
                        mapCenter: { lat: place.latitude, lng: place.longitude, zoom: 13 },
                      }, { force: true })
                    }}
                    onClearPlace={() => {
                      selectedPlaceRef.current = null
                      setSelectedPlace(null)
                    }}
                    placeholder="Digite e escolha a cidade ou bairro na lista…"
                    required
                    inputClassName="w-full min-h-11 py-2.5 pr-1 text-sm font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none bg-transparent"
                  />
                </div>
                {selectedPlace?.label && (
                  <p className="mt-1.5 text-[11px] text-gray-500 leading-snug" title={selectedPlace.label}>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <MapPin size={11} /> Confirmado
                    </span>
                    {' — '}{selectedPlace.label}
                  </p>
                )}
              </div>
            </div>

            {/* Slider de raio */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-semibold text-gray-700">Raio</label>
                <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                  {(() => { const n = Number(radius || 3); return n < 1 ? `${Math.round(n * 1000)}m` : `${n.toFixed(n < 10 ? 1 : 0)}km` })()}
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                value={Number(radius || 3)}
                onChange={e => setRadius(e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-gray-900"
                style={{
                  background: `linear-gradient(to right, #111827 0%, #111827 ${((Number(radius || 3) - 0.5) / 29.5) * 100}%, #e5e7eb ${((Number(radius || 3) - 0.5) / 29.5) * 100}%, #e5e7eb 100%)`,
                }}
              />
              <div className="flex justify-between text-[9px] font-medium text-gray-400 mt-0.5 tabular-nums">
                <span>500m</span>
                <span>30km</span>
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

            {/* Chips de sugestões — só na primeira busca */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS.map(({ icon: Icon, label, query: q }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setQuery(q)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition ${
                    query.toLowerCase() === q.toLowerCase()
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon size={11} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Options bar */}
        {/* Toolbar do form: Auto-captura, Avançado, Automação.
            O modo "radar" é implicito — o arrasto do mapa SEMPRE busca novo centro. */}
        <div className="border-t border-border-light px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setAutoCapture(!autoCapture)}
              aria-pressed={autoCapture}
              title="Captura automaticamente novos leads ao mover o mapa"
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                autoCapture
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {autoCapture ? <Zap size={11} strokeWidth={2.25} /> : <Pause size={11} strokeWidth={2.25} />}
              Auto-captura
            </button>
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
          <div className="border-t border-border-light px-4 py-3 bg-gray-50/60 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Máx. resultados</label>
                <select
                  value={maxResults}
                  onChange={e => setMaxResults(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                >
                  {[10, 20, 30, 50, 80, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Rating min.</label>
                <select value={minRating} onChange={e => setMinRating(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition">
                  {[0, 3, 3.5, 4, 4.5].map(n => <option key={n} value={n}>{n === 0 ? 'qualquer' : `${n} ★`}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Reviews min.</label>
                <select value={minReviews} onChange={e => setMinReviews(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-white text-sm font-medium text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition">
                  {[0, 5, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n === 0 ? 'qualquer' : `${n}+`}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-200/60">
              <label className="inline-flex items-center gap-2 cursor-pointer text-[12px] font-semibold text-gray-700 pt-2">
                <input
                  type="checkbox"
                  checked={onlyUncaptured || statusFilter === 'new'}
                  onChange={e => setPinVisibility(e.target.checked ? 'new' : 'all')}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                />
                Só novos no mapa (esconde captados)
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-[12px] font-semibold text-gray-700 pt-2">
                <input type="checkbox" checked={hasPhoneFilter} onChange={e => setHasPhoneFilter(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400" />
                Com telefone
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-[12px] font-semibold text-gray-700 pt-2">
                <input type="checkbox" checked={hasWebsiteFilter} onChange={e => setHasWebsiteFilter(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400" />
                Com site
              </label>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[13px] font-medium">
            {error}
          </div>
        )}
      </form>
      )}

      {/* ── Stats — só na PRIMEIRA busca. Depois disso fica duplicado com o RadarCard
           no canto do mapa (mesmas metricas), entao escondemos pra liberar espaco. */}
      {!mapOnly && !isCompact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {([
            { v: leads.length, l: 'Encontrados', accent: 'text-gray-900' },
            { v: newCount, l: 'Novos', accent: 'text-emerald-700' },
            { v: capturedCount, l: 'Existentes', accent: 'text-amber-700' },
            { v: capturedLive, l: 'Nessa ação', accent: 'text-gray-900' },
            { v: todayCount, l: 'Hoje', accent: 'text-gray-900' },
            { v: totalCount, l: 'Total', accent: 'text-gray-900' },
          ] as const).map(s => (
            <div key={s.l} className="bg-white border border-border-light rounded-2xl p-3.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{s.l}</p>
              <p className={`text-[24px] font-bold tracking-tight tabular-nums leading-none mt-1.5 ${s.accent}`}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Results ── Mapa fica visível sempre que o usuário já buscou.
           O arrasto do mapa SEMPRE dispara nova busca (radar implicito). */}
      {(searched || leads.length > 0 || mapOnly) && (mapOnly || !loading) && (
        <div className={mapOnly ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'space-y-3'}>
          {/* Controls — só na página standalone */}
          {!mapOnly && (
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

              {/* Pins no mapa — filtro validável (some + radar) */}
              <div className="inline-flex bg-gray-100 p-0.5 rounded-full" role="group" aria-label="Pins no mapa">
                {([
                  ['all', 'Todos', leads.length],
                  ['new', 'Só novos', newCount],
                  ['captured', 'Só captados', capturedCount],
                ] as const).map(([k, l, c]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPinVisibility(k)}
                    aria-pressed={statusFilter === k}
                    title={
                      k === 'new'
                        ? 'Mostrar só leads ainda não captados'
                        : k === 'captured'
                          ? 'Mostrar só pins já captados'
                          : 'Mostrar todos os pins'
                    }
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition ${
                      statusFilter === k ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/10' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {l}
                    <span className="tabular-nums text-gray-400">{c}</span>
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
          )}

          {/* Map (Panfleteiro V2 — Mapbox GL JS)
              Em modo imersivo: outer fixed inset-0 SEM padding (p-3 quebra height interno).
              O componente PanfleteiroMapMapbox preenche 100% do outer.
              NOTA: mapa sempre full-width — o painel de detalhes é overlay absolute pra
              nao redimensionar o mapa (Mapbox nao re-render markers em resize de flex). */}
          {(mapOnly || viewMode === 'map') && (() => {
            const mapShell = (
              <div
                className={immersive
                  ? 'prospect-immersive-root fixed inset-0 bg-black'
                  : mapOnly
                    ? 'relative flex-1 min-h-0 w-full'
                    : 'relative w-full'}
                style={immersive
                  ? {
                      zIndex: 10000,
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      width: '100vw',
                      height: '100dvh',
                      maxHeight: '-webkit-fill-available',
                    }
                  : {
                      height: mapOnly ? '100%' : '560px',
                      isolation: 'isolate',
                      minHeight: mapOnly ? (isInlineMap ? '200px' : '320px') : undefined,
                    }}
              >
              {mapOnly && loading && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-black/30 backdrop-blur-[1px]">
                  <Loader2 size={22} className="animate-spin text-white" />
                </div>
              )}
              <PanfleteiroMapMapbox
                initialCenter={mapCenter}
                radius={Math.max(100, Number(radius || 3) * 1000)}
                places={filtered.map<PanfleteiroPlace>((l) => ({
                  id: l.id, name: l.name, phone: l.phone, address: l.address,
                  rating: l.rating, reviews: l.reviews, category: l.category,
                  website: l.website, googleMapsUri: l.googleMapsUri,
                  location: l.location || null,
                  captureStatus: l.captureStatus,
                  prospectStatus: l.captureStatus === 'captured' ? 'new' : null,
                  outOfRange: !inRangeIds.has(l.id),
                }))}
                recentlyCapturedIds={recentlyCaptured}
                flyToCenter={flyToCenter}
                immersive={immersive}
                height="100%"
                statusBadge={{
                  label: radarLoading
                    ? 'Buscando…'
                    : radarMeta?.throttled
                      ? 'Ritmo alto'
                      : radarMeta?.cached
                        ? `Cache ${radarMeta.ms ? `${radarMeta.ms}ms` : ''}`.trim()
                        : prospecting
                          ? 'Prospectando'
                          : radarMeta?.ms
                            ? `Radar · ${radarMeta.ms}ms`
                            : 'Radar ativo',
                  tone: radarLoading || prospecting
                    ? 'searching'
                    : radarMeta?.throttled
                      ? 'idle'
                      : 'done',
                }}
                onCenterChanged={(c) => {
                  setMapCenter(c)
                  if (query.trim()) radarSearch(c.lat, c.lng)
                }}
                onPlaceClick={(p) => {
                  const lead = leadsRef.current.find(l => l.id === p.id)
                  if (lead) setSelectedLead(lead)
                }}
              />
              {!immersive && !mapOnly && (
                <button
                  type="button"
                  onClick={() => setImmersive(true)}
                  title="Modo imersivo (tela cheia)"
                  className="absolute bottom-3 left-3 z-20 w-9 h-9 grid place-items-center rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-sm border border-white/10"
                >
                  <Maximize2 size={16} />
                </button>
              )}

              {!immersive && (
                <div className="prospect-pipeline-legend absolute bottom-3 right-3 z-20 flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-sm border border-white/10 whitespace-nowrap">
                  {PIPELINE.map(s => (
                    <span key={s.key} className="flex items-center gap-1 text-[10px] font-semibold text-white/90">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                  ))}
                </div>
              )}

              {(!isInlineMap || immersive) && (
                <RadarCard
                  active={true}
                  searching={radarLoading || prospecting}
                  found={leads.length}
                  inRange={inRangeCount}
                  newCount={newCount}
                  newInRange={newInRange}
                  captured={capturedCount}
                  capturedLive={capturedLive}
                  today={todayCount}
                  total={totalCount}
                  center={mapCenter}
                  initialCenter={initialCenter}
                  radius={Math.max(0.1, Number(radius || 3))}
                  location={location}
                  autoCapture={autoCapture}
                  batchCapturing={batchCapturing}
                  lastRadarResult={lastRadarResult}
                  onCaptureBatch={captureBatch}
                  onShowAll={() => { setStatusFilter('all'); setSelectedLead(null); }}
                  onResetCenter={() => {
                    if (!initialCenter) return
                    setFlyToCenter({ lat: initialCenter.lat, lng: initialCenter.lng, zoom: initialCenter.zoom })
                    setMapCenter({ lat: initialCenter.lat, lng: initialCenter.lng, zoom: initialCenter.zoom })
                  }}
                />
              )}

              {isCanvas && !immersive && (
                <>
                  <button
                    type="button"
                    className="prospect-mobile-settings-trigger"
                    onClick={() => setMobileMapSettingsOpen(true)}
                    aria-label="Configurar busca no mapa"
                    aria-expanded={mobileMapSettingsOpen}
                  >
                    <SlidersHorizontal size={16} />
                    <span>Ajustar busca</span>
                  </button>
                  {mobileMapSettingsOpen && (
                    <div className="prospect-mobile-settings-layer">
                      <button type="button" className="prospect-mobile-settings-backdrop" onClick={() => setMobileMapSettingsOpen(false)} aria-label="Fechar configurações" />
                      <section className="prospect-mobile-settings-sheet" aria-label="Configurações da busca">
                        <header className="prospect-mobile-settings-sheet__header">
                          <div>
                            <h3>Ajustar busca</h3>
                            <p>Altere o segmento, a cidade ou o alcance do radar.</p>
                          </div>
                          <button type="button" onClick={() => setMobileMapSettingsOpen(false)} aria-label="Fechar configurações"><X size={18} /></button>
                        </header>
                        <ProspectSearchControls compact placement="sheet" />
                      </section>
                    </div>
                  )}
                </>
              )}

              {selectedLead && !immersive && (
                <div className="prospect-lead-detail absolute top-14 right-3 z-40 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-5rem)] overflow-y-auto shadow-xl rounded-2xl">
                  <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
                </div>
              )}

              {immersive && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0a0a14]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl"
                  style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
                >
                  <button
                    type="button"
                    onClick={() => setAutoCapture(v => !v)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 ${
                      autoCapture
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.4)]'
                        : 'bg-white/[0.05] text-white/60 border border-white/10 hover:text-white'
                    }`}
                  >
                    {autoCapture ? <Zap size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
                    {autoCapture ? 'Auto-captura ON' : 'Auto-captura'}
                  </button>
                  <button
                    type="button"
                    onClick={captureBatch}
                    disabled={batchCapturing || newCount === 0}
                    title={newCount === 0 ? 'Nenhum lead novo' : `Capturar ${newCount} leads novos`}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/25 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {batchCapturing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} strokeWidth={2.5} />}
                    Captar ({newCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImmersive(false); setViewMode('list') }}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/[0.05] text-white/60 border border-white/10 hover:text-white transition flex items-center gap-1.5"
                  >
                    <List size={12} strokeWidth={2.5} /> Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setImmersive(false)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/[0.05] text-white/60 border border-white/10 hover:text-white transition flex items-center gap-1.5"
                  >
                    <Minimize2 size={12} strokeWidth={2.5} /> Sair
                  </button>
                </div>
              )}
              </div>
            )
            /* Portal no body no imersivo — iPad/Safari quebra fixed dentro de overflow/transform do canvas */
            return immersive && typeof document !== 'undefined'
              ? createPortal(mapShell, document.body)
              : mapShell
          })()}

          {/* List */}
          {viewMode === 'list' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filtered.map(lead => <LeadCard key={lead.id} lead={lead} />)}
            </div>
          )}
        </div>
      )}

      {!mapOnly && searched && !loading && leads.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
            <Users size={22} className="text-gray-400" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-semibold text-gray-900">Nenhum resultado</p>
          <p className="text-[12px] text-gray-500 mt-0.5">Tente outro segmento ou cidade</p>
        </div>
      )}

      {!searched && !mapOnly && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 grid place-items-center mb-4">
            <Sparkles size={22} className="text-white" strokeWidth={1.75} />
          </div>
          <h2 className="text-[18px] font-bold text-gray-900 tracking-tight mb-1.5">Encontre novos clientes</h2>
          <p className="text-[13px] text-gray-500 max-w-sm leading-relaxed">
            Defina <span className="font-semibold text-gray-700">segmento</span> e <span className="font-semibold text-gray-700">cidade</span> e clique em Buscar.
            Depois <span className="font-semibold text-gray-700">arraste o mapa</span> — o radar busca o novo centro automaticamente.
          </p>
        </div>
      )}

      {/* Modal Gerar Ideias com IA — aplica direto no form ao escolher uma combinacao */}
      <IdeaGeneratorModal
        open={ideasModalOpen}
        onClose={() => setIdeasModalOpen(false)}
        onApply={({ segment, city, radiusKm }) => {
          setQuery(segment)
          setLocation(city)
          setRadius(String(radiusKm))
          // IA só devolve texto — limpa coords pra forçar place search/geocode
          selectedPlaceRef.current = null
          setSelectedPlace(null)
        }}
      />
    </div>
  )
}


/* ── RADAR CARD (overlay no canto do mapa) ──
   Estilo dark futurista com glow verde. Mostra metricas live + acoes. */
function RadarCard({
  active,
  searching,
  found,
  inRange,
  newCount,
  newInRange,
  captured,
  capturedLive,
  today,
  total,
  center,
  initialCenter,
  radius,
  location,
  autoCapture,
  batchCapturing,
  lastRadarResult,
  onCaptureBatch,
  onShowAll,
  onResetCenter,
}: {
  active: boolean
  searching: boolean
  found: number
  inRange: number
  newCount: number
  newInRange: number
  captured: number
  capturedLive: number
  today: number
  total: number
  center: { lat: number; lng: number; zoom: number }
  initialCenter: { lat: number; lng: number; zoom: number; label: string } | null
  radius: number
  location: string
  autoCapture: boolean
  batchCapturing: boolean
  lastRadarResult: { count: number; at: number } | null
  onCaptureBatch: () => void
  onShowAll: () => void
  onResetCenter: () => void
}) {
  const radiusLabel = radius < 1 ? `${Math.round(radius * 1000)}m` : `${radius.toFixed(radius < 10 ? 1 : 0)}km`
  /* Detecta se o user moveu o mapa pra fora do centro inicial (tolerancia ~50m). */
  const movedFromInitial = !!initialCenter && (
    Math.abs(center.lat - initialCenter.lat) > 0.0005 ||
    Math.abs(center.lng - initialCenter.lng) > 0.0005
  )
  return (
    <div
      className="prospect-radar-card absolute top-3 left-3 z-30 w-[230px] rounded-2xl bg-[#0a0a14]/92 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
      style={{ boxShadow: active ? '0 0 0 1px rgba(52,211,153,0.25), 0 20px 40px -10px rgba(0,0,0,0.6)' : undefined }}
    >
      {/* Header */}
      <div className="prospect-radar-card__header flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          {active && (
            <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${searching ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          )}
          <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${
            active ? (searching ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]')
                   : 'bg-gray-500'
          }`} />
        </span>
        <span className={`text-[11px] font-bold tracking-wider uppercase ${active ? 'text-emerald-300' : 'text-gray-400'}`}>
          {active ? (searching ? 'Buscando' : 'Radar ativo') : 'Radar off'}
        </span>
      </div>

      {/* Metricas — destaque para "no raio" (numero grande). O numero apos a barra
          eh o acumulado da sessao (todos os pins ja mapeados, mesmo fora do raio
          atual). Isso resolve a confusao "tem 18 leads mas nenhum aqui no raio". */}
      <div className="prospect-radar-card__metrics grid grid-cols-3 gap-1 px-3.5 pb-2.5">
        <div className="text-center">
          <div className="text-[18px] font-bold text-white tabular-nums leading-none">
            {inRange}
            {found > inRange && <span className="text-[11px] font-semibold text-white/30"> /{found}</span>}
          </div>
          <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">No raio</div>
        </div>
        <div className="text-center">
          <div className={`text-[18px] font-bold tabular-nums leading-none ${newInRange > 0 ? 'text-rose-300' : 'text-white/40'}`}>
            {newInRange}
            {newCount > newInRange && <span className="text-[11px] font-semibold text-white/30"> /{newCount}</span>}
          </div>
          <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">Novos</div>
        </div>
        <div className="text-center">
          <div className="text-[18px] font-bold text-emerald-300 tabular-nums leading-none">{captured + capturedLive}</div>
          <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">Captados</div>
        </div>
      </div>

      {/* Feedback de busca vazia — quando o ultimo radar nesse centro voltou 0 resultados.
          Sinal claro de que o user precisa ajustar (mudar raio, mover pra outra regiao,
          ou voltar pra origem). */}
      {lastRadarResult && lastRadarResult.count === 0 && !searching && (
        <div className="prospect-radar-card__feedback mx-3.5 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/20">
          <p className="text-[10px] text-amber-200/90 leading-snug">
            Nenhum lead novo neste raio. Tente <span className="font-bold">aumentar o raio</span> ou
            {initialCenter ? <> <button type="button" onClick={onResetCenter} className="font-bold underline underline-offset-2 hover:text-amber-100">voltar para a origem</button>.</> : ' mover o mapa.'}
          </p>
        </div>
      )}

      {/* Acumulado total + hoje */}
      <div className="prospect-radar-card__totals grid grid-cols-2 gap-1 px-3.5 pb-2 border-t border-white/[0.06] pt-2">
        <div className="text-center">
          <div className="text-[14px] font-bold text-white tabular-nums leading-none">{today}</div>
          <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">Hoje</div>
        </div>
        <div className="text-center">
          <div className="text-[14px] font-bold text-white tabular-nums leading-none">{total}</div>
          <div className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">Total</div>
        </div>
      </div>

      {/* Origem (cidade que iniciou) + Centro atual (fonte da verdade do radar) */}
      <div className="prospect-radar-card__context px-3.5 pb-2 border-t border-white/[0.06] pt-2 space-y-1">
        {/* Origem — a cidade que o user digitou inicialmente */}
        {(initialCenter?.label || location) && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider shrink-0">Origem</span>
              <span className="text-[10px] text-white/60 font-medium truncate">{initialCenter?.label || location}</span>
            </div>
          </div>
        )}
        {/* Centro atual — fonte da verdade do radar (lat/lng do mapa) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1 h-1 rounded-full shrink-0 ${movedFromInitial ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]' : 'bg-white/30'}`} />
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider shrink-0">Centro</span>
            <span className="text-[10px] text-white/70 font-mono tabular-nums truncate">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </span>
            <span className="text-[9.5px] font-bold text-emerald-300 tabular-nums shrink-0">· {radiusLabel}</span>
          </div>
          {movedFromInitial && (
            <button
              type="button"
              onClick={onResetCenter}
              title="Voltar ao centro inicial"
              className="text-[9px] font-bold text-white/50 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition uppercase tracking-wider shrink-0"
            >
              voltar
            </button>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="prospect-radar-card__actions flex items-stretch gap-1.5 px-2.5 pb-2.5 pt-1">
        <button
          type="button"
          onClick={onShowAll}
          className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 text-[10px] font-bold uppercase tracking-wide border border-white/10 transition"
        >
          <Users size={11} strokeWidth={2.5} /> Todos
        </button>
        <button
          type="button"
          onClick={onCaptureBatch}
          disabled={batchCapturing || newCount === 0}
          title={newCount === 0 ? 'Nenhum lead novo para capturar' : `Capturar todos os ${newCount} novos leads agora`}
          className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-bold uppercase tracking-wide border border-emerald-400/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {batchCapturing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} strokeWidth={2.5} />}
          Captar ({newCount})
        </button>
      </div>
    </div>
  )
}

/* ── Lead Detail Panel (sidebar do mapa) ── */
function LeadDetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const isNew = lead.captureStatus === 'new'
  const [showWaSend, setShowWaSend] = useState(false)
  return (
    <div className="rounded-2xl border border-border-light bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-3.5 border-b border-border-light">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isNew
              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">NOVO</span>
              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white">CAPTADO</span>}
            {lead.rating > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                <Star size={9} className="text-amber-500 fill-amber-500" />
                {lead.rating.toFixed(1)}
                {lead.reviews > 0 && <span className="text-amber-600/70 font-medium ml-0.5">({lead.reviews})</span>}
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-bold text-gray-900 mt-1.5 leading-tight">{lead.name}</h3>
          {lead.category && <p className="text-[10px] text-gray-400 capitalize mt-0.5">{lead.category.replace(/_/g, ' ')}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3.5 space-y-2.5">
        {lead.phone && (
          <div className="flex items-center gap-2 text-[12px]">
            <Phone size={12} className="text-gray-400 shrink-0" />
            <span className="font-mono text-gray-700">{lead.phone}</span>
          </div>
        )}
        {lead.address && (
          <div className="flex items-start gap-2 text-[12px]">
            <MapPin size={12} className="text-gray-400 shrink-0 mt-0.5" />
            <span className="text-gray-700">{lead.address}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-2 text-[12px]">
            <Globe size={12} className="text-gray-400 shrink-0" />
            <a href={lead.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{lead.website}</a>
          </div>
        )}
      </div>

      <div className="px-3.5 pb-3.5 space-y-1.5">
        {lead.phone && (
          <button
            type="button"
            onClick={() => setShowWaSend(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition"
          >
            <Send size={11} /> Enviar mensagem pelo WhatsApp
          </button>
        )}
        <div className="flex gap-1.5">
          {lead.phone && (
            <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-semibold hover:bg-gray-200 transition">
              <Phone size={11} /> Abrir conversa
            </a>
          )}
          {lead.googleMapsUri && (
            <a href={lead.googleMapsUri} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-semibold hover:bg-gray-200 transition">
              <Navigation size={11} /> Maps
            </a>
          )}
        </div>
      </div>

      {showWaSend && (
        <WhatsAppSendModal
          leads={[{
            name: lead.name,
            phone: lead.phone,
            category: lead.category,
            google_rating: lead.rating,
          }]}
          onClose={() => setShowWaSend(false)}
        />
      )}
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
        {lead.phone && <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 transition"><WhatsAppIcon size={11} className="brand-icon--wa" /> WhatsApp</a>}
        {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 transition"><Globe size={11} /> Site</a>}
        {lead.googleMapsUri && <a href={lead.googleMapsUri} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition"><Navigation size={11} /> Maps</a>}
      </div>
    </div>
  )
}
