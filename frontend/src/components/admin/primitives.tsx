import type { LucideIcon } from 'lucide-react'

/** Shimmer base — use classes `skeleton` / `skeleton-*` do CSS. */
export function Skeleton({
  rows = 4,
  variant = 'rows',
}: {
  rows?: number
  /** rows = barras (legado); list = linhas com avatar; cards = grade KPI; settings = marcas */
  variant?: 'rows' | 'list' | 'cards' | 'settings' | 'panel'
}) {
  if (variant === 'list') {
    return (
      <div className="skeleton-list" role="status" aria-label="Carregando">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-list__row">
            <div className="skeleton skeleton-list__avatar" />
            <div className="skeleton-list__body">
              <div className="skeleton skeleton-list__line skeleton-list__line--title" />
              <div className="skeleton skeleton-list__line skeleton-list__line--sub" />
            </div>
            <div className="skeleton skeleton-list__chip" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'cards') {
    return (
      <div className="skeleton-cards" role="status" aria-label="Carregando">
        {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
          <div key={i} className="skeleton-cards__card">
            <div className="skeleton skeleton-cards__label" />
            <div className="skeleton skeleton-cards__value" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'settings') {
    return (
      <div className="skeleton-settings" role="status" aria-label="Carregando configurações">
        <div className="skeleton-settings__head">
          <div className="skeleton skeleton-settings__title" />
          <div className="skeleton skeleton-settings__btn" />
        </div>
        <div className="skeleton-settings__tabs">
          <div className="skeleton skeleton-settings__tab" />
          <div className="skeleton skeleton-settings__tab" />
        </div>
        <div className="skeleton-settings__list">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="skeleton-settings__brand">
              <div className="skeleton skeleton-settings__logo" />
              <div className="skeleton-settings__meta">
                <div className="skeleton skeleton-settings__name" />
                <div className="skeleton skeleton-settings__slug" />
              </div>
              <div className="skeleton skeleton-settings__action" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'panel') {
    return (
      <div className="skeleton-panel" role="status" aria-label="Carregando">
        <div className="skeleton-panel__toolbar">
          <div className="skeleton skeleton-panel__meta" />
          <div className="skeleton skeleton-panel__action" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-list__row">
            <div className="skeleton skeleton-list__avatar skeleton-list__avatar--sm" />
            <div className="skeleton-list__body">
              <div className="skeleton skeleton-list__line skeleton-list__line--title" />
              <div className="skeleton skeleton-list__line skeleton-list__line--sub" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // legado: barras — ainda estruturado, sem “listras soltas”
  return (
    <div className="skeleton-rows" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-rows__item">
          <div className="skeleton skeleton-rows__bar" style={{ width: `${72 - (i % 3) * 12}%` }} />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  text,
  hint,
}: {
  icon?: LucideIcon
  text: string
  /** Optional supporting line — keeps empty states instructional, not blank */
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-gray-100 border border-border-light grid place-items-center mb-3">
          <Icon size={22} className="text-gray-500" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-sm text-gray-700 font-semibold tracking-tight">{text}</p>
      {hint && (
        <p className="text-xs text-gray-500 mt-1.5 max-w-[18rem] leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  accent,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ size?: number; className?: string }>
  color?: string
  bg?: string
  accent?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow] duration-150">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-gray-500 tracking-tight">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl grid place-items-center ${bg || 'bg-gray-100'}`}>
            <Icon size={16} className={color || 'text-gray-500'} />
          </div>
        )}
      </div>
      <p className={`text-[26px] font-bold tracking-tight leading-none tabular-nums ${accent || color || 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}
