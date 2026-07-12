import { lazy } from 'react'
import { Route, Navigate, useNavigate } from 'react-router-dom'
import { useToast } from '@/components/Toast'

/* ── Admin views (code-split por rota) ── */
const AdminShell = lazy(() => import('@/components/admin/AdminShell').then(m => ({ default: m.AdminShell })))
const DashboardView = lazy(() => import('@/pages/admin/dashboard/DashboardView').then(m => ({ default: m.DashboardView })))
const CampaignsView = lazy(() => import('@/pages/admin/campaigns/CampaignsView').then(m => ({ default: m.CampaignsView })))
const OrdersView = lazy(() => import('@/pages/admin/orders/OrdersView').then(m => ({ default: m.OrdersView })))
const ProductsView = lazy(() => import('@/pages/admin/products/ProductsView').then(m => ({ default: m.ProductsView })))
const AgentView = lazy(() => import('@/pages/admin/agent/AgentView').then(m => ({ default: m.AgentView })))

const NotificationsView = lazy(() => import('@/pages/admin/notifications/NotificationsView').then(m => ({ default: m.NotificationsView })))
const DomainView = lazy(() => import('@/pages/admin/domain/DomainView').then(m => ({ default: m.DomainView })))
const FreteView = lazy(() => import('@/pages/admin/frete/FreteView').then(m => ({ default: m.FreteView })))
const EstoqueAccessView = lazy(() => import('@/pages/admin/estoque/EstoqueAccessView').then(m => ({ default: m.EstoqueAccessView })))
const AffiliatesView = lazy(() => import('@/pages/admin/affiliates/AffiliatesView').then(m => ({ default: m.AffiliatesView })))
const CouponsView = lazy(() => import('@/pages/admin/coupons/CouponsView').then(m => ({ default: m.CouponsView })))
const ReviewsView = lazy(() => import('@/pages/admin/reviews/ReviewsView').then(m => ({ default: m.ReviewsView })))
const PaymentConfigView = lazy(() => import('@/pages/admin/payments/PaymentConfigView').then(m => ({ default: m.PaymentConfigView })))
const WhatsAppManagerView = lazy(() => import('@/pages/admin/whatsapp/WhatsAppManagerView').then(m => ({ default: m.WhatsAppManagerView })))
const SettingsView = lazy(() => import('@/pages/admin/settings/SettingsView').then(m => ({ default: m.SettingsView })))
const MessagesView = lazy(() => import('@/pages/admin/messages/MessagesView').then(m => ({ default: m.MessagesView })))
const AutomationsView = lazy(() => import('@/pages/admin/automations/AutomationsView').then(m => ({ default: m.AutomationsView })))

const ClientesPage = lazy(() => import('@/pages/ClientesPage').then(m => ({ default: m.ClientesPage })))
const LeadsPage = lazy(() => import('@/pages/LeadsPage').then(m => ({ default: m.LeadsPage })))
const LeadSearchPage = lazy(() => import('@/pages/LeadSearchPage').then(m => ({ default: m.LeadSearchPage })))
const FlowBuilderPage = lazy(() => import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage })))
const BrandSkillsPage = lazy(() => import('@/pages/BrandSkillsPage').then(m => ({ default: m.BrandSkillsPage })))
const AgentConfigPage = lazy(() => import('@/pages/AgentConfigPage').then(m => ({ default: m.AgentConfigPage })))
const AgentPDVPage = lazy(() => import('@/pages/AgentPDVPage').then(m => ({ default: m.AgentPDVPage })))
const StoreStudioPage = lazy(() => import('@/pages/admin/store/StoreStudioPage').then(m => ({ default: m.StoreStudioPage })))
const BrandImageGeneratorPage = lazy(() => import('@/pages/BrandImageGeneratorPage').then(m => ({ default: m.BrandImageGeneratorPage })))
const CriativosPage = lazy(() => import('@/pages/CriativosPage').then(m => ({ default: m.CriativosPage })))
const GaleriaPage = lazy(() => import('@/pages/GaleriaPage').then(m => ({ default: m.GaleriaPage })))
const VideoStudioPage = lazy(() => import('@/pages/VideoStudioPage').then(m => ({ default: m.VideoStudioPage })))
const AIProvidersPage = lazy(() => import('@/pages/AIProvidersPage').then(m => ({ default: m.AIProvidersPage })))
const AdminEmailsPage = lazy(() => import('@/pages/AdminEmailsPage').then(m => ({ default: m.AdminEmailsPage })))
const InstagramPage = lazy(() => import('@/pages/InstagramPage').then(m => ({ default: m.InstagramPage })))
const FacebookPage = lazy(() => import('@/pages/FacebookPage').then(m => ({ default: m.FacebookPage })))

