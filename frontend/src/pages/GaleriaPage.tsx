import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import type { GalleryItem } from '@/lib/gallery/types'
import {
  fetchGalleryFolders,
  fetchGalleryItems,
  fetchGalleryTags,
} from '@/lib/gallery/api'
import { GallerySidebar } from '@/components/gallery/GallerySidebar'
import { GalleryToolbar } from '@/components/gallery/GalleryToolbar'
import { GalleryThumb } from '@/components/gallery/GalleryThumb'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'
import { GalleryEmpty } from '@/components/gallery/GalleryEmpty'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export function GaleriaPage() {
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

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const hasFilters = Boolean(search || typeFilter || activeTags.length)

  return (
    <div className="space-y-5">
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
          />

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
                {items.map((item) => (
                  <GalleryThumb
                    key={item.id}
                    item={item}
                    onOpen={() => setPreview(item)}
                  />
                ))}
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
      />
    </div>
  )
}