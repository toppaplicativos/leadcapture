import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Wallet, Megaphone, Banknote, User,
  LogOut, Loader2, Copy, QrCode, Share2, Trophy, MousePointerClick,
  TrendingUp, Clock, ChevronRight, ChevronLeft, GraduationCap, LayoutGrid, X, Phone, Package, MessageCircle, AlertCircle, Link2, Crown, Store, Bell, Home, Target, Radio, Image, Users, Sparkles, CheckCircle2, ArrowUpRight,
} from 'lucide-react'
import { AffiliateCustomersPanel } from '@/pages/affiliate/AffiliateCustomersPanel'
import { AffiliateProductsPanel } from '@/pages/affiliate/AffiliateProductsPanel'
import { AffiliatePromotionHub } from '@/pages/affiliate/AffiliatePromotionHub'
import { AffiliateMaterialsPanel } from '@/pages/affiliate/AffiliateMaterialsPanel'
import { AffiliatePixSettings } from '@/pages/affiliate/AffiliatePixSettings'
import { AffiliateLinksHub } from '@/pages/affiliate/AffiliateLinksHub'
import { AffiliateMarketplace } from '@/pages/affiliate/AffiliateMarketplace'
import { AffiliateLearningPanel } from '@/pages/affiliate/AffiliateLearningPanel'
import {
  affiliateApi,
  clearAffiliateAuth,
  getAffiliateToken,
  getAffiliateBrandRef,
  isHardAffiliateAuthFailure,
} from '@/lib/api-affiliate'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import { startAffiliateCrmSyncLoop } from '@/lib/affiliate-crm-local'
import { buildAffiliateCatalogUrl, buildAffiliateShortUrl } from '@/lib/affiliate-tracking'
import type { AffiliateSharePack } from '@/lib/affiliates/share-pack'
import {
  sharePackCopyUrl,
  sharePackOpenWhatsApp,
  sharePackViaSystem,
  sharePackWhatsAppText,
} from '@/lib/affiliates/share-pack'
import { WhatsAppConnectProvider } from '@/lib/whatsapp/WhatsAppConnectContext'
import { WhatsAppConnectModal } from '@/components/whatsapp/WhatsAppConnectModal'
import { AffiliateConnections } from '@/pages/affiliate/AffiliateConnections'
import { AffiliateMessages } from '@/pages/affiliate/AffiliateMessages'
import { AffiliateDistributionBanner } from '@/pages/affiliate/AffiliateDistributionBanner'
import { AffiliateWhatsAppHeaderIcon } from '@/pages/affiliate/AffiliateWhatsAppHeaderIcon'
import { AffiliateLiveDispatchPanel } from '@/pages/affiliate/AffiliateLiveDispatchPanel'
import { AffiliateOpportunitiesHub, type OppHubTab } from '@/pages/affiliate/AffiliateOpportunitiesHub'
import { AffiliateContactsPage } from '@/pages/affiliate/AffiliateContactsPage'
import { AffiliateOrdersHub } from '@/pages/affiliate/AffiliateOrdersHub'
import { AffiliateAttendanceHub } from '@/pages/affiliate/AffiliateAttendanceHub'

import { WhatsAppIcon } from '@/components/icons'
import { AffiliateCommissionCard } from '@/pages/affiliate/AffiliateCommissionCard'
import type { AppContext } from '@/pages/affiliate/types'
import { applyAffiliatePwaTitle, cacheAffiliateBrandMeta } from '@/lib/affiliate-brand-meta'
import { applyDocumentTitle } from '@/lib/document-title'
import { AffiliateProfilePanel } from '@/pages/affiliate/AffiliateProfilePanel'
import { AffiliateAlertsPanel } from '@/pages/affiliate/AffiliateAlertsPanel'
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

type TabId = 'resumo' | 'ao-vivo' | 'oportunidades' | 'atendimento' | 'vendas' | 'financeiro' | 'divulgacao' | 'materiais' | 'links' | 'contatos' | 'mercado' | 'alertas' | 'preferencias' | 'clientes' | 'aprendizado' | 'produtos' | 'perfil' | 'conexoes' | 'mensagens'
type FinanceiroMode = 'comissoes' | 'saques' | 'pagamentos'

