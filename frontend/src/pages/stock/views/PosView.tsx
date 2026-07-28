import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronRight, CircleDollarSign, FileText, Minus, Package, Pencil,
  Plus, Search, ShoppingCart, Trash2, UserPlus, UserRound, X,
} from 'lucide-react'
import { stockApi } from '@/lib/api-admin'
import type { InventoryProduct, ShowToast } from '@/pages/stock/types'
import { resolveProductVolumePrice } from '@/lib/product-volume-pricing'

type PaymentMethod = 'pix' | 'cartao' | 'dinheiro' | 'boleto' | 'prazo' | 'a_combinar'
type CartLine = {
  id: string
  name: string
  price: number
  basePrice: number
  quantity: number
  stock: number
  image?: string
  unit?: string
  metadata?: Record<string, any>
  customPrice?: boolean
}
type ClientOption = { id?: string; client_id?: string; name?: string; phone?: string; email?: string; notes?: string }

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numberFromInput = (value: string) => Number(String(value || '').replace(/\./g, '').replace(',', '.')) || 0
const idOf = (p: InventoryProduct) => String(p.product_id || p.id || '')
const nameOf = (p: InventoryProduct) => String(p.product_name || p.name || 'Produto')
const priceOf = (p: InventoryProduct) => Number(p.promo_price || p.promoPrice || p.product_price || p.price || 0)
const stockOf = (p: InventoryProduct) => Number(p.stock_available ?? p.stock_current ?? 0)
const paymentLabels: Record<PaymentMethod, string> = {
  pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', boleto: 'Boleto', prazo: 'A prazo', a_combinar: 'A combinar',
}

