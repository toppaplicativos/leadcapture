import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { GalleryItem, GalleryItemType } from '@/lib/gallery/types'
import { fetchGalleryFolders, fetchGalleryItems, markGalleryItemUsed } from '@/lib/gallery/api'
import { GallerySidebar } from './GallerySidebar'
import { GalleryThumb } from './GalleryThumb'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export interface MediaPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (item: GalleryItem) => void
  accept?: GalleryItemType[]
  folder?: string
  title?: string
  useContext?: 'campaign' | 'post' | 'product'
  contextId?: string
}

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  accept = ['image', 'video'],
  folder: initialFolder,
  title = 'Escolher da galeria',
  useContext,
  contextId,
}: MediaPickerModalProps) {
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof fetchGalleryFolders>>>([])
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState(initialFolder || 'all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, list] = await Promise.all([
        fetchGalleryFolders(),
        fetchGalleryItems({
          folder: activeFolder,
          search: search || undefined,
          type: accept.length === 1 ? accept[0] : undefined,
          limit: 60,
        }),
      ])
      setFolders(f)
      setItems(list.items.filter((i) => accept.includes(i.type)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeFolder, search, accept])

  useEffect(() => {
    if (!open) return
    setActiveFolder(initialFolder || 'all')
    setSelected(null)
    setSearch('')
  }, [open, initialFolder])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [open, load, search])

  async function handleConfirm() {
    if (!selected) return
    setConfirming(true)
    try {
      if (useContext) {
        await markGalleryItemUsed(selected.id, useContext, contextId)
      }
      onSelect(selected)
      onClose()
    } catch {
      onSelect(selected)
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/55 grid place-items-center p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 bg-white border-b border-gray-100">
          <h3 className="text-[16px] font-bold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 grid place-items-center rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="lg:w-[210px] shrink-0 p-4 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto">
            <GallerySidebar
              folders={folders}
              active={activeFolder}
              onChange={setActiveFolder}
              collapsed={false}
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-10"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="grid place-items-center h-40">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-12">Nenhuma mídia encontrada.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {items.map((item) => (
                    <GalleryThumb
                      key={item.id}
                      item={item}
                      selected={selected?.id === item.id}
                      selectable
                      onOpen={() => setSelected(item)}
                      onSelect={() => setSelected(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 bg-white border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!selected}
            loading={confirming}
            onClick={handleConfirm}
          >
            Usar selecionado
          </Button>
        </footer>
      </div>
    </div>
  )
}