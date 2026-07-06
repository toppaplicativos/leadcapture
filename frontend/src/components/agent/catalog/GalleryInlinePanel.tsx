import { useEffect, useState, useCallback } from 'react'
import { Loader2, Upload, Images } from 'lucide-react'
import { fetchGalleryItems } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'

export function GalleryInlinePanel() {
  const bridge = useGalleryBridgeOptional()
  const { openCanvas } = useAgentShell()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchGalleryItems({ page: 1, limit: 12 })
      setItems(list.items)
      bridge?.publishSnapshot({ total: list.total, loading: false })
    } catch {
      bridge?.publishSnapshot({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [bridge])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bridge) return
    return bridge.registerHandlers({
      selectItem: (id, title) => {
        bridge.publishSnapshot({ selectedId: id, selectedTitle: title || '' })
        const item = items.find((i) => i.id === id)
        if (item) setPreview(item)
      },
      openUpload: () => setUploadOpen(true),
      setFolder: () => openCanvas('/galeria'),
      openFull: () => openCanvas('/galeria'),
      refresh: () => load(),
    })
  }, [bridge, items, load, openCanvas])

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