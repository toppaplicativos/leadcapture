import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Menu, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import { getHeaders, clearAdminAuth } from '@/lib/admin/helpers'
import { NAV_ITEMS, MOBILE_NAV, resolveSection } from '@/lib/admin/nav'

let _tt: ReturnType<typeof setTimeout> | undefined
function useShellToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const show = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    clearTimeout(_tt)
    setMsg({ text, type })
    _tt = setTimeout(() => setMsg(null), 3500)
  }, [])
  return { msg, show }
}

export function AdminShell({ children }: { children?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { msg: toast } = useShellToast()
  const section = resolveSection(location.pathname)
  const isImmersive = location.pathname === '/video-studio'
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string }>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('lead-system:nav-collapsed') === 'true',
  )

  function toggleNav() {
    const next = !navCollapsed
    setNavCollapsed(next)
    localStorage.setItem('lead-system:nav-collapsed', String(next))
  }

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
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
      })
      .then(d => {
        const list = d.brands || []
        const active = d.active_brand_id
        setBrands(list)
        setActiveBrandId(active || '')
        if (active) {
          try { localStorage.setItem('lead-system:active-brand-id', String(active)) } catch { /* ignore */ }
        }
        const b = list.find((x: any) => String(x.id) === String(active)) || list[0] || {}
        setBrand({ name: b.name, logo_url: b.logo_url })
        if (b.name) document.title = `${b.name} — Admin`
        const root = document.documentElement
        if (b.primary_color) root.style.setProperty('--brand-primary', b.primary_color)
        if (b.secondary_color) {
          root.style.setProperty('--brand-secondary', b.secondary_color)
          root.style.setProperty('--brand-secondary-soft', `${b.secondary_color}1a`)
          root.style.setProperty('--brand-secondary-light', `${b.secondary_color}26`)
        }
        try {
          localStorage.setItem('lead-system:brand-colors', JSON.stringify({
            primary: b.primary_color,
            secondary: b.secondary_color,
          }))
        } catch { /* ignore */ }
      })
      .catch(() => {})
  }, [authReady, refreshKey, navigate])

  async function switchBrand(brandId: string) {
    try {
      await fetch(`/api/brands/${brandId}/activate`, { method: 'POST', headers: getHeaders() })
      localStorage.setItem('lead-system:active-brand-id', brandId)
      setActiveBrandId(brandId)
      setShowBrandPicker(false)
      setRefreshKey(k => k + 1)
    } catch { /* ignore */ }
  }

  function logout() {
    clearAdminAuth()
    navigate('/login', { replace: true })
  }

  function go(path: string) {
    navigate(path)
    setSidebarOpen(false)
  }

  const mobileItems = NAV_ITEMS.filter(n => MOBILE_NAV.includes(n.key))
  const mainNav = NAV_ITEMS.filter(n => n.group === 'main')
  const lojaNav = NAV_ITEMS.filter(n => n.group === 'loja')
  const configNav = NAV_ITEMS.filter(n => n.group === 'config')

  function NavButton({ item, active, onClick }: { item: typeof NAV_ITEMS[number]; active: boolean; onClick: () => void }) {
    if (navCollapsed) {
      return (
        <button
          onClick={onClick}
          title={item.label}
          aria-current={active ? 'page' : undefined}
          className={`relative w-full flex items-center justify-center h-9 rounded-lg transition-colors ${
            active ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <item.icon size={17} strokeWidth={active ? 2 : 1.75} />
          {item.badge && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-gray-900" />
          )}
        </button>
      )
    }
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
            className="ml-auto inline-flex items-center px-1.5 h-[18px] rounded-full bg-gray-900 text-white text-[9px] font-bold tracking-wider uppercase shrink-0"
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
          navCollapsed
            ? <div className="mx-2 my-2 border-t border-gray-100" />
            : <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
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
      <div className={`shrink-0 pt-3 ${navCollapsed ? 'px-2' : 'px-3'}`}>
        <button
          onClick={() => !navCollapsed && brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
          title={navCollapsed ? (brand.name || 'Admin') : undefined}
          className={`flex items-center rounded-xl hover:bg-gray-50 transition ${
            navCollapsed ? 'w-full justify-center p-2' : 'w-full gap-3 p-2.5'
          }`}
        >
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gray-900 text-white grid place-items-center text-sm font-semibold shrink-0">
              {(brand.name || 'A').charAt(0).toUpperCase()}
            </div>
          )}
          {!navCollapsed && (
            <>
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
                  className={`text-gray-400 transition-transform shrink-0 ${showBrandPicker ? 'rotate-90' : ''}`}
                />
              )}
            </>
          )}
        </button>

        {!navCollapsed && showBrandPicker && brands.length > 1 && (
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
                    isActive ? 'bg-white text-gray-900 font-semibold shadow-sm' : 'text-gray-600 hover:bg-white/60'
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
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--brand-secondary, #111827)' }} />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="my-2 mx-3 border-t border-border-light" />

      <nav className={`flex-1 pb-3 overflow-y-auto space-y-1 ${navCollapsed ? 'px-2' : 'px-3'}`}>
        <NavSection items={mainNav} />
        <NavSection label="Catálogo" items={lojaNav} />
        <NavSection label="Configurações" items={configNav} />
      </nav>

      <div className="shrink-0 p-2 border-t border-border-light">
        <button
          onClick={logout}
          title={navCollapsed ? 'Sair' : undefined}
          className={`flex items-center rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition ${
            navCollapsed ? 'w-full justify-center h-9' : 'w-full gap-2.5 px-3 h-9'
          }`}
        >
          <LogOut size={15} strokeWidth={1.75} className="text-gray-400" />
          {!navCollapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  )

  return (
    <div className="h-screen bg-bg flex flex-col">
      <WhatsAppHealthBanner />
      {!sidebarOpen && !isImmersive && (
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
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-[60] lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed top-0 bottom-0 left-0 w-[280px] sm:w-[260px] bg-white border-r border-border-light flex flex-col transition-[transform,width] duration-200 lg:translate-x-0 safe-area-top ${
            navCollapsed ? 'lg:w-[56px]' : 'lg:w-[240px]'
          } ${
            sidebarOpen ? 'translate-x-0 z-[70] shadow-2xl lg:shadow-none lg:z-30' : '-translate-x-full lg:translate-x-0 lg:z-30'
          }`}
        >
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-90 transition"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
          <button
            onClick={toggleNav}
            title={navCollapsed ? 'Expandir menu' : 'Recolher menu'}
            className="absolute top-[62px] -right-[13px] z-20 hidden lg:flex w-[26px] h-[26px] items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
          >
            {navCollapsed
              ? <ChevronRight size={12} strokeWidth={2.5} />
              : <ChevronLeft size={12} strokeWidth={2.5} />}
          </button>
          {sidebarContent}
        </aside>

        <main className={`flex-1 transition-[margin] duration-200 ${navCollapsed ? 'lg:ml-[56px]' : 'lg:ml-[240px]'} ${isImmersive ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          {isImmersive ? (
            <div key={activeBrandId} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              {authReady ? children : (
                <div className="min-h-[55vh] grid place-items-center">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-4 pt-5 pb-24 lg:pb-10 lg:px-8">
              <div key={activeBrandId}>
                {authReady ? children : (
                  <div className="min-h-[55vh] grid place-items-center">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {!sidebarOpen && !isImmersive && (
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
                <span className={`tracking-wide ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-500'}`}>
                  {n.label}
                </span>
              </button>
            )
          })}
        </nav>
      )}

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