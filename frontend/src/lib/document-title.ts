import { NAV_ITEMS } from '@/lib/admin/nav'
import { getAffiliateBrandMeta } from '@/lib/affiliate-brand-meta'
import { getCachedActiveBrand } from '@/lib/brand-splash'
import { isMasterHost } from '@/lib/master-host'

/** Rotas cujo título é definido após fetch (SEO dinâmico) — não sobrescrever. */
const DEFERRED_PREFIXES = ['/catalogo', '/loja', '/produto']
const DEFERRED_EXACT = new Set(['/checkout', '/pedido', '/historico', '/inicio', '/lp'])

const ADMIN_PAGE_TITLES: Record<string, string> = {
  '/admin': 'Assistente',
  '/criativos/avancado': 'Criativos IA',
  '/campanha': 'Campanhas',
  '/creative': 'Criativos IA',
  '/assistente': 'Assistente',
  '/estoque/app': 'Inventário',
  '/inventario': 'Inventário',
  '/brand-onboarding': 'Onboarding',
}

for (const item of NAV_ITEMS) {
  const path = item.path.split('?')[0]
  ADMIN_PAGE_TITLES[path] = item.label
}

const PUBLIC_TITLES: Record<string, string> = {
  '/login': 'Entrar',
  '/cadastro': 'Ativar plano',
  '/cadastro/sucesso': 'Plano ativado',
  '/parceiros': 'Parceiros — Programa de Afiliados',
  '/parceiros/entrar': 'Parceiros — Entrar',

  '/privacy': 'Privacidade',
  '/privacy/policy': 'Privacidade',
  '/privacy/data-deletion': 'Exclusão de dados',
  '/privacy/deletion-status': 'Exclusão de dados',
  '/terms': 'Termos de uso',
  '/terms-of-service': 'Termos de uso',
  '/master': 'Master',
  '/master/integracoes': 'Integrações',
  '/master/planos': 'Planos',
  '/master/clientes': 'Usuários',
  '/master/usuarios': 'Usuários',
  '/master/organizacoes': 'Organizações',
  '/master/providers': 'Providers IA',
  '/master/ferramentas': 'Ferramentas',
  '/master/configuracoes': 'Configurações',
  '/master/emails': 'E-mails',
  '/master/audit-log': 'Auditoria',
  '/admin/integracoes': 'Integrações',
  '/admin/planos': 'Planos',
  '/admin/usuarios': 'Usuários',
  '/admin/organizacoes': 'Organizações',
  '/admin/providers': 'Providers IA',
  '/admin/ferramentas': 'Ferramentas',
  '/admin/configuracoes': 'Configurações',
  '/admin/emails': 'E-mails',
  '/admin/audit-log': 'Auditoria',
  '/admin/push-notificacoes': 'Push Notifications',
  '/master/push-notificacoes': 'Push Notifications',
}

const AFFILIATE_PREFIX = '/central-afiliado'
const STOCK_PREFIX = '/app-estoque'

function normalizePath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/'
  return p
}

function isDeferredTitle(pathname: string): boolean {
  const base = normalizePath(pathname)
  if (DEFERRED_EXACT.has(base)) return true
  return DEFERRED_PREFIXES.some((prefix) => base.startsWith(prefix))
}

function resolveBrandLabel(brandName?: string | null, pathname?: string): string {
  if (brandName?.trim()) return brandName.trim()
  if (pathname?.startsWith(AFFILIATE_PREFIX)) {
    const affiliateBrand = getAffiliateBrandMeta().name
    if (affiliateBrand) return affiliateBrand
  }
  return getCachedActiveBrand().name || 'LeadCapture'
}

function formatTitle(page: string, brandName?: string | null, pathname?: string): string {
  const brand = resolveBrandLabel(brandName, pathname).trim()
  const pageLabel = page.trim()
  if (!pageLabel) return brand
  if (pageLabel === brand) return brand
  return `${pageLabel} · ${brand}`
}

function resolveSettingsTitle(search: string, brandName?: string | null): string {
  const tab = new URLSearchParams(search).get('tab')
  if (tab === 'whatsapp') return formatTitle('WhatsApp', brandName)
  return formatTitle('Configurações', brandName)
}

function resolveAffiliateTitle(pathname: string, brandName?: string | null): string | null {
  if (!pathname.startsWith(AFFILIATE_PREFIX)) return null
  if (pathname.includes('/painel')) return formatTitle('Central do Afiliado', brandName, pathname)
  return formatTitle('Acesso Afiliado', brandName, pathname)
}

function resolveStockTitle(pathname: string, brandName?: string | null): string | null {
  if (!pathname.startsWith(STOCK_PREFIX)) return null
  if (pathname.includes('/painel')) return formatTitle('Estoque', brandName)
  return formatTitle('Acesso Estoque', brandName)
}

/**
 * Resolve o título da aba. Retorna null quando a página define o título após carregar dados.
 */
export function resolveDocumentTitle(
  pathname: string,
  search = '',
  brandName?: string | null,
): string | null {
  const base = normalizePath(pathname)

  if (isDeferredTitle(base)) return null

  const affiliate = resolveAffiliateTitle(base, brandName)
  if (affiliate) return affiliate

  const stock = resolveStockTitle(base, brandName)
  if (stock) return stock

  if (base === '/configuracoes') {
    return resolveSettingsTitle(search, brandName)
  }

  if (base === '/admin' && isMasterHost()) {
    return 'Master · LeadCapture'
  }

  if (PUBLIC_TITLES[base]) {
    const page = PUBLIC_TITLES[base]
    if (
      base.startsWith('/master') ||
      base.startsWith('/admin/integracoes') ||
      base.startsWith('/admin/planos') ||
      base.startsWith('/admin/usuarios') ||
      base.startsWith('/admin/organizacoes') ||
      base.startsWith('/admin/providers') ||
      base.startsWith('/admin/ferramentas') ||
      base.startsWith('/admin/configuracoes') ||
      base.startsWith('/admin/emails') ||
      base.startsWith('/admin/audit-log') ||
      base === '/inicio' ||
      base === '/lp'
    ) {
      return page
    }
    if (base === '/login' || base.startsWith('/cadastro')) {
      return `${page} · LeadCapture`
    }
    return formatTitle(page, brandName)
  }

  const adminPage = ADMIN_PAGE_TITLES[base]
  if (adminPage) {
    return formatTitle(adminPage, brandName)
  }

  if (base.startsWith('/afiliado/')) {
    return formatTitle('Link de afiliado', brandName)
  }

  return formatTitle('LeadCapture', brandName)
}

export function applyDocumentTitle(
  pathname: string,
  search = '',
  brandName?: string | null,
): void {
  if (typeof document === 'undefined') return
  const title = resolveDocumentTitle(pathname, search, brandName)
  if (title) document.title = title
}

/** Rotas do painel admin — título sincronizado pelo ConversationalShell (marca + canvas). */
export function isAdminPanelRoute(pathname: string): boolean {
  const base = normalizePath(pathname)
  if (base === '/configuracoes' || ADMIN_PAGE_TITLES[base]) return true
  return false
}