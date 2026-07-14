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
import { StockAccessManageModal } from '@/pages/admin/estoque/StockAccessManageModal'

export function EstoqueAccessView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [credentials, setCredentials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [brandSlug, setBrandSlug] = useState('')
  const [slugLoading, setSlugLoading] = useState(true)
  const [managing, setManaging] = useState<any>(null)

  async function loadCredentials(activeBrandId?: string) {
    setLoading(true)
    setLoadError('')
    const brandId = String(
      activeBrandId || localStorage.getItem('lead-system:active-brand-id') || ''
    ).trim()
    const headers = getHeaders()
    if (brandId && !headers['x-brand-id']) headers['x-brand-id'] = brandId
    const url = brandId
      ? `/api/auth/stock-access?brand_id=${encodeURIComponent(brandId)}`
      : '/api/auth/stock-access'
    try {
      const r = await fetch(url, { headers })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      setCredentials(d.credentials || [])
      return d.credentials || []
    } catch (e: any) {
      setLoadError(e.message || 'Erro ao carregar acessos')
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setSlugLoading(true)
      try {
        const brandsRes = await fetch('/api/brands', { headers: getHeaders() })
        const brandsData = await brandsRes.json().catch(() => ({}))
        const brands = brandsData.brands || []
        const activeId = String(
          brandsData.active_brand_id || localStorage.getItem('lead-system:active-brand-id') || ''
        ).trim()

        if (activeId) {
          try { localStorage.setItem('lead-system:active-brand-id', activeId) } catch { /* ignore */ }
        }

        const activeBrand = brands.find((x: any) => String(x.id) === activeId) || brands[0] || null

        let storeSlug = ''
        if (activeId) {
          const storeHeaders = getHeaders()
          if (!storeHeaders['x-brand-id']) storeHeaders['x-brand-id'] = activeId
          try {
            const storesRes = await fetch('/api/storefront/stores', { headers: storeHeaders })
            const storesData = await storesRes.json().catch(() => ({}))
            const stores = storesData.stores || []
            storeSlug = String(stores[0]?.slug || '').trim()
          } catch { /* ignore */ }
        }

        const creds = await loadCredentials(activeId)
        if (cancelled) return

        const slug = pickStockBrandSlug(activeBrand, storeSlug, creds[0]?.brand_slug)
        setBrandSlug(slug)
      } catch {
        if (!cancelled) setBrandSlug('')
      } finally {
        if (!cancelled) setSlugLoading(false)
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  async function createAccess() {
    if (!formEmail.trim() || !formPassword || formPassword.length < 6) {
      return showToast('Email e senha (min 6 chars) obrigatórios', 'err')
    }
    setSaving(true)
    try {
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/auth/stock-access', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ email: formEmail.trim(), password: formPassword, name: formName.trim() || 'Gerente de Estoque', phone: formPhone.trim() || null, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar acesso')
      showToast('Acesso ao estoque criado!')
      setShowForm(false); setFormName(''); setFormEmail(''); setFormPassword(''); setFormPhone('')
      loadCredentials()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const stockAppUrl = buildStockAppUrl(brandSlug)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Gestores de estoque</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">Crie, acompanhe e gerencie quem pode acessar o app de estoque.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ backgroundColor: 'var(--brand-secondary)' }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition shadow-md">
          <Plus size={14} /> Adicionar gestor
        </button>
      </div>

      {/* App link card */}
      <div className="bg-gray-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/60 text-[10px] font-semibold">Aplicativo conectado</p>
            <p className="text-sm font-semibold mt-1">Operação de estoque e expedição</p>
            <p className="text-xs text-white/40 mt-1.5 font-mono truncate">{window.location.origin}{stockAppUrl}</p>
          </div>
          {brandSlug ? (
            <a href={stockAppUrl} target="_blank" rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition shrink-0">
              Abrir app de estoque →
            </a>
          ) : (
            <span className="px-4 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-bold shrink-0">
              {slugLoading ? 'Carregando...' : 'Slug indisponível'}
            </span>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 space-y-4">
          <h3 className="font-bold text-sm text-gray-900">Criar Acesso ao Estoque</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Nome do gerente</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Telefone (opcional)</label>
              <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                placeholder="31999998888"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email de login *</label>
              <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                placeholder="gerente@empresa.com" required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Senha *</label>
              <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)}
                placeholder="Mín. 6 caracteres" required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
            <button onClick={createAccess} disabled={saving}
              style={{ backgroundColor: 'var(--brand-secondary)' }}
              className="px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition">
              {saving ? 'Criando...' : 'Criar Acesso'}
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          <p className="font-bold">Erro ao carregar acessos</p>
          <p className="text-xs mt-1">{loadError}</p>
          <button onClick={() => loadCredentials()} className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Credentials list */}
      {loading ? <Skeleton rows={3} /> : credentials.length === 0 && !loadError ? (
        <EmptyState icon={Users} text="Nenhum acesso de estoque configurado" />
      ) : credentials.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{credentials.length} acesso{credentials.length !== 1 ? 's' : ''} registrado{credentials.length !== 1 ? 's' : ''}</p>
          {credentials.map((c: any) => (
            <button key={c.id} type="button" onClick={() => setManaging(c)}
              className="w-full text-left bg-white rounded-2xl border border-border-light p-4 hover:shadow-md hover:border-brand transition-all active:scale-[0.99]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${c.is_active ? '' : 'bg-gray-100'}`}
                    style={c.is_active ? { backgroundColor: 'var(--brand-secondary-soft)' } : undefined}>
                    <Users size={18} style={c.is_active ? { color: 'var(--brand-secondary)' } : { color: '#9ca3af' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-gray-900 truncate">{c.manager_name || 'Gerente'}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${c.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600'}`}>
                        {c.is_active ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono truncate">{c.email}</p>
                    {c.manager_phone && <p className="text-[10px] text-gray-400">{c.manager_phone}</p>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {managing && (
        <StockAccessManageModal
          credential={managing}
          onClose={() => setManaging(null)}
          onChanged={() => { setManaging(null); loadCredentials() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}
