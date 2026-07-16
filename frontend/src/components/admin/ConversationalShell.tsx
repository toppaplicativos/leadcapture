import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, ChevronDown, X, PanelLeftClose, PanelLeftOpen, ArrowLeft } from 'lucide-react'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import { AgentShellProvider, useAgentShell } from '@/lib/agent/AgentShellContext'
import { ProspectBridgeProvider } from '@/lib/agent/ProspectBridgeContext'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { InboxBridgeProvider } from '@/lib/agent/InboxBridgeContext'
import { ProductsBridgeProvider } from '@/lib/agent/ProductsBridgeContext'
import { CampaignsBridgeProvider } from '@/lib/agent/CampaignsBridgeContext'
import { GalleryBridgeProvider } from '@/lib/agent/GalleryBridgeContext'
import { InstagramBridgeProvider } from '@/lib/agent/InstagramBridgeContext'
import { FacebookBridgeProvider } from '@/lib/agent/FacebookBridgeContext'
import { AutomationsBridgeProvider } from '@/lib/agent/AutomationsBridgeContext'
import { AffiliatesBridgeProvider } from '@/lib/agent/AffiliatesBridgeContext'
import { LeadsBridgeProvider } from '@/lib/agent/LeadsBridgeContext'
import { ClientsBridgeProvider } from '@/lib/agent/ClientsBridgeContext'
import { OrdersBridgeProvider } from '@/lib/agent/OrdersBridgeContext'
import { DashboardBridgeProvider } from '@/lib/agent/DashboardBridgeContext'
import { SkillsBridgeProvider } from '@/lib/agent/SkillsBridgeContext'
import { WorkspaceChat } from '@/components/agent/WorkspaceChat'
import { AgentCanvas } from '@/components/agent/AgentCanvas'
import { getHeaders, clearAdminAuth } from '@/lib/admin/helpers'
import { cacheActiveBrand } from '@/lib/brand-splash'
import { PageSplash } from '@/components/PageSplash'
import { DocumentTitleSync } from '@/components/DocumentTitleSync'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { WhatsAppConnectProvider } from '@/lib/whatsapp/WhatsAppConnectContext'
import { WhatsAppConnectModal } from '@/components/whatsapp/WhatsAppConnectModal'
import { ChannelHeaderIcons } from '@/components/admin/ChannelHeaderIcons'
import { ProspectSearchControls } from '@/components/agent/prospect/ProspectSearchControls'
import { EntitlementsProvider, useEntitlements } from '@/lib/EntitlementsContext'
import { PlanUpgradeModalHost } from '@/components/billing/PlanUpgradeModal'
import { NAV_ITEMS } from '@/lib/admin/nav'
import { prefetchCanvasRoute } from '@/lib/agent/canvasPages'
import { useConfirm } from '@/components/ConfirmModal'

const COLLAPSED_CHAT_GROUPS = [
  { label: 'Principal', keys: ['dashboard', 'busca', 'clientes', 'leads'] },
  { label: 'Canais', keys: ['mensagens', 'whatsapp', 'instagram', 'facebook', 'emails'] },
  { label: 'Vendas', keys: ['campanhas', 'loja', 'produtos', 'pedidos', 'estoque', 'pagamentos', 'afiliados', 'galeria'] },
  { label: 'Inteligência', keys: ['automacoes', 'notificacoes', 'habilidades', 'agente', 'atendente', 'provedores-ia'] },
  { label: 'Sistema', keys: ['configuracoes'] },
] as const

let _tt: ReturnType<typeof setTimeout> | undefined
function useShellToast(): { msg: { text: string; type: 'ok' | 'err' } | null; show: (text: string, type?: 'ok' | 'err') => void } {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const show = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    clearTimeout(_tt)
    setMsg({ text, type })
    _tt = setTimeout(() => setMsg(null), 3500)
  }, [])
  return { msg, show }
}

type ShellBrandState = {
  brand: { name?: string; logo_url?: string }
  brands: any[]
  activeBrandId: string
  showBrandPicker: boolean
  setShowBrandPicker: (v: boolean) => void
  switchBrand: (brandId: string) => Promise<void>
  logout: () => void
  refreshKey: number
}

