import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderPlus, Loader2, Search, X } from 'lucide-react'
import type { GalleryItem, GalleryItemType } from '@/lib/gallery/types'
import {
  createGalleryFolder,
  fetchGalleryFolders,
  fetchGalleryItems,
  markGalleryItemUsed,
} from '@/lib/gallery/api'
import { GallerySidebar } from './GallerySidebar'
import { GalleryThumb } from './GalleryThumb'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

export interface MediaPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (item: GalleryItem) => void
  onSelectMultiple?: (items: GalleryItem[]) => void
  multiple?: boolean
  maxItems?: number
  accept?: GalleryItemType[]
  folder?: string
  /** Prioriza pastas de Publicidade (fontes de campanha/automação/post) */
  preferSection?: 'publicidade' | 'library'
  title?: string
  useContext?: 'campaign' | 'post' | 'product'
  contextId?: string
  /** Permite criar pasta em Publicidade dentro do picker */
  allowCreateFolder?: boolean
}

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  onSelectMultiple,
  multiple = false,
  maxItems,
  accept = ['image', 'video'],
  folder: initialFolder,
  preferSection = 'publicidade',
  title = 'Escolher da galeria',
  useContext,
  contextId,
  allowCreateFolder = true,
}: MediaPickerModalProps) {
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof fetchGalleryFolders>>>([])
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState(initialFolder || 'publicidade')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | GalleryItemType>('')
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const [selectedMany, setSelectedMany] = useState<GalleryItem[]>([])
  const [confirming, setConfirming] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const orderedFolders = useMemo(() => {
    if (!folders.length) return folders
    if (preferSection !== 'publicidade') return folders
    const pub = folders.filter(
      (f) => f.section === 'publicidade' || f.slug === 'publicidade' || f.slug.startsWith('pub-'),
    )
    const rest = folders.filter((f) => !pub.includes(f))
    const all = rest.filter((f) => f.slug === 'all')
    const lib = rest.filter((f) => f.slug !== 'all')
    return [...all, ...pub, ...lib]
  }, [folders, preferSection])

  const effectiveAccept = useMemo(() => {
    if (typeFilter && accept.includes(typeFilter)) return [typeFilter] as GalleryItemType[]
    return accept
  }, [accept, typeFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, list] = await Promise.all([
        fetchGalleryFolders(),
        fetchGalleryItems({
          folder: activeFolder,
          search: search || undefined,
          type: effectiveAccept.length === 1 ? effectiveAccept[0] : undefined,
          limit: 80,
        }),
      ])
      setFolders(f)
      setItems(list.items.filter((i) => accept.includes(i.type)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeFolder, search, accept, effectiveAccept])

  useEffect(() => {
    if (!open) return
    const defaultFolder =
      initialFolder || (preferSection === 'publicidade' ? 'publicidade' : 'all')
    setActiveFolder(defaultFolder)
    setSelected(null)
    setSelectedMany([])
    setSearch('')
    setTypeFilter('')
    setCreateError(null)
  }, [open, initialFolder, preferSection])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [open, load, search])

  function toggleMulti(item: GalleryItem) {
    setSelectedMany((prev) => {
      const exists = prev.some((i) => i.id === item.id)
      if (exists) return prev.filter((i) => i.id !== item.id)
      const cap = maxItems && maxItems > 0 ? maxItems : 10
      if (prev.length >= cap) return prev
      return [...prev, item]
    })
  }

  async function handleCreateFolder(label: string) {
    setCreatingFolder(true)
    setCreateError(null)
    try {
      const f = await createGalleryFolder(label, 'publicidade')
      setActiveFolder(f.slug)
      await load()
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Falha ao criar pasta')
    } finally {
      setCreatingFolder(false)
    }
  }

  async function handleConfirm() {
    const picks = multiple ? selectedMany : selected ? [selected] : []
    if (!picks.length) return
    setConfirming(true)
    try {
      if (useContext) {
        for (const item of picks) {
          await markGalleryItemUsed(item.id, useContext, contextId)
        }
      }
      if (multiple && onSelectMultiple) {
        onSelectMultiple(picks)
      } else if (picks[0]) {
        onSelect(picks[0])
      }
      onClose()
    } catch {
      if (multiple && onSelectMultiple) {
        onSelectMultiple(picks)
      } else if (picks[0]) {
        onSelect(picks[0])
      }
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  if (!open) return null

  const showTypeChips = accept.includes('image') && accept.includes('video')

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
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold text-gray-900">{title}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Busque em <strong className="text-rose-600">Publicidade</strong> (pastas de campanha) ou na biblioteca.
            </p>
          </div>
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
          <div className="lg:w-[230px] shrink-0 p-4 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto">
            <GallerySidebar
              folders={orderedFolders}
              active={activeFolder}
              onChange={setActiveFolder}
              collapsed={false}
              creatingFolder={creatingFolder}
              onCreatePublicidadeFolder={
                allowCreateFolder && preferSection === 'publicidade'
                  ? handleCreateFolder
                  : undefined
              }
            />
            {createError && (
              <p className="mt-2 px-1 text-[11px] text-red-600">{createError}</p>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-hidden">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, tag ou prompt…"
                  className="pl-10"
                  autoFocus
                />
              </div>
              {showTypeChips && (
                <div className="flex items-center gap-1 shrink-0">
                  {(
                    [
                      { v: '', l: 'Todos' },
                      { v: 'image' as const, l: 'Imagens' },
                      { v: 'video' as const, l: 'Vídeos' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.l}
                      type="button"
                      onClick={() => setTypeFilter(opt.v)}
                      className={cn(
                        'px-2.5 h-9 rounded-lg text-[11px] font-semibold border transition',
                        typeFilter === opt.v
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {preferSection === 'publicidade' && activeFolder === 'publicidade' && !search && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2">
                <FolderPlus size={14} className="text-rose-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-rose-800 leading-snug">
                  <strong>Publicidade · Geral</strong> e pastas custom (ex: Black Friday, Stories) são a fonte recomendada
                  para campanhas, automações e posts. Crie pastas na barra à esquerda.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="grid place-items-center h-40">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-gray-600 font-medium">Nenhuma mídia nesta pasta.</p>
                  <p className="text-[12px] text-gray-400 mt-1">
                    Envie arquivos em <strong>Galeria → Publicidade</strong>, mude a pasta ao lado ou busque em “Todos”.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {items.map((item) => (
                    <GalleryThumb
                      key={item.id}
                      item={item}
                      selected={
                        multiple
                          ? selectedMany.some((i) => i.id === item.id)
                          : selected?.id === item.id
                      }
                      selectable
                      onOpen={() => (multiple ? toggleMulti(item) : setSelected(item))}
                      onSelect={() => (multiple ? toggleMulti(item) : setSelected(item))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-4 bg-white border-t border-gray-100">
          {multiple ? (
            <span className="text-xs text-gray-500">
              {selectedMany.length} selecionada{selectedMany.length === 1 ? '' : 's'}
              {maxItems ? ` (max ${maxItems})` : ''}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 truncate max-w-[50%]">
              {selected ? selected.name : 'Selecione um arquivo'}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={multiple ? selectedMany.length === 0 : !selected}
              loading={confirming}
              onClick={handleConfirm}
            >
              {multiple ? 'Adicionar selecionadas' : 'Usar selecionado'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
