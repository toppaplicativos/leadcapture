/**
 * Card de instalação PWA no catálogo (whitelabel).
 * Nunca deve usar copy/identidade do LeadCapture raiz — sempre da marca.
 */

export type StorePwaInstallSettings = {
  /** false = não mostra o card no catálogo */
  enabled: boolean
  /** Vazio = "Instalar {nome da marca}" */
  title: string
  subtitle: string
  benefit_1: string
  benefit_2: string
  benefit_3: string
  benefit_4: string
  cta_label: string
  dismiss_label: string
}

export type StorefrontPwaBrand = {
  name: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  slug: string
  pwaInstall: StorePwaInstallSettings
}

export const STORE_PWA_EVENT = 'lc:storefront-pwa'

export const DEFAULT_STORE_PWA_INSTALL: StorePwaInstallSettings = {
  enabled: true,
  title: '',
  subtitle: 'Peça e acompanhe na tela inicial — mais rápido, sem abrir o navegador.',
  benefit_1: 'Abre mais rápido que pelo navegador',
  benefit_2: 'Atalho fixo na tela inicial do celular',
  benefit_3: 'Receba avisos importantes do pedido',
  benefit_4: 'Experiência de app, com a cara da loja',
  cta_label: 'Instalar app',
  dismiss_label: 'Agora não',
}

function clip(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

export function normalizeStorePwaInstall(
  raw?: Partial<StorePwaInstallSettings> | null,
): StorePwaInstallSettings {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: src.enabled !== false,
    title: clip(src.title, 80),
    subtitle: clip(src.subtitle, 180) || DEFAULT_STORE_PWA_INSTALL.subtitle,
    benefit_1: clip(src.benefit_1, 90) || DEFAULT_STORE_PWA_INSTALL.benefit_1,
    benefit_2: clip(src.benefit_2, 90) || DEFAULT_STORE_PWA_INSTALL.benefit_2,
    benefit_3: clip(src.benefit_3, 90) || DEFAULT_STORE_PWA_INSTALL.benefit_3,
    benefit_4: clip(src.benefit_4, 90) || DEFAULT_STORE_PWA_INSTALL.benefit_4,
    cta_label: clip(src.cta_label, 40) || DEFAULT_STORE_PWA_INSTALL.cta_label,
    dismiss_label: clip(src.dismiss_label, 40) || DEFAULT_STORE_PWA_INSTALL.dismiss_label,
  }
}

export function resolveStorePwaTitle(settings: StorePwaInstallSettings, brandName: string): string {
  const custom = clip(settings.title, 80)
  if (custom) return custom
  const name = clip(brandName, 48) || 'loja'
  return `Instalar ${name}`
}

export function isStorefrontSurface(pathname?: string, hostname?: string): boolean {
  if (typeof window === 'undefined' && !pathname && !hostname) return false
  const host = (hostname || (typeof window !== 'undefined' ? window.location.hostname : '') || '').toLowerCase()
  const path = (pathname || (typeof window !== 'undefined' ? window.location.pathname : '') || '/')
  const first = path.split('/').filter(Boolean)[0] || ''

  // Domínios oficiais da plataforma NÃO são vitrine whitelabel
  const platformHosts = new Set([
    'app.leadcapture.online',
    'leadcapture.online',
    'www.leadcapture.online',
    'parceiros.leadcapture.online',
    'afiliados.leadcapture.online',
    'mob.leadcapture.online',
    'adm.leadcapture.online',
    'localhost',
    '127.0.0.1',
  ])
  if (first === 'catalogo' || first === 'loja') return true
  if (platformHosts.has(host)) return false
  // Domínio customizado da marca = whitelabel store
  return true
}

export function storefrontPwaFromStore(store: {
  slug?: string
  name?: string
  brand?: {
    name?: string
    logo_url?: string
    primary_color?: string
    secondary_color?: string
  } | null
  theme?: {
    logo_url?: string
    primary_color?: string
    secondary_color?: string
  } | null
  marketing?: {
    pwa_install?: Partial<StorePwaInstallSettings> | null
  } | null
} | null | undefined): StorefrontPwaBrand | null {
  if (!store) return null
  const brand = store.brand || {}
  const theme = store.theme || {}
  const name = clip(brand.name || store.name, 64) || 'Loja'
  const logoUrl = clip(brand.logo_url || theme.logo_url, 500)
  const primary = clip(brand.primary_color || theme.primary_color, 20) || '#111827'
  const secondary = clip(brand.secondary_color || theme.secondary_color, 20) || '#3b82f6'
  const slug = clip(store.slug, 120)
  return {
    name,
    logoUrl,
    primaryColor: primary,
    secondaryColor: secondary,
    slug,
    pwaInstall: normalizeStorePwaInstall(store.marketing?.pwa_install),
  }
}

/** Emite identidade da marca para o card de instalação (e outros ouvintes). */
export function publishStorefrontPwa(brand: StorefrontPwaBrand): void {
  if (typeof window === 'undefined') return
  try {
    const iconUrl =
      brand.logoUrl ||
      (brand.slug
        ? `/pwa/icon?app=store&slug=${encodeURIComponent(brand.slug)}&size=192`
        : '/pwa/icon?app=store&size=192')
    ;(window as Window & { __LC_PWA_IDENTITY__?: Record<string, unknown> }).__LC_PWA_IDENTITY__ = {
      app: 'store',
      slug: brand.slug || null,
      surface: null,
      name: brand.name,
      themeColor: brand.primaryColor,
      iconUrl,
    }
    window.dispatchEvent(new CustomEvent(STORE_PWA_EVENT, { detail: brand }))
  } catch {
    /* ignore */
  }
}

export function readStorefrontPwaFromCatalogCache(): StorefrontPwaBrand | null {
  if (typeof window === 'undefined') return null
  try {
    const host = window.location.hostname
    const pathParts = window.location.pathname.split('/').filter(Boolean)
    const slugFromPath =
      (pathParts[0] === 'catalogo' || pathParts[0] === 'loja') && pathParts[1]
        ? pathParts[1]
        : ''
    const slug =
      slugFromPath
      || String(new URLSearchParams(window.location.search).get('slug') || '').trim()
      || String((window as Window & { __STORE_SLUG__?: string }).__STORE_SLUG__ || '').trim()
    const key = `lead-system:storefront-catalog:${host}:${slug}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: { store?: unknown } }
    return storefrontPwaFromStore(parsed?.data?.store as any)
  } catch {
    return null
  }
}
