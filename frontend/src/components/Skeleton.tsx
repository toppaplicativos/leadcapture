export function ProductSkeleton() {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-border/50">
      <div className="aspect-square skeleton" />
      <div className="p-3.5 space-y-2.5">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-5 w-2/5 rounded" />
        <div className="skeleton h-9 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="skeleton h-48 w-full rounded-none" />
  )
}

export function InfoStripSkeleton() {
  return (
    <div className="flex gap-4 px-4 py-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 space-y-1.5">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-2/3 rounded" />
        </div>
      ))}
    </div>
  )
}
