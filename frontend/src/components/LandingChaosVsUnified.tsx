/**
 * LandingChaosVsUnified — diagrama animado da section "Problema".
 *
 * Estado A (caos): 5 ferramentas externas (WhatsApp, Planilha, CRM, Instagram, Email)
 *   espalhadas em volta de um vazio central, conectadas por linhas vermelhas pontilhadas
 *   bagunçadas (cruzando umas com as outras).
 *
 * Estado B (unificado): mesmas 5 ferramentas, agora orbitando um nó central LeadCapture
 *   conectadas por linhas verdes limpas e organizadas que pulsam suavemente (data flow).
 *
 * Toggle automatico a cada 4s. Transicao em 2s com CSS transition em todos os elementos.
 *
 * Implementacao em SVG inline porque precisamos animar paths (linhas) com facilidade.
 */
import { useEffect, useState } from 'react'
import {
  FileSpreadsheet, Database, Mail, Sparkles,
} from 'lucide-react'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import type { IconComponent } from '@/components/icons'
import type { LucideIcon } from 'lucide-react'

interface Tool {
  Icon: IconComponent | LucideIcon
  label: string
  /** Posicao em estado caos (% relativo ao SVG 400x400) */
  chaos: { x: number; y: number }
  /** Posicao em estado unificado (orbita ao redor do centro) */
  unified: { x: number; y: number }
}

/* 5 ferramentas + central. Coordenadas pensadas pra cruzar bem no caos e formar
   octogono limpo no unificado. */
const TOOLS: Tool[] = [
  { Icon: WhatsAppIcon,     label: 'WhatsApp',  chaos: { x: 70,  y: 80  }, unified: { x: 90,  y: 200 } },
  { Icon: FileSpreadsheet,  label: 'Planilha',  chaos: { x: 320, y: 60  }, unified: { x: 200, y: 80  } },
  { Icon: Database,         label: 'CRM',       chaos: { x: 110, y: 320 }, unified: { x: 310, y: 200 } },
  { Icon: InstagramIcon,    label: 'Instagram', chaos: { x: 290, y: 280 }, unified: { x: 200, y: 320 } },
  { Icon: Mail,             label: 'Email',     chaos: { x: 50,  y: 200 }, unified: { x: 90,  y: 130 } },
]
const CENTER = { x: 200, y: 200 }

export function LandingChaosVsUnified() {
  const [unified, setUnified] = useState(false)

  /* Toggle automatico — comeca no caos pra impacto, vai pro unificado depois */
  useEffect(() => {
    const tick = () => setUnified((u) => !u)
    /* Primeira transicao depois de 2.5s, depois alterna a cada 4s */
    const initial = setTimeout(() => {
      setUnified(true)
      const interval = setInterval(tick, 4000)
      ;(initial as any)._interval = interval
    }, 2500)
    return () => {
      clearTimeout(initial)
      if ((initial as any)._interval) clearInterval((initial as any)._interval)
    }
  }, [])

  return (
    <div className="relative w-full aspect-square max-w-[480px] mx-auto">
      {/* Label superior — estado atual */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 -translate-y-1/2">
        <div
          className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.1em] uppercase transition-all duration-700 ${
            unified
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30'
              : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30'
          }`}
        >
          {unified ? 'Com LeadCapture' : 'Sem LeadCapture'}
        </div>
      </div>

      <svg viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Definicoes — gradiente pra linhas verdes do unified */}
        <defs>
          <linearGradient id="green-flow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor="#22c55e" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.1" />
          </linearGradient>
          <radialGradient id="unified-hub-glow">
            <stop offset="0%"  stopColor="#22c55e" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#22c55e" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Linhas: no caos, cada ferramenta tenta se conectar com TODAS as outras (rede caotica) */}
        {!unified && TOOLS.map((tool, i) =>
          TOOLS.slice(i + 1).map((other, j) => (
            <line
              key={`chaos-line-${i}-${j}`}
              x1={tool.chaos.x}
              y1={tool.chaos.y}
              x2={other.chaos.x}
              y2={other.chaos.y}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.4"
              style={{
                animation: `chaos-line-flicker ${1.5 + ((i + j) % 3) * 0.4}s ease-in-out ${(i * 0.2)}s infinite`,
                transition: 'opacity 700ms ease',
              }}
            />
          ))
        )}

        {/* Linhas: no unified, cada ferramenta se conecta SO com o centro (estrela) */}
        {unified && TOOLS.map((tool, i) => (
          <line
            key={`unified-line-${i}`}
            x1={tool.unified.x}
            y1={tool.unified.y}
            x2={CENTER.x}
            y2={CENTER.y}
            stroke="url(#green-flow)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            style={{
              animation: `unified-line-flow ${1.2 + i * 0.15}s linear infinite`,
              transition: 'opacity 700ms ease',
            }}
          />
        ))}

        {/* Centro: hub LeadCapture - aparece SO no unified */}
        {unified && (
          <>
            {/* Glow externo */}
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="70"
              fill="url(#unified-hub-glow)"
              style={{ animation: 'unified-pulse 2.4s ease-in-out infinite' }}
            />
            {/* Hub principal */}
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="26"
              fill="#0a0a0a"
              stroke="#22c55e"
              strokeWidth="2"
              style={{ filter: 'drop-shadow(0 0 12px rgba(34,197,94,0.6))' }}
            />
            <foreignObject x={CENTER.x - 12} y={CENTER.y - 12} width="24" height="24">
              <Sparkles size={24} strokeWidth={2} color="#22c55e" />
            </foreignObject>
          </>
        )}
      </svg>

      {/* Nós das ferramentas - posicionados em absolute via top/left % pra animar smooth */}
      {TOOLS.map((tool, i) => {
        const pos = unified ? tool.unified : tool.chaos
        return (
          <div
            key={tool.label}
            className="absolute"
            style={{
              left: `${(pos.x / 400) * 100}%`,
              top: `${(pos.y / 400) * 100}%`,
              transform: 'translate(-50%, -50%)',
              transition: 'left 1400ms cubic-bezier(0.25, 1, 0.5, 1), top 1400ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            <div
              className={`flex flex-col items-center gap-1 transition-all duration-700 ${
                unified ? 'opacity-100' : 'opacity-80'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl grid place-items-center transition-all duration-700 ${
                  unified
                    ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30 shadow-[0_0_16px_rgba(34,197,94,0.25)]'
                    : 'bg-rose-500/10 ring-1 ring-rose-400/20'
                }`}
              >
                <tool.Icon
                  size={18}
                  strokeWidth={1.75}
                  className={`transition-colors duration-700 ${
                    unified ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                />
              </div>
              <span
                className={`text-[9px] font-bold tracking-wide uppercase transition-colors duration-700 ${
                  unified ? 'text-white/70' : 'text-white/40'
                }`}
              >
                {tool.label}
              </span>
            </div>
          </div>
        )
      })}

      {/* Label inferior - estado descritivo */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 translate-y-1/2 px-3 py-1 rounded-full bg-[#0a0a14]/85 backdrop-blur-sm ring-1 ring-white/10">
        <span className={`text-[10px] font-mono tracking-wide transition-colors duration-700 ${
          unified ? 'text-emerald-300' : 'text-rose-300'
        }`}>
          {unified ? '✓ 1 sistema · tudo conectado' : '✗ 5 ferramentas · dados perdidos'}
        </span>
      </div>
    </div>
  )
}
