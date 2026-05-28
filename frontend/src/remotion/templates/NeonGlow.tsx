import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion'
import type { NeonGlowProps } from '../types'

export type { NeonGlowProps }

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)

/* Neon scan line */
function ScanLine({ color }: { color: string }) {
  const frame = useCurrentFrame()
  const { height } = useVideoConfig()
  const pos = (frame * 3) % (height + 100) - 50
  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0,
      top: pos,
      height: 2,
      background: `linear-gradient(90deg, transparent 0%, ${color}44 30%, ${color}88 50%, ${color}44 70%, transparent 100%)`,
      pointerEvents: 'none',
      zIndex: 5,
    }} />
  )
}

/* Grid overlay */
function CyberGrid({ color }: { color: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `
        linear-gradient(${color}0f 1px, transparent 1px),
        linear-gradient(90deg, ${color}0f 1px, transparent 1px)
      `,
      backgroundSize: '60px 60px',
      pointerEvents: 'none',
      zIndex: 1,
    }} />
  )
}

/* Flicker effect (deterministic) */
function useFlicker(frame: number, fps: number): number {
  const pattern = [1, 1, 1, 0.88, 1, 1, 1, 1, 0.92, 1, 1, 0.85, 1, 1, 1, 1]
  const idx = Math.floor(frame / 2) % pattern.length
  return pattern[idx]
}

/* Corner decoration */
function CornerDecorations({ color }: { color: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = spring({ fps, frame, config: { damping: 14, stiffness: 80 }, durationInFrames: fps * 0.8 })
  const size = 60
  const stroke = `2px solid ${color}`

  const corners = [
    { top: 40, left: 40, borderTop: stroke, borderLeft: stroke },
    { top: 40, right: 40, borderTop: stroke, borderRight: stroke },
    { bottom: 40, left: 40, borderBottom: stroke, borderLeft: stroke },
    { bottom: 40, right: 40, borderBottom: stroke, borderRight: stroke },
  ]

  return (
    <>
      {corners.map((style, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: `scale(${scale})`,
          boxShadow: `0 0 8px ${color}88`,
          ...style,
        }} />
      ))}
    </>
  )
}

/* Neon text line */
function NeonLine({
  text,
  startFrame,
  fps,
  color,
  fontSize,
  isHighlight,
}: {
  text: string; startFrame: number; fps: number; color: string;
  fontSize: number; isHighlight: boolean;
}) {
  const frame = useCurrentFrame()
  const localFrame = Math.max(0, frame - startFrame)
  const progress = spring({ fps, frame: localFrame, config: { damping: 12, stiffness: 90 }, durationInFrames: fps * 0.8 })
  const opacity = interpolate(localFrame, [0, fps * 0.4], [0, 1], { extrapolateRight: 'clamp' })
  const flickerVal = useFlicker(frame, fps)

  const glowIntensity = isHighlight ? (1 + Math.sin(frame * 0.15) * 0.3) : 0.7

  return (
    <div style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize,
      fontWeight: isHighlight ? 700 : 400,
      color: isHighlight ? color : '#e2e8f0',
      opacity: opacity * flickerVal,
      transform: `translateX(${(1 - progress) * -50}px)`,
      textShadow: isHighlight
        ? `0 0 ${20 * glowIntensity}px ${color}, 0 0 ${40 * glowIntensity}px ${color}88, 0 0 ${80 * glowIntensity}px ${color}44`
        : `0 0 10px ${color}44`,
      letterSpacing: '1px',
    }}>
      {isHighlight && <span style={{ color: color, marginRight: 12, opacity: 0.7 }}>{'>'}</span>}
      {text}
    </div>
  )
}

