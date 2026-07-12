import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { GalleryItem } from '@/lib/gallery/types'
import {
  createGalleryFolder,
  deleteGalleryFolder,
  deleteGalleryItem,
  fetchGalleryFolders,
  fetchGalleryItems,
  fetchGalleryTags,
  updateGalleryItem,
} from '@/lib/gallery/api'
import { GallerySidebar } from '@/components/gallery/GallerySidebar'
import { GalleryToolbar } from '@/components/gallery/GalleryToolbar'
import { GalleryThumb } from '@/components/gallery/GalleryThumb'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'
import { GalleryEmpty } from '@/components/gallery/GalleryEmpty'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryBulkBar } from '@/components/gallery/GalleryBulkBar'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/components/Toast'

export function GaleriaPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { showToast } = useToast()
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof fetchGalleryFolders>>>([])
  const [items, setItems] = useState<GalleryItem[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeFolder, setActiveFolder] = useState('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | 'image' | 'video'>('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [dense, setDense] = useState(false)
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<GalleryItem | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const galleryBridge = useGalleryBridgeOptional()
  const publishSnapshot = galleryBridge?.publishSnapshot
  const registerHandlers = galleryBridge?.registerHandlers
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const pendingSelectId = useRef<string | null>(null)

  const reload = useCallback(async (append = false, pageOverride?: number) => {
    if (!append) setLoading(true)
    try {
      const currentPage = pageOverride ?? page
      const [f, list, tags] = await Promise.all([
        fetchGalleryFolders(),
        fetchGalleryItems({
          folder: activeFolder,
          search: search || undefined,
          type: typeFilter || undefined,
          tags: activeTags.length ? activeTags : undefined,
          page: currentPage,
          limit: 48,
        }),
        fetchGalleryTags(),
      ])
      setFolders(f)
      setItems((prev) => (append ? [...prev, ...list.items] : list.items))
      setTotal(list.total)
      setAllTags(tags)
    } catch {
      if (!append) {
        setItems([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
    }
  }, [activeFolder, search, typeFilter, activeTags, page])

  useEffect(() => {
    const t = setTimeout(reload, search ? 280 : 0)
    return () => clearTimeout(t)
  }, [reload, search])

  useEffect(() => {
    setPage(1)
  }, [activeFolder, typeFilter, activeTags])

  // Limpa seleção ao trocar filtros/pasta
  useEffect(() => {
    setSelectedIds(new Set())
  }, [activeFolder, typeFilter, activeTags, search])

  const editableItems = useMemo(
    () => items.filter((i) => i.origin !== 'product_gallery'),
    [items],
  )

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelectedIds(new Set(editableItems.map((i) => i.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function bulkDelete() {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Excluir ${ids.length} item(ns) da galeria? Esta ação não pode ser desfeita.`)) return
    setBulkBusy(true)
    let ok = 0
    let fail = 0
    for (const id of ids) {
      try {
        await deleteGalleryItem(id)
        ok += 1
      } catch {
        fail += 1
      }
    }
    setBulkBusy(false)
    setSelectedIds(new Set())
    if (preview && ids.includes(preview.id)) setPreview(null)
    await reload()
    if (fail === 0) showToast(`${ok} item(ns) excluído(s)`, 'success')
    else showToast(`${ok} excluído(s), ${fail} falha(s)`, fail === ids.length ? 'error' : 'success')
  }

  async function bulkEdit(patch: { folder?: string; tagsToAdd?: string[] }) {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkBusy(true)
    let ok = 0
    let fail = 0
    for (const id of ids) {
      const item = items.find((i) => i.id === id)
      if (!item || item.origin === 'product_gallery') {
        fail += 1
        continue
      }
      try {
        const tags = patch.tagsToAdd?.length
          ? Array.from(new Set([...(item.tags || []), ...patch.tagsToAdd]))
          : undefined
        await updateGalleryItem(id, {
          folder: patch.folder,
          tags,
        })
        ok += 1
      } catch {
        fail += 1
      }
    }
    setBulkBusy(false)
    await reload()
    if (fail === 0) showToast(`${ok} item(ns) atualizado(s)`, 'success')
    else showToast(`${ok} atualizado(s), ${fail} falha(s)`, fail === ids.length ? 'error' : 'success')
  }

  useEffect(() => {
    if (!registerHandlers || !isDesktop) return
    return registerHandlers({
      selectItem: (id, title) => {
        const found = items.find((i) => i.id === id)
        if (found) {
          pendingSelectId.current = null
          setPreview(found)
          publishSnapshot?.({ selectedId: id, selectedTitle: title || found.name || '' })
        } else {
          pendingSelectId.current = id
        }
      },
      openUpload: () => setUploadOpen(true),
      setFolder: (folder) => setActiveFolder(folder),
      openFull: () => { if (isDesktop) openCanvas('/galeria') },
      refresh: () => { void reload() },
    })
  }, [registerHandlers, isDesktop, items, publishSnapshot, reload, openCanvas])

  useEffect(() => {
    if (!isDesktop || !pendingSelectId.current) return
    const found = items.find((i) => i.id === pendingSelectId.current)
    if (found) {
      setPreview(found)
      publishSnapshot?.({ selectedId: found.id, selectedTitle: found.name || '' })
      pendingSelectId.current = null
    }
  }, [items, isDesktop, publishSnapshot])

  useEffect(() => {
    if (!publishSnapshot || !isDesktop) return
    publishSnapshot({
      total,
      folder: activeFolder,
      loading,
      selectedId: preview?.id ?? null,
      selectedTitle: preview?.name || '',
    })
  }, [publishSnapshot, isDesktop, total, activeFolder, loading, preview?.id, preview?.name])

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const hasFilters = Boolean(search || typeFilter || activeTags.length)

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {embedded ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500 tabular-nums">{total} mídias</p>
          <Button size="sm" iconLeft={<Upload size={14} />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        </div>
      ) : (
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Galeria</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Todos os criativos, uploads e mídias da sua marca em um só lugar.
            </p>
          </div>
          <Button iconLeft={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        </header>
      )}

      <div className="flex flex-col lg:flex-row gap-5 min-h-[60vh]">
        <aside className="lg:w-[210px] shrink-0">
          <div className="lg:sticky lg:top-4 space-y-3">
            <div className="lg:hidden overflow-x-auto pb-1 -mx-1 px-1">
              <GallerySidebar
                folders={folders}
                active={activeFolder}
                onChange={setActiveFolder}
                collapsed
              />
            </div>
            <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-3">
              <GallerySidebar
                folders={folders}
                active={activeFolder}
                onChange={setActiveFolder}
                creatingFolder={creatingFolder}
                onCreatePublicidadeFolder={async (label) => {
                  setCreatingFolder(true)
                  try {
                    const f = await createGalleryFolder(label, 'publicidade')
                    showToast(`Pasta "${f.label}" criada em Publicidade`, 'success')
                    setActiveFolder(f.slug)
                    await reload()
                  } catch (e: unknown) {
                    showToast(e instanceof Error ? e.message : 'Erro ao criar pasta', 'error')
                  } finally {
                    setCreatingFolder(false)
                  }
                }}
                onDeleteFolder={async (slug) => {
                  try {
                    await deleteGalleryFolder(slug)
                    if (activeFolder === slug) setActiveFolder('publicidade')
                    showToast('Pasta removida', 'success')
                    await reload()
                  } catch (e: unknown) {
                    showToast(e instanceof Error ? e.message : 'Erro ao remover pasta', 'error')
                  }
                }}
              />
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-4">
          <GalleryToolbar
            search={search}
            onSearchChange={setSearch}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            dense={dense}
            onDenseChange={setDense}
            total={total}
            selectMode={selectMode}
            onSelectModeChange={(v) => {
              setSelectMode(v)
              if (!v) setSelectedIds(new Set())
            }}
          />

          {selectMode && (
            <GalleryBulkBar
              count={selectedIds.size}
              totalVisible={editableItems.length}
              busy={bulkBusy}
              onSelectAll={selectAllVisible}
              onClear={clearSelection}
              onDelete={() => { void bulkDelete() }}
              onApplyEdit={(patch) => { void bulkEdit(patch) }}
              onExitSelectMode={exitSelectMode}
              folderOptions={folders
                .filter((f) => f.slug !== 'all')
                .map((f) => ({
                  value: f.slug,
                  label: f.section === 'publicidade' || f.slug.startsWith('pub-')
                    ? `Publicidade · ${f.label}`
                    : f.label,
                }))}
            />
          )}

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] font-semibold text-gray-400 mr-1">Tags:</span>
              {allTags.slice(0, 12).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'h-7 px-2.5 rounded-full text-[11px] font-semibold transition',
                    activeTags.includes(tag)
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div
              className={cn(
                'grid gap-2',
                dense
                  ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
              )}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl skeleton" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <GalleryEmpty
              folder={activeFolder}
              hasFilters={hasFilters}
              onUpload={() => setUploadOpen(true)}
            />
          ) : (
            <>
              <div
                className={cn(
                  'grid gap-2',
                  dense
                    ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
                )}
              >
                {items.map((item) => {
                  const canSelect = selectMode && item.origin !== 'product_gallery'
                  return (
                    <GalleryThumb
                      key={item.id}
                      item={item}
                      selectable={canSelect}
                      selected={selectedIds.has(item.id)}
                      onSelect={() => toggleSelect(item.id)}
                      onOpen={() => {
                        if (selectMode && canSelect) toggleSelect(item.id)
                        else setPreview(item)
                      }}
                    />
                  )
                })}
              </div>

              {total > items.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next = page + 1
                      setPage(next)
                      reload(true, next)
                    }}
                  >
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {preview && (
        <GalleryPreview
          item={preview}
          onClose={() => setPreview(null)}
          onUpdated={reload}
          onDeleted={reload}
        />
      )}

      <GalleryUploadZone
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={reload}
        folder={activeFolder}
      />
    </div>
  )
}