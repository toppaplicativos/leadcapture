import type { ViewKey } from './types'

/**
 * Maps notification / push deep links into stock app views.
 * Templates today use admin-style paths like /produtos, /pedidos, /movimentacoes.
 */
export function resolveStockDeepLink(path?: string | null): {
  view: ViewKey
  productId?: string
  orderId?: string
} | null {
  if (!path) return null

  let pathname = path
  let search = ''
  try {
    if (path.startsWith('http')) {
      const u = new URL(path)
      pathname = u.pathname
      search = u.search
    } else if (path.includes('?')) {
      const i = path.indexOf('?')
      pathname = path.slice(0, i)
      search = path.slice(i)
    }
  } catch {
    pathname = path.split('?')[0] || path
  }

  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const viewParam = (params.get('view') || params.get('tab') || '').toLowerCase()

  const viewFromQuery = mapViewToken(viewParam)
  if (viewFromQuery) {
    return {
      view: viewFromQuery,
      productId: params.get('product_id') || params.get('productId') || undefined,
      orderId: params.get('order_id') || params.get('orderId') || undefined,
    }
  }

  const clean = pathname.replace(/\/+$/, '') || '/'
  const parts = clean.split('/').filter(Boolean)
  const lower = parts.map((p) => p.toLowerCase())

  // /app-estoque/:slug/painel?view=... already handled above via search
  // /produtos, /produtos/:id
  if (lower.includes('produtos') || lower.includes('products')) {
    const idx = lower.findIndex((p) => p === 'produtos' || p === 'products')
    const maybeId = parts[idx + 1]
    return {
      view: 'products',
      productId: maybeId && !['novo', 'new'].includes(maybeId.toLowerCase()) ? maybeId : undefined,
    }
  }

  if (lower.includes('alertas') || lower.includes('alerts')) {
    return { view: 'alerts' }
  }

  if (
    lower.includes('pedidos') ||
    lower.includes('orders') ||
    lower.includes('expedicao') ||
    lower.includes('expedição') ||
    lower.includes('expedition')
  ) {
    const idx = lower.findIndex((p) =>
      ['pedidos', 'orders', 'expedicao', 'expedição', 'expedition'].includes(p),
    )
    const maybeId = parts[idx + 1]
    return {
      view: 'expedition',
      orderId: maybeId || undefined,
    }
  }

  if (lower.includes('movimentacoes') || lower.includes('movimentações') || lower.includes('movements')) {
    return { view: 'movements' }
  }

  if (lower.includes('clientes') || lower.includes('clients')) {
    return { view: 'clients' }
  }

  if (lower.includes('relatorios') || lower.includes('relatórios') || lower.includes('reports')) {
    return { view: 'reports' }
  }

  if (lower.includes('inventario') || lower.includes('inventário') || lower.includes('estoque')) {
    // generic inventory alert → alerts triage
    return { view: 'alerts' }
  }

  if (lower.includes('painel') || lower.includes('overview') || lower.includes('inicio') || lower.includes('início')) {
    return { view: 'overview' }
  }

  return null
}

function mapViewToken(token: string): ViewKey | null {
  if (!token) return null
  const map: Record<string, ViewKey> = {
    overview: 'overview',
    inicio: 'overview',
    home: 'overview',
    products: 'products',
    produtos: 'products',
    movements: 'movements',
    movimentacoes: 'movements',
    movimentações: 'movements',
    expedition: 'expedition',
    expedicao: 'expedition',
    expedição: 'expedition',
    pedidos: 'expedition',
    alerts: 'alerts',
    alertas: 'alerts',
    clients: 'clients',
    clientes: 'clients',
    reports: 'reports',
    relatorios: 'reports',
    relatórios: 'reports',
  }
  return map[token] || null
}
