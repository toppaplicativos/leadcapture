import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Play, Check, X, ChevronDown,
  Map, MessageSquare, Brain, ShoppingCart, Package, Store,
  Crosshair, Zap, Workflow, Users, Building2, TrendingUp,
  Sparkles, Target, Layers, Send, Image as ImageIcon, Globe, Mail,
  Shield, Infinity as InfinityIcon, Phone, Code, Handshake, HandCoins, Network,
  Bell,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon, type IconComponent } from '@/components/icons'
import { PanfleteiroPreview } from '@/components/PanfleteiroPreview'
import { LandingMapHero } from '@/components/LandingMapHero'
import { LandingRadarHero } from '@/components/LandingRadarHero'
import { LandingChaosVsUnified } from '@/components/LandingChaosVsUnified'
import { LandingFlowMockup } from '@/components/LandingFlowMockup'
import { BrandMark } from '@/components/BrandMark'
import { ChatWidget } from '@/components/ChatWidget'
import {
  asFeatureList,
  buildComparisonMatrix,
  fetchPublicPlans,
  planHighlight,
  planPriceLabel,
  type FeatureMeta,
  type MatrixCell,
  type PublicPlan,
} from '@/lib/public-plans'

/* ──────────────────────────────────────────────────
   LANDING MEDIA (imagine + imagine-video assets)
   ────────────────────────────────────────────────── */

const LANDING_MEDIA = {
  hero: {
    poster: '/landing/hero-city.jpg',
    video: '/landing/hero-city.mp4',
    alt: 'Cidade à noite com sobreposição de radar de oportunidades',
  },
  affiliates: {
    poster: '/landing/affiliate-network.jpg',
    video: '/landing/affiliate-network.mp4',
    alt: 'Rede de afiliados conectados no mercado LeadCapture',
  },
  commerce: {
    poster: '/landing/commerce-desk.jpg',
    video: '/landing/commerce-desk.mp4',
    alt: 'Venda e entrega pelo WhatsApp com pedido empacotado',
  },
} as const

/** Vídeo de fundo com poster; respeita prefers-reduced-motion */
function LandingVideoBackdrop({
  poster,
  video,
  className = '',
  opacity = 0.35,
}: {
  poster: string
  video: string
  className?: string
  opacity?: number
}) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      <img
        src={poster}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity }}
        decoding="async"
      />
      {!reduceMotion && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity }}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
        >
          <source src={video} type="video/mp4" />
        </video>
      )}
      {/* Vinheta para legibilidade do copy */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-[#0a0a0a]/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-[#0a0a0a]/50" />
    </div>
  )
}

/** Figura em card com vídeo ou still */
function LandingMediaCard({
  poster,
  video,
  alt,
  className = '',
}: {
  poster: string
  video: string
  alt: string
  className?: string
}) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  return (
    <figure
      className={`relative overflow-hidden rounded-3xl ring-1 ring-white/10 bg-[#0a0a0a] shadow-[0_24px_64px_-24px_rgba(0,0,0,0.65)] ${className}`}
    >
      <div className="aspect-[16/10] relative">
        <img
          src={poster}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {!reduceMotion && (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={poster}
            aria-label={alt}
          >
            <source src={video} type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />
      </div>
    </figure>
  )
}

/* ──────────────────────────────────────────────────
   PRIMITIVES
   ────────────────────────────────────────────────── */

type LandingTone = 'dark' | 'light'

/**
 * Ponte enxuta dark↔light — gradiente curto + uma onda suave.
 * (Mesma tonalidade: sem spacer extra.)
 */
function SectionBridge({
  from,
  to,
  className = '',
}: {
  from: LandingTone
  to: LandingTone
  className?: string
}) {
  if (from === to) return null

  const mode = `${from}-to-${to}` as const
  const waveFill = to === 'dark' ? '#0a0a0a' : '#ffffff'

  return (
    <div className={`landing-bridge landing-bridge--${mode} ${className}`} aria-hidden>
      <div className="landing-bridge__grad" />
      <svg
        className="landing-bridge__wave"
        viewBox="0 0 1440 48"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M0 24 C240 4 480 44 720 24 C960 4 1200 40 1440 20 L1440 48 L0 48 Z"
          fill={waveFill}
        />
      </svg>
    </div>
  )
}

function Section({
  id,
  dark = false,
  className = '',
  children,
}: {
  id?: string
  dark?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={`relative landing-section ${dark ? 'landing-section--dark bg-[#0a0a0a] text-white' : 'landing-section--light bg-white text-gray-900'} ${className}`}
    >
      <div className="landing-section__inner mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-16 lg:py-20">
        {children}
      </div>
    </section>
  )
}

/** Copy block: center on mobile, left on desktop */
function Stack({
  children,
  className = '',
  center = true,
}: {
  children: ReactNode
  className?: string
  center?: boolean
}) {
  return (
    <div className={`landing-stack ${center ? 'landing-stack--center' : ''} ${className}`}>
      {children}
    </div>
  )
}

function Eyebrow({
  children,
  dark = false,
}: {
  children: ReactNode
  dark?: boolean
}) {
  return (
    <div
      className={`landing-eyebrow inline-flex items-center gap-2 px-3 h-7 rounded-full uppercase mb-5 sm:mb-6 ${
        dark ? 'bg-white/10 text-white/80 ring-1 ring-white/15' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {children}
    </div>
  )
}

function H1({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <h1 className={`landing-h1 ${dark ? 'text-white' : 'text-gray-900'}`}>
      {children}
    </h1>
  )
}

function H2({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <h2 className={`landing-h2 text-balance ${dark ? 'text-white' : 'text-gray-900'}`}>
      {children}
    </h2>
  )
}

function Lead({
  children,
  dark = false,
  className = '',
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  /* Cor/tamanho vêm de .landing-lead — não forçar text-* grande aqui */
  return (
    <p className={`landing-lead ${dark ? 'landing-lead--dark' : 'landing-lead--light'} ${className}`}>
      {children}
    </p>
  )
}

const CTA_CLASS = (dark: boolean) =>
  `group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold tracking-tight transition-colors ${
    dark
      ? 'bg-white text-gray-900 hover:bg-gray-200'
      : 'bg-gray-900 text-white hover:bg-gray-800'
  }`

function PrimaryCTA({
  to,
  children,
  dark = false,
  iconRight = true,
}: {
  to: string
  children: ReactNode
  dark?: boolean
  iconRight?: boolean
}) {
  const content = (
    <>
      {children}
      {iconRight && (
        <ArrowRight
          size={16}
          strokeWidth={2.25}
          className="transition-transform group-hover:translate-x-0.5"
        />
      )}
    </>
  )

  /* Hash âncoras: <a> nativo — React Router Link não faz scroll confiável no mesmo path */
  if (to.startsWith('#')) {
    return (
      <a href={to} className={CTA_CLASS(dark)}>
        {content}
      </a>
    )
  }

  return (
    <Link to={to} className={CTA_CLASS(dark)}>
      {content}
    </Link>
  )
}

function GhostCTA({
  to,
  children,
  dark = false,
  iconLeft,
}: {
  to: string
  children: ReactNode
  dark?: boolean
  iconLeft?: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold tracking-tight transition-colors ${
        dark
          ? 'bg-white/5 text-white hover:bg-white/10 ring-1 ring-white/15'
          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
      }`}
    >
      {iconLeft}
      {children}
    </Link>
  )
}

/* ──────────────────────────────────────────────────
   NAVBAR
   ────────────────────────────────────────────────── */

function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors ${
        scrolled ? 'bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/inicio" className="flex items-center gap-2.5 text-white">
          <BrandMark size={28} inverted />
          <span className="text-[15px] font-bold tracking-tight">LeadCapture</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium text-white/70">
          <a href="#produto" className="hover:text-white transition">Produto</a>
          <a href="#afiliados" className="hover:text-white transition">Afiliados</a>
          <a href="#para-quem" className="hover:text-white transition">Para quem</a>
          <a href="#planos" className="hover:text-white transition">Planos</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center justify-center h-9 px-3.5 text-[13px] font-semibold text-white/80 hover:text-white transition"
          >
            Entrar
          </Link>
          <a
            href="#planos"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 transition"
          >
            Ver planos
            <ArrowRight size={13} strokeWidth={2.25} />
          </a>
        </div>
      </div>
    </header>
  )
}

