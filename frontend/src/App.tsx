import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import type { StoreData } from '@/lib/api'
import { storeSlug } from '@/lib/store-context'
import { Topbar } from '@/components/Topbar'
import { BottomNav } from '@/components/BottomNav'
import { Toast } from '@/components/Toast'
import { useToast } from '@/components/Toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CatalogHome } from '@/pages/CatalogHome'
import { OrdersTab } from '@/pages/OrdersTab'
import { ProfileTab } from '@/pages/ProfileTab'
import { LoginPage } from '@/pages/LoginPage'
import { Palette } from 'lucide-react'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'

/* ──────────────────────────────────────────────
   Lazy chunks — split per route to keep the
   initial bundle small. Each named export from
   AdminDashboard re-uses the same module chunk
   (Vite/Rollup deduplicates dynamic imports).
   ────────────────────────────────────────────── */
const adminModule = () => import('@/pages/AdminDashboard')

const AdminShell = lazy(() => adminModule().then(m => ({ default: m.AdminShell })))
const DashboardView = lazy(() => adminModule().then(m => ({ default: m.DashboardView })))
const ClientesView = lazy(() => adminModule().then(m => ({ default: m.ClientesView })))
const CampaignsView = lazy(() => adminModule().then(m => ({ default: m.CampaignsView })))
const OrdersView = lazy(() => adminModule().then(m => ({ default: m.OrdersView })))
const ProductsView = lazy(() => adminModule().then(m => ({ default: m.ProductsView })))
const AgentView = lazy(() => adminModule().then(m => ({ default: m.AgentView })))
const NotificationsView = lazy(() => adminModule().then(m => ({ default: m.NotificationsView })))
const DomainView = lazy(() => adminModule().then(m => ({ default: m.DomainView })))
const FreteView = lazy(() => adminModule().then(m => ({ default: m.FreteView })))
const EstoqueAccessView = lazy(() => adminModule().then(m => ({ default: m.EstoqueAccessView })))
const CouponsView = lazy(() => adminModule().then(m => ({ default: m.CouponsView })))
const ReviewsView = lazy(() => adminModule().then(m => ({ default: m.ReviewsView })))
const PaymentConfigView = lazy(() => adminModule().then(m => ({ default: m.PaymentConfigView })))
const WhatsAppManagerView = lazy(() => adminModule().then(m => ({ default: m.WhatsAppManagerView })))
const SettingsView = lazy(() => adminModule().then(m => ({ default: m.SettingsView })))

const CheckoutPage = lazy(() => import('@/pages/CheckoutPage').then(m => ({ default: m.CheckoutPage })))
const OrderPage = lazy(() => import('@/pages/OrderPage').then(m => ({ default: m.OrderPage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const StockLoginPage = lazy(() => import('@/pages/StockLoginPage').then(m => ({ default: m.StockLoginPage })))
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then(m => ({ default: m.InventoryPage })))
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })))
const AgentPDVPage = lazy(() => import('@/pages/AgentPDVPage').then(m => ({ default: m.AgentPDVPage })))
const AIProvidersPage = lazy(() => import('@/pages/AIProvidersPage').then(m => ({ default: m.AIProvidersPage })))
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then(m => ({ default: m.MessagesPage })))
const FlowBuilderPage = lazy(() => import('@/pages/FlowBuilderPage').then(m => ({ default: m.FlowBuilderPage })))
const LeadSearchPage = lazy(() => import('@/pages/LeadSearchPage').then(m => ({ default: m.LeadSearchPage })))
const LeadsPage = lazy(() => import('@/pages/LeadsPage').then(m => ({ default: m.LeadsPage })))
const DesignPage = lazy(() => import('@/pages/DesignPage').then(m => ({ default: m.DesignPage })))
const BrandImageGeneratorPage = lazy(() => import('@/pages/BrandImageGeneratorPage').then(m => ({ default: m.BrandImageGeneratorPage })))
const CriativosPage = lazy(() => import('@/pages/CriativosPage').then(m => ({ default: m.CriativosPage })))
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
const AdminEmailsPage = lazy(() => import('@/pages/AdminEmailsPage').then(m => ({ default: m.AdminEmailsPage })))
const InstagramPage = lazy(() => import('@/pages/InstagramPage').then(m => ({ default: m.InstagramPage })))
const FacebookPage = lazy(() => import('@/pages/FacebookPage').then(m => ({ default: m.FacebookPage })))
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

