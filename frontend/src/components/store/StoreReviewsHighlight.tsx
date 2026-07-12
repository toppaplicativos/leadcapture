import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { Product } from '@/lib/api'
import { productPath } from '@/lib/product-url'
import { money } from '@/lib/store-context'
import { optimizedImage } from '@/lib/image'

export type StoreReviewSnippet = {
  id: string
  customer_name: string
  rating: number
  comment: string | null
  product_name?: string | null
  product_id?: string | null
  verified_purchase?: boolean
}

export function StoreReviewsHighlight({
  avg,
  count,
  products,
  catalogSlug,
  snippets = [],
}: {
  avg: number
  count: number
  products: Product[]
  catalogSlug: string
  snippets?: StoreReviewSnippet[]
}) {
  const hasAggregate = count > 0 && avg > 0
  const hasSnippets = snippets.length > 0
  const hasProducts = products.length > 0

  // Sem nenhuma prova social ainda: seção enxuta (sem inventar nota)
  if (!hasAggregate && !hasSnippets) {
    return (
      <section className="store-reviews-highlight store-reviews-highlight--empty" aria-label="Avaliações">
        <div className="store-reviews-highlight__summary store-reviews-highlight__summary--solo">
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={14} strokeWidth={2} className="text-amber-300 fill-amber-200" />
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-gray-900 tracking-tight">Avaliações de clientes</p>
            <p className="text-[12px] text-gray-600 mt-0.5 leading-snug">
              Após a compra, você pode avaliar o produto e ajudar outros clientes.
            </p>
          </div>
        </div>
      </section>
    )
  }

  const stars = hasAggregate ? Math.round(avg) : 5

  return (
    <section className="store-reviews-highlight" aria-label="Avaliações da loja">
      <div className="store-reviews-highlight__summary">
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={16}
              strokeWidth={2}
              className={
                i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-100'
              }
            />
          ))}
        </div>
        <div className="min-w-0">
          {hasAggregate ? (
            <>
              <p className="text-[15px] font-bold text-gray-900 tabular-nums tracking-tight">
                {avg.toFixed(1)}
                <span className="text-[12px] font-semibold text-gray-500 ml-1">/ 5</span>
              </p>
              <p className="text-[12px] text-gray-600">
                {count} {count === 1 ? 'avaliação' : 'avaliações'} de clientes
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-gray-900 tracking-tight">Avaliações</p>
              <p className="text-[12px] text-gray-600">O que clientes recentes disseram</p>
            </>
          )}
        </div>
      </div>

      {hasSnippets && (
        <div className="store-reviews-highlight__quotes">
          {snippets.slice(0, 6).map((s) => (
            <blockquote key={s.id} className="store-reviews-highlight__quote">
              <div className="flex items-center gap-1 mb-1" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={
                      i < Math.round(s.rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200 fill-gray-100'
                    }
                  />
                ))}
              </div>
              {s.comment && (
                <p className="text-[12.5px] text-gray-800 leading-snug line-clamp-3">“{s.comment}”</p>
              )}
              <footer className="mt-1.5 text-[11px] text-gray-500 font-medium">
                {s.customer_name}
                {s.verified_purchase ? (
                  <span className="text-emerald-700 ml-1.5">· Compra verificada</span>
                ) : null}
                {s.product_name ? (
                  <span className="block text-gray-400 font-normal truncate mt-0.5">
                    {s.product_name}
                  </span>
                ) : null}
              </footer>
            </blockquote>
          ))}
        </div>
      )}

      {!hasSnippets && hasProducts && (
        <div className="store-reviews-highlight__track">
          {products.map((p) => {
            const img = p.image || p.images?.[0] || ''
            return (
              <Link
                key={p.id}
                to={productPath(p, catalogSlug)}
                className="store-reviews-highlight__card"
              >
                <div className="store-reviews-highlight__thumb">
                  {img ? (
                    <img src={optimizedImage(img, 160)} alt="" loading="lazy" />
                  ) : (
                    <span className="bg-gray-100 w-full h-full block" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-gray-900 line-clamp-2 leading-snug">
                    {p.name}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600">
                    <Star size={11} className="text-amber-400 fill-amber-400" />
                    <span className="font-semibold text-gray-800 tabular-nums">
                      {Number(p.reviews_avg).toFixed(1)}
                    </span>
                    <span className="text-gray-400">({Number(p.reviews_count)})</span>
                  </div>
                  <p className="text-[12px] font-bold text-gray-900 tabular-nums mt-0.5">
                    {money(p.price)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
