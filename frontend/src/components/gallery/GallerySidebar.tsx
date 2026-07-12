import { useState } from 'react'
import {
  Camera, LayoutGrid, Loader2, Megaphone, Package, Plus, Sparkles, Trash2, Upload,
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
  onCreatePublicidadeFolder,
  onDeleteFolder,
  creatingFolder,
}: {
  folders: GalleryFolder[]
  active: string
  onChange: (slug: string) => void
  collapsed?: boolean
  onCreatePublicidadeFolder?: (label: string) => Promise<void> | void
  onDeleteFolder?: (slug: string) => Promise<void> | void
  creatingFolder?: boolean
}) {
  const [newLabel, setNewLabel] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const library = folders.filter(
    (f) => f.slug === 'all' || f.section === 'library' || (!f.section && f.isSystem && f.slug !== 'publicidade'),
  )
  const publicidade = folders.filter(
    (f) => f.section === 'publicidade' || f.slug === 'publicidade' || (!f.isSystem && f.slug.startsWith('pub-')),
  )

  async function submitCreate() {
    const label = newLabel.trim()
    if (!label || !onCreatePublicidadeFolder) return
    await onCreatePublicidadeFolder(label)
    setNewLabel('')
    setShowCreate(false)
  }

  function renderFolder(f: GalleryFolder) {
    const Icon = ICONS[f.icon] || LayoutGrid
    const selected = active === f.slug
    return (
      <div key={f.slug} className={cn('group flex items-center gap-0.5', collapsed && 'shrink-0')}>
        <button
          type="button"
          onClick={() => onChange(f.slug)}
          className={cn(
            'flex-1 flex items-center gap-2 rounded-xl text-left transition',
            collapsed ? 'px-2.5 py-1.5 text-[11px]' : 'px-2.5 py-2 text-[12.5px]',
            selected
              ? 'bg-gray-900 text-white font-semibold'
              : 'text-gray-600 hover:bg-gray-100 font-medium',
          )}
        >
          <Icon size={collapsed ? 13 : 14} className="shrink-0 opacity-80" />
          <span className="truncate">{f.label}</span>
          <span className={cn('ml-auto tabular-nums text-[10px]', selected ? 'text-white/70' : 'text-gray-400')}>
            {f.count}
          </span>
        </button>
        {!f.isSystem && onDeleteFolder && !collapsed && (
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Excluir pasta"
            onClick={() => {
              if (confirm(`Excluir pasta "${f.label}"? Os arquivos vão para Publicidade · Geral.`)) {
                void onDeleteFolder(f.slug)
              }
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    )
  }

  if (collapsed) {
    return (
      <nav aria-label="Pastas da galeria" className="flex flex-row flex-wrap gap-1">
        {folders.map(renderFolder)}
      </nav>
    )
  }

  return (
    <nav aria-label="Pastas da galeria" className="flex flex-col gap-3 w-full">
      <div className="space-y-0.5">
        <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Biblioteca</p>
        {library.map(renderFolder)}
      </div>

      <div className="space-y-0.5">
        <div className="px-2 flex items-center justify-between gap-1 mb-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600/80">Publicidade</p>
          {onCreatePublicidadeFolder && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 hover:text-rose-700"
            >
              <Plus size={11} /> Pasta
            </button>
          )}
        </div>
        <p className="px-2 text-[10px] text-gray-400 leading-snug mb-1.5">
          Pastas usadas como fonte em campanhas, automações e posts.
        </p>
        {publicidade.map(renderFolder)}
        {showCreate && onCreatePublicidadeFolder && (
          <div className="mt-1.5 px-1 space-y-1.5">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
              placeholder="Nome da pasta (ex: Stories julho)"
              className="w-full h-8 px-2 rounded-lg border border-rose-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-rose-200"
              autoFocus
            />
            <button
              type="button"
              disabled={creatingFolder || !newLabel.trim()}
              onClick={() => void submitCreate()}
              className="w-full h-8 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              {creatingFolder ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Criar pasta
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