const TAB_ROUTES: { key: TabId; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: 'resumo', path: '', icon: LayoutDashboard, label: 'Início' },
  { key: 'oportunidades', path: 'oportunidades', icon: Target, label: 'Oportunidades' },
  { key: 'atendimento', path: 'atendimento', icon: MessageCircle, label: 'Atendimento' },
  { key: 'ao-vivo', path: 'ao-vivo', icon: Radio, label: 'Automático' },
  { key: 'vendas', path: 'vendas', icon: ShoppingBag, label: 'Pedidos' },
  { key: 'divulgacao', path: 'divulgacao', icon: Megaphone, label: 'Divulgar' },
  { key: 'materiais', path: 'materiais', icon: Image, label: 'Materiais' },
  { key: 'financeiro', path: 'financeiro', icon: Wallet, label: 'Carteira' },
  { key: 'links', path: 'links', icon: Link2, label: 'Links' },
  { key: 'contatos', path: 'contatos', icon: Users, label: 'Contatos' },
  { key: 'mercado', path: 'mercado', icon: Store, label: 'Mercado' },
  { key: 'alertas', path: 'notificacoes', icon: Bell, label: 'Notificações' },
  { key: 'clientes', path: 'clientes', icon: Crown, label: 'Clientes' },
  { key: 'aprendizado', path: 'aprendizado', icon: GraduationCap, label: 'Aprender' },
  { key: 'produtos', path: 'produtos', icon: Package, label: 'Produtos' },
  { key: 'perfil', path: 'perfil', icon: User, label: 'Perfil' },
]

const TAB_PATHS: Partial<Record<TabId, string>> = {
  resumo: '',
  oportunidades: 'oportunidades',
  atendimento: 'atendimento',
  'ao-vivo': 'ao-vivo',
  vendas: 'vendas',
  divulgacao: 'divulgacao',
  materiais: 'materiais',
  links: 'links',
  contatos: 'contatos',
  mercado: 'mercado',
  alertas: 'notificacoes',
  clientes: 'clientes',
  aprendizado: 'aprendizado',
  produtos: 'produtos',
  perfil: 'perfil',
  conexoes: 'conexoes',
  mensagens: 'mensagens',
}

/** Início · Oportunidades · Pedidos · Carteira · Mais */
const BOTTOM_NAV: { key: TabId; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: 'resumo', path: '', icon: LayoutDashboard, label: 'Início' },
  { key: 'oportunidades', path: 'oportunidades', icon: Target, label: 'Oportunidades' },
  { key: 'vendas', path: 'vendas', icon: ShoppingBag, label: 'Pedidos' },
  { key: 'financeiro', path: 'financeiro', icon: Wallet, label: 'Carteira' },
]

const MORE_MENU_TABS_BASE: TabId[] = ['atendimento', 'ao-vivo', 'divulgacao', 'materiais', 'links', 'contatos', 'mercado', 'clientes', 'aprendizado', 'produtos', 'perfil', 'conexoes', 'mensagens', 'alertas']

type MoreMenuItem =
  | { kind: 'tab'; tab: TabId; icon: typeof LayoutDashboard; label: string; desc: string }
  | { kind: 'financeiro'; mode: FinanceiroMode; icon: typeof LayoutDashboard; label: string; desc: string }

