import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Zap } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Badge } from '@/components/ui'
import type { AlertItem, InventoryProduct, ShowToast } from '../types'
import { num } from '../helpers'
import { EmptyState, FieldNumber, FieldSelect, FieldText, Sheet, Skeleton } from '../ui'

export function AlertsView({
  showToast,
  onAlertCount,
  onRefresh,
}: {
  showToast: ShowToast
  onAlertCount: (n: number) => void
  onRefresh: () => void
}) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState<InventoryProduct | null>(null)

  function reload() {
    setLoading(true)
    inventoryApi
      .alerts()
      .then((d) => {
        const arr = Array.isArray(d.alerts) ? d.alerts : []
        setAlerts(arr)
        onAlertCount(arr.length)
      })
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  if (loading && !addModal) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Alertas</h2>
        <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">
          {alerts.length} aler{alerts.length === 1 ? 'ta' : 'tas'}
        </p>
      </header>

      {alerts.length === 0 ? (
        <EmptyState
          text="Nenhum alerta no momento"
          hint="Quando o estoque zerar ou ficar abaixo do mínimo, os itens aparecem aqui."
        />
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const sev = Number(a.stock_available) <= 0 ? 'critical' : 'warning'
            return (
              <div
                key={a.product_id || i}
                className={`bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3 ${
                  sev === 'critical' ? 'bg-red-50/40' : 'bg-amber-50/40'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                    sev === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {sev === 'critical' ? (
                    <AlertTriangle size={18} strokeWidth={1.75} />
                  ) : (
                    <Zap size={18} strokeWidth={1.75} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-gray-900 truncate">{a.product_name || '–'}</p>
                    <Badge variant={sev === 'critical' ? 'danger' : 'warning'}>
                      {sev === 'critical' ? 'Zerado' : 'Baixo'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Estoque: <span className="tabular-nums">{num(a.stock_available)}</span>
                    {a.stock_min ? (
                      <>
                        {' '}
                        · Mín: <span className="tabular-nums">{num(a.stock_min)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    setAddModal({
                      product_id: a.product_id,
                      product_name: a.product_name,
                    } as InventoryProduct)
                  }
                  iconLeft={<Plus size={14} strokeWidth={2} />}
                >
                  Repor
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {addModal && (
        <QuickRestockModal
          product={addModal}
          onClose={() => setAddModal(null)}
          onDone={() => {
            setAddModal(null)
            reload()
            onRefresh()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function QuickRestockModal({
  product,
  onClose,
  onDone,
  showToast,
}: {
  product: InventoryProduct
  onClose: () => void
  onDone: () => void
  showToast: ShowToast
}) {
  const pid = product.product_id || product.id || ''
  const [qty, setQty] = useState('1')
  const [source, setSource] = useState('reposicao')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!pid || !qty) return
    setSaving(true)
    try {
      await inventoryApi.addStock(pid, { quantity: Number(qty), source, reason })
      showToast('Entrada registrada')
      onDone()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Repor estoque</h2>
      <p className="text-[13px] text-gray-500 mb-2 mt-1">{product.product_name || product.name}</p>
      <FieldNumber label="Quantidade" value={qty} onChange={setQty} min={0.01} />
      <FieldSelect
        label="Motivo"
        value={source}
        onChange={setSource}
        options={[
          ['reposicao', 'Reposição'],
          ['devolucao', 'Devolução'],
          ['inventario', 'Inventário'],
          ['correcao', 'Correção'],
        ]}
      />
      <FieldText label="Observação" value={reason} onChange={setReason} placeholder="Opcional" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>
          Cancelar
        </Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Confirmar entrada'}
        </Button>
      </div>
    </Sheet>
  )
}
