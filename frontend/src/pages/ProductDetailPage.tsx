import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { ArrowLeft, ShoppingBag, Package, Star, ImageOff } from 'lucide-react'
import { fetchProduct, fetchCatalog, type Product } from '@/lib/api'
import { getStoreSlug, storeUrl, money } from '@/lib/store-context'
import { captureAffiliateFromUrl } from '@/lib/affiliate-tracking'
import { useCartStore } from '@/lib/store'
import { applyProductSeo } from '@/lib/product-seo'
import { absoluteProductUrl, productPath } from '@/lib/product-url'
import { collectProductImages } from '@/lib/product-images'
import { ProductShareButton } from '@/components/ProductShareButton'
import { StoreMarketingLayer } from '@/components/store/StoreMarketingLayer'
import { ProductTrustBlock } from '@/components/store/ProductTrustBlock'
import { CartDrawer } from '@/components/store/CartDrawer'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ProductPurchasePanel, useProductPurchase } from '@/components/product/ProductPurchasePanel'
import { ProductReviewsSection } from '@/components/product/ProductReviewsSection'
import type { StoreData } from '@/lib/api'
import { normalizeConversionSettings } from '@/lib/store-conversion'

const PRODUCT_CONTENT_HEADINGS = new Set([
  'Visão geral',
  'Por que escolher',
  'Detalhes que fazem diferença',
  'Para quem é',
  'Como aproveitar melhor',
])

