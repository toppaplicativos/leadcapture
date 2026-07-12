import { getAffiliateHeaders, isAffiliateWhatsAppContext } from '@/lib/api-affiliate'
import { getHeaders } from '@/lib/admin/helpers'

/**
 * Headers para APIs de instância WhatsApp — org (admin) ou afiliado.
 * Afiliado e programa Parceiros usam o mesmo backend de pairing
 * (`POST /api/instances/:id/pairing-code`); só muda o Bearer + escopo de ownership.
 */
export function getWhatsAppHeaders(): Record<string, string> {
  if (isAffiliateWhatsAppContext()) {
    return getAffiliateHeaders()
  }
  return getHeaders()
}