function ConversationalShellBody({
  children,
  brandState,
  toast,
  showToast,
}: {
  children?: ReactNode
  brandState: ShellBrandState
  toast: { text: string; type: 'ok' | 'err' } | null
  showToast: (text: string, type?: 'ok' | 'err') => void
}) {
  const {
    mobileCanvasOpen, setMobileCanvasOpen, desktopCanvasOpen,
    activeModuleId, activeModuleLabel, workspaceSurface, triggerNav, optimisticRoute,
    returnToChat,
  } = useAgentShell()
  const location = useLocation()
  const isDesktop = useIsDesktop()
  const [chatCollapsed, setChatCollapsed] = useState(
    () => localStorage.getItem('lead-system:desktop-chat-collapsed') === 'true',
  )
  const [shortcutTooltip, setShortcutTooltip] = useState<{ label: string; top: number; left: number } | null>(null)
  // Rotas operacionais (/atendente, …): experiência de página, não overlay frágil
  // optimisticRoute = clique de atalho antes do router atualizar
  // A volta explícita ao chat tem prioridade sobre uma rota otimista antiga do
  // canvas. Sem isso a URL muda, mas o painel permanece visível no PWA.
  const routeForSurface = location.pathname === '/assistente'
    ? location.pathname
    : (optimisticRoute || location.pathname)
  const pathOnlyNow = (routeForSurface || '').split('?')[0] || ''
  const isExplicitChatHome = pathOnlyNow === '/assistente'
  const urlDrivenOpen =
    pathOnlyNow !== '/assistente' &&
    pathOnlyNow !== '' &&
    pathOnlyNow !== '/'
  // Com o chat recolhido, /admin representa o dashboard no canvas e deve permanecer aberto.
  // A hidratação tardia da conversa não pode desmontar a navegação rápida.
  const dashboardPinnedOpen = isDesktop && chatCollapsed && (pathOnlyNow === '/admin' || pathOnlyNow === '/dashboard')
  // /assistente é um destino explícito: ao voltar para o chat, nenhum canvas
  // hidratado da conversa anterior pode continuar cobrindo a conversa.
  const canvasOpen = !isExplicitChatHome && (desktopCanvasOpen || urlDrivenOpen || dashboardPinnedOpen)
  const visibleWorkspaceSurface = isExplicitChatHome ? 'chat' : workspaceSurface
  const { brand, brands, activeBrandId, showBrandPicker, setShowBrandPicker, switchBrand, logout, refreshKey } = brandState
  const { confirm } = useConfirm()
  const brandMenuRef = useRef<HTMLDivElement>(null)

  const requestLogout = async () => {
    const approved = await confirm({
      title: 'Sair da sua conta?',
      message: 'Você precisará entrar novamente para acessar a organização e continuar seu trabalho.',
      confirmLabel: 'Sair da conta',
      cancelLabel: 'Continuar no app',
      variant: 'danger',
      icon: LogOut,
    })
    if (approved) logout()
  }

  /* Mobile: em rota operacional o canvas é a página principal (sempre is-open).
     Skills/hidratação NÃO podem esconder com activeModuleId. */
  const mobileCanvasVisible = urlDrivenOpen
    ? true
    : mobileCanvasOpen && canvasOpen && !activeModuleId

  const toggleDesktopChat = () => {
    setChatCollapsed((current) => {
      const next = !current
      localStorage.setItem('lead-system:desktop-chat-collapsed', String(next))
      return next
    })
  }

  useEffect(() => {
    if (!showBrandPicker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowBrandPicker(false)
    }
    const onDoc = (e: MouseEvent) => {
      if (brandMenuRef.current && !brandMenuRef.current.contains(e.target as Node)) {
        setShowBrandPicker(false)
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [showBrandPicker, setShowBrandPicker])

  const { entitlements, brandActive, maintenanceMode, refresh: refreshEntitlements } = useEntitlements()
  const prospectBridge = useProspectBridgeOptional()
  const collapsedChatGroups = COLLAPSED_CHAT_GROUPS.map((group) => ({
    ...group,
    items: group.keys
      .map((key) => NAV_ITEMS.find((item) => item.key === key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })).filter((group) => group.items.length > 0)

  useEffect(() => {
    /* toast residual for non-entitlement messages; plan walls open PlanUpgradeModal */
    import('@/lib/api-errors').then(({ registerApiErrorToast }) => {
      registerApiErrorToast((msg, type) => {
        if (type === 'err') showToast(msg, 'err')
        else showToast(msg, 'ok')
      })
    })
  }, [showToast])

  useEffect(() => {
    /* when brand id changes via picker, re-pull entitlements */
    refreshEntitlements()
  }, [activeBrandId, refreshEntitlements])

  /*
   * PWA mobile: se o browser restaurar /admin (home legado), manda para o chat.
   * A conversa (última sessão) é restaurada pelo WorkspaceChat; painel fica sob demanda.
   * Só na 1ª entrada da aba/sessão — depois o usuário pode abrir o Painel à vontade.
   */
  useEffect(() => {
    if (isDesktop) return
    if (typeof window === 'undefined') return
    const path = (location.pathname || '').split('?')[0]
    if (path !== '/admin' && path !== '/dashboard') return
    let standalone = false
    try {
      standalone =
        window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || (window.navigator as { standalone?: boolean }).standalone === true
    } catch {
      standalone = false
    }
    // Também trata mobile browser com source=pwa (manifest / atalho)
    const fromPwa = new URLSearchParams(location.search || '').get('source') === 'pwa'
    if (!standalone && !fromPwa) return
    const flag = 'lead-system:pwa-chat-home'
    try {
      if (sessionStorage.getItem(flag) === '1') return
      sessionStorage.setItem(flag, '1')
    } catch {
      /* private mode */
    }
    returnToChat({ replace: true })
  }, [isDesktop, location.pathname, location.search, returnToChat])

  return (
    <div
      className={[
        'agent-shell flex flex-col bg-bg',
        `agent-shell--${visibleWorkspaceSurface}`,
        urlDrivenOpen ? 'agent-shell--route-page' : '',
        canvasOpen ? 'agent-shell--canvas-open' : '',
      ].filter(Boolean).join(' ')}
      data-route={pathOnlyNow}
    >
      <div className="agent-shell__chrome shrink-0">
        {maintenanceMode && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 font-medium">
            Plataforma em manutenção — algumas ações podem estar bloqueadas.
          </div>
        )}
        {!brandActive && entitlements?.brand?.status && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-[12px] text-red-800 font-medium">
            Organização {entitlements.brand.status === 'suspended' ? 'suspensa' : 'arquivada'} —
            contate o suporte para reativar.
          </div>
        )}
        {entitlements?.subscription?.plan_name && (
          <div className="sr-only" aria-hidden>
            Plano {entitlements.subscription.plan_name}
          </div>
        )}
        <WhatsAppHealthBanner embedded />
        <header className="agent-shell__header">
        {/* Mobile: voltar ao chat no header (fora do canvas) — evita z-index sob o chrome */}
        {!isDesktop && urlDrivenOpen && (
          <button
            type="button"
            className="agent-shell__header-back"
            onClick={() => returnToChat({ replace: true })}
            aria-label="Voltar ao chat"
          >
            <ArrowLeft size={16} strokeWidth={2.25} aria-hidden />
            <span>Chat</span>
          </button>
        )}
        <div className="agent-shell__brand" ref={brandMenuRef}>
          <button
            type="button"
            onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
            className="agent-shell__brand-btn"
            aria-expanded={brands.length > 1 ? showBrandPicker : undefined}
            aria-haspopup={brands.length > 1 ? 'listbox' : undefined}
            aria-label={brands.length > 1 ? 'Trocar marca' : undefined}
          >
            {brand.logo_url ? (
              <img
                src={brand.logo_url}
                alt=""
                className="agent-shell__logo"
                onError={(e) => {
                  const el = e.currentTarget
                  el.style.display = 'none'
                  const fallback = el.nextElementSibling as HTMLElement | null
                  if (fallback) fallback.style.display = 'grid'
                }}
              />
            ) : null}
            <span
              className="agent-shell__logo agent-shell__logo--fallback"
              style={brand.logo_url ? { display: 'none' } : undefined}
              aria-hidden={!!brand.logo_url}
            >
              {(brand.name || 'L').charAt(0).toUpperCase()}
            </span>
            <span className="agent-shell__brand-name">{brand.name || 'LeadCapture'}</span>
            {brands.length > 1 && (
              <ChevronDown size={14} className={`text-gray-400 transition ${showBrandPicker ? 'rotate-180' : ''}`} />
            )}
          </button>

          {showBrandPicker && brands.length > 1 && (
            <div className="agent-shell__brand-menu" role="listbox" aria-label="Marcas">
              {brands.map((b: any) => (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-selected={String(b.id) === String(activeBrandId)}
                  onClick={() => switchBrand(b.id)}
                  className={`agent-shell__brand-item ${String(b.id) === String(activeBrandId) ? 'is-active' : ''}`}
                >
                  {b.logo_url ? (
                    <img
                      src={b.logo_url}
                      alt=""
                      className="agent-shell__brand-item-logo"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <span className="agent-shell__brand-item-logo agent-shell__brand-item-logo--fallback">
                      {(b.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="agent-shell__header-actions">
          {(activeModuleLabel || desktopCanvasOpen) && (
            <span className="agent-shell__surface-status" title="Onde você está">
              <span className="agent-shell__surface-status-chat">Chat</span>
              {activeModuleLabel && (
                <>
                  <span className="agent-shell__surface-status-sep" aria-hidden>·</span>
                  <span className="agent-shell__surface-status-module">{activeModuleLabel}</span>
                </>
              )}
              {desktopCanvasOpen && (
                <>
                  <span className="agent-shell__surface-status-sep" aria-hidden>·</span>
                  <span className="agent-shell__surface-status-canvas">
                    {isDesktop ? 'Painel' : 'Tela cheia'}
                  </span>
                </>
              )}
            </span>
          )}
          <ChannelHeaderIcons brandKey={activeBrandId || refreshKey} />
          <button type="button" onClick={requestLogout} className="agent-shell__logout" aria-label="Sair">
            <LogOut size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
        </header>
      </div>

      <div
        className={[
          'agent-shell__body flex-1 min-h-0 flex',
          canvasOpen || urlDrivenOpen ? 'has-canvas' : 'chat-only',
          urlDrivenOpen ? 'has-route-page' : '',
        ].filter(Boolean).join(' ')}
      >
        <aside
          className={`agent-shell__rail shrink-0${isDesktop && canvasOpen && chatCollapsed ? ' is-collapsed' : ''}`}
          aria-label="Conversa"
          /* Em mobile + rota operacional o rail fica secundário (não cobre a página) */
          data-secondary={urlDrivenOpen && !isDesktop ? 'true' : undefined}
        >
          <WorkspaceChat brandName={brand.name} brandLogoUrl={brand.logo_url} />
        </aside>

        {isDesktop && canvasOpen && (
          <div className={`agent-shell__rail-divider${chatCollapsed ? ' is-navigation' : ''}`} aria-label={chatCollapsed ? 'Navegação rápida' : undefined}>
            <button
              type="button"
              className="agent-shell__rail-toggle"
              onClick={toggleDesktopChat}
              aria-label={chatCollapsed ? 'Expandir chat' : 'Recolher chat'}
              title={chatCollapsed ? 'Expandir chat' : 'Recolher chat'}
            >
              {chatCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            {chatCollapsed && (
              <nav className="agent-shell__collapsed-nav" aria-label="Atalhos do aplicativo">
                {collapsedChatGroups.map((group, groupIndex) => (
                  <div className="agent-shell__collapsed-nav-group" key={group.label} aria-label={group.label}>
                    {groupIndex > 0 && <span className="agent-shell__collapsed-nav-separator" role="separator" />}
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active =
                        pathOnlyNow === item.path
                        || (item.key === 'dashboard' && (pathOnlyNow === '/dashboard' || pathOnlyNow === '/admin'))
                        || (item.key === 'configuracoes' && pathOnlyNow.startsWith('/configuracoes'))
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`agent-shell__collapsed-nav-item${active ? ' is-active' : ''}`}
                          onClick={() => {
                            triggerNav(item.key)
                            setShortcutTooltip(null)
                          }}
                          onMouseEnter={(event) => {
                            prefetchCanvasRoute(item.path)
                            const rect = event.currentTarget.getBoundingClientRect()
                            setShortcutTooltip({ label: item.label, top: rect.top + rect.height / 2, left: rect.right + 10 })
                          }}
                          onPointerDown={() => prefetchCanvasRoute(item.path)}
                          onMouseLeave={() => setShortcutTooltip(null)}
                          onFocus={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect()
                            setShortcutTooltip({ label: item.label, top: rect.top + rect.height / 2, left: rect.right + 10 })
                          }}
                          onBlur={() => setShortcutTooltip(null)}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          title={item.label}
                        >
                          <Icon size={17} strokeWidth={1.8} />
                        </button>
                      )
                    })}
                  </div>
                ))}
              </nav>
            )}
            {chatCollapsed && shortcutTooltip && (
              <div className="agent-shell__shortcut-tooltip" role="tooltip" style={{ top: shortcutTooltip.top, left: shortcutTooltip.left }}>
                {shortcutTooltip.label}
              </div>
            )}
          </div>
        )}

        <main
          className={[
            'agent-shell__canvas flex-1 min-w-0 min-h-0',
            mobileCanvasVisible || urlDrivenOpen ? 'is-open' : '',
            urlDrivenOpen ? 'is-route-page' : '',
          ].filter(Boolean).join(' ')}
          aria-label={
            urlDrivenOpen
              ? 'Página'
              : activeModuleLabel
                ? `Painel: ${activeModuleLabel}`
                : 'Painel de trabalho'
          }
          aria-hidden={urlDrivenOpen || mobileCanvasVisible || canvasOpen ? undefined : true}
        >
          {/* Overlay (skills/módulos): X no canvas. Rotas URL usam botão no header. */}
          {!isDesktop && mobileCanvasVisible && !urlDrivenOpen && (
            <button
              type="button"
              className="agent-shell__canvas-close"
              onClick={() => returnToChat({ replace: true })}
              aria-label="Voltar ao chat"
            >
              <X size={18} />
            </button>
          )}
          {/* key só por brand — NÃO por path: remount a cada rota re-inicializava o mapa
              panfleteiro, re-disparava radar e dava sensação de “app reabrindo”. */}
          <div key={activeBrandId || 'brand'} className="h-full min-h-0">
            <AgentCanvas>{children}</AgentCanvas>
          </div>
          {isDesktop && chatCollapsed && pathOnlyNow === '/busca' && prospectBridge?.isReady && (
            <div className="agent-shell__prospect-control-center" aria-label="Centro de controle da prospecção">
              <ProspectSearchControls placement="canvas" />
            </div>
          )}
        </main>
      </div>

      <WhatsAppConnectModal onToast={showToast} />

      {toast && (
        <div className="agent-shell__toast" role="status">
          <span className={toast.type === 'err' ? 'is-err' : ''}>{toast.text}</span>
        </div>
      )}
    </div>
  )
}

function ConversationalShellInner({ children }: { children?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { msg: toast, show: showToast } = useShellToast()
  const isImmersive = location.pathname === '/video-studio'
  const [brand, setBrand] = useState<{ name?: string; logo_url?: string }>({})
  const [brands, setBrands] = useState<any[]>([])
  const [activeBrandId, setActiveBrandId] = useState(localStorage.getItem('lead-system:active-brand-id') || '')
  const [showBrandPicker, setShowBrandPicker] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('agent-workspace')
    return () => document.documentElement.classList.remove('agent-workspace')
  }, [])

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
      .then(async (r) => {
        if (!r.ok) {
          clearAdminAuth()
          if (mounted) navigate('/login', { replace: true })
          return
        }
        if (mounted) setAuthReady(true)
      })
      .catch(() => { if (mounted) setAuthReady(true) })
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!authReady) return
    fetch('/api/brands', { headers: getHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) {
            clearAdminAuth()
            navigate('/login', { replace: true })
          }
          return {}
        }
        return r.json()
      })
      .then((d) => {
        const list = d.brands || []
        const active = d.active_brand_id
        setBrands(list)
        setActiveBrandId(active || '')
        if (active) {
          try { localStorage.setItem('lead-system:active-brand-id', String(active)) } catch { /* */ }
        }
        const b = list.find((x: any) => String(x.id) === String(active)) || list[0] || {}
        setBrand({ name: b.name, logo_url: b.logo_url })
        cacheActiveBrand(b.name, b.logo_url)
        const root = document.documentElement
        if (b.primary_color) root.style.setProperty('--brand-primary', b.primary_color)
        if (b.secondary_color) {
          root.style.setProperty('--brand-secondary', b.secondary_color)
          root.style.setProperty('--brand-secondary-soft', `${b.secondary_color}1a`)
          root.style.setProperty('--brand-secondary-light', `${b.secondary_color}26`)
        }
      })
      .catch(() => {})
  }, [authReady, refreshKey, navigate])

  async function switchBrand(brandId: string) {
    try {
      await fetch(`/api/brands/${brandId}/activate`, { method: 'POST', headers: getHeaders() })
      localStorage.setItem('lead-system:active-brand-id', brandId)
      setActiveBrandId(brandId)
      setShowBrandPicker(false)
      /* re-sync entitlements for the new brand context */
      try {
        const { invalidateEntitlementsCache } = await import('@/lib/entitlements')
        invalidateEntitlementsCache()
      } catch {
        /* ignore */
      }
      setRefreshKey((k) => k + 1)
    } catch { /* ignore */ }
  }

  function logout() {
    clearAdminAuth()
    navigate('/login', { replace: true })
  }

  if (!authReady) {
    return (
      <div className="h-screen w-full" style={{ background: 'var(--color-surface-alt, #f3f3f3)' }}>
        <PageSplash variant="route" view="admin" label="Painel" />
      </div>
    )
  }

  if (isImmersive) {
    return (
      <div className="agent-shell flex flex-col bg-bg">
        <div className="agent-shell__chrome shrink-0">
          <WhatsAppHealthBanner embedded />
        </div>
        <div key={activeBrandId} className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    )
  }

  const brandState: ShellBrandState = {
    brand,
    brands,
    activeBrandId,
    showBrandPicker,
    setShowBrandPicker,
    switchBrand,
    logout,
    refreshKey,
  }

  return (
    <AgentShellProvider brandId={activeBrandId}>
      <DocumentTitleSync brandName={brand.name} />
      <ConversationalShellBody brandState={brandState} toast={toast} showToast={showToast}>
        {children}
      </ConversationalShellBody>
    </AgentShellProvider>
  )
}

export function ConversationalShell({ children }: { children?: ReactNode }) {
  return (
    <EntitlementsProvider>
      <WhatsAppConnectProvider>
        <ProspectBridgeProvider>
          <InboxBridgeProvider>
            <ProductsBridgeProvider>
              <CampaignsBridgeProvider>
                <GalleryBridgeProvider>
                  <InstagramBridgeProvider>
                  <FacebookBridgeProvider>
                  <AutomationsBridgeProvider>
                  <AffiliatesBridgeProvider>
                  <LeadsBridgeProvider>
                    <ClientsBridgeProvider>
                      <OrdersBridgeProvider>
                        <DashboardBridgeProvider>
                          <SkillsBridgeProvider>
                            <ConversationalShellInner>{children}</ConversationalShellInner>
                            <PlanUpgradeModalHost />
                          </SkillsBridgeProvider>
                        </DashboardBridgeProvider>
                      </OrdersBridgeProvider>
                    </ClientsBridgeProvider>
                  </LeadsBridgeProvider>
                  </AffiliatesBridgeProvider>
                  </AutomationsBridgeProvider>
                  </FacebookBridgeProvider>
                  </InstagramBridgeProvider>
                </GalleryBridgeProvider>
              </CampaignsBridgeProvider>
            </ProductsBridgeProvider>
          </InboxBridgeProvider>
        </ProspectBridgeProvider>
      </WhatsAppConnectProvider>
    </EntitlementsProvider>
  )
}

/** @deprecated Use ConversationalShell — mantido como alias de migração */
export const AdminShell = ConversationalShell
