import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Img,
} from 'remotion'
import type { ProductShowcaseProps } from '../types'

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)

interface ProductCardProps {
  product: ProductShowcaseProps['products'][0]
  colors: ProductShowcaseProps['colors']
  totalFrames: number
}

function ProductCard({ product, colors, totalFrames }: ProductCardProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const fadeIn = fps * 0.5
  const fadeOut = totalFrames - fps * 0.4

  const opacity = interpolate(frame, [0, fadeIn, fadeOut, totalFrames], [0, 1, 1, 0], { extrapolateRight: 'clamp' })
  const imgScale = spring({ fps, frame, config: { damping: 14, stiffness: 70 }, durationInFrames: fps })
  const textY = interpolate(frame, [fps * 0.3, fps * 0.9], [30, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const priceScale = spring({ fps, frame: Math.max(0, frame - fps), config: { damping: 10, stiffness: 100 }, durationInFrames: fps })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${colors.background} 0%, ${colors.primary}44 100%)`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        padding: 80,
        gap: 70,
      }}
    >
      {/* Left: product image */}
      {product.imageUrl ? (
        <div style={{
          width: 440,
          height: 440,
          borderRadius: 32,
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          transform: `scale(${imgScale})`,
        }}>
          <Img src={product.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <div style={{
          width: 440,
          height: 440,
          borderRadius: 32,
          background: `${colors.primary}66`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${imgScale})`,
        }}>
          <div style={{ fontSize: 80, color: colors.accent, opacity: 0.5 }}>?</div>
        </div>
      )}

      {/* Right: product info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {product.badge && (
          <div style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            background: colors.accent,
            color: colors.background,
            borderRadius: 999,
            padding: '8px 20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 16,
            fontWeight: 700,
            transform: `translateY(${textY}px)`,
            letterSpacing: '0.5px',
          }}>
            {product.badge}
          </div>
        )}

        <div style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 54,
          fontWeight: 800,
          color: colors.text,
          transform: `translateY(${textY}px)`,
          lineHeight: 1.1,
          letterSpacing: '-1px',
        }}>
          {product.name}
        </div>

        {product.description && (
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 22,
            fontWeight: 400,
            color: colors.textSecondary,
            transform: `translateY(${textY}px)`,
            lineHeight: 1.6,
            maxWidth: 480,
          }}>
            {product.description}
          </div>
        )}

        {product.price && (
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 60,
            fontWeight: 900,
            color: colors.accent,
            transform: `scale(${priceScale})`,
            transformOrigin: 'left center',
            letterSpacing: '-1px',
          }}>
            {product.price}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

function IntroSlide({ brandName, colors }: { brandName: string; colors: ProductShowcaseProps['colors'] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 80 }, durationInFrames: fps })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.background} 100%)`,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 40,
        fontWeight: 500,
        color: `${colors.text}99`,
        transform: `scale(${scale})`,
        letterSpacing: '4px',
        textTransform: 'uppercase',
      }}>
        {brandName}
      </div>
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 72,
        fontWeight: 900,
        color: colors.text,
        transform: `scale(${scale})`,
        letterSpacing: '-2px',
        textAlign: 'center',
      }}>
        Nossos Produtos
      </div>
    </AbsoluteFill>
  )
}

function OutroSlide({ ctaText, ctaSubtext, colors }: Pick<ProductShowcaseProps, 'ctaText' | 'ctaSubtext' | 'colors'>) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 80 }, durationInFrames: fps })
  const sub = interpolate(frame, [fps * 0.5, fps * 1.2], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 24,
    }}>
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 80,
        fontWeight: 900,
        color: colors.background,
        transform: `scale(${scale})`,
        textAlign: 'center',
        letterSpacing: '-2px',
        lineHeight: 1.0,
        maxWidth: 900,
      }}>
        {ctaText || 'Peça já!'}
      </div>
      {ctaSubtext && (
        <div style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 28,
          fontWeight: 500,
          color: `${colors.background}cc`,
          opacity: sub,
          textAlign: 'center',
        }}>
          {ctaSubtext}
        </div>
      )}
    </AbsoluteFill>
  )
}

export function ProductShowcase(props: ProductShowcaseProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const products = props.products ?? []

  const introDuration = fps * 2
  const outroDuration = fps * 3
  const productTotal = durationInFrames - introDuration - outroDuration
  const productFrames = products.length > 0 ? Math.floor(productTotal / products.length) : productTotal

  const colors = props.colors ?? {
    primary: '#1a1a2e',
    accent: '#e94560',
    background: '#16213e',
    text: '#ffffff',
    textSecondary: '#a0aec0',
  }

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <Sequence durationInFrames={introDuration} premountFor={fps}>
        <IntroSlide brandName={props.brandName} colors={colors} />
      </Sequence>

      {products.map((product, i) => (
        <Sequence
          key={i}
          from={introDuration + i * productFrames}
          durationInFrames={productFrames}
          premountFor={fps}
        >
          <ProductCard product={product} colors={colors} totalFrames={productFrames} />
        </Sequence>
      ))}

      <Sequence from={durationInFrames - outroDuration} durationInFrames={outroDuration} premountFor={fps}>
        <OutroSlide ctaText={props.ctaText} ctaSubtext={props.ctaSubtext} colors={colors} />
      </Sequence>
    </AbsoluteFill>
  )
}
