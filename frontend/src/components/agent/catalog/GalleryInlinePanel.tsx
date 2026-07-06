import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Upload, Images, Film, ChevronRight } from 'lucide-react'
import { fetchGalleryItems } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { dt } from '@/lib/admin/helpers'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'

const FOLDER_LABEL: Record<string, string> = {
  ia: 'IA',
  uploads: 'Upload',
  campanhas: 'Campanha',
  posts: 'Post',
  produtos: 'Produto',
}

function GalleryChatCard({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const isVideo = item.type === 'video'
  const thumb = item.thumbnailUrl || item.url
  const [imgError, setImgError] = useState(false)

  return (
    <button
      type="button"
      className={`catalog-gallery-card ${isVideo ? 'is-video' : 'is-image'}`}
      onClick={onOpen}
    >
      <div className="catalog-gallery-card__bar" />
      <div className="catalog-gallery-card__body">
        <div className="catalog-gallery-card__header">
          <div className="catalog-gallery-card__thumb">
            {thumb && !imgError && !isVideo ? (
              <img src={thumb} alt="" onError={() => setImgError(true)} />
            ) : isVideo ? (
              <Film size={20} className="text-gray-400" strokeWidth={1.5} />
            ) : (
              <Images size={20} className="text-gray-300" strokeWidth={1.5} />
            )}
          </div>
          <div className="catalog-gallery-card__headline">
            <span className="catalog-gallery-card__title">{item.name || 'Mídia'}</span>
            <div className="catalog-gallery-card__meta">
              <span className={`catalog-gallery-card__type ${isVideo ? 'is-video' : 'is-image'}`}>
                {isVideo ? 'Vídeo' : 'Imagem'}
              </span>
              <span className="catalog-gallery-card__folder">
                {FOLDER_LABEL[item.folder] || item.folder}
              </span>
              <span className="catalog-gallery-card__date">{dt(item.createdAt)}</span>
            </div>
          </div>
        </div>

        <span className="catalog-gallery-card__cta">
          Abrir mídia
          <ChevronRight size={14} strokeWidth={2} />
        </span>
      </div>
    </button>
  )
}

export function GalleryInlinePanel() {
  const bridge = useGalleryBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const isDesktop = useIsDesktop()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
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
    if (isDesktop || loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [isDesktop, load])

  const openItem = useCallback((item: GalleryItem) => {
    setPreview(item)
    publishSnapshot?.({ selectedId: item.id, selectedTitle: item.name || '' })
  }, [publishSnapshot])

  useEffect(() => {
    if (!registerHandlers || !setModuleExpanded || isDesktop) return
    return registerHandlers({
      selectItem: (id, title) => {
        publishSnapshot?.({ selectedId: id, selectedTitle: title || '' })
        const item = itemsRef.current.find((i) => i.id === id)
        if (item) setPreview(item)
      },
      openUpload: () => setUploadOpen(true),
      setFolder: () => {
        setModuleExpanded(true)
        setCardsOpen(true)
      },
      openFull: () => {
        setModuleExpanded(true)
        setCardsOpen(true)
      },
      refresh: () => { void load() },
    })
  }, [registerHandlers, setModuleExpanded, isDesktop, publishSnapshot, load])

  if (isDesktop) return null

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
          onClick={() => {
            setModuleExpanded?.(true)
            setCardsOpen(true)
          }}
        >
          Ver todos
        </button>
      </div>

      {!cardsOpen ? (
        <p className="catalog-panel__empty">
          Toque em <strong>Ver todos</strong> para listar mídias em cards.
        </p>
      ) : items.length === 0 ? (
        <p className="catalog-panel__empty">Galeria vazia. Envie mídia pelo botão Upload.</p>
      ) : (
        <div className="catalog-gallery-grid">
          {items.map((item) => (
            <GalleryChatCard key={item.id} item={item} onOpen={() => openItem(item)} />
          ))}
        </div>
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
    </div>
  )
}