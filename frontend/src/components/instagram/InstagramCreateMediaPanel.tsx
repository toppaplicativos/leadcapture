import { useCallback, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Film,
  GripVertical,
  Images,
  Loader2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import { uploadGalleryFile, uploadGalleryFiles } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import {
  detectFileKind,
  IMAGE_ONLY_ACCEPT,
  IMAGE_UPLOAD_ACCEPT,
  VIDEO_ONLY_ACCEPT,
} from '@/lib/media/detectFileKind'
import {
  probeVideoFile,
  validateVideoFile,
  validateVideoMetadata,
  type PostType as FormPostType,
} from '@/lib/instagram/createForm'

export type PostMediaItem = {
  id: string
  url: string
  type: 'image' | 'video'
  name?: string
}

type PostType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS' | 'VIDEO' | 'STORIES'

type Props = {
  postType: PostType
  items: PostMediaItem[]
  onChange: (items: PostMediaItem[]) => void
}

function galleryToPostItem(item: GalleryItem): PostMediaItem {
  return {
    id: item.id,
    url: item.url,
    type: item.type,
    name: item.name,
  }
}

function acceptForPostType(postType: PostType): 'image' | 'video' | 'both' {
  if (postType === 'REELS' || postType === 'VIDEO') return 'video'
  if (postType === 'STORIES') return 'both'
  return 'image'
}

function fileAcceptAttr(accept: 'image' | 'video' | 'both'): string {
  if (accept === 'video') return VIDEO_ONLY_ACCEPT
  if (accept === 'both') return IMAGE_UPLOAD_ACCEPT
  return IMAGE_ONLY_ACCEPT
}

function galleryAcceptList(accept: 'image' | 'video' | 'both'): Array<'image' | 'video'> {
  if (accept === 'video') return ['video']
  if (accept === 'both') return ['image', 'video']
  return ['image']
}

function maxItemsForPostType(postType: PostType): number {
  if (postType === 'CAROUSEL_ALBUM') return 10
  return 1
}

function minItemsForPostType(postType: PostType): number {
  return postType === 'CAROUSEL_ALBUM' ? 2 : 1
}

export function InstagramCreateMediaPanel({ postType, items, onChange }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const accept = acceptForPostType(postType)
  const maxItems = maxItemsForPostType(postType)
  const minItems = minItemsForPostType(postType)
  const isCarousel = postType === 'CAROUSEL_ALBUM'
  const canAddMore = items.length < maxItems

  const mergeItems = useCallback(
    (incoming: PostMediaItem[]) => {
      const existing = new Set(items.map((i) => i.id))
      const next = [...items]
      for (const item of incoming) {
        if (existing.has(item.id)) continue
        if (next.length >= maxItems) break
        next.push(item)
        existing.add(item.id)
      }
      onChange(next)
    },
    [items, maxItems, onChange],
  )

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (!list.length) return

      const wrongType = list.find((f) => {
        const kind = detectFileKind(f)
        if (accept === 'video') return kind !== 'video'
        if (accept === 'both') return kind !== 'image' && kind !== 'video'
        return kind !== 'image'
      })
      if (wrongType) {
        setError(
          accept === 'video'
            ? 'Selecione um video (MP4, MOV).'
            : accept === 'both'
              ? 'Selecione imagem (JPG, PNG, WEBP) ou video (MP4, MOV).'
              : 'Selecione imagens (JPG, PNG, WEBP ou HEIC).',
        )
        return
      }

      const videos = list.filter((f) => detectFileKind(f) === 'video')
      if (videos.length) {
        // Stories allow one media only; reject mixed multi-file uploads for safety
        if (accept === 'both' && list.length > 1) {
          setError('Story aceita apenas 1 midia por vez (imagem ou video).')
          return
        }
        const videoErr = videos.map((f) => validateVideoFile(f, postType as FormPostType)).find(Boolean)
        if (videoErr) {
          setError(videoErr)
          return
        }
        for (const f of videos) {
          try {
            const meta = await probeVideoFile(f)
            const metaErr = validateVideoMetadata(meta, postType as FormPostType)
            if (metaErr) {
              setError(metaErr)
              return
            }
          } catch {
            setError('Nao foi possivel validar o video.')
            return
          }
        }
      }

      const slots = maxItems - items.length
      if (slots <= 0) {
        setError(isCarousel ? 'Carrossel aceita no maximo 10 midias.' : 'Apenas 1 midia por post.')
        return
      }

      const batch = list.slice(0, slots)
      setUploading(true)
      setError('')
      try {
        const uploaded =
          batch.length === 1
            ? [await uploadGalleryFile(batch[0], ['instagram', 'post'], 'publicidade')]
            : await uploadGalleryFiles(batch, 'publicidade')
        mergeItems(uploaded.map(galleryToPostItem))
      } catch (err: any) {
        setError(err?.message || 'Falha no upload.')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [accept, items.length, isCarousel, maxItems, mergeItems, postType],
  )

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  function handleGallerySelect(selected: GalleryItem[]) {
    mergeItems(selected.map(galleryToPostItem))
    setGalleryOpen(false)
  }

  const hint =
    postType === 'CAROUSEL_ALBUM'
      ? `${items.length}/10 — mínimo de 2 imagens; a ordem importa`
      : postType === 'REELS' || postType === 'VIDEO'
        ? '1 vídeo (MP4, MOV)'
        : postType === 'STORIES'
          ? '1 imagem ou vídeo (MP4/MOV, até 60s)'
          : '1 imagem (JPG, PNG, WEBP)'

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mídia</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{hint}</span>
          {canAddMore && (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 hover:text-gray-900"
            >
              <Images size={12} /> Galeria
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={fileAcceptAttr(accept)}
        multiple={isCarousel}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {items.length > 0 ? (
        <div className="space-y-3">
          {isCarousel ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((item, index) => (
                <div key={item.id} className="relative group rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                  <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] font-bold tabular-nums">
                    {index + 1}
                  </div>
                  {item.type === 'video' ? (
                    <video src={item.url} className="w-full aspect-square object-cover" muted playsInline />
                  ) : (
                    <img src={item.url} alt={item.name || ''} className="w-full aspect-square object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                    <GripVertical size={12} className="text-white/70 shrink-0" />
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        className="p-1 rounded bg-white/90 text-gray-700 disabled:opacity-40"
                        aria-label="Mover para esquerda"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        className="p-1 rounded bg-white/90 text-gray-700 disabled:opacity-40"
                        aria-label="Mover para direita"
                      >
                        <ChevronRight size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(index)}
                        className="p-1 rounded bg-white/90 text-red-600"
                        aria-label="Remover"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-gray-50">
              {items[0].type === 'video' ? (
                <video src={items[0].url} className="w-full max-h-64 object-contain" controls playsInline />
              ) : (
                <img src={items[0].url} alt={items[0].name || ''} className="w-full max-h-64 object-contain" />
              )}
              <button
                type="button"
                onClick={() => onChange([])}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
                aria-label="Remover midia"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2 rounded-lg border border-dashed border-gray-200 text-xs font-medium text-gray-600 hover:border-purple-300 hover:text-purple-600 disabled:opacity-50"
            >
              {uploading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Enviando...
                </span>
              ) : isCarousel ? (
                'Adicionar mais imagens'
              ) : (
                'Trocar midia'
              )}
            </button>
          )}

          {isCarousel && items.length < minItems && (
            <p className="text-[11px] text-amber-600">Adicione pelo menos {minItems} imagens para publicar o carrossel.</p>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
          }}
          className={`border-2 border-dashed rounded-xl py-8 sm:py-10 text-center cursor-pointer transition ${
            dragOver ? 'border-purple-400 bg-purple-50/50' : 'border-gray-200 hover:border-purple-300'
          }`}
        >
          {uploading ? (
            <Loader2 size={24} className="mx-auto text-purple-400 mb-2 animate-spin" />
          ) : accept === 'video' || accept === 'both' ? (
            <Video size={24} className="mx-auto text-gray-300 mb-2" />
          ) : (
            <Upload size={24} className="mx-auto text-gray-300 mb-2" />
          )}
          <p className="text-sm text-gray-500">
            {uploading ? 'Enviando para a galeria...' : 'Clique ou arraste arquivos aqui'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {isCarousel
              ? 'JPG, PNG, WEBP — ate 10 imagens'
              : accept === 'video'
                ? 'MP4, MOV'
                : accept === 'both'
                  ? 'JPG, PNG, WEBP ou MP4, MOV'
                  : 'JPG, PNG, WEBP'}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setGalleryOpen(true)
            }}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700"
          >
            <Images size={12} /> Ou escolher da galeria
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      <MediaPickerModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        accept={galleryAcceptList(accept)}
        preferSection="publicidade"
        title={
          isCarousel
            ? 'Imagens da Publicidade · carrossel'
            : accept === 'video'
              ? 'Vídeo da Publicidade · post'
              : accept === 'both'
                ? 'Mídia da Publicidade · story (imagem ou vídeo)'
                : 'Mídia da Publicidade · post'
        }
        useContext="post"
        multiple={isCarousel}
        maxItems={maxItems - items.length}
        onSelect={(item) => handleGallerySelect([item])}
        onSelectMultiple={handleGallerySelect}
      />
    </div>
  )
}

export function postMediaPreview(items: PostMediaItem[], postType: PostType) {
  if (!items.length) return null
  if (postType === 'CAROUSEL_ALBUM' && items.length > 1) {
    return (
      <div className="relative w-full h-full">
        <img src={items[0].url} alt="" className="w-full h-full object-cover" />
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] font-semibold flex items-center gap-1">
          <Film size={10} /> 1/{items.length}
        </div>
      </div>
    )
  }
  const item = items[0]
  if (item.type === 'video') {
    return (
      <div className="relative w-full h-full">
        <video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        <span className="ig-post-thumb__badge">
          <Film size={12} /> Video
        </span>
      </div>
    )
  }
  return <img src={item.url} alt="" className="w-full h-full object-cover" />
}