function ProductEditorialContent({ description, features }: { description?: string; features?: string[] }) {
  const lines = String(description || '').split(/\r?\n/).map(line => line.trim())
  const blocks: Array<{ title?: string; paragraphs: string[]; bullets: string[] }> = []
  let current: { title?: string; paragraphs: string[]; bullets: string[] } = { paragraphs: [], bullets: [] }
  const flush = () => {
    if (current.title || current.paragraphs.length || current.bullets.length) blocks.push(current)
    current = { paragraphs: [], bullets: [] }
  }
  for (const line of lines) {
    if (!line) continue
    if (PRODUCT_CONTENT_HEADINGS.has(line.replace(/:$/, ''))) {
      flush()
      current.title = line.replace(/:$/, '')
    } else if (/^[•*-]\s+/.test(line)) {
      current.bullets.push(line.replace(/^[•*-]\s+/, ''))
    } else {
      current.paragraphs.push(line)
    }
  }
  flush()
  const safeFeatures = (features || []).map(item => String(item).trim()).filter(Boolean)
  if (!blocks.length && !safeFeatures.length) return null

  return (
    <section className="product-editorial">
      <div className="product-editorial__head">
        <p className="product-editorial__eyebrow">Conheça melhor</p>
        <h2 className="product-section-title">Tudo sobre o produto</h2>
      </div>
      {safeFeatures.length > 0 && (
        <div className="product-editorial__benefits">
          {safeFeatures.slice(0, 6).map((feature, index) => (
            <div key={`${feature}-${index}`} className="product-editorial__benefit">
              <span aria-hidden="true">✓</span>
              <p>{feature}</p>
            </div>
          ))}
        </div>
      )}
      <div className="product-editorial__sections">
        {blocks.map((block, index) => (
          <article key={`${block.title || 'texto'}-${index}`} className="product-editorial__section">
            {block.title && <h3>{block.title}</h3>}
            {block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            {block.bullets.length > 0 && (
              <ul>
                {block.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function applyStoreBrand(store: {
  brand?: { primary_color?: string; secondary_color?: string }
  theme?: { primary_color?: string; secondary_color?: string }
}) {
  const brand = store.brand || {}
  const theme = store.theme || {}
  const primary = brand.primary_color || theme.primary_color || '#111827'
  const secondary = brand.secondary_color || theme.secondary_color || '#3b82f6'
  const root = document.documentElement
  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-secondary', secondary)
  root.style.setProperty('--brand-primary-light', primary + '0d')
  root.style.setProperty('--brand-secondary-light', secondary + '14')
  root.style.setProperty('--brand-secondary-soft', secondary + '1a')
}

function DetailSkeleton() {
  return (
    <div className="store-page product-detail page-enter min-h-screen">
      <div className="store-topbar safe-area-top">
        <div className="h-14 max-w-[var(--product-detail-max)] mx-auto px-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl skeleton shrink-0" />
          <div className="skeleton h-4 flex-1 max-w-[12rem] rounded" />
        </div>
      </div>
      <div className="max-w-[var(--product-detail-max)] mx-auto px-4 py-6 lg:grid lg:grid-cols-2 lg:gap-12">
        <div className="aspect-square rounded-2xl skeleton" />
        <div className="mt-8 lg:mt-0 space-y-4">
          <div className="skeleton h-6 w-24 rounded-full" />
          <div className="skeleton h-9 w-4/5 rounded" />
          <div className="skeleton h-10 w-1/3 rounded" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export function ProductDetailPage() {
  const navigate = useNavigate()
  const { slug: routeStoreSlug, productSlug: routeProductSlug } = useParams<{
    slug?: string
    productSlug?: string
  }>()
  const addItem = useCartStore((s) => s.addItem)
  const totalItems = useCartStore((s) => s.totalItems())
  const openDrawer = useCartStore((s) => s.openDrawer)

  const [product, setProduct] = useState<Product | null>(null)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [storeName, setStoreName] = useState('')
  const [storeSnapshot, setStoreSnapshot] = useState<StoreData['store'] | null>(null)
  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null)
  const [catalogSlug, setCatalogSlug] = useState(routeStoreSlug || getStoreSlug())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addedFlash, setAddedFlash] = useState(false)

  const purchase = useProductPurchase(product)

  const productSlug = decodeURIComponent(routeProductSlug || '').trim()
  const storeSlugForApi = decodeURIComponent(routeStoreSlug || catalogSlug || getStoreSlug()).trim()

  useEffect(() => {
    captureAffiliateFromUrl().catch(() => {})
  }, [])

  useEffect(() => {
    if (!productSlug) {
      setError('Produto não encontrado')
      setLoading(false)
      return
    }
    if (!storeSlugForApi) {
      setError('Loja não encontrada')
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      fetchProduct(productSlug, storeSlugForApi),
      fetchCatalog(storeSlugForApi).catch(() => null),
    ])
      .then(([productRes, catalogRes]) => {
        setProduct(productRes.product)
        const resolvedSlug = String(
          productRes.store?.slug || catalogRes?.store?.slug || storeSlugForApi,
        ).trim()
        if (resolvedSlug) setCatalogSlug(resolvedSlug)

        const domain =
          productRes.store?.primary_domain ||
          catalogRes?.store?.primary_domain ||
          null
        setPrimaryDomain(domain ? String(domain) : null)

        if (catalogRes?.store) {
          applyStoreBrand(catalogRes.store)
          setStoreSnapshot(catalogRes.store)
          setAllProducts(catalogRes.all_products || [])
          const brand = catalogRes.store.brand
          setStoreName(brand?.name || catalogRes.store.name || resolvedSlug)
        } else if (productRes.store) {
          const brand = productRes.store.brand
          setStoreName(brand?.name || productRes.store.name || resolvedSlug)
          setStoreSnapshot({
            name: productRes.store.name || '',
            slug: resolvedSlug,
            brand: productRes.store.brand,
            marketing: undefined,
            primary_domain: domain,
          })
        }

        const brand = catalogRes?.store?.brand || productRes.store?.brand
        const name = brand?.name || catalogRes?.store?.name || productRes.store?.name || resolvedSlug
        applyProductSeo({
          product: productRes.product,
          storeName: name,
          canonicalUrl: absoluteProductUrl(productRes.product, {
            catalogSlug: resolvedSlug,
            primaryDomain: domain,
            fallbackOrigin: window.location.origin,
          }),
        })
      })
      .catch(() => setError('Não foi possível carregar o produto.'))
      .finally(() => setLoading(false))
  }, [productSlug, storeSlugForApi])

  const images = useMemo(() => {
    if (!product) return []
    return collectProductImages(product, purchase.pricing?.variantImage)
  }, [product, purchase.pricing?.variantImage])

  const relatedProducts = useMemo(() => {
    if (!product?.related_product_ids?.length || !allProducts.length) return []
    return product.related_product_ids
      .map((id) => allProducts.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 6)
  }, [product, allProducts])

  function handleAdd(payload: Parameters<typeof addItem>[0]) {
    if (!product) return
    addItem(payload, 1, { openDrawer: true })
    setAddedFlash(true)
    window.setTimeout(() => setAddedFlash(false), 2200)
  }

  const conversion = normalizeConversionSettings(storeSnapshot?.marketing as any)
  const profileAny = (storeSnapshot as any)?.profile || {}
  const freeAbove = Number(profileAny.free_shipping_above) || 0
  const deliveryFee = Number(profileAny.delivery_fee) || 0
  const deliveryTime = String(profileAny.delivery_time_text || '')

  if (loading) return <DetailSkeleton />

  if (error || !product) {
    return (
      <div className="store-page min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
          <Package className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
        </div>
        <p className="text-[15px] font-semibold text-gray-900">{error || 'Produto não encontrado'}</p>
        <button
          type="button"
          onClick={() => navigate(storeUrl(undefined, catalogSlug))}
          className="mt-4 text-[13px] font-semibold text-brand hover:opacity-80 transition"
        >
          Voltar ao catálogo
        </button>
      </div>
    )
  }

  const categoryLabel = product.category_name || product.category
  const pricing = purchase.pricing
  const showRating = Number(product.reviews_count || 0) > 0 && Number(product.reviews_avg || 0) > 0

  return (
    <div className="store-page product-detail page-enter min-h-screen pb-28 lg:pb-16">
      <header className="store-topbar sticky top-0 z-50 safe-area-top">
        <div className="flex items-center justify-between px-4 h-14 max-w-[var(--product-detail-max)] mx-auto gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate(storeUrl(undefined, catalogSlug))}
              aria-label="Voltar ao catálogo"
              className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-gray-800 hover:bg-gray-100 active:scale-95 transition"
            >
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
            <div className="min-w-0">
              {storeName && (
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">
                  {storeName}
                </p>
              )}
              <h1 className="text-[14px] sm:text-[15px] font-semibold text-gray-900 tracking-tight truncate">
                {product.name}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Carrinho${totalItems > 0 ? ` (${totalItems} itens)` : ''}`}
            className="relative grid place-items-center w-10 h-10 rounded-full text-gray-800 hover:bg-gray-100 active:scale-95 transition shrink-0"
          >
            <ShoppingBag size={19} strokeWidth={1.75} />
            {totalItems > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center px-1 ring-2 ring-white tabular-nums">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-[var(--product-detail-max)] mx-auto px-4 py-5 lg:py-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:items-start">
          {/* Galeria — sticky no desktop */}
          <div className="product-detail__gallery lg:sticky lg:top-[4.25rem]">
            <ProductGallery
              images={images}
              productName={product.name}
              discount={pricing?.discount}
              isOutOfStock={pricing?.stock.isOutOfStock}
              isLowStock={pricing?.stock.isLowStock}
              stockQty={pricing?.stock.displayQty}
              resetKey={`${product.id}-${purchase.selectedVariantId || ''}`}
            />
          </div>

          {/* Info + compra */}
          <div className="mt-6 lg:mt-0 space-y-5">
            {categoryLabel && (
              <span className="store-chip bg-brand-soft text-brand">{categoryLabel}</span>
            )}

            <div>
              <h2 className="product-detail__title text-wrap-balance">{product.name}</h2>
              {product.subtitle && (
                <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">{product.subtitle}</p>
              )}
            </div>

            {showRating && (
              <a
                href="#avaliacoes"
                className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-gray-900 transition"
              >
                <Star size={14} className="text-amber-400 fill-amber-400" strokeWidth={2} />
                <span className="font-semibold text-gray-800 tabular-nums">
                  {Number(product.reviews_avg).toFixed(1)}
                </span>
                <span className="text-gray-500 underline-offset-2 hover:underline">
                  {Number(product.reviews_count)}{' '}
                  {Number(product.reviews_count) === 1 ? 'avaliação' : 'avaliações'}
                </span>
              </a>
            )}

            <ProductPurchasePanel
              product={product}
              purchase={purchase}
              onAdd={handleAdd}
              layout="card"
              showPriceHeader
            />

            {conversion.show_pdp_trust && (
              <ProductTrustBlock
                freeAbove={freeAbove}
                deliveryFee={deliveryFee}
                deliveryTime={deliveryTime}
              />
            )}

            <ProductShareButton
              product={product}
              catalogSlug={catalogSlug}
              primaryDomain={primaryDomain}
            />

            {addedFlash && (
              <div
                role="status"
                className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between gap-3"
              >
                <p className="text-[13px] font-semibold text-emerald-800">Adicionado ao carrinho!</p>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="text-[12px] font-bold text-emerald-700 hover:text-emerald-900"
                >
                  Ver carrinho →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Seções full-width abaixo do grid */}
        <div className="mt-10 lg:mt-14 space-y-10 max-w-3xl">
          <ProductEditorialContent description={product.description} features={product.features} />

          {(product.sku || product.weight || product.unit) && (
            <section className="product-specs">
              <h2 className="product-section-title">Detalhes</h2>
              <dl className="mt-3 divide-y divide-gray-100 rounded-2xl ring-1 ring-black/[0.04] overflow-hidden bg-white">
                {product.sku && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-[13px]">
                    <dt className="text-gray-500">SKU</dt>
                    <dd className="font-medium text-gray-900">{product.sku}</dd>
                  </div>
                )}
                {product.weight && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-[13px]">
                    <dt className="text-gray-500">Peso</dt>
                    <dd className="font-medium text-gray-900">
                      {product.weight}
                      {product.weight_unit ? ` ${product.weight_unit}` : ''}
                    </dd>
                  </div>
                )}
                {product.unit && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-[13px]">
                    <dt className="text-gray-500">Unidade</dt>
                    <dd className="font-medium text-gray-900">{product.unit}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <ProductReviewsSection product={product} variant="page" />

          {relatedProducts.length > 0 && (
            <section>
              <h2 className="product-section-title">Você também pode gostar</h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {relatedProducts.map((rp) => {
                  const img = rp.image || rp.images?.[0]
                  return (
                    <Link
                      key={rp.id}
                      to={productPath(rp, catalogSlug)}
                      className="product-related-card group"
                    >
                      <div className="product-related-card__img">
                        {img ? (
                          <img src={img} alt={rp.name} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center bg-gray-100">
                            <ImageOff size={18} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      <p className="product-related-card__name">{rp.name}</p>
                      <p className="product-related-card__price tabular-nums">{money(rp.price)}</p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Sticky ATC mobile — compacto; FAB sobe via CSS */}
      {conversion.sticky_atc && (
        <div className="product-detail-bar product-detail-bar--sticky lg:hidden fixed inset-x-0 z-40">
          <div className="max-w-[var(--product-detail-max)] mx-auto px-3 pt-2.5 pb-2">
            <ProductPurchasePanel
              product={product}
              purchase={purchase}
              onAdd={handleAdd}
              layout="bar"
              showPriceHeader={false}
            />
          </div>
        </div>
      )}

      <StoreMarketingLayer
        marketing={storeSnapshot?.marketing}
        whatsappPhone={storeSnapshot?.brand?.whatsapp_phone}
        page="product"
        brandPrimary={storeSnapshot?.brand?.primary_color || storeSnapshot?.theme?.primary_color}
      />

      <CartDrawer
        products={allProducts}
        catalogSlug={catalogSlug}
        enableUpsell={conversion.cart_upsell}
      />
    </div>
  )
}
