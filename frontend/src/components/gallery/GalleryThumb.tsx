import { Check, Eye, Film, ImageIcon } from 'lucide-react'
import type { GalleryItem } from '@/lib/gallery/types'
import { optimizedImage } from '@/lib/image'
import { cn } from '@/lib/cn'

const FOLDER_BADGE: Record<string, string> = {
  ia: 'IA',
  uploads: 'Upload',
  campanhas: 'Campanha',
  posts: 'Post',
  produtos: 'Produto',
}

export function GalleryThumb({
  item,
  selected,
  onOpen,
  onSelect,
  selectable,
}: {
  item: GalleryItem
  selected?: boolean
  onOpen: () => void
  onSelect?: () => void
  selectable?: boolean
}) {
  const thumb = item.thumbnailUrl || item.url
  const imgSrc = item.type === 'image' ? optimizedImage(thumb, 320) : undefined

  function handleClick(e: React.MouseEvent) {
    if (selectable && onSelect) {
      e.preventDefault()
      onSelect()
      return
    }
    onOpen()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selectable ? !!selected : undefined}
      className={cn(
        'group relative rounded-2xl overflow-hidden bg-gray-100 aspect-square text-left transition duration-150',
        selected
          ? 'ring-2 ring-gray-900 ring-offset-2'
          : 'hover:ring-2 hover:ring-gray-900',
      )}
    >
      {item.type === 'video' ? (
        <div className="w-full h-full bg-gray-900 grid place-items-center">
          <video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold">
            <Film size={10} /> Vídeo
          </span>
        </div>
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full grid place-items-center">
          <ImageIcon size={24} className="text-gray-300" />
        </div>
      )}

      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-white/90 text-[9px] font-bold text-gray-700 ring-1 ring-gray-200/80">
        {FOLDER_BADGE[item.folder] || item.folder}
      </span>

      {selectable && (
        <span
          className={cn(
            'absolute top-1.5 right-1.5 w-6 h-6 rounded-md grid place-items-center ring-1 transition',
            selected
              ? 'bg-gray-900 text-white ring-gray-900'
              : 'bg-white/90 text-transparent ring-gray-200 group-hover:text-gray-300',
          )}
          aria-hidden
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
      )}

      {!selectable && (
        <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/25 transition-colors motion-reduce:group-hover:bg-black/0">
          <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity motion-reduce:opacity-0" />
        </span>
      )}
    </button>
  )
}