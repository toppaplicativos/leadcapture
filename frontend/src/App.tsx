import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import type { StoreData } from '@/lib/api'
import { storeSlug } from '@/lib/store-context'
import { Topbar } from '@/components/Topbar'
import { BottomNav } from '@/components/BottomNav'
import { Toast } from '@/components/Toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CatalogHome } from '@/pages/CatalogHome'
import { OrdersTab } from '@/pages/OrdersTab'
import { ProfileTab } from '@/pages/ProfileTab'
import { LoginPage } from '@/pages/LoginPage'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
import { AdminRoutes } from '@/routes/adminRoutes'

const CheckoutPage = lazy(() => import('@/pages/CheckoutPage').then(m => ({ default: m.CheckoutPage })))
const OrderPage = lazy(() => import('@/pages/OrderPage').then(m => ({ default: m.OrderPage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const StockLoginPage = lazy(() => import('@/pages/StockLoginPage').then(m => ({ default: m.StockLoginPage })))
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then(m => ({ default: m.InventoryPage })))
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })))
const LandingPage = lazy(() => import('@/pages/LandingPage').then(m => ({ default: m.LandingPage })))
const MasterShell = lazy(() => import('@/pages/master/MasterShell').then(m => ({ default: m.MasterShell })))
const MasterDashboard = lazy(() => import('@/pages/master/MasterDashboard').then(m => ({ default: m.MasterDashboard })))
const MasterIntegracoes = lazy(() => import('@/pages/master/MasterIntegracoes').then(m => ({ default: m.MasterIntegracoes })))
const MasterPlanos = lazy(() => import('@/pages/master/MasterPlanos').then(m => ({ default: m.MasterPlanos })))
const MasterClientes = lazy(() => import('@/pages/master/MasterClientes').then(m => ({ default: m.MasterClientes })))
const MasterConfiguracoes = lazy(() => import('@/pages/master/MasterConfiguracoes').then(m => ({ default: m.MasterConfiguracoes })))
const MasterAuditLog = lazy(() => import('@/pages/master/MasterAuditLog').then(m => ({ default: m.MasterAuditLog })))
const MasterEmails = lazy(() => import('@/pages/master/MasterEmails').then(m => ({ default: m.MasterEmails })))
const CadastroPage = lazy(() => import('@/pages/CadastroPage').then(m => ({ default: m.CadastroPage })))
const CadastroSucessoPage = lazy(() => import('@/pages/CadastroSucessoPage').then(m => ({ default: m.CadastroSucessoPage })))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })))
const DataDeletionPage = lazy(() => import('@/pages/DataDeletionPage').then(m => ({ default: m.DataDeletionPage })))
const TermsOfServicePage = lazy(() => import('@/pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })))

/* ── Fallback ── */
function RouteFallback() {
  return (
    <div className="min-h-[40vh] grid place-items-center">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )
}

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
    <div className="store-page min-h-screen pb-16">
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
 * Hosts that serve the public marketing landing page (root domain & www).
 * Everything else (e.g. app.leadcapture.online, custom catalog domains)
 * keeps the original behavior.
 */
const LANDING_HOSTS = new Set([
  'leadcapture.online',
  'www.leadcapture.online',
])

/**
 * Hosts that serve the super-admin master panel.
 */
const MASTER_HOSTS = new Set([
  'adm.leadcapture.online',
])

function isLandingHost() {
  if (typeof window === 'undefined') return false
  return LANDING_HOSTS.has(window.location.hostname)
}

function isMasterHost() {
  if (typeof window === 'undefined') return false
  return MASTER_HOSTS.has(window.location.hostname)
}

/**
 * Root index — decide what to render at "/":
 *
 *   1. Marketing root domain (leadcapture.online) → LandingPage
 *   2. Custom-domain catalog slug detected → CatalogShell
 *   3. Admin logged in → /admin
 *   4. Stock manager logged in → their stock app
 *   5. Otherwise → /login
 */
function RootIndex() {
  const navigate = useNavigate()
  const onLandingHost = isLandingHost()
  const onMasterHost = isMasterHost()

  // adm.leadcapture.online → redirect / to /master
  if (onMasterHost) {
    return <Navigate to="/master" replace />
  }

  // Marketing root: show the landing immediately, no auth redirect.
  if (onLandingHost) return <LandingPage />

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

  return <RouteFallback />
}

/* ──────────────────────────────────────────────────────────────────────────────
 * ChunkLoadError defensive reload (PWA stability fix)
 *
 * Vite splits routes into per-page chunks. Each build
 * generates new hashes. When the service worker cycles to a new version and
 * the user has the old tab open, dynamic import() (React.lazy) requests the
 * OLD chunk name — which the server no longer has → 404 → React throws
 * ChunkLoadError → blank screen ("o app apagou"). User has to close and reopen.
 *
 * Standard SPA mitigation: catch the error globally and reload once. We track
 * the reload in sessionStorage so we don't loop if reload itself fails.
 * ────────────────────────────────────────────────────────────────────────────── */
const CHUNK_RELOAD_KEY = 'lead-system:chunk-reload-at'
function installChunkErrorRecovery() {
  if (typeof window === 'undefined') return
  const handler = (event: ErrorEvent | PromiseRejectionEvent) => {
    const error: any = (event as any).reason || (event as any).error
    const message = String(error?.message || error || '')
    const name = String(error?.name || '')
    const isChunkError =
      name === 'ChunkLoadError' ||
      /Loading chunk \S+ failed/i.test(message) ||
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message)
    if (!isChunkError) return
    /* Prevent infinite reload loop: only auto-reload if last reload was >10s ago */
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - lastReload < 10_000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    console.warn('[App] ChunkLoadError detected, reloading…', message)
    window.location.reload()
  }
  window.addEventListener('error', handler as any)
  window.addEventListener('unhandledrejection', handler as any)
}
installChunkErrorRecovery()

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* ── Landing page (marketing) ── */}
          <Route path="/inicio" element={<LandingPage />} />
          <Route path="/lp" element={<LandingPage />} />

          {/* ── Master / super-admin panel ── */}
          <Route path="/master" element={<MasterShell><MasterDashboard /></MasterShell>} />
          <Route path="/master/integracoes" element={<MasterShell><MasterIntegracoes /></MasterShell>} />
          <Route path="/master/planos" element={<MasterShell><MasterPlanos /></MasterShell>} />
          <Route path="/master/clientes" element={<MasterShell><MasterClientes /></MasterShell>} />
          <Route path="/master/configuracoes" element={<MasterShell><MasterConfiguracoes /></MasterShell>} />
          <Route path="/master/emails" element={<MasterShell><MasterEmails /></MasterShell>} />
          <Route path="/master/audit-log" element={<MasterShell><MasterAuditLog /></MasterShell>} />

          {/* ── Public: Privacy & Data Deletion (Meta compliance) ── */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy/policy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy/data-deletion" element={<DataDeletionPage />} />
          <Route path="/privacy/deletion-status" element={<DataDeletionPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />

          {/* ── Public signup flow ── */}
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/cadastro/sucesso" element={<CadastroSucessoPage />} />

          {/* ── Login ── */}
          <Route path="/login" element={<LoginPage />} />

          {/* ── Admin (lazy-load por rota — ver routes/adminRoutes.tsx) ── */}
          <AdminRoutes />

          {/* ── Estoque standalone (fora do AdminShell) ── */}
          <Route path="/estoque/app" element={<InventoryPage />} />
          <Route path="/inventario" element={<InventoryPage />} />

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
      </Suspense>

      <Toast />
      <ConfirmModal />
      <PWAInstallBanner />
    </>
  )
}
