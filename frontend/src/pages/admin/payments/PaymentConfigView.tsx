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

export function PaymentConfigView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allowPix, setAllowPix] = useState(true)
  const [allowCard, setAllowCard] = useState(true)
  const [allowBoleto, setAllowBoleto] = useState(false)
  const [allowCash, setAllowCash] = useState(false)
  const [pixKeyType, setPixKeyType] = useState('cpf')
  const [pixKeyValue, setPixKeyValue] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverCity, setReceiverCity] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/payments/settings', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/payments/pix/settings', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
    ]).then(([settings, pix]) => {
      const s = settings.settings || {}
      setAllowPix(s.allow_pix !== false)
      setAllowCard(s.allow_card !== false)
      setAllowBoleto(s.allow_boleto === true)
      setAllowCash(s.allow_wallet === true)
      const p = pix.pix || {}
      setPixKeyType(p.pix_key_type || 'cpf')
      setPixKeyValue(p.pix_key_value || '')
      setReceiverName(p.receiver_name || '')
      setReceiverCity(p.receiver_city || '')
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/payments/settings', {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ allow_pix: allowPix, allow_card: allowCard, allow_boleto: allowBoleto, allow_wallet: allowCash }),
      })
      if (allowPix && pixKeyValue) {
        await fetch('/api/payments/pix/settings', {
          method: 'PUT', headers: getHeaders(),
          body: JSON.stringify({ enabled: true, provider: 'manual', pix_key_type: pixKeyType, pix_key_value: pixKeyValue, receiver_name: receiverName, receiver_city: receiverCity }),
        })
      }
      showToast('Configuracoes de pagamento salvas!')
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  if (loading) return <Skeleton rows={6} />

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Pagamentos</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Metodos de pagamento e chave PIX</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Metodos aceitos</p>
        {([
          { label: 'PIX', sub: 'Transferencia instantanea', value: allowPix, onChange: setAllowPix, Icon: QrCode },
          { label: 'Cartao de Credito/Debito', sub: 'Maquininha na entrega', value: allowCard, onChange: setAllowCard, Icon: CreditCard },
          { label: 'Boleto Bancario', sub: 'Vencimento em 3 dias', value: allowBoleto, onChange: setAllowBoleto, Icon: FileText },
          { label: 'Dinheiro', sub: 'Pagamento na entrega', value: allowCash, onChange: setAllowCash, Icon: Banknote },
        ] as { label: string; sub: string; value: boolean; onChange: (v: boolean) => void; Icon: LucideIcon }[]).map(m => (
          <div key={m.label} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3">
              <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${m.value ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                <m.Icon size={16} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                <p className="text-[10px] text-gray-400">{m.sub}</p>
              </div>
            </div>
            <Toggle value={m.value} onChange={m.onChange} />
          </div>
        ))}
      </div>

      {/* PIX Settings */}
      {allowPix && (
        <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
              <QrCode size={16} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">Configuracao PIX</p>
              <p className="text-[10px] text-gray-400">Chave PIX para recebimento direto no checkout</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tipo da chave</label>
              <select value={pixKeyType} onChange={e => setPixKeyType(e.target.value)} className={inputCls}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatoria</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Chave PIX *</label>
              <input type="text" value={pixKeyValue} onChange={e => setPixKeyValue(e.target.value)}
                placeholder={pixKeyType === 'cpf' ? '000.000.000-00' : pixKeyType === 'cnpj' ? '00.000.000/0000-00' : pixKeyType === 'email' ? 'email@exemplo.com' : pixKeyType === 'phone' ? '+5531999999999' : 'chave-aleatoria'}
                className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Nome do recebedor</label>
              <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)}
                placeholder="Nome que aparece no PIX" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Cidade</label>
              <input type="text" value={receiverCity} onChange={e => setReceiverCity(e.target.value)}
                placeholder="Ex: Belo Horizonte" className={inputCls} />
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-xs text-emerald-700 font-medium">O QR Code PIX sera gerado automaticamente no checkout com confirmacao manual pelo admin.</p>
          </div>
        </div>
      )}
    </div>
  )
}

