import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, MapPin, MessageCircle, Pencil, Plus, Truck } from 'lucide-react'
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
  const [selected, setSelected] = useState<PendingOrder | null>(null)
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
              ? `${pending.length} pedido(s) aberto(s) na operação`
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
                        <Badge variant={o.payment_status === 'paid' || o.status_pedido === 'pago' ? 'success' : 'warning'}>
                          {o.payment_status === 'paid' || o.status_pedido === 'pago' ? 'Pago' : 'Pagamento pendente'}
                        </Badge>
                        {o.origin ? <Badge>{o.origin === 'affiliate' ? 'Afiliado' : o.origin === 'checkout_web' ? 'Catálogo' : o.origin}</Badge> : null}
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
                    <button type="button" onClick={() => setSelected(o)} className="w-11 h-11 grid place-items-center rounded-xl border border-border-light text-gray-700 hover:bg-gray-50" aria-label="Ver detalhes do pedido">
                      <Pencil size={17} />
                    </button>
                    <Button
                      size="sm"
                      loading={busyId === o.id}
                      disabled={o.payment_status !== 'paid' && o.status_pedido !== 'pago'}
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
                  <p className="text-[14px] font-medium text-gray-900">{e.customer_name || `Pedido #${String(e.order_id || '').slice(0, 8)}`}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    #{String(e.order_id || '').slice(0, 8)} · {dt(e.expedition_date)} · {num(e.items_count)} item(ns) · {num(e.total_units)} un
                  </p>
                </div>
                {e.tracking_url ? <a href={e.tracking_url} target="_blank" rel="noopener noreferrer" className="w-11 h-11 grid place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-label="Abrir rastreio"><ExternalLink size={17} /></a> : null}
                <button type="button" onClick={() => setSelected({ ...e, id: String(e.order_id || ''), already_expedited: true })} className="w-11 h-11 grid place-items-center rounded-xl border border-border-light text-gray-700" aria-label="Ver e editar pedido"><Pencil size={17} /></button>
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
      {selected && (
        <OrderOperationSheet
          order={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); loadPending() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

function OrderOperationSheet({ order, onClose, onSaved, showToast }: {
  order: PendingOrder
  onClose: () => void
  onSaved: () => void
  showToast: ShowToast
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(order.customer_name || '')
  const [phone, setPhone] = useState(order.customer_phone || '')
  const [email, setEmail] = useState(order.customer_email || '')
  const [address, setAddress] = useState(order.delivery_address || '')
  const [couriers, setCouriers] = useState<any[]>([])
  const [courierId, setCourierId] = useState('')
  const [saving, setSaving] = useState(false)
  const [mobBusy, setMobBusy] = useState(false)

  useEffect(() => {
    inventoryApi.mobCouriers().then(d => setCouriers(Array.isArray(d.couriers) ? d.couriers : [])).catch(() => undefined)
  }, [])

  async function save() {
    setSaving(true)
    try {
      await inventoryApi.updateExpeditionOrder(order.id, { customer_name: name, customer_phone: phone, customer_email: email, delivery_address: address })
      showToast('Dados do pedido atualizados')
      onSaved()
    } catch (e: any) { showToast(e.message || 'Falha ao atualizar', 'error') } finally { setSaving(false) }
  }

  async function connectMob() {
    setMobBusy(true)
    try {
      const d = await inventoryApi.sendExpeditionToMob(order.id, courierId || undefined)
      showToast(courierId ? 'Entrega enviada e atribuída no MOB' : 'Entrega enviada ao MOB')
      if (d.tracking_url) window.open(d.tracking_url, '_blank', 'noopener,noreferrer')
      onSaved()
    } catch (e: any) { showToast(e.message || 'Falha ao enviar ao MOB', 'error') } finally { setMobBusy(false) }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div><h2 className="text-[20px] font-bold tracking-tight text-gray-900">Pedido #{order.id.slice(0, 8)}</h2><p className="text-[12px] text-gray-500 mt-1">{dt(order.created_at)} · {order.origin === 'affiliate' ? 'Afiliado' : order.origin === 'checkout_web' ? 'Catálogo' : order.origin || 'Catálogo'}</p></div>
        <button type="button" onClick={() => setEditing(v => !v)} className="h-11 px-3 rounded-xl border border-border-light text-[13px] font-semibold inline-flex items-center gap-2"><Pencil size={15} />Editar</button>
      </div>

      <div className="rounded-2xl border border-border-light divide-y divide-border-light overflow-hidden mb-4">
        {(order.items || []).map((item, i) => <div key={`${item.product_id || i}`} className="p-3 flex justify-between gap-3 text-[13px]"><span><strong>{num(item.quantity)}×</strong> {item.name}</span><span className="font-semibold tabular-nums">{money(item.total)}</span></div>)}
        <div className="p-3 flex justify-between text-[14px] font-bold"><span>Total</span><span>{money(order.total || 0)}</span></div>
      </div>

      {editing ? <div className="space-y-3 mb-5"><FieldText label="Cliente" value={name} onChange={setName} /><FieldText label="Telefone" value={phone} onChange={setPhone} /><FieldText label="E-mail" value={email} onChange={setEmail} /><FieldText label="Endereço de entrega" value={address} onChange={setAddress} /><Button onClick={save} loading={saving} fullWidth>Salvar alterações</Button></div> : <div className="rounded-2xl bg-gray-50 p-4 space-y-2 mb-5 text-[13px]"><p className="font-semibold text-gray-900">{name || 'Cliente não informado'}</p>{phone && <p className="text-gray-600">{phone}</p>}{email && <p className="text-gray-600">{email}</p>}<p className="text-gray-600 flex gap-2"><MapPin size={15} className="shrink-0 mt-0.5" />{address || 'Endereço ainda não informado'}</p></div>}

      <div className="border-t border-border-light pt-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-gray-500 mb-2">Entrega e rastreio MOB</p>
        {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-xl bg-emerald-50 text-emerald-800 font-semibold text-[13px] flex items-center justify-center gap-2 mb-2">Acompanhar entrega <ExternalLink size={15} /></a> : <><select value={courierId} onChange={e => setCourierId(e.target.value)} disabled={order.payment_status !== 'paid' && order.status_pedido !== 'pago'} className="w-full h-11 px-3 rounded-xl border border-border-light bg-white text-[13px] mb-2 disabled:bg-gray-100"><option value="">Disponibilizar para entregadores</option>{couriers.map((m: any) => <option key={m.id} value={m.courier_id}>{m.courier_name || m.name || 'Entregador'}</option>)}</select><Button onClick={connectMob} loading={mobBusy} disabled={order.payment_status !== 'paid' && order.status_pedido !== 'pago'} fullWidth iconLeft={<Truck size={16} />}>{order.payment_status !== 'paid' && order.status_pedido !== 'pago' ? 'Aguardando pagamento' : 'Enviar para o MOB'}</Button></>}
      </div>
    </Sheet>
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
