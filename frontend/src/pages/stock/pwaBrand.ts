/** Apply brand theme for stock PWA shell (manifest meta + CSS vars). */
export function applyStockPwaBrand(brand: {
  name?: string
  primary?: string
  secondary?: string
  logo_url?: string
}) {
  if (typeof document === 'undefined') return

  const primary = brand.primary || '#d97706'
  const secondary = brand.secondary || primary

  document.documentElement.style.setProperty('--brand-primary', primary)
  document.documentElement.style.setProperty('--brand-secondary', secondary)

  // theme-color for installed PWA / mobile chrome
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = primary

  if (brand.name) {
    // Apple mobile web app title when installed
    let apple = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null
    if (!apple) {
      apple = document.createElement('meta')
      apple.name = 'apple-mobile-web-app-title'
      document.head.appendChild(apple)
    }
    apple.content = `${brand.name} Estoque`
  }

  // Optional: update apple-touch-icon when brand logo is available
  if (brand.logo_url) {
    let touch = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (!touch) {
      touch = document.createElement('link')
      touch.rel = 'apple-touch-icon'
      document.head.appendChild(touch)
    }
    // Prefer branded PWA icon endpoint when slug-aware identity exists
    touch.href = brand.logo_url
  }
}