/* ──────────────────────────────────────────────────
   1. HERO
   ────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative bg-[#0a0a0a] text-white overflow-hidden pt-28 pb-12 sm:pt-32 sm:pb-16">
      <LandingVideoBackdrop
        poster={LANDING_MEDIA.hero.poster}
        video={LANDING_MEDIA.hero.video}
        opacity={0.38}
      />
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-[1]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-[2] mx-auto max-w-6xl px-5 sm:px-8 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div className="landing-hero__copy text-center lg:text-left mx-auto lg:mx-0">
          <div className="landing-hero__kicker">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
            Sistema operacional de crescimento
          </div>

          <h1 className="landing-hero__title">
            <span className="landing-hero__title-line">O mundo inteiro pode ser</span>
            <span className="landing-hero__title-line">
              <span className="text-shimmer">sua próxima fonte</span>
            </span>
            <span className="landing-hero__title-line landing-hero__title-line--soft">
              de clientes.
            </span>
          </h1>

          <p className="landing-hero__lead mx-auto lg:mx-0">
            Encontre oportunidades em qualquer mercado e transforme em relacionamento,
            negociação e venda — num só sistema.
          </p>

          <div className="landing-hero__actions justify-center lg:justify-start">
            <PrimaryCTA to="#planos" dark>
              Escolher plano
            </PrimaryCTA>
            <GhostCTA to="/login" dark iconLeft={<TrendingUp size={14} strokeWidth={2.25} />}>
              Entrar
            </GhostCTA>
          </div>

          <div className="landing-hero__proof justify-center lg:justify-start">
            <span className="flex -space-x-1 shrink-0" aria-hidden>
              {['#10b981', '#f59e0b', '#0ea5e9'].map((c, i) => (
                <span
                  key={i}
                  className="w-5 h-5 rounded-full ring-2 ring-[#0a0a0a]"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span>
              <strong>Negócios em todo o Brasil</strong>
              {' '}escalam com LeadCapture
            </span>
          </div>
        </div>

        <div className="relative w-full min-w-0">
          <LandingRadarHero />
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────
   1.5 MAP — Mapbox interativo logo após o hero, em section própria
   com mask de imersão (sem cara de card)
   ────────────────────────────────────────────────── */

