import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type InboxSnapshot = {
  conversationCount: number
  unreadTotal: number
  activeId: string | null
  contactName: string
  contactPhone: string
  aiMode: string
  lastPreview: string
  sending: boolean
  loadingConvos: boolean
  loadingMsgs: boolean
}

export type InboxCommand =
  | { type: 'select_conversation'; id: string }
  | { type: 'send_message'; text: string }
  | { type: 'toggle_ai_mode' }
  | { type: 'back_to_list' }
  | { type: 'refresh' }

export type InboxHandlers = {
  selectConversation: (id: string) => void
  sendMessage: (text: string) => void | Promise<void>
  toggleAiMode: () => void
  backToList: () => void
  refresh: () => void
}

const EMPTY_SNAPSHOT: InboxSnapshot = {
  conversationCount: 0,
  unreadTotal: 0,
  activeId: null,
  contactName: '',
  contactPhone: '',
  aiMode: 'manual',
  lastPreview: '',
  sending: false,
  loadingConvos: true,
  loadingMsgs: false,
}

type InboxBridgeValue = {
  snapshot: InboxSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (snap: Partial<InboxSnapshot>) => void
  registerHandlers: (handlers: InboxHandlers) => () => void
  dispatch: (cmd: InboxCommand) => void
  queueCommand: (cmd: InboxCommand) => void
}

const InboxBridgeContext = createContext<InboxBridgeValue | null>(null)

export function InboxBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<InboxSnapshot>(EMPTY_SNAPSHOT)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<InboxHandlers | null>(null)
  const queueRef = useRef<InboxCommand[]>([])

  const flushQueue = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    for (const cmd of pending) {
      runCommand(cmd, handlersRef.current)
    }
  }, [])

  const registerHandlers = useCallback((handlers: InboxHandlers) => {
    handlersRef.current = handlers
    setIsReady(true)
    flushQueue()
    return () => {
      handlersRef.current = null
      setIsReady(false)
    }
  }, [flushQueue])

  const publishSnapshot = useCallback((partial: Partial<InboxSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...partial }))
  }, [])

  const dispatch = useCallback((cmd: InboxCommand) => {
    if (!handlersRef.current) {
      queueRef.current.push(cmd)
      return
    }
    runCommand(cmd, handlersRef.current)
  }, [])

  const queueCommand = useCallback((cmd: InboxCommand) => {
    queueRef.current.push(cmd)
    flushQueue()
  }, [flushQueue])

  const value = useMemo<InboxBridgeValue>(() => ({
    snapshot,
    isReady,
    moduleOpen,
    moduleExpanded,
    setModuleOpen,
    setModuleExpanded,
    publishSnapshot,
    registerHandlers,
    dispatch,
    queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return (
    <InboxBridgeContext.Provider value={value}>
      {children}
    </InboxBridgeContext.Provider>
  )
}

function runCommand(cmd: InboxCommand, handlers: InboxHandlers) {
  switch (cmd.type) {
    case 'select_conversation':
      handlers.selectConversation(cmd.id)
      break
    case 'send_message':
      handlers.sendMessage(cmd.text)
      break
    case 'toggle_ai_mode':
      handlers.toggleAiMode()
      break
    case 'back_to_list':
      handlers.backToList()
      break
    case 'refresh':
      handlers.refresh()
      break
    default:
      break
  }
}

export function useInboxBridge() {
  const ctx = useContext(InboxBridgeContext)
  if (!ctx) throw new Error('useInboxBridge must be used within InboxBridgeProvider')
  return ctx
}

export function useInboxBridgeOptional() {
  return useContext(InboxBridgeContext)
}