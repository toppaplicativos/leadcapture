import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Upload, Images } from 'lucide-react'
import { fetchGalleryItems } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'

export function GalleryInlinePanel() {
  const bridge = useGalleryBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const { openCanvas } = useAgentShell()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<GalleryItem | null>(null)
  const itemsRef = useRef<GalleryItem[]>([])
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchGalleryItems({ page: 1, limit: 12 })
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

  useEffect(() => {
    if (!registerHandlers || !publishSnapshot) return
    return registerHandlers({
      selectItem: (id, title) => {
        publishSnapshot({ selectedId: id, selectedTitle: title || '' })
        const item = itemsRef.current.find((i) => i.id === id)
        if (item) setPreview(item)
      },
      openUpload: () => setUploadOpen(true),
      setFolder: () => openCanvas('/galeria'),
      openFull: () => openCanvas('/galeria'),
      refresh: () => { void load() },
    })
  }, [registerHandlers, publishSnapshot, load, openCanvas])

  if (loading) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--gallery">
      <div className="catalog-panel__toolbar">
        <button
          type="button"
          className="catalog-panel__action"
          onClick={() => setUploadOpen(true)}
        >
          <Upload size={14} /> Upload
        </button>
        <button
          type="button"
          className="catalog-panel__action catalog-panel__action--ghost"
          onClick={() => openCanvas('/galeria')}
        >
          <Images size={14} /> Galeria completa
        </button>
      </div>
      {items.length === 0 ? (
        <p className="catalog-panel__empty">Galeria vazia. Envie mídia aqui ou no gerenciador.</p>
      ) : (
        <div className="catalog-panel__grid catalog-panel__grid--gallery">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="catalog-panel__card catalog-panel__card--square"
              onClick={() => bridge?.dispatch({ type: 'select_item', id: item.id, title: item.name })}
            >
              <div className="catalog-panel__thumb">
                {item.thumbnailUrl || item.url ? (
                  <img src={item.thumbnailUrl || item.url} alt="" />
                ) : (
                  <Images size={18} className="text-gray-300" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      <GalleryUploadZone open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={load} />
      {preview && (
        <GalleryPreview
          item={preview}
          onClose={() => setPreview(null)}
          onUpdated={load}
          onDeleted={load}
        />
      )}
    </div>
  )
}