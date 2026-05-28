import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Player, type PlayerRef } from '@remotion/player'
import {
  Send, Loader2, Download, Film, RefreshCw, Sparkles,
  Play, Pause, SkipBack, Wand2, ChevronRight,
  Zap, Smartphone, SquarePlay, Clapperboard,
  Type, Tv2, Check, X, ChevronDown, ChevronUp,
  Palette, Clock, Maximize2, AlignLeft, Settings2,
} from 'lucide-react'
import { BrandPromo } from '@/remotion/templates/BrandPromo'
import { ProductShowcase } from '@/remotion/templates/ProductShowcase'
import { StoryReel } from '@/remotion/templates/StoryReel'
import { CinematicReveal } from '@/remotion/templates/CinematicReveal'
import { KineticTypography } from '@/remotion/templates/KineticTypography'
import { NeonGlow } from '@/remotion/templates/NeonGlow'
import type { VideoCompositionSpec, VideoMessage } from '@/remotion/types'

/* ── Palette ──────────────────────────────────────────────────────── */
const S = {
  bg:           '#f8fafc',
  surface:      '#ffffff',
  elevated:     '#f1f5f9',
  panel:        '#f8fafc',
  border:       'rgba(0,0,0,0.08)',
  borderMid:    'rgba(0,0,0,0.13)',
  accent:       '#7c3aed',
  accentDim:    'rgba(124,58,237,0.10)',
  accentBright: '#6d28d9',
  text:         '#111827',
  textMuted:    '#6b7280',
  textDim:      '#9ca3af',
  success:      '#059669',
  error:        '#ef4444',
}

/* ── Auth headers ─────────────────────────────────────────────────── */
function getHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

/* ── Breakpoint hook ──────────────────────────────────────────────── */
function useBreakpoint() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const fn = () => setW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return { isMobile: w < 720, isSmall: w < 1100, w }
}

/* ── Template registry ────────────────────────────────────────────── */
interface TemplateInfo {
  id: string
  label: string
  description: string
  icon: React.ComponentType<any>
  aspect: '16:9' | '9:16'
  duration: string
  color: string
  component: React.ComponentType<any>
}

const TEMPLATES: TemplateInfo[] = [
  { id: 'BrandPromo',        label: 'Propaganda da Marca',    description: 'Institucional com slides animados e CTA',    icon: Tv2,          aspect: '16:9', duration: '15–30s', color: '#e94560', component: BrandPromo },
  { id: 'ProductShowcase',   label: 'Vitrine de Produtos',    description: 'Cada produto com imagem, preço e badge',     icon: SquarePlay,   aspect: '16:9', duration: '10–25s', color: '#06b6d4', component: ProductShowcase },
  { id: 'StoryReel',         label: 'Story / Reels',          description: 'Vertical 9:16 para Instagram e TikTok',      icon: Smartphone,   aspect: '9:16', duration: '10–20s', color: '#f59e0b', component: StoryReel },
  { id: 'CinematicReveal',   label: 'Reveal Cinematográfico', description: 'Letterbox, grain, word-by-word reveal',      icon: Clapperboard, aspect: '16:9', duration: '15–25s', color: '#a855f7', component: CinematicReveal },
  { id: 'KineticTypography', label: 'Tipografia Cinética',    description: 'Palavras que voam e pulsam em ritmo',        icon: Type,         aspect: '16:9', duration: '10–20s', color: '#fb923c', component: KineticTypography },
  { id: 'NeonGlow',          label: 'Neon Glow',              description: 'Estética cyber com glow, grid e scan lines', icon: Zap,          aspect: '16:9', duration: '10–20s', color: '#00cc88', component: NeonGlow },
]

const SUGGESTIONS = [
  'Crie um vídeo institucional da minha marca',
  'Mostre meus produtos em promoção com preços',
  'Quero um Reels estilo neon para Instagram',
  'Vídeo cinematográfico de lançamento',
]

