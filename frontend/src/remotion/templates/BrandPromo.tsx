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
import type { BrandPromoProps, SlideItem } from '../types'

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)
const EASE_IN_OUT = Easing.bezier(0.45, 0, 0.55, 1)

/* ── Intro: logo + brand name ───────────────────────────────────────── */
function Intro({ brandName, tagline, logoUrl, colors }: Pick<BrandPromoProps, 'brandName' | 'tagline' | 'logoUrl' | 'colors'>) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const nameOpacity = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const nameY = interpolate(frame, [0, fps * 0.6], [40, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const taglineOpacity = interpolate(frame, [fps * 0.5, fps * 1.2], [0, 1], { extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const logoScale = spring({ fps, frame, config: { damping: 14, stiffness: 100 }, durationInFrames: fps })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.background} 100%)`,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {logoUrl && (
        <div style={{ transform: `scale(${logoScale})`, opacity: logoScale }}>
          <Img
            src={logoUrl}
            style={{ width: 120, height: 120, borderRadius: 24, objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 64,
            fontWeight: 800,
            color: colors.text,
            opacity: nameOpacity,
            transform: `translateY(${nameY}px)`,
            letterSpacing: '-1px',
            textShadow: '0 2px 20px rgba(0,0,0,0.3)',
          }}
        >
          {brandName}
        </div>
        {tagline && (
          <div
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 28,
              fontWeight: 400,
              color: colors.accent,
              opacity: taglineOpacity,
              marginTop: 12,
              letterSpacing: '0.5px',
            }}
          >
            {tagline}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

/* ── Individual content slide ──────────────────────────────────────── */
function ContentSlide({ slide, colors, totalFrames }: { slide: SlideItem; colors: BrandPromoProps['colors']; totalFrames: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const fadeIn = fps * 0.4
  const fadeOut = totalFrames - fps * 0.4

  const opacity = interpolate(
    frame,
    [0, fadeIn, fadeOut, totalFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  )
  const titleY = interpolate(frame, [0, fadeIn], [30, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const subtitleY = interpolate(frame, [fps * 0.2, fadeIn + fps * 0.2], [25, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const bodyY = interpolate(frame, [fps * 0.4, fadeIn + fps * 0.4], [20, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })

  const accent = slide.highlightColor || colors.accent

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${colors.background} 0%, ${colors.primary} 100%)`,
        flexDirection: slide.imageUrl ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        padding: 80,
        gap: 60,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 8,
        background: accent,
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: slide.imageUrl ? 52 : 72,
            fontWeight: 800,
            color: colors.text,
            transform: `translateY(${titleY}px)`,
            lineHeight: 1.1,
            letterSpacing: '-1px',
          }}
        >
          {slide.title}
        </div>
        {slide.subtitle && (
          <div
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: slide.imageUrl ? 28 : 36,
              fontWeight: 600,
              color: accent,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            {slide.subtitle}
          </div>
        )}
        {slide.body && (
          <div
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 22,
              fontWeight: 400,
              color: colors.textSecondary,
              transform: `translateY(${bodyY}px)`,
              lineHeight: 1.6,
              maxWidth: 520,
            }}
          >
            {slide.body}
          </div>
        )}
      </div>

      {slide.imageUrl && (
        <div style={{
          width: 420,
          height: 420,
          borderRadius: 32,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          flexShrink: 0,
          transform: `translateY(${interpolate(frame, [0, fps * 0.5], [40, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })}px)`,
        }}>
          <Img src={slide.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
    </AbsoluteFill>
  )
}

/* ── CTA / Outro ────────────────────────────────────────────────────── */
function Outro({ ctaText, ctaSubtext, brandName, colors }: Pick<BrandPromoProps, 'ctaText' | 'ctaSubtext' | 'brandName' | 'colors'>) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 80 }, durationInFrames: fps })
  const subOpacity = interpolate(frame, [fps * 0.4, fps * 1.0], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.background} 100%)`,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {ctaText && (
        <div
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 72,
            fontWeight: 900,
            color: colors.text,
            transform: `scale(${scale})`,
            textAlign: 'center',
            letterSpacing: '-1.5px',
            textShadow: '0 4px 24px rgba(0,0,0,0.3)',
            maxWidth: 900,
            lineHeight: 1.1,
          }}
        >
          {ctaText}
        </div>
      )}
      {ctaSubtext && (
        <div
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 32,
            fontWeight: 500,
            color: colors.accent,
            opacity: subOpacity,
            textAlign: 'center',
          }}
        >
          {ctaSubtext}
        </div>
      )}
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 20,
          fontWeight: 400,
          color: `${colors.text}88`,
          opacity: subOpacity,
          marginTop: 16,
        }}
      >
        {brandName}
      </div>
    </AbsoluteFill>
  )
}

/* ── Root composition ───────────────────────────────────────────────── */
export function BrandPromo(props: BrandPromoProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const slides = props.slides ?? []

  const introDuration = fps * 3
  const outroDuration = fps * 4
  const slidesTotal = durationInFrames - introDuration - outroDuration
  const slideFrames = slides.length > 0 ? Math.floor(slidesTotal / slides.length) : 0

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
        <Intro
          brandName={props.brandName}
          tagline={props.tagline}
          logoUrl={props.logoUrl}
          colors={colors}
        />
      </Sequence>

      {slides.map((slide, i) => (
        <Sequence
          key={i}
          from={introDuration + i * slideFrames}
          durationInFrames={slideFrames}
          premountFor={fps}
        >
          <ContentSlide slide={slide} colors={colors} totalFrames={slideFrames} />
        </Sequence>
      ))}

      <Sequence from={durationInFrames - outroDuration} durationInFrames={outroDuration} premountFor={fps}>
        <Outro
          ctaText={props.ctaText}
          ctaSubtext={props.ctaSubtext}
          brandName={props.brandName}
          colors={colors}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
