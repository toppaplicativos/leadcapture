import { useEffect, useState } from 'react'
import { msUntil } from '@/lib/store-conversion'

function format(ms: number) {
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function StorePromoCountdown({
  endsAt,
  label = 'Oferta por tempo limitado',
}: {
  endsAt: string | null | undefined
  label?: string
}) {
  const [left, setLeft] = useState<number | null>(() => msUntil(endsAt))

  useEffect(() => {
    const tick = () => setLeft(msUntil(endsAt))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [endsAt])

  if (left == null || left <= 0) return null
  const clock = format(left)
  if (!clock) return null

  return (
    <div className="store-countdown" role="timer" aria-live="polite">
      <span className="store-countdown__label">{label}</span>
      <span className="store-countdown__clock tabular-nums">{clock}</span>
    </div>
  )
}
