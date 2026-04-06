import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, AlertTriangle, BarChart3,
  Search, Plus, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, X,
  ChevronLeft, ChevronRight, RefreshCw, Upload, Loader2, LogOut, Menu,
  PackageOpen, Zap, Users, Phone, Mail, MapPin, Tag, Eye, Trash2,
  UserPlus, Filter,
} from 'lucide-react'
import { inventoryApi, stockApi } from '@/lib/api-admin'

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
type ViewKey = 'overview' | 'products' | 'movements' | 'expedition' | 'alerts' | 'reports' | 'clients'

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
    { key: 'clients', icon: Users, label: 'Clientes' },
  ]
  const bottomItems = navItems.filter(n => n.key !== 'expedition' && n.key !== 'reports') // bottom nav items

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Top bar (mobile) ── */}
      <header className="sticky top-0 z-50 bg-slate-900 text-white flex items-center justify-between px-4 h-14 lg:hidden">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1"><Menu size={20} /></button>
          {brand.logo_url && <img src={brand.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover" />}
          <h1 className="text-sm font-bold truncate">{brand.name || 'Inventário'}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} className="bg-white/10 rounded-lg p-2 hover:bg-white/20 transition"><RefreshCw size={14} /></button>
          <button onClick={logout} className="bg-white/10 rounded-lg p-2 hover:bg-white/20 transition"><LogOut size={14} /></button>
        </div>
      </header>

      <div className="flex">
        {/* ── Desktop Sidebar ── */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-border flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
            {brand.logo_url && <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />}
            <span className="font-bold text-sm truncate">{brand.name || 'Inventário'}</span>
          </div>
          <nav className="flex-1 py-2 overflow-y-auto">
            {navItems.map(n => (
              <button key={n.key} onClick={() => switchView(n.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                  view === n.key ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <n.icon size={18} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.badge ? (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{n.badge}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-border flex gap-2">
            <button onClick={handleSync} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition">
              <RefreshCw size={12} /> Sincronizar
            </button>
            <button onClick={logout} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
              <LogOut size={14} />
            </button>
          </div>
        </aside>
        {/* overlay */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* ── Main content ── */}
        <main className="flex-1 max-w-4xl mx-auto px-4 pt-4 pb-20 lg:pb-6 page-enter min-w-0">
          {view === 'overview' && <OverviewView showToast={showToast} onAlertCount={setAlertCount} refreshKey={refreshKey} />}
          {view === 'products' && <ProductsView showToast={showToast} categories={categories} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />}
          {view === 'movements' && <MovementsView showToast={showToast} />}
          {view === 'expedition' && <ExpeditionView showToast={showToast} />}
          {view === 'alerts' && <AlertsView showToast={showToast} onAlertCount={setAlertCount} onRefresh={() => setRefreshKey(k => k + 1)} />}
          {view === 'reports' && <ReportsView showToast={showToast} />}
          {view === 'clients' && <ClientsView showToast={showToast} />}
        </main>
      </div>

      {/* ── Bottom Nav (mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border flex h-15 lg:hidden">
        {bottomItems.map(n => (
          <button key={n.key} onClick={() => switchView(n.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition ${
              view === n.key ? 'text-blue-600 font-bold' : 'text-muted'
            }`}>
            <span className="relative">
              <n.icon size={20} />
              {n.badge ? (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">{n.badge}</span>
              ) : null}
            </span>
            {n.label.split(' ')[0]}
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[300]">
          <div className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          }`}>{toast.text}</div>
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
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Visão Geral</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Produtos" value={num(data?.total_products)} />
        <KpiCard label="Sem Estoque" value={num(data?.out_of_stock)} color="text-red-500" />
        <KpiCard label="Estoque Baixo" value={num(data?.low_stock)} color="text-amber-500" />
        <KpiCard label="Valor Total" value={money(data?.total_value)} color="text-emerald-500" />
        <KpiCard label="Entradas Hoje" value={num(data?.entries_today)} color="text-blue-500" />
        <KpiCard label="Saídas Hoje" value={num(data?.exits_today)} color="text-orange-500" />
        <KpiCard label="Total Unidades" value={num(data?.total_units)} />
        <KpiCard label="Reservado" value={num(data?.total_reserved)} color="text-indigo-500" />
      </div>

      {/* Top Selling */}
      {topSelling.length > 0 && (
        <section>
          <h3 className="text-[15px] font-bold mb-3">Mais Vendidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topSelling.slice(0, 6).map((p: any, i: number) => (
              <div key={i} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
                <span className="text-lg font-bold text-muted w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.product_name || p.name || '–'}</p>
                  <p className="text-xs text-muted">{num(p.total_sold || p.quantity)} vendido(s)</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stale Products */}
      {stale.length > 0 && (
        <section>
          <h3 className="text-[15px] font-bold mb-3">Produtos Parados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stale.slice(0, 6).map((p: any, i: number) => (
              <div key={i} className="bg-white border border-border rounded-xl p-3 text-sm">
                <p className="font-semibold truncate">{p.product_name || p.name || '–'}</p>
                <p className="text-xs text-muted">{num(p.stock_available)} em estoque • {money(p.product_price || p.price)}</p>
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Produtos</h2>
        <button onClick={() => setModal({ type: 'edit' })} className="flex items-center gap-1 text-xs font-semibold bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition">
          <Plus size={14} /> Novo
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="search" placeholder="Buscar produto..." value={search} onChange={e => onSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filters.map(f => (
          <button key={f.key} onClick={() => onFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f.key ? 'bg-blue-500 text-white border-transparent' : 'bg-white text-gray-500 border-border'
            }`}>{f.label}</button>
        ))}
      </div>

      <p className="text-xs text-muted">{total} produto(s)</p>

      {loading ? <Skeleton rows={4} /> : products.length === 0 ? (
        <EmptyState text="Nenhum produto encontrado" />
      ) : (
        <>
          <div className="space-y-2.5">
            {products.map(p => {
              const pid = p.product_id || p.id || ''
              const name = p.product_name || p.name || 'Produto'
              const img = p.product_image || p.image_url || ''
              const sb = stockBadge(p.status)
              return (
                <div key={pid} onClick={() => setModal({ type: 'actions', product: p })}
                  className="bg-white border border-border rounded-xl p-3.5 cursor-pointer hover:border-blue-200 transition">
                  <div className="flex items-start gap-2.5">
                    {img ? <img src={img} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                      : <div className="w-12 h-12 rounded-lg bg-gray-100 grid place-items-center text-gray-400 flex-shrink-0">📦</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {p.product_sku || p.sku ? `SKU: ${p.product_sku || p.sku} • ` : ''}
                        {unitShort(p.product_unit || p.unit)} • {typeLabel(p.product_type)}
                      </p>
                    </div>
                    <span className="font-bold text-sm whitespace-nowrap">{money(p.product_price || p.price)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${sb.cls}`}>
                      {sb.label}: {fmtQty(p.stock_available, p.product_unit || p.unit)}
                    </span>
                    {Number(p.stock_reserved) > 0 && (
                      <span className="text-xs text-amber-600 font-medium">Reserv: {num(p.stock_reserved)}</span>
                    )}
                  </div>
                </div>
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
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Movimentações</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filters.map(f => (
          <button key={f} onClick={() => onFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f ? 'bg-blue-500 text-white border-transparent' : 'bg-white text-gray-500 border-border'
            }`}>{filterLabels[f]}</button>
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
                <div key={i} className="bg-white border border-border rounded-xl p-3 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${mb.cls}`}>
                    <mb.icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.product_name || 'Produto'}</p>
                    <p className="text-xs text-muted">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${mb.cls} mr-1`}>{mb.label}</span>
                      {m.source ? `${m.source} • ` : ''}{dt(m.created_at)}
                    </p>
                    {m.reason && <p className="text-xs text-muted italic mt-0.5">{m.reason}</p>}
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isPos ? '+' : '−'}{num(Math.abs(qty))}
                  </span>
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Expedição</h2>
        <button onClick={() => setModal(true)} className="flex items-center gap-1 text-xs font-semibold bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition">
          <Plus size={14} /> Nova
        </button>
      </div>

      {loading ? <Skeleton rows={4} /> : items.length === 0 ? (
        <EmptyState text="Nenhuma expedição registrada" />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((e, i) => (
              <div key={i} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 grid place-items-center flex-shrink-0"><Truck size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Pedido #{e.order_id}</p>
                  <p className="text-xs text-muted">{dt(e.expedition_date)} • {num(e.items_count)} item(ns) • {num(e.total_units)} un</p>
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
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Alertas ({alerts.length})</h2>
      {alerts.length === 0 ? (
        <EmptyState text="Nenhum alerta no momento ✓" />
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const sev = Number(a.stock_available) <= 0 ? 'critical' : 'warning'
            return (
              <div key={i} className={`bg-white border rounded-xl p-3 flex items-center gap-3 ${
                sev === 'critical' ? 'border-l-[3px] border-l-red-500' : 'border-l-[3px] border-l-amber-500'
              }`}>
                <div className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${
                  sev === 'critical' ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-500'
                }`}>
                  {sev === 'critical' ? <AlertTriangle size={18} /> : <Zap size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.product_name || '–'}</p>
                  <p className="text-xs text-muted">
                    Estoque: {num(a.stock_available)}{a.stock_min ? ` (mín: ${num(a.stock_min)})` : ''}
                  </p>
                </div>
                <button onClick={() => setAddModal({ product_id: a.product_id, product_name: a.product_name } as InventoryProduct)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition whitespace-nowrap">
                  + Repor
                </button>
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
    <div className="space-y-5">
      <h2 className="text-lg font-bold">Relatórios</h2>

      {/* Date filters */}
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">De</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Até</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm" />
        </div>
        <button onClick={loadAll} className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition">
          Filtrar
        </button>
      </div>

      {loading ? <Skeleton rows={6} /> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <KpiCard label="Total Entradas" value={num(ms.total_entries)} color="text-emerald-500" />
            <KpiCard label="Total Saídas" value={num(ms.total_exits)} color="text-red-500" />
            <KpiCard label="Valor Estoque" value={money(sv.total_value)} color="text-blue-500" />
            <KpiCard label="Unidades" value={num(sv.total_units)} />
          </div>

          {/* Top / Least */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topSelling.length > 0 && (
              <section>
                <h3 className="text-sm font-bold mb-2">Mais Vendidos</h3>
                <div className="bg-white border border-border rounded-xl divide-y divide-gray-100">
                  {topSelling.slice(0, 5).map((p: any, i: number) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                      <span className="font-bold text-muted w-5">{i + 1}</span>
                      <span className="flex-1 truncate">{p.product_name || '–'}</span>
                      <span className="font-semibold">{num(p.total_sold || p.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {leastMoving.length > 0 && (
              <section>
                <h3 className="text-sm font-bold mb-2">Menos Movimentados</h3>
                <div className="bg-white border border-border rounded-xl divide-y divide-gray-100">
                  {leastMoving.slice(0, 5).map((p: any, i: number) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{p.product_name || '–'}</span>
                      <span className="font-semibold text-muted">{num(p.total_sold || p.quantity || 0)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Daily chart */}
          {daily.length > 0 && (
            <section>
              <h3 className="text-sm font-bold mb-3">Movimentação Diária (últimos 14 dias)</h3>
              <div className="bg-white border border-border rounded-xl p-4 overflow-x-auto">
                <div className="flex items-end gap-1" style={{ minWidth: daily.length * 40 }}>
                  {daily.slice(-14).map((d: any, i: number) => {
                    const eH = (Number(d.entries || 0) / maxDaily) * 80
                    const xH = (Number(d.exits || 0) / maxDaily) * 80
                    const label = (d.day || '').slice(5) // MM-DD
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 min-w-[30px]">
                        <div className="flex gap-0.5 items-end h-20">
                          <div className="w-3 bg-emerald-400 rounded-t" style={{ height: eH }} title={`Entradas: ${d.entries}`} />
                          <div className="w-3 bg-red-400 rounded-t" style={{ height: xH }} title={`Saídas: ${d.exits}`} />
                        </div>
                        <span className="text-[9px] text-muted mt-1">{label}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" /> Entradas</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-400 rounded-sm" /> Saídas</span>
                </div>
              </div>
            </section>
          )}

          {/* ABC Curve */}
          {abcClassified.length > 0 && (
            <section>
              <h3 className="text-sm font-bold mb-3">Curva ABC</h3>
              <div className="bg-white border border-border rounded-xl divide-y divide-gray-100">
                {abcClassified.slice(0, 20).map((a: any, i: number) => {
                  const cls = a.classification === 'A' ? 'bg-emerald-100 text-emerald-700' : a.classification === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  return (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{a.classification}</span>
                      <span className="flex-1 truncate">{a.product_name || '–'}</span>
                      <span className="font-semibold text-xs">{money(a.stock_value || a.total_value)}</span>
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
/* ══════════════════════════════════════════════
   CLIENTS VIEW
   ══════════════════════════════════════════════ */
const CLIENT_STATUSES: [string, string, string][] = [
  ['new', 'Novo', 'bg-emerald-100 text-emerald-700'],
  ['contacted', 'Contatado', 'bg-blue-100 text-blue-700'],
  ['negotiating', 'Negociando', 'bg-amber-100 text-amber-800'],
  ['converted', 'Convertido', 'bg-violet-100 text-violet-700'],
  ['lost', 'Perdido', 'bg-red-100 text-red-700'],
  ['inactive', 'Inativo', 'bg-gray-100 text-gray-600'],
]
const statusLabel = (s: string) => CLIENT_STATUSES.find(x => x[0] === s) || ['', s, 'bg-gray-100 text-gray-600']

function ClientsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [clients, setClients] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editClient, setEditClient] = useState<any | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)
  const limit = 30

  useEffect(() => { loadClients() }, [page, statusFilter])

  function loadClients() {
    setLoading(true)
    inventoryApi.clients(page, limit, search, statusFilter).then(d => {
      setClients(d.clients || [])
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'error'); setLoading(false) })
  }

  function handleSearch() { setPage(1); loadClients() }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este cliente?')) return
    try {
      await inventoryApi.deleteClient(id)
      showToast('Cliente excluido')
      loadClients()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await inventoryApi.updateClientStatus(id, status)
      showToast('Status atualizado')
      loadClients()
    } catch (e: any) { showToast(e.message, 'error') }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">Clientes</h2>
        <button onClick={() => { setEditClient(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition">
          <UserPlus size={14} /> Novo Cliente
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Buscar nome, telefone, email..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2.5 border border-border rounded-xl text-sm bg-white">
          <option value="">Todos</option>
          {CLIENT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={handleSearch}
          className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
          <Filter size={14} />
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted">{total} cliente{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>

      {loading ? <Skeleton rows={6} /> : clients.length === 0 ? (
        <EmptyBox icon={Users} text="Nenhum cliente encontrado" />
      ) : (
        <div className="space-y-2">
          {clients.map(c => {
            const [, sLabel, sCls] = statusLabel(c.status)
            const tags = Array.isArray(c.tags) ? c.tags : (typeof c.tags === 'string' ? (() => { try { return JSON.parse(c.tags) } catch { return [] } })() : [])
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-border p-3.5 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm truncate">{c.name || 'Sem nome'}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sCls}`}>{sLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                      {c.phone && <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>}
                      {c.city && <span className="flex items-center gap-1"><MapPin size={11} />{c.city}{c.state ? ` - ${c.state}` : ''}</span>}
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {tags.slice(0, 5).map((t: string, i: number) => (
                          <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{t}</span>
                        ))}
                        {tags.length > 5 && <span className="text-[10px] text-muted">+{tags.length - 5}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setDetail(c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Eye size={14} /></button>
                    <button onClick={() => { setEditClient(c); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
                {/* Quick status change */}
                <div className="flex gap-1 mt-2.5 flex-wrap">
                  {CLIENT_STATUSES.filter(([v]) => v !== c.status).slice(0, 4).map(([v, l, cls]) => (
                    <button key={v} onClick={() => handleStatusChange(c.id, v)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls} opacity-60 hover:opacity-100 transition`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-2 rounded-lg bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-xs font-semibold">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-2 rounded-lg bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* Client Detail */}
      {detail && (
        <Sheet onClose={() => setDetail(null)}>
          <ClientDetail client={detail} showToast={showToast} onStatusChange={(s) => {
            handleStatusChange(detail.id, s)
            setDetail({ ...detail, status: s })
          }} />
        </Sheet>
      )}

      {/* Client Form */}
      {showForm && (
        <Sheet onClose={() => setShowForm(false)}>
          <ClientForm client={editClient} showToast={showToast} onSaved={() => {
            setShowForm(false); setEditClient(null); loadClients()
          }} />
        </Sheet>
      )}
    </div>
  )
}

function ClientDetail({ client, showToast, onStatusChange }: { client: any; showToast: (t: string, tp?: 'success' | 'error') => void; onStatusChange: (s: string) => void }) {
  const [, sLabel, sCls] = statusLabel(client.status)
  const tags = Array.isArray(client.tags) ? client.tags : []
  const custom = client.custom_fields && typeof client.custom_fields === 'object' ? client.custom_fields : {}

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg">
          {(client.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold">{client.name}</h2>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sCls}`}>{sLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm">
        {client.phone && <InfoRow icon={<Phone size={14} />} label="Telefone" value={client.phone} />}
        {client.email && <InfoRow icon={<Mail size={14} />} label="Email" value={client.email} />}
        {client.cpf && <InfoRow icon={<Tag size={14} />} label="CPF" value={client.cpf} />}
        {client.city && <InfoRow icon={<MapPin size={14} />} label="Cidade" value={`${client.city}${client.state ? ` - ${client.state}` : ''}`} />}
        {client.address && <InfoRow icon={<MapPin size={14} />} label="Endereço" value={client.address} />}
        {client.zip_code && <InfoRow icon={<Tag size={14} />} label="CEP" value={client.zip_code} />}
        {client.birth_date && <InfoRow icon={<Tag size={14} />} label="Nascimento" value={dt(client.birth_date)} />}
        {client.source && <InfoRow icon={<Tag size={14} />} label="Origem" value={client.source} />}
        {client.lead_score != null && <InfoRow icon={<Tag size={14} />} label="Score" value={String(client.lead_score)} />}
      </div>

      {client.notes && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Observacoes</p>
          <p className="text-sm bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Tags</p>
          <div className="flex gap-1 flex-wrap">
            {tags.map((t: string, i: number) => (
              <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-medium">{t}</span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(custom).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Campos Personalizados</p>
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            {Object.entries(custom).map(([k, v]) => (
              <p key={k}><span className="text-muted">{k}:</span> {String(v ?? '')}</p>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">Alterar Status</p>
        <div className="flex gap-1.5 flex-wrap">
          {CLIENT_STATUSES.map(([v, l, cls]) => (
            <button key={v} onClick={() => onStatusChange(v)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition ${v === client.status ? cls + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted">Criado em {dt(client.created_at)}</p>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-muted w-20 shrink-0">{label}</span>
      <span className="text-sm font-medium truncate">{value}</span>
    </div>
  )
}

function ClientForm({ client, showToast, onSaved }: { client: any | null; showToast: (t: string, tp?: 'success' | 'error') => void; onSaved: () => void }) {
  const [name, setName] = useState(client?.name || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [email, setEmail] = useState(client?.email || '')
  const [cpf, setCpf] = useState(client?.cpf || '')
  const [birthDate, setBirthDate] = useState(client?.birth_date ? String(client.birth_date).slice(0, 10) : '')
  const [address, setAddress] = useState(client?.address || '')
  const [city, setCity] = useState(client?.city || '')
  const [state, setState] = useState(client?.state || '')
  const [zipCode, setZipCode] = useState(client?.zip_code || '')
  const [notes, setNotes] = useState(client?.notes || '')
  const [tags, setTags] = useState((Array.isArray(client?.tags) ? client.tags : []).join(', '))
  const [status, setStatus] = useState(client?.status || 'new')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) { showToast('Nome obrigatorio', 'error'); return }
    setSaving(true)
    const data: Record<string, any> = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      cpf: cpf.trim() || null,
      birth_date: birthDate || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip_code: zipCode.trim() || null,
      notes: notes.trim() || null,
      tags: tags.split(',').map((s: string) => s.trim()).filter(Boolean),
      status,
    }
    try {
      if (client?.id) {
        await inventoryApi.updateClient(client.id, data)
        showToast('Cliente atualizado')
      } else {
        await inventoryApi.createClient(data)
        showToast('Cliente cadastrado')
      }
      onSaved()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{client ? 'Editar Cliente' : 'Novo Cliente'}</h2>

      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Telefone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">CPF</label>
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Nascimento</label>
          <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Endereco</label>
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, numero, complemento"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Cidade</label>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Estado</label>
          <input value={state} onChange={e => setState(e.target.value)} placeholder="UF" maxLength={2}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">CEP</label>
          <input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="00000-000"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Tags (separadas por virgula)</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, recorrente, atacado"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          {CLIENT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Observacoes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anotacoes sobre o cliente..."
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      <button onClick={submit} disabled={saving}
        className="w-full py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition disabled:opacity-50">
        {saving ? 'Salvando...' : client ? 'Salvar Alteracoes' : 'Cadastrar Cliente'}
      </button>
    </div>
  )
}

function EmptyBox({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted">
      <Icon size={36} className="opacity-30 mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

/* ── UI Primitives ── */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/45 flex items-end justify-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+16px)] animate-in slide-in-from-bottom duration-200">
        {children}
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
      <h2 className="text-lg font-bold mb-4">Entrada de Estoque</h2>

      {product ? (
        <p className="text-sm text-muted mb-4">{product.product_name || product.name}</p>
      ) : (
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Produto</label>
          <input type="search" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm mb-2" />
          {search && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-xl divide-y divide-gray-100">
              {filteredProducts.slice(0, 10).map(p => (
                <button key={p.product_id || p.id} onClick={() => { setSelectedPid(p.product_id || p.id || ''); setSearch(p.product_name || p.name || '') }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedPid === (p.product_id || p.id) ? 'bg-blue-50' : ''}`}>
                  {p.product_name || p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['reposicao', 'Reposição'], ['devolucao', 'Devolução'], ['inventario', 'Inventário'], ['correcao', 'Correção']]} />
      <FieldText label="Observação" value={reason} onChange={setReason} placeholder="Opcional" />

      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving || !selectedPid} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : 'Confirmar Entrada'}
        </button>
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
      <h2 className="text-lg font-bold mb-1">Saída de Estoque</h2>
      <p className="text-sm text-muted mb-4">{product.product_name || product.name}</p>
      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['manual', 'Manual'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção']]} />
      <FieldText label="Observação (obrigatória)" value={reason} onChange={setReason} placeholder="Descreva o motivo" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : 'Confirmar Saída'}
        </button>
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
      <h2 className="text-lg font-bold mb-1">Ajuste de Inventário</h2>
      <p className="text-sm text-muted mb-4">{product.product_name || product.name} (atual: {num(current)})</p>
      <FieldNumber label="Nova Quantidade" value={qty} onChange={setQty} min={0} />
      <FieldSelect label="Motivo" value={reason.split(':')[0] || 'inventario'} onChange={v => setReason(v)}
        options={[['inventario', 'Inventário'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção'], ['devolucao', 'Devolução']]} />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : 'Confirmar Ajuste'}
        </button>
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
      <h2 className="text-lg font-bold mb-1">Configurações</h2>
      <p className="text-sm text-muted mb-4">{product.product_name || product.name}</p>
      <FieldNumber label="Estoque Mínimo" value={minStock} onChange={setMinStock} min={0} />
      <FieldNumber label="Preço de Custo R$" value={costPrice} onChange={setCostPrice} min={0} step="0.01" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
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
      <h2 className="text-lg font-bold mb-1">Histórico</h2>
      <p className="text-sm text-muted mb-4">{product.product_name || product.name}</p>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : items.length === 0 ? (
        <p className="text-muted text-sm text-center py-8">Nenhuma movimentação</p>
      ) : (
        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {items.map((m, i) => {
            const mb = movBadge(m.type)
            const qty = Number(m.quantity || 0)
            const isPos = m.type === 'entrada' || m.type === 'liberacao'
            return (
              <div key={i} className="py-2 flex items-start gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${mb.cls} whitespace-nowrap`}>{mb.label}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-muted">{m.source ? `${m.source} • ` : ''}{dt(m.created_at)}</span>
                  {m.reason && <span className="text-xs text-muted italic block">{m.reason}</span>}
                </div>
                <span className={`text-sm font-bold ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isPos ? '+' : '−'}{num(Math.abs(qty))}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Fechar</button>
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
    { type: 'add', label: 'Entrada', icon: ArrowDown, cls: 'text-emerald-600' },
    ...(!isD ? [{ type: 'remove', label: 'Saída', icon: ArrowUp, cls: 'text-red-500' }] : []),
    { type: 'adjust', label: 'Ajuste', icon: Scale, cls: 'text-indigo-500' },
    { type: 'edit', label: 'Editar', icon: Pencil, cls: 'text-blue-500' },
    { type: 'history', label: 'Histórico', icon: History, cls: 'text-gray-600' },
    { type: 'settings', label: 'Configurar', icon: Settings, cls: 'text-gray-600' },
  ]

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-3 mb-4">
        {img ? <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover bg-gray-100" />
          : <div className="w-14 h-14 rounded-xl bg-gray-100 grid place-items-center text-2xl text-gray-300">📦</div>}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold truncate">{name}</h2>
          <div className="flex gap-2 mt-1 text-xs text-muted">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{unitShort(product.product_unit || product.unit)}</span>
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{typeLabel(product.product_type)}</span>
            <span className="font-semibold text-gray-700">{money(product.product_price || product.price)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-[10px] text-muted uppercase">Disponível</p>
          <p className="font-bold text-sm">{fmtQty(product.stock_available, product.product_unit || product.unit)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-[10px] text-muted uppercase">Reservado</p>
          <p className="font-bold text-sm">{num(product.stock_reserved)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-[10px] text-muted uppercase">Mínimo</p>
          <p className="font-bold text-sm">{num(product.stock_min)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {actions.map(a => (
          <button key={a.type} onClick={() => { onClose(); setTimeout(() => onAction(a.type, product), 100) }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
            <a.icon size={20} className={a.cls} />
            <span className="text-xs font-semibold text-gray-600">{a.label}</span>
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
      <h2 className="text-lg font-bold mb-4">Nova Expedição</h2>
      <FieldText label="ID do Pedido" value={orderId} onChange={setOrderId} placeholder="Ex: 12345" />
      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : 'Registrar'}
        </button>
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

  if (loading) return <Sheet onClose={onClose}><div className="flex justify-center py-10"><Loader2 className="animate-spin" size={24} /></div></Sheet>

  const unitOptions: [string, string][] = [
    ['unidade', 'Unidade'], ['kg', 'Kilograma'], ['g', 'Grama'], ['litro', 'Litro'], ['ml', 'Mililitro'],
    ['metro', 'Metro'], ['cm', 'Centímetro'], ['caixa', 'Caixa'], ['pacote', 'Pacote'], ['par', 'Par'], ['digital', 'Digital'],
  ]

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">{isNew ? 'Novo Produto' : 'Editar Produto'}</h2>

      {/* Image */}
      <div className="mb-4">
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={onFileChange} />
        <button onClick={pickImage} className="w-full h-32 bg-gray-50 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-gray-100 transition overflow-hidden">
          {imagePreview ? (
            <img src={imagePreview} alt="" className="w-full h-full object-contain" />
          ) : (
            <>
              <Upload size={24} className="text-gray-400" />
              <span className="text-xs text-muted">Clique para enviar imagem</span>
            </>
          )}
        </button>
      </div>

      <FieldText label="Nome" value={name} onChange={setName} placeholder="Nome do produto" />
      <div className="mt-3">
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Descrição</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>
      <FieldSelect label="Unidade" value={unit} onChange={setUnit} options={unitOptions} />
      <FieldNumber label="Preço R$" value={price} onChange={setPrice} min={0} step="0.01" />
      <FieldNumber label="Preço Promo R$" value={promoPrice} onChange={setPromoPrice} min={0} step="0.01" />
      <FieldSelect label="Categoria" value={category} onChange={setCategory}
        options={[['', 'Nenhuma'], ...categories.map(c => [c.id, c.name] as [string, string])]} />
      <FieldSelect label="Status" value={active ? 'true' : 'false'} onChange={v => setActive(v === 'true')}
        options={[['true', 'Ativo'], ['false', 'Inativo']]} />
      <FieldText label="Destaques (separados por vírgula)" value={features} onChange={setFeatures} placeholder="Ex: sem glúten, orgânico" />

      <div className="flex gap-2 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-50">
          {saving ? 'Salvando...' : isNew ? 'Criar Produto' : 'Salvar'}
        </button>
      </div>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════
   SHARED UI
   ══════════════════════════════════════════════ */

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-3.5">
      <p className="text-[11px] text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-extrabold ${color || ''}`}>{value}</p>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="p-2 rounded-lg bg-white border border-border disabled:opacity-30 hover:bg-gray-50 transition">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-medium text-muted">{page} / {totalPages}</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className="p-2 rounded-lg bg-white border border-border disabled:opacity-30 hover:bg-gray-50 transition">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-12 text-muted"><Package size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm">{text}</p></div>
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(rows)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  )
}

/* ── Form Fields ── */
function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-3">
      <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
    </div>
  )
}
function FieldNumber({ label, value, onChange, min, step }: { label: string; value: string; onChange: (v: string) => void; min?: number; step?: string }) {
  return (
    <div className="mt-3">
      <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} min={min} step={step}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
    </div>
  )
}
function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="mt-3">
      <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
