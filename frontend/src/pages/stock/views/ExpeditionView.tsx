import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Plus, Truck } from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Badge } from '@/components/ui'
import type { Expedition, PendingOrder, ShowToast } from '../types'
import { dt, money, num, waUrl } from '../helpers'
import { EmptyState, FieldText, Pagination, Sheet, Skeleton } from '../ui'

export function ExpeditionView({ showToast }: { showToast: ShowToast }) {
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [items, setItems] = useState<Expedition[]>([])
  const [pending, setPending] = useState<PendingOrder[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const limit = 50

  const loadDone = useCallback(
    (pg: number) => {
      setLoading(true)
      inventoryApi
        .expedition(pg, limit)
        .then((d) => {
          setItems(Array.isArray(d.items) ? d.items : [])
          setTotal(d.total || 0)
        })
        .catch((e) => showToast(e.message, 'error'))
        .finally(() => setLoading(false))
    },
    [showToast],
  )

  const loadPending = useCallback(() => {
    setLoading(true)
    inventoryApi
      .expeditionPending(80)
      .then((d) => {
        setPending(Array.isArray(d.orders) ? d.orders : [])
      })
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => {
    if (tab === 'pending') loadPending()
    else loadDone(1)
  }, [tab, loadPending, loadDone])

  async function expedite(orderId: string) {
    if (!orderId || busyId) return
    setBusyId(orderId)
    try {
      await inventoryApi.createExpedition(orderId)
      showToast('Expedição registrada')
      if (tab === 'pending') loadPending()
      else loadDone(page)
    } catch (e: any) {
      showToast(e.message || 'Falha ao expedir', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-bold tracking-tight text-gray-900">Expedição</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {tab === 'pending'
              ? `${pending.length} pedido(s) pagos aguardando saída`
              : `${total} expediç${total === 1 ? 'ão' : 'ões'} registradas`}
          </p>
        </div>
        <Button size="sm" onClick={() => setModal(true)} iconLeft={<Plus size={15} strokeWidth={2} />}>
          Por ID
        </Button>
      </header>

      <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
        {(
          [
            { key: 'pending' as const, label: 'A expedir' },
            { key: 'done' as const, label: 'Histórico' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 h-10 rounded-lg text-[13px] font-semibold transition ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
            {t.key === 'pending' && pending.length > 0 ? (
              <span className="ml-1.5 text-[11px] tabular-nums text-gray-500">({pending.length})</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton rows={4} />
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState
            text="Nenhum pedido aguardando expedição"
            hint="Pedidos pagos aparecem aqui. Você também pode registrar por ID manualmente."
            action={{ label: 'Registrar por ID', onClick: () => setModal(true) }}
          />
        ) : (
          <div className="space-y-2">
            {pending.map((o) => {
              const wa = waUrl(
                o.customer_phone,
                `Olá${o.customer_name ? ` ${o.customer_name}` : ''}! Seu pedido #${String(o.id).slice(0, 8)} está em separação.`,
              )
              return (
                <div
                  key={o.id}
                  className="bg-white border border-border-light rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 grid place-items-center shrink-0">
                      <Truck size={16} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-medium text-gray-900 truncate">
                          {o.customer_name || 'Cliente'}
                        </p>
                        <Badge variant="success">Pago</Badge>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                        #{String(o.id).slice(0, 8)}
                        {o.items_count ? ` · ${num(o.items_count)} item(ns)` : ''}
                        {o.total != null ? ` · ${money(o.total)}` : ''}
                        {o.created_at ? ` · ${dt(o.created_at)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-11 h-11 grid place-items-center rounded-xl border border-border-light text-emerald-700 hover:bg-emerald-50"
                        aria-label="WhatsApp do cliente"
                      >
                        <MessageCircle size={18} />
                      </a>
                    )}
                    <Button
                      size="sm"
                      loading={busyId === o.id}
                      onClick={() => expedite(o.id)}
                      iconLeft={<Truck size={14} />}
                    >
                      Expedir
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          text="Nenhuma expedição ainda"
          hint="Expeça pedidos pagos na aba A expedir."
          action={{ label: 'Ver a expedir', onClick: () => setTab('pending') }}
        />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((e, i) => (
              <div
                key={e.order_id || i}
                className="bg-white border border-border-light rounded-2xl p-3.5 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 grid place-items-center shrink-0">
                  <Truck size={16} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-gray-900">
                    Pedido #{String(e.order_id || '').slice(0, 8)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {dt(e.expedition_date)} · {num(e.items_count)} item(ns) · {num(e.total_units)} un
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(p) => {
              setPage(p)
              loadDone(p)
            }}
          />
        </>
      )}

      {modal && (
        <ExpeditionByIdModal
          onClose={() => setModal(false)}
          onDone={() => {
            setModal(false)
            if (tab === 'pending') loadPending()
            else loadDone(1)
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function ExpeditionByIdModal({
  onClose,
  onDone,
  showToast,
}: {
  onClose: () => void
  onDone: () => void
  showToast: ShowToast
}) {
  const [orderId, setOrderId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!orderId.trim()) {
      showToast('Informe o ID do pedido', 'error')
      return
    }
    setSaving(true)
    try {
      await inventoryApi.createExpedition(orderId.trim())
      showToast('Expedição registrada')
      onDone()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Expedir por ID</h2>
      <p className="text-[13px] text-gray-500 mt-1">
        Use quando o pedido não aparecer na lista (ex.: ID copiado do admin).
      </p>
      <FieldText label="ID do pedido" value={orderId} onChange={setOrderId} placeholder="Cole o ID do pedido" />
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>
          Cancelar
        </Button>
        <Button onClick={submit} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Registrar'}
        </Button>
      </div>
    </Sheet>
  )
}
