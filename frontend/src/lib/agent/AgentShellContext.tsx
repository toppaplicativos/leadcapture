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
  const isDesktop = useIsDesktop()
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

  const triggerNav = useCallback((navKeyOrPath: string) => {
    const raw = String(navKeyOrPath || '').trim().replace(/\/$/, '')
    const key = raw.startsWith('/') ? raw.slice(1) : raw

    if (key === 'whatsapp' || raw === '/whatsapp') {
      waConnect?.openConnect()
      return
    }
    if (key === 'configuracoes' || raw === '/configuracoes') {
      navigate('/configuracoes')
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
  }, [chat, navigate, waConnect])

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

  const openCanvas = useCallback((route: string) => {
    setCanvasMode('embed')
    setEmbeddedRoute(route)
    setDesktopCanvasOpen(true)
    setMobileCanvasOpen(true)
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
  }

  return (
    <AgentShellContext.Provider value={value}>
      {children}
    </AgentShellContext.Provider>
  )
}