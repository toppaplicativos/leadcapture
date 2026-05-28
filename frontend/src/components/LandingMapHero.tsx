/**
 * LandingMapHero — mapa Mapbox INTERATIVO de demonstracao no Hero da landing.
 *
 * Por que mascarado:
 *   Mostrar dados reais (telefones, nomes completos) transforma a landing num
 *   buscador gratuito. O objetivo eh DESPERTAR CURIOSIDADE - o usuario ve que
 *   o sistema acha negocios reais, mas precisa entrar pra ver os detalhes.
 *
 * Mecanica:
 *   - Mapa Mapbox real, navegavel (zoom, pan, satelite)
 *   - Pins fictícios sobre regioes reais (SP, RJ, Fortaleza)
 *   - Nomes parcialmente censurados (ex: "Pizzaria B*** R***")
 *   - Telefones mascarados como ●●●● ●●●●
 *   - Tooltip mostra "Crie conta pra ver dados completos"
 *   - Pins pulsam aleatoriamente como se a captacao rolasse ao vivo
 *
 * Sem chamadas reais ao backend - 100% client-side, sem custo de API.
 */
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Lock, MapPin, Phone, Globe, Star, Sparkles, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || ''

interface MaskedPlace {
  id: string
  lat: number
  lng: number
  /** Nome com mascaramento parcial (ex: "Pizzaria B*** R***") */
  maskedName: string
  category: string
  rating: number
  reviews: number
  status: 'new' | 'captured'
}

/* Centros reais de capitais brasileiras com pins fictícios distribuídos no entorno.
   Coordenadas baseadas em áreas comerciais densas - Av. Paulista (SP), Aldeota (Fortaleza),
   Copacabana (RJ). Os pins não correspondem a estabelecimentos reais, apenas projetam
   locais críveis (próximos a vias movimentadas). */
const CITIES = [
  {
    name: 'São Paulo',
    center: [-46.6562, -23.5615] as [number, number],
    zoom: 14,
    places: [
      { offset: [0.0028, 0.0018], name: 'Restaurante V*** M***', cat: 'restaurante', rating: 4.6, reviews: 412 },
      { offset: [-0.0024, 0.0032], name: 'Pizzaria B*** R***', cat: 'pizzaria', rating: 4.4, reviews: 287 },
      { offset: [0.0038, -0.0014], name: 'Padaria A***** C***', cat: 'padaria', rating: 4.7, reviews: 891 },
      { offset: [-0.0018, -0.0028], name: 'Cafeteria C***** P***', cat: 'cafeteria', rating: 4.8, reviews: 156 },
      { offset: [0.0046, 0.0034], name: 'Sushi K*** Y***', cat: 'restaurante japones', rating: 4.5, reviews: 523 },
      { offset: [-0.0040, 0.0010], name: 'Hamburgueria M*** B***', cat: 'hamburgueria', rating: 4.3, reviews: 678 },
      { offset: [0.0020, -0.0042], name: 'Confeitaria D*** A***', cat: 'confeitaria', rating: 4.9, reviews: 234 },
      { offset: [-0.0036, -0.0036], name: 'Açai T*** B***', cat: 'lanchonete', rating: 4.2, reviews: 312 },
      { offset: [0.0014, 0.0048], name: 'Empório S***** S***', cat: 'mercado', rating: 4.6, reviews: 145 },
      { offset: [-0.0052, 0.0024], name: 'Bistro F***** M***', cat: 'bistro', rating: 4.7, reviews: 189 },
      { offset: [0.0058, -0.0028], name: 'Pizzaria N***** B***', cat: 'pizzaria', rating: 4.5, reviews: 421 },
      { offset: [-0.0014, 0.0058], name: 'Cafeteria O*** Y***', cat: 'cafeteria', rating: 4.4, reviews: 267 },
    ],
  },
  {
    name: 'Fortaleza',
    center: [-38.5037, -3.7430] as [number, number],
    zoom: 14,
    places: [
      { offset: [0.0024, 0.0018], name: 'Restaurante C***** S***', cat: 'restaurante', rating: 4.5, reviews: 367 },
      { offset: [-0.0028, 0.0024], name: 'Pizzaria B*** I*****', cat: 'pizzaria', rating: 4.3, reviews: 198 },
      { offset: [0.0036, -0.0018], name: 'Padaria E***** M***', cat: 'padaria', rating: 4.8, reviews: 712 },
      { offset: [-0.0020, -0.0030], name: 'Cafeteria S*** F***', cat: 'cafeteria', rating: 4.6, reviews: 234 },
      { offset: [0.0044, 0.0028], name: 'Hamburgueria C*** B***', cat: 'hamburgueria', rating: 4.4, reviews: 543 },
      { offset: [-0.0038, 0.0014], name: 'Açougue P***** L***', cat: 'açougue', rating: 4.7, reviews: 89 },
      { offset: [0.0018, -0.0040], name: 'Sorveteria I***** S***', cat: 'sorveteria', rating: 4.9, reviews: 412 },
      { offset: [-0.0034, -0.0026], name: 'Lanchonete 2*** F***', cat: 'lanchonete', rating: 4.2, reviews: 178 },
    ],
  },
  {
    name: 'Rio de Janeiro',
    center: [-43.1729, -22.9711] as [number, number],
    zoom: 14,
    places: [
      { offset: [0.0026, 0.0020], name: 'Quiosque P***** C***', cat: 'lanchonete', rating: 4.3, reviews: 287 },
      { offset: [-0.0030, 0.0028], name: 'Restaurante G***** M***', cat: 'restaurante', rating: 4.6, reviews: 456 },
      { offset: [0.0040, -0.0016], name: 'Pizzaria C***** N***', cat: 'pizzaria', rating: 4.5, reviews: 321 },
      { offset: [-0.0022, -0.0034], name: 'Bistro V***** N***', cat: 'bistro', rating: 4.7, reviews: 198 },
      { offset: [0.0048, 0.0030], name: 'Açai I***** N***', cat: 'lanchonete', rating: 4.4, reviews: 612 },
      { offset: [-0.0042, 0.0012], name: 'Padaria L***** S***', cat: 'padaria', rating: 4.8, reviews: 423 },
      { offset: [0.0016, -0.0044], name: 'Confeitaria A***** S***', cat: 'confeitaria', rating: 4.6, reviews: 234 },
      { offset: [-0.0036, -0.0030], name: 'Hamburgueria T*** B***', cat: 'hamburgueria', rating: 4.5, reviews: 367 },
      { offset: [0.0012, 0.0050], name: 'Cafeteria C***** M***', cat: 'cafeteria', rating: 4.7, reviews: 145 },
    ],
  },
] as const

