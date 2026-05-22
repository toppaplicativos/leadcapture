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
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'

/* ── Helpers ── */
const money = (v: number | string | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: number | string | undefined) => Number(v || 0).toLocaleString('pt-BR')
const dt = (v?: string) => { try { return new Date(v!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) } catch { return '' } }
const dtFull = (v?: string) => { try { return new Date(v!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function clearAdminAuth() {
  localStorage.removeItem('lead-system-token')
  localStorage.removeItem('lead-system:active-brand-id')
}

/* ── Toast ── */
let _tt: ReturnType<typeof setTimeout> | undefined
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const show = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    clearTimeout(_tt); setMsg({ text, type }); _tt = setTimeout(() => setMsg(null), 3500)
  }, [])
  return { msg, show }
}

/* ── Route → Section mapping ── */
const ROUTE_MAP: Record<string, string> = {
  '/admin': 'dashboard', '/dashboard': 'dashboard',
  '/leads': 'leads',
  '/clientes': 'clientes',
  '/busca': 'busca',
  '/mensagens': 'mensagens',
  '/notificacoes': 'notificacoes',
  '/campanhas': 'campanhas', '/campanha': 'campanhas',
  '/automacoes': 'automacoes',
  '/criativos': 'criativos', '/creative': 'criativos',
  '/produtos': 'produtos',
  '/pedidos': 'pedidos',
  '/estoque': 'estoque',
  '/cupons': 'cupons',
  '/avaliacoes': 'avaliacoes',
  '/design': 'design',
  '/whatsapp': 'whatsapp',
  '/instagram': 'instagram',
  '/facebook': 'facebook',
  '/pagamentos': 'pagamentos',
  '/frete': 'frete',
  '/dominio': 'dominio',
  '/agente': 'agente',
  '/configuracoes': 'configuracoes',
  '/provedores-ia': 'provedores-ia',
  '/emails': 'emails',
}

function resolveSection(pathname: string): string {
  return ROUTE_MAP[pathname] || 'dashboard'
}

/* ── Nav config ──
 *   `badge` (optional) renders a small pill next to the label — we use it
 *   to flag new features without redesigning the sidebar. */
const NAV_ITEMS: { key: string; path: string; icon: any; label: string; group: string; badge?: string }[] = [
  { key: 'dashboard', path: '/admin', icon: LayoutDashboard, label: 'Painel', group: 'main' },
  { key: 'leads', path: '/leads', icon: Users, label: 'Leads', group: 'main' },
  { key: 'clientes', path: '/clientes', icon: Users, label: 'Clientes', group: 'main' },
  { key: 'busca', path: '/busca', icon: Search, label: 'Busca', group: 'main' },
  { key: 'mensagens', path: '/mensagens', icon: MessageSquare, label: 'Mensagens', group: 'main' },
  { key: 'campanhas', path: '/campanhas', icon: Megaphone, label: 'Campanhas', group: 'main' },
  { key: 'automacoes', path: '/automacoes', icon: Zap, label: 'Automacoes', group: 'main' },
  { key: 'criativos', path: '/criativos', icon: Palette, label: 'Criativos IA', group: 'main', badge: 'Novo' },
  { key: 'agente', path: '/agente', icon: Bot, label: 'Agente IA', group: 'main' },
  { key: 'whatsapp', path: '/whatsapp', icon: Phone, label: 'WhatsApp', group: 'main' },
  { key: 'instagram', path: '/instagram', icon: Camera, label: 'Instagram', group: 'main', badge: 'Beta' },
  { key: 'facebook', path: '/facebook', icon: Globe, label: 'Facebook', group: 'main', badge: 'Beta' },
  { key: 'produtos', path: '/produtos', icon: Package, label: 'Produtos', group: 'loja' },
  { key: 'pedidos', path: '/pedidos', icon: ShoppingCart, label: 'Pedidos', group: 'loja' },
  { key: 'tirar-pedido', path: '/tirar-pedido', icon: Receipt, label: 'Tirar Pedido', group: 'loja' },
  { key: 'estoque', path: '/estoque', icon: BarChart3, label: 'Estoque', group: 'loja' },
  { key: 'cupons', path: '/cupons', icon: Ticket, label: 'Cupons', group: 'loja' },
  { key: 'avaliacoes', path: '/avaliacoes', icon: Star, label: 'Avaliações', group: 'loja' },
  { key: 'design', path: '/design', icon: Palette, label: 'Design', group: 'loja' },
  { key: 'pagamentos', path: '/pagamentos', icon: ShoppingCart, label: 'Pagamentos', group: 'loja' },
  { key: 'frete', path: '/frete', icon: Truck, label: 'Frete', group: 'loja' },
  { key: 'dominio', path: '/dominio', icon: Globe, label: 'Dominio', group: 'loja' },
  { key: 'emails', path: '/emails', icon: Mail, label: 'Emails', group: 'config' },
  { key: 'provedores-ia', path: '/provedores-ia', icon: Sparkles, label: 'Provedores IA', group: 'config' },
]

const MOBILE_NAV = ['dashboard', 'leads', 'busca', 'mensagens', 'campanhas']

/* ══════════════════════════════════════════════
   ADMIN SHELL — Wraps all admin pages
   ══════════════════════════════════════════════ */