function AdminPage({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}

const noop = () => {}

function SettingsRoute() {
  const navigate = useNavigate()
  return (
    <SettingsView
      showToast={noop}
      onOpenStore={() => navigate('/loja')}
    />
  )
}

function DashboardInline() {
  return <DashboardView showToast={noop} />
}

function CampaignsInline() {
  const { showToast } = useToast()
  return (
    <CampaignsView
      showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
    />
  )
}

function OrdersInline() {
  return <OrdersView showToast={noop} />
}

function ProductsInline() {
  const { showToast } = useToast()
  return (
    <ProductsView
      showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)}
    />
  )
}

/** Rotas do painel admin — fragmento direto (Routes não aceita componente wrapper). */
export const adminRouteElements = (
  <>
      <Route path="/admin" element={<AdminPage><DashboardInline /></AdminPage>} />
      <Route path="/dashboard" element={<AdminPage><DashboardInline /></AdminPage>} />
      <Route path="/assistente" element={<Navigate to="/admin" replace />} />
      <Route path="/leads" element={<AdminPage><LeadsPage /></AdminPage>} />
      <Route path="/clientes" element={<AdminPage><ClientesPage /></AdminPage>} />
      <Route path="/busca" element={<AdminPage><LeadSearchPage /></AdminPage>} />
      <Route path="/mensagens" element={<AdminPage><MessagesView /></AdminPage>} />
      <Route path="/notificacoes" element={<AdminPage><NotificationsView showToast={noop} /></AdminPage>} />
      <Route path="/campanhas" element={<AdminPage><CampaignsInline /></AdminPage>} />
      <Route path="/campanha" element={<AdminPage><CampaignsInline /></AdminPage>} />
      <Route path="/automacoes" element={<AdminPage><AutomationsView /></AdminPage>} />
      <Route path="/habilidades" element={<AdminPage><BrandSkillsPage /></AdminPage>} />
      <Route path="/skills" element={<AdminPage><BrandSkillsPage /></AdminPage>} />
      <Route path="/fluxos" element={<AdminPage><FlowBuilderPage /></AdminPage>} />
      <Route path="/criativos" element={<AdminPage><CriativosPage /></AdminPage>} />
      <Route path="/galeria" element={<AdminPage><GaleriaPage /></AdminPage>} />
      <Route path="/video-studio" element={<AdminPage><VideoStudioPage /></AdminPage>} />
      <Route path="/criativos/avancado" element={<AdminPage><BrandImageGeneratorPage /></AdminPage>} />
      <Route path="/creative" element={<AdminPage><CriativosPage /></AdminPage>} />
      <Route path="/agente" element={<AdminPage><AgentView showToast={noop} /></AdminPage>} />
      <Route path="/atendente" element={<AdminPage><AgentConfigPage /></AdminPage>} />
      <Route path="/tirar-pedido" element={<AdminPage><AgentPDVPage /></AdminPage>} />
      <Route path="/whatsapp" element={<AdminPage><WhatsAppManagerView /></AdminPage>} />
      <Route path="/instagram" element={<AdminPage><InstagramPage /></AdminPage>} />
      <Route path="/facebook" element={<AdminPage><FacebookPage /></AdminPage>} />
      <Route path="/produtos" element={<AdminPage><ProductsInline /></AdminPage>} />
      <Route path="/pedidos" element={<AdminPage><OrdersInline /></AdminPage>} />
      <Route path="/estoque" element={<AdminPage><EstoqueAccessView showToast={noop} /></AdminPage>} />
      <Route path="/afiliados" element={<AdminPage><AffiliatesView showToast={noop} /></AdminPage>} />
      <Route path="/cupons" element={<AdminPage><CouponsView showToast={noop} /></AdminPage>} />
      <Route path="/avaliacoes" element={<AdminPage><ReviewsView showToast={noop} /></AdminPage>} />
      <Route path="/loja" element={<AdminPage><StoreStudioPage /></AdminPage>} />
      <Route path="/design" element={<Navigate to="/loja" replace />} />
      <Route path="/pagamentos" element={<AdminPage><PaymentConfigView showToast={noop} /></AdminPage>} />
      <Route path="/frete" element={<AdminPage><FreteView showToast={noop} /></AdminPage>} />
      <Route path="/dominio" element={<AdminPage><DomainView showToast={noop} /></AdminPage>} />
      <Route path="/configuracoes" element={<AdminPage><SettingsRoute /></AdminPage>} />
      <Route path="/provedores-ia" element={<AdminPage><AIProvidersPage /></AdminPage>} />
      <Route path="/emails" element={<AdminPage><AdminEmailsPage /></AdminPage>} />
    </>
)
