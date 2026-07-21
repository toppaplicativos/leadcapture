import type { PostMediaItem } from '@/components/instagram/InstagramCreateMediaPanel'

export type PostType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS' | 'VIDEO' | 'STORIES'
export type WhenMode = 'now' | 'schedule' | 'draft'

export type InstagramUserTagForm = {
  username: string
  x: number
  y: number
}

export type InstagramCreateFormState = {
  postType: PostType
  caption: string
  mediaItems: PostMediaItem[]
  when: WhenMode
  scheduledAt: string
  /** Page place id (Graph) */
  locationId: string
  locationName: string
  /** @usernames a marcar no post */
  userTags: InstagramUserTagForm[]
  /** Texto alternativo de acessibilidade (feed imagem) */
  altText: string
  /** Reels: também publicar no feed */
  shareToFeed: boolean
  /** Reels: URL pública da capa (upload/galeria) */
  coverUrl: string
  /** Reels: renomeia áudio original (API não adiciona trilha da biblioteca IG) */
  audioName: string
  /** Usernames de collab (até 3, best-effort na API) */
  collaborators: string[]
}

export const POST_TYPE_LABELS: Record<PostType, string> = {
  IMAGE: 'Imagem',
  CAROUSEL_ALBUM: 'Carrossel',
  REELS: 'Reels',
  VIDEO: 'Video',
  STORIES: 'Story',
}

export type VideoProbe = {
  duration: number
  width: number
  height: number
}

export function probeVideoFile(file: File): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        duration: Number(video.duration || 0),
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nao foi possivel ler o video'))
    }
    video.src = url
  })
}

export function validateVideoMetadata(meta: VideoProbe, postType: PostType): string | null {
  if (postType === 'REELS') {
    if (meta.duration > 90) return 'Reels: video acima de 90 segundos.'
    if (meta.duration > 0 && meta.duration < 3) return 'Reels: minimo de 3 segundos.'
    if (meta.width && meta.height) {
      const ratio = meta.width / meta.height
      if (ratio > 0.8) return 'Reels: prefira video vertical (9:16).'
    }
  }
  if (postType === 'VIDEO' && meta.duration > 60) {
    return 'Video no feed: prefira ate 60 segundos.'
  }
  if (postType === 'STORIES') {
    if (meta.duration > 60) return 'Story: video acima de 60 segundos.'
    if (meta.duration > 0 && meta.duration < 1) return 'Story: video muito curto.'
    if (meta.width && meta.height) {
      const ratio = meta.width / meta.height
      // Prefer vertical but don't hard-block landscape — IG crops stories
      if (ratio > 1.2) return 'Story: prefira video vertical (9:16).'
    }
  }
  return null
}

export function createDefaultFormState(): InstagramCreateFormState {
  return {
    postType: 'IMAGE',
    caption: '',
    mediaItems: [],
    when: 'now',
    scheduledAt: defaultScheduleLocalValue(),
    locationId: '',
    locationName: '',
    userTags: [],
    altText: '',
    shareToFeed: true,
    coverUrl: '',
    audioName: '',
    collaborators: [],
  }
}

export function buildPublishMeta(form: InstagramCreateFormState): Record<string, unknown> | null {
  const user_tags = form.userTags
    .map((t) => ({
      username: String(t.username || '').replace(/^@/, '').trim(),
      x: Number.isFinite(t.x) ? t.x : 0.5,
      y: Number.isFinite(t.y) ? t.y : 0.5,
    }))
    .filter((t) => t.username)
  const collaborators = form.collaborators
    .map((c) => String(c || '').replace(/^@/, '').trim())
    .filter(Boolean)
    .slice(0, 3)

  const meta: Record<string, unknown> = {}
  if (form.locationId.trim()) {
    meta.location_id = form.locationId.trim()
    if (form.locationName.trim()) meta.location_name = form.locationName.trim()
  }
  if (user_tags.length) meta.user_tags = user_tags
  if (form.altText.trim()) meta.alt_text = form.altText.trim().slice(0, 1000)
  if (form.postType === 'REELS' || form.postType === 'VIDEO') {
    if (form.postType === 'REELS') {
      meta.share_to_feed = form.shareToFeed !== false
    }
    if (form.coverUrl.trim()) meta.cover_url = form.coverUrl.trim()
    if (form.audioName.trim()) meta.audio_name = form.audioName.trim().slice(0, 100)
  }
  if (collaborators.length) meta.collaborators = collaborators

  return Object.keys(meta).length ? meta : null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function defaultScheduleLocalValue(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 75)
  d.setSeconds(0, 0)
  const remainder = d.getMinutes() % 15
  if (remainder) d.setMinutes(d.getMinutes() + (15 - remainder))
  return toDatetimeLocalValue(d)
}

