export type CategoryCarouselShape = 'round' | 'rounded'

export type StoreDesignCategoriesCarousel = {
  enabled: boolean
  shape: CategoryCarouselShape
}

export type StoreDesign = {
  categories_carousel: StoreDesignCategoriesCarousel
}

export type StoreCatalogCategory = {
  id: string
  name: string
  cover_image?: string | null
  color?: string | null
  count?: number
}

export const DEFAULT_STORE_DESIGN: StoreDesign = {
  categories_carousel: {
    enabled: true,
    shape: 'rounded',
  },
}

export function normalizeStoreDesign(input?: Partial<StoreDesign> | null): StoreDesign {
  const carousel: Partial<StoreDesignCategoriesCarousel> = input?.categories_carousel || {}
  return {
    categories_carousel: {
      enabled: carousel.enabled !== false,
      shape: carousel.shape === 'round' ? 'round' : 'rounded',
    },
  }
}

/** Carrossel só aparece com categorias cadastradas no admin e com produtos. */
export function shouldShowCategoryCarousel(
  storeCategories: StoreCatalogCategory[],
  design?: Partial<StoreDesign> | null,
): boolean {
  const normalized = normalizeStoreDesign(design)
  if (!normalized.categories_carousel.enabled) return false
  return storeCategories.length >= 1
}