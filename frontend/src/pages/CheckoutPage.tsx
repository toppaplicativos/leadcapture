import { useEffect, useState, useCallback } from 'react'
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, CreditCard, ImageOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog, createOrder, type Product } from '@/lib/api'
import { useCartStore } from '@/lib/store'
import { getCustomer, setCustomer } from '@/lib/store'
import { money, storeUrl, normalizePhone } from '@/lib/store-context'
import { useToast } from '@/components/Toast'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { items, updateQty, removeItem, clear } = useCartStore()
  const [products, setProducts] = useState<Map<string, Product>>(new Map())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        const map = new Map<string, Product>()
        ;(data.all_products || []).forEach((p) => map.set(String(p.id), p))
        setProducts(map)

        // Apply brand colors
        const brand = data.store.brand
        const theme = data.store.theme
        const primary = brand?.primary_color || theme?.primary_color || '#111827'
        const secondary = brand?.secondary_color || theme?.secondary_color || '#3b82f6'
        const root = document.documentElement
        root.style.setProperty('--brand-primary', primary)
        root.style.setProperty('--brand-secondary', secondary)
        root.style.setProperty('--brand-primary-light', primary + '0d')
        root.style.setProperty('--brand-secondary-light', secondary + '14')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const cartIds = Object.keys(items).filter((k) => items[k] > 0)
  const total = cartIds.reduce((sum, id) => {
    const p = products.get(id)
    return sum + (p ? Number(p.price) * items[id] : 0)
  }, 0)

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      const email = String(fd.get('email') || '').trim().toLowerCase()
      const responsibleName = String(fd.get('responsible_name') || '').trim()
      const establishmentName = String(fd.get('establishment_name') || '').trim()
      const phone = String(fd.get('phone') || '').trim()
      const address = String(fd.get('address') || '').trim()
      const paymentMethod = String(fd.get('payment_method') || '').trim()
      const notes = String(fd.get('notes') || '').trim()

      if (!email || !responsibleName) {
        setError('Informe e-mail e nome do responsável.')
        return
      }

      setCustomer({
        email,
        responsible_name: responsibleName,
        establishment_name: establishmentName,
        phone,
        name: responsibleName,
        establishment: establishmentName,
        address,
      })

      const orderItems = cartIds
        .filter((id) => items[id] > 0)
        .map((id) => ({ product_id: id, quantity: items[id] }))

      if (orderItems.length === 0) {
        setError('Carrinho vazio.')
        return
      }

      setSubmitting(true)
      setError('')

      try {
        const result = await createOrder({
          items: orderItems,
          customer: {
            name: responsibleName || establishmentName,
            phone,
            email,
            address: {
              text: address || undefined,
              establishment_name: establishmentName || undefined,
            },
          },
          payment_method: paymentMethod,
          notes: [
            establishmentName ? `Estabelecimento: ${establishmentName}` : '',
            notes,
          ]
            .filter(Boolean)
            .join(' | '),
        })

        clear()

        const order = result.order
        if (order.customer_id) {
          setCustomer({ ...getCustomer(), customer_id: order.customer_id })
        }

        if (result.checkout_url) {
          window.location.href = result.checkout_url
          return
        }

        navigate(
          `${storeUrl('pedido')}?order_number=${encodeURIComponent(order.order_number || '')}&phone=${encodeURIComponent(normalizePhone(phone))}`,
        )
      } catch (err: any) {
        setError(err.message || 'Erro ao finalizar pedido.')
      } finally {
        setSubmitting(false)
      }
    },
    [cartIds, items, clear, navigate],
  )

  const profile = getCustomer()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-12 h-12 rounded-full" />
      </div>
    )
  }

  return (
    <div className="page-enter min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border safe-area-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto">
          <button
            onClick={() => navigate(storeUrl())}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold">Checkout</h1>
        </div>
      </header>

      {cartIds.length === 0 ? (
        /* Empty cart */
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-muted font-medium">Seu carrinho está vazio</p>
          <button
            onClick={() => navigate(storeUrl())}
            className="text-sm font-semibold text-[var(--brand-secondary)] hover:underline"
          >
            Voltar ao catálogo
          </button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-4 pb-8 space-y-6">
          {/* Cart items */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
              Itens ({cartIds.length})
            </h2>
            {cartIds.map((id) => {
              const p = products.get(id)
              if (!p) return null
              const qty = items[id]
              const line = Number(p.price) * qty
              const imgSrc = p.image || p.images?.[0] || ''

              return (
                <div
                  key={id}
                  className="flex gap-3 bg-surface border border-border rounded-2xl p-3"
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={p.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <ImageOff className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate">{p.name}</h4>
                    <p className="text-xs text-muted">{money(p.price)} /un</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => updateQty(id, -1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-semibold tabular-nums">
                        {qty}
                      </span>
                      <button
                        onClick={() => updateQty(id, 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-sm font-bold">{money(line)}</span>
                    <button
                      onClick={() => {
                        removeItem(id)
                        showToast('Item removido')
                      }}
                      className="text-muted hover:text-danger transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Summary */}
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-sm text-muted">Total</span>
              <span className="text-xl font-bold">{money(total)}</span>
            </div>
          </section>

          {/* Checkout form */}
          {error && (
            <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
              Dados do pedido
            </h2>

            {[
              { name: 'email', label: 'E-mail *', type: 'email', value: profile.email || '', required: true, placeholder: 'seu@email.com' },
              { name: 'responsible_name', label: 'Nome do responsável *', type: 'text', value: profile.responsible_name || profile.name || '', required: true, placeholder: 'Nome completo' },
              { name: 'establishment_name', label: 'Estabelecimento (opcional)', type: 'text', value: profile.establishment_name || profile.establishment || '', required: false, placeholder: 'Nome do estabelecimento' },
              { name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: profile.phone || '', required: false, placeholder: '(00) 00000-0000' },
              { name: 'address', label: 'Endereço de entrega', type: 'text', value: profile.address || '', required: false, placeholder: 'Rua, número, bairro' },
            ].map(({ name, label, type, value, required, placeholder }) => (
              <div key={name} className="space-y-1.5">
                <label htmlFor={name} className="text-xs font-medium text-gray-600">
                  {label}
                </label>
                <input
                  id={name}
                  name={name}
                  type={type}
                  defaultValue={value}
                  required={required}
                  placeholder={placeholder}
                  className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <label htmlFor="payment_method" className="text-xs font-medium text-gray-600">
                Forma de pagamento
              </label>
              <select
                id="payment_method"
                name="payment_method"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition appearance-none"
              >
                <option value="">Selecione...</option>
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="boleto">Boleto</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-xs font-medium text-gray-600">
                Observações (opcional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Informações adicionais..."
                className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] text-white font-bold py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 text-base"
            >
              <CreditCard className="w-5 h-5" />
              {submitting ? 'Processando...' : `Finalizar pedido • ${money(total)}`}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
