import { useEffect, useState, useCallback } from 'react'
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, ArrowRight, CreditCard, ImageOff, User, MapPin, CheckCircle2, MessageCircle, QrCode, FileText, Banknote, Truck, Clock, PartyPopper, Ticket, X as XIcon, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog, createOrder, validateCoupon, type Product } from '@/lib/api'
import { useCartStore } from '@/lib/store'
import { getCustomer, setCustomer } from '@/lib/store'
import { money, storeUrl, normalizePhone } from '@/lib/store-context'
import { useToast } from '@/components/Toast'

type Step = 'cart' | 'customer' | 'delivery' | 'payment'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { items, updateQty, removeItem, clear } = useCartStore()
  const [products, setProducts] = useState<Map<string, Product>>(new Map())
  const [paymentMethods, setPaymentMethods] = useState<{ type: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const [step, setStep] = useState<Step>('cart')

  // Customer fields
  const profile = getCustomer()
  const [email, setEmail] = useState(profile.email || '')
  const [responsibleName, setResponsibleName] = useState(profile.responsible_name || profile.name || '')
  const [establishmentName, setEstablishmentName] = useState(profile.establishment_name || profile.establishment || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [address, setAddress] = useState(profile.address || '')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [whatsappNotify, setWhatsappNotify] = useState(true)
  const [storeProfile, setStoreProfile] = useState<any>({})

  /* Fase 13 — coupon state. `applied` lives until the user clears it explicitly
   * or the cart subtotal moves below the min and we re-validate. */
  const [couponInput, setCouponInput] = useState('')
  const [couponApplying, setCouponApplying] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [couponApplied, setCouponApplied] = useState<{
    code: string
    discount_amount: number
    description: string | null
  } | null>(null)

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        const map = new Map<string, Product>()
        ;(data.all_products || []).forEach((p) => map.set(String(p.id), p))
        setProducts(map)
        setStoreProfile((data.store as any).profile || {})
        const brand = data.store.brand
        const theme = data.store.theme
        const primary = brand?.primary_color || theme?.primary_color || '#111827'
        const secondary = brand?.secondary_color || theme?.secondary_color || '#3b82f6'
        document.documentElement.style.setProperty('--brand-primary', primary)
        document.documentElement.style.setProperty('--brand-secondary', secondary)
        setPaymentMethods((data.store as any).payment_methods || [{ type: 'pix', label: 'PIX' }, { type: 'cartao', label: 'Cartão' }])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const cartKeys = Object.keys(items).filter((k) => (items[k]?.quantity || 0) > 0)
  /** Effective unit price: prefer item.unitPrice (set when a variant is selected) over product base price. */
  function priceFor(key: string): number {
    const it = items[key]
    if (!it) return 0
    if (typeof it.unitPrice === 'number' && it.unitPrice > 0) return it.unitPrice
    const p = products.get(it.productId)
    return p ? Number(p.price) : 0
  }
  const total = cartKeys.reduce((sum, key) => {
    const it = items[key]
    return sum + priceFor(key) * (it?.quantity || 0)
  }, 0)
  /* Fase 13 — final figures with coupon */
  const discount = couponApplied ? Math.min(couponApplied.discount_amount, total) : 0
  const finalTotal = Math.max(0, total - discount)

  /* If the cart subtotal drops below what the applied coupon needs, the server
   * will reject the order. Re-validate when total changes to clear stale state. */
  useEffect(() => {
    if (!couponApplied) return
    let cancelled = false
    validateCoupon({ code: couponApplied.code, subtotal: total, productIds: cartKeys.map(k => items[k]?.productId).filter(Boolean) as string[] })
      .then(res => {
        if (cancelled) return
        if (!res.valid) {
          setCouponApplied(null)
          setCouponError(res.reason || 'Cupom não vale mais para esse pedido.')
        } else if (Math.abs(res.discount_amount - couponApplied.discount_amount) > 0.01) {
          setCouponApplied({ ...couponApplied, discount_amount: res.discount_amount })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    setCouponApplying(true); setCouponError('')
    try {
      const res = await validateCoupon({
        code,
        subtotal: total,
        productIds: cartKeys.map(k => items[k]?.productId).filter(Boolean) as string[],
        customerId: phone || undefined,
      })
      if (res.valid && res.coupon) {
        setCouponApplied({
          code: res.coupon.code,
          discount_amount: res.discount_amount,
          description: res.coupon.description,
        })
        setCouponInput('')
        setCouponError('')
        showToast(`Cupom ${res.coupon.code} aplicado · ${money(res.discount_amount)} off`)
      } else {
        setCouponApplied(null)
        setCouponError(res.reason || 'Cupom inválido.')
      }
    } catch (e: any) {
      setCouponError(e.message || 'Erro ao validar cupom')
    } finally {
      setCouponApplying(false)
    }
  }

  function clearCoupon() {
    setCouponApplied(null)
    setCouponInput('')
    setCouponError('')
  }

  async function handleSubmit() {
    if (!email || !responsibleName) { setError('Preencha nome e email'); return }
    setCustomer({ email, responsible_name: responsibleName, establishment_name: establishmentName, phone, name: responsibleName, establishment: establishmentName, address })
    const orderItems = cartKeys
      .map((key) => {
        const it = items[key]
        if (!it || it.quantity <= 0) return null
        return {
          product_id: it.productId,
          quantity: it.quantity,
          variant_id: it.variantId || undefined,
          variant_name: it.variantName || undefined,
          variant_attributes: it.variantAttributes || undefined,
          configurator_selections: Array.isArray(it.configuratorSelections) ? it.configuratorSelections : undefined,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (orderItems.length === 0) { setError('Carrinho vazio'); return }
    setSubmitting(true); setError('')
    try {
      const result = await createOrder({
        items: orderItems,
        customer: { name: responsibleName || establishmentName, phone, email, address: { text: address || undefined, establishment_name: establishmentName || undefined } },
        payment_method: paymentMethod,
        notes: [establishmentName ? `Estabelecimento: ${establishmentName}` : '', whatsappNotify && phone ? `WhatsApp: ${phone}` : '', notes].filter(Boolean).join(' | '),
        /* Fase 13 — forward the validated coupon code; server re-validates */
        cupom_codigo: couponApplied?.code || undefined,
      })
      clear()
      if (result.checkout_url) { window.location.href = result.checkout_url; return }
      navigate(`${storeUrl('pedido')}?order_number=${encodeURIComponent(result.order.order_number || '')}&phone=${encodeURIComponent(normalizePhone(phone))}`)
    } catch (err: any) { setError(err.message || 'Erro ao finalizar') }
    finally { setSubmitting(false) }
  }

  const steps: { key: Step; label: string; icon: any }[] = [
    { key: 'cart', label: 'Carrinho', icon: ShoppingBag },
    { key: 'customer', label: 'Cadastro', icon: User },
    { key: 'delivery', label: 'Entrega', icon: MapPin },
    { key: 'payment', label: 'Pagamento', icon: CreditCard },
  ]
  const stepIdx = steps.findIndex(s => s.key === step)

  function canAdvance(): boolean {
    if (step === 'cart') return cartKeys.length > 0
    if (step === 'customer') return !!email.trim() && !!responsibleName.trim()
    if (step === 'delivery') return true
    return !!paymentMethod
  }

  function nextStep() {
    if (step === 'cart') setStep('customer')
    else if (step === 'customer') setStep('delivery')
    else if (step === 'delivery') setStep('payment')
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="skeleton w-12 h-12 rounded-full" /></div>

  const inputCls = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition"

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1].key) : navigate(storeUrl())}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Checkout</h1>
        </div>
      </header>

      {cartKeys.length === 0 && step === 'cart' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">Seu carrinho esta vazio</p>
          <button onClick={() => navigate(storeUrl())} className="text-sm font-semibold text-[var(--brand-secondary)] hover:underline">Voltar ao catalogo</button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <button onClick={() => i <= stepIdx && setStep(s.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition w-full justify-center ${
                    i === stepIdx ? 'bg-[var(--brand-secondary)] text-white shadow-sm' :
                    i < stepIdx ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                  {i < stepIdx ? <CheckCircle2 size={13} /> : <s.icon size={13} />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < steps.length - 1 && <div className={`w-4 h-0.5 shrink-0 ${i < stepIdx ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>}

          {/* ── Step 1: Cart ── */}
          {step === 'cart' && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900">Confira seus produtos</h2>
              {cartKeys.map((key) => {
                const it = items[key]
                const p = products.get(it.productId)
                if (!p) return null
                const qty = it.quantity
                const unitPrice = priceFor(key)
                const img = p.image || p.images?.[0] || ''
                return (
                  <div key={key} className="flex gap-3 bg-white border border-gray-200 rounded-2xl p-3">
                    {img ? <img src={img} alt={p.name} className="w-16 h-16 rounded-xl object-cover shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><ImageOff className="w-5 h-5 text-gray-300" /></div>}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold truncate">{p.name}</h4>
                      {it.variantName && (
                        <p className="text-[11px] font-medium text-gray-600 mt-0.5">{it.variantName}</p>
                      )}
                      {it.configuratorSummary && (
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{it.configuratorSummary}</p>
                      )}
                      <p className="text-xs text-gray-400">{money(unitPrice)} /{p.unit || 'un'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                        <button onClick={() => updateQty(key, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"><Minus className="w-3 h-3" /></button>
                        <span className="w-7 text-center text-xs font-bold">{qty}</span>
                        <button onClick={() => updateQty(key, 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-sm font-bold">{money(unitPrice * qty)}</span>
                      <button onClick={() => { removeItem(key); showToast('Removido') }} className="text-gray-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-base font-bold text-gray-900 tabular-nums">{money(total)}</span>
              </div>

              {/* ── Cupom (Fase 13) ── */}
              <div className="pt-3 border-t border-gray-100">
                {couponApplied ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Ticket size={16} className="text-emerald-600 shrink-0" strokeWidth={2} />
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-emerald-700 truncate">Cupom {couponApplied.code}</p>
                        <p className="text-[10px] text-emerald-600">−{money(couponApplied.discount_amount)}{couponApplied.description ? ` · ${couponApplied.description}` : ''}</p>
                      </div>
                    </div>
                    <button onClick={clearCoupon} aria-label="Remover cupom"
                      className="p-1 text-emerald-700 hover:text-emerald-900 transition shrink-0">
                      <XIcon size={14} strokeWidth={2.25} />
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Cupom de desconto
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Ticket size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2} />
                        <input
                          type="text"
                          value={couponInput}
                          onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon() } }}
                          placeholder="Insira o código"
                          disabled={couponApplying}
                          className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/30 focus:border-[var(--brand-secondary)] transition disabled:opacity-50"
                        />
                      </div>
                      <button onClick={applyCoupon} disabled={!couponInput.trim() || couponApplying}
                        className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[12px] font-bold hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-900 transition flex items-center gap-1.5">
                        {couponApplying ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[11px] text-red-600 mt-1.5 font-medium">{couponError}</p>
                    )}
                  </>
                )}
              </div>

              {couponApplied && (
                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">Total com desconto</span>
                  <span className="text-xl font-extrabold text-emerald-700 tabular-nums">{money(finalTotal)}</span>
                </div>
              )}

              {/* Shipping info */}
              {(() => {
                const freeAbove = Number(storeProfile.free_shipping_above) || 0
                const deliveryFee = Number(storeProfile.delivery_fee) || 0
                const isFreeShipping = freeAbove > 0 && total >= freeAbove
                const missingForFree = freeAbove > 0 ? freeAbove - total : 0
                return (
                  <div className="space-y-2 pt-2">
                    {isFreeShipping ? (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                        <PartyPopper size={18} className="text-emerald-600 shrink-0" strokeWidth={1.75} />
                        <div>
                          <p className="text-xs font-bold text-emerald-700">Frete gratis!</p>
                          <p className="text-[10px] text-emerald-600">Voce atingiu R$ {freeAbove.toFixed(0)} — entrega sem custo</p>
                        </div>
                      </div>
                    ) : freeAbove > 0 && missingForFree > 0 ? (
                      <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                        <Truck size={18} strokeWidth={1.75} className="text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-700">Falta R$ {missingForFree.toFixed(2)} para frete gratis!</p>
                          <p className="text-[10px] text-amber-600">Pedidos acima de R$ {freeAbove.toFixed(0)} tem entrega gratuita</p>
                          {deliveryFee > 0 && <p className="text-[10px] text-amber-500">Taxa atual: R$ {deliveryFee.toFixed(2)}</p>}
                        </div>
                      </div>
                    ) : deliveryFee > 0 ? (
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                        <span className="text-xs text-gray-500">Taxa de entrega</span>
                        <span className="text-xs font-bold text-gray-700">R$ {deliveryFee.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {storeProfile.delivery_time_text && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-1.5"><Clock size={11} strokeWidth={2} /> {storeProfile.delivery_time_text}</p>
                    )}
                    {storeProfile.frete_texto && (
                      <p className="text-[10px] text-gray-400 leading-relaxed">{storeProfile.frete_texto}</p>
                    )}
                  </div>
                )
              })()}
            </section>
          )}

          {/* ── Step 2: Customer ── */}
          {step === 'customer' && (
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Seus dados</h2>
              <p className="text-xs text-gray-400 -mt-2">Campos com * sao obrigatorios</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Nome completo *</label>
                  <input type="text" value={responsibleName} onChange={e => setResponsibleName(e.target.value)} required placeholder="Seu nome" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">E-mail *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="seu@email.com" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Telefone / WhatsApp</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Estabelecimento (se aplicavel)</label>
                  <input type="text" value={establishmentName} onChange={e => setEstablishmentName(e.target.value)} placeholder="Nome do seu negocio" className={inputCls} />
                </div>
              </div>
            </section>
          )}

          {/* ── Step 3: Delivery ── */}
          {step === 'delivery' && (
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Entrega</h2>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Endereco de entrega</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3}
                  placeholder="Rua, numero, bairro, cidade..." className={inputCls + ' resize-none'} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Observacoes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Complemento, referencia, horario preferido..." className={inputCls + ' resize-none'} />
              </div>
              {/* WhatsApp notifications toggle */}
              {phone && (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-white grid place-items-center text-emerald-600 shrink-0">
                      <MessageCircle size={18} strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Notificacoes por WhatsApp</p>
                      <p className="text-[10px] text-gray-500">Receba atualizacoes do pedido em {phone}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setWhatsappNotify(!whatsappNotify)}
                    className={`relative w-11 h-6 rounded-full transition shrink-0 ${whatsappNotify ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${whatsappNotify ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              )}
              {/* Summary mini */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Resumo</p>
                <p className="text-xs text-gray-600">{responsibleName} {establishmentName ? `· ${establishmentName}` : ''}</p>
                <p className="text-xs text-gray-600">{email} {phone ? `· ${phone}` : ''}</p>
                <p className="text-sm font-bold text-gray-900">{cartKeys.length} item(ns) · {money(finalTotal)}</p>
              </div>
            </section>
          )}

          {/* ── Step 4: Payment ── */}
          {step === 'payment' && (
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Forma de Pagamento</h2>
              <div className="space-y-2">
                {[
                  ...paymentMethods.map(m => ({
                    value: m.type,
                    label: m.label,
                    Icon: m.type === 'pix' ? QrCode : m.type === 'card' ? CreditCard : m.type === 'boleto' ? FileText : Banknote,
                  })),
                  { value: 'dinheiro', label: 'Dinheiro', Icon: Banknote },
                ].filter((m, i, arr) => arr.findIndex(x => x.value === m.value) === i).map(m => {
                  const selected = paymentMethod === m.value
                  const Icon = m.Icon
                  return (
                    <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border transition text-left ${
                        selected ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary-light)] ring-2 ring-[var(--brand-secondary)]/20' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${selected ? 'bg-white text-[var(--brand-secondary)]' : 'bg-gray-50 text-gray-500'}`}>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className={`text-sm font-semibold ${selected ? 'text-[var(--brand-secondary)]' : 'text-gray-700'}`}>{m.label}</span>
                      {selected && <CheckCircle2 size={16} className="ml-auto text-[var(--brand-secondary)]" />}
                    </button>
                  )
                })}
              </div>

              {/* Order summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Resumo do pedido</p>
                {cartKeys.map(key => {
                  const it = items[key]
                  const p = products.get(it.productId)
                  if (!p) return null
                  const label = it.variantName ? `${p.name} (${it.variantName})` : p.name
                  return (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-600">{it.quantity}x {label}</span>
                      <span className="font-semibold">{money(priceFor(key) * it.quantity)}</span>
                    </div>
                  )
                })}
                {couponApplied && (
                  <div className="flex justify-between text-xs pt-2 border-t border-gray-200">
                    <span className="text-emerald-700 font-semibold">Cupom {couponApplied.code}</span>
                    <span className="text-emerald-700 font-semibold tabular-nums">−{money(discount)}</span>
                  </div>
                )}
                <div className={`flex justify-between ${couponApplied ? 'pt-1' : 'pt-2 border-t border-gray-200'}`}>
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-lg font-extrabold text-gray-900 tabular-nums">{money(finalTotal)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 pt-2">
            {stepIdx > 0 && (
              <button onClick={() => setStep(steps[stepIdx - 1].key)}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition">
                <ArrowLeft size={16} /> Voltar
              </button>
            )}
            {step !== 'payment' ? (
              <button onClick={nextStep} disabled={!canAdvance()}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--brand-secondary)] text-white font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm">
                Continuar <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting || !paymentMethod}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--brand-secondary)] text-white font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm">
                <CreditCard size={18} />
                {submitting ? 'Processando...' : `Finalizar • ${money(finalTotal)}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
