import { lazy, Suspense, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/Toast'

const DashboardView = lazy(() => import('@/pages/admin/dashboard/DashboardView').then(m => ({ default: m.DashboardView })))
const CampaignsView = lazy(() => import('@/pages/admin/campaigns/CampaignsView').then(m => ({ default: m.CampaignsView })))
const FlowBuilderPage = lazy(() => import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage })))
const CriativosPage = lazy(() => import('@/pages/CriativosPage').then(m => ({ default: m.CriativosPage })))
const GaleriaPage = lazy(() => import('@/pages/GaleriaPage').then(m => ({ default: m.GaleriaPage })))
const VideoStudioPage = lazy(() => import('@/pages/VideoStudioPage').then(m => ({ default: m.VideoStudioPage })))
const AgentView = lazy(() => import('@/pages/admin/agent/AgentView').then(m => ({ default: m.AgentView })))
const AutomationsView = lazy(() => import('@/pages/admin/automations/AutomationsView').then(m => ({ default: m.AutomationsView })))
const DesignPage = lazy(() => import('@/pages/DesignPage').then(m => ({ default: m.DesignPage })))
const LeadSearchPage = lazy(() => import('@/pages/LeadSearchPage').then(m => ({ default: m.LeadSearchPage })))
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then(m => ({ default: m.MessagesPage })))

const noop = () => {}

function CanvasFallback() {
  return (
    <div className="h-full grid place-items-center">
      <Loader2 size={20} className="animate-spin text-gray-400" />
    </div>
  )
}

function CampaignsCanvas() {
  const { showToast } = useToast()
  return (
    <CampaignsView
      showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
    />
  )
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
  '/design': () => <DesignPage />,
  '/busca': () => <LeadSearchPage variant="canvas" />,
  '/mensagens': () => <MessagesPage variant="canvas" />,
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

  return (
    <Suspense fallback={<CanvasFallback />}>
      <div className="agent-canvas__embed h-full min-h-0">{render()}</div>
    </Suspense>
  )
}