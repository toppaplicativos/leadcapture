import { affiliateApi } from '@/lib/api-affiliate'

const STORAGE_KEY = 'lc-affiliate-app-cache-v1'

export type AffiliateAppCache = {
  boot: any | null
  dashboard: any | null
  sales: any[] | null
  commissions: any | null
  materials: any[] | null
  learningModules: any[] | null
  products: any[] | null
  training: any | null
  contentVersion: number
  prefetchedAt: number
}

function emptyCache(): AffiliateAppCache {
  return {
    boot: null,
    dashboard: null,
    sales: null,
    commissions: null,
    materials: null,
    learningModules: null,
    products: null,
    training: null,
    contentVersion: 0,
    prefetchedAt: 0,
  }
}

function readSession(): AffiliateAppCache {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyCache()
    const parsed = JSON.parse(raw)
    return { ...emptyCache(), ...parsed }
  } catch {
    return emptyCache()
  }
}

function writeSession(cache: AffiliateAppCache) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      boot: cache.boot,
      dashboard: cache.dashboard,
      sales: cache.sales,
      commissions: cache.commissions,
      materials: cache.materials,
      learningModules: cache.learningModules,
      products: cache.products,
      training: cache.training,
      contentVersion: cache.contentVersion,
      prefetchedAt: cache.prefetchedAt,
    }))
  } catch { /* quota / private mode */ }
}

let memory = readSession()
let prefetchPromise: Promise<void> | null = null

export const affiliateAppCache = {
  get(): AffiliateAppCache {
    return memory
  },

  setBoot(boot: any) {
    memory = { ...memory, boot }
    writeSession(memory)
  },

  setDashboard(dashboard: any) {
    memory = { ...memory, dashboard, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setSales(sales: any[]) {
    memory = { ...memory, sales, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setCommissions(commissions: any) {
    memory = { ...memory, commissions, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setMaterials(materials: any[]) {
    memory = { ...memory, materials, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setTraining(training: any) {
    memory = { ...memory, training, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setLearningModules(modules: any[]) {
    memory = { ...memory, learningModules: modules, prefetchedAt: Date.now() }
    writeSession(memory)
  },

  setContentBundle(bundle: { materials?: any[]; learning?: { modules?: any[] }; training?: any; meta?: { content_version?: number } }) {
    memory = {
      ...memory,
      materials: bundle.materials ?? memory.materials,
      learningModules: bundle.learning?.modules ?? memory.learningModules,
      training: bundle.training ?? memory.training,
      contentVersion: Number(bundle.meta?.content_version || memory.contentVersion || 0),
      prefetchedAt: Date.now(),
    }
    writeSession(memory)
  },

  clear() {
    memory = emptyCache()
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  },

  /** Carrega todas as abas em paralelo — não bloqueia a UI; deduplica chamadas simultâneas */
  prefetchAll(opts?: { region?: string | null; force?: boolean }): Promise<void> {
    const stale = !memory.prefetchedAt || Date.now() - memory.prefetchedAt > 60_000
    if (!opts?.force && !stale && memory.dashboard && memory.sales && memory.commissions) {
      return Promise.resolve()
    }
    if (prefetchPromise) return prefetchPromise

    prefetchPromise = (async () => {
      const region = opts?.region ?? memory.boot?.affiliate?.region

      const [dashboard, sales, commissions, content, products] = await Promise.allSettled([
        affiliateApi.dashboard(),
        affiliateApi.sales(),
        affiliateApi.commissions(),
        affiliateApi.content(region || undefined),
        affiliateApi.products(),
      ])

      if (dashboard.status === 'fulfilled') memory.dashboard = dashboard.value
      if (sales.status === 'fulfilled') memory.sales = sales.value?.sales || []
      if (commissions.status === 'fulfilled') memory.commissions = commissions.value
      if (content.status === 'fulfilled') {
        const c = content.value
        memory.materials = c.materials || []
        memory.learningModules = c.learning?.modules || []
        memory.training = c.training || null
        memory.contentVersion = Number(c.meta?.content_version || 0)
      }
      if (products.status === 'fulfilled') memory.products = products.value?.products || []

      memory.prefetchedAt = Date.now()
      writeSession(memory)
    })().finally(() => { prefetchPromise = null })

    return prefetchPromise
  },
}