import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, AlertTriangle, BarChart3,
  RefreshCw, LogOut, Menu, X, Users,
} from 'lucide-react'
import {
  inventoryApi,
  stockApi,
  clearStockAuth,
  getStockBrandRef,
} from '@/lib/api-admin'
import { NotificationBellButton } from '@/components/notifications/NotificationCenter'
import { PushActivationCard } from '@/components/push/PushActivationCard'
import { isStockAppRoute, getSessionAuth, getSessionHeaders } from './stock/auth'
import type { ViewKey, Category } from './stock/types'
import { applyStockPwaBrand } from './stock/pwaBrand'
import { OverviewView } from './stock/views/OverviewView'
import { ProductsView } from './stock/views/ProductsView'
import { MovementsView } from './stock/views/MovementsView'
import { ExpeditionView } from './stock/views/ExpeditionView'
import { AlertsView } from './stock/views/AlertsView'
import { ClientsView } from './stock/views/ClientsView'
import { ReportsView } from './stock/views/ReportsView'
import { resolveStockDeepLink } from './stock/deepLink'

let _toastTimer: ReturnType<typeof setTimeout> | undefined
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    clearTimeout(_toastTimer)
    setMsg({ text, type })
    _toastTimer = setTimeout(() => setMsg(null), 3000)
  }, [])
  return { msg, show }
}

