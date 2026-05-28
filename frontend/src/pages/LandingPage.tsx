import { useState, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Play, Check, X, ChevronDown,
  Map, MessageSquare, Brain, ShoppingCart, Package, Store,
  Crosshair, Zap, Workflow, Users, Building2, TrendingUp,
  Sparkles, Target, Layers, Send, Image as ImageIcon, Globe, Mail,
  Shield, Infinity as InfinityIcon, Phone, Code, Camera, ThumbsUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* lucide-react removeu logos de marca por politica - usamos proxies neutros:
   Camera ~= Instagram, ThumbsUp ~= Facebook. Visualmente claros no contexto. */
const Instagram = Camera
const Facebook = ThumbsUp
import { PanfleteiroPreview } from '@/components/PanfleteiroPreview'
import { LandingMapHero } from '@/components/LandingMapHero'
import { LandingRadarHero } from '@/components/LandingRadarHero'
import { LandingChaosVsUnified } from '@/components/LandingChaosVsUnified'
import { LandingFlowMockup } from '@/components/LandingFlowMockup'
import { BrandMark } from '@/components/BrandMark'
import { ChatWidget } from '@/components/ChatWidget'

/* ──────────────────────────────────────────────────
   PRIMITIVES
   ────────────────────────────────────────────────── */

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
      className={`relative ${dark ? 'bg-[#0a0a0a] text-white' : 'bg-white text-gray-900'} ${className}`}
    >
      {/* Spacings reduzidos: 64-80px ao inves de 120-160px - sem gaps mortos entre seções */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        {children}
      </div>
    </section>
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
      className={`inline-flex items-center gap-2 px-3 h-7 rounded-full text-[11px] font-semibold tracking-[0.06em] uppercase mb-6 ${
        dark ? 'bg-white/10 text-white/80 ring-1 ring-white/15' : 'bg-gray-100 text-gray-700'
      }`}
    >
      {children}
    </div>
  )
}

function H1({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <h1
      className={`text-[40px] sm:text-[56px] lg:text-[72px] font-bold tracking-[-0.035em] leading-[1.02] ${
        dark ? 'text-white' : 'text-gray-900'
      }`}
    >
      {children}
    </h1>
  )
}

