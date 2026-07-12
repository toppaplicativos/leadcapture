import { lazy, Suspense, type ReactNode } from 'react'
import { PageSplash, canvasSplashLabel } from '@/components/PageSplash'
import { useToast } from '@/components/Toast'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'
import { useInstagramBridgeOptional } from '@/lib/agent/InstagramBridgeContext'
import { useFacebookBridgeOptional } from '@/lib/agent/FacebookBridgeContext'
import { useAffiliatesBridgeOptional } from '@/lib/agent/AffiliatesBridgeContext'
import type { InstagramTabKey } from '@/lib/instagram/nav'
import type { FacebookTabKey } from '@/pages/FacebookPage'
import type { AffiliatesTabKey } from '@/lib/agent/AffiliatesBridgeContext'

const DashboardView = lazy(() => import('@/pages/admin/dashboard/DashboardView').then(m => ({ default: m.DashboardView })))
const CampaignsView = lazy(() => import('@/pages/admin/campaigns/CampaignsView').then(m => ({ default: m.CampaignsView })))
const FlowBuilderPage = lazy(() => import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage })))
const CriativosPage = lazy(() => import('@/pages/CriativosPage').then(m => ({ default: m.CriativosPage })))
const GaleriaPage = lazy(() => import('@/pages/GaleriaPage').then(m => ({ default: m.GaleriaPage })))
const VideoStudioPage = lazy(() => import('@/pages/VideoStudioPage').then(m => ({ default: m.VideoStudioPage })))
const AgentView = lazy(() => import('@/pages/admin/agent/AgentView').then(m => ({ default: m.AgentView })))
const AgentConfigPage = lazy(() => import('@/pages/AgentConfigPage').then(m => ({ default: m.AgentConfigPage })))
const AgentPDVPage = lazy(() => import('@/pages/AgentPDVPage').then(m => ({ default: m.AgentPDVPage })))
const AutomationsView = lazy(() => import('@/pages/admin/automations/AutomationsView').then(m => ({ default: m.AutomationsView })))
const StoreStudioPage = lazy(() => import('@/pages/admin/store/StoreStudioPage').then(m => ({ default: m.StoreStudioPage })))
const LeadSearchPage = lazy(() => import('@/pages/LeadSearchPage').then(m => ({ default: m.LeadSearchPage })))
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then(m => ({ default: m.MessagesPage })))
const ProductsView = lazy(() => import('@/pages/admin/products/ProductsView').then(m => ({ default: m.ProductsView })))
const LeadsPage = lazy(() => import('@/pages/LeadsPage').then(m => ({ default: m.LeadsPage })))
const ClientesPage = lazy(() => import('@/pages/ClientesPage').then(m => ({ default: m.ClientesPage })))
const OrdersView = lazy(() => import('@/pages/admin/orders/OrdersView').then(m => ({ default: m.OrdersView })))
const BrandSkillsPage = lazy(() => import('@/pages/BrandSkillsPage').then(m => ({ default: m.BrandSkillsPage })))
const InstagramPage = lazy(() => import('@/pages/InstagramPage').then(m => ({ default: m.InstagramPage })))
const FacebookPage = lazy(() => import('@/pages/FacebookPage').then(m => ({ default: m.FacebookPage })))
const AffiliatesPage = lazy(() => import('@/pages/AffiliatesPage').then(m => ({ default: m.AffiliatesPage })))
const SettingsView = lazy(() => import('@/pages/admin/settings/SettingsView').then(m => ({ default: m.SettingsView })))
const WhatsAppManagerView = lazy(() => import('@/pages/admin/whatsapp/WhatsAppManagerView').then(m => ({ default: m.WhatsAppManagerView })))
const NotificationsView = lazy(() => import('@/pages/admin/notifications/NotificationsView').then(m => ({ default: m.NotificationsView })))
const DomainView = lazy(() => import('@/pages/admin/domain/DomainView').then(m => ({ default: m.DomainView })))
const FreteView = lazy(() => import('@/pages/admin/frete/FreteView').then(m => ({ default: m.FreteView })))
const EstoqueAccessView = lazy(() => import('@/pages/admin/estoque/EstoqueAccessView').then(m => ({ default: m.EstoqueAccessView })))
const CouponsView = lazy(() => import('@/pages/admin/coupons/CouponsView').then(m => ({ default: m.CouponsView })))
const ReviewsView = lazy(() => import('@/pages/admin/reviews/ReviewsView').then(m => ({ default: m.ReviewsView })))
const PaymentConfigView = lazy(() => import('@/pages/admin/payments/PaymentConfigView').then(m => ({ default: m.PaymentConfigView })))
const AIProvidersPage = lazy(() => import('@/pages/AIProvidersPage').then(m => ({ default: m.AIProvidersPage })))
const AdminEmailsPage = lazy(() => import('@/pages/AdminEmailsPage').then(m => ({ default: m.AdminEmailsPage })))

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

export function CanvasPageEmbed({ route }: { route: string }) {
  const pathOnly = (route || '').split('?')[0]
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