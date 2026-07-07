import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type DashboardKpi = { label: string; value: number; icon?: string }

export type DashboardSnapshot = {
  leads: number
  campaigns: number
  orders: number
  products: number
  campaignsActive: number
  subtitle: string
  items: DashboardKpi[]
  loading: boolean
}

export type DashboardCommand =
  | { type: 'open_full' }
  | { type: 'refresh' }
  | { type: 'navigate'; key: string }

export type DashboardHandlers = {
  openFull: () => void
  refresh: () => void
  navigate: (key: string) => void
}

const EMPTY: DashboardSnapshot = {
  leads: 0,
  campaigns: 0,
  orders: 0,
  products: 0,
  campaignsActive: 0,
  subtitle: '',
  items: [],
  loading: true,
}

type Value = {
  snapshot: DashboardSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<DashboardSnapshot>) => void
  registerHandlers: (h: DashboardHandlers) => () => void
  dispatch: (cmd: DashboardCommand) => void
  queueCommand: (cmd: DashboardCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: DashboardCommand, h: DashboardHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
    case 'navigate': h.navigate(cmd.key); break
  }
}

export function DashboardBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<DashboardHandlers | null>(null)
  const queueRef = useRef<DashboardCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<DashboardSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof DashboardSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: DashboardHandlers) => {
    handlersRef.current = h
    flush()
    return () => { handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: DashboardCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: DashboardCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDashboardBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDashboardBridge must be used within DashboardBridgeProvider')
  return ctx
}

export function useDashboardBridgeOptional() {
  return useContext(Ctx)
}