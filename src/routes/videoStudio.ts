import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { composeVideoSpec, refineVideoSpec, VideoCompositionSpec } from '../services/videoComposer'
import { renderVideoToFile } from '../services/remotionRenderer'
import { logger } from '../utils/logger'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import { integrationService } from '../services/integrations'
import { AtlasProvider } from '../services/providers/atlas-provider'
import { AI_MODELS } from '../config/ai-models'

const router = Router()
router.use(authMiddleware)
const referenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')),
})

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

type AtlasGenerationJob = {
  id: string
  userId: string
  status: 'processing' | 'done' | 'error'
  predictionId?: string | null
  urls?: string[]
  model: string
  mode: 'text-to-video' | 'image-to-video' | 'video-to-video'
  error?: string
}
const atlasJobs = new Map<string, AtlasGenerationJob>()

async function resolveAtlasKey(userId: string, brandId?: string) {
  const configured = await integrationService.getProvider('atlas', { userId, brandId }).catch(() => null)
  return String(configured?.key || process.env.ATLAS_API_KEY || process.env.ATLASCLOUD_API_KEY || '').trim()
}

router.get('/ai/models', async (req: AuthRequest, res) => {
  const curated = ((AI_MODELS.video as any)?.atlas || []).map((model: any) => ({
    ...model,
    capabilities: (model.functions || []).map((fn: string) =>
      fn === 't2v' ? 'text-to-video' : fn === 'i2v' ? 'image-to-video' : fn === 'v2v' ? 'video-to-video' : fn,
    ),
  }))
  const userId = String((req as any).userId || req.user?.id || '')
  const brandId = String(req.headers['x-brand-id'] || '') || undefined
  const key = await resolveAtlasKey(userId, brandId)
  let live: any[] = []
  if (key) {
    live = await new AtlasProvider(key).listModels()
      .then(items => items.filter(item => item.category === 'video'))
      .catch(() => [])
  }
  res.json({ provider: 'atlas', configured: Boolean(key), models: curated, liveModels: live })
})

router.post('/ai/references', referenceUpload.single('file'), (req: AuthRequest, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'Envie uma imagem ou vídeo de referência.' })
  const safeExtensions: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  }
  const ext = safeExtensions[file.mimetype]
  if (!ext) return res.status(415).json({ error: 'Formato não suportado. Use JPG, PNG, WebP, GIF, MP4, WebM ou MOV.' })
  const dir = path.join(process.cwd(), 'public', 'uploads', 'video-studio')
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${uuidv4()}${ext.toLowerCase()}`
  fs.writeFileSync(path.join(dir, filename), file.buffer)
  res.status(201).json({
    url: `/uploads/video-studio/${filename}`,
    type: file.mimetype.startsWith('video/') ? 'video' : 'image',
    name: file.originalname,
  })
})

router.post('/ai/generate', async (req: AuthRequest, res) => {
  try {
    const { prompt, model, mode = 'text-to-video', imageUrl, videoUrl, referenceUrls = [], params = {} } = req.body || {}
    if (!String(prompt || '').trim()) return res.status(400).json({ error: 'Descreva o vídeo que deseja gerar.' })
    if (mode === 'image-to-video' && !imageUrl) return res.status(400).json({ error: 'Adicione uma imagem de referência.' })
    if (mode === 'video-to-video' && !videoUrl) return res.status(400).json({ error: 'Adicione um vídeo de referência.' })
    const userId = String((req as any).userId || req.user?.id || '')
    const brandId = String(req.headers['x-brand-id'] || '') || undefined
    const key = await resolveAtlasKey(userId, brandId)
    if (!key) return res.status(409).json({ error: 'Atlas Cloud ainda não está configurado para esta organização.' })

    const selectedModel = String(model || 'kling-v2.0')
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const absolute = (url?: string) => url && url.startsWith('/') ? `${baseUrl}${url}` : url
    const submitted = await new AtlasProvider(key, selectedModel).generateVideo(String(prompt).trim(), {
      model: selectedModel,
      imageUrl: absolute(imageUrl),
      videoUrl: absolute(videoUrl),
      referenceUrls: (referenceUrls as string[]).map(url => absolute(url)!).filter(Boolean),
      params,
    })
    const jobId = uuidv4()
    const job: AtlasGenerationJob = {
      id: jobId, userId, status: submitted.urls.length ? 'done' : 'processing',
      predictionId: submitted.predictionId, urls: submitted.urls, model: selectedModel, mode,
    }
    atlasJobs.set(jobId, job)
    res.status(202).json(job)
  } catch (err: any) {
    logger.error('video-studio Atlas generation error', err)
    res.status(500).json({ error: err?.message || 'Não foi possível iniciar a geração no Atlas Cloud.' })
  }
})

router.get('/ai/generate/:jobId', async (req: AuthRequest, res) => {
  const job = atlasJobs.get(String(req.params.jobId))
  if (!job) return res.status(404).json({ error: 'Geração não encontrada.' })
  const userId = String((req as any).userId || req.user?.id || '')
  if (job.userId && job.userId !== userId) return res.status(403).json({ error: 'Forbidden' })
  if (job.status !== 'processing' || !job.predictionId) return res.json(job)
  try {
    const brandId = String(req.headers['x-brand-id'] || '') || undefined
    const key = await resolveAtlasKey(userId, brandId)
    if (!key) throw new Error('Atlas Cloud não configurado.')
    const prediction = await new AtlasProvider(key, job.model).getPrediction(job.predictionId)
    if (prediction.status === 'completed') {
      job.status = 'done'
      job.urls = prediction.urls
    } else if (prediction.status === 'failed') {
      job.status = 'error'
      job.error = prediction.error || 'A geração falhou no Atlas Cloud.'
    }
    res.json(job)
  } catch (err: any) {
    logger.error('video-studio Atlas poll error', err)
    res.status(502).json({ ...job, error: err?.message || 'Falha ao consultar a geração.' })
  }
})

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
