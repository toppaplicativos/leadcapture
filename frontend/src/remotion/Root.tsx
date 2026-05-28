import React from 'react'
import { Composition } from 'remotion'
import { BrandPromo } from './templates/BrandPromo'
import { ProductShowcase } from './templates/ProductShowcase'
import { StoryReel } from './templates/StoryReel'
import { CinematicReveal } from './templates/CinematicReveal'
import { KineticTypography } from './templates/KineticTypography'
import { NeonGlow } from './templates/NeonGlow'
import type {
  BrandPromoProps,
  ProductShowcaseProps,
  StoryReelProps,
  CinematicRevealProps,
  KineticTypographyProps,
  NeonGlowProps,
} from './types'

const darkDefault = {
  primary: '#1a1a2e',
  accent: '#e94560',
  background: '#16213e',
  text: '#ffffff',
  textSecondary: '#a0aec0',
}

const defaultBrandPromo: BrandPromoProps = {
  brandName: 'Minha Marca',
  tagline: 'Qualidade que você pode sentir',
  colors: darkDefault,
  slides: [
    { title: 'Produto Incrível', subtitle: 'Feito para você', body: 'Descrição que encanta.' },
    { title: 'Qualidade Superior', subtitle: 'Garantia total', body: 'Cada detalhe importa.' },
  ],
  ctaText: 'Compre Agora',
  ctaSubtext: 'Entre em contato pelo WhatsApp',
}

const defaultProductShowcase: ProductShowcaseProps = {
  brandName: 'Minha Marca',
  colors: darkDefault,
  products: [
    { name: 'Produto Premium', description: 'Descrição completa do produto.', price: 'R$ 99,90', badge: 'Novidade' },
    { name: 'Produto Especial', description: 'Coleção exclusiva.', price: 'R$ 149,90', badge: 'Mais Vendido' },
  ],
  ctaText: 'Peça Já!',
  ctaSubtext: 'Entrega para todo o Brasil',
}

const defaultStoryReel: StoryReelProps = {
  brandName: 'Minha Marca',
  colors: darkDefault,
  slides: [
    { title: 'Olha isso', subtitle: 'Promoção especial' },
    { title: 'Qualidade única', body: 'Cada produto feito com cuidado' },
    { title: 'Aproveite!', subtitle: 'Por tempo limitado' },
  ],
  ctaText: 'Arrasta pra cima!',
}

const defaultCinematic: CinematicRevealProps = {
  title: 'Uma Nova Era',
  subtitle: 'Experiências que ficam na memória',
  tagline: 'Apresenta',
  brandName: 'Minha Marca',
  textLines: ['Qualidade', 'Inovação', 'Excelência'],
  ctaText: 'Descubra Mais',
  colors: {
    primary: '#1a0533',
    accent: '#a855f7',
    background: '#0a0012',
    text: '#ffffff',
    textSecondary: '#a78bfa',
  },
}

const defaultKinetic: KineticTypographyProps = {
  brandName: 'Minha Marca',
  headline: 'Sua Marca. Nossa Arte.',
  words: ['Criatividade', 'Inovação', 'Qualidade', 'Resultado', 'Impacto', 'Sucesso'],
  accentWords: ['Inovação', 'Impacto', 'Sucesso'],
  ctaText: 'Fale Conosco',
  colors: {
    primary: '#0f172a',
    accent: '#f59e0b',
    background: '#0f172a',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
  },
}

const defaultNeon: NeonGlowProps = {
  brandName: 'MINHA MARCA',
  title: 'POWER',
  subtitle: 'Next Generation',
  slides: [
    { line: 'Qualidade Premium', highlight: true, size: 'large' },
    { line: 'Entrega Rápida', highlight: false, size: 'medium' },
    { line: 'Suporte 24/7', highlight: true, size: 'medium' },
    { line: 'Melhor preço do mercado', highlight: false, size: 'small' },
  ],
  ctaText: 'ACESSE AGORA',
  accentColor: '#00ffcc',
  colors: {
    primary: '#060612',
    accent: '#00ffcc',
    background: '#060612',
    text: '#ffffff',
    textSecondary: '#64748b',
  },
}

function calcBrandPromo({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as BrandPromoProps
  const fps = p.fps ?? 30
  const slides = p.slides?.length ?? 2
  return { durationInFrames: (3 + slides * 7 + 4) * fps, fps }
}

function calcProductShowcase({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as ProductShowcaseProps
  const fps = p.fps ?? 30
  const products = p.products?.length ?? 2
  return { durationInFrames: (2 + products * 6 + 3) * fps, fps }
}

function calcStoryReel({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as StoryReelProps
  const fps = p.fps ?? 30
  const slides = p.slides?.length ?? 3
  return { durationInFrames: (slides * 4 + 3) * fps, fps }
}

function calcCinematic({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as CinematicRevealProps
  const fps = 30
  const lines = p.textLines?.length ?? 0
  const cta = p.ctaText ? 4 : 0
  return { durationInFrames: (5 + lines * 2.5 + cta) * fps, fps }
}

function calcKinetic({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as KineticTypographyProps
  const fps = 30
  const words = p.words?.length ?? 6
  const cta = p.ctaText ? 3 : 0
  return { durationInFrames: (3 + Math.ceil(words * 0.28) + 2 + cta) * fps, fps }
}

function calcNeon({ props }: { props: Record<string, unknown> }) {
  const p = props as unknown as NeonGlowProps
  const fps = 30
  const slides = p.slides?.length ?? 4
  const cta = p.ctaText ? 3 : 0
  return { durationInFrames: (4 + slides * 1.5 + cta) * fps, fps }
}

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="BrandPromo"
        component={BrandPromo as React.ComponentType<any>}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultBrandPromo}
        calculateMetadata={calcBrandPromo}
      />
      <Composition
        id="ProductShowcase"
        component={ProductShowcase as React.ComponentType<any>}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProductShowcase}
        calculateMetadata={calcProductShowcase}
      />
      <Composition
        id="StoryReel"
        component={StoryReel as React.ComponentType<any>}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultStoryReel}
        calculateMetadata={calcStoryReel}
      />
      <Composition
        id="CinematicReveal"
        component={CinematicReveal as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultCinematic}
        calculateMetadata={calcCinematic}
      />
      <Composition
        id="KineticTypography"
        component={KineticTypography as React.ComponentType<any>}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultKinetic}
        calculateMetadata={calcKinetic}
      />
      <Composition
        id="NeonGlow"
        component={NeonGlow as React.ComponentType<any>}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultNeon}
        calculateMetadata={calcNeon}
      />
    </>
  )
}
