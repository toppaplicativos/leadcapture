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

export function RemoveStockModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('manual')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!reason) { showToast('Informe a observação', 'error'); return }
    setSaving(true)
    try {
      await inventoryApi.removeStock(pid, { quantity: Number(qty), source, reason })
      showToast('Saída registrada'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Saída de estoque</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name}</p>
      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['manual', 'Manual'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['correcao', 'Correção']]} />
      <FieldText label="Observação (obrigatória)" value={reason} onChange={setReason} placeholder="Descreva o motivo" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button variant="danger" onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Confirmar saída'}
        </Button>
      </div>
    </Sheet>
  )
}
