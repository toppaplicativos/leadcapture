export type PwaAppKind = 'store' | 'admin' | 'stock' | 'affiliate'

export type PwaIdentity = {
  app: PwaAppKind
  slug: string | null
  /** partners = LeadCapture Parceiros global */
  surface: 'partners' | null
  name: string
  themeColor: string
  iconUrl: string
}

const DEFAULTS: Record<PwaAppKind, Omit<PwaIdentity, 'app' | 'slug' | 'surface'>> = {
  admin: {
    name: 'LeadCapture',
    themeColor: '#0a0a0a',
    iconUrl: '/pwa/icon?app=admin&size=192',
  },
  store: {
    name: 'Catálogo',
    themeColor: '#0f82ff',
    iconUrl: '/pwa/icon?app=store&size=192',
  },
  stock: {
    name: 'Estoque',
    themeColor: '#d97706',
    iconUrl: '/pwa/icon?app=stock&size=192',
  },
  affiliate: {
    name: 'Afiliados',
    themeColor: '#16a34a',
    iconUrl: '/pwa/icon?app=affiliate&size=192',
  },
}

type BootIdentity = Partial<PwaIdentity> & { app?: PwaAppKind; surface?: string | null }

function readBootIdentity(): BootIdentity | null {
  try {
    return (window as Window & { __LC_PWA_IDENTITY__?: BootIdentity }).__LC_PWA_IDENTITY__ || null
  } catch {
    return null
  }
}

function detectFromLocation(): {
  app: PwaAppKind
  slug: string | null
  surface: 'partners' | null
} {
  const host = (window.location.hostname || '').toLowerCase()
  const parts = window.location.pathname.split('/').filter(Boolean)
  const first = parts[0] || ''

  if (host === 'parceiros.leadcapture.online' || host === 'afiliados.leadcapture.online') {
    return { app: 'affiliate', slug: null, surface: 'partners' }
  }

  const brandHost = host.match(/^(?:parceiros|afiliados)\.([a-z0-9-]+)\./i)
  if (brandHost?.[1] && brandHost[1] !== 'leadcapture') {
    return { app: 'affiliate', slug: brandHost[1], surface: null }
  }

  if (first === 'parceiros') {
    return { app: 'affiliate', slug: null, surface: 'partners' }
  }
  if ((first === 'catalogo' || first === 'loja') && parts[1]) {
    return { app: 'store', slug: decodeURIComponent(parts[1]), surface: null }
  }
  if (first === 'central-afiliado') {
    return {
      app: 'affiliate',
      slug: parts[1] ? decodeURIComponent(parts[1]) : null,
      surface: null,
    }
  }
  if (first === 'app-estoque' || first === 'inventario') {
    return {
      app: 'stock',
      slug: parts[1] ? decodeURIComponent(parts[1]) : null,
      surface: null,
    }
  }
  return { app: 'admin', slug: null, surface: null }
}

/** Identidade PWA resolvida no boot (index.html) ou fallback por host/path */
export function getPwaIdentity(): PwaIdentity {
  const boot = readBootIdentity()
  if (boot?.app && DEFAULTS[boot.app]) {
    const base = DEFAULTS[boot.app]
    const surface = boot.surface === 'partners' ? 'partners' : null
    const name =
      boot.name
      || (boot.app === 'affiliate' && surface === 'partners' ? 'LeadCapture Parceiros' : base.name)
    return {
      app: boot.app,
      slug: boot.slug ?? null,
      surface,
      name,
      themeColor: boot.themeColor || base.themeColor,
      iconUrl: boot.iconUrl || base.iconUrl,
    }
  }

  const detected = detectFromLocation()
  const base = DEFAULTS[detected.app]
  const params = new URLSearchParams({ app: detected.app, size: '192' })
  if (detected.slug) params.set('slug', detected.slug)
  if (detected.surface) params.set('surface', detected.surface)

  const parts = window.location.pathname.split('/').filter(Boolean)
  const first = parts[0] || ''
  if (detected.app === 'store' && (first === 'catalogo' || first === 'loja')) {
    params.set('channel', first)
  }

  return {
    app: detected.app,
    slug: detected.slug,
    surface: detected.surface,
    name:
      detected.app === 'affiliate' && detected.surface === 'partners'
        ? 'LeadCapture Parceiros'
        : base.name,
    themeColor: base.themeColor,
    iconUrl: `/pwa/icon?${params.toString()}`,
  }
}
