import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation, useParams } from 'react-router-dom'
import {
  LayoutDashboard, Package, ArrowLeftRight, Truck, AlertTriangle, BarChart3,
  Search, Plus, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, X,
  ChevronLeft, ChevronRight, RefreshCw, Upload, Loader2, LogOut, Menu,
  PackageOpen, Zap, ShoppingCart, Minus, User, Phone, Mail, CreditCard,
  Banknote, CheckCircle2, Receipt, Palette, Globe, Users, MapPin, Tag,
  Eye, Trash2, UserPlus, Filter, Building2, Calendar, FileText, Star,
  TrendingUp, Clock, Shield, Link2, Share2,
} from 'lucide-react'
import { inventoryApi, stockApi, getStockToken, getStockBrandRef, clearStockAuth } from '@/lib/api-admin'

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

/* ── Shared style constants ── */
const fieldBase = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/20 focus:border-[var(--brand-secondary)] transition"

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
type ViewKey = 'overview' | 'stock' | 'products' | 'movements' | 'expedition' | 'alerts' | 'sales' | 'reports' | 'clients'

export function InventoryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ slug?: string }>()
  const { msg: toast, show: showToast } = useToast()
  const [view, setView] = useState<ViewKey>('overview')
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string; primary?: string; secondary?: string }>({})
  const [alertCount, setAlertCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showPDV, setShowPDV] = useState(false)

  // ── Mode detection: stock-manager (/app-estoque/...) vs admin ──
  const isStockMode = location.pathname.startsWith('/app-estoque')
  const stockToken = isStockMode ? getStockToken() : null
  const adminToken = !isStockMode ? localStorage.getItem('lead-system-token') : null

  // Auth gate: redirect to the right login if not authenticated
  useEffect(() => {
    if (isStockMode) {
      if (!stockToken) {
        const slug = params.slug || getStockBrandRef() || ''
        navigate(slug ? `/app-estoque/${slug}` : '/app-estoque', { replace: true })
      }
    } else {
      if (!adminToken) navigate('/login', { replace: true })
    }
  }, [isStockMode, stockToken, adminToken, navigate, params.slug])

  // Apply brand CSS variables whenever brand changes + cache in localStorage for next load
  useEffect(() => {
    const root = document.documentElement
    if (brand.primary) root.style.setProperty('--brand-primary', brand.primary)
    if (brand.secondary) {
      root.style.setProperty('--brand-secondary', brand.secondary)
      root.style.setProperty('--brand-secondary-soft', brand.secondary + '1a')
      root.style.setProperty('--brand-secondary-light', brand.secondary + '26')
    }
    if (brand.primary || brand.secondary) {
      try {
        localStorage.setItem('lead-system:brand-colors', JSON.stringify({
          primary: brand.primary, secondary: brand.secondary,
        }))
      } catch { /* ignore */ }
    }
  }, [brand])

  // Bootstrap
  useEffect(() => {
    if (isStockMode) {
      // Stock app: brand info comes from /api/stock-app/me (validated by stock token)
      stockApi.me().then(d => {
        const b = d.brand || {}
        setBrand({ name: b.name, logo_url: b.logo_url, primary: b.primary_color, secondary: b.secondary_color })
        if (b.name) document.title = `${b.name} — Estoque`
        else document.title = 'Estoque'
      }).catch(() => {
        document.title = 'Estoque'
      })
    } else {
      // Admin: brand info from /api/brands using admin token
      fetch('/api/brands', { headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' } })
        .then(r => r.json()).then(d => {
          const brands = d.brands || []
          const active = d.active_brand_id
          const b = brands.find((x: any) => String(x.id) === String(active)) || brands[0] || {}
          setBrand({ name: b.name, logo_url: b.logo_url, primary: b.primary_color, secondary: b.secondary_color })
          document.title = (b.name ? `${b.name} — ` : '') + 'Estoque'
        }).catch(() => {
          document.title = 'Estoque'
        })
    }
    // categories (in stock mode, returns empty list)
    inventoryApi.categories().then(d => {
      const arr = d.categories || d.items || (Array.isArray(d) ? d : [])
      setCategories(arr)
    }).catch(() => {})
  }, [isStockMode, refreshKey])

  function logout() {
    if (isStockMode) {
      const slug = params.slug || getStockBrandRef() || ''
      clearStockAuth()
      navigate(slug ? `/app-estoque/${slug}` : '/app-estoque', { replace: true })
    } else {
      localStorage.removeItem('lead-system-token')
      localStorage.removeItem('lead-system:active-brand-id')
      navigate('/login', { replace: true })
    }
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
    { key: 'clients' as ViewKey, icon: Users, label: 'Clientes' },
    { key: 'reports', icon: BarChart3, label: 'Relatórios' },
  ]
  const bottomItems = navItems.filter(n => !['expedition', 'reports', 'clients'].includes(n.key))

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
          <button onClick={() => setShowPDV(true)} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold flex items-center gap-1 text-white" style={{ backgroundColor: 'var(--brand-secondary)' }}><ShoppingCart size={12} /> PDV</button>
          <button onClick={handleSync} className="bg-white/10 rounded-lg p-2 hover:bg-white/20 transition"><RefreshCw size={13} /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Premium Dark Sidebar ── */}
        <aside className={`fixed top-14 bottom-0 lg:inset-y-0 left-0 z-[60] w-[220px] bg-gray-950 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Brand header */}
          <div className="hidden lg:flex items-center gap-3 h-[60px] px-4 border-b border-white/[0.06] shrink-0">
            {brand.logo_url
              ? <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10 shrink-0" />
              : <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: 'var(--brand-secondary)' }}><Package size={16} className="text-white" /></div>}
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
                  <n.icon size={16} style={active ? { color: 'var(--brand-secondary)' } : undefined} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.badge ? <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{n.badge}</span> : null}
                </button>
              )
            })}
          </nav>

          {/* Bottom actions */}
          <div className="p-3 border-t border-white/[0.06] space-y-2 shrink-0">
            <button onClick={() => setShowPDV(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-2.5 rounded-lg text-white hover:opacity-90 transition shadow-sm"
              style={{ backgroundColor: 'var(--brand-secondary)' }}>
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
        {sidebarOpen && <div className="fixed inset-0 top-14 bg-black/50 z-[55] lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

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
            {view === 'clients' && <ClientsView showToast={showToast} />}
            {view === 'reports' && <ReportsView showToast={showToast} />}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className={`fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-lg border-t border-white/[0.06] flex h-16 lg:hidden safe-area-inset-bottom shrink-0 transition-opacity ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {bottomItems.map(n => {
          const active = view === n.key
          return (
            <button key={n.key} onClick={() => switchView(n.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${active ? '' : 'text-white/30'}`}
              style={active ? { color: 'var(--brand-secondary)' } : undefined}>
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
        <KpiCard label="Embalagens" value={num(data?.total_units)} icon={Scale} bg="bg-indigo-50" color="text-indigo-500" />
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
    // Merge inventory stock data with product catalog (correct units)
    Promise.all([
      inventoryApi.products(1, 200),
      fetch('/api/products', { headers: getAuthHeaders() }).then(r => r.json()).catch(() => ({ products: [] })),
    ]).then(([inv, cat]) => {
      const catMap = new Map<string, any>()
      ;(cat.products || []).forEach((p: any) => catMap.set(p.id, p))
      const merged = (inv.items || []).map((item: any) => {
        const catProduct = catMap.get(item.product_id) || {}
        // Use catalog unit (normalized) over inventory unit (may be stale "unidade")
        const realUnit = catProduct.unit || item.product_unit || 'kg'
        return { ...item, real_unit: realUnit, catalog: catProduct }
      })
      setItems(merged)
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [refreshKey])

  // Convert unit to kg multiplier
  function unitToKg(unit: string): number {
    const u = (unit || 'kg').toLowerCase().trim()
    const m = u.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g)$/i)
    if (m) { const v = parseFloat(m[1]); return m[2].toLowerCase() === 'g' ? v / 1000 : v }
    if (u === 'kg') return 1
    if (u === 'g') return 0.001
    return 1
  }
  function fmtKg(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(2)} ton`
    return `${v.toFixed(1)} kg`
  }

  const filtered = search
    ? items.filter(p => ((p.product_name || '') as string).toLowerCase().includes(search.toLowerCase()))
    : items

  // Metrics from real data
  const totalKg = items.reduce((s, p) => s + (Number(p.stock_current) || 0) * unitToKg(p.real_unit), 0)
  const availableKg = items.reduce((s, p) => s + (Number(p.stock_available) || 0) * unitToKg(p.real_unit), 0)
  const totalProducts = items.length
  const lowStock = items.filter(p => (p.status || '').toLowerCase() === 'baixo').length
  const zeroStock = items.filter(p => (p.status || '').toLowerCase() === 'zerado' || Number(p.stock_current) === 0).length

  async function executeAction() {
    if (!actionModal || !qty || Number(qty) <= 0) return showToast('Quantidade invalida', 'error')
    const pid = actionModal.product.product_id || actionModal.product.id
    setSaving(true)
    try {
      if (actionModal.type === 'add') {
        await inventoryApi.addStock(pid, { quantity: Number(qty), source: 'reposicao', reason: reason || 'Entrada manual' })
        showToast(`+${qty} adicionado`)
      } else if (actionModal.type === 'remove') {
        await inventoryApi.removeStock(pid, { quantity: Number(qty), source: 'ajuste', reason: reason || 'Saida manual' })
        showToast(`-${qty} removido`)
      } else {
        await inventoryApi.adjustStock(pid, { new_quantity: Number(qty), reason: reason || 'Ajuste manual' })
        showToast(`Ajustado para ${qty}`)
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
        <p className="text-[13px] text-gray-400 mt-0.5">{totalProducts} produtos · {fmtKg(totalKg)} total</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <Scale size={16} className="text-white/50 mb-1.5" />
          <p className="text-[26px] font-extrabold leading-none">{fmtKg(totalKg)}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider mt-1">Total em Peso</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
          <Package size={16} className="text-white/50 mb-1.5" />
          <p className="text-[26px] font-extrabold leading-none">{fmtKg(availableKg)}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider mt-1">Disponivel</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-[26px] font-extrabold text-orange-500 leading-none">{lowStock}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Estoque Baixo</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-[26px] font-extrabold text-red-500 leading-none">{zeroStock}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Sem Estoque</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-gray-300" />
      </div>

      {/* Stock list */}
      <div className="space-y-2">
        {filtered.map((p: any) => {
          const current = Number(p.stock_current) || 0
          const available = Number(p.stock_available) || 0
          const reserved = Number(p.stock_reserved) || 0
          const unit = p.real_unit || 'kg'
          const kgPerUnit = unitToKg(unit)
          const totalKgProduct = current * kgPerUnit
          const sb = stockBadge(p.status)
          const img = p.product_image || p.image_url || ''

          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                {img ? <img src={img} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-gray-100 grid place-items-center shrink-0"><Package size={16} className="text-gray-300" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{p.product_name || 'Produto'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-gray-400">{unit}</span>
                    <span className="text-[10px] text-gray-300">·</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                    {reserved > 0 && <span className="text-[9px] text-amber-600 font-semibold">Reserv: {num(reserved)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold text-gray-900">{num(current)}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">{totalKgProduct >= 1 ? `${totalKgProduct.toFixed(1)} kg` : `${(totalKgProduct * 1000).toFixed(0)} g`}</p>
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => { setActionModal({ type: 'add', product: p }); setQty(''); setReason('') }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition">
                  <ArrowDown size={12} /> Entrada
                </button>
                <button onClick={() => { setActionModal({ type: 'remove', product: p }); setQty(''); setReason('') }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 transition">
                  <ArrowUp size={12} /> Saida
                </button>
                <button onClick={() => { setActionModal({ type: 'adjust', product: p }); setQty(String(current)); setReason('') }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-soft text-brand text-[11px] font-bold hover:bg-brand-light transition">
                  <Scale size={12} /> Ajustar
                </button>
                <div className="flex-1" />
                <span className="text-[10px] text-gray-400">min: {p.stock_min || 0}</span>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-14 text-center">
          <Package size={28} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Nenhum produto encontrado</p>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (() => {
        const current = Number(actionModal.product.stock_current) || 0
        const unit = actionModal.product.real_unit || 'kg'
        const kgPer = unitToKg(unit)
        const numQty = Number(qty || 0)
        const preview = actionModal.type === 'add' ? current + numQty
          : actionModal.type === 'remove' ? current - numQty
          : numQty
        const isAdd = actionModal.type === 'add'
        const isRemove = actionModal.type === 'remove'
        const iconEl = isAdd ? <ArrowDown size={18} className="text-emerald-600" /> : isRemove ? <ArrowUp size={18} className="text-red-500" /> : <Scale size={18} className="text-indigo-600" />
        const iconBg = isAdd ? 'bg-emerald-50' : isRemove ? 'bg-red-50' : 'bg-indigo-50'
        const confirmCls = isAdd ? 'bg-emerald-500 hover:bg-emerald-600' : isRemove ? 'bg-red-500 hover:bg-red-600' : ''
        const previewCls = isAdd ? 'text-emerald-600' : isRemove ? 'text-red-500' : 'text-indigo-600'
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setActionModal(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${iconBg}`}>{iconEl}</div>
                  <div>
                    <h3 className="font-bold text-base text-gray-900">
                      {isAdd ? 'Entrada de Estoque' : isRemove ? 'Saída de Estoque' : 'Ajustar Estoque'}
                    </h3>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{actionModal.product.product_name} · {num(current)} {unit}</p>
                  </div>
                </div>
              </div>
              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">
                    {actionModal.type === 'adjust' ? 'Nova quantidade' : `Quantidade (${unit})`}
                  </label>
                  <input type="text" inputMode="decimal" value={qty}
                    onChange={e => setQty(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                    autoFocus
                    className="w-full text-center text-3xl font-extrabold px-4 py-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition" />
                </div>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition" />
                {qty && numQty > 0 && (
                  <div className="bg-gray-50 rounded-2xl p-3.5 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">Resultado previsto</p>
                    <p className="text-2xl font-extrabold text-gray-900">
                      {actionModal.type !== 'adjust' && <span className="text-gray-400 text-lg mr-1">{num(current)} {isAdd ? '+' : '−'} {qty} =</span>}
                      <span className={previewCls}>{num(preview)}</span>
                      <span className="text-gray-400 text-base ml-1">{unit}</span>
                    </p>
                    {(preview * kgPer) >= 0.01 && <p className="text-[11px] text-gray-400 mt-0.5">{(preview * kgPer).toFixed(1)} kg</p>}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="px-6 pb-6 flex gap-2.5">
                <button onClick={() => setActionModal(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
                <button onClick={executeAction} disabled={saving || !qty || numQty <= 0}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-1.5 ${confirmCls}`}
                  style={!isAdd && !isRemove ? { backgroundColor: 'var(--brand-secondary)' } : undefined}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {saving ? 'Processando...' : isAdd ? 'Adicionar' : isRemove ? 'Remover' : 'Ajustar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
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
        <div className="flex items-center gap-2">
          {/* List/Grid toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
              title="Lista">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="1" width="14" height="2" rx="1" fill="currentColor"/>
                <rect x="0" y="6" width="14" height="2" rx="1" fill="currentColor"/>
                <rect x="0" y="11" width="14" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
              title="Grade">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="8" y="0" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="0" y="8" width="6" height="6" rx="1.5" fill="currentColor"/>
                <rect x="8" y="8" width="6" height="6" rx="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <button onClick={() => setModal({ type: 'edit' })}
            style={{ backgroundColor: 'var(--brand-secondary)' }}
            className="flex items-center gap-1 text-xs font-semibold text-white px-3 py-2 rounded-lg hover:opacity-90 transition">
            <Plus size={14} /> Novo
          </button>
        </div>
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
            style={filter === f.key ? { backgroundColor: 'var(--brand-secondary)' } : undefined}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f.key ? 'text-white border-transparent' : 'bg-white text-gray-500 border-border'
            }`}>{f.label}</button>
        ))}
      </div>

      <p className="text-xs text-muted">{total} produto(s)</p>

      {loading ? <Skeleton rows={4} /> : products.length === 0 ? (
        <EmptyState text="Nenhum produto encontrado" />
      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-2.5">
              {products.map(p => {
                const pid = p.product_id || p.id || ''
                const name = p.product_name || p.name || 'Produto'
                const img = p.product_image || p.image_url || ''
                const sb = stockBadge(p.status)
                return (
                  <div key={pid} onClick={() => setModal({ type: 'actions', product: p })}
                    className="bg-white border border-border rounded-2xl p-3.5 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all">
                    <div className="flex items-start gap-2.5">
                      {img ? <img src={img} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                        : <div className="w-12 h-12 rounded-xl bg-gray-100 grid place-items-center text-gray-300 flex-shrink-0"><Package size={18} /></div>}
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
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.map(p => {
                const pid = p.product_id || p.id || ''
                const name = p.product_name || p.name || 'Produto'
                const img = p.product_image || p.image_url || ''
                const sb = stockBadge(p.status)
                return (
                  <div key={pid} onClick={() => setModal({ type: 'actions', product: p })}
                    className="bg-white border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-gray-300 hover:shadow-md transition-all">
                    {/* Product image */}
                    {img
                      ? <img src={img} alt="" className="w-full aspect-square object-cover bg-gray-100" loading="lazy" />
                      : <div className="w-full aspect-square bg-gray-50 grid place-items-center"><Package size={28} className="text-gray-200" /></div>}
                    {/* Info */}
                    <div className="p-3">
                      <p className="font-bold text-xs leading-tight line-clamp-2 mb-2">{name}</p>
                      <p className="text-sm font-extrabold text-gray-900">{money(p.product_price || p.price)}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sb.cls}`}>{sb.label}</span>
                        <span className="text-[11px] font-bold text-gray-500">{fmtQty(p.stock_available, p.product_unit || p.unit)} {unitShort(p.product_unit || p.unit)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
            style={filter === f ? { backgroundColor: 'var(--brand-secondary)' } : undefined}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f ? 'text-white border-transparent' : 'bg-white text-gray-500 border-border'
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

  function loadAll() {
    setLoading(true)
    Promise.all([
      inventoryApi.reports(dateFrom, dateTo).catch(() => ({})),
      inventoryApi.analytics().catch(() => ({})),
      inventoryApi.overview().catch(() => ({})),
    ]).then(([rpt, anl, ov]) => {
      setReport({ ...rpt, overview: ov })
      setAnalytics(anl)
      setLoading(false)
    })
  }
  useEffect(() => { loadAll() }, [])

  const ms = report?.movement_summary || {}
  const ov = report?.overview || {}
  const topSelling: any[] = Array.isArray(report?.top_selling) ? report.top_selling : []
  const leastMoving: any[] = Array.isArray(report?.least_moving) ? report.least_moving : []
  const daily: any[] = Array.isArray(analytics?.daily_summary) ? analytics.daily_summary : []
  const abc: any[] = Array.isArray(analytics?.abc_curve) ? analytics.abc_curve : []

  // ABC classification
  const totalAbcValue = abc.reduce((s, a) => s + Number(a.stock_value || 0), 0) || 1
  let cumPct = 0
  const abcClassified = abc.map(a => {
    const val = Number(a.stock_value || 0)
    cumPct += (val / totalAbcValue) * 100
    return { ...a, classification: cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C' }
  })

  // Daily chart
  const chartDays = daily.slice(-14)
  const maxDaily = Math.max(...chartDays.map(d => Math.max(Number(d.entries || d.total_entries || 0), Number(d.exits || d.total_exits || 0))), 1)

  // Format date label from ISO or date string
  const fmtDay = (d: string) => {
    try {
      const date = new Date(d)
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`
    } catch { return d?.slice(5, 10) || '' }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Relatorios</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Analise de movimentacoes e estoque</p>
      </div>

      {/* Date filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">De</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Ate</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <button onClick={loadAll} className="px-5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition shadow-sm">
          Filtrar
        </button>
      </div>

      {loading ? <Skeleton rows={6} /> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
              <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Total Entradas</p>
              <p className="text-[26px] font-extrabold leading-none mt-1">{num(ms.total_entries)}</p>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-4 text-white shadow-lg">
              <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Total Saidas</p>
              <p className="text-[26px] font-extrabold leading-none mt-1">{num(ms.total_exits)}</p>
            </div>
            <KpiCard label="Produtos" value={num(ov.total_products)} icon={Package} bg="bg-blue-50" color="text-blue-500" />
            <KpiCard label="Movimentacoes" value={num(ms.total_movements)} icon={ArrowLeftRight} bg="bg-violet-50" color="text-violet-500" />
          </div>

          {/* Top Selling / Least Moving */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-700">Mais Vendidos</p>
              </div>
              {topSelling.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">Sem dados no periodo</p>
              ) : topSelling.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-2.5 border-b border-gray-100 last:border-0">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 grid place-items-center text-[10px] font-extrabold text-emerald-700 shrink-0">{i + 1}</span>
                  <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{p.product_name || '–'}</span>
                  <span className="text-xs font-extrabold text-gray-900">{num(p.total || p.total_sold || p.quantity || 0)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-700">Menos Movimentados</p>
              </div>
              {leastMoving.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">Sem dados no periodo</p>
              ) : leastMoving.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-2.5 border-b border-gray-100 last:border-0">
                  <span className="text-xs font-semibold text-gray-600 flex-1 truncate">{p.product_name || '–'}</span>
                  <span className="text-xs font-semibold text-gray-500">{num(p.total || p.total_sold || p.quantity || 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Daily chart */}
          {chartDays.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
              <p className="text-xs font-bold text-gray-700 mb-3">Movimentacao Diaria</p>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1.5" style={{ minWidth: Math.max(chartDays.length * 45, 300) }}>
                  {chartDays.map((d: any, i: number) => {
                    const entries = Number(d.entries || d.total_entries || 0)
                    const exits = Number(d.exits || d.total_exits || 0)
                    const eH = Math.max(2, (entries / maxDaily) * 100)
                    const xH = Math.max(2, (exits / maxDaily) * 100)
                    const dayLabel = fmtDay(d.day || d.date || d.period || '')
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 min-w-[35px]">
                        <div className="flex gap-0.5 items-end" style={{ height: 110 }}>
                          <div className="w-3.5 bg-emerald-400 rounded-t transition-all" style={{ height: eH }} title={`Entradas: ${entries}`} />
                          <div className="w-3.5 bg-red-400 rounded-t transition-all" style={{ height: xH }} title={`Saidas: ${exits}`} />
                        </div>
                        <span className="text-[8px] text-gray-400 mt-1 font-mono">{dayLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-4 mt-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" /> Entradas</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-400 rounded-sm" /> Saidas</span>
              </div>
            </div>
          )}

          {/* ABC Curve */}
          {abcClassified.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Curva ABC</p>
                <div className="flex gap-2 text-[9px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> A (80%)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> B (95%)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-400" /> C</span>
                </div>
              </div>
              {abcClassified.slice(0, 15).map((a: any, i: number) => {
                const cls = a.classification === 'A' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : a.classification === 'B' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  : 'bg-gray-100 text-gray-500'
                const stockKg = Number(a.stock_current || 0)
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-2.5 border-b border-gray-100 last:border-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{a.classification}</span>
                    <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{a.product_name || '–'}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{num(stockKg)} un</span>
                    <span className="text-xs font-bold text-gray-900">{money(a.stock_value)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
/* ══════════════════════════════════════════════
   CLIENTS VIEW
   ══════════════════════════════════════════════ */
/* ── Lead/prospect statuses (funil de captação) ── */
const LEAD_STATUSES: [string, string, string][] = [
  ['new', 'Novo', 'bg-emerald-100 text-emerald-700'],
  ['contacted', 'Contatado', 'bg-blue-100 text-blue-700'],
  ['negotiating', 'Negociando', 'bg-amber-100 text-amber-800'],
  ['converted', 'Convertido', 'bg-violet-100 text-violet-700'],
  ['lost', 'Perdido', 'bg-red-100 text-red-700'],
  ['inactive', 'Inativo', 'bg-gray-100 text-gray-600'],
]

/* ── Client statuses (evolução do cliente que já comprou) ── */
const CLIENT_STATUSES: [string, string, string][] = [
  ['active', 'Ativo', 'bg-emerald-100 text-emerald-700'],
  ['recurring', 'Recorrente', 'bg-blue-100 text-blue-700'],
  ['vip', 'VIP', 'bg-amber-100 text-amber-800'],
  ['dormant', 'Adormecido', 'bg-orange-100 text-orange-700'],
  ['defaulter', 'Inadimplente', 'bg-red-100 text-red-700'],
  ['blocked', 'Bloqueado', 'bg-gray-300 text-gray-700'],
]
const statusLabel = (s: string) => [...CLIENT_STATUSES, ...LEAD_STATUSES].find(x => x[0] === s) || ['', s, 'bg-gray-100 text-gray-600']

function ClientsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [clients, setClients] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editClient, setEditClient] = useState<any | null>(null)
  const [showForm, setShowForm] = useState(false)
  const limit = 30

  useEffect(() => { loadClients() }, [page])

  function loadClients() {
    setLoading(true)
    inventoryApi.realClients(page, limit, search).then(d => {
      setClients(d.clients || [])
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'error'); setLoading(false) })
  }

  function handleSearch() { setPage(1); loadClients() }

  const totalPages = Math.ceil(total / limit)
  const money = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const dtShort = (v?: string) => { try { return new Date(v!).toLocaleDateString('pt-BR') } catch { return '' } }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">Clientes</h2>
          <p className="text-xs text-gray-400 mt-0.5">Pedidos realizados + cadastros manuais</p>
        </div>
        <button onClick={() => { setEditClient(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-2 text-white text-xs font-bold rounded-xl hover:opacity-90 transition shadow-md"
          style={{ backgroundColor: 'var(--brand-secondary)' }}>
          <UserPlus size={14} /> Novo Cliente
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" placeholder="Buscar nome, telefone, email..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
        </div>
        <button onClick={handleSearch}
          className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
          <Filter size={14} />
        </button>
      </div>

      <p className="text-xs text-gray-400">{total} cliente{total !== 1 ? 's' : ''}</p>

      {loading ? <Skeleton rows={6} /> : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Users size={36} className="opacity-30 mb-2" />
          <p className="text-sm">Nenhum cliente. Realize pedidos ou cadastre manualmente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c, i) => (
            <button key={i} type="button"
              onClick={() => { setEditClient({ ...c, id: c.id || c.phone }); setShowForm(true) }}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 p-3.5 hover:shadow-md hover:border-brand transition-all active:scale-[0.99]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: 'var(--brand-secondary)' }}>
                      {(c.name || c.phone || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-gray-900 truncate">{c.name || '(sem nome)'}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                        {c.phone && <span className="flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1 truncate"><Mail size={10} />{c.email}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                  {Number(c.order_count) > 0 ? (
                    <>
                      <p className="text-sm font-extrabold text-emerald-600">{money(c.total_spent)}</p>
                      <p className="text-[10px] text-gray-400">{c.order_count} pedido{c.order_count !== 1 ? 's' : ''}</p>
                      {c.last_order_at && <p className="text-[10px] text-gray-400">{dtShort(c.last_order_at)}</p>}
                    </>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Manual</span>
                  )}
                  <ChevronRight size={12} className="text-gray-300" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-2 rounded-lg bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-xs font-semibold">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-2 rounded-lg bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {showForm && (
        <Sheet onClose={() => setShowForm(false)} tall>
          <ClientForm client={editClient} showToast={showToast} onSaved={() => {
            setShowForm(false); setEditClient(null); loadClients()
          }} />
        </Sheet>
      )}
    </div>
  )
}

function ClientDetail({ client, onStatusChange }: { client: any; onStatusChange: (s: string) => void }) {
  const [, sLabel, sCls] = statusLabel(client.status)
  const tags = Array.isArray(client.tags) ? client.tags : []
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center font-bold text-lg">
          {(client.name || '?')[0].toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold">{client.name}</h2>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sCls}`}>{sLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm">
        {client.phone && <ClientInfoRow icon={<Phone size={14} />} label="Telefone" value={client.phone} />}
        {client.email && <ClientInfoRow icon={<Mail size={14} />} label="Email" value={client.email} />}
        {client.cpf && <ClientInfoRow icon={<Tag size={14} />} label="CPF" value={client.cpf} />}
        {client.city && <ClientInfoRow icon={<MapPin size={14} />} label="Cidade" value={`${client.city}${client.state ? ` - ${client.state}` : ''}`} />}
        {client.address && <ClientInfoRow icon={<MapPin size={14} />} label="Endereço" value={client.address} />}
        {client.zip_code && <ClientInfoRow icon={<Tag size={14} />} label="CEP" value={client.zip_code} />}
        {client.source && <ClientInfoRow icon={<Tag size={14} />} label="Origem" value={client.source} />}
      </div>
      {client.notes && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Observações</p>
          <p className="text-sm bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}
      {tags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Tags</p>
          <div className="flex gap-1 flex-wrap">
            {tags.map((t: string, i: number) => (
              <span key={i} className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg font-medium">{t}</span>
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
    </div>
  )
}

function ClientInfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <span className="text-sm font-medium truncate">{value}</span>
    </div>
  )
}

/* ── Country phone codes ── */
const COUNTRIES = [
  { code: 'BR', iso: 'br', dial: '+55', name: 'Brasil' },
  { code: 'US', iso: 'us', dial: '+1', name: 'Estados Unidos' },
  { code: 'PT', iso: 'pt', dial: '+351', name: 'Portugal' },
  { code: 'AR', iso: 'ar', dial: '+54', name: 'Argentina' },
  { code: 'UY', iso: 'uy', dial: '+598', name: 'Uruguai' },
  { code: 'PY', iso: 'py', dial: '+595', name: 'Paraguai' },
  { code: 'BO', iso: 'bo', dial: '+591', name: 'Bolivia' },
  { code: 'CL', iso: 'cl', dial: '+56', name: 'Chile' },
  { code: 'CO', iso: 'co', dial: '+57', name: 'Colombia' },
  { code: 'VE', iso: 've', dial: '+58', name: 'Venezuela' },
  { code: 'PE', iso: 'pe', dial: '+51', name: 'Peru' },
  { code: 'MX', iso: 'mx', dial: '+52', name: 'Mexico' },
  { code: 'EC', iso: 'ec', dial: '+593', name: 'Equador' },
  { code: 'ES', iso: 'es', dial: '+34', name: 'Espanha' },
  { code: 'IT', iso: 'it', dial: '+39', name: 'Italia' },
  { code: 'DE', iso: 'de', dial: '+49', name: 'Alemanha' },
  { code: 'FR', iso: 'fr', dial: '+33', name: 'França' },
  { code: 'GB', iso: 'gb', dial: '+44', name: 'Reino Unido' },
  { code: 'NL', iso: 'nl', dial: '+31', name: 'Holanda' },
  { code: 'CH', iso: 'ch', dial: '+41', name: 'Suíça' },
  { code: 'CN', iso: 'cn', dial: '+86', name: 'China' },
  { code: 'JP', iso: 'jp', dial: '+81', name: 'Japão' },
  { code: 'CA', iso: 'ca', dial: '+1', name: 'Canadá' },
  { code: 'AU', iso: 'au', dial: '+61', name: 'Austrália' },
]

/* ── Flag component using flagcdn.com ── */
function Flag({ iso, size = 20 }: { iso: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      width={size} height={Math.round(size * 0.75)}
      alt={iso.toUpperCase()}
      className="rounded-sm object-cover shadow-sm ring-1 ring-black/5"
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  )
}

/* ── Formatters ── */
function fmtCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}
function fmtPhone(v: string, dial = '+55') {
  const d = v.replace(/\D/g, '')
  if (dial === '+55') {
    if (d.length <= 2) return d.length ? `(${d}` : ''
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`
  }
  return v // other countries: raw
}
function fmtCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0,5)}-${d.slice(5)}`
}

function ClientForm({ client, showToast, onSaved }: {
  client: any | null
  showToast: (t: string, tp?: 'success' | 'error') => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<'dados' | 'endereco' | 'historico' | 'notas'>('dados')
  const [name, setName] = useState(client?.name || '')
  const [countryCode, setCountryCode] = useState('BR')
  const [phone, setPhone] = useState(client?.phone || '')
  const [email, setEmail] = useState(client?.email || '')
  const [cpf, setCpf] = useState(client?.cpf || '')
  const [birthDate, setBirthDate] = useState(client?.birth_date ? String(client.birth_date).slice(0, 10) : '')
  const [clientType, setClientType] = useState(client?.client_type || '')
  const [status, setStatus] = useState(client?.status || 'active')
  const [address, setAddress] = useState(client?.address || '')
  const [city, setCity] = useState(client?.city || '')
  const [stateUF, setStateUF] = useState(client?.state || '')
  const [zipCode, setZipCode] = useState(client?.zip_code || '')
  const [notes, setNotes] = useState(client?.notes || '')
  const [tags, setTags] = useState((Array.isArray(client?.tags) ? client.tags : []).join(', '))
  const [orders, setOrders] = useState<any[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const [clientTypes, setClientTypes] = useState<any[]>([])
  const [showNewType, setShowNewType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState('#10b981')
  const [creatingType, setCreatingType] = useState(false)

  function apiHeaders(): any {
    const token = localStorage.getItem('lead-system-token')
    const brandId = localStorage.getItem('lead-system:active-brand-id')
    return { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(brandId && { 'x-brand-id': brandId }) }
  }

  async function createClientType() {
    if (!newTypeName.trim()) { showToast('Digite o nome do tipo', 'error'); return }
    setCreatingType(true)
    try {
      const r = await fetch('/api/client-types', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ name: newTypeName.trim(), color: newTypeColor, icon: 'users' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar tipo')
      const newType = d.type || d
      setClientTypes(prev => [...prev, newType])
      setClientType(newType.name)
      setNewTypeName('')
      setShowNewType(false)
      showToast('Tipo criado!')
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setCreatingType(false) }
  }

  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]

  useEffect(() => {
    fetch('/api/client-types', { headers: apiHeaders() })
      .then(r => r.json())
      .then(d => setClientTypes(d.types || d.client_types || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (client?.phone && tab === 'historico' && !orders.length) {
      setLoadingOrders(true)
      fetch(`/api/orders?customer=${encodeURIComponent(client.phone)}&limit=20`, { headers: apiHeaders() })
        .then(r => r.json()).then(d => { setOrders(d.orders || []); setLoadingOrders(false) })
        .catch(() => setLoadingOrders(false))
    }
  }, [tab])

  function validateEmail(v: string) {
    if (!v) { setEmailError(''); return true }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    setEmailError(ok ? '' : 'Email inválido')
    return ok
  }

  async function submit() {
    if (!name.trim()) { showToast('Nome é obrigatório', 'error'); return }
    if (email && emailError) { showToast('Corrija o email', 'error'); return }
    setSaving(true)
    const data: Record<string, any> = {
      name: name.trim(),
      phone: phone.replace(/\D/g, '').length > 0 ? (country.dial.replace('+', '') + phone.replace(/\D/g, '')) : null,
      email: email.trim().toLowerCase() || null,
      cpf: cpf.replace(/\D/g, '') || null,
      birth_date: birthDate || null,
      client_type: clientType || null,
      status,
      address: address.trim() || null,
      city: city.trim() || null,
      state: stateUF.trim().toUpperCase() || null,
      zip_code: zipCode.replace(/\D/g, '') || null,
      notes: notes.trim() || null,
      tags: tags.split(',').map((s: string) => s.trim()).filter(Boolean),
      source: 'manual',
    }
    try {
      if (client?.id) {
        await inventoryApi.updateClient(client.id, data)
        showToast('Cliente atualizado!')
      } else {
        await inventoryApi.createClient(data)
        showToast('Cliente cadastrado!')
      }
      onSaved()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const inp = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
  const totalSpent = orders.reduce((a, o) => a + Number(o.valor_total || 0), 0)
  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const TABS = [
    { id: 'dados', label: 'Dados', icon: User },
    { id: 'endereco', label: 'Endereço', icon: MapPin },
    { id: 'historico', label: 'Histórico', icon: TrendingUp },
    { id: 'notas', label: 'Notas', icon: FileText },
  ] as const

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header (fixed) */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          <div className="w-12 h-12 rounded-2xl grid place-items-center text-white font-bold text-lg shrink-0 shadow-lg"
            style={{ backgroundColor: 'var(--brand-secondary)' }}>
            {(name || client?.name || '?')[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{client ? (name || 'Editar Cliente') : 'Novo Cliente'}</h2>
            <p className="text-xs text-gray-400">{client ? 'Atualize os dados do cliente' : 'Preencha os dados para cadastrar'}</p>
          </div>
        </div>
      </div>

      {/* Tabs (fixed) */}
      <div className="shrink-0 flex border-b border-gray-100 px-4 bg-white">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={tab === t.id ? { borderColor: 'var(--brand-secondary)', color: 'var(--brand-secondary)' } : undefined}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all -mb-px ${
              tab === t.id ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <t.icon size={13} />{t.label}
          </button>
        ))}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* Tab: Dados */}
      {tab === 'dados' && (
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nome completo *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" className={inp} />
          </div>

          {/* Phone with country picker */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Telefone / WhatsApp</label>
            <div className="flex gap-2">
              <div className="relative">
                <button type="button" onClick={() => setShowCountryPicker(!showCountryPicker)}
                  className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white hover:bg-gray-50 transition whitespace-nowrap h-full">
                  <Flag iso={country.iso} size={22} />
                  <span className="text-xs font-semibold text-gray-700">{country.dial}</span>
                  <ChevronRight size={12} className={`text-gray-400 transition-transform ${showCountryPicker ? 'rotate-90' : ''}`} />
                </button>
                {showCountryPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowCountryPicker(false)} />
                    <div className="absolute top-full left-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto">
                      {COUNTRIES.map(c => (
                        <button key={c.code} type="button"
                          onClick={() => { setCountryCode(c.code); setShowCountryPicker(false) }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-gray-50 transition border-b border-gray-50 last:border-0 ${countryCode === c.code ? 'bg-emerald-50' : ''}`}>
                          <Flag iso={c.iso} size={22} />
                          <span className="font-mono text-gray-400 w-12 text-left">{c.dial}</span>
                          <span className={`flex-1 text-left ${countryCode === c.code ? 'font-bold text-emerald-700' : 'text-gray-700'}`}>{c.name}</span>
                          {countryCode === c.code && <CheckCircle2 size={14} className="text-emerald-500" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <input value={phone}
                onChange={e => setPhone(fmtPhone(e.target.value, country.dial))}
                placeholder={country.dial === '+55' ? '(11) 99999-9999' : 'Número...'}
                className={inp + " flex-1"} inputMode="tel" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Email</label>
            <input value={email} type="email"
              onChange={e => { setEmail(e.target.value); validateEmail(e.target.value) }}
              onBlur={e => validateEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className={inp + (emailError ? ' border-red-300 ring-2 ring-red-100' : '')} />
            {emailError && <p className="text-[11px] text-red-500 mt-1">{emailError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* CPF with auto format */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">CPF</label>
              <input value={cpf}
                onChange={e => setCpf(fmtCPF(e.target.value))}
                placeholder="000.000.000-00" inputMode="numeric" className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nascimento</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Client type with inline create */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Tipo de cliente</label>
              <button type="button" onClick={() => setShowNewType(!showNewType)}
                className="flex items-center gap-1 text-[11px] font-semibold hover:opacity-80 transition"
                style={{ color: 'var(--brand-secondary)' }}>
                <Plus size={12} /> Novo tipo
              </button>
            </div>

            {/* Quick-select chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button type="button" onClick={() => setClientType('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  !clientType ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>Sem tipo</button>
              {clientTypes.map((t: any) => (
                <button key={t.id} type="button" onClick={() => setClientType(t.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    clientType === t.name ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                  style={clientType === t.name ? { backgroundColor: t.color || 'var(--brand-secondary)' } : undefined}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: clientType === t.name ? 'white' : (t.color || 'var(--brand-secondary)') }} />
                  {t.name}
                </button>
              ))}
            </div>

            {/* Inline create form */}
            {showNewType && (
              <div className="bg-brand-soft rounded-xl p-3 space-y-2.5" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--brand-secondary)' }}>
                <p className="text-[11px] font-bold uppercase" style={{ color: 'var(--brand-secondary)' }}>Criar novo tipo</p>
                <div className="flex gap-2">
                  <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)}
                    className="w-11 h-11 rounded-lg border border-gray-200 cursor-pointer bg-white" />
                  <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), createClientType())}
                    placeholder="Ex: VIP, Atacado, Site, Revendedor..."
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowNewType(false); setNewTypeName('') }}
                    className="flex-1 py-2 rounded-xl bg-white text-gray-600 text-xs font-bold hover:bg-gray-50 transition border border-gray-200">
                    Cancelar
                  </button>
                  <button type="button" onClick={createClientType} disabled={creatingType || !newTypeName.trim()}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1"
                    style={{ backgroundColor: 'var(--brand-secondary)' }}>
                    {creatingType ? <Loader2 size={13} className="animate-spin" /> : <><CheckCircle2 size={13} /> Criar</>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {CLIENT_STATUSES.map(([v, l, cls]) => (
                <button key={v} type="button" onClick={() => setStatus(v)}
                  className={`py-2 rounded-xl text-xs font-bold border-2 transition ${
                    status === v ? cls + ' border-current' : 'border-gray-100 text-gray-400 hover:border-gray-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Tags (separadas por vírgula)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, atacado, recorrente" className={inp} />
            {tags && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {tags.split(',').map((t: string, i: number) => t.trim() && (
                  <span key={i} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{t.trim()}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Endereço */}
      {tab === 'endereco' && (
        <div className="space-y-4">
          {/* CEP with auto format */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">CEP</label>
            <input value={zipCode}
              onChange={e => setZipCode(fmtCEP(e.target.value))}
              placeholder="00000-000" inputMode="numeric" className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Endereço</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, complemento" className={inp} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Cidade</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" className={inp} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">UF</label>
              <input value={stateUF} onChange={e => setStateUF(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} className={inp + " uppercase"} />
            </div>
          </div>
          {/* Mini map preview if address filled */}
          {(address || city) && (
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 text-sm text-gray-500">
              <MapPin size={14} className="text-emerald-500 shrink-0" />
              <span>{[address, city, stateUF].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab: Histórico */}
      {tab === 'historico' && (
        <div className="space-y-3">
          {!client?.id ? (
            <div className="flex flex-col items-center py-8 text-gray-400">
              <TrendingUp size={32} className="opacity-30 mb-2" />
              <p className="text-sm">Salve o cliente primeiro para ver o histórico</p>
            </div>
          ) : loadingOrders ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand-secondary)' }} /></div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-extrabold text-emerald-700">{orders.length}</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Pedidos</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-extrabold text-blue-700">{money(totalSpent)}</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Total gasto</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-extrabold text-amber-700">{orders.length > 0 ? money(totalSpent / orders.length) : '—'}</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Ticket médio</p>
                </div>
              </div>
              {orders.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-gray-400">
                  <ShoppingCart size={28} className="opacity-30 mb-2" />
                  <p className="text-sm">Nenhum pedido encontrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((o: any) => (
                    <div key={o.id} className="bg-white border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-700">#{String(o.id).slice(-6).toUpperCase()}</p>
                          <p className="text-[10px] text-gray-400">{o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600">{money(Number(o.valor_total || 0))}</p>
                          <p className="text-[10px] text-gray-400 capitalize">{o.status || o.situation || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Notas */}
      {tab === 'notas' && (
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Anotações internas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={10}
            placeholder="Observações, preferências, histórico de conversas..."
            className={inp + " resize-none"} />
          <p className="text-[10px] text-gray-400 mt-1.5">Visível apenas internamente. Use para anotar preferências, negociações, etc.</p>
        </div>
      )}
      </div>

      {/* Save button (fixed bottom) */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button onClick={submit} disabled={saving}
          className="w-full py-3.5 text-white font-bold rounded-2xl hover:opacity-90 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--brand-secondary)' }}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={16} />{client ? 'Salvar Alterações' : 'Cadastrar Cliente'}</>}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════ */

/* ── Sheet wrapper ── */
function Sheet({ children, onClose, tall }: { children: React.ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      style={{ animation: 'fadeIn .15s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg flex flex-col ${tall ? 'h-[94vh] sm:h-[90vh]' : 'max-h-[90vh]'} shadow-2xl overflow-hidden`}
        style={{ animation: 'slideUp .2s cubic-bezier(0.16,1,0.3,1)' }}>
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center transition shrink-0">
          <X size={14} className="text-gray-500" />
        </button>
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
  const [selectedName, setSelectedName] = useState(product?.product_name || product?.name || '')
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
    if (!selectedPid || !qty || Number(qty) <= 0) { showToast('Informe a quantidade', 'error'); return }
    setSaving(true)
    try {
      await inventoryApi.addStock(selectedPid, { quantity: Number(qty), source, reason })
      showToast('Entrada registrada ✓')
      onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const sourceOptions: [string, string][] = [['reposicao', 'Reposição'], ['devolucao', 'Devolução'], ['inventario', 'Inventário'], ['correcao', 'Correção']]

  return (
    <Sheet onClose={onClose}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 grid place-items-center shrink-0">
            <ArrowDown size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Entrada de Estoque</h2>
            <p className="text-xs text-gray-400 truncate max-w-[220px]">{selectedName || 'Selecione um produto'}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {!product && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Produto</label>
            <input type="search" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)}
              className={fieldBase} />
            {search && (
              <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50 shadow-sm">
                {filteredProducts.slice(0, 10).map(p => (
                  <button key={p.product_id || p.id} onClick={() => {
                    setSelectedPid(p.product_id || p.id || '')
                    setSelectedName(p.product_name || p.name || '')
                    setSearch('')
                  }} className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition ${selectedPid === (p.product_id || p.id) ? 'bg-emerald-50 font-semibold text-emerald-700' : ''}`}>
                    {p.product_name || p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Big quantity field */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Quantidade</label>
          <input type="text" inputMode="decimal" value={qty}
            onChange={e => setQty(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            className="w-full text-center text-3xl font-extrabold px-4 py-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition"
            autoFocus={!!product} />
        </div>

        {/* Source chips */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Motivo</label>
          <div className="grid grid-cols-2 gap-2">
            {sourceOptions.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSource(v)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition ${source === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <FieldText label="Observação (opcional)" value={reason} onChange={setReason} placeholder="Ex: NF 1234, fornecedor..." />
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-2.5">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
        <button onClick={submit} disabled={saving || !selectedPid}
          className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-sm">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><ArrowDown size={14} /> Confirmar Entrada</>}
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
  const name = product.product_name || product.name || 'Produto'
  const current = Number(product.stock_available ?? product.stock_current ?? 0)
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('manual')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const sourceOptions: [string, string][] = [['manual', 'Manual'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção']]
  const preview = current - Number(qty || 0)
  const overDraw = preview < 0

  async function submit() {
    if (!reason.trim()) { showToast('Informe a observação', 'error'); return }
    if (!qty || Number(qty) <= 0) { showToast('Informe a quantidade', 'error'); return }
    setSaving(true)
    try {
      await inventoryApi.removeStock(pid, { quantity: Number(qty), source, reason })
      showToast('Saída registrada ✓'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-red-50 grid place-items-center shrink-0">
            <ArrowUp size={20} className="text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Saída de Estoque</h2>
            <p className="text-xs text-gray-400 truncate max-w-[220px]">{name} · atual: {num(current)}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Quantidade a remover</label>
          <input type="text" inputMode="decimal" value={qty}
            onChange={e => setQty(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            autoFocus
            className={`w-full text-center text-3xl font-extrabold px-4 py-4 border-2 rounded-2xl focus:outline-none focus:ring-4 transition ${overDraw ? 'border-red-300 focus:border-red-400 focus:ring-red-100 text-red-600' : 'border-gray-200 focus:border-red-400 focus:ring-red-100'}`} />
          {qty && Number(qty) > 0 && (
            <div className={`rounded-xl p-3 text-center text-sm font-bold ${overDraw ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>
              {num(current)} − {qty} = <span className={overDraw ? 'text-red-600' : 'text-gray-900'}>{num(preview)}</span>
              {overDraw && <span className="block text-xs font-normal mt-0.5">⚠ Abaixo do disponível</span>}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Motivo</label>
          <div className="grid grid-cols-2 gap-2">
            {sourceOptions.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSource(v)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition ${source === v ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <FieldText label="Observação (obrigatória)" value={reason} onChange={setReason} placeholder="Descreva o motivo da saída..." />
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-2.5">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
        <button onClick={submit} disabled={saving}
          className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-sm">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><ArrowUp size={14} /> Confirmar Saída</>}
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
  const name = product.product_name || product.name || 'Produto'
  const current = Number(product.stock_available ?? product.stock_current ?? 0)
  const [qty, setQty] = useState(String(current))
  const [reason, setReason] = useState('inventario')
  const [saving, setSaving] = useState(false)
  const reasonOptions: [string, string][] = [['inventario', 'Inventário'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção'], ['devolucao', 'Devolução']]
  const newQty = Number(qty || 0)
  const diff = newQty - current
  const isUp = diff > 0

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.adjustStock(pid, { new_quantity: newQty, reason })
      showToast('Ajuste registrado ✓'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 grid place-items-center shrink-0">
            <Scale size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Ajuste de Inventário</h2>
            <p className="text-xs text-gray-400 truncate max-w-[220px]">{name} · atual: {num(current)}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Nova quantidade</label>
          <input type="text" inputMode="decimal" value={qty}
            onChange={e => setQty(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            autoFocus
            className="w-full text-center text-3xl font-extrabold px-4 py-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition" />
          {qty !== String(current) && (
            <div className={`rounded-xl p-3 text-center text-sm font-bold ${isUp ? 'bg-emerald-50 text-emerald-700' : newQty < current ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'}`}>
              {current} → {newQty} {diff !== 0 && <span className="ml-1">({isUp ? '+' : ''}{diff})</span>}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">Motivo do ajuste</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {reasonOptions.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setReason(v)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition ${reason === v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-2.5">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
        <button onClick={submit} disabled={saving}
          className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: 'var(--brand-secondary)' }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><Scale size={14} /> Confirmar Ajuste</>}
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
  const name = product.product_name || product.name || 'Produto'
  const img = product.product_image || product.image_url || ''
  const [minStock, setMinStock] = useState(String(product.stock_min || 5))
  const [costPrice, setCostPrice] = useState(String(product.cost_price || 0))
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.updateSettings(pid, { stock_min: Number(minStock), cost_price: Number(costPrice) })
      showToast('Configuração salva ✓'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          {img
            ? <img src={img} alt="" className="w-11 h-11 rounded-2xl object-cover shrink-0 ring-1 ring-gray-200" />
            : <div className="w-11 h-11 rounded-2xl bg-gray-100 grid place-items-center shrink-0"><Settings size={18} className="text-gray-400" /></div>}
          <div>
            <h2 className="text-base font-bold text-gray-900">Configurações</h2>
            <p className="text-xs text-gray-400 truncate max-w-[220px]">{name}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Alerta de estoque mínimo</span>
          </div>
          <label className="text-[11px] font-semibold text-amber-600 block">Quando estoque cair abaixo de:</label>
          <input type="text" inputMode="decimal" value={minStock}
            onChange={e => setMinStock(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full text-center text-2xl font-extrabold px-4 py-3 border-2 border-amber-200 rounded-xl bg-white focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition" />
          <p className="text-[11px] text-amber-600/70">Você receberá alerta quando o estoque atingir esse nível</p>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <Banknote size={14} className="text-gray-500" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Preço de custo</span>
          </div>
          <label className="text-[11px] font-semibold text-gray-500 block">Valor de custo unitário (R$):</label>
          <input type="text" inputMode="decimal" value={costPrice}
            onChange={e => setCostPrice(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            className="w-full text-center text-2xl font-extrabold px-4 py-3 border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-100 transition" />
          <p className="text-[11px] text-gray-400">Usado para calcular margem de lucro nos relatórios</p>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-2.5">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
        <button onClick={submit} disabled={saving}
          className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: 'var(--brand-secondary)' }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Salvar Configurações</>}
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
  const name = product.product_name || product.name || 'Produto'
  const img = product.product_image || product.image_url || ''
  const [items, setItems] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    inventoryApi.productHistory(pid)
      .then(d => setItems(Array.isArray(d.history) ? d.history : []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [pid])

  return (
    <Sheet onClose={onClose} tall>
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 pr-10">
          {img
            ? <img src={img} alt="" className="w-11 h-11 rounded-2xl object-cover shrink-0 ring-1 ring-gray-200" />
            : <div className="w-11 h-11 rounded-2xl bg-gray-100 grid place-items-center shrink-0"><History size={18} className="text-gray-400" /></div>}
          <div>
            <h2 className="text-base font-bold text-gray-900">Histórico de Movimentações</h2>
            <p className="text-xs text-gray-400 truncate max-w-[220px]">{name} · {items.length} registros</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" style={{ color: 'var(--brand-secondary)' }} size={28} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <History size={36} className="text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">Nenhuma movimentação encontrada</p>
            <p className="text-xs text-gray-400 mt-1">As entradas e saídas aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((m, i) => {
              const mb = movBadge(m.type)
              const qty = Number(m.quantity || 0)
              const isPos = m.type === 'entrada' || m.type === 'liberacao'
              return (
                <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3.5 flex items-center gap-3 hover:border-gray-200 transition">
                  <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${mb.cls}`}>
                    <mb.icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${mb.cls}`}>{mb.label}</span>
                      {m.source && <span className="text-[10px] text-gray-400">{m.source}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{dt(m.created_at)}</p>
                    {m.reason && <p className="text-[11px] text-gray-500 italic mt-0.5 truncate">{m.reason}</p>}
                  </div>
                  <span className={`text-base font-extrabold whitespace-nowrap ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isPos ? '+' : '−'}{num(Math.abs(qty))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-100">
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Fechar</button>
      </div>
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
  const price = product.product_price || product.price
  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    setSharing(true)
    try {
      // Try to get brand slug for catalog URL
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const token = localStorage.getItem('lead-system-token') || ''
      let brandSlug = ''
      try {
        const r = await fetch('/api/brands', { headers: { 'Authorization': `Bearer ${token}` } })
        const d = await r.json()
        const b = (d.brands || []).find((x: any) => String(x.id) === String(brandId)) || (d.brands || [])[0]
        brandSlug = b?.slug || ''
      } catch {}

      const productSlug = (product as any).slug || product.product_id || product.id
      const base = window.location.origin
      const shareUrl = brandSlug
        ? `${base}/catalogo/${brandSlug}/produto/${productSlug}`
        : `${base}/produto/${productSlug}`

      const shareData: ShareData = {
        title: name,
        text: `Confira: ${name} — ${money(price)}`,
        url: shareUrl,
      }

      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        showToast('Compartilhado!')
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        showToast('Link copiado!')
      } else {
        prompt('Copie o link do produto:', shareUrl)
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') showToast('Erro ao compartilhar', 'error')
    } finally {
      setSharing(false)
    }
  }

  const actions = [
    { type: 'add', label: 'Entrada', icon: ArrowDown, color: '#10b981', bg: 'bg-emerald-50' },
    ...(!isD ? [{ type: 'remove', label: 'Saída', icon: ArrowUp, color: '#ef4444', bg: 'bg-red-50' }] : []),
    { type: 'adjust', label: 'Ajuste', icon: Scale, color: '#6366f1', bg: 'bg-indigo-50' },
    { type: 'edit', label: 'Editar', icon: Pencil, color: 'var(--brand-secondary)', bg: 'bg-brand-soft' },
    { type: 'history', label: 'Histórico', icon: History, color: '#6b7280', bg: 'bg-gray-100' },
    { type: 'settings', label: 'Configurar', icon: Settings, color: '#6b7280', bg: 'bg-gray-100' },
  ]

  const stockCurrent = Number(product.stock_available || 0)
  const stockMin = Number(product.stock_min || 0)
  const lowStock = stockMin > 0 && stockCurrent <= stockMin
  const outOfStock = stockCurrent <= 0

  return (
    <Sheet onClose={onClose}>
      {/* Premium header with product image */}
      <div className="p-5 pb-4">
        <div className="flex items-start gap-3.5 pr-10">
          {img ? (
            <img src={img} alt="" className="w-20 h-20 rounded-2xl object-cover bg-gray-100 ring-1 ring-gray-200 shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 grid place-items-center shrink-0">
              <Package size={28} className="text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-base font-bold text-gray-900 leading-tight line-clamp-2">{name}</h2>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full uppercase">{unitShort(product.product_unit || product.unit)}</span>
              <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{typeLabel(product.product_type)}</span>
              {lowStock && !outOfStock && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ Estoque baixo</span>
              )}
              {outOfStock && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Sem estoque</span>
              )}
            </div>
            <p className="text-xl font-extrabold mt-1.5" style={{ color: 'var(--brand-secondary)' }}>{money(price)}</p>
          </div>
        </div>

        {/* Stock stats */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: 'var(--brand-secondary-soft)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-secondary)' }}>Disponível</p>
            <p className="font-extrabold text-lg text-gray-900">{fmtQty(product.stock_available, product.product_unit || product.unit)}</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 text-center">
            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-1">Reservado</p>
            <p className="font-extrabold text-lg text-gray-900">{num(product.stock_reserved)}</p>
          </div>
          <div className="bg-gray-100 rounded-2xl p-3 text-center">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Mínimo</p>
            <p className="font-extrabold text-lg text-gray-900">{num(product.stock_min)}</p>
          </div>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {actions.map(a => (
            <button key={a.type} onClick={() => { onClose(); setTimeout(() => onAction(a.type, product), 100) }}
              className={`${a.bg} flex flex-col items-center gap-1.5 py-3.5 rounded-2xl hover:opacity-80 transition active:scale-95`}>
              <a.icon size={20} style={{ color: a.color }} />
              <span className="text-[11px] font-bold text-gray-700">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Share button — full width at bottom */}
        <button onClick={handleShare} disabled={sharing}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-50 shadow-md"
          style={{ backgroundColor: 'var(--brand-secondary)' }}>
          {sharing ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
          {sharing ? 'Compartilhando...' : 'Compartilhar Produto'}
        </button>
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
        <button onClick={submit} disabled={saving} style={{ backgroundColor: 'var(--brand-secondary)' }} className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition">
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
  const [loading, setLoading] = useState(false)

  // Pre-fill from inventory product data + fetch catalog for extra fields
  const [name, setName] = useState(product?.product_name || product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [unit, setUnit] = useState('kg')
  const [price, setPrice] = useState(product?.product_price || product?.price ? String(product.product_price || product.price) : '')
  const [promoPrice, setPromoPrice] = useState(product?.promoPrice || product?.promo_price ? String(product.promoPrice || product.promo_price) : '')
  const [category, setCategory] = useState(product?.category || '')
  const [active, setActive] = useState(product?.active !== false && product?.is_active !== false)
  const [features, setFeatures] = useState(Array.isArray(product?.features) ? product.features.join(', ') : (product?.features || ''))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState(product?.product_image || product?.image_url || product?.imageUrl || product?.image || '')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch full product details from catalog list (GET /:id doesn't exist)
  useEffect(() => {
    if (!pid) return
    setLoading(true)
    fetch('/api/products', { headers: getAuthHeaders() })
      .then(r => r.json()).then(d => {
        const p = (d.products || []).find((x: any) => x.id === pid)
        if (p) {
          setName(p.name || name)
          setDescription(p.description || '')
          setUnit(p.unit || 'kg')
          setPrice(String(p.price || price))
          setPromoPrice(String(p.promoPrice || p.promo_price || ''))
          setCategory(p.category || '')
          setActive(p.active !== false && p.is_active !== false)
          setFeatures(Array.isArray(p.features) ? p.features.join(', ') : '')
          setImagePreview(p.imageUrl || p.image || imagePreview)
        }
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
    ['kg', 'Quilograma (kg)'], ['g', 'Grama (g)'], ['500g', '500 gramas'],
    ['250g', '250 gramas'], ['10kg', '10 quilogramas'], ['un', 'Unidade'],
    ['L', 'Litro (L)'], ['ml', 'Mililitro (ml)'], ['cx', 'Caixa'],
    ['pct', 'Pacote'], ['par', 'Par'],
  ]

  const inp = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"

  return (
    <Sheet onClose={onClose}>
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3 mb-5 pr-10">
          <div className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0"
            style={{ backgroundColor: 'var(--brand-secondary)' }}>
            <Package size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{isNew ? 'Novo Produto' : 'Editar Produto'}</h2>
            <p className="text-xs text-gray-400">{isNew ? 'Cadastre um novo produto' : 'Atualize os dados do produto'}</p>
          </div>
        </div>

        {/* Image uploader */}
        <div className="mb-4">
          <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={onFileChange} />
          <button onClick={pickImage}
            className="w-full aspect-[16/9] max-h-44 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-gray-100 hover:border-brand transition overflow-hidden relative">
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="" className="w-full h-full object-contain" />
                <span className="absolute bottom-2 right-2 bg-white/90 backdrop-blur text-gray-700 text-[10px] font-bold px-2 py-1 rounded-full shadow">
                  Trocar imagem
                </span>
              </>
            ) : (
              <>
                <Upload size={28} className="text-gray-400" />
                <span className="text-xs text-gray-500 font-semibold">Clique para enviar imagem</span>
                <span className="text-[10px] text-gray-400">PNG, JPG ou WebP</span>
              </>
            )}
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do produto" className={inp} />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Descrição</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Breve descrição do produto..."
              className={inp + " resize-none"} />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Unidade</label>
            <select value={unit} onChange={e => setUnit(e.target.value)} className={inp}>
              {unitOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Preço</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">R$</span>
                <input type="text" inputMode="decimal"
                  value={price}
                  onChange={e => setPrice(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  placeholder="0,00"
                  className={inp + " pl-9"} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Preço Promo</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">R$</span>
                <input type="text" inputMode="decimal"
                  value={promoPrice}
                  onChange={e => setPromoPrice(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  placeholder="0,00"
                  className={inp + " pl-9"} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inp}>
              <option value="">Nenhuma</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Status</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setActive(true)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition ${
                  active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'
                }`}
                style={active ? { backgroundColor: 'var(--brand-secondary)' } : undefined}>
                ✓ Ativo
              </button>
              <button type="button" onClick={() => setActive(false)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition ${
                  !active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                }`}>
                Inativo
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Destaques</label>
            <input value={features} onChange={e => setFeatures(e.target.value)}
              placeholder="Ex: sem glúten, orgânico" className={inp} />
            <p className="text-[10px] text-gray-400 mt-1">Separe por vírgulas</p>
          </div>
        </div>

        <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition">
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition shadow-md flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--brand-secondary)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} />{isNew ? 'Criar Produto' : 'Salvar'}</>}
          </button>
        </div>
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
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={fieldBase} />
    </div>
  )
}
function FieldNumber({ label, value, onChange, min, step }: { label: string; value: string; onChange: (v: string) => void; min?: number; step?: string }) {
  // Use text input with inputMode to avoid number spinner arrows
  function filter(v: string) {
    const cleaned = v.replace(/[^0-9.,]/g, '').replace(',', '.')
    onChange(cleaned)
  }
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">{label}</label>
      <input type="text" inputMode="decimal" value={value} onChange={e => filter(e.target.value)}
        placeholder={min !== undefined ? String(min) : '0'}
        className={fieldBase + " text-center text-2xl font-extrabold"} />
    </div>
  )
}
function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={fieldBase}>
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
  const [scheduleOrder, setScheduleOrder] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([])
  const [showClientSugg, setShowClientSugg] = useState(false)
  const clientSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
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

  function searchClients(q: string) {
    clearTimeout(clientSearchTimer.current)
    if (q.length < 2) { setClientSuggestions([]); setShowClientSugg(false); return }
    clientSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clients?search=${encodeURIComponent(q)}&limit=8`, { headers: getAuthHeaders() })
        const d = await r.json()
        setClientSuggestions(d.clients || [])
        setShowClientSugg(true)
      } catch { setClientSuggestions([]) }
    }, 300)
  }

  function selectClient(c: any) {
    setCustomerName(c.name || '')
    setCustomerPhone(c.phone || '')
    setCustomerEmail(c.email || '')
    setClientSuggestions([])
    setShowClientSugg(false)
  }

  async function submitOrder() {
    if (cart.length === 0) { showToast('Carrinho vazio', 'error'); return }
    if (!customerName.trim()) { showToast('Informe o nome do cliente', 'error'); return }
    setSaving(true)
    try {
      const originLabel = ORIGINS.find(o => o[0] === origin)?.[1].replace(/.*\s/, '') || origin
      const payload = {
        itens: cart.map(c => ({
          product_id: c.product_id,
          quantity: c.qty,
          unit_price: c.price,
          product_name: c.product_name,
        })),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        forma_pagamento: paymentMethod,
        origin: origin,
        channel: origin,
        notes: [notes.trim(), `Canal: ${originLabel}`].filter(Boolean).join(' | '),
        scheduled_at: scheduleOrder && scheduledAt ? scheduledAt : undefined,
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
                      <input type="text" value={customerName}
                        onChange={e => { setCustomerName(e.target.value); searchClients(e.target.value) }}
                        onBlur={() => setTimeout(() => setShowClientSugg(false), 200)}
                        onFocus={() => customerName.length >= 2 && clientSuggestions.length > 0 && setShowClientSugg(true)}
                        placeholder="Nome completo ou buscar cadastrado..."
                        autoComplete="off"
                        className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                      {showClientSugg && clientSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                          <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-100">Clientes cadastrados</p>
                          {clientSuggestions.map((c: any) => (
                            <button key={c.id} onMouseDown={() => selectClient(c)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 transition text-left border-b border-gray-50 last:border-0">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-emerald-700">{(c.name || '?')[0].toUpperCase()}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{c.phone || c.email || '—'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
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
                          style={paymentMethod === val ? { backgroundColor: 'var(--brand-secondary-soft)', borderColor: 'var(--brand-secondary)', color: 'var(--brand-secondary)' } : undefined}
                          className={`text-left px-3 py-2 rounded-lg text-sm transition border ${
                            paymentMethod === val ? 'font-semibold' : 'border-border text-gray-600 hover:bg-gray-50'
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

              {/* Agendamento */}
              <div className={`rounded-xl border-2 p-3 transition ${scheduleOrder ? 'border-amber-400 bg-amber-50' : 'border-dashed border-gray-200'}`}>
                <button onClick={() => { setScheduleOrder(v => !v); if (scheduleOrder) setScheduledAt('') }}
                  className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">Agendar pedido</p>
                      <p className="text-[10px] text-gray-400">Defina data/hora para entrega ou separação</p>
                    </div>
                  </div>
                  <div className={`w-9 h-5 rounded-full transition-colors relative ${scheduleOrder ? 'bg-amber-500' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${scheduleOrder ? 'left-4' : 'left-0.5'}`} />
                  </div>
                </button>
                {scheduleOrder && (
                  <div className="mt-3">
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Data e hora do agendamento</label>
                    <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 bg-white" />
                    {scheduledAt && (
                      <p className="text-[11px] text-amber-700 mt-1.5 font-semibold">
                        📅 Agendado para {new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                  </div>
                )}
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
