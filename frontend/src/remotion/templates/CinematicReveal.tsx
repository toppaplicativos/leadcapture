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
import type { CinematicRevealProps } from '../types'

export type { CinematicRevealProps }

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1)
const EASE_IN_OUT = Easing.bezier(0.45, 0, 0.55, 1)
const EASE_CINEMATIC = Easing.bezier(0.76, 0, 0.24, 1)

/* Letterbox bars */
function Letterbox({ entering, fps }: { entering: boolean; fps: number }) {
  const frame = useCurrentFrame()
  const progress = entering
    ? interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT_EXPO })
    : interpolate(frame, [fps * 0.3, fps * 1.2], [0, 1], { extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const barHeight = 90
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: barHeight,
        background: '#000',
        transform: `translateY(${entering ? (progress - 1) * -barHeight : progress * -barHeight}px)`,
        zIndex: 10,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: barHeight,
        background: '#000',
        transform: `translateY(${entering ? (1 - progress) * barHeight : progress * barHeight}px)`,
        zIndex: 10,
      }} />
    </>
  )
}

/* Film grain overlay (deterministic noise via frame-based pattern) */
function FilmGrain({ opacity }: { opacity: number }) {
  const frame = useCurrentFrame()
  const grainId = frame % 4
  return (
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${0.65 + grainId * 0.01}' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
      opacity: opacity * 0.08,
      mixBlendMode: 'overlay',
      zIndex: 9,
      pointerEvents: 'none',
    }} />
  )
}

/* Word-by-word title reveal */
function WordReveal({ text, baseFrame, color, fontSize, fontWeight = 700, fps }: {
  text: string; baseFrame: number; color: string; fontSize: number; fontWeight?: number; fps: number
}) {
  const frame = useCurrentFrame()
  const words = text.split(' ')
  const wordDelay = Math.floor(fps * 0.12)

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '0.28em',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {words.map((word, i) => {
        const wordFrame = frame - (baseFrame + i * wordDelay)
        const progress = spring({ fps, frame: Math.max(0, wordFrame), config: { damping: 14, stiffness: 120 }, durationInFrames: fps * 0.7 })
        const opacity = interpolate(Math.max(0, wordFrame), [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' })
        return (
          <span key={i} style={{
            display: 'inline-block',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize,
            fontWeight,
            color,
            opacity,
            transform: `translateY(${(1 - progress) * 40}px)`,
            letterSpacing: '-1px',
          }}>
            {word}
          </span>
        )
      })}
    </div>
  )
}

/* Main scene: hero content */
function HeroScene({ props, sceneDuration }: { props: CinematicRevealProps; sceneDuration: number }) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const imgZoom = interpolate(frame, [0, sceneDuration], [1, 1.08], { extrapolateRight: 'clamp', easing: EASE_CINEMATIC })
  const overlayOpacity = interpolate(frame, [0, fps * 0.5], [0.85, 0.45], { extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const lineWidth = interpolate(frame, [fps * 0.9, fps * 1.6], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT_EXPO })

  const colors = props.colors

  return (
    <AbsoluteFill>
      {/* Background */}
      {props.mediaUrl ? (
        <Img src={props.mediaUrl} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${imgZoom})`,
          transformOrigin: 'center center',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at 30% 50%, ${colors.primary}99 0%, ${colors.background} 60%),
                       linear-gradient(135deg, ${colors.background} 0%, #000 100%)`,
        }} />
      )}

      {/* Color grade overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(160deg, ${colors.primary}${Math.round(overlayOpacity * 255).toString(16).padStart(2, '0')} 0%, rgba(0,0,0,${overlayOpacity}) 100%)`,
      }} />

      {/* Letterbox */}
      <Letterbox entering fps={fps} />

      {/* Film grain */}
      <FilmGrain opacity={1} />

      {/* Content */}
      <div style={{
        position: 'absolute', inset: 90,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 24,
        textAlign: 'center',
      }}>
        {props.tagline && (
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18, fontWeight: 600,
            color: colors.accent,
            letterSpacing: '6px',
            textTransform: 'uppercase',
            opacity: interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            {props.tagline}
          </div>
        )}

        <WordReveal
          text={props.title}
          baseFrame={Math.floor(fps * 0.5)}
          color={colors.text}
          fontSize={width > 1000 ? 96 : 64}
          fontWeight={900}
          fps={fps}
        />

        {/* Accent line */}
        <div style={{
          width: `${lineWidth * 120}px`, height: 3,
          background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
          borderRadius: 999,
          boxShadow: `0 0 20px ${colors.accent}88`,
        }} />

        {props.subtitle && (
          <WordReveal
            text={props.subtitle}
            baseFrame={fps}
            color={`${colors.text}cc`}
            fontSize={width > 1000 ? 36 : 24}
            fontWeight={400}
            fps={fps}
          />
        )}
      </div>
    </AbsoluteFill>
  )
}

