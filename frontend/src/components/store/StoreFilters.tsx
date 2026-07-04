import { Search, X } from 'lucide-react'

export interface AttributeFilterDef {
  id: string
  key: string
  label: string
  is_filter: boolean
}

interface StoreFiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  attrDefs: AttributeFilterDef[]
  valuesByAttrKey: Record<string, string[]>
  attrFilters: Record<string, string>
  onAttrFilterToggle: (key: string, value: string) => void
  onClearAttrFilters: () => void
  activeAttrFilterCount: number
}

export function StoreFilters({
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  attrDefs,
  valuesByAttrKey,
  attrFilters,
  onAttrFilterToggle,
  onClearAttrFilters,
  activeAttrFilterCount,
}: StoreFiltersProps) {
  const filterableAttrs = attrDefs.filter(
    (d) => d.is_filter && (valuesByAttrKey[d.key]?.length ?? 0) > 0,
  )

  return (
    <div className="store-filters sticky top-14 z-30">
      <div className="max-w-[var(--store-max)] mx-auto px-4 py-3.5 space-y-3">
        <div className="relative">
          <Search
            size={16}
            strokeWidth={1.75}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar produto"
            aria-label="Buscar produto"
            className="store-search w-full"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition"
            >
              <X size={13} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div
            className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-0.5"
            role="tablist"
            aria-label="Categorias"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!selectedCategory}
              onClick={() => onCategoryChange('')}
              className={`store-chip store-chip--filter ${!selectedCategory ? 'is-active' : ''}`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat}
                onClick={() => onCategoryChange(selectedCategory === cat ? '' : (cat || ''))}
                className={`store-chip store-chip--filter ${selectedCategory === cat ? 'is-active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {filterableAttrs.length > 0 && (
          <div className="space-y-2">
            {filterableAttrs.map((def) => {
              const vals = valuesByAttrKey[def.key] || []
              const active = attrFilters[def.key] || ''
              return (
                <div key={def.id} className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                  <span className="text-[12px] font-semibold text-gray-500 shrink-0">{def.label}</span>
                  {vals.map((v) => {
                    const isOn = active === v
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onAttrFilterToggle(def.key, v)}
                        className={`store-chip store-chip--filter ${isOn ? 'is-active' : ''}`}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {activeAttrFilterCount > 0 && (
              <button
                type="button"
                onClick={onClearAttrFilters}
                className="text-[12px] text-gray-600 hover:text-gray-900 font-medium underline underline-offset-2"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}