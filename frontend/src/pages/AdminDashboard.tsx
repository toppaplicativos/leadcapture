import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings,
} from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'

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
  '/leads': 'leads', '/clientes': 'leads',
  '/busca': 'busca',
  '/mensagens': 'mensagens',
  '/notificacoes': 'notificacoes',
  '/campanhas': 'campanhas', '/campanha': 'campanhas',
  '/automacoes': 'automacoes',
  '/criativos': 'criativos', '/creative': 'criativos',
  '/produtos': 'produtos',
  '/pedidos': 'pedidos',
  '/estoque': 'estoque',
  '/design': 'design',
  '/frete': 'frete',
  '/dominio': 'dominio',
  '/agente': 'agente',
  '/configuracoes': 'configuracoes',
}

function resolveSection(pathname: string): string {
  return ROUTE_MAP[pathname] || 'dashboard'
}

/* ── Nav config ── */
const NAV_ITEMS: { key: string; path: string; icon: any; label: string; group: string }[] = [
  { key: 'dashboard', path: '/admin', icon: LayoutDashboard, label: 'Painel', group: 'main' },
  { key: 'leads', path: '/leads', icon: Users, label: 'Leads', group: 'main' },
  { key: 'busca', path: '/busca', icon: Search, label: 'Busca', group: 'main' },
  { key: 'mensagens', path: '/mensagens', icon: MessageSquare, label: 'Mensagens', group: 'main' },
  { key: 'campanhas', path: '/campanhas', icon: Megaphone, label: 'Campanhas', group: 'main' },
  { key: 'automacoes', path: '/automacoes', icon: Zap, label: 'Automacoes', group: 'main' },
  { key: 'agente', path: '/agente', icon: Bot, label: 'Agente IA', group: 'main' },
  { key: 'produtos', path: '/produtos', icon: Package, label: 'Produtos', group: 'loja' },
  { key: 'pedidos', path: '/pedidos', icon: ShoppingCart, label: 'Pedidos', group: 'loja' },
  { key: 'estoque', path: '/estoque', icon: BarChart3, label: 'Estoque', group: 'loja' },
  { key: 'design', path: '/design', icon: Palette, label: 'Design', group: 'loja' },
  { key: 'frete', path: '/frete', icon: Truck, label: 'Frete', group: 'loja' },
  { key: 'dominio', path: '/dominio', icon: Globe, label: 'Dominio', group: 'loja' },
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

  const token = localStorage.getItem('lead-system-token')
  useEffect(() => { if (!token) navigate('/login', { replace: true }) }, [token])

  useEffect(() => {
    fetch('/api/brands', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        const list = d.brands || []
        const active = d.active_brand_id
        setBrands(list)
        setActiveBrandId(active || '')
        const b = list.find((x: any) => String(x.id) === String(active)) || list[0] || {}
        setBrand({ name: b.name, logo_url: b.logo_url })
        if (b.name) document.title = b.name + ' — Admin'
      }).catch(() => {})
  }, [refreshKey])

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
    localStorage.removeItem('lead-system-token')
    localStorage.removeItem('lead-system:active-brand-id')
    navigate('/login', { replace: true })
  }

  function go(path: string) { navigate(path); setSidebarOpen(false) }

  const mobileItems = NAV_ITEMS.filter(n => MOBILE_NAV.includes(n.key))
  const mainNav = NAV_ITEMS.filter(n => n.group === 'main')
  const lojaNav = NAV_ITEMS.filter(n => n.group === 'loja')

  return (
    <div className="h-screen bg-[#f8f9fb] flex flex-col">
      {/* ── Mobile Topbar ── */}
      <header className="sticky top-0 z-50 bg-gray-950 text-white flex items-center justify-between px-4 h-14 lg:hidden shadow-xl shrink-0">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-white/10 transition">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {brand.logo_url && <img src={brand.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover ring-2 ring-white/10" />}
          <h1 className="text-[13px] font-bold truncate max-w-[160px]">{brand.name || 'Admin'}</h1>
        </div>
        <button onClick={logout} className="bg-white/10 rounded-lg p-2 hover:bg-white/20 transition"><LogOut size={14} /></button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Premium Sidebar ── */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-[220px] bg-gray-950 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Brand header + account switcher */}
          <div className="hidden lg:block shrink-0">
            <button onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
              className="w-full h-[60px] flex items-center gap-3 px-4 hover:bg-white/[0.04] transition border-b border-white/[0.06]">
              {brand.logo_url
                ? <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10 shrink-0" />
                : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shrink-0"><Package size={16} className="text-white" /></div>}
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[13px] font-bold text-white truncate">{brand.name || 'Admin'}</span>
                <span className="block text-[10px] text-white/30 font-medium">Painel de controle</span>
              </div>
              {brands.length > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="w-5 h-5 rounded-md bg-blue-500/30 text-blue-300 text-[9px] font-bold grid place-items-center">{brands.length}</span>
                  <ChevronRight size={12} className={`text-white/30 transition-transform ${showBrandPicker ? 'rotate-90' : ''}`} />
                </div>
              )}
            </button>

            {/* Account/Brand Picker */}
            {showBrandPicker && brands.length > 1 && (
              <div className="border-b border-white/[0.06] bg-white/[0.02]">
                <p className="px-4 pt-2.5 pb-1.5 text-[9px] font-bold text-white/20 uppercase tracking-[0.15em]">Trocar conta</p>
                <div className="px-2 pb-2.5 space-y-1">
                  {brands.map((b: any) => {
                    const isActive = String(b.id) === String(activeBrandId)
                    return (
                      <button key={b.id} onClick={() => switchBrand(b.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-all ${
                          isActive ? 'bg-blue-500/20 text-blue-300 font-semibold ring-1 ring-blue-500/30' : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                        }`}>
                        {b.logo_url
                          ? <img src={b.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0 ring-1 ring-white/10" />
                          : <div className="w-7 h-7 rounded-lg bg-white/10 grid place-items-center shrink-0 text-[10px] font-bold text-white/30">{(b.name || '?')[0]}</div>}
                        <span className="truncate flex-1 text-left">{b.name}</span>
                        {isActive && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0 animate-pulse" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2.5 overflow-y-auto space-y-0.5">
            {mainNav.map(n => {
              const active = section === n.key
              return (
                <button key={n.key} onClick={() => go(n.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-[9px] text-[13px] rounded-lg transition-all ${
                    active
                      ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                      : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                  }`}>
                  <n.icon size={16} className={active ? 'text-blue-400' : ''} />
                  {n.label}
                </button>
              )
            })}

            <div className="!my-3 mx-1 border-t border-white/[0.06]" />
            <p className="px-3 mb-1.5 text-[9px] font-bold text-white/15 uppercase tracking-[0.15em]">Catalogo</p>
            {lojaNav.map(n => {
              const active = section === n.key
              return (
                <button key={n.key} onClick={() => go(n.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-[9px] text-[13px] rounded-lg transition-all ${
                    active
                      ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                      : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                  }`}>
                  <n.icon size={16} className={active ? 'text-blue-400' : ''} />
                  {n.label}
                </button>
              )
            })}
          </nav>

          {/* Bottom */}
          <div className="p-3 border-t border-white/[0.06] shrink-0">
            <button onClick={logout}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-2 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition">
              <LogOut size={12} /> Sair da conta
            </button>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

        {/* ── Main Content ── */}
        <main className="flex-1 lg:ml-[220px] overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 pt-5 pb-20 lg:pb-8">
            <div key={activeBrandId}>{children}</div>
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/95 backdrop-blur-lg border-t border-white/[0.06] flex h-16 lg:hidden safe-area-inset-bottom shrink-0">
        {mobileItems.map(n => {
          const active = section === n.key
          return (
            <button key={n.key} onClick={() => go(n.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                active ? 'text-blue-400' : 'text-white/30'
              }`}>
              <n.icon size={18} />
              {n.label}
            </button>
          )
        })}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[300]">
          <div className={`px-5 py-3 rounded-2xl text-white text-sm font-semibold shadow-2xl backdrop-blur-lg ${
            toast.type === 'err' ? 'bg-red-500/90' : 'bg-emerald-500/90'
          }`}>{toast.text}</div>
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
      fetch('/api/customers?limit=1', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ total: 0 })),
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
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Painel</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Visao geral do seu negocio</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Leads" value={num(data?.totalLeads)} icon={Users} bg="bg-blue-50" color="text-blue-500" accent="text-blue-600" />
        <KpiCard label="Campanhas" value={num(data?.totalCampaigns)} icon={Megaphone} bg="bg-violet-50" color="text-violet-500" accent="text-violet-600" />
        <KpiCard label="Pedidos" value={num(data?.totalOrders)} icon={ShoppingCart} bg="bg-emerald-50" color="text-emerald-500" accent="text-emerald-600" />
        <KpiCard label="Produtos" value={num(data?.products)} icon={Package} bg="bg-amber-50" color="text-amber-500" accent="text-amber-600" />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <BarChart3 size={18} className="text-white/50 mb-2" />
          <p className="text-2xl font-extrabold">{num(data?.totalStock)}</p>
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Unidades em Estoque</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
          <Send size={18} className="text-white/50 mb-2" />
          <p className="text-2xl font-extrabold">{num(data?.activeCampaigns)}</p>
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Campanhas Ativas</p>
        </div>
        <div className={`rounded-2xl p-4 shadow-lg ${Number(data?.outOfStock) > 0 ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white' : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700'}`}>
          <Zap size={18} className={Number(data?.outOfStock) > 0 ? 'text-white/50' : 'text-gray-400'} />
          <p className="text-2xl font-extrabold mt-2">{num(data?.outOfStock)}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${Number(data?.outOfStock) > 0 ? 'text-white/60' : 'text-gray-400'}`}>Sem Estoque</p>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Acesso rapido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { icon: Search, label: 'Buscar Leads', path: '/busca', gradient: 'from-blue-500 to-indigo-500' },
            { icon: Megaphone, label: 'Campanhas', path: '/campanhas', gradient: 'from-violet-500 to-purple-500' },
            { icon: ShoppingCart, label: 'Pedidos', path: '/pedidos', gradient: 'from-emerald-500 to-teal-500' },
            { icon: Package, label: 'Estoque', path: '/estoque', gradient: 'from-amber-500 to-orange-500' },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              className="group flex items-center gap-3 p-3.5 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.gradient} grid place-items-center shadow-sm group-hover:scale-105 transition-transform`}>
                <a.icon size={17} className="text-white" />
              </div>
              <span className="text-[13px] font-semibold text-gray-700">{a.label}</span>
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
        <h2 className="text-lg font-bold text-gray-900">Leads / Clientes</h2>
        <span className="text-xs text-muted">{total} registros</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
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
   CAMPAIGNS VIEW
   ══════════════════════════════════════════════ */
export function CampaignsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'active' | 'draft' | 'done'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Campanhas</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{campaigns.length} campanhas</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-md">
          <Plus size={14} /> Nova Campanha
        </button>
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
        <div className="space-y-2.5">
          {filtered.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-md transition-all p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-sm text-gray-900 truncate">{c.name || 'Sem titulo'}</h4>
                    {statusBadge(c.status)}
                    {c.use_ai && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">IA</span>}
                  </div>
                  <p className="text-xs text-gray-400">{c.campaign_mode || 'relationship'} · {dt(c.created_at)}</p>
                </div>
                {/* Metrics mini */}
                {(c.sent_count > 0 || c.target_count > 0) && (
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-900">{c.sent_count || 0}/{c.target_count || 0}</p>
                    <p className="text-[9px] text-gray-400">enviados</p>
                  </div>
                )}
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                {(c.status === 'draft' || c.status === 'paused') && (
                  <button onClick={() => doAction(c.id, 'start')} disabled={actionLoading === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition">
                    <Send size={11} /> Iniciar
                  </button>
                )}
                {(c.status === 'active' || c.status === 'running' || c.status === 'sending') && (
                  <button onClick={() => doAction(c.id, 'pause')} disabled={actionLoading === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition">
                    <Pause size={11} /> Pausar
                  </button>
                )}
                <button onClick={() => openEdit(c)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100 transition">
                  Configurar
                </button>
                {c.status !== 'cancelled' && c.status !== 'completed' && (
                  <button onClick={() => doAction(c.id, 'cancel')} disabled={actionLoading === c.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-500 text-[11px] font-semibold hover:bg-red-50 transition ml-auto">
                    <Ban size={11} /> Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
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
  const [poolIds, setPoolIds] = useState((core.poolInstanceIds || []).join(', '))
  const [rotationMode, setRotationMode] = useState(core.rotationMode || campaign?.rotation_mode || 'balanced')

  // Tab 2: Mensagem & IA
  const [useAi, setUseAi] = useState(campaign?.use_ai !== false)
  const [aiPrompt, setAiPrompt] = useState(campaign?.ai_prompt || '')
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '')
  const [intentText, setIntentText] = useState(comp.intentText || '')
  const [personalizedPerLead, setPersonalizedPerLead] = useState(comp.personalizedPerLead !== false)
  const [useAutoVariations, setUseAutoVariations] = useState(comp.useAutoVariations !== false)

  // Tab 2b: Media (imagem/video)
  const media = s.media || {}
  const [imageUrl, setImageUrl] = useState(media.imageFileName || '')
  const [imageCaption, setImageCaption] = useState(media.imageCaption || '')
  const [imageUseTextAsCaption, setImageUseTextAsCaption] = useState(media.imageUseTextAsCaption !== false)
  const [videoUrl, setVideoUrl] = useState(media.videoFileName || '')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)

  async function uploadMedia(file: File, type: 'image' | 'video') {
    const setter = type === 'image' ? setImageUrl : setVideoUrl
    const loadingSetter = type === 'image' ? setUploadingImage : setUploadingVideo
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
      if (d.file?.url) setter(d.file.url)
    } catch {}
    loadingSetter(false)
  }

  // Tab 3: Segmentacao
  const [filterStatuses, setFilterStatuses] = useState<string[]>(filter.statuses || ['new'])
  const [filterHasWhatsapp, setFilterHasWhatsapp] = useState(filter.hasWhatsapp !== false)
  const [filterTagsInclude, setFilterTagsInclude] = useState((filter.tagsInclude || []).join(', '))
  const [filterTagsExclude, setFilterTagsExclude] = useState((filter.tagsExclude || []).join(', '))
  const [filterCities, setFilterCities] = useState((filter.cities || []).join(', '))
  const [filterScoreMin, setFilterScoreMin] = useState(filter.scoreMin != null ? String(filter.scoreMin) : '')
  const [filterScoreMax, setFilterScoreMax] = useState(filter.scoreMax != null ? String(filter.scoreMax) : '')

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
          ...(filterTagsInclude.trim() ? { tagsInclude: splitTags(filterTagsInclude) } : {}),
          ...(filterTagsExclude.trim() ? { tagsExclude: splitTags(filterTagsExclude) } : {}),
          ...(filterCities.trim() ? { cities: splitTags(filterCities) } : {}),
          ...(filterScoreMin ? { scoreMin: parseInt(filterScoreMin) } : {}),
          ...(filterScoreMax ? { scoreMax: parseInt(filterScoreMax) } : {}),
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
          campaignCore: { slug: slug || undefined, instanceMode, poolInstanceIds: poolIds ? splitTags(poolIds) : [], rotationMode },
          scheduler: { scheduleMode, timeZone, smartWindowStart, smartWindowEnd },
          actionWindow: { enabled: windowEnabled, start: smartWindowStart, end: smartWindowEnd },
          finalActions: { nextStatus: nextStatus || undefined, addTags: addTags.trim() ? splitTags(addTags) : [] },
          triggers: { onNewLead: trigOnNewLead, onStatusChange: trigOnStatusChange, onTagMatch: trigOnTagMatch, onOrderCreated: trigOnOrderCreated },
          composer: { intentText, personalizedPerLead, useAutoVariations },
          antiBlock: { autoPauseByBlocks: parseInt(autoPauseBlocks) || 5, autoPauseByErrorRate: parseInt(autoPauseErrorRate) || 20, autoPauseOnOffline: autoPauseOffline, avoidNight, avoidSunday },
          media: { imageFileName: imageUrl || null, imageCaption: imageCaption || null, imageUseTextAsCaption, videoFileName: videoUrl || null, audioFileName: null },
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
                <label className={labelCls}>IDs do pool (separar por virgula)</label>
                <input type="text" value={poolIds} onChange={e => setPoolIds(e.target.value)} placeholder="id1, id2, id3" className={inputCls + ' font-mono text-xs'} />
              </div>
              <div>
                <label className={labelCls}>Modo de rodizio</label>
                <select value={rotationMode} onChange={e => setRotationMode(e.target.value)} className={inputCls}>
                  <option value="balanced">Balanceado (padrao)</option>
                  <option value="conservative">Conservador (menos msgs)</option>
                  <option value="aggressive">Agressivo (mais msgs)</option>
                </select>
              </div>
            </>)}
          </>)}

          {/* Tab: Mensagem & IA — Full composer */}
          {activeTab === 'mensagem' && (<>

            {/* ─── 1. MIDIA (topo) ─── */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Midia (opcional)</p>
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
              {imageUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <Toggle value={imageUseTextAsCaption} onChange={setImageUseTextAsCaption} />
                  <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda da imagem</span>
                </div>
              )}
              {imageUrl && !imageUseTextAsCaption && (
                <input type="text" value={imageCaption} onChange={e => setImageCaption(e.target.value)}
                  placeholder="Legenda personalizada..." className={inputCls + ' !text-xs !py-2 mt-2'} />
              )}
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
          {activeTab === 'segmentacao' && (<>
            <div>
              <label className={labelCls}>Status dos leads</label>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUSES.map(s => (
                  <button key={s} type="button"
                    onClick={() => setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                      filterStatuses.includes(s) ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-300' : 'bg-gray-100 text-gray-500'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-semibold text-gray-800">Somente com WhatsApp</p>
                <p className="text-[11px] text-gray-400">Filtrar apenas leads com WhatsApp validado</p>
              </div>
              <Toggle value={filterHasWhatsapp} onChange={setFilterHasWhatsapp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tags incluir (separar por virgula)</label>
                <input type="text" value={filterTagsInclude} onChange={e => setFilterTagsInclude(e.target.value)} placeholder="tag1, tag2" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tags excluir</label>
                <input type="text" value={filterTagsExclude} onChange={e => setFilterTagsExclude(e.target.value)} placeholder="tag_excluir" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Cidades (separar por virgula)</label>
              <input type="text" value={filterCities} onChange={e => setFilterCities(e.target.value)} placeholder="Sao Paulo, Belo Horizonte" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Score minimo</label>
                <input type="number" min={0} max={100} value={filterScoreMin} onChange={e => setFilterScoreMin(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Score maximo</label>
                <input type="number" min={0} max={100} value={filterScoreMax} onChange={e => setFilterScoreMax(e.target.value)} placeholder="100" className={inputCls} />
              </div>
            </div>
          </>)}

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
      <div><h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Pedidos</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} pedidos · {money(metrics.totalValue)} total</p></div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Total" value={String(metrics.total)} icon={ShoppingCart} bg="bg-blue-50" color="text-blue-500" accent="text-blue-600" />
        <KpiCard label="Faturamento" value={money(metrics.totalValue)} icon={BarChart3} bg="bg-emerald-50" color="text-emerald-500" accent="text-emerald-600" />
        <KpiCard label="Pagos" value={String(metrics.paid)} icon={Eye} bg="bg-violet-50" color="text-violet-500" accent="text-violet-600" />
        <KpiCard label="Ticket Medio" value={metrics.total > 0 ? money(metrics.totalValue / metrics.total) : '—'} icon={Zap} bg="bg-amber-50" color="text-amber-500" accent="text-amber-600" />
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="bg-gray-50/80 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Pedido</th>
            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Cliente</th>
            <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Status</th>
            <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Pagto</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Valor</th>
            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase hidden md:table-cell">Data</th>
          </tr></thead><tbody>
            {filtered.map((o: any) => { const st = STATUS_CFG[(o.business_status || o.status_pedido || '').toLowerCase()] || { label: '?', cls: 'bg-gray-100 text-gray-600' }; return (
              <tr key={o.id} onClick={() => openDetail(o)} className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/30 transition group">
                <td className="px-4 py-3"><p className="font-mono text-xs font-bold text-gray-700 group-hover:text-blue-600">#{o.order_number || o.id?.slice(0, 8)}</p><p className="text-[9px] text-gray-400">{o.channel || o.origem}</p></td>
                <td className="px-4 py-3"><p className="font-semibold text-gray-900 truncate max-w-[140px]">{o.customer_name || '—'}</p></td>
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
                  <button onClick={() => sendExpedition(selectedOrder.id)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 transition shadow-sm"><Send size={12} /> Enviar Expedicao</button>
                  {selectedOrder.payment_link && <a href={selectedOrder.payment_link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition"><Eye size={12} /> Link Pgto</a>}
                  <button onClick={() => cancelOrder(selectedOrder.id)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 text-xs font-semibold hover:bg-red-50 transition ml-auto"><Ban size={12} /> Cancelar</button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
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
        <h2 className="text-lg font-bold text-gray-900">Estoque</h2>
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
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Automacoes</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{rules.length} regras configuradas</p>
      </div>

      {/* Funnel */}
      {funnelStatuses.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
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
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
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
    if (!confirm('Remover este produto?')) return
    await fetch(`/api/products/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    load()
    showToast('Produto removido')
  }

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Produtos</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{metrics.total} produtos · {metrics.active} ativos</p>
        </div>
        <button onClick={() => { setEditProduct(null); setShowCreate(true) }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md">
          <Plus size={14} /> Novo Produto
        </button>
      </div>

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
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
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
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden group hover:shadow-md transition-all cursor-pointer"
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
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

      {/* ── Product Editor Modal ── */}
      {showCreate && (
        <ProductEditorModal
          product={editProduct}
          categories={categories}
          onClose={() => { setShowCreate(false); setEditProduct(null) }}
          onSaved={() => { setShowCreate(false); setEditProduct(null); load() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

/* ── Product Editor Modal ── */
function ProductEditorModal({ product, categories, onClose, onSaved, showToast }: {
  product: any; categories: any[]; onClose: () => void; onSaved: () => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!product?.id
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [category, setCategory] = useState(product?.category || '')
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '')
  const [promoPrice, setPromoPrice] = useState(product?.promoPrice != null ? String(product.promoPrice) : '')
  const [features, setFeatures] = useState((product?.features || []).join(', '))
  const [active, setActive] = useState(product?.active !== false)
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || product?.image || '')
  const [uploading, setUploading] = useState(false)

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
      }
      const url = isEdit ? `/api/products/${product.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast(isEdit ? 'Produto atualizado!' : 'Produto criado!')
      onSaved()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
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
              <label className={labelCls}>Categoria *</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
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

          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
            <span className="text-xs font-medium text-gray-600">Produto ativo</span>
            <button type="button" onClick={() => setActive(!active)}
              className={`relative w-10 h-5 rounded-full transition ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
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
    fetch('/api/sessions?limit=50', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setSessions(d.sessions || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={5} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Mensagens</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{sessions.length} conversas</p>
      </div>
      {sessions.length === 0 ? (
        <EmptyState icon={MessageSquare} text="Nenhuma conversa ativa no momento" />
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any, i: number) => (
            <div key={s.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3">
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
export function AgentView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeSkill, setActiveSkill] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/ai/workspace-overview', { headers: getHeaders() })
      .then(r => r.json()).then(d => { setData(d.overview || d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={8} />

  const profile = data?.profile || {}
  const training = data?.training || {}
  const whatsapp = data?.whatsapp || {}
  const score = data?.readiness_score || 0

  // Skills system — specialized AI departments
  const departments = [
    {
      name: 'Vendas',
      color: 'from-emerald-500 to-teal-600',
      icon: '💰',
      skills: [
        { id: 'sales-closer', name: 'Closer de Vendas', desc: 'Identifica sinais de compra e conduz ao fechamento', status: 'active' },
        { id: 'sales-qualifier', name: 'Qualificador', desc: 'Classifica leads por potencial e perfil ideal', status: 'active' },
        { id: 'sales-objections', name: 'Quebra de Objecoes', desc: 'Responde duvidas e remove barreiras de compra', status: 'beta' },
        { id: 'sales-upsell', name: 'Upsell & Cross-sell', desc: 'Sugere produtos complementares pos-venda', status: 'planned' },
      ]
    },
    {
      name: 'Marketing',
      color: 'from-violet-500 to-purple-600',
      icon: '📣',
      skills: [
        { id: 'mkt-copywriter', name: 'Copywriter', desc: 'Cria textos persuasivos para campanhas e mensagens', status: 'active' },
        { id: 'mkt-segmentation', name: 'Segmentacao', desc: 'Analisa base e sugere segmentos de alto valor', status: 'beta' },
        { id: 'mkt-nurturing', name: 'Nutrição de Leads', desc: 'Sequencias educativas para aquecer leads frios', status: 'active' },
        { id: 'mkt-content', name: 'Planejador de Conteudo', desc: 'Calendario editorial e estrategia de posts', status: 'planned' },
      ]
    },
    {
      name: 'Atendimento',
      color: 'from-blue-500 to-indigo-600',
      icon: '🎧',
      skills: [
        { id: 'cs-firstcontact', name: 'Primeiro Contato', desc: 'Abordagem humanizada e profissional via WhatsApp', status: 'active' },
        { id: 'cs-faq', name: 'FAQ Inteligente', desc: 'Responde perguntas frequentes com base de conhecimento', status: 'active' },
        { id: 'cs-escalation', name: 'Escalacao', desc: 'Identifica quando transferir para humano', status: 'active' },
        { id: 'cs-satisfaction', name: 'Pesquisa Satisfacao', desc: 'Coleta feedback apos interacao ou venda', status: 'beta' },
      ]
    },
    {
      name: 'Logistica',
      color: 'from-amber-500 to-orange-600',
      icon: '🚚',
      skills: [
        { id: 'log-tracking', name: 'Rastreamento', desc: 'Informa status do pedido e previsao de entrega', status: 'active' },
        { id: 'log-scheduling', name: 'Agendamento', desc: 'Agenda entrega com confirmacao do cliente', status: 'beta' },
        { id: 'log-returns', name: 'Trocas e Devolucoes', desc: 'Processa solicitacoes de troca e devolucao', status: 'planned' },
      ]
    },
    {
      name: 'Inteligencia',
      color: 'from-pink-500 to-rose-600',
      icon: '🧠',
      skills: [
        { id: 'intel-sentiment', name: 'Analise de Sentimento', desc: 'Classifica respostas como positiva/neutra/negativa', status: 'active' },
        { id: 'intel-intent', name: 'Deteccao de Intencao', desc: 'Identifica o que o lead realmente quer', status: 'active' },
        { id: 'intel-scoring', name: 'Lead Scoring', desc: 'Pontua leads automaticamente por engajamento', status: 'beta' },
        { id: 'intel-predict', name: 'Predicao de Conversao', desc: 'Estima probabilidade de fechamento', status: 'planned' },
      ]
    },
  ]

  const statusLabel = (s: string) => {
    if (s === 'active') return { text: 'Ativa', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' }
    if (s === 'beta') return { text: 'Beta', cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' }
    return { text: 'Em breve', cls: 'bg-gray-100 text-gray-500' }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Agente IA</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Sistema de skills especializadas · GPT-4o Mini</p>
      </div>

      {/* Score + Profile header */}
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2.5 h-2.5 rounded-full ${whatsapp.autonomous ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs font-bold text-gray-700">WhatsApp</span>
          </div>
          <p className="text-[10px] text-gray-400">{whatsapp.autonomous ? 'Autoatendimento ativo' : 'Desativado'}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="bg-gray-50 rounded-lg p-1.5 text-center">
              <p className="text-sm font-extrabold text-gray-900">{training.total_entries || 0}</p>
              <p className="text-[8px] text-gray-400">Treinamentos</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-1.5 text-center">
              <p className="text-sm font-extrabold text-gray-900">{training.categories_count || 0}</p>
              <p className="text-[8px] text-gray-400">Categorias</p>
            </div>
          </div>
        </div>
      </div>

      {/* Objective */}
      {profile.objective && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1.5">Diretriz Principal</p>
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{profile.objective}</p>
        </div>
      )}

      {/* ── Skills by Department ── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Skills Especializadas</p>
        <div className="space-y-3">
          {departments.map(dept => (
            <div key={dept.name} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${dept.color} grid place-items-center text-sm shadow-sm`}>{dept.icon}</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{dept.name}</p>
                  <p className="text-[10px] text-gray-400">{dept.skills.filter(s => s.status === 'active').length}/{dept.skills.length} ativas</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {dept.skills.map(skill => {
                  const sl = statusLabel(skill.status)
                  const isOpen = activeSkill === skill.id
                  return (
                    <button key={skill.id} onClick={() => setActiveSkill(isOpen ? null : skill.id)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${skill.status === 'active' ? 'bg-emerald-500' : skill.status === 'beta' ? 'bg-violet-500' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{skill.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{skill.desc}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${sl.cls}`}>{sl.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model info */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-500">Motor: GPT-4o Mini</span>
        </div>
        <span className="text-[9px] text-gray-400">Alto raciocinio · Baixo custo · Alta velocidade</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   NOTIFICATIONS VIEW
   ══════════════════════════════════════════════ */
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
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Notificacoes</h2>
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

  useEffect(() => {
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
  }, [])

  async function addDomain() {
    if (!newDomain.trim() || !store?.id) return
    setAdding(true)
    try {
      const r = await fetch(`/api/storefront/stores/${store.id}/domains`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Dominio adicionado!')
      setNewDomain('')
      // Reload
      const dr = await fetch(`/api/storefront/stores/${store.id}/domains`, { headers: getHeaders() })
      const dd = await dr.json()
      setDomains(dd.domains || [])
    } catch (e: any) { showToast(e.message, 'err') }
    setAdding(false)
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Dominio</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">Configure seu dominio personalizado</p>
      </div>

      {/* Current slug */}
      {store?.slug && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">URL do Catalogo</p>
          <a href={`/catalogo/${store.slug}`} target="_blank" rel="noreferrer"
            className="text-sm font-semibold text-blue-600 hover:underline">
            /catalogo/{store.slug}
          </a>
        </div>
      )}

      {/* Add domain */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Adicionar Dominio</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
              placeholder="meusite.com.br"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <button onClick={addDomain} disabled={adding || !newDomain.trim()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition">
            {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      {/* Domains list */}
      {domains.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{domains.length} Dominios</h3>
          </div>
          {domains.map((d: any, i: number) => (
            <div key={d.domain || i} className="px-4 py-3 flex items-center justify-between border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2.5">
                <Globe size={14} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">{d.domain}</span>
                {d.is_primary && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">PRINCIPAL</span>}
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                d.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {d.verification_status === 'verified' ? 'Verificado' : 'Pendente'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   FRETE VIEW (reuses storefront logistics settings)
   ══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   ESTOQUE ACCESS VIEW (Users & Permissions)
   ══════════════════════════════════════════════ */
export function EstoqueAccessView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [credentials, setCredentials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [brandSlug, setBrandSlug] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  function loadCredentials() {
    setLoading(true)
    const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
    fetch(`/api/auth/stock-access?brand_id=${brandId}`, { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setCredentials(d.credentials || [])
        if (d.credentials?.[0]?.brand_slug) setBrandSlug(d.credentials[0].brand_slug)
        setLoading(false)
      }).catch(() => setLoading(false))
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
      return showToast('Email e senha (min 6 chars) obrigatorios', 'err')
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

  async function deactivate(id: string) {
    setToggling(id)
    try {
      await fetch(`/api/auth/stock-access/${id}/deactivate`, { method: 'PATCH', headers: getHeaders() })
      showToast('Acesso desativado')
      loadCredentials()
    } catch (e: any) { showToast(e.message, 'err') }
    setToggling(null)
  }

  if (loading) return <Skeleton rows={4} />

  const appUrl = '/estoque/app'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Estoque</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Gerencie usuarios e acessos ao app de estoque</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-md">
          <Plus size={14} /> Novo Acesso
        </button>
      </div>

      {/* App link card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">App de Estoque</p>
            <p className="text-sm font-bold mt-1">Acesso dos gerentes ao painel de controle de estoque</p>
            <p className="text-xs text-white/40 mt-1.5 font-mono">{window.location.origin}{appUrl}</p>
          </div>
          <a href={appUrl} target="_blank" rel="noreferrer"
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
                placeholder="Ex: Joao Silva"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Telefone (opcional)</label>
              <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                placeholder="31999998888"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email de login *</label>
              <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                placeholder="gerente@empresa.com" required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Senha *</label>
              <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)}
                placeholder="Min 6 caracteres" required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">Cancelar</button>
            <button onClick={createAccess} disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition">
              {saving ? 'Criando...' : 'Criar Acesso'}
            </button>
          </div>
        </div>
      )}

      {/* Credentials list */}
      {credentials.length === 0 ? (
        <EmptyState icon={Users} text="Nenhum acesso de estoque configurado" />
      ) : (
        <div className="space-y-2.5">
          {credentials.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${c.is_active ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                    <Users size={18} className={c.is_active ? 'text-emerald-500' : 'text-gray-400'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-gray-900">{c.manager_name || 'Gerente'}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600'}`}>
                        {c.is_active ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{c.email}</p>
                    {c.manager_phone && <p className="text-[10px] text-gray-400">{c.manager_phone}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.is_active && (
                    <button onClick={() => deactivate(c.id)} disabled={toggling === c.id}
                      className="px-3 py-1.5 rounded-lg text-red-500 text-[11px] font-semibold hover:bg-red-50 transition">
                      Desativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
  const [expeditionPhone, setExpeditionPhone] = useState('')

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
        setExpeditionPhone(lg.expedition_phone || '')
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
          ...(fee ? { delivery_fee: parseFloat(fee) } : {}),
          ...(radius ? { delivery_radius_km: parseFloat(radius) } : {}),
          ...(freeAbove ? { free_shipping_above: parseFloat(freeAbove) } : {}),
          ...(eta ? { default_eta_minutes: parseInt(eta) } : {}),
          ...(deliveryText ? { delivery_time_text: deliveryText } : {}),
          ...(expeditionPhone ? { expedition_phone: expeditionPhone.replace(/\D/g, '') } : {}),
        }}}),
      })
      showToast('Configuracoes de frete salvas!')
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  if (loading) return <Skeleton rows={5} />

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Frete & Entrega</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Configure as opcoes de entrega do catalogo</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Taxa de Entrega (R$)</label>
            <input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} placeholder="0,00" className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Raio (km)</label>
            <input type="number" value={radius} onChange={e => setRadius(e.target.value)} placeholder="Ex: 30" className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Frete Gratis acima de (R$)</label>
            <input type="number" step="0.01" value={freeAbove} onChange={e => setFreeAbove(e.target.value)} placeholder="Ex: 200" className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tempo estimado (min)</label>
            <input type="number" value={eta} onChange={e => setEta(e.target.value)} placeholder="Ex: 40" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Texto de entrega</label>
          <input type="text" value={deliveryText} onChange={e => setDeliveryText(e.target.value)} placeholder="Ex: Entrega em ate 3 dias uteis" className={inputCls} />
        </div>
      </div>

      {/* Expedition WhatsApp */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 space-y-3">
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
            placeholder="Ex: 5531991619663"
            className={inputCls + ' pl-9'} />
        </div>
        <p className="text-[9px] text-gray-400">Formato: DDI + DDD + numero (ex: 5531991619663). Deixe vazio para desativar.</p>
      </div>
    </div>
  )
}
