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

export function ProductActionsModal({
  product,
  onClose,
  onAction,
  stockRoute,
}: {
  product: InventoryProduct
  onClose: () => void
  onAction: (type: string, prod: InventoryProduct) => void
  stockRoute: boolean
}) {
  const img = product.product_image || product.image_url || ''
  const name = product.product_name || product.name || 'Produto'
  const isD = isDigital(product.product_unit || product.unit)

  const primary = [
    { type: 'add', label: 'Entrada', Icon: ArrowDown, cls: 'bg-emerald-50 text-emerald-700' },
    ...(!isD ? [{ type: 'remove', label: 'Saída', Icon: ArrowUp, cls: 'bg-red-50 text-red-700' }] : []),
    { type: 'adjust', label: 'Ajuste', Icon: Scale, cls: 'bg-gray-100 text-gray-700' },
  ]
  const secondary = [
    { type: 'edit', label: stockRoute ? 'Preço' : 'Editar', Icon: Pencil, cls: 'bg-gray-100 text-gray-700' },
    { type: 'history', label: 'Histórico', Icon: History, cls: 'bg-gray-100 text-gray-700' },
    { type: 'settings', label: 'Mínimo', Icon: Settings, cls: 'bg-gray-100 text-gray-700' },
  ]

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-3">
        {img ? (
          <img src={img} alt="" className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-gray-100 grid place-items-center text-gray-400 shrink-0">
            <Package size={22} strokeWidth={1.5} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-gray-900 truncate">{name}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="neutral">{unitShort(product.product_unit || product.unit)}</Badge>
            <Badge variant="neutral">{typeLabel(product.product_type)}</Badge>
            <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
              {money(product.product_price || product.price)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[11px] font-semibold text-gray-500">Disponível</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{fmtQty(product.stock_available, product.product_unit || product.unit)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[11px] font-semibold text-gray-500">Reservado</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{num(product.stock_reserved)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[11px] font-semibold text-gray-500">Mínimo</p>
          <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{num(product.stock_min)}</p>
        </div>
      </div>

      <p className="text-[12px] font-semibold text-gray-600 mt-5 mb-2">Ações do dia</p>
      <div className="grid grid-cols-3 gap-2">
        {primary.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => { onClose(); setTimeout(() => onAction(a.type, product), 80) }}
            className="flex flex-col items-center gap-2 py-3 min-h-[72px] rounded-2xl bg-white border border-border-light hover:border-gray-300 active:scale-[0.97] transition"
          >
            <span className={`w-10 h-10 rounded-xl grid place-items-center ${a.cls}`}>
              <a.Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-medium text-gray-700">{a.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] font-semibold text-gray-600 mt-4 mb-2">Mais</p>
      <div className="grid grid-cols-3 gap-2">
        {secondary.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => { onClose(); setTimeout(() => onAction(a.type, product), 80) }}
            className="flex flex-col items-center gap-2 py-3 min-h-[72px] rounded-2xl bg-white border border-border-light hover:border-gray-300 active:scale-[0.97] transition"
          >
            <span className={`w-10 h-10 rounded-xl grid place-items-center ${a.cls}`}>
              <a.Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-medium text-gray-700">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
