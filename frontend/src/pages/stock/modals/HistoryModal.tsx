import { useState, useEffect, useRef } from 'react'
import {
  Package, Search, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, Upload, Loader2,
} from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Input, Badge } from '@/components/ui'
import type { InventoryProduct, Movement, Category, ShowToast } from '../types'
import {
  money, num, dt, unitShort, isDigital, fmtQty, movBadge, typeLabel,
} from '../helpers'
import { getSessionHeaders } from '../auth'
import {
  Sheet, FieldText, FieldNumber, FieldSelect,
} from '../ui'

export function HistoryModal({ product, onClose, showToast }: {
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
                <Badge variant={mb.variant} className="shrink-0">{mb.label}</Badge>
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