export function InventoryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { msg: toast, show: showToast } = useToast()
  const initialFromUrl = resolveStockDeepLink(
    `${window.location.pathname}${window.location.search}`,
  )
  const [view, setView] = useState<ViewKey>(initialFromUrl?.view || 'overview')
  const [deepProductId, setDeepProductId] = useState<string | undefined>(initialFromUrl?.productId)
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string; primary?: string; secondary?: string }>({})
  const [alertCount, setAlertCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const stockRoute = isStockAppRoute()

  const auth = getSessionAuth()
  useEffect(() => {
    if (auth.token) return
    if (stockRoute) {
      const ref = auth.brandRef || getStockBrandRef() || ''
      navigate(ref ? `/app-estoque/${encodeURIComponent(ref)}` : '/app-estoque', { replace: true })
      return
    }
    navigate('/login', { replace: true })
  }, [auth.token, auth.brandRef, stockRoute, navigate])

  // Query param deep-link: ?view=alerts|products|expedition&product_id=...
  useEffect(() => {
    const qView = searchParams.get('view') || searchParams.get('tab')
    const qProduct = searchParams.get('product_id') || searchParams.get('productId')
    if (!qView && !qProduct) return
    const resolved = resolveStockDeepLink(
      qView ? `?view=${qView}${qProduct ? `&product_id=${qProduct}` : ''}` : `?view=products&product_id=${qProduct}`,
    )
    if (resolved) {
      setView(resolved.view)
      if (resolved.productId) setDeepProductId(resolved.productId)
    }
  }, [searchParams])

  const getHeaders = () => getSessionHeaders()

  function handleNotificationNavigate(path: string) {
    const resolved = resolveStockDeepLink(path)
    if (resolved) {
      setView(resolved.view)
      setSidebarOpen(false)
      if (resolved.productId) setDeepProductId(resolved.productId)
      // Keep URL shareable inside stock app
      if (stockRoute) {
        const next = new URLSearchParams(searchParams)
        next.set('view', resolved.view)
        if (resolved.productId) next.set('product_id', resolved.productId)
        else next.delete('product_id')
        setSearchParams(next, { replace: true })
      }
      return
    }
    // Fallback: external/admin path
    navigate(path.startsWith('/') ? path : `/${path}`)
  }

  // Bootstrap brand + categories (scope-aware)
  useEffect(() => {
    if (!auth.token) return

    if (stockRoute) {
      stockApi.me()
        .then((d) => {
          const b = d.brand || {}
          setBrand({
            name: b.name,
            logo_url: b.logo_url,
            primary: b.primary_color,
            secondary: b.secondary_color,
          })
          applyStockPwaBrand({
            name: b.name,
            logo_url: b.logo_url,
            primary: b.primary_color,
            secondary: b.secondary_color,
          })
          if (b.name) document.title = `${b.name} — Estoque`
        })
        .catch(() => {})
    } else {
      fetch('/api/brands', { headers: getSessionHeaders() })
        .then((r) => r.json())
        .then((d) => {
          const brands = d.brands || []
          const active = d.active_brand_id
          const b = brands.find((x: any) => String(x.id) === String(active)) || brands[0] || {}
          setBrand({
            name: b.name,
            logo_url: b.logo_url,
            primary: b.primary_color,
            secondary: b.secondary_color,
          })
          if (b.name) document.title = `${b.name} — Inventário`
        })
        .catch(() => {})
    }

    inventoryApi.categories().then((d) => {
      const arr = d.categories || d.items || (Array.isArray(d) ? d : [])
      setCategories(arr)
    }).catch(() => {})
  }, [auth.token, stockRoute])

  function logout() {
    if (stockRoute) {
      const ref = getStockBrandRef() || auth.brandRef || ''
      clearStockAuth()
      navigate(ref ? `/app-estoque/${encodeURIComponent(ref)}` : '/app-estoque', { replace: true })
      return
    }
    localStorage.removeItem('lead-system-token')
    localStorage.removeItem('lead-system:active-brand-id')
    navigate('/login', { replace: true })
  }

  async function handleSync() {
    try {
      showToast('Sincronizando...')
      const r = await inventoryApi.sync()
      const n = Number(r?.synced ?? r?.count ?? 0)
      showToast(n > 0 ? `Sincronizado: ${n} produtos` : 'Estoque sincronizado com o catálogo')
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  function switchView(v: ViewKey) {
    setView(v)
    setSidebarOpen(false)
    if (stockRoute) {
      const next = new URLSearchParams(searchParams)
      next.set('view', v)
      setSearchParams(next, { replace: true })
    }
  }

  const navItems: { key: ViewKey; icon: typeof LayoutDashboard; label: string; short: string; badge?: number }[] = [
    { key: 'overview', icon: LayoutDashboard, label: 'Início', short: 'Início' },
    { key: 'products', icon: Package, label: 'Produtos', short: 'Produtos' },
    { key: 'expedition', icon: Truck, label: 'Expedição', short: 'Expedir' },
    { key: 'movements', icon: ArrowLeftRight, label: 'Movimentações', short: 'Mov.' },
    { key: 'alerts', icon: AlertTriangle, label: 'Alertas', short: 'Alertas', badge: alertCount },
    { key: 'clients', icon: Users, label: 'Clientes', short: 'Clientes' },
    { key: 'reports', icon: BarChart3, label: 'Relatórios', short: 'Relat.' },
  ]
  /** Thumb zone: jobs do chão de loja — Início, Produtos, Expedir, Alertas, Clientes */
  const bottomItems = navItems.filter((n) =>
    ['overview', 'products', 'expedition', 'alerts', 'clients'].includes(n.key),
  )

  return (
    <div className="h-screen bg-bg flex flex-col">
      {/* ── Mobile Topbar (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <header className="sticky top-0 z-40 bg-white text-gray-900 flex items-center justify-between px-3 h-14 lg:hidden border-b border-border-light shrink-0 safe-area-top">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="w-11 h-11 grid place-items-center rounded-xl text-gray-700 hover:bg-gray-100 active:scale-95 transition"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gray-900 text-white grid place-items-center text-xs font-semibold">
                {(brand.name || 'E').charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-[14px] font-semibold tracking-tight truncate max-w-[160px]">
              {brand.name || 'Estoque'}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBellButton
              getHeaders={getHeaders}
              appContext={stockRoute ? 'stock' : 'admin'}
              onNavigate={handleNotificationNavigate}
              className="text-gray-500 hover:bg-gray-100"
            />
            <button
              onClick={handleSync}
              aria-label="Sincronizar"
              className="w-11 h-11 grid place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-95 transition"
            >
              <RefreshCw size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={logout}
              aria-label="Sair"
              className="w-11 h-11 grid place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-95 transition"
            >
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile drawer overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-[60] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── Sidebar (desktop fixed + mobile drawer above everything) ── */}
        <aside
          className={`fixed top-0 bottom-0 left-0 w-[280px] sm:w-[260px] bg-white border-r border-border-light flex flex-col transition-transform duration-200 lg:translate-x-0 lg:w-[240px] safe-area-top ${
            sidebarOpen ? 'translate-x-0 z-[70] shadow-2xl lg:shadow-none lg:z-30' : '-translate-x-full lg:translate-x-0 lg:z-30'
          }`}
        >
          {/* Mobile-only close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden absolute top-3 right-3 z-10 w-11 h-11 grid place-items-center rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-95 transition"
          >
            <X size={18} strokeWidth={1.75} />
          </button>

          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border-light shrink-0 lg:pr-4 pr-14">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-900 text-white grid place-items-center text-xs font-semibold">
                {(brand.name || 'E').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[13px] font-semibold text-gray-900 tracking-tight truncate">
              {brand.name || 'Estoque'}
            </span>
          </div>
          <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
            {navItems.map(n => {
              const active = view === n.key
              return (
                <button
                  key={n.key}
                  onClick={() => switchView(n.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 h-11 text-[13px] rounded-xl transition-colors ${
                    active
                      ? 'bg-gray-100 text-gray-900 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <n.icon
                    size={16}
                    strokeWidth={active ? 2 : 1.75}
                    className={active ? 'text-gray-900' : 'text-gray-400'}
                  />
                  <span className="flex-1 text-left truncate">{n.label}</span>
                  {n.badge ? (
                    <span className="bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums">
                      {n.badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
          <div className="p-3 border-t border-border-light shrink-0 space-y-1">
            <button
              onClick={handleSync}
              className="w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
            >
              <RefreshCw size={15} strokeWidth={1.75} className="text-gray-400" />
              <span>Sincronizar catálogo</span>
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
            >
              <LogOut size={15} strokeWidth={1.75} className="text-gray-400" />
              <span>Sair</span>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 lg:ml-[240px] overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-5 pb-24 lg:pb-10 lg:px-8 page-enter">
            <PushActivationCard className="mb-4" />
            {view === 'overview' && (
              <OverviewView
                showToast={showToast}
                onAlertCount={setAlertCount}
                refreshKey={refreshKey}
                onNavigate={switchView}
                stockRoute={stockRoute}
              />
            )}
            {view === 'products' && (
              <ProductsView
                showToast={showToast}
                categories={categories}
                refreshKey={refreshKey}
                onRefresh={() => setRefreshKey((k) => k + 1)}
                stockRoute={stockRoute}
                focusProductId={deepProductId}
                onFocusConsumed={() => setDeepProductId(undefined)}
              />
            )}
            {view === 'movements' && <MovementsView showToast={showToast} />}
            {view === 'expedition' && <ExpeditionView showToast={showToast} />}
            {view === 'alerts' && (
              <AlertsView
                showToast={showToast}
                onAlertCount={setAlertCount}
                onRefresh={() => setRefreshKey((k) => k + 1)}
              />
            )}
            {view === 'clients' && <ClientsView showToast={showToast} />}
            {view === 'reports' && <ReportsView showToast={showToast} />}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border-light flex h-[64px] lg:hidden safe-area-bottom shrink-0">
          {bottomItems.map((n) => {
            const active = view === n.key
            return (
              <button
                key={n.key}
                onClick={() => switchView(n.key)}
                aria-current={active ? 'page' : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] active:scale-[0.96] transition-transform"
              >
                <span className="relative">
                  <n.icon
                    size={20}
                    strokeWidth={active ? 2 : 1.5}
                    className={active ? 'text-gray-900' : 'text-gray-400'}
                  />
                  {n.badge ? (
                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-semibold rounded-full min-w-[14px] h-[14px] grid place-items-center px-0.5 tabular-nums">
                      {n.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-[10px] ${
                    active ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'
                  }`}
                >
                  {n.short}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[76px] lg:bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div
            role="status"
            className={`px-4 py-2.5 rounded-full text-white text-[13px] font-medium shadow-lg pointer-events-auto ${
              toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}
