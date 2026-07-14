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
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'

export function FreteView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [storeId, setStoreId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fee, setFee] = useState('')
  const [radius, setRadius] = useState('')
  const [freeAbove, setFreeAbove] = useState('')
  const [eta, setEta] = useState('')
  const [deliveryText, setDeliveryText] = useState('')
  const [freteTexto, setFreteTexto] = useState('')
  const [expeditionPhone, setExpeditionPhone] = useState('')
  const [shippingMode, setShippingMode] = useState('delivery')

  useEffect(() => {
    setLoading(true)
    fetch('/api/storefront/stores', { headers: getHeaders() })
      .then(r => r.json()).then(async d => {
        const stores = d.stores || []
        if (!stores.length) { setLoading(false); return }
        setStoreId(stores[0].id)
        const r2 = await fetch(`/api/storefront/stores/${stores[0].id}`, { headers: getHeaders() })
        const d2 = await r2.json()
        const lg = d2.store?.settings?.logistics || {}
        setFee(lg.delivery_fee != null ? String(lg.delivery_fee) : '')
        setRadius(lg.delivery_radius_km != null ? String(lg.delivery_radius_km) : '')
        setFreeAbove(lg.free_shipping_above != null ? String(lg.free_shipping_above) : '')
        setEta(lg.default_eta_minutes != null ? String(lg.default_eta_minutes) : '')
        setDeliveryText(lg.delivery_time_text || '')
        setFreteTexto(lg.frete_texto || '')
        setExpeditionPhone(lg.expedition_phone || '')
        setShippingMode(lg.shipping_mode || 'delivery')
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  async function save() {
    if (!storeId) return
    setSaving(true)
    try {
      await fetch(`/api/storefront/stores/${storeId}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ settings: { logistics: {
          delivery_fee: fee ? parseFloat(fee) : null,
          delivery_radius_km: radius ? parseFloat(radius) : null,
          free_shipping_above: freeAbove ? parseFloat(freeAbove) : null,
          default_eta_minutes: eta ? parseInt(eta) : null,
          delivery_time_text: deliveryText || null,
          frete_texto: freteTexto || null,
          expedition_phone: expeditionPhone ? expeditionPhone.replace(/\D/g, '') : null,
          shipping_mode: shippingMode,
        }}}),
      })
      showToast('Configuracoes salvas!')
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  if (loading) return <Skeleton rows={6} />

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'

  // Preview
  const hasFreeShipping = freeAbove && Number(freeAbove) > 0
  const hasFee = fee && Number(fee) > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Frete & Entrega</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Configure entregas e politicas de frete</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/entregas')}
            className="px-4 py-2.5 rounded-xl border border-border bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50 transition"
          >
            Lead Capture Mob
          </button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Preview banner — how it looks in the catalog */}
      {(hasFreeShipping || hasFee) && (
        <div className="bg-emerald-600 rounded-2xl p-4 text-white shadow-lg">
          <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">Preview no catalogo</p>
          <div className="flex items-center gap-3 flex-wrap">
            {hasFreeShipping && (
              <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-3 py-1.5">
                <Truck size={14} strokeWidth={2} />
                <span className="text-sm font-bold">Frete gratis acima de R$ {Number(freeAbove).toFixed(0)}</span>
              </div>
            )}
            {hasFee && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5">
                <span className="text-xs font-semibold">Taxa: R$ {Number(fee).toFixed(2)}</span>
              </div>
            )}
            {eta && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5">
                <Clock size={12} strokeWidth={2} />
                <span className="text-xs font-semibold">{eta} min</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shipping mode */}
      <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Modo de entrega</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { key: 'delivery', label: 'Entrega', desc: 'Entregamos no endereco', Icon: Truck },
            { key: 'pickup', label: 'Retirada', desc: 'Cliente retira na loja', Icon: Store },
            { key: 'both', label: 'Ambos', desc: 'Entrega + Retirada', Icon: Boxes },
            { key: 'none', label: 'Sem frete', desc: 'Somente digital', Icon: Laptop },
          ] as { key: string; label: string; desc: string; Icon: LucideIcon }[]).map(m => (
            <button key={m.key} type="button" onClick={() => setShippingMode(m.key)}
              className={`p-3 rounded-xl border text-left transition ${shippingMode === m.key ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
              <m.Icon size={18} strokeWidth={1.75} className={shippingMode === m.key ? 'text-blue-600' : 'text-gray-500'} />
              <p className={`text-xs font-bold mt-1.5 ${shippingMode === m.key ? 'text-blue-700' : 'text-gray-700'}`}>{m.label}</p>
              <p className="text-[9px] text-gray-400">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Valores e politica</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Taxa de entrega (R$)</label>
            <input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} placeholder="0,00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Frete gratis acima de (R$)</label>
            <div className="relative">
              <input type="number" step="0.01" value={freeAbove} onChange={e => setFreeAbove(e.target.value)} placeholder="Desativado" className={inputCls} />
              {hasFreeShipping && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-[9px] font-bold">ATIVO</span>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Raio de entrega (km)</label>
            <input type="number" value={radius} onChange={e => setRadius(e.target.value)} placeholder="Ex: 30" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tempo estimado (min)</label>
            <input type="number" value={eta} onChange={e => setEta(e.target.value)} placeholder="Ex: 120" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Texts */}
      <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Textos e politica</p>
        <div>
          <label className={labelCls}>Texto de prazo (exibido no catalogo)</label>
          <input type="text" value={deliveryText} onChange={e => setDeliveryText(e.target.value)} placeholder="Ex: Entrega em ate 2 horas para BH e regiao" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Politica de frete (texto completo)</label>
          <textarea value={freteTexto} onChange={e => setFreteTexto(e.target.value)} rows={3}
            placeholder="Ex: Frete gratis para pedidos acima de R$ 200. Taxa de R$ 10 para entregas em BH e Contagem. Prazo de 2 horas apos confirmacao do pagamento."
            className={inputCls + ' resize-none'} />
          <p className="text-[9px] text-gray-400 mt-1">Este texto sera exibido na pagina do catalogo e no checkout.</p>
        </div>
      </div>

      {/* Expedition WhatsApp */}
      <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-emerald-50 rounded-lg grid place-items-center"><MessageSquare size={14} className="text-emerald-500" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900">WhatsApp da Expedicao</p>
            <p className="text-[10px] text-gray-400">Recebe notificacoes automaticas de novos pedidos</p>
          </div>
        </div>
        <div className="relative">
          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="tel" value={expeditionPhone} onChange={e => setExpeditionPhone(e.target.value)}
            placeholder="Ex: 5531991619663" className={inputCls + ' pl-9'} />
        </div>
      </div>
    </div>
  )
}

/* ── Edit Form Component ── */
