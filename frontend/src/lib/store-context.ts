/* ── Store slug resolution (same logic as the vanilla JS) ── */

const pathParts = window.location.pathname.split('/').filter(Boolean)
const query = new URLSearchParams(window.location.search)

export const isCustomDomain = !!window.__CUSTOM_DOMAIN__

const slugFromPath =
  (pathParts[0] === 'catalogo' || pathParts[0] === 'loja') && pathParts[1]
    ? pathParts[1]
    : ''

export const storeSlug = String(
  query.get('slug') || slugFromPath || window.__STORE_SLUG__ || '',
).trim()

const basePath = isCustomDomain
  ? ''
  : pathParts[0] === 'loja'
    ? 'loja'
    : 'catalogo'

export function storeUrl(subpath?: string): string {
  if (isCustomDomain) return subpath ? '/' + subpath : '/'
  return (
    '/' +
    basePath +
    '/' +
    encodeURIComponent(storeSlug) +
    (subpath ? '/' + subpath : '')
  )
}

export function money(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

export function normalizePhone(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

const STATUS_MAP: Record<string, string> = {
  novo: 'Novo',
  confirmando_pagamento: 'Confirmando pagamento',
  aprovado: 'Aprovado',
  em_preparacao: 'Em preparação',
  saiu_para_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export function labelStatus(status: string): string {
  const key = String(status || '').trim().toLowerCase()
  return STATUS_MAP[key] || key || '-'
}
