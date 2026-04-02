import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, AlertTriangle, BarChart3,
  Search, Plus, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, X,
  ChevronLeft, ChevronRight, RefreshCw, Upload, Loader2, LogOut, Menu,
  PackageOpen, Zap, ShoppingCart, Minus, User, Phone, Mail, CreditCard,
  Banknote, CheckCircle2, Receipt, Palette, Globe,
} from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'

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

/* ── Auth headers helper ── */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('lead-system-token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
type ViewKey = 'overview' | 'stock' | 'products' | 'movements' | 'expedition' | 'alerts' | 'sales' | 'reports'

export function InventoryPage() {
  const navigate = useNavigate()
  const { msg: toast, show: showToast } = useToast()
  const [view, setView] = useState<ViewKey>('overview')
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string; primary?: string; secondary?: string }>({})
  const [alertCount, setAlertCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [showPDV, setShowPDV] = useState(false)
  const token = localStorage.getItem('lead-system-token')
  useEffect(() => { if (!token) navigate('/login', { replace: true }) }, [token])

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
    { key: 'stock' as ViewKey, icon: Scale, label: 'Estoque' },
    { key: 'products', icon: Package, label: 'Produtos' },
    { key: 'movements', icon: ArrowLeftRight, label: 'Movimentações' },
    { key: 'expedition', icon: Truck, label: 'Expedição' },
    { key: 'alerts', icon: AlertTriangle, label: 'Alertas', badge: alertCount },
    { key: 'sales' as ViewKey, icon: ShoppingCart, label: 'Vendas' },
    { key: 'reports', icon: BarChart3, label: 'Relatórios' },
  ]
  const bottomItems = navItems.filter(n => !['expedition', 'reports'].includes(n.key))

  return (
    <div className="h-screen bg-[#f8f9fb] flex flex-col">
      {/* ── Mobile Topbar ── */}
      <header className="sticky top-0 z-50 bg-gray-950 text-white flex items-center justify-between px-4 h-14 lg:hidden shadow-xl shrink-0">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-white/10 transition">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {brand.logo_url && <img src={brand.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover ring-2 ring-white/10" />}
          <h1 className="text-[13px] font-bold truncate max-w-[120px]">{brand.name || 'Estoque'}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowPDV(true)} className="bg-emerald-500 rounded-lg px-2.5 py-1.5 text-[10px] font-bold flex items-center gap-1"><ShoppingCart size={12} /> PDV</button>
          <button onClick={handleSync} className="bg-white/10 rounded-lg p-2 hover:bg-white/20 transition"><RefreshCw size={13} /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Premium Dark Sidebar ── */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-[220px] bg-gray-950 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Brand header */}
          <div className="hidden lg:flex items-center gap-3 h-[60px] px-4 border-b border-white/[0.06] shrink-0">
            {brand.logo_url
              ? <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10 shrink-0" />
              : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center shrink-0"><Package size={16} className="text-white" /></div>}
            <div className="min-w-0">
              <span className="block text-[13px] font-bold text-white truncate">{brand.name || 'Estoque'}</span>
              <span className="block text-[10px] text-white/30 font-medium">Gestao de estoque</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2.5 overflow-y-auto space-y-0.5">
            {navItems.map(n => {
              const active = view === n.key
              return (
                <button key={n.key} onClick={() => switchView(n.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-[9px] text-[13px] rounded-lg transition-all ${
                    active ? 'bg-white/[0.12] text-white font-semibold shadow-sm' : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                  }`}>
                  <n.icon size={16} className={active ? 'text-emerald-400' : ''} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.badge ? <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span> : null}
                </button>
              )
            })}
          </nav>

          {/* Bottom actions */}
          <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
            <button onClick={() => setShowPDV(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 transition shadow-sm">
              <ShoppingCart size={13} /> Novo Pedido (PDV)
            </button>
            <div className="flex gap-2">
              <button onClick={handleSync}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded-lg bg-white/[0.08] text-white/60 hover:bg-white/[0.12] hover:text-white/80 transition">
                <RefreshCw size={12} /> Sync
              </button>
              <button onClick={() => navigate('/admin')}
                className="px-3 py-2 rounded-lg bg-white/[0.08] text-white/40 hover:bg-white/[0.12] hover:text-white/70 transition" title="Voltar ao painel">
                <ArrowLeftRight size={13} />
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

        {/* ── Main content ── */}
        <main className="flex-1 lg:ml-[220px] overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 pt-5 pb-20 lg:pb-8">
            {view === 'overview' && <OverviewView showToast={showToast} onAlertCount={setAlertCount} refreshKey={refreshKey} />}
            {view === 'stock' && <StockManagementView showToast={showToast} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />}
            {view === 'products' && <ProductsView showToast={showToast} categories={categories} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />}
            {view === 'movements' && <MovementsView showToast={showToast} />}
            {view === 'expedition' && <ExpeditionView showToast={showToast} />}
            {view === 'alerts' && <AlertsView showToast={showToast} onAlertCount={setAlertCount} onRefresh={() => setRefreshKey(k => k + 1)} />}
            {view === 'sales' && <SalesView showToast={showToast} onPDV={() => setShowPDV(true)} />}
            {view === 'reports' && <ReportsView showToast={showToast} />}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/95 backdrop-blur-lg border-t border-white/[0.06] flex h-16 lg:hidden safe-area-inset-bottom shrink-0">
        {bottomItems.map(n => {
          const active = view === n.key
          return (
            <button key={n.key} onClick={() => switchView(n.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                active ? 'text-emerald-400' : 'text-white/30'
              }`}>
              <span className="relative">
                <n.icon size={18} />
                {n.badge ? <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{n.badge}</span> : null}
              </span>
              {n.label.split(' ')[0]}
            </button>
          )
        })}
      </nav>

      {/* PDV Modal */}
      {showPDV && (
        <PDVModal
          onClose={() => setShowPDV(false)}
          showToast={showToast}
          onOrderCreated={() => { setRefreshKey(k => k + 1); switchView('sales') }}
        />
      )}

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
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Visao Geral</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Resumo do estoque</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Produtos" value={num(data?.total_products)} icon={Package} bg="bg-blue-50" color="text-blue-600" />
        <KpiCard label="Sem Estoque" value={num(data?.out_of_stock)} icon={AlertTriangle} bg="bg-red-50" color="text-red-500" />
        <KpiCard label="Estoque Baixo" value={num(data?.low_stock)} icon={Zap} bg="bg-amber-50" color="text-amber-500" />
        <KpiCard label="Valor Total" value={Number(data?.total_value) > 0 ? money(data.total_value) : '—'} icon={BarChart3} bg="bg-emerald-50" color={Number(data?.total_value) > 0 ? "text-emerald-500" : "text-muted"} />
        <KpiCard label="Entradas Hoje" value={num(data?.entries_today)} icon={ArrowDown} bg="bg-emerald-50" color="text-emerald-500" />
        <KpiCard label="Saídas Hoje" value={num(data?.exits_today)} icon={ArrowUp} bg="bg-orange-50" color="text-orange-500" />
        <KpiCard label="Total Unidades" value={num(data?.total_units)} icon={Scale} bg="bg-indigo-50" color="text-indigo-500" />
        <KpiCard label="Reservado" value={num(data?.total_reserved)} icon={Package} bg="bg-purple-50" color="text-purple-500" />
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
   STOCK MANAGEMENT VIEW — Gestao de estoque bruto
   ══════════════════════════════════════════════ */
function StockManagementView({ showToast, refreshKey, onRefresh }: {
  showToast: (t: string, tp?: 'success' | 'error') => void; refreshKey: number; onRefresh: () => void
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionModal, setActionModal] = useState<{ type: 'add' | 'remove' | 'adjust'; product: any } | null>(null)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    setLoading(true)
    inventoryApi.products(1, 200).then(d => { setItems(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [refreshKey])

  const filtered = search
    ? items.filter(p => ((p.product_name || p.name || '') as string).toLowerCase().includes(search.toLowerCase()))
    : items

  const totalUnits = items.reduce((s, p) => s + (Number(p.stock_current) || 0), 0)
  const totalAvailable = items.reduce((s, p) => s + (Number(p.stock_available) || 0), 0)
  const totalReserved = items.reduce((s, p) => s + (Number(p.stock_reserved) || 0), 0)
  const lowStock = items.filter(p => (p.status || '').toLowerCase() === 'baixo').length
  const zeroStock = items.filter(p => (p.status || '').toLowerCase() === 'zerado').length

  async function executeAction() {
    if (!actionModal || !qty || Number(qty) <= 0) return showToast('Quantidade invalida', 'error')
    const pid = actionModal.product.product_id || actionModal.product.id
    setSaving(true)
    try {
      if (actionModal.type === 'add') {
        await inventoryApi.addStock(pid, { quantity: Number(qty), source: 'reposicao', reason: reason || 'Entrada manual' })
        showToast(`+${qty} adicionado ao estoque`)
      } else if (actionModal.type === 'remove') {
        await inventoryApi.removeStock(pid, { quantity: Number(qty), source: 'ajuste', reason: reason || 'Saida manual' })
        showToast(`-${qty} removido do estoque`)
      } else if (actionModal.type === 'adjust') {
        await inventoryApi.adjustStock(pid, { new_quantity: Number(qty), reason: reason || 'Ajuste manual' })
        showToast(`Estoque ajustado para ${qty}`)
      }
      setActionModal(null); setQty(''); setReason(''); load(); onRefresh()
    } catch (e: any) { showToast(e.message, 'error') }
    setSaving(false)
  }

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Estoque</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Gestao de quantidades e movimentacoes</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <Scale size={16} className="text-white/50 mb-1" />
          <p className="text-2xl font-extrabold">{num(totalUnits)}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Total Bruto</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
          <Package size={16} className="text-white/50 mb-1" />
          <p className="text-2xl font-extrabold">{num(totalAvailable)}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Disponivel</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-2xl font-extrabold text-amber-600">{num(totalReserved)}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Reservado</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-2xl font-extrabold text-orange-500">{lowStock}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Estoque Baixo</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-2xl font-extrabold text-red-500">{zeroStock}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Zerado</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto no estoque..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-gray-300" />
      </div>

      {/* Stock table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Produto</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Atual</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Disponivel</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Reservado</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const pid = p.product_id || p.id
              const name = p.product_name || p.name || 'Produto'
              const img = p.product_image || p.image_url || ''
              const sb = stockBadge(p.status)
              const current = Number(p.stock_current) || 0
              const available = Number(p.stock_available) || 0
              const reserved = Number(p.stock_reserved) || 0
              return (
                <tr key={pid} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {img ? <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        : <div className="w-9 h-9 rounded-lg bg-gray-100 grid place-items-center shrink-0"><Package size={14} className="text-gray-300" /></div>}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate max-w-[180px] text-xs">{name}</p>
                        <p className="text-[10px] text-gray-400">{unitShort(p.product_unit || p.unit)} · min: {p.stock_min || 0}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold text-gray-900">{num(current)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-600 hidden sm:table-cell">{num(available)}</td>
                  <td className="px-3 py-3 text-right text-amber-600 hidden md:table-cell">{reserved > 0 ? num(reserved) : '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setActionModal({ type: 'add', product: p }); setQty(''); setReason('') }}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition" title="Entrada">
                        <ArrowDown size={13} />
                      </button>
                      <button onClick={() => { setActionModal({ type: 'remove', product: p }); setQty(''); setReason('') }}
                        className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition" title="Saida">
                        <ArrowUp size={13} />
                      </button>
                      <button onClick={() => { setActionModal({ type: 'adjust', product: p }); setQty(String(current)); setReason('') }}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 transition" title="Ajuste">
                        <Scale size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-base text-gray-900">
                {actionModal.type === 'add' ? '📥 Entrada de Estoque' : actionModal.type === 'remove' ? '📤 Saida de Estoque' : '⚖️ Ajustar Estoque'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">{actionModal.product.product_name || actionModal.product.name}</p>
              <p className="text-xs text-gray-500 mt-1">Estoque atual: <span className="font-bold">{num(Number(actionModal.product.stock_current) || 0)}</span></p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  {actionModal.type === 'adjust' ? 'Nova quantidade' : 'Quantidade'}
                </label>
                <input type="number" step="any" min="0" value={qty} onChange={e => setQty(e.target.value)} autoFocus
                  placeholder={actionModal.type === 'adjust' ? 'Nova qty total' : 'Ex: 100'}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Motivo (opcional)</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Ex: Reposicao do fornecedor, Inventario..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              {actionModal.type !== 'adjust' && qty && Number(qty) > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Resultado:</p>
                  <p className="text-lg font-extrabold text-gray-900">
                    {num(Number(actionModal.product.stock_current) || 0)} {actionModal.type === 'add' ? '+' : '−'} {qty} = <span className={actionModal.type === 'add' ? 'text-emerald-600' : 'text-red-500'}>
                      {num(actionModal.type === 'add' ? (Number(actionModal.product.stock_current) || 0) + Number(qty) : (Number(actionModal.product.stock_current) || 0) - Number(qty))}
                    </span>
                  </p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setActionModal(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
              <button onClick={executeAction} disabled={saving || !qty || Number(qty) <= 0}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 transition shadow-sm ${
                  actionModal.type === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : actionModal.type === 'remove' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}>
                {saving ? 'Processando...' : actionModal.type === 'add' ? 'Adicionar' : actionModal.type === 'remove' ? 'Remover' : 'Ajustar'}
              </button>
            </div>
          </div>
        </div>
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
        <h2 className="text-lg font-bold text-gray-900">Produtos</h2>
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
                  className="bg-white border border-border rounded-2xl p-3.5 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-start gap-2.5">
                    {img ? <img src={img} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                      : <div className="w-12 h-12 rounded-lg bg-gray-100 grid place-items-center text-gray-400 flex-shrink-0">📦</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {(p.product_sku || p.sku) ? `SKU: ${(p.product_sku || p.sku || '').substring(0, 12)} • ` : ''}
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
      <h2 className="text-lg font-bold text-gray-900">Movimentações</h2>
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
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/orders?limit=100', { headers: getAuthHeaders() })
      .then(r => r.json()).then(d => { setOrders(d.orders || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function moveOrder(orderId: string, nextStatus: string) {
    setMoving(orderId)
    try {
      const r = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(`Movido para ${nextStatus.replace(/_/g, ' ')}`)
      load()
    } catch (e: any) { showToast(e.message, 'error') }
    setMoving(null)
  }

  if (loading) return <Skeleton rows={4} />

  const columns = [
    { key: 'aguardando', label: 'Pago', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', statuses: ['pago'], nextStatus: 'em_preparacao', nextLabel: 'Separar →' },
    { key: 'separando', label: 'Separando', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', statuses: ['em_preparacao'], nextStatus: 'em_entrega', nextLabel: 'Enviar →' },
    { key: 'rota', label: 'Em Rota', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', statuses: ['em_entrega'], nextStatus: 'entregue', nextLabel: 'Entregar →' },
    { key: 'entregue', label: 'Entregue', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', statuses: ['entregue'], nextStatus: '', nextLabel: '' },
  ]

  const grouped: Record<string, any[]> = {}
  columns.forEach(c => { grouped[c.key] = [] })
  orders.forEach(o => {
    const st = (o.business_status || o.status_pedido || '').toLowerCase()
    if (['cancelado', 'aguardando_pagamento', 'novo', 'criado'].includes(st)) return
    const col = columns.find(c => c.statuses.includes(st))
    if (col) grouped[col.key].push(o)
  })
  const totalInKanban = Object.values(grouped).reduce((s, arr) => s + arr.length, 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Expedicao</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{totalInKanban} pedido(s) em fluxo</p>
      </div>

      {totalInKanban === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl grid place-items-center mb-3">
            <Truck size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">Nenhum pedido em expedicao</p>
          <p className="text-xs text-gray-400 mt-1">Pedidos pagos aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
          {columns.map(col => {
            const items = grouped[col.key] || []
            return (
              <div key={col.key} className="shrink-0 w-64 min-w-[256px]">
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${col.bg} border ${col.border} border-b-0`}>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${col.color}`}>{col.label}</span>
                  <span className={`text-[10px] font-bold ${col.color} bg-white/80 rounded-full px-2 py-0.5`}>{items.length}</span>
                </div>
                <div className={`rounded-b-xl border ${col.border} border-t-0 min-h-[200px] p-2 space-y-2 bg-white/50`}>
                  {items.length === 0 ? (
                    <p className="text-center text-[11px] text-gray-400 py-8">Vazio</p>
                  ) : items.map((o: any) => (
                    <div key={o.id} className="bg-white rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-gray-100 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{o.customer_name || 'Cliente'}</p>
                          <p className="text-[10px] text-gray-400 font-mono">#{(o.order_number || o.id || '').slice(0, 8)}</p>
                        </div>
                        <span className="text-sm font-extrabold text-gray-900 shrink-0">{money(o.valor_total)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                        <span className="text-[9px] text-gray-400">{dt(o.created_at)}</span>
                        {col.nextStatus && (
                          <button onClick={() => moveOrder(o.id, col.nextStatus)} disabled={moving === o.id}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg transition ${col.bg} ${col.color} hover:opacity-80 disabled:opacity-40`}>
                            {moving === o.id ? '...' : col.nextLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
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
      <h2 className="text-lg font-bold text-gray-900">Alertas ({alerts.length})</h2>
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
      <h2 className="text-lg font-bold text-gray-900">Relatórios</h2>

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

function KpiCard({ label, value, color, icon: Icon, bg }: {
  label: string; value: string; color?: string; icon?: any; bg?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl grid place-items-center ${bg || 'bg-gray-50'}`}>
            <Icon size={16} className={color || 'text-gray-400'} />
          </div>
        )}
      </div>
      <p className={`text-[26px] font-extrabold tracking-tight leading-none ${color || 'text-gray-900'}`}>{value}</p>
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
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl grid place-items-center mb-4">
        <Package size={28} className="text-muted-light" />
      </div>
      <p className="text-sm font-medium text-muted">{text}</p>
    </div>
  )
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height: i === 0 ? 80 : 64, opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════
   SALES VIEW
   ══════════════════════════════════════════════ */
function SalesView({ showToast, onPDV }: { showToast: (t: string, tp?: 'success' | 'error') => void; onPDV?: () => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/orders?limit=50', { headers: { ...getAuthHeaders() } })
      .then(r => r.json())
      .then(d => {
        setOrders(d.orders || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={5} />

  const today = new Date().toISOString().slice(0, 10)
  const todayOrders = orders.filter(o => (o.created_at || '').slice(0, 10) === today)
  const totalToday = todayOrders.reduce((s, o) => s + Number(o.valor_total || 0), 0)
  const avgTicket = todayOrders.length ? totalToday / todayOrders.length : 0
  const pending = orders.filter(o => {
    const st = o.business_status || o.status_pedido || ''
    return st === 'aguardando_pagamento' || st === 'novo' || st === 'criado'
  }).length

  const statusConfig: Record<string, { label: string; cls: string }> = {
    pago:                { label: 'Pago',          cls: 'bg-emerald-100 text-emerald-700' },
    aguardando_pagamento:{ label: 'Aguardando',    cls: 'bg-amber-100 text-amber-800' },
    cancelado:           { label: 'Cancelado',     cls: 'bg-red-100 text-red-700' },
    em_entrega:          { label: 'Em entrega',    cls: 'bg-blue-100 text-blue-700' },
    saiu_para_entrega:   { label: 'Saiu p/ entrega', cls: 'bg-blue-100 text-blue-700' },
    entregue:            { label: 'Entregue',      cls: 'bg-emerald-100 text-emerald-700' },
    em_preparacao:       { label: 'Preparando',    cls: 'bg-orange-100 text-orange-700' },
    pronto:              { label: 'Pronto',        cls: 'bg-teal-100 text-teal-700' },
    novo:                { label: 'Novo',          cls: 'bg-gray-100 text-gray-600' },
    criado:              { label: 'Novo',          cls: 'bg-gray-100 text-gray-600' },
    aprovado:            { label: 'Aprovado',      cls: 'bg-emerald-100 text-emerald-700' },
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Vendas</h2>
        <button onClick={onPDV} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 text-white px-3 py-2 rounded-lg hover:bg-emerald-600 transition">
          <Plus size={14} /> Novo Pedido
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <KpiCard label="Vendas Hoje" value={money(totalToday)} icon={BarChart3} bg="bg-emerald-50" color="text-emerald-600" />
        <KpiCard label="Ticket Médio" value={money(avgTicket)} icon={CreditCard} bg="bg-blue-50" color="text-blue-600" />
        <KpiCard label="Pendentes" value={String(pending)} icon={Zap} bg="bg-amber-50" color="text-amber-500" />
      </div>

      <div className="space-y-2">
        {orders.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido</p>
          </div>
        ) : orders.map((o, i) => {
          const st = o.business_status || o.status_pedido || 'novo'
          const stCfg = statusConfig[st] || { label: st.replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-600' }
          const customerName = (o.customer_name || '').trim()
          const displayName = customerName && customerName !== 'Cliente' ? customerName : (o.customer_email || o.customer_phone || 'Cliente')
          return (
            <div key={i} className="bg-white border border-border rounded-2xl p-3.5 hover:border-blue-100 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-muted-light">#{(o.order_number || o.id || '').substring(0, 8)}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${stCfg.cls}`}>
                  {stCfg.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-muted">{dt(o.created_at)}</p>
                </div>
                <span className="text-base font-bold text-gray-900">{money(o.valor_total || o.total)}</span>
              </div>
            </div>
          )
        })}
      </div>
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

/* ══════════════════════════════════════════════
   PDV MODAL — Ponto de Venda
   ══════════════════════════════════════════════ */
interface CartItem {
  product_id: string
  product_name: string
  price: number
  qty: number
  unit: string
  image?: string
}

const ORIGINS = [
  ['balcao', '🏪 Balcão'],
  ['whatsapp', '💬 WhatsApp'],
  ['telefone', '📞 Telefone'],
  ['instagram', '📸 Instagram'],
  ['site', '🌐 Site'],
]
const PAYMENTS = [
  ['pix', 'PIX'],
  ['dinheiro', 'Dinheiro'],
  ['cartao_credito', 'Cartão Crédito'],
  ['cartao_debito', 'Cartão Débito'],
  ['boleto', 'Boleto'],
  ['fiado', 'Fiado'],
]

function PDVModal({ onClose, showToast, onOrderCreated }: {
  onClose: () => void
  showToast: (t: string, tp?: 'success' | 'error') => void
  onOrderCreated?: () => void
}) {
  const [step, setStep] = useState<'cart' | 'customer' | 'success'>('cart')
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [search, setSearch] = useState('')
  const [searchRes, setSearchRes] = useState<InventoryProduct[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [origin, setOrigin] = useState('balcao')
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdOrder, setCreatedOrder] = useState<any>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inventoryApi.products(1, 500)
      .then(d => setProducts(Array.isArray(d.items) ? d.items : []))
      .catch(() => {})
  }, [])

  function onSearch(q: string) {
    setSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchRes([]); return }
    searchTimer.current = setTimeout(() => {
      const lower = q.toLowerCase()
      setSearchRes(
        products
          .filter(p => (p.product_name || p.name || '').toLowerCase().includes(lower))
          .slice(0, 8)
      )
    }, 150)
  }

  function addToCart(p: InventoryProduct) {
    const pid = p.product_id || p.id || ''
    setCart(prev => {
      const existing = prev.find(c => c.product_id === pid)
      if (existing) return prev.map(c => c.product_id === pid ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, {
        product_id: pid,
        product_name: p.product_name || p.name || '',
        price: Number(p.product_price || p.price || 0),
        qty: 1,
        unit: unitShort(p.product_unit || p.unit),
        image: p.product_image || p.image_url || '',
      }]
    })
    setSearch(''); setSearchRes([])
    searchInputRef.current?.focus()
  }

  function updateQty(pid: string, delta: number) {
    setCart(prev => prev
      .map(c => c.product_id === pid ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  function setQtyDirect(pid: string, val: string) {
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) { setCart(prev => prev.filter(c => c.product_id !== pid)); return }
    setCart(prev => prev.map(c => c.product_id === pid ? { ...c, qty: n } : c))
  }

  const total = cart.reduce((s, c) => s + c.price * c.qty, 0)

  async function submitOrder() {
    if (cart.length === 0) { showToast('Carrinho vazio', 'error'); return }
    if (!customerName.trim()) { showToast('Informe o nome do cliente', 'error'); return }
    setSaving(true)
    try {
      const originLabel = ORIGINS.find(o => o[0] === origin)?.[1].replace(/.*\s/, '') || origin
      const payload = {
        items: cart.map(c => ({ product_id: c.product_id, quantity: c.qty })),
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim() || '00000000000',
          email: customerEmail.trim() || undefined,
        },
        payment_method: paymentMethod,
        notes: [notes.trim(), `Canal: ${originLabel}`].filter(Boolean).join(' | '),
        channel: origin,
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || `Erro ${res.status}`)
      setCreatedOrder(data.order || data)
      setStep('success')
      onOrderCreated?.()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[250] bg-black/50 flex items-stretch md:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl md:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-emerald-600 to-emerald-500 text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Receipt size={20} />
            <span className="font-bold text-base">
              {step === 'cart' ? 'Ponto de Venda' : step === 'customer' ? 'Dados do Cliente' : 'Pedido Criado!'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition"><X size={20} /></button>
        </div>

        {/* Step: Cart */}
        {step === 'cart' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Product Search */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={search}
                  onChange={e => onSearch(e.target.value)}
                  placeholder="Buscar produto para adicionar..."
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                />
              </div>
              {/* Search Results */}
              {searchRes.length > 0 && (
                <div className="mt-2 border border-border rounded-xl overflow-hidden shadow-lg bg-white z-10">
                  {searchRes.map(p => {
                    const pid = p.product_id || p.id || ''
                    const img = p.product_image || p.image_url || ''
                    return (
                      <button key={pid} onClick={() => addToCart(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-emerald-50 transition text-left border-b border-border last:border-b-0">
                        {img ? <img src={img} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          : <div className="w-8 h-8 rounded-lg bg-gray-100 grid place-items-center text-gray-400 flex-shrink-0 text-xs">📦</div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{p.product_name || p.name}</p>
                          <p className="text-xs text-muted">{unitShort(p.product_unit || p.unit)} • estoque: {num(p.stock_available ?? p.stock_current)}</p>
                        </div>
                        <span className="font-bold text-emerald-600 flex-shrink-0">{money(p.product_price || p.price)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-muted">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Carrinho vazio</p>
                  <p className="text-sm mt-1">Busque produtos acima para adicionar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.product_id} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
                      {item.image ? <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 grid place-items-center text-gray-400 flex-shrink-0">📦</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.product_name}</p>
                        <p className="text-xs text-muted">{money(item.price)} / {item.unit}</p>
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => updateQty(item.product_id, -1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 transition grid place-items-center">
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => setQtyDirect(item.product_id, e.target.value)}
                          className="w-12 text-center border border-border rounded-lg text-sm font-bold py-1"
                          min={0.01}
                          step="0.001"
                        />
                        <button onClick={() => updateQty(item.product_id, 1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-600 hover:text-emerald-600 transition grid place-items-center">
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="text-sm font-bold text-right min-w-[60px]">{money(item.price * item.qty)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-border flex-shrink-0 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted">{cart.length} item(s)</span>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="text-xl font-bold text-emerald-600">{money(total)}</p>
                </div>
              </div>
              <button
                onClick={() => setStep('customer')}
                disabled={cart.length === 0}
                className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 transition"
              >
                Continuar → Dados do Cliente
              </button>
            </div>
          </div>
        )}

        {/* Step: Customer */}
        {step === 'customer' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Order Summary */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2">{cart.length} produto(s) no carrinho</p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {cart.map(c => (
                    <div key={c.product_id} className="flex justify-between text-sm">
                      <span className="text-gray-700 truncate flex-1 mr-2">{c.qty}× {c.product_name}</span>
                      <span className="font-semibold flex-shrink-0">{money(c.price * c.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-emerald-200 mt-2 pt-2 flex justify-between">
                  <span className="font-bold text-emerald-700">Total</span>
                  <span className="font-bold text-emerald-700 text-base">{money(total)}</span>
                </div>
              </div>

              {/* Customer fields */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><User size={12} /> Cliente</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome *</label>
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                        placeholder="Nome completo"
                        className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Telefone / WhatsApp</label>
                    <div className="relative">
                      <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                        placeholder="(99) 99999-9999"
                        className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">E-mail</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                        className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Origin & Payment */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><CreditCard size={12} /> Pagamento e Canal</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Canal de venda</label>
                    <div className="flex flex-col gap-1">
                      {ORIGINS.map(([val, label]) => (
                        <button key={val} onClick={() => setOrigin(val)}
                          className={`text-left px-3 py-2 rounded-lg text-sm transition border ${
                            origin === val ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-semibold' : 'border-border text-gray-600 hover:bg-gray-50'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Forma de pagamento</label>
                    <div className="flex flex-col gap-1">
                      {PAYMENTS.map(([val, label]) => (
                        <button key={val} onClick={() => setPaymentMethod(val)}
                          className={`text-left px-3 py-2 rounded-lg text-sm transition border ${
                            paymentMethod === val ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold' : 'border-border text-gray-600 hover:bg-gray-50'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Observações</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Endereço de entrega, instruções especiais..."
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50 resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-border flex-shrink-0 bg-gray-50 flex gap-2">
              <button onClick={() => setStep('cart')} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition">
                ← Voltar
              </button>
              <button onClick={submitOrder} disabled={saving || !customerName.trim()}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Criando pedido...</> : <><Banknote size={16} /> Finalizar Pedido · {money(total)}</>}
              </button>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="flex flex-col flex-1 items-center justify-center px-6 py-10 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full grid place-items-center mb-5">
              <CheckCircle2 size={44} className="text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">Pedido criado!</h3>
            <p className="text-muted text-sm mb-1">
              {customerName && <span className="font-semibold text-gray-700">{customerName}</span>}
            </p>
            {createdOrder?.order_number && (
              <p className="text-sm text-muted mb-2">Pedido #{createdOrder.order_number}</p>
            )}
            <p className="text-2xl font-bold text-emerald-600 mb-1">{money(total)}</p>
            <p className="text-xs text-muted mb-2">
              {PAYMENTS.find(p => p[0] === paymentMethod)?.[1]} · {ORIGINS.find(o => o[0] === origin)?.[1]}
            </p>

            {/* Cart recap */}
            <div className="w-full bg-gray-50 rounded-xl p-3 mb-6 text-left">
              {cart.map(c => (
                <div key={c.product_id} className="flex justify-between text-sm py-1">
                  <span className="text-gray-600">{c.qty}× {c.product_name}</span>
                  <span className="font-semibold">{money(c.price * c.qty)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={() => { setStep('cart'); setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setNotes('') }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition">
                Novo Pedido
              </button>
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   DESIGN VIEW — Configurações do Catálogo
   ══════════════════════════════════════════════ */
export function DesignView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [storeId, setStoreId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [slug, setSlug] = useState('')
  const [currentBrand, setCurrentBrand] = useState<Record<string, any>>({})

  // Brand identity
  const [brandName, setBrandName] = useState('')
  const [slogan, setSlogan] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#111827')
  const [secondaryColor, setSecondaryColor] = useState('#3b82f6')
  const [coverImage, setCoverImage] = useState('')

  // Logistics
  const [deliveryFee, setDeliveryFee] = useState('')
  const [deliveryRadius, setDeliveryRadius] = useState('')
  const [freeShippingAbove, setFreeShippingAbove] = useState('')
  const [deliveryTimeText, setDeliveryTimeText] = useState('')
  const [etaMinutes, setEtaMinutes] = useState('')

  // Checkout
  const [collectEmail, setCollectEmail] = useState(true)
  const [collectAddress, setCollectAddress] = useState(true)

  // Status
  const [storeStatus, setStoreStatus] = useState<'aberto' | 'fechado'>('aberto')

  function getHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('lead-system-token')
    if (token) h['Authorization'] = `Bearer ${token}`
    const bid = localStorage.getItem('lead-system:active-brand-id')
    if (bid) h['x-brand-id'] = bid
    return h
  }

  useEffect(() => {
    setLoading(true)
    const headers = getHeaders()
    fetch('/api/storefront/stores', { headers })
      .then(r => r.json())
      .then(async d => {
        const stores = d.stores || []
        if (!stores.length) { setLoading(false); return }
        const store = stores[0]
        setStoreId(store.id)
        setSlug(store.slug || '')

        const r2 = await fetch(`/api/storefront/stores/${store.id}`, { headers })
        const d2 = await r2.json()
        const s = d2.store || {}
        const brand = s.brand || {}
        const settings = s.settings || {}
        const logistics = settings.logistics || {}
        const checkout = settings.checkout || {}

        setCurrentBrand(brand)
        setBrandId(brand.id || store.brand_id || '')
        setBrandName(brand.name || s.name || '')
        setSlogan(brand.slogan || '')
        setDescription(brand.description || '')
        setLogoUrl(brand.logo_url || s.theme?.logo_url || '')
        setPrimaryColor(brand.primary_color || s.theme?.primary_color || '#111827')
        setSecondaryColor(brand.secondary_color || s.theme?.secondary_color || '#3b82f6')
        setCoverImage(brand.cover_image || s.theme?.cover_image || '')
        setDeliveryFee(logistics.delivery_fee != null ? String(logistics.delivery_fee) : '')
        setDeliveryRadius(logistics.delivery_radius_km != null ? String(logistics.delivery_radius_km) : '')
        setFreeShippingAbove(logistics.free_shipping_above != null ? String(logistics.free_shipping_above) : '')
        setDeliveryTimeText(logistics.delivery_time_text || '')
        setEtaMinutes(logistics.default_eta_minutes != null ? String(logistics.default_eta_minutes) : '')
        setCollectEmail(checkout.collect_email !== false)
        setCollectAddress(checkout.collect_address !== false)
        setStoreStatus(brand.status === 'fechado' ? 'fechado' : 'aberto')
        setLoading(false)
      })
      .catch(err => {
        showToast(err.message || 'Erro ao carregar configurações', 'error')
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    try {
      const headers = getHeaders()
      // Save brand identity to brand_units
      if (brandId) {
        const br = await fetch(`/api/brands/${brandId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ name: brandName, slogan, logo_url: logoUrl, primary_color: primaryColor, secondary_color: secondaryColor }),
        })
        if (!br.ok) { const e = await br.json(); throw new Error(e.error || 'Erro ao salvar marca') }
      }
      // Save store settings (logistics, checkout, status, cover_image via brand)
      const sr = await fetch(`/api/storefront/stores/${storeId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          brand: { ...currentBrand, name: brandName, slogan, description, logo_url: logoUrl, primary_color: primaryColor, secondary_color: secondaryColor, cover_image: coverImage, status: storeStatus },
          settings: {
            logistics: {
              ...(deliveryFee !== '' ? { delivery_fee: parseFloat(deliveryFee) } : {}),
              ...(deliveryRadius !== '' ? { delivery_radius_km: parseFloat(deliveryRadius) } : {}),
              ...(freeShippingAbove !== '' ? { free_shipping_above: parseFloat(freeShippingAbove) } : {}),
              ...(deliveryTimeText ? { delivery_time_text: deliveryTimeText } : {}),
              ...(etaMinutes !== '' ? { default_eta_minutes: parseInt(etaMinutes) } : {}),
            },
            checkout: { collect_email: collectEmail, collect_address: collectAddress },
          },
        }),
      })
      if (!sr.ok) { const e = await sr.json(); throw new Error(e.error || 'Erro ao salvar loja') }
      showToast('Configurações salvas! O catálogo foi atualizado.')
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  )

  const inputCls = 'w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white'

  if (loading) return <Skeleton rows={10} />

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Design do Catálogo</h2>
          <p className="text-sm text-muted mt-0.5">Aparência, frete e configurações do catálogo público</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {slug && (
            <a href={`/catalogo/${slug}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              <Globe size={14} /> Visualizar Catálogo
            </a>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 transition shadow-sm">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* ── 1. Identidade Visual ── */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-purple-50 rounded-lg grid place-items-center shrink-0">
            <Palette size={15} className="text-purple-500" />
          </div>
          <h3 className="text-sm font-bold">Identidade Visual</h3>
        </div>

        <Field label="Logo da Loja (1:1 — recomendado 500×500px)">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 relative group">
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                : <Upload size={20} className="text-gray-300" />}
              <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity rounded-xl">
                <Upload size={16} className="text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  const fd = new FormData(); fd.append('file', file)
                  try {
                    const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': getHeaders()['Authorization'] }, body: fd })
                    const d = await r.json(); if (d.file?.url) setLogoUrl(d.file.url)
                  } catch {}
                }} />
              </label>
            </div>
            <div className="flex-1">
              <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                placeholder="URL ou clique no quadrado para upload" className={inputCls + ' text-xs'} />
              <p className="text-[10px] text-gray-400 mt-1">Formato quadrado 1:1. Clique no icone para fazer upload.</p>
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da Loja">
            <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Ex: Minha Loja" className={inputCls} />
          </Field>
          <Field label="Slogan / Subtítulo">
            <input type="text" value={slogan} onChange={e => setSlogan(e.target.value)} placeholder="Ex: Qualidade que você pode confiar" className={inputCls} />
          </Field>
        </div>

        <Field label="Descrição / Sobre nós">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="Conte um pouco sobre sua loja..."
            className={inputCls + ' resize-none'} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Cor Primária">
            <div className="flex items-center gap-3 px-3 py-2 border border-border rounded-xl bg-white">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 bg-transparent" />
              <span className="text-sm font-mono text-gray-600">{primaryColor}</span>
            </div>
          </Field>
          <Field label="Cor Secundária">
            <div className="flex items-center gap-3 px-3 py-2 border border-border rounded-xl bg-white">
              <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 bg-transparent" />
              <span className="text-sm font-mono text-gray-600">{secondaryColor}</span>
            </div>
          </Field>
        </div>

        <Field label="Imagem de Capa / Banner (820×312px — proporcao Facebook)">
          <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 group" style={{ aspectRatio: '820/312' }}>
            {coverImage
              ? <img src={coverImage} alt="Capa" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              : <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <Upload size={28} />
                  <p className="text-xs mt-1.5">820 × 312 px</p>
                </div>}
            <label className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
              <div className="bg-white/90 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700">Trocar imagem</div>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return
                const fd = new FormData(); fd.append('file', file)
                try {
                  const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': getHeaders()['Authorization'] }, body: fd })
                  const d = await r.json(); if (d.file?.url) setCoverImage(d.file.url)
                } catch {}
              }} />
            </label>
          </div>
          <input type="url" value={coverImage} onChange={e => setCoverImage(e.target.value)}
            placeholder="Ou cole uma URL diretamente" className={inputCls + ' text-xs mt-2'} />
        </Field>
      </section>

      {/* Frete & Entrega: configurar em /frete (secao dedicada) */}

      {/* ── 2. Checkout ── */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-50 rounded-lg grid place-items-center shrink-0">
            <ShoppingCart size={15} className="text-emerald-500" />
          </div>
          <h3 className="text-sm font-bold">Checkout</h3>
        </div>
        {[
          { label: 'Coletar e-mail do cliente', sub: 'Campo de e-mail no formulário de pedido', value: collectEmail, onChange: setCollectEmail },
          { label: 'Coletar endereço de entrega', sub: 'Campo de endereço no formulário de pedido', value: collectAddress, onChange: setCollectAddress },
        ].map(({ label, sub, value, onChange }) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-muted">{sub}</p>
            </div>
            <Toggle value={value} onChange={onChange} />
          </div>
        ))}
      </section>

      {/* ── 4. Status da Loja ── */}
      <section className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-amber-50 rounded-lg grid place-items-center shrink-0">
            <Globe size={15} className="text-amber-500" />
          </div>
          <h3 className="text-sm font-bold">Status da Loja</h3>
        </div>
        <p className="text-sm text-muted -mt-2">Controla o badge "Aberto/Fechado" exibido no catálogo</p>
        <div className="flex gap-3">
          {(['aberto', 'fechado'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStoreStatus(s)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${
                storeStatus === s
                  ? s === 'aberto' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {s === 'aberto' ? '🟢 Aberto' : '🔴 Fechado'}
            </button>
          ))}
        </div>
      </section>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-60 transition shadow-sm">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  )
}
