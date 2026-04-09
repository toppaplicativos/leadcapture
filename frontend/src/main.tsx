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

  const elapsed = Date.now() - splashApi.startedAt
  const remaining = Math.max(0, 720 - elapsed)

  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        splashApi.dismiss()
      })
    })
  }, remaining)
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const baseScope = isCustomDomain
    ? '/'
    : (() => {
        const parts = window.location.pathname.split('/').filter(Boolean)
        if ((parts[0] === 'catalogo' || parts[0] === 'loja') && (parts[1] || storeSlug)) {
          return `/${parts[0]}/${encodeURIComponent(parts[1] || storeSlug)}/`
        }
        return ''
      })()

  if (baseScope) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: baseScope })
        .then((registration) => registration.update().catch(() => undefined))
        .catch(() => undefined)
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

dismissInitialSplash()
