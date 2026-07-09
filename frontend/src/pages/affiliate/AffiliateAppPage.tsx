import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Wallet, Megaphone, Banknote, User,
  LogOut, Loader2, Copy, QrCode, Share2, Trophy, MousePointerClick,
  TrendingUp, Clock, ChevronRight, ChevronLeft, GraduationCap, LayoutGrid, X, Phone, Package, MessageCircle, AlertCircle, Link2, Crown, Store, Bell, Home, Target,
} from 'lucide-react'
import { AffiliateOpportunitiesPanel } from '@/pages/affiliate/AffiliateOpportunitiesPanel'
import { AffiliateCustomersPanel } from '@/pages/affiliate/AffiliateCustomersPanel'
import { AffiliateProductsPanel } from '@/pages/affiliate/AffiliateProductsPanel'
import { AffiliatePromotionHub } from '@/pages/affiliate/AffiliatePromotionHub'
import { AffiliatePixSettings } from '@/pages/affiliate/AffiliatePixSettings'
import { AffiliateLinksHub } from '@/pages/affiliate/AffiliateLinksHub'
import { AffiliateMarketplace } from '@/pages/affiliate/AffiliateMarketplace'
import { AffiliateLearningPanel } from '@/pages/affiliate/AffiliateLearningPanel'
import { affiliateApi, clearAffiliateAuth, getAffiliateToken, getAffiliateBrandRef, getAffiliateHeaders } from '@/lib/api-affiliate'
import { NotificationBellButton, NotificationCenter } from '@/components/notifications/NotificationCenter'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import { buildAffiliateCatalogUrl } from '@/lib/affiliate-tracking'
import { WhatsAppConnectProvider } from '@/lib/whatsapp/WhatsAppConnectContext'
import { WhatsAppConnectModal } from '@/components/whatsapp/WhatsAppConnectModal'
import { AffiliateConnections } from '@/pages/affiliate/AffiliateConnections'
import { AffiliateMessages } from '@/pages/affiliate/AffiliateMessages'
import { AffiliateDistributionBanner } from '@/pages/affiliate/AffiliateDistributionBanner'

import { WhatsAppIcon } from '@/components/icons'
import { AffiliateCommissionCard } from '@/pages/affiliate/AffiliateCommissionCard'
import type { AppContext } from '@/pages/affiliate/types'
import { applyAffiliatePwaTitle, cacheAffiliateBrandMeta } from '@/lib/affiliate-brand-meta'
import { applyDocumentTitle } from '@/lib/document-title'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'
import { useAffiliateShell } from '@/lib/affiliate/AffiliateShellContext'

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dt = (v?: string) => {
  try {
    return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}

type TabId = 'resumo' | 'vendas' | 'financeiro' | 'divulgacao' | 'links' | 'contatos' | 'mercado' | 'alertas' | 'clientes' | 'aprendizado' | 'produtos' | 'perfil' | 'conexoes' | 'mensagens'
type FinanceiroMode = 'comissoes' | 'saques' | 'pagamentos'

const TAB_ROUTES: { key: TabId; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: 'resumo', path: '', icon: LayoutDashboard, label: 'Início' },
  { key: 'vendas', path: 'vendas', icon: ShoppingBag, label: 'Vendas' },
  { key: 'divulgacao', path: 'divulgacao', icon: Megaphone, label: 'Divulgar' },
  { key: 'financeiro', path: 'financeiro', icon: Wallet, label: 'Carteira' },
  { key: 'links', path: 'links', icon: Link2, label: 'Links' },
  { key: 'contatos', path: 'contatos', icon: Target, label: 'Contatos' },
  { key: 'mercado', path: 'mercado', icon: Store, label: 'Mercado' },
  { key: 'alertas', path: 'alertas', icon: Bell, label: 'Alertas' },
  { key: 'clientes', path: 'clientes', icon: Crown, label: 'Clientes' },
  { key: 'aprendizado', path: 'aprendizado', icon: GraduationCap, label: 'Aprender' },
  { key: 'produtos', path: 'produtos', icon: Package, label: 'Produtos' },
  { key: 'perfil', path: 'perfil', icon: User, label: 'Perfil' },
]

/** Início · Vendas · Divulgar · Carteira · Mais */
const BOTTOM_NAV: { key: TabId; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: 'resumo', path: '', icon: LayoutDashboard, label: 'Início' },
  { key: 'vendas', path: 'vendas', icon: ShoppingBag, label: 'Vendas' },
  { key: 'divulgacao', path: 'divulgacao', icon: Megaphone, label: 'Divulgar' },
  { key: 'financeiro', path: 'financeiro', icon: Wallet, label: 'Carteira' },
]

const MORE_MENU_TABS_BASE: TabId[] = ['links', 'contatos', 'mercado', 'clientes', 'aprendizado', 'produtos', 'perfil', 'conexoes', 'mensagens', 'alertas']

type MoreMenuItem =
  | { kind: 'tab'; tab: TabId; icon: typeof LayoutDashboard; label: string; desc: string }
  | { kind: 'financeiro'; mode: FinanceiroMode; icon: typeof LayoutDashboard; label: string; desc: string }

