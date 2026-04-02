import { useState, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
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
import { StockPanelPage } from '@/pages/StockPanelPage'
import { InventoryPage, DesignView } from '@/pages/InventoryPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { AdminShell, DashboardView, CampaignsView, OrdersView, AutomationsView, ProductsView } from '@/pages/AdminDashboard'
import { LeadSearchPage } from '@/pages/LeadSearchPage'
import { LeadsPage } from '@/pages/LeadsPage'
import { MessageSquare, Package, Zap, Bot, Palette, Truck, Globe, Settings } from 'lucide-react'

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

  if (!storeSlug) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <p className="text-muted text-center">
          Informe o slug da loja na URL, ex: /catalogo/minha-loja
        </p>
      </div>
    )
  }

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
        <Route path="/clientes" element={<AdminPage><LeadsPage /></AdminPage>} />
        <Route path="/busca" element={<AdminPage><LeadSearchPage /></AdminPage>} />
        <Route path="/mensagens" element={<AdminPage><ComingSoon title="Mensagens" icon={MessageSquare} /></AdminPage>} />
        <Route path="/notificacoes" element={<AdminPage><ComingSoon title="Notificacoes" icon={MessageSquare} /></AdminPage>} />
        <Route path="/campanhas" element={<AdminPage><CampaignsInline /></AdminPage>} />
        <Route path="/campanha" element={<AdminPage><CampaignsInline /></AdminPage>} />
        <Route path="/automacoes" element={<AdminPage><AutomationsView showToast={() => {}} /></AdminPage>} />
        <Route path="/criativos" element={<AdminPage><ComingSoon title="Estudio Criativo" icon={MessageSquare} /></AdminPage>} />
        <Route path="/creative" element={<AdminPage><ComingSoon title="Estudio Criativo" icon={MessageSquare} /></AdminPage>} />
        <Route path="/agente" element={<AdminPage><ComingSoon title="Agente IA" icon={MessageSquare} /></AdminPage>} />
        <Route path="/produtos" element={<AdminPage><ProductsView showToast={() => {}} /></AdminPage>} />
        <Route path="/pedidos" element={<AdminPage><OrdersInline /></AdminPage>} />
        <Route path="/estoque" element={<InventoryPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/design" element={<AdminPage><DesignView showToast={() => {}} /></AdminPage>} />
        <Route path="/frete" element={<AdminPage><ComingSoon title="Frete & Entrega" icon={Package} /></AdminPage>} />
        <Route path="/dominio" element={<AdminPage><ComingSoon title="Dominio" icon={Package} /></AdminPage>} />
        <Route path="/configuracoes" element={<AdminPage><ComingSoon title="Configuracoes" icon={Package} /></AdminPage>} />

        {/* ── App Estoque (stock managers) ── */}
        <Route path="/app-estoque" element={<StockLoginPage />} />
        <Route path="/app-estoque/:brand" element={<StockLoginPage />} />
        <Route path="/app-estoque/painel" element={<StockPanelPage />} />

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

        {/* ── Root (custom domain catalog or redirect) ── */}
        <Route path="/" element={<CatalogShell />} />
      </Routes>

      <Toast />
    </>
  )
}

/* ── Inline wrappers ── */
const noop = () => {}
function DashboardInline() { return <DashboardView showToast={noop} /> }
function CampaignsInline() { return <CampaignsView showToast={noop} /> }
function OrdersInline() { return <OrdersView showToast={noop} /> }
