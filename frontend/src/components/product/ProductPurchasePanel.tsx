import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/api'
import type { AddItemPayload } from '@/lib/store'
import { money } from '@/lib/store-context'

function chipClass(active: boolean, disabled = false) {
  if (disabled) return 'store-chip store-chip--filter opacity-40 line-through cursor-not-allowed'
  return `store-chip store-chip--filter${active ? ' is-active' : ''}`
}

function resolveStock(product: Product) {
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const legacyStock = product.stock != null && product.stock !== '' ? Number(product.stock) : null
  const isOutOfStock =
    stockStatus === 'out_of_stock' ||
    (stockQty !== null && stockQty <= 0) ||
    (legacyStock !== null && legacyStock <= 0)
  const isLowStock =
    !isOutOfStock &&
    ((stockStatus === 'low_stock' && stockQty !== null && stockQty > 0) ||
      (legacyStock !== null && legacyStock > 0 && legacyStock <= 5))
  const displayQty = stockQty ?? legacyStock
  const stockCap = displayQty !== null && displayQty > 0 ? displayQty : 999
  return { isOutOfStock, isLowStock, displayQty, stockStatus, stockCap }
}

export type ProductPurchaseState = ReturnType<typeof useProductPurchase>

export type ProductPurchasePanelProps = {
  product: Product
  purchase: ProductPurchaseState
  onAdd: (payload: AddItemPayload) => void
  layout?: 'card' | 'bar'
  showPriceHeader?: boolean
  showActions?: boolean
}

export function useProductPurchase(product: Product | null) {
  const [qty, setQty] = useState(1)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [configSelections, setConfigSelections] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!product) return
    setQty(1)
    const variants = Array.isArray(product.variants) ? product.variants : []
    const firstActive = variants.find((v) => v && v.is_active !== false)
    setSelectedVariantId(firstActive?.id || null)
    const cfg = product.configurator
    const initial: Record<string, string[]> = {}
    if (cfg?.enabled && Array.isArray(cfg.groups)) {
      for (const g of cfg.groups) {
        const minSel = Number(g.min_select ?? (g.required ? 1 : 0))
        if (minSel > 0 && Array.isArray(g.options) && g.options.length > 0) {
          const firstOpt = g.options.find((o) => o.is_active !== false)
          if (firstOpt) initial[g.id] = [firstOpt.id]
        }
      }
    }
    setConfigSelections(initial)
  }, [product?.id])

  const pricing = useMemo(() => {
    if (!product) return null
    const variants = Array.isArray(product.variants) ? product.variants : []
    const selectedVariant = variants.length
      ? variants.find((v) => v.id === selectedVariantId) || variants[0]
      : null
    const effectivePrice =
      selectedVariant?.price != null && selectedVariant.price > 0
        ? Number(selectedVariant.price)
        : Number(product.price || 0)
    const effectivePromo =
      selectedVariant?.promo_price != null && selectedVariant.promo_price > 0
        ? Number(selectedVariant.promo_price)
        : null
    const displayedPrice =
      effectivePromo && effectivePromo < effectivePrice ? effectivePromo : effectivePrice
    const displayedCompare =
      effectivePromo && effectivePromo < effectivePrice
        ? effectivePrice
        : product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
          ? Number(product.compare_at_price)
          : null

    const configurator = product.configurator
    const configEnabled = Boolean(
      configurator?.enabled && Array.isArray(configurator.groups) && configurator.groups.length > 0,
    )
    let configPriceDelta = 0
    const configSummaryParts: string[] = []
    const configErrors: string[] = []
    const configSelectionsArray: Array<{ group_id: string; option_ids: string[] }> = []

    if (configEnabled && configurator?.groups) {
      for (const g of configurator.groups) {
        const chosen = configSelections[g.id] || []
        const minSel = Number(g.min_select ?? (g.required ? 1 : 0))
        const maxSel = Number(g.max_select ?? 1)
        if (chosen.length < minSel) configErrors.push(`${g.name}: selecione ${minSel}`)
        if (chosen.length > maxSel) configErrors.push(`${g.name}: máximo ${maxSel}`)
        const chosenNames: string[] = []
        for (const optId of chosen) {
          const opt = g.options.find((o) => o.id === optId)
          if (opt) {
            configPriceDelta += Number(opt.price_delta || 0)
            chosenNames.push(opt.name)
          }
        }
        if (chosenNames.length > 0) configSummaryParts.push(`${g.name}: ${chosenNames.join(', ')}`)
        configSelectionsArray.push({ group_id: g.id, option_ids: chosen })
      }
    }

    const finalUnitPrice = Math.max(0, displayedPrice + configPriceDelta)
    const hasCompare = displayedCompare != null && configPriceDelta === 0
    const discount =
      hasCompare && displayedCompare
        ? Math.round((1 - displayedPrice / displayedCompare) * 100)
        : 0

    return {
      variants,
      selectedVariant,
      displayedPrice,
      displayedCompare,
      finalUnitPrice,
      discount,
      configEnabled,
      configurator,
      configErrors,
      configSelectionsArray,
      configSummary: configSummaryParts.join(' | '),
      configPriceDelta,
      stock: resolveStock(product),
      variantImage: selectedVariant?.image_url || null,
    }
  }, [product, selectedVariantId, configSelections])

  return {
    qty,
    setQty,
    selectedVariantId,
    setSelectedVariantId,
    configSelections,
    setConfigSelections,
    pricing,
  }
}

