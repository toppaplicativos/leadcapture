import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { isCustomDomain, storeSlug } from './lib/store-context'

/* Apply cached brand colors synchronously before React renders — prevents FOUC (blue flash) */
try {
  const cached = localStorage.getItem('lead-system:brand-colors')
  if (cached) {
    const { primary, secondary } = JSON.parse(cached)
    const root = document.documentElement
    if (primary) root.style.setProperty('--brand-primary', primary)
    if (secondary) {
      root.style.setProperty('--brand-secondary', secondary)
      root.style.setProperty('--brand-secondary-soft', secondary + '1a')
      root.style.setProperty('--brand-secondary-light', secondary + '26')
    }
  }
} catch { /* ignore */ }

type SplashApi = {
  startedAt: number
  dismiss: () => void
}

type LeadCaptureWindow = Window & {
  __LC_SPLASH__?: SplashApi
}

function dismissInitialSplash() {
  const splashApi = (window as LeadCaptureWindow).__LC_SPLASH__
  if (!splashApi) return

  // Keep the splash visible for at least 200ms so the fade-in animation
  // completes — otherwise it flashes out before the user perceives it.
  const elapsed = Date.now() - splashApi.startedAt
  const remaining = Math.max(0, 200 - elapsed)

  window.setTimeout(() => {
    window.requestAnimationFrame(() => splashApi.dismiss())
  }, remaining)
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const cleanupKey = 'lead-system-dev-sw-cleaned'
    Promise.all([
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined),
      'caches' in window
        ? caches.keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith('lead-system-')).map((key) => caches.delete(key))))
          .catch(() => undefined)
        : Promise.resolve(),
    ]).then(() => {
      if (!sessionStorage.getItem(cleanupKey) && navigator.serviceWorker.controller) {
        sessionStorage.setItem(cleanupKey, '1')
        window.location.reload()
      }
    }).catch(() => undefined)
  })
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  /**
   * Resolve the right scope for each app surface so each PWA install
   * (admin, stock, storefront) gets its own offline shell.
   *
   *   - Custom domain → '/' (whole site is the storefront)
   *   - /catalogo/:slug or /loja/:slug → that catalog scope
   *   - /app-estoque/:slug → that brand's stock scope
   *   - /admin, /login, /dashboard, etc → '/' admin scope
   */
  const hostIsMob = () =>
    (window.location.hostname || '').toLowerCase() === 'mob.leadcapture.online'

  const baseScope = (() => {
    if (isCustomDomain) return '/'

    const parts = window.location.pathname.split('/').filter(Boolean)
    const first = parts[0] || ''

    if ((first === 'catalogo' || first === 'loja') && (parts[1] || storeSlug)) {
      return `/${first}/${encodeURIComponent(parts[1] || storeSlug)}/`
    }
    if (first === 'app-estoque' && parts[1]) {
      return `/${first}/${encodeURIComponent(parts[1])}/`
    }
    if (first === 'central-afiliado' && parts[1]) {
      return `/${first}/${encodeURIComponent(parts[1])}/`
    }
    if (first === 'parceiros') {
      return '/parceiros/'
    }
    if (first === 'mob' || hostIsMob()) {
      return first === 'mob' ? '/mob/' : '/'
    }
    // Admin / login / generic admin routes
    return '/'
  })()

  // Novo SW ativou → recarrega 1x para pegar HTML/chunks do deploy
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    if (sessionStorage.getItem('lead-system:sw-controller-reloaded') === '1') return
    refreshing = true
    sessionStorage.setItem('lead-system:sw-controller-reloaded', '1')
    window.location.reload()
  })

  window.addEventListener('load', () => {
    // limpa flag na carga estável (próximo deploy pode recarregar de novo)
    window.setTimeout(() => {
      try { sessionStorage.removeItem('lead-system:sw-controller-reloaded') } catch { /* ignore */ }
    }, 8000)

    navigator.serviceWorker
      .register('/service-worker.js', { scope: baseScope })
      .then((registration) => {
        void registration.update().catch(() => undefined)

        // Se já há SW waiting (deploy), ativa na hora
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        // Warm cache: scripts/CSS já no DOM + modulepreload → navegação PWA mais rápida
        const warm = () => {
          const urls = new Set<string>()
          document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="modulepreload"], link[rel="preload"]').forEach((el) => {
            const href = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href
            if (href && href.startsWith(window.location.origin)) urls.add(href)
          })
          try {
            performance.getEntriesByType('resource').forEach((entry) => {
              const name = (entry as PerformanceResourceTiming).name
              if (name && name.includes('/assets/') && name.startsWith(window.location.origin)) {
                urls.add(name)
              }
            })
          } catch {
            /* ignore */
          }
          const list = [...urls]
          if (!list.length) return
          const post = (sw: ServiceWorker | null | undefined) => {
            sw?.postMessage({ type: 'WARM_URLS', urls: list })
          }
          post(registration.active)
          post(navigator.serviceWorker.controller)
        }
        const w = window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
        }
        if (typeof w.requestIdleCallback === 'function') {
          w.requestIdleCallback(warm, { timeout: 4000 })
        } else {
          window.setTimeout(warm, 1200)
        }
      })
      .catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

dismissInitialSplash()
