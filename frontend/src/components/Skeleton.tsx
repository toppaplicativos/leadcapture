export function ProductSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-square rounded-2xl skeleton" />
      <div className="pt-2.5 px-0.5 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="px-4 pt-5 pb-4">
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-2xl skeleton shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      </div>
    </div>
  )
}

export function InfoStripSkeleton() {
  return (
    <div className="flex gap-2 px-4 py-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-7 w-32 rounded-full shrink-0" />
      ))}
    </div>
  )
}
