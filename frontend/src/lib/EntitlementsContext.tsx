import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchEntitlements,
  filterNavItems,
  invalidateEntitlementsCache,
  type Entitlements,
} from '@/lib/entitlements'
import { NAV_ITEMS, type NavItem } from '@/lib/admin/nav'

type Ctx = {
  entitlements: Entitlements | null
  loading: boolean
  refresh: () => Promise<void>
  navItems: NavItem[]
  moduleEnabled: (moduleKey: string) => boolean
  featureEnabled: (featureKey: string) => boolean
  brandActive: boolean
  maintenanceMode: boolean
}

const EntitlementsContext = createContext<Ctx | null>(null)

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    invalidateEntitlementsCache()
    setLoading(true)
    const ent = await fetchEntitlements(true)
    setEntitlements(ent)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /* Re-fetch when brand context changes (multi-brand sync) */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lead-system:active-brand-id') refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const value = useMemo<Ctx>(() => {
    const modules = entitlements?.modules
    return {
      entitlements,
      loading,
      refresh,
      navItems: filterNavItems(NAV_ITEMS, modules),
      moduleEnabled: (key: string) => modules?.[key] !== false,
      featureEnabled: (key: string) => entitlements?.features?.[key] !== false,
      brandActive: entitlements?.brand?.active !== false,
      maintenanceMode: !!entitlements?.maintenance_mode && !entitlements?.is_super_admin,
    }
  }, [entitlements, loading, refresh])

  return (
    <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
  )
}

export function useEntitlements(): Ctx {
  const ctx = useContext(EntitlementsContext)
  if (!ctx) {
    return {
      entitlements: null,
      loading: false,
      refresh: async () => {},
      navItems: NAV_ITEMS,
      moduleEnabled: () => true,
      featureEnabled: () => true,
      brandActive: true,
      maintenanceMode: false,
    }
  }
  return ctx
}
