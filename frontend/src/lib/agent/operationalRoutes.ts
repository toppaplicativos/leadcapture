/**
 * URL-driven operational routes: canvas must follow the browser URL and
 * must NOT be closed/overwritten by chat session hydration or skill effects.
 */

const OPERATIONAL_EXACT = new Set([
  '/dashboard',
  '/admin', // special: agent home when alone — treated separately
  '/atendente',
  '/agente',
  '/habilidades',
  '/skills',
  '/busca',
  '/criativos',
  '/galeria',
  '/video-studio',
  '/automacoes',
  '/campanhas',
  '/campanha',
  '/produtos',
  '/loja',
  '/design',
  '/leads',
  '/clientes',
  '/pedidos',
  '/mensagens',
  '/instagram',
  '/facebook',
  '/afiliados',
  '/configuracoes',
  '/whatsapp',
  '/notificacoes',
  '/dominio',
  '/frete',
  '/entregas',
  '/mob',
  '/estoque',
  '/cupons',
  '/avaliacoes',
  '/pagamentos',
  '/provedores-ia',
  '/emails',
  '/tirar-pedido',
  '/fluxos',
])

export function pathOnly(path: string): string {
  return (path || '').split('?')[0] || ''
}

/** Home do assistente (chat sem página fixa). */
export function isAgentHomePath(pathname: string): boolean {
  const p = pathOnly(pathname)
  return p === '/assistente' || p === ''
}

/**
 * Rotas com página embutida no canvas.
 * Exclui /admin e /assistente (home do chat).
 */
export function isOperationalCanvasPath(pathname: string): boolean {
  const p = pathOnly(pathname)
  if (isAgentHomePath(p)) return false
  if (OPERATIONAL_EXACT.has(p)) return true
  if (p.startsWith('/configuracoes')) return true
  return false
}