/* Intro scene */
function NeonIntro({ title, brandName, neon, fps }: {
  title: string; brandName?: string; neon: string; fps: number
}) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const flickerVal = useFlicker(frame, fps)

  const titleProgress = spring({ fps, frame: Math.max(0, frame - fps * 0.3), config: { damping: 10, stiffness: 70 }, durationInFrames: fps * 1.2 })
  const brandOpacity = interpolate(frame, [fps * 0.8, fps * 1.4], [0, 1], { extrapolateRight: 'clamp' })

  const glowPulse = 1 + Math.sin(frame * 0.1) * 0.3

  return (
    <AbsoluteFill>
      <CyberGrid color={neon} />
      <ScanLine color={neon} />
      <CornerDecorations color={neon} />

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 20,
        zIndex: 10,
      }}>
        {brandName && (
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 14,
            fontWeight: 400,
            color: neon,
            letterSpacing: '8px',
            textTransform: 'uppercase',
            opacity: brandOpacity * flickerVal,
            textShadow: `0 0 10px ${neon}`,
          }}>
            [ {brandName} ]
          </div>
        )}

        <div style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: width > 1000 ? 110 : 72,
          fontWeight: 900,
          color: '#fff',
          opacity: titleProgress * flickerVal,
          transform: `scale(${0.8 + titleProgress * 0.2})`,
          textAlign: 'center',
          letterSpacing: '-3px',
          textShadow: `
            0 0 ${30 * glowPulse}px ${neon},
            0 0 ${60 * glowPulse}px ${neon}88,
            0 0 ${100 * glowPulse}px ${neon}33
          `,
          maxWidth: '85%',
          lineHeight: 1.0,
        }}>
          {title}
        </div>

        {/* Animated underline */}
        <div style={{
          width: `${interpolate(frame, [fps * 0.6, fps * 1.2], [0, 400], { extrapolateRight: 'clamp', easing: EASE_OUT })}px`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${neon}, transparent)`,
          boxShadow: `0 0 20px ${neon}`,
          borderRadius: 999,
        }} />
      </div>
    </AbsoluteFill>
  )
}

/* Slides scene */
function SlidesScene({ slides, neon, totalFrames, fps }: {
  slides: NeonGlowProps['slides']; neon: string; totalFrames: number; fps: number
}) {
  const frame = useCurrentFrame()
  const lineDelay = Math.floor(fps * 0.25)
  const fadeOut = totalFrames - fps * 0.4
  const globalOpacity = interpolate(frame, [fadeOut, totalFrames], [1, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ opacity: globalOpacity }}>
      <CyberGrid color={neon} />
      <CornerDecorations color={neon} />

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        gap: 16,
        padding: '80px 120px',
        zIndex: 10,
      }}>
        {slides.map((slide, i) => {
          const fSize = slide.size === 'large' ? 72 : slide.size === 'small' ? 32 : 48
          return (
            <NeonLine
              key={i}
              text={slide.line}
              startFrame={i * lineDelay}
              fps={fps}
              color={neon}
              fontSize={fSize}
              isHighlight={!!slide.highlight}
            />
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

/* CTA scene */
function NeonCta({ ctaText, neon, fps }: { ctaText: string; neon: string; fps: number }) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const flickerVal = useFlicker(frame, fps)

  const scale = spring({ fps, frame, config: { damping: 11, stiffness: 80 }, durationInFrames: fps })
  const glowPulse = 1 + Math.sin(frame * 0.12) * 0.4

  return (
    <AbsoluteFill>
      <CyberGrid color={neon} />
      <CornerDecorations color={neon} />
      <ScanLine color={neon} />

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10,
      }}>
        <div style={{
          border: `2px solid ${neon}`,
          borderRadius: 8,
          padding: '32px 64px',
          transform: `scale(${scale})`,
          opacity: flickerVal,
          boxShadow: `0 0 ${30 * glowPulse}px ${neon}88, inset 0 0 ${20 * glowPulse}px ${neon}22`,
        }}>
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: width > 1000 ? 72 : 48,
            fontWeight: 900,
            color: neon,
            textAlign: 'center',
            textShadow: `0 0 ${20 * glowPulse}px ${neon}, 0 0 ${40 * glowPulse}px ${neon}88`,
            letterSpacing: '-1px',
          }}>
            {ctaText}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

export function NeonGlow(props: NeonGlowProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const slides = props.slides ?? []
  const hasCta = !!props.ctaText

  const neon = props.accentColor || props.colors?.accent || '#00ffcc'
  const bg = props.colors?.background || '#060612'

  const introFrames = fps * 4
  const ctaFrames = hasCta ? fps * 3 : 0
  const slidesFrames = durationInFrames - introFrames - ctaFrames

  return (
    <AbsoluteFill style={{ background: bg }}>
      <Sequence durationInFrames={introFrames} premountFor={fps}>
        <NeonIntro title={props.title} brandName={props.brandName} neon={neon} fps={fps} />
      </Sequence>

      {slides.length > 0 && (
        <Sequence from={introFrames} durationInFrames={slidesFrames} premountFor={fps}>
          <SlidesScene slides={slides} neon={neon} totalFrames={slidesFrames} fps={fps} />
        </Sequence>
      )}

      {hasCta && (
        <Sequence from={durationInFrames - ctaFrames} durationInFrames={ctaFrames} premountFor={fps}>
          <NeonCta ctaText={props.ctaText!} neon={neon} fps={fps} />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}
