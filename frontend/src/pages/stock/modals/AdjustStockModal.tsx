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

export function AdjustStockModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const current = product.stock_available ?? product.stock_current ?? 0
  const [qty, setQty] = useState(String(current))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.adjustStock(pid, { new_quantity: Number(qty), reason })
      showToast('Ajuste registrado'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Ajuste de inventário</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name} · atual {num(current)}</p>
      <FieldNumber label="Nova quantidade" value={qty} onChange={setQty} min={0} />
      <FieldSelect label="Motivo" value={reason.split(':')[0] || 'inventario'} onChange={v => setReason(v)}
        options={[['inventario', 'Inventário'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção'], ['devolucao', 'Devolução']]} />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Confirmar ajuste'}
        </Button>
      </div>
    </Sheet>
  )
}
