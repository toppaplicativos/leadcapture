import { useEffect, useState, useCallback } from 'react'
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, ArrowRight, CreditCard, ImageOff, User, MapPin, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog, createOrder, type Product } from '@/lib/api'
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

  const cartIds = Object.keys(items).filter((k) => items[k] > 0)
  const total = cartIds.reduce((sum, id) => {
    const p = products.get(id)
    return sum + (p ? Number(p.price) * items[id] : 0)
  }, 0)

  async function handleSubmit() {
    if (!email || !responsibleName) { setError('Preencha nome e email'); return }
    setCustomer({ email, responsible_name: responsibleName, establishment_name: establishmentName, phone, name: responsibleName, establishment: establishmentName, address })
    const orderItems = cartIds.filter(id => items[id] > 0).map(id => ({ product_id: id, quantity: items[id] }))
    if (orderItems.length === 0) { setError('Carrinho vazio'); return }
    setSubmitting(true); setError('')
    try {
      const result = await createOrder({
        items: orderItems,
        customer: { name: responsibleName || establishmentName, phone, email, address: { text: address || undefined, establishment_name: establishmentName || undefined } },
        payment_method: paymentMethod,
        notes: [establishmentName ? `Estabelecimento: ${establishmentName}` : '', whatsappNotify && phone ? `WhatsApp: ${phone}` : '', notes].filter(Boolean).join(' | '),
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
    if (step === 'cart') return cartIds.length > 0
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

      {cartIds.length === 0 && step === 'cart' ? (
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
              {cartIds.map((id) => {
                const p = products.get(id)
                if (!p) return null
                const qty = items[id]
                const img = p.image || p.images?.[0] || ''
                return (
                  <div key={id} className="flex gap-3 bg-white border border-gray-200 rounded-2xl p-3">
                    {img ? <img src={img} alt={p.name} className="w-16 h-16 rounded-xl object-cover shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><ImageOff className="w-5 h-5 text-gray-300" /></div>}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold truncate">{p.name}</h4>
                      <p className="text-xs text-gray-400">{money(p.price)} /{p.unit || 'un'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                        <button onClick={() => updateQty(id, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"><Minus className="w-3 h-3" /></button>
                        <span className="w-7 text-center text-xs font-bold">{qty}</span>
                        <button onClick={() => updateQty(id, 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-200 transition"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-sm font-bold">{money(Number(p.price) * qty)}</span>
                      <button onClick={() => { removeItem(id); showToast('Removido') }} className="text-gray-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-xl font-extrabold text-gray-900">{money(total)}</span>
              </div>

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
                        <span className="text-lg">🎉</span>
                        <div>
                          <p className="text-xs font-bold text-emerald-700">Frete gratis!</p>
                          <p className="text-[10px] text-emerald-600">Voce atingiu R$ {freeAbove.toFixed(0)} — entrega sem custo</p>
                        </div>
                      </div>
                    ) : freeAbove > 0 && missingForFree > 0 ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                        <span className="text-lg">🚚</span>
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
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">⏱ {storeProfile.delivery_time_text}</p>
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
                    <span className="text-lg">💬</span>
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
                <p className="text-sm font-bold text-gray-900">{cartIds.length} item(ns) · {money(total)}</p>
              </div>
            </section>
          )}

          {/* ── Step 4: Payment ── */}
          {step === 'payment' && (
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Forma de Pagamento</h2>
              <div className="space-y-2">
                {[
                  ...paymentMethods.map(m => ({ value: m.type, label: m.label, icon: m.type === 'pix' ? '💎' : m.type === 'card' ? '💳' : m.type === 'boleto' ? '📄' : '💵' })),
                  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
                ].filter((m, i, arr) => arr.findIndex(x => x.value === m.value) === i).map(m => (
                  <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition text-left ${
                      paymentMethod === m.value ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary-light)] ring-2 ring-[var(--brand-secondary)]/20' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <span className="text-xl">{m.icon}</span>
                    <span className={`text-sm font-semibold ${paymentMethod === m.value ? 'text-[var(--brand-secondary)]' : 'text-gray-700'}`}>{m.label}</span>
                    {paymentMethod === m.value && <CheckCircle2 size={16} className="ml-auto text-[var(--brand-secondary)]" />}
                  </button>
                ))}
              </div>

              {/* Order summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Resumo do pedido</p>
                {cartIds.map(id => {
                  const p = products.get(id)
                  if (!p) return null
                  return (
                    <div key={id} className="flex justify-between text-xs">
                      <span className="text-gray-600">{items[id]}x {p.name}</span>
                      <span className="font-semibold">{money(Number(p.price) * items[id])}</span>
                    </div>
                  )
                })}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-lg font-extrabold text-gray-900">{money(total)}</span>
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
                {submitting ? 'Processando...' : `Finalizar • ${money(total)}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
