import type { PublicStoreMarketing, StoreMarketingPage } from '@/lib/store-marketing'
import { resolvePublicWhatsApp } from '@/lib/store-marketing'
import { useStoreContactPhone } from '@/lib/hooks/useStoreContactPhone'
import { StoreWhatsAppFab } from './StoreWhatsAppFab'

export interface StoreMarketingLayerProps {
  marketing?: PublicStoreMarketing | null
  /** WhatsApp da loja (studio). Em link afiliado, o número do afiliado tem prioridade. */
  whatsappPhone?: string | null
  page?: StoreMarketingPage
  brandPrimary?: string
}

export function StoreMarketingLayer({
  marketing,
  whatsappPhone,
  page = 'home',
  brandPrimary,
}: StoreMarketingLayerProps) {
  const contactPhone = useStoreContactPhone(whatsappPhone)
  const resolved = resolvePublicWhatsApp(marketing, contactPhone, page)
  if (!resolved?.showFab) return null

  return (
    <StoreWhatsAppFab
      mode="fab"
      phone={resolved.phone}
      message={resolved.prefilledMessage}
      position={resolved.fabPosition}
      design={resolved.button}
      brandPrimary={brandPrimary}
    />
  )
}
