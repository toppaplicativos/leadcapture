import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button } from '@/components/ui'
import type { ShowToast } from '../types'
import { money, num } from '../helpers'
import { KpiCard, Skeleton } from '../ui'

export function ReportsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(thirtyAgo)
  const [dateTo, setDateTo] = useState(today)
  const [report, setReport] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

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

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await inventoryApi.exportCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `estoque_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('CSV exportado')
    } catch (e: any) {
      showToast(e?.message || 'Falha ao exportar CSV', 'error')
    } finally {
      setExporting(false)
    }
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
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Relatórios</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Movimentações, valor e curva de prioridade (ABC: A=80%, B=15%, C=5% do valor)
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleExport}
          loading={exporting}
          iconLeft={<Download size={14} />}
        >
          Exportar CSV
        </Button>
      </header>

      {/* Date filters */}
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-11 px-3.5 rounded-xl border border-border bg-white text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Até</label>
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
