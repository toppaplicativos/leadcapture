/**
 * Barra de ações em massa da galeria.
 */
import { useState } from 'react'
import { CheckSquare, FolderInput, Loader2, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

const DEFAULT_FOLDERS = [
  { value: 'uploads', label: 'Uploads' },
  { value: 'ia', label: 'Criativos IA' },
  { value: 'campanhas', label: 'Campanhas' },
  { value: 'posts', label: 'Posts' },
  { value: 'produtos', label: 'Produtos' },
  { value: 'publicidade', label: 'Publicidade · Geral' },
]

export function GalleryBulkBar({
  count,
  totalVisible,
  busy,
  onSelectAll,
  onClear,
  onDelete,
  onApplyEdit,
  onExitSelectMode,
  folderOptions,
}: {
  count: number
  totalVisible: number
  busy?: boolean
  onSelectAll: () => void
  onClear: () => void
  onDelete: () => void
  onApplyEdit: (patch: { folder?: string; tagsToAdd?: string[] }) => void
  onExitSelectMode: () => void
  folderOptions?: Array<{ value: string; label: string }>
}) {
  const FOLDERS = folderOptions?.length ? folderOptions : DEFAULT_FOLDERS
  const [editOpen, setEditOpen] = useState(false)
  const [folder, setFolder] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')

  function applyEdit() {
    const tagsToAdd = tagsRaw
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (!folder && tagsToAdd.length === 0) return
    onApplyEdit({
      folder: folder || undefined,
      tagsToAdd: tagsToAdd.length ? tagsToAdd : undefined,
    })
    setEditOpen(false)
    setFolder('')
    setTagsRaw('')
  }

  return (
    <div className="sticky top-0 z-20 rounded-2xl border border-gray-900/10 bg-gray-900 text-white shadow-lg px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold tabular-nums">
          <CheckSquare size={15} className="opacity-80" />
          {count} selecionado{count === 1 ? '' : 's'}
        </span>

        <button
          type="button"
          className="text-[11px] font-semibold text-white/70 hover:text-white underline-offset-2 hover:underline"
          onClick={count >= totalVisible ? onClear : onSelectAll}
          disabled={busy || totalVisible === 0}
        >
          {count >= totalVisible ? 'Limpar' : 'Selecionar todos visíveis'}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || count === 0}
            iconLeft={<FolderInput size={14} />}
            onClick={() => setEditOpen((v) => !v)}
            className="!bg-white/10 !text-white !ring-white/20 hover:!bg-white/15"
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || count === 0}
            iconLeft={busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            onClick={onDelete}
            className="!bg-red-500/90 !text-white !ring-red-400/30 hover:!bg-red-500"
          >
            Excluir
          </Button>
          <button
            type="button"
            onClick={onExitSelectMode}
            disabled={busy}
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 text-white/80"
            aria-label="Sair da seleção"
            title="Sair da seleção"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {editOpen && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="block min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Mover para pasta</span>
            <Select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="mt-1 !bg-white !text-gray-900"
              fullWidth
              aria-label="Pasta destino"
            >
              <option value="">Manter pasta atual</option>
              {FOLDERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </label>
          <label className="block min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/60 flex items-center gap-1">
              <Tag size={10} /> Adicionar tags
            </span>
            <Input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="promo, verão, story…"
              className="mt-1 !bg-white !text-gray-900"
            />
          </label>
          <Button
            size="sm"
            disabled={busy || (!folder && !tagsRaw.trim())}
            onClick={applyEdit}
            className="!bg-white !text-gray-900 hover:!bg-gray-100"
          >
            Aplicar em {count}
          </Button>
        </div>
      )}
    </div>
  )
}
