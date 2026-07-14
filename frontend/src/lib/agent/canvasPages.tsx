import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { PageSplash, canvasSplashLabel } from '@/components/PageSplash'
import { useToast } from '@/components/Toast'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'
import { useInstagramBridgeOptional } from '@/lib/agent/InstagramBridgeContext'
import { useFacebookBridgeOptional } from '@/lib/agent/FacebookBridgeContext'
import { useAffiliatesBridgeOptional } from '@/lib/agent/AffiliatesBridgeContext'
import type { InstagramTabKey } from '@/lib/instagram/nav'
import type { FacebookTabKey } from '@/pages/FacebookPage'
import type { AffiliatesTabKey } from '@/lib/agent/AffiliatesBridgeContext'

/** Loaders nomeados — reutilizados por lazy + prefetch de chunk */
const loadDashboard = () => import('@/pages/admin/dashboard/DashboardView').then(m => ({ default: m.DashboardView }))
const loadCampaigns = () => import('@/pages/admin/campaigns/CampaignsView').then(m => ({ default: m.CampaignsView }))
const loadFlowBuilder = () => import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage }))
const loadCriativos = () => import('@/pages/CriativosPage').then(m => ({ default: m.CriativosPage }))
const loadGaleria = () => import('@/pages/GaleriaPage').then(m => ({ default: m.GaleriaPage }))
const loadVideoStudio = () => import('@/pages/VideoStudioPage').then(m => ({ default: m.VideoStudioPage }))
const loadAgentView = () => import('@/pages/admin/agent/AgentView').then(m => ({ default: m.AgentView }))
const loadAgentConfig = () => import('@/pages/AgentConfigPage').then(m => ({ default: m.AgentConfigPage }))
const loadAgentPDV = () => import('@/pages/AgentPDVPage').then(m => ({ default: m.AgentPDVPage }))
const loadAutomations = () => import('@/pages/admin/automations/AutomationsView').then(m => ({ default: m.AutomationsView }))
const loadStoreStudio = () => import('@/pages/admin/store/StoreStudioPage').then(m => ({ default: m.StoreStudioPage }))
const loadLeadSearch = () => import('@/pages/LeadSearchPage').then(m => ({ default: m.LeadSearchPage }))
const loadMessages = () => import('@/pages/MessagesPage').then(m => ({ default: m.MessagesPage }))
const loadProducts = () => import('@/pages/admin/products/ProductsView').then(m => ({ default: m.ProductsView }))
const loadLeads = () => import('@/pages/LeadsPage').then(m => ({ default: m.LeadsPage }))
const loadClientes = () => import('@/pages/ClientesPage').then(m => ({ default: m.ClientesPage }))
const loadOrders = () => import('@/pages/admin/orders/OrdersView').then(m => ({ default: m.OrdersView }))
const loadBrandSkills = () => import('@/pages/BrandSkillsPage').then(m => ({ default: m.BrandSkillsPage }))
const loadInstagram = () => import('@/pages/InstagramPage').then(m => ({ default: m.InstagramPage }))
const loadFacebook = () => import('@/pages/FacebookPage').then(m => ({ default: m.FacebookPage }))
const loadAffiliates = () => import('@/pages/AffiliatesPage').then(m => ({ default: m.AffiliatesPage }))
const loadSettings = () => import('@/pages/admin/settings/SettingsView').then(m => ({ default: m.SettingsView }))
const loadWhatsApp = () => import('@/pages/admin/whatsapp/WhatsAppManagerView').then(m => ({ default: m.WhatsAppManagerView }))
const loadNotifications = () => import('@/pages/admin/notifications/NotificationsView').then(m => ({ default: m.NotificationsView }))
const loadDomain = () => import('@/pages/admin/domain/DomainView').then(m => ({ default: m.DomainView }))
const loadFrete = () => import('@/pages/admin/frete/FreteView').then(m => ({ default: m.FreteView }))
const loadMob = () => import('@/pages/admin/mob/MobLogisticsView').then(m => ({ default: m.MobLogisticsView }))
const loadEstoque = () => import('@/pages/admin/estoque/EstoqueAccessView').then(m => ({ default: m.EstoqueAccessView }))
const loadCoupons = () => import('@/pages/admin/coupons/CouponsView').then(m => ({ default: m.CouponsView }))
const loadReviews = () => import('@/pages/admin/reviews/ReviewsView').then(m => ({ default: m.ReviewsView }))
const loadPayments = () => import('@/pages/admin/payments/PaymentConfigView').then(m => ({ default: m.PaymentConfigView }))
const loadAIProviders = () => import('@/pages/AIProvidersPage').then(m => ({ default: m.AIProvidersPage }))
const loadEmails = () => import('@/pages/AdminEmailsPage').then(m => ({ default: m.AdminEmailsPage }))

