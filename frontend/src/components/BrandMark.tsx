import { cn } from '@/lib/cn'

/** Canonical product name — always this casing, never "Lead Capture" / "LC". */
export const PRODUCT_NAME = 'LeadCapture'

/** Obsidian ink used by the official monochrome mark. */
export const BRAND_INK = '#0a0a0a'

interface BrandMarkProps {
  /** Pixel size of the rounded square. Default 28. */
  size?: number
  /**
   * Theme surface the mark sits on:
   * - `light` (default): obsidian square + white target — for light UI
   * - `dark`: white square + obsidian target — for dark UI (inverted)
   * `inverted` is an alias of `dark` (kept for existing call sites).
   */
  theme?: 'light' | 'dark'
  /** @deprecated Use theme="dark". Alias of theme="dark". */
  inverted?: boolean
  className?: string
  /** Accessible label; defaults to PRODUCT_NAME when decorative=false. */
  title?: string
  /** When true (default), mark is aria-hidden. Set false if it is the sole brand label. */
  decorative?: boolean
}

/**
 * Official LeadCapture brand mark — monochrome target/crosshair in a rounded square.
 * Assets: /brand-mark.svg (light theme) · /brand-mark-dark.svg (dark theme).
 * Never use the legacy colorful logo.png for product identity.
 */
export function BrandMark({
  size = 28,
  theme,
  inverted = false,
  className,
  title = PRODUCT_NAME,
  decorative = true,
}: BrandMarkProps) {
  const onDark = theme === 'dark' || inverted
  const bg = onDark ? '#ffffff' : BRAND_INK
  const fg = onDark ? BRAND_INK : '#ffffff'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
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

/** Static SVG markup — light theme (obsidian square). For favicon / splash data URIs. */
export const BRAND_MARK_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LeadCapture"><rect width="32" height="32" rx="8" fill="#0a0a0a"/><circle cx="16" cy="16" r="7.5" stroke="#fff" stroke-width="1.75" fill="none"/><circle cx="16" cy="16" r="2.25" fill="#fff"/><line x1="16" y1="3" x2="16" y2="6" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="16" y1="26" x2="16" y2="29" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="3" y1="16" x2="6" y2="16" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/><line x1="26" y1="16" x2="29" y2="16" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/></svg>`

/** Static SVG markup — dark theme (white square). */
export const BRAND_MARK_DARK_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LeadCapture"><rect width="32" height="32" rx="8" fill="#ffffff"/><circle cx="16" cy="16" r="7.5" stroke="#0a0a0a" stroke-width="1.75" fill="none"/><circle cx="16" cy="16" r="2.25" fill="#0a0a0a"/><line x1="16" y1="3" x2="16" y2="6" stroke="#0a0a0a" stroke-width="1.75" stroke-linecap="round"/><line x1="16" y1="26" x2="16" y2="29" stroke="#0a0a0a" stroke-width="1.75" stroke-linecap="round"/><line x1="3" y1="16" x2="6" y2="16" stroke="#0a0a0a" stroke-width="1.75" stroke-linecap="round"/><line x1="26" y1="16" x2="29" y2="16" stroke="#0a0a0a" stroke-width="1.75" stroke-linecap="round"/></svg>`
