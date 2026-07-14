/**
 * PanfleteiroMapMapbox — réplica do Radar do topp-aplicativos, mas em Mapbox GL JS.
 *
 * Recursos:
 *  - Tiles dark style (mapbox://styles/mapbox/dark-v11) com fallback se sem token
 *  - Mira fixa central (overlay HTML com cruzeta + glow verde)
 *  - Círculo de raio dinâmico ao redor do centro
 *  - Markers com cores por captureStatus + prospect_status
 *  - Pulse animation em pin recém-capturado
 *  - flyTo no pin clicado
 *  - Popup nativo Mapbox + callback de click
 *  - Resize após mount (4 invalidateSize em cascata pra mapa fullscreen)
 *
 * O token vem de import.meta.env.VITE_MAPBOX_TOKEN. Se ausente, usa CARTO via
 * raster source (mesma estética dark do topp, sem custo / sem token).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface PanfleteiroPlace {
  id: string
  name: string
  phone?: string
  address?: string
  rating?: number
  reviews?: number
  category?: string
  website?: string
  googleMapsUri?: string
  location?: { latitude: number; longitude: number } | null
  captureStatus: 'new' | 'captured'
  prospectStatus?: 'new' | 'contacted' | 'responded' | 'meeting' | 'proposal' | 'won' | 'lost' | 'not_interested' | null
  /** Pin fora do raio atual do radar — renderizado com opacity baixa pra contexto */
  outOfRange?: boolean
}

interface Props {
  /** Centro inicial */
  initialCenter: { lat: number; lng: number; zoom?: number }
  /** Raio em metros, desenhado em volta do centro do mapa */
  radius: number
  /** Lista de pins */
  places: PanfleteiroPlace[]
  /** IDs recém-capturados (animação pulse) */
  recentlyCapturedIds?: string[]
  /** Disparado quando o user move o mapa (debounce 800ms) */
  onCenterChanged?: (center: { lat: number; lng: number; zoom: number }) => void
  /** Disparado ao clicar em um pin */
  onPlaceClick?: (place: PanfleteiroPlace) => void
  /** Altura do mapa (CSS) */
  height?: string
  /** Modo imersivo (afeta z-index e sizing) */
  immersive?: boolean
  /** Toggle dark/light */
  theme?: 'dark' | 'light'
  /** Texto/badge de status no topo (ex: "Radar Ativo", "Buscando...") */
  statusBadge?: { label: string; tone: 'idle' | 'searching' | 'done' } | null
  /** Quando muda de referência, voa pra esse centro (lat/lng/zoom). key força re-fly. */
  flyToCenter?: { lat: number; lng: number; zoom?: number; key?: number } | null
}

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || ''

function statusColor(p: PanfleteiroPlace): string {
  if (p.captureStatus !== 'captured') return '#ef4444' // vermelho — não captado
  const s = p.prospectStatus || 'new'
  switch (s) {
    case 'new': return '#3b82f6' // azul
    case 'contacted': return '#eab308' // amarelo
    case 'responded': return '#f97316' // laranja
    case 'meeting':
    case 'proposal': return '#a855f7' // roxo
    case 'won': return '#22c55e' // verde
    case 'lost':
    case 'not_interested': return '#6b7280' // cinza
    default: return '#3b82f6'
  }
}

