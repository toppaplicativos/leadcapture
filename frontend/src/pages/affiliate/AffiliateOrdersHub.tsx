/**
 * Pedidos do afiliado — lista + criação.
 * Layout simples (flex), qty digitável, touch targets grandes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronRight, CircleDollarSign, Clock3, Copy, Minus, PackageCheck,
  Plus, Search, ShoppingBag, UserRound, X, MessageCircle,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AffiliateProductCatalogItem } from '@/lib/affiliates/types'
import type { AppContext } from '@/pages/affiliate/types'
import { resolveProductVolumePrice } from '@/lib/product-volume-pricing'

const money = (value: number | string | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STEPS = [
  { key: 'criado', label: 'Criado' },
  { key: 'aguardando_pagamento', label: 'Pagamento' },
  { key: 'pago', label: 'Confirmado' },
  { key: 'em_preparacao', label: 'Preparação' },
  { key: 'em_entrega', label: 'Entrega' },
  { key: 'entregue', label: 'Concluído' },
]

const STATUS_LABEL: Record<string, string> = {
  criado: 'Pedido criado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pagamento confirmado',
  em_preparacao: 'Em preparação',
  em_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  estornado: 'Estornado',
  abandonado: 'Não concluído',
}

type CartItem = { product: AffiliateProductCatalogItem; quantity: number }

const unitPrice = (product: AffiliateProductCatalogItem, quantity: number) =>
  resolveProductVolumePrice(product, quantity)?.itemUnitPrice ??
  (product.promo_price && product.promo_price < product.price ? product.promo_price : product.price)

function parseQty(raw: string): number {
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(99999, Math.floor(n))
}

export function AffiliateOrdersHub({ ctx }: { ctx: AppContext }) {
  const primary = ctx.primary || '#171717'
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
  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null)
  const [createDone, setCreateDone] = useState(false)

  const load = useCallback(async () => {
    try {
      const [orderData, productData] = await Promise.all([
        affiliateApi.orders(),
        affiliateApi.products(),
      ])
      setOrders(orderData.orders || [])
      setSummary(orderData.summary || null)
      setProducts(productData.products || [])
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao carregar pedidos', 'err')
    } finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.category || '').toLowerCase().includes(q),
    )
  }, [products, search])

  const cartQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])
  const total = useMemo(
    () => cart.reduce((s, i) => s + unitPrice(i.product, i.quantity) * i.quantity, 0),
    [cart],
  )

  function getQty(productId: string) {
    return cart.find((c) => c.product.id === productId)?.quantity || 0
  }

  function setQty(product: AffiliateProductCatalogItem, quantity: number) {
    const q = Math.max(0, Math.floor(quantity))
    setCart((prev) => {
      const rest = prev.filter((c) => c.product.id !== product.id)
      if (q <= 0) return rest
      return [...rest, { product, quantity: q }]
    })
  }

  function bump(product: AffiliateProductCatalogItem, delta: number) {
    setQty(product, getQty(product.id) + delta)
  }

  function closeCreator() {
    setCreateOpen(false)
    setStep(1)
    setCart([])
    setSearch('')
    setCustomer({ name: '', phone: '', email: '', payment: 'pix' })
    setLastCheckoutUrl(null)
    setCreateDone(false)
  }

  function openCreator() {
    setLastCheckoutUrl(null)
    setCreateDone(false)
    setStep(1)
    setCart([])
    setSearch('')
    setCustomer({ name: '', phone: '', email: '', payment: 'pix' })
    setCreateOpen(true)
  }

  async function createOrder() {
    setSaving(true)
    try {
      const res = await affiliateApi.createOrder({
        customer_name: customer.name.trim(),
        customer_phone: customer.phone.trim(),
        customer_email: customer.email.trim() || undefined,
        payment_method: customer.payment,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
      })
      const url =
        res?.checkout_url ||
        res?.order?.payment_link ||
        res?.order?.checkout_url ||
        null
      setLastCheckoutUrl(url)
      setCreateDone(true)
      ctx.showToast('Pedido criado com sucesso')
      await load()
    } catch (e) {
      ctx.showToast(
        e instanceof Error ? e.message : 'Não foi possível criar o pedido',
        'err',
      )
    } finally {
      setSaving(false)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      ctx.showToast('Copiado')
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function shareWhatsApp(phone: string, url: string, name?: string) {
    const digits = String(phone || '').replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Olá${name ? ` ${name}` : ''}! Segue o link do seu pedido:\n${url}`,
    )
    window.open(
      digits ? `https://wa.me/${digits}?text=${msg}` : `https://wa.me/?text=${msg}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="affiliate-skel h-28" />
        <div className="affiliate-skel h-24" />
        <div className="affiliate-skel h-24" />
      </div>
    )
  }

  const afterCreate = createDone

  return (
    <div className="aff-orders">
      {/* Header */}
      <div className="aff-orders__top">
        <div>
          <h2 className="aff-orders__title">Pedidos</h2>
          <p className="aff-orders__sub">
            {money(summary?.revenue)} em pedidos · {orders.length} no total
          </p>
        </div>
        <button
          type="button"
          className="aff-orders__new-btn"
          style={{ background: primary }}
          onClick={openCreator}
        >
          <Plus size={18} strokeWidth={2.25} />
          Novo
        </button>
      </div>

      {/* KPIs */}
      <div className="aff-orders__kpis">
        <div className="aff-orders__kpi">
          <Clock3 size={15} className="text-neutral-400" />
          <div>
            <span>Andamento</span>
            <strong>{summary?.open ?? 0}</strong>
          </div>
        </div>
        <div className="aff-orders__kpi">
          <CircleDollarSign size={15} className="text-neutral-400" />
          <div>
            <span>Aguardando</span>
            <strong>{summary?.awaiting_payment ?? 0}</strong>
          </div>
        </div>
        <div className="aff-orders__kpi">
          <PackageCheck size={15} className="text-neutral-400" />
          <div>
            <span>Concluídos</span>
            <strong>{summary?.completed ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* List */}
      {!orders.length ? (
        <div className="aff-orders__empty">
          <ShoppingBag size={28} strokeWidth={1.5} />
          <h3>Nenhum pedido ainda</h3>
          <p>Crie um pedido para o cliente, envie o link de pagamento e acompanhe a entrega.</p>
          <button type="button" style={{ background: primary }} onClick={openCreator}>
            Criar pedido
          </button>
        </div>
      ) : (
        <div className="aff-orders__list">
          {orders.map((order) => {
            const status = String(order.status_pedido || 'criado')
            const idx = Math.max(0, STEPS.findIndex((s) => s.key === status))
            const bad = ['cancelado', 'estornado', 'abandonado'].includes(status)
            const checkout =
              order.checkout_url || order.payment_link || null
            return (
              <article key={order.id} className="aff-orders__card">
                <div className="aff-orders__card-row">
                  <div className="min-w-0">
                    <p className="aff-orders__id">
                      #{String(order.id).slice(0, 8).toUpperCase()}
                    </p>
                    <h3 className="aff-orders__name">
                      {order.customer_name || 'Cliente'}
                    </h3>
                    <p className="aff-orders__meta">
                      {order.items_count || order.items?.length || 0} itens ·{' '}
                      {money(order.valor_total)}
                    </p>
                  </div>
                  <span className={`aff-orders__badge${bad ? ' is-bad' : ''}`}>
                    {STATUS_LABEL[status] || status}
                  </span>
                </div>

                {!bad && (
                  <div className="aff-orders__dots" aria-hidden>
                    {STEPS.map((s, i) => (
                      <i key={s.key} className={i <= idx ? 'is-on' : ''} />
                    ))}
                  </div>
                )}

                <div className="aff-orders__actions">
                  {checkout &&
                    ['criado', 'aguardando_pagamento'].includes(status) && (
                      <button
                        type="button"
                        className="aff-orders__btn-wa"
                        onClick={() =>
                          shareWhatsApp(
                            order.customer_phone,
                            checkout,
                            order.customer_name,
                          )
                        }
                      >
                        <MessageCircle size={15} />
                        Cobrar
                      </button>
                    )}
                  <button
                    type="button"
                    className="aff-orders__btn-detail"
                    onClick={() => setSelectedOrder(order)}
                  >
                    Ver detalhes
                    <ChevronRight size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* ===== CREATE FULLSCREEN ===== */}
      {createOpen && (
        <div className="aff-create" role="dialog" aria-modal="true">
          <header className="aff-create__header">
            <div>
              <p className="aff-create__step-label">
                {afterCreate ? 'Concluído' : `Passo ${step} de 3`}
              </p>
              <h2>
                {afterCreate
                  ? 'Pedido criado'
                  : step === 1
                    ? 'Produtos'
                    : step === 2
                      ? 'Cliente'
                      : 'Confirmar'}
              </h2>
            </div>
            <button type="button" className="aff-create__close" onClick={closeCreator} aria-label="Fechar">
              <X size={20} />
            </button>
          </header>

          <div className="aff-create__bar">
            <span style={{ width: afterCreate ? '100%' : `${(step / 3) * 100}%`, background: primary }} />
          </div>

          <div className="aff-create__body">
            {/* SUCCESS */}
            {afterCreate && (
              <div className="aff-create__done">
                <div className="aff-create__done-icon" style={{ color: primary, background: `${primary}14` }}>
                  <Check size={28} strokeWidth={2.5} />
                </div>
                <h3>Tudo certo</h3>
                <p>
                  Pedido registrado com seu cupom. Estoque reservado (se controlado) e comissão gerada.
                </p>
                {lastCheckoutUrl && (
                  <div className="aff-create__link">
                    <label>Link de pagamento</label>
                    <p>{lastCheckoutUrl}</p>
                    <div className="aff-create__link-btns">
                      <button type="button" onClick={() => void copyText(lastCheckoutUrl)}>
                        <Copy size={15} /> Copiar
                      </button>
                      <button
                        type="button"
                        style={{ background: primary, color: '#fff', borderColor: primary }}
                        onClick={() =>
                          shareWhatsApp(customer.phone, lastCheckoutUrl, customer.name)
                        }
                      >
                        <MessageCircle size={15} /> WhatsApp
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="aff-create__primary"
                  style={{ background: primary }}
                  onClick={closeCreator}
                >
                  Voltar aos pedidos
                </button>
              </div>
            )}

            {/* STEP 1 — products */}
            {!afterCreate && step === 1 && (
              <>
                <div className="aff-create__search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto"
                  />
                </div>

                {cartQty > 0 && (
                  <div className="aff-create__cart-summary">
                    <span>
                      <strong>{cartQty}</strong> no carrinho
                    </span>
                    <strong>{money(total)}</strong>
                  </div>
                )}

                <div className="aff-create__products">
                  {filteredProducts.map((product) => {
                    const qty = getQty(product.id)
                    const price = unitPrice(product, Math.max(1, qty))
                    return (
                      <div key={product.id} className="aff-create__product">
                        <div className="aff-create__thumb">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" />
                          ) : (
                            <ShoppingBag size={18} />
                          )}
                        </div>
                        <div className="aff-create__pinfo">
                          <strong>{product.name}</strong>
                          <span>{money(price)}</span>
                        </div>
                        {qty <= 0 ? (
                          <button
                            type="button"
                            className="aff-create__add"
                            style={{ background: primary }}
                            onClick={() => setQty(product, 1)}
                          >
                            <Plus size={16} />
                          </button>
                        ) : (
                          <div className="aff-create__stepper">
                            <button
                              type="button"
                              aria-label="Menos"
                              onClick={() => bump(product, -1)}
                            >
                              <Minus size={16} />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={String(qty)}
                              aria-label={`Qtd ${product.name}`}
                              onChange={(e) => setQty(product, parseQty(e.target.value))}
                              onFocus={(e) => e.target.select()}
                            />
                            <button
                              type="button"
                              aria-label="Mais"
                              style={{ background: primary, color: '#fff' }}
                              onClick={() => bump(product, 1)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!filteredProducts.length && (
                    <p className="aff-create__none">Nenhum produto encontrado</p>
                  )}
                </div>
              </>
            )}

            {/* STEP 2 — customer */}
            {!afterCreate && step === 2 && (
              <div className="aff-create__form">
                <div className="aff-create__hint">
                  <UserRound size={18} style={{ color: primary }} />
                  <div>
                    <strong>Dados do cliente</strong>
                    <span>Usados no checkout e no acompanhamento</span>
                  </div>
                </div>
                <label>
                  Nome
                  <input
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    placeholder="Nome completo"
                    autoComplete="name"
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>
                <label>
                  E-mail <em>opcional</em>
                  <input
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                    placeholder="email@cliente.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </label>
                <div className="aff-create__pay">
                  <span>Pagamento</span>
                  <div>
                    {(['pix', 'cartao', 'boleto'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={customer.payment === m ? 'is-on' : ''}
                        style={
                          customer.payment === m
                            ? { background: primary, borderColor: primary, color: '#fff' }
                            : undefined
                        }
                        onClick={() => setCustomer({ ...customer, payment: m })}
                      >
                        {m === 'pix' ? 'Pix' : m === 'cartao' ? 'Cartão' : 'Boleto'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 — review (before success) */}
            {!afterCreate && step === 3 && (
              <div className="aff-create__review">
                <div className="aff-create__review-client">
                  <UserRound size={18} />
                  <div>
                    <strong>{customer.name}</strong>
                    <span>
                      {customer.phone} ·{' '}
                      {customer.payment === 'pix'
                        ? 'Pix'
                        : customer.payment === 'cartao'
                          ? 'Cartão'
                          : 'Boleto'}
                    </span>
                  </div>
                </div>
                {cart.map((item) => (
                  <div key={item.product.id} className="aff-create__review-line">
                    <div className="min-w-0">
                      <strong>{item.product.name}</strong>
                      <span>
                        {item.quantity} × {money(unitPrice(item.product, item.quantity))}
                      </span>
                    </div>
                    <div className="aff-create__stepper aff-create__stepper--sm">
                      <button type="button" onClick={() => bump(item.product, -1)}>
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(item.quantity)}
                        onChange={(e) => setQty(item.product, parseQty(e.target.value))}
                        onFocus={(e) => e.target.select()}
                      />
                      <button type="button" onClick={() => bump(item.product, 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <b>{money(unitPrice(item.product, item.quantity) * item.quantity)}</b>
                  </div>
                ))}
                <div className="aff-create__total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="aff-create__note">
                  Ao confirmar, o sistema valida estoque, aplica seu cupom e gera a comissão.
                </p>
              </div>
            )}
          </div>

          {!afterCreate && (
            <footer className="aff-create__footer">
              <button
                type="button"
                className="aff-create__ghost"
                onClick={() => (step === 1 ? closeCreator() : setStep((s) => (s - 1) as 1 | 2))}
              >
                {step === 1 ? 'Cancelar' : 'Voltar'}
              </button>
              <button
                type="button"
                className="aff-create__primary"
                style={{ background: primary }}
                disabled={
                  saving ||
                  (step === 1 && cart.length === 0) ||
                  (step === 2 && (!customer.name.trim() || !customer.phone.trim())) ||
                  (step === 3 && cart.length === 0)
                }
                onClick={() => {
                  if (step < 3) setStep((s) => (s + 1) as 2 | 3)
                  else void createOrder()
                }}
              >
                {saving
                  ? 'Salvando…'
                  : step === 3
                    ? `Confirmar · ${money(total)}`
                    : step === 1
                      ? cartQty
                        ? `Continuar · ${cartQty} itens`
                        : 'Continuar'
                      : 'Continuar'}
              </button>
            </footer>
          )}
        </div>
      )}

      {/* ===== DETAIL SHEET ===== */}
      {selectedOrder && (
        <div className="aff-detail" role="dialog" aria-modal="true">
          <button
            type="button"
            className="aff-detail__bg"
            aria-label="Fechar"
            onClick={() => setSelectedOrder(null)}
          />
          <div className="aff-detail__sheet">
            <header className="aff-detail__head">
              <div>
                <span>#{String(selectedOrder.id).slice(0, 8).toUpperCase()}</span>
                <h2>{selectedOrder.customer_name || 'Cliente'}</h2>
              </div>
              <button type="button" onClick={() => setSelectedOrder(null)} aria-label="Fechar">
                <X size={20} />
              </button>
            </header>

            <div className="aff-detail__total">
              <span>Total</span>
              <strong>{money(selectedOrder.valor_total)}</strong>
              <em>
                {STATUS_LABEL[selectedOrder.status_pedido] || selectedOrder.status_pedido}
              </em>
            </div>

            <div className="aff-detail__grid">
              <div>
                <span>WhatsApp</span>
                <strong>{selectedOrder.customer_phone || '—'}</strong>
              </div>
              <div>
                <span>Pagamento</span>
                <strong>
                  {selectedOrder.forma_pagamento === 'cartao'
                    ? 'Cartão'
                    : selectedOrder.forma_pagamento === 'boleto'
                      ? 'Boleto'
                      : 'Pix'}
                </strong>
              </div>
              <div>
                <span>Cupom</span>
                <strong>{selectedOrder.cupom_codigo || '—'}</strong>
              </div>
              <div>
                <span>Itens</span>
                <strong>
                  {selectedOrder.items_count || selectedOrder.items?.length || 0}
                </strong>
              </div>
            </div>

            {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
              <>
                <h3 className="aff-detail__h">Itens</h3>
                <ul className="aff-detail__items">
                  {selectedOrder.items.map((it: any, i: number) => (
                    <li key={i}>
                      <span>
                        {Number(it.quantidade || 0)}× {it.nome}
                      </span>
                      <b>{money(it.valor_total)}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(selectedOrder.checkout_url || selectedOrder.payment_link) && (
              <>
                <h3 className="aff-detail__h">Cobrança</h3>
                <div className="aff-detail__checkout">
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        selectedOrder.checkout_url || selectedOrder.payment_link,
                      )
                    }
                  >
                    <Copy size={15} /> Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      shareWhatsApp(
                        selectedOrder.customer_phone,
                        selectedOrder.checkout_url || selectedOrder.payment_link,
                        selectedOrder.customer_name,
                      )
                    }
                  >
                    <MessageCircle size={15} /> WhatsApp
                  </button>
                </div>
              </>
            )}

            <h3 className="aff-detail__h">Andamento</h3>
            <ol className="aff-detail__steps">
              {STEPS.map((s, i) => {
                const cur = Math.max(
                  0,
                  STEPS.findIndex((x) => x.key === selectedOrder.status_pedido),
                )
                return (
                  <li key={s.key} className={i <= cur ? 'is-done' : ''}>
                    <i>{i <= cur ? <Check size={12} /> : i + 1}</i>
                    <span>{s.label}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
