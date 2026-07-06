import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type CampaignsSnapshot = {
  total: number
  active: number
  selectedId: string | null
  selectedName: string
  loading: boolean
}

export type CampaignsCommand =
  | { type: 'select_campaign'; id: string; name?: string }
  | { type: 'create_new' }
  | { type: 'open_ai_wizard' }
  | { type: 'open_full' }
  | { type: 'refresh' }

export type CampaignsHandlers = {
  selectCampaign: (id: string, name?: string) => void
  createNew: () => void
  openAiWizard: () => void
  openFull: () => void
  refresh: () => void
}

const EMPTY: CampaignsSnapshot = {
  total: 0, active: 0, selectedId: null, selectedName: '', loading: true,
}

type Value = {
  snapshot: CampaignsSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<CampaignsSnapshot>) => void
  registerHandlers: (h: CampaignsHandlers) => () => void
  dispatch: (cmd: CampaignsCommand) => void
  queueCommand: (cmd: CampaignsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: CampaignsCommand, h: CampaignsHandlers) {
  switch (cmd.type) {
    case 'select_campaign': h.selectCampaign(cmd.id, cmd.name); break
    case 'create_new': h.createNew(); break
    case 'open_ai_wizard': h.openAiWizard(); break
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
  }
}

export function CampaignsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<CampaignsSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<CampaignsHandlers | null>(null)
  const queueRef = useRef<CampaignsCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<CampaignsSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof CampaignsSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: CampaignsHandlers) => {
    handlersRef.current = h
    flush()
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: CampaignsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: CampaignsCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCampaignsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCampaignsBridge requires CampaignsBridgeProvider')
  return ctx
}

export function useCampaignsBridgeOptional() {
  return useContext(Ctx)
}