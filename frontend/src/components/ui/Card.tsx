import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  flat?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, flat = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-white rounded-2xl border border-border',
        !flat && 'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        interactive &&
          'transition-[transform,box-shadow] duration-150 hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] active:scale-[0.99]',
        className,
      )}
      {...rest}
    />
  )
})

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-3', className)} {...rest} />
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-3 border-t border-border-light', className)}
      {...rest}
    />
  )
}

export function CardTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-[15px] font-semibold text-gray-900 tracking-tight',
        className,
      )}
      {...rest}
    />
  )
}

export function CardSubtitle({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-gray-500 mt-0.5', className)} {...rest} />
}
