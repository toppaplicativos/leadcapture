import { useMemo } from 'react'
import { LayoutGrid } from 'lucide-react'
import type { Product } from '@/lib/api'
import type { CategoryCarouselShape, StoreCatalogCategory } from '@/lib/store-design'
import { optimizedImage } from '@/lib/image'

type Props = {
  categories: StoreCatalogCategory[]
  products: Product[]
  selectedCategory: string
  onCategoryChange: (name: string) => void
  shape?: CategoryCarouselShape
}

function resolveCover(
  category: StoreCatalogCategory,
  products: Product[],
): string | null {
  if (category.cover_image) return category.cover_image
  const match = products.find(
    (p) => (p.category || p.category_name) === category.name,
  )
  return match?.image || match?.images?.[0] || null
}

function initialLetter(name: string): string {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?'
}

export function StoreCategoryCarousel({
  categories,
  products,
  selectedCategory,
  onCategoryChange,
  shape = 'rounded',
}: Props) {
  const items = useMemo(
    () =>
      categories.map((cat) => ({
        ...cat,
        cover: resolveCover(cat, products),
      })),
    [categories, products],
  )

  if (items.length === 0) return null

  const shapeClass =
    shape === 'round' ? 'store-cat-carousel__thumb--round' : 'store-cat-carousel__thumb--rounded'

  return (
    <section className="store-cat-carousel" aria-label="Categorias da loja">
      <div className="max-w-[var(--store-max)] mx-auto px-4">
        <div className="store-cat-carousel__track" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!selectedCategory}
            onClick={() => onCategoryChange('')}
            className={`store-cat-carousel__item ${!selectedCategory ? 'is-active' : ''}`}
          >
            <span className={`store-cat-carousel__thumb ${shapeClass} store-cat-carousel__thumb--all`}>
              <LayoutGrid size={22} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="store-cat-carousel__label">Todos</span>
          </button>

          {items.map((cat) => {
            const active = selectedCategory === cat.name
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onCategoryChange(active ? '' : cat.name)}
                className={`store-cat-carousel__item ${active ? 'is-active' : ''}`}
              >
                <span
                  className={`store-cat-carousel__thumb ${shapeClass}`}
                  style={
                    !cat.cover && cat.color
                      ? { background: `${cat.color}22`, borderColor: `${cat.color}55` }
                      : undefined
                  }
                >
                  {cat.cover ? (
                    <img
                      src={optimizedImage(cat.cover, 240, 82)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="store-cat-carousel__img"
                    />
                  ) : (
                    <span
                      className="store-cat-carousel__initial"
                      style={cat.color ? { color: cat.color } : undefined}
                    >
                      {initialLetter(cat.name)}
                    </span>
                  )}
                </span>
                <span className="store-cat-carousel__label">{cat.name}</span>
                {typeof cat.count === 'number' && cat.count > 0 && (
                  <span className="store-cat-carousel__count tabular-nums">{cat.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}