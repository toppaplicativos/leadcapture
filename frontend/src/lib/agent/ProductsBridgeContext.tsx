import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type ProductsSnapshot = {
  total: number
  active: number
  drafts: number
  search: string
  selectedId: string | null
  selectedName: string
  loading: boolean
}

export type ProductsCommand =
  | { type: 'search'; query: string }
  | { type: 'select_product'; id: string; name?: string }
  | { type: 'create_new' }
  | { type: 'open_full' }
  | { type: 'refresh' }

export type ProductsHandlers = {
  search: (query: string) => void
  selectProduct: (id: string, name?: string) => void
  createNew: () => void
  openFull: () => void
  refresh: () => void
}

const EMPTY: ProductsSnapshot = {
  total: 0, active: 0, drafts: 0, search: '', selectedId: null, selectedName: '', loading: true,
}

type Value = {
  snapshot: ProductsSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<ProductsSnapshot>) => void
  registerHandlers: (h: ProductsHandlers) => () => void
  dispatch: (cmd: ProductsCommand) => void
  queueCommand: (cmd: ProductsCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: ProductsCommand, h: ProductsHandlers) {
  switch (cmd.type) {
    case 'search': h.search(cmd.query); break
    case 'select_product': h.selectProduct(cmd.id, cmd.name); break
    case 'create_new': h.createNew(); break
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
  }
}

export function ProductsBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProductsSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<ProductsHandlers | null>(null)
  const queueRef = useRef<ProductsCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<ProductsSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...s }))
    setIsReady(true)
  }, [])

  const registerHandlers = useCallback((h: ProductsHandlers) => {
    handlersRef.current = h
    flush()
    return () => { if (handlersRef.current === h) handlersRef.current = null }
  }, [flush])

  const dispatch = useCallback((cmd: ProductsCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: ProductsCommand) => {
    queueRef.current.push(cmd)
    flush()
  }, [flush])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProductsBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProductsBridge requires ProductsBridgeProvider')
  return ctx
}

export function useProductsBridgeOptional() {
  return useContext(Ctx)
}