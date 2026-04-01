import { useState } from 'react'
import { Search } from 'lucide-react'
import { fetchOrderHistory, type Order } from '@/lib/api'
import { getCustomer } from '@/lib/store'
import { money, labelStatus, storeUrl, normalizePhone } from '@/lib/store-context'
import { Link } from 'react-router-dom'

export function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([])
  const [info, setInfo] = useState('Consulte seus pedidos informando e-mail ou telefone.')
  const [loading, setLoading] = useState(false)
  const profile = getCustomer()

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const phone = String(fd.get('phone') || '').trim()

    if (!email && !phone) {
      setInfo('Informe e-mail ou telefone para buscar seus pedidos.')
      return
    }

    setLoading(true)
    setInfo('Buscando pedidos...')

    try {
      const data = await fetchOrderHistory({
        email,
        customer_name: profile.name || profile.responsible_name || '',
        phone: normalizePhone(phone),
      })
      const list = data.orders || []
      setOrders(list)
      setInfo(
        list.length === 0
          ? 'Nenhum pedido encontrado.'
          : `${list.length} pedido(s) encontrado(s).`,
      )
    } catch {
      setInfo('Erro ao buscar pedidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-enter px-4 pt-2 pb-24 space-y-4">
      <h2 className="text-base font-bold">Meus Pedidos</h2>
      <p className="text-sm text-muted">{info}</p>

      <form onSubmit={handleSearch} className="space-y-3">
        <input
          type="email"
          name="email"
          defaultValue={profile.email || ''}
          placeholder="Seu e-mail"
          className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
        />
        <input
          type="tel"
          name="phone"
          defaultValue={profile.phone || ''}
          placeholder="Seu telefone"
          className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Buscando...' : 'Buscar pedidos'}
        </button>
      </form>

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

            <p className="text-sm text-muted">
              Total: <strong className="text-gray-900">{money(order.total)}</strong>
            </p>

            {order.items && order.items.length > 0 && (
              <div className="space-y-1.5">
                {order.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted">
                    <span className="font-medium text-gray-700">{it.name}</span>
                    <span>
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
              Acompanhar →
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