const MORE_MENU_BASE: MoreMenuItem[] = [
  { kind: 'tab', tab: 'contatos', icon: Target, label: 'Contatos', desc: 'Prospects e leads enviados pela marca e pelos seus links' },
  { kind: 'tab', tab: 'clientes', icon: Crown, label: 'Clientes', desc: 'Quem já comprou — faturamento, pós-venda e comissões' },
  { kind: 'tab', tab: 'links', icon: Link2, label: 'Links', desc: 'Compartilhar e rastrear cliques' },
  { kind: 'tab', tab: 'mercado', icon: Store, label: 'Mercado', desc: 'Outros programas e comissões' },
  { kind: 'tab', tab: 'aprendizado', icon: GraduationCap, label: 'Aprender', desc: 'Treinamento e regras do programa' },
  { kind: 'tab', tab: 'produtos', icon: Package, label: 'Produtos', desc: 'Catálogo com guia IA para vender' },
  { kind: 'tab', tab: 'alertas', icon: Bell, label: 'Alertas', desc: 'Notificações do programa' },
  { kind: 'tab', tab: 'conexoes', icon: Phone, label: 'WhatsApp', desc: 'Conectar seu número' },
  { kind: 'tab', tab: 'mensagens', icon: MessageCircle, label: 'Mensagens', desc: 'Inbox das suas sessões' },
  { kind: 'tab', tab: 'perfil', icon: User, label: 'Perfil', desc: 'Dados e redes sociais' },
  { kind: 'financeiro', mode: 'comissoes', icon: Banknote, label: 'Comissões', desc: 'Saldo e histórico' },
  { kind: 'financeiro', mode: 'saques', icon: Wallet, label: 'Saques', desc: 'Solicitar pagamento' },
  { kind: 'financeiro', mode: 'pagamentos', icon: QrCode, label: 'Pix', desc: 'Chave para receber comissões' },
]

function tabFromPath(pathname: string, base: string): TabId {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''
  if (!rest) return 'resumo'
  if (rest === 'conexoes') return 'conexoes'
  if (rest === 'mensagens') return 'mensagens'
  if (rest === 'links') return 'links'
  if (rest === 'alertas') return 'alertas'
  if (rest === 'leads' || rest === 'contatos' || rest === 'oportunidades') return 'contatos'
  if (rest === 'mercado') return 'mercado'
  if (rest === 'clientes') return 'clientes'
  if (rest === 'comissoes' || rest === 'saques' || rest === 'pagamentos' || rest === 'financeiro') return 'financeiro'
  const hit = TAB_ROUTES.find((n) => n.path === rest)
  return hit?.key || 'resumo'
}

function isMoreMenuActive(tab: TabId, hideMercado: boolean, hidePerfil: boolean) {
  if (hideMercado && tab === 'mercado') return false
  if (hidePerfil && tab === 'perfil') return false
  return MORE_MENU_TABS_BASE.includes(tab)
}

function financeiroModeFromPath(pathname: string, base: string): FinanceiroMode {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''
  if (rest === 'saques') return 'saques'
  if (rest === 'pagamentos') return 'pagamentos'
  return 'comissoes'
}

function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const show = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }, [])
  return { msg, show }
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-skel h-14 w-full" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="affiliate-skel h-20" />
        ))}
      </div>
      <div className="affiliate-skel h-36 w-full" />
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof LayoutDashboard; accent?: string }) {
  return (
    <div className="affiliate-card affiliate-kpi">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="affiliate-kpi__label">{label}</p>
          <p className="affiliate-kpi__value truncate">{value}</p>
        </div>
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ backgroundColor: `${accent || '#16a34a'}14` }}
        >
          <Icon size={17} strokeWidth={2.25} style={{ color: accent || '#16a34a' }} />
        </div>
      </div>
    </div>
  )
}

