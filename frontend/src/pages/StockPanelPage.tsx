import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Home, Package, ClipboardList, BarChart3, Search, ArrowDown, ArrowUp,
  Scale, History, RefreshCw, LogOut, AlertTriangle, Zap, X, Loader2,
} from 'lucide-react'
import { stockApi, getStockToken, getStockBrandRef, clearStockAuth } from '@/lib/api-admin'

/* ── Types ── */
interface Product {
  product_id?: string; id?: string
  product_name?: string; nome?: string
  product_image?: string; imagem?: string
  sku?: string; current_stock?: number; stock_min?: number
  price?: number; preco?: number
}
interface Movement {
  product_name?: string; movement_type?: string; type?: string
  quantity?: number; source?: string; reason?: string; created_at?: string
}
interface AlertItem {
  product_name?: string; nome?: string
  current_stock?: number; stock_min?: number
}

/* ── Helpers ── */
const fmt = (v: number | string) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number | string) => Number(v || 0).toLocaleString('pt-BR')
const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return d }
}

function stockStatus(qty?: number, min?: number) {
  const q = Number(qty || 0), m = Number(min || 5)
  if (q <= 0) return 'zerado' as const
  if (q <= m) return 'baixo' as const
  return 'normal' as const
}
const statusLabel = (s: string) => s === 'zerado' ? 'Esgotado' : s === 'baixo' ? 'Baixo' : 'Normal'
const statusColor = (s: string) =>
  s === 'zerado' ? 'bg-red-100 text-red-800' : s === 'baixo' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'

/* ── Toast (local) ── */
let toastTimer: ReturnType<typeof setTimeout> | undefined
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    clearTimeout(toastTimer)
    setMsg({ text, type })
    toastTimer = setTimeout(() => setMsg(null), 3000)
  }, [])
  return { msg, show }
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */
export function StockPanelPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const brandRef = searchParams.get('brand') || getStockBrandRef() || ''
  const { msg: toast, show: showToast } = useToast()

  const [tab, setTab] = useState<'dashboard' | 'products' | 'movements' | 'analytics'>('dashboard')
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string }>({})
  const [alertCount, setAlertCount] = useState(0)

  // Auth guard
  useEffect(() => {
    if (!getStockToken()) {
      navigate(`/app-estoque${brandRef ? `/${brandRef}` : ''}`, { replace: true })
    }
  }, [navigate, brandRef])

  // Bootstrap brand info
  useEffect(() => {
    stockApi.me()
      .then((data) => {
        const b = data.brand || data.user || {}
        setBrand({ name: b.name, logo_url: b.logo_url })
        document.title = (b.name || 'Estoque') + ' • Painel'
        // Update stored brand id
        if (b.id) localStorage.setItem('lead-system:active-brand-id-estoque', String(b.id))
        if (b.slug) localStorage.setItem('lead-system:active-brand-ref-estoque', b.slug)
      })
      .catch(() => {
        showToast('Sessão expirada', 'error')
        setTimeout(logout, 1500)
      })
  }, [])

  function logout() {
    clearStockAuth()
    navigate(`/app-estoque${brandRef ? `/${brandRef}` : ''}`, { replace: true })
  }

  async function handleSync() {
    try {
      showToast('Sincronizando...')
      await stockApi.sync()
      showToast('Sincronização concluída')
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  const tabs = [
    { key: 'dashboard' as const, icon: Home, label: 'Início' },
    { key: 'products' as const, icon: Package, label: 'Produtos' },
    { key: 'movements' as const, icon: ClipboardList, label: 'Movimentações' },
    { key: 'analytics' as const, icon: BarChart3, label: 'Analytics' },
  ]

  return (
    <div className="min-h-screen bg-bg pb-16">
      {/* Topbar */}
      <header className="sticky top-0 z-50 bg-slate-900 text-white flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2.5 min-w-0">
          {brand.logo_url && (
            <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-700" />
          )}
          <h1 className="text-base font-bold truncate">
            Estoque{brand.name ? ` • ${brand.name}` : ''}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} className="bg-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-white/20 transition" title="Sincronizar">
            <RefreshCw size={14} />
          </button>
          <button onClick={logout} className="bg-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-white/20 transition">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 page-enter">
        {tab === 'dashboard' && <DashboardTab showToast={showToast} onAlertCount={setAlertCount} />}
        {tab === 'products' && <ProductsTab showToast={showToast} />}
        {tab === 'movements' && <MovementsTab showToast={showToast} />}
        {tab === 'analytics' && <AnalyticsTab showToast={showToast} />}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border flex h-15">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
              tab === t.key ? 'text-blue-600 font-bold' : 'text-muted'
            }`}
          >
            <span className="relative">
              <t.icon size={22} />
              {t.key === 'analytics' && alertCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {alertCount}
                </span>
              )}
            </span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-2">
          <div className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          }`}>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DASHBOARD TAB
   ══════════════════════════════════════════════ */
