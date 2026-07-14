import { useState, useEffect } from 'react'
import {
  Search,
  ArrowLeft,
  CheckCircle,
  Clock,
  Truck,
  Package,
  XCircle,
  Loader2,
  Receipt,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { trackOrder, fetchCatalog, type Order, type TimelineEvent, type OrderLogistics } from '@/lib/api'
import { money, labelStatus, storeUrl, normalizePhone } from '@/lib/store-context'
import { OrderLogisticsCard } from '@/components/store/OrderLogisticsCard'

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  entregue: CheckCircle,
  cancelado: XCircle,
  saiu_para_entrega: Truck,
  em_preparacao: Package,
  aprovado: CheckCircle,
  confirmando_pagamento: Clock,
  novo: Clock,
}

function applyStoreBrand(store: {
  brand?: { primary_color?: string; secondary_color?: string }
  theme?: { primary_color?: string; secondary_color?: string }
}) {
  const brand = store.brand || {}
  const theme = store.theme || {}
  const primary = brand.primary_color || theme.primary_color || '#111827'
  const secondary = brand.secondary_color || theme.secondary_color || '#3b82f6'
  const root = document.documentElement
  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-secondary', secondary)
  root.style.setProperty('--brand-primary-light', primary + '0d')
  root.style.setProperty('--brand-secondary-light', secondary + '14')
  root.style.setProperty('--brand-secondary-soft', secondary + '1a')
}

function fmtDate(v?: string) {
  if (!v) return ''
  try {
    return new Date(v).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return v
  }
}

function statusBadgeClass(status: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'entregue') return 'bg-emerald-50 text-emerald-800'
  if (s === 'cancelado') return 'bg-red-50 text-red-800'
  return 'bg-brand-soft text-brand'
}

function paymentLabel(method?: string) {
  const m = String(method || '').toLowerCase()
  const map: Record<string, string> = {
    pix: 'PIX',
    cartao: 'Cartão',
    card: 'Cartão',
    boleto: 'Boleto',
    dinheiro: 'Dinheiro',
  }
  return map[m] || method || 'Não informado'
}

