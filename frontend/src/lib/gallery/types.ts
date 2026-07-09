export type GalleryFolderSlug = 'ia' | 'uploads' | 'campanhas' | 'posts' | 'produtos' | 'all'
export type GalleryItemType = 'image' | 'video'

export interface GalleryAssetMeta {
  folder?: string
  source?: string
  tags?: string[]
  productId?: string
  productName?: string
  campaignId?: string
  postId?: string
  prompt?: string
  model?: string
  format?: string
  usedInCampaign?: boolean
  usedInPost?: boolean
  publishedInPost?: boolean
  postChannel?: 'instagram' | 'facebook'
  publishedAt?: string
}

export interface GalleryItem {
  id: string
  type: GalleryItemType
  url: string
  thumbnailUrl?: string
  name: string
  folder: string
  source: string
  tags: string[]
  mimeType?: string
  fileSize?: number
  createdAt: string
  metadata: GalleryAssetMeta
  origin: 'media_files' | 'creative_assets' | 'product_gallery'
}

export interface GalleryFolder {
  slug: string
  label: string
  icon: string
  count: number
  isSystem: boolean
}