/**
 * LandingRadarHero — radar visual animado para o lado direito do Hero da landing.
 *
 * Objetivo: comunicar "satelite varrendo o Brasil capturando oportunidades em tempo real".
 *
 * Composicao (em camadas, do fundo para a frente):
 *   1. Campo de partículas (~30 pontos brancos opacity 0.3 flutuando)
 *   2. 3 círculos concêntricos com stroke fino — pulsam em escala, delay escalonado
 *   3. Linha rotativa (varredura sonar) — conic-gradient de verde transparente, gira 360°
 *   4. Pins de segmentos aparecendo em posicoes radiais, ciclando
 *   5. Mira central com logo
 *   6. Mask radial no wrapper externo — fade nas bordas pra integrar ao fundo
 *
 * 100% CSS - sem deps de animacao.
 */
import { useEffect, useState } from 'react'
import {
  Croissant, Beef, Pill, Stethoscope, Building2, Briefcase, UtensilsCrossed, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface RadarPin {
  /** Posicao angular em graus (0 = leste, 90 = norte) */
  angle: number
  /** Distância normalizada do centro (0-1) */
  radius: number
  segment: string
  Icon: LucideIcon
  /** "novo" = verde brilhante, "em_contato" = ambar */
  status: 'new' | 'contacting'
}

const SEGMENTS: Array<{ label: string; Icon: LucideIcon }> = [
  { label: 'Padaria', Icon: Croissant },
  { label: 'Açougue', Icon: Beef },
  { label: 'Farmácia', Icon: Pill },
  { label: 'Clínica', Icon: Stethoscope },
  { label: 'Distribuidora', Icon: Building2 },
  { label: 'Agência', Icon: Briefcase },
  { label: 'Restaurante', Icon: UtensilsCrossed },
  { label: 'Oficina', Icon: Wrench },
]

/* Gera N pins aleatorios em posicoes radiais — chamado a cada ciclo (5s) pra rotacionar.
   Pra garantir distribuicao boa, divide 360 em N slots e jitter cada angulo. */
function rollPins(n: number): RadarPin[] {
  const slotSize = 360 / n
  return Array.from({ length: n }, (_, i) => {
    const segIndex = Math.floor(Math.random() * SEGMENTS.length)
    const seg = SEGMENTS[segIndex]
    const baseAngle = i * slotSize
    const jitter = (Math.random() - 0.5) * (slotSize * 0.6)
    return {
      angle: baseAngle + jitter,
      radius: 0.42 + Math.random() * 0.36, // 0.42-0.78 do raio total
      segment: seg.label,
      Icon: seg.Icon,
      status: Math.random() > 0.65 ? 'contacting' : 'new',
    }
  })
}

/* Campo de partículas estático em posicoes pseudo-aleatorias mas estaveis. */
const PARTICLES = Array.from({ length: 32 }, () => ({
  /* Coordenadas em % do container */
  x: Math.random() * 100,
  y: Math.random() * 100,
  /* Tamanho variavel pra dar profundidade */
  size: 1 + Math.random() * 2,
  /* Opacidade baseline + duration de animacao individuais */
  opacity: 0.15 + Math.random() * 0.25,
  delay: Math.random() * 4,
}))

export function LandingRadarHero() {
  /* Pins cyclam a cada 5s — novos surgem, antigos somem (fade) */
  const [pins, setPins] = useState<RadarPin[]>(() => rollPins(7))

  useEffect(() => {
    const t = setInterval(() => setPins(rollPins(7)), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="relative w-full aspect-square max-w-[560px] mx-auto"
      style={{
        WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 60%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 60%, transparent 100%)',
      }}
    >
      {/* Camada 1: partículas estelares */}
      <div className="absolute inset-0 pointer-events-none">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animation: `radar-particle 4s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Camada 2: 3 círculos concêntricos pulsando */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute rounded-full border"
            style={{
              width: `${40 + i * 25}%`,
              height: `${40 + i * 25}%`,
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              animation: `radar-ring 3s ease-in-out ${i * 0.6}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Camada 3: linha de varredura (sonar) — conic-gradient rotativo */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div
          className="rounded-full"
          style={{
            width: '92%',
            height: '92%',
            background:
              'conic-gradient(from 0deg, rgba(34,197,94,0) 0deg, rgba(34,197,94,0) 280deg, rgba(34,197,94,0.45) 350deg, rgba(34,197,94,0.65) 358deg, rgba(34,197,94,0) 360deg)',
            animation: 'radar-sweep 4s linear infinite',
            WebkitMaskImage: 'radial-gradient(circle at center, transparent 0%, black 25%)',
            maskImage: 'radial-gradient(circle at center, transparent 0%, black 25%)',
          }}
        />
      </div>

      {/* Camada 4: pins de segmentos — posicionamento polar via top/left calculado */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        {pins.map((pin, i) => {
          /* Converte ângulo + raio em coordenadas X/Y */
          const rad = (pin.angle * Math.PI) / 180
          const x = 50 + Math.cos(rad) * pin.radius * 45 // 45 = % máximo do half-width
          const y = 50 + Math.sin(rad) * pin.radius * 45
          const color = pin.status === 'new' ? '#22c55e' : '#f59e0b'
          const ringColor = pin.status === 'new' ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.35)'
          /* Delay de fade in escalonado pra parecer que a varredura "acorda" cada pin */
          const delay = (i / pins.length) * 4 // ao longo dos 4s da volta do sonar
          return (
            <div
              key={`${pin.angle}-${i}`}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                animation: `radar-pin-in 0.6s ease-out ${delay}s both, radar-pin-out 0.6s ease-in 4.4s both`,
                opacity: 0,
              }}
            >
              {/* Glow ring */}
              <span
                className="absolute rounded-full"
                style={{
                  inset: -8,
                  background: ringColor,
                  filter: 'blur(8px)',
                }}
              />
              {/* Dot */}
              <span
                className="relative inline-flex w-2.5 h-2.5 rounded-full ring-2 ring-[#0a0a0a]"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 10px ${color}, 0 0 20px ${color}80`,
                }}
              />
              {/* Label */}
              <div
                className="absolute left-1/2 -translate-x-1/2 top-[14px] flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#0a0a14]/85 backdrop-blur-sm ring-1 ring-white/10 whitespace-nowrap"
                style={{
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                <pin.Icon size={8} strokeWidth={2.5} style={{ color }} />
                <span className="text-[8.5px] font-bold text-white/90 tracking-tight">
                  {pin.segment}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Camada 5: mira central — crosshair com logo */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div
          className="relative"
          style={{
            width: 56,
            height: 56,
            animation: 'radar-center-pulse 2.4s ease-in-out infinite',
          }}
        >
          {/* Crosshair externo */}
          <span
            className="absolute inset-0 rounded-full border-2"
            style={{
              borderColor: 'rgba(34,197,94,0.5)',
              boxShadow: '0 0 24px rgba(34,197,94,0.35), inset 0 0 12px rgba(34,197,94,0.2)',
            }}
          />
          {/* Crosshair ticks */}
          <span className="absolute top-1/2 left-0 w-2 h-px bg-emerald-400/60" />
          <span className="absolute top-1/2 right-0 w-2 h-px bg-emerald-400/60" />
          <span className="absolute left-1/2 top-0 w-px h-2 bg-emerald-400/60" />
          <span className="absolute left-1/2 bottom-0 w-px h-2 bg-emerald-400/60" />
          {/* Centro: marca pulsando */}
          <span
            className="absolute inset-3 rounded-full bg-emerald-500/20 grid place-items-center"
            style={{ boxShadow: 'inset 0 0 8px rgba(34,197,94,0.4)' }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full bg-emerald-400"
              style={{ boxShadow: '0 0 12px rgba(34,197,94,0.9)' }}
            />
          </span>
        </div>
      </div>

      {/* Stats overlay - canto inferior, informacao tecnica passiva */}
      <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#0a0a14]/80 backdrop-blur-sm ring-1 ring-white/10">
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            VARRENDO
          </span>
          <span className="text-[10px] font-mono text-white/50 tabular-nums">
            LAT: -3.7° · LNG: -38.5°
          </span>
        </div>
      </div>
    </div>
  )
}
