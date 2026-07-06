import {
  Camera, LayoutGrid, Megaphone, Package, Sparkles, Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GalleryFolder } from '@/lib/gallery/types'
import { cn } from '@/lib/cn'

const ICONS: Record<string, LucideIcon> = {
  'layout-grid': LayoutGrid,
  sparkles: Sparkles,
  upload: Upload,
  megaphone: Megaphone,
  camera: Camera,
  package: Package,
}

export function GallerySidebar({
  folders,
  active,
  onChange,
  collapsed,
}: {
  folders: GalleryFolder[]
  active: string
  onChange: (slug: string) => void
  collapsed?: boolean
}) {
  return (
    <nav
      aria-label="Pastas da galeria"
      className={cn(
        'shrink-0 flex flex-col gap-0.5',
        collapsed ? 'flex-row flex-wrap gap-1' : 'w-[200px]',
      )}
    >
      {folders.map((f) => {
        const Icon = ICONS[f.icon] || LayoutGrid
        const selected = active === f.slug
        return (
          <button
            key={f.slug}
            type="button"
            onClick={() => onChange(f.slug)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl text-left transition duration-150',
              collapsed ? 'h-9 px-3 text-[12px]' : 'h-10 px-3 text-[13px]',
              selected
                ? 'bg-gray-900 text-white font-semibold'
                : 'text-gray-600 hover:bg-white hover:text-gray-900 font-medium',
            )}
          >
            <Icon size={15} strokeWidth={selected ? 2.25 : 1.75} className="shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{f.label}</span>}
            <span
              className={cn(
                'tabular-nums text-[11px] font-semibold rounded-full min-w-[1.5rem] text-center px-1.5 py-0.5',
                selected ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500',
              )}
            >
              {f.count}
            </span>
          </button>
        )
      })}
    </nav>
  )
}