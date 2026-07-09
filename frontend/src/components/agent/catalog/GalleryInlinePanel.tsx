import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Upload, Images, Film, ExternalLink, Search,
  LayoutGrid, List, Rows3, ChevronRight,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { fetchGalleryItems } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { useGalleryBridgeOptional } from '@/lib/agent/GalleryBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { dt } from '@/lib/admin/helpers'
import { optimizedImage } from '@/lib/image'
import { GalleryUploadZone } from '@/components/gallery/GalleryUploadZone'
import { GalleryPreview } from '@/components/gallery/GalleryPreview'
import { CatalogManagerSheet } from './CatalogManagerSheet'

const GalleryManager = lazy(() =>
  import('@/pages/GaleriaPage').then((m) => ({ default: m.GaleriaPage })),
)

const FOLDER_LABEL: Record<string, string> = {
  ia: 'IA',
  uploads: 'Upload',
  campanhas: 'Campanha',
  posts: 'Post',
  produtos: 'Produto',
}

type ChatViewMode = 'compact' | 'list' | 'cards'

const PREVIEW_LIMIT: Record<ChatViewMode, number> = {
  compact: 10,
  list: 5,
  cards: 3,
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

function GalleryCompactTile({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const thumb = item.thumbnailUrl || item.url
  const imgSrc = item.type === 'image' ? optimizedImage(thumb, 160) : undefined

  return (
    <button type="button" className="catalog-gallery-compact-tile" onClick={onOpen}>
      {item.type === 'video' ? (
        <span className="catalog-gallery-compact-tile__video">
          <Film size={14} />
        </span>
      ) : imgSrc ? (
        <img src={imgSrc} alt="" loading="lazy" />
      ) : (
        <Images size={16} className="text-gray-300" />
      )}
      <span className={`catalog-gallery-compact-tile__dot ${item.type === 'video' ? 'is-video' : 'is-image'}`} />
    </button>
  )
}

function GalleryListRow({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const isVideo = item.type === 'video'
  const thumb = item.thumbnailUrl || item.url
  const imgSrc = !isVideo && thumb ? optimizedImage(thumb, 80) : undefined
  const [imgError, setImgError] = useState(false)

  return (
    <button type="button" className="catalog-gallery-list-row" onClick={onOpen}>
      <div className="catalog-gallery-list-row__thumb">
        {isVideo ? (
          <Film size={14} className="text-sky-400" strokeWidth={1.5} />
        ) : imgSrc && !imgError ? (
          <img src={imgSrc} alt="" onError={() => setImgError(true)} />
        ) : (
          <Images size={14} className="text-gray-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="catalog-gallery-list-row__main">
        <span className="catalog-gallery-list-row__name">{item.name || 'Mídia'}</span>
        <span className="catalog-gallery-list-row__meta">
          {FOLDER_LABEL[item.folder] || item.folder} · {isVideo ? 'Vídeo' : 'Imagem'}
        </span>
      </div>
      <ChevronRight size={14} className="text-gray-300 shrink-0" />
    </button>
  )
}

export function GalleryInlinePanel() {
  const bridge = useGalleryBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [chatView, setChatView] = useState<ChatViewMode>('compact')
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

  const filtered = items.filter((item) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (item.name || '').toLowerCase().includes(q)
      || (FOLDER_LABEL[item.folder] || item.folder || '').toLowerCase().includes(q)
  })

  const limit = PREVIEW_LIMIT[chatView]
  const previewItems = filtered.slice(0, limit)
  const remaining = Math.max(0, filtered.length - previewItems.length)

  if (loading && items.length === 0) {
    return (
      <PageSplash variant="panel" label="Galeria" />
    )
  }

  return (
    <div className="catalog-panel catalog-panel--gallery">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar mídia…"
          />
        </div>
        <button type="button" className="catalog-panel__action" onClick={() => setUploadOpen(true)}>
          <Upload size={14} /> Upload
        </button>
      </div>

      <div className="catalog-panel__viewbar">
        <div className="catalog-panel__view-toggle" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={chatView === 'compact' ? 'is-active' : ''}
            onClick={() => setChatView('compact')}
            aria-pressed={chatView === 'compact'}
            title="Miniatura"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            className={chatView === 'list' ? 'is-active' : ''}
            onClick={() => setChatView('list')}
            aria-pressed={chatView === 'list'}
            title="Lista"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className={chatView === 'cards' ? 'is-active' : ''}
            onClick={() => setChatView('cards')}
            aria-pressed={chatView === 'cards'}
            title="Cards"
          >
            <Rows3 size={13} />
          </button>
        </div>
        <button type="button" className="catalog-panel__open-manager" onClick={openManager}>
          <ExternalLink size={12} />
          Gerenciar
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="catalog-panel__empty">
          {search.trim()
            ? 'Nenhuma mídia encontrada para essa busca.'
            : 'Galeria vazia. Envie mídia pelo botão Upload.'}
        </p>
      ) : chatView === 'compact' ? (
        <div className="catalog-gallery-compact-strip">
          {previewItems.map((item) => (
            <GalleryCompactTile key={item.id} item={item} onOpen={() => openItem(item)} />
          ))}
        </div>
      ) : chatView === 'list' ? (
        <div className="catalog-gallery-list">
          {previewItems.map((item) => (
            <GalleryListRow key={item.id} item={item} onOpen={() => openItem(item)} />
          ))}
        </div>
      ) : (
        <div className="catalog-gallery-grid catalog-gallery-grid--chat">
          {previewItems.map((item) => (
            <GalleryChatCard key={item.id} item={item} onOpen={() => openItem(item)} />
          ))}
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
        subtitle="Pastas, filtros, grade/lista e upload"
      >
        <Suspense fallback={<PageSplash variant="panel" label="Galeria" />}>
          <GalleryManager embedded />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}