export function parseScheduleLocal(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatScheduleLabel(value: string): string {
  const d = parseScheduleLocal(value)
  if (!d) return 'Data invalida'
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function validateSchedule(value: string): string | null {
  const d = parseScheduleLocal(value)
  if (!d) return 'Escolha data e horario validos.'
  const min = new Date(Date.now() + 15 * 60 * 1000)
  if (d < min) return 'Agende pelo menos 15 minutos a frente.'
  const max = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
  if (d > max) return 'Agendamento limitado a 75 dias.'
  return null
}

export function scheduleIsoFromLocal(value: string): string | undefined {
  const d = parseScheduleLocal(value)
  return d ? d.toISOString() : undefined
}

export const POST_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  failed: 'Falhou',
}

export function postToFormState(post: any): InstagramCreateFormState {
  const rawItems = Array.isArray(post.media_items) ? post.media_items : []
  const mediaItems: PostMediaItem[] = rawItems.length
    ? rawItems.map((m: any, i: number) => ({
        id: m.gallery_id || `item-${i}`,
        url: m.url,
        type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        name: m.name,
      }))
    : post.media_url
      ? [{
          id: 'main',
          url: post.media_url,
          type:
            post.media_type === 'REELS' ||
            post.media_type === 'VIDEO' ||
            (post.media_type === 'STORIES' && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(post.media_url || '')))
              ? 'video'
              : 'image',
        }]
      : []

  let when: WhenMode = 'draft'
  if (post.status === 'scheduled' || (post.status === 'failed' && post.scheduled_at)) {
    when = 'schedule'
  } else if (post.status === 'draft' || post.status === 'failed') {
    when = 'draft'
  }

  const scheduledAt = post.scheduled_at
    ? toDatetimeLocalValue(new Date(post.scheduled_at))
    : defaultScheduleLocalValue()

  const meta = post.publish_meta && typeof post.publish_meta === 'object' ? post.publish_meta : {}
  const userTags: InstagramUserTagForm[] = Array.isArray(meta.user_tags)
    ? meta.user_tags.map((t: any) => ({
        username: String(t?.username || '').replace(/^@/, ''),
        x: Number.isFinite(Number(t?.x)) ? Number(t.x) : 0.5,
        y: Number.isFinite(Number(t?.y)) ? Number(t.y) : 0.5,
      })).filter((t: InstagramUserTagForm) => t.username)
    : []
  const collaborators = Array.isArray(meta.collaborators)
    ? meta.collaborators.map((c: any) => String(c || '').replace(/^@/, '')).filter(Boolean)
    : []

  return {
    postType: (post.media_type || 'IMAGE') as PostType,
    caption: post.caption || '',
    mediaItems,
    when,
    scheduledAt,
    locationId: String(meta.location_id || ''),
    locationName: String(meta.location_name || ''),
    userTags,
    altText: String(meta.alt_text || ''),
    shareToFeed: meta.share_to_feed !== false,
    coverUrl: String(meta.cover_url || ''),
    audioName: String(meta.audio_name || ''),
    collaborators,
  }
}

export function buildPostPayload(
  form: InstagramCreateFormState,
  editing = false,
): Record<string, unknown> {
  const status =
    form.when === 'now' ? (editing ? 'draft' : 'publishing') : form.when === 'schedule' ? 'scheduled' : 'draft'
  const payload: Record<string, unknown> = {
    media_type: form.postType,
    media_url: form.mediaItems[0]?.url,
    media_items: form.mediaItems.map((item, order) => ({
      url: item.url,
      type: item.type,
      order,
      gallery_id: item.id,
    })),
    caption: form.caption,
    status: form.when === 'now' && !editing ? 'publishing' : status,
    publish_meta: buildPublishMeta(form),
  }
  if (form.when === 'schedule') {
    payload.scheduled_at = scheduleIsoFromLocal(form.scheduledAt)
  } else {
    payload.scheduled_at = null
  }
  if (form.when !== 'now' || editing) {
    payload.error_message = null
  }
  return payload
}

export const VIDEO_MAX_BYTES = 100 * 1024 * 1024

export function validateVideoFile(file: File, postType: PostType): string | null {
  const kind = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name)
  if (!kind) return 'Envie MP4 ou MOV (H.264 + AAC).'
  if (file.size > VIDEO_MAX_BYTES) return 'Video acima de 100MB. Comprima antes de enviar.'
  if (postType === 'REELS' && file.size > 95 * 1024 * 1024) return 'Reels: prefira videos abaixo de 95MB.'
  if (postType === 'STORIES' && file.size > 95 * 1024 * 1024) return 'Story: prefira videos abaixo de 95MB.'
  return null
}

export function scheduleLocalFromOffset(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000)
  d.setSeconds(0, 0)
  return toDatetimeLocalValue(d)
}

export function ctaLabelForForm(when: WhenMode, editing: boolean): string {
  if (editing) {
    if (when === 'now') return 'Publicar agora'
    if (when === 'schedule') return 'Atualizar agendamento'
    return 'Salvar alteracoes'
  }
  if (when === 'now') return 'Publicar Agora'
  if (when === 'schedule') return 'Agendar Post'
  return 'Salvar Rascunho'
}