function MapInteractive() {
  return (
    <section className="relative bg-[#0a0a0a] overflow-hidden pb-12 sm:pb-16">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <div className="landing-stack landing-stack--center-always max-w-2xl mx-auto mb-6 sm:mb-7">
          <h2 className="landing-h2 text-white text-balance drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
            Encontre clientes
            <br />
            <span className="text-shimmer-bright">onde eles estão.</span>
          </h2>
          <p className="landing-lead landing-lead--dark">
            Abra o mapa, enxergue o mercado e capture leads no mesmo movimento.
            Cada região vira pipeline de venda.
          </p>
          <p className="mt-1.5 text-[10px] text-white/45 font-medium tracking-tight">
            Demo interativa · dados mascarados até você entrar
          </p>
        </div>

        {/* Mapa com mask radial nas 4 bordas - sangra pro fundo escuro */}
        <div
          className="relative w-full"
          style={{
            WebkitMaskImage: 'radial-gradient(ellipse 90% 85% at 50% 50%, black 55%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 90% 85% at 50% 50%, black 55%, transparent 100%)',
          }}
        >
          <LandingMapHero />
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────
   2. VALUE + TOOLS ROTATOR (dinâmico)
   ────────────────────────────────────────────────── */

const GROWTH_TOOLS: Array<{
  Icon: LucideIcon | IconComponent
  label: string
  line: string
  tone: string
}> = [
  { Icon: Map, label: 'Mapas', line: 'Radar geográfico: encontre quem compra na sua região.', tone: '#0d9488' },
  { Icon: WhatsAppIcon, label: 'WhatsApp', line: 'Atenda, qualifique e feche no mesmo chat.', tone: '#16a34a' },
  { Icon: InstagramIcon, label: 'Instagram', line: 'DM, stories e presença no feed — integrado à operação.', tone: '#db2777' },
  { Icon: Mail, label: 'E-mail', line: 'Sequências e follow-up que não dependem de sorte.', tone: '#2563eb' },
  { Icon: Bell, label: 'Push', line: 'Alertas no momento certo — lead, pedido, comissão.', tone: '#d97706' },
  { Icon: Handshake, label: 'Afiliados', line: 'Rede pronta no mercado: publique a oferta e escale.', tone: '#059669' },
  { Icon: Workflow, label: 'Automações', line: 'Fluxos 24/7: do primeiro contato ao pós-venda.', tone: '#7c3aed' },
  { Icon: Brain, label: 'IA & CRM', line: 'Memória de conversa + inteligência de prospecção.', tone: '#0f172a' },
]

const TOOLS_CYCLE_MS = 3200

function ToolsRotator() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)
  const railRef = useRef<HTMLDivElement | null>(null)
  const n = GROWTH_TOOLS.length
  const tool = GROWTH_TOOLS[active]
  const Icon = tool.Icon

  /* Auto-advance com progresso contínuo (não só troca brusca) */
  useEffect(() => {
    if (paused) return
    const started = performance.now()
    let frame = 0
    const loop = (now: number) => {
      const elapsed = now - started
      setTick(Math.min(1, elapsed / TOOLS_CYCLE_MS))
      if (elapsed >= TOOLS_CYCLE_MS) {
        setActive((i) => (i + 1) % n)
        return
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active, paused, n])

  /* No mobile, centraliza o chip ativo no rail horizontal */
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const chip = rail.querySelector<HTMLElement>(`[data-tool-idx="${active}"]`)
    if (!chip) return
    const left = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [active])

  const select = (i: number) => {
    setActive(i)
    setTick(0)
  }

  const r = 34
  const c = 2 * Math.PI * r
  const dash = c * (1 - tick)

  return (
    <div
      className="landing-tools"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false)
      }}
    >
      {/* Stage — ícone com anel de progresso + copy */}
      <div className="landing-tools__stage" aria-live="polite">
        <div
          className="landing-tools__orb"
          style={{ ['--tool-tone' as string]: tool.tone }}
        >
          <svg className="landing-tools__ring" viewBox="0 0 80 80" aria-hidden>
            <circle className="landing-tools__ring-track" cx="40" cy="40" r={r} />
            <circle
              className="landing-tools__ring-prog"
              cx="40"
              cy="40"
              r={r}
              style={{
                strokeDasharray: c,
                strokeDashoffset: dash,
                stroke: tool.tone,
              }}
            />
          </svg>
          <span
            className="landing-tools__icon"
            key={tool.label}
            style={{ backgroundColor: tool.tone }}
          >
            <Icon size={26} strokeWidth={1.75} />
          </span>
          <span className="landing-tools__glow" style={{ background: tool.tone }} aria-hidden />
        </div>

        <div className="landing-tools__copy" key={`copy-${tool.label}`}>
          <p className="landing-tools__kicker">Ferramenta · {String(active + 1).padStart(2, '0')}/{String(n).padStart(2, '0')}</p>
          <p className="landing-tools__label">{tool.label}</p>
          <p className="landing-tools__line">{tool.line}</p>
        </div>
      </div>

      {/* Rail — scroll-snap no mobile, wrap no desktop */}
      <div
        ref={railRef}
        className="landing-tools__rail"
        role="tablist"
        aria-label="Ferramentas da plataforma"
      >
        {GROWTH_TOOLS.map((t, i) => {
          const TIcon = t.Icon
          const on = i === active
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              data-tool-idx={i}
              aria-selected={on}
              className={`landing-tools__chip${on ? ' is-on' : ''}`}
              style={on ? { ['--chip-tone' as string]: t.tone } : undefined}
              onClick={() => select(i)}
            >
              <span className="landing-tools__chip-icon" style={{ color: on ? t.tone : undefined }}>
                <TIcon size={15} strokeWidth={2} />
              </span>
              <span className="landing-tools__chip-label">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Progress bar fine */}
      <div className="landing-tools__bar" aria-hidden>
        <span
          className="landing-tools__bar-fill"
          style={{
            width: `${tick * 100}%`,
            backgroundColor: tool.tone,
          }}
        />
      </div>
    </div>
  )
}

