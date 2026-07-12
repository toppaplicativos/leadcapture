import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminAgentChat } from './useAdminAgentChat'
import { turnNeedsCanvas } from './canvasRegistry'
import { useProspectBridgeOptional } from './ProspectBridgeContext'
import { useInboxBridgeOptional } from './InboxBridgeContext'
import { useProductsBridgeOptional } from './ProductsBridgeContext'
import { useCampaignsBridgeOptional } from './CampaignsBridgeContext'
import { useGalleryBridgeOptional } from './GalleryBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import {
  resolveActiveModuleId,
  resolveCanvasPathForSkill,
  resolveTrigger,
} from './workspaceTriggers'
import { moduleLabel } from './moduleRegistry'
import { isCampaignSkill, isLeadsSkill, isClientsSkill, isOrdersSkill, isDashboardSkill, isSkillsModuleSkill, isInstagramSkill, isFacebookSkill, isAutomationSkill, isAffiliateSkill } from './composerAiActions'
import { useInstagramBridgeOptional } from './InstagramBridgeContext'
import { useFacebookBridgeOptional } from './FacebookBridgeContext'
import { useAutomationsBridgeOptional } from './AutomationsBridgeContext'
import { useAffiliatesBridgeOptional } from './AffiliatesBridgeContext'
import { useLeadsBridgeOptional } from './LeadsBridgeContext'
import { useClientsBridgeOptional } from './ClientsBridgeContext'
import { useOrdersBridgeOptional } from './OrdersBridgeContext'
import { useDashboardBridgeOptional } from './DashboardBridgeContext'
import { useSkillsBridgeOptional } from './SkillsBridgeContext'
import { useWhatsAppConnectOptional } from '@/lib/whatsapp/WhatsAppConnectContext'
import { isAgentHomePath, isOperationalCanvasPath } from './operationalRoutes'
import type { AgentModalId, AgentTurn, ComponentEvent, SkillContext, TriggerSkillOptions } from './types'

export type CanvasMode = 'agent' | 'page' | 'embed'

/** Módulo operacional ativo no workspace (um por vez no modelo Linear). */
export type WorkspaceModuleId =
  | 'prospect'
  | 'inbox'
  | 'products'
  | 'campaigns'
  | 'gallery'
  | 'instagram'
  | 'facebook'
  | 'automations'
  | 'affiliates'
  | 'leads'
  | 'clients'
  | 'orders'
  | 'dashboard'
  | 'skills'
  | 'settings'
  | 'store'

/** Superfície espacial: chat-only | split com canvas (desktop) | overlay mobile. */
export type WorkspaceSurface = 'chat' | 'split' | 'overlay'

type AgentShellValue = {
  messages: ReturnType<typeof useAdminAgentChat>['messages']
  loading: boolean
  error: string | null
  send: ReturnType<typeof useAdminAgentChat>['send']
  triggerSkill: ReturnType<typeof useAdminAgentChat>['triggerSkill']
  triggerNav: (navKeyOrPath: string) => void
  handleComponentEvent: ReturnType<typeof useAdminAgentChat>['handleComponentEvent']
  activeTurn: AgentTurn | null
  canvasMode: CanvasMode
  embeddedRoute: string | null
  desktopCanvasOpen: boolean
  onNavigate: (path: string) => void
  onOpenModal: (modal: AgentModalId) => void
  registerOpenModal: (fn: (modal: AgentModalId) => void) => void
  mobileCanvasOpen: boolean
  setMobileCanvasOpen: (v: boolean) => void
  openCanvas: (route: string) => void
  closeProspectModule: () => void
  prospectModuleOpen: boolean
  closeInboxModule: () => void
  inboxModuleOpen: boolean
  closeProductsModule: () => void
  productsModuleOpen: boolean
  closeCampaignsModule: () => void
  campaignsModuleOpen: boolean
  closeGalleryModule: () => void
  galleryModuleOpen: boolean
  closeLeadsModule: () => void
  leadsModuleOpen: boolean
  closeClientsModule: () => void
  clientsModuleOpen: boolean
  closeOrdersModule: () => void
  ordersModuleOpen: boolean
  closeDashboardModule: () => void
  dashboardModuleOpen: boolean
  closeSkillsModule: () => void
  skillsModuleOpen: boolean
  closeInstagramModule: () => void
  instagramModuleOpen: boolean
  closeFacebookModule: () => void
  facebookModuleOpen: boolean
  closeAutomationsModule: () => void
  automationsModuleOpen: boolean
  closeAffiliatesModule: () => void
  affiliatesModuleOpen: boolean
  closeSettingsModule: () => void
  settingsModuleOpen: boolean
  settingsModuleExpanded: boolean
  setSettingsModuleExpanded: (v: boolean) => void
  closeStoreModule: () => void
  storeModuleOpen: boolean
  storeModuleExpanded: boolean
  setStoreModuleExpanded: (v: boolean) => void
  /** Módulo operacional ativo (null = só chat). */
  activeModuleId: WorkspaceModuleId | null
  activeModuleLabel: string | null
  /** chat | split (desktop canvas) | overlay (mobile canvas full). */
  workspaceSurface: WorkspaceSurface
  sessionId: string | null
  sessionTitle: string | null
  sessionHydrating: boolean
  startNewSession: () => Promise<void>
  sessions: ReturnType<typeof useAdminAgentChat>['sessions']
  sessionsLoading: boolean
  loadSessions: ReturnType<typeof useAdminAgentChat>['loadSessions']
  switchSession: ReturnType<typeof useAdminAgentChat>['switchSession']
  deleteSession: ReturnType<typeof useAdminAgentChat>['deleteSession']
  renameSession: ReturnType<typeof useAdminAgentChat>['renameSession']
  brandMemory: ReturnType<typeof useAdminAgentChat>['brandMemory']
  clearBrandMemory: ReturnType<typeof useAdminAgentChat>['clearBrandMemory']
  updateBrandMemory: ReturnType<typeof useAdminAgentChat>['updateBrandMemory']
  togglePinSession: ReturnType<typeof useAdminAgentChat>['togglePinSession']
  sessionSummary: string | null
  searchSessions: ReturnType<typeof useAdminAgentChat>['searchSessions']
  searchResults: ReturnType<typeof useAdminAgentChat>['searchResults']
  searchLoading: boolean
}

const AgentShellContext = createContext<AgentShellValue | null>(null)

