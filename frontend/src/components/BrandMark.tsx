import { cn } from '@/lib/cn'

interface BrandMarkProps {
  /** Pixel size of the rounded square. Default 28. */
  size?: number
  /** Render with light bg + dark target (for dark surfaces). */
  inverted?: boolean
  className?: string
}

/**
 * LeadCapture brand mark — a target/crosshair inside a rounded square.
 * Conveys the core idea of the product: precision lead capture.
 *
 * Use everywhere we previously had "logo placeholder" divs or product avatars.
 */
export function BrandMark({ size = 28, inverted = false, className }: BrandMarkProps) {
  const bg = inverted ? '#ffffff' : '#0a0a0a'
  const fg = inverted ? '#0a0a0a' : '#ffffff'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill={bg} />
      <circle cx="16" cy="16" r="7.5" stroke={fg} strokeWidth="1.75" fill="none" />
      <circle cx="16" cy="16" r="2.25" fill={fg} />
      <line x1="16" y1="3" x2="16" y2="6" stroke={fg} strokeWidth="1.75" strokeLinecap="round" />
      <line x1="16" y1="26" x2="16" y2="29" stroke={fg} strokeWidth="1.75" strokeLinecap="round" />
      <line x1="3" y1="16" x2="6" y2="16" stroke={fg} strokeWidth="1.75" strokeLinecap="round" />
      <line x1="26" y1="16" x2="29" y2="16" stroke={fg} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/** Static SVG markup for use in inline contexts (favicon data URI, splash screen). */
export const BRAND_MARK_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#0a0a0a"/><circle cx="16" cy="16" r="7.5" stroke="#fff" stroke-width="1.75" fill="none"/><circle cx="16" cy="16" r="2.25" fill="#fff"/><line x1="16" y1="3" x2="16" y2="6" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="16" y1="26" x2="16" y2="29" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="3" y1="16" x2="6" y2="16" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="26" y1="16" x2="29" y2="16" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/></svg>`
