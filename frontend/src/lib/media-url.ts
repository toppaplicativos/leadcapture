/** Normaliza URLs de upload salvas só como nome de arquivo. */
export function normalizeUploadUrl(url: unknown, folder = 'product-images'): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith('/uploads/') || raw.startsWith('/')) return raw
  if (raw.includes('/')) return raw.startsWith('/') ? raw : `/${raw}`
  return `/uploads/${folder}/${raw}`
}