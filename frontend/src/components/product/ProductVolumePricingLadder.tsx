/**
 * Escada de preço progressivo no catálogo.
 * Recolhível + textos/labels customizáveis via metadata.volume_pricing.display e tier.label.
 * Faixas aceitam qualquer limite/preço válidos (sem forçar “números redondos”).
 */
import { useEffect, useId, useState } from 'react'
import { ChevronDown, TrendingDown } from 'lucide-react'
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
  /** card = painel de compra; compact = variantes densas */
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
  const panelId = useId()

  if (!listed || listed.tiers.length < 1) return null

  const { measure, tiers, display } = listed
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

  const activeTier = tiers.find((t) => t.id === activeId) || tiers[0]
  const best = tiers[tiers.length - 1]
  const first = tiers[0]
  const maxSave =
    first && best && first.price_per_measure > best.price_per_measure
      ? Math.round((1 - best.price_per_measure / first.price_per_measure) * 100)
      : 0
  const fromPrice = best ? Math.min(...tiers.map((t) => t.itemUnitPrice)) : null

  const collapsible = display.collapsible
  const [open, setOpen] = useState(() => (collapsible ? display.default_open : true))

  useEffect(() => {
    if (!collapsible) setOpen(true)
    else setOpen(display.default_open)
  }, [product?.metadata?.volume_pricing, collapsible, display.default_open])

  const compact = density === 'compact'
  const subtitle =
    display.subtitle
    || `Preço por ${PRICING_MEASURE_LABELS[measure].singular}${
      maxSave > 0 ? ` · até ${maxSave}% menos na maior faixa` : ''
    }`

  const summaryBits = [
    activeTier
      ? `${money(activeTier.price_per_measure)}/${PRICING_MEASURE_LABELS[measure].short}`
      : null,
    fromPrice != null && activeTier && fromPrice < activeTier.itemUnitPrice - 0.001
      ? `a partir de ${money(fromPrice)}`
      : null,
    maxSave > 0 ? `até −${maxSave}%` : null,
  ].filter(Boolean)

  return (
    <section
      className={`product-volume-ladder${compact ? ' product-volume-ladder--compact' : ''}${
        collapsible ? ' product-volume-ladder--collapsible' : ''
      }${open ? ' is-open' : ' is-collapsed'}`}
      aria-label={display.title}
    >
      {collapsible ? (
        <button
          type="button"
          className="product-volume-ladder__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="product-volume-ladder__icon" aria-hidden>
            <TrendingDown size={compact ? 14 : 16} strokeWidth={2.25} />
          </span>
          <span className="product-volume-ladder__toggle-copy min-w-0">
            <span className="product-volume-ladder__title">{display.title}</span>
            <span className="product-volume-ladder__sub">
              {open ? subtitle : summaryBits.join(' · ') || subtitle}
            </span>
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2.25}
            className="product-volume-ladder__chevron"
            aria-hidden
          />
        </button>
      ) : (
        <header className="product-volume-ladder__head">
          <div className="product-volume-ladder__title-row">
            <span className="product-volume-ladder__icon" aria-hidden>
              <TrendingDown size={compact ? 14 : 16} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="product-volume-ladder__title">{display.title}</p>
              <p className="product-volume-ladder__sub">{subtitle}</p>
            </div>
          </div>
        </header>
      )}

      <div
        id={panelId}
        className="product-volume-ladder__body"
        hidden={collapsible && !open}
      >
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
                {display.show_discounts && (
                  tier.discountVsFirst > 0 ? (
                    <span className="product-volume-ladder__save">−{tier.discountVsFirst}%</span>
                  ) : (
                    <span className="product-volume-ladder__save product-volume-ladder__save--base">base</span>
                  )
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

        {display.show_next_hint && opportunity && opportunity.remainingItems > 0 && (
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
      </div>
    </section>
  )
}
