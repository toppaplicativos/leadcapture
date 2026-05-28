import path from 'path'
import fs from 'fs/promises'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { logger } from '../utils/logger'
import type { VideoCompositionSpec } from './videoComposer'

const OUTPUT_DIR = path.join(process.cwd(), 'uploads', 'videos', 'remotion')
let bundleCache: string | null = null

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
}

async function getBundleUrl(): Promise<string> {
  if (bundleCache) return bundleCache

  logger.info('Remotion: bundling compositions (first render may take ~30s)…')
  const entryPoint = path.join(process.cwd(), 'frontend', 'src', 'remotion', 'index.ts')

  bundleCache = await bundle({
    entryPoint,
    onProgress: (p) => {
      if (p % 25 === 0) logger.info(`Remotion bundle: ${p}%`)
    },
  })

  logger.info('Remotion: bundle ready')
  return bundleCache
}

export async function renderVideoToFile(
  spec: VideoCompositionSpec,
  jobId: string
): Promise<string> {
  await ensureOutputDir()

  const serveUrl = await getBundleUrl()
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`)

  logger.info(`Remotion: rendering ${spec.template} → ${jobId}.mp4`)

  const composition = await selectComposition({
    serveUrl,
    id: spec.template,
    inputProps: spec.props as unknown as Record<string, unknown>,
  })

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: spec.durationInFrames,
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
    },
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: spec.props as unknown as Record<string, unknown>,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 20 === 0) {
        logger.info(`Remotion render: ${Math.round(progress * 100)}%`)
      }
    },
  })

  logger.info(`Remotion: render complete → ${outputPath}`)
  return outputPath
}

export function clearBundleCache() {
  bundleCache = null
}
