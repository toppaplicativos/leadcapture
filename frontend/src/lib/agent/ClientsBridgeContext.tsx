import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type ClientsSnapshot = {
  total: number
  activeCount: number
  search: string
  statusFilter: string
  selectedId: string | null
  selectedName: string
  loading: boolean
}

export type ClientsCommand =
  | { type: 'search'; query: string }
  | { type: 'filter_status'; status: string }
  | { type: 'select_client'; id: string; name?: string }
  | { type: 'open_full' }
  | { type: 'open_import' }
  | { type: 'refresh' }

export type ClientsHandlers = {
  search: (query: string) => void
  filterStatus: (status: string) => void
  selectClient: (id: string, name?: string) => void
  openFull: () => void
  openImport: () => void
  refresh: () => void
}

const EMPTY: ClientsSnapshot = {
  total: 0,
  activeCount: 0,
  search: '',
  statusFilter: '',
  selectedId: null,
  selectedName: '',
  loading: true,
}

type Value = {
  snapshot: ClientsSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<ClientsSnapshot>) => void
  registerHandlers: (h: ClientsHandlers) => () => void
  dispatch: (cmd: ClientsCommand) => void
  queueCommand: (cmd: ClientsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: ClientsCommand, h: ClientsHandlers) {
  switch (cmd.type) {
    case 'search': h.search(cmd.query); break
    case 'filter_status': h.filterStatus(cmd.status); break
    case 'select_client': h.selectClient(cmd.id, cmd.name); break
    case 'open_full': h.openFull(); break
    case 'open_import': h.openImport(); break
    case 'refresh': h.refresh(); break
  }
}

export function ClientsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ClientsSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<ClientsHandlers | null>(null)
  const queueRef = useRef<ClientsCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<ClientsSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof ClientsSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: ClientsHandlers) => {
    handlersRef.current = h
    flush()
    return () => { handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: ClientsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: ClientsCommand) => {
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

export function useClientsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClientsBridge requires ClientsBridgeProvider')
  return ctx
}

export function useClientsBridgeOptional() {
  return useContext(Ctx)
}