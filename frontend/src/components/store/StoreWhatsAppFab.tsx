import { createPortal } from 'react-dom'
import { WhatsAppIcon } from '@/components/icons'
import {
  buildWhatsAppUrl,
  resolveButtonVisual,
  type StoreWhatsAppButtonDesign,
} from '@/lib/store-marketing'

export interface StoreWhatsAppFabProps {
  phone: string
  message?: string
  position?: 'bottom-right' | 'bottom-left'
  design: StoreWhatsAppButtonDesign
  brandPrimary?: string
  /** preview = inline no studio; fab = flutuante fixed via portal */
  mode?: 'fab' | 'preview'
  className?: string
}

/**
 * Botão de WhatsApp da loja.
 * Em mode=fab sempre flutuante (portal no body) — nunca no fluxo da página.
 * Em mode=preview renderiza inline com o mesmo visual (configurador do studio).
 */
export function StoreWhatsAppFab({
  phone,
  message,
  position = 'bottom-right',
  design,
  brandPrimary,
  mode = 'fab',
  className = '',
}: StoreWhatsAppFabProps) {
  const href = phone ? buildWhatsAppUrl(phone, message) : undefined
  const visual = resolveButtonVisual(design, {
    brandPrimary,
    variant: mode === 'preview' ? 'preview' : 'fab',
  })
  const isLeft = position === 'bottom-left'

  const node = (
    <a
      href={href || '#'}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      aria-label={visual.label}
      onClick={(e) => {
        if (!href) e.preventDefault()
      }}
      className={`${visual.className} ${mode === 'fab' ? (isLeft ? 'store-wa-btn--left' : 'store-wa-btn--right') : ''} ${className}`.trim()}
      style={visual.style}
      data-wa-fab={mode === 'fab' ? 'true' : undefined}
    >
      {visual.showIcon && (
        <span className="store-wa-btn__icon" aria-hidden>
          <WhatsAppIcon size={visual.iconSize} />
        </span>
      )}
      {visual.showLabel && (
        <span className="store-wa-btn__label">{visual.label}</span>
      )}
    </a>
  )

  if (mode === 'preview' || typeof document === 'undefined') {
    return node
  }

  // Portal garante position:fixed real, fora de transform/overflow da página
  return createPortal(node, document.body)
}