/* ── Render poller ────────────────────────────────────────────────── */
function useRenderPoll(jobId: string | null, onDone: (url: string) => void, onError: (msg: string) => void) {
  useEffect(() => {
    if (!jobId) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/video-studio/render/${jobId}`, { headers: getHeaders(false) })
        const data = await res.json()
        if (data.status === 'done' && data.videoUrl) { clearInterval(id); onDone(data.videoUrl) }
        else if (data.status === 'error') { clearInterval(id); onError(data.error || 'Render failed') }
      } catch { /* keep polling */ }
    }, 3000)
    return () => clearInterval(id)
  }, [jobId])
}

/* ── Living background ────────────────────────────────────────────── */
function LivingBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${S.border} 1px, transparent 1px), linear-gradient(90deg, ${S.border} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.18,
      }} />
      <motion.div
        animate={{ x: [0, 70, -40, 0], y: [0, -50, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.10) 0%, transparent 70%)',
          top: '-10%', left: '15%', filter: 'blur(80px)' }}
      />
      <motion.div
        animate={{ x: [0, -50, 60, 0], y: [0, 40, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
        style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)',
          bottom: '5%', right: '10%', filter: 'blur(70px)' }}
      />
    </div>
  )
}

/* ── Thinking pipeline ────────────────────────────────────────────── */
const PIPELINE_STEPS = ['Interpretando pedido', 'Definindo narrativa', 'Criando cenas', 'Calculando animações', 'Finalizando composição']

function ThinkingPipeline() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const delays = [900, 1700, 2300, 1900]
    let t = 0
    const timers: number[] = []
    for (let i = 0; i < delays.length; i++) {
      t += delays[i]
      const d = t
      timers.push(window.setTimeout(() => setStep(s => Math.min(s + 1, PIPELINE_STEPS.length - 1)), d))
    }
    return () => timers.forEach(window.clearTimeout)
  }, [])
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={{ padding: '12px 15px', borderRadius: '14px 14px 14px 4px', background: S.elevated, border: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 220 }}
    >
      <div style={{ fontSize: 9, color: S.accentBright, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' }}>Pipeline IA</div>
      {PIPELINE_STEPS.map((label, i) => {
        const isDone = i < step
        const isActive = i === step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? `${S.success}18` : isActive ? `${S.accent}25` : 'transparent', border: `1.5px solid ${isDone ? S.success : isActive ? S.accent : S.textDim}`, transition: 'all 0.35s' }}>
              {isDone ? <Check size={8} color={S.success} /> : isActive ? (
                <motion.div style={{ width: 5, height: 5, borderRadius: '50%', background: S.accent }} animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 0.75, repeat: Infinity }} />
              ) : <div style={{ width: 4, height: 4, borderRadius: '50%', background: S.textDim }} />}
            </div>
            <span style={{ fontSize: 12, transition: 'color 0.35s', color: isDone ? S.textMuted : isActive ? S.text : S.textDim, fontWeight: isActive ? 600 : 400 }}>{label}</span>
            {isActive && <motion.span style={{ fontSize: 11, color: S.accentBright, marginLeft: 1, fontWeight: 700 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity }}>...</motion.span>}
          </div>
        )
      })}
    </motion.div>
  )
}

/* ── Chat bubble ──────────────────────────────────────────────────── */
function ChatBubble({ msg }: { msg: VideoMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 320 }}
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}
    >
      <div style={{
        maxWidth: '88%', padding: '9px 13px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? S.accent : S.elevated,
        border: `1px solid ${isUser ? 'transparent' : S.border}`,
        fontSize: 13, color: isUser ? '#ffffff' : S.text,
        lineHeight: 1.55,
      }}>
        {msg.content}
        {msg.spec && (
          <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 8, background: isUser ? 'rgba(255,255,255,0.15)' : `${S.bg}99`, border: `1px solid ${isUser ? 'rgba(255,255,255,0.2)' : S.border}`, fontSize: 11, color: isUser ? 'rgba(255,255,255,0.85)' : S.textMuted }}>
            <span style={{ color: isUser ? '#fff' : S.accentBright, fontWeight: 600 }}>{msg.spec.template}</span>
            <span style={{ marginLeft: 6 }}>{msg.spec.width}×{msg.spec.height} · {Math.round(msg.spec.durationInFrames / msg.spec.fps)}s</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ── Timeline ─────────────────────────────────────────────────────── */
function Timeline({ spec, currentFrame }: { spec: VideoCompositionSpec | null; currentFrame: number }) {
  if (!spec) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 20 }}>
        <span style={{ fontSize: 11, color: S.textMuted }}>Nenhuma composição carregada — use o chat para criar</span>
      </div>
    )
  }
  const { fps, durationInFrames: total, template, props: p } = spec
  const progress = currentFrame / total
  type Seg = { label: string; color: string; from: number; to: number }
  const segs: Seg[] = []
  if (template === 'BrandPromo') {
    const slides = (p as any).slides?.length ?? 2
    const intro = fps * 3, outro = fps * 4
    const sd = Math.floor((total - intro - outro) / slides)
    segs.push({ label: 'Intro', color: S.accent, from: 0, to: intro })
    for (let i = 0; i < slides; i++) segs.push({ label: `Slide ${i+1}`, color: '#3b82f6', from: intro + i*sd, to: intro + (i+1)*sd })
    segs.push({ label: 'CTA', color: S.success, from: total - outro, to: total })
  } else if (template === 'ProductShowcase') {
    const products = (p as any).products?.length ?? 2
    const intro = fps * 2, outro = fps * 3
    const pd = Math.floor((total - intro - outro) / products)
    segs.push({ label: 'Intro', color: S.accent, from: 0, to: intro })
    for (let i = 0; i < products; i++) segs.push({ label: (p as any).products?.[i]?.name?.split(' ')[0] || `P${i+1}`, color: '#06b6d4', from: intro + i*pd, to: intro + (i+1)*pd })
    segs.push({ label: 'CTA', color: S.success, from: total - outro, to: total })
  } else if (template === 'StoryReel') {
    const slides = (p as any).slides?.length ?? 3
    const ctaDur = fps * 3
    const sd = Math.floor((total - ctaDur) / slides)
    for (let i = 0; i < slides; i++) segs.push({ label: `Slide ${i+1}`, color: '#f59e0b', from: i*sd, to: (i+1)*sd })
    segs.push({ label: 'CTA', color: S.success, from: total - ctaDur, to: total })
  } else {
    segs.push({ label: template, color: S.accentBright, from: 0, to: total })
  }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 26, display: 'flex', gap: 2, borderRadius: 5, overflow: 'hidden' }}>
        {segs.map((seg, i) => (
          <div key={i} style={{ width: `${((seg.to - seg.from) / total) * 100}%`, background: `${seg.color}20`, border: `1px solid ${seg.color}40`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <span style={{ fontSize: 9, color: seg.color, fontWeight: 600, whiteSpace: 'nowrap', padding: '0 4px' }}>{seg.label}</span>
          </div>
        ))}
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${progress * 100}%`, width: 2, background: S.accentBright, boxShadow: `0 0 8px ${S.accentBright}80`, borderRadius: 999, zIndex: 10, transition: 'left 0.05s linear' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: S.textMuted, fontFamily: 'monospace' }}>{(currentFrame / fps).toFixed(1)}s</span>
        <span style={{ fontSize: 10, color: S.textMuted }}>{spec.width}×{spec.height} · {fps}fps</span>
        <span style={{ fontSize: 10, color: S.textMuted, fontFamily: 'monospace' }}>{(total / fps).toFixed(1)}s</span>
      </div>
    </div>
  )
}

