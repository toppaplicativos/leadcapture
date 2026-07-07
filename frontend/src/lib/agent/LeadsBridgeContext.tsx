import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type LeadsSnapshot = {
  total: number
  newCount: number
  search: string
  statusFilter: string
  selectedId: string | null
  selectedName: string
  loading: boolean
}

export type LeadsCommand =
  | { type: 'search'; query: string }
  | { type: 'filter_status'; status: string }
  | { type: 'select_lead'; id: string; name?: string }
  | { type: 'open_full' }
  | { type: 'open_import' }
  | { type: 'validate_whatsapp' }
  | { type: 'refresh' }

export type LeadsHandlers = {
  search: (query: string) => void
  filterStatus: (status: string) => void
  selectLead: (id: string, name?: string) => void
  openFull: () => void
  openImport: () => void
  validateWhatsapp: () => void
  refresh: () => void
}

const EMPTY: LeadsSnapshot = {
  total: 0,
  newCount: 0,
  search: '',
  statusFilter: '',
  selectedId: null,
  selectedName: '',
  loading: true,
}

type Value = {
  snapshot: LeadsSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<LeadsSnapshot>) => void
  registerHandlers: (h: LeadsHandlers) => () => void
  dispatch: (cmd: LeadsCommand) => void
  queueCommand: (cmd: LeadsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: LeadsCommand, h: LeadsHandlers) {
  switch (cmd.type) {
    case 'search': h.search(cmd.query); break
    case 'filter_status': h.filterStatus(cmd.status); break
    case 'select_lead': h.selectLead(cmd.id, cmd.name); break
    case 'open_full': h.openFull(); break
    case 'open_import': h.openImport(); break
    case 'validate_whatsapp': h.validateWhatsapp(); break
    case 'refresh': h.refresh(); break
  }
}

export function LeadsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LeadsSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<LeadsHandlers | null>(null)
  const queueRef = useRef<LeadsCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<LeadsSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof LeadsSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: LeadsHandlers) => {
    handlersRef.current = h
    flush()
    return () => { handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: LeadsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: LeadsCommand) => {
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

export function useLeadsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLeadsBridge requires LeadsBridgeProvider')
  return ctx
}

export function useLeadsBridgeOptional() {
  return useContext(Ctx)
}