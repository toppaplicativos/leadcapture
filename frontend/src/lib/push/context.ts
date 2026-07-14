export type PushAppContext = 'master' | 'admin' | 'affiliate' | 'stock' | 'storefront' | 'mob'

export function resolvePushAppContext(): PushAppContext {
  if (typeof window === 'undefined') return 'admin'
  const host = window.location.hostname.toLowerCase()
  const path = window.location.pathname

  if (host.startsWith('adm.')) return 'master'
  if (host.startsWith('mob.') || host === 'mob.leadcapture.online') return 'mob'
  if (host.startsWith('parceiros.') || host.startsWith('afiliados.')) return 'affiliate'
  if (host.startsWith('estoque.')) return 'stock'

  if (path.startsWith('/mob') || path.startsWith('/rastreio')) return 'mob'
  if (path.startsWith('/parceiros') || path.startsWith('/central-afiliado')) return 'affiliate'
  if (path.startsWith('/app-estoque')) return 'stock'
  if (path.startsWith('/catalogo') || path.startsWith('/loja')) return 'storefront'

  return 'admin'
}

export function pushContextLabel(ctx: PushAppContext): string {
  const map: Record<PushAppContext, string> = {
    master: 'App Admin',
    admin: 'Painel da marca',
    affiliate: 'Central do Afiliado',
    stock: 'App Estoque',
    storefront: 'Loja',
    mob: 'Lead Capture Mob',
  }
  return map[ctx] || ctx
}

export function detectBrowser(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Browser'
}

export function detectOS(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}