import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { Loader2, Upload, Images, Film, ExternalLink } from 'lucide-react'
import { fetchGalleryItems } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { optimizedImage } from '@/lib/image'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'
import { CatalogManagerSheet } from './CatalogManagerSheet'

const GalleryManager = lazy(() =>
  import('@/pages/GaleriaPage').then((m) => ({ default: m.GaleriaPage })),
)

const PREVIEW_LIMIT = 10

export function GalleryInlinePanel() {
  const bridge = useGalleryBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [preview, setPreview] = useState<GalleryItem | null>(null)
  const itemsRef = useRef<GalleryItem[]>([])
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchGalleryItems({ page: 1, limit: 24 })
      itemsRef.current = list.items
      setItems(list.items)
      publishSnapshot?.({ total: list.total, loading: false })
    } catch {
      publishSnapshot?.({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openItem = useCallback((item: GalleryItem) => {
    setPreview(item)
    publishSnapshot?.({ selectedId: item.id, selectedTitle: item.name || '' })
  }, [publishSnapshot])

  const openManager = useCallback(() => {
    if (isDesktop) {
      openCanvas('/galeria')
    } else {
      setManagerOpen(true)
    }
    setModuleExpanded?.(true)
  }, [isDesktop, openCanvas, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      selectItem: (id, title) => {
        publishSnapshot?.({ selectedId: id, selectedTitle: title || '' })
        const item = itemsRef.current.find((i) => i.id === id)
        if (item) setPreview(item)
      },
      openUpload: () => setUploadOpen(true),
      setFolder: () => openManager(),
      openFull: () => openManager(),
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, publishSnapshot, load, openManager])

  if (isDesktop) return null

  if (loading) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const previewItems = items.slice(0, PREVIEW_LIMIT)
  const remaining = Math.max(0, items.length - previewItems.length)

  return (
    <div className="catalog-panel catalog-panel--gallery">
      <div className="catalog-panel__toolbar">
        <button type="button" className="catalog-panel__action" onClick={() => setUploadOpen(true)}>
          <Upload size={14} /> Upload
        </button>
        <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
          <ExternalLink size={12} />
          Gerenciar
        </button>
      </div>

      {items.length === 0 ? (
        <p className="catalog-panel__empty">Galeria vazia. Envie mídia pelo botão Upload.</p>
      ) : (
        <div className="catalog-gallery-compact-strip">
          {previewItems.map((item) => {
            const thumb = item.thumbnailUrl || item.url
            const imgSrc = item.type === 'image' ? optimizedImage(thumb, 160) : undefined
            return (
              <button
                key={item.id}
                type="button"
                className="catalog-gallery-compact-tile"
                onClick={() => openItem(item)}
              >
                {item.type === 'video' ? (
                  <span className="catalog-gallery-compact-tile__video">
                    <Film size={14} />
                  </span>
                ) : imgSrc ? (
                  <img src={imgSrc} alt="" loading="lazy" />
                ) : (
                  <Images size={16} className="text-gray-300" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {remaining > 0 && (
        <button type="button" className="catalog-panel__more" onClick={openManager}>
          +{remaining} mídia{remaining === 1 ? '' : 's'} · Ver galeria completa
        </button>
      )}

      <GalleryUploadZone open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={load} />
      {preview && (
        <GalleryPreview
          item={preview}
          onClose={() => {
            setPreview(null)
            publishSnapshot?.({ selectedId: null, selectedTitle: '' })
          }}
          onUpdated={load}
          onDeleted={load}
        />
      )}

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Galeria"
        subtitle="Pastas, filtros, upload e edição"
      >
        <Suspense fallback={<div className="catalog-panel__loading"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}>
          <GalleryManager embedded />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}