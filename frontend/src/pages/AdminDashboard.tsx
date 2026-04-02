import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell,
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
          {/* Brand header */}
          <div className="hidden lg:block shrink-0 border-b border-white/[0.06]">
            <button onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
              className="w-full h-[60px] flex items-center gap-3 px-4 hover:bg-white/[0.04] transition">
              {brand.logo_url
                ? <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10 shrink-0" />
                : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shrink-0"><Package size={16} className="text-white" /></div>}
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[13px] font-bold text-white truncate">{brand.name || 'Admin'}</span>
                <span className="block text-[10px] text-white/30 font-medium">Painel de controle</span>
              </div>
              {brands.length > 1 && <ChevronRight size={12} className={`text-white/20 transition ${showBrandPicker ? 'rotate-90' : ''}`} />}
            </button>
            {showBrandPicker && brands.length > 1 && (
              <div className="px-2 pb-2.5 space-y-0.5">
                {brands.map((b: any) => (
                  <button key={b.id} onClick={() => switchBrand(b.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition ${
                      String(b.id) === String(activeBrandId) ? 'bg-white/10 text-white font-semibold' : 'text-white/40 hover:bg-white/[0.06] hover:text-white/70'
                    }`}>
                    {b.logo_url ? <img src={b.logo_url} alt="" className="w-5 h-5 rounded object-cover shrink-0" /> : <div className="w-5 h-5 rounded bg-white/10 shrink-0" />}
                    <span className="truncate">{b.name}</span>
                  </button>
                ))}
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
            {children}
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
      adminApi.clients(1, 1).catch(() => ({ total: 0 })),
      adminApi.campaigns().catch(() => ({ campaigns: [] })),
      adminApi.orders(1, 1).catch(() => ({ total: 0 })),
    ]).then(([inv, clients, campaigns, orders]) => {
      setData({
        products: inv?.total_products || 0,
        totalStock: inv?.total_units || 0,
        outOfStock: inv?.out_of_stock || 0,
        totalLeads: clients?.total || clients?.clients?.length || 0,
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

  useEffect(() => {
    setLoading(true)
    adminApi.campaigns().then(d => {
      setCampaigns(d.campaigns || d.items || (Array.isArray(d) ? d : []))
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }, [])

  const filtered = tab === 'all' ? campaigns
    : tab === 'active' ? campaigns.filter(c => c.status === 'active' || c.status === 'running' || c.status === 'sending')
    : tab === 'draft' ? campaigns.filter(c => c.status === 'draft' || c.status === 'paused')
    : campaigns.filter(c => c.status === 'completed' || c.status === 'cancelled' || c.status === 'finished')

  const statusBadge = (s?: string) => {
    const m: Record<string, { label: string; cls: string }> = {
      active: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' },
      running: { label: 'Enviando', cls: 'bg-blue-100 text-blue-700' },
      sending: { label: 'Enviando', cls: 'bg-blue-100 text-blue-700' },
      draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
      paused: { label: 'Pausada', cls: 'bg-amber-100 text-amber-700' },
      completed: { label: 'Concluida', cls: 'bg-emerald-100 text-emerald-700' },
      finished: { label: 'Finalizada', cls: 'bg-gray-100 text-gray-600' },
      cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
    }
    const cfg = m[(s || '').toLowerCase()] || { label: s || '?', cls: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Campanhas</h2>

      {/* Tab pills */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
        {([['all', 'Todas'], ['active', 'Ativas'], ['draft', 'Rascunhos'], ['done', 'Concluidas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      {loading ? <Skeleton rows={4} /> : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} text="Nenhuma campanha encontrada" />
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any, i: number) => (
            <div key={c.id || i} className="bg-white border border-border rounded-xl p-4 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm text-gray-900 truncate">{c.name || c.title || 'Sem titulo'}</h4>
                    {statusBadge(c.status)}
                  </div>
                  <p className="text-xs text-muted truncate">{c.message || c.description || ''}</p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">{dt(c.created_at)}</span>
              </div>
              {/* Metrics row */}
              {(c.total_sent || c.total_leads) && (
                <div className="flex gap-4 mt-2 pt-2 border-t border-border">
                  {c.total_leads != null && <span className="text-xs text-muted"><Users size={11} className="inline mr-1" />{c.total_leads} leads</span>}
                  {c.total_sent != null && <span className="text-xs text-muted"><Send size={11} className="inline mr-1" />{c.total_sent} enviados</span>}
                  {c.total_delivered != null && <span className="text-xs text-muted"><Eye size={11} className="inline mr-1" />{c.total_delivered} entregues</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   ORDERS VIEW
   ══════════════════════════════════════════════ */
export function OrdersView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    adminApi.orders(page, 30).then(d => {
      setOrders(d.orders || d.items || (Array.isArray(d) ? d : []))
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }, [page])

  const statusCfg: Record<string, { label: string; cls: string }> = {
    pago: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700' },
    aguardando_pagamento: { label: 'Aguardando', cls: 'bg-amber-100 text-amber-800' },
    em_entrega: { label: 'Entrega', cls: 'bg-blue-100 text-blue-700' },
    em_preparacao: { label: 'Preparando', cls: 'bg-orange-100 text-orange-700' },
    entregue: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-700' },
    cancelado: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
    novo: { label: 'Novo', cls: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Pedidos</h2>
        <span className="text-xs text-muted">{total} total</span>
      </div>

      {loading ? <Skeleton rows={6} /> : orders.length === 0 ? (
        <EmptyState icon={ShoppingCart} text="Nenhum pedido encontrado" />
      ) : (
        <>
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Pedido</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Cliente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase hidden sm:table-cell">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-muted uppercase">Valor</th>
                    <th className="text-right px-4 py-2.5 text-xs font-bold text-muted uppercase hidden md:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any, i: number) => {
                    const st = statusCfg[(o.status || '').toLowerCase()] || { label: o.status || '?', cls: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={o.id || i} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">
                          #{o.order_number || o.id?.slice(0, 8) || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[150px]">{o.customer_name || o.client_name || '—'}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {money(o.total_amount || o.total || o.total_value)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted hidden md:table-cell">
                          {dtFull(o.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {total > 30 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-muted px-3">Pagina {page}</span>
              <button disabled={orders.length < 30} onClick={() => setPage(p => p + 1)}
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

  useEffect(() => {
    setLoading(true)
    fetch('/api/automations', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setRules(d.rules || [])
        setFunnelStatuses(d.funnel_statuses || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Automacoes</h2>

      {/* Funnel */}
      {funnelStatuses.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Funil de Conversao</h3>
          <div className="flex flex-wrap gap-1.5">
            {funnelStatuses.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-lg">{s}</span>
                {i < funnelStatuses.length - 1 && <span className="text-gray-300 text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length === 0 ? (
        <EmptyState icon={Zap} text="Nenhuma automacao configurada" />
      ) : (
        <div className="space-y-2">
          {rules.map((r: any, i: number) => (
            <div key={r.id || i} className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className={r.is_active ? 'text-emerald-500' : 'text-gray-400'} />
                    <h4 className="font-semibold text-sm text-gray-900">{r.name || r.code}</h4>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.is_active ? 'ATIVA' : 'INATIVA'}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{r.trigger || r.description || ''}</p>
                  {r.code && <p className="text-[10px] font-mono text-gray-400 mt-1">{r.code}</p>}
                </div>
              </div>
            </div>
          ))}
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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/products', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setProducts(d.products || d.items || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  const filtered = search
    ? products.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()))
    : products

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Produtos</h2>
        <span className="text-xs text-muted bg-gray-100 px-2.5 py-1 rounded-lg font-semibold">{products.length} produtos</span>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-300" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} text="Nenhum produto encontrado" />
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-border">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Produto</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Categoria</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preco</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Promo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any, i: number) => (
                <tr key={p.id || i} className="border-b border-border last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {(p.imageUrl || p.image_url) && (
                        <img src={p.imageUrl || p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-[220px]">{p.name}</p>
                        {p.unit && <p className="text-[10px] text-muted">{p.unit}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted hidden sm:table-cell">{p.category || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{money(p.price)}</td>
                  <td className="px-4 py-2.5 text-right text-xs hidden md:table-cell">
                    {p.promoPrice || p.promo_price ? <span className="text-emerald-600 font-semibold">{money(p.promoPrice || p.promo_price)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DESIGN REDIRECT
   ══════════════════════════════════════════════ */
function DesignRedirect() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/estoque', { replace: true }) }, [])
  return null
}