function AffiliateDashboard({
  ctx,
  onOpenLinks,
  onOpenLeads,
  onConnectWhatsApp,
  onViewOpportunities,
}: {
  ctx: AppContext
  onOpenLinks?: () => void
  onOpenLeads?: () => void
  onConnectWhatsApp?: () => void
  onViewOpportunities?: () => void
}) {
  const snap = affiliateAppCache.get()
  const [stats, setStats] = useState<any>(snap.dashboard)
  const [loading, setLoading] = useState(!snap.dashboard)

  useEffect(() => {
    let cancelled = false
    affiliateAppCache.prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (cancelled) return
        const d = affiliateAppCache.get().dashboard
        if (d) setStats(d)
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().dashboard) {
          ctx.showToast('Erro ao carregar resumo', 'err')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.region, ctx.showToast, ctx.cacheVersion])

  const affiliate = stats?.affiliate || ctx.affiliate
  const storeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || 'alhopronto').trim()
  const shortLink = affiliate?.code ? `${storeOrigin}/afiliado/${affiliate.code}` : ''
  const catalogLink = affiliate?.code
    ? buildAffiliateCatalogUrl({ origin: storeOrigin, storeSlug, code: affiliate.code, couponCode: affiliate.coupon_code })
    : ''

  async function copyText(value: string, label: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      ctx.showToast(`${label} copiado!`)
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function shareWhatsApp() {
    const shareLink = catalogLink || shortLink
    if (!shareLink) return
    const text = encodeURIComponent(`Confira a ${ctx.brand?.name || 'loja'} com meu cupom ${affiliate?.coupon_code || ''}: ${shareLink}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  if (loading && !stats) return <PanelSkeleton rows={4} />

  const commission = stats?.commission

  return (
    <div className="space-y-4 pb-2">
      <AffiliateDistributionBanner
        ctx={ctx}
        onConnectWhatsApp={onConnectWhatsApp}
        onViewOpportunities={onViewOpportunities}
      />

      {commission && (
        <AffiliateCommissionCard commission={commission} primary={ctx.primary} secondary={ctx.secondary} />
      )}

      <div className="affiliate-card px-4 py-3 flex items-center gap-2.5">
        <Trophy size={18} strokeWidth={2.25} style={{ color: ctx.primary }} />
        <p className="text-sm font-bold text-[#1c1c1e]">
          Ranking #{stats?.rank || '—'} na rede de parceiros
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Total vendido" value={money(stats?.total_sold)} icon={TrendingUp} accent={ctx.primary} />
        <KpiCard label="Comissão acumulada" value={money(stats?.commission_accumulated)} icon={Wallet} accent={ctx.secondary} />
        <KpiCard label="Disponível p/ saque" value={money(stats?.commission_available)} icon={Banknote} accent="#059669" />
        <KpiCard label="Cliques no link" value={String(stats?.clicks || 0)} icon={MousePointerClick} accent="#2563eb" />
        <KpiCard label="Conversões" value={String(stats?.conversions || 0)} icon={ShoppingBag} accent="#7c3aed" />
        <KpiCard label="Em andamento" value={String(stats?.orders_in_progress || 0)} icon={Clock} accent="#d97706" />
      </div>

      <div
        className="affiliate-link-card"
        style={{ background: `linear-gradient(145deg, ${ctx.primary}, ${ctx.secondary})` }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-3">Seu link e cupom</p>
        <div className="space-y-2.5">
          <div className="bg-black/15 rounded-xl p-3 backdrop-blur-sm">
            <p className="text-[10px] text-white/55 mb-1">Link do catálogo</p>
            <p className="text-[11px] font-mono break-all leading-relaxed">{catalogLink || '—'}</p>
          </div>
          <div className="flex items-center justify-between bg-black/15 rounded-xl p-3 backdrop-blur-sm">
            <div>
              <p className="text-[10px] text-white/55 mb-1">Cupom exclusivo</p>
              <p className="text-lg sm:text-xl font-extrabold tracking-wide break-all">{affiliate?.coupon_code || '—'}</p>
            </div>
            <QrCode size={30} className="text-white/35" />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => copyText(catalogLink, 'Link')}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/18 text-xs font-bold active:scale-[0.97] transition"
            >
              <Copy size={14} /> Copiar
            </button>
            <button
              type="button"
              onClick={shareWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white text-xs font-bold active:scale-[0.97] transition"
              style={{ color: ctx.primary }}
            >
              <Share2 size={14} /> WhatsApp
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {onOpenLeads && (
              <button
                type="button"
                onClick={onOpenLeads}
                className="flex-1 py-2.5 rounded-xl border border-white/25 text-[11px] font-bold text-white/90 active:scale-[0.98] transition"
              >
                Contatos →
              </button>
            )}
            {onOpenLinks && (
              <button
                type="button"
                onClick={onOpenLinks}
                className="flex-1 py-2.5 rounded-xl border border-white/25 text-[11px] font-bold text-white/90 active:scale-[0.98] transition"
              >
                Links e análise →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AffiliateSales({ ctx }: { ctx: AppContext }) {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [programId, setProgramId] = useState('')

  useEffect(() => {
    affiliateApi.programEnrollments()
      .then((r) => setEnrollments(r.enrollments || []))
      .catch(() => {})
  }, [ctx.cacheVersion])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    affiliateApi.sales(1, 50, programId || undefined)
      .then((r) => { if (!cancelled) setSales(r.sales || []) })
      .catch(() => { if (!cancelled) ctx.showToast('Erro ao carregar vendas', 'err') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [programId, ctx.showToast, ctx.cacheVersion])

  const statusLabel: Record<string, string> = {
    pending: 'Pendente', processing: 'Processando', delivered: 'Entregue', cancelled: 'Cancelado',
  }
  const commLabel: Record<string, string> = {
    pending: 'Pendente', approved: 'Aprovada', paid: 'Paga',
  }

  if (loading && !sales.length) return <PanelSkeleton rows={2} />

  return (
    <div className="space-y-2.5 pb-2">
      {enrollments.length > 1 && (
        <div className="affiliate-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Programa</p>
          <div className="affiliate-hub__channel-pills flex flex-wrap gap-1">
            <button
              type="button"
              className={`affiliate-hub__channel-pill${!programId ? ' affiliate-hub__channel-pill--on' : ''}`}
              onClick={() => setProgramId('')}
            >
              Todos
            </button>
            {enrollments.map((en) => (
              <button
                key={en.program_id}
                type="button"
                className={`affiliate-hub__channel-pill${programId === en.program_id ? ' affiliate-hub__channel-pill--on' : ''}`}
                style={programId === en.program_id ? { backgroundColor: `${ctx.primary}18`, color: ctx.primary } : undefined}
                onClick={() => setProgramId(en.program_id)}
              >
                {en.program_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!sales.length ? (
        <div className="text-center py-14 text-[#8e8e93]">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white grid place-items-center shadow-sm">
            <ShoppingBag size={26} className="opacity-35" />
          </div>
          <p className="text-sm font-semibold text-[#1c1c1e]">Nenhuma venda ainda</p>
          <p className="text-xs mt-1">Compartilhe seu link para começar</p>
        </div>
      ) : sales.map((s) => (
        <div key={s.id} className="affiliate-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm text-[#1c1c1e]">{s.customer_name || 'Cliente'}</p>
              <p className="text-xs text-[#8e8e93] mt-0.5">{dt(s.created_at)}</p>
            </div>
            <p className="font-extrabold text-sm" style={{ color: ctx.primary }}>{money(s.commission_amount)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#f2f2f7] text-[#636366]">
              {statusLabel[s.order_status] || s.order_status}
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              {commLabel[s.commission_status] || s.commission_status}
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700">
              {money(s.order_total)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AffiliateCommissions({
  ctx,
  mode,
  onOpenPix,
}: {
  ctx: AppContext
  mode: 'comissoes' | 'saques'
  onOpenPix?: () => void
}) {
  const snap = affiliateAppCache.get()
  const [data, setData] = useState<any>(snap.commissions)
  const [loading, setLoading] = useState(!snap.commissions)
  const [amount, setAmount] = useState('')
  const [pixKey, setPixKey] = useState(ctx.affiliate?.pix_key || snap.commissions?.pix_key || '')
  const [saving, setSaving] = useState(false)
  const hasPix = Boolean(pixKey.trim())

  useEffect(() => {
    let cancelled = false
    affiliateAppCache.prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (cancelled) return
        const d = affiliateAppCache.get().commissions
        if (d) setData(d)
        setPixKey((prev: string) => prev || ctx.affiliate?.pix_key || d?.pix_key || '')
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().commissions) {
          ctx.showToast('Erro ao carregar comissões', 'err')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.pix_key, ctx.affiliate?.region, ctx.showToast, ctx.cacheVersion])

  async function requestWithdraw() {
    const val = Number(amount)
    if (!val || val <= 0) return ctx.showToast('Informe um valor válido', 'err')
    if (!pixKey.trim()) {
      ctx.showToast('Cadastre sua chave Pix em Recebimento', 'err')
      onOpenPix?.()
      return
    }
    setSaving(true)
    try {
      await affiliateApi.requestPayout(val, pixKey.trim())
      ctx.showToast('Saque solicitado!')
      setAmount('')
      const refreshed = await affiliateApi.commissions()
      setData(refreshed)
      affiliateAppCache.setCommissions(refreshed)
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao solicitar saque', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) return <PanelSkeleton rows={3} />

  return (
    <div className="space-y-4 pb-2">
      {mode === 'comissoes' && ctx.commission && (
        <AffiliateCommissionCard commission={ctx.commission} primary={ctx.primary} secondary={ctx.secondary} compact />
      )}

      <div className="affiliate-stat-grid">
        {[
          { label: 'Pendente', value: money(data?.pending) },
          { label: 'Aprovado', value: money(data?.approved) },
          { label: 'Acumulado', value: money(data?.accumulated) },
        ].map((item) => (
          <div key={item.label} className="affiliate-card affiliate-stat p-3 text-center min-w-0">
            <p className="affiliate-stat__label">{item.label}</p>
            <p className="affiliate-stat__value truncate">{item.value}</p>
          </div>
        ))}
      </div>

      {mode === 'saques' && (
        <div className="affiliate-card p-4 space-y-3">
          <p className="text-sm font-bold text-[#1c1c1e]">Solicitar saque</p>

          {hasPix ? (
            <div className="affiliate-pay__saved-pill">
              <QrCode size={14} style={{ color: ctx.primary }} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider">Pix cadastrado</p>
                <p className="text-xs font-semibold text-[#1c1c1e] truncate">
                  {pixKey.length > 28 ? `${pixKey.slice(0, 10)}…${pixKey.slice(-6)}` : pixKey}
                </p>
              </div>
              <button type="button" className="affiliate-pay__saved-edit" onClick={onOpenPix}>
                Alterar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenPix}
              className="affiliate-pay__saved-missing w-full text-left"
            >
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-[#1c1c1e]">Cadastre sua chave Pix para receber saques</span>
              <ChevronRight size={14} className="text-[#c7c7cc] ml-auto" />
            </button>
          )}

          <input
            type="number"
            placeholder="Valor (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3.5 py-3 bg-[#f2f2f7] border-0 rounded-xl text-sm outline-none"
          />
          <button
            type="button"
            onClick={requestWithdraw}
            disabled={saving || !hasPix}
            className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition"
            style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary})` }}
          >
            {saving ? 'Enviando...' : 'Solicitar saque'}
          </button>
          <p className="text-[10px] text-[#8e8e93] text-center">
            Mínimo: {money(ctx.program?.min_withdrawal)} · Prazo: {ctx.program?.payment_days || 15} dias
          </p>
        </div>
      )}

      {(data?.payouts || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-[#8e8e93] uppercase tracking-wider px-0.5">Histórico</p>
          {data.payouts.map((p: any) => (
            <div key={p.id} className="affiliate-card p-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#1c1c1e]">{money(p.amount)}</p>
                <p className="text-xs text-[#8e8e93]">{dt(p.created_at)}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#f2f2f7] text-[#636366] uppercase">{p.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AffiliateProfile({ ctx, onOpenConnections }: { ctx: AppContext; onOpenConnections: () => void }) {
  const [form, setForm] = useState({
    display_name: ctx.affiliate?.display_name || '',
    phone: ctx.affiliate?.phone || '',
    document: ctx.affiliate?.document || '',
    region: ctx.affiliate?.region || '',
    social_instagram: ctx.affiliate?.social_instagram || '',
    social_whatsapp: ctx.affiliate?.social_whatsapp || '',
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await affiliateApi.updateProfile(form)
      ctx.showToast('Perfil atualizado!')
      void ctx.refresh()
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { key: 'display_name', label: 'Nome', placeholder: 'Seu nome' },
    { key: 'phone', label: 'Telefone', placeholder: '31999998888' },
    { key: 'document', label: 'CPF/CNPJ', placeholder: '000.000.000-00' },
    { key: 'region', label: 'Região', placeholder: 'BH, Contagem...' },
    { key: 'social_instagram', label: 'Instagram', placeholder: '@seu_perfil' },
    { key: 'social_whatsapp', label: 'WhatsApp', placeholder: '31999998888' },
  ] as const

  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-2xl grid place-items-center text-white font-bold text-xl shadow-md"
            style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary})` }}
          >
            {(form.display_name || 'A')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-[#1c1c1e]">{form.display_name || 'Afiliado'}</p>
            <p className="text-xs text-[#8e8e93]">{ctx.affiliate?.code} · {ctx.affiliate?.coupon_code}</p>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 mt-1 inline-block">
              {ctx.affiliate?.status === 'active' ? 'ATIVO' : String(ctx.affiliate?.status || '').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-[10px] font-bold text-[#8e8e93] uppercase tracking-wider mb-1 block">{f.label}</label>
              <input
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3.5 py-3 bg-[#f2f2f7] border-0 rounded-xl text-sm outline-none"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full mt-4 py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition"
          style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary})` }}
        >
          {saving ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      <div className="affiliate-card p-4">
        <p className="text-[11px] font-bold text-[#8e8e93] uppercase tracking-wider mb-3">Notificações push</p>
        <PushNotificationSettings />
      </div>

      <button
        type="button"
        onClick={onOpenConnections}
        className="affiliate-card w-full p-4 flex items-center justify-between active:scale-[0.99] transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 grid place-items-center">
            <WhatsAppIcon size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-[#1c1c1e]">Conexões WhatsApp</p>
            <p className="text-xs text-[#8e8e93]">Conecte seu número</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-[#c7c7cc]" />
      </button>

    </div>
  )
}

export function AffiliateAppPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ slug?: string }>()
  const shell = useAffiliateShell()
  const brandRef = params.slug || getAffiliateBrandRef() || ''
  const { msg, show: showToast } = useToast()
  const isPartnersProgram = shell.mode === 'partners'

  function affiliateLoginPath() {
    if (isPartnersProgram) return shell.loginPath
    return brandRef ? `/central-afiliado/${brandRef}` : '/central-afiliado'
  }

  const initialBoot = affiliateAppCache.get().boot
  const [boot, setBoot] = useState<any>(initialBoot)
  const [loading, setLoading] = useState(!initialBoot)
  const [connectionsReload, setConnectionsReload] = useState(0)
  const [cacheVersion, setCacheVersion] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const d = await affiliateApi.me()
      setBoot(d)
      affiliateAppCache.setBoot(d)
      await affiliateAppCache.prefetchAll({ force: true, region: d.affiliate?.region })
      setCacheVersion((v) => v + 1)
    } catch { /* mantém dados em cache */ }
  }, [])

  useEffect(() => {
    const token = getAffiliateToken()
    if (!token) {
      navigate(affiliateLoginPath(), { replace: true })
      return
    }
    const cachedBoot = affiliateAppCache.get().boot
    if (!cachedBoot) setLoading(true)

    affiliateApi.me()
      .then((d) => {
        setBoot(d)
        affiliateAppCache.setBoot(d)
        void affiliateAppCache.prefetchAll({ region: d.affiliate?.region })
      })
      .catch(() => {
        if (cachedBoot) return
        clearAffiliateAuth()
        navigate(affiliateLoginPath(), { replace: true })
      })
      .finally(() => setLoading(false))
  }, [navigate, brandRef, isPartnersProgram, shell.loginPath])

  const primary = boot?.brand?.primary_color || '#16a34a'
  const secondary = boot?.brand?.secondary_color || '#22c55e'

  const ctx = useMemo<AppContext | null>(() => {
    if (!boot) return null
    return {
      brand: boot.brand,
      affiliate: boot.affiliate,
      program: boot.program,
      commission: boot.commission || null,
      refresh,
      cacheVersion,
      primary,
      secondary,
      showToast,
    }
  }, [boot, refresh, cacheVersion, primary, secondary, showToast])

  const base = shell.basePath || `/central-afiliado/${brandRef}/painel`
  const activeTab = tabFromPath(location.pathname, base)

  useEffect(() => {
    const brandName = boot?.brand?.name?.trim()
    if (!brandName) return
    cacheAffiliateBrandMeta(brandName, boot?.brand?.logo_url)
    applyAffiliatePwaTitle(brandName)
    applyDocumentTitle(location.pathname, location.search, brandName)
  }, [boot?.brand?.name, boot?.brand?.logo_url, location.pathname, location.search])

  const financeiroMode = financeiroModeFromPath(location.pathname, base)

  function goFinanceiro(mode: FinanceiroMode) {
    const dest = mode === 'saques'
      ? `${base}/saques`
      : mode === 'pagamentos'
        ? `${base}/pagamentos`
        : `${base}/comissoes`
    if (location.pathname !== dest) navigate(dest, { replace: true })
  }

  function goTab(tab: TabId) {
    setMoreOpen(false)
    // Mercado de programas fica no perfil geral (LeadCapture Parceiros)
    if (isPartnersProgram && tab === 'mercado') {
      navigate('/parceiros/painel/mercado', { replace: true })
      return
    }
    if (tab === 'conexoes') {
      navigate(`${base}/conexoes`, { replace: true })
      return
    }
    if (tab === 'mensagens') {
      navigate(`${base}/mensagens`, { replace: true })
      return
    }
    if (tab === 'alertas') {
      navigate(`${base}/alertas`, { replace: true })
      return
    }
    if (tab === 'contatos') {
      navigate(`${base}/contatos`, { replace: true })
      return
    }
    if (tab === 'mercado') {
      navigate(`${base}/mercado`, { replace: true })
      return
    }
    if (tab === 'clientes') {
      navigate(`${base}/clientes`, { replace: true })
      return
    }
    if (tab === 'financeiro') {
      goFinanceiro(financeiroMode)
      return
    }
    const item = TAB_ROUTES.find((n) => n.key === tab)
    const dest = item?.path ? `${base}/${item.path}` : base
    if (location.pathname !== dest) navigate(dest, { replace: true })
  }

  function onMoreMenuPick(item: MoreMenuItem) {
    setMoreOpen(false)
    if (item.kind === 'tab') {
      goTab(item.tab)
      return
    }
    goFinanceiro(item.mode)
  }

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  function exitProgram() {
    affiliateAppCache.clear()
    clearAffiliateAuth()
    navigate(shell.exitPath || '/parceiros/painel', { replace: true })
  }

  function logout() {
    if (isPartnersProgram) {
      exitProgram()
      return
    }
    affiliateAppCache.clear()
    clearAffiliateAuth()
    navigate(`/central-afiliado/${brandRef}`, { replace: true })
  }

  const moreMenuItems = useMemo(() => {
    return MORE_MENU_BASE.filter((item) => {
      if (item.kind !== 'tab') return true
      // Dentro do programa: sem Mercado (perfil geral) e sem Perfil de usuário
      if (isPartnersProgram && (item.tab === 'mercado' || item.tab === 'perfil')) return false
      return true
    })
  }, [isPartnersProgram])

  const tabTitles: Record<TabId, string> = {
    resumo: 'Início',
    vendas: 'Vendas',
    financeiro: financeiroMode === 'saques' ? 'Saques' : financeiroMode === 'pagamentos' ? 'Recebimento Pix' : 'Comissões',
    divulgacao: 'Divulgação',
    links: 'Links',
    contatos: 'Contatos',
    mercado: 'Mercado',
    alertas: 'Alertas',
    clientes: 'Clientes',
    aprendizado: 'Aprender',
    produtos: 'Produtos',
    perfil: 'Perfil',
    conexoes: 'WhatsApp',
    mensagens: 'Mensagens',
  }

  if (loading && !boot) {
    return (
      <div className="affiliate-app grid place-items-center">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  if (!ctx) return null

  const appCtx = ctx

  function renderPanel(tab: TabId) {
    switch (tab) {
      case 'resumo':
        return (
          <AffiliateDashboard
            ctx={appCtx}
            onOpenLinks={() => goTab('links')}
            onOpenLeads={() => goTab('contatos')}
            onConnectWhatsApp={() => goTab('conexoes')}
            onViewOpportunities={() => goTab('contatos')}
          />
        )
      case 'vendas': return <AffiliateSales ctx={appCtx} />
      case 'financeiro':
        return (
          <div className="space-y-3 pb-2">
            <div className="affiliate-segment affiliate-segment--3" role="tablist" aria-label="Carteira">
              <button
                type="button"
                role="tab"
                aria-selected={financeiroMode === 'comissoes'}
                className={`affiliate-segment__btn${financeiroMode === 'comissoes' ? ' affiliate-segment__btn--active' : ''}`}
                onClick={() => goFinanceiro('comissoes')}
              >
                Comissões
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={financeiroMode === 'pagamentos'}
                className={`affiliate-segment__btn${financeiroMode === 'pagamentos' ? ' affiliate-segment__btn--active' : ''}`}
                onClick={() => goFinanceiro('pagamentos')}
              >
                Pix
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={financeiroMode === 'saques'}
                className={`affiliate-segment__btn${financeiroMode === 'saques' ? ' affiliate-segment__btn--active' : ''}`}
                onClick={() => goFinanceiro('saques')}
              >
                Saques
              </button>
            </div>
            {financeiroMode === 'pagamentos'
              ? <AffiliatePixSettings ctx={appCtx} />
              : <AffiliateCommissions ctx={appCtx} mode={financeiroMode} onOpenPix={() => goFinanceiro('pagamentos')} />}
          </div>
        )
      case 'divulgacao': return <AffiliatePromotionHub ctx={appCtx} />
      case 'links': return <AffiliateLinksHub ctx={appCtx} active={activeTab === 'links'} />
      case 'contatos':
        return <AffiliateOpportunitiesPanel ctx={appCtx} />
      case 'mercado':
        // Dentro do programa: mercado de outros programas fica no perfil geral
        if (isPartnersProgram) {
          return (
            <div className="affiliate-card p-6 text-center space-y-3">
              <Store size={28} className="mx-auto text-[#c7c7cc]" />
              <p className="text-sm font-semibold text-[#1c1c1e]">Mercado no perfil geral</p>
              <p className="text-xs text-[#8e8e93] leading-relaxed">
                Para explorar novos programas, volte ao início do LeadCapture Parceiros.
              </p>
              <button
                type="button"
                onClick={exitProgram}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl text-white"
                style={{ backgroundColor: appCtx.primary }}
              >
                <Home size={14} /> Voltar ao início
              </button>
            </div>
          )
        }
        return <AffiliateMarketplace ctx={appCtx} />
      case 'alertas':
        return (
          <div className="pb-2">
            <NotificationCenter
              getHeaders={getAffiliateHeaders}
              appContext="affiliate"
              onNavigate={(path) => goTab(tabFromPath(path, base))}
            />
          </div>
        )
      case 'clientes':
        return <AffiliateCustomersPanel ctx={appCtx} />
      case 'aprendizado': return <AffiliateLearningPanel ctx={appCtx} />
      case 'produtos': return <AffiliateProductsPanel ctx={appCtx} />
      case 'perfil':
        // Perfil global fica no app de parceiros; no programa mostra só conexões/dados operacionais
        if (isPartnersProgram) {
          return (
            <div className="space-y-3 pb-2">
              <div className="affiliate-card p-4">
                <p className="text-sm font-bold text-[#1c1c1e]">Dados do programa</p>
                <p className="text-xs text-[#8e8e93] mt-1 leading-relaxed">
                  Seu perfil global fica no início do LeadCapture Parceiros. Aqui você gerencia WhatsApp e preferências deste programa.
                </p>
                <button
                  type="button"
                  onClick={exitProgram}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: appCtx.primary }}
                >
                  <Home size={14} /> Ir ao perfil geral
                </button>
              </div>
              <AffiliateConnections ctx={appCtx} reloadToken={connectionsReload} />
            </div>
          )
        }
        return <AffiliateProfile ctx={appCtx} onOpenConnections={() => goTab('conexoes')} />
      case 'conexoes':
        return (
          <div className="pb-2">
            <button
              type="button"
              onClick={() => goTab(isPartnersProgram ? 'resumo' : 'perfil')}
              className="flex items-center gap-1 text-xs font-bold text-[#8e8e93] mb-3 active:opacity-70"
            >
              <ChevronLeft size={14} /> {isPartnersProgram ? 'Início' : 'Perfil'}
            </button>
            <AffiliateConnections ctx={appCtx} reloadToken={connectionsReload} />
          </div>
        )
      case 'mensagens':
        return <AffiliateMessages ctx={appCtx} />
      default: return null
    }
  }

  return (
    <WhatsAppConnectProvider>
      <div
        className="affiliate-app"
        style={{ '--affiliate-accent': primary } as React.CSSProperties}
      >
        <header
          className="affiliate-app__header"
          style={{ background: `linear-gradient(160deg, ${primary}, ${appCtx.secondary})` }}
        >
          <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
            <div className="flex items-center gap-2 min-w-0">
              {isPartnersProgram && (
                <button
                  type="button"
                  onClick={exitProgram}
                  className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center hover:bg-white/25 active:scale-95 transition shrink-0"
                  aria-label={shell.exitLabel || 'Voltar ao início'}
                  title={shell.exitLabel || 'Voltar ao início'}
                >
                  <Home size={17} />
                </button>
              )}
              <div className="flex items-center gap-3 min-w-0">
                {appCtx.brand?.logo_url ? (
                  <img src={appCtx.brand.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/25 shadow-sm shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/20 grid place-items-center font-bold text-sm shadow-inner shrink-0">
                    {(appCtx.brand?.name || 'A')[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">
                    {isPartnersProgram ? 'Programa · LeadCapture Parceiros' : 'Central do Afiliado'}
                  </p>
                  <p className="text-base font-extrabold truncate tracking-tight">
                    {isPartnersProgram ? (appCtx.brand?.name || tabTitles[activeTab]) : tabTitles[activeTab]}
                  </p>
                  {isPartnersProgram && (
                    <p className="text-[10px] text-white/75 truncate">{tabTitles[activeTab]}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isPartnersProgram && (
                <>
                  <NotificationBellButton
                    getHeaders={getAffiliateHeaders}
                    appContext="affiliate"
                    onNavigate={(path) => goTab(tabFromPath(path, base))}
                    className="bg-white/15 hover:bg-white/25 active:scale-95 transition text-white"
                  />
                  <button
                    type="button"
                    onClick={logout}
                    className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center hover:bg-white/25 active:scale-95 transition"
                    aria-label="Sair"
                  >
                    <LogOut size={17} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="affiliate-app__main">
          <div className="affiliate-panels">
            {(['resumo', 'vendas', 'financeiro', 'divulgacao', 'links', 'contatos', 'mercado', 'alertas', 'clientes', 'aprendizado', 'produtos', 'perfil', 'conexoes', 'mensagens'] as TabId[]).map((tab) => (
              <section
                key={tab}
                className={`affiliate-panel${activeTab === tab ? ' affiliate-panel--active' : ''}`}
                aria-hidden={activeTab !== tab}
              >
                {renderPanel(tab)}
              </section>
            ))}
          </div>
        </main>

        <nav className="affiliate-bottom-nav" aria-label="Menu principal">
          <div className="affiliate-bottom-nav__inner">
            {BOTTOM_NAV.map((item) => {
              const isActive = activeTab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTab(item.key)}
                  className={`affiliate-nav-item${isActive ? ' affiliate-nav-item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="affiliate-nav-item__icon">
                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && <span className="affiliate-nav-item__dot" />}
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`affiliate-nav-item${isMoreMenuActive(activeTab, isPartnersProgram, isPartnersProgram) || moreOpen ? ' affiliate-nav-item--active' : ''}`}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <span className="affiliate-nav-item__icon">
                <LayoutGrid size={20} strokeWidth={moreOpen || isMoreMenuActive(activeTab, isPartnersProgram, isPartnersProgram) ? 2.5 : 2} />
                {(moreOpen || isMoreMenuActive(activeTab, isPartnersProgram, isPartnersProgram)) && <span className="affiliate-nav-item__dot" />}
              </span>
              <span>Mais</span>
            </button>
          </div>
        </nav>

        {moreOpen && (
          <div className="affiliate-more" role="dialog" aria-label="Mais atalhos">
            <button type="button" className="affiliate-more__backdrop" aria-label="Fechar" onClick={() => setMoreOpen(false)} />
            <div className="affiliate-more__sheet">
              <div className="affiliate-more__handle" aria-hidden="true" />
              <div className="affiliate-more__head">
                <p className="affiliate-more__title">Atalhos</p>
                <button type="button" className="affiliate-more__close" onClick={() => setMoreOpen(false)} aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>
              <div className="affiliate-more__list">
                {moreMenuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = item.kind === 'tab'
                    ? activeTab === item.tab
                    : activeTab === 'financeiro' && financeiroMode === item.mode
                  return (
                    <button
                      key={item.kind === 'tab' ? item.tab : item.mode}
                      type="button"
                      className={`affiliate-more__item${isActive ? ' affiliate-more__item--active' : ''}`}
                      onClick={() => onMoreMenuPick(item)}
                    >
                      <span className="affiliate-more__item-icon" style={{ color: appCtx.primary }}>
                        <Icon size={18} strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="affiliate-more__item-label">{item.label}</span>
                        <span className="affiliate-more__item-desc">{item.desc}</span>
                      </span>
                      <ChevronRight size={16} className="text-[#c7c7cc] shrink-0" />
                    </button>
                  )
                })}
              </div>
              {isPartnersProgram ? (
                <button
                  type="button"
                  className="affiliate-more__logout"
                  onClick={() => { setMoreOpen(false); exitProgram() }}
                >
                  <Home size={16} /> Voltar ao início
                </button>
              ) : (
                <button
                  type="button"
                  className="affiliate-more__logout"
                  onClick={() => { setMoreOpen(false); logout() }}
                >
                  <LogOut size={16} /> Sair da conta
                </button>
              )}
            </div>
          </div>
        )}

        {msg && (
          <div className={`affiliate-toast ${msg.type === 'err' ? 'bg-red-600 text-white' : 'bg-[#1c1c1e] text-white'}`}>
            {msg.text}
          </div>
        )}

        <WhatsAppConnectModal
          onToast={showToast}
          onConnected={() => setConnectionsReload((n) => n + 1)}
        />
      </div>
    </WhatsAppConnectProvider>
  )
}