import { TextareaHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

/** Canonical product textarea — same vocabulary as Input / Select. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, rows = 3, ...rest },
  ref,
) {
  const generatedId = useId()
  const areaId = id || generatedId
  const describedBy = error
    ? `${areaId}-error`
    : hint
      ? `${areaId}-hint`
      : undefined

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={areaId}
          className="block text-[12px] font-semibold text-gray-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        className={cn(
          'ds-textarea',
          'w-full rounded-xl border bg-white text-sm text-gray-900',
          'placeholder:text-gray-400 transition-[border,box-shadow] duration-150',
          'focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900',
          'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500'
            : 'border-border',
          'px-3.5 py-2.5',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${areaId}-error`} className="text-xs text-red-600 mt-1.5 font-medium">
          {error}
        </p>
      ) : hint ? (
        <p id={`${areaId}-hint`} className="text-xs text-gray-500 mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
