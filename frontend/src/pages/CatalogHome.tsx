import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package } from 'lucide-react'
import { fetchCatalog, type Product, type StoreData } from '@/lib/api'
import { useCartStore } from '@/lib/store'
import { ProductCard } from '@/components/ProductCard'
import { ProductSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { applySeo, truncate } from '@/lib/seo'
import { StoreHero } from '@/components/store/StoreHero'
import { StoreMarketingLayer } from '@/components/store/StoreMarketingLayer'
import { StoreFilters } from '@/components/store/StoreFilters'
import { StoreSection } from '@/components/store/StoreSection'
import { StoreCategoryCarousel } from '@/components/store/StoreCategoryCarousel'
import { StoreAnnouncementBar } from '@/components/store/StoreAnnouncementBar'
import { StoreTrustStrip } from '@/components/store/StoreTrustStrip'
import { StorePromoCountdown } from '@/components/store/StorePromoCountdown'
import { shouldShowCategoryCarousel, type StoreCatalogCategory } from '@/lib/store-design'
import {
  captureAffiliateFromUrl,
  getAffiliateCoupon,
  getAffiliateDisplayName,
} from '@/lib/affiliate-tracking'
import { productPath } from '@/lib/product-url'
import { getStoreSlug } from '@/lib/store-context'
import {
  aggregateStoreReviews,
  buildAnnouncementText,
  buildTrustItems,
  normalizeConversionSettings,
  pickBestSellers,
} from '@/lib/store-conversion'
import {
  StoreReviewsHighlight,
  type StoreReviewSnippet,
} from '@/components/store/StoreReviewsHighlight'

interface CatalogHomeProps {
  onStoreLoaded: (store: StoreData['store']) => void
  onProductsLoaded?: (products: Product[], slug: string) => void
}

interface CatalogCollection {
  id: string
  slug: string
  name: string
  description?: string | null
  image_url?: string | null
  position?: number
  product_ids: string[]
}

interface AttributeFilterDef {
  id: string
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi_select' | 'color' | 'date'
  options: string[]
  is_filter: boolean
}

function HeroSkeletonBlock() {
  return (
    <div className="store-hero">
      <div className="store-hero__placeholder skeleton" />
      <div className="relative z-10 max-w-[var(--store-max)] mx-auto px-4 -mt-10 pb-5">
        <div className="store-identity">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-2xl skeleton shrink-0" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="skeleton h-5 w-2/3 rounded" />
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-4/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CatalogHome({ onStoreLoaded, onProductsLoaded }: CatalogHomeProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [catalogSlug, setCatalogSlug] = useState(getStoreSlug())
  const [products, setProducts] = useState<Product[]>([])
  const [collections, setCollections] = useState<CatalogCollection[]>([])
  const [attrDefs, setAttrDefs] = useState<AttributeFilterDef[]>([])
  const [attrFilters, setAttrFilters] = useState<Record<string, string>>({})
  const [store, setStore] = useState<StoreData['store'] | null>(null)
  const [storeCategories, setStoreCategories] = useState<StoreCatalogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [affiliateBanner, setAffiliateBanner] = useState<{ name: string; coupon: string } | null>(null)
  const [recentReviews, setRecentReviews] = useState<StoreReviewSnippet[]>([])
  const addItem = useCartStore((s) => s.addItem)
  const { showToast } = useToast()

  useEffect(() => {
    captureAffiliateFromUrl()
      .then((result) => {
        if (result.ok && (result.coupon || result.ref)) {
          const coupon = result.coupon || getAffiliateCoupon() || ''
          const name = result.displayName || getAffiliateDisplayName() || result.ref || 'parceiro'
          setAffiliateBanner({ name, coupon })
          if (coupon) {
            showToast(`Cupom ${coupon} será aplicado no checkout`)
          }
          return
        }
        if (result.error) {
          showToast(result.error)
        }
      })
      .catch(() => {})
    fetchCatalog()
      .then((data) => {
        setStore(data.store)
        const slug = String((data.store as any)?.slug || getStoreSlug()).trim()
        if (slug) setCatalogSlug(slug)
        const list = data.all_products || []
        setProducts(list)
        const snippets = Array.isArray((data as any).recent_reviews)
          ? ((data as any).recent_reviews as StoreReviewSnippet[])
          : []
        setRecentReviews(snippets)
        onProductsLoaded?.(list, slug)
        setStoreCategories(
          Array.isArray(data.store_categories)
            ? data.store_categories
            : Array.isArray((data as any).categories)
              ? (data as any).categories.filter((c: StoreCatalogCategory) => c?.id && c?.name)
              : [],
        )
        setCollections(Array.isArray((data as any).collections) ? (data as any).collections : [])
        setAttrDefs(Array.isArray((data as any).attribute_definitions) ? (data as any).attribute_definitions : [])
        onStoreLoaded(data.store)

        const b = data.store.brand || {}
        const t = data.store.theme || {}
        const p = (data.store as any).profile || {}
        const brandName = b.name || (data.store as any).name || 'Catálogo'
        const slogan = b.slogan || b.description || ''
        applySeo({
          title: slogan ? `${brandName} — ${slogan}` : brandName,
          description: truncate(b.description || slogan, 160),
          image: (b as any).cover_image || (t as any).cover_image || p.cover_image || b.logo_url,
          url: typeof window !== 'undefined' ? window.location.href : null,
        })

        const brand = data.store.brand
        const theme = data.store.theme
        const primary = brand?.primary_color || theme?.primary_color || '#111827'
        const secondary = brand?.secondary_color || theme?.secondary_color || '#3b82f6'
        const root = document.documentElement
        root.style.setProperty('--brand-primary', primary)
        root.style.setProperty('--brand-secondary', secondary)
        root.style.setProperty('--brand-primary-light', primary + '0d')
        root.style.setProperty('--brand-secondary-light', secondary + '14')
        root.style.setProperty('--brand-secondary-soft', secondary + '1a')
      })
      .catch((err) => setError(err.message || 'Erro ao carregar catálogo'))
      .finally(() => setLoading(false))
  }, [onStoreLoaded])

  /* Links antigos ?produto=slug ou ?p=slug → página dedicada do produto */
  useEffect(() => {
    if (!catalogSlug || products.length === 0) return
    const legacySlug =
      searchParams.get('produto')?.trim() ||
      searchParams.get('p')?.trim() ||
      searchParams.get('product')?.trim()
    if (!legacySlug) return
    const match =
      products.find((p) => p.slug === legacySlug) ||
      products.find((p) => p.id === legacySlug)
    if (!match) return
    navigate(productPath(match, catalogSlug), { replace: true })
  }, [catalogSlug, products, searchParams, navigate])

  function handleQuickAdd(productId: string) {
    addItem(productId)
    const p = products.find((x) => x.id === productId)
    showToast((p?.name || 'Produto') + ' adicionado')
  }



  function handleAttrFilterToggle(key: string, value: string) {
    setAttrFilters((prev) => {
      const next = { ...prev }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  const brand = store?.brand
  const profile = store?.profile
  const displayName = brand?.name || store?.name || 'Loja'
  const displaySlogan = brand?.slogan || brand?.description || ''
  const logoUrl = brand?.logo_url || store?.theme?.logo_url || ''
  const isOpen = (profile?.status || 'aberto').toLowerCase() === 'aberto'

  const categories = [...new Set(products.map((p) => p.category || p.category_name).filter(Boolean))]
  const activeAttrFilters = Object.entries(attrFilters).filter(([_, v]) => v && v !== '')
  const filtered = products.filter((p) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(p.name || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false
    }
    if (selectedCategory && (p.category || p.category_name) !== selectedCategory) return false
    for (const [key, val] of activeAttrFilters) {
      const attrs = (p as any).attributes || {}
      const productVal = attrs[key]
      if (productVal == null) return false
      if (Array.isArray(productVal)) {
        if (!productVal.map((x: any) => String(x).toLowerCase()).includes(String(val).toLowerCase())) return false
      } else if (String(productVal).toLowerCase() !== String(val).toLowerCase()) {
        return false
      }
    }
    return true
  })

  const valuesByAttrKey: Record<string, string[]> = {}
  for (const def of attrDefs) {
    if (!def.is_filter) continue
    const set = new Set<string>()
    for (const p of products) {
      const v = (p as any).attributes?.[def.key]
      if (v == null) continue
      if (Array.isArray(v)) {
        v.forEach((x: any) => {
          const s = String(x).trim()
          if (s) set.add(s)
        })
      } else {
        const s = String(v).trim()
        if (s) set.add(s)
      }
    }
    if (set.size > 0) valuesByAttrKey[def.key] = Array.from(set).sort()
  }

  const profileAny = (profile as any) || {}
  const freeAbove = Number(profileAny.free_shipping_above) || 0
  const deliveryFee = Number(profileAny.delivery_fee) || 0
  const deliveryTime = profileAny.delivery_time_text || ''

  const coverImage =
    (profile as any)?.cover_image ||
    (brand as any)?.cover_image ||
    (brand as any)?.cover_image_url ||
    (store as any)?.theme?.cover_image ||
    (store as any)?.theme?.cover_image_url ||
    (store as any)?.theme?.hero_image ||
    ''

  const showCollections = !loading && !searchQuery && !selectedCategory && collections.length > 0
  const showCategoryCarousel = !loading && shouldShowCategoryCarousel(storeCategories, store?.design)

  const conversion = normalizeConversionSettings(store?.marketing as any)
  const announceText = buildAnnouncementText({
    configured: conversion.announcement_bar.text,
    freeAbove,
    deliveryTime,
  })
  const trustItems = buildTrustItems({
    freeAbove,
    deliveryFee,
    deliveryTime,
    customItems: conversion.trust_strip.items,
  })
  const bestSellers =
    !loading && conversion.show_best_sellers && !searchQuery && !selectedCategory
      ? pickBestSellers(products, conversion.best_sellers_limit)
      : []
  const bestSellerIds = new Set(bestSellers.map((p) => p.id))
  const storeReviews = !loading ? aggregateStoreReviews(products) : { count: 0, avg: 0, topProducts: [] }
  const showHomeExtras = !searchQuery && !selectedCategory

  return (
    <div className="store-page page-enter">
      {conversion.announcement_bar.enabled && announceText && (
        <StoreAnnouncementBar
          text={announceText}
          linkUrl={conversion.announcement_bar.link_url}
          dismissible={conversion.announcement_bar.dismissible}
        />
      )}

      {conversion.promo_ends_at && (
        <div className="max-w-[var(--store-max)] mx-auto px-4 pt-2">
          <StorePromoCountdown
            endsAt={conversion.promo_ends_at}
            label={conversion.promo_label}
          />
        </div>
      )}

      {loading ? (
        <HeroSkeletonBlock />
      ) : (
        <StoreHero
          displayName={displayName}
          displaySlogan={displaySlogan}
          logoUrl={logoUrl}
          coverImage={coverImage}
          isOpen={isOpen}
        />
      )}

      {/* Único lugar de frete/pagamento — sem chips no card de identidade */}
      {!loading && conversion.trust_strip.enabled && trustItems.length > 0 && (
        <div className="max-w-[var(--store-max)] mx-auto px-4 -mt-1 mb-2">
          <StoreTrustStrip items={trustItems} />
        </div>
      )}

      {affiliateBanner && (
        <div className="max-w-[var(--store-max)] mx-auto px-4 -mt-2 mb-3">
          <div
            className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            style={{
              borderColor: 'var(--brand-secondary-soft, #e5e7eb)',
              background: 'var(--brand-secondary-light, #f9fafb)',
            }}
          >
            <p className="font-semibold text-gray-900">
              Indicação de {affiliateBanner.name}
            </p>
            {affiliateBanner.coupon ? (
              <p className="text-xs text-gray-600 mt-1">
                Cupom <strong className="tracking-wider">{affiliateBanner.coupon}</strong> será aplicado automaticamente no checkout.
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-1">Sua compra será atribuída a este parceiro.</p>
            )}
          </div>
        </div>
      )}

      {showCategoryCarousel && (
        <StoreCategoryCarousel
          categories={storeCategories}
          products={products}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          shape={store?.design?.categories_carousel?.shape === 'round' ? 'round' : 'rounded'}
        />
      )}

      <StoreFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categories as string[]}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        attrDefs={attrDefs}
        valuesByAttrKey={valuesByAttrKey}
        attrFilters={attrFilters}
        onAttrFilterToggle={handleAttrFilterToggle}
        onClearAttrFilters={() => setAttrFilters({})}
        activeAttrFilterCount={activeAttrFilters.length}
        hideCategoryChips={showCategoryCarousel}
      />

      <div className="max-w-[var(--store-max)] mx-auto px-4 pt-5 pb-28 space-y-8">
        {showHomeExtras && (
          <StoreReviewsHighlight
            avg={storeReviews.avg}
            count={storeReviews.count}
            products={storeReviews.topProducts}
            catalogSlug={catalogSlug}
            snippets={recentReviews}
          />
        )}

        {showHomeExtras && bestSellers.length >= 3 && (
          <StoreSection title={conversion.best_sellers_title} count={bestSellers.length}>
            <div className="store-collection-track -mx-4 px-4">
              {bestSellers.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  catalogSlug={catalogSlug}
                  onQuickAdd={handleQuickAdd}
                  priority={i < 3}
                  bestSellerIds={bestSellerIds}
                  showBadges={conversion.show_product_badges}
                />
              ))}
            </div>
          </StoreSection>
        )}

        {showCollections && (
          <div className="space-y-8">
            {collections.map((col) => {
              const colProducts = col.product_ids
                .map((id) => products.find((p) => p.id === id))
                .filter((p): p is Product => Boolean(p))
              if (colProducts.length === 0) return null
              return (
                <StoreSection
                  key={col.id}
                  title={col.name}
                  description={col.description}
                  count={colProducts.length}
                >
                  <div className="store-collection-track -mx-4 px-4">
                    {colProducts.map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        catalogSlug={catalogSlug}
                        onQuickAdd={handleQuickAdd}
                        priority={i < 3}
                        bestSellerIds={bestSellerIds}
                        showBadges={conversion.show_product_badges}
                      />
                    ))}
                  </div>
                </StoreSection>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="store-product-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-gray-200 bg-white">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mb-3">
              <Package className="w-6 h-6 text-gray-500" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-semibold text-gray-900">Nenhum produto encontrado</p>
            <p className="text-[13px] text-gray-600 mt-1">Tente outra busca ou categoria</p>
          </div>
        ) : (
          <StoreSection
            title={showCollections || bestSellers.length >= 3 ? 'Todos os produtos' : 'Produtos'}
            count={filtered.length}
          >
            <div className="store-product-grid">
              {filtered.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  catalogSlug={catalogSlug}
                  onQuickAdd={handleQuickAdd}
                  priority={i < 6}
                  bestSellerIds={bestSellerIds}
                  showBadges={conversion.show_product_badges}
                />
              ))}
            </div>
          </StoreSection>
        )}
      </div>

      <StoreMarketingLayer
        marketing={store?.marketing}
        whatsappPhone={(brand as any)?.whatsapp_phone}
        page="home"
        brandPrimary={brand?.primary_color || (store as any)?.theme?.primary_color}
      />
    </div>
  )
}