import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, ChevronDown, X } from 'lucide-react'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import { AgentShellProvider, useAgentShell } from '@/lib/agent/AgentShellContext'
import { ProspectBridgeProvider } from '@/lib/agent/ProspectBridgeContext'
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
    prospectModuleOpen, inboxModuleOpen, productsModuleOpen,
    campaignsModuleOpen, galleryModuleOpen, instagramModuleOpen, facebookModuleOpen, automationsModuleOpen, affiliatesModuleOpen, leadsModuleOpen, clientsModuleOpen, ordersModuleOpen,
    dashboardModuleOpen, skillsModuleOpen,
  } = useAgentShell()
  const isDesktop = useIsDesktop()
  const { brand, brands, activeBrandId, showBrandPicker, setShowBrandPicker, switchBrand, logout, refreshKey } = brandState

  return (
    <div className="agent-shell flex flex-col bg-bg">
      <div className="agent-shell__chrome shrink-0">
        <WhatsAppHealthBanner embedded />
        <header className="agent-shell__header">
        <div className="agent-shell__brand">
          <button
            type="button"
            onClick={() => brands.length > 1 && setShowBrandPicker(!showBrandPicker)}
            className="agent-shell__brand-btn"
          >
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="agent-shell__logo" />
            ) : (
              <span className="agent-shell__logo agent-shell__logo--fallback">
                {(brand.name || 'L').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="agent-shell__brand-name">{brand.name || 'LeadCapture'}</span>
            {brands.length > 1 && (
              <ChevronDown size={14} className={`text-gray-400 transition ${showBrandPicker ? 'rotate-180' : ''}`} />
            )}
          </button>

          {showBrandPicker && brands.length > 1 && (
            <div className="agent-shell__brand-menu">
              {brands.map((b: any) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => switchBrand(b.id)}
                  className={`agent-shell__brand-item ${String(b.id) === String(activeBrandId) ? 'is-active' : ''}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="agent-shell__header-actions">
          <ChannelHeaderIcons brandKey={activeBrandId || refreshKey} />
          <button type="button" onClick={logout} className="agent-shell__logout" aria-label="Sair">
            <LogOut size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
        </header>
      </div>

      <div className={`agent-shell__body flex-1 min-h-0 flex ${desktopCanvasOpen ? 'has-canvas' : 'chat-only'}`}>
        <aside className="agent-shell__rail shrink-0">
          <WorkspaceChat brandName={brand.name} brandLogoUrl={brand.logo_url} />
        </aside>

        <main
          className={`agent-shell__canvas flex-1 min-w-0 min-h-0 ${
            mobileCanvasOpen && desktopCanvasOpen
              && !prospectModuleOpen && !inboxModuleOpen
              && !productsModuleOpen && !campaignsModuleOpen && !galleryModuleOpen && !instagramModuleOpen && !facebookModuleOpen && !automationsModuleOpen && !affiliatesModuleOpen && !leadsModuleOpen && !clientsModuleOpen && !ordersModuleOpen
              && !dashboardModuleOpen && !skillsModuleOpen
              ? 'is-open' : ''
          }`}
        >
          {!isDesktop && (
            <button
              type="button"
              className="agent-shell__canvas-close"
              onClick={() => setMobileCanvasOpen(false)}
              aria-label="Voltar ao chat"
            >
              <X size={18} />
            </button>
          )}
          <div key={activeBrandId} className="h-full min-h-0">
            <AgentCanvas>{children}</AgentCanvas>
          </div>
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
      setRefreshKey((k) => k + 1)
    } catch { /* ignore */ }
  }

  function logout() {
    clearAdminAuth()
    navigate('/login', { replace: true })
  }

  if (!authReady) {
    return (
      <div className="h-screen bg-bg">
        <PageSplash variant="route" />
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
  )
}

/** @deprecated Use ConversationalShell — mantido como alias de migração */
export const AdminShell = ConversationalShell