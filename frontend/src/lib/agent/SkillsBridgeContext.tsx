import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type SkillRow = {
  id: string
  name: string
  type: string
  active: boolean
  confidence: number
}

export type SkillsSnapshot = {
  total: number
  activeCount: number
  skills: SkillRow[]
  selectedId: string | null
  selectedName: string
  loading: boolean
}

export type SkillsCommand =
  | { type: 'open_full' }
  | { type: 'open_trainer' }
  | { type: 'refresh' }
  | { type: 'select_skill'; id: string; name?: string }

export type SkillsHandlers = {
  openFull: () => void
  openTrainer: () => void
  refresh: () => void
  selectSkill: (id: string, name?: string) => void
}

const EMPTY: SkillsSnapshot = {
  total: 0,
  activeCount: 0,
  skills: [],
  selectedId: null,
  selectedName: '',
  loading: true,
}

type Value = {
  snapshot: SkillsSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<SkillsSnapshot>) => void
  registerHandlers: (h: SkillsHandlers) => () => void
  dispatch: (cmd: SkillsCommand) => void
  queueCommand: (cmd: SkillsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: SkillsCommand, h: SkillsHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'open_trainer': h.openTrainer(); break
    case 'refresh': h.refresh(); break
    case 'select_skill': h.selectSkill(cmd.id, cmd.name); break
  }
}

export function SkillsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SkillsSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<SkillsHandlers | null>(null)
  const queueRef = useRef<SkillsCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<SkillsSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof SkillsSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: SkillsHandlers) => {
    handlersRef.current = h
    flush()
    return () => { handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: SkillsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: SkillsCommand) => {
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

export function useSkillsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSkillsBridge must be used within SkillsBridgeProvider')
  return ctx
}

export function useSkillsBridgeOptional() {
  return useContext(Ctx)
}