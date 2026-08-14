import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ImageOff, Star } from 'lucide-react'
import type { Product } from '@/lib/api'
import { money, resolveProductPrice, resolveProductPromoPrice, getStoreCurrency } from '@/lib/store-context'
import { productUrl } from '@/lib/product-url'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { resolveProductBadges } from '@/lib/store-conversion'
import {
  getProductVolumePricingFromPrice,
  isProductVolumePricingEnabled,
} from '@/lib/product-volume-pricing'

interface ProductCardProps {
  product: Product
  catalogSlug: string
  onQuickAdd: (productId: string) => void
  priority?: boolean
  bestSellerIds?: Set<string>
  showBadges?: boolean
}

export function ProductCard({
  product,
  catalogSlug,
  onQuickAdd,
  priority = false,
  bestSellerIds,
  showBadges = true,
}: ProductCardProps) {
  const href = productUrl(product, catalogSlug)
  const rawSrc = product.image || product.images?.[0] || ''
  const imgSrc = optimizedImage(rawSrc, 320)
  const imgSrcset = optimizedSrcset(rawSrc, [240, 320, 480, 640])
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    imgSrc ? 'loading' : 'error',
  )
  const hasCompare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
  const stockStatus = product.stock_status || 'unlimited'
  const stockQty = product.stock_quantity == null ? null : Number(product.stock_quantity)
  const availabilityMode = product.metadata?.availability_mode || 'standard'
  const now = Date.now()
  const preorderStart = product.metadata?.preorder_starts_at ? new Date(product.metadata.preorder_starts_at).getTime() : null
  const preorderEnd = product.metadata?.preorder_ends_at ? new Date(product.metadata.preorder_ends_at).getTime() : null
  const preorderOpen = availabilityMode === 'preorder' && (!preorderStart || preorderStart <= now) && (!preorderEnd || preorderEnd >= now)
  const isOutOfStock = !preorderOpen && (availabilityMode !== 'standard' || stockStatus === 'out_of_stock' || (stockQty !== null && stockQty <= 0))
  const badges = resolveProductBadges(product, { bestSellerIds, showBadges })
  const volumeEnabled = isProductVolumePricingEnabled(product)
  const volumeFrom = volumeEnabled ? getProductVolumePricingFromPrice(product) : null
  const currency = getStoreCurrency()
  const localizedPrice = resolveProductPrice(product, currency)
  const localizedPromo = resolveProductPromoPrice(product, currency)
  const displayPrice =
    volumeFrom != null && Number.isFinite(volumeFrom)
      ? volumeFrom
      : (localizedPromo && localizedPromo < localizedPrice ? localizedPromo : localizedPrice)

  return (
    <Link
      to={href}
      state={{ fromCatalog: true }}
      className="group relative cursor-pointer flex h-full flex-col rounded-[20px] border border-gray-200 bg-white p-2.5 no-underline text-inherit transition-[box-shadow,transform,border-color] duration-200 md:hover:-translate-y-1 md:hover:border-gray-300 md:hover:shadow-[var(--shadow-elevated)]"
      aria-label={`Ver ${product.name || 'produto'}`}
    >
      <div className="relative aspect-[4/5] rounded-[16px] overflow-hidden bg-gray-100 ring-1 ring-black/[0.04]">
        {imgSrc && imgState !== 'error' && (
          <img
            src={imgSrc}
            srcSet={imgSrcset || undefined}
            sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imgState === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImgState('loaded')}
            onError={() => setImgState('error')}
          />
        )}

        {imgState === 'loading' && <div className="absolute inset-0 skeleton" />}

        {imgState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <ImageOff className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
          </div>
        )}

        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-[1]">
            {badges.map((b) => (
              <span
                key={b.kind}
                className={`store-product-badge store-product-badge--${b.kind}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        {isOutOfStock && <div className="absolute inset-0 bg-white/45 pointer-events-none" />}
        {availabilityMode !== 'standard' && (
          <span className="absolute bottom-2.5 left-2.5 z-[2] rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-gray-900 shadow-sm ring-1 ring-black/5">
            {preorderOpen ? 'Pré-venda' : availabilityMode === 'coming_soon' ? 'Em breve' : 'Esgotado'}
          </span>
        )}

        {(!product.cta_type || product.cta_type === 'buy') && !isOutOfStock && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuickAdd(product.id)
            }}
            aria-label={`Adicionar ${product.name}`}
            className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-brand text-white grid place-items-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:translate-y-1 md:group-hover:translate-y-0 transition-all active:scale-90"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        {(product.category_name || product.category) && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand line-clamp-1">{product.category_name || product.category}</p>}
        <h3 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 tracking-tight">
          {product.name || 'Produto'}
        </h3>
        {product.subtitle && (
          <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">{product.subtitle}</p>
        )}
        {product.features?.length ? (
          <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
            {product.features.slice(0, 2).map((f, i) => (
              <li key={i} className="line-clamp-1">✓ {f}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-baseline gap-1.5 flex-wrap pt-3">
          {volumeEnabled && volumeFrom != null ? (
            <>
              <span className="text-[11px] font-semibold text-emerald-800">A partir de</span>
              <span className="text-[15px] font-bold text-gray-900 tabular-nums tracking-tight">
                {money(displayPrice)}
              </span>
            </>
          ) : (
            <span className="text-[15px] font-bold text-gray-900 tabular-nums tracking-tight">
                {money(displayPrice, currency)}
            </span>
          )}
          {hasCompare && !volumeEnabled && (
            <span className="text-[11px] font-medium text-gray-500 line-through tabular-nums">
              {money(localizedPrice, currency)}
            </span>
          )}
        </div>
        {product.unit && <p className="mt-0.5 text-[10px] font-medium text-gray-500">por {product.unit}</p>}
        <span className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl bg-gray-950 px-3 text-[11px] font-bold text-white transition group-hover:bg-brand">Ver detalhes</span>
        {volumeEnabled && (
          <p className="text-[11px] font-medium text-emerald-800/90 leading-snug">
            Preço progressivo · mais volume, menos por unidade
          </p>
        )}

        {Number(product.reviews_count || 0) > 0 && Number(product.reviews_avg || 0) > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Star size={11} className="text-amber-400 fill-amber-400" strokeWidth={2} />
            <span className="font-semibold text-gray-800 tabular-nums">
              {Number(product.reviews_avg).toFixed(1)}
            </span>
            <span className="text-gray-500">({Number(product.reviews_count)})</span>
          </div>
        )}
      </div>
    </Link>
  )
}
