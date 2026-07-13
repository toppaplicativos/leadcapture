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
  /** Returns true if allowed; if blocked, opens upgrade modal and returns false */
  requireModule: (moduleKey: string, message?: string) => boolean
  requireFeature: (featureKey: string, message?: string) => boolean
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
    const planSlug = entitlements?.subscription?.plan_slug
    const moduleEnabled = (key: string) => modules?.[key] !== false
    const featureEnabled = (key: string) => entitlements?.features?.[key] !== false
    return {
      entitlements,
      loading,
      refresh,
      navItems: filterNavItems(NAV_ITEMS, modules),
      moduleEnabled,
      featureEnabled,
      requireModule: (key: string, message?: string) => {
        if (moduleEnabled(key)) return true
        void import('@/lib/plan-upgrade').then(({ openPlanUpgradeForModule }) => {
          openPlanUpgradeForModule(key, message, planSlug)
        })
        return false
      },
      requireFeature: (key: string, message?: string) => {
        if (featureEnabled(key)) return true
        void import('@/lib/plan-upgrade').then(({ openPlanUpgradeForFeature }) => {
          openPlanUpgradeForFeature(key, message, planSlug)
        })
        return false
      },
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
      requireModule: () => true,
      requireFeature: () => true,
      brandActive: true,
      maintenanceMode: false,
    }
  }
  return ctx
}