/* ── Placeholder for sections not yet built ── */
function ComingSoon({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
        <Icon size={22} className="text-gray-400" strokeWidth={1.5} />
      </div>
      <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 mb-1">{title}</h2>
      <p className="text-[12px] text-gray-500">Em desenvolvimento</p>
    </div>
  )
}

/* ── Wrapper: AdminShell + child content ── */
function AdminPage({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}

/* ── Inline wrappers ── */
const noop = () => {}
function DashboardInline() { return <DashboardView showToast={noop} /> }
function CampaignsInline() {
  const { showToast } = useToast()
  return <CampaignsView showToast={(msg: string, tp?: 'ok' | 'err') => showToast(tp === 'err' ? `Erro: ${msg}` : msg)} />
}
function OrdersInline() { return <OrdersView showToast={noop} /> }

/* ──────────────────────────────────────────────────────────────────────────────
 * ChunkLoadError defensive reload (PWA stability fix)
 *
 * Vite splits routes into chunks like AdminDashboard-{hash}.js. Each build
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

          {/* ── Admin pages (all wrapped in AdminShell sidebar) ── */}
          <Route path="/admin" element={<AdminPage><DashboardInline /></AdminPage>} />
          <Route path="/dashboard" element={<AdminPage><DashboardInline /></AdminPage>} />
          <Route path="/leads" element={<AdminPage><LeadsPage /></AdminPage>} />
          <Route path="/clientes" element={<AdminPage><ClientesView showToast={noop} /></AdminPage>} />
          <Route path="/busca" element={<AdminPage><LeadSearchPage /></AdminPage>} />
          <Route path="/mensagens" element={<AdminPage><MessagesPage /></AdminPage>} />
          <Route path="/notificacoes" element={<AdminPage><NotificationsView showToast={noop} /></AdminPage>} />
          <Route path="/campanhas" element={<AdminPage><CampaignsInline /></AdminPage>} />
          <Route path="/campanha" element={<AdminPage><CampaignsInline /></AdminPage>} />
          <Route path="/automacoes" element={<AdminPage><FlowBuilderPage /></AdminPage>} />
          <Route path="/criativos" element={<AdminPage><CriativosPage /></AdminPage>} />
          <Route path="/criativos/avancado" element={<AdminPage><BrandImageGeneratorPage /></AdminPage>} />
          <Route path="/creative" element={<AdminPage><CriativosPage /></AdminPage>} />
          <Route path="/agente" element={<AdminPage><AgentView showToast={noop} /></AdminPage>} />
          <Route path="/tirar-pedido" element={<AdminPage><AgentPDVPage /></AdminPage>} />
          <Route path="/whatsapp" element={<AdminPage><WhatsAppManagerView showToast={noop} /></AdminPage>} />
          <Route path="/instagram" element={<AdminPage><InstagramPage /></AdminPage>} />
          <Route path="/facebook" element={<AdminPage><FacebookPage /></AdminPage>} />
          <Route path="/produtos" element={<AdminPage><ProductsView showToast={noop} /></AdminPage>} />
          <Route path="/pedidos" element={<AdminPage><OrdersInline /></AdminPage>} />
          <Route path="/estoque" element={<AdminPage><EstoqueAccessView showToast={noop} /></AdminPage>} />
          <Route path="/cupons" element={<AdminPage><CouponsView showToast={noop} /></AdminPage>} />
          <Route path="/avaliacoes" element={<AdminPage><ReviewsView showToast={noop} /></AdminPage>} />
          <Route path="/estoque/app" element={<InventoryPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/design" element={<AdminPage><DesignPage /></AdminPage>} />
          <Route path="/pagamentos" element={<AdminPage><PaymentConfigView showToast={noop} /></AdminPage>} />
          <Route path="/frete" element={<AdminPage><FreteView showToast={noop} /></AdminPage>} />
          <Route path="/dominio" element={<AdminPage><DomainView showToast={noop} /></AdminPage>} />
          <Route path="/configuracoes" element={<AdminPage><SettingsView showToast={noop} /></AdminPage>} />
          <Route path="/provedores-ia" element={<AdminPage><AIProvidersPage /></AdminPage>} />
          <Route path="/emails" element={<AdminPage><AdminEmailsPage /></AdminPage>} />

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
