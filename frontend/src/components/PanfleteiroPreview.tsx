import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Crosshair, Zap } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

interface PanfleteiroPreviewProps {
  /** Visual variant: 'hero' = wider 16/9, 'feature' = squarer */
  variant?: 'hero' | 'feature'
  className?: string
}

const PINS: Array<{ offset: [number, number]; label: string; status: 'new' | 'captured' }> = [
  { offset: [0.0018, -0.0028], label: 'Restaurante Vila Mariana', status: 'new' },
  { offset: [-0.0014, 0.0022], label: 'Pizzaria Bella Roma', status: 'new' },
  { offset: [0.0028, 0.0018], label: 'Hortifruti do Bairro', status: 'captured' },
  { offset: [-0.0024, -0.0016], label: 'Padaria Central', status: 'new' },
  { offset: [0.0010, 0.0036], label: 'Açougue Premium', status: 'new' },
  { offset: [-0.0034, 0.0008], label: 'Lanchonete 24h', status: 'captured' },
  { offset: [0.0036, -0.0010], label: 'Empório Saudável', status: 'new' },
  { offset: [-0.0008, -0.0032], label: 'Sorveteria Italiana', status: 'new' },
  { offset: [0.0030, 0.0030], label: 'Cafeteria Central', status: 'new' },
  { offset: [-0.0030, -0.0030], label: 'Mercado do Bairro', status: 'new' },
]

const CENTER: [number, number] = [-23.5615, -46.6562] // São Paulo, Av. Paulista area

/** Waypoints leves para simular o pan do modo Panfleteiro */
const PAN_PATH: [number, number][] = [
  CENTER,
  [CENTER[0] + 0.0012, CENTER[1] - 0.0016],
  [CENTER[0] - 0.0008, CENTER[1] + 0.0020],
  [CENTER[0] + 0.0016, CENTER[1] + 0.0010],
  [CENTER[0] - 0.0014, CENTER[1] - 0.0006],
  CENTER,
]

