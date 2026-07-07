import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { FacebookTab } from '@/lib/facebook/client'

export type FacebookSnapshot = {
  connected: boolean
  pageName: string
  category: string
  fans: number
  followers: number
  postsCount: number
  avatarUrl: string
  activeTab: FacebookTab
  loading: boolean
}

export type FacebookCommand =
  | { type: 'open_full' }
  | { type: 'refresh' }
  | { type: 'set_tab'; tab: FacebookTab }
  | { type: 'connect' }

export type FacebookHandlers = {
  openFull: () => void
  refresh: () => void
  setTab: (tab: FacebookTab) => void
  connect: () => void
}

const EMPTY: FacebookSnapshot = {
  connected: false,
  pageName: '',
  category: '',
  fans: 0,
  followers: 0,
  postsCount: 0,
  avatarUrl: '',
  activeTab: 'overview',
  loading: true,
}

type Value = {
  snapshot: FacebookSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<FacebookSnapshot>) => void
  registerHandlers: (h: FacebookHandlers) => () => void
  dispatch: (cmd: FacebookCommand) => void
  queueCommand: (cmd: FacebookCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: FacebookCommand, h: FacebookHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
    case 'set_tab': h.setTab(cmd.tab); break
    case 'connect': h.connect(); break
  }
}

export function FacebookBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<FacebookSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<FacebookHandlers | null>(null)
  const queueRef = useRef<FacebookCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<FacebookSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof FacebookSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: FacebookHandlers) => {
    handlersRef.current = h
    flush()
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: FacebookCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: FacebookCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFacebookBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFacebookBridge requires FacebookBridgeProvider')
  return ctx
}

export function useFacebookBridgeOptional() {
  return useContext(Ctx)
}