import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion'
import type { KineticTypographyProps } from '../types'

export type { KineticTypographyProps }

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)
const EASE_BOUNCE = Easing.bezier(0.34, 1.56, 0.64, 1)

/* Single kinetic word block */
function KineticWord({
  word,
  startFrame,
  fps,
  isAccent,
  accentColor,
  textColor,
  index,
  total,
}: {
  word: string
  startFrame: number
  fps: number
  isAccent: boolean
  accentColor: string
  textColor: string
  index: number
  total: number
}) {
  const frame = useCurrentFrame()
  const localFrame = Math.max(0, frame - startFrame)

  // Alternate entry directions for visual rhythm
  const direction = index % 3 === 0 ? 'up' : index % 3 === 1 ? 'left' : 'right'

  const progress = spring({
    fps,
    frame: localFrame,
    config: { damping: 13, stiffness: 110 },
    durationInFrames: fps * 0.8,
  })
  const opacity = interpolate(localFrame, [0, fps * 0.25], [0, 1], { extrapolateRight: 'clamp' })

  const translateX = direction === 'left'
    ? (1 - progress) * -80
    : direction === 'right'
    ? (1 - progress) * 80
    : 0
  const translateY = direction === 'up' ? (1 - progress) * 60 : 0
  const scaleVal = direction === 'up'
    ? interpolate(localFrame, [0, fps * 0.5], [0.7, 1], { extrapolateRight: 'clamp', easing: EASE_BOUNCE })
    : 1

  // Highlight bar behind accent words
  const barScale = isAccent ? interpolate(localFrame, [fps * 0.1, fps * 0.5], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT }) : 0

  return (
    <div style={{
      position: 'relative',
      display: 'inline-block',
      opacity,
      transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scaleVal})`,
    }}>
      {isAccent && (
        <div style={{
          position: 'absolute',
          left: -8, right: -8,
          bottom: 0,
          height: '35%',
          background: accentColor,
          borderRadius: 4,
          transformOrigin: 'left center',
          transform: `scaleX(${barScale})`,
          opacity: 0.4,
          zIndex: 0,
        }} />
      )}
      <span style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: isAccent ? accentColor : textColor,
        position: 'relative',
        zIndex: 1,
      }}>
        {word}
      </span>
    </div>
  )
}

/* Headline intro */
function HeadlineScene({
  headline,
  brandName,
  colors,
  fps,
}: Pick<KineticTypographyProps, 'headline' | 'brandName' | 'colors'> & { fps: number }) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()

  const brandOpacity = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const brandY = interpolate(frame, [0, fps * 0.6], [-30, 0], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const headlineOpacity = interpolate(frame, [fps * 0.3, fps * 0.9], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT })
  const lineScale = interpolate(frame, [fps * 0.5, fps * 1.1], [0, 1], { extrapolateRight: 'clamp', easing: EASE_OUT })

  return (
    <AbsoluteFill style={{
      background: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
    }}>
      {brandName && (
        <div style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          color: `${colors.text}55`,
          letterSpacing: '6px',
          textTransform: 'uppercase',
          opacity: brandOpacity,
          transform: `translateY(${brandY}px)`,
        }}>
          {brandName}
        </div>
      )}
      <div style={{
        width: `${lineScale * 40}px`,
        height: 2,
        background: colors.accent,
        boxShadow: `0 0 12px ${colors.accent}88`,
        borderRadius: 999,
      }} />
      <div style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: width > 1000 ? 80 : 52,
        fontWeight: 900,
        color: colors.text,
        opacity: headlineOpacity,
        textAlign: 'center',
        maxWidth: '80%',
        lineHeight: 1.1,
        letterSpacing: '-2px',
      }}>
        {headline}
      </div>
    </AbsoluteFill>
  )
}

/* Kinetic words scene */
function KineticScene({
  words,
  accentWords,
  colors,
  totalFrames,
  fps,
}: Pick<KineticTypographyProps, 'words' | 'accentWords' | 'colors'> & { totalFrames: number; fps: number }) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()

  const wordInterval = Math.floor(fps * 0.28)
  const accentSet = new Set((accentWords ?? []).map(w => w.toLowerCase()))

  const fadeOut = totalFrames - fps * 0.5
  const globalOpacity = interpolate(frame, [fadeOut, totalFrames], [1, 0], { extrapolateRight: 'clamp' })

  // Layout words in rows of ~4
  const rows: string[][] = []
  for (let i = 0; i < words.length; i += 4) {
    rows.push(words.slice(i, i + 4))
  }

  const fontSize = width > 1000 ? 96 : 64

  return (
    <AbsoluteFill style={{
      background: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 24,
      opacity: globalOpacity,
    }}>
      {/* Subtle grid pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${colors.accent}08 1px, transparent 1px), linear-gradient(90deg, ${colors.accent}08 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
      }} />

      {rows.map((row, rowIndex) => (
        <div key={rowIndex} style={{
          display: 'flex',
          gap: '0.4em',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {row.map((word, colIndex) => {
            const globalIndex = rowIndex * 4 + colIndex
            return (
              <KineticWord
                key={globalIndex}
                word={word}
                startFrame={globalIndex * wordInterval}
                fps={fps}
                isAccent={accentSet.has(word.toLowerCase())}
                accentColor={colors.accent}
                textColor={colors.text}
                index={globalIndex}
                total={words.length}
              />
            )
          })}
        </div>
      ))}
    </AbsoluteFill>
  )
}

/* CTA scene */
function CtaScene({
  ctaText,
  colors,
  fps,
}: { ctaText: string; colors: KineticTypographyProps['colors']; fps: number }) {
  const frame = useCurrentFrame()

  // Characters fly in one by one
  const chars = ctaText.split('')
  const charDelay = Math.floor(fps * 0.05)

  const bgScale = spring({ fps, frame, config: { damping: 14, stiffness: 60 }, durationInFrames: fps * 1.2 })
  const { width } = useVideoConfig()

  return (
    <AbsoluteFill style={{
      background: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.08em',
        justifyContent: 'center',
        padding: '0 60px',
      }}>
        {chars.map((char, i) => {
          const charFrame = Math.max(0, frame - i * charDelay)
          const charSpring = spring({ fps, frame: charFrame, config: { damping: 12, stiffness: 130 }, durationInFrames: fps * 0.6 })
          const charOpacity = interpolate(charFrame, [0, fps * 0.2], [0, 1], { extrapolateRight: 'clamp' })
          return (
            <span key={i} style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: width > 1000 ? 100 : 64,
              fontWeight: 900,
              color: colors.background,
              opacity: charOpacity,
              transform: `translateY(${(1 - charSpring) * 50}px) scale(${0.5 + charSpring * 0.5})`,
              display: 'inline-block',
              letterSpacing: '-2px',
            }}>
              {char === ' ' ? ' ' : char}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

export function KineticTypography(props: KineticTypographyProps) {
  const { durationInFrames, fps } = useVideoConfig()
  const words = props.words ?? [props.headline]
  const hasCta = !!props.ctaText

  const headlineFrames = fps * 3
  const ctaFrames = hasCta ? fps * 3 : 0
  const kineticFrames = durationInFrames - headlineFrames - ctaFrames

  const colors = props.colors ?? {
    primary: '#0f172a',
    accent: '#f59e0b',
    background: '#0f172a',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
  }

  return (
    <AbsoluteFill style={{ background: colors.background }}>
      <Sequence durationInFrames={headlineFrames} premountFor={fps}>
        <HeadlineScene
          headline={props.headline}
          brandName={props.brandName}
          colors={colors}
          fps={fps}
        />
      </Sequence>

      <Sequence from={headlineFrames} durationInFrames={kineticFrames} premountFor={fps}>
        <KineticScene
          words={words}
          accentWords={props.accentWords}
          colors={colors}
          totalFrames={kineticFrames}
          fps={fps}
        />
      </Sequence>

      {hasCta && (
        <Sequence from={durationInFrames - ctaFrames} durationInFrames={ctaFrames} premountFor={fps}>
          <CtaScene ctaText={props.ctaText!} colors={colors} fps={fps} />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}
