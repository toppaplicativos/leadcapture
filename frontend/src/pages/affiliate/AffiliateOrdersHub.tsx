import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, CircleDollarSign, Clock3, Minus, PackageCheck, Plus, Search, ShoppingBag, Sparkles, Truck, UserRound, X } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AffiliateProductCatalogItem } from '@/lib/affiliates/types'
import type { AppContext } from '@/pages/affiliate/types'

const money = (value: number | string | undefined) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STEPS = [
  { key: 'criado', label: 'Criado' },
  { key: 'aguardando_pagamento', label: 'Pagamento' },
  { key: 'pago', label: 'Confirmado' },
  { key: 'em_preparacao', label: 'Preparação' },
  { key: 'em_entrega', label: 'Entrega' },
  { key: 'entregue', label: 'Concluído' },
]
const STATUS_LABEL: Record<string, string> = {
  criado: 'Pedido criado', aguardando_pagamento: 'Aguardando pagamento', pago: 'Pagamento confirmado',
  em_preparacao: 'Em preparação', em_entrega: 'Saiu para entrega', entregue: 'Entregue',
  cancelado: 'Cancelado', estornado: 'Estornado', abandonado: 'Não concluído',
}

type CartItem = { product: AffiliateProductCatalogItem; quantity: number }

export function AffiliateOrdersHub({ ctx }: { ctx: AppContext }) {
  const [orders, setOrders] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [products, setProducts] = useState<AffiliateProductCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', payment: 'pix' })
  const [saving, setSaving] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)

  const load = useCallback(async () => {
    try {
      const [orderData, productData] = await Promise.all([affiliateApi.orders(), affiliateApi.products()])
      setOrders(orderData.orders || [])
      setSummary(orderData.summary || null)
      setProducts(productData.products || [])
    } catch (e) { ctx.showToast(e instanceof Error ? e.message : 'Erro ao carregar pedidos', 'err') }
    finally { setLoading(false) }
  }, [ctx.showToast])

  useEffect(() => { void load() }, [load, ctx.cacheVersion])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q))
  }, [products, search])
  const total = useMemo(() => cart.reduce((sum, item) => {
    const price = item.product.promo_price && item.product.promo_price < item.product.price ? item.product.promo_price : item.product.price
    return sum + price * item.quantity
  }, 0), [cart])

  function changeProduct(product: AffiliateProductCatalogItem, delta: number) {
    setCart((current) => {
      const found = current.find((item) => item.product.id === product.id)
      if (!found && delta > 0) return [...current, { product, quantity: 1 }]
      return current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0)
    })
  }

  function closeCreator() {
    setCreateOpen(false); setStep(1); setCart([]); setSearch(''); setCustomer({ name: '', phone: '', email: '', payment: 'pix' })
  }

  async function createOrder() {
    setSaving(true)
    try {
      await affiliateApi.createOrder({
        customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email || undefined,
        payment_method: customer.payment, items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      })
      ctx.showToast('Pedido criado e adicionado ao acompanhamento')
      closeCreator()
      await load()
    } catch (e) { ctx.showToast(e instanceof Error ? e.message : 'Não foi possível criar o pedido', 'err') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="space-y-3"><div className="affiliate-skel h-28" /><div className="affiliate-skel h-24" /><div className="affiliate-skel h-24" /></div>

  return (
    <div className="affiliate-orders space-y-3 pb-2">
      <section className="affiliate-orders__hero">
        <div><p>Central de pedidos</p><h2>Venda, acompanhe e faça o pós-venda.</h2></div>
        <button type="button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Novo pedido</button>
      </section>

      <div className="affiliate-orders__stats">
        <div><Clock3 size={16} /><span>Em andamento</span><strong>{summary?.open || 0}</strong></div>
        <div><CircleDollarSign size={16} /><span>Aguardando</span><strong>{summary?.awaiting_payment || 0}</strong></div>
        <div><PackageCheck size={16} /><span>Concluídos</span><strong>{summary?.completed || 0}</strong></div>
      </div>

      <div className="affiliate-orders__head"><div><h3>Pedidos recentes</h3><p>{money(summary?.revenue)} em pedidos válidos</p></div><span>{orders.length}</span></div>
      {!orders.length ? (
        <div className="affiliate-orders__empty"><ShoppingBag size={26} /><h3>Seu primeiro pedido começa aqui</h3><p>Monte o carrinho para o cliente e acompanhe pagamento, preparação e entrega.</p><button type="button" onClick={() => setCreateOpen(true)}>Criar pedido</button></div>
      ) : orders.map((order) => {
        const status = String(order.status_pedido || 'criado')
        const currentIndex = Math.max(0, STEPS.findIndex((item) => item.key === status))
        const terminal = ['cancelado', 'estornado', 'abandonado'].includes(status)
        return (
          <article key={order.id} className="affiliate-orders__card">
            <div className="affiliate-orders__card-top"><div><span>#{String(order.id).slice(0, 8).toUpperCase()}</span><h3>{order.customer_name || 'Cliente'}</h3><p>{order.items_count || 0} item(ns) · {money(order.valor_total)}</p></div><strong className={terminal ? 'is-error' : ''}>{STATUS_LABEL[status] || status}</strong></div>
            {!terminal && <div className="affiliate-orders__timeline">{STEPS.map((item, index) => <span key={item.key} className={index <= currentIndex ? 'is-done' : ''}><i>{index < currentIndex ? <Check size={10} /> : index + 1}</i><small>{item.label}</small></span>)}</div>}
            <button type="button" onClick={() => setSelectedOrder(order)}><span>Ver pedido completo</span><ChevronRight size={16} /></button>
          </article>
        )
      })}

      {createOpen && (
        <div className="affiliate-order-create" role="dialog" aria-modal="true" aria-labelledby="new-order-title">
          <div className="affiliate-order-create__sheet">
            <header><div><span>Etapa {step} de 3</span><h2 id="new-order-title">{step === 1 ? 'Escolha os produtos' : step === 2 ? 'Dados do cliente' : 'Revise o pedido'}</h2></div><button type="button" aria-label="Fechar" onClick={closeCreator}><X size={19} /></button></header>
            <div className="affiliate-order-create__progress"><span style={{ width: `${step * 33.34}%` }} /></div>
            <main>
              {step === 1 && <><label className="affiliate-order-create__search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no catálogo" /></label><div className="affiliate-order-create__products">{filteredProducts.map((product) => { const qty = cart.find((item) => item.product.id === product.id)?.quantity || 0; const price = product.promo_price && product.promo_price < product.price ? product.promo_price : product.price; return <div key={product.id}><div>{product.image_url ? <img src={product.image_url} alt="" /> : <ShoppingBag size={18} />}</div><span><strong>{product.name}</strong><small>{money(price)}</small></span><aside>{qty > 0 && <button type="button" onClick={() => changeProduct(product, -1)}><Minus size={14} /></button>}<b>{qty || ''}</b><button type="button" onClick={() => changeProduct(product, 1)}><Plus size={14} /></button></aside></div> })}</div></>}
              {step === 2 && <div className="affiliate-order-create__fields"><div className="affiliate-order-create__customer"><UserRound size={18} /><span><strong>Para quem é o pedido?</strong><small>Use os dados reais para o checkout e acompanhamento.</small></span></div><label>Nome do cliente<input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Nome completo" /></label><label>WhatsApp<input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} inputMode="tel" placeholder="(00) 00000-0000" /></label><label>E-mail <small>opcional</small><input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} inputMode="email" placeholder="cliente@email.com" /></label><fieldset><legend>Forma de pagamento</legend>{['pix','cartao','boleto'].map((method) => <button type="button" key={method} className={customer.payment === method ? 'is-selected' : ''} onClick={() => setCustomer({ ...customer, payment: method })}>{method === 'pix' ? 'Pix' : method === 'cartao' ? 'Cartão' : 'Boleto'}</button>)}</fieldset></div>}
              {step === 3 && <div className="affiliate-order-create__review"><div><UserRound size={17} /><span><strong>{customer.name}</strong><small>{customer.phone} · {customer.payment === 'cartao' ? 'Cartão' : customer.payment === 'pix' ? 'Pix' : 'Boleto'}</small></span></div>{cart.map((item) => <div key={item.product.id}><span><strong>{item.product.name}</strong><small>{item.quantity} unidade(s)</small></span><b>{money((item.product.promo_price || item.product.price) * item.quantity)}</b></div>)}<footer><span>Total</span><strong>{money(total)}</strong></footer><p><Sparkles size={14} /> O pedido será associado ao seu cupom e aparecerá nesta linha do tempo.</p></div>}
            </main>
            <footer><button type="button" onClick={() => step === 1 ? closeCreator() : setStep((step - 1) as 1 | 2)}>Voltar</button><button type="button" disabled={saving || (step === 1 && !cart.length) || (step === 2 && (!customer.name.trim() || !customer.phone.trim()))} onClick={() => step < 3 ? setStep((step + 1) as 2 | 3) : void createOrder()}>{saving ? 'Criando…' : step === 3 ? 'Confirmar pedido' : 'Continuar'}</button></footer>
          </div>
        </div>
      )}
      {selectedOrder && (
        <div className="affiliate-order-detail" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
          <button type="button" className="affiliate-order-detail__backdrop" aria-label="Fechar" onClick={() => setSelectedOrder(null)} />
          <div className="affiliate-order-detail__sheet">
            <header><div><span>Pedido #{String(selectedOrder.id).slice(0, 8).toUpperCase()}</span><h2 id="order-detail-title">{selectedOrder.customer_name || 'Cliente'}</h2></div><button type="button" aria-label="Fechar" onClick={() => setSelectedOrder(null)}><X size={19} /></button></header>
            <div className="affiliate-order-detail__amount"><span>Total do pedido</span><strong>{money(selectedOrder.valor_total)}</strong><small>{STATUS_LABEL[selectedOrder.status_pedido] || selectedOrder.status_pedido}</small></div>
            <div className="affiliate-order-detail__info"><div><span>WhatsApp</span><strong>{selectedOrder.customer_phone || 'Não informado'}</strong></div><div><span>Pagamento</span><strong>{selectedOrder.forma_pagamento === 'cartao' ? 'Cartão' : selectedOrder.forma_pagamento === 'pix' ? 'Pix' : 'Boleto'}</strong></div><div><span>Itens</span><strong>{selectedOrder.items_count || 0}</strong></div><div><span>Cupom</span><strong>{selectedOrder.cupom_codigo || '—'}</strong></div></div>
            <h3>Andamento</h3>
            <div className="affiliate-order-detail__steps">{STEPS.map((item, index) => { const current = Math.max(0, STEPS.findIndex((stepItem) => stepItem.key === selectedOrder.status_pedido)); return <div key={item.key} className={index <= current ? 'is-done' : ''}><i>{index <= current ? <Check size={12} /> : index + 1}</i><span><strong>{item.label}</strong><small>{index < current ? 'Concluído' : index === current ? 'Etapa atual' : 'Aguardando'}</small></span></div> })}</div>
          </div>
        </div>
      )}
    </div>
  )
}