function buildPins(cityIndex: number): MaskedPlace[] {
  const city = CITIES[cityIndex]
  return city.places.map((p, i) => ({
    id: `${cityIndex}-${i}`,
    lat: city.center[1] + p.offset[1],
    lng: city.center[0] + p.offset[0],
    maskedName: p.name,
    category: p.cat,
    rating: p.rating,
    reviews: p.reviews,
    /* Mistura status: 30% captured (para parecer já trabalhado), 70% new (oportunidade) */
    status: i % 3 === 0 ? 'captured' : 'new',
  }))
}

export function LandingMapHero() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [cityIndex, setCityIndex] = useState(0)
  const [selectedPin, setSelectedPin] = useState<MaskedPlace | null>(null)
  /* Pulsa um pin aleatoriamente a cada 1.6s pra dar sensacao de "captacao ao vivo" */
  const [pulseId, setPulseId] = useState<string | null>(null)

  /* Init Mapbox */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!MAPBOX_TOKEN) {
      console.warn('VITE_MAPBOX_TOKEN missing - landing map will not render')
      return
    }
    mapboxgl.accessToken = MAPBOX_TOKEN
    const city = CITIES[cityIndex]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: city.center,
      zoom: city.zoom,
      attributionControl: false,
      cooperativeGestures: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  /* Pinta pins quando cidade muda */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    /* Anima viagem pro novo centro */
    const city = CITIES[cityIndex]
    map.flyTo({ center: city.center, zoom: city.zoom, duration: 1400, essential: true })

    /* Remove pins antigos */
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const pins = buildPins(cityIndex)
    for (const pin of pins) {
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      el.innerHTML = renderPinHtml(pin, pulseId === pin.id)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setSelectedPin(pin)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      markersRef.current.push(marker)
    }
  }, [cityIndex, pulseId])

  /* Pulse aleatoria pra simular captacao */
  useEffect(() => {
    const tick = () => {
      const pins = buildPins(cityIndex)
      const newOnes = pins.filter((p) => p.status === 'new')
      if (newOnes.length === 0) return
      const random = newOnes[Math.floor(Math.random() * newOnes.length)]
      setPulseId(random.id)
      setTimeout(() => setPulseId(null), 1100)
    }
    const t = setInterval(tick, 1600)
    return () => clearInterval(t)
  }, [cityIndex])

  return (
    <div className="relative w-full rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.5)] bg-[#0a0a0a]">
      {/* Mapa */}
      <div
        ref={containerRef}
        className="w-full aspect-[16/10] sm:aspect-[16/9]"
        style={{ minHeight: '420px' }}
      />

      {/* City picker — chip floating top-left */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 p-1 rounded-full bg-[#0a0a14]/85 backdrop-blur-xl border border-white/10 shadow-xl">
        {CITIES.map((c, i) => (
          <button
            key={c.name}
            onClick={() => { setCityIndex(i); setSelectedPin(null) }}
            className={`px-3 h-7 rounded-full text-[11px] font-bold transition ${
              i === cityIndex
                ? 'bg-white text-gray-900'
                : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Radar status badge — top-right */}
      <div className="absolute top-3 right-14 z-10 px-3 h-8 rounded-full bg-[#0a0a14]/85 backdrop-blur-xl border border-white/10 flex items-center gap-2">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full animate-ping opacity-75 bg-emerald-400" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </span>
        <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-300">
          Radar ativo
        </span>
      </div>

      {/* Legend — bottom */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 px-3 h-8 rounded-full bg-[#0a0a14]/85 backdrop-blur-xl border border-white/10">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/85">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
            Oportunidade
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/85">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            Captado
          </span>
        </div>
        <div className="px-3 h-8 rounded-full bg-amber-500/10 backdrop-blur-xl border border-amber-400/30 flex items-center gap-1.5">
          <Lock size={11} strokeWidth={2.5} className="text-amber-300" />
          <span className="text-[10px] font-bold text-amber-200 tracking-wide">
            Dados protegidos
          </span>
        </div>
      </div>

      {/* Selected pin panel — bottom-center, mascarado */}
      {selectedPin && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 w-[320px] max-w-[calc(100%-2rem)] rounded-2xl bg-[#0a0a14]/95 backdrop-blur-2xl border border-white/15 shadow-2xl overflow-hidden"
          style={{ bottom: '60px', animation: 'slideUp 220ms cubic-bezier(0.16,1,0.3,1)' }}
        >
          <div className="px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {selectedPin.status === 'new'
                  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30">NOVO</span>
                  : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">CAPTADO</span>}
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-300">
                  <Star size={9} className="fill-amber-300 text-amber-300" />
                  {selectedPin.rating.toFixed(1)}
                  <span className="text-amber-300/70 font-medium ml-0.5">({selectedPin.reviews})</span>
                </span>
              </div>
              <h4 className="text-[13.5px] font-bold text-white mt-1 leading-tight tracking-tight">
                {selectedPin.maskedName}
              </h4>
              <p className="text-[10px] text-white/50 capitalize mt-0.5">{selectedPin.category}</p>
            </div>
            <button
              onClick={() => setSelectedPin(null)}
              className="w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/10 transition text-[14px] leading-none"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {/* Dados bloqueados — mascaramento total */}
          <div className="px-4 pb-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[11.5px]">
              <Phone size={11} className="text-white/30 shrink-0" />
              <span className="font-mono text-white/40 select-none filter blur-[3px]">+55 ●● ●●●●● ●●●●</span>
            </div>
            <div className="flex items-start gap-2 text-[11.5px]">
              <MapPin size={11} className="text-white/30 shrink-0 mt-0.5" />
              <span className="text-white/40 select-none filter blur-[3px]">Rua ●●●●●●●●, ●●●● — ●●●●●●●●</span>
            </div>
            <div className="flex items-center gap-2 text-[11.5px]">
              <Globe size={11} className="text-white/30 shrink-0" />
              <span className="text-white/40 select-none filter blur-[3px]">www.●●●●●●●●●●.com.br</span>
            </div>
          </div>

          {/* CTA "Crie conta pra ver" */}
          <div className="px-3 pb-3 pt-1.5 bg-gradient-to-b from-transparent to-white/[0.03] border-t border-white/[0.06]">
            <Link
              to="/cadastro?plano=starter"
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white text-gray-900 text-[12px] font-bold hover:bg-gray-100 transition group"
            >
              <Sparkles size={12} strokeWidth={2.5} />
              Crie conta grátis pra ver dados completos
              <ArrowRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function renderPinHtml(pin: MaskedPlace, isPulsing: boolean): string {
  const color = pin.status === 'new' ? '#ef4444' : '#10b981'
  const size = isPulsing ? 18 : 14
  const ring = isPulsing
    ? `<span style="position:absolute;inset:-8px;border-radius:50%;background:${color};opacity:0.35;animation:pin-ping 1.1s ease-out forwards;"></span>`
    : ''
  return `
    <div style="position:relative;width:${size}px;height:${size}px;cursor:pointer;">
      ${ring}
      <span style="position:absolute;inset:0;border-radius:50%;background:${color};box-shadow:0 0 8px 1px ${color}80, 0 0 0 2px white;"></span>
    </div>
  `
}
