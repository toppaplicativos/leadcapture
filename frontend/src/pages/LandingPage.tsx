import { useState, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Play, Check, X, ChevronDown,
  Map, MessageSquare, Brain, ShoppingCart, Package, Store,
  Crosshair, Zap, Workflow, Users, Building2, TrendingUp,
  Sparkles, Target, Layers, Send,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PanfleteiroPreview } from '@/components/PanfleteiroPreview'
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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 lg:py-32">
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
            to="/cadastro?plano=pro"
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
    <section className="relative bg-[#0a0a0a] text-white overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Subtle radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.12) 0%, transparent 60%)',
        }}
      />
      {/* Grid lines */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-white/5 ring-1 ring-white/15 text-[11px] font-semibold tracking-[0.06em] uppercase text-white/80 mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Sistema operacional de crescimento
        </div>

        <h1 className="text-[44px] sm:text-[64px] lg:text-[84px] font-bold tracking-[-0.04em] leading-[0.98] max-w-5xl mx-auto">
          Transforme o mapa em uma
          <br className="hidden sm:block" />
          <span className="text-shimmer"> máquina de clientes </span>
          <br className="hidden sm:block" />
          no WhatsApp.
        </h1>

        <p className="mt-7 text-[17px] sm:text-[20px] text-white/60 leading-[1.55] font-medium max-w-2xl mx-auto">
          Capture, organize, automatize e venda — tudo em um único sistema inteligente.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <PrimaryCTA to="/cadastro?plano=pro" dark>
            Começar agora
          </PrimaryCTA>
          <GhostCTA
            to="#demo"
            dark
            iconLeft={<Play size={14} strokeWidth={2.25} className="ml-0.5" />}
          >
            Ver demonstração
          </GhostCTA>
        </div>

        <p className="mt-12 text-[12px] font-medium text-white/40 tabular-nums">
          <span className="font-semibold text-white/70">+10.000 leads</span> captados por dia na plataforma
        </p>

        {/* Live Panfleteiro preview */}
        <div className="mt-16 sm:mt-20 relative max-w-5xl mx-auto">
          <PanfleteiroPreview variant="hero" />
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────
   2. VALUE PROP
   ────────────────────────────────────────────────── */

function ValueProp() {
  const features = [
    'Captação de leads',
    'Prospecção ativa',
    'CRM inteligente',
    'Automação de campanhas',
    'Vendas e pedidos',
    'Expedição e logística',
  ]

  return (
    <Section className="!py-24 sm:!py-32" dark={false}>
      <div className="max-w-3xl">
        <Eyebrow>Proposta de valor</Eyebrow>
        <H2>
          Um sistema. <span className="text-gray-400">Todo o seu crescimento.</span>
        </H2>
        <Lead className="mt-6">
          Você não precisa mais de 5 ferramentas diferentes. O LeadCapture unifica tudo o que sua
          operação precisa em uma única plataforma.
        </Lead>
      </div>

      <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {features.map(f => (
          <div
            key={f}
            className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-border-light"
          >
            <span className="w-7 h-7 rounded-full bg-gray-900 grid place-items-center shrink-0">
              <Check size={14} strokeWidth={2.5} className="text-white" />
            </span>
            <span className="text-[14px] font-semibold text-gray-900 tracking-tight">{f}</span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-[15px] font-medium text-gray-500">Tudo conectado.</p>
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
    <Section dark className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow dark>O problema</Eyebrow>
        <H2 dark>
          Seu negócio está perdendo dinheiro
          <span className="text-shimmer"> sem perceber.</span>
        </H2>
      </div>

      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {pains.map(p => (
          <div
            key={p}
            className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 ring-1 ring-white/[0.08]"
          >
            <span className="w-7 h-7 rounded-full bg-red-500/10 ring-1 ring-red-500/20 grid place-items-center shrink-0">
              <X size={14} strokeWidth={2.5} className="text-red-400" />
            </span>
            <span className="text-[14px] font-medium text-white/85">{p}</span>
          </div>
        ))}
      </div>

      <div className="mt-16 max-w-2xl">
        <p className="text-[26px] sm:text-[32px] font-bold tracking-[-0.025em] leading-[1.2] text-white">
          O problema não é falta de clientes.
          <br />
          <span className="text-shimmer">É falta de sistema.</span>
        </p>
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
    <Section dark className="!py-24 sm:!py-32">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div>
          <Eyebrow dark>
            <Crosshair size={11} strokeWidth={2.5} /> Modo Panfleteiro
          </Eyebrow>
          <H2 dark>
            Explore o mercado
            <br />
            <span className="text-shimmer">como nunca antes.</span>
          </H2>
          <Lead dark className="mt-6">
            Mova o mapa, descubra negócios em tempo real e capture leads automaticamente. Cada
            quadra é uma nova oportunidade.
          </Lead>

          <div className="mt-10 space-y-3">
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

          <div className="mt-10">
            <PrimaryCTA to="/login" dark>
              Ativar Panfleteiro
            </PrimaryCTA>
          </div>
        </div>

        {/* Live map preview */}
        <PanfleteiroPreview variant="feature" />
      </div>
    </Section>
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
    { Icon: Send, label: 'Disparo em massa inteligente', desc: 'Personalização em escala, sem parecer robô.' },
  ]

  return (
    <Section className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow>Automação</Eyebrow>
        <H2>
          O sistema trabalha
          <br />
          <span className="text-gray-400">por você.</span>
        </H2>
      </div>

      <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map(({ Icon, label, desc }, i) => (
          <article
            key={label}
            className={`flex items-start gap-4 p-6 rounded-2xl bg-gray-50 border border-border-light ${
              i === 0 ? 'lg:col-span-2 lg:flex-row' : ''
            }`}
          >
            <span className="inline-flex w-11 h-11 rounded-xl bg-gray-900 text-white items-center justify-center shrink-0">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="text-[16px] font-bold text-gray-900 tracking-tight">{label}</h3>
              <p className="mt-1 text-[13px] text-gray-600 leading-relaxed">{desc}</p>
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
      role: 'Diretora comercial · Distribuidora',
    },
    {
      quote: 'Automatizamos 80% do atendimento e ainda fechamos mais.',
      author: 'Rafael M.',
      role: 'Founder · Agência de marketing',
    },
    {
      quote: 'Fechamos vendas direto no WhatsApp, sem fricção.',
      author: 'João P.',
      role: 'Gestor · E-commerce alimentício',
    },
  ]

  return (
    <Section className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow>Prova social</Eyebrow>
        <H2>Resultados reais.</H2>
      </div>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-3">
        {quotes.map(({ quote, author, role }) => (
          <figure
            key={author}
            className="p-7 rounded-3xl bg-gray-50 border border-border-light flex flex-col"
          >
            <blockquote className="text-[18px] font-semibold text-gray-900 tracking-tight leading-snug flex-1">
              "{quote}"
            </blockquote>
            <figcaption className="mt-6 pt-5 border-t border-border-light">
              <p className="text-[13px] font-bold text-gray-900">{author}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">{role}</p>
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
  const rows = [
    'Captação no mapa',
    'CRM com memória',
    'Automação inteligente',
    'Venda integrada',
    'Expedição & logística',
    'IA adaptativa',
  ]

  return (
    <Section dark className="!py-24 sm:!py-32">
      <div className="max-w-3xl">
        <Eyebrow dark>Diferencial</Eyebrow>
        <H2 dark>
          Não é ferramenta.
          <br />
          <span className="text-shimmer">É infraestrutura.</span>
        </H2>
      </div>

      <div className="mt-14 rounded-3xl ring-1 ring-white/10 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_140px_140px] gap-4 px-5 sm:px-7 py-4 bg-white/[0.03] border-b border-white/[0.08]">
          <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-white/40">
            Funcionalidade
          </div>
          <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-white text-center">
            LeadCapture
          </div>
          <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-white/40 text-center">
            Outros
          </div>
        </div>
        {/* Rows */}
        {rows.map((r, i) => (
          <div
            key={r}
            className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_140px_140px] gap-4 px-5 sm:px-7 py-4 items-center ${
              i < rows.length - 1 ? 'border-b border-white/[0.06]' : ''
            }`}
          >
            <span className="text-[14px] font-medium text-white/85">{r}</span>
            <span className="grid place-items-center">
              <Check size={18} strokeWidth={2.5} className="text-emerald-400" />
            </span>
            <span className="grid place-items-center">
              <X size={18} strokeWidth={2.5} className="text-white/20" />
            </span>
          </div>
        ))}
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
      tagline: 'Para começar',
      price: 'R$ 97',
      period: '/mês',
      features: [
        '1 número WhatsApp',
        'Captação no mapa',
        'CRM básico',
        '500 disparos/mês',
        'Suporte por email',
      ],
      cta: 'Começar grátis',
      featured: false,
      slug: 'starter',
    },
    {
      name: 'Pro',
      tagline: 'Para escalar',
      price: 'R$ 297',
      period: '/mês',
      features: [
        '3 números WhatsApp',
        'Tudo do Starter',
        'Automação completa',
        'Disparos ilimitados',
        'IA adaptativa',
        'Vendas & catálogo',
        'Suporte prioritário',
      ],
      cta: 'Começar agora',
      featured: true,
      slug: 'pro',
    },
    {
      name: 'Scale',
      tagline: 'Para operações avançadas',
      price: 'Sob consulta',
      period: '',
      features: [
        'Números ilimitados',
        'Tudo do Pro',
        'Multi-marca',
        'API & integrações',
        'Onboarding dedicado',
        'SLA garantido',
      ],
      cta: 'Falar com vendas',
      featured: false,
      slug: 'scale',
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

            <ul className={`mt-7 space-y-2.5 flex-1 ${p.featured ? 'text-white/85' : 'text-gray-700'}`}>
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
      q: 'Preciso saber programar?',
      a: 'Não. O LeadCapture foi construído para ser usado por qualquer pessoa, do zero. Nenhuma linha de código necessária.',
    },
    {
      q: 'Funciona para qualquer negócio?',
      a: 'Sim. Distribuidoras, e-commerces, agências, prestadores de serviço, food service — qualquer operação que use WhatsApp para vender.',
    },
    {
      q: 'Posso usar com vários números de WhatsApp?',
      a: 'Sim. A plataforma suporta múltiplas instâncias de WhatsApp, com rotação automática de mensagens e gestão centralizada.',
    },
    {
      q: 'É seguro? Posso ser banido do WhatsApp?',
      a: 'Usamos as melhores práticas de envio com aquecimento, intervalos inteligentes e personalização para proteger seus números. Você mantém total controle.',
    },
    {
      q: 'Tem teste grátis?',
      a: 'Sim. Você começa hoje sem cartão de crédito e tem acesso completo aos módulos do plano Pro durante o trial.',
    },
    {
      q: 'Qual a diferença para um disparador comum?',
      a: 'Um disparador só envia mensagem. O LeadCapture é o sistema operacional: captação, CRM, automação, vendas, expedição e BI — tudo conectado.',
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
          <PrimaryCTA to="/cadastro?plano=pro" dark>
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
        <ValueProp />
        <Problem />
        <Ecosystem />
        <Panfleteiro />
        <Automation />
        <ForWho />
        <SocialProof />
        <Differential />
        <Pricing />
        <Demo />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
