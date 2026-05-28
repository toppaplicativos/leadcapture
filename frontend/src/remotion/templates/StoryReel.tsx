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
import type { StoryReelProps, SlideItem } from '../types'

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)

function StorySlide({
  slide,
  colors,
  totalFrames,
  isLast,
}: {
  slide: SlideItem
  colors: StoryReelProps['colors']
  totalFrames: number
  isLast: boolean
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const fadeIn = fps * 0.35
  const fadeOut = totalFrames - fps * 0.35

  const opacity = interpolate(frame, [0, fadeIn, fadeOut, totalFrames], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  })
  const titleY = interpolate(frame, [0, fadeIn], [40, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const subtitleY = interpolate(frame, [fps * 0.2, fps * 0.7], [30, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const barWidth = interpolate(frame, [0, totalFrames], [0, 100], { extrapolateRight: 'clamp' })

  const accent = slide.highlightColor || colors.accent

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Background */}
      {slide.imageUrl ? (
        <Img
          src={slide.imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }}
        />
      ) : (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(160deg, ${colors.primary} 0%, ${colors.background} 60%, ${accent}44 100%)`,
        }} />
      )}

      {/* Overlay for legibility */}
      {slide.imageUrl && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)',
        }} />
      )}

      {/* Progress bar at top */}
      <div style={{
        position: 'absolute',
        top: 48,
        left: 32,
        right: 32,
        height: 4,
        background: 'rgba(255,255,255,0.25)',
        borderRadius: 999,
      }}>
        <div style={{
          width: `${barWidth}%`,
          height: '100%',
          background: accent,
          borderRadius: 999,
        }} />
      </div>

      {/* Content */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0 40px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {slide.subtitle && (
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            color: accent,
            transform: `translateY(${subtitleY}px)`,
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}>
            {slide.subtitle}
          </div>
        )}

        <div style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 56,
          fontWeight: 900,
          color: colors.text,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.1,
          letterSpacing: '-1px',
        }}>
          {slide.title}
        </div>

        {slide.body && (
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 22,
            fontWeight: 400,
            color: `${colors.text}cc`,
            transform: `translateY(${subtitleY}px)`,
            lineHeight: 1.5,
          }}>
            {slide.body}
          </div>
        )}
      </div>

      {/* Accent left bar */}
      <div style={{
        position: 'absolute',
        left: 0,
        bottom: '20%',
        top: '20%',
        width: 5,
        background: accent,
        borderRadius: '0 4px 4px 0',
      }} />
    </AbsoluteFill>
  )
}

function CtaSlide({ ctaText, brandName, logoUrl, colors }: Pick<StoryReelProps, 'ctaText' | 'brandName' | 'logoUrl' | 'colors'>) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 90 }, durationInFrames: fps })
  const logoScale = spring({ fps, frame: Math.max(0, frame - fps * 0.3), config: { damping: 14, stiffness: 100 }, durationInFrames: fps })

  return (
    <AbsoluteFill style={{
      background: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 28,
    }}>
      {logoUrl && (
        <div style={{ transform: `scale(${logoScale})` }}>
          <Img src={logoUrl} style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }} />
        </div>
      )}
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 60,
        fontWeight: 900,
        color: colors.background,
        transform: `scale(${scale})`,
        textAlign: 'center',
        letterSpacing: '-1.5px',
        lineHeight: 1.1,
        padding: '0 40px',
      }}>
        {ctaText || 'Saiba mais!'}
      </div>
      <div style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 20,
        fontWeight: 600,
        color: `${colors.background}99`,
        transform: `scale(${logoScale})`,
        textTransform: 'uppercase',
        letterSpacing: '3px',
      }}>
        {brandName}
      </div>
    </AbsoluteFill>
  )
}

export function StoryReel(props: StoryReelProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const slides = props.slides ?? []

  const ctaDuration = fps * 3
  const slidesTotal = durationInFrames - ctaDuration
  const slideFrames = slides.length > 0 ? Math.floor(slidesTotal / slides.length) : slidesTotal

  const colors = props.colors ?? {
    primary: '#1a1a2e',
    accent: '#e94560',
    background: '#16213e',
    text: '#ffffff',
    textSecondary: '#a0aec0',
  }

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      {slides.map((slide, i) => (
        <Sequence
          key={i}
          from={i * slideFrames}
          durationInFrames={slideFrames}
          premountFor={fps}
        >
          <StorySlide
            slide={slide}
            colors={colors}
            totalFrames={slideFrames}
            isLast={i === slides.length - 1}
          />
        </Sequence>
      ))}

      <Sequence from={durationInFrames - ctaDuration} durationInFrames={ctaDuration} premountFor={fps}>
        <CtaSlide
          ctaText={props.ctaText}
          brandName={props.brandName}
          logoUrl={props.logoUrl}
          colors={colors}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
