import { InputHTMLAttributes, ReactNode, forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, iconRight, id, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[12px] font-semibold text-gray-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={cn(
            'ds-control',
            'w-full h-11 rounded-xl border bg-white text-sm text-gray-900',
            'placeholder:text-gray-400 transition-[border,box-shadow] duration-150',
            'focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900',
            'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
            error
              ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500'
              : 'border-border',
            iconLeft ? 'ds-control--icon-left' : 'pl-3.5',
            iconRight ? 'ds-control--icon-right' : 'pr-3.5',
            className,
          )}
          {...rest}
        />
        {iconRight && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {iconRight}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-red-600 mt-1.5 font-medium">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-gray-500 mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
