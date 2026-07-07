import { getHeaders } from '@/lib/admin/helpers'

export type WhatsAppInstanceRow = {
  id: string
  name: string
  phone?: string | null
  status?: string
}

function isDisconnected(status?: string): boolean {
  return status !== 'connected' && status !== 'authenticated'
}

/** Mesma lógica do modal: prefere o ID pedido, senão a primeira sessão offline. */
export function pickWhatsAppInstance(
  list: WhatsAppInstanceRow[],
  preferredId?: string | null,
): WhatsAppInstanceRow | null {
  if (!list.length) return null
  if (preferredId) {
    const preferred = list.find((i) => i.id === preferredId)
    if (preferred) return preferred
  }
  const offline = list.filter((i) => isDisconnected(i.status))
  return offline[0] || list[0] || null
}

export async function fetchWhatsAppInstances(): Promise<WhatsAppInstanceRow[]> {
  const r = await fetch('/api/instances', { headers: getHeaders() })
  if (!r.ok) return []
  const d = await r.json()
  return Array.isArray(d.instances) ? d.instances : []
}

export async function resolveWhatsAppInstance(
  preferredId?: string | null,
): Promise<WhatsAppInstanceRow | null> {
  const list = await fetchWhatsAppInstances()
  return pickWhatsAppInstance(list, preferredId)
}