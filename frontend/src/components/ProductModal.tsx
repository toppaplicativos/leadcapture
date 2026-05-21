import { X, Minus, Plus, ImageOff, MessageCircle, Calendar, FileText, MapPin, Calculator, Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { OfferCta, Product } from '@/lib/api'
import { money } from '@/lib/store-context'
import { Button } from '@/components/ui'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { LeadCaptureForm } from '@/components/LeadCaptureForm'
import { ServiceBookingForm } from '@/components/ServiceBookingForm'

export interface ModalAddToCartPayload {
  productId: string
  qty: number
  variantId?: string | null
  variantName?: string | null
  variantAttributes?: Record<string, any> | null
  configuratorSelections?: Array<{ group_id: string; option_ids: string[] }> | null
  configuratorSummary?: string | null
  unitPrice?: number | null
}

interface ProductModalProps {
  product: Product | null
  onClose: () => void
  onAddToCart: (payload: ModalAddToCartPayload) => void
  /** Optional WhatsApp phone for the brand (digits only). Enables the whatsapp CTA deep link. */
  whatsappPhone?: string
  /** Full product list — used to render the "Relacionados" carousel from product.related_product_ids. */
  allProducts?: Product[]
  /** Optional: when a related product card is clicked, swap the modal to show it. */
  onSelectProduct?: (product: Product) => void
}

const CTA_LABELS: Record<OfferCta, { label: string; Icon: typeof MessageCircle }> = {
  buy: { label: 'Adicionar', Icon: Plus },
  quote: { label: 'Solicitar orçamento', Icon: FileText },
  whatsapp: { label: 'Conversar no WhatsApp', Icon: MessageCircle },
  schedule: { label: 'Agendar', Icon: Calendar },
  visit: { label: 'Solicitar visita', Icon: MapPin },
  simulate: { label: 'Simular', Icon: Calculator },
  subscribe: { label: 'Assinar', Icon: Repeat },
  custom: { label: 'Saiba mais', Icon: MessageCircle },
}

function openWhatsApp(phone: string, productName: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return
  const text = encodeURIComponent(`Olá! Tenho interesse em "${productName}". Pode me ajudar?`)
  const url = `https://wa.me/${digits}?text=${text}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ProductModal({ product, onClose, onAddToCart, whatsappPhone, allProducts, onSelectProduct }: ProductModalProps) {
  const [qty, setQty] = useState(1)
  const [leadFormFor, setLeadFormFor] = useState<Exclude<OfferCta, 'buy' | 'whatsapp'> | null>(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  /* Configurator (Fase 4) — Map<groupId, Set<optionId>> */
  const [configSelections, setConfigSelections] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!product) return
    setQty(1)
    setLeadFormFor(null)
    setBookingOpen(false)
    /* Auto-select first active variant on open */
    const variants = Array.isArray((product as any).variants) ? (product as any).variants : []
    const firstActive = variants.find((v: any) => v && v.is_active !== false)
    setSelectedVariantId(firstActive?.id || null)
    /* Auto-fill required configurator groups with first option */
    const cfg = product.configurator
    const initialSelections: Record<string, string[]> = {}
    if (cfg?.enabled && Array.isArray(cfg.groups)) {
      for (const g of cfg.groups) {
        const minSel = Number(g.min_select ?? (g.required ? 1 : 0))
        if (minSel > 0 && Array.isArray(g.options) && g.options.length > 0) {
          const firstOpt = g.options.find((o: any) => o.is_active !== false)
          if (firstOpt) initialSelections[g.id] = [firstOpt.id]
        }
      }
    }
    setConfigSelections(initialSelections)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [product, onClose])

  if (!product) return null

  const variants = Array.isArray((product as any).variants) ? (product as any).variants : []
  const hasVariants = variants.length > 0
  const selectedVariant = hasVariants
    ? variants.find((v: any) => v.id === selectedVariantId) || variants[0]
    : null

  /* Effective price: variant override > product price */
  const effectivePrice = selectedVariant?.price != null && selectedVariant.price > 0
    ? Number(selectedVariant.price)
    : Number(product.price || 0)
  const effectivePromo = selectedVariant?.promo_price != null && selectedVariant.promo_price > 0
    ? Number(selectedVariant.promo_price)
    : null
  const displayedPrice = effectivePromo && effectivePromo < effectivePrice ? effectivePromo : effectivePrice
  const displayedCompare = effectivePromo && effectivePromo < effectivePrice
    ? effectivePrice
    : (product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? Number(product.compare_at_price) : null)

  /* Configurator (Fase 4) — compute price delta + summary */
  const configurator = product.configurator
  const configEnabled = Boolean(configurator?.enabled && Array.isArray(configurator.groups) && configurator.groups.length > 0)
  let configPriceDelta = 0
  const configSummaryParts: string[] = []
  const configErrors: string[] = []
  const configSelectionsArray: Array<{ group_id: string; option_ids: string[] }> = []
  if (configEnabled) {
    for (const g of configurator!.groups!) {
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
  const configSummary = configSummaryParts.join(' | ')
  const finalUnitPrice = Math.max(0, displayedPrice + configPriceDelta)
  const subtotal = finalUnitPrice * qty
  const imgSrc = (selectedVariant && (selectedVariant as any).image_url) || product.image || product.images?.[0] || ''
  const hasCompare = displayedCompare != null && configPriceDelta === 0

  const details: [string, string][] = []
  if (product.sku) details.push(['SKU', product.sku])
  if (product.weight) details.push(['Peso', product.weight + (product.weight_unit ? ' ' + product.weight_unit : '')])
  if (product.unit) details.push(['Unidade', product.unit])
  if (product.stock != null && product.stock !== '')
    details.push(['Estoque', Number(product.stock) > 0 ? 'Disponível' : 'Indisponível'])

  function handleAdd() {
    onAddToCart({
      productId: product!.id,
      qty,
      variantId: selectedVariant?.id || null,
      variantName: selectedVariant?.name || (selectedVariant?.attributes
        ? Object.values(selectedVariant.attributes).filter(Boolean).join(' / ')
        : null),
      variantAttributes: selectedVariant?.attributes || null,
      configuratorSelections: configEnabled ? configSelectionsArray : null,
      configuratorSummary: configSummary || null,
      unitPrice: finalUnitPrice,
    })
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name || 'Produto'}
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center animate-in fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ animation: 'slideUp 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Image */}
        <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-gray-100 shrink-0">
          {imgSrc ? (
            <img
              src={optimizedImage(imgSrc, 800, 82)}
              srcSet={optimizedSrcset(imgSrc, [480, 640, 800, 1024], 82) || undefined}
              sizes="(min-width:640px) 28rem, 100vw"
              alt={product.name}
              className="w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 text-gray-700 grid place-items-center shadow-md hover:bg-white active:scale-90 transition"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pt-5 pb-4 space-y-4 flex-1">
          <div>
            {product.category && (
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                {product.category}
              </span>
            )}
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight mt-0.5">
              {product.name}
            </h2>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">
              {money(finalUnitPrice)}
            </span>
            {hasCompare && (
              <span className="text-sm text-gray-400 line-through tabular-nums">
                {money(displayedCompare!)}
              </span>
            )}
            {configPriceDelta !== 0 && (
              <span className="text-[11px] text-gray-500">
                ({money(displayedPrice)} base {configPriceDelta > 0 ? '+' : ''}{money(configPriceDelta)})
              </span>
            )}
          </div>

          {/* ── Stock badge (Fase 12) — only when tracked */}
          {(() => {
            const ss = product.stock_status || 'unlimited'
            const sq = product.stock_quantity == null ? null : Number(product.stock_quantity)
            if (ss === 'out_of_stock' || (sq !== null && sq <= 0)) {
              return (
                <p className="text-[12px] font-semibold text-red-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" /> Esgotado no momento
                </p>
              )
            }
            if (ss === 'low_stock' && sq !== null && sq > 0) {
              return (
                <p className="text-[12px] font-semibold text-amber-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Últimas {sq} unidades
                </p>
              )
            }
            return null
          })()}

          {/* ── Variants selector (Fase 1) ── */}
          {hasVariants && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Variação</p>
              <div className="flex flex-wrap gap-1.5">
                {variants.filter((v: any) => v.is_active !== false).map((v: any) => {
                  const label = String(v.name || '').trim() ||
                    Object.values(v.attributes || {}).filter(Boolean).join(' / ') ||
                    v.sku || 'variação'
                  const isSelected = v.id === (selectedVariantId || variants[0]?.id)
                  const outOfStock = v.stock_quantity != null && Number(v.stock_quantity) <= 0
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      disabled={outOfStock}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                        isSelected
                          ? 'bg-gray-900 text-white border-gray-900'
                          : outOfStock
                            ? 'bg-gray-50 text-gray-300 border-gray-200 line-through cursor-not-allowed'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {label}
                      {outOfStock && ' (esgotado)'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Configurator (Fase 4) — render groups when enabled */}
          {configEnabled && configurator!.groups!.map((g) => {
            const chosen = configSelections[g.id] || []
            const minSel = Number(g.min_select ?? (g.required ? 1 : 0))
            const maxSel = Number(g.max_select ?? 1)
            const singleSelect = maxSel === 1
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <p className="text-[11px] font-bold text-gray-600 tracking-wide">
                    {g.name}
                    {g.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <span className="text-[10px] text-gray-400">
                    {singleSelect ? 'escolha 1' : `${minSel}–${maxSel} opções`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.options.filter((o) => o.is_active !== false).map((o) => {
                    const isOn = chosen.includes(o.id)
                    return (
                      <button key={o.id} type="button"
                        onClick={() => {
                          setConfigSelections(prev => {
                            const cur = prev[g.id] || []
                            let next: string[]
                            if (singleSelect) {
                              next = isOn ? [] : [o.id]
                            } else {
                              if (isOn) next = cur.filter(x => x !== o.id)
                              else if (cur.length < maxSel) next = [...cur, o.id]
                              else next = cur
                            }
                            return { ...prev, [g.id]: next }
                          })
                        }}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                          isOn ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}>
                        {o.name}
                        {Number(o.price_delta || 0) !== 0 && (
                          <span className="ml-1 opacity-70 text-[10px]">
                            {Number(o.price_delta || 0) > 0 ? '+' : ''}{money(Number(o.price_delta))}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {product.description && (
            <p className="text-[14px] text-gray-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
          )}

          {details.length > 0 && (
            <div className="border-t border-border-light pt-4 space-y-2.5">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between text-[13px]">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bundle composition (Fase 11) — show what's included in this kit */}
          {Array.isArray(product.bundle_items) && product.bundle_items.length > 0 && allProducts && (() => {
            const items = product.bundle_items
              .map((bi) => {
                const p = allProducts.find((x) => x.id === bi.product_id)
                return p ? { ...bi, product: p } : null
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
            if (items.length === 0) return null
            return (
              <div className="border-t border-border-light pt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">
                  Este kit contém ({items.length} {items.length === 1 ? 'item' : 'itens'})
                </p>
                <div className="space-y-1.5">
                  {items.map((it) => {
                    const img = it.product.image || it.product.images?.[0]
                    return (
                      <button key={it.product_id} type="button"
                        onClick={() => onSelectProduct?.(it.product)}
                        className="w-full flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl p-2 text-left transition">
                        {img ? (
                          <img src={img} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 grid place-items-center shrink-0"><ImageOff size={14} className="text-gray-400" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-900 line-clamp-1">{it.product.name}</p>
                          {it.note && <p className="text-[10px] text-gray-500">{it.note}</p>}
                        </div>
                        <span className="text-[11px] font-bold text-gray-600 tabular-nums shrink-0">
                          {it.quantity}×
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Related products (Fase 6) */}
          {(() => {
            const ids = Array.isArray(product.related_product_ids) ? product.related_product_ids : []
            if (ids.length === 0 || !allProducts) return null
            const related = ids
              .map((id) => allProducts.find((p) => p.id === id))
              .filter((p): p is Product => Boolean(p))
            if (related.length === 0) return null
            return (
              <div className="border-t border-border-light pt-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Você também pode gostar</p>
                <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1 snap-x snap-mandatory">
                  {related.map((rp) => {
                    const img = rp.image || rp.images?.[0]
                    return (
                      <button key={rp.id} type="button"
                        onClick={() => onSelectProduct?.(rp)}
                        className="shrink-0 w-[120px] text-left snap-start group">
                        <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-1.5">
                          {img ? (
                            <img src={img} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ImageOff className="w-5 h-5 text-gray-300" /></div>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-gray-900 leading-tight line-clamp-2">{rp.name}</p>
                        <p className="text-[12px] font-bold text-gray-900 mt-0.5 tabular-nums">{money(rp.price)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Footer — CTA-aware (buy = cart; whatsapp = deeplink; quote/schedule/visit/simulate/subscribe = lead form) */}
        <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 border-t border-border-light bg-white sticky bottom-0 flex items-center gap-3 shrink-0">
          {(() => {
            const cta = (product.cta_type || 'buy') as OfferCta
            const meta = CTA_LABELS[cta] || CTA_LABELS.custom
            const Icon = meta.Icon
            /* Inventory (Fase 12) — gate CTA when out of stock; cap qty when low */
            const stockStatus = product.stock_status || 'unlimited'
            const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
            const isOutOfStock = stockStatus === 'out_of_stock' || (stockQty !== null && stockQty <= 0)
            const stockCap = stockQty !== null && stockQty > 0 ? stockQty : 999

            if (cta === 'buy') {
              return (
                <>
                  <div className="flex items-center bg-gray-100 rounded-full">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      aria-label="Diminuir quantidade"
                      disabled={qty <= 1 || isOutOfStock}
                      className="w-10 h-10 grid place-items-center rounded-full text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:hover:text-gray-600 active:scale-90 transition"
                    >
                      <Minus size={14} strokeWidth={2.25} />
                    </button>
                    <span className="w-8 text-center font-semibold tabular-nums text-[14px]">{qty}</span>
                    <button
                      onClick={() => setQty((q) => Math.min(stockCap, q + 1))}
                      aria-label="Aumentar quantidade"
                      disabled={isOutOfStock || qty >= stockCap}
                      className="w-10 h-10 grid place-items-center rounded-full text-gray-600 hover:text-gray-900 disabled:opacity-30 active:scale-90 transition"
                    >
                      <Plus size={14} strokeWidth={2.25} />
                    </button>
                  </div>
                  <Button onClick={handleAdd} size="lg" variant="brand" className="flex-1"
                    disabled={isOutOfStock || (configEnabled && configErrors.length > 0)}
                    title={
                      isOutOfStock ? 'Produto esgotado' :
                      configEnabled && configErrors.length > 0 ? configErrors.join(' · ') : undefined
                    }>
                    {isOutOfStock ? 'Esgotado'
                      : configEnabled && configErrors.length > 0
                      ? configErrors[0]
                      : `Adicionar · ${money(subtotal)}`}
                  </Button>
                </>
              )
            }

            if (cta === 'whatsapp') {
              return (
                <Button
                  onClick={() => whatsappPhone && openWhatsApp(whatsappPhone, product.name)}
                  size="lg"
                  variant="brand"
                  className="w-full"
                  disabled={!whatsappPhone}
                  title={!whatsappPhone ? 'WhatsApp não configurado pela loja' : undefined}
                >
                  <Icon size={15} strokeWidth={2.25} /> {meta.label}
                </Button>
              )
            }

            /* If product has service_config with usable hours, schedule/appointment CTAs open the booking calendar */
            const hasServiceConfig = Array.isArray(product.service_config?.weekday_hours) && product.service_config!.weekday_hours!.length > 0
            const isService = product.type === 'service' || product.type === 'appointment'
            const wantsBooking = (cta === 'schedule' || (isService && (cta === 'quote' || cta === 'custom'))) && hasServiceConfig

            return (
              <Button
                onClick={() => {
                  if (wantsBooking) setBookingOpen(true)
                  else setLeadFormFor(cta as Exclude<OfferCta, 'buy' | 'whatsapp'>)
                }}
                size="lg"
                variant="brand"
                className="w-full"
              >
                <Icon size={15} strokeWidth={2.25} /> {meta.label}
              </Button>
            )
          })()}
        </div>
      </div>

      {leadFormFor && (
        <LeadCaptureForm
          product={product}
          ctaType={leadFormFor}
          onClose={() => setLeadFormFor(null)}
        />
      )}

      {bookingOpen && (
        <ServiceBookingForm
          product={product}
          onClose={() => setBookingOpen(false)}
        />
      )}
    </div>
  )
}
