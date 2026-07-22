import { useState, useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  MessageSquare,
  Briefcase,
  Users,
  Search,
  Wallet,
  Sparkles,
  Smartphone,
  Building2,
  Gift,
  LayoutDashboard,
  Zap,
  Globe2,
  HandCoins,
  Bell,
  Target,
  Layers,
} from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { getPartnersToken } from '@/lib/api-partners'

/* ──────────────────────────────────────────────────
   PRIMITIVES
   ────────────────────────────────────────────────── */

const SIGNUP = '/parceiros/entrar?modo=cadastro'
const LOGIN = '/parceiros/entrar'

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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">{children}</div>
    </section>
  )
}

function H2({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <h2
      className={`text-[28px] sm:text-[40px] lg:text-[48px] font-bold tracking-[-0.03em] leading-[1.08] text-balance ${
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
      className={`text-[16px] sm:text-[18px] leading-[1.6] font-medium max-w-[65ch] text-pretty ${
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
}: {
  to: string
  children: ReactNode
  dark?: boolean
}) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        dark
          ? 'bg-white text-gray-900 hover:bg-gray-200 focus-visible:ring-white focus-visible:ring-offset-[#0a0a0a]'
          : 'bg-gray-900 text-white hover:bg-gray-800 focus-visible:ring-gray-900 focus-visible:ring-offset-white'
      }`}
    >
      {children}
      <ArrowRight
        size={16}
        strokeWidth={2.25}
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}

function GhostCTA({
  to,
  children,
  dark = false,
}: {
  to: string
  children: ReactNode
  dark?: boolean
}) {
  const isHash = to.startsWith('#')
  const className = `inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
    dark
      ? 'bg-white/5 text-white hover:bg-white/10 ring-1 ring-white/15 focus-visible:ring-white focus-visible:ring-offset-[#0a0a0a]'
      : 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-900 focus-visible:ring-offset-white'
  }`
  if (isHash) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}

/* ──────────────────────────────────────────────────
   NAV
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
        scrolled ? 'bg-[#0a0a0a]/95 border-b border-white/[0.08]' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/parceiros" className="flex items-center gap-2.5 text-white">
          <BrandMark size={28} inverted />
          <span className="text-[15px] font-bold tracking-tight">
            LeadCapture <span className="font-medium text-white/60">Parceiros</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium text-white/70">
          <a href="#como-funciona" className="hover:text-white transition">
            Como funciona
          </a>
          <a href="#marketplace" className="hover:text-white transition">
            Programas
          </a>
          <a href="#vantagens" className="hover:text-white transition">
            Vantagens
          </a>
          <a href="#faq" className="hover:text-white transition">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to={LOGIN}
            className="hidden sm:inline-flex items-center justify-center h-9 px-3.5 text-[13px] font-semibold text-white/80 hover:text-white transition"
          >
            Entrar
          </Link>
          <Link
            to={SIGNUP}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 transition"
          >
            Começar grátis
            <ArrowRight size={13} strokeWidth={2.25} />
          </Link>
        </div>
      </div>
    </header>
  )
}

/* ──────────────────────────────────────────────────
   HERO
   ────────────────────────────────────────────────── */

function HeroPhoneVisual() {
  const alerts = [
    { label: 'Novo prospect', time: 'agora', tone: 'emerald' as const },
    { label: 'Lead respondeu', time: '2 min', tone: 'sky' as const },
    { label: 'Comissão gerada', time: '1 h', tone: 'amber' as const },
  ]
  const toneMap = {
    emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25',
    sky: 'bg-sky-500/15 text-sky-300 ring-sky-400/25',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-400/25',
  }

  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div
        className="absolute -inset-8 rounded-[40px] opacity-70 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(37,211,102,0.18) 0%, transparent 65%)',
        }}
      />
      <div className="relative rounded-[2rem] bg-gradient-to-b from-zinc-800 to-zinc-950 p-2.5 ring-1 ring-white/10 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="rounded-[1.5rem] bg-[#0c0c0e] overflow-hidden ring-1 ring-white/[0.06]">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-[10px] font-semibold text-white/40 tabular-nums">09:41</span>
            <div className="w-16 h-1 rounded-full bg-white/15" />
            <span className="text-[10px] font-semibold text-white/40">5G</span>
          </div>
          <div className="px-3 pb-3">
            <div className="rounded-2xl bg-[#075E54] px-3 py-2.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center">
                  <MessageSquare size={14} className="text-white" />
                </span>
                <div>
                  <p className="text-[12px] font-bold text-white">LeadCapture</p>
                  <p className="text-[10px] text-white/70">WhatsApp conectado</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {alerts.map(a => (
                <div
                  key={a.label}
                  className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell size={13} className="text-white/50 shrink-0" />
                    <span className="text-[12px] font-semibold text-white/90 truncate">{a.label}</span>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${toneMap[a.tone]}`}
                  >
                    {a.time}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-400/20 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/80 mb-1">
                Programa ativo
              </p>
              <p className="text-[13px] font-bold text-white">Alho Pronto · Sul de MG</p>
              <p className="text-[11px] text-white/55 mt-0.5">3 prospects · R$ 420 em comissões</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative bg-[#0a0a0a] text-white overflow-hidden pt-28 pb-14 sm:pt-32 sm:pb-20">
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-60 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(37,211,102,0.12) 0%, rgba(16,185,129,0.06) 40%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-white/5 ring-1 ring-white/15 text-[11px] font-semibold tracking-[0.06em] uppercase text-white/80 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Programa de Afiliados
          </div>

          <h1 className="text-[36px] sm:text-[48px] lg:text-[56px] font-bold tracking-[-0.035em] leading-[1.05] text-balance">
            Transforme seu WhatsApp em uma{' '}
            <span className="text-shimmer">central de oportunidades</span>
          </h1>

          <p className="mt-6 text-[16px] sm:text-[18px] text-white/60 leading-[1.55] font-medium max-w-xl mx-auto lg:mx-0 text-pretty">
            Cadastre-se gratuitamente como afiliado LeadCapture, conecte seu WhatsApp e comece a
            receber oportunidades comerciais de marcas, negócios e organizações parceiras.
          </p>

          <p className="mt-4 text-[14px] text-white/45 max-w-lg mx-auto lg:mx-0 leading-relaxed">
            Você não precisa criar uma estrutura do zero. A plataforma conecta você a programas de
            afiliados, leads, prospects e oportunidades reais de venda.
          </p>

          <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
            <PrimaryCTA to={SIGNUP} dark>
              Começar grátis agora
            </PrimaryCTA>
            <GhostCTA to="#como-funciona" dark>
              Ver como funciona
            </GhostCTA>
          </div>

          <p className="mt-5 text-[12px] font-medium text-white/40">
            Cadastro gratuito. Entrada imediata. Sem mensalidade para começar.
          </p>
        </div>

        <HeroPhoneVisual />
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────
   1. PONTE
   ────────────────────────────────────────────────── */

function OpportunityBridge() {
  return (
    <Section>
      <div className="max-w-3xl">
        <H2>
          A LeadCapture conecta afiliados a empresas que{' '}
          <span className="text-gray-400">precisam vender mais</span>
        </H2>
        <Lead className="mt-5">
          Muitas organizações têm produtos, serviços e ofertas prontas, mas precisam de pessoas
          qualificadas para ajudar no relacionamento, atendimento e conversão. A LeadCapture cria
          essa ponte.
        </Lead>
      </div>

      <div className="mt-12 grid md:grid-cols-3 gap-3">
        {[
          {
            side: 'De um lado',
            title: 'Empresas, marcas e fornecedores',
            desc: 'Com produtos prontos e necessidade de canal de vendas ativo.',
            icon: Building2,
          },
          {
            side: 'No centro',
            title: 'Plataforma inteligente',
            desc: 'Organiza leads, distribui oportunidades e acompanha resultados.',
            icon: Layers,
            highlight: true,
          },
          {
            side: 'Do outro',
            title: 'Afiliados e parceiros',
            desc: 'Vendedores, influenciadores, representantes e redes de contato.',
            icon: Users,
          },
        ].map(col => (
          <article
            key={col.title}
            className={`relative p-6 sm:p-7 rounded-2xl ${
              col.highlight
                ? 'bg-gray-900 text-white'
                : 'bg-zinc-50 border border-border-light'
            }`}
          >
            <p
              className={`text-[12px] font-semibold mb-4 ${
                col.highlight ? 'text-emerald-300' : 'text-gray-500'
              }`}
            >
              {col.side}
            </p>
            <span
              className={`inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4 ${
                col.highlight ? 'bg-white/10 text-white' : 'bg-gray-900 text-white'
              }`}
            >
              <col.icon size={18} strokeWidth={1.75} />
            </span>
            <h3 className="text-[17px] font-bold tracking-tight">{col.title}</h3>
            <p
              className={`mt-2 text-[13px] leading-relaxed ${
                col.highlight ? 'text-white/65' : 'text-gray-600'
              }`}
            >
              {col.desc}
            </p>
          </article>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   2. COMO FUNCIONA
   ────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    'Crie sua conta gratuita',
    'Acesse o app de parceiros',
    'Conecte seu WhatsApp',
    'Complete seu perfil',
    'Busque programas de afiliação',
    'Candidate-se às oportunidades',
    'Receba leads, prospects e alertas',
    'Acompanhe conversões e comissões',
  ]

  return (
    <Section id="como-funciona" dark>
      <div className="max-w-3xl">
        <H2 dark>
          Você se cadastra uma vez e pode participar de{' '}
          <span className="text-shimmer">vários programas</span>
        </H2>
        <Lead dark className="mt-5">
          O afiliado LeadCapture tem uma conta global dentro do app de parceiros. Você não fica
          preso a uma única marca — participa de diferentes programas disponíveis na plataforma.
        </Lead>
      </div>

      <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((label, i) => (
          <li
            key={label}
            className="relative p-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08]"
          >
            <span className="text-[28px] font-black tracking-tight text-white/15 tabular-nums leading-none">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="mt-3 text-[14px] font-semibold text-white leading-snug">{label}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   3. MARKETPLACE
   ────────────────────────────────────────────────── */

function Marketplace() {
  const categories = [
    'Produtos de consumo',
    'Serviços locais',
    'Negócios recorrentes',
    'Empresas B2B',
    'Marcas regionais',
    'Infoprodutos',
    'Serviços profissionais',
    'Assinaturas',
    'Franquias',
  ]

  const programFields = [
    'Descrição da oportunidade',
    'Regras de comissão',
    'Região de atuação',
    'Termos do programa',
    'Materiais de apoio',
    'Treinamentos',
    'Critérios de aprovação',
    'Botão de candidatura',
  ]

  return (
    <Section id="marketplace">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        <div>
          <H2>
            Encontre marcas e oportunidades para{' '}
            <span className="text-gray-400">se afiliar</span>
          </H2>
          <Lead className="mt-5">
            Dentro da LeadCapture, você acessa um buscador de programas de afiliação. Cada
            organização oferece regras, comissões, produtos, regiões e modelos comerciais próprios.
          </Lead>

          <div className="mt-8 flex flex-wrap gap-2">
            {categories.map(c => (
              <span
                key={c}
                className="inline-flex items-center h-9 px-3.5 rounded-full bg-zinc-50 border border-border-light text-[13px] font-medium text-gray-800"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-zinc-50 border border-border-light p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-10 h-10 rounded-xl bg-gray-900 text-white grid place-items-center">
              <Search size={18} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[15px] font-bold text-gray-900">Página do programa</p>
              <p className="text-[12px] text-gray-500">Tudo que você vê antes de se candidatar</p>
            </div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {programFields.map(f => (
              <li
                key={f}
                className="flex items-center gap-2.5 text-[13px] font-medium text-gray-700 bg-white rounded-xl px-3 py-2.5 border border-border-light"
              >
                <Check size={14} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-gray-900 text-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/80">
              Exemplo no marketplace
            </p>
            <p className="mt-1 text-[16px] font-bold">Alho Pronto</p>
            <p className="text-[13px] text-white/60 mt-1">
              Programa regional de afiliados · comissão por conversão · treino e requisitos
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   4. CONVITES
   ────────────────────────────────────────────────── */

function DirectInvites() {
  const flow = [
    'Você entra por um convite',
    'Aceita o programa daquela organização',
    'O programa aparece no seu dashboard',
    'Você continua podendo participar de outras oportunidades',
  ]

  return (
    <Section dark>
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <H2 dark>
            Empresas também podem convidar você{' '}
            <span className="text-shimmer">diretamente</span>
          </H2>
          <Lead dark className="mt-5">
            Além do marketplace, uma organização pode enviar um link de convite. Basta criar ou
            entrar na sua conta LeadCapture e aceitar os termos daquele programa. Mesmo convidado
            por uma marca, sua conta continua global.
          </Lead>
        </div>

        <div className="space-y-0">
          {flow.map((step, i) => (
            <div key={step} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 grid place-items-center text-[12px] font-bold text-white tabular-nums">
                  {i + 1}
                </span>
                {i < flow.length - 1 && <span className="w-px flex-1 bg-white/10 my-1" />}
              </div>
              <p className={`text-[15px] font-semibold text-white/90 pb-6 ${i === flow.length - 1 ? 'pb-0' : ''}`}>
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   5. WHATSAPP
   ────────────────────────────────────────────────── */

function WhatsAppSection() {
  const alerts = [
    'Um novo prospect for enviado',
    'Um lead responder',
    'Houver interesse de compra',
    'Um follow-up estiver vencendo',
    'O WhatsApp desconectar',
    'Uma venda for convertida',
    'Uma comissão for gerada',
    'Um cliente precisar de pós-venda',
    'Houver oportunidade de recorrência',
  ]

  return (
    <Section id="whatsapp">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 mb-5 text-emerald-700">
            <Smartphone size={18} strokeWidth={2} />
            <span className="text-[13px] font-bold">Canal principal</span>
          </div>
          <H2>
            As oportunidades chegam direto no seu{' '}
            <span className="text-gray-400">WhatsApp</span>
          </H2>
          <Lead className="mt-5">
            Depois de conectar sua conta, você recebe contatos, alertas e oportunidades comerciais
            atribuídas a você — no canal que você já usa todos os dias.
          </Lead>
          <blockquote className="mt-8 pl-4 border-l-2 border-emerald-500 text-[17px] sm:text-[19px] font-bold text-gray-900 tracking-tight leading-snug">
            Conecte seu WhatsApp. Receba oportunidades. Acompanhe seus prospects. Ganhe comissões.
          </blockquote>
        </div>

        <div className="rounded-3xl bg-gray-900 p-6 sm:p-8 text-white">
          <p className="text-[13px] font-semibold text-white/50 mb-4">O sistema pode avisar quando:</p>
          <ul className="space-y-2.5">
            {alerts.map(a => (
              <li key={a} className="flex items-start gap-2.5 text-[14px] font-medium text-white/85">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/25 grid place-items-center shrink-0">
                  <Check size={11} strokeWidth={2.5} className="text-emerald-400" />
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   6. IA
   ────────────────────────────────────────────────── */

function AISection() {
  const caps = [
    'Organizar prospects captados pelas empresas',
    'Classificar contatos por potencial',
    'Distribuir oportunidades para afiliados ativos',
    'Apoiar mensagens iniciais',
    'Acompanhar respostas',
    'Gerar alertas',
    'Avançar follow-ups',
    'Identificar leads quentes',
    'Registrar conversões',
    'Criar ações de pós-venda',
    'Estimular recompra e recorrência',
  ]

  return (
    <Section dark>
      <div className="max-w-3xl">
        <H2 dark>
          Você não recebe apenas um link. Você recebe{' '}
          <span className="text-shimmer">suporte inteligente</span>
        </H2>
        <Lead dark className="mt-5">
          A LeadCapture usa inteligência interna para ajudar organizações e afiliados a gerenciar
          oportunidades comerciais. O afiliado trabalha com apoio da tecnologia — não sozinho.
        </Lead>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {caps.map(c => (
          <div
            key={c}
            className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08]"
          >
            <Sparkles size={15} className="text-emerald-400 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[13px] font-medium text-white/85 leading-snug">{c}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   7. VANTAGENS
   ────────────────────────────────────────────────── */

function Benefits() {
  const items = [
    {
      icon: Gift,
      title: 'Começa grátis',
      desc: 'Crie sua conta e entre na plataforma sem pagar para começar.',
    },
    {
      icon: Globe2,
      title: 'Conta global',
      desc: 'Uma única conta para participar de diferentes programas de afiliados.',
    },
    {
      icon: Search,
      title: 'Várias oportunidades',
      desc: 'Acesse marcas, produtos, serviços e organizações no marketplace.',
    },
    {
      icon: MessageSquare,
      title: 'WhatsApp como canal',
      desc: 'Receba e acompanhe oportunidades no canal do dia a dia.',
    },
    {
      icon: Sparkles,
      title: 'Apoio de IA',
      desc: 'Acompanhamento, alertas, follow-ups e organização comercial.',
    },
    {
      icon: Layers,
      title: 'Estrutura pronta',
      desc: 'Entre em programas já estruturados por organizações parceiras.',
    },
    {
      icon: HandCoins,
      title: 'Comissões por resultado',
      desc: 'Ganhe conforme as regras de cada programa em que for aprovado.',
    },
    {
      icon: LayoutDashboard,
      title: 'Dashboard financeiro',
      desc: 'Acompanhe ganhos gerais e também por programa.',
    },
  ]

  return (
    <Section id="vantagens">
      <div className="max-w-3xl">
        <H2>
          Por que ser um afiliado <span className="text-gray-400">LeadCapture?</span>
        </H2>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border-light rounded-3xl overflow-hidden ring-1 ring-border-light">
        {items.map(item => (
          <article key={item.title} className="bg-white p-6 sm:p-7">
            <span className="inline-flex w-10 h-10 rounded-xl bg-zinc-50 text-gray-900 items-center justify-center mb-4 ring-1 ring-border-light">
              <item.icon size={18} strokeWidth={1.75} />
            </span>
            <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">{item.title}</h3>
            <p className="mt-1.5 text-[13px] text-gray-600 leading-relaxed">{item.desc}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   8. DASHBOARD
   ────────────────────────────────────────────────── */

function DashboardSection() {
  const metrics = [
    'Faturamento geral',
    'Comissões pendentes',
    'Comissões aprovadas',
    'Comissões pagas',
    'Prospects recebidos',
    'Conversões realizadas',
    'Programas ativos',
    'Candidaturas em análise',
    'Alertas importantes',
    'Histórico de pagamentos',
  ]

  const programs = [
    { name: 'Marca A', value: 'R$ 1.200,00' },
    { name: 'Fornecedor B', value: 'R$ 2.100,00' },
    { name: 'Serviço C', value: 'R$ 1.550,00' },
  ]

  return (
    <Section dark>
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <H2 dark>
            Todos os seus ganhos em <span className="text-shimmer">um só lugar</span>
          </H2>
          <Lead dark className="mt-5">
            No painel do afiliado LeadCapture, você acompanha a operação de forma centralizada —
            visão global ou filtro por programa.
          </Lead>
          <div className="mt-8 grid grid-cols-2 gap-2">
            {metrics.map(m => (
              <div
                key={m}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] text-[12px] font-medium text-white/80"
              >
                <Wallet size={13} className="text-emerald-400 shrink-0" />
                {m}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white text-gray-900 p-6 sm:p-8 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.5)]">
          <p className="text-[12px] font-semibold text-gray-500">Ganhos totais do mês</p>
          <p className="mt-1 text-[36px] sm:text-[42px] font-bold tracking-tight tabular-nums">
            R$ 4.850,00
          </p>
          <p className="mt-6 text-[12px] font-bold uppercase tracking-wide text-gray-400 mb-3">
            Por programa
          </p>
          <ul className="space-y-2.5">
            {programs.map(p => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 border border-border-light px-4 py-3"
              >
                <span className="text-[14px] font-semibold text-gray-900">{p.name}</span>
                <span className="text-[14px] font-bold tabular-nums text-gray-900">{p.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   9. PARA QUEM
   ────────────────────────────────────────────────── */

function ForWho() {
  const audiences = [
    'Vendedores autônomos',
    'Representantes comerciais',
    'Influenciadores locais',
    'Criadores de conteúdo',
    'Pessoas com rede de contatos',
    'Profissionais de atendimento',
    'Consultores',
    'Promotores',
    'Comunidades locais',
    'Pessoas buscando renda extra',
    'Quem já usa WhatsApp para negócios',
  ]

  return (
    <Section id="para-quem">
      <div className="max-w-3xl">
        <H2>
          Ideal para quem quer transformar{' '}
          <span className="text-gray-400">relacionamento em renda</span>
        </H2>
        <Lead className="mt-5">
          Você pode começar simples e evoluir conforme participa de mais programas.
        </Lead>
      </div>

      <div className="mt-10 flex flex-wrap gap-2.5">
        {audiences.map(a => (
          <span
            key={a}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-zinc-50 border border-border-light text-[13px] font-semibold text-gray-800"
          >
            <Target size={14} className="text-emerald-600" strokeWidth={2.25} />
            {a}
          </span>
        ))}
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   10. JORNADA
   ────────────────────────────────────────────────── */

function Journey() {
  const steps = [
    'Cadastro gratuito',
    'Conta global',
    'Conexão do WhatsApp',
    'Acesso ao dashboard',
    'Busca ou aceite de programas',
    'Termos e treinamento',
    'Recebimento de oportunidades',
    'Acompanhamento de prospects',
    'Conversões',
    'Comissões',
  ]

  return (
    <Section dark className="!py-20 sm:!py-24">
      <div className="text-center max-w-2xl mx-auto">
        <H2 dark>Comece em poucos minutos</H2>
        <Lead dark className="mt-5 mx-auto">
          Do cadastro à primeira comissão — um fluxo claro, sem burocracia desnecessária.
        </Lead>
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 h-10 px-3.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[12px] sm:text-[13px] font-semibold text-white/90">
              <span className="text-emerald-400 tabular-nums text-[11px]">{i + 1}</span>
              {s}
            </span>
            {i < steps.length - 1 && (
              <ArrowRight size={12} className="text-white/25 hidden sm:block shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <PrimaryCTA to={SIGNUP} dark>
          Criar minha conta grátis
        </PrimaryCTA>
      </div>
    </Section>
  )
}

/* ──────────────────────────────────────────────────
   11. ORGANIZAÇÕES
   ────────────────────────────────────────────────── */

function ForOrganizations() {
  const caps = [
    'Criar programas de afiliados',
    'Definir regras de comissão',
    'Convidar afiliados por link',
    'Receber candidaturas',
    'Aprovar ou reprovar afiliados',
    'Configurar treinamentos',
    'Captar prospects',
    'Distribuir leads',
    'Acompanhar performance',
    'Gerenciar conversões e pagamentos',
  ]

  return (
    <Section id="organizacoes">
      <div className="rounded-3xl bg-zinc-50 border border-border-light p-8 sm:p-12">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 mb-4 text-gray-500">
              <Briefcase size={16} strokeWidth={2} />
              <span className="text-[13px] font-bold">Para empresas</span>
            </div>
            <H2>
              Crie programas e ative afiliados com{' '}
              <span className="text-gray-400">mais controle</span>
            </H2>
            <Lead className="mt-5">
              Organizações criam programas próprios, convidam parceiros e distribuem oportunidades
              para pessoas conectadas e ativas. O ecossistema cresce dos dois lados.
            </Lead>
            <div className="mt-8">
              <a
                href="https://leadcapture.online/inicio"
                className="group inline-flex items-center gap-2 text-[14px] font-semibold text-gray-900 hover:text-gray-600 transition"
              >
                Conhecer a plataforma para empresas
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2 content-start">
            {caps.map(c => (
              <li
                key={c}
                className="flex items-start gap-2.5 text-[13px] font-medium text-gray-700 bg-white rounded-xl px-3.5 py-3 border border-border-light"
              >
                <Zap size={14} className="text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.25} />
                {c}
              </li>
            ))}
          </ul>
        </div>
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
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-sm"
      >
        <span className="text-[15px] sm:text-[16px] font-bold text-gray-900 tracking-tight">
          {q}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-[14px] text-gray-600 leading-relaxed pr-8 text-pretty">{a}</p>
      )}
    </div>
  )
}

function FAQ() {
  const faqs = [
    {
      q: 'A LeadCapture é o programa de afiliados ou a plataforma?',
      a: 'A LeadCapture é a plataforma. Dentro dela, diferentes organizações podem criar seus próprios programas de afiliados.',
    },
    {
      q: 'Posso participar de mais de um programa?',
      a: 'Sim. Você tem uma conta global e pode se candidatar a diferentes programas disponíveis.',
    },
    {
      q: 'Preciso pagar para começar?',
      a: 'Não. O cadastro inicial como afiliado é gratuito.',
    },
    {
      q: 'Preciso conectar meu WhatsApp?',
      a: 'Sim. O WhatsApp é o principal canal para receber e acompanhar oportunidades.',
    },
    {
      q: 'Vou receber leads automaticamente?',
      a: 'Você poderá receber oportunidades se estiver aprovado em um programa, com WhatsApp conectado e status ativo.',
    },
    {
      q: 'Empresas podem me convidar diretamente?',
      a: 'Sim. Uma organização pode enviar um link de convite direto para você participar do programa dela.',
    },
    {
      q: 'Onde vejo meus ganhos?',
      a: 'No dashboard global do afiliado, com visão geral e filtros por programa.',
    },
    {
      q: 'A LeadCapture garante ganhos?',
      a: 'Não. Os ganhos dependem dos programas disponíveis, aprovação, oportunidades recebidas, atuação do afiliado e conversões realizadas.',
    },
  ]

  return (
    <Section id="faq" className="!py-20 sm:!py-24">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20">
        <div>
          <H2>
            Perguntas
            <br />
            frequentes
          </H2>
          <Lead className="mt-5">
            Transparência primeiro — sem letra miúda sobre o que a plataforma faz e não faz.
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
   13. CTA FINAL
   ────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative bg-[#0a0a0a] text-white overflow-hidden py-20 sm:py-28">
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(37,211,102,0.14) 0%, transparent 55%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-5 sm:px-8 text-center">
        <h2 className="text-[32px] sm:text-[48px] lg:text-[56px] font-bold tracking-[-0.035em] leading-[1.05] text-balance">
          Comece grátis como afiliado{' '}
          <span className="text-shimmer">LeadCapture</span>
        </h2>
        <p className="mt-6 text-[16px] sm:text-[18px] text-white/60 leading-[1.55] font-medium max-w-xl mx-auto text-pretty">
          Entre para uma plataforma criada para conectar pessoas, marcas e oportunidades
          comerciais. Cadastre-se, conecte seu WhatsApp e descubra programas disponíveis para você.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <PrimaryCTA to={SIGNUP} dark>
            Começar grátis agora
          </PrimaryCTA>
          <GhostCTA to={LOGIN} dark>
            Já tenho conta
          </GhostCTA>
        </div>
        <p className="mt-6 text-[12px] font-medium text-white/40 max-w-md mx-auto">
          Conta gratuita. Início imediato. Oportunidades conforme aprovação e disponibilidade dos
          programas.
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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-14">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-10">
          <div>
            <Link to="/parceiros" className="flex items-center gap-2.5">
              <BrandMark size={28} inverted />
              <span className="text-[15px] font-bold tracking-tight">LeadCapture Parceiros</span>
            </Link>
            <p className="mt-4 text-[13px] text-white/50 leading-relaxed max-w-sm">
              Onde afiliados encontram oportunidades e empresas encontram quem vende.
            </p>
            <p className="mt-3 text-[12px] text-white/35 max-w-sm">
              Uma conta. Vários programas. Muitas oportunidades.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/40 mb-3">
                Afiliado
              </p>
              <ul className="space-y-2">
                <li>
                  <a href="#como-funciona" className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    Como funciona
                  </a>
                </li>
                <li>
                  <a href="#vantagens" className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    Vantagens
                  </a>
                </li>
                <li>
                  <Link to={SIGNUP} className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    Criar conta
                  </Link>
                </li>
                <li>
                  <Link to={LOGIN} className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    Entrar
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/40 mb-3">
                LeadCapture
              </p>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://leadcapture.online/inicio"
                    className="text-[13px] font-medium text-white/70 hover:text-white transition"
                  >
                    Plataforma
                  </a>
                </li>
                <li>
                  <a href="#organizacoes" className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    Para empresas
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-[13px] font-medium text-white/70 hover:text-white transition">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <p className="text-[11px] text-white/40">
            © {new Date().getFullYear()} LeadCapture. Todos os direitos reservados.
          </p>
          <p className="text-[11px] text-white/35">
            Conecte seu WhatsApp. Receba oportunidades. Ganhe por resultado.
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ──────────────────────────────────────────────────
   PAGE
   ────────────────────────────────────────────────── */

export function PartnersLandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteCode = String(searchParams.get('invite') || '').trim()
  const hasToken = typeof window !== 'undefined' && !!getPartnersToken()
  const shouldRedirect = hasToken || !!inviteCode

  useEffect(() => {
    document.title = 'LeadCapture Parceiros — Programa de Afiliados'
    return () => {
      document.title = 'LeadCapture'
    }
  }, [])

  useEffect(() => {
    if (getPartnersToken()) {
      navigate(
        inviteCode
          ? `/parceiros/painel?invite=${encodeURIComponent(inviteCode)}`
          : '/parceiros/painel',
        { replace: true },
      )
      return
    }
    if (inviteCode) {
      navigate(`/parceiros/entrar?invite=${encodeURIComponent(inviteCode)}`, { replace: true })
    }
  }, [navigate, inviteCode])

  if (shouldRedirect) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] grid place-items-center">
        <p className="text-[13px] font-medium text-white/50">Redirecionando…</p>
      </div>
    )
  }

  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <OpportunityBridge />
        <HowItWorks />
        <Marketplace />
        <DirectInvites />
        <WhatsAppSection />
        <AISection />
        <Benefits />
        <DashboardSection />
        <ForWho />
        <Journey />
        <ForOrganizations />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}

export default PartnersLandingPage
