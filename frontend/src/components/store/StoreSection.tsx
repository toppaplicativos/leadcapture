import type { ReactNode } from 'react'

interface StoreSectionProps {
  title: string
  description?: string | null
  count?: number
  children: ReactNode
}

export function StoreSection({ title, description, count, children }: StoreSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="store-section-title">{title}</h3>
          {description && (
            <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{description}</p>
          )}
        </div>
        {count != null && count > 0 && (
          <span className="text-[11px] font-semibold text-gray-400 tabular-nums shrink-0">
            {count} {count === 1 ? 'produto' : 'produtos'}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}