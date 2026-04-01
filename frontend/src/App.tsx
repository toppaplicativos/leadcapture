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
import { InventoryPage } from '@/pages/InventoryPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { AdminDashboard } from '@/pages/AdminDashboard'
import { LeadSearchPage } from '@/pages/LeadSearchPage'

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

export default function App() {
  return (
    <>
      <Routes>
        {/* ── Admin Panel ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/busca" element={<LeadSearchPage />} />

        {/* ── Inventário (full management) ── */}
        <Route path="/estoque" element={<InventoryPage />} />
        <Route path="/inventario" element={<InventoryPage />} />

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