export function PanfleteiroMapMapbox({
  initialCenter,
  radius,
  places,
  recentlyCapturedIds = [],
  onCenterChanged,
  onPlaceClick,
  height = '500px',
  immersive = false,
  theme = 'dark',
  statusBadge = null,
  flyToCenter = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map())
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapReady, setMapReady] = useState(false)
  /** Só dispara onCenterChanged após interação do usuário (não em load/flyTo/resize). */
  const userMovedRef = useRef(false)
  const ignoreMoveEndUntilRef = useRef(0)
  const lastEmittedCenterRef = useRef<{ lat: number; lng: number } | null>(null)

  /* Refs pros callbacks — evita stale closure quando o handler moveend (registrado
     no mount uma unica vez) precisa chamar callback que recebeu props novos. */
  const onCenterChangedRef = useRef(onCenterChanged)
  const onPlaceClickRef = useRef(onPlaceClick)
  useEffect(() => { onCenterChangedRef.current = onCenterChanged }, [onCenterChanged])
  useEffect(() => { onPlaceClickRef.current = onPlaceClick }, [onPlaceClick])

  /* ─── Inicializa o mapa ────────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const styleSpec: any = MAPBOX_TOKEN
      ? (theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11')
      : {
          /* Fallback sem token: tiles CARTO raster (mesma estetica do topp) */
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
                'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution: '© CARTO © OpenStreetMap',
            },
            'carto-labels': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
                'https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
            },
          },
          layers: [
            { id: 'carto-dark-layer', type: 'raster', source: 'carto-dark' },
            { id: 'carto-labels-layer', type: 'raster', source: 'carto-labels' },
          ],
        }

    if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleSpec,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: initialCenter.zoom ?? 14,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      /* Source do anel principal de raio (perimetro fixo) */
      if (!map.getSource('radius-source')) {
        map.addSource('radius-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        /* Gradiente radial: fill mais forte no centro, esmaece pra borda.
           Mapbox nao tem radial-gradient nativo em fill, simulamos com 3 layers
           concentricos de opacidades diferentes (source separado pra cada). */
        map.addLayer({
          id: 'radius-fill',
          type: 'fill',
          source: 'radius-source',
          paint: { 'fill-color': '#00ffaa', 'fill-opacity': 0.08 },
        })
        map.addLayer({
          id: 'radius-line',
          type: 'line',
          source: 'radius-source',
          paint: {
            'line-color': '#00ffaa',
            'line-width': 2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
            'line-blur': 0.5,
          },
        })
      }
      /* Source separado pro pulse animado (ring expandindo) */
      if (!map.getSource('radar-pulse-source')) {
        map.addSource('radar-pulse-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'radar-pulse-line',
          type: 'line',
          source: 'radar-pulse-source',
          paint: {
            'line-color': '#00ffaa',
            'line-width': 2,
            'line-opacity': 0.5,
          },
        })
      }
      setMapReady(true)
    })

    const markUserMove = () => {
      userMovedRef.current = true
    }
    map.on('dragstart', markUserMove)
    map.on('zoomstart', (e) => {
      // zoom por gesto do usuário (não programático)
      if ((e as any)?.originalEvent) markUserMove()
    })

    map.on('moveend', () => {
      if (Date.now() < ignoreMoveEndUntilRef.current) return
      if (!userMovedRef.current) return
      if (moveTimer.current) clearTimeout(moveTimer.current)
      moveTimer.current = setTimeout(() => {
        const c = map.getCenter()
        const prev = lastEmittedCenterRef.current
        // ignora micro-movimentos (resize/tiles) — ~120m (reduz stress do radar)
        if (prev) {
          const dLat = Math.abs(prev.lat - c.lat)
          const dLng = Math.abs(prev.lng - c.lng)
          if (dLat < 0.0011 && dLng < 0.0011) return
        }
        lastEmittedCenterRef.current = { lat: c.lat, lng: c.lng }
        userMovedRef.current = false
        onCenterChangedRef.current?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
      }, 1100)
    })

    mapRef.current = map

    /* Resize cascata — corrige render quando o container tem tamanho dinamico */
    const sizes = [50, 200, 500, 900]
    sizes.forEach((ms) => setTimeout(() => map.resize(), ms))

    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current)
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─── flyTo quando flyToCenter muda (ex: depois de busca em outra cidade) ─ */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !flyToCenter) return
    const { lat, lng, zoom } = flyToCenter
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (lat === 0 && lng === 0) return
    // flyTo dispara moveend — não deve re-disparar radar no centro antigo/novo automaticamente
    ignoreMoveEndUntilRef.current = Date.now() + 1800
    userMovedRef.current = false
    lastEmittedCenterRef.current = { lat, lng }
    /* jumpTo se o delta for grande — mais confiável que flyTo em iPad ao trocar cidade */
    const cur = map.getCenter()
    const bigJump = Math.abs(cur.lat - lat) > 0.08 || Math.abs(cur.lng - lng) > 0.08
    const z = Number.isFinite(zoom) ? (zoom as number) : Math.max(map.getZoom(), 13)
    if (bigJump) {
      map.jumpTo({ center: [lng, lat], zoom: z })
      requestAnimationFrame(() => { try { map.resize() } catch { /* */ } })
    } else {
      map.flyTo({
        center: [lng, lat],
        zoom: z,
        duration: 900,
        essential: true,
      })
    }
  }, [flyToCenter?.lat, flyToCenter?.lng, flyToCenter?.zoom, flyToCenter?.key, mapReady])

  /* ─── Resize cascata quando immersive/height mudam — Mapbox precisa
   *     re-medir o container que mudou de tamanho (crítico no iPad imersivo). */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const delays = [0, 50, 150, 350, 700, 1200]
    const timers = delays.map((ms) => setTimeout(() => {
      try { map.resize() } catch { /* ignora */ }
    }, ms))
    const onWin = () => { try { map.resize() } catch { /* ignore */ } }
    window.addEventListener('resize', onWin)
    window.visualViewport?.addEventListener('resize', onWin)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onWin)
      window.visualViewport?.removeEventListener('resize', onWin)
    }
  }, [immersive, height])

  /* ─── ResizeObserver no container — garante que o canvas do Mapbox acompanha
   *     mudancas de layout do pai (ex: o pai entra em cena depois do mount, ou
   *     muda altura por flex/grid). Sem isso, o canvas fica com tamanho do
   *     momento do mount e os markers ficam desalinhados. */
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !el) return
    let raf: number | null = null
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        try { map.resize() } catch { /* ignora */ }
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [mapReady])

  /* ─── Atualiza círculo de raio sempre que radius ou center mudam ──── */
  const updateRadiusCircle = useCallback(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const c = map.getCenter()
    const polygon = makeCircleGeoJson(c.lat, c.lng, radius)
    const src = map.getSource('radius-source') as mapboxgl.GeoJSONSource | undefined
    if (src) src.setData(polygon as any)
  }, [radius, mapReady])

  /* ─── Pulse animado: ring que expande do centro ate o raio configurado, em loop.
   *     Roda apenas quando radar esta "searching"/"active" (statusBadge ativo). */
  const isRadarActive = !!statusBadge && (statusBadge.tone === 'searching' || statusBadge.tone === 'done')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('radar-pulse-source') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    if (!isRadarActive) {
      src.setData({ type: 'FeatureCollection', features: [] } as any)
      return
    }
    let raf: number
    let start = performance.now()
    const duration = 1800
    const tick = (now: number) => {
      const t = ((now - start) % duration) / duration
      const c = map.getCenter()
      /* Easing out-cubic */
      const eased = 1 - Math.pow(1 - t, 3)
      const r = Math.max(50, radius * eased)
      const polygon = makeCircleGeoJson(c.lat, c.lng, r)
      try {
        src.setData(polygon as any)
        /* Fade out conforme expande */
        if (map.getLayer('radar-pulse-line')) {
          map.setPaintProperty('radar-pulse-line', 'line-opacity', (1 - t) * 0.55)
          map.setPaintProperty('radar-pulse-line', 'line-width', 1.5 + (1 - t) * 1.5)
        }
      } catch { /* ignora durante teardown */ }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      try { src.setData({ type: 'FeatureCollection', features: [] } as any) } catch {}
    }
  }, [isRadarActive, radius, mapReady])

  useEffect(() => {
    updateRadiusCircle()
    const map = mapRef.current
    if (!map) return
    const handler = () => updateRadiusCircle()
    map.on('move', handler)
    return () => { map.off('move', handler) }
  }, [updateRadiusCircle])

  /* ─── Sincroniza markers ─────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const validIds = new Set(places.map((p) => p.id).filter(Boolean))

    /* Remove markers que sumiram */
    for (const [id, marker] of markersRef.current.entries()) {
      if (!validIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    /* Adiciona/atualiza markers — filtro reforcado:
       - latitude/longitude precisam ser numeros finitos
       - rejeita (0,0) que e Google Places sem location
       - rejeita fora do range valido (-90..90, -180..180)

       IMPORTANTE: nao usar marker.getElement().replaceWith(el) — isso deixa o
       mapbox.Marker apontando pro elemento ANTIGO (orfao do DOM). Mapbox aplica
       transform no elemento que ele guardou na criacao; trocar via replaceWith
       quebra: o novo el visivel fica SEM transform e os pins colam no canto. */
    for (const place of places) {
      const la = Number(place.location?.latitude)
      const ln = Number(place.location?.longitude)
      if (!Number.isFinite(la) || !Number.isFinite(ln)) continue
      if (la === 0 && ln === 0) continue
      if (la < -90 || la > 90 || ln < -180 || ln > 180) continue

      let marker = markersRef.current.get(place.id)
      const coords: [number, number] = [ln, la]
      const pulse = recentlyCapturedIds.includes(place.id)

      if (marker) {
        /* Atualiza posicao e re-pinta o conteudo do MESMO elemento (sem replaceWith).
           Reaplicamos o innerHTML pra refletir mudancas de status/pulse. */
        marker.setLngLat(coords)
        const existing = marker.getElement() as HTMLDivElement
        repaintMarkerEl(existing, place, pulse)
      } else {
        const el = makeMarkerEl(place, pulse)
        marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coords)
          .addTo(map)
        markersRef.current.set(place.id, marker)
      }

      /* Click handler — sempre no elemento atual do marker.
         Limpamos handler anterior via cloning seria caro; usamos um delegate via
         dataset pra evitar duplicar listeners. */
      const liveEl = marker.getElement() as HTMLDivElement
      if (!liveEl.dataset.clickWired) {
        liveEl.dataset.clickWired = '1'
        liveEl.addEventListener('click', (ev) => {
          ev.stopPropagation()
          const pl = (liveEl as any).__place as PanfleteiroPlace | undefined
          if (!pl) return
          const c = pl.location
          if (!c) return
          map.flyTo({
            center: [Number(c.longitude), Number(c.latitude)],
            zoom: Math.max(map.getZoom(), 16),
            duration: 700,
          })
          onPlaceClickRef.current?.(pl)
        })
      }
      ;(liveEl as any).__place = place
    }
  }, [places, recentlyCapturedIds, mapReady, onPlaceClick])

  /* Wrapper: em modo imersivo preenche o pai (que ja é fixed inset-0 sem padding).
     Caso contrario usa a `height` informada. Tudo absolute aqui dentro tem como
     referencia ESSE wrapper — entao a mira fica SEMPRE centrada no mapa. */
  return (
    <div className="relative w-full" style={{ height: immersive ? '100%' : height }}>
      {/* Inline style necessario: .mapboxgl-map (CSS do SDK) tem `position: relative`
          e bate em especificidade com Tailwind .absolute, ganhando por ordem.
          Inline style sempre vence — garante o container ocupando o pai inteiro. */}
      <div
        ref={containerRef}
        className="rounded-2xl overflow-hidden"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Mira central — overlay alinhado ao mapa (mesmo wrapper) */}
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{ inset: 0, zIndex: 10 }}
      >
        <div className="relative w-10 h-10">
          {/* Cruzeta */}
          <div className="absolute top-1/2 left-0 w-full h-px bg-[#00ffaa] opacity-80 shadow-[0_0_8px_#00ffaa]" style={{ transform: 'translateY(-50%)' }} />
          <div className="absolute left-1/2 top-0 h-full w-px bg-[#00ffaa] opacity-80 shadow-[0_0_8px_#00ffaa]" style={{ transform: 'translateX(-50%)' }} />
          {/* Anel central */}
          <div className="absolute inset-3 rounded-full border border-[#00ffaa] opacity-70 shadow-[0_0_10px_rgba(0,255,170,0.6)]" />
        </div>
      </div>

      {/* Status badge — verde pulsante quando radar ativo (searching/done),
          amber quando buscando, cinza so se 'idle' (panfleteiro off / sem state). */}
      {statusBadge && (
        <div
          className="panfleteiro-status-badge absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-2 border border-white/10"
          style={{ zIndex: 15 }}
        >
          <span className="relative flex w-2.5 h-2.5">
            {statusBadge.tone !== 'idle' && (
              <span
                className={`absolute inset-0 rounded-full opacity-75 animate-ping ${
                  statusBadge.tone === 'searching' ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
            )}
            <span
              className={`relative inline-flex w-2.5 h-2.5 rounded-full ${
                statusBadge.tone === 'searching'
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : statusBadge.tone === 'done'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-gray-400'
              }`}
            />
          </span>
          {statusBadge.label}
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function markerInnerHtml(place: PanfleteiroPlace, pulse: boolean): string {
  const color = statusColor(place)
  /* outOfRange: pin esmaecido — usuario sabe que esse lead foi captado em outro
     ponto e nao esta na area do radar atual. */
  const opacity = place.outOfRange ? '0.28' : '1'
  const shadowAlpha = place.outOfRange ? '20' : '80'
  /* IMPORTANTE: NAO usar filter:blur no glow — em containers transformados pelo
     Mapbox (translate3d), o filter vaza horizontalmente criando "scan lines".
     Glow via box-shadow é renderizado direito. */
  return `
    ${pulse ? `<span style="position:absolute;inset:-14px;border-radius:50%;border:2px solid ${color};opacity:0.7;animation:panfleteiroRing 1.4s ease-out 2"></span>` : ''}
    <div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: ${color};
      border: 2.5px solid white;
      box-shadow:
        0 0 0 1px rgba(0,0,0,0.5),
        0 0 6px 2px ${color}${shadowAlpha},
        0 3px 8px rgba(0,0,0,0.45);
      opacity: ${opacity};
      transition: opacity 200ms, transform 120ms;
    "></div>
  `
}

function ensureKeyframes() {
  if (document.getElementById('panfleteiro-keyframes')) return
  const style = document.createElement('style')
  style.id = 'panfleteiro-keyframes'
  style.textContent = `
    @keyframes panfleteiroRing {
      0% { transform: scale(0.5); opacity: 0.9; }
      100% { transform: scale(2); opacity: 0; }
    }
    .panfleteiro-marker:hover > div { transform: scale(1.15); }
  `
  document.head.appendChild(style)
}

function makeMarkerEl(place: PanfleteiroPlace, pulse: boolean): HTMLDivElement {
  ensureKeyframes()
  const wrap = document.createElement('div')
  wrap.className = 'panfleteiro-marker'
  /* NAO definir `position` aqui — o Mapbox aplica `position: absolute; top: 0;
     left: 0;` via class `.mapboxgl-marker` e o transform que ele aplica depende
     disso. Sobrescrever com `position: relative` quebra o reposicionamento
     ao mover/zoomar o mapa (pins ficam grudados no canto). */
  wrap.style.cursor = 'pointer'
  wrap.innerHTML = markerInnerHtml(place, pulse)
  return wrap
}

/** Re-pinta o conteudo do elemento sem destruir o no — preserva ref que o
 *  mapbox.Marker guardou no construtor (transform aplicado por ele continua valido). */
function repaintMarkerEl(el: HTMLDivElement, place: PanfleteiroPlace, pulse: boolean) {
  el.innerHTML = markerInnerHtml(place, pulse)
}

/** Aproxima um círculo geodésico por polígono (64 vértices). */
function makeCircleGeoJson(lat: number, lng: number, radiusMeters: number) {
  const points = 64
  const earthRadius = 6378137
  const latRad = (lat * Math.PI) / 180
  const coords: [number, number][] = []
  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points
    const angleRad = (angle * Math.PI) / 180
    const dx = (radiusMeters * Math.cos(angleRad)) / (earthRadius * Math.cos(latRad)) * (180 / Math.PI)
    const dy = (radiusMeters * Math.sin(angleRad)) / earthRadius * (180 / Math.PI)
    coords.push([lng + dx, lat + dy])
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }],
  }
}
