import { useState, useEffect } from 'react'
import { Search, ArrowLeft, CheckCircle, Clock, Truck, Package, XCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { trackOrder, type Order, type TimelineEvent } from '@/lib/api'
import { money, labelStatus, storeUrl, normalizePhone } from '@/lib/store-context'

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  entregue: CheckCircle,
  cancelado: XCircle,
  saiu_para_entrega: Truck,
  em_preparacao: Package,
}

export function OrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const initialOrderNumber = searchParams.get('order_number') || ''
  const initialPhone = searchParams.get('phone') || ''

  async function handleTrack(orderNumber: string, phone: string) {
    if (!orderNumber || !phone) {
      setInfo('Informe número do pedido e telefone.')
      return
    }

    setLoading(true)
    setInfo('Consultando pedido...')

    try {
      const data = await trackOrder(orderNumber, normalizePhone(phone))
      setOrder(data.order)
      setTimeline(data.timeline || [])
      setInfo('')
    } catch (err: any) {
      setInfo(err.message || 'Não foi possível consultar o pedido.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialOrderNumber && initialPhone) {
      handleTrack(initialOrderNumber, initialPhone)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    handleTrack(
      String(fd.get('order_number') || '').trim(),
      String(fd.get('phone') || '').trim(),
    )
  }

  return (
    <div className="page-enter min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto">
          <button
            onClick={() => navigate(storeUrl())}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold">Acompanhar Pedido</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-8 space-y-6">
        {/* Search form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="order_number"
            defaultValue={initialOrderNumber}
            placeholder="Número do pedido"
            required
            className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
          />
          <input
            name="phone"
            type="tel"
            defaultValue={initialPhone}
            placeholder="Telefone do cadastro"
            required
            className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
        </form>

        {info && <p className="text-sm text-muted text-center">{info}</p>}

        {/* Order result */}
        {order && (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Pedido {order.order_number}</h3>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    order.status === 'entregue'
                      ? 'bg-success/10 text-success'
                      : order.status === 'cancelado'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-[var(--brand-secondary-light)] text-[var(--brand-secondary)]'
                  }`}
                >
                  {labelStatus(order.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted text-xs">Total</p>
                  <p className="font-bold">{money(order.total)}</p>
                </div>
                <div>
                  <p className="text-muted text-xs">Pagamento</p>
                  <p className="font-semibold">{order.payment_method || 'não informado'}</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <h4 className="text-sm font-bold mb-4">Timeline</h4>
              {timeline.length > 0 ? (
                <div className="space-y-4">
                  {timeline.map((item, i) => {
                    const Icon =
                      STATUS_ICONS[item.status_after || ''] || Clock
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--brand-secondary-light)] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-[var(--brand-secondary)]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {item.event_type}
                            {item.status_after && (
                              <span className="text-muted">
                                {' '}
                                → {labelStatus(item.status_after)}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-light">{item.created_at}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted">Sem eventos no momento.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
