import { useState } from 'react'
import { Search, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchOrderHistory, type Order } from '@/lib/api'
import { getCustomer, setCustomer } from '@/lib/store'
import { money, labelStatus, storeUrl, normalizePhone } from '@/lib/store-context'
import { Link } from 'react-router-dom'

export function HistoryPage() {
  const navigate = useNavigate()
  const profile = getCustomer()
  const [orders, setOrders] = useState<Order[]>([])
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const responsibleName = String(fd.get('responsible') || '').trim()
    const establishmentName = String(fd.get('establishment') || '').trim()

    if (!email || !(responsibleName || establishmentName)) {
      setInfo('Informe e-mail e nome do responsável ou estabelecimento.')
      return
    }

    setCustomer({
      ...getCustomer(),
      email,
      responsible_name: responsibleName,
      establishment_name: establishmentName,
    })

    setLoading(true)
    setInfo('Carregando histórico...')

    try {
      const data = await fetchOrderHistory({
        email,
        customer_name: responsibleName || establishmentName,
      })
      const list = data.orders || []
      setOrders(list)
      setInfo(
        list.length === 0
          ? 'Nenhum pedido encontrado para este cadastro.'
          : '',
      )
    } catch (err: any) {
      setInfo(err.message || 'Não foi possível carregar histórico.')
    } finally {
      setLoading(false)
    }
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
          <h1 className="text-base font-semibold">Histórico de Pedidos</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-8 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="email"
            type="email"
            defaultValue={profile.email || ''}
            placeholder="Seu e-mail"
            required
            className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
          />
          <input
            name="responsible"
            defaultValue={profile.responsible_name || profile.name || ''}
            placeholder="Nome do responsável"
            className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
          />
          <input
            name="establishment"
            defaultValue={profile.establishment_name || profile.establishment || ''}
            placeholder="Nome do estabelecimento"
            className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Carregando...' : 'Buscar histórico'}
          </button>
        </form>

        {info && <p className="text-sm text-muted text-center">{info}</p>}

        {/* Results */}
        <div className="space-y-3">
          {orders.map((order) => (
            <article
              key={order.order_number}
              className="bg-surface border border-border rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-bold">Pedido {order.order_number}</h3>
                <span
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                    order.status === 'entregue'
                      ? 'bg-success/10 text-success'
                      : order.status === 'cancelado'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-warning/10 text-warning'
                  }`}
                >
                  {labelStatus(order.status)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted">Total</span>
                <span className="font-bold">{money(order.total)}</span>
              </div>

              {order.created_at && (
                <p className="text-xs text-muted-light">Criado em: {order.created_at}</p>
              )}

              {order.items && order.items.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  {order.items.map((it, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{it.name}</span>
                      <span className="text-muted">
                        {it.quantity}x {money(it.unit_price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Link
                to={`${storeUrl('pedido')}?order_number=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(normalizePhone(order.customer_phone || ''))}`}
                className="inline-block text-xs font-semibold text-[var(--brand-secondary)] hover:underline"
              >
                Ver acompanhamento →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
