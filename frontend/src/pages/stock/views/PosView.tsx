import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Minus, Package, Plus, Search, ShoppingCart, Trash2, UserRound, X } from 'lucide-react'
import { stockApi } from '@/lib/api-admin'
import type { InventoryProduct, ShowToast } from '@/pages/stock/types'
import { resolveProductVolumePrice } from '@/lib/product-volume-pricing'

type CartLine = { id: string; name: string; price: number; basePrice: number; quantity: number; stock: number; image?: string; unit?: string; metadata?: Record<string, any> }
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const idOf = (p: InventoryProduct) => String(p.product_id || p.id || '')
const nameOf = (p: InventoryProduct) => String(p.product_name || p.name || 'Produto')
const priceOf = (p: InventoryProduct) => Number(p.promo_price || p.promoPrice || p.product_price || p.price || 0)
const stockOf = (p: InventoryProduct) => Number(p.stock_available ?? p.stock_current ?? 0)

export function PosView({ showToast, onFinished }: { showToast: ShowToast; onFinished: () => void }) {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [payment, setPayment] = useState<'pix' | 'cartao' | 'dinheiro'>('pix')
  const [fulfillment, setFulfillment] = useState<'retirada' | 'entrega'>('retirada')
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<{ number: string; total: number } | null>(null)

  useEffect(() => {
    stockApi.products(300)
      .then((data) => setProducts(data.products || data.items || []))
      .catch(() => showToast('Não foi possível carregar os produtos', 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((product) => {
      if (stockOf(product) <= 0 || product.active === false || product.is_active === false) return false
      return !q || nameOf(product).toLowerCase().includes(q) || String(product.sku || product.product_sku || '').toLowerCase().includes(q)
    }).slice(0, 40)
  }, [products, search])

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount.replace(',', '.')) || 0))
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
        const price = resolveProductVolumePrice(line, quantity)?.itemUnitPrice ?? line.basePrice
        return { ...line, quantity, price }
      })
      const basePrice = priceOf(product)
      const line = { id, name: nameOf(product), price: basePrice, basePrice, quantity: 1, stock, image: product.product_image || product.image_url || product.imageUrl || product.image, unit: product.product_unit || product.unit, metadata: product.metadata }
      return [...current, { ...line, price: resolveProductVolumePrice(line, 1)?.itemUnitPrice ?? basePrice }]
    })
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => current
      .map((line) => { if (line.id !== id) return line; const quantity = Math.min(line.stock, Math.max(0, line.quantity + delta)); return { ...line, quantity, price: resolveProductVolumePrice(line, quantity)?.itemUnitPrice ?? line.basePrice } })
      .filter((line) => line.quantity > 0))
  }

  async function finishSale() {
    if (!cart.length || saving) return
    setSaving(true)
    try {
      const result = await stockApi.createPosOrder({
        items: cart.map((line) => ({ product_id: line.id, product_name: line.name, quantity: line.quantity, unit_price: line.price })),
        customer_name: customerName.trim() || 'Consumidor final',
        customer_phone: customerPhone.trim(),
        payment_method: payment,
        discount: discountValue,
        fulfillment,
      })
      setReceipt({ number: String(result.receipt_number || result.order?.id || '').slice(0, 8).toUpperCase(), total })
      setCheckoutOpen(false); setCart([]); setCustomerName(''); setCustomerPhone(''); setDiscount(''); onFinished()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível concluir a venda', 'error')
    } finally { setSaving(false) }
  }

  if (receipt) return (
    <section className="mx-auto max-w-md py-8 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={30} /></span>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Venda concluída</p>
      <h2 className="mt-1 text-2xl font-bold text-neutral-950">{money(receipt.total)}</h2>
      <p className="mt-2 text-sm text-neutral-500">Comprovante #{receipt.number}</p>
      <button type="button" onClick={() => setReceipt(null)} className="mt-6 min-h-12 w-full rounded-[18px] bg-neutral-950 text-sm font-bold text-white">Nova venda</button>
    </section>
  )

  return (
    <div className="space-y-4">
      <header><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Ponto de venda</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Nova venda</h2><p className="mt-1 text-xs text-neutral-500">Escolha os produtos e finalize no caixa.</p></header>
      <label className="flex min-h-12 items-center gap-2 rounded-[18px] border border-neutral-200 bg-white px-4"><Search size={17} className="text-neutral-400"/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar produto ou código" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
      {loading ? <p className="py-8 text-center text-sm text-neutral-500">Carregando produtos…</p> : (
        <section className="grid grid-cols-2 gap-2.5">
          {filtered.map((product) => <button key={idOf(product)} type="button" onClick={()=>add(product)} className="min-h-[142px] rounded-[20px] border border-neutral-200 bg-white p-3 text-left active:scale-[0.98]"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-neutral-100">{product.product_image || product.image_url ? <img src={product.product_image || product.image_url} alt="" className="h-full w-full object-cover"/>:<Package size={18} className="text-neutral-500"/>}</span><strong className="mt-3 line-clamp-2 block text-[12px] leading-snug text-neutral-900">{nameOf(product)}</strong><span className="mt-1 flex items-center justify-between gap-1"><b className="text-[12px] text-neutral-950">{money(priceOf(product))}</b><small className="text-[9px] text-neutral-500">{stockOf(product)} disp.</small></span></button>)}
        </section>
      )}
      <button type="button" disabled={!cart.length} onClick={()=>setCheckoutOpen(true)} className="sticky bottom-[72px] flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-neutral-950 px-4 text-white shadow-lg disabled:hidden"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><ShoppingCart size={17}/></span><span className="flex-1 text-left"><strong className="block text-sm">Revisar venda</strong><small className="text-white/60">{itemCount} item(ns)</small></span><b>{money(subtotal)}</b><ChevronRight size={16}/></button>

      {checkoutOpen && <div className="fixed inset-0 z-[200] flex items-end bg-black/45"><section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] bg-white pb-[max(16px,env(safe-area-inset-bottom))]"><header className="sticky top-0 flex items-center justify-between border-b border-neutral-100 bg-white px-4 py-3"><div><h3 className="text-base font-bold">Finalizar venda</h3><p className="text-[10px] text-neutral-500">Revise antes de confirmar</p></div><button type="button" aria-label="Fechar revisão" onClick={()=>setCheckoutOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-neutral-100"><X size={17}/></button></header><div className="space-y-4 p-4">
        <div className="space-y-2">{cart.map((line)=><div key={line.id} className="rounded-2xl border border-neutral-200 p-3"><div className="flex gap-3"><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{line.name}</strong><span className="text-[11px] text-neutral-500">{money(line.price)} cada</span></div><button type="button" aria-label={`Remover ${line.name}`} onClick={()=>setCart((c)=>c.filter((x)=>x.id!==line.id))} className="grid h-9 w-9 place-items-center text-neutral-400"><Trash2 size={15}/></button></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-xl bg-neutral-100"><button type="button" aria-label={`Diminuir ${line.name}`} onClick={()=>changeQuantity(line.id,-1)} className="grid h-10 w-10 place-items-center"><Minus size={14}/></button><b className="min-w-8 text-center text-xs">{line.quantity}</b><button type="button" aria-label={`Aumentar ${line.name}`} onClick={()=>changeQuantity(line.id,1)} className="grid h-10 w-10 place-items-center"><Plus size={14}/></button></div><b className="text-sm">{money(line.price*line.quantity)}</b></div></div>)}</div>
        <div className="rounded-[20px] border border-neutral-200 p-3.5"><p className="mb-3 flex items-center gap-2 text-xs font-bold"><UserRound size={15}/> Cliente</p><div className="space-y-2"><input value={customerName} onChange={(e)=>setCustomerName(e.target.value)} placeholder="Consumidor final" className="h-11 w-full rounded-xl bg-neutral-100 px-3 text-sm outline-none"/><input value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} placeholder="Telefone (opcional)" inputMode="tel" className="h-11 w-full rounded-xl bg-neutral-100 px-3 text-sm outline-none"/></div></div>
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Pagamento</p><div className="grid grid-cols-3 gap-2">{(['pix','cartao','dinheiro'] as const).map((item)=><button type="button" key={item} onClick={()=>setPayment(item)} className={`min-h-11 rounded-xl border text-xs font-bold capitalize ${payment===item?'border-neutral-950 bg-neutral-950 text-white':'border-neutral-200'}`}>{item==='cartao'?'Cartão':item}</button>)}</div></div>
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Entrega</p><div className="grid grid-cols-2 gap-2">{(['retirada','entrega'] as const).map((item)=><button type="button" key={item} onClick={()=>setFulfillment(item)} className={`min-h-11 rounded-xl border text-xs font-bold capitalize ${fulfillment===item?'border-neutral-950 bg-neutral-950 text-white':'border-neutral-200'}`}>{item}</button>)}</div></div>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">Desconto em reais</span><input value={discount} onChange={(e)=>setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-11 w-full rounded-xl bg-neutral-100 px-3 text-sm outline-none"/></label>
        <div className="rounded-[20px] bg-neutral-100 p-4"><div className="flex justify-between text-xs text-neutral-600"><span>Subtotal</span><span>{money(subtotal)}</span></div>{discountValue>0&&<div className="mt-2 flex justify-between text-xs text-emerald-700"><span>Desconto</span><span>- {money(discountValue)}</span></div>}<div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-base font-bold"><span>Total</span><span>{money(total)}</span></div></div>
        <button type="button" disabled={saving||!cart.length} onClick={finishSale} className="min-h-14 w-full rounded-[18px] bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">{saving?'Concluindo…':`Confirmar venda · ${money(total)}`}</button>
      </div></section></div>}
    </div>
  )
}