export function AdminShell({ children }: { children?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { msg: toast, show: showToast } = useToast()
  const section = resolveSection(location.pathname)
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string }>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [brands, setBrands] = useState<any[]>([])
  const [activeBrandId, setActiveBrandId] = useState(localStorage.getItem('lead-system:active-brand-id') || '')
  const [showBrandPicker, setShowBrandPicker] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('lead-system-token')
    if (!token) {
      clearAdminAuth()
      navigate('/login', { replace: true })
      return
    }

    let mounted = true
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(async r => {
        if (!r.ok) {
          clearAdminAuth()
          if (mounted) navigate('/login', { replace: true })
          return
        }
        if (mounted) setAuthReady(true)
      })
      .catch(() => {
        if (mounted) setAuthReady(true)
      })

    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!authReady) return
    fetch('/api/brands', { headers: getHeaders() })
      .then(async r => {
        if (!r.ok) {
          if (r.status === 401) {
            clearAdminAuth()
            navigate('/login', { replace: true })
          }
          return {}
        }
        return r.json()
      }).then(d => {
        const list = d.brands || []
        const active = d.active_brand_id
        setBrands(list)
        setActiveBrandId(active || '')
        const b = list.find((x: any) => String(x.id) === String(active)) || list[0] || {}
        setBrand({ name: b.name, logo_url: b.logo_url })
        if (b.name) document.title = b.name + ' — Admin'
        // Set brand CSS vars for all admin pages + cache in localStorage for FOUC prevention
        const root = document.documentElement
        if (b.primary_color) root.style.setProperty('--brand-primary', b.primary_color)
        if (b.secondary_color) {
          root.style.setProperty('--brand-secondary', b.secondary_color)
          root.style.setProperty('--brand-secondary-soft', b.secondary_color + '1a')
          root.style.setProperty('--brand-secondary-light', b.secondary_color + '26')
        }
        try {
          localStorage.setItem('lead-system:brand-colors', JSON.stringify({
            primary: b.primary_color, secondary: b.secondary_color,
          }))
        } catch { /* ignore */ }
      }).catch(() => {})
  }, [authReady, refreshKey, navigate])

  async function switchBrand(brandId: string) {
    try {
      await fetch(`/api/brands/${brandId}/activate`, { method: 'POST', headers: getHeaders() })
      localStorage.setItem('lead-system:active-brand-id', brandId)
      setActiveBrandId(brandId)
      setShowBrandPicker(false)
      setRefreshKey(k => k + 1)
    } catch {}
  }

  function logout() {
    clearAdminAuth()
    navigate('/login', { replace: true })
  }

  function go(path: string) { navigate(path); setSidebarOpen(false) }

  const mobileItems = NAV_ITEMS.filter(n => MOBILE_NAV.includes(n.key))
  const mainNav = NAV_ITEMS.filter(n => n.group === 'main')
  const lojaNav = NAV_ITEMS.filter(n => n.group === 'loja')
  const configNav = NAV_ITEMS.filter(n => n.group === 'config')

  function NavButton({ item, active, onClick }: { item: typeof NAV_ITEMS[number]; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3 h-9 text-[13px] rounded-lg transition-colors ${
          active
            ? 'bg-gray-100 text-gray-900 font-semibold'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <item.icon
          size={16}
          strokeWidth={active ? 2 : 1.75}
          className={active ? 'text-gray-900' : 'text-gray-400'}
        />
        <span className="truncate flex-1 text-left">{item.label}</span>
        {item.badge && (
          <span
            aria-label={`${item.label} é uma novidade`}
            className="ml-auto inline-flex items-center px-1.5 h-[18px] rounded-full bg-violet-600 text-white text-[9px] font-bold tracking-wider uppercase shrink-0"
          >
            {item.badge}
          </span>
        )}
      </button>
    )
  }

  function NavSection({ label, items }: { label?: string; items: typeof NAV_ITEMS }) {
    if (items.length === 0) return null
    return (
      <div className="space-y-0.5">
        {label && (
          <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            {label}
          </p>
        )}
        {items.map(n => (
          <NavButton
            key={n.key}
            item={n}
            active={section === n.key}
            onClick={() => go(n.path)}
          />
        ))}
      </div>
    )
  }

  const sidebarContent = (
    <>
      {/* Brand picker */}
      <div className="shrink-0 px-3 pt-3">
        <button
          onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition"
        >
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gray-900 text-white grid place-items-center text-sm font-semibold shrink-0">
              {(brand.name || 'A').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <span className="block text-[13px] font-semibold text-gray-900 truncate">
              {brand.name || 'Admin'}
            </span>
            <span className="block text-[11px] text-gray-500 truncate">Painel</span>
          </div>
          {brands.length > 1 && (
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`text-gray-400 transition-transform shrink-0 ${
                showBrandPicker ? 'rotate-90' : ''
              }`}
            />
          )}
        </button>

        {showBrandPicker && brands.length > 1 && (
          <div className="mt-1 mb-1 p-1 rounded-xl bg-gray-50 space-y-0.5">
            <p className="px-2 pt-1 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Trocar conta
            </p>
            {brands.map((b: any) => {
              const isActive = String(b.id) === String(activeBrandId)
              return (
                <button
                  key={b.id}
                  onClick={() => switchBrand(b.id)}
                  className={`w-full flex items-center gap-2.5 px-2 h-9 rounded-lg text-[12px] transition ${
                    isActive
                      ? 'bg-white text-gray-900 font-semibold shadow-sm'
                      : 'text-gray-600 hover:bg-white/60'
                  }`}
                >
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-gray-200 text-gray-600 grid place-items-center shrink-0 text-[10px] font-semibold">
                      {(b.name || '?')[0]}
                    </div>
                  )}
                  <span className="truncate flex-1 text-left">{b.name}</span>
                  {isActive && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--brand-secondary, #111827)' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="my-2 mx-3 border-t border-border-light" />

      <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-1">
        <NavSection items={mainNav} />
        <NavSection label="Catálogo" items={lojaNav} />
        <NavSection label="Configurações" items={configNav} />
      </nav>

      <div className="shrink-0 p-3 border-t border-border-light">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
        >
          <LogOut size={15} strokeWidth={1.75} className="text-gray-400" />
          <span>Sair</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="h-screen bg-bg flex flex-col">
      {/* ── Mobile Topbar (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <header className="admin-shell-mobile-header sticky top-0 z-40 bg-white/85 backdrop-blur-xl text-gray-900 flex items-center justify-between px-3 lg:hidden border-b border-border-light shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="w-9 h-9 grid place-items-center rounded-full text-gray-700 hover:bg-gray-100 active:scale-90 transition"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-gray-900 text-white grid place-items-center text-xs font-semibold">
                {(brand.name || 'A').charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-[14px] font-semibold tracking-tight truncate max-w-[160px]">
              {brand.name || 'Admin'}
            </h1>
          </div>
          <button
            onClick={logout}
            aria-label="Sair"
            className="w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Mobile drawer overlay (z below drawer, above content) ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-[60] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── Sidebar (desktop fixed + mobile drawer above everything) ── */}
        <aside
          className={`fixed top-0 bottom-0 left-0 w-[280px] sm:w-[260px] bg-white border-r border-border-light flex flex-col transition-transform duration-200 lg:translate-x-0 lg:w-[240px] safe-area-top ${
            sidebarOpen ? 'translate-x-0 z-[70] shadow-2xl lg:shadow-none lg:z-30' : '-translate-x-full lg:translate-x-0 lg:z-30'
          }`}
        >
          {/* Mobile-only close button (floats on top right) */}
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-90 transition"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
          {sidebarContent}
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 lg:ml-[240px] overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 pt-5 pb-24 lg:pb-10 lg:px-8">
            <div key={activeBrandId}>
              {authReady ? children : (
                <div className="min-h-[55vh] grid place-items-center">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav (hidden when drawer is open) ── */}
      {!sidebarOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-border-light flex h-[60px] lg:hidden safe-area-bottom shrink-0">
          {mobileItems.map(n => {
            const active = section === n.key
            return (
              <button
                key={n.key}
                onClick={() => go(n.path)}
                aria-current={active ? 'page' : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] active:scale-[0.96] transition-transform"
              >
                <n.icon
                  size={20}
                  strokeWidth={active ? 2 : 1.5}
                  className={active ? 'text-gray-900' : 'text-gray-400'}
                />
                <span
                  className={`tracking-wide ${
                    active ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'
                  }`}
                >
                  {n.label}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[76px] lg:bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-full text-white text-[13px] font-medium shadow-lg pointer-events-auto ${
              toast.type === 'err' ? 'bg-red-600' : 'bg-gray-900'
            }`}
            role="status"
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Legacy export for backward compat ── */
export function AdminDashboard() {
  return <AdminShell><DashboardView showToast={() => {}} /></AdminShell>
}

/* ── Shared UI ── */
function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="h-12 bg-gray-100 rounded-xl skeleton" />
  ))}</div>
}

function KpiCard({ label, value, icon: Icon, color, bg, accent }: {
  label: string; value: string; icon?: any; color?: string; bg?: string; accent?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{label}</span>
        {Icon && <div className={`w-9 h-9 rounded-xl grid place-items-center ${bg || 'bg-gray-50'}`}>
          <Icon size={16} className={color || 'text-gray-400'} />
        </div>}
      </div>
      <p className={`text-[26px] font-extrabold tracking-tight leading-none ${accent || color || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
        <Icon size={24} className="text-muted-light" />
      </div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  )
}

/* ══════════════════════════════════════════════
   DASHBOARD VIEW
   ══════════════════════════════════════════════ */
export function DashboardView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      inventoryApi.overview().catch(() => ({})),
      adminApi.clients(1, 1).catch(() => ({ total: 0 })),
      adminApi.campaigns().catch(() => ({ campaigns: [] })),
      adminApi.orders(1, 1).catch(() => ({ total: 0 })),
    ]).then(([inv, clients, campaigns, orders]) => {
      setData({
        products: inv?.total_products || 0,
        totalStock: inv?.total_units || 0,
        outOfStock: inv?.out_of_stock || 0,
        totalLeads: clients?.total || clients?.customers?.length || 0,
        activeCampaigns: (campaigns?.campaigns || []).filter((c: any) => c.status === 'active' || c.status === 'running').length,
        totalCampaigns: (campaigns?.campaigns || []).length,
        totalOrders: orders?.total || orders?.orders?.length || 0,
      })
      setLoading(false)
    })
  }, [])

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Painel</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">Visão geral do seu negócio</p>
      </header>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {([
          { label: 'Leads', value: num(data?.totalLeads), Icon: Users },
          { label: 'Campanhas', value: num(data?.totalCampaigns), Icon: Megaphone },
          { label: 'Pedidos', value: num(data?.totalOrders), Icon: ShoppingCart },
          { label: 'Produtos', value: num(data?.products), Icon: Package },
        ] as { label: string; value: string; Icon: LucideIcon }[]).map(k => (
          <div key={k.label} className="bg-white border border-border-light rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{k.label}</span>
              <span className="w-8 h-8 rounded-xl bg-gray-100 grid place-items-center text-gray-500">
                <k.Icon size={15} strokeWidth={1.75} />
              </span>
            </div>
            <p className="text-[26px] font-bold tracking-tight tabular-nums text-gray-900 leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {/* KPIs secundários */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-gray-900 text-white rounded-2xl p-4">
          <BarChart3 size={16} strokeWidth={1.75} className="text-white/50" />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.totalStock)}</p>
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide mt-1.5">Unidades em estoque</p>
        </div>
        <div className="bg-emerald-600 text-white rounded-2xl p-4">
          <Send size={16} strokeWidth={1.75} className="text-white/60" />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.activeCampaigns)}</p>
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide mt-1.5">Campanhas ativas</p>
        </div>
        <div className={`rounded-2xl p-4 ${Number(data?.outOfStock) > 0 ? 'bg-red-600 text-white' : 'bg-white border border-border-light text-gray-900'}`}>
          <Zap size={16} strokeWidth={1.75} className={Number(data?.outOfStock) > 0 ? 'text-white/60' : 'text-gray-400'} />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.outOfStock)}</p>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mt-1.5 ${Number(data?.outOfStock) > 0 ? 'text-white/60' : 'text-gray-400'}`}>Sem estoque</p>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Acesso rápido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {([
            { Icon: Search, label: 'Buscar leads', path: '/busca' },
            { Icon: Megaphone, label: 'Campanhas', path: '/campanhas' },
            { Icon: ShoppingCart, label: 'Pedidos', path: '/pedidos' },
            { Icon: Receipt, label: 'Tirar pedido', path: '/tirar-pedido' },
            { Icon: Package, label: 'Estoque', path: '/estoque' },
          ] as { Icon: LucideIcon; label: string; path: string }[]).map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-border-light hover:border-gray-300 active:scale-[0.98] transition text-left"
            >
              <span className="w-9 h-9 rounded-xl bg-gray-100 grid place-items-center text-gray-700 shrink-0">
                <a.Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="text-[13px] font-medium text-gray-900 truncate">{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LEADS VIEW
   ══════════════════════════════════════════════ */
function LeadsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    adminApi.clients(page, 30, search).then(d => {
      setClients(d.clients || d.items || (Array.isArray(d) ? d : []))
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }, [page, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Leads / Clientes</h2>
        <span className="text-xs text-muted">{total} registros</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900" />
      </div>

      {loading ? <Skeleton rows={6} /> : clients.length === 0 ? (
        <EmptyState icon={Users} text="Nenhum lead encontrado" />
      ) : (
        <>
          {/* Table */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Nome</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase hidden sm:table-cell">Telefone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any, i: number) => (
                    <tr key={c.id || i} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{c.name || c.client_name || '—'}</p>
                        <p className="text-xs text-muted sm:hidden">{c.phone || c.whatsapp || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                        {c.phone || c.whatsapp || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell truncate max-w-[180px]">
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {dt(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {total > 30 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-muted px-3">Pagina {page}</span>
              <button disabled={clients.length < 30} onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   CLIENTES VIEW (real customers — orders + manual)
   ══════════════════════════════════════════════ */
export function ClientesView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<any>(null)

  function load(p = page, s = search) {
    setLoading(true)
    adminApi.realClients(p, 50, s).then(d => {
      setClients(d.clients || [])
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }

  useEffect(() => { load(page, search) }, [page, search])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Clientes</h2>
          <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">{total} cliente{total === 1 ? '' : 's'}</p>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome, telefone ou email"
          className="w-full h-10 pl-10 pr-4 rounded-full border-0 bg-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white transition" />
      </div>

      {loading ? <Skeleton rows={6} /> : clients.length === 0 ? (
        <EmptyState icon={Users} text="Nenhum cliente encontrado. Clientes aparecem automaticamente ao fazer pedidos." />
      ) : (
        <>
          <div className="bg-white border border-border-light rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Telefone</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Pedidos</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Total gasto</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Último pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any, i: number) => (
                    <tr key={i} onClick={() => setSelected(c)}
                      className="border-b border-border-light last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-900 grid place-items-center shrink-0 text-white text-xs font-semibold">
                            {(c.name || c.phone || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-gray-900 truncate">{c.name || '(sem nome)'}</p>
                            <p className="text-[11px] text-gray-500 truncate">{c.email || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-600 hidden sm:table-cell font-mono">{c.phone || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="inline-flex items-center text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full tabular-nums">
                          {c.order_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-gray-900 tabular-nums hidden md:table-cell">
                        {Number(c.total_spent || 0) > 0 ? money(c.total_spent) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-500 tabular-nums">{c.last_order_at ? dt(c.last_order_at) : 'Manual'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                aria-label="Página anterior"
                className="w-9 h-9 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span className="text-[13px] text-gray-600 tabular-nums px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                aria-label="Próxima página"
                className="w-9 h-9 grid place-items-center rounded-full bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-90 transition">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Client detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-end sm:items-center justify-center sm:p-4" onClick={() => setSelected(null)} role="dialog" aria-modal="true">
          <div
            className="bg-white w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl"
            style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sm:hidden pt-2 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pt-3 pb-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full bg-gray-900 grid place-items-center text-white font-semibold text-base">
                  {(selected.name || selected.phone || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[17px] font-bold tracking-tight text-gray-900 truncate">{selected.name || '(sem nome)'}</h3>
                  <p className="text-[11px] text-gray-500">{selected.source_type === 'manual' ? 'Cadastro manual' : 'Cliente por pedido'}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Fechar"
                  className="w-9 h-9 grid place-items-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
              <div className="space-y-2.5 text-sm">
                {selected.phone && <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5"><Phone size={14} strokeWidth={1.75} className="text-gray-400" /><span className="text-[13px] font-mono text-gray-800">{selected.phone}</span></div>}
                {selected.email && <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5"><Mail size={14} strokeWidth={1.75} className="text-gray-400" /><span className="text-[13px] text-gray-800 truncate">{selected.email}</span></div>}
                <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-border-light">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pedidos</p>
                    <p className="text-[20px] font-semibold text-gray-900 mt-1 tabular-nums">{selected.order_count || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total gasto</p>
                    <p className="text-[17px] font-bold text-gray-900 mt-1 tabular-nums">{money(selected.total_spent)}</p>
                  </div>
                </div>
                {selected.last_order_at && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 pt-1 tabular-nums">
                    <Clock size={12} strokeWidth={1.75} /> Último pedido: {dtFull(selected.last_order_at)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   CAMPAIGNS VIEW
   ══════════════════════════════════════════════ */
export function CampaignsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'active' | 'draft' | 'done'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [creatingRuler, setCreatingRuler] = useState(false)
  const { confirm } = useConfirm()

  function loadCampaigns() {
    setLoading(true)
    adminApi.campaigns().then(d => {
      setCampaigns(d.campaigns || d.items || (Array.isArray(d) ? d : []))
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }
  useEffect(() => { loadCampaigns() }, [])

  function openCreate() { setEditCampaign(null); setModalOpen(true) }
  function openEdit(c: any) { setEditCampaign(c); setModalOpen(true) }

  async function createFollowupRuler() {
    const ok = await confirm({
      title: 'Gerar regua completa de Follow-up?',
      message: (
        <div className="space-y-2.5">
          <p>A IA vai criar <b>8 campanhas</b> em sequencia (FU0 a FU7) ja adaptadas ao tom do agente, produto e prova social do brand ativo:</p>
          <ul className="text-[12px] text-gray-500 leading-relaxed pl-3 space-y-0.5">
            <li>· FU0 - Abertura (D+0)</li>
            <li>· FU1 - Check-in (D+2)</li>
            <li>· FU2 - Consciencia (D+5)</li>
            <li>· FU3 - Prova Social (D+8)</li>
            <li>· FU4 - Educacao (D+12)</li>
            <li>· FU5 - Caso Real (D+16)</li>
            <li>· FU6 - Valor Puro (D+20)</li>
            <li>· FU7 - Break-up (D+25)</li>
          </ul>
          <p className="text-[12px] text-gray-500">As campanhas sao criadas em <b>rascunho</b> para voce revisar e ativar manualmente. Pode levar alguns segundos.</p>
        </div>
      ),
      confirmLabel: 'Gerar regua',
      cancelLabel: 'Cancelar',
      variant: 'info',
    })
    if (!ok) return
    setCreatingRuler(true)
    try {
      // Fetch direto para capturar a `hint` do backend caso erre
      const token = localStorage.getItem('lead-system-token')
      const brandId = localStorage.getItem('lead-system:active-brand-id')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (brandId) headers['x-brand-id'] = brandId
      const res = await fetch('/api/campaigns-v2/followup-ruler', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = [data?.error, data?.hint].filter(Boolean).join(' — ') || `Erro ${res.status}`
        showToast(msg, 'err')
      } else if ((data?.created?.length || 0) > 0) {
        showToast(`Regua criada — ${data.created.length} campanhas em rascunho.`)
      } else if ((data?.skipped?.length || 0) > 0) {
        showToast('Regua ja existe para este brand.', 'err')
      } else {
        showToast(data?.message || 'Operacao concluida.')
      }
      loadCampaigns()
    } catch (e: any) {
      showToast(e.message || 'Falha ao gerar regua de follow-up', 'err')
    }
    setCreatingRuler(false)
  }

  async function doAction(id: string, action: 'start' | 'pause' | 'cancel' | 'delete') {
    setActionLoading(id)
    try {
      if (action === 'start') await adminApi.startCampaign(id)
      else if (action === 'pause') await adminApi.pauseCampaign(id)
      else if (action === 'cancel') await adminApi.cancelCampaign(id)
      else if (action === 'delete') await adminApi.deleteCampaign(id)
      showToast(action === 'delete' ? 'Campanha removida' : `Campanha ${action === 'start' ? 'iniciada' : action === 'pause' ? 'pausada' : 'cancelada'}!`)
      loadCampaigns()
    } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(null)
  }

  const filtered = tab === 'all' ? campaigns
    : tab === 'active' ? campaigns.filter(c => ['active', 'running', 'sending'].includes(c.status))
    : tab === 'draft' ? campaigns.filter(c => ['draft', 'paused'].includes(c.status))
    : campaigns.filter(c => ['completed', 'cancelled', 'finished'].includes(c.status))

  const statusBadge = (s?: string) => {
    const m: Record<string, { label: string; cls: string }> = {
      active: { label: 'Ativa', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
      running: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      sending: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
      paused: { label: 'Pausada', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
      completed: { label: 'Concluida', cls: 'bg-emerald-50 text-emerald-700' },
      finished: { label: 'Finalizada', cls: 'bg-gray-100 text-gray-500' },
      cancelled: { label: 'Cancelada', cls: 'bg-red-50 text-red-600' },
    }
    const cfg = m[(s || '').toLowerCase()] || { label: s || '?', cls: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Campanhas</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{campaigns.length} campanhas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={createFollowupRuler} disabled={creatingRuler}
            title="Cria 8 follow-ups (FU0..FU7) adaptados ao tom do agente, produto e prova social do brand"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-violet-200 text-violet-700 text-xs font-bold hover:bg-violet-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
            {creatingRuler ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {creatingRuler ? 'Gerando regua...' : 'Criar regua de Follow-up'}
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-md">
            <Plus size={14} /> Nova Campanha
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-fit">
        {([['all', 'Todas'], ['active', 'Ativas'], ['draft', 'Rascunhos'], ['done', 'Finalizadas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
              tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{l}</button>
        ))}
      </div>

      {/* List */}
      {loading ? <Skeleton rows={4} /> : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} text="Nenhuma campanha encontrada" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c: any) => {
            const pct = c.target_count > 0 ? Math.round(((c.sent_count || 0) / c.target_count) * 100) : 0
            const isRunning = ['active', 'running', 'sending'].includes(c.status)
            const canStart = ['draft', 'paused', 'scheduled'].includes(c.status)
            const isDone = ['completed', 'cancelled'].includes(c.status)
            const accentColor = isRunning ? 'bg-blue-500' : canStart ? 'bg-emerald-500' : isDone ? 'bg-gray-300' : 'bg-amber-400'
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all overflow-hidden flex flex-col">
                {/* Accent bar */}
                <div className={`h-1 w-full ${accentColor} ${isRunning ? 'animate-pulse' : ''}`} />

                <div className="p-3 flex-1 flex flex-col">
                  {/* Header row — title + badges + primary action */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-[13px] text-gray-900 truncate leading-tight">{c.name || 'Sem titulo'}</h4>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {statusBadge(c.status)}
                        {c.use_ai && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">IA</span>}
                        <span className="text-[9px] text-gray-400">· {dt(c.created_at)}</span>
                      </div>
                    </div>
                    {/* Primary action (compact) */}
                    <div className="shrink-0">
                      {canStart && (
                        <button onClick={() => doAction(c.id, 'start')} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white text-[10px] font-bold hover:from-emerald-600 hover:to-green-600 transition-all shadow-sm disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Iniciar
                        </button>
                      )}
                      {isRunning && (
                        <button onClick={() => doAction(c.id, 'pause')} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold hover:bg-amber-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Pause size={10} />} Pausar
                        </button>
                      )}
                      {isDone && (
                        <button onClick={async () => { setActionLoading(c.id); try { await adminApi.reexecuteCampaign(c.id); showToast('Campanha reaberta!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                          disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Reabrir
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact stats: 3 KPIs inline */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[12px] font-extrabold text-gray-900 leading-none">{num(c.target_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Leads</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[12px] font-extrabold text-violet-700 leading-none">{num(c.sent_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Enviados</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[12px] font-extrabold text-emerald-600 leading-none">{num(c.replied_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Resp.</p>
                    </div>
                  </div>

                  {/* Progress bar with percentage label */}
                  {c.target_count > 0 && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-semibold text-gray-500">{pct}% concluido</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isRunning ? 'bg-gradient-to-r from-blue-400 to-blue-600' : 'bg-gradient-to-r from-violet-400 to-purple-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Secondary actions (compact, footer-aligned) */}
                  <div className="flex items-center gap-1 pt-2 mt-auto border-t border-gray-100">
                    <button onClick={() => openEdit(c)} title="Configurar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-[10px] font-bold hover:bg-violet-100 transition">
                      <Settings size={10} /> Config
                    </button>
                    <button onClick={async () => { setActionLoading(c.id); try { await adminApi.duplicateCampaign(c.id); showToast('Campanha duplicada!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                      disabled={actionLoading === c.id} title="Duplicar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-600 text-[10px] font-semibold hover:bg-gray-100 transition">
                      Duplicar
                    </button>
                    {!isDone && (
                      <button onClick={() => doAction(c.id, 'cancel')} disabled={actionLoading === c.id} title="Cancelar"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition">
                        <Ban size={10} />
                      </button>
                    )}
                    <button onClick={async () => {
                      const ok = await confirm({
                        title: 'Excluir campanha?',
                        message: <span>A campanha <b>{c.name || 'sem titulo'}</b> sera excluida permanentemente.</span>,
                        confirmLabel: 'Excluir',
                        cancelLabel: 'Cancelar',
                        variant: 'danger',
                      })
                      if (ok) doAction(c.id, 'delete')
                    }}
                      disabled={actionLoading === c.id} title="Excluir"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition ml-auto">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Campaign Editor Modal ── */}
      {modalOpen && (
        <CampaignEditorModal
          campaign={editCampaign}
          onClose={() => { setModalOpen(false); setEditCampaign(null) }}
          onSaved={() => { setModalOpen(false); setEditCampaign(null); loadCampaigns() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ── Campaign Editor Modal (7 tabs — COMPLETE config) ── */
function CampaignEditorModal({ campaign, onClose, onSaved, showToast }: {
  campaign: any; onClose: () => void; onSaved: () => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!campaign?.id
  const [activeTab, setActiveTab] = useState('geral')
  const [saving, setSaving] = useState(false)
  const [instances, setInstances] = useState<any[]>([])

  const s = campaign?.settings || {}
  const core = s.campaignCore || {}
  const dest = s.destination || {}
  const sched = s.scheduler || {}
  const aw = s.actionWindow || {}
  const fa = s.finalActions || {}
  const trig = s.triggers || {}
  const comp = s.composer || {}
  const ab = s.antiBlock || {}
  const filter = campaign?.filter_json || {}
  const speed = campaign?.speed_json || {}

  // Tab 1: Geral
  const [name, setName] = useState(campaign?.name || '')
  const [mode, setMode] = useState(campaign?.campaign_mode || 'relationship')
  const [slug, setSlug] = useState(core.slug || '')
  const [instanceId, setInstanceId] = useState(campaign?.instance_id || '')
  const [instanceMode, setInstanceMode] = useState(core.instanceMode || 'specific')
  const [poolIds, setPoolIds] = useState<string[]>(core.poolInstanceIds || [])
  const [rotationMode, setRotationMode] = useState(core.rotationMode || campaign?.rotation_mode || 'balanced')

  // Tab 2: Mensagem & IA
  const [useAi, setUseAi] = useState(campaign?.use_ai !== false)
  const [aiPrompt, setAiPrompt] = useState(campaign?.ai_prompt || '')
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '')
  const [intentText, setIntentText] = useState(comp.intentText || '')
  const [personalizedPerLead, setPersonalizedPerLead] = useState(comp.personalizedPerLead !== false)
  const [useAutoVariations, setUseAutoVariations] = useState(comp.useAutoVariations !== false)

  // Tab 2b: Media (imagem/video/audio/documento) + link
  const media = s.media || {}
  const [imageUrl, setImageUrl] = useState(media.imageFileName || '')
  const [imageCaption, setImageCaption] = useState(media.imageCaption || '')
  const [imageUseTextAsCaption, setImageUseTextAsCaption] = useState(media.imageUseTextAsCaption !== false)
  const [videoUrl, setVideoUrl] = useState(media.videoFileName || '')
  const [videoCaption, setVideoCaption] = useState(media.videoCaption || '')
  const [videoUseTextAsCaption, setVideoUseTextAsCaption] = useState(Boolean(media.videoUseTextAsCaption))
  const [audioUrl, setAudioUrl] = useState(media.audioFileName || '')
  const [audioVoiceNote, setAudioVoiceNote] = useState(media.audioVoiceNote !== false)
  const [documentUrl, setDocumentUrl] = useState(media.documentFileName || '')
  const [documentName, setDocumentName] = useState(media.documentName || '')
  const [linkUrl, setLinkUrl] = useState(media.linkUrl || '')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingDocument, setUploadingDocument] = useState(false)

  async function uploadMedia(file: File, type: 'image' | 'video' | 'audio' | 'document') {
    const setterMap = { image: setImageUrl, video: setVideoUrl, audio: setAudioUrl, document: setDocumentUrl }
    const loadingMap = { image: setUploadingImage, video: setUploadingVideo, audio: setUploadingAudio, document: setUploadingDocument }
    const setter = setterMap[type]
    const loadingSetter = loadingMap[type]
    loadingSetter(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': getHeaders()['Authorization'] },
        body: fd,
      })
      const d = await r.json()
      if (d.file?.url) {
        setter(d.file.url)
        if (type === 'document' && !documentName) setDocumentName(file.name)
      }
    } catch {}
    loadingSetter(false)
  }

  // Tab 3: Segmentacao
  const [filterStatuses, setFilterStatuses] = useState<string[]>(filter.statuses || ['new'])
  const [filterHasWhatsapp, setFilterHasWhatsapp] = useState(filter.hasWhatsapp === true)
  const [filterTagsInclude, setFilterTagsInclude] = useState((filter.tagsInclude || []).join(', '))
  const [filterTagsExclude, setFilterTagsExclude] = useState((filter.tagsExclude || []).join(', '))
  const [filterCategories, setFilterCategories] = useState<string[]>(filter.segments || filter.categories || [])
  const [filterCities, setFilterCities] = useState<string[]>(filter.cities || [])
  const [filterSources, setFilterSources] = useState<string[]>(filter.sources || [])
  const [filterMinRating, setFilterMinRating] = useState<number | undefined>(filter.scoreMin)
  const [filterOptions, setFilterOptions] = useState<any>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  // Tab 4: Velocidade & Anti-block
  const [maxPerMinute, setMaxPerMinute] = useState(String(speed.maxPerMinute || 3))
  const [minInterval, setMinInterval] = useState(String(speed.minIntervalSeconds || 10))
  const [maxInterval, setMaxInterval] = useState(String(speed.maxIntervalSeconds || 30))
  const [dailyLimit, setDailyLimit] = useState(String(speed.dailyLimit || 200))
  const [autoPauseRate, setAutoPauseRate] = useState(String(speed.autoPauseOnBlockRate || 15))
  const [autoPauseBlocks, setAutoPauseBlocks] = useState(String(ab.autoPauseByBlocks || 5))
  const [autoPauseErrorRate, setAutoPauseErrorRate] = useState(String(ab.autoPauseByErrorRate || 20))
  const [autoPauseOffline, setAutoPauseOffline] = useState(ab.autoPauseOnOffline !== false)
  const [avoidNight, setAvoidNight] = useState(ab.avoidNight !== false)
  const [avoidSunday, setAvoidSunday] = useState(ab.avoidSunday !== false)

  // Tab 5: Agenda
  const [scheduleMode, setScheduleMode] = useState(sched.scheduleMode || 'immediate')
  const [timeZone, setTimeZone] = useState(sched.timeZone || 'America/Sao_Paulo')
  const [smartWindowStart, setSmartWindowStart] = useState(sched.smartWindowStart || aw.start || '08:00')
  const [smartWindowEnd, setSmartWindowEnd] = useState(sched.smartWindowEnd || aw.end || '18:00')
  const [windowEnabled, setWindowEnabled] = useState(aw.enabled || false)

  // Tab 6: Acoes Finais & Triggers
  const [nextStatus, setNextStatus] = useState(fa.nextStatus || '')
  const [addTags, setAddTags] = useState((fa.addTags || []).join(', '))
  const [trigOnNewLead, setTrigOnNewLead] = useState(trig.onNewLead || false)
  const [trigOnStatusChange, setTrigOnStatusChange] = useState(trig.onStatusChange || false)
  const [trigOnTagMatch, setTrigOnTagMatch] = useState(trig.onTagMatch || false)
  const [trigOnOrderCreated, setTrigOnOrderCreated] = useState(trig.onOrderCreated || false)

  // Load instances
  useEffect(() => {
    fetch('/api/instances', { headers: getHeaders() }).then(r => r.json()).then(d => setInstances(d.instances || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/customers/filter-options', { headers: getHeaders() })
      .then(r => r.json()).then(d => setFilterOptions(d)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const f: any = { statuses: filterStatuses }
      if (filterCategories.length) f.segments = filterCategories
      if (filterCities.length) f.cities = filterCities
      if (filterSources.length) f.sources = filterSources
      if (filterMinRating) f.scoreMin = filterMinRating
      if (filterHasWhatsapp) f.hasWhatsapp = true
      if (filterTagsInclude.trim()) f.tagsInclude = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
      if (filterTagsExclude.trim()) f.tagsExclude = filterTagsExclude.split(',').map((t: string) => t.trim()).filter(Boolean)

      fetch('/api/campaigns-v2/preview', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ filter: f })
      }).then(r => r.json()).then(d => setPreviewCount(d.count ?? d.total ?? null)).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [filterStatuses, filterCategories, filterCities, filterSources, filterMinRating, filterHasWhatsapp, filterTagsInclude, filterTagsExclude])

  const splitTags = (v: string) => v.split(',').map((t: string) => t.trim()).filter(Boolean)

  async function save() {
    if (!name.trim()) return showToast('Nome obrigatorio', 'err')
    setSaving(true)
    try {
      const body: any = {
        name: name.trim(),
        campaignMode: mode,
        instanceId: instanceId || undefined,
        useAI: useAi,
        aiPrompt: aiPrompt || null,
        messageTemplate: messageTemplate || null,
        useInstanceRotation: instanceMode === 'smart-rotation',
        rotationMode,
        filter: {
          statuses: filterStatuses,
          hasWhatsapp: filterHasWhatsapp,
          ...(filterCategories.length ? { segments: filterCategories } : {}),
          ...(filterCities.length ? { cities: filterCities } : {}),
          ...(filterSources.length ? { sources: filterSources } : {}),
          ...(filterMinRating ? { scoreMin: filterMinRating } : {}),
          ...(filterTagsInclude.trim() ? { tagsInclude: splitTags(filterTagsInclude) } : {}),
          ...(filterTagsExclude.trim() ? { tagsExclude: splitTags(filterTagsExclude) } : {}),
        },
        speedControl: {
          maxPerMinute: parseInt(maxPerMinute) || 3,
          minIntervalSeconds: parseInt(minInterval) || 10,
          maxIntervalSeconds: parseInt(maxInterval) || 30,
          dailyLimit: parseInt(dailyLimit) || 200,
          autoPauseOnBlockRate: parseInt(autoPauseRate) || 15,
        },
        settings: {
          ...s,
          campaignMode: mode,
          campaignCore: { slug: slug || undefined, instanceMode, poolInstanceIds: poolIds, rotationMode },
          scheduler: { scheduleMode, timeZone, smartWindowStart, smartWindowEnd },
          actionWindow: { enabled: windowEnabled, start: smartWindowStart, end: smartWindowEnd },
          finalActions: { nextStatus: nextStatus || undefined, addTags: addTags.trim() ? splitTags(addTags) : [] },
          triggers: { onNewLead: trigOnNewLead, onStatusChange: trigOnStatusChange, onTagMatch: trigOnTagMatch, onOrderCreated: trigOnOrderCreated },
          composer: { intentText, personalizedPerLead, useAutoVariations },
          antiBlock: { autoPauseByBlocks: parseInt(autoPauseBlocks) || 5, autoPauseByErrorRate: parseInt(autoPauseErrorRate) || 20, autoPauseOnOffline: autoPauseOffline, avoidNight, avoidSunday },
          media: {
            imageFileName: imageUrl || null,
            imageCaption: imageCaption || null,
            imageUseTextAsCaption,
            videoFileName: videoUrl || null,
            videoCaption: videoCaption || null,
            videoUseTextAsCaption,
            audioFileName: audioUrl || null,
            audioVoiceNote,
            documentFileName: documentUrl || null,
            documentName: documentName || null,
            linkUrl: linkUrl.trim() || null,
          },
        },
      }
      if (isEdit) await adminApi.updateCampaign(campaign.id, body)
      else await adminApi.createCampaign(body)
      showToast(isEdit ? 'Campanha atualizada!' : 'Campanha criada!')
      onSaved()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const tabs = [
    { key: 'geral', label: 'Geral' },
    { key: 'mensagem', label: 'Mensagem & IA' },
    { key: 'segmentacao', label: 'Segmentacao' },
    { key: 'velocidade', label: 'Velocidade' },
    { key: 'agenda', label: 'Agenda' },
    { key: 'acoes', label: 'Acoes' },
    { key: 'metricas', label: 'Metricas' },
  ]

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition shrink-0 ${value ? 'bg-violet-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  const LEAD_STATUSES = ['new', 'contacted', 'replied', 'negotiating', 'converted', 'lost', 'inactive']

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base text-gray-900">{isEdit ? 'Configurar Campanha' : 'Nova Campanha'}</h3>
            {isEdit && <p className="text-[11px] text-gray-400 mt-0.5">{campaign.name}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 border-b border-gray-100 flex gap-1 shrink-0 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3.5 py-2 rounded-t-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === t.key ? 'bg-violet-50 text-violet-700 border-b-2 border-violet-500' : 'text-gray-400 hover:text-gray-600'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Tab: Geral */}
          {activeTab === 'geral' && (<>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome da campanha *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas Vindas" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Slug / Codigo</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder="Ex: boas_vindas" className={inputCls + ' font-mono text-xs'} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Modo</label>
              <div className="grid grid-cols-3 gap-2">
                {[['relationship', 'Relacionamento', 'Conversa 1-a-1'], ['broadcast', 'Broadcast', 'Mensagem em massa'], ['drip', 'Sequencia', 'Etapas programadas']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${mode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className={`text-xs font-bold ${mode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Instancia WhatsApp</label>
              <select value={instanceId} onChange={e => setInstanceId(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {instances.map((inst: any) => (
                  <option key={inst.id} value={inst.id}>{inst.name} ({inst.phone}) — {inst.status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Modo de instancia</label>
              <div className="grid grid-cols-2 gap-2">
                {[['specific', 'Instancia unica', 'Envia por uma unica instancia'], ['smart-rotation', 'Rodizio inteligente', 'Alterna entre multiplas instancias']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setInstanceMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${instanceMode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}>
                    <p className={`text-xs font-bold ${instanceMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            {instanceMode === 'smart-rotation' && (<>
              <div>
                <label className={labelCls}>Instancias do pool</label>
                <p className="text-[10px] text-gray-400 mb-2">Selecione as instancias que participarao do rodizio. A campanha alternara entre elas automaticamente.</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {instances.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 bg-gray-50 rounded-xl">Nenhuma instancia WhatsApp cadastrada.</p>
                  ) : instances.map((inst: any) => {
                    const checked = poolIds.includes(inst.id)
                    const isConnected = inst.status === 'connected'
                    return (
                      <label key={inst.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          checked ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        } ${!isConnected ? 'opacity-60' : ''}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            setPoolIds(checked ? poolIds.filter(id => id !== inst.id) : [...poolIds, inst.id])
                          }}
                          className="w-4 h-4 accent-violet-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <span className="text-xs font-bold text-gray-900 truncate">{inst.name || inst.id.slice(0, 8)}</span>
                            <span className="text-[10px] text-gray-400">{inst.phone || 'sem numero'}</span>
                          </div>
                          <span className={`text-[9px] font-semibold ${isConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {isConnected ? 'Conectada' : (inst.status === 'qr_ready' ? 'QR pendente' : 'Desconectada')}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
                {poolIds.length > 0 && (
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[10px] font-bold text-violet-600">{poolIds.length} instancia{poolIds.length > 1 ? 's' : ''} selecionada{poolIds.length > 1 ? 's' : ''}</span>
                    <button type="button" onClick={() => setPoolIds([])} className="text-[10px] font-semibold text-gray-400 hover:text-red-500 transition">Limpar</button>
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Modo de rodizio</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['balanced', 'Balanceado', 'Distribui de forma uniforme'],
                    ['conservative', 'Conservador', 'Menos msgs por instancia'],
                    ['aggressive', 'Agressivo', 'Mais msgs por instancia'],
                  ].map(([k, l, d]) => (
                    <button key={k} type="button" onClick={() => setRotationMode(k)}
                      className={`p-2.5 rounded-xl border text-left transition ${rotationMode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}>
                      <p className={`text-[11px] font-bold ${rotationMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>)}
          </>)}

          {/* Tab: Mensagem & IA — Full composer */}
          {activeTab === 'mensagem' && (<>

            {/* ─── 1. MIDIA + LINK (topo) ─── */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Midia & Link (opcional)</p>

              {/* Imagem + Video */}
              <div className="grid grid-cols-2 gap-2">
                {/* Imagem */}
                <div className={`rounded-xl border-2 border-dashed overflow-hidden transition-all ${imageUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {imageUrl ? (
                    <div className="relative group" style={{ aspectRatio: '16/10' }}>
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <label className="px-2 py-1 bg-white/90 rounded-lg text-[10px] font-bold text-gray-700 cursor-pointer">
                          Trocar <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                        </label>
                        <button onClick={() => setImageUrl('')} className="px-2 py-1 bg-red-500/90 rounded-lg text-[10px] font-bold text-white">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingImage ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Eye size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingImage ? 'Enviando...' : 'Imagem'}</p>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                    </label>
                  )}
                </div>
                {/* Video */}
                <div className={`rounded-xl border-2 border-dashed overflow-hidden transition-all ${videoUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {videoUrl ? (
                    <div className="relative group" style={{ aspectRatio: '16/10' }}>
                      <video src={videoUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <label className="px-2 py-1 bg-white/90 rounded-lg text-[10px] font-bold text-gray-700 cursor-pointer">
                          Trocar <input type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'video') }} />
                        </label>
                        <button onClick={() => setVideoUrl('')} className="px-2 py-1 bg-red-500/90 rounded-lg text-[10px] font-bold text-white">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingVideo ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Send size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingVideo ? 'Enviando...' : 'Video'}</p>
                      <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'video') }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Imagem caption */}
              {imageUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={imageUseTextAsCaption} onChange={setImageUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda da imagem</span>
                  </div>
                  {!imageUseTextAsCaption && (
                    <input type="text" value={imageCaption} onChange={e => setImageCaption(e.target.value)}
                      placeholder="Legenda da imagem..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Video caption */}
              {videoUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={videoUseTextAsCaption} onChange={setVideoUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda do video</span>
                  </div>
                  {!videoUseTextAsCaption && (
                    <input type="text" value={videoCaption} onChange={e => setVideoCaption(e.target.value)}
                      placeholder="Legenda do video..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Audio + Documento */}
              <div className="grid grid-cols-2 gap-2">
                {/* Audio */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${audioUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {audioUrl ? (
                    <div className="p-2.5 space-y-2">
                      <audio src={audioUrl} controls className="w-full h-8" />
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
                          <input type="checkbox" checked={audioVoiceNote} onChange={e => setAudioVoiceNote(e.target.checked)} className="w-3 h-3" />
                          Voice note
                        </label>
                        <button onClick={() => setAudioUrl('')} className="text-[10px] text-red-500 font-bold">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingAudio ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Volume2 size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingAudio ? 'Enviando...' : 'Audio'}</p>
                      <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'audio') }} />
                    </label>
                  )}
                </div>
                {/* Documento */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${documentUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {documentUrl ? (
                    <div className="p-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <FileText size={14} className="text-violet-500 shrink-0" />
                        <span className="text-[11px] font-bold text-gray-700 truncate">{documentName || 'documento'}</span>
                      </div>
                      <input type="text" value={documentName} onChange={e => setDocumentName(e.target.value)}
                        placeholder="Nome do arquivo..." className="w-full px-2 py-1 border border-gray-200 rounded-md text-[10px]" />
                      <button onClick={() => { setDocumentUrl(''); setDocumentName('') }} className="text-[10px] text-red-500 font-bold">Remover</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingDocument ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <FileText size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingDocument ? 'Enviando...' : 'Documento'}</p>
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'document') }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Link */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1 block flex items-center gap-1.5">
                  <Link2 size={11} /> Link (gera preview no WhatsApp)
                </label>
                <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-pagina"
                  className={inputCls + ' !text-xs !py-2'} />
                <p className="text-[9px] text-gray-400 mt-1">O link sera adicionado ao final da mensagem. Se ja estiver no texto, nao sera duplicado.</p>
              </div>
            </div>

            {/* ─── 2. CONTEUDO DA MENSAGEM ─── */}
            <div>
              <label className={labelCls}>Mensagem / Template</label>
              <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={4}
                placeholder="Ola {{nome}}, tudo bem? Sou da {{empresa}}. Gostaria de conversar sobre..."
                className={inputCls + ' resize-none font-mono text-xs leading-relaxed'} />
              <p className="text-[10px] text-gray-400 mt-1">Variaveis: <code className="bg-gray-100 px-1 rounded">{'{{nome}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{cidade}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{segmento}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{empresa}}'}</code></p>
            </div>

            {/* ─── 3. INTELIGENCIA ARTIFICIAL ─── */}
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-4 space-y-3 ring-1 ring-violet-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-500 grid place-items-center"><Zap size={14} className="text-white" /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Inteligencia Artificial</p>
                    <p className="text-[10px] text-gray-500">A IA personaliza cada mensagem para o lead</p>
                  </div>
                </div>
                <Toggle value={useAi} onChange={setUseAi} />
              </div>

              {useAi && (<>
                <div>
                  <label className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1 block">Instrucoes para a IA (prompt)</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                    placeholder="Ex: Fale sobre nossos produtos, mencione o nome do cliente, pergunte sobre interesse..."
                    className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1 block">Texto de intencao (objetivo detalhado)</label>
                  <textarea value={intentText} onChange={e => setIntentText(e.target.value)} rows={3}
                    placeholder="Descreva o objetivo da abordagem, tom desejado, proposta de valor, CTA esperado..."
                    className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
                  <p className="text-[9px] text-violet-400 mt-1">Este texto guia o compositor para gerar conteudo contextualizado por lead.</p>
                </div>
              </>)}
            </div>

            {/* ─── 4. CONFIG AVANCADA (colapsavel) ─── */}
            <details className="group">
              <summary className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 cursor-pointer hover:text-gray-600 transition select-none">
                <ChevronRight size={12} className="transition-transform group-open:rotate-90" /> Configuracoes avancadas
              </summary>
              <div className="mt-3 space-y-3 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Personalizar por lead</span>
                    <Toggle value={personalizedPerLead} onChange={setPersonalizedPerLead} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Variacoes automaticas</span>
                    <Toggle value={useAutoVariations} onChange={setUseAutoVariations} />
                  </div>
                </div>
              </div>
            </details>

            {/* ─── 5. PIPELINE DE EXECUCAO ─── */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Pipeline de execucao</p>
                <span className="text-[8px] font-bold text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">BETA</span>
              </div>
              <div className="px-3 py-3 flex items-start gap-0 overflow-x-auto scrollbar-hide">
                {[
                  { label: 'Filtrar', desc: filterStatuses.join(', ') || 'todos', color: 'bg-blue-500' },
                  { label: imageUrl ? 'Midia + Msg' : 'Compor Msg', desc: useAi ? 'IA personalizada' : 'Template fixo', color: 'bg-violet-500' },
                  { label: 'Validar', desc: filterHasWhatsapp ? 'WhatsApp only' : 'Todos', color: 'bg-emerald-500' },
                  { label: 'Enviar', desc: `${maxPerMinute}/min · ${dailyLimit}/dia`, color: 'bg-orange-500' },
                  { label: 'Classificar', desc: 'IA analisa replies', color: 'bg-indigo-500' },
                  { label: nextStatus ? `→ ${nextStatus}` : 'Fim', desc: addTags ? `+${addTags}` : '', color: 'bg-gray-500' },
                ].map((s, i, arr) => (
                  <div key={i} className="flex items-center shrink-0">
                    <div className="text-center min-w-[72px]">
                      <div className={`w-7 h-7 rounded-lg ${s.color} mx-auto grid place-items-center text-white text-[10px] font-bold shadow-sm`}>{i + 1}</div>
                      <p className="text-[10px] font-bold text-gray-700 mt-1.5">{s.label}</p>
                      <p className="text-[8px] text-gray-400 leading-tight max-w-[70px] mx-auto">{s.desc}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center px-0.5 pt-0 mt-[-8px]">
                        <div className="w-4 h-px bg-gray-200" />
                        <ChevronRight size={10} className="text-gray-300 -mx-0.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </>)}


          {/* Tab: Segmentacao */}
          {activeTab === 'segmentacao' && (() => {
            const CAT_LABEL: Record<string, string> = {
              restaurant: 'Restaurante', buffet_restaurant: 'Buffet', pizza_restaurant: 'Pizzaria',
              brazilian_restaurant: 'Brasileiro', barbecue_restaurant: 'Churrascaria', bar: 'Bar',
              manufacturer: 'Fabricante', italian_restaurant: 'Italiano', seafood_restaurant: 'Frutos do Mar',
              family_restaurant: 'Familiar', food: 'Alimentacao', snack_bar: 'Lanchonete',
              health_food_store: 'Emporio', meal_delivery: 'Delivery', hamburger_restaurant: 'Hamburgueria',
              japanese_restaurant: 'Japones', wholesaler: 'Atacadista',
            }
            const chipActive = 'border border-violet-400 bg-violet-50 text-violet-800'
            const chipInactive = 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            const sectionLabel = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 block'
            const availCats: { value: string; count: number }[] = (filterOptions?.categories || []).slice(0, 12)
            const availCities: { value: string; count: number }[] = (filterOptions?.cities || []).slice(0, 10)
            const availTags: string[] = filterOptions?.tags || []
            const statusCounts: Record<string, number> = filterOptions?.statusCounts || {}
            const toggleArr = (arr: string[], set: (v: string[]) => void, val: string) =>
              set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
            return (<>
              {/* Preview banner */}
              <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${
                previewCount === null ? 'bg-gray-50 text-gray-400' :
                previewCount === 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <span className="grid place-items-center w-4 h-4 shrink-0">
                  {previewCount === null
                    ? <Loader2 size={12} className="animate-spin" />
                    : previewCount === 0
                      ? <AlertTriangle size={13} strokeWidth={2} />
                      : <CheckCircle2 size={13} strokeWidth={2} />}
                </span>
                {previewCount === null
                  ? 'Calculando alcance...'
                  : previewCount === 0
                  ? 'Nenhum lead corresponde aos filtros atuais'
                  : `Esta campanha alcancara ~${previewCount.toLocaleString('pt-BR')} leads`}
              </div>

              {/* Status */}
              <div>
                <span className={sectionLabel}>Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map(s => {
                    const cnt = statusCounts[s]
                    const active = filterStatuses.includes(s)
                    return (
                      <button key={s} type="button"
                        onClick={() => toggleArr(filterStatuses, setFilterStatuses, s)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                        {s}{cnt != null && <span className="text-[9px] opacity-60">({cnt})</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Categoria */}
              {availCats.length > 0 && (
                <div>
                  <span className={sectionLabel}>Categoria</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCats.map(({ value, count }) => {
                      const active = filterCategories.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCategories, setFilterCategories, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {CAT_LABEL[value] || value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cidade */}
              {availCities.length > 0 && (
                <div>
                  <span className={sectionLabel}>Cidade</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCities.map(({ value, count }) => {
                      const active = filterCities.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCities, setFilterCities, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Rating minimo */}
              <div>
                <span className={sectionLabel}>Rating minimo</span>
                <div className="flex flex-wrap gap-1.5">
                  {([undefined, 3, 4, 4.5] as (number | undefined)[]).map(v => {
                    const active = filterMinRating === v
                    return (
                      <button key={String(v)} type="button"
                        onClick={() => setFilterMinRating(v)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${active ? chipActive : chipInactive}`}>
                        {v == null ? (
                          'Qualquer'
                        ) : (
                          <>
                            <Star size={10} strokeWidth={2} className="fill-current" />
                            {v}+
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <span className={sectionLabel}>Tags</span>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Incluir (virgula)</label>
                    <input type="text" value={filterTagsInclude} onChange={e => setFilterTagsInclude(e.target.value)} placeholder="tag1, tag2" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Excluir (virgula)</label>
                    <input type="text" value={filterTagsExclude} onChange={e => setFilterTagsExclude(e.target.value)} placeholder="tag_excluir" className={inputCls} />
                  </div>
                </div>
                {availTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {availTags.slice(0, 20).map(tag => {
                      const included = filterTagsInclude.split(',').map((t: string) => t.trim()).includes(tag)
                      return (
                        <button key={tag} type="button"
                          onClick={() => {
                            const parts = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
                            if (included) setFilterTagsInclude(parts.filter((t: string) => t !== tag).join(', '))
                            else setFilterTagsInclude([...parts, tag].join(', '))
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition ${included ? chipActive : chipInactive}`}>
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* WhatsApp toggle */}
              <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Somente com WhatsApp</p>
                  <p className="text-[11px] text-gray-400">Filtrar apenas leads com WhatsApp validado</p>
                </div>
                <Toggle value={filterHasWhatsapp} onChange={setFilterHasWhatsapp} />
              </div>
            </>)
          })()}

          {/* Tab: Velocidade & Anti-block */}
          {activeTab === 'velocidade' && (<>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Controle de velocidade</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Msgs por minuto</label>
                <input type="number" min={1} max={30} value={maxPerMinute} onChange={e => setMaxPerMinute(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Limite diario</label>
                <input type="number" min={1} max={1000} value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo min (seg)</label>
                <input type="number" min={1} max={600} value={minInterval} onChange={e => setMinInterval(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo max (seg)</label>
                <input type="number" min={1} max={600} value={maxInterval} onChange={e => setMaxInterval(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Anti-bloqueio</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Pausar apos X bloqueios</label>
                <input type="number" min={1} max={50} value={autoPauseBlocks} onChange={e => setAutoPauseBlocks(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de bloqueio (%)</label>
                <input type="number" min={1} max={100} value={autoPauseRate} onChange={e => setAutoPauseRate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de erro (%)</label>
                <input type="number" min={1} max={100} value={autoPauseErrorRate} onChange={e => setAutoPauseErrorRate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Pausar se instancia ficar offline', value: autoPauseOffline, onChange: setAutoPauseOffline },
                { label: 'Evitar envios a noite', value: avoidNight, onChange: setAvoidNight },
                { label: 'Evitar envios no domingo', value: avoidSunday, onChange: setAvoidSunday },
              ].map(opt => (
                <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                  <Toggle value={opt.value} onChange={opt.onChange} />
                </div>
              ))}
            </div>
          </>)}

          {/* Tab: Agenda */}
          {activeTab === 'agenda' && (<>
            <div>
              <label className={labelCls}>Modo de agendamento</label>
              <div className="grid grid-cols-2 gap-2">
                {[['immediate', 'Imediato', 'Inicia ao clicar Iniciar'], ['scheduled', 'Agendado', 'Inicia em data/hora definida']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setScheduleMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${scheduleMode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}>
                    <p className={`text-xs font-bold ${scheduleMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-semibold text-gray-800">Janela de envio</p>
                <p className="text-[11px] text-gray-400">Restringir envios a um horario</p>
              </div>
              <Toggle value={windowEnabled} onChange={setWindowEnabled} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Horario inicio</label>
                <input type="time" value={smartWindowStart} onChange={e => setSmartWindowStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Horario fim</label>
                <input type="time" value={smartWindowEnd} onChange={e => setSmartWindowEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Fuso horario</label>
              <select value={timeZone} onChange={e => setTimeZone(e.target.value)} className={inputCls}>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="America/Manaus">America/Manaus (AMT)</option>
                <option value="America/Fortaleza">America/Fortaleza (BRT)</option>
              </select>
            </div>
          </>)}

          {/* Tab: Acoes Finais & Triggers */}
          {activeTab === 'acoes' && (<>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Apos a campanha</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mover lead para status</label>
                <select value={nextStatus} onChange={e => setNextStatus(e.target.value)} className={inputCls}>
                  <option value="">Nao alterar</option>
                  <option value="contacted">Contatado</option>
                  <option value="replied">Respondeu</option>
                  <option value="negotiating">Negociando</option>
                  <option value="converted">Convertido</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Adicionar tags (virgula)</label>
                <input type="text" value={addTags} onChange={e => setAddTags(e.target.value)} placeholder="contatado, follow_1" className={inputCls} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Gatilhos automaticos</p>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Disparar ao capturar novo lead', value: trigOnNewLead, onChange: setTrigOnNewLead },
                { label: 'Disparar ao mudar status do lead', value: trigOnStatusChange, onChange: setTrigOnStatusChange },
                { label: 'Disparar quando tag combinar', value: trigOnTagMatch, onChange: setTrigOnTagMatch },
                { label: 'Disparar ao criar pedido', value: trigOnOrderCreated, onChange: setTrigOnOrderCreated },
              ].map(opt => (
                <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                  <Toggle value={opt.value} onChange={opt.onChange} />
                </div>
              ))}
            </div>
          </>)}

          {/* Tab: Metricas (read-only) */}
          {activeTab === 'metricas' && (<>
            {!isEdit ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">Metricas disponiveis apos salvar a campanha</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: 'Alvo', value: campaign.target_count, color: 'text-gray-900' },
                  { label: 'Enviados', value: campaign.sent_count, color: 'text-blue-600' },
                  { label: 'Entregues', value: campaign.delivered_count, color: 'text-emerald-600' },
                  { label: 'Lidos', value: campaign.read_count, color: 'text-indigo-600' },
                  { label: 'Responderam', value: campaign.replied_count, color: 'text-violet-600' },
                  { label: 'Falhas', value: campaign.failed_count, color: 'text-red-500' },
                  { label: 'Interessados', value: campaign.interested_count, color: 'text-emerald-600' },
                  { label: 'Neutros', value: campaign.neutral_count, color: 'text-gray-500' },
                  { label: 'Negativos', value: campaign.negative_count, color: 'text-red-500' },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className={`text-xl font-extrabold ${m.color}`}>{m.value || 0}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 transition-all shadow-md">
            {saving ? 'Salvando...' : isEdit ? 'Salvar Alteracoes' : 'Criar Campanha'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   ORDERS VIEW
   ══════════════════════════════════════════════ */
export function OrdersView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [subTab, setSubTab] = useState<'orders' | 'bookings'>('orders')

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
    <div className="space-y-5">
      <div><h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Pedidos & Agendamentos</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} pedidos · {money(metrics.totalValue)} total</p></div>

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
        <KpiCard label="Pagos" value={String(metrics.paid)} icon={Eye} bg="bg-violet-50" color="text-violet-500" accent="text-violet-600" />
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
                <td className="px-4 py-3"><p className="font-mono text-xs font-bold text-gray-700 group-hover:text-blue-600">#{o.order_number || o.id?.slice(0, 8)}</p><p className="text-[9px] text-gray-400">{o.channel || o.origem}</p></td>
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
              <div><h3 className="font-bold text-base text-gray-900">Pedido #{selectedOrder.order_number || selectedOrder.id?.slice(0, 8)}</h3>
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
                      <a href={`https://wa.me/${(selectedOrder.customer_phone||'').replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition shadow-sm"><MessageSquare size={12} /> WhatsApp</a>
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
                  {orderDetail.customer_profile.vip && <p className="text-center text-[9px] font-bold text-violet-600 mt-1.5 bg-violet-100 rounded-lg py-1">VIP</p>}
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
                        className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50 transition">
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
                            <img src={p.product_image || p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
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
export function AutomationsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [rules, setRules] = useState<any[]>([])
  const [funnelStatuses, setFunnelStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function loadData() {
    setLoading(true)
    fetch('/api/automations', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setRules(d.rules || [])
        setFunnelStatuses(d.funnel_statuses || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  async function toggleRule(ruleId: string, currentActive: boolean) {
    setToggling(ruleId)
    try {
      await adminApi.updateAutomationRule(ruleId, { is_active: !currentActive })
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: !currentActive } : r))
      showToast(!currentActive ? 'Automacao ativada!' : 'Automacao desativada')
    } catch (e: any) { showToast(e.message, 'err') }
    setToggling(null)
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Automacoes</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{rules.length} regras configuradas</p>
      </div>

      {/* Funnel */}
      {funnelStatuses.length > 0 && (
        <div className="bg-white rounded-2xl border border-border-light p-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Funil de Conversao</h3>
          <div className="flex flex-wrap gap-1">
            {funnelStatuses.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-2.5 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 text-[11px] font-semibold rounded-lg border border-indigo-100">{s}</span>
                {i < funnelStatuses.length - 1 && <span className="text-gray-300 text-sm">›</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length === 0 ? (
        <EmptyState icon={Zap} text="Nenhuma automacao configurada" />
      ) : (
        <div className="space-y-2.5">
          {rules.map((r: any) => {
            const isExpanded = expanded === r.id
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-border-light overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <h4 className="font-bold text-sm text-gray-900">{r.name || r.code}</h4>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-1">{r.trigger || ''}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleRule(r.id, r.is_active) }}
                    disabled={toggling === r.id}
                    className={`relative w-11 h-6 rounded-full transition shrink-0 ${r.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${r.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-100">
                    {r.trigger && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Gatilho</p>
                        <p className="text-xs text-gray-600">{r.trigger}</p>
                      </div>
                    )}
                    {r.status_from && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Fluxo:</span>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{r.status_from}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{r.status_to}</span>
                      </div>
                    )}
                    {r.timing_steps && r.timing_steps.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Etapas</p>
                        <div className="space-y-1">
                          {r.timing_steps.map((s: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="w-5 h-5 rounded-full bg-gray-100 grid place-items-center text-[9px] font-bold text-gray-500 shrink-0">{i + 1}</span>
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.tags.slice(0, 10).map((t: string, i: number) => (
                          <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t}</span>
                        ))}
                        {r.tags.length > 10 && <span className="text-[9px] text-gray-400">+{r.tags.length - 10} mais</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   PRODUCTS VIEW
   ══════════════════════════════════════════════ */
export function ProductsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [editProduct, setEditProduct] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [subTab, setSubTab] = useState<'products' | 'collections' | 'attributes'>('products')
  const { confirm } = useConfirm()

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/products', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/categories', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ categories: [] })),
    ]).then(([p, c]) => {
      setProducts(p.products || [])
      setCategories(c.categories || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = products
    if (catFilter) list = list.filter(p => p.category === catFilter)
    if (search) { const q = search.toLowerCase(); list = list.filter(p => (p.name || '').toLowerCase().includes(q)) }
    return list
  }, [products, catFilter, search])

  const metrics = useMemo(() => {
    const total = products.length
    const active = products.filter(p => p.active !== false && p.is_active !== false).length
    const withImage = products.filter(p => p.imageUrl || p.image).length
    const avgPrice = total > 0 ? products.reduce((s, p) => s + (Number(p.price) || 0), 0) / total : 0
    const catCounts: Record<string, number> = {}
    products.forEach(p => { if (p.category) catCounts[p.category] = (catCounts[p.category] || 0) + 1 })
    return { total, active, withImage, avgPrice, catCounts }
  }, [products])

  async function deleteProduct(id: string) {
    const product = products.find(p => p.id === id)
    const ok = await confirm({
      title: 'Remover produto?',
      message: product?.name
        ? <span>O produto <b>{product.name}</b> sera removido do catalogo. Pedidos antigos sao mantidos.</span>
        : 'O produto sera removido do catalogo. Pedidos antigos sao mantidos.',
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    load()
    showToast('Produto removido')
  }

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Catálogo</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} produtos · {metrics.active} ativos</p>
        </div>
        {subTab === 'products' && (
          <button onClick={() => { setEditProduct(null); setShowCreate(true) }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md">
            <Plus size={14} /> Novo Produto
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-fit">
        {([
          { key: 'products', label: 'Produtos' },
          { key: 'collections', label: 'Coleções' },
          { key: 'attributes', label: 'Atributos' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition ${
              subTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {subTab === 'collections' ? (
        <CollectionsManager products={products} showToast={showToast} />
      ) : subTab === 'attributes' ? (
        <AttributeDefinitionsManager showToast={showToast} />
      ) : (<>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Total" value={String(metrics.total)} icon={Package} bg="bg-blue-50" color="text-blue-500" accent="text-blue-600" />
        <KpiCard label="Ativos" value={String(metrics.active)} icon={Eye} bg="bg-emerald-50" color="text-emerald-500" accent="text-emerald-600" />
        <KpiCard label="Com Imagem" value={String(metrics.withImage)} icon={Eye} bg="bg-violet-50" color="text-violet-500" accent="text-violet-600" />
        <KpiCard label="Preco Medio" value={money(metrics.avgPrice)} icon={BarChart3} bg="bg-amber-50" color="text-amber-500" accent="text-amber-600" />
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCatFilter('')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${!catFilter ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
            Todos ({metrics.total})
          </button>
          {categories.map((c: any) => (
            <button key={c.id} onClick={() => setCatFilter(catFilter === c.name ? '' : c.name)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${catFilter === c.name ? 'ring-1 ring-blue-300 text-blue-700 bg-blue-50' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
              {c.color && <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />}
              {c.name} {metrics.catCounts[c.name] ? <span className="text-[9px] opacity-60">({metrics.catCounts[c.name]})</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* Search + View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 placeholder:text-gray-300" />
        </div>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
            <Package size={14} />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>
            <BarChart3 size={14} />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-white rounded-2xl border border-border-light overflow-hidden group hover:shadow-md transition-all cursor-pointer"
              onClick={() => { setEditProduct(p); setShowCreate(true) }}>
              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                {(p.imageUrl || p.image) ? (
                  <img src={p.imageUrl || p.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package size={32} className="text-gray-300" /></div>
                )}
                {p.active === false && (
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">INATIVO</div>
                )}
                <button onClick={e => { e.stopPropagation(); deleteProduct(p.id) }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm"
                  title="Excluir produto">
                  <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{p.category || '—'} · {p.unit || 'un'}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-extrabold text-gray-900">{money(p.price)}</p>
                  {Number(p.promoPrice) > 0 && <p className="text-[10px] font-bold text-emerald-600">{money(p.promoPrice)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Produto</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Categoria</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preco</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition cursor-pointer"
                  onClick={() => { setEditProduct(p); setShowCreate(true) }}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {(p.imageUrl || p.image)
                        ? <img src={p.imageUrl || p.image} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        : <div className="w-9 h-9 rounded-lg bg-gray-100 grid place-items-center shrink-0"><Package size={14} className="text-gray-300" /></div>}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate max-w-[200px]">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.unit || 'un'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{p.category || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <p className="font-bold text-gray-900">{money(p.price)}</p>
                    {Number(p.promoPrice) > 0 && <p className="text-[10px] text-emerald-600 font-semibold">{money(p.promoPrice)}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${p.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {p.active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={e => { e.stopPropagation(); deleteProduct(p.id) }} className="p-1.5 rounded-lg hover:bg-red-50 transition">
                      <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && <EmptyState icon={Package} text="Nenhum produto encontrado" />}

      </>)}

      {/* ── Product Editor Modal ── */}
      {showCreate && (
        <ProductEditorModal
          product={editProduct}
          categories={categories}
          onClose={() => { setShowCreate(false); setEditProduct(null) }}
          onSaved={() => { setShowCreate(false); setEditProduct(null); load() }}
          onDelete={async (id: string) => { await deleteProduct(id); setShowCreate(false); setEditProduct(null) }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ── Product Editor Modal ── */
function ProductEditorModal({ product, categories: categoriesProp, onClose, onSaved, onDelete, showToast }: {
  product: any; categories: any[]; onClose: () => void; onSaved: () => void; onDelete?: (id: string) => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!product?.id
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [category, setCategory] = useState(product?.category || '')
  /* Local mutable copy so newly-created categories appear immediately without parent re-render */
  const [categories, setCategories] = useState<any[]>(categoriesProp || [])
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const { confirm } = useConfirm()

  /* Re-pull categories whenever modal opens to pick up changes from other places */
  useEffect(() => {
    fetch('/api/categories', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setCategories(d.categories || []))
      .catch(() => {})
  }, [])

  async function createCategoryInline(rawName: string) {
    const newName = (rawName || '').trim()
    if (!newName) return
    setCreatingCategory(true)
    try {
      const r = await fetch('/api/categories', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: newName }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const created = d.category
      if (created) {
        setCategories(prev => {
          if (prev.some((c: any) => c.id === created.id)) return prev
          return [...prev, created]
        })
        setCategory(created.name)
        showToast('Categoria criada!')
        setNewCategoryName('')
        setShowNewCategoryInput(false)
      }
    } catch (e: any) {
      showToast(e.message || 'Erro ao criar categoria', 'err')
    } finally {
      setCreatingCategory(false)
    }
  }
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '')
  const [promoPrice, setPromoPrice] = useState(product?.promoPrice != null ? String(product.promoPrice) : '')
  const [features, setFeatures] = useState((product?.features || []).join(', '))
  const [active, setActive] = useState(product?.active !== false)
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || product?.image || '')
  const [uploading, setUploading] = useState(false)
  /* OfferEntity Fase 0+3 — type, subtitle, CTA */
  const [offerType, setOfferType] = useState<string>(product?.type || 'physical_product')
  const [subtitle, setSubtitle] = useState<string>(product?.subtitle || '')
  const [ctaType, setCtaType] = useState<string>(product?.cta_type || 'buy')
  /* Inventory (Fase 12) — empty string = ilimitado (untracked) */
  const [stockQty, setStockQty] = useState<string>(
    product?.stock_quantity == null ? '' : String(product.stock_quantity)
  )
  const [stockThreshold, setStockThreshold] = useState<string>(
    product?.stock_threshold_low != null ? String(product.stock_threshold_low) : '5'
  )
  /* Dynamic attributes (Fase 2) — driven by attribute_definitions */
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([])
  const [attrValues, setAttrValues] = useState<Record<string, any>>(product?.attributes || {})
  /* Inline form for adding a free attribute (Bug 1 fix: replaced blocking prompt()) */
  const [showNewAttrForm, setShowNewAttrForm] = useState(false)
  const [newAttrKey, setNewAttrKey] = useState('')
  const [newAttrValue, setNewAttrValue] = useState('')
  /* Inline form for adding a variant attribute (per variant index) */
  const [variantAttrDraft, setVariantAttrDraft] = useState<Record<number, { key: string; value: string } | null>>({})
  /* SEO (Fase 6) */
  const [seoValues, setSeoValues] = useState<Record<string, any>>(product?.seo || {})
  /* Bundle items (Fase 11) — only meaningful when type='bundle' */
  const [bundleItems, setBundleItems] = useState<Array<{ product_id: string; quantity: number; note?: string }>>(
    Array.isArray(product?.bundle_items) ? product!.bundle_items! : []
  )

  function addBundleItem(productId: string) {
    if (!productId) return
    setBundleItems(prev => {
      if (prev.some(it => it.product_id === productId)) return prev
      return [...prev, { product_id: productId, quantity: 1 }]
    })
  }
  function updateBundleItem(idx: number, patch: any) {
    setBundleItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function removeBundleItem(idx: number) {
    setBundleItems(prev => prev.filter((_, i) => i !== idx))
  }

  /* Configurator (Fase 4) */
  const [configurator, setConfigurator] = useState<{
    enabled: boolean
    groups: Array<{ id: string; name: string; required: boolean; min_select: number; max_select: number; options: Array<{ id: string; name: string; price_delta: number; is_active?: boolean }> }>
  }>({
    enabled: Boolean(product?.configurator?.enabled),
    groups: Array.isArray(product?.configurator?.groups)
      ? product!.configurator!.groups!.map((g: any) => ({
          id: String(g.id || ''),
          name: String(g.name || ''),
          required: Boolean(g.required),
          min_select: Number(g.min_select ?? 0),
          max_select: Number(g.max_select ?? 1),
          options: Array.isArray(g.options) ? g.options.map((o: any) => ({
            id: String(o.id || ''),
            name: String(o.name || ''),
            price_delta: Number(o.price_delta || 0),
            is_active: o.is_active !== false,
          })) : [],
        }))
      : [],
  })

  function slugifyId(label: string): string {
    return String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `g_${Date.now()}`
  }

  function addConfigGroup() {
    /* Add empty group with placeholder name — user edits inline. Avoids blocking prompt()
     * that was freezing the modal renderer for >30s in some browsers/contexts. */
    const placeholder = 'Novo grupo'
    setConfigurator(c => ({
      ...c, enabled: true,
      groups: [...c.groups, {
        id: slugifyId(`${placeholder}-${c.groups.length + 1}`),
        name: placeholder,
        required: true, min_select: 1, max_select: 1, options: [],
      }],
    }))
  }
  function updateGroup(idx: number, patch: any) {
    setConfigurator(c => ({ ...c, groups: c.groups.map((g, i) => i === idx ? { ...g, ...patch } : g) }))
  }
  function removeGroup(idx: number) {
    setConfigurator(c => ({ ...c, groups: c.groups.filter((_, i) => i !== idx) }))
  }
  function addOption(groupIdx: number) {
    /* Add empty option with placeholder — user edits inline (same fix as addConfigGroup). */
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g,
        options: [...g.options, {
          id: slugifyId(`opcao-${g.options.length + 1}`),
          name: 'Nova opção',
          price_delta: 0,
          is_active: true,
        }],
      }),
    }))
  }
  function updateOption(groupIdx: number, optIdx: number, patch: any) {
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g,
        options: g.options.map((o, oi) => oi !== optIdx ? o : { ...o, ...patch }),
      }),
    }))
  }
  function removeOption(groupIdx: number, optIdx: number) {
    setConfigurator(c => ({
      ...c,
      groups: c.groups.map((g, i) => i !== groupIdx ? g : {
        ...g, options: g.options.filter((_, oi) => oi !== optIdx),
      }),
    }))
  }
  /* Product relations (Fase 6) — picker of related products */
  const [relatedIds, setRelatedIds] = useState<string[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [relationsLoaded, setRelationsLoaded] = useState(false)
  useEffect(() => {
    /* Load every product in the brand once for the relation picker */
    fetch('/api/products', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setAllProducts((d.products || []).filter((p: any) => p.id !== product?.id)))
      .catch(() => {})
    if (product?.id) {
      fetch(`/api/products/${product.id}/relations`, { headers: getHeaders() })
        .then(r => r.json())
        .then(d => {
          setRelatedIds((d.relations || []).map((r: any) => r.related_product_id))
          setRelationsLoaded(true)
        })
        .catch(() => setRelationsLoaded(true))
    } else {
      setRelationsLoaded(true)
    }
  }, [product?.id])
  /* Service config (Fase 5) — only shown when type is service/appointment */
  const [serviceConfig, setServiceConfig] = useState<{
    duration_minutes?: number
    buffer_minutes?: number
    max_per_slot?: number
    weekday_hours?: Array<{ weekday: number; start: string; end: string }>
    requires_address?: boolean
    advance_notice_hours?: number
    max_advance_days?: number
  }>(product?.service_config || { duration_minutes: 60, buffer_minutes: 0, max_per_slot: 1, weekday_hours: [], advance_notice_hours: 1, max_advance_days: 30 })
  useEffect(() => {
    fetch('/api/attribute-definitions', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => setAttrDefs(d.definitions || []))
      .catch(() => {})
  }, [])
  /* Variants (Fase 1) — loaded async after edit modal opens for existing product */
  const [variants, setVariants] = useState<Array<{
    id?: string
    name?: string
    sku?: string
    attributes?: Record<string, string>
    price?: string
    promo_price?: string
    stock_quantity?: string
    is_active?: boolean
  }>>([])
  const [variantsLoaded, setVariantsLoaded] = useState(false)
  const [savingVariants, setSavingVariants] = useState(false)

  useEffect(() => {
    if (!product?.id) { setVariantsLoaded(true); return }
    fetch(`/api/products/${product.id}/variants`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const raw = Array.isArray(d.variants) ? d.variants : []
        setVariants(raw.map((v: any) => ({
          id: v.id,
          name: v.name || '',
          sku: v.sku || '',
          attributes: v.attributes || {},
          price: v.price != null ? String(v.price) : '',
          promo_price: v.promo_price != null ? String(v.promo_price) : '',
          stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
          is_active: v.is_active !== false,
        })))
        setVariantsLoaded(true)
      })
      .catch(() => setVariantsLoaded(true))
  }, [product?.id])

  function addVariant() {
    setVariants(v => [...v, { name: '', sku: '', attributes: {}, price: '', promo_price: '', stock_quantity: '', is_active: true }])
  }
  function updateVariant(idx: number, patch: any) {
    setVariants(v => v.map((row, i) => i === idx ? { ...row, ...patch } : row))
  }
  function removeVariant(idx: number) {
    setVariants(v => v.filter((_, i) => i !== idx))
  }
  function updateVariantAttr(idx: number, key: string, value: string) {
    setVariants(v => v.map((row, i) => {
      if (i !== idx) return row
      const next = { ...(row.attributes || {}) }
      if (value) next[key] = value
      else delete next[key]
      return { ...row, attributes: next }
    }))
  }

  // Normalized unit system: parse "500g" → qty=500, baseUnit="g"
  const UNITS = [
    { value: 'kg', label: 'Quilograma (kg)' },
    { value: 'g', label: 'Grama (g)' },
    { value: 'un', label: 'Unidade (un)' },
    { value: 'L', label: 'Litro (L)' },
    { value: 'ml', label: 'Mililitro (ml)' },
    { value: 'cx', label: 'Caixa (cx)' },
    { value: 'pct', label: 'Pacote (pct)' },
    { value: 'par', label: 'Par' },
    { value: 'm', label: 'Metro (m)' },
  ]

  function parseUnit(raw: string): { qty: string; baseUnit: string } {
    const s = (raw || 'unidade').trim().toLowerCase()
    // Match patterns like "500g", "1kg", "10kg", "250ml", "1L"
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|un|cx|pct|m|par)$/i)
    if (m) return { qty: m[1], baseUnit: m[2].toLowerCase() === 'l' ? 'L' : m[2].toLowerCase() }
    // Already a base unit
    const found = UNITS.find(u => u.value.toLowerCase() === s || u.label.toLowerCase().includes(s))
    if (found) return { qty: '1', baseUnit: found.value }
    return { qty: '1', baseUnit: 'un' }
  }

  const parsed = parseUnit(product?.unit || 'unidade')
  const [unitQty, setUnitQty] = useState(parsed.qty)
  const [baseUnit, setBaseUnit] = useState(parsed.baseUnit)

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/media/upload', { method: 'POST', headers: { 'Authorization': getHeaders()['Authorization'] }, body: fd })
      const d = await r.json()
      if (d.file?.url) setImageUrl(d.file.url)
    } catch {}
    setUploading(false)
  }

  async function save() {
    if (!name.trim()) return showToast('Nome obrigatorio', 'err')
    if (!category.trim()) return showToast('Categoria obrigatoria', 'err')
    if (!price || isNaN(parseFloat(price))) return showToast('Preco invalido', 'err')
    setSaving(true)
    try {
      // Compose normalized unit: qty + baseUnit (e.g. "500" + "g" = "500g", "1" + "kg" = "kg")
      const qtyNum = parseFloat(unitQty) || 1
      const composedUnit = qtyNum === 1 ? baseUnit : `${qtyNum}${baseUnit}`

      const body = {
        name: name.trim(), description: description.trim(), category: category.trim(),
        price: parseFloat(price), promoPrice: promoPrice ? parseFloat(promoPrice) : null,
        unit: composedUnit, features: features.split(',').map((f: string) => f.trim()).filter(Boolean),
        active, imageUrl: imageUrl || null,
        type: offerType,
        subtitle: subtitle.trim() || null,
        cta_type: ctaType,
        attributes: attrValues,
        service_config: (offerType === 'service' || offerType === 'appointment') ? serviceConfig : null,
        seo: seoValues,
        configurator: configurator.enabled && configurator.groups.length > 0 ? configurator : { enabled: false, groups: [] },
        bundle_items: offerType === 'bundle' ? bundleItems : [],
        /* Inventory (Fase 12) — empty string means "ilimitado / não rastrear" */
        stock_quantity: stockQty === '' ? null : Math.max(0, parseInt(stockQty, 10) || 0),
        stock_threshold_low: Math.max(0, parseInt(stockThreshold || '5', 10) || 5),
      }
      const url = isEdit ? `/api/products/${product.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')

      const savedId = d.product?.id || d.id || product?.id
      /* Relations (Fase 6) */
      if (savedId && relationsLoaded) {
        try {
          await fetch(`/api/products/${savedId}/relations`, {
            method: 'PUT', headers: getHeaders(),
            body: JSON.stringify({
              relations: relatedIds.map((rid, idx) => ({ related_product_id: rid, type: 'related', position: idx })),
            }),
          })
        } catch { /* non-blocking */ }
      }
      /* Variants (Fase 1) — only persist if user actually touched the editor */
      if (savedId && variantsLoaded) {
        setSavingVariants(true)
        const payload = variants.map((v, idx) => ({
          id: v.id,
          name: (v.name || '').trim() || null,
          sku: (v.sku || '').trim() || null,
          attributes: v.attributes || {},
          price: v.price ? Number(v.price) : null,
          promo_price: v.promo_price ? Number(v.promo_price) : null,
          stock_quantity: v.stock_quantity !== '' ? Number(v.stock_quantity) : null,
          position: idx,
          is_active: v.is_active !== false,
        }))
        try {
          await fetch(`/api/products/${savedId}/variants`, {
            method: 'PUT', headers: getHeaders(),
            body: JSON.stringify({ variants: payload }),
          })
        } catch { /* non-blocking */ }
        setSavingVariants(false)
      }

      showToast(isEdit ? 'Produto atualizado!' : 'Produto criado!')
      onSaved()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-base text-gray-900">{isEdit ? 'Editar Produto' : 'Novo Produto'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Image */}
          <div className={`rounded-xl border-2 border-dashed overflow-hidden transition ${imageUrl ? 'border-blue-300' : 'border-gray-200'}`}>
            {imageUrl ? (
              <div className="relative group" style={{ aspectRatio: '16/10' }}>
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <label className="px-3 py-1.5 bg-white/90 rounded-lg text-[11px] font-bold text-gray-700 cursor-pointer">
                    Trocar <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                  </label>
                  <button onClick={() => setImageUrl('')} className="px-3 py-1.5 bg-red-500/90 rounded-lg text-[11px] font-bold text-white">Remover</button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-blue-50/30 transition">
                {uploading ? <Loader2 size={24} className="text-blue-400 animate-spin" /> : <Package size={28} className="text-gray-300" />}
                <p className="text-xs text-gray-400 mt-1">{uploading ? 'Enviando...' : 'Clique para adicionar imagem'}</p>
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nome *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do produto" className={inputCls} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + ' !mb-0'}>Categoria *</label>
                <button type="button" onClick={() => setShowNewCategoryInput(s => !s)} disabled={creatingCategory}
                  className="text-[10px] font-bold text-violet-600 hover:text-violet-700 px-1.5 py-0.5 rounded hover:bg-violet-50 flex items-center gap-0.5 disabled:opacity-50">
                  <Plus size={10} strokeWidth={2.5} /> {creatingCategory ? '...' : (showNewCategoryInput ? 'Cancelar' : 'Nova')}
                </button>
              </div>
              {showNewCategoryInput ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); createCategoryInline(newCategoryName) }
                      if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryName('') }
                    }}
                    placeholder="Nome da categoria"
                    className={inputCls}
                  />
                  <button type="button" disabled={creatingCategory || !newCategoryName.trim()}
                    onClick={() => createCategoryInline(newCategoryName)}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50">
                    OK
                  </button>
                </div>
              ) : (
                <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                  <option value="">Selecione...</option>
                  {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Unidade de medida</label>
              <div className="flex gap-2">
                <input type="number" step="any" min="0.01" value={unitQty} onChange={e => setUnitQty(e.target.value)}
                  placeholder="1" className={inputCls + ' !w-20 text-center'} />
                <select value={baseUnit} onChange={e => setBaseUnit(e.target.value)} className={inputCls}>
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">
                Resultado: <span className="font-semibold text-gray-600">{parseFloat(unitQty) === 1 ? baseUnit : `${unitQty}${baseUnit}`}</span>
              </p>
            </div>
            <div>
              <label className={labelCls}>Preco (R$) *</label>
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Preco Promocional</label>
              <input type="number" step="0.01" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
          </div>

          {/* ── Estoque (Fase 12) ── Vazio = ilimitado (não rastrear) */}
          <div className="bg-violet-50/40 border border-violet-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-violet-600" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-violet-900 uppercase tracking-wider">Estoque</span>
              <span className="text-[10px] text-violet-700/70 font-normal">deixe vazio para não rastrear</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Quantidade disponível</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockQty}
                  onChange={e => setStockQty(e.target.value)}
                  placeholder="ilimitado"
                  className={inputCls}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {stockQty === '' ? 'Não rastreado — sempre disponível' :
                    parseInt(stockQty, 10) <= 0 ? 'Esgotado — botão de compra desabilitado no catálogo' :
                    parseInt(stockQty, 10) <= parseInt(stockThreshold || '5', 10) ? `Estoque baixo (≤ ${stockThreshold} alerta)` :
                    'Em estoque'}
                </p>
              </div>
              <div>
                <label className={labelCls}>Alerta de baixo (≤)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockThreshold}
                  onChange={e => setStockThreshold(e.target.value)}
                  placeholder="5"
                  className={inputCls}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Quando o estoque cair pra ≤ {stockThreshold || '5'}, marca como baixo.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descricao</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Descreva o produto..." className={inputCls + ' resize-none'} />
          </div>

          <div>
            <label className={labelCls}>Caracteristicas (virgula)</label>
            <input type="text" value={features} onChange={e => setFeatures(e.target.value)}
              placeholder="Fresco, Selecionado, Tipo A" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Subtitulo (opcional)</label>
            <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
              placeholder="Frase curta abaixo do nome (ex: feito a mao)" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo de oferta</label>
              <select value={offerType} onChange={e => setOfferType(e.target.value)} className={inputCls}>
                <option value="physical_product">Produto físico</option>
                <option value="digital_product">Produto digital</option>
                <option value="service">Serviço</option>
                <option value="food">Alimento</option>
                <option value="vehicle">Veículo</option>
                <option value="real_estate">Imóvel</option>
                <option value="subscription">Assinatura</option>
                <option value="consortium">Consórcio</option>
                <option value="custom_quote">Orçamento sob medida</option>
                <option value="appointment">Agendamento</option>
                <option value="course">Curso</option>
                <option value="event">Evento</option>
                <option value="bundle">Kit / Combo</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Define como o agente IA conversa sobre este item.</p>
            </div>
            <div>
              <label className={labelCls}>Ação no catálogo (CTA)</label>
              <select value={ctaType} onChange={e => setCtaType(e.target.value)} className={inputCls}>
                <option value="buy">Comprar (carrinho)</option>
                <option value="quote">Solicitar orçamento</option>
                <option value="whatsapp">Conversar no WhatsApp</option>
                <option value="schedule">Agendar atendimento</option>
                <option value="visit">Solicitar visita</option>
                <option value="simulate">Simular</option>
                <option value="subscribe">Assinar</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1">Define o botão exibido na página pública do produto.</p>
            </div>
          </div>

          {/* ── Atributos do produto (Fase 2 — sempre disponível) ──
            * Estrutura híbrida: campos automáticos vêm dos attribute_definitions da brand (opcional, viram
            * filtros no catálogo público), MAS o vendedor sempre pode adicionar atributos livres direto
            * neste produto, sem precisar definir schema antes. */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Atributos do produto</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Material, peso, voltagem, sabor, cor... Aparecem na ficha técnica do produto.
                </p>
              </div>
              <button type="button"
                onClick={() => setShowNewAttrForm(s => !s)}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 flex items-center gap-1">
                <Plus size={11} strokeWidth={2.5} /> {showNewAttrForm ? 'Cancelar' : 'Atributo'}
              </button>
            </div>

            {showNewAttrForm && (
              <div className="mb-3 flex gap-2 items-center bg-violet-50/40 border border-violet-100 rounded-xl p-2">
                <input
                  type="text"
                  autoFocus
                  value={newAttrKey}
                  onChange={e => setNewAttrKey(e.target.value)}
                  placeholder="Nome (ex: Material)"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={newAttrValue}
                  onChange={e => setNewAttrValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newAttrKey.trim() && newAttrValue.trim()) {
                      e.preventDefault()
                      const k = newAttrKey.trim().toLowerCase().replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
                      if (k) {
                        setAttrValues(prev => ({ ...prev, [k]: newAttrValue.trim() }))
                        setNewAttrKey(''); setNewAttrValue(''); setShowNewAttrForm(false)
                      }
                    }
                  }}
                  placeholder="Valor (ex: Algodão)"
                  className={inputCls}
                />
                <button type="button" disabled={!newAttrKey.trim() || !newAttrValue.trim()}
                  onClick={() => {
                    const k = newAttrKey.trim().toLowerCase().replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
                    if (!k) return
                    setAttrValues(prev => ({ ...prev, [k]: newAttrValue.trim() }))
                    setNewAttrKey(''); setNewAttrValue(''); setShowNewAttrForm(false)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50">
                  Adicionar
                </button>
              </div>
            )}

            {/* Inputs auto-gerados das definições da brand (se houver) */}
            {attrDefs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {attrDefs.map((def) => {
                  const v = attrValues[def.key]
                  const set = (val: any) => setAttrValues((prev) => {
                    const next = { ...prev }
                    if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) delete next[def.key]
                    else next[def.key] = val
                    return next
                  })
                  return (
                    <div key={def.id} className={def.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className={labelCls}>
                        {def.label}{def.required ? ' *' : ''}
                      </label>
                      {def.type === 'text' && (
                        <input type="text" value={v || ''} onChange={e => set(e.target.value)} className={inputCls} />
                      )}
                      {def.type === 'textarea' && (
                        <textarea value={v || ''} onChange={e => set(e.target.value)} rows={2}
                          className={inputCls + ' resize-none'} />
                      )}
                      {def.type === 'number' && (
                        <input type="number" step="any" value={v ?? ''} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />
                      )}
                      {def.type === 'date' && (
                        <input type="date" value={v || ''} onChange={e => set(e.target.value)} className={inputCls} />
                      )}
                      {def.type === 'color' && (
                        <div className="flex items-center gap-2">
                          <input type="color" value={v || '#000000'} onChange={e => set(e.target.value)}
                            className="w-12 h-10 border border-gray-200 rounded-lg cursor-pointer" />
                          <input type="text" value={v || ''} onChange={e => set(e.target.value)}
                            placeholder="#000000" className={inputCls + ' font-mono'} />
                        </div>
                      )}
                      {def.type === 'boolean' && (
                        <button type="button" onClick={() => set(!v)}
                          className={`relative w-11 h-6 rounded-full transition ${v ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${v ? 'translate-x-5' : ''}`} />
                        </button>
                      )}
                      {def.type === 'select' && (
                        <select value={v || ''} onChange={e => set(e.target.value)} className={inputCls}>
                          <option value="">— sem valor —</option>
                          {def.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                      {def.type === 'multi_select' && (
                        <div className="flex flex-wrap gap-1.5">
                          {def.options.map((opt: string) => {
                            const arr: string[] = Array.isArray(v) ? v : []
                            const selected = arr.includes(opt)
                            return (
                              <button key={opt} type="button"
                                onClick={() => set(selected ? arr.filter(x => x !== opt) : [...arr, opt])}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition ${
                                  selected ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                                }`}>
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Atributos livres (chaves que NÃO estão nas definições da brand) */}
            {(() => {
              const definedKeys = new Set(attrDefs.map(d => d.key))
              const freeEntries = Object.entries(attrValues).filter(([k]) => !definedKeys.has(k))
              if (freeEntries.length === 0) {
                if (attrDefs.length === 0) {
                  return (
                    <p className="text-[11px] text-gray-400 italic">
                      Nenhum atributo ainda. Clique em "+ Atributo" para adicionar (ex: Material: Algodão).
                    </p>
                  )
                }
                return null
              }
              return (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Atributos livres</p>
                  {freeEntries.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-gray-700 min-w-[100px]">{k}:</span>
                      <input type="text" value={String(v ?? '')}
                        onChange={e => setAttrValues(prev => ({ ...prev, [k]: e.target.value }))}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <button type="button"
                        onClick={() => setAttrValues(prev => {
                          const next = { ...prev }
                          delete next[k]
                          return next
                        })}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {attrDefs.length === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Dica: se quiser que estes atributos virem <strong>filtros no catálogo público</strong>,
                      defina-os em <em>Catálogo → Atributos</em>.
                    </p>
                  )}
                </div>
              )
            })()}
          </div>

          {/* ── Service config (Fase 5) — only when type is service/appointment ── */}
          {(offerType === 'service' || offerType === 'appointment') && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Configuração de serviço</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Duração, horários de atendimento e capacidade.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Duração (min)</label>
                  <input type="number" min={5} step={5} value={serviceConfig.duration_minutes ?? 60}
                    onChange={e => setServiceConfig({ ...serviceConfig, duration_minutes: Number(e.target.value) || 60 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Buffer (min)</label>
                  <input type="number" min={0} step={5} value={serviceConfig.buffer_minutes ?? 0}
                    onChange={e => setServiceConfig({ ...serviceConfig, buffer_minutes: Number(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Capacidade</label>
                  <input type="number" min={1} step={1} value={serviceConfig.max_per_slot ?? 1}
                    onChange={e => setServiceConfig({ ...serviceConfig, max_per_slot: Number(e.target.value) || 1 })}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={labelCls}>Antecedência mínima (h)</label>
                  <input type="number" min={0} step={1} value={serviceConfig.advance_notice_hours ?? 1}
                    onChange={e => setServiceConfig({ ...serviceConfig, advance_notice_hours: Number(e.target.value) || 0 })}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Janela futura máx. (dias)</label>
                  <input type="number" min={1} step={1} value={serviceConfig.max_advance_days ?? 30}
                    onChange={e => setServiceConfig({ ...serviceConfig, max_advance_days: Number(e.target.value) || 30 })}
                    className={inputCls} />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls}>Horários por dia da semana</label>
                  <button type="button"
                    onClick={() => setServiceConfig({
                      ...serviceConfig,
                      weekday_hours: [...(serviceConfig.weekday_hours || []), { weekday: 1, start: '09:00', end: '18:00' }],
                    })}
                    className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50">
                    + horário
                  </button>
                </div>
                {(serviceConfig.weekday_hours || []).length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">Sem horários — o produto não será agendável.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(serviceConfig.weekday_hours || []).map((h: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <select value={h.weekday}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], weekday: Number(e.target.value) }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200">
                          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                        <input type="time" value={h.start}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], start: e.target.value }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <span className="text-xs text-gray-400">—</span>
                        <input type="time" value={h.end}
                          onChange={e => {
                            const next = [...(serviceConfig.weekday_hours || [])]
                            next[idx] = { ...next[idx], end: e.target.value }
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <button type="button"
                          onClick={() => {
                            const next = (serviceConfig.weekday_hours || []).filter((_, i) => i !== idx)
                            setServiceConfig({ ...serviceConfig, weekday_hours: next })
                          }}
                          className="ml-auto p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 mt-3">
                <span className="text-xs font-medium text-gray-600">Solicitar endereço do cliente</span>
                <button type="button" onClick={() => setServiceConfig({ ...serviceConfig, requires_address: !serviceConfig.requires_address })}
                  className={`relative w-10 h-5 rounded-full transition ${serviceConfig.requires_address ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${serviceConfig.requires_address ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* ── Bundle / Kit (Fase 11) — only when type=bundle ── */}
          {offerType === 'bundle' && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Composição do kit</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Produtos que vão neste kit. O preço final é o da unidade (configurado acima), não a soma dos itens.</p>
              </div>
              {bundleItems.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic py-2 mb-2">Sem itens. Selecione produtos abaixo pra adicionar.</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {bundleItems.map((it, idx) => {
                    const p = allProducts.find((x: any) => x.id === it.product_id) || (product?.id === it.product_id ? product : null)
                    const name = p?.name || `Produto ${it.product_id.slice(0, 8)}…`
                    return (
                      <div key={it.product_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <span className="flex-1 text-xs text-gray-700 truncate">{name}</span>
                        <input type="number" min={1} value={it.quantity}
                          onChange={e => updateBundleItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                        <span className="text-[10px] text-gray-400">un</span>
                        <button type="button" onClick={() => removeBundleItem(idx)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <select value="" onChange={e => { if (e.target.value) addBundleItem(e.target.value); e.target.value = '' }}
                className={inputCls}>
                <option value="">+ Adicionar produto ao kit</option>
                {allProducts
                  .filter((p: any) => !bundleItems.some(bi => bi.product_id === p.id))
                  .filter((p: any) => p.type !== 'bundle')  /* não permitir nested bundles */
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* ── Configurador (Fase 4) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Configurador</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Use para produtos com opções: pizza (tamanho + sabores), carro (motor + pacote), serviço sob medida.</p>
              </div>
              <button type="button" onClick={() => setConfigurator(c => ({ ...c, enabled: !c.enabled }))}
                className={`relative w-10 h-5 rounded-full transition ${configurator.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${configurator.enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {configurator.enabled && (
              <>
                {configurator.groups.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic py-2">Sem grupos. Adicione "Tamanho", "Sabores", "Extras" etc.</p>
                ) : (
                  <div className="space-y-2">
                    {configurator.groups.map((g, gi) => (
                      <div key={gi} className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                        <div className="flex items-center gap-2 mb-2">
                          <input type="text" value={g.name}
                            onChange={e => updateGroup(gi, { name: e.target.value })}
                            placeholder="Nome do grupo"
                            className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-violet-200" />
                          <button type="button" onClick={() => removeGroup(gi)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-600">
                            <input type="checkbox" checked={g.required}
                              onChange={e => updateGroup(gi, { required: e.target.checked, min_select: e.target.checked ? Math.max(1, g.min_select) : 0 })} />
                            Obrigatório
                          </label>
                          <div>
                            <label className="block text-[9px] text-gray-400 uppercase font-bold tracking-wider">Mín</label>
                            <input type="number" min={0} value={g.min_select}
                              onChange={e => updateGroup(gi, { min_select: Number(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                          </div>
                          <div>
                            <label className="block text-[9px] text-gray-400 uppercase font-bold tracking-wider">Máx</label>
                            <input type="number" min={1} value={g.max_select}
                              onChange={e => updateGroup(gi, { max_select: Number(e.target.value) || 1 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {g.options.map((o, oi) => (
                            <div key={oi} className="flex items-center gap-1.5 bg-white rounded-lg p-1.5">
                              <input type="text" value={o.name}
                                onChange={e => updateOption(gi, oi, { name: e.target.value })}
                                placeholder="Nome da opção"
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                              <input type="number" step="0.01" value={o.price_delta}
                                onChange={e => updateOption(gi, oi, { price_delta: Number(e.target.value) || 0 })}
                                placeholder="+R$"
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-violet-200" />
                              <button type="button" onClick={() => removeOption(gi, oi)}
                                className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addOption(gi)}
                            className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 flex items-center gap-1">
                            <Plus size={11} strokeWidth={2.5} /> Adicionar opção
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addConfigGroup}
                  className="mt-2 text-[12px] font-bold text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 flex items-center gap-1">
                  <Plus size={12} strokeWidth={2.5} /> Adicionar grupo
                </button>
              </>
            )}
          </div>

          {/* ── Variantes (Fase 1) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Variações</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Ex: 500g/1kg, P/M/G, Casal/Queen/King. Sobrescrevem preço e estoque do produto.</p>
              </div>
              <button type="button" onClick={addVariant}
                className="text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 transition flex items-center gap-1">
                <Plus size={12} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            {variants.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic py-2">Sem variações. O produto será vendido em uma única opção.</p>
            ) : (
              <div className="space-y-2">
                {variants.map((v, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2 relative">
                    <button type="button" onClick={() => removeVariant(idx)}
                      aria-label="Remover variação"
                      className="absolute top-2 right-2 w-6 h-6 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 grid place-items-center transition">
                      <Trash2 size={12} />
                    </button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="text" value={v.name || ''}
                        onChange={e => updateVariant(idx, { name: e.target.value })}
                        placeholder="Nome (ex: 1kg, Tamanho M)"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="text" value={v.sku || ''}
                        onChange={e => updateVariant(idx, { sku: e.target.value })}
                        placeholder="SKU (opcional)"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" step="0.01" value={v.price || ''}
                        onChange={e => updateVariant(idx, { price: e.target.value })}
                        placeholder="Preço"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="number" step="0.01" value={v.promo_price || ''}
                        onChange={e => updateVariant(idx, { promo_price: e.target.value })}
                        placeholder="Promo"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      <input type="number" step="1" value={v.stock_quantity || ''}
                        onChange={e => updateVariant(idx, { stock_quantity: e.target.value })}
                        placeholder="Estoque"
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      {Object.entries(v.attributes || {}).map(([k, val]) => (
                        <span key={k} className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px] text-gray-700 flex items-center gap-1">
                          {k}: {val}
                          <button type="button" onClick={() => updateVariantAttr(idx, k, '')}
                            className="text-gray-400 hover:text-red-500">×</button>
                        </span>
                      ))}
                      {variantAttrDraft[idx] ? (
                        <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5">
                          <input
                            type="text"
                            autoFocus
                            value={variantAttrDraft[idx]?.key || ''}
                            onChange={e => setVariantAttrDraft(d => ({ ...d, [idx]: { ...(d[idx] || { key: '', value: '' }), key: e.target.value } }))}
                            placeholder="cor"
                            className="text-[10px] bg-transparent border-b border-violet-300 focus:outline-none w-14"
                          />
                          <span className="text-[10px] text-gray-400">:</span>
                          <input
                            type="text"
                            value={variantAttrDraft[idx]?.value || ''}
                            onChange={e => setVariantAttrDraft(d => ({ ...d, [idx]: { ...(d[idx] || { key: '', value: '' }), value: e.target.value } }))}
                            onKeyDown={e => {
                              const draft = variantAttrDraft[idx]
                              if (e.key === 'Enter' && draft?.key.trim() && draft?.value.trim()) {
                                e.preventDefault()
                                updateVariantAttr(idx, draft.key.trim().toLowerCase(), draft.value.trim())
                                setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                              }
                              if (e.key === 'Escape') setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                            }}
                            placeholder="azul"
                            className="text-[10px] bg-transparent border-b border-violet-300 focus:outline-none w-16"
                          />
                          <button type="button"
                            onClick={() => {
                              const draft = variantAttrDraft[idx]
                              if (!draft?.key.trim() || !draft?.value.trim()) return
                              updateVariantAttr(idx, draft.key.trim().toLowerCase(), draft.value.trim())
                              setVariantAttrDraft(d => ({ ...d, [idx]: null }))
                            }}
                            className="text-violet-600 text-[10px] font-bold px-1 hover:text-violet-700">OK</button>
                          <button type="button"
                            onClick={() => setVariantAttrDraft(d => ({ ...d, [idx]: null }))}
                            className="text-gray-400 text-[10px] px-1 hover:text-red-500">×</button>
                        </span>
                      ) : (
                        <button type="button"
                          onClick={() => setVariantAttrDraft(d => ({ ...d, [idx]: { key: '', value: '' } }))}
                          className="text-[10px] font-bold text-violet-600 hover:text-violet-700 px-2 py-0.5 rounded-full hover:bg-violet-50">
                          + atributo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Produtos relacionados (Fase 6) ── */}
          {allProducts.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Produtos relacionados</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Aparecem como "Você também pode gostar" no catálogo público.</p>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2 bg-white">
                {allProducts.map((p: any) => {
                  const selected = relatedIds.includes(p.id)
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setRelatedIds(prev => selected ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                        selected ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-gray-50'
                      }`}>
                      <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                        selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'
                      }`}>
                        {selected && <CheckCircle2 size={10} className="text-white" />}
                      </span>
                      <span className="flex-1 text-xs text-gray-700 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-400 tabular-nums">{money(Number(p.price || 0))}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{relatedIds.length} selecionado(s)</p>
            </div>
          )}

          {/* ── SEO (Fase 6) ── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="mb-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">SEO</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Como o produto aparece em buscas e quando compartilhado.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Título (meta)</label>
                <input type="text" value={(seoValues.meta_title as string) || ''}
                  onChange={e => setSeoValues({ ...seoValues, meta_title: e.target.value })}
                  placeholder={`Padrão: ${name || 'nome do produto'}`}
                  className={inputCls} maxLength={70} />
                <p className="text-[9px] text-gray-400 mt-0.5">{((seoValues.meta_title as string) || '').length}/70</p>
              </div>
              <div>
                <label className={labelCls}>Descrição (meta)</label>
                <input type="text" value={(seoValues.meta_description as string) || ''}
                  onChange={e => setSeoValues({ ...seoValues, meta_description: e.target.value })}
                  placeholder="Resumo curto para Google/WhatsApp"
                  className={inputCls} maxLength={160} />
                <p className="text-[9px] text-gray-400 mt-0.5">{((seoValues.meta_description as string) || '').length}/160</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
            <span className="text-xs font-medium text-gray-600">Produto ativo</span>
            <button type="button" onClick={() => setActive(!active)}
              className={`relative w-10 h-5 rounded-full transition ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
            {isEdit && onDelete && (
              <button onClick={async () => {
                const ok = await confirm({
                  title: 'Excluir produto permanentemente?',
                  message: (
                    <>
                      {name ? <span>O produto <b>{name}</b> sera excluido do catalogo.</span> : 'O produto sera excluido do catalogo.'}{' '}
                      <span className="text-gray-400">Pedidos antigos sao mantidos no historico.</span>
                    </>
                  ),
                  confirmLabel: 'Excluir',
                  cancelLabel: 'Cancelar',
                  variant: 'danger',
                })
                if (ok) onDelete(product.id)
              }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-red-500 text-xs font-semibold hover:bg-red-50 transition">
                <Trash2 size={13} /> Excluir
              </button>
            )}
          </div>
          <button onClick={save} disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-md">
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Produto'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   COLLECTIONS MANAGER (Fase 1)
   ══════════════════════════════════════════════ */
function CollectionsManager({
  products,
  showToast,
}: {
  products: any[]
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [newName, setNewName] = useState('')
  const { confirm } = useConfirm()

  function load() {
    setLoading(true)
    fetch('/api/collections', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => { setCollections(d.collections || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createCollection() {
    if (!newName.trim()) return
    try {
      const r = await fetch('/api/collections', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: newName.trim(), type: 'manual', product_ids: [] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setNewName('')
      showToast('Coleção criada!')
      load()
      setEditing(d.collection)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function saveCollection(c: any) {
    try {
      const r = await fetch(`/api/collections/${c.id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({
          name: c.name,
          description: c.description,
          product_ids: c.product_ids || [],
          is_active: c.is_active !== false,
          position: c.position || 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Coleção atualizada!')
      load()
      setEditing(null)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function deleteCollection(id: string) {
    const coll = collections.find(c => c.id === id)
    const ok = await confirm({
      title: 'Remover colecao?',
      message: coll?.name
        ? <span>A colecao <b>{coll.name}</b> sera removida. <span className="text-gray-400">Os produtos dela continuam no catalogo.</span></span>
        : <>A colecao sera removida. <span className="text-gray-400">Os produtos dela continuam no catalogo.</span></>,
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/collections/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Coleção removida')
    load()
  }

  function toggleProduct(c: any, productId: string) {
    const current = Array.isArray(c.product_ids) ? c.product_ids : []
    const next = current.includes(productId)
      ? current.filter((x: string) => x !== productId)
      : [...current, productId]
    setEditing({ ...c, product_ids: next })
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Criar nova coleção</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Ex: Mais vendidos, Promoções, Premium"
            onKeyDown={e => e.key === 'Enter' && createCollection()}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <button onClick={createCollection} disabled={!newName.trim()}
            className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition">
            Criar
          </button>
        </div>
      </div>

      {collections.length === 0 && (
        <EmptyState icon={Boxes} text="Nenhuma coleção ainda. Crie uma para agrupar produtos." />
      )}

      <div className="space-y-2">
        {collections.map((c: any) => {
          const isEditing = editing?.id === c.id
          const current = isEditing ? editing : c
          const count = (current.product_ids || []).length
          return (
            <div key={c.id} className="bg-white border border-border-light rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                    {!c.is_active && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Inativa</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{count} produto(s) · slug: {c.slug}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(isEditing ? null : c)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-violet-600 hover:bg-violet-50 transition">
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
                  <button onClick={() => deleteCollection(c.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" value={current.name}
                      onChange={e => setEditing({ ...current, name: e.target.value })}
                      placeholder="Nome"
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                    <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <span className="text-xs text-gray-600">Coleção ativa</span>
                      <button type="button"
                        onClick={() => setEditing({ ...current, is_active: !current.is_active })}
                        className={`relative w-9 h-5 rounded-full transition ${current.is_active !== false ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.is_active !== false ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <textarea value={current.description || ''}
                    onChange={e => setEditing({ ...current, description: e.target.value })}
                    rows={2} placeholder="Descrição (opcional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Produtos incluídos</p>
                    <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2 bg-white">
                      {products.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic text-center py-4">Sem produtos no catálogo.</p>
                      ) : products.map((p: any) => {
                        const selected = (current.product_ids || []).includes(p.id)
                        return (
                          <button key={p.id} type="button"
                            onClick={() => toggleProduct(current, p.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                              selected ? 'bg-violet-50 ring-1 ring-violet-300' : 'hover:bg-gray-50'
                            }`}>
                            <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                              selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'
                            }`}>
                              {selected && <CheckCircle2 size={10} className="text-white" />}
                            </span>
                            <span className="flex-1 text-xs text-gray-700 truncate">{p.name}</span>
                            <span className="text-[10px] text-gray-400 tabular-nums">{money(Number(p.price || 0))}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{(current.product_ids || []).length} selecionado(s)</p>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                      Cancelar
                    </button>
                    <button onClick={() => saveCollection(current)}
                      className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition shadow-sm">
                      Salvar coleção
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   ATTRIBUTE DEFINITIONS MANAGER (Fase 2)
   ══════════════════════════════════════════════ */
type AttrType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi_select' | 'color' | 'date'

interface AttributeDef {
  id: string
  key: string
  label: string
  type: AttrType
  options: string[]
  required: boolean
  is_filter: boolean
  position: number
}

const ATTR_TYPE_LABELS: Record<AttrType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  boolean: 'Sim / Não',
  select: 'Lista (1 opção)',
  multi_select: 'Lista (várias opções)',
  color: 'Cor',
  date: 'Data',
}

function AttributeDefinitionsManager({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [defs, setDefs] = useState<AttributeDef[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AttributeDef | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<AttrType>('text')
  const { confirm } = useConfirm()

  function load() {
    setLoading(true)
    fetch('/api/attribute-definitions', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => { setDefs(d.definitions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createDef() {
    if (!newLabel.trim()) return
    try {
      const r = await fetch('/api/attribute-definitions', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ label: newLabel.trim(), type: newType, is_filter: true }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      setNewLabel('')
      setNewType('text')
      showToast('Atributo criado!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function saveDef(def: AttributeDef) {
    try {
      const r = await fetch(`/api/attribute-definitions/${def.id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({
          label: def.label,
          type: def.type,
          options: def.options,
          required: def.required,
          is_filter: def.is_filter,
          position: def.position,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Atributo atualizado!')
      setEditing(null)
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function deleteDef(id: string) {
    const def = defs.find(d => d.id === id)
    const ok = await confirm({
      title: 'Excluir atributo?',
      message: (
        <>
          {def?.label ? <span>O atributo <b>{def.label}</b> sera excluido.</span> : 'O atributo sera excluido.'}{' '}
          <span className="text-gray-400">Produtos que o usam mantem o valor, mas perdem a estrutura.</span>
        </>
      ),
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!ok) return
    await fetch(`/api/attribute-definitions/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Atributo removido')
    load()
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border-light p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Criar novo atributo</p>
        <p className="text-[10px] text-gray-400 mb-3">Atributos viram inputs no formulário de produto e filtros no catálogo público.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Ex: Cor, Tamanho, Peso, Sabor, Material..."
            onKeyDown={e => e.key === 'Enter' && createDef()}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <select value={newType} onChange={e => setNewType(e.target.value as AttrType)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
            {Object.entries(ATTR_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={createDef} disabled={!newLabel.trim()}
            className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition">
            Criar
          </button>
        </div>
      </div>

      {defs.length === 0 ? (
        <EmptyState icon={FileText} text="Nenhum atributo definido ainda." />
      ) : (
        <div className="space-y-2">
          {defs.map(def => {
            const isEditing = editing?.id === def.id
            const current = isEditing ? editing : def
            const isList = current.type === 'select' || current.type === 'multi_select'
            return (
              <div key={def.id} className="bg-white border border-border-light rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 truncate">{def.label}</p>
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ATTR_TYPE_LABELS[def.type]}</span>
                      {def.required && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">obrigatório</span>}
                      {!def.is_filter && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">oculto do filtro</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-mono">key: {def.key}</p>
                    {isList && def.options.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-0.5">opções: {def.options.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(isEditing ? null : def)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-violet-600 hover:bg-violet-50 transition">
                      {isEditing ? 'Cancelar' : 'Editar'}
                    </button>
                    <button onClick={() => deleteDef(def.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Nome exibido</label>
                        <input type="text" value={current.label}
                          onChange={e => setEditing({ ...current, label: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Tipo</label>
                        <select value={current.type}
                          onChange={e => setEditing({ ...current, type: e.target.value as AttrType })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                          {Object.entries(ATTR_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                    </div>

                    {(current.type === 'select' || current.type === 'multi_select') && (
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Opções (separadas por vírgula)</label>
                        <input type="text" value={current.options.join(', ')}
                          onChange={e => setEditing({ ...current, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          placeholder="Ex: Pequeno, Médio, Grande"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button"
                        onClick={() => setEditing({ ...current, required: !current.required })}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 border ${current.required ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'} text-xs`}>
                        <span className={current.required ? 'text-amber-700 font-semibold' : 'text-gray-600'}>Obrigatório</span>
                        <span className={`w-9 h-5 rounded-full relative transition ${current.required ? 'bg-amber-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.required ? 'translate-x-4' : ''}`} />
                        </span>
                      </button>
                      <button type="button"
                        onClick={() => setEditing({ ...current, is_filter: !current.is_filter })}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 border ${current.is_filter ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'} text-xs`}>
                        <span className={current.is_filter ? 'text-emerald-700 font-semibold' : 'text-gray-600'}>Mostrar como filtro</span>
                        <span className={`w-9 h-5 rounded-full relative transition ${current.is_filter ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${current.is_filter ? 'translate-x-4' : ''}`} />
                        </span>
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setEditing(null)}
                        className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                        Cancelar
                      </button>
                      <button onClick={() => saveDef(current)}
                        className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition shadow-sm">
                        Salvar atributo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DESIGN REDIRECT
   ══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   MESSAGES VIEW (Sessions)
   ══════════════════════════════════════════════ */
export function MessagesView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sessions', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setSessions(d.sessions || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={5} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Mensagens</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{sessions.length} conversas</p>
      </div>
      {sessions.length === 0 ? (
        <EmptyState icon={MessageSquare} text="Nenhuma conversa ativa no momento" />
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any, i: number) => (
            <div key={s.id || i} className="bg-white rounded-2xl border border-border-light p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center text-white font-bold text-sm shrink-0">
                {(s.contact_name || s.phone || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{s.contact_name || s.phone || 'Contato'}</p>
                <p className="text-xs text-gray-400 truncate">{s.last_message || 'Sem mensagens'}</p>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">{dtFull(s.updated_at || s.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   AGENT VIEW (AI Workspace)
   ══════════════════════════════════════════════ */
/* ── Squad Rules (persistent, functional) ── */
const SQUAD_RULES_KEY = 'leadcapture:squad-rules'
function SquadRules({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const stored = (() => { try { return JSON.parse(localStorage.getItem(SQUAD_RULES_KEY) || '{}') } catch { return {} } })()
  const [rules, setRules] = useState({
    escalate_on_request: stored.escalate_on_request !== false,
    escalate_after_3: stored.escalate_after_3 !== false,
    notify_high_value: stored.notify_high_value === true,
    pause_outside_hours: stored.pause_outside_hours === true,
  })

  function toggle(key: keyof typeof rules) {
    const next = { ...rules, [key]: !rules[key] }
    setRules(next)
    localStorage.setItem(SQUAD_RULES_KEY, JSON.stringify(next))
    // Also persist to store settings via API
    fetch('/api/storefront/stores', { headers: getHeaders() }).then(r => r.json()).then(async d => {
      const stores = d.stores || []
      if (!stores.length) return
      await fetch(`/api/storefront/stores/${stores[0].id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ settings: { squad_rules: next } }),
      })
    }).catch(() => {})
    showToast(`Regra ${!rules[key] ? 'ativada' : 'desativada'}`)
  }

  const items = [
    { key: 'escalate_on_request' as const, label: 'Escalar para humano se lead pedir', desc: 'Detecta "falar com atendente" e similares', active: true },
    { key: 'escalate_after_3' as const, label: 'Escalar apos 3 mensagens sem resolucao', desc: 'Se a IA nao resolver em 3 trocas', active: true },
    { key: 'notify_high_value' as const, label: 'Notificar admin em pedidos acima de R$ 500', desc: 'Pedidos de alto valor recebem atencao humana' },
    { key: 'pause_outside_hours' as const, label: 'Pausar IA fora do horario comercial', desc: 'Das 18h as 8h o atendimento e manual' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Regras de Escalonamento</p>
      {items.map(r => (
        <div key={r.key} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
          <div>
            <p className="text-xs font-semibold text-gray-700">{r.label}</p>
            <p className="text-[10px] text-gray-400">{r.desc}</p>
          </div>
          <button type="button" onClick={() => toggle(r.key)}
            className={`relative w-11 h-6 rounded-full transition shrink-0 ${rules[r.key] ? 'bg-emerald-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rules[r.key] ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function AgentView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'config' | 'squad' | 'training' | 'skills'>('overview')
  const [saving, setSaving] = useState(false)

  // Config state
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [objective, setObjective] = useState('')
  const [businessContext, setBusinessContext] = useState('')
  const [communicationRules, setCommunicationRules] = useState('')
  const [trainingNotes, setTrainingNotes] = useState('')
  const [preferredTerms, setPreferredTerms] = useState('')
  const [forbiddenTerms, setForbiddenTerms] = useState('')
  const [includeEmojis, setIncludeEmojis] = useState(true)
  const [maxLength, setMaxLength] = useState('500')
  const [globalAiEnabled, setGlobalAiEnabled] = useState(false)
  const [globalAiReason, setGlobalAiReason] = useState('')

  // Training
  const [trainingText, setTrainingText] = useState('')
  const [trainingCategory, setTrainingCategory] = useState('faq')
  const [kbEntries, setKbEntries] = useState<any[]>([])

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/ai/workspace-overview', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/ai/agent-profile', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/inbox/ai-global-state', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/knowledge-base?limit=50', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ entries: [] })),
    ]).then(([ws, profile, aiState, kb]) => {
      setData(ws.overview || ws)
      const p = profile.profile || {}
      setAgentName(p.agent_name || '')
      setTone(p.tone || 'friendly')
      setObjective(p.objective || '')
      setBusinessContext(p.business_context || '')
      setCommunicationRules(p.communication_rules || '')
      setTrainingNotes(p.training_notes || '')
      setPreferredTerms(Array.isArray(p.preferred_terms) ? p.preferred_terms.join(', ') : (p.preferred_terms || ''))
      setForbiddenTerms(Array.isArray(p.forbidden_terms) ? p.forbidden_terms.join(', ') : (p.forbidden_terms || ''))
      setIncludeEmojis(p.include_emojis !== false)
      setMaxLength(String(p.max_length || 500))
      const g = aiState.global_ai || {}
      setGlobalAiEnabled(g.enabled !== false && !g.reason?.includes('Pausa'))
      setGlobalAiReason(g.reason || '')
      setKbEntries(kb.entries || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function saveProfile() {
    setSaving(true)
    try {
      const splitCsv = (s: string) => s.split(/[,\n]/).map(t => t.trim()).filter(Boolean)
      await fetch('/api/ai/agent-profile', {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({
          agent_name: agentName,
          tone,
          objective,
          business_context: businessContext,
          communication_rules: communicationRules,
          training_notes: trainingNotes,
          preferred_terms: splitCsv(preferredTerms),
          forbidden_terms: splitCsv(forbiddenTerms),
          include_emojis: includeEmojis,
          max_length: Number(maxLength),
        }),
      })
      showToast('Perfil salvo!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  async function toggleGlobalAi() {
    const newState = !globalAiEnabled
    try {
      await fetch('/api/inbox/ai-global-state', {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ enabled: newState, reason: newState ? 'Ativado pelo admin' : 'Pausado pelo admin' }),
      })
      setGlobalAiEnabled(newState)
      showToast(newState ? 'IA ativada globalmente!' : 'IA pausada globalmente')
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function addTraining() {
    const txt = trainingText.trim()
    if (!txt) return showToast('Texto obrigatorio', 'err')
    try {
      /* Backend exige { title, content }. Usamos o primeiro pedaço do texto como title (resumo)
       * e o texto inteiro como content. Categoria vai em campo separado. */
      const title = txt.split(/[\n\.\?]/)[0].slice(0, 120).trim() || txt.slice(0, 120)
      const r = await fetch('/api/knowledge-base', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ title, content: txt, category: trainingCategory, active: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status} ao salvar conhecimento`)
      setTrainingText('')
      showToast('Conhecimento adicionado!')
      load()
    } catch (e: any) { showToast(e.message || 'Erro ao adicionar conhecimento', 'err') }
  }

  async function deleteKb(id: string) {
    try {
      await fetch(`/api/knowledge-base/${id}`, { method: 'DELETE', headers: getHeaders() })
      setKbEntries(prev => prev.filter(e => e.id !== id))
      showToast('Removido')
    } catch {}
  }

  if (loading) return <Skeleton rows={8} />

  const profile = data?.profile || {}
  const training = data?.training || {}
  const whatsapp = data?.whatsapp || {}
  const score = data?.readiness_score || 0

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button type="button" onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  const tabs = [
    { key: 'overview', label: 'Visao Geral' },
    { key: 'config', label: 'Configuracao' },
    { key: 'squad', label: 'Squad & Atendimento' },
    { key: 'training', label: 'Treinamento' },
    { key: 'skills', label: 'Skills' },
  ]

  // Skills departments
  const departments: { name: string; Icon: LucideIcon; color: string; skills: { name: string; status: string }[] }[] = [
    { name: 'Vendas', Icon: ShoppingCart, color: 'from-emerald-500 to-teal-600', skills: [
      { name: 'Closer de Vendas', status: 'active' }, { name: 'Qualificador', status: 'active' },
      { name: 'Quebra de Objecoes', status: 'beta' }, { name: 'Upsell & Cross-sell', status: 'planned' },
    ]},
    { name: 'Marketing', Icon: Megaphone, color: 'from-violet-500 to-purple-600', skills: [
      { name: 'Copywriter', status: 'active' }, { name: 'Segmentacao', status: 'beta' },
      { name: 'Nutricao de Leads', status: 'active' }, { name: 'Conteudo', status: 'planned' },
    ]},
    { name: 'Atendimento', Icon: Headphones, color: 'from-blue-500 to-indigo-600', skills: [
      { name: 'Primeiro Contato', status: 'active' }, { name: 'FAQ Inteligente', status: 'active' },
      { name: 'Escalacao Humano', status: 'active' }, { name: 'Detector de Bot', status: 'active' },
      { name: 'Curador de Contexto', status: 'active' }, { name: 'Pesquisa Satisfacao', status: 'beta' },
    ]},
    { name: 'Logistica', Icon: Truck, color: 'from-amber-500 to-orange-600', skills: [
      { name: 'Rastreamento', status: 'active' }, { name: 'Agendamento', status: 'beta' },
    ]},
    { name: 'Inteligencia', Icon: Brain, color: 'from-pink-500 to-rose-600', skills: [
      { name: 'Sentimento', status: 'active' }, { name: 'Intencao', status: 'active' },
      { name: 'Lead Scoring', status: 'beta' }, { name: 'Predicao', status: 'planned' },
    ]},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Agente IA</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Gemini 2.5 Flash · {agentName || 'Assistente'}</p>
        </div>
        {/* Global AI toggle */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${globalAiEnabled ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-red-50 ring-1 ring-red-200'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${globalAiEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-xs font-bold ${globalAiEnabled ? 'text-emerald-700' : 'text-red-700'}`}>{globalAiEnabled ? 'IA Ativa' : 'IA Pausada'}</span>
            <Toggle value={globalAiEnabled} onChange={toggleGlobalAi} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (<>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Prontidao</p>
                <p className="text-4xl font-extrabold mt-1">{score}<span className="text-lg text-white/50">%</span></p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{profile.agent_name || 'Agente'}</p>
                <p className="text-[10px] text-white/50">{profile.tone === 'friendly' ? 'Tom amigavel' : profile.tone} · {profile.language}</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/80 rounded-full transition-all" style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-border-light p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ${whatsapp.autonomous ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-xs font-bold text-gray-700">WhatsApp</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-extrabold text-gray-900">{training.total_entries || 0}</p>
                <p className="text-[8px] text-gray-400">Treinamentos</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-extrabold text-gray-900">{kbEntries.length}</p>
                <p className="text-[8px] text-gray-400">Base Conhec.</p>
              </div>
            </div>
          </div>
        </div>
        {/* ── Checklist de prontidão: o que falta para 100% ── */}
        {Array.isArray(data?.readiness_checklist) && (() => {
          const checklist = data.readiness_checklist as Array<{
            id: string
            group: 'profile' | 'training' | 'automation' | 'performance'
            title: string
            description: string
            why: string
            points_earned: number
            points_max: number
            done: boolean
            action_tab: 'config' | 'squad' | 'training' | 'overview'
            action_field?: string
            cta_label: string
          }>
          const pending = checklist.filter(c => !c.done)
          const completed = checklist.filter(c => c.done)

          if (pending.length === 0) {
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Agente 100% configurado</p>
                  <p className="text-[11px] text-emerald-600">Todos os {completed.length} itens completos.</p>
                </div>
              </div>
            )
          }

          const groupOrder: Array<'profile' | 'training' | 'automation' | 'performance'> = ['profile', 'training', 'automation', 'performance']
          const groupLabels: Record<string, string> = {
            profile: 'Identidade e regras do agente',
            training: 'Base de conhecimento',
            automation: 'Automação',
            performance: 'Performance da operação',
          }
          const groupIcons: Record<string, typeof Brain> = {
            profile: Brain,
            training: FileText,
            automation: Bot,
            performance: BarChart3,
          }

          function goToItem(item: typeof pending[0]) {
            setTab(item.action_tab as any)
            if (item.action_field) {
              setTimeout(() => {
                const el = document.querySelector(`[data-field="${item.action_field}"]`)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  const input = (el as HTMLElement).parentElement?.querySelector('input, textarea, select') as HTMLElement | null
                  input?.focus()
                }
              }, 200)
            }
          }

          return (
            <div className="bg-white rounded-2xl border border-border-light p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Tarefas para atingir 100%</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{pending.length} item(ns) pendente(s) · {completed.length} completo(s)</p>
                </div>
              </div>

              <div className="space-y-4">
                {groupOrder.filter(g => pending.some(p => p.group === g)).map(group => {
                  const items = pending.filter(p => p.group === group)
                  const GroupIcon = groupIcons[group]
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-2">
                        <GroupIcon size={13} strokeWidth={1.75} className="text-gray-400" />
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{groupLabels[group]}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {items.map(item => (
                          <div key={item.id} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2 hover:border-violet-300 hover:bg-violet-50/30 transition">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-gray-900 leading-snug">{item.title}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>
                              </div>
                              <span className="text-[10px] font-bold text-gray-400 tabular-nums whitespace-nowrap shrink-0">
                                +{item.points_max}pt
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 italic leading-relaxed">{item.why}</p>
                            <button
                              onClick={() => goToItem(item)}
                              className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 transition mt-0.5"
                            >
                              {item.cta_label}
                              <ArrowRight size={11} strokeWidth={2.25} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {completed.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-gray-400 hover:text-gray-600 list-none flex items-center gap-1.5 select-none">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      {completed.length} item(ns) já completo(s)
                      <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 pl-5">
                      {completed.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                          <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                          <span className="truncate">{item.title}</span>
                          <span className="text-[10px] text-gray-300 tabular-nums">+{item.points_earned}pt</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )
        })()}

        {profile.objective && (
          <div className="bg-white rounded-2xl border border-border-light p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1.5">Diretriz</p>
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{profile.objective}</p>
          </div>
        )}
      </>)}

      {/* ── Tab: Config ── */}
      {tab === 'config' && (<>
        <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Nome do Agente</label>
              <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Ex: Consultor Alho Pronto"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tom de voz</label>
              <select value={tone} onChange={e => setTone(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                <option value="friendly">Amigavel</option>
                <option value="professional">Profissional</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Objetivo do Agente</label>
            <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} placeholder="O que o agente deve fazer..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
          </div>
          <div>
            <label data-field="business_context" className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Contexto do Negocio</label>
            <textarea value={businessContext} onChange={e => setBusinessContext(e.target.value)} rows={3} placeholder="Descreva seu negocio, produtos, diferenciais..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
          </div>
          <div>
            <label data-field="communication_rules" className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Regras de Comunicacao</label>
            <textarea value={communicationRules} onChange={e => setCommunicationRules(e.target.value)} rows={3}
              placeholder="Como o agente deve escrever: tom, formalidade, limites, padroes de fechamento..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
          </div>
          <div>
            <label data-field="training_notes" className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Notas de Treinamento</label>
            <textarea value={trainingNotes} onChange={e => setTrainingNotes(e.target.value)} rows={3}
              placeholder="Aprendizados internos, padroes de objecao, scripts da equipe..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label data-field="preferred_terms" className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Termos Preferidos</label>
              <input type="text" value={preferredTerms} onChange={e => setPreferredTerms(e.target.value)}
                placeholder="parceiro, sob medida, premium (separe por virgula)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
              <p className="text-[10px] text-gray-400 mt-1">Palavras que a marca quer ver nas respostas.</p>
            </div>
            <div>
              <label data-field="forbidden_terms" className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Termos Proibidos</label>
              <input type="text" value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)}
                placeholder="barato, mais ou menos, nome do concorrente (separe por virgula)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
              <p className="text-[10px] text-gray-400 mt-1">Palavras que NUNCA podem aparecer nas respostas.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
              <span className="text-xs font-medium text-gray-600">Usar emojis</span>
              <Toggle value={includeEmojis} onChange={() => setIncludeEmojis(!includeEmojis)} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase mb-1 block">Max. caracteres</label>
              <input type="number" value={maxLength} onChange={e => setMaxLength(e.target.value)} min={100} max={2000}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
          </div>
          <button onClick={saveProfile} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition shadow-sm">
            {saving ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </>)}

      {/* ── Tab: Squad & Atendimento ── */}
      {tab === 'squad' && (<>
        {/* Global AI control */}
        <div className={`rounded-2xl p-5 ${globalAiEnabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl grid place-items-center ${globalAiEnabled ? 'bg-emerald-500' : 'bg-red-500'}`}>
                <Bot size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Autoatendimento Global</p>
                <p className="text-[10px] text-gray-500">{globalAiEnabled ? 'IA respondendo autonomamente' : 'IA pausada — respostas manuais'}</p>
              </div>
            </div>
            <Toggle value={globalAiEnabled} onChange={toggleGlobalAi} />
          </div>
        </div>

        {/* Squad modes */}
        <div className="bg-white rounded-2xl border border-border-light p-5 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Modos de atendimento</p>
          {([
            { key: 'autonomous', label: 'Autonomo', desc: 'IA responde sozinha, escala para humano quando necessario', Icon: Bot, active: globalAiEnabled },
            { key: 'copilot', label: 'Co-piloto', desc: 'IA sugere respostas, humano aprova antes de enviar', Icon: BadgeCheck, active: false },
            { key: 'manual', label: 'Manual', desc: 'Somente respostas humanas, IA desativada', Icon: User, active: !globalAiEnabled },
          ] as { key: string; label: string; desc: string; Icon: LucideIcon; active: boolean }[]).map(m => (
            <div key={m.key} className={`flex items-center gap-3 p-3.5 rounded-xl border transition ${m.active ? 'border-violet-300 bg-violet-50' : 'border-gray-200'}`}>
              <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${m.active ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                <m.Icon size={18} strokeWidth={1.75} />
              </span>
              <div className="flex-1">
                <p className={`text-sm font-bold ${m.active ? 'text-violet-700' : 'text-gray-700'}`}>{m.label}</p>
                <p className="text-[10px] text-gray-400">{m.desc}</p>
              </div>
              {m.active && <div className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse shrink-0" />}
            </div>
          ))}
        </div>

        {/* Rules — functional toggles */}
        <SquadRules showToast={showToast} />
      </>)}

      {/* ── Tab: Training ── */}
      {tab === 'training' && (<>
        <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
          <p className="text-sm font-bold text-gray-900">Adicionar Conhecimento</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <textarea value={trainingText} onChange={e => setTrainingText(e.target.value)} rows={2}
                placeholder="Ex: Nosso alho descascado tipo A e ideal para restaurantes que processam grandes volumes..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
            </div>
            <div className="flex flex-col gap-2">
              <select value={trainingCategory} onChange={e => setTrainingCategory(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-violet-200">
                <option value="faq">FAQ</option>
                <option value="produto">Produto</option>
                <option value="preco">Preco</option>
                <option value="entrega">Entrega</option>
                <option value="geral">Geral</option>
              </select>
              <button onClick={addTraining}
                className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition">Adicionar</button>
            </div>
          </div>
        </div>

        {/* KB entries */}
        <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">Base de Conhecimento</p>
            <span className="text-[10px] text-gray-400">{kbEntries.length} entradas</span>
          </div>
          {kbEntries.length === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-gray-400">Nenhum conhecimento cadastrado</p></div>
          ) : kbEntries.map((e: any) => (
            <div key={e.id} className="px-4 py-3 border-b border-gray-100 last:border-0 flex items-start gap-3">
              <span className="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded mt-0.5 shrink-0">{e.category || 'geral'}</span>
              <p className="text-xs text-gray-600 flex-1 line-clamp-2">{e.question || e.answer || e.content}</p>
              <button onClick={() => deleteKb(e.id)} className="text-gray-400 hover:text-red-500 transition shrink-0 p-1"><X size={12} /></button>
            </div>
          ))}
        </div>
      </>)}

      {/* ── Tab: Skills ── */}
      {tab === 'skills' && (<>
        <div className="space-y-3">
          {departments.map(dept => (
            <div key={dept.name} className="bg-white rounded-2xl border border-border-light overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${dept.color} grid place-items-center text-white shadow-sm`}><dept.Icon size={16} strokeWidth={1.75} /></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{dept.name}</p>
                  <p className="text-[10px] text-gray-400">{dept.skills.filter(s => s.status === 'active').length}/{dept.skills.length} ativas</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {dept.skills.map(skill => (
                  <div key={skill.name} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${skill.status === 'active' ? 'bg-emerald-500' : skill.status === 'beta' ? 'bg-violet-500' : 'bg-gray-300'}`} />
                    <span className="text-xs font-semibold text-gray-800 flex-1">{skill.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      skill.status === 'active' ? 'bg-emerald-50 text-emerald-700' : skill.status === 'beta' ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-500'
                    }`}>{skill.status === 'active' ? 'Ativa' : skill.status === 'beta' ? 'Beta' : 'Em breve'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <span className="text-[11px] font-semibold text-gray-500">Motor: Gemini 2.0 Flash</span>
          <span className="text-[9px] text-gray-400">Alto raciocinio · Baixo custo</span>
        </div>
      </>)}
    </div>
  )
}
export function NotificationsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/notifications', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setNotifications(d.notifications || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={4} />

  const priorityIcon = (p: string) => {
    if (p === 'high' || p === 'urgent') return 'bg-red-50 text-red-500'
    if (p === 'medium') return 'bg-amber-50 text-amber-500'
    return 'bg-blue-50 text-blue-500'
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Notificacoes</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{notifications.length} notificacoes</p>
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} text="Nenhuma notificacao" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any, i: number) => (
            <div key={n.notification_id || i} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex items-start gap-3 ${n.read ? 'border-gray-100' : 'border-blue-200 bg-blue-50/30'}`}>
              <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${priorityIcon(n.priority)}`}>
                <Bell size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{dtFull(n.created_at)}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DOMAIN VIEW (Custom Domains)
   ══════════════════════════════════════════════ */
export function DomainView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [store, setStore] = useState<any>(null)
  const [domains, setDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [instructions, setInstructions] = useState<any>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<any>(null)

  function load() {
    setLoading(true)
    fetch('/api/storefront/stores', { headers: getHeaders() })
      .then(r => r.json()).then(async d => {
        const stores = d.stores || []
        if (!stores.length) { setLoading(false); return }
        const s = stores[0]
        setStore(s)
        const dr = await fetch(`/api/storefront/stores/${s.id}/domains`, { headers: getHeaders() })
        const dd = await dr.json()
        setDomains(dd.domains || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function addDomain() {
    if (!newDomain.trim() || !store?.id) return
    setAdding(true)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Dominio adicionado!')
      setNewDomain('')
      load()
      // Auto-fetch instructions
      loadInstructions(newDomain.trim().toLowerCase())
    } catch (e: any) { showToast(e.message, 'err') }
    setAdding(false)
  }

  async function loadInstructions(domain: string) {
    if (!store?.id) return
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/instructions`, { headers: getHeaders() })
      const d = await r.json()
      setInstructions(d.instructions || null)
    } catch { setInstructions(null) }
  }

  async function verifyDomain(domain: string) {
    if (!store?.id) return
    setVerifying(domain)
    setVerifyResult(null)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/verify`, { method: 'POST', headers: getHeaders() })
      const d = await r.json()
      setVerifyResult(d)
      if (d.verified) {
        /* Backend auto-provisiona quando o A record aponta correto. */
        if (d.provisioned) {
          showToast('Pronto! Domínio conectado com HTTPS ativo.')
        } else if (d.checks?.a_points_to_server === false) {
          showToast('Verificado! Falta apontar o registro A — confira abaixo.', 'err')
        } else {
          showToast('Verificado! Ativando HTTPS, aguarde 1 min…')
        }
        load()
      } else {
        showToast('Ainda não deu — confira o DNS abaixo', 'err')
      }
    } catch (e: any) { showToast(e.message, 'err') }
    setVerifying(null)
  }

  async function setPrimary(domain: string) {
    if (!store?.id) return
    try {
      await fetch(`/api/storefront/stores/${store.id}/domains/${domain}/primary`, { method: 'PATCH', headers: getHeaders() })
      showToast('Dominio definido como principal!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function removeDomain(domain: string) {
    if (!confirm(`Remover dominio ${domain}?`)) return
    try {
      await fetch(`/api/storefront/stores/${store.id}/domains/${domain}`, { method: 'DELETE', headers: getHeaders() })
      showToast('Dominio removido')
      load()
      if (instructions?.domain === domain) setInstructions(null)
    } catch (e: any) { showToast(e.message, 'err') }
  }

  if (loading) return <Skeleton rows={5} />

  const hasDomains = domains.length > 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Dominio Personalizado</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Conecte seu dominio ao catalogo</p>
      </div>

      {/* Current catalog URL */}
      {store?.slug && (
        <div className="bg-white rounded-2xl border border-border-light p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">URL gratuita do catalogo</p>
            <a href={`/catalogo/${store.slug}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:underline mt-1 block">
              {window.location.origin}/catalogo/{store.slug}
            </a>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Sempre ativo</span>
        </div>
      )}

      {/* No domains — onboarding */}
      {!hasDomains && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl grid place-items-center mx-auto mb-4 shadow-sm">
            <Globe size={28} className="text-blue-500" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-2">Conecte seu dominio</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed mb-4">
            Tenha seu catalogo em um endereco profissional como <strong>www.suaempresa.com.br</strong>.
            E simples: registre um dominio, adicione aqui e siga as instrucoes de DNS.
          </p>

          <div className="bg-white rounded-xl p-4 max-w-md mx-auto text-left space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Como funciona</p>
            <div className="space-y-2.5">
              {[
                { step: '1', title: 'Registre um dominio', desc: 'Em registradores como Registro.br, GoDaddy, Hostinger, Namecheap' },
                { step: '2', title: 'Adicione aqui', desc: 'Digite o dominio no campo abaixo e clique Adicionar' },
                { step: '3', title: 'Configure o DNS', desc: 'Siga as instrucoes de DNS que aparecerao automaticamente' },
                { step: '4', title: 'Verifique', desc: 'Clique em Verificar para confirmar que o DNS esta correto' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-blue-500 text-white text-[10px] font-bold grid place-items-center shrink-0">{s.step}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-800">{s.title}</p>
                    <p className="text-[10px] text-gray-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add domain */}
      <div className="bg-white rounded-2xl border border-border-light p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{hasDomains ? 'Adicionar outro dominio' : 'Adicionar dominio'}</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
              placeholder="meusite.com.br"
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 placeholder:text-gray-300" />
          </div>
          <button onClick={addDomain} disabled={adding || !newDomain.trim()}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
            {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Domain list */}
      {hasDomains && (
        <div className="space-y-2.5">
          {domains.map((d: any) => {
            const verified = d.verification_status === 'verified'
            const isPrimary = d.is_primary
            return (
              <div key={d.domain} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden ${verified ? 'border-emerald-200' : 'border-amber-200'}`}>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${verified ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      <Globe size={18} className={verified ? 'text-emerald-500' : 'text-amber-500'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{d.domain}</p>
                        {isPrimary && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full ring-1 ring-blue-200">PRINCIPAL</span>}
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {verified ? <><CheckCircle2 size={10} strokeWidth={2.25} /> Verificado</> : <><Clock size={10} strokeWidth={2.25} /> Pendente verificacao</>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!verified && (
                      <button onClick={() => { loadInstructions(d.domain); verifyDomain(d.domain) }}
                        disabled={verifying === d.domain}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 transition">
                        {verifying === d.domain ? 'Verificando...' : 'Verificar'}
                      </button>
                    )}
                    <button onClick={() => loadInstructions(d.domain)}
                      className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 text-[11px] font-semibold hover:bg-gray-100 transition">
                      DNS
                    </button>
                    {!isPrimary && verified && (
                      <button onClick={() => setPrimary(d.domain)}
                        className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-semibold hover:bg-violet-100 transition">
                        Primario
                      </button>
                    )}
                    <button onClick={() => removeDomain(d.domain)}
                      className="px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DNS Instructions */}
      {instructions && <DnsInstructionsCard instructions={instructions} onClose={() => setInstructions(null)} showToast={showToast} />}

      {/* Verify result — friendly checklist */}
      {verifyResult && !verifyResult.verified && verifyResult.checks && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-[13px] font-bold text-amber-900">Ainda não detectamos o DNS</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Confira abaixo o que está faltando. Se você acabou de salvar no provedor, aguarde 5–10 min e tente de novo.
              </p>
            </div>
          </div>
          <div className="space-y-1.5 ml-7">
            <DnsCheckRow
              ok={verifyResult.checks.txt_verified}
              label="Registro TXT de verificação"
              hint="Cria o TXT mostrado nas instruções acima."
            />
            <DnsCheckRow
              ok={verifyResult.checks.a_points_to_server || verifyResult.checks.cname_verified}
              label={`Apontamento do domínio${verifyResult.checks.expected_ip ? ` para ${verifyResult.checks.expected_ip}` : ''}`}
              hint={
                verifyResult.checks.a_records?.length && verifyResult.checks.expected_ip && !verifyResult.checks.a_points_to_server
                  ? `Encontramos: ${verifyResult.checks.a_records.join(', ')} (deveria ser ${verifyResult.checks.expected_ip})`
                  : 'Cria o registro A mostrado nas instruções acima.'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   DNS Instructions card — clean table, plain
   language. No "ALIAS_OR_A" jargon, just a
   row-by-row "what to type into your DNS panel".
   ────────────────────────────────────────────── */
function DnsInstructionsCard({
  instructions,
  onClose,
  showToast,
}: {
  instructions: any
  onClose: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copy(value: string, key: string) {
    try {
      navigator.clipboard.writeText(value)
      setCopiedKey(key)
      showToast('Copiado!')
      setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      showToast('Falha ao copiar', 'err')
    }
  }

  const txt = instructions.verification
  const conn = instructions.connection
  const isApex = conn?.host === '@'

  /* Each row in the DNS table — Type / Name / Value */
  const rows: { label: string; type: string; host: string; value: string; key: string }[] = []
  if (txt) {
    rows.push({
      label: '1. Verificação',
      type: 'TXT',
      host: txt.host.replace(`.${instructions.domain}`, ''),
      value: txt.value,
      key: 'txt',
    })
  }
  if (conn) {
    rows.push({
      label: '2. Apontamento',
      type: conn.type,
      host: conn.host,
      value: conn.value,
      key: 'conn',
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 mb-1">
            DNS para {instructions.domain}
          </p>
          <p className="text-[13px] text-gray-700 leading-relaxed">
            No painel do seu registrador (Hostinger, Registro.br, GoDaddy, Namecheap…), entre em{' '}
            <strong>DNS / Zone Editor</strong> e crie estes <strong>2 registros</strong>:
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="p-1.5 rounded-lg hover:bg-gray-100 transition shrink-0"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* DNS records table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[80px_120px_1fr_44px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          <span>Tipo</span>
          <span>Nome / Host</span>
          <span>Valor</span>
          <span></span>
        </div>
        {rows.map(r => (
          <div
            key={r.key}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[80px_120px_1fr_44px] gap-x-3 gap-y-1.5 px-4 py-3 border-b border-gray-100 last:border-b-0 items-center"
          >
            <div className="sm:col-auto col-span-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider sm:hidden mb-1">
                {r.label}
              </p>
              <span className="inline-flex items-center h-6 px-2 rounded-md bg-gray-900 text-white text-[11px] font-mono font-bold">
                {r.type}
              </span>
            </div>
            <div className="sm:col-auto">
              <p className="text-[9px] font-bold text-gray-400 uppercase sm:hidden mb-0.5">Nome</p>
              <button
                onClick={() => copy(r.host, `${r.key}-host`)}
                className="text-[12px] font-mono font-semibold text-gray-900 hover:text-blue-600 inline-flex items-center gap-1.5 group"
              >
                <span>{r.host}</span>
                {copiedKey === `${r.key}-host` ? (
                  <CheckCircle2 size={11} strokeWidth={2.5} className="text-emerald-500" />
                ) : (
                  <Copy size={11} strokeWidth={1.75} className="text-gray-300 group-hover:text-gray-500" />
                )}
              </button>
            </div>
            <div className="sm:col-auto col-span-2 min-w-0">
              <p className="text-[9px] font-bold text-gray-400 uppercase sm:hidden mb-0.5">Valor</p>
              <button
                onClick={() => copy(r.value, `${r.key}-value`)}
                className="text-[12px] font-mono font-semibold text-gray-900 hover:text-blue-600 inline-flex items-start gap-1.5 group break-all text-left"
              >
                <span>{r.value}</span>
                {copiedKey === `${r.key}-value` ? (
                  <CheckCircle2 size={11} strokeWidth={2.5} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Copy size={11} strokeWidth={1.75} className="text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5" />
                )}
              </button>
            </div>
            <div className="hidden sm:block" />
          </div>
        ))}
      </div>

      {/* Plain-language tips */}
      <div className="space-y-2">
        {isApex && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <Info size={14} className="text-blue-600 shrink-0 mt-0.5" strokeWidth={2} />
            <div className="text-[12px] text-blue-900 leading-relaxed">
              <p className="font-semibold mb-0.5">Sobre o tipo "A"</p>
              <p>
                Se o painel do seu provedor mostrar também as opções <strong>ALIAS</strong> ou{' '}
                <strong>ANAME</strong>, ainda assim escolha <strong>A</strong>. Funciona em todos os
                registradores. No campo <strong>Nome</strong> use <code className="bg-white px-1 rounded">@</code>{' '}
                (que significa "raiz do domínio") — alguns painéis aceitam deixar em branco também.
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <Clock size={14} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-[12px] text-amber-900 leading-relaxed">
            Depois de salvar os registros, aguarde de <strong>5 a 30 minutos</strong> para o DNS
            propagar e clique em <strong>Verificar</strong>. Em casos raros pode levar até 24h.
          </p>
        </div>
      </div>
    </div>
  )
}

function DnsCheckRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`w-4 h-4 rounded-full grid place-items-center shrink-0 mt-0.5 ${
          ok ? 'bg-emerald-500 text-white' : 'bg-amber-300 text-amber-900'
        }`}
      >
        {ok ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <X size={9} strokeWidth={2.5} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-semibold ${ok ? 'text-emerald-700' : 'text-amber-900'}`}>{label}</p>
        {!ok && hint && <p className="text-[11px] text-amber-800 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

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
  const [managing, setManaging] = useState<any>(null)

  function loadCredentials() {
    setLoading(true)
    setLoadError('')
    // getHeaders() already sends x-brand-id. Also include as query for safety.
    const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
    const url = brandId ? `/api/auth/stock-access?brand_id=${brandId}` : '/api/auth/stock-access'
    fetch(url, { headers: getHeaders() })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
        return d
      })
      .then(d => {
        setCredentials(d.credentials || [])
        if (d.credentials?.[0]?.brand_slug) setBrandSlug(d.credentials[0].brand_slug)
        setLoading(false)
      }).catch((e) => {
        setLoadError(e.message || 'Erro ao carregar acessos')
        setLoading(false)
      })
  }
  useEffect(() => {
    loadCredentials()
    // Also get brand slug
    fetch('/api/brands', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        const brands = d.brands || []
        const active = d.active_brand_id
        const b = brands.find((x: any) => String(x.id) === String(active)) || brands[0]
        if (b?.slug) setBrandSlug(b.slug)
      }).catch(() => {})
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

  const stockAppUrl = brandSlug ? `/app-estoque/${brandSlug}` : '/app-estoque'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Acesso ao Estoque</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Gerencie usuários e credenciais do app de estoque</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ backgroundColor: 'var(--brand-secondary)' }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition shadow-md">
          <Plus size={14} /> Novo Acesso
        </button>
      </div>

      {/* App link card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">App de Estoque</p>
            <p className="text-sm font-bold mt-1">Acesso dos gerentes ao painel de controle de estoque</p>
            <p className="text-xs text-white/40 mt-1.5 font-mono truncate">{window.location.origin}{stockAppUrl}</p>
          </div>
          <a href={stockAppUrl} target="_blank" rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition shrink-0">
            Abrir App →
          </a>
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
          <button onClick={loadCredentials} className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition">
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

/* ══════════════════════════════════════════════
   COUPONS VIEW (Fase 13.5)
   Admin para cupons da marca: listagem com KPIs + criar/editar
   inline. Cupons já usados só podem ser desativados (soft delete),
   nunca renomeados — o backend impõe.
   ══════════════════════════════════════════════ */
type CouponRow = {
  id: string
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_subtotal: number | null
  max_discount_cap: number | null
  applies_to: 'all' | 'category' | 'product' | 'collection'
  starts_at: string | null
  expires_at: string | null
  usage_limit_total: number | null
  usage_limit_per_customer: number | null
  used_count: number
  active: boolean
}

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
                        className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50">
                        <Settings size={14} strokeWidth={2.25} />
                      </button>
                      <button onClick={() => remove(c)} title={c.used_count > 0 ? 'Desativar' : 'Excluir'}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
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
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-[12px] font-bold hover:bg-violet-700 disabled:opacity-50">
            {saving ? 'Salvando…' : (coupon.id ? 'Salvar' : 'Criar')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   REVIEWS VIEW (Fase 14.3) — moderação de avaliações.
   Pendentes em destaque (badge laranja); admin aprova / rejeita
   com um clique. Reviews verificadas (do pedido) destacadas.
   ══════════════════════════════════════════════ */
type ReviewRow = {
  id: string
  product_id: string
  customer_name: string
  customer_phone: string | null
  rating: number
  comment: string | null
  verified_purchase: boolean
  order_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export function ReviewsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [productsById, setProductsById] = useState<Record<string, any>>({})
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [acting, setActing] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch(`/api/reviews?status=${filter}&limit=200`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        setReviews(d.reviews || [])
        setPendingCount(Number(d.pending_count || 0))
        setLoading(false)
      })
      .catch(() => { showToast('Erro ao carregar avaliações', 'err'); setLoading(false) })
  }
  useEffect(() => { load() }, [filter])

  /* Lookup product names so cards aren't opaque IDs */
  useEffect(() => {
    fetch('/api/products', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const map: Record<string, any> = {}
        ;(d.products || []).forEach((p: any) => { map[String(p.id)] = p })
        setProductsById(map)
      }).catch(() => {})
  }, [])

  async function moderate(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    try {
      const r = await fetch(`/api/reviews/${id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      showToast(status === 'approved' ? 'Avaliação aprovada' : 'Avaliação rejeitada')
      load()
    } catch (e: any) {
      showToast(e.message || 'Erro ao moderar', 'err')
    } finally {
      setActing(null)
    }
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
          <Star key={n} size={12} strokeWidth={2}
            className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <MessageSquareQuote size={18} className="text-violet-600" strokeWidth={2.5} /> Avaliações
          </h2>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Modere as avaliações enviadas pelos clientes. Só aparecem no catálogo após aprovação.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={2.5} /> {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : f === 'rejected' ? 'Rejeitadas' : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando…
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-2xl">
          <MessageSquareQuote size={32} className="mx-auto text-gray-300 mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-semibold text-gray-700 mb-1">
            {filter === 'pending' ? 'Nenhuma avaliação pendente' : 'Nenhuma avaliação encontrada'}
          </p>
          <p className="text-[12px] text-gray-400">
            {filter === 'pending'
              ? 'Clientes podem deixar avaliações na página do produto. Você decide o que aparece no catálogo.'
              : 'Mude o filtro para ver outros status.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(rv => {
            const product = productsById[rv.product_id]
            return (
              <div key={rv.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {renderStars(rv.rating)}
                      <span className="text-[11px] text-gray-400">{dtFull(rv.created_at)}</span>
                      {rv.verified_purchase && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5">
                          <BadgeCheck size={10} strokeWidth={2.5} /> Verificada
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-semibold text-gray-900">{rv.customer_name}</p>
                    {product && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Sobre: <span className="font-medium text-gray-700">{product.name}</span>
                      </p>
                    )}
                  </div>
                  {rv.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => moderate(rv.id, 'approved')} disabled={acting === rv.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                        <ThumbsUp size={12} strokeWidth={2.5} /> Aprovar
                      </button>
                      <button onClick={() => moderate(rv.id, 'rejected')} disabled={acting === rv.id}
                        className="px-3 py-1.5 rounded-lg text-red-600 text-[11px] font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
                        <ThumbsDown size={12} strokeWidth={2.5} /> Rejeitar
                      </button>
                    </div>
                  )}
                  {rv.status === 'approved' && (
                    <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">Aprovada</span>
                  )}
                  {rv.status === 'rejected' && (
                    <button onClick={() => moderate(rv.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg text-gray-500 text-[11px] font-bold hover:bg-gray-100">
                      Reabrir
                    </button>
                  )}
                </div>
                {rv.comment && (
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-gray-100 pl-3">
                    "{rv.comment}"
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   STOCK ACCESS MANAGE MODAL
   ══════════════════════════════════════════════ */
function StockAccessManageModal({ credential, onClose, onChanged, showToast }: {
  credential: any
  onClose: () => void
  onChanged: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const [tab, setTab] = useState<'dados' | 'senha' | 'zona'>('dados')
  const [name, setName] = useState(credential.manager_name || '')
  const [phone, setPhone] = useState(credential.manager_phone || '')
  const [email, setEmail] = useState(credential.email || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function saveData() {
    if (!name.trim()) return showToast('Nome é obrigatório', 'err')
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Email inválido', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      showToast('Dados atualizados!')
      onChanged()
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 6) return showToast('Senha deve ter no mínimo 6 caracteres', 'err')
    if (newPassword !== confirmPassword) return showToast('As senhas não coincidem', 'err')
    setSaving(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}/password`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ password: newPassword }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao trocar senha')
      showToast('Senha alterada com sucesso!')
      setNewPassword(''); setConfirmPassword('')
      onChanged()
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setSaving(false) }
  }

  async function toggleActive() {
    setToggling(true)
    try {
      const url = credential.is_active
        ? `/api/auth/stock-access/${credential.id}/deactivate`
        : `/api/auth/stock-access/${credential.id}/reactivate`
      const r = await fetch(url, { method: 'PATCH', headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(credential.is_active ? 'Acesso desativado' : 'Acesso reativado!')
      onChanged()
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setToggling(false) }
  }

  async function deleteAccess() {
    if (!confirm(`Excluir permanentemente o acesso de ${credential.manager_name || credential.email}?\n\nEsta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/auth/stock-access/${credential.id}`, {
        method: 'DELETE', headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao excluir')
      showToast('Acesso excluído')
      onChanged()
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setDeleting(false) }
  }

  const inp = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"

  const TABS = [
    { id: 'dados', label: 'Dados', icon: Users },
    { id: 'senha', label: 'Senha', icon: Settings },
    { id: 'zona', label: 'Zona de risco', icon: Trash2 },
  ] as const

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg flex flex-col max-h-[92vh] shadow-2xl">
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center transition">
          <X size={15} className="text-gray-600" />
        </button>

        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 pr-10">
            <div className="w-12 h-12 rounded-2xl grid place-items-center text-white shrink-0 shadow-md"
              style={{ backgroundColor: 'var(--brand-secondary)' }}>
              <Users size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{credential.manager_name || 'Gerente'}</h2>
              <p className="text-xs text-gray-400 font-mono truncate">{credential.email}</p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-1 rounded-full shrink-0 ${credential.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600'}`}>
              {credential.is_active ? 'ATIVO' : 'INATIVO'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-100 px-4 bg-white">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={tab === t.id ? { borderColor: 'var(--brand-secondary)', color: 'var(--brand-secondary)' } : undefined}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all -mb-px ${
                tab === t.id ? '' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              <t.icon size={13} />{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'dados' && (
            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nome *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Email de login *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} placeholder="email@exemplo.com" />
                <p className="text-[10px] text-gray-400 mt-1">Usado para fazer login no app de estoque</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Telefone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className={inp} placeholder="31999998888" />
              </div>
              <button onClick={saveData} disabled={saving}
                style={{ backgroundColor: 'var(--brand-secondary)' }}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition shadow-md">
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {tab === 'senha' && (
            <div className="space-y-3.5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p className="font-bold inline-flex items-center gap-1.5">
                  <AlertTriangle size={13} strokeWidth={2} />
                  Alteração de senha
                </p>
                <p className="mt-1">Ao trocar a senha, o gerente precisará usar a nova senha para entrar no app.</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Nova senha *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className={inp} placeholder="Mín. 6 caracteres" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirmar senha *</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className={inp} placeholder="Digite a senha novamente" />
              </div>
              <button onClick={changePassword} disabled={saving || !newPassword || newPassword !== confirmPassword}
                style={{ backgroundColor: 'var(--brand-secondary)' }}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 hover:opacity-90 transition shadow-md">
                {saving ? 'Alterando...' : 'Trocar senha'}
              </button>
            </div>
          )}

          {tab === 'zona' && (
            <div className="space-y-4">
              {/* Toggle active/inactive */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{credential.is_active ? 'Desativar acesso' : 'Reativar acesso'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {credential.is_active
                        ? 'O gerente não conseguirá mais fazer login, mas os dados ficam preservados.'
                        : 'Permite que o gerente faça login novamente no app.'}
                    </p>
                  </div>
                </div>
                <button onClick={toggleActive} disabled={toggling}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
                    credential.is_active
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}>
                  {toggling ? 'Processando...' : credential.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                </button>
              </div>

              {/* Delete permanently */}
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="mb-3">
                  <p className="font-bold text-sm text-red-900 inline-flex items-center gap-1.5">
                    <AlertTriangle size={14} strokeWidth={2} />
                    Excluir permanentemente
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Esta ação removerá o acesso definitivamente do sistema. O usuário não poderá ser recuperado.
                  </p>
                </div>
                <button onClick={deleteAccess} disabled={deleting}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-50">
                  {deleting ? 'Excluindo...' : 'Excluir acesso permanentemente'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   PAYMENT CONFIG VIEW
   ══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   WHATSAPP MANAGER VIEW
   ══════════════════════════════════════════════ */
export function WhatsAppManagerView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [instances, setInstances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState<string | null>(null)
  const [reconnectMsg, setReconnectMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrInstance, setQrInstance] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function load() {
    fetch('/api/instances', { headers: getHeaders() }).then(r => r.json()).then(d => {
      setInstances(d.instances || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Polling enquanto QR code está aberto — detecta conexão automática
  useEffect(() => {
    if (qrInstance) {
      pollRef.current = setInterval(() => {
        fetch(`/api/instances/${qrInstance}`, { headers: getHeaders() })
          .then(r => r.json())
          .then(d => {
            const st = d.status || ''
            if (st === 'connected' || st === 'authenticated') {
              setQrCode(null)
              setQrInstance(null)
              showToast('WhatsApp conectado!')
              load()
            } else if (d.hasQr && !qrCode) {
              // QR rotacionou — busca novo
              fetch(`/api/instances/${qrInstance}/qr`, { headers: getHeaders() })
                .then(r => r.json()).then(q => { if (q.qr) setQrCode(q.qr) }).catch(() => {})
            }
          }).catch(() => {})
      }, 4000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [qrInstance])

  async function createInstance() {
    if (!newName.trim()) return showToast('Nome obrigatorio', 'err')
    setCreating(true)
    try {
      const r = await fetch('/api/instances', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name: newName.trim() }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao criar instancia')
      showToast('Instancia criada! Escaneie o QR Code')
      setNewName('')
      if (d.qr || d.qrCode) { setQrCode(d.qr || d.qrCode); setQrInstance(d.id) }
      load()
    } catch (e: any) { showToast(e.message, 'err') }
    setCreating(false)
  }

  async function restoreInstance(id: string) {
    setReconnecting(id)
    setReconnectMsg('Desconectando sessão anterior...')
    setQrCode(null)
    setQrInstance(null)
    try {
      // Feedback progressivo enquanto aguarda o QR (pode demorar até 18s)
      const msgs = ['Iniciando reconexão...', 'Aguardando QR Code do WhatsApp...', 'Quase lá...']
      let msgIdx = 0
      const msgTimer = setInterval(() => {
        msgIdx = Math.min(msgIdx + 1, msgs.length - 1)
        setReconnectMsg(msgs[msgIdx])
      }, 5000)

      const r = await fetch(`/api/instances/${id}/reconnect`, { method: 'POST', headers: getHeaders() })
      clearInterval(msgTimer)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao reconectar')

      if (d.qr || d.qrCode) {
        setQrCode(d.qr || d.qrCode)
        setQrInstance(id)
        showToast('Escaneie o QR Code no WhatsApp!')
      } else if (d.status === 'connected') {
        showToast('Reconectado com sucesso!', 'ok')
        load()
      } else {
        // Ainda conectando com sessão salva — inicia polling
        setQrInstance(id)
        showToast(d.message || 'Conectando com sessão salva...')
        setTimeout(load, 5000)
      }
    } catch (e: any) { showToast(e.message || 'Erro ao reconectar', 'err') }
    setReconnecting(null)
    setReconnectMsg('')
  }

  async function deleteInstance(id: string) {
    if (!confirm('Remover esta instancia WhatsApp?')) return
    await fetch(`/api/instances/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    showToast('Instancia removida')
    if (qrInstance === id) { setQrCode(null); setQrInstance(null) }
    load()
  }

  if (loading) return <Skeleton rows={4} />

  const connected = instances.filter(i => i.status === 'authenticated' || i.status === 'connected').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">WhatsApp</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{instances.length} sessoes · {connected} conectadas</p>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
          <p className="text-[26px] font-extrabold">{connected}</p>
          <p className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Conectadas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-border-light">
          <p className="text-[26px] font-extrabold text-amber-500">{instances.filter(i => i.status === 'disconnected').length}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Desconectadas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-border-light">
          <p className="text-[26px] font-extrabold text-gray-900">{instances.length}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
        </div>
      </div>

      {/* Create new */}
      <div className="bg-white rounded-2xl border border-border-light p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Nova sessao</p>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da sessao (ex: atendimento1)"
            onKeyDown={e => e.key === 'Enter' && createInstance()}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 placeholder:text-gray-300" />
          <button onClick={createInstance} disabled={creating}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm">
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      {qrCode && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setQrCode(null); setQrInstance(null); load() }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 text-center max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-900">Escaneie o QR Code</p>
              <button onClick={() => { setQrCode(null); setQrInstance(null); load() }} className="p-1.5 rounded-lg hover:bg-gray-100 transition"><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl inline-block border border-gray-200">
              <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code"
                className="w-52 h-52" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            </div>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              Abra o WhatsApp → Configuracoes →<br />Aparelhos Conectados → Conectar Aparelho
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-emerald-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Aguardando conexao...
            </div>
            <button onClick={() => { setQrCode(null); setQrInstance(null); load() }}
              className="mt-3 text-xs text-blue-600 font-semibold hover:underline">
              Ja escaneei
            </button>
          </div>
        </div>
      )}

      {/* Instance list */}
      {instances.length > 0 && (
        <div className="space-y-2.5">
          {instances.map((inst: any) => {
            const isConnected = inst.status === 'authenticated' || inst.status === 'connected'
            return (
              <div key={inst.id} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 ${isConnected ? 'border-emerald-200' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${isConnected ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <Phone size={18} className={isConnected ? 'text-emerald-500' : 'text-gray-400'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">{inst.name}</p>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono">{inst.phone || 'Sem numero'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      isConnected ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200'
                    }`}>{isConnected ? 'Online' : 'Offline'}</span>
                    {!isConnected && (
                      <button onClick={() => restoreInstance(inst.id)} disabled={!!reconnecting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold hover:bg-blue-100 transition disabled:opacity-60">
                        {reconnecting === inst.id ? <><Loader2 size={11} className="animate-spin" /> {reconnectMsg || 'Aguardando...'}</> : 'Reconectar'}
                      </button>
                    )}
                    <button onClick={() => deleteInstance(inst.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Stats */}
                <div className="flex gap-4 mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                  <span>Enviadas: {inst.messagessSent || 0}</span>
                  <span>Recebidas: {inst.messagesReceived || 0}</span>
                  {inst.brand_name && <span>Brand: {inst.brand_name}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

export function FreteView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
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
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Preview banner — how it looks in the catalog */}
      {(hasFreeShipping || hasFee) && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
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
function BrandEditForm({ brand, onSave, onCancel, showToast }: any) {
  const [form, setForm] = useState({
    name: brand.name,
    slug: brand.slug,
    primary_color: brand.primary_color || '',
    secondary_color: brand.secondary_color || '',
    logo_url: brand.logo_url || '',
    cover_image: brand.cover_image || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) {
      showToast('Nome é obrigatório', 'err')
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || undefined,
          primary_color: form.primary_color || null,
          secondary_color: form.secondary_color || null,
          logo_url: form.logo_url || null,
          cover_image: form.cover_image || null,
        }),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao salvar')
      }
      showToast('Brand atualizado com sucesso')
      onSave()
    } catch (e: any) {
      showToast(e.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">Nome do Brand</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cor Primária</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={form.primary_color || '#3b82f6'}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              placeholder="#3b82f6"
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cor Secundária</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={form.secondary_color || '#1e40af'}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={form.secondary_color}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              placeholder="#1e40af"
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Logo</label>
        <input
          type="text"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Capa do Catálogo</label>
        <input
          type="text"
          value={form.cover_image}
          onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-300 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   SETTINGS VIEW — Brand Management
   ══════════════════════════════════════════════ */
function ClientTypesSection({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [types, setTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [creatingType, setCreatingType] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    refreshTypes()
  }, [])

  async function refreshTypes() {
    setLoading(true)
    try {
      const r = await fetch('/api/client-types', { headers: getHeaders() })
      const d = await r.json()
      setTypes(d.types || [])
    } catch (e) {
      showToast('Erro ao carregar tipos de cliente', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function createType() {
    if (!newName.trim()) {
      showToast('Nome é obrigatório', 'err')
      return
    }
    setCreatingType(true)
    try {
      const r = await fetch('/api/client-types', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!r.ok) throw new Error('Erro ao criar tipo')
      showToast('Tipo de cliente criado!')
      setNewName('')
      setShowNew(false)
      await refreshTypes()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setCreatingType(false)
    }
  }

  async function deleteType(id: string) {
    if (!confirm('Tem certeza que quer deletar este tipo?')) return
    setDeleting(id)
    try {
      const r = await fetch(`/api/client-types/${id}`, { method: 'DELETE', headers: getHeaders() })
      if (!r.ok) throw new Error('Erro ao deletar')
      showToast('Tipo deletado!')
      await refreshTypes()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <Skeleton rows={3} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Tipos de Cliente ({types.length})</h2>
        <button
          onClick={() => setShowNew(true)}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
        >
          + Novo Tipo
        </button>
      </div>

      {showNew && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createType()}
            placeholder="Ex: Cliente Premium, Revendedor, etc"
            autoFocus
            className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Cor</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-full h-9 rounded-lg border border-emerald-300 cursor-pointer"
              />
            </div>
            <button
              onClick={createType}
              disabled={creatingType}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {creatingType ? 'Criando...' : 'Criar'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="bg-white text-gray-900 px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {types.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum tipo criado ainda</p>
        ) : (
          types.map((type) => (
            <div key={type.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: type.color || '#999' }} />
                <span className="text-sm font-semibold text-gray-900">{type.name}</span>
              </div>
              <button
                onClick={() => deleteType(type.id)}
                disabled={deleting === type.id}
                className="p-1 text-red-600 hover:bg-red-50 rounded transition text-xs disabled:opacity-50"
              >
                {deleting === type.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} strokeWidth={2} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function SettingsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [brands, setBrands] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBrandId, setActiveBrandId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    refreshBrands()
  }, [])

  async function refreshBrands() {
    setLoading(true)
    try {
      const r = await fetch('/api/brands', { headers: getHeaders() })
      const d = await r.json()
      setBrands(d.brands || [])
      setActiveBrandId(d.active_brand_id || '')
    } catch (e) {
      showToast('Erro ao carregar brands', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function deleteBrand(brandId: string, brandName: string) {
    if (brandId === activeBrandId) {
      showToast('Nao pode deletar o brand ativo', 'err')
      return
    }
    if (!confirm(`Tem certeza que quer deletar "${brandName}"?\nEsta acao nao pode ser desfeita.`)) return

    setDeleting(brandId)
    try {
      const r = await fetch(`/api/brands/${brandId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao deletar')
      }
      showToast('Brand deletado com sucesso')
      await refreshBrands()
    } catch (e: any) {
      showToast(e.message || 'Erro ao deletar', 'err')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <Skeleton rows={5} />

  const [showNewBrand, setShowNewBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [creatingBrand, setCreatingBrand] = useState(false)

  async function createNewBrand() {
    if (!newBrandName.trim()) {
      showToast('Nome do brand é obrigatório', 'err')
      return
    }
    setCreatingBrand(true)
    try {
      const r = await fetch('/api/brands', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newBrandName.trim() }),
      })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Erro ao criar brand')
      }
      showToast('Brand criado com sucesso!')
      setNewBrandName('')
      setShowNewBrand(false)
      await refreshBrands()
    } catch (e: any) {
      showToast(e.message || 'Erro ao criar', 'err')
    } finally {
      setCreatingBrand(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Configuracoes</h1>
          <p className="text-sm text-gray-500">Gerenciar seus brands, lojas e companhias</p>
        </div>
        <button
          onClick={() => setShowNewBrand(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition"
        >
          + Novo Brand
        </button>
      </div>

      {/* Create Brand Form */}
      {showNewBrand && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-gray-900">Criar Novo Brand</h3>
          <input
            type="text"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createNewBrand()}
            placeholder="Nome do seu brand/loja/companhia"
            autoFocus
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={createNewBrand}
              disabled={creatingBrand}
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
            >
              {creatingBrand ? 'Criando...' : 'Criar Brand'}
            </button>
            <button
              onClick={() => setShowNewBrand(false)}
              className="flex-1 bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Brands List */}
      <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Seus Brands ({brands.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {brands.map((brand) => {
            const isEditing = editingId === brand.id
            const isActive = brand.id === activeBrandId

            return (
              <div key={brand.id} className="p-5">
                {isEditing ? (
                  <BrandEditForm
                    brand={brand}
                    onSave={() => {
                      setEditingId(null)
                      refreshBrands()
                    }}
                    onCancel={() => setEditingId(null)}
                    showToast={showToast}
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {brand.logo_url && (
                        <img
                          src={brand.logo_url}
                          alt={brand.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900">{brand.name}</h3>
                          {isActive && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                              ATIVO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {brand.slug} • Criado {new Date(brand.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {(brand.primary_color || brand.secondary_color) && (
                          <div className="flex gap-2 mt-2">
                            {brand.primary_color && (
                              <div
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: brand.primary_color }}
                              />
                            )}
                            {brand.secondary_color && (
                              <div
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: brand.secondary_color }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(brand.id)}
                        className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition"
                      >
                        Editar
                      </button>
                      {brand.id !== activeBrandId && (
                        <button
                          onClick={() => deleteBrand(brand.id, brand.name)}
                          disabled={deleting === brand.id}
                          className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition disabled:opacity-50"
                        >
                          {deleting === brand.id ? 'Deletando...' : 'Deletar'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {brands.length === 0 && (
        <EmptyState icon={Package} text="Nenhum brand criado ainda" />
      )}

      {/* Client Types Section */}
      <div className="bg-white rounded-2xl border border-border-light p-5">
        <ClientTypesSection showToast={showToast} />
      </div>
    </div>
  )
}