const DashboardView = lazy(loadDashboard)
const CampaignsView = lazy(loadCampaigns)
const FlowBuilderPage = lazy(loadFlowBuilder)
const CriativosPage = lazy(loadCriativos)
const GaleriaPage = lazy(loadGaleria)
const VideoStudioPage = lazy(loadVideoStudio)
const AgentView = lazy(loadAgentView)
const AgentConfigPage = lazy(loadAgentConfig)
const AgentPDVPage = lazy(loadAgentPDV)
const AutomationsView = lazy(loadAutomations)
const StoreStudioPage = lazy(loadStoreStudio)
const LeadSearchPage = lazy(loadLeadSearch)
const MessagesPage = lazy(loadMessages)
const ProductsView = lazy(loadProducts)
const LeadsPage = lazy(loadLeads)
const ClientesPage = lazy(loadClientes)
const OrdersView = lazy(loadOrders)
const BrandSkillsPage = lazy(loadBrandSkills)
const InstagramPage = lazy(loadInstagram)
const FacebookPage = lazy(loadFacebook)
const AffiliatesPage = lazy(loadAffiliates)
const SettingsView = lazy(loadSettings)
const WhatsAppManagerView = lazy(loadWhatsApp)
const NotificationsView = lazy(loadNotifications)
const DomainView = lazy(loadDomain)
const FreteView = lazy(loadFrete)
const MobLogisticsView = lazy(loadMob)
const EstoqueAccessView = lazy(loadEstoque)
const CouponsView = lazy(loadCoupons)
const ReviewsView = lazy(loadReviews)
const PaymentConfigView = lazy(loadPayments)
const AIProvidersPage = lazy(loadAIProviders)
const AdminEmailsPage = lazy(loadEmails)

function InstagramCanvas() {
  const bridge = useInstagramBridgeOptional()
  const tab = (bridge?.snapshot.activeTab || 'overview') as InstagramTabKey
  // embedded: layout do studio no painel; key por marca força remount limpo
  const brandKey = typeof window !== 'undefined'
    ? (localStorage.getItem('lead-system:active-brand-id') || 'default')
    : 'default'
  return <InstagramPage key={brandKey} embedded initialTab={tab} />
}

function FacebookCanvas() {
  const bridge = useFacebookBridgeOptional()
  const tab = (bridge?.snapshot.activeTab || 'overview') as FacebookTabKey
  return <FacebookPage initialTab={tab} />
}

function AffiliatesCanvas() {
  const bridge = useAffiliatesBridgeOptional()
  const tab = (bridge?.snapshot.activeTab || 'overview') as AffiliatesTabKey
  const { showToast } = useToast()
  return (
    <AffiliatesPage
      embedded
      initialTab={tab}
      showToast={(msg, tp) => showToast(tp === 'err' ? msg : msg, tp === 'err' ? 'error' : 'success')}
    />
  )
}

const noop = () => {}

function CanvasFallback({ route }: { route: string }) {
  return <PageSplash variant="canvas" label={canvasSplashLabel(route)} />
}

function CampaignsCanvas() {
  const { showToast } = useToast()
  return (
    <CampaignsView
      showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
    />
  )
}

function ProductsCanvas() {
  const { showToast } = useToast()
  return (
    <ProductsView
      showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
    />
  )
}

/** Rotas que precisam de borda a borda (mapa, etc.) — sem padding do canvas */
const CANVAS_FLUSH_ROUTES = new Set(['/busca'])

export function isCanvasFlushRoute(route: string) {
  return CANVAS_FLUSH_ROUTES.has(route)
}