export function OrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [logistics, setLogistics] = useState<OrderLogistics | null>(null)
  const [info, setInfo] = useState('')
  const [infoKind, setInfoKind] = useState<'idle' | 'loading' | 'error' | 'hint'>('idle')
  const [loading, setLoading] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [lastQuery, setLastQuery] = useState<{ order: string; phone: string } | null>(null)

  const initialOrderNumber = searchParams.get('order_number') || ''
  const initialPhone = searchParams.get('phone') || ''
  const fromCheckout = Boolean(initialOrderNumber && initialPhone)

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        if (data?.store) applyStoreBrand(data.store)
      })
      .catch(() => {})
      .finally(() => setBootstrapping(false))
  }, [])

  async function handleTrack(orderNumber: string, phone: string) {
    if (!orderNumber || !phone) {
      setInfo('Informe número do pedido e telefone.')
      setInfoKind('error')
      return
    }

    setLoading(true)
    setInfo('Consultando pedido...')
    setInfoKind('loading')

    try {
      const phoneNorm = normalizePhone(phone)
      const data = await trackOrder(orderNumber, phoneNorm)
      setOrder(data.order)
      setTimeline(data.timeline || [])
      setLogistics(data.logistics || null)
      setLastQuery({ order: orderNumber, phone: phoneNorm })
      setInfo('')
      setInfoKind('idle')
    } catch (err: any) {
      setOrder(null)
      setTimeline([])
      setLogistics(null)
      setInfo(err.message || 'Não foi possível consultar o pedido.')
      setInfoKind('error')
    } finally {
      setLoading(false)
    }
  }

  function refreshLogistics() {
    if (!lastQuery) return
    trackOrder(lastQuery.order, lastQuery.phone)
      .then((data) => {
        setOrder(data.order)
        setTimeline(data.timeline || [])
        setLogistics(data.logistics || null)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    if (!bootstrapping && initialOrderNumber && initialPhone) {
      handleTrack(initialOrderNumber, initialPhone)
    } else if (!bootstrapping && !initialOrderNumber) {
      setInfo('Informe o número do pedido e o telefone usado no checkout.')
      setInfoKind('hint')
    }
  }, [bootstrapping]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    handleTrack(
      String(fd.get('order_number') || '').trim(),
      String(fd.get('phone') || '').trim(),
    )
  }

  if (bootstrapping) {
    return (
      <div className="store-page min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="store-page page-enter min-h-screen pb-8">
      <header className="store-topbar sticky top-0 z-50 safe-area-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-[var(--store-max)] mx-auto">
          <button
            type="button"
            onClick={() => navigate(storeUrl())}
            aria-label="Voltar ao catálogo"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" strokeWidth={1.75} />
          </button>
          <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight">
            Acompanhar pedido
          </h1>
        </div>
      </header>

      <div className="max-w-[var(--store-max)] mx-auto px-4 py-5 space-y-5">
        {fromCheckout && order && (
          <div className="store-order-card p-4 flex items-start gap-3 bg-emerald-50/80 border-emerald-100">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0">
              <CheckCircle className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-emerald-900 tracking-tight">
                Pedido recebido com sucesso
              </p>
              <p className="text-[13px] text-emerald-800/90 mt-0.5 leading-relaxed">
                Guarde o número <span className="font-semibold tabular-nums">{order.order_number}</span> para acompanhar aqui.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="store-order-card p-5 space-y-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gray-100 grid place-items-center text-gray-600">
              <Receipt size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="store-section-title leading-tight">Consultar pedido</p>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Use o mesmo telefone informado no checkout
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="order_number" className="store-modal__field-label block mb-1.5">
                Número do pedido
              </label>
              <input
                id="order_number"
                name="order_number"
                defaultValue={initialOrderNumber}
                placeholder="Ex: 1042"
                required
                className="store-search w-full !pl-3.5 !pr-3.5"
              />
            </div>
            <div>
              <label htmlFor="phone" className="store-modal__field-label block mb-1.5">
                Telefone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={initialPhone}
                placeholder="(00) 00000-0000"
                required
                className="store-search w-full !pl-3.5 !pr-3.5"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-brand text-white text-[14px] font-semibold hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            ) : (
              <Search className="w-4 h-4" strokeWidth={2} />
            )}
            {loading ? 'Consultando...' : 'Consultar pedido'}
          </button>
        </form>

        {info && infoKind !== 'idle' && (
          <p
            className={`text-[13px] text-center px-2 ${
              infoKind === 'error'
                ? 'text-red-700 font-medium'
                : infoKind === 'loading'
                  ? 'text-gray-500'
                  : 'text-gray-600'
            }`}
          >
            {info}
          </p>
        )}

        {order && (
          <div className="space-y-4">
            <div className="store-order-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-500">Pedido</p>
                  <h2 className="text-[1.35rem] font-bold text-gray-900 tracking-tight tabular-nums">
                    #{order.order_number}
                  </h2>
                  {order.created_at && (
                    <p className="text-[12px] text-gray-500 mt-1">{fmtDate(order.created_at)}</p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusBadgeClass(order.status)}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {labelStatus(order.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-black/[0.03]">
                  <p className="text-[11px] font-semibold text-gray-500">Total</p>
                  <p className="text-[1.125rem] font-bold text-gray-900 tabular-nums mt-0.5">
                    {money(order.total)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-black/[0.03]">
                  <p className="text-[11px] font-semibold text-gray-500">Pagamento</p>
                  <p className="text-[14px] font-semibold text-gray-900 mt-0.5">
                    {paymentLabel(order.payment_method)}
                  </p>
                  {logistics?.payment_confirmed != null && (
                    <p
                      className={`text-[11px] font-semibold mt-1 ${
                        logistics.payment_confirmed ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {logistics.payment_confirmed ? 'Confirmado' : 'Aguardando confirmação'}
                    </p>
                  )}
                </div>
              </div>

              {order.delivery_address && (
                <p className="text-[13px] text-gray-600 pt-1">
                  <span className="font-semibold text-gray-800">Entrega: </span>
                  {order.delivery_address}
                </p>
              )}

              {Array.isArray(order.items) && order.items.length > 0 && (
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <p className="store-section-title text-[1rem]">Itens</p>
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-gray-700 min-w-0 truncate">
                        <span className="font-semibold text-gray-900 tabular-nums">{item.quantity}×</span>{' '}
                        {item.name}
                      </span>
                      <span className="font-semibold text-gray-900 tabular-nums shrink-0">
                        {money(Number(item.unit_price) * Number(item.quantity))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {logistics && (logistics.delivery_id || logistics.enabled) && (
              <OrderLogisticsCard logistics={logistics} onRefresh={refreshLogistics} />
            )}

            <div className="store-order-card p-5">
              <h3 className="store-section-title mb-4">Andamento</h3>
              {timeline.length > 0 ? (
                <ol className="space-y-4">
                  {timeline.map((item, i) => {
                    const Icon = STATUS_ICONS[item.status_after || ''] || Clock
                    const isLast = i === timeline.length - 1
                    const isDelivered = item.status_after === 'entregue'
                    return (
                      <li key={i} className="relative flex gap-3">
                        {!isLast && (
                          <div
                            className={`store-order-timeline__line ${isDelivered ? 'is-done' : ''}`}
                            aria-hidden
                          />
                        )}
                        <div className="w-8 h-8 rounded-full bg-brand-light text-brand grid place-items-center shrink-0 relative z-[1]">
                          <Icon size={15} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-[13px] font-semibold text-gray-900 leading-snug">
                            {item.event_type}
                            {item.status_after && (
                              <span className="text-gray-500 font-medium">
                                {' '}
                                → {labelStatus(item.status_after)}
                              </span>
                            )}
                          </p>
                          {item.created_at && (
                            <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                              {fmtDate(item.created_at)}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                  <Clock className="w-6 h-6 text-gray-400 mb-2" strokeWidth={1.5} />
                  <p className="text-[13px] font-medium text-gray-700">Sem atualizações ainda</p>
                  <p className="text-[12px] text-gray-500 mt-1">
                    Volte em alguns minutos para ver o andamento
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate(storeUrl())}
              className="w-full h-11 rounded-xl bg-gray-100 text-gray-800 text-[14px] font-semibold hover:bg-gray-200 active:scale-[0.98] transition"
            >
              Voltar ao catálogo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}