export function useAgentShell() {
  const ctx = useContext(AgentShellContext)
  if (!ctx) throw new Error('useAgentShell must be used within AgentShellProvider')
  return ctx
}

export function useAgentShellOptional() {
  return useContext(AgentShellContext)
}

export function AgentShellProvider({
  children,
  brandId = '',
}: {
  children: ReactNode
  brandId?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const waConnect = useWhatsAppConnectOptional()
  const chat = useAdminAgentChat(location.pathname, brandId)
  const prospectBridge = useProspectBridgeOptional()
  const inboxBridge = useInboxBridgeOptional()
  const productsBridge = useProductsBridgeOptional()
  const campaignsBridge = useCampaignsBridgeOptional()
  const galleryBridge = useGalleryBridgeOptional()
  const leadsBridge = useLeadsBridgeOptional()
  const clientsBridge = useClientsBridgeOptional()
  const ordersBridge = useOrdersBridgeOptional()
  const dashboardBridge = useDashboardBridgeOptional()
  const skillsBridge = useSkillsBridgeOptional()
  const instagramBridge = useInstagramBridgeOptional()
  const facebookBridge = useFacebookBridgeOptional()
  const automationsBridge = useAutomationsBridgeOptional()
  const affiliatesBridge = useAffiliatesBridgeOptional()
  const isDesktop = useIsDesktop()
  /* Troca de marca: limpa snapshot IG stale (ex.: Alho Pronto CE sem token vs Alho Pronto com token). */
  const igResetRef = useRef(instagramBridge?.resetSnapshot)
  igResetRef.current = instagramBridge?.resetSnapshot
  const lastIgBrandRef = useRef<string>('')
  useEffect(() => {
    if (!brandId) return
    try {
      localStorage.setItem('lead-system:active-brand-id', String(brandId))
    } catch { /* ignore */ }
    if (lastIgBrandRef.current && lastIgBrandRef.current !== brandId) {
      igResetRef.current?.()
    }
    lastIgBrandRef.current = brandId
  }, [brandId])

  const PRODUCT_SKILLS = useMemo(() => new Set(['catalog.products', 'catalog.products.table', 'catalog.products.create']), [])
  const isProductSkill = (skill?: string) => !!skill && PRODUCT_SKILLS.has(skill)
  const lastProspectKey = useRef('')
  const lastInboxConvoKey = useRef('')
  const lastLeadsFilterKey = useRef('')
  const lastLeadsSelectKey = useRef('')
  const lastClientsFilterKey = useRef('')
  const lastOrdersFilterKey = useRef('')
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('agent')
  const [embeddedRoute, setEmbeddedRoute] = useState<string | null>(null)
  const [desktopCanvasOpen, setDesktopCanvasOpen] = useState(false)
  const [mobileCanvasOpen, setMobileCanvasOpen] = useState(false)
  const [openModalFn, setOpenModalFn] = useState<((m: AgentModalId) => void) | null>(null)

  const activeTurn = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.role === 'assistant' && !m.loading && m.turn) return m.turn
    }
    return null
  }, [chat.messages])

  useEffect(() => {
    // Rotas operacionais: canvas amarrado à URL. Não depende de activeTurn (hidratação do chat).
    if (isOperationalCanvasPath(location.pathname)) {
      setCanvasMode('embed')
      setEmbeddedRoute(location.pathname + (location.search || ''))
      setDesktopCanvasOpen(true)
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setMobileCanvasOpen(true)
      }
      return
    }

    if (!isAgentHomePath(location.pathname)) {
      // Rota desconhecida mas não-home: ainda tenta embed
      setCanvasMode('embed')
      setEmbeddedRoute(location.pathname + (location.search || ''))
      setDesktopCanvasOpen(true)
      return
    }

    // Home do assistente: canvas só se skill do chat pedir
    if (!activeTurn) {
      setDesktopCanvasOpen(false)
      setEmbeddedRoute(null)
      setCanvasMode('agent')
      return
    }

    const needsCanvas = turnNeedsCanvas(activeTurn)
    if (needsCanvas) {
      setDesktopCanvasOpen(true)
      if (activeTurn.canvasRoute) {
        setCanvasMode('embed')
        setEmbeddedRoute(activeTurn.canvasRoute)
      } else if (activeTurn.components?.length) {
        setCanvasMode('agent')
        setEmbeddedRoute(null)
      }
    } else {
      setDesktopCanvasOpen(false)
      setEmbeddedRoute(null)
      setCanvasMode('agent')
      setMobileCanvasOpen(false)
    }
  }, [activeTurn, location.pathname, location.search])

  /** Skills do chat não podem fechar/substituir canvas em rota operacional (ex. /atendente). */
  const releaseCanvasToAgent = useCallback(() => {
    if (isOperationalCanvasPath(location.pathname)) {
      // Reafirma embed da URL — não fecha (desktop + mobile)
      setCanvasMode('embed')
      setEmbeddedRoute(location.pathname + (location.search || ''))
      setDesktopCanvasOpen(true)
      setMobileCanvasOpen(true)
      return
    }
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
  }, [location.pathname, location.search])

  const stealCanvasForSkill = useCallback((route: string) => {
    // Em /atendente etc., skill do chat não rouba o painel
    if (isOperationalCanvasPath(location.pathname)) return
    setDesktopCanvasOpen(true)
    setCanvasMode('embed')
    setEmbeddedRoute(route)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileCanvasOpen(true)
    } else {
      setMobileCanvasOpen(false)
    }
  }, [location.pathname])

  const closeProspectModule = useCallback(() => {
    prospectBridge?.setModuleOpen(false)
    prospectBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
    lastProspectKey.current = ''
  }, [prospectBridge, releaseCanvasToAgent])

  const closeInboxModule = useCallback(() => {
    inboxBridge?.setModuleOpen(false)
    inboxBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
    lastInboxConvoKey.current = ''
  }, [inboxBridge, releaseCanvasToAgent])

  const closeProductsModule = useCallback(() => {
    productsBridge?.setModuleOpen(false)
    productsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [productsBridge, releaseCanvasToAgent])

  const closeCampaignsModule = useCallback(() => {
    campaignsBridge?.setModuleOpen(false)
    campaignsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [campaignsBridge, releaseCanvasToAgent])

  const closeGalleryModule = useCallback(() => {
    galleryBridge?.setModuleOpen(false)
    galleryBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [galleryBridge, releaseCanvasToAgent])

  const closeInstagramModule = useCallback(() => {
    instagramBridge?.setModuleOpen(false)
    instagramBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [instagramBridge, releaseCanvasToAgent])

  const closeFacebookModule = useCallback(() => {
    facebookBridge?.setModuleOpen(false)
    facebookBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [facebookBridge, releaseCanvasToAgent])

  const closeAutomationsModule = useCallback(() => {
    automationsBridge?.setModuleOpen(false)
    automationsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [automationsBridge, releaseCanvasToAgent])

  const closeAffiliatesModule = useCallback(() => {
    affiliatesBridge?.setModuleOpen(false)
    affiliatesBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [affiliatesBridge, releaseCanvasToAgent])

  const closeLeadsModule = useCallback(() => {
    leadsBridge?.setModuleOpen(false)
    leadsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [leadsBridge, releaseCanvasToAgent])

  const closeClientsModule = useCallback(() => {
    clientsBridge?.setModuleOpen(false)
    clientsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [clientsBridge, releaseCanvasToAgent])

  const closeOrdersModule = useCallback(() => {
    ordersBridge?.setModuleOpen(false)
    ordersBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [ordersBridge, releaseCanvasToAgent])

  const closeDashboardModule = useCallback(() => {
    dashboardBridge?.setModuleOpen(false)
    dashboardBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [dashboardBridge, releaseCanvasToAgent])

  const closeSkillsModule = useCallback(() => {
    skillsBridge?.setModuleOpen(false)
    skillsBridge?.setModuleExpanded(false)
    releaseCanvasToAgent()
  }, [skillsBridge, releaseCanvasToAgent])

  const [settingsModuleOpen, setSettingsModuleOpen] = useState(false)
  const [settingsModuleExpanded, setSettingsModuleExpanded] = useState(true)
  const [storeModuleOpen, setStoreModuleOpen] = useState(false)
  const [storeModuleExpanded, setStoreModuleExpanded] = useState(true)

  const closeSettingsModule = useCallback(() => {
    setSettingsModuleOpen(false)
    setSettingsModuleExpanded(false)
    releaseCanvasToAgent()
  }, [releaseCanvasToAgent])

  const closeStoreModule = useCallback(() => {
    setStoreModuleOpen(false)
    setStoreModuleExpanded(false)
    releaseCanvasToAgent()
  }, [releaseCanvasToAgent])

  function openCatalogCanvas(route: string) {
    // Não rouba o painel quando a URL é operacional (/atendente, /agente, …)
    stealCanvasForSkill(route)
  }

  /* Busca paleteiro: desktop = mapa no canvas; mobile = mapa inline no chat */
  useEffect(() => {
    if (!activeTurn || activeTurn.skill !== 'lead.prospect') {
      if (prospectBridge?.moduleOpen && activeTurn && activeTurn.skill !== 'lead.prospect') {
        closeProspectModule()
      }
      return
    }

    prospectBridge?.setModuleOpen(true)
    prospectBridge?.setModuleExpanded(true)

    if (isDesktop) {
      stealCanvasForSkill('/busca')
    } else if (!isOperationalCanvasPath(location.pathname)) {
      setDesktopCanvasOpen(false)
      setEmbeddedRoute(null)
      setMobileCanvasOpen(false)
      setCanvasMode('agent')
    }

    const stats = activeTurn.components?.find((c) => c.type === 'prospect_stats')
    const q = String(stats?.props?.query || '').trim()
    const loc = String(stats?.props?.location || '').trim()
    const rad = stats?.props?.radius

    const key = `${q}|${loc}`
    if (q && loc && prospectBridge && lastProspectKey.current !== key) {
      lastProspectKey.current = key
      prospectBridge.queueCommand({
        type: 'search',
        query: q,
        location: loc,
        radius: rad != null ? String(rad) : undefined,
      })
    }
  }, [activeTurn, prospectBridge, isDesktop, closeProspectModule])

  /* Inbox: desktop = canvas; mobile = painel inline no chat */
  useEffect(() => {
    if (!activeTurn || activeTurn.skill !== 'messages.inbox') {
      if (inboxBridge?.moduleOpen && activeTurn && activeTurn.skill !== 'messages.inbox') {
        closeInboxModule()
      }
      return
    }

    inboxBridge?.setModuleOpen(true)
    inboxBridge?.setModuleExpanded(true)

    if (isDesktop) {
      stealCanvasForSkill('/mensagens')
    } else if (!isOperationalCanvasPath(location.pathname)) {
      setDesktopCanvasOpen(false)
      setEmbeddedRoute(null)
      setMobileCanvasOpen(false)
      setCanvasMode('agent')
    }

    const stats = activeTurn.components?.find((c) => c.type === 'inbox_stats')
    const convId = String(stats?.props?.conversationId || '').trim()
    if (convId && inboxBridge && lastInboxConvoKey.current !== convId) {
      lastInboxConvoKey.current = convId
      inboxBridge.queueCommand({ type: 'select_conversation', id: convId })
    }
    if (stats?.props) {
      inboxBridge?.publishSnapshot({
        conversationCount: Number(stats.props.total ?? 0),
        unreadTotal: Number(stats.props.unread ?? 0),
        loadingConvos: false,
      })
    }
  }, [activeTurn, inboxBridge, isDesktop, closeInboxModule])

  /* Produtos: desktop = /produtos no canvas; mobile = painel inline */
  useEffect(() => {
    if (!activeTurn || !isProductSkill(activeTurn.skill)) {
      if (productsBridge?.moduleOpen && activeTurn && !isProductSkill(activeTurn.skill)) {
        closeProductsModule()
      }
      return
    }
    productsBridge?.setModuleOpen(true)
    productsBridge?.setModuleExpanded(true)
    openCatalogCanvas('/produtos')
    const stats = activeTurn.components?.find((c) => c.type === 'products_stats')
    const search = String(stats?.props?.search || '').trim()
    if (search) productsBridge?.queueCommand({ type: 'search', query: search })
    if (stats?.props) {
      productsBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        active: Number(stats.props.active || 0),
        loading: false,
      })
    }

  }, [activeTurn, productsBridge, isDesktop, closeProductsModule, isProductSkill])

  /* Campanhas: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || !isCampaignSkill(activeTurn.skill)) {
      if (campaignsBridge?.moduleOpen && activeTurn && !isCampaignSkill(activeTurn.skill)) {
        closeCampaignsModule()
      }
      return
    }
    campaignsBridge?.setModuleOpen(true)
    campaignsBridge?.setModuleExpanded(true)
    if (activeTurn.skill === 'campaigns.list' || activeTurn.skill === 'campaign.builder') {
      openCatalogCanvas('/campanhas')
    }
    const stats = activeTurn.components?.find((c) => c.type === 'campaigns_stats')
    if (stats?.props) {
      campaignsBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        active: Number(stats.props.active || 0),
        loading: false,
      })
    }
  }, [activeTurn, campaignsBridge, isDesktop, closeCampaignsModule])

  /* Leads CRM: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || !isLeadsSkill(activeTurn.skill)) {
      if (leadsBridge?.moduleOpen && activeTurn && !isLeadsSkill(activeTurn.skill)) {
        closeLeadsModule()
      }
      return
    }
    leadsBridge?.setModuleOpen(true)
    leadsBridge?.setModuleExpanded(true)
    openCatalogCanvas('/leads')
    const stats = activeTurn.components?.find((c) => c.type === 'leads_stats')
    const search = String(stats?.props?.search || '').trim()
    const status = String(stats?.props?.status || '').trim()
    const filterKey = `${search}|${status}`
    if (filterKey !== '|' && lastLeadsFilterKey.current !== filterKey) {
      lastLeadsFilterKey.current = filterKey
      if (search) leadsBridge?.queueCommand({ type: 'search', query: search })
      if (status) leadsBridge?.queueCommand({ type: 'filter_status', status })
    }
    if (stats?.props) {
      leadsBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        newCount: Number(stats.props.newCount ?? stats.props.new_count ?? 0),
        loading: false,
      })
    }

    const leadCard = activeTurn.components?.find((c) => c.type === 'lead_card')
    const leadFromCard = leadCard?.props?.lead as { id?: string; name?: string } | undefined
    const leadId = String(leadFromCard?.id || '').trim()
    if (activeTurn.skill === 'crm.lead.detail' && leadId && lastLeadsSelectKey.current !== leadId) {
      lastLeadsSelectKey.current = leadId
      leadsBridge?.queueCommand({
        type: 'select_lead',
        id: leadId,
        name: leadFromCard?.name,
      })
    }
  }, [activeTurn, leadsBridge, isDesktop, closeLeadsModule])

  /* Clientes CRM: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || !isClientsSkill(activeTurn.skill)) {
      if (clientsBridge?.moduleOpen && activeTurn && !isClientsSkill(activeTurn.skill)) {
        closeClientsModule()
      }
      return
    }
    clientsBridge?.setModuleOpen(true)
    clientsBridge?.setModuleExpanded(true)
    openCatalogCanvas('/clientes')
    const stats = activeTurn.components?.find((c) => c.type === 'clients_stats')
    const search = String(stats?.props?.search || '').trim()
    const status = String(stats?.props?.status || '').trim()
    const filterKey = `${search}|${status}`
    if (filterKey !== '|' && lastClientsFilterKey.current !== filterKey) {
      lastClientsFilterKey.current = filterKey
      if (search) clientsBridge?.queueCommand({ type: 'search', query: search })
      if (status) clientsBridge?.queueCommand({ type: 'filter_status', status })
    }
    if (stats?.props) {
      clientsBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        activeCount: Number(stats.props.activeCount ?? stats.props.active_count ?? 0),
        loading: false,
      })
    }
  }, [activeTurn, clientsBridge, isDesktop, closeClientsModule])

  /* Pedidos: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || !isOrdersSkill(activeTurn.skill)) {
      if (ordersBridge?.moduleOpen && activeTurn && !isOrdersSkill(activeTurn.skill)) {
        closeOrdersModule()
      }
      return
    }
    ordersBridge?.setModuleOpen(true)
    ordersBridge?.setModuleExpanded(true)
    openCatalogCanvas('/pedidos')
    const stats = activeTurn.components?.find((c) => c.type === 'orders_stats')
    const search = String(stats?.props?.search || '').trim()
    const status = String(stats?.props?.status || '').trim()
    const filterKey = `${search}|${status}`
    if (filterKey !== '|' && lastOrdersFilterKey.current !== filterKey) {
      lastOrdersFilterKey.current = filterKey
      if (search) ordersBridge?.queueCommand({ type: 'search', query: search })
      if (status) ordersBridge?.queueCommand({ type: 'filter_status', status })
    }
    if (stats?.props) {
      ordersBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        paidCount: Number(stats.props.paidCount ?? stats.props.paid_count ?? 0),
        pendingCount: Number(stats.props.pendingCount ?? stats.props.pending_count ?? 0),
        revenueTotal: Number(stats.props.revenueTotal ?? stats.props.revenue_total ?? 0),
        loading: false,
      })
    }
  }, [activeTurn, ordersBridge, isDesktop, closeOrdersModule])

  /* Dashboard: desktop = canvas; mobile = inline KPIs */
  useEffect(() => {
    if (!activeTurn || !isDashboardSkill(activeTurn.skill)) {
      if (dashboardBridge?.moduleOpen && activeTurn && !isDashboardSkill(activeTurn.skill)) {
        closeDashboardModule()
      }
      return
    }
    dashboardBridge?.setModuleOpen(true)
    dashboardBridge?.setModuleExpanded(true)
    if (activeTurn.skill === 'dashboard.show' || isDesktop) {
      openCatalogCanvas('/dashboard')
    }
    const kpi = activeTurn.components?.find((c) => c.type === 'kpi_row')
    const items = (kpi?.props?.items as Array<{ label: string; value: number; icon?: string }>) || []
    const byLabel = Object.fromEntries(items.map((i) => [String(i.label || '').toLowerCase(), Number(i.value || 0)]))
    const subtitle = String(kpi?.props?.subtitle || '')
    const campaignsActive = subtitle.match(/(\d+)\s+campanha/i)?.[1]
    dashboardBridge?.publishSnapshot({
      items,
      leads: byLabel.leads ?? 0,
      campaigns: byLabel.campanhas ?? 0,
      orders: byLabel.pedidos ?? 0,
      products: byLabel.produtos ?? 0,
      campaignsActive: campaignsActive ? Number(campaignsActive) : 0,
      subtitle,
      loading: false,
    })
  }, [activeTurn, dashboardBridge, isDesktop, closeDashboardModule])

  /* Habilidades: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || !isSkillsModuleSkill(activeTurn.skill)) {
      if (skillsBridge?.moduleOpen && activeTurn && !isSkillsModuleSkill(activeTurn.skill)) {
        closeSkillsModule()
      }
      return
    }
    skillsBridge?.setModuleOpen(true)
    skillsBridge?.setModuleExpanded(true)
    openCatalogCanvas('/habilidades')
    const skillList = activeTurn.components?.find((c) => c.type === 'skill_list')
    const skills = (skillList?.props?.skills as Array<{
      id: string; name: string; type: string; active: boolean; confidence: number
    }>) || []
    if (skills.length || skillList) {
      skillsBridge?.publishSnapshot({
        skills,
        total: Number(skillList?.props?.total ?? skills.length),
        activeCount: skills.filter((s) => s.active).length,
        loading: false,
      })
    }
  }, [activeTurn, skillsBridge, isDesktop, closeSkillsModule])

  /* Galeria: desktop = canvas; mobile = inline com upload */
  useEffect(() => {
    if (!activeTurn || activeTurn.skill !== 'gallery.open') {
      if (galleryBridge?.moduleOpen && activeTurn?.skill !== 'gallery.open') {
        closeGalleryModule()
      }
      return
    }
    galleryBridge?.setModuleOpen(true)
    galleryBridge?.setModuleExpanded(true)
    openCatalogCanvas('/galeria')
  }, [activeTurn, galleryBridge, isDesktop, closeGalleryModule])

  /* Instagram: studio no canvas; no chat só alerta compacto (nunca card expandido). */
  useEffect(() => {
    if (!activeTurn || !isInstagramSkill(activeTurn.skill)) {
      if (instagramBridge?.moduleOpen && activeTurn && !isInstagramSkill(activeTurn.skill)) {
        closeInstagramModule()
      }
      return
    }
    instagramBridge?.setModuleOpen(true)
    // Colapsado de propósito — UI pesada só no painel
    instagramBridge?.setModuleExpanded(false)
    openCatalogCanvas('/instagram')
    const stats = activeTurn.components?.find((c) => c.type === 'instagram_stats')
    if (stats?.props) {
      const username = String(stats.props.username || '')
      const connected = !!stats.props.connected || !!username
      if (connected) {
        instagramBridge?.publishSnapshot({
          connected: true,
          username,
          name: String(stats.props.name || ''),
          followers: Number(stats.props.followers || 0),
          following: Number(stats.props.following || 0),
          mediaCount: Number(stats.props.mediaCount || 0),
          avatarUrl: String(stats.props.avatarUrl || ''),
          loading: false,
        })
      } else {
        instagramBridge?.publishSnapshot({ loading: false, connected: false })
      }
    } else {
      instagramBridge?.queueCommand({ type: 'refresh' })
    }
  }, [activeTurn, instagramBridge, isDesktop, closeInstagramModule])

  /* Facebook: chat = resumo; desktop = studio no canvas */
  useEffect(() => {
    if (!activeTurn || !isFacebookSkill(activeTurn.skill)) {
      if (facebookBridge?.moduleOpen && activeTurn && !isFacebookSkill(activeTurn.skill)) {
        closeFacebookModule()
      }
      return
    }
    facebookBridge?.setModuleOpen(true)
    facebookBridge?.setModuleExpanded(true)
    openCatalogCanvas('/facebook')
    const stats = activeTurn.components?.find((c) => c.type === 'facebook_stats')
    if (stats?.props) {
      facebookBridge?.publishSnapshot({
        connected: !!stats.props.connected,
        pageName: String(stats.props.pageName || stats.props.name || ''),
        category: String(stats.props.category || ''),
        fans: Number(stats.props.fans || stats.props.fanCount || 0),
        followers: Number(stats.props.followers || stats.props.followersCount || 0),
        postsCount: Number(stats.props.postsCount || 0),
        avatarUrl: String(stats.props.avatarUrl || stats.props.pictureUrl || ''),
        loading: false,
      })
    }
  }, [activeTurn, facebookBridge, isDesktop, closeFacebookModule])

  /* Automações: chat = resumo; desktop = flow builder no canvas */
  useEffect(() => {
    if (!activeTurn || !isAutomationSkill(activeTurn.skill)) {
      if (automationsBridge?.moduleOpen && activeTurn && !isAutomationSkill(activeTurn.skill)) {
        closeAutomationsModule()
      }
      return
    }
    automationsBridge?.setModuleOpen(true)
    automationsBridge?.setModuleExpanded(true)
    // Hub de gestão = /automacoes; editor visual de grafos = /fluxos
    const automationRoute =
      activeTurn.skill === 'flow.builder'
        ? '/fluxos'
        : (activeTurn.canvasRoute === '/automacoes' || !activeTurn.canvasRoute)
          ? '/automacoes'
          : activeTurn.canvasRoute || '/automacoes'
    openCatalogCanvas(automationRoute === '/fluxos' && activeTurn.skill !== 'flow.builder' ? '/automacoes' : automationRoute)
    const stats = activeTurn.components?.find((c) => c.type === 'automation_stats')
    if (stats?.props) {
      automationsBridge?.publishSnapshot({
        total: Number(stats.props.total || 0),
        reactive: Number(stats.props.reactive || 0),
        proactive: Number(stats.props.proactive || 0),
        flows: Array.isArray(stats.props.flows)
          ? (stats.props.flows as Array<{ id: string; name: string; status: string; trigger?: string }>)
          : [],
        loading: false,
      })
    }
  }, [activeTurn, automationsBridge, isDesktop, closeAutomationsModule])

  /* Afiliados: chat = resumo; desktop = gestão no canvas */
  useEffect(() => {
    if (!activeTurn || !isAffiliateSkill(activeTurn.skill)) {
      if (affiliatesBridge?.moduleOpen && activeTurn && !isAffiliateSkill(activeTurn.skill)) {
        closeAffiliatesModule()
      }
      return
    }
    affiliatesBridge?.setModuleOpen(true)
    affiliatesBridge?.setModuleExpanded(true)
    if (isDesktop) {
      openCatalogCanvas('/afiliados')
    }
    const stats = activeTurn.components?.find((c) => c.type === 'affiliate_stats')
    if (stats?.props) {
      affiliatesBridge?.publishSnapshot({
        enabled: !!stats.props.enabled,
        commissionPct: Number(stats.props.commissionPct || 10),
        affiliatesTotal: Number(stats.props.affiliatesTotal || 0),
        affiliatesPending: Number(stats.props.affiliatesPending || 0),
        affiliatesActive: Number(stats.props.affiliatesActive || 0),
        totalClicks: Number(stats.props.totalClicks || 0),
        totalSales: Number(stats.props.totalSales || 0),
        commissionPending: Number(stats.props.commissionPending || 0),
        commissionApproved: Number(stats.props.commissionApproved || 0),
        payoutsRequested: Number(stats.props.payoutsRequested || 0),
        commissionsPendingCount: Number(stats.props.commissionsPendingCount || 0),
        materialsCount: Number(stats.props.materialsCount || 0),
        topAffiliates: Array.isArray(stats.props.topAffiliates)
          ? stats.props.topAffiliates as Array<{
            id: string; name: string; code: string; status: string
            clicks: number; sales: number; commission: number
          }>
          : [],
        loading: false,
      })
    }
    if (!isDesktop) {
      const skill = activeTurn.skill
      if (skill === 'affiliate.payouts' || skill === 'affiliate.payout.confirm') {
        affiliatesBridge?.queueCommand({ type: 'open_tab', tab: 'payouts' })
      } else if (skill === 'affiliate.config' || skill === 'affiliate.config.confirm') {
        affiliatesBridge?.queueCommand({ type: 'open_settings' })
      } else if (skill === 'affiliate.materials') {
        affiliatesBridge?.queueCommand({ type: 'open_tab', tab: 'materials' })
      } else if (skill === 'affiliate.approve') {
        affiliatesBridge?.queueCommand({ type: 'open_tab', tab: 'commissions' })
      }
    }
  }, [activeTurn, affiliatesBridge, isDesktop, closeAffiliatesModule])

  const send = useCallback(async (
    text: string,
    opts?: { componentEvent?: ComponentEvent; skillContext?: SkillContext; directSkill?: string },
  ) => {
    await chat.send(text, opts)
  }, [chat])

  const openCanvas = useCallback((route: string) => {
    const normalized = route.startsWith('/') ? route : `/${route}`
    setCanvasMode('embed')
    setEmbeddedRoute(normalized)
    setDesktopCanvasOpen(true)
    setMobileCanvasOpen(true)
  }, [])

  /** Abre área operacional no painel (canvas), sem cartão no chat e sem travar o composer. */
  const openOperationalArea = useCallback((path: string, openModule?: () => void) => {
    const route = (path.startsWith('/') ? path : `/${path}`) || '/'
    // Embute a página no painel (CanvasPageEmbed) e sincroniza a URL
    openCanvas(route)
    navigate(route, { replace: false })
    openModule?.()
  }, [openCanvas, navigate])

  const triggerSkill = useCallback((
    skillId: string,
    opts?: TriggerSkillOptions,
  ) => {
    if (skillId === 'whatsapp.connect') {
      waConnect?.openConnect()
      return
    }
    const canvasPath = resolveCanvasPathForSkill(skillId)
      || opts?.context?.canvasPath as string | undefined

    // Navegação operacional: canvas/módulo sem mensagem no chat
    if (skillId === 'settings.open') {
      openOperationalArea(canvasPath || '/configuracoes', () => {
        setSettingsModuleOpen(true)
        setSettingsModuleExpanded(true)
        setStoreModuleOpen(false)
      })
      return
    }
    if (skillId === 'design.edit') {
      openOperationalArea(canvasPath || '/loja', () => {
        setStoreModuleOpen(true)
        setStoreModuleExpanded(true)
        setSettingsModuleOpen(false)
      })
      return
    }
    if (skillId === 'catalog.products' || skillId === 'catalog.products.table') {
      openOperationalArea('/produtos', () => {
        productsBridge?.setModuleOpen?.(true)
        productsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'catalog.orders') {
      openOperationalArea('/pedidos', () => {
        ordersBridge?.setModuleOpen?.(true)
        ordersBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'crm.leads.table' || skillId === 'crm.leads.list') {
      openOperationalArea('/leads', () => {
        leadsBridge?.setModuleOpen?.(true)
        leadsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'crm.clients.table' || skillId === 'crm.clients.list') {
      openOperationalArea('/clientes', () => {
        clientsBridge?.setModuleOpen?.(true)
        clientsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'gallery.open') {
      openOperationalArea('/galeria', () => {
        galleryBridge?.setModuleOpen?.(true)
        galleryBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'instagram.open') {
      openOperationalArea('/instagram', () => {
        instagramBridge?.setModuleOpen?.(true)
        instagramBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'facebook.open') {
      openOperationalArea('/facebook', () => {
        facebookBridge?.setModuleOpen?.(true)
        facebookBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'automation.open') {
      openOperationalArea('/automacoes', () => {
        automationsBridge?.setModuleOpen?.(true)
        automationsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (skillId === 'affiliate.open') {
      openOperationalArea('/afiliados', () => {
        affiliatesBridge?.setModuleOpen?.(true)
        affiliatesBridge?.setModuleExpanded?.(true)
      })
      return
    }

    if (canvasPath && (
      skillId.startsWith('nav.')
      || skillId === 'workspace.overview'
      || skillId === 'agent.configure'
      || skillId === 'dashboard.overview'
      || skillId === 'dashboard.show'
      || skillId === 'flow.builder'
      || skillId === 'creative.generate'
      || skillId === 'campaigns.list'
      || skillId === 'campaign.builder'
    )) {
      openOperationalArea(canvasPath)
      return
    }
    chat.triggerSkill(skillId, opts)
  }, [
    chat, waConnect, openCanvas, navigate, openOperationalArea,
    productsBridge, ordersBridge, leadsBridge, clientsBridge,
    galleryBridge, instagramBridge, facebookBridge, automationsBridge, affiliatesBridge,
  ])

  const triggerNav = useCallback((navKeyOrPath: string) => {
    const raw = String(navKeyOrPath || '').trim().replace(/\/$/, '')
    const key = raw.startsWith('/') ? raw.slice(1) : raw

    if (key === 'whatsapp' || raw === '/whatsapp' || raw.includes('tab=whatsapp')) {
      openOperationalArea('/whatsapp')
      return
    }
    if (key === 'configuracoes' || raw === '/configuracoes' || raw.startsWith('/configuracoes')) {
      const path = raw.startsWith('/') ? raw : '/configuracoes'
      openOperationalArea(path, () => {
        setSettingsModuleOpen(true)
        setSettingsModuleExpanded(true)
      })
      return
    }
    if (key === 'loja' || raw === '/loja' || raw === '/design' || key === 'design') {
      openOperationalArea('/loja', () => {
        setStoreModuleOpen(true)
        setStoreModuleExpanded(true)
      })
      return
    }
    if (key === 'produtos' || raw === '/produtos') {
      openOperationalArea('/produtos', () => {
        productsBridge?.setModuleOpen?.(true)
        productsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'galeria' || raw === '/galeria') {
      openOperationalArea('/galeria', () => {
        galleryBridge?.setModuleOpen?.(true)
        galleryBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'instagram' || raw === '/instagram') {
      openOperationalArea('/instagram', () => {
        instagramBridge?.setModuleOpen?.(true)
        instagramBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'facebook' || raw === '/facebook') {
      openOperationalArea('/facebook', () => {
        facebookBridge?.setModuleOpen?.(true)
        facebookBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'automacoes' || raw === '/automacoes') {
      openOperationalArea('/automacoes', () => {
        automationsBridge?.setModuleOpen?.(true)
        automationsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'afiliados' || raw === '/afiliados') {
      openOperationalArea('/afiliados', () => {
        affiliatesBridge?.setModuleOpen?.(true)
        affiliatesBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'fluxos' || raw === '/fluxos') {
      openOperationalArea('/fluxos')
      return
    }
    if (key === 'leads' || raw === '/leads') {
      openOperationalArea('/leads', () => {
        leadsBridge?.setModuleOpen?.(true)
        leadsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'clientes' || raw === '/clientes') {
      openOperationalArea('/clientes', () => {
        clientsBridge?.setModuleOpen?.(true)
        clientsBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'pedidos' || raw === '/pedidos') {
      openOperationalArea('/pedidos', () => {
        ordersBridge?.setModuleOpen?.(true)
        ordersBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'mensagens' || raw === '/mensagens') {
      openOperationalArea('/mensagens', () => {
        inboxBridge?.setModuleOpen?.(true)
        inboxBridge?.setModuleExpanded?.(true)
      })
      return
    }
    if (key === 'campanhas' || raw === '/campanhas' || key === 'campanha') {
      openOperationalArea('/campanhas', () => {
        campaignsBridge?.setModuleOpen?.(true)
        campaignsBridge?.setModuleExpanded?.(true)
      })
      return
    }

    // Rotas com página embutida no canvas (mapa em canvasPages) — acesso direto
    const DIRECT_CANVAS_KEYS: Record<string, string> = {
      atendente: '/atendente',
      agente: '/agente',
      dashboard: '/dashboard',
      painel: '/dashboard',
      busca: '/busca',
      habilidades: '/habilidades',
      skills: '/habilidades',
      criativos: '/criativos',
      'video-studio': '/video-studio',
      notificacoes: '/notificacoes',
      cupons: '/cupons',
      frete: '/frete',
      estoque: '/estoque',
      avaliacoes: '/avaliacoes',
      pagamentos: '/pagamentos',
      dominio: '/dominio',
      emails: '/emails',
      'provedores-ia': '/provedores-ia',
      'tirar-pedido': '/tirar-pedido',
    }
    if (DIRECT_CANVAS_KEYS[key] || DIRECT_CANVAS_KEYS[raw.replace(/^\//, '')]) {
      openOperationalArea(DIRECT_CANVAS_KEYS[key] || DIRECT_CANVAS_KEYS[raw.replace(/^\//, '')] || raw)
      return
    }
    if (raw.startsWith('/') && (
      raw === '/atendente' || raw === '/agente' || raw === '/dashboard'
      || raw === '/busca' || raw === '/habilidades' || raw === '/criativos'
      || raw === '/notificacoes' || raw === '/cupons' || raw === '/frete'
      || raw === '/estoque' || raw === '/avaliacoes' || raw === '/pagamentos'
      || raw === '/dominio' || raw === '/emails' || raw === '/provedores-ia'
      || raw === '/tirar-pedido' || raw === '/video-studio'
    )) {
      openOperationalArea(raw)
      return
    }

    const trigger = resolveTrigger(navKeyOrPath)
    if (trigger?.canvasPath) {
      openOperationalArea(trigger.canvasPath)
      return
    }
    if (trigger) {
      // Skills de formulário/ação ainda usam o chat; navegação pura já saiu acima
      triggerSkill(trigger.skill, {
        label: trigger.userLabel,
        assistantMessage: trigger.assistantMessage,
        context: trigger.context,
      })
      return
    }
    openOperationalArea(navKeyOrPath.startsWith('/') ? navKeyOrPath : `/${navKeyOrPath}`)
  }, [
    navigate, openOperationalArea, triggerSkill,
    productsBridge, ordersBridge, leadsBridge, clientsBridge,
    galleryBridge, instagramBridge, facebookBridge, automationsBridge,
    affiliatesBridge, inboxBridge, campaignsBridge,
  ])

  const handleComponentEvent = useCallback((
    event: ComponentEvent,
    skillContext?: SkillContext,
  ) => {
    chat.handleComponentEvent(event, skillContext)
  }, [chat])

  const onNavigate = useCallback((path: string) => {
    const normalized = path.startsWith('/') ? path : `/${path}`
    navigate(normalized)
    setCanvasMode('embed')
    setEmbeddedRoute(normalized)
    setDesktopCanvasOpen(true)
    setMobileCanvasOpen(true)
  }, [navigate])

  const onOpenModal = useCallback((modal: AgentModalId) => {
    openModalFn?.(modal)
  }, [openModalFn])

  const registerOpenModal = useCallback((fn: (modal: AgentModalId) => void) => {
    setOpenModalFn(() => fn)
  }, [])

  const moduleFlags = useMemo(() => ({
    prospect: !!prospectBridge?.moduleOpen,
    inbox: !!inboxBridge?.moduleOpen,
    products: !!productsBridge?.moduleOpen,
    campaigns: !!campaignsBridge?.moduleOpen,
    gallery: !!galleryBridge?.moduleOpen,
    instagram: !!instagramBridge?.moduleOpen,
    facebook: !!facebookBridge?.moduleOpen,
    automations: !!automationsBridge?.moduleOpen,
    affiliates: !!affiliatesBridge?.moduleOpen,
    leads: !!leadsBridge?.moduleOpen,
    clients: !!clientsBridge?.moduleOpen,
    orders: !!ordersBridge?.moduleOpen,
    dashboard: !!dashboardBridge?.moduleOpen,
    skills: !!skillsBridge?.moduleOpen,
    settings: settingsModuleOpen,
    store: storeModuleOpen,
  }), [
    prospectBridge?.moduleOpen,
    inboxBridge?.moduleOpen,
    productsBridge?.moduleOpen,
    campaignsBridge?.moduleOpen,
    galleryBridge?.moduleOpen,
    instagramBridge?.moduleOpen,
    facebookBridge?.moduleOpen,
    automationsBridge?.moduleOpen,
    affiliatesBridge?.moduleOpen,
    leadsBridge?.moduleOpen,
    clientsBridge?.moduleOpen,
    ordersBridge?.moduleOpen,
    dashboardBridge?.moduleOpen,
    skillsBridge?.moduleOpen,
    settingsModuleOpen,
    storeModuleOpen,
  ])

  /** Prioridade: módulo da skill mais “operacional” no dia a dia primeiro. */
  const activeModuleId = useMemo((): WorkspaceModuleId | null => {
    return resolveActiveModuleId(moduleFlags) as WorkspaceModuleId | null
  }, [moduleFlags])

  const activeModuleLabel = moduleLabel(activeModuleId)

  const anyModuleOpen = activeModuleId != null

  const workspaceSurface = useMemo((): WorkspaceSurface => {
    if (mobileCanvasOpen && desktopCanvasOpen && !anyModuleOpen) return 'overlay'
    if (desktopCanvasOpen || anyModuleOpen) return 'split'
    return 'chat'
  }, [mobileCanvasOpen, desktopCanvasOpen, anyModuleOpen])

  const value = useMemo((): AgentShellValue => ({
    messages: chat.messages,
    loading: chat.loading,
    error: chat.error,
    send,
    triggerSkill,
    triggerNav,
    handleComponentEvent,
    activeTurn,
    canvasMode,
    embeddedRoute,
    desktopCanvasOpen,
    onNavigate,
    onOpenModal,
    registerOpenModal,
    mobileCanvasOpen,
    setMobileCanvasOpen,
    openCanvas,
    closeProspectModule,
    prospectModuleOpen: moduleFlags.prospect,
    closeInboxModule,
    inboxModuleOpen: moduleFlags.inbox,
    closeProductsModule,
    productsModuleOpen: moduleFlags.products,
    closeCampaignsModule,
    campaignsModuleOpen: moduleFlags.campaigns,
    closeGalleryModule,
    galleryModuleOpen: moduleFlags.gallery,
    closeInstagramModule,
    instagramModuleOpen: moduleFlags.instagram,
    closeFacebookModule,
    facebookModuleOpen: moduleFlags.facebook,
    closeAutomationsModule,
    automationsModuleOpen: moduleFlags.automations,
    closeAffiliatesModule,
    affiliatesModuleOpen: moduleFlags.affiliates,
    closeLeadsModule,
    leadsModuleOpen: moduleFlags.leads,
    closeClientsModule,
    clientsModuleOpen: moduleFlags.clients,
    closeOrdersModule,
    ordersModuleOpen: moduleFlags.orders,
    closeDashboardModule,
    dashboardModuleOpen: moduleFlags.dashboard,
    closeSkillsModule,
    skillsModuleOpen: moduleFlags.skills,
    closeSettingsModule,
    settingsModuleOpen: moduleFlags.settings,
    settingsModuleExpanded,
    setSettingsModuleExpanded,
    closeStoreModule,
    storeModuleOpen: moduleFlags.store,
    storeModuleExpanded,
    setStoreModuleExpanded,
    activeModuleId,
    activeModuleLabel,
    workspaceSurface,
    sessionId: chat.sessionId,
    sessionTitle: chat.sessionTitle,
    sessionHydrating: chat.sessionHydrating,
    startNewSession: chat.startNewSession,
    sessions: chat.sessions,
    sessionsLoading: chat.sessionsLoading,
    loadSessions: chat.loadSessions,
    switchSession: chat.switchSession,
    deleteSession: chat.deleteSession,
    renameSession: chat.renameSession,
    brandMemory: chat.brandMemory,
    clearBrandMemory: chat.clearBrandMemory,
    updateBrandMemory: chat.updateBrandMemory,
    togglePinSession: chat.togglePinSession,
    sessionSummary: chat.sessionSummary,
    searchSessions: chat.searchSessions,
    searchResults: chat.searchResults,
    searchLoading: chat.searchLoading,
  }), [
    chat.messages,
    chat.loading,
    chat.error,
    chat.sessionId,
    chat.sessionTitle,
    chat.sessionHydrating,
    chat.startNewSession,
    chat.sessions,
    chat.sessionsLoading,
    chat.loadSessions,
    chat.switchSession,
    chat.deleteSession,
    chat.renameSession,
    chat.brandMemory,
    chat.clearBrandMemory,
    chat.updateBrandMemory,
    chat.togglePinSession,
    chat.sessionSummary,
    chat.searchSessions,
    chat.searchResults,
    chat.searchLoading,
    send,
    triggerSkill,
    triggerNav,
    handleComponentEvent,
    activeTurn,
    canvasMode,
    embeddedRoute,
    desktopCanvasOpen,
    onNavigate,
    onOpenModal,
    registerOpenModal,
    mobileCanvasOpen,
    openCanvas,
    closeProspectModule,
    closeInboxModule,
    closeProductsModule,
    closeCampaignsModule,
    closeGalleryModule,
    closeInstagramModule,
    closeFacebookModule,
    closeAutomationsModule,
    closeAffiliatesModule,
    closeLeadsModule,
    closeClientsModule,
    closeOrdersModule,
    closeDashboardModule,
    closeSkillsModule,
    closeSettingsModule,
    settingsModuleExpanded,
    closeStoreModule,
    storeModuleExpanded,
    moduleFlags,
    activeModuleId,
    activeModuleLabel,
    workspaceSurface,
  ])

  return (
    <AgentShellContext.Provider value={value}>
      {children}
    </AgentShellContext.Provider>
  )
}