const CANVAS_PAGE_MAP: Record<string, () => ReactNode> = {
  '/dashboard': () => <DashboardView showToast={noop} />,
  '/admin': () => <DashboardView showToast={noop} />,
  '/fluxos': () => <FlowBuilderPage />,
  '/criativos': () => <CriativosPage />,
  '/galeria': () => <GaleriaPage />,
  '/video-studio': () => <VideoStudioPage />,
  '/agente': () => <AgentView showToast={noop} />,
  /** Configuração do atendente IA (persona, tom, scripts) */
  '/atendente': () => <AgentConfigPage />,
  '/tirar-pedido': () => <AgentPDVPage />,
  '/automacoes': () => <AutomationsView />,
  '/campanhas': () => <CampaignsCanvas />,
  '/campanha': () => <CampaignsCanvas />,
  '/produtos': () => <ProductsCanvas />,
  '/loja': () => <StoreStudioPage />,
  '/design': () => <StoreStudioPage />,
  '/busca': () => <LeadSearchPage variant="canvas" />,
  '/leads': () => <LeadsPage />,
  '/clientes': () => <ClientesPage />,
  '/pedidos': () => <OrdersView showToast={noop} />,
  '/mensagens': () => <MessagesPage variant="canvas" />,
  '/habilidades': () => <BrandSkillsPage />,
  '/skills': () => <BrandSkillsPage />,
  '/instagram': () => <InstagramCanvas />,
  '/facebook': () => <FacebookCanvas />,
  '/afiliados': () => <AffiliatesCanvas />,
  '/configuracoes': () => <SettingsCanvas />,
  '/whatsapp': () => <WhatsAppManagerView />,
  '/notificacoes': () => <NotificationsView showToast={noop} />,
  '/dominio': () => <DomainView showToast={noop} />,
  '/frete': () => <FreteView showToast={noop} />,
  '/entregas': () => <MobLogisticsView showToast={noop} />,
  '/mob': () => <MobLogisticsView showToast={noop} />,
  '/estoque': () => <EstoqueAccessView showToast={noop} />,
  '/cupons': () => <CouponsView showToast={noop} />,
  '/avaliacoes': () => <ReviewsView showToast={noop} />,
  '/pagamentos': () => <PaymentConfigView showToast={noop} />,
  '/provedores-ia': () => <AIProvidersPage />,
  '/emails': () => <AdminEmailsPage />,
}

function SettingsCanvas({ forcedTab }: { forcedTab?: string } = {}) {
  const { showToast } = useToast()
  const shell = useAgentShellOptional()
  const openStore = () => {
    if (shell?.triggerSkill) {
      shell.triggerSkill('design.edit', {
        label: 'Studio da Loja',
        assistantMessage: 'Studio da loja — cores, logo e vitrine:',
      })
      return
    }
    shell?.openCanvas('/loja')
  }
  return (
    <SettingsView
      showToast={(msg, tp) => showToast(tp === 'err' ? msg : msg, tp === 'err' ? 'error' : 'success')}
      forcedTab={forcedTab}
      onOpenStore={openStore}
    />
  )
}

/** Chunk preload por rota — 1ª visita deixa de bloquear no splash */
const CANVAS_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/admin': loadDashboard,
  '/dashboard': loadDashboard,
  '/leads': loadLeads,
  '/clientes': loadClientes,
  '/produtos': loadProducts,
  '/pedidos': loadOrders,
  '/mensagens': loadMessages,
  '/atendente': loadAgentConfig,
  '/campanhas': loadCampaigns,
  '/campanha': loadCampaigns,
  '/configuracoes': loadSettings,
  '/whatsapp': loadWhatsApp,
  '/instagram': loadInstagram,
  '/facebook': loadFacebook,
  '/automacoes': loadAutomations,
  '/afiliados': loadAffiliates,
  '/galeria': loadGaleria,
  '/loja': loadStoreStudio,
  '/design': loadStoreStudio,
  '/busca': loadLeadSearch,
  '/habilidades': loadBrandSkills,
  '/skills': loadBrandSkills,
  '/agente': loadAgentView,
  '/fluxos': loadFlowBuilder,
  '/criativos': loadCriativos,
  '/video-studio': loadVideoStudio,
  '/notificacoes': loadNotifications,
  '/cupons': loadCoupons,
  '/frete': loadFrete,
  '/entregas': loadMob,
  '/mob': loadMob,
  '/estoque': loadEstoque,
  '/avaliacoes': loadReviews,
  '/pagamentos': loadPayments,
  '/dominio': loadDomain,
  '/emails': loadEmails,
  '/provedores-ia': loadAIProviders,
  '/tirar-pedido': loadAgentPDV,
}

const prefetched = new Set<string>()

export function normalizeCanvasPath(route: string): string {
  const p = (route || '').split('?')[0] || ''
  if (p === '/dashboard') return '/admin'
  return p
}

/** Prefetch do JS da área (hover / idle). Seguro chamar várias vezes. */
export function prefetchCanvasRoute(route: string): void {
  const key = normalizeCanvasPath(route)
  if (!key || prefetched.has(key)) return
  const loader = CANVAS_PRELOADERS[key]
  if (!loader) return
  prefetched.add(key)
  void loader().catch(() => {
    prefetched.delete(key)
  })
}

