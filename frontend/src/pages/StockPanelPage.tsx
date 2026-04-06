import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Boxes, LogOut, Package, RefreshCw, ShoppingBag, TrendingUp,
} from 'lucide-react'
import { clearStockAuth, getStockBrandRef, getStockToken, stockApi } from '@/lib/api-admin'

type PanelState = {
  brandName: string
  brandLogo?: string | null
  totalProducts: number
  totalUnits: number
  lowStock: number
  outOfStock: number
  todayMovements: number
  reservedUnits: number
}

const initialState: PanelState = {
  brandName: 'App Estoque',
  brandLogo: null,
  totalProducts: 0,
  totalUnits: 0,
  lowStock: 0,
  outOfStock: 0,
  todayMovements: 0,
  reservedUnits: 0,
}

function formatDate(value?: string) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export function StockPanelPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const brandRef = searchParams.get('brand') || getStockBrandRef() || ''
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [panel, setPanel] = useState<PanelState>(initialState)
  const [alerts, setAlerts] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!getStockToken()) {
      navigate(`/app-estoque${brandRef ? `?brand=${brandRef}` : ''}`, { replace: true })
    }
  }, [navigate, brandRef])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [me, overview, alertsResult, movementsResult, productsResult, analytics] = await Promise.all([
        stockApi.me(),
        stockApi.overview(),
        stockApi.alerts(),
        stockApi.movements(1, 8),
        stockApi.products(12),
        stockApi.analytics().catch(() => ({})),
      ])

      setPanel({
        brandName: me.brand?.name || 'App Estoque',
        brandLogo: me.brand?.logo_url || null,
        totalProducts: Number(overview.total_products || overview.products || 0),
        totalUnits: Number(overview.total_units || 0),
        lowStock: Number(overview.low_stock || 0),
        outOfStock: Number(overview.out_of_stock || 0),
        todayMovements: Number(analytics.movements_today || overview.movements_today || 0),
        reservedUnits: Number(overview.reserved_units || analytics.reserved_units || 0),
      })
      setAlerts(alertsResult.alerts || [])
      setMovements(movementsResult.movements || [])
      setProducts(productsResult.products || productsResult.items || [])
      document.title = `${me.brand?.name || 'App Estoque'} — Painel`
    } catch (err: any) {
      setError(err.message || 'Nao foi possivel carregar o painel de estoque.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await stockApi.sync()
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Falha ao sincronizar estoque.')
    } finally {
      setSyncing(false)
    }
  }

  function logout() {
    clearStockAuth()
    navigate(`/app-estoque${brandRef ? `?brand=${brandRef}` : ''}`, { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8fb] p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="h-10 w-48 rounded-xl bg-gray-200 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 rounded-3xl bg-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-3xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] p-4 lg:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {panel.brandLogo ? (
              <img src={panel.brandLogo} alt={panel.brandName} className="w-12 h-12 rounded-2xl object-cover ring-1 ring-gray-200" />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white grid place-items-center font-bold">E</div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-extrabold text-gray-900 truncate">{panel.brandName}</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">Painel operacional do app de estoque</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3.5 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Sincronizar
            </button>
            <button
              onClick={logout}
              className="px-3.5 py-2.5 rounded-2xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition flex items-center gap-2"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={<Package size={16} className="text-blue-600" />} label="Produtos" value={panel.totalProducts} tone="bg-blue-50" />
          <MetricCard icon={<Boxes size={16} className="text-emerald-600" />} label="Unidades" value={panel.totalUnits} tone="bg-emerald-50" />
          <MetricCard icon={<AlertTriangle size={16} className="text-amber-600" />} label="Baixo estoque" value={panel.lowStock} tone="bg-amber-50" />
          <MetricCard icon={<ShoppingBag size={16} className="text-rose-600" />} label="Sem estoque" value={panel.outOfStock} tone="bg-rose-50" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_380px] gap-5">
          <section className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-extrabold text-gray-900">Produtos monitorados</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">Resumo rapido dos itens mais recentes no painel.</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <TrendingUp size={14} /> Movimentos hoje: <span className="font-bold text-gray-800">{panel.todayMovements}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2.5">
              {products.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-400 text-center">
                  Nenhum produto sincronizado ainda.
                </div>
              ) : products.map((product: any) => (
                <div key={product.id || product.product_id} className="rounded-2xl border border-gray-100 p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{product.name || product.product_name || 'Produto sem nome'}</p>
                    <p className="text-[12px] text-gray-400 mt-1">
                      SKU: {product.sku || product.product_sku || '—'} • Unidade: {product.unit || product.product_unit || 'un'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-gray-900">{Number(product.stock_current || product.stock_available || 0)}</p>
                    <p className="text-[11px] text-gray-400">em estoque</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
              <h2 className="text-base font-extrabold text-gray-900">Alertas</h2>
              <div className="mt-4 space-y-2.5">
                {alerts.length === 0 ? (
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm font-medium text-emerald-700">
                    Nenhum alerta ativo no momento.
                  </div>
                ) : alerts.slice(0, 6).map((alert: any, index: number) => (
                  <div key={`${alert.product_id || index}`} className="rounded-2xl bg-amber-50 border border-amber-100 p-3.5">
                    <p className="text-sm font-bold text-amber-900">{alert.product_name || 'Produto'}</p>
                    <p className="text-[12px] text-amber-800 mt-1">
                      Tipo: {alert.alert_type || 'baixo_estoque'} • Atual: {Number(alert.stock_available || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-extrabold text-gray-900">Movimentações</h2>
                <span className="text-[11px] text-gray-500">Reservado: {panel.reservedUnits}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {movements.length === 0 ? (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-400 text-center">
                    Nenhuma movimentação recente.
                  </div>
                ) : movements.map((movement: any, index: number) => (
                  <div key={`${movement.product_id || index}-${movement.created_at || ''}`} className="rounded-2xl border border-gray-100 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-900 truncate">{movement.product_name || 'Produto'}</p>
                      <span className="text-[11px] font-bold text-gray-700">{movement.quantity || 0}</span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1">
                      {movement.type || 'movimento'} • {formatDate(movement.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-3xl p-4 ${tone} border border-white/60 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-extrabold text-gray-900">{value}</p>
    </div>
  )
}