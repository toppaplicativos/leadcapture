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

export function SettingsModal({ product, onClose, onDone, showToast }: {
  product: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const pid = product.product_id || product.id || ''
  const [minStock, setMinStock] = useState(String(product.stock_min || 5))
  const [costPrice, setCostPrice] = useState(String(product.cost_price || 0))
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await inventoryApi.updateSettings(pid, { stock_min: Number(minStock), cost_price: Number(costPrice) })
      showToast('Configuração salva'); onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Configurações</h2>
      <p className="text-[13px] text-gray-500 mt-1">{product.product_name || product.name}</p>
      <FieldNumber label="Estoque mínimo" value={minStock} onChange={setMinStock} min={0} />
      <FieldNumber label="Preço de custo (R$)" value={costPrice} onChange={setCostPrice} min={0} step="0.01" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Salvar'}
        </Button>
      </div>
    </Sheet>
  )
}
