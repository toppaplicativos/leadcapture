import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Plug,
  CreditCard,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Loader2,
  Menu,
  X,
  Mail,
  Building2,
  Cpu,
  Wrench,
  BellRing,
  Sparkles,
} from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { NotificationBellButton } from '@/components/notifications/NotificationCenter'
import { PushActivationCard } from '@/components/push/PushActivationCard'
import { masterApi, type PlatformVersionInfo } from '@/lib/master-api'
import { masterAdminBase } from '@/lib/master-host'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
}

function buildNav(): NavItem[] {
  const base = masterAdminBase()
  return [
    { to: base, label: 'Painel', Icon: LayoutDashboard },
    { to: `${base}/organizacoes`, label: 'Organizações', Icon: Building2 },
    { to: `${base}/usuarios`, label: 'Usuários', Icon: Users },
    { to: `${base}/planos`, label: 'Planos', Icon: CreditCard },
    { to: `${base}/ferramentas`, label: 'Ferramentas', Icon: Wrench },
    { to: `${base}/push-notificacoes`, label: 'Push', Icon: BellRing },
    { to: `${base}/providers`, label: 'Providers IA', Icon: Cpu },
    { to: `${base}/algoritmos`, label: 'Algoritmos', Icon: Sparkles },
    { to: `${base}/integracoes`, label: 'Integrações', Icon: Plug },
    { to: `${base}/emails`, label: 'Emails', Icon: Mail },
    { to: `${base}/configuracoes`, label: 'Configurações', Icon: Settings },
    { to: `${base}/audit-log`, label: 'Auditoria', Icon: ScrollText },
  ]
}

interface MasterShellProps {
  children: ReactNode
}

export function MasterShell({ children }: MasterShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [authReady, setAuthReady] = useState(false)
  const [me, setMe] = useState<{ id: string; email: string; name: string } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deployStamp, setDeployStamp] = useState<PlatformVersionInfo | null>(null)

  const adminBase = masterAdminBase()
  const nav = buildNav()

  /* auth check */
  useEffect(() => {
    const token = localStorage.getItem('lead-system-token')
    if (!token) {
      navigate(`/login?redirect=${encodeURIComponent(adminBase)}`, { replace: true })
      return
    }
    masterApi
      .me()
      .then(({ user }) => {
        setMe(user)
        setAuthReady(true)
      })
      .catch(err => {
        const msg = String(err?.message || '')
        if (msg.includes('Acesso restrito') || msg.includes('403')) {
          navigate('/login?error=not_super_admin', { replace: true })
        } else {
          navigate(`/login?redirect=${encodeURIComponent(adminBase)}`, { replace: true })
        }
      })
  }, [navigate, adminBase])

  /* deploy stamp always visible in sidebar */
  useEffect(() => {
    if (!authReady) return
    masterApi
      .platformVersion()
      .then(r => setDeployStamp(r.platform))
      .catch(() => {
        masterApi
          .health()
          .then(h => {
            if (h.platform) setDeployStamp(h.platform)
          })
          .catch(() => {})
      })
  }, [authReady])

  /* close drawer on route change (mobile) */
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  function logout() {
    localStorage.removeItem('lead-system-token')
    navigate('/login', { replace: true })
  }

  const getHeaders = () => {
    const token = localStorage.getItem('lead-system-token')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  if (!authReady || !me) {
    return (
      <div className="master-console min-h-screen grid place-items-center bg-[#0a0a0a]">
        <Loader2 size={20} className="animate-spin text-white/60" />
      </div>
    )
  }

  return (
    <div className="master-console min-h-screen bg-[#0a0a0a] text-white flex">
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-[260px] flex flex-col bg-[#0a0a0a] border-r border-white/[0.08] transition-transform safe-area-top ${
          drawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5 border-b border-white/[0.06]">
          <BrandMark size={28} inverted />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold tracking-tight">LeadCapture</p>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-emerald-400">
              Master
            </p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden w-8 h-8 grid place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
          {nav.map(item => {
            const active =
              item.to === adminBase
                ? location.pathname === adminBase
                : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`master-console__nav-item flex items-center gap-3 px-3 h-10 text-[13px] rounded-xl transition-colors ${
                  active
                    ? 'is-active bg-white/[0.10] text-white font-semibold ring-1 ring-white/[0.08]'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <item.Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.75}
                  className={active ? 'text-emerald-400' : 'text-white/40'}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User pill + deploy stamp */}
        <div className="p-3 border-t border-white/[0.06] space-y-2">
          {deployStamp && (
            <div
              className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
              title={[
                deployStamp.build_time ? `build ${deployStamp.build_time}` : '',
                deployStamp.git_branch ? `branch ${deployStamp.git_branch}` : '',
                `uptime ${deployStamp.uptime_s}s`,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/35 mb-0.5">
                Deploy
              </p>
              <p className="text-[11px] font-mono text-emerald-400/90 truncate">
                {deployStamp.git_sha || 'sha?'}
                <span className="text-white/30"> · </span>
                <span className="text-white/55 font-sans">{deployStamp.version}</span>
              </p>
            </div>
          )}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-white text-gray-900 grid place-items-center text-xs font-bold">
              {me.name?.charAt(0).toUpperCase() || me.email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white truncate">{me.name || me.email}</p>
              <p className="text-[10px] text-white/40 truncate">{me.email}</p>
            </div>
            <button
              onClick={logout}
              aria-label="Sair"
              title="Sair"
              className="w-7 h-7 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition"
            >
              <LogOut size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 lg:max-w-[calc(100%-260px)]">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[#0a0a0a]/85 backdrop-blur-xl border-b border-white/[0.08] safe-area-top">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="w-9 h-9 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-90 transition"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2">
            <BrandMark size={22} inverted />
            <span className="text-[13px] font-bold tracking-tight">Master</span>
          </div>
          <NotificationBellButton
            getHeaders={getHeaders}
            appContext="master"
            onNavigate={(path) => navigate(path)}
            className="text-white/70 hover:bg-white/10"
          />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-10">
            <PushActivationCard className="mb-6 !border-white/10 !bg-white/[0.02]" />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────
   Shared UI building blocks for master pages
   ────────────────────────────────────────────────── */

export function MasterPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap mb-7">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.025em] text-white">{title}</h1>
        {subtitle && (
          <p className="text-[13px] text-white/50 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

export function MasterCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`master-console__card rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] ${className}`}
    >
      {children}
    </div>
  )
}
