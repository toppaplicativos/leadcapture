import { SelectHTMLAttributes, ReactNode, forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  /** Optional leading icon (decorative) */
  iconLeft?: ReactNode
  /** Full-width by default; set false for compact toolbar selects */
  fullWidth?: boolean
}

/**
 * Canonical product select — matches Input height, radius, focus and ink.
 * Options always render dark text on white (Windows native list fix).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    iconLeft,
    fullWidth = true,
    id,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const selectId = id || generatedId
  const describedBy = error
    ? `${selectId}-error`
    : hint
      ? `${selectId}-hint`
      : undefined

  return (
    <div className={cn(fullWidth && 'w-full')}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[12px] font-semibold text-gray-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-[1]">
            {iconLeft}
          </span>
        )}
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            'ds-select',
            'w-full h-11 rounded-xl border bg-white text-sm font-medium text-gray-900',
            'transition-[border,box-shadow] duration-150 cursor-pointer',
            'focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900',
            'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
            error
              ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500'
              : 'border-border',
            iconLeft ? 'pl-10' : 'pl-3.5',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
      </div>
      {error ? (
        <p id={`${selectId}-error`} className="text-xs text-red-600 mt-1.5 font-medium">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-gray-500 mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
