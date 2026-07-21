import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { Product } from '@/lib/api'
import { productPath } from '@/lib/product-url'
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

  // Uma vitrine sem avaliações reais não deve simular prova social.
  if (!hasAggregate && !hasSnippets) return null

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
              className={i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-100'}
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
                Opinião de {count} {count === 1 ? 'cliente' : 'clientes'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-gray-900 tracking-tight">Quem comprou recomenda</p>
              <p className="text-[12px] text-gray-600">Avaliações recentes de clientes</p>
            </>
          )}
        </div>
      </div>

      <div className="store-reviews-highlight__list">
        {hasSnippets
          ? snippets.slice(0, 6).map((review) => (
              <blockquote key={review.id} className="store-reviews-highlight__quote">
                <div className="flex items-center gap-1 mb-1.5" aria-label={`${review.rating} de 5 estrelas`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      aria-hidden
                      className={i < Math.round(review.rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-100'}
                    />
                  ))}
                </div>
                {review.comment && <p className="store-reviews-highlight__comment">“{review.comment}”</p>}
                <footer className="mt-2 text-[11px] text-gray-500 font-medium">
                  {review.customer_name}
                  {review.verified_purchase && <span className="text-emerald-700 ml-1.5">· Compra verificada</span>}
                  {review.product_name && (
                    <span className="block text-gray-400 font-normal truncate mt-0.5">{review.product_name}</span>
                  )}
                </footer>
              </blockquote>
            ))
          : products.map((product) => {
              const image = product.image || product.images?.[0] || ''
              return (
                <Link key={product.id} to={productPath(product, catalogSlug)} className="store-reviews-highlight__card">
                  <div className="store-reviews-highlight__thumb">
                    {image ? <img src={optimizedImage(image, 160)} alt="" loading="lazy" /> : <span className="bg-gray-100 w-full h-full block" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      <span className="font-semibold text-gray-800 tabular-nums">{Number(product.reviews_avg).toFixed(1)}</span>
                      <span className="text-gray-400">({Number(product.reviews_count)})</span>
                    </div>
                  </div>
                </Link>
              )
            })}
      </div>
    </section>
  )
}
