import { useState } from 'react'
import {
  Copy, Download, Film, ImageIcon, Tag, Trash2, X,
} from 'lucide-react'
import type { GalleryItem } from '@/lib/gallery/types'
import { deleteGalleryItem, updateGalleryItem } from '@/lib/gallery/api'
import { Button } from '@/components/ui/Button'
import { optimizedImage } from '@/lib/image'

const FOLDER_LABEL: Record<string, string> = {
  ia: 'Criativos IA',
  uploads: 'Uploads',
  campanhas: 'Campanhas',
  posts: 'Posts',
  produtos: 'Produtos',
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function GalleryPreview({
  item,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: GalleryItem
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState(
    item.tags.filter((t) => !t.startsWith('product:') && !t.startsWith('productname:') && !t.startsWith('section:')),
  )
  const [copied, setCopied] = useState(false)
  const canEdit = item.origin !== 'product_gallery'
  const created = item.createdAt
    ? new Date(item.createdAt).toLocaleString('pt-BR')
    : ''

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(item.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  async function handleAddTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) return
    const next = [...tags, t]
    setTags(next)
    setTagInput('')
    if (canEdit) {
      await updateGalleryItem(item.id, { tags: next })
      onUpdated()
    }
  }

  async function handleRemoveTag(tag: string) {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    if (canEdit) {
      await updateGalleryItem(item.id, { tags: next })
      onUpdated()
    }
  }

  async function handleDelete() {
    if (!canEdit || !confirm('Excluir este item da galeria?')) return
    setDeleting(true)
    try {
      await deleteGalleryItem(item.id)
      onDeleted()
      onClose()
    } catch {
      setDeleting(false)
    }
  }

  const previewUrl = item.type === 'image' ? optimizedImage(item.url, 1024) : item.url

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col lg:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 bg-gray-100 grid place-items-center min-h-[280px] lg:min-h-0 p-4">
          {item.type === 'video' ? (
            <video src={item.url} controls className="max-w-full max-h-[70vh] rounded-lg" />
          ) : previewUrl ? (
            <img src={previewUrl} alt={item.name} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
          ) : (
            <ImageIcon size={48} className="text-gray-300" />
          )}
        </div>

        <aside className="lg:w-[300px] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-100">
          <header className="px-5 py-4 flex items-start justify-between gap-2 border-b border-gray-100">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {FOLDER_LABEL[item.folder] || item.folder}
              </p>
              <p className="text-[14px] font-bold text-gray-900 mt-0.5 truncate">{item.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 shrink-0 grid place-items-center rounded-full hover:bg-gray-100"
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[12px]">
            <div className="flex gap-3 text-gray-600">
              <span className="inline-flex items-center gap-1">
                {item.type === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                {item.type === 'video' ? 'Vídeo' : 'Imagem'}
              </span>
              <span>{formatSize(item.fileSize)}</span>
              {created && <span>{created}</span>}
            </div>

            {item.metadata.productName && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">Produto</p>
                <p className="text-gray-700">{item.metadata.productName}</p>
              </div>
            )}

            {item.metadata.prompt && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">Prompt</p>
                <p className="text-gray-600 leading-relaxed line-clamp-5">{item.metadata.prompt}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-gray-400 mb-2 inline-flex items-center gap-1">
                <Tag size={11} /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-700"
                  >
                    {t}
                    {canEdit && (
                      <button type="button" onClick={() => handleRemoveTag(t)} className="text-gray-400 hover:text-gray-700">
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEdit && (
                <div className="flex gap-2 mt-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="Nova tag"
                    className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                  />
                  <Button size="sm" variant="secondary" onClick={handleAddTag}>
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>

          <footer className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Copy size={14} />}
              onClick={handleCopyUrl}
              className="flex-1 min-w-[120px]"
            >
              {copied ? 'Copiado!' : 'Copiar URL'}
            </Button>
            <a href={item.url} download target="_blank" rel="noreferrer" className="flex-1 min-w-[120px]">
              <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} fullWidth>
                Baixar
              </Button>
            </a>
            {canEdit && (
              <Button
                variant="danger"
                size="sm"
                iconLeft={<Trash2 size={14} />}
                loading={deleting}
                onClick={handleDelete}
              >
                Excluir
              </Button>
            )}
          </footer>
        </aside>
      </div>
    </div>
  )
}