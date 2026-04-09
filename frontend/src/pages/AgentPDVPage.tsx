import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, Minus, ShoppingCart, User, Phone, X, CheckCircle2,
  Loader2, MessageCircle, ChevronDown, Copy, Check, Package,
  Zap, CreditCard, Banknote, QrCode, Smartphone, Tag, Clock,
  ArrowRight, Star, AlertCircle, Receipt, Send, Hash,
  UserCheck, Trash2, Edit3, ChevronUp, Sparkles,
} from 'lucide-react'

/* ═══════════════════════════════════════════
   TYPES
═══════════════════════════════════════════ */
interface Product {
  id: string; name: string; price: number; promoPrice?: number
  imageUrl?: string; image?: string; unit?: string
  stock_available?: number; category?: string; sku?: string
}
interface CartItem {
  product_id: string; name: string; price: number; qty: number
  unit: string; image?: string
}
interface Customer {
  id?: string; name: string; phone: string; email?: string
  total_orders?: number; total_spent?: number; client_type?: string
}
interface WaInstance {
  id: string; name: string; status: string; phone?: string
}

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: MessageCircle },
  { value: 'telefone', label: 'Telefone', color: '#6366f1', icon: Phone },
  { value: 'balcao',   label: 'Balcão',   color: '#f59e0b', icon: Smartphone },
  { value: 'instagram', label: 'Instagram', color: '#e1306c', icon: Star },
  { value: 'outros',   label: 'Outros',    color: '#6b7280', icon: Zap },
]

