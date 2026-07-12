/**
 * Identificador legível do pedido para listas e chat.
 * Preferência: order_number da API → id curto → em dash.
 */
export function orderRef(order: {
  order_number?: string | number | null
  numero?: string | number | null
  public_code?: string | number | null
  id?: string | null
} | null | undefined): string {
  const explicit = String(
    order?.order_number || order?.numero || order?.public_code || '',
  ).trim()
  if (explicit) return explicit
  const id = String(order?.id || '').replace(/[^a-z0-9]/gi, '')
  if (id.length >= 4) return id.slice(0, 8).toUpperCase()
  return '—'
}

export function orderRefLabel(order: Parameters<typeof orderRef>[0]): string {
  const ref = orderRef(order)
  return ref === '—' ? 'Pedido' : `#${ref}`
}