const MORE_MENU_BASE: MoreMenuItem[] = [
  { kind: 'tab', tab: 'atendimento', icon: MessageCircle, label: 'Atendimento', desc: 'Copiloto IA, print da conversa e links para converter' },
  { kind: 'tab', tab: 'ao-vivo', icon: Radio, label: 'Automático', desc: 'Disparo da marca e status do WhatsApp conectado' },
  { kind: 'tab', tab: 'divulgacao', icon: Megaphone, label: 'Divulgar', desc: 'Kits, argumentos e canais para vender' },
  { kind: 'tab', tab: 'materiais', icon: Image, label: 'Materiais', desc: 'Galeria oficial de artes e mídias do programa' },
  { kind: 'tab', tab: 'contatos', icon: Users, label: 'Contatos', desc: 'Cadastro, relacionamento e histórico de cada pessoa' },
  { kind: 'tab', tab: 'clientes', icon: Crown, label: 'Clientes', desc: 'Quem já comprou — faturamento, pós-venda e comissões' },
  { kind: 'tab', tab: 'links', icon: Link2, label: 'Links', desc: 'Compartilhar e rastrear cliques' },
  { kind: 'tab', tab: 'mercado', icon: Store, label: 'Mercado', desc: 'Outros programas e comissões' },
  { kind: 'tab', tab: 'aprendizado', icon: GraduationCap, label: 'Aprender', desc: 'Treinamento e regras do programa' },
  { kind: 'tab', tab: 'produtos', icon: Package, label: 'Produtos', desc: 'Catálogo com guia IA para vender' },
  { kind: 'tab', tab: 'alertas', icon: Bell, label: 'Notificações', desc: 'Avisos e preferências em um só lugar' },
  { kind: 'tab', tab: 'conexoes', icon: Phone, label: 'WhatsApp', desc: 'Conectar seu número' },
  { kind: 'tab', tab: 'mensagens', icon: MessageCircle, label: 'Mensagens', desc: 'Inbox das suas sessões' },
  { kind: 'tab', tab: 'perfil', icon: User, label: 'Conta', desc: 'Foto, dados pessoais e segurança' },
  { kind: 'financeiro', mode: 'comissoes', icon: Banknote, label: 'Comissões', desc: 'Saldo e histórico' },
  { kind: 'financeiro', mode: 'saques', icon: Wallet, label: 'Saques', desc: 'Solicitar pagamento' },
  { kind: 'financeiro', mode: 'pagamentos', icon: QrCode, label: 'Pix', desc: 'Chave para receber comissões' },
]

function tabFromPath(pathname: string, base: string): TabId {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : ''
  if (!rest) return 'resumo'
  if (rest === 'ao-vivo') return 'ao-vivo'
  if (rest.startsWith('oportunidades')) return 'oportunidades'
  if (rest === 'atendimento' || rest === 'suporte' || rest === 'copiloto') return 'atendimento'
  if (rest === 'conexoes') return 'conexoes'
  if (rest === 'mensagens') return 'mensagens'
  if (rest === 'links') return 'links'
  if (rest === 'materiais' || rest === 'materials') return 'materiais'
  if (rest === 'alertas' || rest === 'notificacoes') return 'alertas'
  if (rest === 'preferencias' || rest === 'notificacoes-prefs' || rest === 'push') return 'alertas'
  if (rest === 'leads' || rest === 'contatos') return 'contatos'
  if (rest === 'mercado') return 'mercado'
  if (rest === 'clientes') return 'clientes'
  if (rest === 'comissoes' || rest === 'saques' || rest === 'pagamentos' || rest === 'financeiro') return 'financeiro'
  const hit = Object.entries(TAB_PATHS).find(([, path]) => path === rest)
  return (hit?.[0] as TabId | undefined) || 'resumo'
}

function oppHubTabFromSearch(search: string): OppHubTab {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const t = String(q.get('tab') || '').toLowerCase()
  if (t === 'tarefas' || t === 'tasks' || q.get('task')) return 'tarefas'
  if (t === 'historico' || t === 'history') return 'historico'
  return 'novas'
}

function oppHubFocusFromSearch(search: string): string | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const focus = String(q.get('focus') || q.get('ref') || q.get('ref_id') || '').trim()
  return focus || null
}

function oppHubTaskFromSearch(search: string): string | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const task = String(q.get('task') || q.get('task_id') || '').trim()
  return task || null
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

function AttendanceMetricsStrip({
  ctx,
  onOpenAttendance,
}: {
  ctx: AppContext
  onOpenAttendance?: () => void
}) {
  const [d, setD] = useState<{
    inbox: number
    followup_due: number
    claimed_today: number
    sent_today: number
    response_rate_today: number | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    affiliateApi.attendanceDigest()
      .then((r) => {
        if (!cancelled) {
          setD({
            inbox: Number(r.inbox || 0),
            followup_due: Number(r.followup_due || 0),
            claimed_today: Number(r.claimed_today || 0),
            sent_today: Number(r.sent_today || 0),
            response_rate_today: r.response_rate_today ?? null,
          })
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [ctx.cacheVersion])

  if (!d) return null

  return (
    <button
      type="button"
      onClick={onOpenAttendance}
      className="affiliate-card w-full p-3.5 text-left active:scale-[0.99] transition"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8e8e93]">Atendimento</p>
        <span className="text-[11px] font-semibold text-neutral-500">Abrir →</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Fila', value: d.inbox },
          { label: 'Follow-up', value: d.followup_due },
          { label: 'Hoje', value: d.claimed_today },
          { label: 'Envios', value: d.sent_today },
        ].map((k) => (
          <div key={k.label} className="text-center">
            <p className="text-[17px] font-bold tabular-nums text-[#1c1c1e] leading-none">{k.value}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[#8e8e93]">{k.label}</p>
          </div>
        ))}
      </div>
      {d.response_rate_today != null && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Taxa de resposta hoje: <strong className="text-neutral-800">{d.response_rate_today}%</strong>
        </p>
      )}
      {d.followup_due > 0 && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
          {d.followup_due} contato{d.followup_due > 1 ? 's' : ''} com follow-up pendente
        </p>
      )}
    </button>
  )
}

