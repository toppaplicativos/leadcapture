/**
 * Escada de preço progressivo no catálogo.
 * Mostra faixas, faixa ativa e o ganho de “quanto mais comprar, mais barato”.
 */
import { TrendingDown } from 'lucide-react'
import {
  getProductVolumePricingOpportunity,
  listProductVolumePricingTiers,
  PRICING_MEASURE_LABELS,
  type PricingMeasure,
} from '@/lib/product-volume-pricing'
import { money } from '@/lib/store-context'

type ProductLike = { unit?: unknown; metadata?: Record<string, any> }

type Props = {
  product: ProductLike
  quantity: number
  onSelectQuantity?: (qty: number) => void
  /** card = painel de compra; compact = bar mobile */
  density?: 'comfortable' | 'compact'
}

function formatMeasure(value: number, measure: PricingMeasure) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 })} ${PRICING_MEASURE_LABELS[measure].short}`
}

export function ProductVolumePricingLadder({
  product,
  quantity,
  onSelectQuantity,
  density = 'comfortable',
}: Props) {
  const listed = listProductVolumePricingTiers(product)
  if (!listed || listed.tiers.length < 1) return null

  const { measure, tiers } = listed
  const opportunity = getProductVolumePricingOpportunity(product, quantity)
  const current = opportunity?.current
  const activeId =
    current?.tier?.id
    || tiers.find((t) => {
      const mq = Math.max(0, Number(quantity) || 0) * listed.measurePerItem
      if (mq <= 0) return t === tiers[0]
      return t.up_to == null || mq <= t.up_to
    })?.id
    || tiers[0]?.id

  const best = tiers[tiers.length - 1]
  const first = tiers[0]
  const maxSave =
    first && best && first.price_per_measure > best.price_per_measure
      ? Math.round((1 - best.price_per_measure / first.price_per_measure) * 100)
      : 0

  const compact = density === 'compact'

  return (
    <section
      className={`product-volume-ladder${compact ? ' product-volume-ladder--compact' : ''}`}
      aria-label="Preço por volume"
    >
      <header className="product-volume-ladder__head">
        <div className="product-volume-ladder__title-row">
          <span className="product-volume-ladder__icon" aria-hidden>
            <TrendingDown size={compact ? 14 : 16} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="product-volume-ladder__title">Quanto mais comprar, mais barato</p>
            <p className="product-volume-ladder__sub">
              Preço por {PRICING_MEASURE_LABELS[measure].singular}
              {maxSave > 0 ? ` · até ${maxSave}% menos na maior faixa` : ''}
            </p>
          </div>
        </div>
      </header>

      <ol className="product-volume-ladder__list">
        {tiers.map((tier) => {
          const active = tier.id === activeId
          const interactive = typeof onSelectQuantity === 'function'
          const rowClass = 'product-volume-ladder__row'
          const content = (
            <>
              <span className="product-volume-ladder__dot" aria-hidden />
              <span className="product-volume-ladder__range">{tier.rangeLabel}</span>
              <span className="product-volume-ladder__price tabular-nums">
                {money(tier.price_per_measure)}
                <span className="product-volume-ladder__per">
                  /{PRICING_MEASURE_LABELS[measure].short}
                </span>
              </span>
              {tier.discountVsFirst > 0 ? (
                <span className="product-volume-ladder__save">−{tier.discountVsFirst}%</span>
              ) : (
                <span className="product-volume-ladder__save product-volume-ladder__save--base">base</span>
              )}
            </>
          )
          return (
            <li key={tier.id} className={`product-volume-ladder__item${active ? ' is-active' : ''}`}>
              {interactive ? (
                <button
                  type="button"
                  className={rowClass}
                  onClick={() => onSelectQuantity?.(tier.minQuantity)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${tier.rangeLabel}: ${money(tier.price_per_measure)} por ${PRICING_MEASURE_LABELS[measure].short}. Aplicar quantidade ${tier.minQuantity}`}
                >
                  {content}
                </button>
              ) : (
                <div className={rowClass} aria-current={active ? 'true' : undefined}>
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {opportunity && opportunity.remainingItems > 0 && (
        <div className="product-volume-ladder__next">
          <p className="product-volume-ladder__next-copy">
            Faltam{' '}
            <strong>{formatMeasure(opportunity.remainingMeasure, opportunity.measure)}</strong>
            {' '}para cair para{' '}
            <strong className="tabular-nums">
              {money(opportunity.next.price_per_measure)}/{PRICING_MEASURE_LABELS[opportunity.measure].short}
            </strong>
            {opportunity.savingsAtTarget > 0 ? (
              <>
                {' '}· economia de cerca de{' '}
                <strong className="tabular-nums">{money(opportunity.savingsAtTarget)}</strong>
              </>
            ) : null}
          </p>
          {onSelectQuantity && (
            <button
              type="button"
              className="product-volume-ladder__next-cta"
              onClick={() => onSelectQuantity(opportunity.targetQuantity)}
            >
              Completar {opportunity.targetQuantity} un.
            </button>
          )}
        </div>
      )}
    </section>
  )
}