export function ProductPurchasePanel({
  product,
  purchase,
  onAdd,
  layout = 'card',
  showPriceHeader = true,
  showActions = true,
}: ProductPurchasePanelProps) {
  const {
    qty,
    setQty,
    selectedVariantId,
    setSelectedVariantId,
    configSelections,
    setConfigSelections,
    pricing,
  } = purchase

  if (!pricing) return null

  const {
    variants,
    selectedVariant,
    finalUnitPrice,
    displayedCompare,
    discount,
    configEnabled,
    configurator,
    configErrors,
    configSelectionsArray,
    configSummary,
    configPriceDelta,
    displayedPrice,
    stock,
  } = pricing

  const subtotal = finalUnitPrice * qty
  const isCard = layout === 'card'

  function handleAdd() {
    if (stock.isOutOfStock || (configEnabled && configErrors.length > 0)) return
    onAdd({
      productId: product.id,
      quantity: qty,
      variantId: selectedVariant?.id || null,
      variantName:
        selectedVariant?.name ||
        (selectedVariant?.attributes
          ? Object.values(selectedVariant.attributes).filter(Boolean).join(' / ')
          : null),
      variantAttributes: selectedVariant?.attributes || null,
      configuratorSelections: configEnabled ? configSelectionsArray : null,
      configuratorSummary: configSummary || null,
      unitPrice: finalUnitPrice,
    })
  }

  const qtyBlock = (
    <div className="store-qty-stepper shrink-0">
      <button
        type="button"
        onClick={() => setQty(Math.max(1, qty - 1))}
        aria-label="Diminuir quantidade"
        disabled={qty <= 1 || stock.isOutOfStock}
        className="store-qty-stepper__btn disabled:opacity-30"
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <span className="store-qty-stepper__value tabular-nums">{qty}</span>
      <button
        type="button"
        onClick={() => setQty(Math.min(stock.stockCap, qty + 1))}
        aria-label="Aumentar quantidade"
        disabled={stock.isOutOfStock || qty >= stock.stockCap}
        className="store-qty-stepper__btn disabled:opacity-30"
      >
        <Plus size={16} strokeWidth={2} />
      </button>
    </div>
  )

  const ctaButton = (
    <button
      type="button"
      onClick={handleAdd}
      disabled={stock.isOutOfStock || (configEnabled && configErrors.length > 0)}
      className={`product-purchase__cta ${isCard ? '' : 'flex-1'}`}
      title={
        stock.isOutOfStock
          ? 'Produto esgotado'
          : configEnabled && configErrors.length > 0
            ? configErrors.join(' · ')
            : undefined
      }
    >
      <ShoppingBag size={18} strokeWidth={2} aria-hidden />
      <span>
        {stock.isOutOfStock
          ? 'Indisponível'
          : configEnabled && configErrors.length > 0
            ? configErrors[0]
            : `Adicionar ao carrinho · ${money(subtotal)}`}
      </span>
    </button>
  )

  return (
    <div className={isCard ? 'product-purchase product-purchase--card' : 'product-purchase product-purchase--bar'}>
      {showPriceHeader && isCard && (
        <div className="product-purchase__price-block">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="product-purchase__price tabular-nums">{money(finalUnitPrice)}</span>
            {displayedCompare != null && configPriceDelta === 0 && (
              <span className="product-purchase__compare tabular-nums">{money(displayedCompare)}</span>
            )}
            {discount > 0 && (
              <span className="product-purchase__discount">−{discount}%</span>
            )}
          </div>
          {configPriceDelta !== 0 && (
            <p className="text-[12px] text-gray-500 mt-1">
              {money(displayedPrice)} base
              {configPriceDelta > 0 ? ` + ${money(configPriceDelta)} opções` : ` ${money(configPriceDelta)} opções`}
            </p>
          )}
        </div>
      )}

      {variants.length > 0 && (
        <div className="product-purchase__field">
          <p className="product-purchase__label">Opção</p>
          <div className="flex flex-wrap gap-2">
            {variants
              .filter((v) => v.is_active !== false)
              .map((v) => {
                const label =
                  String(v.name || '').trim() ||
                  Object.values(v.attributes || {}).filter(Boolean).join(' / ') ||
                  v.sku ||
                  'Variação'
                const isSelected = v.id === (selectedVariantId || variants[0]?.id)
                const outOfStock = v.stock_quantity != null && Number(v.stock_quantity) <= 0
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    disabled={outOfStock}
                    className={chipClass(isSelected, outOfStock)}
                  >
                    {label}
                    {outOfStock && ' (esgotado)'}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {configEnabled &&
        configurator?.groups?.map((g) => {
          const chosen = configSelections[g.id] || []
          const minSel = Number(g.min_select ?? (g.required ? 1 : 0))
          const maxSel = Number(g.max_select ?? 1)
          const singleSelect = maxSel === 1
          return (
            <div key={g.id} className="product-purchase__field">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="product-purchase__label">
                  {g.name}
                  {g.required && <span className="text-red-500 ml-0.5">*</span>}
                </p>
                <span className="text-[11px] text-gray-500">
                  {singleSelect ? 'escolha 1' : `${minSel}–${maxSel}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.options
                  .filter((o) => o.is_active !== false)
                  .map((o) => {
                    const isOn = chosen.includes(o.id)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setConfigSelections((prev) => {
                            const cur = prev[g.id] || []
                            let next: string[]
                            if (singleSelect) next = isOn ? [] : [o.id]
                            else if (isOn) next = cur.filter((x) => x !== o.id)
                            else if (cur.length < maxSel) next = [...cur, o.id]
                            else next = cur
                            return { ...prev, [g.id]: next }
                          })
                        }}
                        className={chipClass(isOn)}
                      >
                        {o.name}
                        {Number(o.price_delta || 0) !== 0 && (
                          <span className="ml-1 opacity-80 text-[10px] tabular-nums">
                            {Number(o.price_delta) > 0 ? '+' : ''}
                            {money(Number(o.price_delta))}
                          </span>
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          )
        })}

      {stock.stockStatus !== 'unlimited' && (
        <div
          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full ${
            stock.isOutOfStock
              ? 'bg-red-50 text-red-800'
              : stock.isLowStock
                ? 'bg-amber-50 text-amber-800'
                : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              stock.isOutOfStock ? 'bg-red-500' : stock.isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            aria-hidden
          />
          {stock.isOutOfStock
            ? 'Produto indisponível'
            : stock.isLowStock
              ? `Últimas ${stock.displayQty} unidades`
              : `${stock.displayQty} em estoque`}
        </div>
      )}

      {showActions && (
        isCard ? (
          <div className="product-purchase__actions product-purchase__actions--card">
            {qtyBlock}
            {ctaButton}
          </div>
        ) : (
          <div className="product-purchase__actions product-purchase__actions--bar">
            {qtyBlock}
            {ctaButton}
          </div>
        )
      )}
    </div>
  )
}