function AffiliateDashboard({
  ctx,
  onOpenLinks,
  onOpenLeads,
  onConnectWhatsApp,
  onViewOpportunities,
  onOpenAttendance,
}: {
  ctx: AppContext
  onOpenLinks?: () => void
  onOpenLeads?: () => void
  onConnectWhatsApp?: () => void
  onViewOpportunities?: () => void
  onOpenAttendance?: () => void
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
  const primaryDomain = String(ctx.brand?.primary_domain || '').trim() || null
  const shortLink = affiliate?.code
    ? buildAffiliateShortUrl({
        origin: storeOrigin,
        primaryDomain,
        code: affiliate.code,
      })
    : ''
  const catalogLink = affiliate?.code
    ? buildAffiliateCatalogUrl({
        origin: storeOrigin,
        primaryDomain,
        storeSlug,
        code: affiliate.code,
        couponCode: affiliate.coupon_code,
      })
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

      <AttendanceMetricsStrip
        ctx={ctx}
        onOpenAttendance={onOpenAttendance || onViewOpportunities}
      />

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
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => copyText(catalogLink, 'Link')}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-white/18 text-[10px] font-bold active:scale-[0.97] transition"
            >
              <Copy size={14} /> Copiar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!catalogLink) return
                if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                  try {
                    await navigator.share({
                      title: ctx.brand?.name || 'Catálogo',
                      text: `Confira a ${ctx.brand?.name || 'loja'}: ${catalogLink}`,
                      url: catalogLink,
                    })
                    return
                  } catch { /* fallback WA */ }
                }
                shareWhatsApp()
              }}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-white/18 text-[10px] font-bold active:scale-[0.97] transition"
            >
              <Share2 size={14} /> Compartilhar
            </button>
            <button
              type="button"
              onClick={shareWhatsApp}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-white text-[10px] font-bold active:scale-[0.97] transition"
              style={{ color: '#128C7E' }}
            >
              <WhatsAppIcon size={14} /> WhatsApp
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