/** Prefetch das áreas mais usadas (atalhos do dia a dia). */
export function prefetchHotCanvasRoutes(): void {
  ;[
    '/admin', '/leads', '/mensagens', '/atendente', '/produtos', '/pedidos',
    '/configuracoes', '/campanhas', '/galeria', '/instagram',
  ].forEach(prefetchCanvasRoute)
}

export function CanvasPageEmbed({ route }: { route: string }) {
  const pathOnly = normalizeCanvasPath(route)
  const qs = (route || '').includes('?') ? (route || '').slice((route || '').indexOf('?') + 1) : ''
  const flush = CANVAS_FLUSH_ROUTES.has(pathOnly)

  // Legacy: /configuracoes?tab=whatsapp → ferramenta WhatsApp
  if (pathOnly === '/configuracoes' && new URLSearchParams(qs).get('tab') === 'whatsapp') {
    return (
      <Suspense fallback={<CanvasFallback route="/whatsapp" />}>
        <div className={`agent-canvas__embed h-full min-h-0${flush ? ' agent-canvas__embed--flush' : ''}`}>
          <WhatsAppManagerView />
        </div>
      </Suspense>
    )
  }

  if (pathOnly === '/configuracoes') {
    const tab = new URLSearchParams(qs).get('tab') || undefined
    return (
      <Suspense fallback={<CanvasFallback route={pathOnly} />}>
        <div className={`agent-canvas__embed h-full min-h-0${flush ? ' agent-canvas__embed--flush' : ''}`}>
          <SettingsCanvas forcedTab={tab} />
        </div>
      </Suspense>
    )
  }

  const render = CANVAS_PAGE_MAP[pathOnly]
  if (!render) {
    return (
      <div className="agent-canvas__empty">
        <p className="agent-canvas__empty-title">Área não encontrada</p>
        <p className="agent-canvas__empty-desc">
          Não há painel para <code>{pathOnly || route}</code>. Use o menu ou digite o nome da área no chat
          (ex.: Atendente, Produtos, Pedidos).
        </p>
      </div>
    )
  }

  return (
    <Suspense fallback={<CanvasFallback route={pathOnly} />}>
      <div className={`agent-canvas__embed h-full min-h-0${flush ? ' agent-canvas__embed--flush' : ''}`}>
        {render()}
      </div>
    </Suspense>
  )
}

const MAX_CACHED_PAGES = 8

/**
 * Keep-alive do painel: páginas visitadas ficam montadas (hidden).
 * Troca de atalho = só display, sem remount / re-fetch / splash.
 */
export function CanvasPageCache({ activeRoute }: { activeRoute: string }) {
  const shell = useAgentShellOptional()
  const brandId = String((shell as { brandId?: string } | null)?.brandId || '').trim()
  const activePath = normalizeCanvasPath(activeRoute)
  // Cache key inclui marca — troca de Alho Pronto ↔ CE não reutiliza painel stale
  const cacheKey = (path: string) => `${brandId || 'nobrand'}::${path}`
  const [visited, setVisited] = useState<string[]>(() =>
    activePath ? [cacheKey(activePath)] : [cacheKey('/admin')],
  )

  useEffect(() => {
    if (!activePath) return
    prefetchCanvasRoute(activePath)
    const key = cacheKey(activePath)
    setVisited((prev) => {
      if (prev[prev.length - 1] === key) return prev
      const without = prev.filter((p) => p !== key)
      const next = [...without, key]
      if (next.length > MAX_CACHED_PAGES) return next.slice(next.length - MAX_CACHED_PAGES)
      return next
    })
  }, [activePath, brandId])

  useEffect(() => {
    const run = () => prefetchHotCanvasRoutes()
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 2500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 900)
    return () => window.clearTimeout(t)
  }, [])

  const flushActive = isCanvasFlushRoute(activePath)
  const activeKey = cacheKey(activePath)

  return (
    <div
      className={`agent-canvas__cache h-full min-h-0${flushActive ? ' agent-canvas__cache--flush' : ''}`}
      data-active-route={activePath}
      data-brand={brandId || undefined}
    >
      {visited.map((key) => {
        const path = key.includes('::') ? key.split('::').slice(1).join('::') : key
        const active = key === activeKey
        return (
          <div
            key={key}
            className="agent-canvas__cache-page h-full min-h-0"
            style={{ display: active ? 'flex' : 'none', flexDirection: 'column' }}
            aria-hidden={!active}
            data-route={path}
            data-active={active ? 'true' : 'false'}
          >
            <CanvasPageEmbed route={path} />
          </div>
        )
      })}
    </div>
  )
}