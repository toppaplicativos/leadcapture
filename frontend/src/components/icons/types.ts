import type { ComponentType, SVGProps } from 'react'

/** Compatible with lucide-react icons (size, className, strokeWidth ignored on fill icons). */
export type IconComponent = ComponentType<{
  size?: number | string
  className?: string
  strokeWidth?: number
}>

export type BrandIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string
  strokeWidth?: number
}

export const BRAND_COLORS = {
  whatsapp: '#25D366',
  instagram: '#E4405F',
  facebook: '#1877F2',
} as const