export function PosView({ showToast, onFinished }: { showToast: ShowToast; onFinished: () => void }) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [saveCustomer, setSaveCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('pix')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid')
  const [installments, setInstallments] = useState('1')
  const [dueDate, setDueDate] = useState('')
  const [fulfillment, setFulfillment] = useState<'retirada' | 'entrega'>('retirada')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discount, setDiscount] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<{ number: string; total: number; pending: boolean } | null>(null)
  const clientTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    stockApi.products(300)
      .then((data) => setProducts(data.products || data.items || []))
      .catch(() => showToast('Não foi possível carregar os produtos', 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => () => clearTimeout(clientTimer.current), [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((product) => {
      if (stockOf(product) <= 0 || product.active === false || product.is_active === false) return false
      return !q || nameOf(product).toLowerCase().includes(q) || String(product.sku || product.product_sku || '').toLowerCase().includes(q)
    }).slice(0, 40)
  }, [products, search])

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const requestedDiscount = numberFromInput(discount)
  const discountValue = Math.min(subtotal, Math.max(0, discountMode === 'percent' ? subtotal * Math.min(100, requestedDiscount) / 100 : requestedDiscount))
  const total = subtotal - discountValue
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)

  function add(product: InventoryProduct) {
    const id = idOf(product)
    const stock = stockOf(product)
    setCart((current) => {
      const existing = current.find((line) => line.id === id)
      if (existing) return current.map((line) => {
        if (line.id !== id) return line
        const quantity = Math.min(stock, line.quantity + 1)
        const price = line.customPrice ? line.price : (resolveProductVolumePrice(line, quantity)?.itemUnitPrice ?? line.basePrice)
        return { ...line, quantity, price }
      })
      const basePrice = priceOf(product)
      const line = {
        id, name: nameOf(product), price: basePrice, basePrice, quantity: 1, stock,
        image: product.product_image || product.image_url || product.imageUrl || product.image,
        unit: product.product_unit || product.unit, metadata: product.metadata,
      }
      return [...current, { ...line, price: resolveProductVolumePrice(line, 1)?.itemUnitPrice ?? basePrice }]
    })
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => current
      .map((line) => {
        if (line.id !== id) return line
        const quantity = Math.min(line.stock, Math.max(0, line.quantity + delta))
        const price = line.customPrice ? line.price : (resolveProductVolumePrice(line, quantity)?.itemUnitPrice ?? line.basePrice)
        return { ...line, quantity, price }
      })
      .filter((line) => line.quantity > 0))
  }

  function changePrice(id: string, raw: string) {
    const price = numberFromInput(raw)
    setCart((current) => current.map((line) => line.id === id ? { ...line, price, customPrice: true } : line))
  }

  function searchClients(value: string) {
    setCustomerSearch(value)
    clearTimeout(clientTimer.current)
    if (value.trim().length < 2) {
      setClients([])
      return
    }
    clientTimer.current = setTimeout(async () => {
      setClientsLoading(true)
      try {
        const data = await stockApi.clients(1, 8, value.trim())
        setClients(data.clients || data.items || [])
      } catch {
        setClients([])
      } finally {
        setClientsLoading(false)
      }
    }, 220)
  }

  function selectClient(client: ClientOption) {
    setSelectedClientId(String(client.id || client.client_id || ''))
    setCustomerName(String(client.name || ''))
    setCustomerPhone(String(client.phone || ''))
    setCustomerEmail(String(client.email || ''))
    setCustomerSearch('')
    setClients([])
    setSaveCustomer(false)
  }

  async function finishSale() {
    if (!cart.length || saving) return
    if (cart.some((line) => !Number.isFinite(line.price) || line.price <= 0)) {
      showToast('Revise os preços: todo item precisa ter valor maior que zero', 'error')
      return
    }
    if (fulfillment === 'entrega' && !deliveryAddress.trim()) {
      showToast('Informe o endereço para o pedido com entrega', 'error')
      return
    }
    if (paymentStatus === 'pending' && payment !== 'a_combinar' && !dueDate) {
      showToast('Informe o vencimento da cobrança', 'error')
      return
    }
    setSaving(true)
    try {
      let customerId = selectedClientId
      if (saveCustomer && !selectedClientId && customerName.trim()) {
        const createdClient = await stockApi.createClient({
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          email: customerEmail.trim() || undefined,
        })
        customerId = String(createdClient.client?.id || createdClient.client?.client_id || '')
      }
      const result = await stockApi.createPosOrder({
        items: cart.map((line) => ({
          product_id: line.id, product_name: line.name, quantity: line.quantity, unit_price: line.price,
        })),
        customer_id: customerId || undefined,
        customer_name: customerName.trim() || 'Consumidor final',
        customer_phone: customerPhone.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        payment_method: payment,
        payment_status: paymentStatus,
        installments: Math.max(1, Number(installments) || 1),
        due_date: paymentStatus === 'pending' ? dueDate || undefined : undefined,
        discount: discountValue,
        fulfillment,
        delivery_address: fulfillment === 'entrega' ? deliveryAddress.trim() : undefined,
        order_notes: orderNotes.trim() || undefined,
      })
      setReceipt({
        number: String(result.receipt_number || result.order?.id || '').slice(0, 8).toUpperCase(),
        total,
        pending: paymentStatus === 'pending',
      })
      setCheckoutOpen(false)
      resetOrder()
      onFinished()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível criar o pedido', 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetOrder() {
    setCart([]); setCustomerSearch(''); setClients([]); setSelectedClientId(''); setSaveCustomer(false)
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setPayment('pix'); setPaymentStatus('paid')
    setInstallments('1'); setDueDate(''); setFulfillment('retirada'); setDeliveryAddress('')
    setDiscount(''); setDiscountMode('amount'); setOrderNotes('')
  }

  if (receipt) return (
    <section className="mx-auto max-w-md py-8 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={30} /></span>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Pedido criado</p>
      <h2 className="mt-1 text-2xl font-bold text-neutral-950">{money(receipt.total)}</h2>
      <p className="mt-2 text-sm text-neutral-500">
        #{receipt.number} · {receipt.pending ? 'Pagamento pendente' : 'Pagamento confirmado'}
      </p>
      <button type="button" onClick={() => setReceipt(null)} className="mt-6 min-h-12 w-full rounded-[18px] bg-neutral-950 text-sm font-bold text-white">Novo pedido</button>
    </section>
  )

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Comanda de venda</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Novo pedido</h2>
        <p className="mt-1 text-xs text-neutral-500">Monte o pedido e defina cliente, valores e pagamento.</p>
      </header>

      <label className="flex min-h-12 items-center gap-2 rounded-[18px] border border-neutral-200 bg-white px-4">
        <Search size={17} className="text-neutral-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto ou código" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>

      {loading ? <p className="py-8 text-center text-sm text-neutral-500">Carregando produtos…</p> : filtered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-neutral-300 bg-white px-5 py-10 text-center">
          <Package size={22} className="mx-auto text-neutral-400" />
          <p className="mt-2 text-sm font-semibold text-neutral-800">Nenhum produto disponível</p>
          <p className="mt-1 text-xs text-neutral-500">Revise a busca ou o saldo de estoque.</p>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <button key={idOf(product)} type="button" onClick={() => add(product)} className="min-h-[142px] rounded-[20px] border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-400 active:scale-[0.98]">
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-neutral-100">
                {product.product_image || product.image_url ? <img src={product.product_image || product.image_url} alt="" className="h-full w-full object-cover" /> : <Package size={18} className="text-neutral-500" />}
              </span>
              <strong className="mt-3 line-clamp-2 block text-[12px] leading-snug text-neutral-900">{nameOf(product)}</strong>
              <span className="mt-1 flex items-center justify-between gap-1">
                <b className="text-[12px] text-neutral-950">{money(priceOf(product))}</b>
                <small className="text-[9px] text-neutral-500">{stockOf(product)} disp.</small>
              </span>
            </button>
          ))}
        </section>
      )}

      <button type="button" disabled={!cart.length} onClick={() => setCheckoutOpen(true)} className="sticky bottom-[72px] flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-neutral-950 px-4 text-white shadow-lg disabled:hidden lg:bottom-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><ShoppingCart size={17} /></span>
        <span className="flex-1 text-left"><strong className="block text-sm">Abrir comanda</strong><small className="text-white/60">{itemCount} item(ns) · tudo editável</small></span>
        <b>{money(subtotal)}</b><ChevronRight size={16} />
      </button>

      {checkoutOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 lg:items-center lg:p-6">
          <section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[26px] bg-white pb-[max(16px,env(safe-area-inset-bottom))] lg:max-w-4xl lg:rounded-[26px] lg:pb-0">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 lg:px-6">
              <div><h3 className="text-base font-bold">Comanda do pedido</h3><p className="text-[10px] text-neutral-500">O pedido será criado exatamente com esta definição</p></div>
              <button type="button" aria-label="Fechar comanda" onClick={() => setCheckoutOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-neutral-100"><X size={17} /></button>
            </header>

            <div className="grid gap-5 p-4 lg:grid-cols-[1.1fr_.9fr] lg:p-6">
              <div className="space-y-4">
                <SectionTitle icon={<ShoppingCart size={15} />} title="Itens e preços" hint="Toque no preço para informar o valor negociado." />
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-neutral-200 p-3">
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-xs">{line.name}</strong>
                          <span className="text-[10px] text-neutral-500">Tabela: {money(line.basePrice)}{line.unit ? ` / ${line.unit}` : ''}</span>
                        </div>
                        <button type="button" aria-label={`Remover ${line.name}`} onClick={() => setCart((c) => c.filter((x) => x.id !== line.id))} className="grid h-9 w-9 place-items-center text-neutral-400"><Trash2 size={15} /></button>
                      </div>
                      <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-3">
                        <div>
                          <span className="mb-1 block text-[9px] font-bold uppercase text-neutral-400">Quantidade</span>
                          <div className="flex items-center rounded-xl bg-neutral-100">
                            <button type="button" aria-label={`Diminuir ${line.name}`} onClick={() => changeQuantity(line.id, -1)} className="grid h-11 w-10 place-items-center"><Minus size={14} /></button>
                            <b className="min-w-8 text-center text-xs">{line.quantity}</b>
                            <button type="button" aria-label={`Aumentar ${line.name}`} onClick={() => changeQuantity(line.id, 1)} className="grid h-11 w-10 place-items-center"><Plus size={14} /></button>
                          </div>
                        </div>
                        <label>
                          <span className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase text-neutral-400"><Pencil size={10} /> Preço unitário</span>
                          <div className={`flex h-11 items-center rounded-xl border px-3 ${line.customPrice ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'}`}>
                            <span className="mr-1 text-xs text-neutral-500">R$</span>
                            <input value={line.price.toFixed(2).replace('.', ',')} onChange={(e) => changePrice(line.id, e.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold outline-none" />
                          </div>
                        </label>
                      </div>
                      <p className="mt-2 text-right text-xs font-bold">{money(line.price * line.quantity)}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-[20px] border border-neutral-200 p-3.5">
                  <SectionTitle icon={<UserRound size={15} />} title="Cliente" hint="Busque um cadastro ou preencha os dados desta venda." />
                  <label className="relative mt-3 block">
                    <Search size={15} className="absolute left-3 top-3.5 text-neutral-400" />
                    <input value={customerSearch} onChange={(e) => searchClients(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" className="h-11 w-full rounded-xl bg-neutral-100 pl-9 pr-3 text-sm outline-none" />
                  </label>
                  {(clientsLoading || clients.length > 0) && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                      {clientsLoading ? <p className="p-3 text-xs text-neutral-500">Buscando clientes…</p> : clients.map((client) => (
                        <button key={String(client.id || client.client_id)} type="button" onClick={() => selectClient(client)} className="flex min-h-12 w-full items-center gap-3 border-b border-neutral-100 px-3 text-left last:border-0 hover:bg-neutral-50">
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100 text-xs font-bold">{String(client.name || '?').charAt(0).toUpperCase()}</span>
                          <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{client.name || 'Cliente'}</strong><small className="block truncate text-[10px] text-neutral-500">{client.phone || client.email || 'Sem contato'}</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedClientId && <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><Check size={12} /> Cliente selecionado do cadastro</p>}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Field value={customerName} onChange={setCustomerName} label="Nome" placeholder="Consumidor final" />
                    <Field value={customerPhone} onChange={setCustomerPhone} label="Telefone" placeholder="(00) 00000-0000" inputMode="tel" />
                    <div className="sm:col-span-2"><Field value={customerEmail} onChange={setCustomerEmail} label="E-mail" placeholder="opcional" inputMode="email" /></div>
                  </div>
                  {!selectedClientId && customerName.trim() && (
                    <button type="button" onClick={() => setSaveCustomer((v) => !v)} className={`mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold ${saveCustomer ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200'}`}>
                      <UserPlus size={15} /> {saveCustomer ? 'Cliente será salvo no cadastro' : 'Salvar este cliente para próximas compras'}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[20px] border border-neutral-200 p-3.5">
                  <SectionTitle icon={<CircleDollarSign size={15} />} title="Pagamento" hint="Defina como e quando este pedido será recebido." />
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                    {(Object.keys(paymentLabels) as PaymentMethod[]).map((item) => (
                      <button type="button" key={item} onClick={() => setPayment(item)} className={`min-h-11 rounded-xl border text-xs font-bold ${payment === item ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200'}`}>{paymentLabels[item]}</button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setPaymentStatus('paid')} className={`min-h-11 rounded-xl border px-2 text-xs font-bold ${paymentStatus === 'paid' ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-neutral-200'}`}>Já recebido</button>
                    <button type="button" onClick={() => setPaymentStatus('pending')} className={`min-h-11 rounded-xl border px-2 text-xs font-bold ${paymentStatus === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-neutral-200'}`}>Ficou pendente</button>
                  </div>
                  {(payment === 'cartao' || payment === 'prazo') && (
                    <div className="mt-3"><Field value={installments} onChange={setInstallments} label="Parcelas" placeholder="1" inputMode="numeric" /></div>
                  )}
                  {paymentStatus === 'pending' && payment !== 'a_combinar' && (
                    <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">Vencimento</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11 w-full rounded-xl bg-neutral-100 px-3 text-sm outline-none" /></label>
                  )}
                </div>

                <div className="rounded-[20px] border border-neutral-200 p-3.5">
                  <SectionTitle icon={<Package size={15} />} title="Entrega" />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(['retirada', 'entrega'] as const).map((item) => (
                      <button type="button" key={item} onClick={() => setFulfillment(item)} className={`min-h-11 rounded-xl border text-xs font-bold capitalize ${fulfillment === item ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200'}`}>{item}</button>
                    ))}
                  </div>
                  {fulfillment === 'entrega' && <div className="mt-3"><Field value={deliveryAddress} onChange={setDeliveryAddress} label="Endereço completo" placeholder="Rua, número, bairro e referência" /></div>}
                </div>

                <div className="rounded-[20px] border border-neutral-200 p-3.5">
                  <SectionTitle icon={<FileText size={15} />} title="Ajustes finais" />
                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                    <button type="button" onClick={() => setDiscountMode((mode) => mode === 'amount' ? 'percent' : 'amount')} className="h-11 rounded-xl border border-neutral-200 px-3 text-xs font-bold">{discountMode === 'amount' ? 'R$' : '%'}</button>
                    <Field value={discount} onChange={setDiscount} label="Desconto" placeholder="0,00" inputMode="decimal" hideLabel />
                  </div>
                  <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">Observações do pedido</span><textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Condição combinada, responsável, referência ou instrução interna" rows={3} className="w-full resize-none rounded-xl bg-neutral-100 px-3 py-2.5 text-sm outline-none" /></label>
                </div>

                <div className="rounded-[20px] bg-neutral-100 p-4">
                  <div className="flex justify-between text-xs text-neutral-600"><span>Subtotal negociado</span><span>{money(subtotal)}</span></div>
                  {discountValue > 0 && <div className="mt-2 flex justify-between text-xs text-emerald-700"><span>Desconto</span><span>- {money(discountValue)}</span></div>}
                  <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-base font-bold"><span>Total do pedido</span><span>{money(total)}</span></div>
                  <p className="mt-2 text-[10px] text-neutral-500">{paymentStatus === 'paid' ? 'Será criado como pago.' : 'Será criado aguardando pagamento.'}</p>
                </div>

                <button type="button" disabled={saving || !cart.length} onClick={finishSale} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-neutral-950 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {saving ? 'Criando pedido…' : `Criar pedido · ${money(total)}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return <div><p className="flex items-center gap-2 text-xs font-bold text-neutral-900">{icon}{title}</p>{hint && <p className="mt-1 text-[10px] text-neutral-500">{hint}</p>}</div>
}

function Field({ value, onChange, label, placeholder, inputMode, hideLabel }: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  hideLabel?: boolean
}) {
  return <label className="block">{!hideLabel && <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>}<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} aria-label={hideLabel ? label : undefined} className="h-11 w-full rounded-xl bg-neutral-100 px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-950/10" /></label>
}
