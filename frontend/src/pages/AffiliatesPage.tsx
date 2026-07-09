import { useState, useEffect, useCallback } from 'react'
import {
  Handshake, LayoutDashboard, Users, Wallet, Image, Settings, Plus, Layers,
  ExternalLink, Loader2, ToggleLeft, ToggleRight, ChevronRight, CheckCircle2,
  Clock, Ban, DollarSign, Copy, BookOpen, Package, Share2,
} from 'lucide-react'
import { AffiliateDistributionSection } from '@/pages/admin/affiliates/AffiliateDistributionSection'
import { AffiliateMaterialsSection } from '@/pages/admin/affiliates/AffiliateMaterialsSection'
import { AffiliateLearningSection } from '@/pages/admin/affiliates/AffiliateLearningSection'
import { AffiliateProductsSection } from '@/pages/admin/affiliates/AffiliateProductsSection'
import { AffiliateProgramsSection } from '@/pages/admin/affiliates/AffiliateProgramsSection'
import type { AffiliateLearningModule, AffiliateMaterial, AffiliateProductCatalogItem } from '@/lib/affiliates/types'
import { getHeaders, pickStockBrandSlug, buildAffiliateAppUrl } from '@/lib/admin/helpers'
import {
  COMMISSION_MODE_OPTIONS,
  commissionValueLabel,
  formatCommissionShort,
  normalizeCommissionMode,
  type CommissionMode,
} from '@/lib/affiliate-commission'
import { Skeleton, EmptyState } from '@/components/admin/primitives'
import { AffiliateAccessManageModal } from '@/pages/admin/affiliates/AffiliateAccessManageModal'
import { useAffiliatesBridgeOptional, type AffiliatesTabKey } from '@/lib/agent/AffiliatesBridgeContext'

const TABS = [
  { key: 'overview' as const, label: 'Visão geral', icon: LayoutDashboard },
  { key: 'distribution' as const, label: 'Distribuição', icon: Share2 },
  { key: 'programs' as const, label: 'Programas', icon: Layers },
  { key: 'partners' as const, label: 'Parceiros', icon: Users },
  { key: 'commissions' as const, label: 'Comissões', icon: DollarSign },
  { key: 'payouts' as const, label: 'Saques', icon: Wallet },
  { key: 'materials' as const, label: 'Materiais', icon: Image },
  { key: 'learning' as const, label: 'Aprendizado', icon: BookOpen },
  { key: 'products' as const, label: 'Produtos IA', icon: Package },
  { key: 'settings' as const, label: 'Configurações', icon: Settings },
]

type TabKey = AffiliatesTabKey

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Props = {
  showToast?: (t: string, tp?: 'ok' | 'err') => void
  embedded?: boolean
  initialTab?: TabKey
}

