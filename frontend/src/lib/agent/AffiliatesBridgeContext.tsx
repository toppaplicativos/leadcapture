import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react'

export type AffiliatesTabKey = 'overview' | 'distribution' | 'programs' | 'partners' | 'commissions' | 'payouts' | 'materials' | 'learning' | 'products' | 'settings'

export type AffiliatesSnapshot = {
  enabled: boolean
  commissionPct: number
  affiliatesTotal: number
  affiliatesPending: number
  affiliatesActive: number
  totalClicks: number
  totalSales: number
  commissionPending: number
  commissionApproved: number
  payoutsRequested: number
  commissionsPendingCount?: number
  materialsCount: number
  topAffiliates: Array<{
    id: string
    name: string
    code: string
    status: string
    clicks: number
    sales: number
    commission: number
  }>
  loading: boolean
  activeTab: AffiliatesTabKey
}

export type AffiliatesCommand =
  | { type: 'open_full' }
  | { type: 'refresh' }
  | { type: 'open_tab'; tab: AffiliatesTabKey }
  | { type: 'create_affiliate' }
  | { type: 'open_settings' }

export type AffiliatesHandlers = {
  openFull: () => void
  refresh: () => void
  openTab: (tab: AffiliatesTabKey) => void
  createAffiliate: () => void
  openSettings: () => void
}

const EMPTY: AffiliatesSnapshot = {
  enabled: false,
  commissionPct: 10,
  affiliatesTotal: 0,
  affiliatesPending: 0,
  affiliatesActive: 0,
  totalClicks: 0,
  totalSales: 0,
  commissionPending: 0,
  commissionApproved: 0,
  payoutsRequested: 0,
  commissionsPendingCount: 0,
  materialsCount: 0,
  topAffiliates: [],
  loading: true,
  activeTab: 'overview',
}

type Value = {
  snapshot: AffiliatesSnapshot
  isReady: boolean
  moduleOpen: boolean
  moduleExpanded: boolean
  setModuleOpen: (v: boolean) => void
  setModuleExpanded: (v: boolean) => void
  publishSnapshot: (s: Partial<AffiliatesSnapshot>) => void
  registerHandlers: (h: AffiliatesHandlers) => () => void
  dispatch: (cmd: AffiliatesCommand) => void
  queueCommand: (cmd: AffiliatesCommand) => void
}

const Ctx = createContext<Value | null>(null)

function run(cmd: AffiliatesCommand, h: AffiliatesHandlers) {
  switch (cmd.type) {
    case 'open_full': h.openFull(); break
    case 'refresh': h.refresh(); break
    case 'open_tab': h.openTab(cmd.tab); break
    case 'create_affiliate': h.createAffiliate(); break
    case 'open_settings': h.openSettings(); break
  }
}

export function AffiliatesBridgeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AffiliatesSnapshot>(EMPTY)
  const [isReady, setIsReady] = useState(false)
  const [moduleOpen, setModuleOpen] = useState(false)
  const [moduleExpanded, setModuleExpanded] = useState(true)
  const handlersRef = useRef<AffiliatesHandlers | null>(null)
  const queueRef = useRef<AffiliatesCommand[]>([])

  const flush = useCallback(() => {
    if (!handlersRef.current) return
    const pending = [...queueRef.current]
    queueRef.current = []
    pending.forEach((c) => run(c, handlersRef.current!))
  }, [])

  const publishSnapshot = useCallback((s: Partial<AffiliatesSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...s, loading: false }))
  }, [])

  const registerHandlers = useCallback((h: AffiliatesHandlers) => {
    handlersRef.current = h
    setIsReady(true)
    flush()
    return () => {
      if (handlersRef.current === h) {
        handlersRef.current = null
        setIsReady(false)
      }
    }
  }, [flush])

  const dispatch = useCallback((cmd: AffiliatesCommand) => {
    if (handlersRef.current) run(cmd, handlersRef.current)
    else queueRef.current.push(cmd)
  }, [])

  const queueCommand = useCallback((cmd: AffiliatesCommand) => {
    dispatch(cmd)
  }, [dispatch])

  const value = useMemo(() => ({
    snapshot, isReady, moduleOpen, moduleExpanded,
    setModuleOpen, setModuleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand,
  }), [snapshot, isReady, moduleOpen, moduleExpanded, publishSnapshot, registerHandlers, dispatch, queueCommand])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAffiliatesBridge() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAffiliatesBridge requires AffiliatesBridgeProvider')
  return ctx
}

export function useAffiliatesBridgeOptional() {
  return useContext(Ctx)
}