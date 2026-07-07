import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type AutomationsSnapshot = {
  total: number
  reactive: number
  proactive: number
  flows: Array<{ id: string; name: string; status: string; trigger?: string }>
  loading: boolean
}

export type AutomationsCommand =
  | { type: 'open_full' }
  | { type: 'refresh' }
  | { type: 'open_flows' }
  | { type: 'create_flow' }

export type AutomationsHandlers = {
  openFull: () => void
  refresh: () => void
  openFlows: () => void
  createFlow: () => void
}

const EMPTY: AutomationsSnapshot = {
  total: 0, reactive: 0, proactive: 0, flows: [], loading: true,
}

type Value = {
  snapshot: AutomationsSnapshot
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<AutomationsSnapshot>) => void
  registerHandlers: (h: AutomationsHandlers) => () => void
  dispatch: (cmd: AutomationsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: AutomationsCommand, h: AutomationsHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
    case 'open_flows': h.openFlows(); break
    case 'create_flow': h.createFlow(); break
  }
}

export function AutomationsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AutomationsSnapshot>(EMPTY)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<AutomationsHandlers | null>(null)

  const publishSnapshot = useCallback((s: Partial<AutomationsSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...s, loading: false }))
  }, [])

  const registerHandlers = useCallback((h: AutomationsHandlers) => {
    handlersRef.current = h
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [])

  const dispatch = useCallback((cmd: AutomationsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
  }, [])

  const value = useMemo(() => ({
    snapshot, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch,
  }), [snapshot, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAutomationsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAutomationsBridge requires AutomationsBridgeProvider')
  return ctx
}

export function useAutomationsBridgeOptional() {
  return useContext(Ctx)
}