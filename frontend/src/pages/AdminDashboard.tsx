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
    <div className="h-screen bg-bg flex flex-col">
      {/* ── Mobile Topbar ── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between px-4 h-14 lg:hidden shadow-lg shrink-0">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {brand.logo_url && <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/20" />}
          <h1 className="text-sm font-bold truncate max-w-[160px]">{brand.name || 'Admin'}</h1>
        </div>
        <button onClick={logout} className="bg-white/10 rounded-xl p-2 hover:bg-white/20 transition"><LogOut size={14} /></button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Fixed Sidebar ── */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-border flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Brand header + switcher */}
          <div className="hidden lg:block border-b border-border shrink-0">
            <button onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
              className="w-full h-14 flex items-center gap-2.5 px-4 hover:bg-gray-50 transition">
              {brand.logo_url
                ? <img src={brand.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                : <div className="w-8 h-8 rounded-lg bg-blue-100 grid place-items-center shrink-0"><Package size={14} className="text-blue-500" /></div>}
              <span className="font-bold text-sm truncate flex-1 text-left">{brand.name || 'Admin'}</span>
              {brands.length > 1 && <ChevronRight size={14} className={`text-muted transition ${showBrandPicker ? 'rotate-90' : ''}`} />}
            </button>
            {showBrandPicker && brands.length > 1 && (
              <div className="px-2 pb-2 space-y-0.5">
                {brands.map((b: any) => (
                  <button key={b.id} onClick={() => switchBrand(b.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                      String(b.id) === String(activeBrandId) ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'
                    }`}>
                    {b.logo_url ? <img src={b.logo_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" /> : <div className="w-6 h-6 rounded bg-gray-100 shrink-0" />}
                    <span className="truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 py-2 overflow-y-auto">
            {mainNav.map(n => (
              <button key={n.key} onClick={() => go(n.path)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition mx-1 rounded-lg ${
                  section === n.key ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`} style={{ width: 'calc(100% - 8px)' }}>
                <n.icon size={16} />
                {n.label}
              </button>
            ))}

            <div className="mx-4 my-2 border-t border-border" />
            <p className="px-4 mb-1 text-[9px] font-bold text-gray-300 uppercase tracking-widest">Loja</p>
            {lojaNav.map(n => (
              <button key={n.key} onClick={() => go(n.path)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition mx-1 rounded-lg ${
                  section === n.key ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`} style={{ width: 'calc(100% - 8px)' }}>
                <n.icon size={16} />
                {n.label}
              </button>
            ))}
          </nav>

          {/* Bottom */}
          <div className="p-3 border-t border-border shrink-0">
            <button onClick={logout}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
              <LogOut size={13} /> Sair
            </button>
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* ── Main Content ── */}
        <main className="flex-1 lg:ml-56 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 pt-4 pb-20 lg:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-border flex h-16 lg:hidden safe-area-inset-bottom shrink-0">
        {mobileItems.map(n => (
          <button key={n.key} onClick={() => go(n.path)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
              section === n.key ? 'text-blue-600' : 'text-gray-400'
            }`}>
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[300]">
          <div className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg ${
            toast.type === 'err' ? 'bg-red-500' : 'bg-emerald-500'
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

function KpiCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: string; icon?: any; color?: string; bg?: string
}) {
  return (
    <div className="bg-white border border-border rounded-2xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</span>
        {Icon && <div className={`w-8 h-8 rounded-xl grid place-items-center ${bg || 'bg-gray-50'}`}>
          <Icon size={15} className={color || 'text-muted'} />
        </div>}
      </div>
      <p className={`text-2xl font-extrabold tracking-tight ${color || 'text-gray-900'}`}>{value}</p>
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
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-gray-900">Painel Geral</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="Leads" value={num(data?.totalLeads)} icon={Users} bg="bg-blue-50" color="text-blue-600" />
        <KpiCard label="Campanhas" value={num(data?.totalCampaigns)} icon={Megaphone} bg="bg-purple-50" color="text-purple-600" />
        <KpiCard label="Pedidos" value={num(data?.totalOrders)} icon={ShoppingCart} bg="bg-emerald-50" color="text-emerald-600" />
        <KpiCard label="Produtos" value={num(data?.products)} icon={Package} bg="bg-amber-50" color="text-amber-600" />
        <KpiCard label="Estoque Total" value={num(data?.totalStock)} icon={BarChart3} bg="bg-indigo-50" color="text-indigo-600" />
        <KpiCard label="Sem Estoque" value={num(data?.outOfStock)} icon={Zap} bg="bg-red-50" color="text-red-500" />
        <KpiCard label="Camp. Ativas" value={num(data?.activeCampaigns)} icon={Send} bg="bg-emerald-50" color="text-emerald-500" />
      </div>

      {/* Quick actions */}
      <section className="bg-white border border-border rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">Acesso Rapido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: Users, label: 'Ver Leads', color: 'text-blue-500', bg: 'bg-blue-50' },
            { icon: Megaphone, label: 'Campanhas', color: 'text-purple-500', bg: 'bg-purple-50' },
            { icon: ShoppingCart, label: 'Pedidos', color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { icon: Package, label: 'Estoque', color: 'text-amber-500', bg: 'bg-amber-50' },
          ].map(a => (
            <button key={a.label}
              className="flex items-center gap-2.5 p-3 rounded-xl hover:bg-gray-50 transition text-sm font-medium text-gray-700 border border-border">
              <div className={`w-8 h-8 rounded-lg grid place-items-center ${a.bg}`}>
                <a.icon size={15} className={a.color} />
              </div>
              {a.label}
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
   DESIGN REDIRECT
   ══════════════════════════════════════════════ */
function DesignRedirect() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/estoque', { replace: true }) }, [])
  return null
}
