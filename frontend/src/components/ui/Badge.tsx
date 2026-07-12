import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  brand: 'bg-brand-soft text-brand',
}

/** Compact status chip — product register (no decorative glass). */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'text-[11px] font-semibold whitespace-nowrap tracking-tight',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
})
