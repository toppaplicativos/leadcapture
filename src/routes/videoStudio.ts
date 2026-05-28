import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { composeVideoSpec, refineVideoSpec, VideoCompositionSpec } from '../services/videoComposer'
import { renderVideoToFile } from '../services/remotionRenderer'
import { logger } from '../utils/logger'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authMiddleware)

/* In-memory render job store (per-process, dev only) */
interface RenderJob {
  id: string
  userId: string
  status: 'pending' | 'rendering' | 'done' | 'error'
  spec: VideoCompositionSpec
  videoUrl?: string
  error?: string
  createdAt: number
}
const renderJobs = new Map<string, RenderJob>()

/* ── POST /api/video-studio/compose
   Chat message → VideoCompositionSpec (no rendering, just preview props)
   ─────────────────────────────────────────────────────────────────── */
router.post('/compose', async (req: AuthRequest, res) => {
  try {
    const { message, currentSpec, history = [] } = req.body as {
      message: string
      currentSpec?: VideoCompositionSpec
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message required' })
    }

    const userId = (req as any).userId || req.user?.id
    const brandId = req.headers['x-brand-id'] as string | undefined

    const spec = currentSpec
      ? await refineVideoSpec(message, currentSpec, userId, brandId, history)
      : await composeVideoSpec(message, userId, brandId, history)

    res.json({ spec })
  } catch (err: any) {
    logger.error('video-studio compose error', err)
    res.status(500).json({ error: err?.message || 'Erro ao compor vídeo' })
  }
})

/* ── POST /api/video-studio/render
   Queue a render job, respond immediately with jobId
   ─────────────────────────────────────────────────────────────────── */
router.post('/render', async (req: AuthRequest, res) => {
  try {
    const { spec } = req.body as { spec: VideoCompositionSpec }
    if (!spec?.template) {
      return res.status(400).json({ error: 'spec required' })
    }

    const userId = (req as any).userId || req.user?.id || ''
    const jobId = uuidv4()

    const job: RenderJob = {
      id: jobId,
      userId,
      status: 'pending',
      spec,
      createdAt: Date.now(),
    }
    renderJobs.set(jobId, job)

    res.status(202).json({ jobId })

    // render in background (no await)
    ;(async () => {
      try {
        job.status = 'rendering'
        const outputPath = await renderVideoToFile(spec, jobId)
        const relPath = path.relative(process.cwd(), outputPath).replace(/\\/g, '/')
        job.videoUrl = `/${relPath}`
        job.status = 'done'
      } catch (err: any) {
        logger.error('Remotion render job error', err)
        job.status = 'error'
        job.error = err?.message || 'Render failed'
      }
    })()
  } catch (err: any) {
    logger.error('video-studio render error', err)
    res.status(500).json({ error: err?.message || 'Erro ao iniciar render' })
  }
})

/* ── GET /api/video-studio/render/:jobId
   Poll render job status
   ─────────────────────────────────────────────────────────────────── */
router.get('/render/:jobId', (req: AuthRequest, res) => {
  const job = renderJobs.get(req.params.jobId as string)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const requestUserId = (req as any).userId || req.user?.id
  if (requestUserId && job.userId && job.userId !== requestUserId) return res.status(403).json({ error: 'Forbidden' })

  res.json({
    id: job.id,
    status: job.status,
    videoUrl: job.videoUrl,
    error: job.error,
  })
})

/* ── GET /api/video-studio/templates
   List available templates with metadata
   ─────────────────────────────────────────────────────────────────── */
router.get('/templates', (_req, res) => {
  res.json({
    templates: [
      {
        id: 'BrandPromo',
        label: 'Propaganda da Marca',
        description: 'Vídeo institucional com intro, slides de conteúdo e chamada para ação. Ideal para apresentar sua marca.',
        aspectRatio: '16:9',
        duration: '15–30s',
        bestFor: ['institucional', 'lançamento', 'serviços'],
      },
      {
        id: 'ProductShowcase',
        label: 'Vitrine de Produtos',
        description: 'Destaque seus produtos com imagem, preço e descrição. Perfeito para promoções.',
        aspectRatio: '16:9',
        duration: '10–25s',
        bestFor: ['produtos', 'promoções', 'lançamentos'],
      },
      {
        id: 'StoryReel',
        label: 'Story / Reels',
        description: 'Vídeo vertical estilo Instagram Stories com slides rápidos e CTA direto.',
        aspectRatio: '9:16',
        duration: '10–20s',
        bestFor: ['instagram', 'stories', 'reels', 'tiktok'],
      },
    ],
  })
})

export default router
