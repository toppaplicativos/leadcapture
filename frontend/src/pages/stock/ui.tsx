import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Package, Plus } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'

export function KpiCard({
  label,
  value,
  color,
  onClick,
}: {
  label: string
  value: string
  color?: string
  onClick?: () => void
}) {
  const cls = `bg-white border border-border-light rounded-2xl p-4 text-left ${
    onClick ? 'hover:border-gray-300 active:scale-[0.99] transition cursor-pointer' : ''
  }`
  const body = (
    <>
      <p className="text-[11px] font-semibold text-gray-500 tracking-tight mb-1.5">{label}</p>
      <p className={`text-[22px] font-bold tracking-tight tabular-nums leading-none ${color || 'text-gray-900'}`}>
        {value}
      </p>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
        className="w-11 h-11 grid place-items-center rounded-xl bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-95 transition"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <span className="text-[13px] text-gray-600 tabular-nums px-2">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Próxima página"
        className="w-11 h-11 grid place-items-center rounded-xl bg-white border border-border-light text-gray-600 disabled:opacity-30 hover:bg-gray-50 active:scale-95 transition"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

export function EmptyState({
  text,
  hint,
  action,
}: {
  text: string
  hint?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-border-light grid place-items-center mb-3">
        <Package size={22} className="text-gray-500" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-semibold text-gray-900 tracking-tight">{text}</p>
      {hint && <p className="text-[12px] text-gray-500 mt-1.5 max-w-[18rem] leading-relaxed">{hint}</p>}
      {action && (
        <Button className="mt-4" size="sm" onClick={action.onClick} iconLeft={<Plus size={14} />}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="Carregando">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-16 rounded-2xl skeleton" />
      ))}
    </div>
  )
}

export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="sm:hidden pt-2 pb-1 flex justify-center sticky top-0 bg-white z-10">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}

export function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="mt-3">
      <Input label={label} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function FieldNumber({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  min?: number
  step?: string
}) {
  return (
    <div className="mt-3">
      <Input
        label={label}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        step={step}
      />
    </div>
  )
}

export function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="mt-3">
      <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  )
}
