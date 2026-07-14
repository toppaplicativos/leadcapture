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

export function AddStockModal({ product, onClose, onDone, showToast }: {
  product?: InventoryProduct; onClose: () => void; onDone: () => void; showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const [allProducts, setAllProducts] = useState<InventoryProduct[]>([])
  const [selectedPid, setSelectedPid] = useState(product?.product_id || product?.id || '')
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('reposicao')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!product) {
      inventoryApi.products(1, 500).then(d => setAllProducts(Array.isArray(d.items) ? d.items : [])).catch(() => {})
    }
  }, [])

  const filteredProducts = allProducts.filter(p =>
    (p.product_name || p.name || '').toLowerCase().includes(search.toLowerCase())
  )

  async function submit() {
    if (!selectedPid || !qty) return
    setSaving(true)
    try {
      await inventoryApi.addStock(selectedPid, { quantity: Number(qty), source, reason })
      showToast('Entrada registrada')
      onDone()
    } catch (e: any) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Entrada de estoque</h2>

      {product ? (
        <p className="text-[13px] text-gray-500 mb-4 mt-1">{product.product_name || product.name}</p>
      ) : (
        <div className="mb-4 mt-4">
          <Input
            label="Produto"
            type="search"
            placeholder="Buscar produto"
            value={search}
            onChange={e => setSearch(e.target.value)}
            iconLeft={<Search size={14} strokeWidth={1.75} />}
          />
          {search && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-border-light rounded-xl divide-y divide-border-light bg-white">
              {filteredProducts.slice(0, 10).map(p => {
                const id = p.product_id || p.id
                return (
                  <button
                    key={id}
                    onClick={() => { setSelectedPid(id || ''); setSearch(p.product_name || p.name || '') }}
                    className={`w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-gray-50 transition ${
                      selectedPid === id ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {p.product_name || p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect label="Motivo" value={source} onChange={setSource}
        options={[['reposicao', 'Reposição'], ['devolucao', 'Devolução'], ['inventario', 'Inventário'], ['correcao', 'Correção']]} />
      <FieldText label="Observação" value={reason} onChange={setReason} placeholder="Opcional" />

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button onClick={submit} loading={saving} disabled={!selectedPid} fullWidth>
          {saving ? 'Salvando' : 'Confirmar entrada'}
        </Button>
      </div>
    </Sheet>
  )
}
