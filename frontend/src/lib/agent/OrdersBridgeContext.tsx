import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type OrdersSnapshot = {
  total: number
  paidCount: number
  pendingCount: number
  revenueTotal: number
  search: string
  statusFilter: string
  selectedId: string | null
  selectedLabel: string
  loading: boolean
}

export type OrdersCommand =
  | { type: 'search'; query: string }
  | { type: 'filter_status'; status: string }
  | { type: 'select_order'; id: string; label?: string }
  | { type: 'open_full' }
  | { type: 'open_pdv' }
  | { type: 'refresh' }

export type OrdersHandlers = {
  search: (query: string) => void
  filterStatus: (status: string) => void
  selectOrder: (id: string, label?: string) => void
  openFull: () => void
  openPdv: () => void
  refresh: () => void
}

const EMPTY: OrdersSnapshot = {
  total: 0,
  paidCount: 0,
  pendingCount: 0,
  revenueTotal: 0,
  search: '',
  statusFilter: '',
  selectedId: null,
  selectedLabel: '',
  loading: true,
}

type Value = {
  snapshot: OrdersSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<OrdersSnapshot>) => void
  registerHandlers: (h: OrdersHandlers) => () => void
  dispatch: (cmd: OrdersCommand) => void
  queueCommand: (cmd: OrdersCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: OrdersCommand, h: OrdersHandlers) {
  switch (cmd.type) {
    case 'search': h.search(cmd.query); break
    case 'filter_status': h.filterStatus(cmd.status); break
    case 'select_order': h.selectOrder(cmd.id, cmd.label); break
    case 'open_full': h.openFull(); break
    case 'open_pdv': h.openPdv(); break
    case 'refresh': h.refresh(); break
  }
}

export function OrdersBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<OrdersSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<OrdersHandlers | null>(null)
  const queueRef = useRef<OrdersCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<OrdersSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof OrdersSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: OrdersHandlers) => {
    handlersRef.current = h
    flush()
    return () => { handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: OrdersCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: OrdersCommand) => {
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

export function useOrdersBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOrdersBridge requires OrdersBridgeProvider')
  return ctx
}

export function useOrdersBridgeOptional() {
  return useContext(Ctx)
}