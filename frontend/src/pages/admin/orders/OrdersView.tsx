import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppIcon } from '@/components/icons'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { useOrdersBridgeOptional } from '@/lib/agent/OrdersBridgeContext'
import { useAgentShellOptional } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { orderRef } from '@/lib/orders/orderRef'

export function OrdersView({
  showToast,
  embedded = false,
}: {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  embedded?: boolean
}) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [subTab, setSubTab] = useState<'orders' | 'bookings'>('orders')
  const ordersBridge = useOrdersBridgeOptional()
  const agentShell = useAgentShellOptional()
  const isDesktop = useIsDesktop()
  const pendingSelectId = useRef<string | null>(null)

  function load() {
    setLoading(true)
    adminApi.orders(1, 200).then(d => { setOrders(d.orders || []); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const STATUS_CFG: Record<string, { label: string; cls: string }> = {
    novo: { label: 'Novo', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    aguardando_pagamento: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
    pago: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    em_preparacao: { label: 'Preparando', cls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
    em_entrega: { label: 'Em Entrega', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    entregue: { label: 'Entregue', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    cancelado: { label: 'Cancelado', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  }

  const metrics = useMemo(() => {
    const total = orders.length
    const totalValue = orders.reduce((s, o) => s + (Number(o.valor_total) || 0), 0)
    const sc: Record<string, number> = {}
    orders.forEach(o => { const k = (o.business_status || o.status_pedido || 'novo').toLowerCase(); sc[k] = (sc[k] || 0) + 1 })
    const paid = (sc['pago']||0) + (sc['em_preparacao']||0) + (sc['em_entrega']||0) + (sc['entregue']||0)
    return { total, totalValue, sc, paid }
  }, [orders])

  const filtered = useMemo(() => statusFilter ? orders.filter(o => (o.business_status || o.status_pedido || '').toLowerCase() === statusFilter) : orders, [orders, statusFilter])

  useEffect(() => {
    if (!ordersBridge?.registerHandlers || (!embedded && !isDesktop)) return
    return ordersBridge.registerHandlers({
      search: () => { void load() },
      filterStatus: (s) => { setStatusFilter(s); void load() },
      selectOrder: (id) => {
        const found = orders.find((o) => String(o.id) === String(id))
        if (found) void openDetail(found)
        else pendingSelectId.current = id
      },
      openFull: () => { if (isDesktop) agentShell?.openCanvas('/pedidos') },
      openPdv: () => agentShell?.triggerSkill('order.assisted', {
        label: 'Fazer pedido',
        assistantMessage: 'Vamos montar esse pedido. Para quem é?',
      }),
      refresh: () => load(),
    })
  }, [ordersBridge, embedded, isDesktop, orders, agentShell])

  useEffect(() => {
    if (!isDesktop || !pendingSelectId.current) return
    const found = orders.find((o) => String(o.id) === String(pendingSelectId.current))
    if (found) {
      void openDetail(found)
      pendingSelectId.current = null
    }
  }, [orders, isDesktop])

  useEffect(() => {
    if (!ordersBridge?.publishSnapshot || (!embedded && !isDesktop)) return
    const pendingCount = orders.filter((o) =>
      ['novo', 'aguardando_pagamento'].includes(
        String(o.business_status || o.status_pedido || '').toLowerCase(),
      ),
    ).length
    const paidCount = orders.filter((o) =>
      ['pago', 'em_preparacao', 'em_entrega', 'entregue'].includes(
        String(o.business_status || o.status_pedido || '').toLowerCase(),
      ),
    ).length
    ordersBridge.publishSnapshot({
      total: metrics.total || orders.length,
      pendingCount,
      paidCount,
      revenueTotal: metrics.totalValue,
      statusFilter,
      loading: false,
    })
  }, [ordersBridge, embedded, isDesktop, orders, metrics.total, metrics.totalValue, statusFilter, loading])

  async function openDetail(o: any) {
    setSelectedOrder(o); setLoadingDetail(true)
    try { const r = await fetch(`/api/orders/${o.id}`, { headers: getHeaders() }); const d = await r.json(); setOrderDetail(d.success ? d : null) } catch { setOrderDetail(null) }
    setLoadingDetail(false)
  }

  async function changeStatus(id: string, st: string) {
    setActionLoading(true)
    try {
      const r = await fetch(`/api/orders/${id}/status`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status: st }) })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      showToast(`Status → ${STATUS_CFG[st]?.label || st}`); load()
      if (selectedOrder?.id === id) openDetail({ ...selectedOrder, business_status: st })
    } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(false)
  }

  async function sendExpedition(id: string) {
    setActionLoading(true)
    try { await fetch(`/api/orders/${id}/send-to-expedition`, { method: 'POST', headers: getHeaders() }); showToast('Enviado para expedicao!'); load() } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(false)
  }

  async function cancelOrder(id: string) {
    if (!confirm('Cancelar este pedido?')) return
    setActionLoading(true)
    try { await fetch(`/api/orders/${id}/cancel`, { method: 'POST', headers: getHeaders() }); showToast('Pedido cancelado'); load(); setSelectedOrder(null) } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(false)
  }

  if (loading) return <Skeleton rows={6} />

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {embedded ? (
        <p className="text-[12px] text-gray-500 tabular-nums">
          {metrics.total} pedidos · {money(metrics.totalValue)} faturado · {metrics.paid} pagos
        </p>
      ) : (
        <div><h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Pedidos & Agendamentos</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} pedidos · {money(metrics.totalValue)} total</p></div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-fit">
        {([
          { key: 'orders', label: 'Pedidos' },
          { key: 'bookings', label: 'Agendamentos' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition ${
              subTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {subTab === 'bookings' ? <BookingsView showToast={showToast} /> : (<>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Total" value={String(metrics.total)} icon={ShoppingCart} bg="bg-blue-50" color="text-blue-500" accent="text-blue-600" />
        <KpiCard label="Faturamento" value={money(metrics.totalValue)} icon={BarChart3} bg="bg-emerald-50" color="text-emerald-500" accent="text-emerald-600" />
        <KpiCard label="Pagos" value={String(metrics.paid)} icon={Eye} bg="bg-violet-50" color="text-violet-500" accent="text-gray-700" />
        <KpiCard label="Ticket Medio" value={metrics.total > 0 ? money(metrics.totalValue / metrics.total) : '—'} icon={Zap} bg="bg-amber-50" color="text-amber-500" accent="text-amber-600" />
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Pipeline</p>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setStatusFilter('')} className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${!statusFilter ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-500'}`}>Todos ({metrics.total})</button>
          {Object.entries(STATUS_CFG).map(([k, c]) => { const n = metrics.sc[k] || 0; return n > 0 || k === 'novo' ? (
            <button key={k} onClick={() => setStatusFilter(statusFilter === k ? '' : k)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${statusFilter === k ? c.cls + ' shadow-sm' : 'bg-gray-50 text-gray-500'}`}>{c.label} ({n})</button>
          ) : null })}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? <EmptyState icon={ShoppingCart} text="Nenhum pedido" /> : (
        <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="bg-gray-50/80 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Pedido</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Cliente</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Vendedor</th>
            <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Status</th>
            <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Pagto</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Valor</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase hidden md:table-cell">Data</th>
          </tr></thead><tbody>
            {filtered.map((o: any) => { const st = STATUS_CFG[(o.business_status || o.status_pedido || '').toLowerCase()] || { label: '?', cls: 'bg-gray-100 text-gray-600' }; return (
              <tr key={o.id} onClick={() => openDetail(o)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/30 transition group">
                <td className="px-4 py-3"><p className="font-mono text-xs font-bold text-gray-700 group-hover:text-blue-600">#{orderRef(o)}</p><p className="text-[9px] text-gray-400">{o.channel || o.origem}</p></td>
                <td className="px-4 py-3"><p className="font-semibold text-gray-900 truncate max-w-[140px]">{o.customer_name || '—'}</p></td>
                <td className="px-4 py-3 hidden sm:table-cell"><p className="text-xs text-gray-600">{o.seller_name || o.vendedor || '—'}</p></td>
                <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                <td className="px-4 py-3 text-center hidden sm:table-cell"><span className="text-[10px] text-gray-500">{(o.forma_pagamento || '').toUpperCase()}</span></td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{money(o.valor_total)}</td>
                <td className="px-4 py-3 text-right text-[10px] text-gray-400 hidden md:table-cell">{dt(o.created_at)}</td>
              </tr>
            ) })}
          </tbody></table>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { setSelectedOrder(null); setOrderDetail(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div><h3 className="font-bold text-base text-gray-900">Pedido #{orderRef(selectedOrder)}</h3>
                <p className="text-[11px] text-gray-400">{selectedOrder.customer_name} · {money(selectedOrder.valor_total)}</p></div>
              <button onClick={() => { setSelectedOrder(null); setOrderDetail(null) }} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {loadingDetail ? <Skeleton rows={5} /> : (<>
                {/* Status change */}
                <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Alterar Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(STATUS_CFG).map(([k, c]) => { const cur = (orderDetail?.order?.business_status || selectedOrder.business_status || selectedOrder.status_pedido || '').toLowerCase(); return (
                      <button key={k} onClick={() => cur !== k && changeStatus(selectedOrder.id, k)} disabled={actionLoading || cur === k}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${cur === k ? c.cls + ' shadow-sm scale-105' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-40'}`}>{c.label}</button>
                    ) })}
                  </div>
                </div>
                {/* Customer */}
                <div className="space-y-2">
                  {selectedOrder.customer_phone && (
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center gap-2.5"><Phone size={14} className="text-gray-400" /><span className="text-sm font-mono text-gray-700">{selectedOrder.customer_phone}</span></div>
                      <a href={`https://wa.me/${(selectedOrder.customer_phone||'').replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition shadow-sm"><WhatsAppIcon size={12} /> WhatsApp</a>
                    </div>
                  )}
                  {selectedOrder.customer_email && (<div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3"><Mail size={14} className="text-gray-400" /><span className="text-sm text-gray-700">{selectedOrder.customer_email}</span></div>)}
                </div>
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[9px] font-bold text-gray-400 uppercase">Valor</p><p className="text-lg font-extrabold text-gray-900 mt-0.5">{money(selectedOrder.valor_total)}</p></div>
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[9px] font-bold text-gray-400 uppercase">Pagamento</p><p className="text-sm font-bold text-gray-700 mt-0.5">{(selectedOrder.forma_pagamento||'').toUpperCase()}</p></div>
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[9px] font-bold text-gray-400 uppercase">Canal</p><p className="text-xs font-semibold text-gray-700 mt-0.5">{selectedOrder.channel || selectedOrder.origem || '—'}</p></div>
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[9px] font-bold text-gray-400 uppercase">Entrega</p><p className="text-xs font-semibold text-gray-700 mt-0.5">{(selectedOrder.delivery_status || 'nao_iniciado').replace(/_/g, ' ')}</p></div>
                </div>
                {/* Items */}
                {orderDetail?.items?.length > 0 && (<div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Itens</p>
                  <div className="bg-gray-50 rounded-xl divide-y divide-gray-200">
                    {orderDetail.items.map((it: any, i: number) => (<div key={i} className="flex items-center justify-between px-3 py-2">
                      <div><p className="text-xs font-semibold text-gray-700">{it.product_name || it.name}</p><p className="text-[10px] text-gray-400">{it.quantity}x {money(it.unit_price || it.preco_unitario)}</p></div>
                      <p className="text-xs font-bold text-gray-900">{money((it.quantity||1) * (it.unit_price || it.preco_unitario || 0))}</p>
                    </div>))}
                  </div>
                </div>)}
                {/* Timeline */}
                {orderDetail?.timeline?.length > 0 && (<div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Historico</p>
                  <div className="space-y-1.5">{orderDetail.timeline.map((ev: any, i: number) => (
                    <div key={i} className="flex items-start gap-2.5"><div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div><p className="text-xs font-semibold text-gray-700">{(ev.status || ev.event_key || '').replace(/_/g, ' ')}</p><p className="text-[9px] text-gray-400">{dtFull(ev.timestamp)}</p></div>
                    </div>
                  ))}</div>
                </div>)}
                {/* Customer profile */}
                {orderDetail?.customer_profile && (<div className="bg-violet-50 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-violet-500 uppercase mb-1.5">Perfil do Cliente</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-sm font-extrabold text-violet-700">{orderDetail.customer_profile.total_orders}</p><p className="text-[8px] text-violet-400">Pedidos</p></div>
                    <div><p className="text-sm font-extrabold text-violet-700">{money(orderDetail.customer_profile.total_spent)}</p><p className="text-[8px] text-violet-400">Total</p></div>
                    <div><p className="text-sm font-extrabold text-violet-700">{money(orderDetail.customer_profile.average_ticket)}</p><p className="text-[8px] text-violet-400">Ticket</p></div>
                  </div>
                  {orderDetail.customer_profile.vip && <p className="text-center text-[9px] font-bold text-gray-700 mt-1.5 bg-violet-100 rounded-lg py-1">VIP</p>}
                </div>)}
                {/* Actions */}
                <div className="flex gap-2 flex-wrap pt-1">
                  <button onClick={() => sendExpedition(selectedOrder.id)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition"><Send size={12} strokeWidth={1.75} /> Enviar expedição</button>
                  {selectedOrder.payment_link && <a href={selectedOrder.payment_link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition"><Eye size={12} /> Link Pgto</a>}
                  <button onClick={() => cancelOrder(selectedOrder.id)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 text-xs font-semibold hover:bg-red-50 transition ml-auto"><Ban size={12} /> Cancelar</button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}

/* ══════════════════════════════════════════════
   BOOKINGS VIEW (Fase 7)
   ══════════════════════════════════════════════ */
const BOOKING_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  rescheduled: { label: 'Reagendado', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  completed: { label: 'Concluído', cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
}

function formatBookingDate(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}
function formatBookingTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

function BookingsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [bookings, setBookings] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [acting, setActing] = useState<string | null>(null)
  /* Bug 1 fix: inline cancel reason instead of blocking prompt() */
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/bookings', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        setBookings(d.bookings || [])
        setCounts(d.counts || {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function updateStatus(customerId: string, status: string, notes?: string) {
    setActing(String(customerId))
    try {
      const r = await fetch(`/api/bookings/${customerId}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ status, notes }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const baseMsg = `Agendamento → ${BOOKING_STATUS_CFG[status]?.label || status}`
      const notif = d.notification
      if (notif?.delivered) {
        showToast(`${baseMsg} · WhatsApp enviado ao cliente`)
      } else if (notif?.skipped_reason === 'no_phone') {
        showToast(`${baseMsg} (cliente sem telefone — sem notificação)`)
      } else if (notif?.skipped_reason === 'no_instance') {
        showToast(`${baseMsg} (sem instância WhatsApp conectada — sem notificação)`)
      } else if (notif?.skipped_reason === 'send_failed') {
        showToast(`${baseMsg} (falha ao enviar WhatsApp ao cliente)`, 'err')
      } else {
        showToast(baseMsg)
      }
      load()
    } catch (e: any) {
      showToast(e.message || 'Erro ao atualizar', 'err')
    } finally {
      setActing(null)
    }
  }

  const filtered = useMemo(
    () => statusFilter ? bookings.filter(b => b.status === statusFilter) : bookings,
    [bookings, statusFilter]
  )

  /* Group by date for visual organization */
  const grouped = useMemo(() => {
    const byDay = new Map<string, any[]>()
    for (const b of filtered) {
      const day = String(b.start_at || '').slice(0, 10) || '—'
      const arr = byDay.get(day) || []
      arr.push(b)
      byDay.set(day, arr)
    }
    /* sort each day's bookings by start_at */
    for (const arr of byDay.values()) arr.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-4">
      {/* Status pipeline */}
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Status</p>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setStatusFilter('')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
              !statusFilter ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-500'
            }`}>
            Todos ({bookings.length})
          </button>
          {Object.entries(BOOKING_STATUS_CFG).map(([k, c]) => {
            const n = counts[k] || 0
            return (
              <button key={k} onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  statusFilter === k ? c.cls + ' shadow-sm' : 'bg-gray-50 text-gray-500'
                }`}>
                {c.label} ({n})
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Clock} text={
          bookings.length === 0
            ? 'Nenhum agendamento recebido ainda. Quando um cliente agendar pelo catálogo, vai aparecer aqui.'
            : 'Nenhum agendamento neste filtro'
        } />
      ) : grouped.map(([day, items]) => (
        <div key={day} className="space-y-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">
            {formatBookingDate(day + 'T00:00:00')}
          </p>
          {items.map((b: any) => {
            const cfg = BOOKING_STATUS_CFG[b.status] || BOOKING_STATUS_CFG.pending_confirmation
            const canConfirm = b.status === 'pending_confirmation' || b.status === 'rescheduled'
            const canCancel = b.status !== 'cancelled' && b.status !== 'completed'
            const canComplete = b.status === 'confirmed'
            return (
              <div key={b.customer_id} className="bg-white border border-border-light rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{b.customer_name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <p className="text-[12px] text-gray-700 mt-1">
                      <Clock size={11} className="inline -mt-0.5 mr-1 text-gray-400" />
                      {formatBookingTime(b.start_at)} – {formatBookingTime(b.end_at)}
                    </p>
                    {b.product_name && <p className="text-[11px] text-gray-500 mt-0.5">Serviço: {b.product_name}</p>}
                    {b.address && <p className="text-[11px] text-gray-500 mt-0.5">📍 {b.address}</p>}
                    {b.message && (
                      <p className="text-[11px] text-gray-500 mt-0.5 italic">"{b.message}"</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500">
                      {b.customer_phone && <span>📱 {b.customer_phone}</span>}
                      {b.customer_email && <span>✉ {b.customer_email}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {canConfirm && (
                      <button onClick={() => updateStatus(b.customer_id, 'confirmed')}
                        disabled={acting === String(b.customer_id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition">
                        Confirmar
                      </button>
                    )}
                    {canComplete && (
                      <button onClick={() => updateStatus(b.customer_id, 'completed')}
                        disabled={acting === String(b.customer_id)}
                        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-800 disabled:opacity-50 transition">
                        Concluir
                      </button>
                    )}
                    {canCancel && cancellingId !== String(b.customer_id) && (
                      <button onClick={() => { setCancellingId(String(b.customer_id)); setCancelReason('') }}
                        disabled={acting === String(b.customer_id)}
                        className="px-3 py-1.5 rounded-lg text-red-600 text-[11px] font-bold hover:bg-red-50 disabled:opacity-50 transition">
                        Cancelar
                      </button>
                    )}
                  </div>
                  {cancellingId === String(b.customer_id) && (
                    <div className="mt-2 flex gap-2 items-center bg-red-50/40 border border-red-100 rounded-xl p-2">
                      <input
                        type="text"
                        autoFocus
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            updateStatus(b.customer_id, 'cancelled', cancelReason.trim() || undefined)
                            setCancellingId(null); setCancelReason('')
                          }
                          if (e.key === 'Escape') { setCancellingId(null); setCancelReason('') }
                        }}
                        placeholder="Motivo (opcional)"
                        className="flex-1 px-2 py-1 rounded-lg border border-red-200 text-[11px] focus:outline-none focus:border-red-400"
                      />
                      <button type="button"
                        onClick={() => {
                          updateStatus(b.customer_id, 'cancelled', cancelReason.trim() || undefined)
                          setCancellingId(null); setCancelReason('')
                        }}
                        className="px-3 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700">
                        Confirmar
                      </button>
                      <button type="button"
                        onClick={() => { setCancellingId(null); setCancelReason('') }}
                        className="px-2 py-1 text-gray-500 text-[11px] hover:text-gray-700">
                        Voltar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
/* ══════════════════════════════════════════════
   INVENTORY OVERVIEW (simplified)
   ══════════════════════════════════════════════ */
function InventoryOverview({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      inventoryApi.overview().catch(() => ({})),
      inventoryApi.products(1, 20).catch(() => ({ products: [] })),
    ]).then(([ov, prods]) => {
      setData(ov)
      setProducts(prods.products || prods.items || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Estoque</h2>
        <button onClick={() => navigate('/estoque')}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
          Abrir Painel Completo <ArrowRight size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Produtos" value={num(data?.total_products)} icon={Package} bg="bg-blue-50" color="text-blue-600" />
        <KpiCard label="Total Unidades" value={num(data?.total_units)} icon={BarChart3} bg="bg-indigo-50" color="text-indigo-600" />
        <KpiCard label="Sem Estoque" value={num(data?.out_of_stock)} icon={Zap} bg="bg-red-50" color="text-red-500" />
        <KpiCard label="Estoque Baixo" value={num(data?.low_stock)} icon={Clock} bg="bg-amber-50" color="text-amber-500" />
      </div>

      {/* Products table */}
      {products.length > 0 && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Produtos</h3>
            <span className="text-xs text-muted">{products.length} de {data?.total_products || '?'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-bold text-muted uppercase">Produto</th>
                  <th className="text-right px-4 py-2 text-xs font-bold text-muted uppercase">Estoque</th>
                  <th className="text-right px-4 py-2 text-xs font-bold text-muted uppercase hidden sm:table-cell">Preco</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 10).map((p: any, i: number) => {
                  const stock = p.stock_available ?? p.stock_current ?? 0
                  const stockCls = stock === 0 ? 'text-red-600 font-bold' : stock < (p.stock_min || 5) ? 'text-amber-600 font-semibold' : 'text-gray-700'
                  return (
                    <tr key={p.product_id || p.id || i} className="border-b border-border last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {(p.product_image || p.image_url) && (
                            <img src={p.product_image || p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0"
                              onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          )}
                          <span className="font-medium text-gray-900 truncate max-w-[200px]">{p.product_name || p.name}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right ${stockCls}`}>
                        {num(stock)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 hidden sm:table-cell">
                        {money(p.product_price || p.price)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   AUTOMATIONS VIEW
   ══════════════════════════════════════════════ */
