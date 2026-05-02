import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, AlertTriangle, BarChart3,
  Search, Plus, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, X,
  ChevronLeft, ChevronRight, RefreshCw, Upload, Loader2, LogOut, Menu,
  PackageOpen, Zap,
} from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Input } from '@/components/ui'

/* ── Types ── */
interface InventoryProduct {
  product_id?: string; id?: string; product_name?: string; name?: string
  product_image?: string; image_url?: string; imageUrl?: string; image?: string
  product_unit?: string; unit?: string; product_type?: string
  product_price?: number; price?: number; product_sku?: string; sku?: string
  cost_price?: number; stock_available?: number; stock_current?: number
  stock_reserved?: number; stock_min?: number; status?: string
  promo_price?: number; promoPrice?: number
  description?: string; category?: string; active?: boolean; is_active?: boolean
  features?: string[] | string
}
interface Movement {
  product_id?: string; product_name?: string; quantity?: number
  type?: string; source?: string; reason?: string; created_at?: string
}
interface Expedition { order_id?: string; expedition_date?: string; items_count?: number; total_units?: number }
interface AlertItem { product_id?: string; product_name?: string; alert_type?: string; stock_available?: number; stock_min?: number }
interface Category { id: string; name: string }

/* ── Helpers ── */
const money = (v: number | string | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: number | string | undefined) => Number(v || 0).toLocaleString('pt-BR')
const dt = (v?: string) => { try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return v || '' } }

const unitMap: Record<string, string> = { unidade: 'un', kg: 'kg', g: 'g', litro: 'L', ml: 'ml', metro: 'm', cm: 'cm', caixa: 'cx', pacote: 'pct', par: 'par', digital: '∞' }
const unitShort = (u?: string) => unitMap[(u || 'unidade').toLowerCase()] || 'un'
const isDigital = (u?: string) => (u || '').toLowerCase() === 'digital'
const fmtQty = (v?: number, u?: string) => isDigital(u) ? '∞' : num(v)

function stockBadge(status?: string) {
  const s = (status || 'normal').toLowerCase()
  if (s === 'zerado') return { label: 'Zerado', cls: 'bg-red-100 text-red-700' }
  if (s === 'baixo') return { label: 'Baixo', cls: 'bg-amber-100 text-amber-800' }
  return { label: 'Normal', cls: 'bg-emerald-100 text-emerald-700' }
}
function movBadge(type?: string) {
  const t = (type || '').toLowerCase()
  const map: Record<string, { label: string; cls: string; icon: typeof ArrowDown }> = {
    entrada: { label: 'Entrada', cls: 'bg-emerald-100 text-emerald-700', icon: ArrowDown },
    saida: { label: 'Saída', cls: 'bg-red-100 text-red-700', icon: ArrowUp },
    ajuste: { label: 'Ajuste', cls: 'bg-indigo-100 text-indigo-700', icon: Scale },
    reserva: { label: 'Reserva', cls: 'bg-amber-100 text-amber-800', icon: Package },
    liberacao: { label: 'Liberação', cls: 'bg-emerald-100 text-emerald-700', icon: PackageOpen },
    expedicao: { label: 'Expedição', cls: 'bg-blue-100 text-blue-700', icon: Truck },
  }
  return map[t] || { label: t || '?', cls: 'bg-gray-100 text-gray-600', icon: ArrowLeftRight }
}
const typeLabel = (t?: string) => ({ fisico: 'Físico', digital: 'Digital', servico: 'Serviço' }[(t || '').toLowerCase()] || t || '')

/* ── Toast hook ── */
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

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
type ViewKey = 'overview' | 'products' | 'movements' | 'expedition' | 'alerts' | 'reports'

