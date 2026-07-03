export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-xl skeleton" />
      ))}
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
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl grid place-items-center ${bg || 'bg-gray-50'}`}>
            <Icon size={16} className={color || 'text-gray-400'} />
          </div>
        )}
      </div>
      <p className={`text-[26px] font-extrabold tracking-tight leading-none ${accent || color || 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

export function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl grid place-items-center mb-3">
        <Icon size={24} className="text-muted-light" />
      </div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  )
}