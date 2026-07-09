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
    // Admin / login / generic admin routes
    return '/'
  })()

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: baseScope })
      .then((registration) => registration.update().catch(() => undefined))
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
