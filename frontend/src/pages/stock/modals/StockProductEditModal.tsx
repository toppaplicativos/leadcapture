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

export function StockProductEditModal({
  product,
  onClose,
  onDone,
  showToast,
}: {
  product: InventoryProduct
  onClose: () => void
  onDone: () => void
  showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [price, setPrice] = useState(String(product.product_price ?? product.price ?? ''))
  const [promo, setPromo] = useState(String(product.promo_price ?? product.promoPrice ?? ''))
  const [active, setActive] = useState(product.active !== false && product.is_active !== false)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!pid) return
    setSaving(true)
    try {
      const headers = getSessionHeaders()
      const res = await fetch(`/api/stock-app/products/${pid}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          preco: price === '' ? undefined : Number(price),
          preco_promocional: promo === '' ? null : Number(promo),
          ativo: active,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      showToast('Produto atualizado')
      onDone()
    } catch (e: any) {
      showToast(e.message || 'Falha ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Atualizar preço</h2>
      <p className="text-[13px] text-gray-500 mt-1 mb-3">{product.product_name || product.name}</p>
      <FieldNumber label="Preço" value={price} onChange={setPrice} min={0} step="0.01" />
      <FieldNumber label="Preço promocional" value={promo} onChange={setPromo} min={0} step="0.01" />
      <div className="mt-3 flex items-center justify-between rounded-xl border border-border-light px-3.5 h-11">
        <span className="text-[13px] font-medium text-gray-800">Ativo na loja</span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => setActive((v) => !v)}
          className={`w-11 h-6 rounded-full transition-colors ${active ? 'bg-gray-900' : 'bg-gray-300'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>{saving ? 'Salvando' : 'Salvar'}</Button>
      </div>
    </Sheet>
  )
}