export function InventoryPage() {
  const navigate = useNavigate()
  const { msg: toast, show: showToast } = useToast()
  const [view, setView] = useState<ViewKey>('overview')
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string; primary?: string; secondary?: string }>({})
  const [alertCount, setAlertCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const token = localStorage.getItem('lead-system-token')
  useEffect(() => { if (!token) navigate('/', { replace: true }) }, [token])

  // Bootstrap
  useEffect(() => {
    // brands
    fetch('/api/brands', { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } })
      .then(r => r.json()).then(d => {
        const brands = d.brands || []
        const active = d.active_brand_id
        const b = brands.find((x: any) => String(x.id) === String(active)) || brands[0] || {}
        setBrand({ name: b.name, logo_url: b.logo_url, primary: b.primary_color, secondary: b.secondary_color })
        if (b.name) document.title = b.name + ' — Inventário'
      }).catch(() => {})
    // categories
    inventoryApi.categories().then(d => {
      const arr = d.categories || d.items || (Array.isArray(d) ? d : [])
      setCategories(arr)
    }).catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('lead-system-token')
    localStorage.removeItem('lead-system:active-brand-id')
    navigate('/', { replace: true })
  }
  async function handleSync() {
    try {
      showToast('Sincronizando...')
      const r = await inventoryApi.sync()
      showToast(`Sincronizado: ${r.synced || 0} produtos`)
      setRefreshKey(k => k + 1)
    } catch (e: any) { showToast(e.message, 'error') }
  }
  function switchView(v: ViewKey) { setView(v); setSidebarOpen(false) }

  const navItems: { key: ViewKey; icon: typeof LayoutDashboard; label: string; badge?: number }[] = [
    { key: 'overview', icon: LayoutDashboard, label: 'Visão Geral' },
    { key: 'products', icon: Package, label: 'Produtos' },
    { key: 'movements', icon: ArrowLeftRight, label: 'Movimentações' },
    { key: 'expedition', icon: Truck, label: 'Expedição' },
    { key: 'alerts', icon: AlertTriangle, label: 'Alertas', badge: alertCount },
    { key: 'reports', icon: BarChart3, label: 'Relatórios' },
  ]
  const bottomItems = navItems.filter(n => n.key !== 'expedition') // 5 bottom nav items

  return (
    <div className="h-screen bg-bg flex flex-col">
      {/* ── Mobile Topbar (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl text-gray-900 flex items-center justify-between px-3 h-14 lg:hidden border-b border-border-light shrink-0 safe-area-top">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="w-9 h-9 grid place-items-center rounded-full text-gray-700 hover:bg-gray-100 active:scale-90 transition"
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
            <button
              onClick={handleSync}
              aria-label="Sincronizar"
              className="w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition"
            >
              <RefreshCw size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={logout}
              aria-label="Sair"
              className="w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition"
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
            className="lg:hidden absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-90 transition"
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
                  className={`w-full flex items-center gap-3 px-3 h-9 text-[13px] rounded-lg transition-colors ${
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
              className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
            >
              <RefreshCw size={15} strokeWidth={1.75} className="text-gray-400" />
              <span>Sincronizar</span>
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
            >
              <LogOut size={15} strokeWidth={1.75} className="text-gray-400" />
              <span>Sair</span>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 lg:ml-[240px] overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 pt-5 pb-24 lg:pb-10 lg:px-8 page-enter">
            {view === 'overview' && <OverviewView showToast={showToast} onAlertCount={setAlertCount} refreshKey={refreshKey} />}
            {view === 'products' && <ProductsView showToast={showToast} categories={categories} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />}
            {view === 'movements' && <MovementsView showToast={showToast} />}
            {view === 'expedition' && <ExpeditionView showToast={showToast} />}
            {view === 'alerts' && <AlertsView showToast={showToast} onAlertCount={setAlertCount} onRefresh={() => setRefreshKey(k => k + 1)} />}
            {view === 'reports' && <ReportsView showToast={showToast} />}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-border-light flex h-[60px] lg:hidden safe-area-bottom shrink-0">
          {bottomItems.map(n => {
            const active = view === n.key
            return (
              <button
                key={n.key}
                onClick={() => switchView(n.key)}
                aria-current={active ? 'page' : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-1 active:scale-[0.96] transition-transform"
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
                  className={`text-[10px] tracking-wide ${
                    active ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'
                  }`}
                >
                  {n.label.split(' ')[0]}
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

/* ══════════════════════════════════════════════
   OVERVIEW VIEW
   ══════════════════════════════════════════════ */
function OverviewView({ showToast, onAlertCount, refreshKey }: { showToast: (t: string, tp?: 'success' | 'error') => void; onAlertCount: (n: number) => void; refreshKey: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      inventoryApi.overview().catch(() => ({})),
      inventoryApi.alerts().catch(() => ({ alerts: [] })),
    ]).then(([ov, al]) => {
      setData(ov)
      const alerts = Array.isArray(al.alerts) ? al.alerts : []
      onAlertCount(alerts.length)
      setLoading(false)
    })
  }, [refreshKey])

  if (loading) return <Skeleton rows={6} />

  const topSelling: any[] = Array.isArray(data?.top_selling) ? data.top_selling : []
  const stale: any[] = Array.isArray(data?.stale_products) ? data.stale_products : []

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Visão Geral</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">Resumo do inventário e movimentações</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Produtos" value={num(data?.total_products)} />
        <KpiCard label="Sem Estoque" value={num(data?.out_of_stock)} color="text-red-600" />
        <KpiCard label="Estoque Baixo" value={num(data?.low_stock)} color="text-amber-600" />
        <KpiCard label="Valor Total" value={money(data?.total_value)} color="text-emerald-600" />
        <KpiCard label="Entradas Hoje" value={num(data?.entries_today)} />
        <KpiCard label="Saídas Hoje" value={num(data?.exits_today)} />
        <KpiCard label="Total Unidades" value={num(data?.total_units)} />
        <KpiCard label="Reservado" value={num(data?.total_reserved)} />
      </div>

      {/* Top Selling */}
      {topSelling.length > 0 && (
        <section>
          <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Mais vendidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topSelling.slice(0, 6).map((p: any, i: number) => (
              <div key={i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-gray-100 grid place-items-center text-[12px] font-semibold text-gray-600 tabular-nums shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 truncate">{p.product_name || p.name || '–'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{num(p.total_sold || p.quantity)} vendido(s)</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stale Products */}
      {stale.length > 0 && (
        <section>
          <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Produtos parados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stale.slice(0, 6).map((p: any, i: number) => (
              <div key={i} className="bg-white border border-border-light rounded-2xl p-3.5">
                <p className="text-[13px] font-medium text-gray-900 truncate">{p.product_name || p.name || '–'}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{num(p.stock_available)} em estoque · {money(p.product_price || p.price)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   PRODUCTS VIEW
   ══════════════════════════════════════════════ */
function ProductsView({ showToast, categories, refreshKey, onRefresh }: {
  showToast: (t: string, tp?: 'success' | 'error') => void; categories: Category[]; refreshKey: number; onRefresh: () => void
}) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: string; product?: InventoryProduct } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const limit = 50

  const load = useCallback((pg: number, q?: string, f?: string) => {
    setLoading(true)
    inventoryApi.products(pg, limit, q ?? search, f ?? filter)
      .then(d => {
        setProducts(Array.isArray(d.items) ? d.items : [])
        setTotal(d.total || 0)
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [search, filter])

  useEffect(() => { load(1) }, [refreshKey])

  function onSearch(val: string) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load(1, val, filter) }, 350)
  }
  function onFilter(f: string) {
    setFilter(f); setPage(1); load(1, search, f)
  }
  function changePage(p: number) { setPage(p); load(p) }

  const filters = [
    { key: '', label: 'Todos' },
    { key: 'normal', label: 'Normal' },
    { key: 'baixo', label: 'Baixo' },
    { key: 'zerado', label: 'Zerado' },
  ]
  const totalPages = Math.ceil(total / limit)

  function afterAction() { load(page); onRefresh() }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Produtos</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{total} produto{total === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={() => setModal({ type: 'edit' })} iconLeft={<Plus size={15} strokeWidth={2} />}>
          Novo
        </Button>
      </header>

      {/* Search */}
      <div className="relative">
        <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar produto"
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-9 rounded-full border-0 bg-gray-100 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition ${
              filter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton rows={4} /> : products.length === 0 ? (
        <EmptyState text="Nenhum produto encontrado" />
      ) : (
        <>
          <div className="space-y-2">
            {products.map(p => {
              const pid = p.product_id || p.id || ''
              const name = p.product_name || p.name || 'Produto'
              const img = p.product_image || p.image_url || ''
              const sb = stockBadge(p.status)
              return (
                <button
                  key={pid}
                  onClick={() => setModal({ type: 'actions', product: p })}
                  className="w-full text-left bg-white border border-border-light rounded-2xl p-3.5 hover:border-gray-300 active:scale-[0.99] transition"
                >
                  <div className="flex items-start gap-3">
                    {img ? (
                      <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 grid place-items-center text-gray-400 shrink-0">
                        <Package size={18} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {p.product_sku || p.sku ? `SKU: ${p.product_sku || p.sku} · ` : ''}
                        {unitShort(p.product_unit || p.unit)} · {typeLabel(p.product_type)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${sb.cls}`}>
                          {sb.label} · {fmtQty(p.stock_available, p.product_unit || p.unit)}
                        </span>
                        {Number(p.stock_reserved) > 0 && (
                          <span className="text-[11px] text-amber-700 font-medium">Reserv {num(p.stock_reserved)}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                      {money(p.product_price || p.price)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}

      {/* Modals */}
      {modal?.type === 'actions' && modal.product && (
        <ProductActionsModal product={modal.product} onClose={() => setModal(null)}
          onAction={(type, prod) => setModal({ type, product: prod })}
          showToast={showToast} />
      )}
      {modal?.type === 'add' && <AddStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'remove' && modal.product && <RemoveStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'adjust' && modal.product && <AdjustStockModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'settings' && modal.product && <SettingsModal product={modal.product} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
      {modal?.type === 'history' && modal.product && <HistoryModal product={modal.product} onClose={() => setModal(null)} showToast={showToast} />}
      {modal?.type === 'edit' && <EditProductModal product={modal.product} categories={categories} onClose={() => setModal(null)} onDone={afterAction} showToast={showToast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════
   MOVEMENTS VIEW
   ══════════════════════════════════════════════ */
function MovementsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [items, setItems] = useState<Movement[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 50

  const load = useCallback((pg: number, f?: string) => {
    setLoading(true)
    inventoryApi.movements(pg, limit, f ?? filter)
      .then(d => { setItems(Array.isArray(d.items) ? d.items : []); setTotal(d.total || 0) })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => { load(1) }, [])

  function onFilter(f: string) { setFilter(f); setPage(1); load(1, f) }
  function changePage(p: number) { setPage(p); load(p) }

  const filters = ['', 'entrada', 'saida', 'ajuste', 'reserva', 'expedicao']
  const filterLabels: Record<string, string> = { '': 'Todas', entrada: 'Entradas', saida: 'Saídas', ajuste: 'Ajustes', reserva: 'Reservas', expedicao: 'Expedição' }
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Movimentações</h2>
        <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{total} registro{total === 1 ? '' : 's'}</p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition ${
              filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {loading ? <Skeleton rows={5} /> : items.length === 0 ? (
        <EmptyState text="Nenhuma movimentação registrada" />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((m, i) => {
              const mb = movBadge(m.type)
              const qty = Number(m.quantity || 0)
              const isPos = m.type === 'entrada' || m.type === 'liberacao'
              return (
                <div key={i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${mb.cls}`}>
                    <mb.icon size={16} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-gray-900 truncate flex-1">{m.product_name || 'Produto'}</p>
                      <span className={`text-[14px] font-semibold whitespace-nowrap tabular-nums ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isPos ? '+' : '−'}{num(Math.abs(qty))}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {mb.label}{m.source ? ` · ${m.source}` : ''} · {dt(m.created_at)}
                    </p>
                    {m.reason && <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-1">{m.reason}</p>}
                  </div>
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   EXPEDITION VIEW
   ══════════════════════════════════════════════ */
function ExpeditionView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [items, setItems] = useState<Expedition[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const limit = 50

  const load = useCallback((pg: number) => {
    setLoading(true)
    inventoryApi.expedition(pg, limit)
      .then(d => { setItems(Array.isArray(d.items) ? d.items : []); setTotal(d.total || 0) })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(1) }, [])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Expedição</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{total} expediç{total === 1 ? 'ão' : 'ões'}</p>
        </div>
        <Button onClick={() => setModal(true)} iconLeft={<Plus size={15} strokeWidth={2} />}>
          Nova
        </Button>
      </header>

      {loading ? <Skeleton rows={4} /> : items.length === 0 ? (
        <EmptyState text="Nenhuma expedição registrada" />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((e, i) => (
              <div key={i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 grid place-items-center shrink-0">
                  <Truck size={16} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-gray-900">Pedido #{e.order_id}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{dt(e.expedition_date)} · {num(e.items_count)} item(ns) · {num(e.total_units)} un</p>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={(p) => { setPage(p); load(p) }} />
        </>
      )}

      {modal && <ExpeditionModal onClose={() => setModal(false)} onDone={() => { setModal(false); load(1) }} showToast={showToast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════
   ALERTS VIEW
   ══════════════════════════════════════════════ */
function AlertsView({ showToast, onAlertCount, onRefresh }: {
  showToast: (t: string, tp?: 'success' | 'error') => void; onAlertCount: (n: number) => void; onRefresh: () => void
}) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState<InventoryProduct | null>(null)

  useEffect(() => {
    inventoryApi.alerts()
      .then(d => {
        const arr = Array.isArray(d.alerts) ? d.alerts : []
        setAlerts(arr)
        onAlertCount(arr.length)
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Alertas</h2>
        <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{alerts.length} aler{alerts.length === 1 ? 'ta' : 'tas'}</p>
      </header>

      {alerts.length === 0 ? (
        <EmptyState text="Nenhum alerta no momento" />
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const sev = Number(a.stock_available) <= 0 ? 'critical' : 'warning'
            return (
              <div
                key={i}
                className={`bg-white border-l-[3px] border-y border-r border-border-light rounded-r-2xl p-3.5 flex items-center gap-3 ${
                  sev === 'critical' ? 'border-l-red-500' : 'border-l-amber-500'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                    sev === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {sev === 'critical' ? <AlertTriangle size={18} strokeWidth={1.75} /> : <Zap size={18} strokeWidth={1.75} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-gray-900 truncate">{a.product_name || '–'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Estoque: <span className="tabular-nums">{num(a.stock_available)}</span>
                    {a.stock_min ? <> · Mín: <span className="tabular-nums">{num(a.stock_min)}</span></> : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddModal({ product_id: a.product_id, product_name: a.product_name } as InventoryProduct)}
                  iconLeft={<Plus size={14} strokeWidth={2} />}
                >
                  Repor
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {addModal && <AddStockModal product={addModal} onClose={() => setAddModal(null)} onDone={() => { setAddModal(null); onRefresh(); window.location.reload() }} showToast={showToast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════
   REPORTS VIEW
   ══════════════════════════════════════════════ */
function ReportsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(thirtyAgo)
  const [dateTo, setDateTo] = useState(today)
  const [report, setReport] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  function loadAll() {
    setLoading(true)
    Promise.all([
      inventoryApi.reports(dateFrom, dateTo).catch(() => ({})),
      inventoryApi.analytics().catch(() => ({})),
    ]).then(([rpt, anl]) => {
      setReport(rpt)
      setAnalytics(anl)
      setLoading(false)
    })
  }

  const ms = report?.movement_summary || {}
  const sv = report?.stock_value || {}
  const topSelling: any[] = Array.isArray(report?.top_selling) ? report.top_selling : []
  const leastMoving: any[] = Array.isArray(report?.least_moving) ? report.least_moving : []
  const daily: any[] = Array.isArray(analytics?.daily_summary) ? analytics.daily_summary : []
  const abc: any[] = Array.isArray(analytics?.abc_curve) ? analytics.abc_curve : []

  // ABC classification
  const totalAbcValue = abc.reduce((s, a) => s + Number(a.stock_value || a.total_value || 0), 0) || 1
  let cumPct = 0
  const abcClassified = abc.map(a => {
    const val = Number(a.stock_value || a.total_value || 0)
    cumPct += (val / totalAbcValue) * 100
    return { ...a, classification: cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C' }
  })

  // Daily chart
  const maxDaily = Math.max(...daily.map(d => Math.max(Number(d.entries || 0), Number(d.exits || 0))), 1)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Relatórios</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">Análise de movimentações e estoque</p>
      </header>

      {/* Date filters */}
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-11 px-3.5 rounded-xl border border-border bg-white text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-11 px-3.5 rounded-xl border border-border bg-white text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150"
          />
        </div>
        <Button onClick={loadAll}>Filtrar</Button>
      </div>

      {loading ? <Skeleton rows={6} /> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <KpiCard label="Total Entradas" value={num(ms.total_entries)} color="text-emerald-600" />
            <KpiCard label="Total Saídas" value={num(ms.total_exits)} color="text-red-600" />
            <KpiCard label="Valor Estoque" value={money(sv.total_value)} />
            <KpiCard label="Unidades" value={num(sv.total_units)} />
          </div>

          {/* Top / Least */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topSelling.length > 0 && (
              <section>
                <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Mais vendidos</h3>
                <div className="bg-white border border-border-light rounded-2xl divide-y divide-border-light overflow-hidden">
                  {topSelling.slice(0, 5).map((p: any, i: number) => (
                    <div key={i} className="px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]">
                      <span className="w-5 text-center font-semibold text-gray-400 tabular-nums shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate text-gray-900">{p.product_name || '–'}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{num(p.total_sold || p.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {leastMoving.length > 0 && (
              <section>
                <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Menos movimentados</h3>
                <div className="bg-white border border-border-light rounded-2xl divide-y divide-border-light overflow-hidden">
                  {leastMoving.slice(0, 5).map((p: any, i: number) => (
                    <div key={i} className="px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]">
                      <span className="flex-1 truncate text-gray-900">{p.product_name || '–'}</span>
                      <span className="font-semibold text-gray-500 tabular-nums">{num(p.total_sold || p.quantity || 0)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Daily chart */}
          {daily.length > 0 && (
            <section>
              <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Movimentação diária</h3>
              <div className="bg-white border border-border-light rounded-2xl p-4 overflow-x-auto">
                <div className="flex items-end gap-1.5" style={{ minWidth: daily.length * 36 }}>
                  {daily.slice(-14).map((d: any, i: number) => {
                    const eH = (Number(d.entries || 0) / maxDaily) * 80
                    const xH = (Number(d.exits || 0) / maxDaily) * 80
                    const label = (d.day || '').slice(5)
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 min-w-[28px]">
                        <div className="flex gap-0.5 items-end h-20">
                          <div className="w-2.5 bg-emerald-400 rounded-t-sm" style={{ height: eH }} title={`Entradas: ${d.entries}`} />
                          <div className="w-2.5 bg-red-400 rounded-t-sm" style={{ height: xH }} title={`Saídas: ${d.exits}`} />
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1.5 tabular-nums">{label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-400 rounded-sm" /> Entradas</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-400 rounded-sm" /> Saídas</span>
                </div>
              </div>
            </section>
          )}

          {/* ABC Curve */}
          {abcClassified.length > 0 && (
            <section>
              <h3 className="text-[15px] font-bold tracking-tight text-gray-900 mb-3">Curva ABC</h3>
              <div className="bg-white border border-border-light rounded-2xl divide-y divide-border-light overflow-hidden">
                {abcClassified.slice(0, 20).map((a: any, i: number) => {
                  const cls = a.classification === 'A'
                    ? 'bg-emerald-50 text-emerald-700'
                    : a.classification === 'B'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  return (
                    <div key={i} className="px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls} tabular-nums`}>{a.classification}</span>
                      <span className="flex-1 truncate text-gray-900">{a.product_name || '–'}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{money(a.stock_value || a.total_value)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════ */

/* ── Sheet wrapper ── */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center sticky top-0 bg-white z-10">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── Add Stock ── */
function AddStockModal({ product, onClose, onDone, showToast }: {
  product?: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const [allProducts, setAllProducts] = useState<InventoryProduct[]>([])
  const [selectedPid, setSelectedPid] = useState(product?.product_id || product?.id || '')
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('reposicao')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!product) {
      inventoryApi.products(1, 500).then(d => setAllProducts(Array.isArray(d.items) ? d.items : [])).catch(() => {})
    }
  }, [])

  const filteredProducts = allProducts.filter(p =>
    (p.product_name || p.name || '').toLowerCase().includes(search.toLowerCase())
  )

  async function submit() {
    if (!selectedPid || !qty) return
    setSaving(true)
    try {
      await inventoryApi.addStock(selectedPid, { quantity: Number(qty), source, reason })
      showToast('Entrada registrada')
      onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Entrada de estoque</h2>

      {product ? (
        <p className="text-[13px] text-gray-500 mb-4 mt-1">{product.product_name || product.name}</p>
      ) : (
        <div className="mb-4 mt-4">
          <Input
            label="Produto"
            type="search"
            placeholder="Buscar produto"
            value={search}
            onChange={e => setSearch(e.target.value)}
            iconLeft={<Search size={14} strokeWidth={1.75} />}
          />
          {search && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-border-light rounded-xl divide-y divide-border-light bg-white">
              {filteredProducts.slice(0, 10).map(p => {
                const id = p.product_id || p.id
                return (
                  <button
                    key={id}
                    onClick={() => { setSelectedPid(id || ''); setSearch(p.product_name || p.name || '') }}
                    className={`w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-gray-50 transition ${
                      selectedPid === id ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {p.product_name || p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['reposicao', 'Reposição'], ['devolucao', 'Devolução'], ['inventario', 'Inventário'], ['correcao', 'Correção']]} />
      <FieldText label="Observação" value={reason} onChange={setReason} placeholder="Opcional" />

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} disabled={!selectedPid} fullWidth>
          {saving ? 'Salvando' : 'Confirmar entrada'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── Remove Stock ── */
function RemoveStockModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('manual')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!reason) { showToast('Informe a observação', 'error'); return }
    setSaving(true)
    try {
      await inventoryApi.removeStock(pid, { quantity: Number(qty), source, reason })
      showToast('Saída registrada'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Saída de estoque</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name}</p>
      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['manual', 'Manual'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção']]} />
      <FieldText label="Observação (obrigatória)" value={reason} onChange={setReason} placeholder="Descreva o motivo" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button variant="danger" onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Confirmar saída'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── Adjust Stock ── */
function AdjustStockModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const current = product.stock_available ?? product.stock_current ?? 0
  const [qty, setQty] = useState(String(current))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.adjustStock(pid, { new_quantity: Number(qty), reason })
      showToast('Ajuste registrado'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Ajuste de inventário</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name} · atual {num(current)}</p>
      <FieldNumber label="Nova quantidade" value={qty} onChange={setQty} min={0} />
      <FieldSelect label="Motivo" value={reason.split(':')[0] || 'inventario'} onChange={v => setReason(v)}
        options={[['inventario', 'Inventário'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção'], ['devolucao', 'Devolução']]} />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Confirmar ajuste'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── Settings ── */
function SettingsModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [minStock, setMinStock] = useState(String(product.stock_min || 5))
  const [costPrice, setCostPrice] = useState(String(product.cost_price || 0))
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.updateSettings(pid, { stock_min: Number(minStock), cost_price: Number(costPrice) })
      showToast('Configuração salva'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Configurações</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name}</p>
      <FieldNumber label="Estoque mínimo" value={minStock} onChange={setMinStock} min={0} />
      <FieldNumber label="Preço de custo (R$)" value={costPrice} onChange={setCostPrice} min={0} step="0.01" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Salvar'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── History ── */
function HistoryModal({ product, onClose, showToast }: {
  product: InventoryProduct; onClose: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [items, setItems] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryApi.productHistory(pid)
      .then(d => setItems(Array.isArray(d.history) ? d.history : []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [pid])

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Histórico</h2>
      <p className="text-[13px] text-gray-500 mt-1 mb-4">{product.product_name || product.name}</p>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={20} />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-gray-500 text-center py-8">Nenhuma movimentação</p>
      ) : (
        <div className="divide-y divide-border-light max-h-80 overflow-y-auto -mx-1 px-1">
          {items.map((m, i) => {
            const mb = movBadge(m.type)
            const qty = Number(m.quantity || 0)
            const isPos = m.type === 'entrada' || m.type === 'liberacao'
            return (
              <div key={i} className="py-2.5 flex items-start gap-2.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${mb.cls} whitespace-nowrap shrink-0`}>{mb.label}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-gray-500">{m.source ? `${m.source} · ` : ''}{dt(m.created_at)}</span>
                  {m.reason && <span className="text-[11px] text-gray-500 italic block line-clamp-1">{m.reason}</span>}
                </div>
                <span className={`text-[14px] font-semibold tabular-nums shrink-0 ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isPos ? '+' : '−'}{num(Math.abs(qty))}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <Button variant="secondary" onClick={onClose} fullWidth className="mt-5">
        Fechar
      </Button>
    </Sheet>
  )
}

/* ── Product Actions ── */
function ProductActionsModal({ product, onClose, onAction, showToast }: {
  product: InventoryProduct; onClose: () => void
  onAction: (type: string, prod: InventoryProduct) => void
  showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const img = product.product_image || product.image_url || ''
  const name = product.product_name || product.name || 'Produto'
  const isD = isDigital(product.product_unit || product.unit)

  const actions = [
    { type: 'add', label: 'Entrada', Icon: ArrowDown, cls: 'bg-emerald-50 text-emerald-700' },
    ...(!isD ? [{ type: 'remove', label: 'Saída', Icon: ArrowUp, cls: 'bg-red-50 text-red-700' }] : []),
    { type: 'adjust', label: 'Ajuste', Icon: Scale, cls: 'bg-indigo-50 text-indigo-700' },
    { type: 'edit', label: 'Editar', Icon: Pencil, cls: 'bg-blue-50 text-blue-700' },
    { type: 'history', label: 'Histórico', Icon: History, cls: 'bg-gray-100 text-gray-700' },
    { type: 'settings', label: 'Configurar', Icon: Settings, cls: 'bg-gray-100 text-gray-700' },
  ]

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-3">
        {img ? (
          <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-gray-100 grid place-items-center text-gray-400 shrink-0">
            <Package size={22} strokeWidth={1.5} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-gray-900 truncate">{name}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-medium">
              {unitShort(product.product_unit || product.unit)}
            </span>
            <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-medium">
              {typeLabel(product.product_type)}
            </span>
            <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
              {money(product.product_price || product.price)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Disponível</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{fmtQty(product.stock_available, product.product_unit || product.unit)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reservado</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{num(product.stock_reserved)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Mínimo</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{num(product.stock_min)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-5">
        {actions.map(a => (
          <button
            key={a.type}
            onClick={() => { onClose(); setTimeout(() => onAction(a.type, product), 100) }}
            className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-white border border-border-light hover:border-gray-300 active:scale-[0.97] transition"
          >
            <span className={`w-10 h-10 rounded-xl grid place-items-center ${a.cls}`}>
              <a.Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-medium text-gray-700">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/* ── Expedition Modal ── */
function ExpeditionModal({ onClose, onDone, showToast }: {
  onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const [orderId, setOrderId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!orderId.trim()) { showToast('Informe o ID do pedido', 'error'); return }
    setSaving(true)
    try {
      await inventoryApi.createExpedition(orderId.trim())
      showToast('Expedição registrada'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Nova expedição</h2>
      <FieldText label="ID do pedido" value={orderId} onChange={setOrderId} placeholder="Ex: 12345" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Registrar'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── Edit Product ── */
function EditProductModal({ product, categories, onClose, onDone, showToast }: {
  product?: InventoryProduct; categories: Category[]; onClose: () => void; onDone: () => void
  showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const isNew = !product
  const pid = product?.product_id || product?.id || ''
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(!!pid)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('unidade')
  const [price, setPrice] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [category, setCategory] = useState('')
  const [active, setActive] = useState(true)
  const [features, setFeatures] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pid) return
    fetch(`/api/products/${pid}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lead-system-token')}`, 'Content-Type': 'application/json' },
    }).then(r => r.json()).then(d => {
      const p = d.product || d
      setName(p.name || '')
      setDescription(p.description || '')
      setUnit(p.unit || 'unidade')
      setPrice(String(p.price || ''))
      setPromoPrice(String(p.promoPrice || p.promo_price || ''))
      setCategory(String(p.category || ''))
      setActive(p.active !== undefined ? p.active : p.is_active !== false)
      setFeatures(Array.isArray(p.features) ? p.features.join(', ') : (p.features || ''))
      setImagePreview(p.image_url || p.imageUrl || p.image || '')
      setDetail(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pid])

  function pickImage() { fileRef.current?.click() }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  async function submit() {
    if (!name.trim()) { showToast('Nome obrigatório', 'error'); return }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        unit,
        price: Number(price) || 0,
        promoPrice: Number(promoPrice) || 0,
        category,
        active,
        features: features.split(',').map(f => f.trim()).filter(Boolean),
      }
      const token = localStorage.getItem('lead-system-token') || ''
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      if (brandId) headers['x-brand-id'] = brandId

      let savedId = pid
      if (isNew) {
        const res = await fetch('/api/products', { method: 'POST', headers, body: JSON.stringify(body) }).then(r => r.json())
        savedId = res.product?.id || res.id
      } else {
        await fetch(`/api/products/${pid}`, { method: 'PUT', headers, body: JSON.stringify(body) })
      }

      // Upload image
      if (imageFile && savedId) {
        const fd = new FormData()
        fd.append('image', imageFile)
        const imgHeaders: Record<string, string> = { 'Authorization': `Bearer ${token}` }
        if (brandId) imgHeaders['x-brand-id'] = brandId
        await fetch(`/api/products/${savedId}/image`, { method: 'POST', headers: imgHeaders, body: fd })
      }

      showToast(isNew ? 'Produto criado' : 'Produto salvo')
      onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <Sheet onClose={onClose}><div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={20} /></div></Sheet>

  const unitOptions: [string, string][] = [
    ['unidade', 'Unidade'], ['kg', 'Kilograma'], ['g', 'Grama'], ['litro', 'Litro'], ['ml', 'Mililitro'],
    ['metro', 'Metro'], ['cm', 'Centímetro'], ['caixa', 'Caixa'], ['pacote', 'Pacote'], ['par', 'Par'], ['digital', 'Digital'],
  ]

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900 mb-4">
        {isNew ? 'Novo produto' : 'Editar produto'}
      </h2>

      {/* Image */}
      <div className="mb-4">
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={onFileChange} />
        <button
          onClick={pickImage}
          className="w-full h-32 bg-gray-50 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:bg-gray-100 hover:border-gray-300 transition overflow-hidden"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="" className="w-full h-full object-contain" />
          ) : (
            <>
              <Upload size={20} strokeWidth={1.5} className="text-gray-400" />
              <span className="text-[12px] text-gray-500">Clique para enviar imagem</span>
            </>
          )}
        </button>
      </div>

      <FieldText label="Nome" value={name} onChange={setName} placeholder="Nome do produto" />
      <div className="mt-3">
        <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">Descrição</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150"
        />
      </div>
      <FieldSelect label="Unidade" value={unit} onChange={setUnit} options={unitOptions} />
      <FieldNumber label="Preço (R$)" value={price} onChange={setPrice} min={0} step="0.01" />
      <FieldNumber label="Preço promo (R$)" value={promoPrice} onChange={setPromoPrice} min={0} step="0.01" />
      <FieldSelect label="Categoria" value={category} onChange={setCategory}
        options={[['', 'Nenhuma'], ...categories.map(c => [c.id, c.name] as [string, string])]} />
      <FieldSelect label="Status" value={active ? 'true' : 'false'} onChange={v => setActive(v === 'true')}
        options={[['true', 'Ativo'], ['false', 'Inativo']]} />
      <FieldText label="Destaques (separados por vírgula)" value={features} onChange={setFeatures} placeholder="Ex: sem glúten, orgânico" />

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : isNew ? 'Criar produto' : 'Salvar'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   SHARED UI
   ══════════════════════════════════════════════ */

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-border-light rounded-2xl p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <p className={`text-[26px] font-bold tracking-tight tabular-nums ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        aria-label="Página anterior"
        className="w-9 h-9 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition">
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <span className="text-[13px] text-gray-600 tabular-nums px-2">{page} / {totalPages}</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        aria-label="Próxima página"
        className="w-9 h-9 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition">
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
        <Package size={22} className="text-gray-400" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-medium text-gray-900">{text}</p>
    </div>
  )
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5">
      {[...Array(rows)].map((_, i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}
    </div>
  )
}

/* ── Form Fields ── */
function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-3">
      <Input
        label={label}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
function FieldNumber({ label, value, onChange, min, step }: { label: string; value: string; onChange: (v: string) => void; min?: number; step?: string }) {
  return (
    <div className="mt-3">
      <Input
        label={label}
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        min={min}
        step={step}
      />
    </div>
  )
}
function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="mt-3">
      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-11 px-3.5 rounded-xl border border-border bg-white text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
