import { useState, useCallback, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import type { StoreData } from '@/lib/api'
import { storeSlug } from '@/lib/store-context'
import { Topbar } from '@/components/Topbar'
import { BottomNav } from '@/components/BottomNav'
import { Toast } from '@/components/Toast'
import { CatalogHome } from '@/pages/CatalogHome'
import { OrdersTab } from '@/pages/OrdersTab'
import { ProfileTab } from '@/pages/ProfileTab'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { OrderPage } from '@/pages/OrderPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { StockLoginPage } from '@/pages/StockLoginPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { AdminShell, DashboardView, CampaignsView, OrdersView, AutomationsView, ProductsView, AgentView, NotificationsView, DomainView, FreteView, EstoqueAccessView, PaymentConfigView, WhatsAppManagerView, ClientesView } from '@/pages/AdminDashboard'
import { AgentPDVPage } from '@/pages/AgentPDVPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { FlowBuilderPage } from '@/pages/FlowBuilderPage'
import { LeadSearchPage } from '@/pages/LeadSearchPage'
import { LeadsPage } from '@/pages/LeadsPage'
import { SettingsView } from '@/pages/AdminDashboard'
import { MessageSquare, Package, Zap, Bot, Palette, Truck, Globe, Settings } from 'lucide-react'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
import { useToast } from '@/components/Toast'

function CatalogShell() {
  const [activeTab, setActiveTab] = useState('catalogo')
  const [storeName, setStoreName] = useState('Loja')
  const [logoUrl, setLogoUrl] = useState<string | undefined>()

  const handleStoreLoaded = useCallback((store: StoreData['store']) => {
    const brand = store.brand
    const theme = store.theme
    setStoreName(brand?.name || store.name || 'Loja')
    setLogoUrl(brand?.logo_url || theme?.logo_url || undefined)
  }, [])

  return (
    <div className="min-h-screen bg-bg pb-16">
      <Topbar storeName={storeName} logoUrl={logoUrl} />

      <main>
        {activeTab === 'catalogo' && (
          <CatalogHome onStoreLoaded={handleStoreLoaded} />
        )}
        {activeTab === 'pedidos' && <OrdersTab />}
        {activeTab === 'perfil' && <ProfileTab />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

/**
 * Root index — decide where to send the user based on auth state.
 *
 * Order of precedence:
 *   1. If a custom-domain catalog slug is detected (storeSlug from store-context), render the catalog
 *   2. If admin is logged in → /admin
 *   3. If a stock manager is logged in → their stock app
 *   4. Otherwise → /login
 */
function RootIndex() {
  const navigate = useNavigate()

  // Custom-domain catalog: render the catalog directly
  if (storeSlug) return <CatalogShell />

  useEffect(() => {
    const adminToken = localStorage.getItem('lead-system-token')
    if (adminToken) {
      navigate('/admin', { replace: true })
      return
    }
    const stockToken = localStorage.getItem('lead-system-token-estoque')
    const stockSlug = localStorage.getItem('lead-system:active-brand-ref-estoque')
    if (stockToken && stockSlug) {
      navigate(`/app-estoque/${stockSlug}/painel`, { replace: true })
      return
    }
    navigate('/login', { replace: true })
  }, [navigate])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/* ── Placeholder for sections not yet built ── */
function ComingSoon({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
        <Icon size={24} className="text-gray-300" />
      </div>
      <h2 className="text-base font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-xs text-gray-400">Em desenvolvimento</p>
    </div>
  )
}

/* ── Wrapper: AdminShell + child content ── */
function AdminPage({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}

export default function App() {
  return (
    <>
      <Routes>
        {/* ── Login ── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Admin pages (all wrapped in AdminShell sidebar) ── */}
        <Route path="/admin" element={<AdminPage><DashboardInline /></AdminPage>} />
        <Route path="/dashboard" element={<AdminPage><DashboardInline /></AdminPage>} />
        <Route path="/leads" element={<AdminPage><LeadsPage /></AdminPage>} />
        <Route path="/clientes" element={<AdminPage><ClientesView showToast={() => {}} /></AdminPage>} />
        <Route path="/busca" element={<AdminPage><LeadSearchPage /></AdminPage>} />
        <Route path="/mensagens" element={<AdminPage><MessagesPage /></AdminPage>} />
        <Route path="/notificacoes" element={<AdminPage><NotificationsView showToast={() => {}} /></AdminPage>} />
        <Route path="/campanhas" element={<AdminPage><CampaignsInline /></AdminPage>} />
        <Route path="/campanha" element={<AdminPage><CampaignsInline /></AdminPage>} />
        <Route path="/automacoes" element={<AdminPage><FlowBuilderPage /></AdminPage>} />
        <Route path="/criativos" element={<AdminPage><ComingSoon title="Estudio Criativo" icon={Palette} /></AdminPage>} />
        <Route path="/creative" element={<AdminPage><ComingSoon title="Estudio Criativo" icon={Palette} /></AdminPage>} />
        <Route path="/agente" element={<AdminPage><AgentView showToast={() => {}} /></AdminPage>} />
        <Route path="/tirar-pedido" element={<AdminPage><AgentPDVPage /></AdminPage>} />
        <Route path="/whatsapp" element={<AdminPage><WhatsAppManagerView showToast={() => {}} /></AdminPage>} />
        <Route path="/produtos" element={<AdminPage><ProductsView showToast={() => {}} /></AdminPage>} />
        <Route path="/pedidos" element={<AdminPage><OrdersInline /></AdminPage>} />
        <Route path="/estoque" element={<AdminPage><EstoqueAccessView showToast={() => {}} /></AdminPage>} />
        <Route path="/estoque/app" element={<InventoryPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/design" element={<AdminPage><ComingSoon title="Design" icon={Palette} /></AdminPage>} />
        <Route path="/pagamentos" element={<AdminPage><PaymentConfigView showToast={() => {}} /></AdminPage>} />
        <Route path="/frete" element={<AdminPage><FreteView showToast={() => {}} /></AdminPage>} />
        <Route path="/dominio" element={<AdminPage><DomainView showToast={() => {}} /></AdminPage>} />
        <Route path="/configuracoes" element={<AdminPage><SettingsView showToast={() => {}} /></AdminPage>} />

        {/* ── App Estoque (stock managers — separate auth scope) ──
            URL pattern: /app-estoque/{brand-slug} → branded login
                         /app-estoque/{brand-slug}/painel → stock app
            The InventoryPage detects /app-estoque/* and switches the API
            to /api/stock-app/* using the stock manager token. */}
        <Route path="/app-estoque" element={<StockLoginPage />} />
        <Route path="/app-estoque/:slug" element={<StockLoginPage />} />
        <Route path="/app-estoque/:slug/painel" element={<InventoryPage />} />
        {/* Backwards-compat: old painel URL */}
        <Route path="/app-estoque/painel" element={<InventoryPage />} />

        {/* ── Brand Onboarding ── */}
        <Route path="/brand-onboarding" element={<OnboardingPage />} />

        {/* ── Catálogo público ── */}
        <Route path="/catalogo/:slug" element={<CatalogShell />} />
        <Route path="/loja/:slug" element={<CatalogShell />} />
        <Route path="/catalogo/:slug/checkout" element={<CheckoutPage />} />
        <Route path="/loja/:slug/checkout" element={<CheckoutPage />} />
        <Route path="/catalogo/:slug/pedido" element={<OrderPage />} />
        <Route path="/loja/:slug/pedido" element={<OrderPage />} />
        <Route path="/catalogo/:slug/historico" element={<HistoryPage />} />
        <Route path="/loja/:slug/historico" element={<HistoryPage />} />
        <Route path="/catalogo/:slug/produto/:productSlug" element={<ProductDetailPage />} />
        <Route path="/loja/:slug/produto/:productSlug" element={<ProductDetailPage />} />

        {/* ── Generic storefront routes ── */}
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/pedido" element={<OrderPage />} />
        <Route path="/historico" element={<HistoryPage />} />
        <Route path="/produto/:productSlug" element={<ProductDetailPage />} />

        {/* ── Root: smart redirect based on auth state ── */}
        <Route path="/" element={<RootIndex />} />
      </Routes>

      <Toast />
      <PWAInstallBanner />
    </>
  )
}

/* ── Inline wrappers ── */
const noop = () => {}
function DashboardInline() { return <DashboardView showToast={noop} /> }
function CampaignsInline() {
  const { showToast } = useToast()
  return <CampaignsView showToast={(msg, tp) => showToast(tp === 'err' ? `Erro: ${msg}` : msg)} />
}
function OrdersInline() { return <OrdersView showToast={noop} /> }
