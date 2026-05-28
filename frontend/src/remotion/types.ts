export interface ColorScheme {
  primary: string
  accent: string
  background: string
  text: string
  textSecondary: string
}

export interface SlideItem {
  title: string
  subtitle?: string
  body?: string
  imageUrl?: string
  highlightColor?: string
}

export interface BrandPromoProps {
  brandName: string
  tagline?: string
  logoUrl?: string
  colors: ColorScheme
  slides: SlideItem[]
  ctaText?: string
  ctaSubtext?: string
  fps?: number
}

export interface ProductShowcaseProps {
  brandName: string
  colors: ColorScheme
  products: Array<{
    name: string
    description?: string
    price?: string
    imageUrl?: string
    badge?: string
  }>
  ctaText?: string
  ctaSubtext?: string
  fps?: number
}

export interface StoryReelProps {
  brandName: string
  colors: ColorScheme
  slides: SlideItem[]
  ctaText?: string
  logoUrl?: string
  fps?: number
}

export interface CinematicRevealProps {
  title: string
  subtitle?: string
  tagline?: string
  brandName?: string
  mediaUrl?: string
  colors: ColorScheme
  textLines?: string[]
  ctaText?: string
}

export interface KineticTypographyProps {
  brandName?: string
  headline: string
  words: string[]
  colors: ColorScheme
  ctaText?: string
  accentWords?: string[]
}

export interface NeonGlowProps {
  brandName?: string
  title: string
  subtitle?: string
  slides: Array<{ line: string; highlight?: boolean; size?: 'large' | 'medium' | 'small' }>
  accentColor?: string
  secondaryNeon?: string
  ctaText?: string
  colors: ColorScheme
}

export type TemplateId = 'BrandPromo' | 'ProductShowcase' | 'StoryReel' | 'CinematicReveal' | 'KineticTypography' | 'NeonGlow'

export type AnyTemplateProps =
  | BrandPromoProps
  | ProductShowcaseProps
  | StoryReelProps
  | CinematicRevealProps
  | KineticTypographyProps
  | NeonGlowProps

export interface VideoCompositionSpec {
  template: TemplateId
  props: AnyTemplateProps
  durationInFrames: number
  fps: number
  width: number
  height: number
}

export interface VideoMessage {
  role: 'user' | 'assistant'
  content: string
  spec?: VideoCompositionSpec
  timestamp: number
}
