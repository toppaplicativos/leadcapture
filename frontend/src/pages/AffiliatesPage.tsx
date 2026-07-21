import { useState, useEffect, useCallback } from 'react'
import {
  Handshake, LayoutDashboard, Users, Wallet, Image, Plus, Layers,
  ExternalLink, ToggleLeft, ToggleRight, ChevronRight, CheckCircle2,
  Clock, DollarSign, BookOpen, Package, Share2, Sparkles, BarChart3, Send, MessageCircle,
} from 'lucide-react'
import { AffiliateDistributionSection } from '@/pages/admin/affiliates/AffiliateDistributionSection'
import { AffiliateMaterialsSection } from '@/pages/admin/affiliates/AffiliateMaterialsSection'
import { AffiliateLearningSection } from '@/pages/admin/affiliates/AffiliateLearningSection'
import { AffiliateProductsSection } from '@/pages/admin/affiliates/AffiliateProductsSection'
import { AffiliateProgramsSection } from '@/pages/admin/affiliates/AffiliateProgramsSection'
import { AffiliateReadinessPanel } from '@/pages/admin/affiliates/AffiliateReadinessPanel'
import { AffiliateAiFillModal } from '@/pages/admin/affiliates/AffiliateAiFillModal'
import type { AffiliateLearningModule, AffiliateMaterial, AffiliateProductCatalogItem } from '@/lib/affiliates/types'
import { getHeaders, pickStockBrandSlug, buildAffiliateAppUrl } from '@/lib/admin/helpers'
import {
  formatCommissionShort,
  normalizeCommissionMode,
  type CommissionMode,
} from '@/lib/affiliate-commission'
import { Skeleton, EmptyState } from '@/components/admin/primitives'
import { AffiliateAccessManageModal } from '@/pages/admin/affiliates/AffiliateAccessManageModal'
import { useAffiliatesBridgeOptional, type AffiliatesTabKey } from '@/lib/agent/AffiliatesBridgeContext'