/* Text lines reveal */
function TextLinesScene({ lines, colors, totalFrames, fps }: {
  lines: string[]; colors: CinematicRevealProps['colors']; totalFrames: number; fps: number
}) {
  const frame = useCurrentFrame()
  const lineFrames = Math.floor(totalFrames / lines.length)

  const fadeOut = totalFrames - fps * 0.4
  const globalOpacity = interpolate(frame, [fadeOut, totalFrames], [1, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(180deg, ${colors.background} 0%, #000 100%)`,
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 32,
      opacity: globalOpacity,
    }}>
      <Letterbox entering={false} fps={fps} />
      <FilmGrain opacity={0.8} />
      {lines.map((line, i) => {
        const lineStart = i * lineFrames
        const lineFrame = frame - lineStart
        const progress = spring({ fps, frame: Math.max(0, lineFrame), config: { damping: 14, stiffness: 100 }, durationInFrames: fps * 0.8 })
        const lineOpacity = interpolate(Math.max(0, lineFrame), [0, fps * 0.4], [0, 1], { extrapolateRight: 'clamp' })
        return (
          <div key={i} style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: i === 0 ? 72 : 48,
            fontWeight: i === 0 ? 900 : 400,
            color: i === 0 ? colors.text : `${colors.text}99`,
            opacity: lineOpacity,
            transform: `translateX(${(1 - progress) * -60}px)`,
            textAlign: 'center',
            letterSpacing: i === 0 ? '-1.5px' : '-0.5px',
          }}>
            {i === 0 && (
              <span style={{ color: colors.accent }}>{line[0]}</span>
            )}
            {i === 0 ? line.slice(1) : line}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/* CTA outro */
function CtaScene({ ctaText, brandName, colors, fps }: {
  ctaText: string; brandName?: string; colors: CinematicRevealProps['colors']; fps: number
}) {
  const frame = useCurrentFrame()
  const scale = spring({ fps, frame, config: { damping: 12, stiffness: 80 }, durationInFrames: fps })
  const lineWidth = interpolate(frame, [fps * 0.3, fps * 1.0], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT_EXPO })

  return (
    <AbsoluteFill style={{
      background: '#000',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 24,
    }}>
      <FilmGrain opacity={0.6} />
      {brandName && (
        <div style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 16, fontWeight: 600,
          color: `${colors.text}66`,
          letterSpacing: '8px',
          textTransform: 'uppercase',
          transform: `scale(${scale})`,
        }}>
          {brandName}
        </div>
      )}
      <div style={{
        width: `${lineWidth * 80}px`, height: 1,
        background: colors.accent,
        boxShadow: `0 0 20px ${colors.accent}`,
      }} />
      <div style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: 56, fontWeight: 700,
        color: colors.text,
        transform: `scale(${scale})`,
        textAlign: 'center',
        letterSpacing: '-1px',
        textShadow: `0 0 60px ${colors.accent}88`,
      }}>
        {ctaText}
      </div>
    </AbsoluteFill>
  )
}

export function CinematicReveal(props: CinematicRevealProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const lines = props.textLines ?? []
  const hasCta = !!props.ctaText

  const heroFrames = fps * 5
  const ctaFrames = hasCta ? fps * 4 : 0
  const textFrames = durationInFrames - heroFrames - ctaFrames

  const colors = props.colors ?? {
    primary: '#1a0533',
    accent: '#a855f7',
    background: '#0a0012',
    text: '#ffffff',
    textSecondary: '#a78bfa',
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence durationInFrames={heroFrames} premountFor={fps}>
        <HeroScene props={{ ...props, colors }} sceneDuration={heroFrames} />
      </Sequence>

      {lines.length > 0 && (
        <Sequence from={heroFrames} durationInFrames={textFrames} premountFor={fps}>
          <TextLinesScene lines={lines} colors={colors} totalFrames={textFrames} fps={fps} />
        </Sequence>
      )}

      {hasCta && (
        <Sequence from={durationInFrames - ctaFrames} durationInFrames={ctaFrames} premountFor={fps}>
          <CtaScene
            ctaText={props.ctaText!}
            brandName={props.brandName}
            colors={colors}
            fps={fps}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}
