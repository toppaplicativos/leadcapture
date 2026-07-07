import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { InstagramTab } from '@/lib/instagram/client'

export type InstagramSnapshot = {
  connected: boolean
  username: string
  name: string
  followers: number
  following: number
  mediaCount: number
  avatarUrl: string
  activeTab: InstagramTab
  loading: boolean
}

export type InstagramCommand =
  | { type: 'open_full' }
  | { type: 'refresh' }
  | { type: 'set_tab'; tab: InstagramTab }
  | { type: 'connect' }

export type InstagramHandlers = {
  openFull: () => void
  refresh: () => void
  setTab: (tab: InstagramTab) => void
  connect: () => void
}

const EMPTY: InstagramSnapshot = {
  connected: false,
  username: '',
  name: '',
  followers: 0,
  following: 0,
  mediaCount: 0,
  avatarUrl: '',
  activeTab: 'overview',
  loading: true,
}

type Value = {
  snapshot: InstagramSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<InstagramSnapshot>) => void
  registerHandlers: (h: InstagramHandlers) => () => void
  dispatch: (cmd: InstagramCommand) => void
  queueCommand: (cmd: InstagramCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: InstagramCommand, h: InstagramHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
    case 'set_tab': h.setTab(cmd.tab); break
    case 'connect': h.connect(); break
  }
}

export function InstagramBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<InstagramSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<InstagramHandlers | null>(null)
  const queueRef = useRef<InstagramCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<InstagramSnapshot>) => {
    setSnapshot((prev) => {
      const keys = Object.keys(s) as (keyof InstagramSnapshot)[]
      if (keys.every((k) => prev[k] === s[k])) return prev
      return { ...prev, ...s }
    })
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: InstagramHandlers) => {
    handlersRef.current = h
    flush()
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: InstagramCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: InstagramCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInstagramBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useInstagramBridge requires InstagramBridgeProvider')
  return ctx
}

export function useInstagramBridgeOptional() {
  return useContext(Ctx)
}