function DashboardTab({ showToast, onAlertCount }: { showToast: (t: string, tp?: 'success' | 'error') => void; onAlertCount: (n: number) => void }) {
  const [kpis, setKpis] = useState<any>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      stockApi.overview().catch(() => ({})),
      stockApi.alerts().catch(() => ({ alerts: [] })),
      stockApi.movements(1, 10).catch(() => ({ movements: [] })),
    ]).then(([ov, al, mv]) => {
      setKpis(ov)
      const arr = Array.isArray(al.alerts) ? al.alerts : []
      setAlerts(arr)
      onAlertCount(arr.length)
      setMovements(Array.isArray(mv.movements) ? mv.movements : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <SkeletonDashboard />

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Produtos" value={fmtN(kpis?.total_products)} />
        <KpiCard label="Sem Estoque" value={fmtN(kpis?.out_of_stock)} color="text-red-500" />
        <KpiCard label="Estoque Baixo" value={fmtN(kpis?.low_stock)} color="text-amber-500" />
        <KpiCard label="Valor Total" value={fmt(kpis?.total_value)} color="text-emerald-500" />
      </div>

      {/* Alerts */}
      <section>
        <h3 className="text-[15px] font-bold mb-3">Alertas</h3>
        {alerts.length === 0 ? (
          <p className="text-muted text-sm text-center py-5">Nenhum alerta no momento ✓</p>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 8).map((a, i) => {
              const sev = Number(a.current_stock || 0) <= 0 ? 'critical' : 'warning'
              return (
                <div key={i} className={`flex items-center gap-3 bg-white border rounded-xl p-3 ${
                  sev === 'critical' ? 'border-l-[3px] border-l-red-500' : 'border-l-[3px] border-l-amber-500'
                }`}>
                  <div className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${
                    sev === 'critical' ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-500'
                  }`}>
                    {sev === 'critical' ? <AlertTriangle size={18} /> : <Zap size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm block truncate">{a.product_name || a.nome || 'Produto'}</span>
                    <span className="text-xs text-muted">
                      Estoque: {fmtN(a.current_stock ?? 0)}{a.stock_min ? ` (mín: ${fmtN(a.stock_min)})` : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent Movements */}
      <section>
        <h3 className="text-[15px] font-bold mb-3">Últimas Movimentações</h3>
        {movements.length === 0 ? (
          <p className="text-muted text-sm text-center py-5">Nenhuma movimentação ainda</p>
        ) : (
          <MovementList items={movements.slice(0, 8)} />
        )}
      </section>
    </div>
  )
}

/* ══════════════════════════════════════════════
   PRODUCTS TAB
   ══════════════════════════════════════════════ */
function ProductsTab({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState<{ action: string; product: Product } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    stockApi.products(200)
      .then((data) => setProducts(Array.isArray(data.products) ? data.products : []))
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)

  const filtered = products.filter((p) => {
    const s = stockStatus(p.current_stock, p.stock_min)
    if (filter !== 'all' && s !== filter) return false
    if (search) {
      const name = (p.product_name || p.nome || '').toLowerCase()
      if (!name.includes(search.toLowerCase())) return false
    }
    return true
  })

  const filters = ['all', 'normal', 'baixo', 'zerado'] as const
  const filterLabels = { all: 'Todos', normal: 'Normal', baixo: 'Baixo', zerado: 'Zerado' }

  if (loading) return <SkeletonList />

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f
                ? 'bg-blue-500 text-white border-transparent'
                : 'bg-white text-gray-500 border-border hover:bg-gray-50'
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{filtered.length} produto(s)</p>

      {/* Product List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted">
          <Package size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum resultado'}</p>
          {products.length === 0 && (
            <button onClick={() => { stockApi.sync().then(refresh).catch((e: any) => showToast(e.message, 'error')) }}
              className="mt-3 inline-flex items-center gap-1.5 bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
              <RefreshCw size={14} /> Sincronizar Catálogo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => {
            const pid = p.product_id || p.id || ''
            const name = p.product_name || p.nome || 'Produto'
            const status = stockStatus(p.current_stock, p.stock_min)
            const img = p.product_image || p.imagem || ''

            return (
              <div key={pid} className="bg-white border border-border rounded-xl p-3.5">
                <div className="flex items-start gap-2.5">
                  {img ? (
                    <img src={img} alt="" className="w-13 h-13 rounded-lg object-cover bg-gray-100 flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-13 h-13 rounded-lg bg-gray-100 grid place-items-center flex-shrink-0 text-gray-400 text-xl">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] truncate">{name}</p>
                    <p className="text-xs text-muted mt-0.5">SKU: {p.sku || '–'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(status)}`}>
                    {statusLabel(status)}: {fmtN(p.current_stock ?? 0)}
                  </span>
                  <span className="ml-auto font-bold text-[15px]">{fmt(p.price ?? p.preco ?? 0)}</span>
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                  <button onClick={() => setModal({ action: 'add', product: p })}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg border border-emerald-200 text-emerald-600 text-xs font-semibold hover:bg-emerald-50 transition">
                    <ArrowDown size={12} /> Entrada
                  </button>
                  <button onClick={() => setModal({ action: 'remove', product: p })}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 transition">
                    <ArrowUp size={12} /> Saída
                  </button>
                  <button onClick={() => setModal({ action: 'adjust', product: p })}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg border border-indigo-200 text-indigo-500 text-xs font-semibold hover:bg-indigo-50 transition">
                    <Scale size={12} /> Ajuste
                  </button>
                  <button onClick={() => setModal({ action: 'history', product: p })}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-gray-500 text-xs font-semibold hover:bg-gray-50 transition">
                    <History size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <StockModal
          action={modal.action}
          product={modal.product}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); refresh() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   MOVEMENTS TAB
   ══════════════════════════════════════════════ */
function MovementsTab({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const load = useCallback((pg: number, append = false) => {
    if (!append) setLoading(true)
    stockApi.movements(pg, 30, filter === 'all' ? '' : filter)
      .then((data) => {
        const arr = Array.isArray(data.movements) ? data.movements : []
        setMovements((prev) => append ? [...prev, ...arr] : arr)
        setTotal(data.total || 0)
        setHasMore(data.total ? pg * 30 < data.total : false)
      })
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => { setPage(1); load(1) }, [filter])

  const filters = [
    { key: 'all', label: 'Todas' },
    { key: 'entrada', label: 'Entradas' },
    { key: 'saida', label: 'Saídas' },
    { key: 'ajuste', label: 'Ajustes' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              filter === f.key
                ? 'bg-blue-500 text-white border-transparent'
                : 'bg-white text-gray-500 border-border hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-6 animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : movements.length === 0 ? (
        <p className="text-muted text-sm text-center py-10">Nenhuma movimentação registrada</p>
      ) : (
        <>
          <MovementList items={movements} />
          {hasMore && (
            <button
              onClick={() => { const next = page + 1; setPage(next); load(next, true) }}
              className="w-full py-2.5 text-sm font-medium text-blue-600 bg-white border border-border rounded-xl hover:bg-gray-50 transition"
            >
              Carregar mais
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   ANALYTICS TAB
   ══════════════════════════════════════════════ */
function AnalyticsTab({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    stockApi.analytics()
      .then(setData)
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonDashboard />

  const abc: any[] = Array.isArray(data?.abc_curve) ? data.abc_curve : []
  const maxVal = Math.max(...abc.map((a: any) => Number(a.total_value || 0)), 1)

  const daily: any[] = Array.isArray(data?.daily_summary) ? data.daily_summary : []
  let totalIn = 0, totalOut = 0
  daily.forEach((d: any) => { totalIn += Number(d.entradas || 0); totalOut += Number(d.saidas || 0) })

  return (
    <div className="space-y-6">
      {/* ABC Curve */}
      <section>
        <h3 className="text-[15px] font-bold mb-1">Curva ABC</h3>
        <p className="text-xs text-muted mb-3">Classificação por valor de estoque</p>
        {abc.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">Sem dados suficientes</p>
        ) : (
          <div className="space-y-1.5">
            {abc.slice(0, 15).map((a: any, i: number) => {
              const pct = (Number(a.total_value || 0) / maxVal) * 100
              const barColor = a.classification === 'A' ? 'bg-emerald-500' : a.classification === 'B' ? 'bg-blue-500' : 'bg-gray-400'
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs w-24 truncate text-gray-500">{a.product_name || '–'}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                    <div className={`h-full rounded-md transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold w-8 text-right">{a.classification || ''}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Summary 30d */}
      <section>
        <h3 className="text-[15px] font-bold mb-3">Resumo 30 dias</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <KpiCard label="Entradas" value={fmtN(totalIn)} color="text-emerald-500" />
          <KpiCard label="Saídas" value={fmtN(totalOut)} color="text-red-500" />
        </div>
      </section>
    </div>
  )
}

/* ══════════════════════════════════════════════
   STOCK MODAL (add / remove / adjust / history)
   ══════════════════════════════════════════════ */
function StockModal({
  action, product, onClose, onDone, showToast,
}: {
  action: string; product: Product; onClose: () => void; onDone: () => void
  showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const name = product.product_name || product.nome || 'Produto'
  const [qty, setQty] = useState(action === 'adjust' ? String(product.current_stock || 0) : '1')
  const [source, setSource] = useState(action === 'add' ? 'reposicao' : action === 'remove' ? 'manual' : '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Movement[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(action === 'history')

  useEffect(() => {
    if (action === 'history') {
      stockApi.productMovements(pid)
        .then((data) => setHistory(Array.isArray(data.movements) ? data.movements : []))
        .catch((e) => { showToast(e.message, 'error'); onClose() })
        .finally(() => setHistoryLoading(false))
    }
  }, [action, pid])

  async function handleSubmit() {
    setSaving(true)
    try {
      if (action === 'add') {
        await stockApi.addStock(pid, { quantity: Number(qty), source, reason })
        showToast('Entrada registrada')
      } else if (action === 'remove') {
        await stockApi.removeStock(pid, { quantity: Number(qty), source, reason })
        showToast('Saída registrada')
      } else if (action === 'adjust') {
        await stockApi.adjustStock(pid, { new_quantity: Number(qty), reason })
        showToast('Ajuste registrado')
      }
      onDone()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const titles: Record<string, string> = {
    add: 'Entrada de Estoque',
    remove: 'Saída de Estoque',
    adjust: 'Ajuste de Inventário',
    history: 'Histórico',
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/45 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+16px)] animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{titles[action] || action}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <p className="text-sm text-muted -mt-2 mb-4">{name}{action === 'adjust' ? ` (atual: ${product.current_stock || 0})` : ''}</p>

        {action === 'history' ? (
          historyLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
          ) : !history || history.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">Nenhuma movimentação</p>
          ) : (
            <MovementList items={history} />
          )
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">
                {action === 'adjust' ? 'Nova Quantidade' : 'Quantidade'}
              </label>
              <input
                type="number"
                min={action === 'adjust' ? 0 : 1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {(action === 'add' || action === 'remove') && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Motivo</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {action === 'add' ? (
                    <>
                      <option value="reposicao">Reposição</option>
                      <option value="devolucao">Devolução</option>
                      <option value="manual">Manual</option>
                    </>
                  ) : (
                    <>
                      <option value="manual">Manual</option>
                      <option value="perda">Perda</option>
                      <option value="avaria">Avaria</option>
                    </>
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Observação</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={action === 'adjust' ? 'Ex: contagem física' : 'Opcional'}
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className={`flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50 ${
                  action === 'remove' ? 'bg-red-500' : 'bg-blue-500'
                }`}
              >
                {saving ? 'Salvando...' : action === 'add' ? 'Confirmar Entrada' : action === 'remove' ? 'Confirmar Saída' : 'Confirmar Ajuste'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ══════════════════════════════════════════════ */

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-3.5">
      <p className="text-[11px] text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-extrabold ${color || ''}`}>{value}</p>
    </div>
  )
}

function MovementList({ items }: { items: Movement[] }) {
  const typeIcons: Record<string, typeof ArrowDown> = {
    entrada: ArrowDown, saida: ArrowUp, ajuste: Scale,
  }
  const dotColors: Record<string, string> = {
    entrada: 'bg-emerald-100 text-emerald-700',
    saida: 'bg-red-100 text-red-700',
    ajuste: 'bg-indigo-100 text-indigo-700',
    reserva: 'bg-amber-100 text-amber-700',
    liberacao: 'bg-emerald-100 text-emerald-700',
    expedicao: 'bg-blue-100 text-blue-700',
  }
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div className="divide-y divide-gray-100">
      {items.map((m, i) => {
        const type = (m.movement_type || m.type || 'ajuste').toLowerCase()
        const isPositive = type === 'entrada' || type === 'liberacao'
        const Icon = typeIcons[type] || Scale
        const qty = Number(m.quantity || 0)

        return (
          <div key={i} className="flex items-start gap-2.5 py-2.5">
            <div className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 ${dotColors[type] || 'bg-gray-100 text-gray-500'}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold block truncate">{m.product_name || 'Produto'}</span>
              <span className="text-[11px] text-muted">
                {capitalize(type)}{m.source ? ` • ${m.source}` : ''} • {fmtDate(m.created_at || '')}
              </span>
              {m.reason && <span className="text-[11px] text-muted italic block mt-0.5">{m.reason}</span>}
            </div>
            <span className={`text-sm font-bold whitespace-nowrap ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? '+' : '−'}{fmtN(Math.abs(qty))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Skeletons ── */
function SkeletonDashboard() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-2.5">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-6 bg-gray-100 rounded w-24" />
      {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
    </div>
  )
}
function SkeletonList() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-gray-100 rounded-xl" />
      <div className="flex gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 w-16 bg-gray-100 rounded-full" />)}</div>
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl" />)}
    </div>
  )
}
