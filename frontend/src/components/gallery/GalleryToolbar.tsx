import { CheckSquare, Images, LayoutGrid, Search, Square, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'

export function GalleryToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  dense,
  onDenseChange,
  total,
  selectMode,
  onSelectModeChange,
}: {
  search: string
  onSearchChange: (v: string) => void
  typeFilter: '' | 'image' | 'video'
  onTypeFilterChange: (v: '' | 'image' | 'video') => void
  dense: boolean
  onDenseChange: (v: boolean) => void
  total: number
  selectMode?: boolean
  onSelectModeChange?: (v: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nome, tag ou prompt..."
          className="pl-10 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full hover:bg-gray-100 text-gray-400"
            aria-label="Limpar busca"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Select
        fullWidth={false}
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value as '' | 'image' | 'video')}
        className="w-auto min-w-[9.5rem]"
        aria-label="Filtrar por tipo"
      >
        <option value="">Todos os tipos</option>
        <option value="image">Imagens</option>
        <option value="video">Vídeos</option>
      </Select>

      <p className="text-[12px] text-gray-500 tabular-nums hidden sm:block">
        {total} {total === 1 ? 'item' : 'itens'}
      </p>

      <span className="ml-auto inline-flex items-center gap-1">
        {onSelectModeChange && (
          <button
            type="button"
            onClick={() => onSelectModeChange(!selectMode)}
            className={cn(
              'h-9 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[11px] font-bold transition',
              selectMode
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50',
            )}
            aria-pressed={!!selectMode}
            title="Selecionar itens em massa"
          >
            {selectMode ? <CheckSquare size={14} /> : <Square size={14} />}
            <span className="hidden sm:inline">Selecionar</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onDenseChange(false)}
          className={cn(
            'w-9 h-9 grid place-items-center rounded-full transition',
            !dense ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50',
          )}
          aria-label="Grade confortável"
          title="Confortável"
        >
          <LayoutGrid size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDenseChange(true)}
          className={cn(
            'w-9 h-9 grid place-items-center rounded-full transition',
            dense ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50',
          )}
          aria-label="Grade densa"
          title="Densa"
        >
          <Images size={14} />
        </button>
      </span>
    </div>
  )
}