function ValueProp() {
  return (
    <Section dark={false} className="!py-14 sm:!py-16 lg:!py-20">
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-14 items-center">
        <Stack className="max-w-xl w-full">
          <H2>
            Encontre clientes.
            <br />
            <span className="landing-h2-muted">Venda com método.</span>
          </H2>
          <Lead>
            A oferta certa para quem quer aumentar vendas: captação, atendimento e
            fechamento no mesmo lugar — sem empilhar ferramenta.
          </Lead>
          <div className="landing-cta-row mt-7">
            <PrimaryCTA to="#planos">Escolher plano</PrimaryCTA>
          </div>
        </Stack>

        <ToolsRotator />
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   3. THE PROBLEM
   ────────────────────────────────────────────────── */

function Problem() {
  const pains = [
    'Leads não respondidos',
    'Conversas esquecidas',
    'Falta de follow-up',
    'Prospecção manual lenta',
    'Falta de controle do funil',
    'Equipe sobrecarregada',
  ]

  return (
    <Section dark>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
        <Stack>
          <Eyebrow dark>O problema</Eyebrow>
          <H2 dark>
            Seu negócio está perdendo dinheiro
            <span className="text-shimmer"> sem perceber.</span>
          </H2>

          <div className="landing-align-block mt-7 sm:mt-8 grid grid-cols-2 gap-2 landing-pain-grid">
            {pains.map(p => (
              <div key={p} className="landing-pain-chip">
                <span className="landing-pain-chip__x" aria-hidden>
                  <X size={11} strokeWidth={2.5} />
                </span>
                <span className="landing-pain-chip__t">{p}</span>
              </div>
            ))}
          </div>

          <div className="landing-align-block mt-7 sm:mt-8">
            <p className="landing-punch">
              O problema não é falta de clientes.
              <br />
              <span className="text-shimmer">É falta de sistema.</span>
            </p>
          </div>
        </Stack>

        <div className="relative w-full max-w-lg mx-auto lg:max-w-none">
          <LandingChaosVsUnified />
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   4. ECOSSISTEMA
   ────────────────────────────────────────────────── */

function Ecosystem() {
  const blocks: { Icon: LucideIcon; title: string; desc: string }[] = [
    {
      Icon: Map,
      title: 'Captação inteligente',
      desc: 'Radar no mapa com oportunidades infinitas em qualquer cidade.',
    },
    {
      Icon: MessageSquare,
      title: 'Prospecção WhatsApp',
      desc: 'Disparo inteligente com IA que personaliza cada contato.',
    },
    {
      Icon: Brain,
      title: 'CRM com memória',
      desc: 'Sistema que lembra de cada cliente, conversa e contexto.',
    },
    {
      Icon: Handshake,
      title: 'Mercado de afiliados',
      desc: 'Publique campanhas e alcance parceiros já na plataforma.',
    },
    {
      Icon: ShoppingCart,
      title: 'Vendas & pedidos',
      desc: 'Fechamento direto no WhatsApp com catálogo e checkout.',
    },
    {
      Icon: Store,
      title: 'PDV & administrativo',
      desc: 'Gestão real do negócio com relatórios em tempo real.',
    },
  ]

  return (
    <Section id="produto" className="!py-16 sm:!py-24 lg:!py-28">
      <Stack className="max-w-3xl w-full">
        <Eyebrow>Ecossistema</Eyebrow>
        <H2>
          Tudo o que você precisa
          <br />
          <span className="landing-h2-muted">em um único lugar.</span>
        </H2>
        <Lead>
          Módulos que se conectam — da captação ao pedido, com rede de afiliados pronta para escalar vendas.
        </Lead>
      </Stack>

      <div className="mt-10 sm:mt-12 lg:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {blocks.map(({ Icon, title, desc }) => (
          <article key={title} className="landing-mod-card">
            <span className="landing-mod-card__icon" aria-hidden>
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <h3 className="landing-mod-card__title">{title}</h3>
            <p className="landing-mod-card__desc">{desc}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   4.5 MERCADO DE AFILIADOS — vantagem da rede pronta
   ────────────────────────────────────────────────── */

function AffiliateMarketplace() {
  const flow = [
    {
      n: '01',
      title: 'Publique a oferta',
      desc: 'Programa com comissão, termos, onboarding e produtos — em minutos.',
    },
    {
      n: '02',
      title: 'A rede já está aqui',
      desc: 'Afiliados da plataforma veem sua campanha no mercado e se candidatam.',
    },
    {
      n: '03',
      title: 'Venda e repasse',
      desc: 'Link, cupom, comissão e PIX — com controle no painel da loja.',
    },
  ]

  const perks = [
    { Icon: Network, label: 'Não monta a rede do zero' },
    { Icon: HandCoins, label: 'Comissão e PIX estruturados' },
    { Icon: Package, label: 'Catálogo + checkout da loja' },
    { Icon: Sparkles, label: 'Onboarding e aprendizado prontos' },
  ]

  return (
    <Section id="afiliados" dark className="!py-24 sm:!py-32 overflow-hidden">
      <LandingVideoBackdrop
        poster={LANDING_MEDIA.affiliates.poster}
        video={LANDING_MEDIA.affiliates.video}
        opacity={0.28}
        className="opacity-90"
      />

      <div className="relative z-[1] grid lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-14 items-center">
        <Stack>
          <p className="landing-section-kicker landing-section-kicker--emerald">
            Mercado de afiliados
          </p>
          <H2 dark>
            Sua loja já nasce
            <br />
            <span className="text-shimmer">com força de rede.</span>
          </H2>
          <Lead dark className="text-pretty">
            No LeadCapture o dono da loja não precisa recrutar afiliado por afiliado no escuro.
            Você publica a oportunidade e conta com uma <strong className="text-white font-semibold">estrutura vasta de parceiros</strong> já ativos na plataforma — mercado, candidatura, onboarding e repasse.
          </Lead>

          <ul className="landing-align-block landing-align-block--wide mt-7 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {perks.map(({ Icon, label }) => (
              <li key={label} className="landing-perk">
                <span className="landing-perk__icon" aria-hidden>
                  <Icon size={15} strokeWidth={2} />
                </span>
                <span className="landing-perk__label">{label}</span>
              </li>
            ))}
          </ul>

          <div className="landing-cta-row mt-8 sm:mt-9">
            <PrimaryCTA to="#planos" dark>
              Ativar com um plano
            </PrimaryCTA>
            <GhostCTA to="/parceiros" dark>
              Sou afiliado
            </GhostCTA>
          </div>
        </Stack>

        <div className="relative space-y-4">
          <LandingMediaCard
            poster={LANDING_MEDIA.affiliates.poster}
            video={LANDING_MEDIA.affiliates.video}
            alt={LANDING_MEDIA.affiliates.alt}
          />

          {/* Painel operacional — fluxo, não card-grid genérico */}
          <div className="rounded-3xl ring-1 ring-white/10 bg-[#0a0a0a]/80 backdrop-blur-md p-6 sm:p-7 overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/40">
                Como a rede trabalha
              </p>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Ao vivo na plataforma
              </span>
            </div>

            <ol className="space-y-0">
              {flow.map((step, i) => (
                <li key={step.n} className="relative flex gap-4">
                  {i < flow.length - 1 && (
                    <span
                      className="absolute left-[15px] top-9 bottom-0 w-px bg-gradient-to-b from-emerald-400/40 to-white/10"
                      aria-hidden
                    />
                  )}
                  <span className="relative z-[1] w-8 h-8 rounded-full bg-[#0a0a0a] ring-1 ring-emerald-400/40 text-[11px] font-bold text-emerald-300 grid place-items-center shrink-0 tabular-nums">
                    {step.n}
                  </span>
                  <div className={`min-w-0 pb-7 ${i === flow.length - 1 ? 'pb-0' : ''}`}>
                    <p className="text-[15px] sm:text-[16px] font-bold text-white tracking-tight">{step.title}</p>
                    <p className="mt-0.5 text-[12px] text-white/50 leading-relaxed text-pretty">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-7 pt-5 border-t border-white/[0.08] grid grid-cols-3 gap-2">
              {[
                { k: 'Programa', v: 'completo' },
                { k: 'Parceiros', v: 'no mercado' },
                { k: 'Repasse', v: 'via PIX' },
              ].map((s) => (
                <div key={s.k} className="text-center px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{s.k}</p>
                  <p className="mt-0.5 text-[13px] font-bold text-white/90">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   4.6 COMÉRCIO VISUAL — WhatsApp → pedido → entrega
   ────────────────────────────────────────────────── */

function CommerceVisual() {
  return (
    <Section className="!py-14 sm:!py-20 lg:!py-24">
      <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-14 items-center">
        <LandingMediaCard
          poster={LANDING_MEDIA.commerce.poster}
          video={LANDING_MEDIA.commerce.video}
          alt={LANDING_MEDIA.commerce.alt}
          className="!ring-black/5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.2)] order-2 lg:order-1 max-w-lg mx-auto lg:max-w-none w-full"
        />
        <Stack className="order-1 lg:order-2">
          <p className="landing-section-kicker landing-section-kicker--emerald-ink">
            Do chat ao pedido
          </p>
          <H2>
            Venda no WhatsApp
            <br />
            <span className="landing-h2-muted">com operação de verdade.</span>
          </H2>
          <Lead className="text-pretty">
            Conversa, catálogo, checkout e expedição no mesmo sistema — o pedido não some
            no meio do path do cliente. Ideal para lojas que fecham no celular e entregam no mesmo dia.
          </Lead>
          <ul className="landing-align-block mt-7 space-y-2.5">
            {[
              'Atendimento e venda no mesmo fluxo',
              'Catálogo e checkout sem sair do chat',
              'Rastreio do pedido até a entrega',
            ].map((line) => (
              <li key={line} className="landing-check-line">
                <Check size={15} strokeWidth={2.5} className="landing-check-line__icon" />
                {line}
              </li>
            ))}
          </ul>
          <div className="landing-cta-row mt-8">
            <PrimaryCTA to="#planos">Escolher plano</PrimaryCTA>
          </div>
        </Stack>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   5. PANFLETEIRO
   ────────────────────────────────────────────────── */

function Panfleteiro() {
  const steps = [
    { Icon: Map, label: 'Navegue no mapa' },
    { Icon: Crosshair, label: 'Descubra empresas' },
    { Icon: Zap, label: 'Capture em segundos' },
    { Icon: TrendingUp, label: 'Oportunidades infinitas' },
  ]

  return (
    <Section dark>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
        <Stack>
          <Eyebrow dark>
            <Crosshair size={11} strokeWidth={2.5} /> Modo Panfleteiro
          </Eyebrow>
          <H2 dark>
            Explore o mercado
            <br />
            <span className="text-shimmer">como nunca antes.</span>
          </H2>
          <Lead dark>
            Mova o mapa, descubra negócios em tempo real e capture leads automaticamente. Cada
            quadra é uma nova oportunidade.
          </Lead>

          <div className="landing-align-block mt-7 sm:mt-8 space-y-2">
            {steps.map(({ Icon, label }, i) => (
              <div key={label} className="landing-step-row">
                <span className="landing-step-row__n">{i + 1}</span>
                <span className="landing-step-row__label">
                  <Icon size={15} strokeWidth={1.75} className="opacity-50" /> {label}
                </span>
              </div>
            ))}
          </div>

          <div className="landing-cta-row mt-8">
            <PrimaryCTA to="/login" dark>
              Ativar Panfleteiro
            </PrimaryCTA>
          </div>
        </Stack>

        <div className="w-full max-w-md mx-auto lg:max-w-none">
          <PanfleteiroPreviewWithToasts />
        </div>
      </div>
    </Section>
  )
}

/* Wrapper que adiciona toasts múltiplos animados em cima do PanfleteiroPreview
   pra dar sensação de captação contínua. PanfleteiroPreview ja é dark e tem
   1 toast - aqui amplificamos com 3 toasts cascateados. */
function PanfleteiroPreviewWithToasts() {
  const captures = [
    { name: 'Padaria do Bairro', segment: 'Padaria', delay: 0 },
    { name: 'Pizzaria Vila Real', segment: 'Pizzaria', delay: 1.2 },
    { name: 'Clínica Saúde+', segment: 'Clínica', delay: 2.6 },
  ]
  return (
    <div className="relative">
      <PanfleteiroPreview variant="feature" />

      {/* Toasts overlay - canto superior direito, cascateando */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5 pointer-events-none">
        {captures.map((c, i) => (
          <div
            key={c.name}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 backdrop-blur-md ring-1 ring-emerald-400/30 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
            style={{
              animation: `toast-slide-in 600ms cubic-bezier(0.16,1,0.3,1) ${c.delay}s both`,
              transform: `translateY(${i * 2}px)`,
              zIndex: 30 - i,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.9)] animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold tracking-wider uppercase text-emerald-300 leading-none">
                Lead captado
              </div>
              <div className="text-[10.5px] font-semibold text-white mt-0.5 leading-none truncate max-w-[140px]">
                {c.name}
              </div>
            </div>
            <span className="text-[8.5px] font-bold text-emerald-200/70 ml-1">{c.segment}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────
   6. AUTOMATION
   ────────────────────────────────────────────────── */

function Automation() {
  const items = [
    { Icon: Workflow, label: 'Follow-ups automáticos', desc: 'Sequências personalizadas que rodam 24/7.' },
    { Icon: Brain, label: 'Classificação de respostas', desc: 'IA identifica intenção e prioriza leads.' },
    { Icon: Sparkles, label: 'IA adaptativa', desc: 'Aprende com seu negócio e melhora a cada conversa.' },
    { Icon: Layers, label: 'Fluxos visuais', desc: 'Construa automações tipo Zapier, sem código.' },
  ]

  return (
    <Section>
      <Stack className="max-w-3xl w-full">
        <Eyebrow>Automação</Eyebrow>
        <H2>
          O sistema trabalha
          <br />
          <span className="landing-h2-muted">por você.</span>
        </H2>
        <Lead>
          Construa fluxos visuais que captam, qualificam, disparam e fecham automaticamente.
          O exemplo abaixo está executando ao vivo.
        </Lead>
      </Stack>

      <div className="mt-8 sm:mt-10">
        <LandingFlowMockup />
      </div>

      <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {items.map(({ Icon, label, desc }) => (
          <article key={label} className="landing-mod-card landing-mod-card--compact">
            <span className="landing-mod-card__icon" aria-hidden>
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="landing-mod-card__title">{label}</h3>
              <p className="landing-mod-card__desc">{desc}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   7. PARA QUEM
   ────────────────────────────────────────────────── */

function ForWho() {
  const targets = [
    {
      Icon: Handshake,
      title: 'Lojistas',
      bullets: [
        'Publique no mercado de afiliados',
        'Rede de parceiros já na plataforma',
        'Comissão, PIX e catálogo integrados',
      ],
    },
    {
      Icon: Target,
      title: 'Afiliados',
      bullets: [
        'Escolha campanhas no mercado',
        'Link, cupom e aprendizado prontos',
        'Comissões e saque via PIX',
      ],
    },
    {
      Icon: Building2,
      title: 'Empresas & agências',
      bullets: [
        'Operação comercial unificada',
        'Multi-marca e campanhas em escala',
        'Controle do funil ao pedido',
      ],
    },
  ]

  return (
    <Section id="para-quem" dark className="!py-16 sm:!py-24 lg:!py-28">
      <Stack className="max-w-3xl w-full">
        <Eyebrow dark>Para quem é</Eyebrow>
        <H2 dark>
          Construído para quem
          <br />
          <span className="text-shimmer">escala de verdade.</span>
        </H2>
      </Stack>

      <div className="mt-10 sm:mt-12 lg:mt-14 grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        {targets.map(({ Icon, title, bullets }) => (
          <article key={title} className="landing-audience-card">
            <span className="landing-audience-card__icon" aria-hidden>
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <h3 className="landing-audience-card__title">{title}</h3>
            <ul className="landing-audience-card__list">
              {bullets.map(b => (
                <li key={b}>
                  <Check size={14} strokeWidth={2.5} className="text-emerald-400 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   8. SOCIAL PROOF
   ────────────────────────────────────────────────── */

function SocialProof() {
  const quotes = [
    {
      quote: 'Triplicamos nossos leads em 30 dias.',
      author: 'Mariana S.',
      role: 'Diretora comercial',
      segment: 'Distribuidora',
      avatarColor: '#10b981',
    },
    {
      quote: 'Automatizamos 80% do atendimento e ainda fechamos mais.',
      author: 'Rafael M.',
      role: 'Founder',
      segment: 'Agência de marketing',
      avatarColor: '#0ea5e9',
    },
    {
      quote: 'Fechamos vendas direto no WhatsApp, sem fricção.',
      author: 'João P.',
      role: 'Gestor',
      segment: 'E-commerce alimentício',
      avatarColor: '#f59e0b',
    },
  ]

  const initials = (name: string) =>
    name.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase()

  return (
    <Section>
      <Stack className="max-w-3xl w-full">
        <Eyebrow>Prova social</Eyebrow>
        <H2>Resultados reais.</H2>
      </Stack>

      <div className="mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        {quotes.map((q) => (
          <figure
            key={q.author}
            className="relative p-6 rounded-2xl bg-gradient-to-br from-zinc-50 to-white border border-gray-200 hover:border-gray-300 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.08)] transition-all flex flex-col"
          >
            {/* Badge segmento - canto superior direito */}
            <span className="absolute top-4 right-4 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-gray-900 text-white">
              {q.segment}
            </span>

            {/* Estrelas */}
            <div className="flex items-center gap-0.5 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="#f59e0b"
                  stroke="#f59e0b"
                  strokeWidth="1"
                >
                  <path d="M12 2l3 7 7 .8-5.5 4.8 1.5 7.4L12 18l-6 4 1.5-7.4L2 9.8 9 9z" />
                </svg>
              ))}
            </div>

            <blockquote className="text-[16px] font-semibold text-gray-900 tracking-tight leading-snug flex-1">
              "{q.quote}"
            </blockquote>

            <figcaption className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
              {/* Avatar geométrico com iniciais */}
              <div
                className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
                style={{ backgroundColor: q.avatarColor }}
              >
                {initials(q.author)}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-gray-900 truncate">{q.author}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{q.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   9. DIFFERENTIAL
   ────────────────────────────────────────────────── */

function Differential() {
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [catalog, setCatalog] = useState<FeatureMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPublicPlans()
      .then(d => {
        if (cancelled) return
        setPlans(d.plans)
        setCatalog(d.feature_catalog || [])
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a comparação de planos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const matrix = buildComparisonMatrix(plans, catalog)
  const colCount = Math.max(plans.length, 1)
  const gridStyle = {
    gridTemplateColumns: `minmax(8rem,1.6fr) repeat(${colCount}, minmax(4.5rem,1fr))`,
  } as const

  const renderCell = (cell: MatrixCell) => {
    if (cell === true) return <Check size={16} strokeWidth={2.5} className="text-emerald-400 mx-auto" />
    if (cell === false) return <X size={16} strokeWidth={2.5} className="text-white/15 mx-auto" />
    return <span className="text-[12px] font-bold text-white tabular-nums">{cell}</span>
  }

  return (
    <Section dark className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow dark>Compare planos</Eyebrow>
        <H2 dark>
          O que cabe em cada plano,
          <br />
          <span className="text-shimmer">sem letra miúda.</span>
        </H2>
        <Lead dark className="mt-6">
          Limites e módulos vêm direto da configuração comercial — o que aparece aqui é o que o
          sistema libera de verdade.
        </Lead>
      </div>

      <div className="mt-14 rounded-3xl ring-1 ring-white/10 overflow-hidden bg-[#0d0d0f]">
        {loading && (
          <div className="px-6 py-16 text-center text-[13px] text-white/50">Carregando planos…</div>
        )}
        {error && !loading && (
          <div className="px-6 py-16 text-center text-[13px] text-red-300">{error}</div>
        )}
        {!loading && !error && plans.length === 0 && (
          <div className="px-6 py-16 text-center text-[13px] text-white/50">
            Nenhum plano ativo no momento.
          </div>
        )}
        {!loading && !error && plans.length > 0 && (
          <>
        {/* Header dinâmico */}
        <div
          className="grid gap-3 px-4 sm:px-7 py-5 bg-white/[0.04] border-b border-white/10 sticky top-0 backdrop-blur-xl z-10"
          style={gridStyle}
        >
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-white/40">
            Recurso
          </div>
          {plans.map(p => {
            const { price, period } = planPriceLabel(p)
            return (
              <div key={p.id} className="text-center relative">
                <div
                  className={`text-[12px] font-bold ${
                    p.is_featured ? 'text-emerald-300' : 'text-white'
                  }`}
                >
                  {p.name}
                </div>
                <div
                  className={`text-[10px] font-medium mt-0.5 ${
                    p.is_featured ? 'text-emerald-200/60' : 'text-white/40'
                  }`}
                >
                  {price}
                  {period}
                </div>
                {p.is_featured && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-emerald-500 text-[8px] font-bold text-white">
                    Popular
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Groups + rows */}
        {matrix.map(group => (
          <div key={group.group}>
            <div className="px-4 sm:px-7 py-3 bg-white/[0.02] border-y border-white/[0.06]">
              <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-white/35">
                {group.group}
              </div>
            </div>
            {group.rows.map(row => (
              <div
                key={row.key}
                className="grid gap-3 px-4 sm:px-7 py-3.5 items-center border-b border-white/[0.05] hover:bg-white/[0.015] transition-colors"
                style={gridStyle}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[13px] font-medium text-white/85 truncate">{row.label}</span>
                </div>
                {row.cells.map((cell, idx) => (
                  <div
                    key={`${row.key}-${plans[idx]?.id || idx}`}
                    className={`text-center ${
                      plans[idx]?.is_featured ? 'bg-emerald-500/[0.04] -my-3.5 py-3.5' : ''
                    }`}
                  >
                    {renderCell(cell)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* CTA row */}
        <div className="grid gap-3 px-4 sm:px-7 py-5 bg-white/[0.02]" style={gridStyle}>
          <div />
          {plans.map((p) => {
            const freeConsult = !p.price_cents || p.price_cents <= 0 || p.slug === 'custom'
            if (freeConsult) {
              return (
                <a
                  key={p.id}
                  href="#faq"
                  className="text-center inline-flex items-center justify-center h-9 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-bold transition border border-white/10"
                >
                  {p.name}
                </a>
              )
            }
            return (
              <Link
                key={p.id}
                to={`/cadastro?plano=${p.slug}`}
                className={`text-center inline-flex items-center justify-center h-9 px-3 rounded-full text-[11px] font-bold transition ${
                  p.is_featured
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10'
                }`}
              >
                {p.name}
              </Link>
            )
          })}
        </div>
          </>
        )}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   10. PRICING
   ────────────────────────────────────────────────── */

function Pricing() {
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPublicPlans()
      .then(d => {
        if (cancelled) return
        setPlans(d.plans)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os planos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Section className="!py-16 sm:!py-24 lg:!py-28">
      <Stack className="max-w-3xl w-full">
        <Eyebrow>Planos</Eyebrow>
        <H2>
          Escolha o plano
          <br />
          <span className="landing-h2-muted">e ative com pagamento.</span>
        </H2>
        <Lead className="text-pretty">
          Não há cadastro grátis. Selecione o plano, conclua o pagamento e sua conta é ativada
          pelo fluxo oficial de checkout.
        </Lead>
      </Stack>

      <div
        id="planos"
        className="mt-10 sm:mt-12 lg:mt-14 grid grid-cols-1 lg:grid-cols-3 gap-3 scroll-mt-24 sm:scroll-mt-28"
      >
        {loading && (
          <div className="lg:col-span-3 py-16 text-center text-[13px] text-gray-500">
            Carregando planos…
          </div>
        )}
        {error && !loading && (
          <div className="lg:col-span-3 py-16 text-center text-[13px] text-red-600">{error}</div>
        )}
        {!loading && !error && plans.length === 0 && (
          <div className="lg:col-span-3 py-16 text-center text-[13px] text-gray-500">
            Nenhum plano ativo no momento.
          </div>
        )}
        {!loading &&
          !error &&
          plans.map(p => {
            const featured = !!p.is_featured
            const { price, period } = planPriceLabel(p)
            const { highlight, sub } = planHighlight(p)
            const bullets = asFeatureList(p.features)
            const freeConsult = !p.price_cents || p.price_cents <= 0 || p.slug === 'custom'
            const cta = freeConsult ? 'Falar com vendas' : `Pagar e ativar ${p.name}`

            return (
              <article
                key={p.id}
                className={`landing-price-card relative p-6 sm:p-7 rounded-3xl flex flex-col ${
                  featured
                    ? 'landing-price-card--featured bg-gray-900 text-white ring-1 ring-gray-900'
                    : 'bg-white border border-border-light'
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 h-6 rounded-full bg-emerald-500 text-white text-[10px] font-bold tracking-[0.06em] uppercase grid place-items-center">
                    Recomendado
                  </span>
                )}

                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3
                    className={`text-[18px] sm:text-[20px] font-bold tracking-tight ${
                      featured ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {p.name}
                  </h3>
                  {p.tagline && (
                    <span
                      className={`text-[11px] font-medium ${
                        featured ? 'text-white/45' : 'text-gray-500'
                      }`}
                    >
                      {p.tagline}
                    </span>
                  )}
                </div>

                <div className="mt-5 sm:mt-6 flex items-baseline gap-1">
                  <span
                    className={`text-[32px] sm:text-[36px] font-bold tracking-tight tabular-nums ${
                      featured ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {price}
                  </span>
                  {period && (
                    <span
                      className={`text-[13px] font-medium ${
                        featured ? 'text-white/45' : 'text-gray-500'
                      }`}
                    >
                      {period}
                    </span>
                  )}
                </div>

                <div
                  className={`mt-5 inline-flex items-center gap-2 px-3 h-9 rounded-xl ${
                    featured
                      ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300'
                      : 'bg-gray-50 border border-gray-200 text-gray-900'
                  }`}
                >
                  <TrendingUp size={13} strokeWidth={2.5} />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[13px] font-bold">{highlight}</span>
                    <span
                      className={`text-[10px] font-medium ${
                        featured ? 'text-emerald-200/70' : 'text-gray-500'
                      }`}
                    >
                      {sub}
                    </span>
                  </div>
                </div>

                <ul
                  className={`mt-6 space-y-2.5 flex-1 ${
                    featured ? 'text-white/85' : 'text-gray-700'
                  }`}
                >
                  {bullets.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-[14px]">
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        className={`mt-0.5 shrink-0 ${
                          featured ? 'text-emerald-400' : 'text-emerald-600'
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {freeConsult ? (
                  <a
                    href="#faq"
                    className="mt-8 inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full text-[14px] font-semibold tracking-tight transition-colors bg-gray-900 text-white hover:bg-gray-800"
                  >
                    {cta}
                    <ArrowRight size={14} strokeWidth={2.25} />
                  </a>
                ) : (
                  <Link
                    to={`/cadastro?plano=${p.slug}`}
                    className={`mt-8 inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full text-[14px] font-semibold tracking-tight transition-colors ${
                      featured
                        ? 'bg-white text-gray-900 hover:bg-gray-200'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {cta}
                    <ArrowRight size={14} strokeWidth={2.25} />
                  </Link>
                )}
              </article>
            )
          })}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   11. DEMO
   ────────────────────────────────────────────────── */

function Demo() {
  const showcases: { Icon: LucideIcon; title: string; desc: string }[] = [
    { Icon: Map, title: 'Mapa', desc: 'Veja oportunidades em tempo real' },
    { Icon: Send, title: 'Disparo', desc: 'Mensagens personalizadas em escala' },
    { Icon: MessageSquare, title: 'Resposta', desc: 'IA classifica e prioriza' },
    { Icon: TrendingUp, title: 'Conversão', desc: 'Funil completo até a venda' },
  ]

  return (
    <Section id="demo" dark className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow dark>Demonstração</Eyebrow>
        <H2 dark>
          Veja o sistema
          <br />
          <span className="text-shimmer">em ação.</span>
        </H2>
      </div>

      {/* Big screen mock */}
      <div className="mt-14 relative">
        <div
          className="relative rounded-3xl overflow-hidden ring-1 ring-white/10 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800"
          style={{
            boxShadow:
              '0 40px 100px -30px rgba(99, 102, 241, 0.2), 0 20px 50px -10px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="aspect-[16/9] grid place-items-center">
            <button className="group flex items-center gap-3">
              <span className="w-16 h-16 rounded-full bg-white grid place-items-center group-hover:scale-110 transition-transform">
                <Play size={22} strokeWidth={2} className="text-gray-900 ml-1" />
              </span>
              <span className="text-[14px] font-semibold text-white/70">Assistir demo (2 min)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {showcases.map(({ Icon, title, desc }) => (
          <div
            key={title}
            className="p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08]"
          >
            <Icon size={18} strokeWidth={1.75} className="text-white/60 mb-3" />
            <p className="text-[14px] font-bold text-white tracking-tight">{title}</p>
            <p className="text-[12px] text-white/50 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   12. FAQ
   ────────────────────────────────────────────────── */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border-light">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] sm:text-[17px] font-bold text-gray-900 tracking-tight">{q}</span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="pb-5 text-[14px] text-gray-600 leading-relaxed pr-8">{a}</p>}
    </div>
  )
}

function FAQ() {
  const faqs = [
    {
      q: 'O que conta como "lead captado" no limite mensal?',
      a: 'Cada empresa única salva no seu CRM (via Radar do mapa ou importação inteligente) conta como 1 lead. O limite reseta todo mês — você não perde os leads já captados, apenas a capacidade de captar novos quando atinge o teto.',
    },
    {
      q: 'Qual a diferença real entre os planos?',
      a: 'Os limites (leads/dia, marcas, WhatsApp) e os módulos liberados vêm da configuração de cada plano — a tabela “Compare planos” e os cards em Planos mostram exatamente o que está ativo agora. Não há números fixos na página: tudo é lido do cadastro comercial.',
    },
    {
      q: 'Como funciona o plano Custom?',
      a: 'Custom é para operações grandes ou com integração específica (ERP, BI, fluxos próprios). Modelamos o volume de leads, número de brands, SLA e onboarding pra sua operação. Tem gerente de sucesso dedicado e implantação assistida.',
    },
    {
      q: 'Preciso saber programar?',
      a: 'Não. O LeadCapture foi construído pra ser usado por qualquer pessoa, do zero. Nenhuma linha de código necessária — nem pra automações, nem pra integrar Instagram/Facebook (Pro+).',
    },
    {
      q: 'É seguro? Posso ser banido do WhatsApp?',
      a: 'Usamos as melhores práticas de envio com aquecimento, intervalos inteligentes e personalização pra proteger seus números. Você mantém total controle e pode pausar a qualquer momento.',
    },
    {
      q: 'Posso trocar de plano depois?',
      a: 'Sim. Você pode fazer upgrade ou downgrade a qualquer momento — a cobrança ajusta proporcionalmente. Seus dados, brands e histórico ficam intactos.',
    },
    {
      q: 'Qual a diferença para um disparador comum?',
      a: 'Um disparador só envia mensagem. O LeadCapture é o sistema operacional: captação geográfica, CRM com IA, criativo, integrações Meta, vendas e BI — tudo conectado num único painel.',
    },
    {
      q: 'O que é o mercado de afiliados?',
      a: 'É a rede de parceiros já presentes na plataforma. O dono da loja publica o programa (comissão, termos, produtos) e afiliados ativos no LeadCapture veem a campanha, se candidatam e vendem com link/cupom. Você não monta a estrutura do zero: onboarding, aprendizado, comissão e PIX já estão no sistema.',
    },
  ]

  return (
    <Section id="faq" className="!py-24 sm:!py-32">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <H2>
            Perguntas
            <br />
            frequentes.
          </H2>
          <Lead>
            Não encontrou sua resposta? Fale com a gente no WhatsApp.
          </Lead>
        </div>
        <div>
          {faqs.map(f => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   13. FINAL CTA
   ────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative bg-[#0a0a0a] text-white overflow-hidden py-24 sm:py-32">
      <LandingVideoBackdrop
        poster={LANDING_MEDIA.hero.poster}
        video={LANDING_MEDIA.hero.video}
        opacity={0.38}
      />

      <div className="relative z-[1] mx-auto max-w-4xl px-5 sm:px-8">
        <div className="landing-stack landing-stack--center-always">
          <h2 className="landing-h2 text-white" style={{ fontSize: 'clamp(2.25rem, 1.4rem + 4vw, 4.25rem)' }}>
            Seu próximo cliente
            <br />
            <span className="text-shimmer">já está no mapa.</span>
          </h2>
          <p className="landing-lead landing-lead--dark">
            Só falta você ativar o sistema.
          </p>
          <div className="landing-cta-row mt-8 sm:mt-10">
            <PrimaryCTA to="#planos" dark>
              Escolher plano e ativar
            </PrimaryCTA>
            <GhostCTA to="/login" dark>
              Já tenho conta
            </GhostCTA>
          </div>
          <p className="mt-7 text-[12px] font-medium text-white/40">
            Ativação com pagamento do plano · Cancele quando quiser
          </p>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────
   FOOTER
   ────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="bg-[#0a0a0a] text-white border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link to="/inicio" className="flex items-center gap-2.5">
              <BrandMark size={28} inverted />
              <span className="text-[15px] font-bold tracking-tight">LeadCapture</span>
            </Link>
            <p className="mt-4 text-[12px] text-white/50 leading-relaxed max-w-[240px]">
              Sistema operacional de crescimento para negócios.
            </p>
          </div>

          {[
            {
              title: 'Produto',
              links: [
                ['Captação', '#produto'],
                ['Mercado de afiliados', '#afiliados'],
                ['Vendas', '#produto'],
                ['Planos', '#planos'],
              ],
            },
            {
              title: 'Empresa',
              links: [
                ['Para quem é', '#para-quem'],
                ['FAQ', '#faq'],
                ['Parceiros', '/parceiros'],
              ],
            },
            {
              title: 'Conta',
              links: [
                ['Entrar', '/login'],
                ['Planos e ativação', '#planos'],
              ],
            },
          ].map(col => (
            <div key={col.title}>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/40 mb-4">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('/') ? (
                      <Link to={href} className="text-[13px] font-medium text-white/70 hover:text-white transition">
                        {label}
                      </Link>
                    ) : (
                      <a href={href} className="text-[13px] font-medium text-white/70 hover:text-white transition">
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <p className="text-[11px] text-white/40">
            © {new Date().getFullYear()} LeadCapture. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ──────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────── */

/** Scroll para âncoras da landing com offset da navbar fixa (h-16). */
function scrollToLandingHash(hash: string, behavior: ScrollBehavior = 'smooth') {
  if (!hash || hash === '#') return
  const id = hash.startsWith('#') ? hash.slice(1) : hash
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior, block: 'start' })
}

export function LandingPage() {
  useEffect(() => {
    document.title = 'LeadCapture — Sistema operacional de crescimento'
    return () => {
      document.title = 'LeadCapture'
    }
  }, [])

  /* Hash na URL (ex: /inicio#planos vindo do login/cadastro) — scroll após paint */
  useEffect(() => {
    const run = () => {
      const { hash } = window.location
      if (hash) scrollToLandingHash(hash, 'smooth')
    }
    // Duplo rAF: espera layout (planos async / imagens) assentar
    const t1 = window.setTimeout(run, 50)
    const t2 = window.setTimeout(run, 350)
    window.addEventListener('hashchange', run)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('hashchange', run)
    }
  }, [])

  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Navbar />
      <ChatWidget />
      <main className="landing-flow">
        <Hero />
        <MapInteractive />

        <SectionBridge from="dark" to="light" />
        <ValueProp />

        <SectionBridge from="light" to="dark" />
        <Problem />

        <SectionBridge from="dark" to="light" />
        <Ecosystem />

        <SectionBridge from="light" to="dark" />
        <AffiliateMarketplace />

        <SectionBridge from="dark" to="light" />
        <CommerceVisual />

        <SectionBridge from="light" to="dark" />
        <Panfleteiro />

        <SectionBridge from="dark" to="light" />
        <Automation />

        <SectionBridge from="light" to="dark" />
        <ForWho />

        <SectionBridge from="dark" to="light" />
        <SocialProof />
        <Pricing />

        <SectionBridge from="light" to="dark" />
        <Differential />

        <SectionBridge from="dark" to="light" />
        <FAQ />

        <SectionBridge from="light" to="dark" />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
