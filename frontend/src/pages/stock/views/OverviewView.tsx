import { useState, useEffect } from 'react'
import { Package, Truck, Users } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button } from '@/components/ui'
import type { ViewKey, ShowToast } from '../types'
import { money, num } from '../helpers'
import { KpiCard, Skeleton } from '../ui'
import { cacheAgeLabel, loadStockCache, saveStockCache } from '../offlineCache'
import { getSessionAuth } from '../auth'

export function OverviewView({
  showToast,
  onAlertCount,
  refreshKey,
  onNavigate,
  stockRoute,
}: {
  showToast: (t: string, tp?: 'success' | 'error') => void
  onAlertCount: (n: number) => void
  refreshKey: number
  onNavigate: (v: ViewKey) => void
  stockRoute: boolean
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [offlineLabel, setOfflineLabel] = useState<string | null>(null)
  const brandId = getSessionAuth().brandId

  useEffect(() => {
    setLoading(true)
    setOfflineLabel(null)
    Promise.all([
      inventoryApi.overview(),
      inventoryApi.alerts().catch(() => ({ alerts: [] })),
    ]).then(([ov, al]) => {
      setData(ov)
      const alerts = Array.isArray(al.alerts) ? al.alerts : []
      onAlertCount(alerts.length)
      saveStockCache('overview', ov, brandId)
      saveStockCache('alerts', { alerts }, brandId)
      setLoading(false)
    }).catch((e: any) => {
      const cached = loadStockCache<any>('overview', brandId)
      const cachedAlerts = loadStockCache<{ alerts: any[] }>('alerts', brandId)
      if (cached?.data) {
        setData(cached.data)
        const alerts = Array.isArray(cachedAlerts?.data?.alerts) ? cachedAlerts.data.alerts : []
        onAlertCount(alerts.length)
        setOfflineLabel(cacheAgeLabel(cached.saved_at))
        showToast('Mostrando dados em cache (offline)', 'error')
      } else {
        showToast(e?.message || 'Falha ao carregar visão geral', 'error')
      }
      setLoading(false)
    })
  }, [refreshKey])

  if (loading) return <Skeleton rows={6} />

  const out = Number(data?.out_of_stock || 0)
  const low = Number(data?.low_stock || 0)
  const needsAttention = out + low
  const topSelling: any[] = Array.isArray(data?.top_selling) ? data.top_selling : []
  const stale: any[] = Array.isArray(data?.stale_products) ? data.stale_products : []

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Início</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {stockRoute ? 'O que precisa de atenção no estoque agora' : 'Resumo operacional do inventário'}
          {offlineLabel ? ` · cache ${offlineLabel}` : ''}
        </p>
      </header>

      {/* Ops pulse — single focus */}
      <section
        className={`rounded-2xl border p-4 ${
          needsAttention > 0
            ? 'border-amber-200 bg-amber-50/60'
            : 'border-border-light bg-white'
        }`}
      >
        <p className="text-[12px] font-semibold text-gray-600">Operação agora</p>
        <p className="text-[17px] font-bold text-gray-900 mt-1 tracking-tight">
          {needsAttention > 0
            ? `${num(out)} zerado(s) · ${num(low)} baixo(s)`
            : 'Estoque estável — nenhum bloqueio crítico'}
        </p>
        <p className="text-[12px] text-gray-500 mt-1">
          {needsAttention > 0
            ? 'Repor itens críticos antes de liberar novos pedidos.'
            : `${num(data?.total_products)} produtos · ${num(data?.total_units)} unidades · ${money(data?.total_value)}`}
        </p>
        {needsAttention > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" onClick={() => onNavigate('alerts')}>
              Ver alertas
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onNavigate('products')}>
              Ir aos produtos
            </Button>
          </div>
        )}
      </section>

      {/* 4 actionable metrics max */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Zerados" value={num(out)} color="text-red-600" onClick={() => onNavigate('alerts')} />
        <KpiCard label="Estoque baixo" value={num(low)} color="text-amber-600" onClick={() => onNavigate('alerts')} />
        <KpiCard label="Entradas hoje" value={num(data?.entries_today)} />
        <KpiCard label="Saídas hoje" value={num(data?.exits_today)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button variant="secondary" fullWidth onClick={() => onNavigate('products')} iconLeft={<Package size={15} />}>
          Produtos
        </Button>
        <Button variant="secondary" fullWidth onClick={() => onNavigate('expedition')} iconLeft={<Truck size={15} />}>
          Expedir pedido
        </Button>
        <Button variant="secondary" fullWidth onClick={() => onNavigate('clients')} iconLeft={<Users size={15} />}>
          Clientes
        </Button>
      </div>

      {topSelling.length > 0 && (
        <section>
          <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 mb-3">Mais vendidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topSelling.slice(0, 4).map((p: any, i: number) => (
              <div key={p.product_id || p.id || i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3">
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

      {stale.length > 0 && (
        <section>
          <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 mb-3">Produtos parados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stale.slice(0, 4).map((p: any, i: number) => (
              <div key={p.product_id || p.id || i} className="bg-white border border-border-light rounded-2xl p-3.5">
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
