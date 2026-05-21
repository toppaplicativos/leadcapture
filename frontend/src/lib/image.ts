/**
 * Helpers to route /uploads images through the /img resizer.
 * The proxy serves WebP (or AVIF if the browser supports it) with on-disk
 * caching. External URLs and data: URIs are returned unchanged.
 */

const ALLOWED_WIDTHS = [80, 160, 240, 320, 480, 640, 800, 1024, 1280, 1600, 1920]

function canOptimize(url: string): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return false
  if (url.startsWith('blob:')) return false
  /* Only same-origin /uploads paths are accepted by the backend proxy */
  return url.startsWith('/uploads/')
}

function snapWidth(width: number): number {
  let best = ALLOWED_WIDTHS[0]
  let diff = Math.abs(best - width)
  for (const w of ALLOWED_WIDTHS) {
    const d = Math.abs(w - width)
    if (d < diff) {
      best = w
      diff = d
    }
  }
  return best
}

export function optimizedImage(url: string | null | undefined, width: number, quality = 78): string {
  const src = String(url || '').trim()
  if (!canOptimize(src)) return src
  const w = snapWidth(width)
  const q = Math.max(40, Math.min(95, Math.round(quality)))
  return `/api/img?src=${encodeURIComponent(src)}&w=${w}&q=${q}`
}

export function optimizedSrcset(
  url: string | null | undefined,
  widths: number[],
  quality = 78,
): string {
  const src = String(url || '').trim()
  if (!canOptimize(src)) return ''
  return widths
    .map((w) => {
      const snapped = snapWidth(w)
      const q = Math.max(40, Math.min(95, Math.round(quality)))
      return `/api/img?src=${encodeURIComponent(src)}&w=${snapped}&q=${q} ${snapped}w`
    })
    .join(', ')
}
