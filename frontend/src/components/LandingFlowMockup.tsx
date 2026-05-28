/**
 * LandingFlowMockup — mockup visual de fluxo de automacao pra section Automation.
 *
 * Imita uma tela tipo Zapier/n8n com nos conectados horizontalmente:
 *   Lead novo → Qualificar → WhatsApp → Aguardar resposta → IA classifica → [Fechar | Nutrir]
 *
 * Estilo dark UI, conexoes com gradiente verde/ambar fluindo (stroke-dashoffset animation),
 * destaque pulsante em um no por vez pra dar impressao de execucao ao vivo.
 *
 * Full-width, ~260px de altura. Responsivo - em mobile escala e mantem visivel.
 */
import { useEffect, useState } from 'react'
import {
  UserPlus, Filter, MessageSquare, Clock, Brain, CheckCircle2, Sparkles, ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FlowNode {
  id: string
  Icon: LucideIcon
  title: string
  subtitle: string
  /** Cor accent — verde pra fluxo principal, ambar pra branch */
  accent: 'emerald' | 'amber' | 'sky'
}

const NODES: FlowNode[] = [
  { id: 'trigger', Icon: UserPlus,      title: 'Lead novo',         subtitle: 'Radar capta',         accent: 'emerald' },
  { id: 'qualify', Icon: Filter,        title: 'Qualificar',        subtitle: 'Filtro automático',   accent: 'emerald' },
  { id: 'send',    Icon: MessageSquare, title: 'WhatsApp',          subtitle: 'Mensagem pessoal',    accent: 'emerald' },
  { id: 'wait',    Icon: Clock,         title: 'Aguardar',          subtitle: 'Janela 24h',          accent: 'amber'   },
  { id: 'ai',      Icon: Brain,         title: 'IA classifica',     subtitle: 'Intenção · objeção',  accent: 'sky'     },
  { id: 'close',   Icon: CheckCircle2,  title: 'Fechar venda',      subtitle: 'Ou nutrir',           accent: 'emerald' },
]

const ACCENT_MAP = {
  emerald: { stroke: '#22c55e', glow: 'rgba(34,197,94,0.35)', text: '#86efac' },
  amber:   { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.35)', text: '#fcd34d' },
  sky:     { stroke: '#0ea5e9', glow: 'rgba(14,165,233,0.35)', text: '#7dd3fc' },
}

export function LandingFlowMockup() {
  /* Indice do no que esta "executando" agora - pulsa a cada 1.4s pra simular fluxo ativo */
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % NODES.length)
    }, 1400)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-[#0a0a0f] ring-1 ring-white/[0.08]"
      style={{
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        backgroundImage:
          'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34,197,94,0.05), transparent 60%)',
      }}
    >
      {/* Toolbar simulando janela de app */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          fluxo "captação → fechamento"
        </div>
        <div className="text-[10px] font-mono text-white/30">v2.4 · ativo</div>
      </div>

      {/* Canvas com grid de fundo */}
      <div
        className="relative px-6 sm:px-10 py-8 sm:py-10"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Linha de fluxo horizontal — sequencia de nos com setas */}
        <div className="flex items-stretch justify-between gap-1 sm:gap-2 overflow-x-auto scrollbar-none">
          {NODES.map((node, i) => {
            const accent = ACCENT_MAP[node.accent]
            const isActive = i === activeIdx
            const isPast = i < activeIdx
            return (
              <div key={node.id} className="flex items-center shrink-0">
                {/* Card do nó */}
                <div
                  className={`relative w-[110px] sm:w-[130px] rounded-xl px-3 py-2.5 border transition-all duration-300 ${
                    isActive
                      ? 'bg-white/[0.06] scale-105'
                      : isPast
                      ? 'bg-white/[0.025]'
                      : 'bg-white/[0.015]'
                  }`}
                  style={{
                    borderColor: isActive ? accent.stroke : 'rgba(255,255,255,0.08)',
                    boxShadow: isActive ? `0 0 24px ${accent.glow}` : undefined,
                  }}
                >
                  {/* Status dot - canto superior direito */}
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? accent.stroke : 'rgba(255,255,255,0.15)',
                      boxShadow: isActive ? `0 0 6px ${accent.stroke}` : undefined,
                      animation: isActive ? 'unified-pulse 1.2s ease-in-out infinite' : undefined,
                    }}
                  />

                  <div className="flex items-center gap-1.5 mb-1">
                    <node.Icon
                      size={11}
                      strokeWidth={2}
                      style={{ color: isActive ? accent.text : 'rgba(255,255,255,0.5)' }}
                    />
                    <span
                      className="text-[10px] font-bold tracking-tight truncate"
                      style={{ color: isActive ? accent.text : 'rgba(255,255,255,0.75)' }}
                    >
                      {node.title}
                    </span>
                  </div>
                  <div className="text-[8.5px] text-white/40 font-medium leading-tight">
                    {node.subtitle}
                  </div>
                </div>

                {/* Conector — só se não for o ultimo */}
                {i < NODES.length - 1 && (
                  <div className="flex items-center px-0.5 sm:px-1">
                    <ArrowRight
                      size={12}
                      strokeWidth={2}
                      style={{
                        color: i < activeIdx ? accent.stroke : 'rgba(255,255,255,0.15)',
                        filter: i === activeIdx - 1 ? `drop-shadow(0 0 4px ${accent.glow})` : undefined,
                        transition: 'color 300ms ease',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer com stats fictícios pra dar peso */}
        <div className="mt-7 pt-4 border-t border-white/[0.05] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 sm:gap-6">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">Executando</div>
              <div className="text-[12px] font-bold text-emerald-300 mt-0.5 flex items-center gap-1">
                <Sparkles size={10} strokeWidth={2.5} />
                {NODES[activeIdx].title}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">Leads hoje</div>
              <div className="text-[12px] font-bold text-white mt-0.5 tabular-nums">2.847</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">Taxa de resposta</div>
              <div className="text-[12px] font-bold text-white mt-0.5 tabular-nums">38.4%</div>
            </div>
          </div>
          <div className="text-[10px] font-mono text-white/30">
            últ.run: <span className="text-emerald-300">há 4s</span>
          </div>
        </div>
      </div>
    </div>
  )
}
