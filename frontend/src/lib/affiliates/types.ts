export type AffiliateMaterialCategory = 'promo' | 'story' | 'reels' | 'copy' | 'banner'
export type AffiliateMaterialChannel = 'instagram' | 'whatsapp' | 'geral'

export type AffiliateMaterial = {
  id: string
  title: string
  type: string
  media_url?: string | null
  copy_text?: string | null
  region?: string | null
  gallery_item_id?: string | null
  category?: AffiliateMaterialCategory | string
  channel?: AffiliateMaterialChannel | string
  product_id?: string | null
  program_id?: string | null
  is_published?: boolean
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export type AffiliateLearningModuleType =
  | 'programa'
  | 'como_funciona'
  | 'produtos'
  | 'entrega'
  | 'comissao'
  | 'faq'

export type AffiliateLearningModule = {
  id: string
  slug: string
  title: string
  icon: string
  module_type: AffiliateLearningModuleType | string
  content_html?: string | null
  media_url?: string | null
  gallery_item_id?: string | null
  sort_order: number
  is_published: boolean
  is_required: boolean
  region?: string | null
  updated_at?: string
}

export type AffiliateContentMeta = {
  content_version: number
  updated_at?: string
}

export type AffiliateProductCatalogItem = {
  id: string
  slug?: string | null
  name: string
  clicks?: number
  subtitle?: string | null
  description?: string
  category?: string
  price: number
  promo_price?: number | null
  unit?: string
  image_url?: string | null
  features?: string[]
  guide_status?: string | null
  has_guide: boolean
  guide_generated_at?: string | null
}

export type AffiliateProductGuide = {
  headline: string
  summary: string
  strong_points: string[]
  ideal_audience: string
  how_to_sell: string[]
  objections: Array<{ objection: string; response: string }>
  tips: string[]
  pitch_ideas: string[]
  keywords: string[]
  commission_angle: string
}