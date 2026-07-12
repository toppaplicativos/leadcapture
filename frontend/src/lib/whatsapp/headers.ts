import { getAffiliateHeaders, isAffiliateWhatsAppContext } from '@/lib/api-affiliate'
import { getHeaders } from '@/lib/admin/helpers'

/**
 * Headers para APIs de instância WhatsApp — org (admin) ou afiliado.
 * Afiliado e programa Parceiros usam o mesmo backend de pairing
 * (`POST /api/instances/:id/pairing-code`); só muda o Bearer + escopo de ownership.
 *
 * @param forceMode - use 'admin' no painel da org para NUNCA herdar token de afiliado
 *   residual no localStorage (mesmo browser).
 */
export function getWhatsAppHeaders(forceMode?: 'admin' | 'affiliate'): Record<string, string> {
  if (forceMode === 'admin') return getHeaders()
  if (forceMode === 'affiliate') return getAffiliateHeaders()
  if (isAffiliateWhatsAppContext()) {
    return getAffiliateHeaders()
  }
  return getHeaders()
}