function H2({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <h2
      className={`text-[32px] sm:text-[44px] lg:text-[56px] font-bold tracking-[-0.03em] leading-[1.05] ${
        dark ? 'text-white' : 'text-gray-900'
      }`}
    >
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
  return (
    <p
      className={`text-[17px] sm:text-[19px] leading-[1.6] font-medium ${
        dark ? 'text-white/70' : 'text-gray-600'
      } ${className}`}
    >
      {children}
    </p>
  )
}

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
  return (
    <Link
      to={to}
      className={`group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold tracking-tight transition-colors ${
        dark
          ? 'bg-white text-gray-900 hover:bg-gray-200'
          : 'bg-gray-900 text-white hover:bg-gray-800'
      }`}
    >
      {children}
      {iconRight && (
        <ArrowRight
          size={16}
          strokeWidth={2.25}
          className="transition-transform group-hover:translate-x-0.5"
        />
      )}
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
          <Link
            to="/cadastro?plano=starter"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 transition"
          >
            Começar
            <ArrowRight size={13} strokeWidth={2.25} />
          </Link>
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
      {/* Subtle radial glow no topo - mantém o respiro original */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-60 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(34,197,94,0.10) 0%, rgba(99,102,241,0.06) 35%, transparent 70%)',
        }}
      />
      {/* Grid lines tenues */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        {/* COLUNA ESQUERDA — copy */}
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-white/5 ring-1 ring-white/15 text-[11px] font-semibold tracking-[0.06em] uppercase text-white/80 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Sistema operacional de crescimento
          </div>

          <h1 className="text-[40px] sm:text-[56px] lg:text-[68px] font-bold tracking-[-0.04em] leading-[1.0]">
            O mapa do Brasil é
            <br />
            <span className="text-shimmer"> sua próxima carteira </span>
            <br />
            de clientes.
          </h1>

          <p className="mt-6 text-[16px] sm:text-[18px] text-white/60 leading-[1.55] font-medium max-w-xl mx-auto lg:mx-0">
            Captação por radar geográfico, CRM inteligente, IA criativa e venda no WhatsApp —
            uma única plataforma.
          </p>

          <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
            <PrimaryCTA to="/cadastro?plano=starter" dark>
              Começar grátis
            </PrimaryCTA>
            <GhostCTA
              to="#planos"
              dark
              iconLeft={<TrendingUp size={14} strokeWidth={2.25} />}
            >
              Ver planos
            </GhostCTA>
          </div>

          {/* Indicador discreto de prova social */}
          <div className="mt-6 flex items-center justify-center lg:justify-start gap-2 text-[11px] font-medium text-white/40">
            <span className="flex -space-x-1">
              {['#10b981', '#f59e0b', '#0ea5e9'].map((c, i) => (
                <span
                  key={i}
                  className="w-5 h-5 rounded-full ring-2 ring-[#0a0a0a]"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span>
              <span className="font-semibold text-white/70">Negócios em todo Brasil</span> escalam com LeadCapture
            </span>
          </div>
        </div>

        {/* COLUNA DIREITA — radar animado */}
        <div className="relative w-full">
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
    <section className="relative bg-[#0a0a0a] overflow-hidden pb-16 sm:pb-20">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        {/* Header inline curto */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-amber-500/10 border border-amber-400/20 text-amber-300 text-[10.5px] font-bold tracking-[0.06em] uppercase mb-4">
            <Shield size={10} strokeWidth={2.5} />
            Demonstração interativa · Dados mascarados
          </div>
          <h2 className="text-[24px] sm:text-[32px] font-bold tracking-tight text-white">
            Mova o mapa e veja como o radar trabalha.
          </h2>
          <p className="mt-2 text-[14px] text-white/55 font-medium max-w-xl mx-auto">
            Cada cidade carrega oportunidades reais. Os dados completos (telefone, endereço, site)
            ficam disponíveis na sua conta.
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
   2. VALUE PROP
   ────────────────────────────────────────────────── */

function ValueProp() {
  /* Cards com ícones técnicos específicos por módulo, número grande de fundo, gradient
     sutil pra dar profundidade. Sem mais 6 chips genericos. */
  const blocks: Array<{ Icon: LucideIcon; title: string; desc: string }> = [
    { Icon: Crosshair,  title: 'Captação inteligente',  desc: 'Radar geográfico vasculha o Brasil inteiro por segmento.' },
    { Icon: Zap,        title: 'Prospecção ativa',      desc: 'WhatsApp com IA que personaliza cada disparo.' },
    { Icon: Brain,      title: 'CRM com memória',       desc: 'Cada conversa, cada contexto, cada lead — sempre acessível.' },
    { Icon: Workflow,   title: 'Automação de campanhas', desc: 'Sequências que rodam 24/7 sem você tocar.' },
    { Icon: ShoppingCart, title: 'Vendas & pedidos',    desc: 'Fechamento direto no chat. Catálogo, checkout, entrega.' },
    { Icon: Store,      title: 'Painel & operação',     desc: 'BI em tempo real do funil ao caixa.' },
  ]

  return (
    <Section dark={false}>
      <div className="max-w-3xl">
        <Eyebrow>Proposta de valor</Eyebrow>
        <H2>
          Um sistema. <span className="text-gray-400">Todo o seu crescimento.</span>
        </H2>
        <Lead className="mt-5">
          Você não precisa mais de 5 ferramentas diferentes. O LeadCapture unifica
          captação, conversa, automação e venda em uma única plataforma conectada.
        </Lead>
      </div>

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {blocks.map((b, i) => (
          <article
            key={b.title}
            className="group relative p-6 rounded-2xl bg-gradient-to-br from-zinc-50 to-white border border-border-light hover:border-gray-300 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.08)] transition-all overflow-hidden"
          >
            {/* Número grande de fundo - detalhe técnico */}
            <span
              className="absolute top-2 right-3 text-[64px] font-black tracking-[-0.05em] text-gray-900 pointer-events-none select-none leading-none"
              style={{ opacity: 0.06 }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>

            <span className="relative inline-flex w-11 h-11 rounded-xl bg-gray-900 text-white items-center justify-center mb-4">
              <b.Icon size={18} strokeWidth={1.75} />
            </span>
            <h3 className="relative text-[16px] font-bold text-gray-900 tracking-tight">{b.title}</h3>
            <p className="relative mt-1.5 text-[13px] text-gray-600 leading-relaxed">{b.desc}</p>
          </article>
        ))}
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
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* COLUNA ESQUERDA — copy + dores */}
        <div>
          <Eyebrow dark>O problema</Eyebrow>
          <H2 dark>
            Seu negócio está perdendo dinheiro
            <span className="text-shimmer"> sem perceber.</span>
          </H2>

          <div className="mt-8 grid grid-cols-2 gap-2">
            {pains.map(p => (
              <div
                key={p}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 ring-1 ring-white/[0.08]"
              >
                <span className="w-5 h-5 rounded-full bg-red-500/10 ring-1 ring-red-500/20 grid place-items-center shrink-0">
                  <X size={11} strokeWidth={2.5} className="text-red-400" />
                </span>
                <span className="text-[12px] font-medium text-white/85 leading-tight">{p}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 max-w-md">
            <p className="text-[22px] sm:text-[28px] font-bold tracking-[-0.025em] leading-[1.2] text-white">
              O problema não é falta de clientes.
              <br />
              <span className="text-shimmer">É falta de sistema.</span>
            </p>
          </div>
        </div>

        {/* COLUNA DIREITA — diagrama animado caos→unificado */}
        <div className="relative w-full">
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
      Icon: ShoppingCart,
      title: 'Vendas & pedidos',
      desc: 'Fechamento direto no WhatsApp com catálogo e checkout.',
    },
    {
      Icon: Package,
      title: 'Expedição',
      desc: 'Controle logístico completo, do estoque à entrega.',
    },
    {
      Icon: Store,
      title: 'PDV & administrativo',
      desc: 'Gestão real do negócio com relatórios em tempo real.',
    },
  ]

  return (
    <Section id="produto" className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow>Ecossistema</Eyebrow>
        <H2>
          Tudo o que você precisa
          <br />
          <span className="text-gray-400">em um único lugar.</span>
        </H2>
        <Lead className="mt-6">
          Seis módulos que se conectam. Não são features soltas — é uma operação inteira funcionando junta.
        </Lead>
      </div>

      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {blocks.map(({ Icon, title, desc }) => (
          <article
            key={title}
            className="group relative p-6 rounded-2xl bg-white border border-border-light hover:border-gray-300 transition-colors"
          >
            <span className="inline-flex w-11 h-11 rounded-xl bg-gray-900 text-white items-center justify-center mb-5">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <h3 className="text-[17px] font-bold text-gray-900 tracking-tight">{title}</h3>
            <p className="mt-1.5 text-[13px] text-gray-600 leading-relaxed">{desc}</p>
          </article>
        ))}
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
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <Eyebrow dark>
            <Crosshair size={11} strokeWidth={2.5} /> Modo Panfleteiro
          </Eyebrow>
          <H2 dark>
            Explore o mercado
            <br />
            <span className="text-shimmer">como nunca antes.</span>
          </H2>
          <Lead dark className="mt-5">
            Mova o mapa, descubra negócios em tempo real e capture leads automaticamente. Cada
            quadra é uma nova oportunidade.
          </Lead>

          <div className="mt-8 space-y-2.5">
            {steps.map(({ Icon, label }, i) => (
              <div key={label} className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-white/5 ring-1 ring-white/10 grid place-items-center text-[12px] font-bold text-white tabular-nums shrink-0">
                  {i + 1}
                </span>
                <span className="inline-flex items-center gap-2 text-[15px] font-medium text-white/85">
                  <Icon size={15} strokeWidth={1.75} className="text-white/50" /> {label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <PrimaryCTA to="/login" dark>
              Ativar Panfleteiro
            </PrimaryCTA>
          </div>
        </div>

        {/* Live map preview com toasts múltiplos cascateando */}
        <PanfleteiroPreviewWithToasts />
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
      <div className="max-w-3xl">
        <Eyebrow>Automação</Eyebrow>
        <H2>
          O sistema trabalha
          <br />
          <span className="text-gray-400">por você.</span>
        </H2>
        <Lead className="mt-5">
          Construa fluxos visuais que captam, qualificam, disparam e fecham automaticamente.
          O exemplo abaixo está executando ao vivo.
        </Lead>
      </div>

      {/* Mockup de fluxo dark UI — full-width, simula uma tela de automação rodando */}
      <div className="mt-10">
        <LandingFlowMockup />
      </div>

      {/* Cards das features abaixo do mockup */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(({ Icon, label, desc }) => (
          <article
            key={label}
            className="flex flex-col gap-3 p-5 rounded-2xl bg-gradient-to-br from-zinc-50 to-white border border-border-light hover:border-gray-300 transition-colors"
          >
            <span className="inline-flex w-10 h-10 rounded-xl bg-gray-900 text-white items-center justify-center shrink-0">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-gray-900 tracking-tight">{label}</h3>
              <p className="mt-1 text-[12.5px] text-gray-600 leading-relaxed">{desc}</p>
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
      Icon: Target,
      title: 'Afiliados',
      bullets: [
        'Escale vendas sem equipe',
        'Automatize prospecção',
        'Gere comissões recorrentes',
      ],
    },
    {
      Icon: Building2,
      title: 'Empresas',
      bullets: [
        'Organize a operação comercial',
        'Aumente a conversão',
        'Controle total do funil',
      ],
    },
    {
      Icon: Users,
      title: 'Agências',
      bullets: [
        'Gerencie múltiplos clientes',
        'Escale campanhas',
        'Entregue mais resultado',
      ],
    },
  ]

  return (
    <Section id="para-quem" dark className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow dark>Para quem é</Eyebrow>
        <H2 dark>
          Construído para quem
          <br />
          <span className="text-shimmer">escala de verdade.</span>
        </H2>
      </div>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-3">
        {targets.map(({ Icon, title, bullets }) => (
          <article
            key={title}
            className="p-7 rounded-3xl bg-white/[0.03] ring-1 ring-white/[0.08] hover:bg-white/[0.05] transition-colors"
          >
            <span className="inline-flex w-12 h-12 rounded-2xl bg-white text-gray-900 items-center justify-center mb-6">
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <h3 className="text-[22px] font-bold text-white tracking-tight">{title}</h3>
            <ul className="mt-5 space-y-2.5">
              {bullets.map(b => (
                <li key={b} className="flex items-start gap-2.5 text-[14px] text-white/70">
                  <Check size={14} strokeWidth={2.5} className="text-emerald-400 mt-0.5 shrink-0" />
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
      <div className="max-w-3xl">
        <Eyebrow>Prova social</Eyebrow>
        <H2>Resultados reais.</H2>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3">
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
  /* Matriz comparativa real - linhas = features, colunas = planos.
     "Custom" sempre verde porque tudo eh negociavel.  */
  type Cell = boolean | string
  const matrix: Array<{ group: string; rows: Array<{ label: string; Icon: LucideIcon; starter: Cell; pro: Cell; custom: Cell }> }> = [
    {
      group: 'Captação',
      rows: [
        { label: 'Radar geográfico no mapa', Icon: Map, starter: true, pro: true, custom: true },
        { label: 'Importação inteligente (IA)', Icon: Sparkles, starter: true, pro: true, custom: true },
        { label: 'Inteligência de prospecção (IA)', Icon: Target, starter: true, pro: true, custom: true },
        { label: 'Leads captados/dia', Icon: TrendingUp, starter: '100', pro: '500', custom: 'Ilimitado' },
        { label: 'Leads captados/mês', Icon: TrendingUp, starter: '3.000', pro: '15.000', custom: 'Ilimitado' },
      ],
    },
    {
      group: 'CRM & Comercial',
      rows: [
        { label: 'CRM com tags e funil', Icon: Layers, starter: true, pro: true, custom: true },
        { label: 'Brands (multi-operação)', Icon: Building2, starter: '1', pro: '3', custom: 'Ilimitado' },
        { label: 'Números WhatsApp conectados', Icon: Phone, starter: '1', pro: '3', custom: 'Ilimitado' },
        { label: 'Campanhas e automações', Icon: Workflow, starter: false, pro: true, custom: true },
        { label: 'Disparos em massa', Icon: Send, starter: '500/mês', pro: 'Ilimitado', custom: 'Ilimitado' },
        { label: 'Vendas, catálogo e checkout', Icon: ShoppingCart, starter: false, pro: true, custom: true },
      ],
    },
    {
      group: 'IA & Presença digital',
      rows: [
        { label: 'Criativo IA (posts, anúncios, copy)', Icon: ImageIcon, starter: false, pro: true, custom: true },
        { label: 'Integração Instagram', Icon: Instagram, starter: false, pro: true, custom: true },
        { label: 'Integração Facebook', Icon: Facebook, starter: false, pro: true, custom: true },
        { label: 'Domínio customizado', Icon: Globe, starter: false, pro: true, custom: true },
        { label: 'Emails corporativos (@seudominio)', Icon: Mail, starter: false, pro: true, custom: true },
      ],
    },
    {
      group: 'Enterprise',
      rows: [
        { label: 'API e webhooks dedicados', Icon: Code, starter: false, pro: false, custom: true },
        { label: 'Integrações sob demanda (ERP, BI)', Icon: Layers, starter: false, pro: false, custom: true },
        { label: 'Onboarding dedicado', Icon: Users, starter: false, pro: false, custom: true },
        { label: 'Gerente de sucesso (CSM)', Icon: Users, starter: false, pro: false, custom: true },
        { label: 'SLA em contrato', Icon: Shield, starter: false, pro: false, custom: true },
      ],
    },
  ]

  const renderCell = (cell: Cell) => {
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
          Numero de leads, integrações com Meta, IA criativa, domínio próprio — você vê tudo antes de assinar.
        </Lead>
      </div>

      <div className="mt-14 rounded-3xl ring-1 ring-white/10 overflow-hidden bg-[#0d0d0f]">
        {/* Header */}
        <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] sm:grid-cols-[2fr_repeat(3,1fr)] gap-3 px-4 sm:px-7 py-5 bg-white/[0.04] border-b border-white/10 sticky top-0 backdrop-blur-xl z-10">
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-white/40">
            Recurso
          </div>
          <div className="text-center">
            <div className="text-[12px] font-bold text-white">Starter</div>
            <div className="text-[10px] font-medium text-white/40 mt-0.5">R$ 97/mês</div>
          </div>
          <div className="text-center relative">
            <div className="text-[12px] font-bold text-emerald-300">Pro</div>
            <div className="text-[10px] font-medium text-emerald-200/60 mt-0.5">R$ 297/mês</div>
            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-emerald-500 text-[8px] font-bold text-white">
              Popular
            </span>
          </div>
          <div className="text-center">
            <div className="text-[12px] font-bold text-white">Custom</div>
            <div className="text-[10px] font-medium text-white/40 mt-0.5">Sob consulta</div>
          </div>
        </div>

        {/* Groups + rows */}
        {matrix.map((group) => (
          <div key={group.group}>
            <div className="px-4 sm:px-7 py-3 bg-white/[0.02] border-y border-white/[0.06]">
              <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-white/35">
                {group.group}
              </div>
            </div>
            {group.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1.5fr_repeat(3,1fr)] sm:grid-cols-[2fr_repeat(3,1fr)] gap-3 px-4 sm:px-7 py-3.5 items-center border-b border-white/[0.05] hover:bg-white/[0.015] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <row.Icon size={13} strokeWidth={2} className="text-white/35 shrink-0" />
                  <span className="text-[13px] font-medium text-white/85 truncate">{row.label}</span>
                </div>
                <div className="text-center">{renderCell(row.starter)}</div>
                <div className="text-center bg-emerald-500/[0.04] -my-3.5 py-3.5">{renderCell(row.pro)}</div>
                <div className="text-center">{renderCell(row.custom)}</div>
              </div>
            ))}
          </div>
        ))}

        {/* CTA row */}
        <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] sm:grid-cols-[2fr_repeat(3,1fr)] gap-3 px-4 sm:px-7 py-5 bg-white/[0.02]">
          <div />
          <Link
            to="/cadastro?plano=starter"
            className="text-center inline-flex items-center justify-center h-9 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-bold transition border border-white/10"
          >
            Começar
          </Link>
          <Link
            to="/cadastro?plano=starter"
            className="text-center inline-flex items-center justify-center h-9 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-bold transition"
          >
            Pro
          </Link>
          <a
            href="#contato"
            className="text-center inline-flex items-center justify-center h-9 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-bold transition border border-white/10"
          >
            Vendas
          </a>
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   10. PRICING
   ────────────────────────────────────────────────── */

function Pricing() {
  const plans = [
    {
      name: 'Starter',
      tagline: 'Comece a captar hoje',
      price: 'R$ 97',
      period: '/mês',
      highlight: '3.000 leads/mês',
      sub: '100 leads captados por dia',
      features: [
        '1 brand · 1 número WhatsApp',
        'Captação no mapa (Radar)',
        'CRM completo com tags e funil',
        'Importação inteligente (IA)',
        'Inteligência de prospecção (IA)',
        'Suporte por email',
      ],
      cta: 'Começar grátis',
      featured: false,
      slug: 'starter',
    },
    {
      name: 'Pro',
      tagline: 'Cresça com IA + presença digital',
      price: 'R$ 297',
      period: '/mês',
      highlight: '15.000 leads/mês',
      sub: '500 leads captados por dia',
      features: [
        'Tudo do Starter, e mais:',
        '3 brands · 3 números WhatsApp',
        'Criativo IA (posts, anúncios, copy)',
        'Integração Instagram + Facebook',
        'Domínio customizado (seudominio.com.br)',
        'Emails corporativos (você@seudominio)',
        'Automação completa de campanhas',
        'Disparos em massa ilimitados',
        'Vendas, catálogo e checkout',
        'Suporte prioritário',
      ],
      cta: 'Começar com Pro',
      featured: true,
      slug: 'pro',
    },
    {
      name: 'Custom',
      tagline: 'Sob medida para empresas',
      price: 'Sob consulta',
      period: '',
      highlight: 'Volume ilimitado',
      sub: 'Modelagem por operação',
      features: [
        'Tudo do Pro, e mais:',
        'Brands e números ilimitados',
        'API e webhooks dedicados',
        'Integrações sob demanda (ERP, BI)',
        'Onboarding e treinamento dedicado',
        'Gerente de sucesso (CSM) próprio',
        'SLA garantido em contrato',
        'Implantação assistida',
      ],
      cta: 'Falar com vendas',
      featured: false,
      slug: 'custom',
    },
  ]

  return (
    <Section id="planos" className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow>Planos</Eyebrow>
        <H2>
          Escolha o plano
          <br />
          <span className="text-gray-400">que cresce com você.</span>
        </H2>
      </div>

      <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-3">
        {plans.map(p => (
          <article
            key={p.name}
            className={`relative p-7 rounded-3xl flex flex-col ${
              p.featured
                ? 'bg-gray-900 text-white ring-1 ring-gray-900'
                : 'bg-white border border-border-light'
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 h-6 rounded-full bg-emerald-500 text-white text-[10px] font-bold tracking-[0.06em] uppercase grid place-items-center">
                Recomendado
              </span>
            )}

            <div className="flex items-baseline gap-2">
              <h3 className={`text-[20px] font-bold tracking-tight ${p.featured ? 'text-white' : 'text-gray-900'}`}>
                {p.name}
              </h3>
              <span
                className={`text-[12px] font-medium ${
                  p.featured ? 'text-white/50' : 'text-gray-500'
                }`}
              >
                {p.tagline}
              </span>
            </div>

            <div className="mt-6 flex items-baseline gap-1">
              <span className={`text-[36px] font-bold tracking-tight tabular-nums ${p.featured ? 'text-white' : 'text-gray-900'}`}>
                {p.price}
              </span>
              {p.period && (
                <span className={`text-[14px] font-medium ${p.featured ? 'text-white/50' : 'text-gray-500'}`}>
                  {p.period}
                </span>
              )}
            </div>

            {/* Highlight de volume — chip principal logo abaixo do preço */}
            <div className={`mt-5 inline-flex items-center gap-2 px-3 h-9 rounded-xl ${
              p.featured
                ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300'
                : 'bg-gray-50 border border-gray-200 text-gray-900'
            }`}>
              <TrendingUp size={13} strokeWidth={2.5} />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold">{(p as any).highlight}</span>
                <span className={`text-[10px] font-medium ${p.featured ? 'text-emerald-200/70' : 'text-gray-500'}`}>
                  {(p as any).sub}
                </span>
              </div>
            </div>

            <ul className={`mt-6 space-y-2.5 flex-1 ${p.featured ? 'text-white/85' : 'text-gray-700'}`}>
              {p.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-[14px]">
                  <Check
                    size={14}
                    strokeWidth={2.5}
                    className={`mt-0.5 shrink-0 ${p.featured ? 'text-emerald-400' : 'text-emerald-600'}`}
                  />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to={`/cadastro?plano=${(p as any).slug || p.name.toLowerCase()}`}
              className={`mt-8 inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full text-[14px] font-semibold tracking-tight transition-colors ${
                p.featured
                  ? 'bg-white text-gray-900 hover:bg-gray-200'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {p.cta}
              <ArrowRight size={14} strokeWidth={2.25} />
            </Link>
          </article>
        ))}
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
      q: 'Qual a diferença real entre Starter e Pro?',
      a: 'O Starter é pra quem quer começar a captar e atender pelo WhatsApp (100 leads/dia, 1 brand, 1 número). O Pro libera o que escala um negócio digital de verdade: Criativo IA pra posts/anúncios, integração Instagram e Facebook, domínio próprio (seudominio.com.br), emails corporativos e disparos em massa sem limite.',
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
          <Lead className="mt-6">
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
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.18) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 text-center">
        <h2 className="text-[40px] sm:text-[60px] lg:text-[76px] font-bold tracking-[-0.04em] leading-[1.02]">
          Seu próximo cliente
          <br />
          <span className="text-shimmer">já está no mapa.</span>
        </h2>
        <p className="mt-7 text-[17px] sm:text-[20px] text-white/60 leading-[1.55] font-medium max-w-xl mx-auto">
          Só falta você ativar o sistema.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <PrimaryCTA to="/cadastro?plano=starter" dark>
            Ativar meu LeadCapture
          </PrimaryCTA>
          <GhostCTA to="#planos" dark>
            Ver planos
          </GhostCTA>
        </div>

        <p className="mt-7 text-[12px] font-medium text-white/40">
          Sem cartão de crédito · Cancele quando quiser
        </p>
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
                ['Automação', '#produto'],
                ['Vendas', '#produto'],
                ['Demo', '#demo'],
              ],
            },
            {
              title: 'Empresa',
              links: [
                ['Para quem é', '#para-quem'],
                ['Planos', '#planos'],
                ['FAQ', '#faq'],
              ],
            },
            {
              title: 'Conta',
              links: [
                ['Entrar', '/login'],
                ['Começar', '/login'],
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

export function LandingPage() {
  useEffect(() => {
    document.title = 'LeadCapture — Sistema operacional de crescimento'
    return () => {
      document.title = 'LeadCapture'
    }
  }, [])

  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Navbar />
      <ChatWidget />
      <main>
        <Hero />
        <MapInteractive />
        <ValueProp />
        <Problem />
        <Ecosystem />
        <Panfleteiro />
        <Automation />
        <ForWho />
        <SocialProof />
        <Pricing />
        <Differential />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
