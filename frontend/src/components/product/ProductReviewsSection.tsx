import { useEffect, useState } from 'react'
import { Star, BadgeCheck, MessageSquareQuote } from 'lucide-react'
import type { Product } from '@/lib/api'
import { fetchProductReviews, submitProductReview } from '@/lib/api'
import { Button } from '@/components/ui'

type ReviewRow = {
  id: string
  customer_name: string
  rating: number
  comment: string | null
  verified_purchase: boolean
  created_at: string
}

export function ProductReviewsSection({
  product,
  variant = 'compact',
}: {
  product: Product
  variant?: 'compact' | 'page'
}) {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [aggregates, setAggregates] = useState<{
    count: number
    avg: number
    distribution: Record<string, number>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  const isPage = variant === 'page'
  const limit = isPage ? 20 : 5

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProductReviews(product.id, limit)
      .then((d) => {
        if (cancelled) return
        setReviews(d.reviews || [])
        setAggregates(d.aggregates || null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [product.id, limit])

  async function submit() {
    const n = name.trim()
    if (!n) { setSubmitMsg({ kind: 'err', text: 'Informe seu nome' }); return }
    if (rating < 1 || rating > 5) { setSubmitMsg({ kind: 'err', text: 'Escolha de 1 a 5 estrelas' }); return }
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      const res = await submitProductReview(product.id, {
        name: n,
        phone: phone.trim() || undefined,
        rating,
        comment: comment.trim() || undefined,
      })
      setSubmitMsg({ kind: 'ok', text: res.message || 'Avaliação enviada! Aparecerá após moderação.' })
      setName('')
      setPhone('')
      setRating(5)
      setComment('')
      setShowForm(false)
    } catch (e: unknown) {
      setSubmitMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Não foi possível enviar.' })
    } finally {
      setSubmitting(false)
    }
  }

  const hasReviews = (aggregates?.count || 0) > 0

  return (
    <section className={isPage ? 'product-reviews' : 'border-t border-border-light pt-4'} id="avaliacoes">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className={isPage ? 'product-section-title' : 'store-section-title'}>
            {isPage ? 'Avaliações e comentários' : 'Avaliações'}
          </h2>
          {isPage && (
            <p className="text-[13px] text-gray-500 mt-1">
              Opiniões de quem já comprou — sua avaliação ajuda outras pessoas.
            </p>
          )}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-[12px] font-semibold text-brand hover:opacity-80 transition shrink-0"
          >
            Deixar avaliação
          </button>
        )}
      </div>

      {hasReviews && aggregates && (
        <div className={`flex flex-wrap items-center gap-4 ${isPage ? 'mb-5' : 'mb-3'}`}>
          <div className="flex items-center gap-2">
            <span className={`font-bold text-gray-900 tabular-nums ${isPage ? 'text-3xl' : 'text-sm'}`}>
              {aggregates.avg.toFixed(1)}
            </span>
            <div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={isPage ? 16 : 14}
                    className={
                      n <= Math.round(aggregates.avg)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200 fill-gray-100'
                    }
                    strokeWidth={1.5}
                  />
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {aggregates.count} {aggregates.count === 1 ? 'avaliação' : 'avaliações'}
              </p>
            </div>
          </div>

          {isPage && aggregates.distribution && (
            <div className="flex-1 min-w-[180px] max-w-xs space-y-1">
              {([5, 4, 3, 2, 1] as const).map((stars) => {
                const count = Number(aggregates.distribution[String(stars)] || 0)
                const pct = aggregates.count > 0 ? Math.round((count / aggregates.count) * 100) : 0
                return (
                  <div key={stars} className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="w-3 tabular-nums">{stars}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className={`bg-gray-50 rounded-2xl p-4 space-y-3 mb-4 ring-1 ring-black/[0.04] ${isPage ? 'lg:p-5' : ''}`}>
          <p className="text-[13px] font-semibold text-gray-900">Sua avaliação</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} estrela${n === 1 ? '' : 's'}`}
                className="p-1 rounded-lg transition active:scale-95"
              >
                <Star
                  size={isPage ? 26 : 22}
                  className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome *"
            className="store-search w-full !pl-3.5 !pr-3.5 !h-auto py-2.5 bg-white"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone (opcional — compra verificada)"
            className="store-search w-full !pl-3.5 !pr-3.5 !h-auto py-2.5 bg-white"
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={isPage ? 4 : 3}
            placeholder="Conte sua experiência com o produto..."
            className="store-search w-full !pl-3.5 !pr-3.5 !h-auto py-2.5 bg-white resize-none"
          />
          {submitMsg && (
            <p className={`text-[12px] font-semibold ${submitMsg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
              {submitMsg.text}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); setSubmitMsg(null) }}
              className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:text-gray-900 transition"
            >
              Cancelar
            </button>
            <Button onClick={submit} disabled={submitting} variant="brand" size="sm">
              {submitting ? 'Enviando...' : 'Publicar avaliação'}
            </Button>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          <div className="h-16 rounded-xl skeleton" />
          <div className="h-16 rounded-xl skeleton" />
        </div>
      )}

      {!loading && !hasReviews && !showForm && (
        <div className={`text-center py-6 ${isPage ? 'rounded-2xl bg-gray-50 ring-1 ring-black/[0.03]' : ''}`}>
          <MessageSquareQuote size={28} className="mx-auto text-gray-300 mb-2" strokeWidth={1.5} />
          <p className="text-[13px] text-gray-500">Ainda não há avaliações. Seja o primeiro a comentar!</p>
        </div>
      )}

      {hasReviews && (
        <div className={`space-y-3 ${isPage ? 'product-reviews__list' : 'space-y-2.5'}`}>
          {reviews.map((r) => (
            <article key={r.id} className="product-review-card">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={isPage ? 13 : 11}
                      className={n <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
                      strokeWidth={2}
                    />
                  ))}
                </div>
                <span className="text-[13px] font-semibold text-gray-900">{r.customer_name}</span>
                {r.verified_purchase && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    <BadgeCheck size={11} strokeWidth={2.5} aria-hidden />
                    Compra verificada
                  </span>
                )}
              </div>
              {r.comment ? (
                <p className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap">{r.comment}</p>
              ) : (
                <p className="text-[12px] text-gray-400 italic">Sem comentário escrito.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}