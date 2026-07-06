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
import { resolveTrigger } from './workspaceTriggers'
import { useWhatsAppConnectOptional } from '@/lib/whatsapp/WhatsAppConnectContext'
import type { AgentModalId, AgentTurn, ComponentEvent, SkillContext, TriggerSkillOptions } from './types'

export type CanvasMode = 'agent' | 'page' | 'embed'

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
}

const AgentShellContext = createContext<AgentShellValue | null>(null)

export function useAgentShell() {
  const ctx = useContext(AgentShellContext)
  if (!ctx) throw new Error('useAgentShell must be used within AgentShellProvider')
  return ctx
}

export function AgentShellProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const waConnect = useWhatsAppConnectOptional()
  const chat = useAdminAgentChat(location.pathname)
  const prospectBridge = useProspectBridgeOptional()
  const inboxBridge = useInboxBridgeOptional()
  const productsBridge = useProductsBridgeOptional()
  const campaignsBridge = useCampaignsBridgeOptional()
  const galleryBridge = useGalleryBridgeOptional()
  const isDesktop = useIsDesktop()

  const PRODUCT_SKILLS = useMemo(() => new Set(['catalog.products', 'catalog.products.table']), [])
  const isProductSkill = (skill?: string) => !!skill && PRODUCT_SKILLS.has(skill)
  const lastProspectKey = useRef('')
  const lastInboxConvoKey = useRef('')
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
    const agentHome = location.pathname === '/admin' || location.pathname === '/assistente'

    if (!agentHome) {
      setCanvasMode('page')
      setEmbeddedRoute(location.pathname)
      setDesktopCanvasOpen(true)
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setMobileCanvasOpen(true)
      }
      return
    }

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
  }, [activeTurn, location.pathname])

  const closeProspectModule = useCallback(() => {
    prospectBridge?.setModuleOpen(false)
    prospectBridge?.setModuleExpanded(false)
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
    lastProspectKey.current = ''
  }, [prospectBridge])

  const closeInboxModule = useCallback(() => {
    inboxBridge?.setModuleOpen(false)
    inboxBridge?.setModuleExpanded(false)
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
    lastInboxConvoKey.current = ''
  }, [inboxBridge])

  const closeProductsModule = useCallback(() => {
    productsBridge?.setModuleOpen(false)
    productsBridge?.setModuleExpanded(false)
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
  }, [productsBridge])

  const closeCampaignsModule = useCallback(() => {
    campaignsBridge?.setModuleOpen(false)
    campaignsBridge?.setModuleExpanded(false)
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
  }, [campaignsBridge])

  const closeGalleryModule = useCallback(() => {
    galleryBridge?.setModuleOpen(false)
    galleryBridge?.setModuleExpanded(false)
    setDesktopCanvasOpen(false)
    setEmbeddedRoute(null)
    setMobileCanvasOpen(false)
    setCanvasMode('agent')
  }, [galleryBridge])

  function openCatalogCanvas(route: string) {
    if (isDesktop) {
      setDesktopCanvasOpen(true)
      setCanvasMode('embed')
      setEmbeddedRoute(route)
      setMobileCanvasOpen(false)
    } else {
      setDesktopCanvasOpen(false)
      setEmbeddedRoute(null)
      setMobileCanvasOpen(false)
      setCanvasMode('agent')
    }
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
      setDesktopCanvasOpen(true)
      setCanvasMode('embed')
      setEmbeddedRoute('/busca')
      setMobileCanvasOpen(false)
    } else {
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
      setDesktopCanvasOpen(true)
      setCanvasMode('embed')
      setEmbeddedRoute('/mensagens')
      setMobileCanvasOpen(false)
    } else {
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
  }, [activeTurn, productsBridge, isDesktop, closeProductsModule, isProductSkill])

  /* Campanhas: desktop = canvas; mobile = inline */
  useEffect(() => {
    if (!activeTurn || activeTurn.skill !== 'campaigns.list') {
      if (campaignsBridge?.moduleOpen && activeTurn?.skill !== 'campaigns.list') {
        closeCampaignsModule()
      }
      return
    }
    campaignsBridge?.setModuleOpen(true)
    campaignsBridge?.setModuleExpanded(true)
    openCatalogCanvas('/campanhas')
  }, [activeTurn, campaignsBridge, isDesktop, closeCampaignsModule])

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

  const send = useCallback(async (
    text: string,
    opts?: { componentEvent?: ComponentEvent; skillContext?: SkillContext; directSkill?: string },
  ) => {
    await chat.send(text, opts)
  }, [chat])

  const triggerSkill = useCallback((
    skillId: string,
    opts?: TriggerSkillOptions,
  ) => {
    chat.triggerSkill(skillId, opts)
  }, [chat])

  const openCanvas = useCallback((route: string) => {
    setCanvasMode('embed')
    setEmbeddedRoute(route)
    setDesktopCanvasOpen(true)
    setMobileCanvasOpen(true)
  }, [])

  const triggerNav = useCallback((navKeyOrPath: string) => {
    const raw = String(navKeyOrPath || '').trim().replace(/\/$/, '')
    const key = raw.startsWith('/') ? raw.slice(1) : raw

    if (key === 'whatsapp' || raw === '/whatsapp') {
      waConnect?.openConnect()
      return
    }
    if (key === 'configuracoes' || raw === '/configuracoes') {
      openCanvas('/configuracoes')
      navigate('/configuracoes')
      return
    }
    if (key === 'produtos' || raw === '/produtos') {
      chat.triggerSkill('catalog.products', { label: 'Produtos', assistantMessage: 'Seu catálogo:' })
      return
    }
    if (key === 'galeria' || raw === '/galeria') {
      chat.triggerSkill('gallery.open', { label: 'Galeria', assistantMessage: 'Assets da marca:' })
      return
    }

    const trigger = resolveTrigger(navKeyOrPath)
    if (trigger) {
      chat.triggerSkill(trigger.skill, {
        label: trigger.userLabel,
        assistantMessage: trigger.assistantMessage,
        context: trigger.context,
      })
      return
    }
    navigate(navKeyOrPath.startsWith('/') ? navKeyOrPath : `/${navKeyOrPath}`)
  }, [chat, navigate, waConnect, openCanvas])

  const handleComponentEvent = useCallback((
    event: ComponentEvent,
    skillContext?: SkillContext,
  ) => {
    chat.handleComponentEvent(event, skillContext)
  }, [chat])

  const onNavigate = useCallback((path: string) => {
    navigate(path)
    setCanvasMode('page')
    setEmbeddedRoute(path)
    setDesktopCanvasOpen(true)
    setMobileCanvasOpen(true)
  }, [navigate])

  const onOpenModal = useCallback((modal: AgentModalId) => {
    openModalFn?.(modal)
  }, [openModalFn])

  const registerOpenModal = useCallback((fn: (modal: AgentModalId) => void) => {
    setOpenModalFn(() => fn)
  }, [])

  const value: AgentShellValue = {
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
    prospectModuleOpen: !!prospectBridge?.moduleOpen,
    closeInboxModule,
    inboxModuleOpen: !!inboxBridge?.moduleOpen,
    closeProductsModule,
    productsModuleOpen: !!productsBridge?.moduleOpen,
    closeCampaignsModule,
    campaignsModuleOpen: !!campaignsBridge?.moduleOpen,
    closeGalleryModule,
    galleryModuleOpen: !!galleryBridge?.moduleOpen,
  }

  return (
    <AgentShellContext.Provider value={value}>
      {children}
    </AgentShellContext.Provider>
  )
}