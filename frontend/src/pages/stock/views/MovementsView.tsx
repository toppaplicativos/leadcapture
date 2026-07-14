import { useState, useEffect, useCallback } from 'react'
import { inventoryApi } from '@/lib/api-admin'
import type { Movement, ShowToast } from '../types'
import { num, dt, movBadge } from '../helpers'
import { Pagination, EmptyState, Skeleton } from '../ui'

export function MovementsView({ showToast }: { showToast: (t: string, tp?: 'success' | 'error') => void }) {
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
        <EmptyState text="Nenhuma movimentação registrada" hint="Entradas, saídas e ajustes aparecem aqui." />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((m, i) => {
              const mb = movBadge(m.type)
              const qty = Number(m.quantity || 0)
              const isPos = m.type === 'entrada' || m.type === 'liberacao'
              const tone =
                mb.variant === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : mb.variant === 'danger'
                    ? 'bg-red-50 text-red-700'
                    : mb.variant === 'warning'
                      ? 'bg-amber-50 text-amber-800'
                      : mb.variant === 'info'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
              return (
                <div key={i} className="bg-white border border-border-light rounded-2xl p-3.5 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${tone}`}>
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
