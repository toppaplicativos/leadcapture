import type { PublicStoreMarketing, StoreMarketingPage } from '@/lib/store-marketing'
import { resolvePublicWhatsApp } from '@/lib/store-marketing'
import { StoreWhatsAppFab } from './StoreWhatsAppFab'

export interface StoreMarketingLayerProps {
  marketing?: PublicStoreMarketing | null
  whatsappPhone?: string | null
  page?: StoreMarketingPage
}

export function StoreMarketingLayer({
  marketing,
  whatsappPhone,
  page = 'home',
}: StoreMarketingLayerProps) {
  const resolved = resolvePublicWhatsApp(marketing, whatsappPhone, page)
  if (!resolved?.showFab) return null

  return (
    <StoreWhatsAppFab
      phone={resolved.phone}
      message={resolved.prefilledMessage}
      position={resolved.fabPosition}
    />
  )
}