export function PanfleteiroPreview({ variant = 'hero', className = '' }: PanfleteiroPreviewProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [counter, setCounter] = useState(0)
  const [latestCaptured, setLatestCaptured] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  /* Init Leaflet só quando a seção entra no viewport (evita tiles cinza com size 0) */
  useEffect(() => {
    const shell = shellRef.current
    const container = containerRef.current
    if (!shell || !container) return

    let cancelled = false
    let resizeObs: ResizeObserver | null = null
    let panTimer: ReturnType<typeof setInterval> | null = null
    let panIdx = 0
    let reduceMotion = false

    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* ignore */
    }

    const boot = () => {
      if (cancelled || mapRef.current || !containerRef.current) return

      const el = containerRef.current
      // Garante altura/largura reais antes do Leaflet medir
      if (el.clientWidth < 8 || el.clientHeight < 8) return

      const map = L.map(el, {
        center: CENTER,
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        dragging: false,
        touchZoom: false,
        keyboard: false,
        boxZoom: false,
        preferCanvas: true,
      })

      // CDN atual do Carto (dark) — tiles estáveis sem token
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        // r=@2x em telas retina
      }).addTo(map)

      const centerEl = L.divIcon({
        className: 'panf-radar-icon',
        html: `<div class="radar-pulse"><span></span></div>`,
        iconSize: [80, 80],
        iconAnchor: [40, 40],
      })
      L.marker(CENTER, { icon: centerEl, interactive: false }).addTo(map)

      markersRef.current = PINS.map((p, idx) => {
        const isCaptured = p.status === 'captured'
        const pinEl = L.divIcon({
          className: 'panf-pin-icon',
          html: `<div class="panf-pin ${isCaptured ? 'panf-pin-captured' : 'panf-pin-new'}" style="animation-delay: ${idx * 80}ms"></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })
        return L.marker([CENTER[0] + p.offset[0], CENTER[1] + p.offset[1]], {
          icon: pinEl,
          interactive: false,
        }).addTo(map)
      })

      mapRef.current = map

      const fixSize = () => {
        try {
          map.invalidateSize({ animate: false })
        } catch {
          /* map may be removed */
        }
      }

      // Cascata de invalidateSize — layout/aspect-ratio pode assentar depois do paint
      requestAnimationFrame(() => {
        fixSize()
        setTimeout(fixSize, 50)
        setTimeout(fixSize, 250)
        setTimeout(fixSize, 600)
      })

      resizeObs = new ResizeObserver(() => fixSize())
      resizeObs.observe(el)
      if (shellRef.current) resizeObs.observe(shellRef.current)

      // Motion: pan suave entre waypoints (sensação de explorar o mapa)
      if (!reduceMotion) {
        panTimer = setInterval(() => {
          if (!mapRef.current) return
          panIdx = (panIdx + 1) % PAN_PATH.length
          const next = PAN_PATH[panIdx]
          mapRef.current.panTo(next, { animate: true, duration: 1.6, easeLinearity: 0.25 })
        }, 2800)
      }

      setReady(true)
    }

    const io = new IntersectionObserver(
      entries => {
        const visible = entries.some(e => e.isIntersecting && e.intersectionRatio > 0.05)
        if (visible) {
          boot()
          // Revalida se o mapa já existia e a seção voltou à tela
          if (mapRef.current) {
            mapRef.current.invalidateSize({ animate: false })
          }
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: [0, 0.05, 0.2] },
    )
    io.observe(shell)

    // Fallback: se já estiver no viewport no mount
    if (typeof window !== 'undefined') {
      const rect = shell.getBoundingClientRect()
      const inView = rect.bottom > 0 && rect.top < window.innerHeight + 120
      if (inView) {
        // delay mínimo pro aspect-ratio assentar
        requestAnimationFrame(() => requestAnimationFrame(boot))
      }
    }

    return () => {
      cancelled = true
      io.disconnect()
      resizeObs?.disconnect()
      if (panTimer) clearInterval(panTimer)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markersRef.current = []
    }
  }, [])

  /* Counter + captura em loop */
  useEffect(() => {
    if (!ready) return
    let i = 0
    const newPins = PINS.filter(p => p.status === 'new')
    const interval = setInterval(() => {
      setCounter(prev => Math.min(prev + 1, 47))
      if (newPins.length > 0) {
        setLatestCaptured(newPins[i % newPins.length].label)
        i += 1
      }
    }, 1800)
    return () => clearInterval(interval)
  }, [ready])

  return (
    <div
      ref={shellRef}
      className={`relative rounded-2xl sm:rounded-3xl overflow-hidden ring-1 ring-white/10 bg-gray-900 ${
        variant === 'hero' ? 'aspect-[16/10] sm:aspect-[16/9]' : 'aspect-square'
      } ${className}`}
      style={{
        boxShadow:
          '0 60px 120px -30px rgba(99, 102, 241, 0.25), 0 30px 60px -20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Real map — height explícita pro Leaflet não montar com 0×0 */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 h-full w-full min-h-[200px] bg-[#0b0f14]"
        style={{ height: '100%', width: '100%' }}
      />

      {/* Subtle vignette */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none" />

      {/* Top-left: Status badge */}
      <div className="absolute top-4 left-4 z-[400] inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
        </span>
        <span className="text-[11px] font-semibold text-white tracking-tight">
          Modo Panfleteiro ativo
        </span>
      </div>

      {/* Top-right: Counter pill */}
      <div className="absolute top-4 right-4 z-[400] inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15">
        <Crosshair size={11} strokeWidth={2.25} className="text-white/70" />
        <span className="text-[11px] font-semibold text-white tabular-nums">
          {47 + counter} oportunidades
        </span>
      </div>

      {/* Bottom: live capture toast */}
      {latestCaptured && (
        <div
          key={latestCaptured}
          className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-[400] flex items-start gap-3 p-3 rounded-2xl bg-black/70 backdrop-blur-xl ring-1 ring-white/10"
          style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <span className="w-9 h-9 rounded-xl bg-emerald-500/20 grid place-items-center shrink-0">
            <Zap size={15} strokeWidth={2.25} className="text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Lead capturado
            </p>
            <p className="text-[12px] font-semibold text-white truncate">{latestCaptured}</p>
            <p className="text-[10px] text-white/50 mt-0.5">enviando para WhatsApp...</p>
          </div>
        </div>
      )}

      <style>{`
        .panf-radar-icon { background: transparent !important; border: none !important; }
        .panf-pin-icon { background: transparent !important; border: none !important; }
        .panf-pin {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          border: 2.5px solid rgba(10, 10, 10, 0.85);
          animation: panfPinIn 400ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }
        .panf-pin-new {
          background: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25), 0 0 14px rgba(16, 185, 129, 0.7);
        }
        .panf-pin-captured {
          background: #fbbf24;
          box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.25), 0 0 14px rgba(251, 191, 36, 0.7);
        }
        @keyframes panfPinIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slideUp {
          0% { transform: translateY(12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