export function AffiliatesPage({ showToast = () => {}, embedded = false, initialTab = 'overview' }: Props) {
  const bridge = useAffiliatesBridgeOptional()
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [credentials, setCredentials] = useState<any[]>([])
  const [program, setProgram] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [materials, setMaterials] = useState<AffiliateMaterial[]>([])
  const [learningModules, setLearningModules] = useState<AffiliateLearningModule[]>([])
  const [catalogProducts, setCatalogProducts] = useState<AffiliateProductCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [brandSlug, setBrandSlug] = useState('')
  const [managing, setManaging] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)

  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formRegion, setFormRegion] = useState('')

  const [shareImageUploading, setShareImageUploading] = useState(false)

  const [settingsForm, setSettingsForm] = useState<{
    is_enabled: boolean
    accept_new_affiliates: boolean
    auto_approve_affiliates: boolean
    default_commission_pct: number
    default_commission_mode: CommissionMode
    default_commission_value: number
    commission_rules: string
    cookie_days: number
    min_withdrawal: number
    payment_days: number
    app_subdomain: string
    training_html: string
    terms_html: string
    share_title: string
    share_description: string
    share_image_url: string
    promotion_tone: string
  }>({
    is_enabled: true,
    accept_new_affiliates: true,
    auto_approve_affiliates: true,
    default_commission_pct: 10,
    default_commission_mode: 'percentage',
    default_commission_value: 10,
    commission_rules: '',
    cookie_days: 30,
    min_withdrawal: 50,
    payment_days: 15,
    app_subdomain: 'parceiros.alhopronto.online',
    training_html: '',
    terms_html: '',
    share_title: '',
    share_description: '',
    share_image_url: '',
    promotion_tone: '',
  })

  async function loadData(activeBrandId?: string) {
    setLoading(true)
    setLoadError('')
    const brandId = String(activeBrandId || localStorage.getItem('lead-system:active-brand-id') || '').trim()
    const headers = getHeaders()
    if (brandId && !headers['x-brand-id']) headers['x-brand-id'] = brandId
    if (!brandId) {
      setLoadError('Selecione uma marca')
      setLoading(false)
      return
    }

    try {
      const [progRes, credRes, statsRes, salesRes, payoutsRes, materialsRes, learningRes, productsRes] = await Promise.all([
        fetch(`/api/affiliates/program?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/auth/affiliate-access?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/stats?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/sales?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/payouts?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/materials?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/learning-modules?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/products?brand_id=${encodeURIComponent(brandId)}`, { headers }),
      ])
      const progData = await progRes.json()
      const credData = await credRes.json()
      const statsData = await statsRes.json()
      const salesData = await salesRes.json()
      const payoutsData = await payoutsRes.json()
      const materialsData = await materialsRes.json()
      const learningData = await learningRes.json()
      const productsData = await productsRes.json()

      if (!progRes.ok) throw new Error(progData.error || `Erro ${progRes.status}`)
      if (!credRes.ok) throw new Error(credData.error || `Erro ${credRes.status}`)

      setProgram(progData.program)
      setCredentials(credData.credentials || [])
      setStats(statsData.stats || null)
      setSales(salesData.sales || [])
      setPayouts(payoutsData.payouts || [])
      setMaterials(materialsData.materials || [])
      setLearningModules(learningData.modules || [])
      setCatalogProducts(productsData.products || [])

      if (progData.program) {
        setSettingsForm({
          is_enabled: !!progData.program.is_enabled,
          accept_new_affiliates: progData.program.accept_new_affiliates !== false,
          auto_approve_affiliates: progData.program.auto_approve_affiliates !== false,
          default_commission_pct: Number(progData.program.default_commission_pct || 10),
          default_commission_mode: normalizeCommissionMode(progData.program.default_commission_mode),
          default_commission_value: Number(progData.program.default_commission_value ?? progData.program.default_commission_pct ?? 10),
          commission_rules: progData.program.commission_rules || '',
          cookie_days: Number(progData.program.cookie_days || 30),
          min_withdrawal: Number(progData.program.min_withdrawal || 50),
          payment_days: Number(progData.program.payment_days || 15),
          app_subdomain: progData.program.app_subdomain || 'parceiros.alhopronto.online',
          training_html: progData.program.training_html || '',
          terms_html: progData.program.terms_html || '',
          share_title: progData.program.share_title || '',
          share_description: progData.program.share_description || '',
          share_image_url: progData.program.share_image_url || '',
          promotion_tone: progData.program.promotion_tone || '',
        })
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const brandsRes = await fetch('/api/brands', { headers: getHeaders() })
        const brandsData = await brandsRes.json().catch(() => ({}))
        const brands = brandsData.brands || []
        const activeId = String(brandsData.active_brand_id || localStorage.getItem('lead-system:active-brand-id') || '').trim()
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
            storeSlug = String((storesData.stores || [])[0]?.slug || '').trim()
          } catch { /* ignore */ }
        }
        await loadData(activeId)
        if (!cancelled) setBrandSlug(pickStockBrandSlug(activeBrand, storeSlug))
      } catch {
        if (!cancelled) setBrandSlug('')
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { setTab(initialTab) }, [initialTab])
  useEffect(() => {
    if (bridge?.snapshot.activeTab) setTab(bridge.snapshot.activeTab)
  }, [bridge?.snapshot.activeTab])

  const refresh = useCallback(() => {
    const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
    void loadData(brandId)
  }, [])

  async function createAffiliate() {
    if (!formEmail.trim() || !formPassword || formPassword.length < 6) {
      return showToast('Email e senha (min 6 chars) obrigatórios', 'err')
    }
    setSaving(true)
    try {
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/auth/affiliate-access', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: formEmail.trim(),
          password: formPassword,
          name: formName.trim() || 'Afiliado',
          phone: formPhone.trim() || null,
          code: formCode.trim() || null,
          region: formRegion.trim() || null,
          brand_id: brandId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar afiliado')
      showToast('Afiliado cadastrado!')
      setShowForm(false)
      setFormName(''); setFormEmail(''); setFormPassword(''); setFormPhone(''); setFormCode(''); setFormRegion('')
      refresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function uploadShareImage(file: File) {
    setShareImageUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: getHeaders().Authorization || '' },
        body: fd,
      })
      const d = await r.json()
      if (!r.ok || !d.file?.url) throw new Error(d.error || 'Falha no upload')
      setSettingsForm((f) => ({ ...f, share_image_url: d.file.url }))
      showToast('Capa de compartilhamento enviada!')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro no upload', 'err')
    }
    setShareImageUploading(false)
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/affiliates/program', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ ...settingsForm, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      showToast('Configurações salvas!')
      refresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function approveCommission(saleId: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/sales/${saleId}/approve`, { method: 'PATCH', headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Comissão aprovada!')
      refresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function approveAllPaid() {
    setSaving(true)
    try {
      const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
      const r = await fetch('/api/affiliates/sales/approve-paid', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(`${d.approved || 0} comissão(ões) aprovada(s)!`)
      refresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function updatePayout(id: string, status: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/payouts/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(status === 'paid' ? 'Saque marcado como pago!' : 'Saque atualizado!')
      refresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  const affiliateAppUrl = buildAffiliateAppUrl(brandSlug)
  const subdomainUrl = settingsForm.app_subdomain ? `https://${settingsForm.app_subdomain}` : affiliateAppUrl
  const pendingSales = sales.filter((s) => s.commission_status === 'pending')
  const pendingPayouts = payouts.filter((p) => p.status === 'requested')

  const rootClass = embedded ? 'affiliates-page affiliates-page--embedded' : 'affiliates-page'

  return (
    <div className={rootClass}>
      <header className="affiliates-page__header">
        <div className="affiliates-page__header-main">
          <div className="affiliates-page__icon" aria-hidden="true">
            <Handshake size={20} />
          </div>
          <div>
            <h1 className="affiliates-page__title">Programa de Afiliados</h1>
            <p className="affiliates-page__subtitle">
              Parceiros, comissões, saques e materiais — ajuste aqui ou pelo chat
            </p>
          </div>
        </div>
        <div className="affiliates-page__header-actions">
          <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => { setTab('settings'); setShowForm(false) }}>
            <Settings size={14} />
            Config
          </button>
          <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" onClick={() => { setTab('partners'); setShowForm(true) }}>
            <Plus size={14} />
            Novo parceiro
          </button>
        </div>
      </header>

      <nav className="affiliates-page__tabs" aria-label="Seções do programa">
        {TABS.map((t) => {
          const Icon = t.icon
          const badge = t.key === 'commissions' && pendingSales.length
            ? pendingSales.length
            : t.key === 'payouts' && pendingPayouts.length
              ? pendingPayouts.length
              : t.key === 'partners' && stats?.affiliates_pending
                ? stats.affiliates_pending
                : 0
          return (
            <button
              key={t.key}
              type="button"
              className={`affiliates-page__tab ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => { setTab(t.key); bridge?.publishSnapshot?.({ activeTab: t.key }) }}
            >
              <Icon size={14} />
              {t.label}
              {badge > 0 && <span className="affiliates-page__tab-badge">{badge}</span>}
            </button>
          )
        })}
      </nav>

      {loadError && !loading && (
        <div className="affiliates-page__error">{loadError}</div>
      )}

      {loading ? (
        <Skeleton rows={4} />
      ) : (
        <div className="affiliates-page__body">
          {tab === 'overview' && (
            <div className="affiliates-page__overview">
              <div className="affiliates-page__hero">
                <div className="affiliates-page__hero-content">
                  <p className="affiliates-page__hero-label">Central do parceiro</p>
                  <p className="affiliates-page__hero-desc">PWA para afiliados venderem com link e cupom exclusivos</p>
                  <p className="affiliates-page__hero-url">{subdomainUrl}</p>
                  <p className="affiliates-page__hero-url affiliates-page__hero-url--muted">{window.location.origin}{affiliateAppUrl}</p>
                </div>
                {brandSlug ? (
                  <a href={affiliateAppUrl} target="_blank" rel="noreferrer" className="affiliates-page__hero-link">
                    <ExternalLink size={12} /> Abrir PWA
                  </a>
                ) : null}
              </div>

              <div className="affiliates-page__kpi-grid">
                <div className="affiliates-page__kpi">
                  <span className="affiliates-page__kpi-label">Parceiros ativos</span>
                  <p className="affiliates-page__kpi-value tabular-nums">{stats?.affiliates_active ?? 0}</p>
                </div>
                <div className="affiliates-page__kpi">
                  <span className="affiliates-page__kpi-label">Cliques</span>
                  <p className="affiliates-page__kpi-value tabular-nums">{stats?.total_clicks ?? 0}</p>
                </div>
                <div className="affiliates-page__kpi">
                  <span className="affiliates-page__kpi-label">Vendas</span>
                  <p className="affiliates-page__kpi-value tabular-nums">{stats?.total_sales ?? 0}</p>
                </div>
                <div className="affiliates-page__kpi">
                  <span className="affiliates-page__kpi-label">Comissão pendente</span>
                  <p className="affiliates-page__kpi-value tabular-nums">{fmtMoney(stats?.commission_pending ?? 0)}</p>
                </div>
              </div>

              <div className="affiliates-page__status-row">
                {program?.is_enabled ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} className="text-gray-300" />}
                <span>{program?.is_enabled ? 'Programa ativo' : 'Programa desativado'}</span>
                <span className="affiliates-page__status-sep">·</span>
                <span>Comissão padrão {settingsForm.default_commission_pct}%</span>
                <span className="affiliates-page__status-sep">·</span>
                <span>Saque mín. {fmtMoney(settingsForm.min_withdrawal)}</span>
              </div>
            </div>
          )}

          {tab === 'partners' && (
            <div className="affiliates-page__section">
              {showForm && (
                <div className="affiliates-page__form-card">
                  <h3 className="affiliates-page__form-title">Cadastrar parceiro</h3>
                  <div className="affiliates-page__form-grid">
                    <label className="affiliates-page__field">
                      <span>Nome</span>
                      <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="João Silva" />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Código do link</span>
                      <input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="joao10" />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Email de login *</span>
                      <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="joao@email.com" />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Senha *</span>
                      <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Mín. 6 caracteres" />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Telefone</span>
                      <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
                    </label>
                    <label className="affiliates-page__field">
                      <span>Região</span>
                      <input value={formRegion} onChange={(e) => setFormRegion(e.target.value)} placeholder="BH, Contagem…" />
                    </label>
                  </div>
                  <div className="affiliates-page__form-actions">
                    <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                    <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" disabled={saving} onClick={createAffiliate}>
                      {saving ? 'Criando…' : 'Cadastrar'}
                    </button>
                  </div>
                </div>
              )}

              {credentials.length === 0 ? (
                <EmptyState icon={Handshake} text="Nenhum parceiro cadastrado" />
              ) : (
                <ul className="affiliates-page__partner-list">
                  {credentials.map((c: any) => (
                    <li key={c.id}>
                      <button type="button" className="affiliates-page__partner-card" onClick={() => setManaging(c)}>
                        <div className="affiliates-page__partner-main min-w-0">
                          <p className="affiliates-page__partner-name">{c.display_name || c.affiliate_name || 'Afiliado'}</p>
                          <p className="affiliates-page__partner-email">{c.email}</p>
                          {c.code && (
                            <p className="affiliates-page__partner-meta">
                              /afiliado/{c.code} · cupom <strong>{c.coupon_code}</strong>
                            </p>
                          )}
                        </div>
                        <div className="affiliates-page__partner-side">
                          <span className={`affiliates-page__status-badge is-${c.status === 'pending' ? 'pending' : c.is_active ? 'active' : 'inactive'}`}>
                            {c.status === 'pending' ? 'Pendente' : c.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                          <span className="affiliates-page__partner-stats">{c.total_clicks || 0} cliques · {c.total_sales || 0} vendas</span>
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'commissions' && (
            <div className="affiliates-page__section">
              <div className="affiliates-page__section-head">
                <div>
                  <h3 className="affiliates-page__section-title">Comissões por venda</h3>
                  <p className="affiliates-page__section-desc">Aprovadas automaticamente quando o pedido é pago</p>
                </div>
                {pendingSales.length > 0 && (
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" disabled={saving} onClick={approveAllPaid}>
                    Aprovar pagas ({pendingSales.length})
                  </button>
                )}
              </div>
              {sales.length === 0 ? (
                <EmptyState icon={DollarSign} text="Nenhuma venda atribuída ainda" />
              ) : (
                <ul className="affiliates-page__sales-list">
                  {sales.map((s) => (
                    <li key={s.id} className="affiliates-page__sales-row">
                      <div className="affiliates-page__row-main min-w-0">
                        <p className="affiliates-page__sales-name">{s.display_name} · {fmtMoney(s.commission_amount)}</p>
                        <p className="affiliates-page__sales-meta">
                          Pedido {s.order_id?.slice(0, 8)}… · {s.customer_name || 'Cliente'} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="affiliates-page__sales-actions">
                        <span className={`affiliates-page__status-badge is-${s.commission_status}`}>{s.commission_status}</span>
                        {s.commission_status === 'pending' && (
                          <button type="button" className="affiliates-page__btn affiliates-page__btn--sm" disabled={saving} onClick={() => approveCommission(s.id)}>
                            <CheckCircle2 size={12} /> Aprovar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'payouts' && (
            <div className="affiliates-page__section">
              <h3 className="affiliates-page__section-title">Solicitações de saque</h3>
              {payouts.length === 0 ? (
                <EmptyState icon={Wallet} text="Nenhum saque solicitado" />
              ) : (
                <ul className="affiliates-page__payout-list">
                  {payouts.map((p) => (
                    <li key={p.id} className="affiliates-page__payout-row">
                      <div className="affiliates-page__row-main min-w-0">
                        <p className="affiliates-page__payout-name">{p.display_name} · {fmtMoney(p.amount)}</p>
                        <p className="affiliates-page__payout-meta">PIX {p.pix_key || '—'} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="affiliates-page__payout-actions">
                        <span className={`affiliates-page__status-badge is-${p.status}`}>{p.status}</span>
                        {p.status === 'requested' && (
                          <>
                            <button type="button" className="affiliates-page__btn affiliates-page__btn--sm" disabled={saving} onClick={() => updatePayout(p.id, 'processing')}>
                              <Clock size={12} /> Processar
                            </button>
                            <button type="button" className="affiliates-page__btn affiliates-page__btn--sm affiliates-page__btn--primary" disabled={saving} onClick={() => updatePayout(p.id, 'paid')}>
                              <CheckCircle2 size={12} /> Pago
                            </button>
                          </>
                        )}
                        {p.status === 'processing' && (
                          <button type="button" className="affiliates-page__btn affiliates-page__btn--sm affiliates-page__btn--primary" disabled={saving} onClick={() => updatePayout(p.id, 'paid')}>
                            Marcar pago
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'distribution' && (
            <AffiliateDistributionSection showToast={showToast} saving={saving} setSaving={setSaving} />
          )}

          {tab === 'programs' && (
            <AffiliateProgramsSection showToast={showToast} saving={saving} setSaving={setSaving} />
          )}

          {tab === 'materials' && (
            <AffiliateMaterialsSection
              materials={materials}
              onRefresh={refresh}
              showToast={showToast}
              saving={saving}
              setSaving={setSaving}
            />
          )}

          {tab === 'learning' && (
            <AffiliateLearningSection
              modules={learningModules}
              onRefresh={refresh}
              showToast={showToast}
              saving={saving}
              setSaving={setSaving}
            />
          )}

          {tab === 'products' && (
            <AffiliateProductsSection
              products={catalogProducts}
              onRefresh={refresh}
              showToast={showToast}
              saving={saving}
              setSaving={setSaving}
            />
          )}

          {tab === 'settings' && (
            <div className="affiliates-page__section">
              <div className="affiliates-page__settings-grid">
                <label className="affiliates-page__check">
                  <input type="checkbox" checked={settingsForm.is_enabled} onChange={(e) => setSettingsForm((f) => ({ ...f, is_enabled: e.target.checked }))} />
                  Programa ativo
                </label>
                <label className="affiliates-page__check">
                  <input type="checkbox" checked={settingsForm.accept_new_affiliates} onChange={(e) => setSettingsForm((f) => ({ ...f, accept_new_affiliates: e.target.checked }))} />
                  Aceitar cadastro público
                </label>
                <label className="affiliates-page__check">
                  <input type="checkbox" checked={settingsForm.auto_approve_affiliates} onChange={(e) => setSettingsForm((f) => ({ ...f, auto_approve_affiliates: e.target.checked }))} />
                  Aprovar automaticamente
                </label>
                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Modo de comissão padrão</span>
                  <select
                    value={settingsForm.default_commission_mode}
                    onChange={(e) => {
                      const mode = normalizeCommissionMode(e.target.value)
                      setSettingsForm((f) => ({
                        ...f,
                        default_commission_mode: mode,
                        default_commission_value: mode === 'percentage' ? f.default_commission_pct : f.default_commission_value,
                      }))
                    }}
                  >
                    {COMMISSION_MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="affiliates-page__field-hint">
                    {COMMISSION_MODE_OPTIONS.find((o) => o.value === settingsForm.default_commission_mode)?.hint}
                  </p>
                </label>
                <label className="affiliates-page__field">
                  <span>{commissionValueLabel(settingsForm.default_commission_mode)}</span>
                  <input
                    type="number"
                    step={settingsForm.default_commission_mode === 'percentage' ? '0.1' : '0.01'}
                    min={0}
                    max={settingsForm.default_commission_mode === 'percentage' ? 100 : undefined}
                    value={settingsForm.default_commission_value}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setSettingsForm((f) => ({
                        ...f,
                        default_commission_value: val,
                        default_commission_pct: f.default_commission_mode === 'percentage' ? val : f.default_commission_pct,
                      }))
                    }}
                  />
                </label>
                <div className="affiliates-page__field affiliates-page__field--wide">
                  <span className="affiliates-page__preview-label">Prévia para o afiliado</span>
                  <p className="affiliates-page__commission-preview">
                    {formatCommissionShort(settingsForm.default_commission_mode, settingsForm.default_commission_value)}
                  </p>
                </div>
                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Regras de comissão</span>
                  <textarea
                    value={settingsForm.commission_rules}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, commission_rules: e.target.value }))}
                    rows={5}
                    placeholder={'Ex.:\n• Comissão paga após confirmação do pagamento\n• Produtos promocionais: comissão reduzida pela metade\n• Devoluções cancelam a comissão'}
                  />
                </label>
                <label className="affiliates-page__field">
                  <span>Saque mínimo (R$)</span>
                  <input type="number" value={settingsForm.min_withdrawal} onChange={(e) => setSettingsForm((f) => ({ ...f, min_withdrawal: Number(e.target.value) }))} />
                </label>
                <label className="affiliates-page__field">
                  <span>Prazo pagamento (dias)</span>
                  <input type="number" value={settingsForm.payment_days} onChange={(e) => setSettingsForm((f) => ({ ...f, payment_days: Number(e.target.value) }))} />
                </label>
                <label className="affiliates-page__field">
                  <span>Cookie rastreio (dias)</span>
                  <input type="number" value={settingsForm.cookie_days} onChange={(e) => setSettingsForm((f) => ({ ...f, cookie_days: Number(e.target.value) }))} />
                </label>
                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Subdomínio PWA</span>
                  <input value={settingsForm.app_subdomain} onChange={(e) => setSettingsForm((f) => ({ ...f, app_subdomain: e.target.value }))} />
                </label>

                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Tom de voz na divulgação (afiliados)</span>
                  <textarea
                    value={settingsForm.promotion_tone}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, promotion_tone: e.target.value }))}
                    rows={3}
                    placeholder="Ex.: amigável e direto, sem gírias, foco em qualidade e confiança. Use emojis com moderação."
                  />
                  <p className="affiliates-page__field-hint">
                    Orienta os kits prontos e a IA ao gerar legendas. Se vazio, usa o tom da marca (voice_json).
                  </p>
                </label>

                <div className="affiliates-page__field affiliates-page__field--wide">
                  <span>Preview ao compartilhar (WhatsApp / redes)</span>
                  <p className="affiliates-page__field-hint">
                    Capa, título e descrição exibidos quando você envia o link do programa para vendedores.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <label className="affiliates-page__share-upload shrink-0">
                      {settingsForm.share_image_url ? (
                        <img src={settingsForm.share_image_url} alt="" className="affiliates-page__share-preview" />
                      ) : (
                        <div className="affiliates-page__share-preview affiliates-page__share-preview--empty">
                          <Image size={22} className="opacity-35" />
                          <span className="text-xs text-gray-400 mt-1">1200×630 recomendado</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={shareImageUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadShareImage(file)
                          e.target.value = ''
                        }}
                      />
                      <span className="affiliates-page__share-upload-btn">
                        {shareImageUploading ? 'Enviando…' : settingsForm.share_image_url ? 'Trocar capa' : 'Enviar capa'}
                      </span>
                    </label>
                    <div className="flex-1 space-y-2 min-w-0">
                      <input
                        value={settingsForm.share_title}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, share_title: e.target.value }))}
                        placeholder="Título do link (ex: Seja parceiro e ganhe comissão)"
                        className="w-full"
                      />
                      <textarea
                        value={settingsForm.share_description}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, share_description: e.target.value }))}
                        rows={3}
                        placeholder="Descrição curta que aparece no preview do WhatsApp"
                      />
                      {settingsForm.share_image_url && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-500"
                          onClick={() => setSettingsForm((f) => ({ ...f, share_image_url: '' }))}
                        >
                          Remover capa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Treinamento (HTML)</span>
                  <textarea value={settingsForm.training_html} onChange={(e) => setSettingsForm((f) => ({ ...f, training_html: e.target.value }))} rows={4} />
                </label>
                <label className="affiliates-page__field affiliates-page__field--wide">
                  <span>Termos do programa (HTML)</span>
                  <textarea value={settingsForm.terms_html} onChange={(e) => setSettingsForm((f) => ({ ...f, terms_html: e.target.value }))} rows={4} placeholder="Regras, política de comissão, prazos…" />
                </label>
              </div>
              <div className="affiliates-page__form-actions">
                <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" disabled={saving} onClick={saveSettings}>
                  {saving ? 'Salvando…' : 'Salvar configurações'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {managing && (
        <AffiliateAccessManageModal
          credential={managing}
          brandSlug={brandSlug}
          onClose={() => setManaging(null)}
          onChanged={() => { setManaging(null); refresh() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}