function PremiumAffiliateDashboard({
  ctx,
  onOpenLinks,
  onOpenLeads,
  onConnectWhatsApp,
  onViewOpportunities,
  onOpenAttendance,
  onOpenWallet,
}: {
  ctx: AppContext
  onOpenLinks?: () => void
  onOpenLeads?: () => void
  onConnectWhatsApp?: () => void
  onViewOpportunities?: () => void
  onOpenAttendance?: () => void
  onOpenWallet?: () => void
}) {
  const snap = affiliateAppCache.get()
  const [stats, setStats] = useState<any>(snap.dashboard)
  const [loading, setLoading] = useState(!snap.dashboard)
  const [sharePack, setSharePack] = useState<AffiliateSharePack | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    affiliateAppCache.prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (!cancelled) setStats(affiliateAppCache.get().dashboard || null)
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().dashboard) ctx.showToast('Erro ao carregar resumo', 'err')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.region, ctx.showToast, ctx.cacheVersion])

  /* Pacote de compartilhamento (título + descrição + imagem + URL canônica) */
  useEffect(() => {
    let cancelled = false
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const storeSlug = String(ctx.brand?.slug || getAffiliateBrandRef() || '').trim()
    const code = String(ctx.affiliate?.code || '').trim()
    const coupon = String(ctx.affiliate?.coupon_code || '').trim()
    const primaryDomain = String(ctx.brand?.primary_domain || '').trim() || null
    const brandName = ctx.brand?.name || 'Loja'
    const localUrl = code
      ? buildAffiliateCatalogUrl({
          origin,
          primaryDomain,
          storeSlug,
          code,
          couponCode: coupon,
        })
      : ''
    if (localUrl) {
      setSharePack({
        kind: 'catalog',
        title: `${brandName}${coupon ? ` · cupom ${coupon}` : ''}`,
        description: coupon
          ? `Ofertas da ${brandName}. Use o cupom ${coupon} no checkout.`
          : `Catálogo e ofertas da ${brandName}.`,
        image_url: ctx.brand?.logo_url || null,
        url: localUrl,
        site_name: brandName,
        message: `Separei o catálogo da ${brandName} pra você 👇\n\n${localUrl}`,
        message_full: `Oi! Catálogo da *${brandName}*.\n${coupon ? `Cupom *${coupon}*\n` : ''}\n${localUrl}`,
        coupon_code: coupon || null,
        affiliate_code: code || null,
        brand: { name: brandName, logo_url: ctx.brand?.logo_url || null, primary_domain: primaryDomain },
      })
    }

    affiliateApi.sharePack({ kind: 'catalog' })
      .then((res) => {
        if (cancelled || !res?.pack?.url) return
        setSharePack(res.pack)
      })
      .catch(() => {
        /* fallback local já setado */
      })
    return () => { cancelled = true }
  }, [
    ctx.affiliate?.code,
    ctx.affiliate?.coupon_code,
    ctx.brand?.primary_domain,
    ctx.brand?.slug,
    ctx.brand?.name,
    ctx.brand?.logo_url,
    ctx.cacheVersion,
  ])

  if (loading && !stats) return <PanelSkeleton rows={3} />

  const affiliate = stats?.affiliate || ctx.affiliate
  const firstName = String(affiliate?.name || affiliate?.full_name || '').trim().split(/\s+/)[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const commission = stats?.commission
  const commissionLabel = commission?.label || (commission?.value != null
    ? `${commission.value}${commission.mode === 'percentage' ? '%' : ''}`
    : null)
  const brandName = ctx.brand?.name || 'loja'
  const catalogLink = sharePack?.url || ''

  async function copyCatalog() {
    if (!sharePack) return
    const ok = await sharePackCopyUrl(sharePack)
    ctx.showToast(ok ? 'Link do catálogo copiado!' : 'Não foi possível copiar', ok ? 'ok' : 'err')
  }

  function shareWhatsApp() {
    if (!sharePack) return
    sharePackOpenWhatsApp(sharePack, false)
  }

  async function shareCatalog() {
    if (!sharePack) return
    const result = await sharePackViaSystem(sharePack)
    if (result === 'shared' || result === 'aborted') return
    setShareOpen(true)
  }

  function openShareTarget(kind: 'whatsapp' | 'telegram' | 'facebook' | 'x' | 'email' | 'copy') {
    if (!sharePack) return
    const enc = encodeURIComponent
    const text = sharePackWhatsAppText(sharePack, false)
    if (kind === 'copy') {
      void copyCatalog()
      setShareOpen(false)
      return
    }
    if (kind === 'whatsapp') {
      sharePackOpenWhatsApp(sharePack, false)
    } else if (kind === 'telegram') {
      window.open(`https://t.me/share/url?url=${enc(sharePack.url)}&text=${enc(text)}`, '_blank', 'noopener,noreferrer')
    } else if (kind === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${enc(sharePack.url)}`, '_blank', 'noopener,noreferrer')
    } else if (kind === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(sharePack.url)}`, '_blank', 'noopener,noreferrer')
    } else if (kind === 'email') {
      window.location.href = `mailto:?subject=${enc(sharePack.title)}&body=${enc(text)}`
    }
    setShareOpen(false)
  }

  return (
    <div className="space-y-3.5 pb-2">
      <section className="px-0.5 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
              <Sparkles size={13} style={{ color: ctx.primary }} /> Seu painel de hoje
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-neutral-950">
              {greeting}{firstName ? `, ${firstName}` : ''}.
            </h2>
            <p className="mt-1 max-w-[30rem] text-xs leading-relaxed text-neutral-500">
              Veja o que pede atenção e continue fazendo sua carteira crescer.
            </p>
          </div>
          {stats?.rank ? (
            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Ranking</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-neutral-900">#{stats.rank}</p>
            </div>
          ) : null}
        </div>
      </section>

      <AttendanceMetricsStrip ctx={ctx} onOpenAttendance={onOpenAttendance || onViewOpportunities} />

      <section className="affiliate-card overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Faturamento gerado</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-neutral-950">{money(stats?.total_sold)}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">resultado das suas indicações</p>
          </div>
          <button type="button" onClick={onOpenWallet} className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-100 text-neutral-700" aria-label="Abrir carteira">
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="grid grid-cols-2 border-t border-neutral-100">
          <div className="p-3.5">
            <p className="text-[10px] text-neutral-500">Disponível para saque</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-neutral-900">{money(stats?.commission_available)}</p>
          </div>
          <div className="border-l border-neutral-100 p-3.5">
            <p className="text-[10px] text-neutral-500">Comissão acumulada</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-neutral-900">{money(stats?.commission_accumulated)}</p>
          </div>
        </div>
        {commissionLabel ? (
          <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50 px-3.5 py-2.5 text-[11px] text-neutral-600">
            <CheckCircle2 size={14} style={{ color: ctx.primary }} /> Regra do programa: <strong className="text-neutral-900">{commissionLabel}</strong>
          </div>
        ) : null}
      </section>

      <section className="affiliate-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-900">Compartilhe seu catálogo</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Preview visual no WhatsApp · cupom e rastreio no link
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${ctx.primary}12`, color: ctx.primary }}>
            <Link2 size={18} />
          </div>
        </div>

        {/* Card no estilo preview WhatsApp */}
        {sharePack && (
          <article className="affiliate-share-preview mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
            {sharePack.image_url ? (
              <div className="relative aspect-[1.91/1] w-full bg-neutral-200">
                <img
                  src={sharePack.image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : (
              <div
                className="flex aspect-[1.91/1] w-full items-center justify-center text-white"
                style={{ background: `linear-gradient(135deg, ${ctx.primary}, ${ctx.secondary})` }}
              >
                <span className="text-lg font-bold tracking-tight">{sharePack.site_name || brandName}</span>
              </div>
            )}
            <div className="space-y-0.5 border-t border-neutral-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {sharePack.site_name || brandName}
              </p>
              <p className="text-[13px] font-bold leading-snug text-neutral-900 line-clamp-2">
                {sharePack.title}
              </p>
              <p className="text-[11px] leading-relaxed text-neutral-500 line-clamp-2">
                {sharePack.description}
              </p>
            </div>
          </article>
        )}

        {catalogLink ? (
          <p className="mt-2 break-all rounded-lg bg-neutral-50 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-neutral-500">
            {catalogLink}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void copyCatalog()}
            disabled={!sharePack}
            className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl bg-neutral-900 px-1 text-[10px] font-bold text-white active:scale-[0.98] transition disabled:opacity-40"
          >
            <Copy size={15} />
            Copiar
          </button>
          <button
            type="button"
            onClick={() => void shareCatalog()}
            disabled={!sharePack}
            className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-neutral-200 bg-white px-1 text-[10px] font-bold text-neutral-800 active:scale-[0.98] transition disabled:opacity-40"
          >
            <Share2 size={15} />
            Compartilhar
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            disabled={!sharePack}
            className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-bold text-white active:scale-[0.98] transition disabled:opacity-40"
            style={{ backgroundColor: '#25D366' }}
            aria-label="Compartilhar no WhatsApp"
          >
            <WhatsAppIcon size={15} />
            WhatsApp
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2.5">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Seu cupom</p>
            <p className="mt-0.5 text-sm font-bold tracking-wide text-neutral-900">
              {sharePack?.coupon_code || affiliate?.coupon_code || '—'}
            </p>
          </div>
          <p className="text-right text-[10px] tabular-nums text-neutral-500">{Number(stats?.clicks || 0)} cliques<br />{Number(stats?.conversions || 0)} conversões</p>
        </div>
      </section>

      {shareOpen && sharePack && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Opções de compartilhamento"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-neutral-900">Compartilhar</p>
                <p className="mt-0.5 text-xs font-semibold text-neutral-800 line-clamp-1">{sharePack.title}</p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-neutral-500">{sharePack.url}</p>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600"
                onClick={() => setShareOpen(false)}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            {sharePack.image_url && (
              <img
                src={sharePack.image_url}
                alt=""
                className="mb-3 h-28 w-full rounded-xl object-cover"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'whatsapp' as const, label: 'WhatsApp' },
                { id: 'telegram' as const, label: 'Telegram' },
                { id: 'facebook' as const, label: 'Facebook' },
                { id: 'x' as const, label: 'X / Twitter' },
                { id: 'email' as const, label: 'E-mail' },
                { id: 'copy' as const, label: 'Copiar link' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="h-11 rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-800 active:bg-neutral-50"
                  onClick={() => openShareTarget(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="affiliate-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-neutral-900">Comece por aqui</p>
            <p className="mt-0.5 text-xs text-neutral-500">Três passos para gerar seus primeiros pedidos.</p>
          </div>
          <GraduationCap size={19} className="text-neutral-400" />
        </div>
        <div className="mt-3 space-y-1">
          {[
            { n: '1', label: 'Copie e compartilhe seu catálogo', action: copyCatalog },
            { n: '2', label: 'Veja novas oportunidades', action: onViewOpportunities },
            { n: '3', label: 'Acompanhe seus contatos', action: onOpenLeads },
          ].map((step) => (
            <button key={step.n} type="button" onClick={step.action} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-neutral-50 active:bg-neutral-100">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-700">{step.n}</span>
              <span className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">{step.label}</span>
              <ChevronRight size={15} className="text-neutral-400" />
            </button>
          ))}
        </div>
        {onOpenLinks ? (
          <button type="button" onClick={onOpenLinks} className="mt-2 h-11 w-full rounded-xl border border-neutral-200 text-xs font-semibold text-neutral-700">
            Ver desempenho dos links
          </button>
        ) : null}
      </section>
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
      .catch((err) => {
        // Mantém sessão se há cache ou se a API falhou por 5xx/rede (deploy).
        // Só desloga em 401 / token inválido.
        if (cachedBoot) return
        if (isHardAffiliateAuthFailure(err)) {
          clearAffiliateAuth()
          navigate(affiliateLoginPath(), { replace: true })
          return
        }
        // Sem cache e erro transitório: fica na tela de loading/retry, não apaga token
      })
      .finally(() => setLoading(false))
  }, [navigate, brandRef, isPartnersProgram, shell.loginPath])

  /* Sincroniza progresso offline do CRM (Meus contatos) quando a rede voltar */
  useEffect(() => startAffiliateCrmSyncLoop(), [])

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
      navigate(`${base}/notificacoes`, { replace: true })
      return
    }
    if (tab === 'preferencias') {
      navigate(`${base}/notificacoes`, { replace: true })
      return
    }
    if (tab === 'oportunidades') {
      navigate(`${base}/oportunidades`, { replace: true })
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
    const path = TAB_PATHS[tab]
    const dest = path ? `${base}/${path}` : base
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
    oportunidades: 'Oportunidades',
    atendimento: 'Atendimento',
    'ao-vivo': 'Automático',
    vendas: 'Pedidos',
    financeiro: financeiroMode === 'saques' ? 'Saques' : financeiroMode === 'pagamentos' ? 'Recebimento Pix' : 'Comissões',
    divulgacao: 'Divulgação',
    materiais: 'Materiais',
    links: 'Links',
    contatos: 'Contatos',
    mercado: 'Mercado',
    alertas: 'Notificações',
    preferencias: 'Preferências',
    clientes: 'Clientes',
    aprendizado: 'Aprender',
    produtos: 'Produtos',
    perfil: 'Conta',
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
          <PremiumAffiliateDashboard
            ctx={appCtx}
            onOpenLinks={() => goTab('links')}
            onOpenLeads={() => goTab('contatos')}
            onConnectWhatsApp={() => goTab('conexoes')}
            onViewOpportunities={() => goTab('oportunidades')}
            onOpenAttendance={() => goTab('atendimento')}
            onOpenWallet={() => goTab('financeiro')}
          />
        )
      case 'oportunidades':
        return (
          <AffiliateOpportunitiesHub
            ctx={appCtx}
            initialTab={oppHubTabFromSearch(location.search)}
            initialTaskId={oppHubTaskFromSearch(location.search)}
            onNavigate={(path) => {
              const clean = path.replace(/^\//, '').split('?')[0]
              if (clean === 'conexoes') return goTab('conexoes')
              if (clean === 'perfil') return goTab('perfil')
              if (clean === 'aprendizado') return goTab('aprendizado')
              if (clean === 'pagamentos') return goFinanceiro('pagamentos')
              if (clean === 'mercado') return goTab('mercado')
              if (clean === 'links') return goTab('links')
              if (clean === 'atendimento') return goTab('atendimento')
              if (clean === 'contatos') {
                setMoreOpen(false)
                const query = path.includes('?') ? `?${path.split('?').slice(1).join('?')}` : ''
                navigate(`${base}/contatos${query}`, { replace: true })
                return
              }
              if (clean === 'oportunidades') return goTab('oportunidades')
              goTab(tabFromPath(`/${clean}`, '/'))
            }}
          />
        )
      case 'atendimento':
        return (
          <AffiliateAttendanceHub
            ctx={appCtx}
            onNavigate={(tab) => goTab(tabFromPath(`/${tab}`, '/'))}
          />
        )
      case 'ao-vivo':
        return <AffiliateLiveDispatchPanel ctx={appCtx} onConnectWhatsApp={() => goTab('conexoes')} onNavigate={(path) => goTab(tabFromPath(path, base))} />
      case 'vendas': return <AffiliateOrdersHub ctx={appCtx} />
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
      case 'materiais': return <AffiliateMaterialsPanel ctx={appCtx} />
      case 'links': return <AffiliateLinksHub ctx={appCtx} active={activeTab === 'links'} />
      case 'contatos':
        return <AffiliateContactsPage ctx={appCtx} initialFocusRefId={oppHubFocusFromSearch(location.search)} onConnectWhatsApp={() => goTab('conexoes')} />
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
          <AffiliateAlertsPanel
            onNavigate={(path) => goTab(tabFromPath(path, base))}
          />
        )
      case 'clientes':
        return <AffiliateCustomersPanel ctx={appCtx} />
      case 'aprendizado': return <AffiliateLearningPanel ctx={appCtx} />
      case 'produtos': return <AffiliateProductsPanel ctx={appCtx} />
      case 'perfil':
        return (
          <div className="space-y-3 pb-2">
            {isPartnersProgram && (
              <div className="affiliate-card p-3.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Perfil neste programa</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Dados do afiliado nesta marca. Sua conta global de parceiros fica no início do LeadCapture Parceiros.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exitProgram}
                  className="shrink-0 text-xs font-semibold text-gray-700 underline-offset-2 hover:underline"
                >
                  Conta global
                </button>
              </div>
            )}
            <AffiliateProfilePanel ctx={appCtx} />
          </div>
        )
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
          style={{ '--affiliate-brand': primary } as React.CSSProperties}
        >
          <div className="affiliate-app__header-inner">
            <div className="affiliate-app__identity">
              {isPartnersProgram && (
                <button
                  type="button"
                  onClick={exitProgram}
                  className="affiliate-app__back"
                  aria-label={shell.exitLabel || 'Voltar ao início'}
                  title={shell.exitLabel || 'Voltar ao início'}
                >
                  <Home size={17} />
                </button>
              )}
              <div className="affiliate-app__brandmark">
                {appCtx.brand?.logo_url ? (
                  <img src={appCtx.brand.logo_url} alt="" />
                ) : (
                  <span>
                    {(appCtx.brand?.name || 'A')[0]}
                  </span>
                )}
              </div>
              <div className="affiliate-app__header-copy">
                <h1>{tabTitles[activeTab]}</h1>
                <p>{isPartnersProgram ? (appCtx.brand?.name || 'Programa de parceiros') : (appCtx.brand?.name || 'Central do afiliado')}</p>
              </div>
            </div>
            <div className="affiliate-app__header-actions">
              <AffiliateWhatsAppHeaderIcon
                cacheVersion={cacheVersion}
                onClick={() => goTab('conexoes')}
              />
              {!isPartnersProgram && (
                <>
                  <button
                    type="button"
                    onClick={() => goTab('alertas')}
                    className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center hover:bg-white/25 active:scale-95 transition text-white"
                    aria-label="Notificações"
                  >
                    <Bell size={17} />
                  </button>
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
            <section key={`${activeTab}-${financeiroMode}`} className="affiliate-panel affiliate-panel--active">
              {renderPanel(activeTab)}
            </section>
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
          onConnected={() => {
            setConnectionsReload((n) => n + 1)
            // Atualiza banner de distribuição / aptidão no Início
            setCacheVersion((v) => v + 1)
          }}
        />
      </div>
    </WhatsAppConnectProvider>
  )
}
