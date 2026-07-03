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
import type { CouponRow } from '@/pages/admin/row-types'

export function CouponsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const { confirm } = useConfirm()
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<CouponRow> | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  function load() {
    setLoading(true)
    fetch('/api/coupons', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => { setCoupons(d.coupons || []); setLoading(false) })
      .catch(() => { showToast('Erro ao carregar cupons', 'err'); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (filter === 'active') return coupons.filter(c => c.active && (!c.expires_at || new Date(c.expires_at).getTime() > Date.now()))
    if (filter === 'inactive') return coupons.filter(c => !c.active || (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()))
    return coupons
  }, [coupons, filter])

  const kpis = useMemo(() => {
    const active = coupons.filter(c => c.active && (!c.expires_at || new Date(c.expires_at).getTime() > Date.now())).length
    const totalRedeemed = coupons.reduce((acc, c) => acc + Number(c.used_count || 0), 0)
    const expiring = coupons.filter(c =>
      c.active && c.expires_at && new Date(c.expires_at).getTime() > Date.now() &&
      new Date(c.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    ).length
    return { total: coupons.length, active, totalRedeemed, expiring }
  }, [coupons])

  async function save() {
    if (!editing) return
    if (!editing.code?.trim()) return showToast('Código obrigatório', 'err')
    if (!editing.discount_value || Number(editing.discount_value) <= 0) return showToast('Valor de desconto inválido', 'err')
    setSaving(true)
    try {
      const body = {
        code: String(editing.code).trim().toUpperCase(),
        description: editing.description || null,
        discount_type: editing.discount_type || 'percentage',
        discount_value: Number(editing.discount_value),
        min_subtotal: editing.min_subtotal != null && editing.min_subtotal !== ('' as any) ? Number(editing.min_subtotal) : null,
        max_discount_cap: editing.max_discount_cap != null && editing.max_discount_cap !== ('' as any) ? Number(editing.max_discount_cap) : null,
        applies_to: editing.applies_to || 'all',
        starts_at: editing.starts_at || null,
        expires_at: editing.expires_at || null,
        usage_limit_total: editing.usage_limit_total != null && editing.usage_limit_total !== ('' as any) ? Number(editing.usage_limit_total) : null,
        usage_limit_per_customer: editing.usage_limit_per_customer != null && editing.usage_limit_per_customer !== ('' as any) ? Number(editing.usage_limit_per_customer) : null,
        active: editing.active !== false,
      }
      const url = editing.id ? `/api/coupons/${editing.id}` : '/api/coupons'
      const method = editing.id ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      showToast(editing.id ? 'Cupom atualizado' : 'Cupom criado!')
      setEditing(null)
      load()
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: CouponRow) {
    const action = c.used_count > 0 ? 'desativar' : 'excluir'
    const ok = await confirm({
      title: c.used_count > 0 ? 'Desativar cupom?' : 'Excluir cupom?',
      message: c.used_count > 0
        ? `${c.code} já foi usado ${c.used_count}× — será apenas desativado para preservar histórico.`
        : `${c.code} não tem uso registrado. Será excluído permanentemente.`,
      confirmLabel: action,
      variant: 'danger',
    })
    if (!ok) return
    try {
      const r = await fetch(`/api/coupons/${c.id}`, { method: 'DELETE', headers: getHeaders() })
      if (!r.ok) throw new Error(`Erro ${r.status}`)
      showToast(c.used_count > 0 ? 'Cupom desativado' : 'Cupom excluído')
      load()
    } catch (e: any) {
      showToast(e.message || 'Erro ao remover', 'err')
    }
  }

  function statusBadge(c: CouponRow) {
    const expired = c.expires_at && new Date(c.expires_at).getTime() <= Date.now()
    const exhausted = c.usage_limit_total != null && c.used_count >= c.usage_limit_total
    if (!c.active) return <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider">Inativo</span>
    if (expired) return <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider">Expirado</span>
    if (exhausted) return <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider">Esgotado</span>
    return <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider">Ativo</span>
  }

  function formatDiscount(c: CouponRow) {
    if (c.discount_type === 'percentage') return `${c.discount_value}%${c.max_discount_cap ? ` (até ${money(c.max_discount_cap)})` : ''}`
    return money(c.discount_value)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Ticket size={18} className="text-violet-600" strokeWidth={2.5} /> Cupons
          </h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Códigos de desconto aplicáveis no checkout. O agente também pode oferecê-los proativamente.</p>
        </div>
        <button onClick={() => setEditing({ discount_type: 'percentage', applies_to: 'all', active: true } as any)}
          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-[12px] font-bold hover:bg-violet-700 flex items-center gap-1.5">
          <Plus size={14} strokeWidth={2.5} /> Novo cupom
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total" value={num(kpis.total)} icon={Ticket} bg="bg-gray-50" color="text-gray-500" />
        <KpiCard label="Ativos" value={num(kpis.active)} icon={CheckCircle2} bg="bg-green-50" color="text-green-600" />
        <KpiCard label="Resgates" value={num(kpis.totalRedeemed)} icon={Percent} bg="bg-violet-50" color="text-violet-600" />
        <KpiCard label="Expirando (7d)" value={num(kpis.expiring)} icon={Clock} bg="bg-amber-50" color="text-amber-600" />
      </div>

      <div className="flex gap-2 mb-3">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : 'Inativos/Expirados'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Ticket size={32} className="mx-auto text-gray-300 mb-3" strokeWidth={1.5} />
            <p className="text-[14px] font-semibold text-gray-700 mb-1">Nenhum cupom ainda</p>
            <p className="text-[12px] text-gray-400">Crie códigos como BEMVINDO10 para oferecer descontos no carrinho.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Código</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Desconto</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Condições</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Usos</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-[13px] text-gray-900">{c.code}</div>
                    {c.description && <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{c.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-semibold text-violet-700 tabular-nums">{formatDiscount(c)}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 hidden sm:table-cell">
                    {c.min_subtotal != null && <div>mín. {money(c.min_subtotal)}</div>}
                    {c.expires_at && <div>até {dt(c.expires_at)}</div>}
                    {c.usage_limit_per_customer != null && <div>{c.usage_limit_per_customer}× por cliente</div>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-600 tabular-nums">
                    {c.used_count}{c.usage_limit_total != null ? ` / ${c.usage_limit_total}` : ''}
                  </td>
                  <td className="px-4 py-3">{statusBadge(c)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(c)} title="Editar"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100">
                        <Settings size={14} strokeWidth={2.25} />
                      </button>
                      <button onClick={() => remove(c)} title={c.used_count > 0 ? 'Desativar' : 'Excluir'}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 size={14} strokeWidth={2.25} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <CouponEditorModal
          coupon={editing}
          saving={saving}
          onChange={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CouponEditorModal({ coupon, saving, onChange, onSave, onClose }: {
  coupon: Partial<CouponRow>
  saving: boolean
  onChange: (c: Partial<CouponRow>) => void
  onSave: () => void
  onClose: () => void
}) {
  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'
  const lockedCode = !!coupon.id && Number(coupon.used_count || 0) > 0
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">{coupon.id ? 'Editar cupom' : 'Novo cupom'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Código *</label>
              <input
                type="text"
                value={coupon.code || ''}
                disabled={lockedCode}
                onChange={e => onChange({ ...coupon, code: e.target.value.toUpperCase() })}
                placeholder="BEMVINDO10"
                className={inputCls + (lockedCode ? ' opacity-50 cursor-not-allowed' : '')}
              />
              {lockedCode && <p className="text-[10px] text-amber-600 mt-1">Cupom já usado — código fixo.</p>}
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={coupon.active !== false ? 'active' : 'inactive'}
                onChange={e => onChange({ ...coupon, active: e.target.value === 'active' })}
                className={inputCls}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição (interno + agente)</label>
            <input type="text" value={coupon.description || ''} onChange={e => onChange({ ...coupon, description: e.target.value })}
              placeholder="ex: Boas-vindas, 1ª compra" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={coupon.discount_type || 'percentage'}
                onChange={e => onChange({ ...coupon, discount_type: e.target.value as any })}
                className={inputCls}>
                <option value="percentage">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Valor *</label>
              <input type="number" step="0.01" min="0" value={coupon.discount_value as any ?? ''}
                onChange={e => onChange({ ...coupon, discount_value: Number(e.target.value) })}
                placeholder={coupon.discount_type === 'fixed' ? '10.00' : '10'}
                className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Pedido mínimo (R$)</label>
              <input type="number" step="0.01" min="0" value={coupon.min_subtotal as any ?? ''}
                onChange={e => onChange({ ...coupon, min_subtotal: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="opcional" className={inputCls} />
            </div>
            {coupon.discount_type === 'percentage' && (
              <div>
                <label className={labelCls}>Cap. máximo (R$)</label>
                <input type="number" step="0.01" min="0" value={coupon.max_discount_cap as any ?? ''}
                  onChange={e => onChange({ ...coupon, max_discount_cap: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="opcional" className={inputCls} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Vale a partir de</label>
              <input type="datetime-local" value={coupon.starts_at ? coupon.starts_at.slice(0, 16) : ''}
                onChange={e => onChange({ ...coupon, starts_at: e.target.value || null })}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Expira em</label>
              <input type="datetime-local" value={coupon.expires_at ? coupon.expires_at.slice(0, 16) : ''}
                onChange={e => onChange({ ...coupon, expires_at: e.target.value || null })}
                className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Limite total de usos</label>
              <input type="number" step="1" min="0" value={coupon.usage_limit_total as any ?? ''}
                onChange={e => onChange({ ...coupon, usage_limit_total: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="ilimitado" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Máx. por cliente</label>
              <input type="number" step="1" min="0" value={coupon.usage_limit_per_customer as any ?? ''}
                onChange={e => onChange({ ...coupon, usage_limit_per_customer: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="ilimitado" className={inputCls} />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-[12px] font-bold hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Salvando…' : (coupon.id ? 'Salvar' : 'Criar')}
          </button>
        </div>
      </div>
    </div>
  )
}
