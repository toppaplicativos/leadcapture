/**
 * Operational live map for Lead Capture Mob (Leaflet + Carto light tiles).
 * Shows couriers (by ops status) and active deliveries with pickup/dropoff.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { STATUS_LABELS } from '@/lib/api-mob'

export type MobMapCourier = {
  courier_id: string
  full_name?: string
  ops_status?: string
  last_lat?: number | null
  last_lng?: number | null
  last_location_at?: string | null
  phone?: string | null
  photo_url?: string | null
}

export type MobMapDelivery = {
  id: string
  status?: string
  customer_name?: string | null
  pickup_lat?: number | null
  pickup_lng?: number | null
  dropoff_lat?: number | null
  dropoff_lng?: number | null
  dropoff_address?: string | null
  courier_name?: string | null
  courier_lat?: number | null
  courier_lng?: number | null
}

export type MobMapRoute = {
  id: string
  courier_id?: string | null
  courier_name?: string | null
  status?: string
  total_distance_km?: number | null
  stops?: Array<{
    id: string
    stop_order?: number
    stop_type?: string
    status?: string
    lat?: number | null
    lng?: number | null
    label?: string | null
  }>
}

type Props = {
  couriers: MobMapCourier[]
  deliveries: MobMapDelivery[]
  routes?: MobMapRoute[]
  origin?: { lat: number; lng: number; label?: string } | null
  className?: string
  height?: number
  onSelectCourier?: (c: MobMapCourier) => void
  onSelectDelivery?: (d: MobMapDelivery) => void
}

function opsColor(ops?: string): string {
  if (ops === 'available') return '#10b981'
  if (ops === 'busy') return '#f59e0b'
  return '#9a9a9a'
}

function statusColor(status?: string): string {
  if (status === 'delivered') return '#10b981'
  if (status === 'cancelled') return '#ef4444'
  if (status === 'en_route' || status === 'near_destination' || status === 'at_destination') return '#3b82f6'
  return '#171717'
}

function divIcon(html: string, size = 28): L.DivIcon {
  return L.divIcon({
    className: 'mob-map-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function MobOperationalMap({
  couriers,
  deliveries,
  routes = [],
  origin,
  className = '',
  height = 420,
  onSelectCourier,
  onSelectDelivery,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selected, setSelected] = useState<{
    type: 'courier' | 'delivery'
    title: string
    subtitle?: string
    meta?: string
  } | null>(null)

  const points = useMemo(() => {
    const pts: Array<[number, number]> = []
    if (origin?.lat != null && origin?.lng != null) pts.push([origin.lat, origin.lng])
    for (const c of couriers) {
      if (c.last_lat != null && c.last_lng != null) pts.push([Number(c.last_lat), Number(c.last_lng)])
    }
    for (const d of deliveries) {
      if (d.dropoff_lat != null && d.dropoff_lng != null) pts.push([Number(d.dropoff_lat), Number(d.dropoff_lng)])
      if (d.pickup_lat != null && d.pickup_lng != null) pts.push([Number(d.pickup_lat), Number(d.pickup_lng)])
      if (d.courier_lat != null && d.courier_lng != null) pts.push([Number(d.courier_lat), Number(d.courier_lng)])
    }
    for (const r of routes) {
      for (const s of r.stops || []) {
        if (s.lat != null && s.lng != null) pts.push([Number(s.lat), Number(s.lng)])
      }
    }
    return pts
  }, [couriers, deliveries, origin, routes])

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    if (el.clientWidth < 8 || el.clientHeight < 8) return

    const map = L.map(el, {
      center: [-15.78, -47.93],
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer

    const ro = new ResizeObserver(() => {
      map.invalidateSize()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    if (origin?.lat != null && origin?.lng != null) {
      const m = L.marker([origin.lat, origin.lng], {
        icon: divIcon(
          `<div style="width:26px;height:26px;border-radius:8px;background:#171717;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.2);display:grid;place-items:center;color:#fff;font:700 10px Inter,sans-serif">O</div>`,
          26,
        ),
      }).addTo(layer)
      m.bindTooltip(origin.label || 'Origem', { direction: 'top', offset: [0, -8] })
    }

    for (const c of couriers) {
      if (c.last_lat == null || c.last_lng == null) continue
      const color = opsColor(c.ops_status)
      const m = L.marker([Number(c.last_lat), Number(c.last_lng)], {
        icon: divIcon(
          `<div style="width:28px;height:28px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.18);display:grid;place-items:center;color:#fff;font:700 11px Inter,sans-serif">${String(c.full_name || '?').charAt(0).toUpperCase()}</div>`,
          28,
        ),
      }).addTo(layer)
      m.bindTooltip(c.full_name || 'Entregador', { direction: 'top', offset: [0, -10] })
      m.on('click', () => {
        setSelected({
          type: 'courier',
          title: c.full_name || 'Entregador',
          subtitle:
            c.ops_status === 'available'
              ? 'Disponível'
              : c.ops_status === 'busy'
                ? 'Ocupado'
                : 'Offline',
          meta: c.last_location_at
            ? `GPS ${new Date(c.last_location_at).toLocaleTimeString('pt-BR')}`
            : undefined,
        })
        onSelectCourier?.(c)
      })
    }

    for (const d of deliveries) {
      const lat = d.dropoff_lat ?? d.pickup_lat
      const lng = d.dropoff_lng ?? d.pickup_lng
      if (lat == null || lng == null) continue
      const color = statusColor(d.status)
      const m = L.marker([Number(lat), Number(lng)], {
        icon: divIcon(
          `<div style="width:22px;height:22px;border-radius:6px;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.16)"></div>`,
          22,
        ),
      }).addTo(layer)
      m.bindTooltip(d.customer_name || 'Corrida', { direction: 'top', offset: [0, -8] })
      m.on('click', () => {
        setSelected({
          type: 'delivery',
          title: d.customer_name || 'Corrida',
          subtitle: STATUS_LABELS[d.status || ''] || d.status,
          meta: d.courier_name ? `Entregador: ${d.courier_name}` : d.dropoff_address || undefined,
        })
        onSelectDelivery?.(d)
      })

      if (
        d.pickup_lat != null &&
        d.pickup_lng != null &&
        d.dropoff_lat != null &&
        d.dropoff_lng != null
      ) {
        L.polyline(
          [
            [Number(d.pickup_lat), Number(d.pickup_lng)],
            [Number(d.dropoff_lat), Number(d.dropoff_lng)],
          ],
          { color: '#171717', weight: 2, opacity: 0.2, dashArray: '4 6' },
        ).addTo(layer)
      }
    }

    // Multi-stop route polylines + numbered pins
    const routeColors = ['#2563eb', '#7c3aed', '#db2777', '#0d9488', '#ea580c']
    routes.forEach((r, ri) => {
      const color = routeColors[ri % routeColors.length]
      const path: Array<[number, number]> = []
      for (const s of r.stops || []) {
        if (s.lat == null || s.lng == null) continue
        path.push([Number(s.lat), Number(s.lng)])
        const n = (s.stop_order ?? 0) + 1
        const done = s.status === 'completed'
        L.marker([Number(s.lat), Number(s.lng)], {
          icon: divIcon(
            `<div style="width:24px;height:24px;border-radius:8px;background:${done ? '#9a9a9a' : color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.18);display:grid;place-items:center;color:#fff;font:700 10px Inter,sans-serif">${n}</div>`,
            24,
          ),
        })
          .addTo(layer)
          .bindTooltip(
            `${r.courier_name || 'Rota'} · ${s.stop_type === 'pickup' ? 'Coleta' : 'Entrega'} #${n}`,
            { direction: 'top', offset: [0, -8] },
          )
      }
      if (path.length >= 2) {
        L.polyline(path, { color, weight: 3, opacity: 0.75 }).addTo(layer)
      }
    })

    if (points.length === 1) {
      map.setView(points[0], 14)
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 })
    }
  }, [couriers, deliveries, routes, origin, points, onSelectCourier, onSelectDelivery])

  const online = couriers.filter((c) => c.ops_status === 'available' || c.ops_status === 'busy').length
  const withGps = couriers.filter((c) => c.last_lat != null && c.last_lng != null).length

  return (
    <div className={className}>
      <div className="relative rounded-2xl overflow-hidden border border-border bg-white shadow-card">
        <div
          ref={containerRef}
          className="w-full leaflet-container"
          style={{ height }}
          role="img"
          aria-label="Mapa operacional de corridas"
        />

        <div className="absolute top-3 left-3 z-[500] flex flex-wrap gap-1.5 pointer-events-none">
          <span className="px-2 py-1 rounded-lg bg-white/95 border border-border text-[11px] font-semibold text-gray-700 shadow-sm">
            {online} online
          </span>
          <span className="px-2 py-1 rounded-lg bg-white/95 border border-border text-[11px] font-semibold text-gray-700 shadow-sm">
            {withGps} com GPS
          </span>
          <span className="px-2 py-1 rounded-lg bg-white/95 border border-border text-[11px] font-semibold text-gray-700 shadow-sm">
            {deliveries.length} ativas
          </span>
        </div>

        <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 pointer-events-none">
          {[
            { c: '#10b981', l: 'Disponível' },
            { c: '#f59e0b', l: 'Ocupado' },
            { c: '#9a9a9a', l: 'Offline' },
            { c: '#3b82f6', l: 'Em rota' },
          ].map((x) => (
            <span
              key={x.l}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/95 border border-border text-[10px] font-semibold text-gray-600 shadow-sm"
            >
              <span className="w-2 h-2 rounded-full" style={{ background: x.c }} />
              {x.l}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-card">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            {selected.type === 'courier' ? 'Entregador' : 'Corrida'}
          </p>
          <p className="text-sm font-bold text-gray-900 mt-0.5">{selected.title}</p>
          {selected.subtitle && <p className="text-xs text-gray-600 mt-0.5">{selected.subtitle}</p>}
          {selected.meta && <p className="text-[11px] text-gray-400 mt-1">{selected.meta}</p>}
        </div>
      )}

      {!points.length && (
        <p className="mt-2 text-xs text-gray-500">
          Sem coordenadas ainda. Quando entregadores ficarem online com GPS ou corridas tiverem lat/lng, o mapa preenche.
        </p>
      )}
    </div>
  )
}
