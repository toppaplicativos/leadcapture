import { getAffiliateHeaders, getAffiliateToken, isAffiliateAppRoute } from '@/lib/api-affiliate'
import { getHeaders } from '@/lib/admin/helpers'

/** Headers para APIs de instância WhatsApp — admin ou afiliado. */
export function getWhatsAppHeaders(): Record<string, string> {
  if (isAffiliateAppRoute() || getAffiliateToken()) {
    return getAffiliateHeaders()
  }
  return getHeaders()
}