const TABS = [
  { key: 'overview' as const, label: 'Visão geral', icon: LayoutDashboard },
  { key: 'analytics' as const, label: 'Análises', icon: BarChart3 },
  { key: 'distribution' as const, label: 'Distribuição', icon: Share2 },
  { key: 'programs' as const, label: 'Programas', icon: Layers },
  { key: 'partners' as const, label: 'Afiliados', icon: Users },
  { key: 'commissions' as const, label: 'Comissões', icon: DollarSign },
  { key: 'payouts' as const, label: 'Saques', icon: Wallet },
  { key: 'materials' as const, label: 'Materiais', icon: Image },
  { key: 'learning' as const, label: 'Aprendizado', icon: BookOpen },
  { key: 'products' as const, label: 'Produtos IA', icon: Package },
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
  const [aiFillOpen, setAiFillOpen] = useState(false)

  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formRegion, setFormRegion] = useState('')

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
    app_subdomain: 'parceiros.leadcapture.online',
    training_html: '',
    terms_html: '',
    share_title: '',
    share_description: '',
    share_image_url: '',
    promotion_tone: '',
  })
  const [partnersUrls, setPartnersUrls] = useState<{
    public_url?: string
    path_url?: string
    custom_url?: string | null
    app_subdomain?: string | null
    marketplace_url?: string
    brand_slug?: string | null
  } | null>(null)

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
      setPartnersUrls(progData.partners || null)

      if (progData.program) {
        const slugHint = String(progData.partners?.brand_slug || brandSlug || '').toLowerCase()
        let sub = String(
          progData.program.app_subdomain
          || progData.partners?.app_subdomain
          || 'parceiros.leadcapture.online',
        ).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
        // Legado alho em marca alheia → raiz da plataforma
        if (/alhopronto/i.test(sub) && slugHint !== 'alhopronto') {
          sub = 'parceiros.leadcapture.online'
        }
        if (!sub) sub = 'parceiros.leadcapture.online'
        setSettingsForm({
          is_enabled: !!progData.program.is_enabled,
          accept_new_affiliates: progData.program.accept_new_affiliates !== false,
          auto_approve_affiliates: progData.program.auto_approve_affiliates !== false,
          default_commission_pct: Number(progData.program.default_commission_pct ?? 10),
          default_commission_mode: normalizeCommissionMode(progData.program.default_commission_mode),
          default_commission_value: Number(progData.program.default_commission_value ?? progData.program.default_commission_pct ?? 10),
          commission_rules: progData.program.commission_rules || '',
          cookie_days: Number(progData.program.cookie_days || 30),
          min_withdrawal: Number(progData.program.min_withdrawal || 50),
          payment_days: Number(progData.program.payment_days || 15),
          app_subdomain: sub,
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

  useEffect(() => {
    // Configurações migraram para dentro de cada programa
    setTab(initialTab === 'settings' ? 'programs' : initialTab)
  }, [initialTab])
  useEffect(() => {
    const active = bridge?.snapshot.activeTab
    if (!active) return
    setTab(active === 'settings' ? 'programs' : active)
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

  const PLATFORM_PARTNERS = 'https://parceiros.leadcapture.online'
  const affiliateAppPath = buildAffiliateAppUrl(brandSlug)
  const brandPathUrl = partnersUrls?.path_url
    || (typeof window !== 'undefined'
      ? `${window.location.origin}${affiliateAppPath}`
      : `https://app.leadcapture.online${affiliateAppPath}`)
  let host = String(settingsForm.app_subdomain || partnersUrls?.app_subdomain || 'parceiros.leadcapture.online')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  // Nunca mostrar host alho em outra org
  if (/alhopronto/i.test(host) && !/alhopronto/i.test(brandSlug)) {
    host = 'parceiros.leadcapture.online'
  }
  if (!host) host = 'parceiros.leadcapture.online'
  const partnersPublicUrl = partnersUrls?.public_url || `https://${host}`
  const marketplaceUrl = partnersUrls?.marketplace_url || PLATFORM_PARTNERS
  const showBrandPathFallback =
    brandSlug
    && partnersPublicUrl.replace(/\/+$/, '') !== brandPathUrl.replace(/\/+$/, '')
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
              Afiliados, comissões, saques e programas — materiais e configurações ficam em cada programa
            </p>
          </div>
        </div>
        <div className="affiliates-page__header-actions">
          <button
            type="button"
            className="affiliates-page__btn affiliates-page__btn--primary"
            onClick={() => setAiFillOpen(true)}
            title="Preencher programa completo com IA"
          >
            <Sparkles size={14} />
            Criar com IA
          </button>
          <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => { setTab('programs'); setShowForm(false) }}>
            <Layers size={14} />
            Programas
          </button>
          <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => { setTab('partners'); setShowForm(true) }}>
            <Plus size={14} />
            Novo afiliado
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
                  <p className="affiliates-page__hero-desc">
                    App para afiliados desta marca — link e cupom exclusivos
                  </p>
                  <p className="affiliates-page__hero-url">{partnersPublicUrl}</p>
                  {showBrandPathFallback ? (
                    <p className="affiliates-page__hero-url affiliates-page__hero-url--muted">
                      Acesso direto da marca: {brandPathUrl}
                    </p>
                  ) : null}
                  {marketplaceUrl !== partnersPublicUrl ? (
                    <p className="affiliates-page__hero-url affiliates-page__hero-url--muted">
                      Mercado de parceiros: {marketplaceUrl}
                    </p>
                  ) : null}
                </div>
                <a href={partnersPublicUrl} target="_blank" rel="noreferrer" className="affiliates-page__hero-link">
                  <ExternalLink size={12} /> Abrir PWA
                </a>
              </div>

              <div className="affiliates-page__kpi-grid">
                <div className="affiliates-page__kpi">
                  <span className="affiliates-page__kpi-label">Afiliados ativos</span>
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
                <span>
                  Comissão {formatCommissionShort(settingsForm.default_commission_mode, settingsForm.default_commission_value)}
                </span>
                <span className="affiliates-page__status-sep">·</span>
                <span>Saque mín. {fmtMoney(settingsForm.min_withdrawal)}</span>
              </div>

              <AffiliateReadinessPanel
                program={program}
                learningModules={learningModules}
                materials={materials}
                catalogProductsCount={catalogProducts.length}
                onGoTab={(t) => setTab(t as TabKey)}
              />
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border-light bg-white overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-border-light">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Desempenho operacional</p>
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-[18px] font-semibold text-gray-900">Atividade dos afiliados</h2>
                      <p className="mt-1 text-[12px] text-gray-500">Envios, retornos, follow-ups e conversões registrados no atendimento.</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-600">Hoje e últimos 7 dias</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border-light">
                  {[
                    { label: 'Contatos enviados', value: stats?.activity?.today?.contacts_sent ?? 0, Icon: Send },
                    { label: 'Retornos', value: stats?.activity?.today?.replies ?? 0, Icon: MessageCircle },
                    { label: 'Follow-ups', value: stats?.activity?.today?.followups ?? 0, Icon: Clock },
                    { label: 'Conversões', value: stats?.activity?.today?.conversions ?? 0, Icon: CheckCircle2 },
                  ].map((item) => (
                    <div key={item.label} className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{item.label}</span>
                        <item.Icon size={14} className="text-gray-400" />
                      </div>
                      <p className="mt-2 text-[24px] font-bold tabular-nums text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid sm:grid-cols-3 border-t border-border-light bg-gray-50">
                  <div className="p-3.5"><span className="text-[10px] text-gray-500">Taxa de retorno hoje</span><p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">{stats?.activity?.today?.response_rate ?? '—'}{stats?.activity?.today?.response_rate != null ? '%' : ''}</p></div>
                  <div className="p-3.5 sm:border-l border-border-light"><span className="text-[10px] text-gray-500">Contatos em 7 dias</span><p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">{stats?.activity?.last_7_days?.contacts_sent ?? 0}</p></div>
                  <div className="p-3.5 sm:border-l border-border-light"><span className="text-[10px] text-gray-500">Afiliados atuantes hoje</span><p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">{stats?.activity?.today?.active_affiliates ?? 0}</p></div>
                </div>
              </section>

              <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4">
                <section className="rounded-2xl border border-border-light bg-white overflow-hidden">
                  <div className="p-4 border-b border-border-light">
                    <h3 className="text-sm font-semibold text-gray-900">Resultado por afiliado</h3>
                    <p className="mt-0.5 text-[11px] text-gray-500">Últimos sete dias, ordenado por contatos trabalhados.</p>
                  </div>
                  {!stats?.activity?.by_affiliate?.length ? (
                    <div className="p-8 text-center text-xs text-gray-500">Nenhuma atividade registrada no período.</div>
                  ) : (
                    <div className="divide-y divide-border-light">
                      {stats.activity.by_affiliate.map((row: any) => (
                        <div key={row.affiliate_id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{row.display_name}</p><p className="mt-0.5 text-[10px] text-gray-500">{row.contacts_sent} contatos · {row.followups} follow-ups</p></div>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-700">{row.response_rate == null ? 'Sem taxa' : `${row.response_rate}% retorno`}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-gray-50 p-2"><strong className="block text-sm tabular-nums text-gray-900">{row.replies}</strong><span className="text-[9px] text-gray-500">Retornos</span></div>
                            <div className="rounded-xl bg-gray-50 p-2"><strong className="block text-sm tabular-nums text-gray-900">{row.conversions}</strong><span className="text-[9px] text-gray-500">Conversões</span></div>
                            <div className="rounded-xl bg-gray-50 p-2"><strong className="block text-sm tabular-nums text-gray-900">{row.actions}</strong><span className="text-[9px] text-gray-500">Ações</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-border-light bg-white overflow-hidden">
                  <div className="p-4 border-b border-border-light"><h3 className="text-sm font-semibold text-gray-900">Atividade recente</h3><p className="mt-0.5 text-[11px] text-gray-500">Últimas movimentações da rede.</p></div>
                  {!stats?.activity?.recent?.length ? (
                    <div className="p-8 text-center text-xs text-gray-500">Nenhuma movimentação recente.</div>
                  ) : (
                    <div className="divide-y divide-border-light max-h-[34rem] overflow-y-auto">
                      {stats.activity.recent.map((item: any) => {
                        const labels: Record<string, string> = { sent: 'enviou uma mensagem', followup: 'fez um follow-up', replied: 'registrou um retorno', negotiating: 'iniciou negociação', convert: 'converteu um contato', no_answer: 'registrou ausência de resposta', waiting: 'agendou um retorno', note: 'adicionou uma nota' }
                        return (
                          <div key={item.id} className="p-3.5">
                            <p className="text-[12px] leading-relaxed text-gray-700"><strong className="text-gray-900">{item.affiliate_name}</strong> {labels[item.action] || 'atualizou o atendimento'} de <strong className="text-gray-900">{item.contact_name}</strong>.</p>
                            <p className="mt-1 text-[10px] text-gray-400">{item.created_at ? new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Agora'}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === 'partners' && (
            <div className="affiliates-page__section">
              {showForm && (
                <div className="affiliates-page__form-card">
                  <h3 className="affiliates-page__form-title">Cadastrar afiliado</h3>
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
                <EmptyState icon={Handshake} text="Nenhum afiliado cadastrado" />
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
            <AffiliateProgramsSection
              showToast={showToast}
              saving={saving}
              setSaving={setSaving}
              materials={materials}
              onRefreshMaterials={refresh}
            />
          )}

          {tab === 'materials' && (
            <div className="affiliates-page__section">
              <div className="affiliates-page__section-head mb-3">
                <div>
                  <h3 className="affiliates-page__section-title">Materiais da marca</h3>
                  <p className="affiliates-page__section-desc">
                    Visão geral de todas as artes. Para materiais de um programa específico, abra{' '}
                    <button type="button" className="text-emerald-600 font-semibold underline-offset-2 hover:underline" onClick={() => setTab('programs')}>
                      Programas → Materiais
                    </button>
                    .
                  </p>
                </div>
              </div>
              <AffiliateMaterialsSection
                materials={materials}
                onRefresh={refresh}
                showToast={showToast}
                saving={saving}
                setSaving={setSaving}
              />
            </div>
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

        </div>
      )}

      {managing && (
        <AffiliateAccessManageModal
          credential={managing}
          brandSlug={brandSlug}
          sales={sales}
          payouts={payouts}
          ranking={[...credentials]
            .sort((a, b) => Number(b.total_sales || 0) - Number(a.total_sales || 0))
            .findIndex((item) => item.id === managing.id) + 1}
          onClose={() => setManaging(null)}
          onChanged={() => { setManaging(null); refresh() }}
          showToast={showToast}
        />
      )}

      <AffiliateAiFillModal
        open={aiFillOpen}
        onClose={() => setAiFillOpen(false)}
        onDone={() => refresh()}
        showToast={showToast}
        defaults={{
          commission_mode: settingsForm.default_commission_mode,
          commission_value: settingsForm.default_commission_value,
          payment_days: settingsForm.payment_days,
          min_withdrawal: settingsForm.min_withdrawal,
          opportunity_hint: settingsForm.share_description || settingsForm.commission_rules || '',
        }}
      />
    </div>
  )
}
