/**
 * Compact route map for the courier active delivery screen.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  pickup?: { lat: number; lng: number; label?: string } | null
  dropoff?: { lat: number; lng: number; label?: string } | null
  me?: { lat: number; lng: number } | null
  height?: number
  className?: string
}

function pin(color: string, letter: string) {
  return L.divIcon({
    className: 'mob-route-pin',
    html: `<div style="width:28px;height:28px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.2);display:grid;place-items:center;color:#fff;font:700 11px Inter,sans-serif">${letter}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function MobCourierRouteMap({
  pickup,
  dropoff,
  me,
  height = 200,
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || mapRef.current) return
    if (el.clientWidth < 8) return

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const ro = new ResizeObserver(() => map.invalidateSize())
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

    const pts: Array<[number, number]> = []
    if (pickup) {
      pts.push([pickup.lat, pickup.lng])
      L.marker([pickup.lat, pickup.lng], { icon: pin('#171717', 'C') })
        .addTo(layer)
        .bindTooltip(pickup.label || 'Coleta')
    }
    if (dropoff) {
      pts.push([dropoff.lat, dropoff.lng])
      L.marker([dropoff.lat, dropoff.lng], { icon: pin('#3b82f6', 'D') })
        .addTo(layer)
        .bindTooltip(dropoff.label || 'Destino')
    }
    if (me) {
      pts.push([me.lat, me.lng])
      L.marker([me.lat, me.lng], { icon: pin('#10b981', 'Eu') }).addTo(layer)
    }
    if (pickup && dropoff) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        { color: '#171717', weight: 3, opacity: 0.35, dashArray: '6 8' },
      ).addTo(layer)
    }
    if (pts.length === 1) map.setView(pts[0], 15)
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 })
  }, [pickup, dropoff, me])

  const hasCoords = !!(pickup || dropoff || me)
  if (!hasCoords) {
    return (
      <div
        className={`rounded-2xl border border-border bg-gray-50 grid place-items-center text-xs text-gray-500 ${className}`}
        style={{ height }}
      >
        Sem coordenadas para o mapa — use Navegar no Google Maps
      </div>
    )
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-border ${className}`}>
      <div ref={ref} style={{ height }} className="w-full" />
    </div>
  )
}
