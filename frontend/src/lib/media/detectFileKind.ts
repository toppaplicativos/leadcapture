const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
])

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv', '.3gp'])

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot).toLowerCase()
}

export function detectFileKind(file: File): 'image' | 'video' | null {
  const mime = String(file.type || '').toLowerCase().trim()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  const ext = getExtension(file.name)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

export const IMAGE_UPLOAD_ACCEPT =
  'image/*,.heic,.heif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.mp4,.mov'

export const IMAGE_ONLY_ACCEPT =
  'image/*,.heic,.heif,image/heic,image/heif,.jpg,.jpeg,.png,.webp'

export const VIDEO_ONLY_ACCEPT = 'video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov'