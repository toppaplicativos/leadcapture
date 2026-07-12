import { useCallback, useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { uploadGalleryFiles } from '@/lib/gallery/api'
import { cn } from '@/lib/cn'
import { detectFileKind, IMAGE_UPLOAD_ACCEPT } from '@/lib/media/detectFileKind'

export function GalleryUploadZone({
  open,
  onClose,
  onUploaded,
  folder,
}: {
  open: boolean
  onClose: () => void
  onUploaded: () => void
  /** Pasta destino (ex: publicidade, pub-stories-julho). "all" → uploads */
  folder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const targetFolder =
    folder && folder !== 'all' ? folder : 'uploads'

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].filter((f) => detectFileKind(f) !== null)
      if (!list.length) {
        setError('Selecione imagens ou videos (JPG, PNG, WEBP, HEIC, MP4, MOV).')
        return
      }
      setUploading(true)
      setError(null)
      setProgress(0)
      try {
        const step = 100 / list.length
        for (let i = 0; i < list.length; i++) {
          await uploadGalleryFiles([list[i]], targetFolder)
          setProgress(Math.round((i + 1) * step))
        }
        onUploaded()
        onClose()
      } catch (err: any) {
        setError(err?.message || 'Falha no upload')
      } finally {
        setUploading(false)
      }
    },
    [onClose, onUploaded, targetFolder],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Upload de mídia"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">Enviar mídia</h3>
            {targetFolder && targetFolder !== 'uploads' && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Destino: <span className="font-semibold text-gray-700">{targetFolder}</span>
              </p>
            )}
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

        <div
          className={cn(
            'm-5 rounded-2xl border-2 border-dashed p-10 text-center transition',
            dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300',
            uploading && 'pointer-events-none opacity-70',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
          }}
        >
          {uploading ? (
            <div className="space-y-3">
              <Loader2 size={28} className="mx-auto animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Enviando... {progress}%</p>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-xs mx-auto">
                <div className="h-full bg-gray-900 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <Upload size={28} className="mx-auto text-gray-300 mb-3" />
              <p className="text-[14px] font-semibold text-gray-800">Arraste arquivos aqui</p>
              <p className="text-[12px] text-gray-500 mt-1">Imagens e vídeos até 100 MB</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-4 h-10 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 transition"
              >
                Escolher arquivos
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_UPLOAD_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {error && (
          <p className="px-5 pb-4 text-[12px] text-red-600 font-medium">{error}</p>
        )}
      </div>
    </div>
  )
}