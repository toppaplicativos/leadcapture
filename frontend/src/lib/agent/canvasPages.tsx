import { lazy, Suspense, type ReactNode } from 'react'
import { PageSplash, canvasSplashLabel } from '@/components/PageSplash'
import { useToast } from '@/components/Toast'
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

function InstagramCanvas() {
  const bridge = useInstagramBridgeOptional()
  const tab = (bridge?.snapshot.activeTab || 'overview') as InstagramTabKey
  return <InstagramPage initialTab={tab} />
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
  '/fluxos': () => <FlowBuilderPage />,
  '/criativos': () => <CriativosPage />,
  '/galeria': () => <GaleriaPage />,
  '/video-studio': () => <VideoStudioPage />,
  '/agente': () => <AgentView showToast={noop} />,
  '/automacoes': () => <AutomationsView />,
  '/campanhas': () => <CampaignsCanvas />,
  '/produtos': () => <ProductsCanvas />,
  '/loja': () => <StoreStudioPage />,
  '/design': () => <StoreStudioPage />,
  '/busca': () => <LeadSearchPage variant="canvas" />,
  '/leads': () => <LeadsPage />,
  '/clientes': () => <ClientesPage />,
  '/pedidos': () => <OrdersView showToast={() => {}} />,
  '/mensagens': () => <MessagesPage variant="canvas" />,
  '/habilidades': () => <BrandSkillsPage />,
  '/skills': () => <BrandSkillsPage />,
  '/instagram': () => <InstagramCanvas />,
  '/facebook': () => <FacebookCanvas />,
  '/afiliados': () => <AffiliatesCanvas />,
}

export function CanvasPageEmbed({ route }: { route: string }) {
  const render = CANVAS_PAGE_MAP[route]
  if (!render) {
    return (
      <div className="agent-canvas__empty">
        <p className="agent-canvas__empty-title">Canvas</p>
        <p className="agent-canvas__empty-desc">Nenhum editor para {route}</p>
      </div>
    )
  }

  const flush = CANVAS_FLUSH_ROUTES.has(route)

  return (
    <Suspense fallback={<CanvasFallback route={route} />}>
      <div className={`agent-canvas__embed h-full min-h-0${flush ? ' agent-canvas__embed--flush' : ''}`}>
        {render()}
      </div>
    </Suspense>
  )
}