/* ── Component Manager (right panel, opens on canvas click) ───────── */
function ComponentManager({
  spec, onEdit, onClose,
}: {
  spec: VideoCompositionSpec
  onEdit: (prompt: string) => void
  onClose: () => void
}) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null)
  const tmpl = TEMPLATES.find(t => t.id === spec.template)
  const TmplIcon = tmpl?.icon ?? Settings2
  const fps = spec.fps
  const total = spec.durationInFrames

  type Layer = { id: string; label: string; color: string; from: number; to: number }
  const layers: Layer[] = []

  if (spec.template === 'BrandPromo') {
    const slides = (spec.props as any).slides?.length ?? 2
    const intro = fps * 3, outro = fps * 4
    const sd = Math.floor((total - intro - outro) / slides)
    layers.push({ id: 'intro', label: 'Intro', color: S.accent, from: 0, to: intro })
    for (let i = 0; i < slides; i++) layers.push({ id: `slide-${i}`, label: `Slide ${i + 1}`, color: '#3b82f6', from: intro + i * sd, to: intro + (i + 1) * sd })
    layers.push({ id: 'cta', label: 'CTA', color: S.success, from: total - outro, to: total })
  } else if (spec.template === 'ProductShowcase') {
    const products = (spec.props as any).products?.length ?? 2
    const intro = fps * 2, outro = fps * 3
    const pd = Math.floor((total - intro - outro) / products)
    layers.push({ id: 'intro', label: 'Intro', color: S.accent, from: 0, to: intro })
    for (let i = 0; i < products; i++) {
      const name = (spec.props as any).products?.[i]?.name?.split(' ')[0] || `Produto ${i + 1}`
      layers.push({ id: `product-${i}`, label: name, color: '#06b6d4', from: intro + i * pd, to: intro + (i + 1) * pd })
    }
    layers.push({ id: 'cta', label: 'CTA', color: S.success, from: total - outro, to: total })
  } else if (spec.template === 'StoryReel') {
    const slides = (spec.props as any).slides?.length ?? 3
    const ctaDur = fps * 3
    const sd = Math.floor((total - ctaDur) / slides)
    for (let i = 0; i < slides; i++) layers.push({ id: `slide-${i}`, label: `Slide ${i + 1}`, color: '#f59e0b', from: i * sd, to: (i + 1) * sd })
    layers.push({ id: 'cta', label: 'CTA', color: S.success, from: total - ctaDur, to: total })
  } else {
    layers.push({ id: 'main', label: spec.template, color: S.accentBright, from: 0, to: total })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${tmpl?.color ?? S.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TmplIcon size={13} style={{ color: tmpl?.color ?? S.accentBright }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: S.text, lineHeight: 1.2 }}>Componentes</div>
          <div style={{ fontSize: 10, color: S.textMuted }}>{tmpl?.label ?? spec.template}</div>
        </div>
        <div style={{ flex: 1 }} />
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', color: S.textMuted }}>
          <X size={14} />
        </motion.button>
      </div>

      {/* Spec badges */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${S.border}`, display: 'flex', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: `${tmpl?.color ?? S.accent}15`, color: tmpl?.color ?? S.accentBright, fontWeight: 700 }}>{spec.width}×{spec.height}</span>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: S.elevated, color: S.textMuted }}>{Math.round(total / fps)}s</span>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: S.elevated, color: S.textMuted }}>{fps}fps</span>
      </div>

      {/* Layers */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <div style={{ fontSize: 9, color: S.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, padding: '0 2px' }}>
          Layers · {layers.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {layers.map(layer => {
            const isExpanded = expandedLayer === layer.id
            const dur = ((layer.to - layer.from) / fps).toFixed(1)
            return (
              <div key={layer.id}>
                <motion.button
                  onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                  whileHover={{ x: 1 }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px',
                    borderRadius: 8, cursor: 'pointer',
                    background: isExpanded ? `${layer.color}12` : S.elevated,
                    border: `1px solid ${isExpanded ? layer.color + '40' : S.border}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: layer.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: isExpanded ? 600 : 400, color: isExpanded ? layer.color : S.text, flex: 1 }}>{layer.label}</span>
                  <span style={{ fontSize: 10, color: S.textMuted, fontFamily: 'monospace' }}>{dur}s</span>
                  {isExpanded ? <ChevronUp size={11} style={{ color: layer.color }} /> : <ChevronDown size={11} style={{ color: S.textDim }} />}
                </motion.button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, color: S.textMuted }}>Frames {layer.from}–{layer.to} · {dur}s</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {[
                            { label: 'Melhorar', fn: () => onEdit(`Melhore o ${layer.label} do vídeo`) },
                            { label: 'Cores', fn: () => onEdit(`Altere as cores do ${layer.label}`) },
                            { label: 'Texto', fn: () => onEdit(`Ajuste o texto do ${layer.label}`) },
                          ].map(({ label, fn }) => (
                            <motion.button key={label} whileTap={{ scale: 0.95 }} onClick={fn}
                              style={{ fontSize: 10.5, padding: '4px 9px', borderRadius: 6, background: label === 'Melhorar' ? `${layer.color}15` : S.elevated, border: `1px solid ${label === 'Melhorar' ? layer.color + '35' : S.border}`, color: label === 'Melhorar' ? layer.color : S.textMuted, cursor: 'pointer', fontWeight: label === 'Melhorar' ? 600 : 400 }}>
                              {label}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {/* Quick actions */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 9, color: S.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, padding: '0 2px' }}>
            Ações Rápidas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { label: 'Trocar paleta de cores', Icon: Palette },
              { label: 'Aumentar duração', Icon: Clock },
              { label: 'Versão mais compacta', Icon: Maximize2 },
              { label: 'Reescrever todos os textos', Icon: AlignLeft },
            ].map(({ label, Icon }) => (
              <motion.button key={label} whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}
                onClick={() => onEdit(label)}
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: S.text, transition: 'background 0.12s' }}>
                <Icon size={12} style={{ color: S.accentBright, flexShrink: 0 }} />
                {label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Chat panel ───────────────────────────────────────────────────── */
function ChatPanel({
  messages, composing, input, onInput, onSend, onSuggestion, onReset, currentSpec, textareaRef, chatEndRef, showSuggestions,
}: {
  messages: VideoMessage[]
  composing: boolean
  input: string
  onInput: (v: string) => void
  onSend: (t: string) => void
  onSuggestion: (s: string) => void
  onReset: () => void
  currentSpec: VideoCompositionSpec | null
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  chatEndRef: React.RefObject<HTMLDivElement | null>
  showSuggestions?: boolean
}) {
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input) }
  }
  return (
    <>
      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${S.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wand2 size={13} style={{ color: S.accentBright }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: S.text, lineHeight: 1.2 }}>AI Copilot</div>
          <div style={{ fontSize: 10, color: S.textMuted }}>Motion design inteligente</div>
        </div>
        <div style={{ flex: 1 }} />
        {currentSpec && (
          <motion.button whileTap={{ scale: 0.88 }} onClick={onReset}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: S.textMuted, padding: 4, borderRadius: 6, display: 'flex' }}>
            <RefreshCw size={13} />
          </motion.button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && showSuggestions && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: S.elevated, border: `1px solid ${S.border}`, fontSize: 12.5, color: S.textMuted, lineHeight: 1.6 }}>
              Descreva o vídeo que quer criar. A IA vai compor automaticamente usando os dados da sua marca.
            </div>
            <div style={{ fontSize: 9, color: S.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 2px' }}>Sugestões</div>
            {SUGGESTIONS.map((s, i) => (
              <motion.button key={i}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.055 }} whileHover={{ x: 3 }}
                onClick={() => onSuggestion(s)}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, background: 'transparent', border: `1px solid ${S.border}`, fontSize: 12, color: S.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChevronRight size={11} style={{ color: S.accentBright, flexShrink: 0 }} />
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
        {messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)}
        <AnimatePresence>{composing && <ThinkingPipeline key="pipeline" />}</AnimatePresence>
        <div ref={chatEndRef} style={{ height: 8 }} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => onInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Descreva o vídeo..."
            disabled={composing}
            rows={1}
            style={{ flex: 1, resize: 'none', background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: S.text, outline: 'none', fontFamily: 'inherit', minHeight: 38, maxHeight: 100, lineHeight: 1.5 }}
            onInput={e => {
              const el = e.currentTarget; el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 100)}px`
            }}
          />
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }}
            onClick={() => onSend(input)} disabled={!input.trim() || composing}
            style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: (!input.trim() || composing) ? S.elevated : S.accent, border: `1px solid ${(!input.trim() || composing) ? S.border : 'transparent'}`, cursor: (!input.trim() || composing) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (!input.trim() || composing) ? 0.5 : 1 }}>
            {composing
              ? <Loader2 size={14} style={{ color: S.textMuted, animation: 'spin 1s linear infinite' }} />
              : <Send size={14} style={{ color: '#fff' }} />}
          </motion.button>
        </div>
      </div>
    </>
  )
}

/* ── Landing screen (initial, before first message) ──────────────── */
function LandingScreen({
  input, onInput, onSend, onSuggestion, composing, textareaRef,
}: {
  input: string
  onInput: (v: string) => void
  onSend: (t: string) => void
  onSuggestion: (s: string) => void
  composing: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input) }
  }
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '24px 32px' }}>
      <LivingBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, maxWidth: 560, width: '100%' }}>

        {/* Single canvas placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.08, type: 'spring', damping: 24, stiffness: 260 }}
          style={{ width: 168, height: 104, borderRadius: 14, background: `linear-gradient(135deg, ${S.accent}16, ${S.accent}06)`, border: `1.5px solid ${S.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 36px ${S.accent}0e` }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <Film size={22} style={{ color: S.accentBright, opacity: 0.65 }} />
            <span style={{ fontSize: 9, color: S.accentBright, fontWeight: 700, opacity: 0.55, letterSpacing: '1.2px', textTransform: 'uppercase' }}>16:9 · HD · 30s</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          style={{ textAlign: 'center' }}
        >
          <div style={{ fontSize: 27, fontWeight: 700, color: S.text, letterSpacing: '-0.6px', lineHeight: 1.22, marginBottom: 9 }}>
            O que vamos criar hoje?
          </div>
          <div style={{ fontSize: 13.5, color: S.textMuted, lineHeight: 1.68 }}>
            Descreva o vídeo — a IA seleciona o template, anima e gera o preview.
          </div>
        </motion.div>

        {/* Suggestion chips */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {SUGGESTIONS.map((s, i) => (
            <motion.button key={i}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.26 + i * 0.06 }}
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
              onClick={() => onSuggestion(s)}
              style={{ padding: '6px 13px', borderRadius: 20, background: S.surface, border: `1px solid ${S.border}`, fontSize: 11.5, color: S.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'all 0.12s' }}>
              <ChevronRight size={10} style={{ color: S.accentBright, flexShrink: 0 }} />
              {s}
            </motion.button>
          ))}
        </motion.div>

        {/* Input */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          style={{ width: '100%' }}
        >
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-end', background: S.surface, borderRadius: 14, border: `1.5px solid ${S.borderMid}`, padding: '10px 10px 10px 16px', boxShadow: '0 2px 20px rgba(0,0,0,0.07)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => onInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ex: vídeo institucional da minha padaria com cores quentes e produtos do dia..."
              disabled={composing}
              rows={1}
              style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', padding: 0, fontSize: 13.5, color: S.text, outline: 'none', fontFamily: 'inherit', minHeight: 24, maxHeight: 120, lineHeight: 1.55, marginRight: 8 }}
              onInput={e => {
                const el = e.currentTarget; el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
            <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }}
              onClick={() => onSend(input)} disabled={!input.trim() || composing}
              style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: (!input.trim() || composing) ? S.elevated : S.accent, border: `1px solid ${(!input.trim() || composing) ? S.border : 'transparent'}`, cursor: (!input.trim() || composing) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (!input.trim() || composing) ? 0.45 : 1 }}>
              {composing
                ? <Loader2 size={16} style={{ color: S.textMuted, animation: 'spin 1s linear infinite' }} />
                : <Send size={16} style={{ color: '#fff' }} />}
            </motion.button>
          </div>
          <div style={{ fontSize: 10.5, color: S.textDim, textAlign: 'center', marginTop: 8 }}>
            Enter para enviar · Shift+Enter para nova linha
          </div>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────────────────── */
export function VideoStudioPage() {
  const { isMobile, isSmall } = useBreakpoint()

  const [messages, setMessages]         = useState<VideoMessage[]>([])
  const [input, setInput]               = useState('')
  const [composing, setComposing]       = useState(false)
  const [rendering, setRendering]       = useState(false)
  const [renderJobId, setRenderJobId]   = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl]   = useState<string | null>(null)
  const [currentSpec, setCurrentSpec]   = useState<VideoCompositionSpec | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying]           = useState(false)
  const [propsOpen, setPropsOpen]       = useState(false)
  const [brandName, setBrandName]       = useState('')
  const [mobileTab, setMobileTab]       = useState<'canvas' | 'chat'>('canvas')
  const [canvasArea, setCanvasArea]     = useState({ w: 800, h: 500 })

  const playerRef   = useRef<PlayerRef>(null)
  const chatEndRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canvasRef   = useRef<HTMLDivElement>(null)

  const hasStarted = messages.length > 0 || composing

  useEffect(() => {
    const brandId = localStorage.getItem('lead-system:active-brand-id')
    if (!brandId) return
    fetch('/api/brands', { headers: getHeaders(false) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.brands ?? []
        const b = list.find((x: any) => String(x.id) === String(brandId)) || list[0]
        if (b?.name) setBrandName(b.name)
      }).catch(() => {})
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setCanvasArea({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!currentSpec) return
    const player = playerRef.current
    if (!player) return
    const id = setInterval(() => setCurrentFrame(player.getCurrentFrame()), 50)
    return () => clearInterval(id)
  }, [currentSpec])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, composing])

  useRenderPoll(
    renderJobId,
    (url) => { setDownloadUrl(url); setRendering(false); setRenderJobId(null); addMsg('Vídeo renderizado! Clique em Download MP4.') },
    (err) => { setRendering(false); setRenderJobId(null); addMsg(`Erro: ${err}`) },
  )

  function addMsg(content: string, spec?: VideoCompositionSpec) {
    setMessages(prev => [...prev, { role: 'assistant', content, spec, timestamp: Date.now() }])
  }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || composing) return
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }])
    setInput('')
    setComposing(true)
    setDownloadUrl(null)
    if (isMobile) setMobileTab('canvas')

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/video-studio/compose', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ message: text, currentSpec: currentSpec ?? undefined, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao compor')
      const spec: VideoCompositionSpec = data.spec
      setCurrentSpec(spec)
      setPlaying(false)
      setCurrentFrame(0)
      const LABELS: Record<string, string> = {
        BrandPromo: 'Propaganda da Marca', ProductShowcase: 'Vitrine de Produtos',
        StoryReel: 'Story / Reels', CinematicReveal: 'Reveal Cinematográfico',
        KineticTypography: 'Tipografia Cinética', NeonGlow: 'Neon Glow',
      }
      addMsg(`Composição "${LABELS[spec.template] || spec.template}" criada — ${Math.round(spec.durationInFrames / spec.fps)}s, ${spec.width}×${spec.height}. Veja o preview! Clique no canvas para editar componentes.`, spec)
    } catch (err: any) {
      addMsg(`Erro: ${err.message}`)
    } finally {
      setComposing(false)
    }
  }, [composing, currentSpec, messages, isMobile])

  const handleExport = useCallback(async () => {
    if (!currentSpec || rendering) return
    setRendering(true); setDownloadUrl(null)
    addMsg('Iniciando render... Isso pode levar alguns minutos.')
    try {
      const res = await fetch('/api/video-studio/render', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ spec: currentSpec }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      setRenderJobId(data.jobId)
    } catch (err: any) {
      setRendering(false)
      addMsg(`Erro ao iniciar render: ${err.message}`)
    }
  }, [currentSpec, rendering])

  const togglePlay = () => {
    const p = playerRef.current
    if (!p) return
    if (playing) { p.pause(); setPlaying(false) } else { p.play(); setPlaying(true) }
  }

  const compW = currentSpec?.width ?? 1280
  const compH = currentSpec?.height ?? 720
  const PAD = isMobile ? 24 : 48
  const maxW = Math.max(canvasArea.w - PAD * 2, 80)
  const maxH = Math.max(canvasArea.h - PAD * 2, 80)
  const scale = Math.min(maxW / compW, maxH / compH, 1)
  const displayW = Math.floor(compW * scale)
  const displayH = Math.floor(compH * scale)

  const activeTmpl = currentSpec ? TEMPLATES.find(t => t.id === currentSpec.template) : null

  const chatProps = {
    messages, composing, input,
    onInput: setInput,
    onSend: sendMessage,
    onSuggestion: sendMessage,
    onReset: () => { setCurrentSpec(null); setMessages([]); setDownloadUrl(null); setPropsOpen(false) },
    currentSpec, textareaRef, chatEndRef,
  }

  /* ─── MOBILE ────────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: S.bg, color: S.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ height: 44, background: S.surface, borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${S.accent}, ${S.accentBright})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Film size={13} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Video Studio</span>
          {brandName && <span style={{ fontSize: 11, color: S.textMuted }}>· {brandName}</span>}
          <div style={{ flex: 1 }} />
          {currentSpec && (
            <div style={{ display: 'flex', gap: 4 }}>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => { playerRef.current?.seekTo(0); setCurrentFrame(0) }}
                style={{ width: 28, height: 28, borderRadius: 7, background: S.elevated, border: `1px solid ${S.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SkipBack size={11} style={{ color: S.textMuted }} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={togglePlay}
                style={{ width: 28, height: 28, borderRadius: 7, background: S.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing ? <Pause size={12} style={{ color: '#fff' }} /> : <Play size={12} style={{ color: '#fff' }} />}
              </motion.button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {mobileTab === 'canvas' && (
            <div ref={canvasRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <LivingBackground />
              <AnimatePresence mode="wait">
                {currentSpec ? (
                  <motion.div key={currentSpec.template} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: `0 0 0 1px ${S.border}, 0 16px 40px rgba(0,0,0,0.5)`, background: '#000', width: displayW, height: displayH }}>
                      <Player ref={playerRef}
                        component={activeTmpl?.component as React.ComponentType<any> ?? BrandPromo}
                        inputProps={currentSpec.props as any}
                        durationInFrames={currentSpec.durationInFrames}
                        fps={currentSpec.fps}
                        compositionWidth={compW}
                        compositionHeight={compH}
                        style={{ width: displayW, height: displayH, display: 'block' }}
                        controls={false} loop autoPlay={false}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: 'center', maxWidth: 280, padding: 32, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 80, height: 50, borderRadius: 10, background: `${S.accent}16`, border: `1.5px solid ${S.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Film size={18} style={{ color: S.accentBright, opacity: 0.65 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: S.text, marginBottom: 6 }}>O que vamos criar?</div>
                      <div style={{ fontSize: 12, color: S.textMuted, lineHeight: 1.6 }}>
                        Toque em <strong style={{ color: S.accentBright }}>Chat</strong> para descrever o vídeo
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {mobileTab === 'chat' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: S.surface }}>
              <ChatPanel {...chatProps} showSuggestions />
            </div>
          )}
        </div>
        <div style={{ height: 52, background: S.surface, borderTop: `1px solid ${S.border}`, display: 'flex', flexShrink: 0 }}>
          {([
            { key: 'canvas' as const, Icon: Film,          label: 'Canvas' },
            { key: 'chat'   as const, Icon: Wand2,         label: 'Chat IA' },
          ]).map(tab => {
            const active = mobileTab === tab.key
            return (
              <button key={tab.key} onClick={() => setMobileTab(tab.key)}
                style={{ flex: 1, height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <tab.Icon size={18} style={{ color: active ? S.accentBright : S.textMuted }} />
                <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, color: active ? S.accentBright : S.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{tab.label}</span>
              </button>
            )
          })}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  /* ─── DESKTOP ───────────────────────────────────────────────────── */
  const chatW   = isSmall ? 280 : 308
  const propsW  = propsOpen ? (isSmall ? 248 : 272) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: S.bg, color: S.text, overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ height: 48, background: S.surface, borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `linear-gradient(135deg, ${S.accent}, ${S.accentBright})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Film size={13} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text }}>Video Studio</span>
        </div>

        {brandName && (
          <>
            <div style={{ width: 1, height: 14, background: S.border }} />
            <span style={{ fontSize: 11, color: S.textMuted, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brandName}</span>
          </>
        )}

        <AnimatePresence>
          {currentSpec && (
            <motion.div initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.88 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: S.elevated, border: `1px solid ${S.border}`, fontSize: 11, color: S.textMuted }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: S.success }} />
              {currentSpec.template} · {currentSpec.width}×{currentSpec.height} · {Math.round(currentSpec.durationInFrames / currentSpec.fps)}s
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ flex: 1 }} />

        {currentSpec && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => { playerRef.current?.seekTo(0); setCurrentFrame(0) }}
                style={{ width: 30, height: 30, borderRadius: 7, background: 'transparent', border: `1px solid ${S.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SkipBack size={13} style={{ color: S.textMuted }} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={togglePlay}
                style={{ width: 34, height: 34, borderRadius: 8, background: S.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing ? <Pause size={14} style={{ color: '#fff' }} /> : <Play size={14} style={{ color: '#fff' }} />}
              </motion.button>
            </div>
            <div style={{ width: 1, height: 18, background: S.border }} />
            {downloadUrl ? (
              <motion.a href={downloadUrl} download initial={{ scale: 0.9 }} animate={{ scale: 1 }} whileHover={{ scale: 1.02 }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: S.success, fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
                <Download size={13} /> Download MP4
              </motion.a>
            ) : (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleExport} disabled={rendering}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: rendering ? S.elevated : S.accent, border: `1px solid ${rendering ? S.border : 'transparent'}`, fontSize: 12, fontWeight: 600, color: rendering ? S.textMuted : '#fff', cursor: rendering ? 'not-allowed' : 'pointer', opacity: rendering ? 0.7 : 1 }}>
                {rendering
                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Renderizando...</>
                  : <><Sparkles size={13} /> Exportar MP4</>}
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: Chat (always visible after start, hidden on landing) */}
        <AnimatePresence>
          {hasStarted && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: chatW, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{ flexShrink: 0, background: S.surface, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <ChatPanel {...chatProps} showSuggestions />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center: Canvas or Landing */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {!hasStarted ? (
            <LandingScreen
              input={input} onInput={setInput}
              onSend={sendMessage} onSuggestion={sendMessage}
              composing={composing} textareaRef={textareaRef}
            />
          ) : (
            <div
              ref={canvasRef}
              onClick={() => currentSpec && setPropsOpen(p => !p)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', cursor: currentSpec ? 'pointer' : 'default', minHeight: 0 }}
            >
              <LivingBackground />
              <AnimatePresence mode="wait">
                {currentSpec ? (
                  <motion.div key={currentSpec.template + displayW} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 280 }} style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ position: 'absolute', top: -28, left: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: S.textMuted, fontFamily: 'monospace' }}>{compW}×{compH} · {currentSpec.fps}fps</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `${activeTmpl?.color ?? S.accent}18`, color: activeTmpl?.color ?? S.accentBright, fontWeight: 600 }}>
                        {activeTmpl?.label ?? currentSpec.template}
                      </span>
                    </div>
                    <div style={{ borderRadius: 10, overflow: 'hidden', boxShadow: `0 0 0 1px ${S.border}, 0 20px 50px rgba(0,0,0,0.55), 0 0 60px ${S.accent}0f`, background: '#000', width: displayW, height: displayH }}>
                      <Player ref={playerRef}
                        component={activeTmpl?.component as React.ComponentType<any> ?? BrandPromo}
                        inputProps={currentSpec.props as any}
                        durationInFrames={currentSpec.durationInFrames}
                        fps={currentSpec.fps}
                        compositionWidth={compW}
                        compositionHeight={compH}
                        style={{ width: displayW, height: displayH, display: 'block' }}
                        controls={false} loop autoPlay={false}
                      />
                    </div>
                    {/* Edit hint */}
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                      style={{ position: 'absolute', bottom: -26, right: 0, fontSize: 10, color: S.textDim, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Settings2 size={9} />
                      Clique para editar componentes
                    </motion.div>
                  </motion.div>
                ) : (
                  /* Canvas placeholder while composing first spec */
                  <motion.div key="empty-studio" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: 'center', zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 120, height: 74, borderRadius: 12, background: `${S.accent}12`, border: `1.5px solid ${S.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Film size={22} style={{ color: S.accentBright, opacity: 0.5 }} />
                    </div>
                    <span style={{ fontSize: 12, color: S.textMuted }}>Preview aparece aqui</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right: Component Manager (opens on canvas click) */}
        <AnimatePresence>
          {propsOpen && currentSpec && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: propsW, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{ flexShrink: 0, background: S.surface, borderLeft: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <ComponentManager
                spec={currentSpec}
                onEdit={(prompt) => { sendMessage(prompt); setPropsOpen(false) }}
                onClose={() => setPropsOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      <div style={{ height: 62, background: S.surface, borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
        <Timeline spec={currentSpec} currentFrame={currentFrame} />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
