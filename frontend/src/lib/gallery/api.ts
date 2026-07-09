import { getHeaders } from '@/lib/admin/helpers'
import type { GalleryFolder, GalleryItem, GalleryItemType } from './types'

const BASE = '/api/gallery'

export interface GalleryListParams {
  folder?: string
  type?: GalleryItemType
  tags?: string[]
  search?: string
  source?: string
  page?: number
  limit?: number
}

function authHeaders(): Record<string, string> {
  const h = { ...getHeaders() }
  delete h['Content-Type']
  return h
}

export async function fetchGalleryFolders(): Promise<GalleryFolder[]> {
  const r = await fetch(`${BASE}/folders`, { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao carregar pastas')
  return d.folders || []
}

export async function fetchGalleryItems(params: GalleryListParams = {}): Promise<{
  items: GalleryItem[]
  total: number
  page: number
  limit: number
}> {
  const qs = new URLSearchParams()
  if (params.folder && params.folder !== 'all') qs.set('folder', params.folder)
  if (params.type) qs.set('type', params.type)
  if (params.tags?.length) qs.set('tags', params.tags.join(','))
  if (params.search) qs.set('search', params.search)
  if (params.source) qs.set('source', params.source)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))

  const r = await fetch(`${BASE}?${qs}`, { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao carregar galeria')
  return {
    items: d.items || [],
    total: d.total || 0,
    page: d.page || 1,
    limit: d.limit || 48,
  }
}

export async function fetchGalleryTags(): Promise<string[]> {
  const r = await fetch(`${BASE}/tags`, { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao carregar tags')
  return d.tags || []
}

export async function uploadGalleryFile(file: File, tags?: string[], folder?: string): Promise<GalleryItem> {
  const fd = new FormData()
  fd.append('file', file)
  if (tags?.length) fd.append('tags', tags.join(','))
  if (folder) fd.append('folder', folder)
  const r = await fetch(`${BASE}/upload`, { method: 'POST', headers: authHeaders(), body: fd })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha no upload')
  return d.item
}

export async function uploadGalleryFiles(files: File[], folder?: string): Promise<GalleryItem[]> {
  const fd = new FormData()
  files.forEach((f) => fd.append('files', f))
  if (folder) fd.append('folder', folder)
  const r = await fetch(`${BASE}/upload-multiple`, { method: 'POST', headers: authHeaders(), body: fd })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha no upload')
  return d.items || []
}

export async function updateGalleryItem(
  id: string,
  patch: { tags?: string[]; name?: string; folder?: string },
): Promise<GalleryItem> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(patch),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao atualizar')
  return d.item
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao excluir')
}

export async function markGalleryItemUsed(
  id: string,
  context: 'campaign' | 'post' | 'product',
  contextId?: string,
): Promise<GalleryItem> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}/use`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ context, contextId }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Falha ao registrar uso')
  return d.item
}