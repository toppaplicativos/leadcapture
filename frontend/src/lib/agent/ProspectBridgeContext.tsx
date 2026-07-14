import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ProspectSnapshot = {
  query: string
  location: string
  radius: string
  found: number
  newCount: number
  captured: number
  capturedLive: number
  todayCount: number
  totalCount: number
  inRange: number
  newInRange: number
  radarLoading: boolean
  prospecting: boolean
  autoCapture: boolean
  automate: boolean
  immersive: boolean
  searched: boolean
  batchCapturing: boolean
  loading: boolean
  error: string
}

export type ProspectCommand =
  | { type: 'search'; query: string; location: string; radius?: string; latitude?: number; longitude?: number }
  | { type: 'capture_batch' }
  | { type: 'toggle_auto_capture' }
  | { type: 'toggle_automate' }
  | { type: 'set_immersive'; value: boolean }
  | { type: 'open_ideas' }
  | { type: 'apply'; query?: string; location?: string; radius?: string; automate?: boolean; latitude?: number; longitude?: number }

export type ProspectHandlers = {
  search: (params: { query: string; location: string; radius?: string; latitude?: number; longitude?: number }) => void | Promise<void>
  captureBatch: () => void | Promise<void>
  toggleAutoCapture: () => void
  toggleAutomate: () => void
  setImmersive: (value: boolean) => void
  openIdeas: () => void
  apply: (params: { query?: string; location?: string; radius?: string; automate?: boolean; latitude?: number; longitude?: number }) => void
}

const EMPTY_SNAPSHOT: ProspectSnapshot = {
  query: '',
  location: '',
  radius: '3',
  found: 0,
  newCount: 0,
  captured: 0,
  capturedLive: 0,
  todayCount: 0,
  totalCount: 0,
  inRange: 0,
  newInRange: 0,
  radarLoading: false,
  prospecting: false,
  autoCapture: false,
  immersive: false,
  searched: false,
  batchCapturing: false,
  automate: false,
  loading: false,
  error: '',
}

type ProspectBridgeValue = {
  snapshot: ProspectSnapshot
  immersiveActive: boolean
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (snap: Partial<ProspectSnapshot>) => void
  registerHandlers: (handlers: ProspectHandlers) => () => void
  dispatch: (cmd: ProspectCommand) => void
  queueCommand: (cmd: ProspectCommand) => void
}

const ProspectBridgeContext = createContext<ProspectBridgeValue | null>(null)

export function ProspectBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProspectSnapshot>(EMPTY_SNAPSHOT)
  const [immersiveActive, setImmersiveActive] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<ProspectHandlers | null>(null)
  const queueRef = useRef<ProspectCommand[]>([])

  const flushQueue = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    for (const cmd of pending) {
      runCommand(cmd, handlersRef.current)
    }
  }, [])

  const registerHandlers = useCallback((handlers: ProspectHandlers) => {
    handlersRef.current = handlers
    setIsReady(true)
    flushQueue()
    return () => {
      handlersRef.current = null
      setIsReady(false)
    }
  }, [flushQueue])

  const publishSnapshot = useCallback((partial: Partial<ProspectSnapshot>) => {
    // Side-effect FORA do updater (setState puro) — evita loop/reload no iPad
    if (partial.immersive !== undefined) {
      setImmersiveActive(!!partial.immersive)
    }
    setSnapshot((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [k, v] of Object.entries(partial)) {
        if ((prev as any)[k] !== v) {
          ;(next as any)[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const dispatch = useCallback((cmd: ProspectCommand) => {
    if (!handlersRef.current) {
      queueRef.current.push(cmd)
      return
    }
    runCommand(cmd, handlersRef.current)
  }, [])

  const queueCommand = useCallback((cmd: ProspectCommand) => {
    queueRef.current.push(cmd)
    flushQueue()
  }, [flushQueue])

  const value = useMemo<ProspectBridgeValue>(() => ({
    snapshot,
    immersiveActive,
    isReady,
    moduleOpen,
    moduleExpanded,
    setModuleOpen,
    setModuleExpanded,
    publishSnapshot,
    registerHandlers,
    dispatch,
    queueCommand,
  }), [snapshot, immersiveActive, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return (
    <ProspectBridgeContext.Provider value={value}>
      {children}
    </ProspectBridgeContext.Provider>
  )
}

function runCommand(cmd: ProspectCommand, handlers: ProspectHandlers) {
  switch (cmd.type) {
    case 'search':
      handlers.search({
        query: cmd.query,
        location: cmd.location,
        radius: cmd.radius,
        latitude: cmd.latitude,
        longitude: cmd.longitude,
      })
      break
    case 'capture_batch':
      handlers.captureBatch()
      break
    case 'toggle_auto_capture':
      handlers.toggleAutoCapture()
      break
    case 'toggle_automate':
      handlers.toggleAutomate()
      break
    case 'set_immersive':
      handlers.setImmersive(cmd.value)
      break
    case 'open_ideas':
      handlers.openIdeas()
      break
    case 'apply':
      handlers.apply(cmd)
      break
    default:
      break
  }
}

export function useProspectBridge() {
  const ctx = useContext(ProspectBridgeContext)
  if (!ctx) throw new Error('useProspectBridge must be used within ProspectBridgeProvider')
  return ctx
}

export function useProspectBridgeOptional() {
  return useContext(ProspectBridgeContext)
}