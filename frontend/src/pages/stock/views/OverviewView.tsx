import { useState, useEffect } from 'react'
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ChevronRight, CircleDollarSign,
  Package, PackagePlus, ShoppingCart, TrendingUp, Truck, Users,
} from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import type { ViewKey, ShowToast } from '../types'
import { money, num } from '../helpers'
import { Skeleton } from '../ui'
import { cacheAgeLabel, loadStockCache, saveStockCache } from '../offlineCache'
import { getSessionAuth } from '../auth'

export function OverviewView({
  showToast,
  onAlertCount,
  refreshKey,
  onNavigate,
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
  const [openOrders, setOpenOrders] = useState<any[]>([])
  const brandId = getSessionAuth().brandId

  useEffect(() => {
    setLoading(true)
    setOfflineLabel(null)
    Promise.all([
      inventoryApi.overview(),
      inventoryApi.alerts().catch(() => ({ alerts: [] })),
      inventoryApi.expeditionPending(20).catch(() => ({ orders: [] })),
    ]).then(([ov, al, ordersResult]) => {
      setData(ov)
      const alerts = Array.isArray(al.alerts) ? al.alerts : []
      onAlertCount(alerts.length)
      setOpenOrders(Array.isArray(ordersResult.orders) ? ordersResult.orders : [])
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
  const paidOrders = openOrders.filter((order) => order.payment_status === 'paid' || order.status_pedido === 'pago')
  const pendingPayment = openOrders.length - paidOrders.length
  const todayMovement = Number(data?.entries_today || 0) + Number(data?.exits_today || 0)

  return (
    <div className="space-y-5 pb-3">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Central de estoque</p>
          <h2 className="text-[26px] font-bold tracking-[-0.035em] text-gray-950 mt-1">Visão geral</h2>
        </div>
        <span className="hidden sm:inline-flex items-center gap-2 text-[12px] font-medium text-gray-500">
          <span className={`w-2 h-2 rounded-full ${offlineLabel ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {offlineLabel ? `Cache ${offlineLabel}` : 'Dados atualizados'}
        </span>
      </header>

      <section className="relative overflow-hidden rounded-[22px] bg-[#171717] text-white p-5 sm:p-6">
        <div className="absolute -right-12 -top-16 w-44 h-44 rounded-full border border-white/10" />
        <div className="absolute -right-3 -top-8 w-28 h-28 rounded-full border border-white/10" />
        <div className="relative max-w-xl">
          <div className="flex items-center gap-2 text-white/65 text-[11px] font-bold uppercase tracking-[0.14em]">
            {needsAttention > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            Situação da operação
          </div>
          <h3 className="text-[21px] sm:text-[24px] font-bold tracking-[-0.03em] mt-3 leading-tight">
            {needsAttention > 0 ? `${needsAttention} produto${needsAttention === 1 ? '' : 's'} precisa${needsAttention === 1 ? '' : 'm'} de ação` : 'Operação sob controle'}
          </h3>
          <p className="text-[13px] text-white/65 mt-1.5 leading-relaxed">
            {needsAttention > 0 ? `${num(out)} sem estoque e ${num(low)} abaixo do mínimo.` : `${num(data?.total_products)} produtos e ${num(data?.total_units)} unidades disponíveis.`}
          </p>
          <button type="button" onClick={() => onNavigate(needsAttention > 0 ? 'alerts' : 'products')} className="mt-5 h-11 px-4 rounded-xl bg-white text-gray-950 text-[13px] font-bold inline-flex items-center gap-2 hover:bg-gray-100 active:scale-[0.98] transition">
            {needsAttention > 0 ? 'Resolver pendências' : 'Conferir produtos'} <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Metric icon={<Boxes size={17} />} label="Unidades" value={num(data?.total_units)} />
        <Metric icon={<ShoppingCart size={17} />} label="Pedidos" value={num(openOrders.length)} />
        <Metric icon={<TrendingUp size={17} />} label="Movimentos" value={num(todayMovement)} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-4">
        <section className="bg-white border border-border-light rounded-[20px] overflow-hidden">
          <div className="px-4 py-4 border-b border-border-light flex items-center justify-between gap-3">
            <div><h3 className="text-[15px] font-bold tracking-tight text-gray-950">Fila de trabalho</h3><p className="text-[11px] text-gray-500 mt-0.5">O que precisa acontecer agora</p></div>
            <button type="button" onClick={() => onNavigate('expedition')} className="h-10 px-3 rounded-xl text-[12px] font-semibold text-gray-700 hover:bg-gray-100">Ver expedição</button>
          </div>
          <WorkItem icon={<Truck size={17} />} title="Pedidos prontos para expedir" value={paidOrders.length} tone={paidOrders.length > 0 ? 'brand' : 'neutral'} onClick={() => onNavigate('expedition')} />
          <WorkItem icon={<CircleDollarSign size={17} />} title="Aguardando pagamento" value={pendingPayment} tone={pendingPayment > 0 ? 'warning' : 'neutral'} onClick={() => onNavigate('expedition')} />
          <WorkItem icon={<AlertTriangle size={17} />} title="Reposição necessária" value={needsAttention} tone={needsAttention > 0 ? 'danger' : 'neutral'} onClick={() => onNavigate('alerts')} last />
        </section>

        <section className="bg-white border border-border-light rounded-[20px] p-4">
          <h3 className="text-[15px] font-bold tracking-tight text-gray-950">Ações rápidas</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">Atalhos para a rotina do estoque</p>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction icon={<PackagePlus size={18} />} label="Dar entrada" onClick={() => onNavigate('movements')} />
            <QuickAction icon={<Truck size={18} />} label="Expedir" onClick={() => onNavigate('expedition')} primary />
            <QuickAction icon={<Package size={18} />} label="Produtos" onClick={() => onNavigate('products')} />
            <QuickAction icon={<Users size={18} />} label="Clientes" onClick={() => onNavigate('clients')} />
          </div>
        </section>
      </div>

      {topSelling.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3"><div><h3 className="text-[15px] font-bold tracking-tight text-gray-950">Giro de produtos</h3><p className="text-[11px] text-gray-500 mt-0.5">Itens com mais saídas</p></div><button type="button" onClick={() => onNavigate('reports')} className="h-10 px-3 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100">Relatórios</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topSelling.slice(0, 4).map((p: any, i: number) => (
              <div key={p.product_id || p.id || i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3 hover:border-gray-300 transition">
                <span className="w-8 h-8 rounded-xl bg-gray-950 text-white grid place-items-center text-[11px] font-bold tabular-nums shrink-0">{String(i + 1).padStart(2, '0')}</span>
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
          <div className="flex items-center justify-between mb-3"><div><h3 className="text-[15px] font-bold tracking-tight text-gray-950">Sem movimentação</h3><p className="text-[11px] text-gray-500 mt-0.5">Produtos que merecem revisão</p></div><button type="button" onClick={() => onNavigate('products')} className="h-10 px-3 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100">Gerenciar</button></div>
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

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-border-light bg-white p-3 sm:p-4"><span className="w-8 h-8 rounded-xl bg-gray-100 text-gray-700 grid place-items-center mb-3">{icon}</span><p className="text-[19px] sm:text-[23px] font-bold tracking-[-0.035em] text-gray-950 tabular-nums truncate">{value}</p><p className="text-[10px] sm:text-[11px] font-semibold text-gray-500 mt-0.5 truncate">{label}</p></div>
}

function WorkItem({ icon, title, value, tone, onClick, last }: { icon: React.ReactNode; title: string; value: number; tone: 'brand' | 'warning' | 'danger' | 'neutral'; onClick: () => void; last?: boolean }) {
  const tones = { brand: 'bg-brand-soft text-brand', warning: 'bg-amber-50 text-amber-700', danger: 'bg-red-50 text-red-700', neutral: 'bg-gray-100 text-gray-500' }
  return <button type="button" onClick={onClick} className={`w-full min-h-[62px] px-4 flex items-center gap-3 text-left hover:bg-gray-50 transition ${last ? '' : 'border-b border-border-light'}`}><span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${tones[tone]}`}>{icon}</span><span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-800">{title}</span><strong className="text-[17px] text-gray-950 tabular-nums">{value}</strong><ChevronRight size={16} className="text-gray-400" /></button>
}

function QuickAction({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`min-h-[82px] rounded-2xl p-3 flex flex-col items-start justify-between text-left active:scale-[0.98] transition ${primary ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}><span className={primary ? 'text-white/80' : 'text-gray-600'}>{icon}</span><span className="text-[12px] font-bold">{label}</span></button>
}
