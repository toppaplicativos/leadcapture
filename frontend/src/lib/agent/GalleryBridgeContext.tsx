import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type GallerySnapshot = {
  total: number
  selectedId: string | null
  selectedTitle: string
  folder: string
  loading: boolean
}

export type GalleryCommand =
  | { type: 'select_item'; id: string; title?: string }
  | { type: 'open_upload' }
  | { type: 'set_folder'; folder: string }
  | { type: 'open_full' }
  | { type: 'refresh' }

export type GalleryHandlers = {
  selectItem: (id: string, title?: string) => void
  openUpload: () => void
  setFolder: (folder: string) => void
  openFull: () => void
  refresh: () => void
}

const EMPTY: GallerySnapshot = {
  total: 0, selectedId: null, selectedTitle: '', folder: 'all', loading: true,
}

type Value = {
  snapshot: GallerySnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<GallerySnapshot>) => void
  registerHandlers: (h: GalleryHandlers) => () => void
  dispatch: (cmd: GalleryCommand) => void
  queueCommand: (cmd: GalleryCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: GalleryCommand, h: GalleryHandlers) {
  switch (cmd.type) {
    case 'select_item': h.selectItem(cmd.id, cmd.title); break
    case 'open_upload': h.openUpload(); break
    case 'set_folder': h.setFolder(cmd.folder); break
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
  }
}

export function GalleryBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GallerySnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<GalleryHandlers | null>(null)
  const queueRef = useRef<GalleryCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<GallerySnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...s }))
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: GalleryHandlers) => {
    handlersRef.current = h
    flush()
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: GalleryCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: GalleryCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGalleryBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGalleryBridge requires GalleryBridgeProvider')
  return ctx
}

export function useGalleryBridgeOptional() {
  return useContext(Ctx)
}