const PAYMENTS = [
  { value: 'pix', label: 'PIX', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'cartao_credito', label: 'Crédito', icon: CreditCard },
  { value: 'cartao_debito', label: 'Débito', icon: CreditCard },
  { value: 'boleto', label: 'Boleto', icon: Receipt },
]

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const money = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const tok = localStorage.getItem('lead-system-token')
  if (tok) h['Authorization'] = `Bearer ${tok}`
  const bid = localStorage.getItem('lead-system:active-brand-id')
  if (bid) h['x-brand-id'] = bid
  return h
}

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function buildWhatsAppMsg(
  orderId: string,
  custName: string,
  items: CartItem[],
  total: number,
  payment: string,
  agent: string,
  channel: string,
): string {
  const payLabel = PAYMENTS.find(p => p.value === payment)?.label || payment
  const chLabel  = CHANNELS.find(c => c.value === channel)?.label  || channel
  const lines = [
    `✅ *Pedido Confirmado!*`,
    ``,
    `📋 *Pedido #${String(orderId).slice(-6).toUpperCase()}*`,
    `👤 ${custName}`,
    ``,
    `*Itens:*`,
    ...items.map(i => `• ${i.qty}x ${i.name} — ${money(i.price * i.qty)}`),
    ``,
    `💰 *Total: ${money(total)}*`,
    `💳 Pagamento: ${payLabel}`,
    ``,
    `📱 Canal: ${chLabel}`,
    `🧑‍💼 Atendente: ${agent}`,
    ``,
    `Obrigado pela preferência! 🙏`,
  ]
  return lines.join('\n')
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let _timer: ReturnType<typeof setTimeout>
function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const show = useCallback((text: string, ok = true) => {
    clearTimeout(_timer)
    setMsg({ text, ok })
    _timer = setTimeout(() => setMsg(null), 3200)
  }, [])
  return { msg, show }
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
export function AgentPDVPage() {
  /* ── State ── */
  const [instances, setInstances]       = useState<WaInstance[]>([])
  const [instance, setInstance]         = useState<WaInstance | null>(null)
  const [showInstPicker, setShowInstPicker] = useState(false)

  const [channel, setChannel]           = useState('whatsapp')
  const [products, setProducts]         = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])

  const [phone, setPhone]               = useState('')
  const [customer, setCustomer]         = useState<Customer | null>(null)
  const [custResults, setCustResults]   = useState<Customer[]>([])
  const [custLoading, setCustLoading]   = useState(false)
  const [custNotFound, setCustNotFound] = useState(false)
  const [newName, setNewName]           = useState('')

  const [cart, setCart]                 = useState<CartItem[]>([])
  const [payment, setPayment]           = useState('pix')
  const [discount, setDiscount]         = useState('')
  const [notes, setNotes]               = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [orderDone, setOrderDone]       = useState<any>(null)
  const [confirmMsg, setConfirmMsg]     = useState('')
  const [copied, setCopied]             = useState(false)
  const [showCart, setShowCart]         = useState(false)

  const searchTimer  = useRef<ReturnType<typeof setTimeout>>(undefined)
  const custTimer    = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchRef    = useRef<HTMLInputElement>(null)
  const { msg: toast, show: showToast } = useToast()

  /* ── Bootstrap ── */
  useEffect(() => {
    // Load WhatsApp instances
    fetch('/api/instances', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const list: WaInstance[] = (d.instances || d || [])
        setInstances(list)
        const connected = list.find(i => i.status === 'connected' || i.status === 'open')
        if (connected) setInstance(connected)
        else if (list[0]) setInstance(list[0])
      })
      .catch(() => {})

    // Pre-load products for instant search
    fetch('/api/products?limit=500', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setProducts(d.products || []))
      .catch(() => {})
  }, [])

  /* ── Product search ── */
  function onProductSearch(q: string) {
    setProductSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(() => {
      const lower = q.toLowerCase()
      setSearchResults(
        products
          .filter(p => p.name.toLowerCase().includes(lower) ||
                       (p.sku || '').toLowerCase().includes(lower) ||
                       (p.category || '').toLowerCase().includes(lower))
          .slice(0, 10)
      )
    }, 80)
  }

  /* ── Customer lookup ── */
  function onPhoneChange(v: string) {
    const fmt = fmtPhone(v)
    setPhone(fmt)
    setCustomer(null)
    setCustNotFound(false)
    setNewName('')
    setCustResults([])
    clearTimeout(custTimer.current)
    const digits = fmt.replace(/\D/g, '')
    if (digits.length < 8) return
    custTimer.current = setTimeout(async () => {
      setCustLoading(true)
      try {
        const r = await fetch(`/api/clients?search=${encodeURIComponent(digits)}&limit=5`, { headers: getHeaders() })
        const d = await r.json()
        const res: Customer[] = d.clients || []
        setCustResults(res)
        if (res.length === 1) { setCustomer(res[0]); setCustResults([]) }
        else if (res.length === 0) setCustNotFound(true)
      } catch {}
      finally { setCustLoading(false) }
    }, 350)
  }

  /* ── Cart ── */
  function addToCart(p: Product) {
    const price = (p.promoPrice && p.promoPrice > 0 && p.promoPrice < p.price)
      ? p.promoPrice : p.price
    setCart(prev => {
      const ex = prev.find(c => c.product_id === p.id)
      if (ex) return prev.map(c => c.product_id === p.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, {
        product_id: p.id, name: p.name, price, qty: 1,
        unit: p.unit || 'un', image: p.imageUrl || p.image || '',
      }]
    })
    setProductSearch('')
    setSearchResults([])
    showToast(`${p.name} adicionado`)
    searchRef.current?.focus()
  }

  function updateQty(pid: string, delta: number) {
    setCart(prev =>
      prev.map(c => c.product_id === pid ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
          .filter(c => c.qty > 0)
    )
  }
  function setQtyDirect(pid: string, v: string) {
    const n = parseFloat(v.replace(',', '.'))
    if (!v || isNaN(n) || n <= 0) { setCart(prev => prev.filter(c => c.product_id !== pid)); return }
    setCart(prev => prev.map(c => c.product_id === pid ? { ...c, qty: n } : c))
  }
  function removeItem(pid: string) {
    setCart(prev => prev.filter(c => c.product_id !== pid))
  }

  const subtotal      = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountValue = parseFloat(discount.replace(',', '.')) || 0
  const total         = Math.max(0, subtotal - discountValue)
  const custName      = customer?.name || newName.trim()

  /* ── Submit order ── */
  async function submitOrder() {
    if (cart.length === 0) { showToast('Carrinho vazio', false); return }
    if (!custName) { showToast('Informe o cliente', false); return }
    setSubmitting(true)
    try {
      const agentName = instance?.name || 'Agente'
      const agentId   = instance?.id   || ''

      const payload = {
        itens: cart.map(c => ({
          product_id: c.product_id,
          product_name: c.name,
          quantity: c.qty,
          unit_price: c.price,
        })),
        customer_name:  custName,
        customer_phone: customer?.phone || phone,
        customer_email: customer?.email || '',
        forma_pagamento: payment,
        payment_method:  payment,
        desconto: discountValue,
        valor_total: total,
        origem: 'pdv_agente',
        origin: 'pdv_agente',
        source: channel,
        // Attribution
        seller_name:     agentName,
        agent_name:      agentName,
        agent_instance_id: agentId,
        attributed_channel: channel,
        attributed_to:   agentName,
        created_by:      agentName,
        notes: notes || `Pedido via ${CHANNELS.find(c => c.value === channel)?.label} — Atendente: ${agentName}`,
      }

      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar pedido')

      const orderId = d.order?.id || d.orderId || d.id || '?'
      const msg = buildWhatsAppMsg(orderId, custName, cart, total, payment, agentName, channel)
      setConfirmMsg(msg)
      setOrderDone({ orderId, custName, total, agent: agentName, channel })

      // Reset cart and customer
      setCart([])
      setCustomer(null)
      setPhone('')
      setNewName('')
      setNotes('')
      setDiscount('')
    } catch (e: any) {
      showToast(e.message || 'Erro ao registrar pedido', false)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyMsg() {
    try {
      await navigator.clipboard.writeText(confirmMsg)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copie a mensagem:', confirmMsg)
    }
  }

  /* ── Render: Order Success ── */
  if (orderDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Success card */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-4">
            <div className="bg-emerald-500 px-6 py-8 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full grid place-items-center mx-auto mb-3">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-xl font-extrabold">Pedido Registrado!</h2>
              <p className="text-white/70 text-sm mt-1">#{String(orderDone.orderId).slice(-6).toUpperCase()}</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-emerald-50 rounded-2xl p-3">
                  <p className="text-lg font-extrabold text-emerald-700">{money(orderDone.total)}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Total</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-sm font-bold text-gray-700 truncate">{orderDone.custName}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Cliente</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3">
                  <p className="text-sm font-bold text-gray-700 truncate">{orderDone.agent}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Atendente</p>
                </div>
              </div>

              {/* WhatsApp message */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mensagem para WhatsApp</p>
                  <button onClick={copyMsg}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {copied ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar</>}
                  </button>
                </div>
                <div className="bg-[#e9fde0] rounded-2xl p-4 border border-[#b7e89c] font-mono text-xs text-gray-700 whitespace-pre-line max-h-48 overflow-y-auto leading-relaxed">
                  {confirmMsg}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => setOrderDone(null)}
              className="flex-1 py-3.5 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition shadow-sm">
              Novo Pedido
            </button>
            <button onClick={() => window.location.href = '/pedidos'}
              className="flex-1 py-3.5 rounded-2xl text-white font-bold text-sm hover:opacity-90 transition shadow-md flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--brand-secondary)' }}>
              <Receipt size={16} /> Ver Pedidos
            </button>
          </div>
        </div>
      </div>
    )
  }

  const channelCfg = CHANNELS.find(c => c.value === channel) || CHANNELS[0]

  /* ── Render: Main ── */
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Title + channel */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
              style={{ backgroundColor: channelCfg.color + '20' }}>
              <channelCfg.icon size={18} style={{ color: channelCfg.color }} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-gray-900 leading-tight">Tirar Pedido</h1>
              <p className="text-[11px] text-gray-400">Atendimento via {channelCfg.label}</p>
            </div>
          </div>

          {/* Channel selector */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 hidden sm:flex">
            {CHANNELS.map(ch => (
              <button key={ch.value} onClick={() => setChannel(ch.value)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${
                  channel === ch.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}>
                <ch.icon size={11} style={channel === ch.value ? { color: ch.color } : undefined} />
                {ch.label}
              </button>
            ))}
          </div>

          {/* Agent / WhatsApp instance picker */}
          <div className="relative">
            <button onClick={() => setShowInstPicker(!showInstPicker)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition text-sm">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                instance?.status === 'connected' || instance?.status === 'open'
                  ? 'bg-emerald-400' : 'bg-gray-300'
              }`} />
              <span className="font-semibold text-gray-700 max-w-[100px] truncate text-xs">
                {instance?.name || 'Selecionar agente'}
              </span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            {showInstPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInstPicker(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-3 pt-3 pb-1">
                    Instância / Atendente
                  </p>
                  {instances.length === 0 ? (
                    <p className="text-xs text-gray-400 px-3 py-3">Nenhuma instância</p>
                  ) : instances.map(inst => (
                    <button key={inst.id} onClick={() => { setInstance(inst); setShowInstPicker(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition ${
                        instance?.id === inst.id ? 'bg-emerald-50' : ''
                      }`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        inst.status === 'connected' || inst.status === 'open' ? 'bg-emerald-400' : 'bg-gray-200'
                      }`} />
                      <div className="text-left min-w-0">
                        <p className={`font-semibold truncate ${instance?.id === inst.id ? 'text-emerald-700' : 'text-gray-800'}`}>
                          {inst.name}
                        </p>
                        {inst.phone && <p className="text-[10px] text-gray-400">{inst.phone}</p>}
                      </div>
                      {instance?.id === inst.id && <Check size={14} className="text-emerald-500 ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Mobile cart badge */}
          <button onClick={() => setShowCart(!showCart)}
            className="relative sm:hidden p-2 rounded-xl bg-gray-100"
            style={cart.length > 0 ? { backgroundColor: 'var(--brand-secondary)' } : undefined}>
            <ShoppingCart size={18} className={cart.length > 0 ? 'text-white' : 'text-gray-600'} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-extrabold rounded-full grid place-items-center">
                {cart.reduce((s, c) => s + c.qty, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Mobile channel selector */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar sm:hidden">
          {CHANNELS.map(ch => (
            <button key={ch.value} onClick={() => setChannel(ch.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
                channel === ch.value ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'
              }`}
              style={channel === ch.value ? { backgroundColor: ch.color } : undefined}>
              <ch.icon size={11} />{ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-4 py-5 lg:grid lg:grid-cols-[1fr_380px] lg:gap-5 lg:items-start">

        {/* ════════════════════════════
            LEFT COLUMN — Customer + Products
        ════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Customer section ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Cliente</span>
                {customer && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <UserCheck size={12} /> Identificado
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4">
              {/* Phone input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => onPhoneChange(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/20 focus:border-[var(--brand-secondary)] transition"
                  />
                </div>
                {customer && (
                  <button onClick={() => { setCustomer(null); setPhone(''); setCustNotFound(false) }}
                    className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition">
                    <X size={14} className="text-gray-500" />
                  </button>
                )}
              </div>

              {/* Loading */}
              {custLoading && (
                <div className="flex items-center gap-2 mt-3 text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Buscando cliente...</span>
                </div>
              )}

              {/* Multiple results */}
              {custResults.length > 1 && (
                <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                  {custResults.map((c, i) => (
                    <button key={i} onClick={() => { setCustomer(c); setCustResults([]) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition text-left">
                      <div className="w-8 h-8 rounded-full bg-gray-100 grid place-items-center shrink-0">
                        <span className="text-xs font-bold text-gray-500">{(c.name || '?')[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.phone}</p>
                      </div>
                      {c.total_orders ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                          {c.total_orders} pedido(s)
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              {/* Customer found */}
              {customer && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-200 grid place-items-center shrink-0 font-bold text-emerald-700 text-lg">
                    {(customer.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900">{customer.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{customer.phone}</p>
                    {customer.email && <p className="text-xs text-gray-400">{customer.email}</p>}
                    {(customer.total_orders || customer.total_spent) ? (
                      <div className="flex gap-3 mt-2">
                        {customer.total_orders ? (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            {customer.total_orders} pedido(s)
                          </span>
                        ) : null}
                        {customer.total_spent ? (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            {money(customer.total_spent)} total
                          </span>
                        ) : null}
                        {customer.client_type ? (
                          <span className="text-[10px] bg-white text-gray-600 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                            {customer.client_type}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Not found — create inline */}
              {custNotFound && !customer && (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={13} className="text-amber-600" />
                    <span className="text-xs font-bold text-amber-700">Cliente não encontrado — preencha o nome:</span>
                  </div>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Nome completo do cliente"
                    autoFocus
                    className="w-full px-3 py-2.5 border border-amber-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
                  />
                  <p className="text-[10px] text-amber-600 mt-1.5">O cliente será cadastrado automaticamente ao confirmar o pedido.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Product search ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Adicionar Produtos</span>
                <span className="ml-auto text-[11px] text-gray-400">{products.length} disponíveis</span>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={productSearch}
                  onChange={e => onProductSearch(e.target.value)}
                  placeholder="Digite o nome, SKU ou categoria..."
                  className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]/20 focus:border-[var(--brand-secondary)] transition"
                />
                {productSearch && (
                  <button onClick={() => { setProductSearch(''); setSearchResults([]) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="mt-3 border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 shadow-sm">
                  {searchResults.map(p => {
                    const price = (p.promoPrice && p.promoPrice > 0 && p.promoPrice < p.price)
                      ? p.promoPrice : p.price
                    const inCart = cart.find(c => c.product_id === p.id)
                    return (
                      <button key={p.id} onClick={() => addToCart(p)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition text-left group">
                        {p.imageUrl || p.image
                          ? <img src={p.imageUrl || p.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                          : <div className="w-10 h-10 rounded-lg bg-gray-100 grid place-items-center shrink-0"><Package size={16} className="text-gray-300" /></div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-400">{p.unit || 'un'}</span>
                            {p.category && <span className="text-[11px] text-gray-400">· {p.category}</span>}
                            {p.stock_available !== undefined && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                p.stock_available > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                              }`}>
                                {p.stock_available > 0 ? `${p.stock_available} em estoque` : 'Sem estoque'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-sm text-gray-900">{money(price)}</p>
                          {p.promoPrice && p.promoPrice < p.price && (
                            <p className="text-[10px] text-gray-400 line-through">{money(p.price)}</p>
                          )}
                        </div>
                        <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 transition ${
                          inCart ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500 group-hover:bg-[var(--brand-secondary)] group-hover:text-white'
                        }`}>
                          {inCart ? <Check size={14} /> : <Plus size={14} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {productSearch && searchResults.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">
                  Nenhum produto encontrado para "{productSearch}"
                </p>
              )}

              {!productSearch && (
                <p className="text-center text-xs text-gray-300 py-4">
                  Digite para buscar produtos instantaneamente
                </p>
              )}
            </div>
          </div>

          {/* ── Attribution info ── */}
          {instance && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                style={{ backgroundColor: channelCfg.color + '20' }}>
                <channelCfg.icon size={14} style={{ color: channelCfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Atribuição do pedido</p>
                <p className="text-sm font-semibold text-gray-800">
                  {channelCfg.label} · <span style={{ color: 'var(--brand-secondary)' }}>{instance.name}</span>
                </p>
              </div>
              <div className={`w-2 h-2 rounded-full ${
                instance.status === 'connected' || instance.status === 'open'
                  ? 'bg-emerald-400' : 'bg-gray-300'
              }`} />
            </div>
          )}
        </div>

        {/* ════════════════════════════
            RIGHT COLUMN — Cart
        ════════════════════════════ */}
        <div className={`mt-4 lg:mt-0 lg:sticky lg:top-[72px] ${!showCart ? 'hidden lg:block' : ''}`}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Cart header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Carrinho</span>
                {cart.length > 0 && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: 'var(--brand-secondary)' }}>
                    {cart.reduce((s, c) => s + c.qty, 0)}
                  </span>
                )}
              </div>
              {cart.length > 0 && (
                <button onClick={() => setCart([])}
                  className="text-[11px] text-red-400 hover:text-red-600 font-semibold transition flex items-center gap-1">
                  <Trash2 size={11} /> Limpar
                </button>
              )}
            </div>

            {/* Cart items */}
            {cart.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Carrinho vazio</p>
                <p className="text-xs text-gray-300 mt-1">Busque e adicione produtos</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {cart.map(item => (
                  <div key={item.product_id} className="px-5 py-3.5 flex items-center gap-3">
                    {item.image
                      ? <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-100 grid place-items-center shrink-0"><Package size={14} className="text-gray-300" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{money(item.price)} / {item.unit}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateQty(item.product_id, -1)}
                        className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 grid place-items-center transition">
                        <Minus size={12} />
                      </button>
                      <input
                        type="text" inputMode="decimal"
                        value={String(item.qty)}
                        onChange={e => setQtyDirect(item.product_id, e.target.value)}
                        className="w-10 text-center text-sm font-extrabold border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-[var(--brand-secondary)] transition"
                      />
                      <button onClick={() => updateQty(item.product_id, 1)}
                        className="w-7 h-7 rounded-lg grid place-items-center transition text-white"
                        style={{ backgroundColor: 'var(--brand-secondary)' }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-right shrink-0 ml-1">
                      <p className="text-sm font-extrabold text-gray-900">{money(item.price * item.qty)}</p>
                      <button onClick={() => removeItem(item.product_id)}
                        className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition">
                        remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                {/* Totals */}
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-semibold">{money(subtotal)}</span>
                  </div>
                  {/* Discount */}
                  <div className="flex items-center gap-2">
                    <Tag size={12} className="text-gray-400 shrink-0" />
                    <input
                      type="text" inputMode="decimal"
                      value={discount}
                      onChange={e => setDiscount(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder="Desconto (R$)"
                      className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[var(--brand-secondary)] transition"
                    />
                    {discountValue > 0 && (
                      <span className="text-xs font-semibold text-red-500">−{money(discountValue)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                    <span className="font-extrabold text-gray-900">Total</span>
                    <span className="text-xl font-extrabold" style={{ color: 'var(--brand-secondary)' }}>
                      {money(total)}
                    </span>
                  </div>
                </div>

                {/* Payment method */}
                <div className="px-5 py-4 border-t border-gray-100">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Pagamento</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PAYMENTS.map(p => (
                      <button key={p.value} onClick={() => setPayment(p.value)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] font-bold border-2 transition ${
                          payment === p.value
                            ? 'text-white border-transparent shadow-sm'
                            : 'border-gray-100 text-gray-500 hover:border-gray-200 bg-white'
                        }`}
                        style={payment === p.value ? { backgroundColor: 'var(--brand-secondary)' } : undefined}>
                        <p.icon size={14} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="px-5 pb-4 border-t border-gray-100">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observações do pedido (opcional)..."
                    rows={2}
                    className="w-full mt-3 px-3 py-2 border border-gray-200 rounded-xl text-xs resize-none focus:outline-none focus:border-[var(--brand-secondary)] transition"
                  />
                </div>

                {/* Submit */}
                <div className="px-5 pb-5">
                  <button
                    onClick={submitOrder}
                    disabled={submitting || !custName}
                    className="w-full py-4 rounded-2xl text-white font-extrabold text-base disabled:opacity-40 transition flex items-center justify-center gap-2.5 shadow-lg"
                    style={{ backgroundColor: 'var(--brand-secondary)' }}>
                    {submitting
                      ? <><Loader2 size={18} className="animate-spin" /> Registrando...</>
                      : <><Send size={18} /> Confirmar Pedido · {money(total)}</>}
                  </button>
                  {!custName && (
                    <p className="text-[11px] text-amber-600 text-center mt-2 font-semibold">
                      ⚠ Identifique o cliente antes de confirmar
                    </p>
                  )}
                  {/* Attribution reminder */}
                  {instance && (
                    <p className="text-[10px] text-gray-400 text-center mt-2">
                      Atribuído a <strong>{instance.name}</strong> via {channelCfg.label}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: floating cart button when items in cart */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-6 left-4 right-4 lg:hidden z-20">
          <button onClick={() => setShowCart(true)}
            className="w-full py-4 rounded-2xl text-white font-extrabold text-sm shadow-2xl flex items-center justify-between px-5"
            style={{ backgroundColor: 'var(--brand-secondary)' }}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-white/20 rounded-full grid place-items-center text-xs font-extrabold">
                {cart.reduce((s, c) => s + c.qty, 0)}
              </span>
              Ver carrinho
            </div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold">{money(total)}</span>
              <ChevronUp size={16} />
            </div>
          </button>
        </div>
      )}

      {/* Mobile: cart overlay backdrop */}
      {showCart && (
        <div className="fixed inset-0 bg-black/30 z-10 lg:hidden" onClick={() => setShowCart(false)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[200]">
          <div className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg ${
            toast.ok ? 'bg-emerald-500' : 'bg-red-500'
          }`}>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}
